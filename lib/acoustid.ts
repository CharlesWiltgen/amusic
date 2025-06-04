// lib/acoustid.ts
import { parse as parsePath } from "https://deno.land/std@0.224.0/path/mod.ts";
/**
 * Silently checks if the audio file already has AcousticID related tags.
 * Returns true if tags are found, false otherwise.
 */
export async function hasAcousticIDTags(filePath: string): Promise<boolean> {
  const command = new Deno.Command("ffprobe", {
    args: [
      "-v", "quiet",
      "-show_entries", "format_tags=ACOUSTID_FINGERPRINT,ACOUSTID_ID",
      "-of", "default=noprint_wrappers=1:nokey=1",
      filePath,
    ],
    stdout: "piped",
    stderr: "piped",
  });
  const { code, stdout, stderr } = await command.output();

  if (code !== 0) {
    const errorOutput = new TextDecoder().decode(stderr).trim();
     // ffprobe can exit with 1 if tags are missing or file has no streams, this is not an "error" for this check.
    if (errorOutput && !errorOutput.includes("does not contain any stream") && !errorOutput.includes("Invalid argument")) {
        // Log a warning if it's an unexpected ffprobe issue.
        // console.warn(`  ffprobe check warning for ${filePath}: ${errorOutput.split("\n")[0]}`);
    }
    return false;
  }
  const outputText = new TextDecoder().decode(stdout).trim();
  return outputText.length > 0;
}

/**
 * Generates the AcousticID fingerprint using fpcalc.
 */
export async function generateFingerprint(filePath: string): Promise<string | null> {
  // console.log("  Generating AcoustID fingerprint with fpcalc..."); // Moved to caller
  const command = new Deno.Command("fpcalc", {
    args: ["-plain", filePath],
    stdout: "piped",
    stderr: "piped",
  });
  const { code, stdout, stderr } = await command.output();

  if (code !== 0) {
    console.error(`  fpcalc error: ${new TextDecoder().decode(stderr).split("\n")[0]}`);
    return null;
  }

  const output = new TextDecoder().decode(stdout).trim();
  const match = output.match(/FINGERPRINT=([^\n]+)/);
  if (match && match[1]) {
    return match[1];
  } else {
    console.error("  Could not parse fingerprint from fpcalc output.");
    return null;
  }
}

/**
 * Writes the ACOUSTID_FINGERPRINT tag to the file using ffmpeg.
 */
export async function writeAcousticIDFingerprint(filePath: string, fingerprint: string): Promise<boolean> {
  // console.log(`  Writing fingerprint to file with ffmpeg...`); // Moved to caller
  const fileMeta = parsePath(filePath);
  const tempDir = await Deno.makeTempDir({ prefix: "amusic_tagging_" });
  const tempFilePath = `${tempDir}/${fileMeta.name}_tagged${fileMeta.ext}`;

  const command = new Deno.Command("ffmpeg", {
    args: [
      "-loglevel", "error",
      "-i", filePath,
      "-c", "copy",
      "-metadata", `ACOUSTID_FINGERPRINT=${fingerprint}`,
      tempFilePath,
    ],
    stderr: "piped", // Capture stderr for error messages
  });
  const { code, stderr } = await command.output();

  if (code !== 0) {
    console.error(`  ffmpeg error: ${new TextDecoder().decode(stderr).split("\n")[0]}`);
    await Deno.remove(tempDir, { recursive: true }).catch(e => console.warn(`  Could not remove temp dir ${tempDir}: ${e.message}`));
    return false;
  }

  try {
    await Deno.rename(tempFilePath, filePath);
    await Deno.remove(tempDir, { recursive: true }).catch(e => console.warn(`  Could not remove temp dir ${tempDir}: ${e.message}`));
    return true;
  } catch (e) {
    console.error(`  Error replacing original file with tagged version: ${e.message}`);
    await Deno.remove(tempDir, { recursive: true }).catch(e => console.warn(`  Could not remove temp dir ${tempDir}: ${e.message}`));
    return false;
  }
}

/**
 * Core logic for adding AcousticID tags to a single file.
 */
export async function processAcousticIDTagging(filePath: string, force: boolean): Promise<void> {
  console.log(`-> Processing file: ${filePath}`);

  try {
    const fileInfo = await Deno.stat(filePath);
    if (!fileInfo.isFile) {
      console.error(`Error: Path "${filePath}" is not a file.`);
      return;
    }
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) {
      console.error(`Error: File not found at "${filePath}".`);
    } else {
      console.error(`Error accessing file "${filePath}": ${e.message}`);
    }
    return;
  }

  console.log("  Checking for existing AcoustID tags...");
  const tagsExist = await hasAcousticIDTags(filePath);

  if (tagsExist && !force) {
    console.log("  INFO: File already has AcoustID tags. Skipping (use --force to overwrite).");
    return;
  }

  if (tagsExist && force) {
    console.log("  INFO: File already has AcoustID tags. --force option provided, proceeding to overwrite.");
  }

  console.log("  ACTION: Generating AcoustID fingerprint...");
  const fingerprint = await generateFingerprint(filePath);

  if (!fingerprint) {
    console.log("  WARNING: Could not generate fingerprint. Skipping.");
    return;
  }
  console.log(`    Generated Fingerprint: ${fingerprint.substring(0, 30)}...`);

  console.log("  ACTION: Writing ACOUSTID_FINGERPRINT tag...");
  const success = await writeAcousticIDFingerprint(filePath, fingerprint);

  if (success) {
    console.log("  SUCCESS: AcoustID fingerprint tag processed.");
  } else {
    console.log("  ERROR: Failed to process AcoustID fingerprint tag.");
  }
}