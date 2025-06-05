// lib/acoustid.ts
import { parse as parsePath } from "std/path/mod.ts";

/**
 * Silently checks if the audio file already has AcousticID related tags.
 * Returns true if tags are found, false otherwise.
 */
export async function hasAcousticIDTags(filePath: string): Promise<boolean> {
  const command = new Deno.Command("ffprobe", {
    args: [
      "-v",
      "quiet",
      "-show_entries",
      "format_tags=ACOUSTID_FINGERPRINT,ACOUSTID_ID",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filePath,
    ],
    stdout: "piped",
    stderr: "piped",
  });
  const { code, stdout, stderr } = await command.output();

  if (code !== 0) {
    const errorOutput = new TextDecoder().decode(stderr).trim();
    // ffprobe can exit with 1 if tags are missing or file has no streams, this is not an "error" for this check.
    if (
      errorOutput && !errorOutput.includes("does not contain any stream") &&
      !errorOutput.includes("Invalid argument")
    ) {
      // Log a warning if it's an unexpected ffprobe issue.
      // console.warn(`  ffprobe check warning for ${filePath}: ${errorOutput.split("\n")[0]}`);
    }
    return false;
  }
  const outputText = new TextDecoder().decode(stdout).trim();
  return outputText.length > 0;
}

/**
 * Retrieves existing ACOUSTID_FINGERPRINT and ACOUSTID_ID tags from a file.
 * Returns an object with the tags or null if not found or an error occurs.
 */
export async function getAcousticIDTags(
  filePath: string,
): Promise<{ ACOUSTID_FINGERPRINT?: string; ACOUSTID_ID?: string } | null> {
  const command = new Deno.Command("ffprobe", {
    args: [
      "-v",
      "quiet",
      "-show_entries",
      "format_tags=ACOUSTID_FINGERPRINT,ACOUSTID_ID",
      "-of",
      "default=noprint_wrappers=1", // Output format: key=value
      filePath,
    ],
    stdout: "piped",
    stderr: "piped",
  });
  const { code, stdout, stderr } = await command.output();

  if (code !== 0) {
    const errorOutput = new TextDecoder().decode(stderr).trim();
    if (
      errorOutput && !errorOutput.includes("does not contain any stream") &&
      !errorOutput.includes("Invalid argument") // Common if tags section is empty
    ) {
      // console.warn(`  ffprobe check warning for ${filePath}: ${errorOutput.split("\n")[0]}`);
    }
    return null; // Error or no tags found
  }

  const outputText = new TextDecoder().decode(stdout).trim();
  if (!outputText) {
    return null; // No tags found
  }

  const tags: { ACOUSTID_FINGERPRINT?: string; ACOUSTID_ID?: string } = {};
  outputText.split("\n").forEach((line) => {
    const [key, value] = line.split("=");
    if (key === "TAG:ACOUSTID_FINGERPRINT") {
      tags.ACOUSTID_FINGERPRINT = value;
    } else if (key === "TAG:ACOUSTID_ID") {
      tags.ACOUSTID_ID = value;
    }
  });

  if (Object.keys(tags).length === 0) {
    return null; // No relevant tags found
  }
  return tags;
}

/**
 * Generates the AcousticID fingerprint using fpcalc.
 */
export async function generateFingerprint(
  filePath: string,
): Promise<string | null> {
  // console.log("  Generating AcoustID fingerprint with fpcalc..."); // Moved to caller
  const command = new Deno.Command("fpcalc", {
    args: ["-plain", filePath],
    stdout: "piped",
    stderr: "piped",
  });
  const { code, stdout, stderr } = await command.output();

  if (code !== 0) {
    console.error(`  fpcalc error: ${new TextDecoder().decode(stderr)}`);
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
 * Looks up a fingerprint using the AcoustID API.
 * @param fingerprint The audio fingerprint.
 * @param duration The duration of the audio file in seconds.
 * @param apiKey The AcoustID client API key.
 * @returns The API response or null if an error occurs.
 */
export async function lookupFingerprint(
  fingerprint: string,
  duration: number,
  apiKey: string,
): Promise<any | null> {
  const apiUrl =
    `https://api.acoustid.org/v2/lookup?client=${apiKey}&meta=recordings+releasegroups+compress&duration=${
      Math.round(duration)
    }&fingerprint=${fingerprint}`;
  if (!apiKey) {
    console.error("  AcoustID API key is required for lookup.");
    return null;
  }

  try {
    // console.log(`  Querying AcoustID API: ${apiUrl}`); // For debugging, can be noisy
    const response = await fetch(apiUrl);
    if (!response.ok) {
      console.error(
        `  AcoustID API error: ${response.status} ${response.statusText}`,
      );
      // console.error(`    Response body: ${await response.text()}`); // For more detailed debugging
      return null;
    }
    const data = await response.json();
    if (data.status === "error") {
      console.error(`  AcoustID API returned error: ${data.error?.message}`);
      return null;
    }
    if (!data.results || data.results.length === 0) {
      // console.log("  No results found in AcoustID lookup."); // This is a common case, not necessarily an error
      return { results: [] }; // Return empty results to distinguish from an error
    }
    return data;
  } catch (e) {
    // Check if the error is an instance of Error before accessing message
    const errorMessage = e instanceof Error ? e.message : String(e);
    console.error(`Error during AcoustID API request: ${errorMessage}`);
    return null;
  }
}

/**
 * Writes ACOUSTID_FINGERPRINT and ACOUSTID_ID tags to the file using ffmpeg.
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

    const command = new Deno.Command("ffmpeg", {
      args: [
        "-loglevel",
        "error",
        "-i",
        filePath,
        "-c",
        "copy",
        "-metadata",
        `ACOUSTID_FINGERPRINT=${fingerprint}`,
        "-metadata",
        `ACOUSTID_ID=${acoustID}`,
        tempFilePath,
      ],
      stderr: "piped", // Capture stderr for error messages
    });
    const { code, stderr } = await command.output();

    if (code !== 0) {
      console.error(`  ffmpeg error: ${new TextDecoder().decode(stderr)}`);
      return false;
    }

    try {
      await Deno.rename(tempFilePath, filePath);
      return true;
    } catch (e) {
      // Check if the error is an instance of Error before accessing message
      const errorMessage = e instanceof Error ? e.message : String(e);
      console.error(`Error replacing original file with tagged version: ${errorMessage}`);
      return false;
    }
  } finally {
    await Deno.remove(tempDir, { recursive: true }).catch((e) =>
      console.warn(`  Could not remove temp dir ${tempDir}: ${e.message}`)
    );
  }
}

/**
 * Represents the status of processing a single file.
 */
export type ProcessResultStatus =
  | "processed"
  | "skipped"
  | "failed"
  | "lookup_failed"
  | "no_results";

/**
 * Core logic for adding AcousticID tags to a single file.
 * @param filePath The path to the audio file.
 * @param apiKey The AcoustID client API key.
 * @param force Whether to overwrite existing tags.
 * @param quiet Whether to suppress informational console logs.
 * @returns A status indicating the outcome of the processing.
 */
export async function processAcoustIDTagging(
  filePath: string,
  apiKey: string,
  force: boolean,
  quiet: boolean,
  dryRun: boolean,
): Promise<ProcessResultStatus> {
  if (!quiet) console.log(`-> Processing file: ${filePath}`);

  try {
    const fileInfo = await Deno.stat(filePath);
    if (!fileInfo.isFile) {
      console.error(`Error: Path "${filePath}" is not a file.`);
      return "failed";
    }
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) {
      console.error(`Error: File not found at "${filePath}".`);
    } else {
      // Check if the error is an instance of Error before accessing message
      const errorMessage = e instanceof Error ? e.message : String(e);
      console.error(`Error accessing file "${filePath}": ${errorMessage}`);
    }
    // Always return 'failed' in case of file access errors
    return "failed";
  }

  if (!quiet) console.log("  Checking for existing AcoustID tags...");
  const tagsExist = await hasAcousticIDTags(filePath);

  if (tagsExist && !force) {
    if (!quiet) {
      console.log(
        "  INFO: File already has AcoustID tags. Skipping (use --force to overwrite).",
      );
    }
    return "skipped";
  }

  if (tagsExist && force) {
    if (!quiet) {
      console.log(
        "  INFO: File already has AcoustID tags. --force option provided, proceeding to overwrite.",
      );
    }
  }

  if (!quiet) console.log("  ACTION: Generating AcoustID fingerprint...");
  const fingerprint = await generateFingerprint(filePath);

  if (!fingerprint) {
    if (!quiet) {
      console.log("  WARNING: Could not generate fingerprint. Skipping.");
    }
    return "failed";
  }
  if (!quiet) {
    console.log(
      `    Generated Fingerprint: ${fingerprint.substring(0, 30)}...`,
    );
  }

  // Duration is needed for the lookup. For simplicity, we'll try to get it from ffprobe.
  // This could be optimized by getting it once if not available from fpcalc directly.
  let duration = 0;
  try {
    const ffprobeCmd = new Deno.Command("ffprobe", {
      args: [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        filePath,
      ],
      stdout: "piped",
    });
    const { stdout: durationOutput } = await ffprobeCmd.output();
    const durationStr = new TextDecoder().decode(durationOutput).trim();
    if (durationStr && !isNaN(parseFloat(durationStr))) {
      duration = parseFloat(durationStr);
    } else {
      if (!quiet) {
        console.log(
          "  WARNING: Could not determine audio duration. AcoustID lookup might be less accurate or fail.",
        );
      }
    }
  } catch (e) {
    if (!quiet) {
      // Check if the error is an instance of Error before accessing message
      const errorMessage = e instanceof Error ? e.message : String(e);
      console.warn(`WARNING: Could not determine audio duration due to ffprobe error: ${errorMessage}. AcoustID lookup might be less accurate or fail.`);
    }
    // Return 'failed' as duration is needed for lookup and its absence/error could cause issues
    return "failed";
  }

  if (!quiet) {
    console.log("  ACTION: Looking up fingerprint with AcoustID API...");
  }
  const lookupResult = await lookupFingerprint(fingerprint, duration, apiKey);

  if (!lookupResult) {
    if (!quiet) console.log("  ERROR: AcoustID API lookup failed.");
    return "lookup_failed";
  }

  if (!lookupResult.results || lookupResult.results.length === 0) {
    if (!quiet) {
      console.log(
        "  INFO: No results found from AcoustID API for this fingerprint.",
      );
    }
    return "no_results";
  }

  // For now, pick the first result if available.
  // More sophisticated logic could be added here (e.g. based on score)
  const bestResult = lookupResult.results[0];
  const acoustID = bestResult.id;

  if (!acoustID) {
    if (!quiet) console.log("  INFO: No AcoustID found in the API results.");
    return "no_results"; // Or a more specific status
  }
  if (!quiet) console.log(`    Found AcoustID: ${acoustID}`);

  if (dryRun) {
    if (!quiet) {
      console.log(
        `  DRY RUN: Would write ACOUSTID_FINGERPRINT=${fingerprint.substring(0,30)}... and ACOUSTID_ID=${acoustID} to ${filePath}`,
      );
      console.log("  DRY RUN: Skipping actual tag writing.");
    }
    return "processed"; // Report as processed for dry run
  }

  if (!quiet) {
    console.log(
      "  ACTION: Writing ACOUSTID_FINGERPRINT and ACOUSTID_ID tags...",
    );
  }
  const success = await writeAcoustIDTags(filePath, fingerprint, acoustID);

  if (success) {
    if (!quiet) console.log("  SUCCESS: AcoustID tags processed.");
    return "processed";
  } else {
    if (!quiet) console.log("  ERROR: Failed to write AcoustID tags.");
    return "failed";
  }
}
