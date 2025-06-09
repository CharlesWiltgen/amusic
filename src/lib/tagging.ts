import { parse as parsePath } from "jsr:@std/path";
import { getVendorBinaryPath } from "./vendor_tools.ts";

// AcoustID metadata field names for different container formats
const ACOUSTID_FIELDS = {
  // MP4/M4A containers use iTunes-style freeform atoms
  MP4: {
    FINGERPRINT: "----:com.apple.iTunes:Acoustid Fingerprint",
    ID: "----:com.apple.iTunes:Acoustid Id",
  },
  // FLAC, Ogg, and other formats use Vorbis-style field names
  VORBIS: {
    FINGERPRINT: "ACOUSTID_FINGERPRINT",
    ID: "ACOUSTID_ID",
  },
  // MP3 files would use TXXX frames (handled differently by ffmpeg)
  ID3: {
    FINGERPRINT: "ACOUSTID_FINGERPRINT", // ffmpeg handles TXXX conversion
    ID: "ACOUSTID_ID",
  },
} as const;

/**
 * Writes AcoustID tags to MP4/M4A files using AtomicParsley.
 * This handles the iTunes-style freeform atoms properly.
 */
async function writeAcoustIDTagsMP4(
  filePath: string,
  fingerprint: string,
  acoustID: string,
): Promise<boolean> {
  try {
    const atomicParsleyPath = getVendorBinaryPath("atomicparsley");
    
    // AtomicParsley modifies files in-place, so we need to work on a copy
    const fileMeta = parsePath(filePath);
    const tempDir = await Deno.makeTempDir({ prefix: "amusic_mp4_tagging_" });
    const tempFilePath = `${tempDir}/${fileMeta.name}_tagged${fileMeta.ext}`;
    
    try {
      // Copy the original file to temp location
      await Deno.copyFile(filePath, tempFilePath);
      
      // Use AtomicParsley to write iTunes-style freeform atoms
      // Format: --rDNSatom "data_value" name=atom_name domain=reverse_domain
      const apCmd = new Deno.Command(atomicParsleyPath, {
        args: [
          tempFilePath,
          "--rDNSatom",
          fingerprint,
          "name=Acoustid Fingerprint",
          "domain=com.apple.iTunes",
          "--rDNSatom", 
          acoustID,
          "name=Acoustid Id",
          "domain=com.apple.iTunes",
          "--overWrite", // Modify file in place
        ],
        stdout: "piped",
        stderr: "piped",
      });
      
      const { code, stderr } = await apCmd.output();
      if (code !== 0) {
        const errorOutput = new TextDecoder().decode(stderr);
        console.error(`  AtomicParsley error: ${errorOutput}`);
        return false;
      }
      
      // Replace original file with tagged version
      try {
        await Deno.rename(tempFilePath, filePath);
        return true;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("Cross-device link")) {
          try {
            await Deno.copyFile(tempFilePath, filePath);
            return true;
          } catch (copyErr) {
            const copyMsg = copyErr instanceof Error ? copyErr.message : String(copyErr);
            console.error(`Error copying tagged MP4 file across devices: ${copyMsg}`);
            return false;
          }
        }
        console.error(`Error replacing original MP4 file with tagged version: ${msg}`);
        return false;
      }
      
    } finally {
      // Clean up temp directory
      await Deno.remove(tempDir, { recursive: true }).catch((e) =>
        console.warn(`  Could not remove temp dir ${tempDir}: ${e.message}`)
      );
    }
    
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    console.error(`Error during MP4 tagging with AtomicParsley: ${errorMessage}`);
    return false;
  }
}

/**
 * Writes ACOUSTID_FINGERPRINT and ACOUSTID_ID tags to the file.
 * 
 * Uses AtomicParsley for MP4/M4A files to write proper iTunes-style freeform atoms.
 * Uses ffmpeg for other formats (FLAC, MP3, Ogg) with format-appropriate metadata fields.
 *
 * @param filePath Path to the audio file to tag.
 * @param fingerprint The fingerprint to embed.
 * @param acoustID The AcoustID to embed.
 * @returns True if tagging succeeded, false otherwise.
 */
export async function writeAcoustIDTags(
  filePath: string,
  fingerprint: string,
  acoustID: string,
): Promise<boolean> {
  const fileMeta = parsePath(filePath);
  const tempDir = await Deno.makeTempDir({ prefix: "amusic_tagging_" });
  try {
    const tempFilePath = `${tempDir}/${fileMeta.name}_tagged${fileMeta.ext}`;

    // Use correct metadata format for each container type
    const ext = fileMeta.ext.toLowerCase();
    let ffmpegArgs: string[];
    
    if (ext === ".mp4" || ext === ".m4a" || ext === ".mov") {
      // Use AtomicParsley for proper MP4 metadata handling
      console.log("  INFO: Using AtomicParsley for MP4 metadata writing...");
      return await writeAcoustIDTagsMP4(filePath, fingerprint, acoustID);
    } else if (ext === ".mp3") {
      // For MP3 files, use ID3 field names (ffmpeg converts to TXXX frames)
      ffmpegArgs = [
        "-loglevel", "error",
        "-i", filePath,
        "-map", "0",
        "-c", "copy",
        "-map_metadata", "0",
        "-metadata", `${ACOUSTID_FIELDS.ID3.FINGERPRINT}=${fingerprint}`,
        "-metadata", `${ACOUSTID_FIELDS.ID3.ID}=${acoustID}`,
      ];
    } else {
      // For FLAC, Ogg, and other formats, use Vorbis-style field names
      ffmpegArgs = [
        "-loglevel", "error",
        "-i", filePath,
        "-map", "0",
        "-c", "copy",
        "-map_metadata", "0",
        "-metadata", `${ACOUSTID_FIELDS.VORBIS.FINGERPRINT}=${fingerprint}`,
        "-metadata", `${ACOUSTID_FIELDS.VORBIS.ID}=${acoustID}`,
      ];
    }
    
    ffmpegArgs.push(tempFilePath);
    
    const ffmpegCmd = new Deno.Command("ffmpeg", {
      args: ffmpegArgs,
      stderr: "piped",
    });
    {
      const { code, stderr } = await ffmpegCmd.output();
      if (code !== 0) {
        console.error(`  ffmpeg error: ${new TextDecoder().decode(stderr)}`);
        return false;
      }
    }

    // Replace original file (rename or copy across devices)
    try {
      await Deno.rename(tempFilePath, filePath);
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("Cross-device link")) {
        try {
          await Deno.copyFile(tempFilePath, filePath);
          return true;
        } catch (copyErr) {
          const copyMsg = copyErr instanceof Error ? copyErr.message : String(copyErr);
          console.error(`Error copying tagged file across devices: ${copyMsg}`);
          return false;
        }
      }
      console.error(`Error replacing original file with tagged version: ${msg}`);
      return false;
    }
  } finally {
    await Deno.remove(tempDir, { recursive: true }).catch((e) =>
      console.warn(`  Could not remove temp dir ${tempDir}: ${e.message}`)
    );
  }
}
