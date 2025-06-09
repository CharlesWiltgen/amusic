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

    // Read all existing format-level tags via ffprobe so we can reapply them
    let existingTags: Record<string, string> = {};
    try {
      const probe = new Deno.Command("ffprobe", {
        args: [
          "-v", "quiet",
          "-print_format", "json",
          "-show_entries", "format_tags",
          filePath,
        ],
        stdout: "piped",
        stderr: "piped",
      });
      const { code: probeCode, stdout: probeOut } = await probe.output();
      if (probeCode === 0) {
        const info = JSON.parse(new TextDecoder().decode(probeOut));
        existingTags = info.format?.tags ?? {};
      }
    } catch {
      // ignore ffprobe/tag read errors
    }

    // Build metadata arguments: reapply all existing tags, then our AcoustID tags
    const metadataArgs: string[] = [];
    for (const [key, val] of Object.entries(existingTags)) {
      metadataArgs.push("-metadata", `${key}=${val}`);
    }
    metadataArgs.push(
      "-metadata", `ACOUSTID_FINGERPRINT=${fingerprint}`,
      "-metadata", `ACOUSTID_ID=${acoustID}`,
    );

    // Remux audio + updated metadata back into the file, preserving all streams
    const ffmpegCmd = new Deno.Command("ffmpeg", {
      args: [
        "-loglevel", "error",
        "-i", filePath,
        "-map", "0",
        "-c", "copy",
        "-movflags", "+use_metadata_tags",
        ...metadataArgs,
        tempFilePath,
      ],
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
