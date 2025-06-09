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

    // Extract all existing metadata to a temporary ffmetadata file
    const metaFilePath = `${tempDir}/ffmetadata.txt`;
    {
      const extract = new Deno.Command("ffmpeg", {
        args: ["-loglevel", "error", "-i", filePath, "-f", "ffmetadata", metaFilePath],
        stderr: "piped",
      });
      const { code, stderr } = await extract.output();
      if (code !== 0) {
        console.error(`  ffmpeg metadata extract error: ${new TextDecoder().decode(stderr)}`);
        return false;
      }
    }

    // Append fingerprint tags to the metadata file
    const tagLines = `
ACOUSTID_FINGERPRINT=${fingerprint}
ACOUSTID_ID=${acoustID}
`;
    await Deno.writeTextFile(metaFilePath, tagLines, { append: true });

    // Remux with updated metadata, preserving all streams and metadata
    {
      const remux = new Deno.Command("ffmpeg", {
        args: [
          "-loglevel", "error",
          "-i", filePath,
          "-i", metaFilePath,
          "-map", "0",
          "-map_metadata", "1",
          "-c", "copy",
          "-movflags", "+use_metadata_tags",
          tempFilePath,
        ],
        stderr: "piped",
      });
      const { code, stderr } = await remux.output();
      if (code !== 0) {
        console.error(`  ffmpeg remux error: ${new TextDecoder().decode(stderr)}`);
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
