import { parse as parsePath } from "jsr:@std/path";

/**
 * Writes ACOUSTID_FINGERPRINT and ACOUSTID_ID tags to the file using ffmpeg.
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

    // Handle MP4/M4A files differently due to metadata limitations
    const ext = fileMeta.ext.toLowerCase();
    let ffmpegArgs: string[];
    
    if (ext === ".mp4" || ext === ".m4a" || ext === ".mov") {
      // For MP4 containers, try using global metadata options
      ffmpegArgs = [
        "-loglevel", "error",
        "-i", filePath,
        "-map", "0",
        "-c", "copy",
        "-map_metadata", "0",
        "-movflags", "+use_metadata_tags",
        "-metadata:g", `ACOUSTID_FINGERPRINT=${fingerprint}`,
        "-metadata:g", `ACOUSTID_ID=${acoustID}`,
      ];
    } else {
      // For other formats, use standard metadata approach
      ffmpegArgs = [
        "-loglevel", "error",
        "-i", filePath,
        "-map", "0",
        "-c", "copy",
        "-map_metadata", "0",
        "-metadata", `ACOUSTID_FINGERPRINT=${fingerprint}`,
        "-metadata", `ACOUSTID_ID=${acoustID}`,
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
