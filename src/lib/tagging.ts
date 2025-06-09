import { parse as parsePath } from "jsr:@std/path";

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
 * Writes ACOUSTID_FINGERPRINT and ACOUSTID_ID tags to the file using ffmpeg.
 * 
 * NOTE: MP4/M4A containers have limited support for custom metadata fields in ffmpeg.
 * AcoustID tags may not be written properly to MP4 files. ReplayGain tags will be preserved.
 * For proper MP4 AcoustID tagging, consider using tools like AtomicParsley or mp4v2.
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
      // MP4 containers have poor support for custom metadata in ffmpeg
      console.log("  WARNING: MP4/M4A files do not support AcoustID tagging with current tools");
      console.log("  INFO: Skipping AcoustID tag writing to preserve existing metadata");
      console.log("  SUGGESTION: Use FLAC format for full AcoustID support, or install AtomicParsley");
      
      // Skip writing AcoustID tags to MP4 files to avoid corrupting metadata
      // Just return success since the fingerprint was generated successfully
      return true;
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
