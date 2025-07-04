// lib/acoustid.ts
import { getVendorBinaryPath } from "./vendor_tools.ts";
import {
  getAcoustIDTags,
  getAudioDuration,
  hasAcoustIDTags,
  writeAcoustIDTags,
} from "./tagging.ts";
import { ACOUSTID_API_URL, DEFAULT_CONCURRENCY } from "../constants.ts";
export { getAcoustIDTags, hasAcoustIDTags, writeAcoustIDTags };

export interface FpcalcResult {
  fingerprint: string;
  duration: number;
}

export interface AcoustIDApiError {
  message: string;
  code?: number; // Optional error code
}

export interface Recording {
  id: string;
  title?: string;
  artists?: { id: string; name: string }[];
  duration?: number;
  releasegroups?: ReleaseGroup[]; // Can be nested
  // Add other relevant fields if needed
}

export interface ReleaseGroup {
  id: string;
  title?: string;
  type?: string; // e.g., Album, Single
  artists?: { id: string; name: string }[];
  releases?: {
    id: string;
    title?: string;
    medium_count?: number;
    track_count?: number;
  }[];
  // Add other relevant fields if needed
}

export interface ResultItem {
  id: string; // This is the AcoustID
  score: number;
  recordings?: Recording[];
  // Potentially other fields like 'releasegroups' directly if the API structure varies
}

export interface LookupResult {
  status?: "ok" | "error";
  results?: ResultItem[];
  error?: AcoustIDApiError; // Present if status is "error"
}

/**
 * Generates the AcousticID fingerprint using fpcalc.
 */
export async function generateFingerprint(
  filePath: string,
): Promise<string | null> {
  const fpcalcPath = getVendorBinaryPath("fpcalc");
  const command = new Deno.Command(fpcalcPath, {
    args: ["-json", filePath],
    stdout: "piped",
    stderr: "piped",
  });
  const { code, stdout, stderr } = await command.output();

  if (code !== 0) {
    console.error(`  fpcalc error: ${new TextDecoder().decode(stderr)}`);
    return null;
  }

  try {
    const output = new TextDecoder().decode(stdout).trim();
    const result: FpcalcResult = JSON.parse(output);

    if (result.fingerprint) {
      return result.fingerprint;
    }
    console.error("  No fingerprint found in fpcalc JSON output.");
    return null;
  } catch (error) {
    console.error(`  Could not parse fpcalc JSON output: ${error}`);
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
): Promise<LookupResult | null> {
  const apiUrl =
    `${ACOUSTID_API_URL}?client=${apiKey}&meta=recordings+releasegroups+compress&duration=${
      Math.round(duration)
    }&fingerprint=${fingerprint}`;
  if (!apiKey) {
    console.error("  AcoustID API key is required for lookup.");
    return null;
  }

  try {
    const response = await fetch(apiUrl);
    if (!response.ok) {
      console.error(
        `  AcoustID API error: ${response.status} ${response.statusText}`,
      );
      return null;
    }
    const data = await response.json();
    if (data.status === "error") {
      console.error(`  AcoustID API returned error: ${data.error?.message}`);
      return null;
    }
    if (!data.results || data.results.length === 0) {
      // No results found in AcoustID lookup.
      return { results: [] };
    }
    return data as LookupResult;
  } catch (e) {
    // Check if the error is an instance of Error before accessing message
    const errorMessage = e instanceof Error ? e.message : String(e);
    console.error(`Error during AcoustID API request: ${errorMessage}`);
    return null;
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
  const tagsExist = await hasAcoustIDTags(filePath);

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

  // Duration is needed for the lookup. Get it from Taglib-Wasm.
  const duration = await getAudioDuration(filePath);
  if (duration === 0 && !quiet) {
    console.log(
      "  WARNING: Could not determine audio duration. AcoustID lookup might be less accurate or fail.",
    );
  }

  let acoustIDToWrite = "";
  let resultStatus: ProcessResultStatus = "processed";
  if (apiKey) {
    if (!quiet) {
      console.log("  ACTION: Looking up fingerprint with AcoustID API...");
    }
    const lookupResult = await lookupFingerprint(fingerprint, duration, apiKey);
    if (!lookupResult) {
      resultStatus = "lookup_failed";
      if (!quiet) {
        console.log("  ERROR: AcoustID API lookup failed (null response).");
      }
    } else if (lookupResult.status === "error") {
      resultStatus = "lookup_failed";
      if (!quiet) {
        console.log(
          `  ERROR: AcoustID API returned error: ${
            lookupResult.error?.message || "Unknown error"
          }`,
        );
      }
    } else if (!lookupResult.results || lookupResult.results.length === 0) {
      resultStatus = "no_results";
      if (!quiet) {
        console.log(
          "  INFO: No results found from AcoustID API for this fingerprint.",
        );
      }
    } else {
      acoustIDToWrite = lookupResult.results[0].id;
      if (!quiet) console.log(`    Found AcoustID: ${acoustIDToWrite}`);
    }
  } else {
    if (!quiet) {
      console.log(
        "  INFO: No AcoustID API key provided, skipping AcoustID ID tagging.",
      );
    }
  }

  if (dryRun) {
    if (!quiet) {
      console.log(
        `  DRY RUN: Would write ACOUSTID_FINGERPRINT=${
          fingerprint.substring(0, 30)
        }... and ACOUSTID_ID=${acoustIDToWrite} to ${filePath}`,
      );
      console.log("  DRY RUN: Skipping actual tag writing.");
    }
    return resultStatus;
  }

  if (!quiet) {
    console.log(
      "  ACTION: Writing ACOUSTID_FINGERPRINT and ACOUSTID_ID tags...",
    );
  }
  const success = await writeAcoustIDTags(
    filePath,
    fingerprint,
    acoustIDToWrite,
  );

  if (success) {
    if (!quiet) console.log("  SUCCESS: AcoustID fingerprint tag processed.");
    return resultStatus;
  }
  if (!quiet) console.log("  ERROR: Failed to write AcoustID tags.");
  return "failed";
}

/**
 * Batch process multiple files for AcoustID tagging.
 * Much more efficient than processing files individually.
 */
export async function batchProcessAcoustIDTagging(
  filePaths: string[],
  apiKey: string,
  options: {
    force?: boolean;
    quiet?: boolean;
    dryRun?: boolean;
    concurrency?: number;
    onProgress?: (
      processed: number,
      total: number,
      currentFile: string,
    ) => void;
  } = {},
): Promise<Map<string, ProcessResultStatus>> {
  const {
    force = false,
    quiet = true,
    dryRun = false,
    concurrency = DEFAULT_CONCURRENCY,
    onProgress,
  } = options;
  const results = new Map<string, ProcessResultStatus>();

  // Step 1: Batch check for existing tags
  if (!quiet) console.log("Checking for existing AcoustID tags...");
  const existingTags = await batchCheckAcoustIDTags(filePaths, concurrency);

  // Filter files that need processing
  const filesToProcess = filePaths.filter((file) => {
    const hasTag = existingTags.get(file) || false;
    if (hasTag && !force) {
      results.set(file, "skipped");
      return false;
    }
    return true;
  });

  if (!quiet) {
    console.log(
      `Files to process: ${filesToProcess.length} of ${filePaths.length}`,
    );
  }

  // Step 2: Get durations for all files in batch
  const durations = await batchGetAudioProperties(filesToProcess, concurrency);

  // Step 3: Process fingerprinting in parallel batches
  const batchSize = concurrency;
  for (let i = 0; i < filesToProcess.length; i += batchSize) {
    const batch = filesToProcess.slice(i, i + batchSize);

    // Process batch in parallel
    const batchPromises = batch.map(async (filePath) => {
      try {
        if (onProgress) {
          onProgress(
            i + batch.indexOf(filePath) + 1,
            filesToProcess.length,
            filePath,
          );
        }

        // Generate fingerprint
        const fingerprint = await generateFingerprint(filePath);
        if (!fingerprint) {
          results.set(filePath, "failed");
          return;
        }

        // Get duration from our batch lookup
        const props = durations.get(filePath);
        const duration = props?.duration || 0;

        // Lookup in AcoustID API
        let acoustIDToWrite = "";
        let resultStatus: ProcessResultStatus = "processed";

        if (apiKey) {
          const lookupResult = await lookupFingerprint(
            fingerprint,
            duration,
            apiKey,
          );
          if (!lookupResult) {
            resultStatus = "lookup_failed";
          } else if (lookupResult.status === "error") {
            resultStatus = "lookup_failed";
          } else if (
            !lookupResult.results || lookupResult.results.length === 0
          ) {
            resultStatus = "no_results";
          } else if (lookupResult.results[0]) {
            acoustIDToWrite = lookupResult.results[0].id;
          }
        }

        // Write tags
        if (!dryRun) {
          const success = await writeAcoustIDTags(
            filePath,
            fingerprint,
            acoustIDToWrite,
          );
          if (!success) {
            results.set(filePath, "failed");
            return;
          }
        }

        results.set(filePath, resultStatus);
      } catch (error) {
        const errorMessage = error instanceof Error
          ? error.message
          : String(error);
        if (!quiet) {
          console.error(`Error processing ${filePath}: ${errorMessage}`);
        }
        results.set(filePath, "failed");
      }
    });

    await Promise.all(batchPromises);
  }

  return results;
}

/**
 * Helper to import batch functions from tagging module
 */
import { batchCheckAcoustIDTags, batchGetAudioProperties } from "./tagging.ts";
