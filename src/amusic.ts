// amusic.ts
import { Command } from "cliffy/command/mod.ts";
import { processAcoustIDTagging } from "./lib/acoustid.ts";

/**
 * Checks if a command is available in the system PATH.
 * Exits the script if a command is not found.
 */
async function ensureCommandExists(command: string): Promise<void> {
  try {
    const cmd = new Deno.Command(command, {
      args: ["-version"], // Most tools support -version or --version
      stdout: "piped", // Suppress output during check
      stderr: "piped", // Suppress output during check
    });
    await cmd.output();
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) {
      console.error(
        `Error: Command "${command}" not found. Please ensure it is installed and in your PATH.`,
      );
      Deno.exit(1);
    }
    // If it's another error (e.g., -version is not the right flag but command exists),
    // we assume it exists for this check. Actual calls later will handle specific execution errors.
    // console.warn(`Notice: Could not verify version for "${command}" (may not use -version flag), but proceeding.`);
  }
}

// Functions `hasAcousticIDTags`, `generateFingerprint`, `writeAcousticIDFingerprint`,
// and `processAcousticIDTagging` have been moved to lib/acoustid.ts

if (import.meta.main) {
  await new Command()
    .name("amusic")
    .version("0.1.0")
    .description("Tag audio files with AcousticID fingerprints and IDs.")
    .option("-f, --force", "Force reprocessing even if tags exist.")
    .option(
      "-q, --quiet",
      "Suppress informational output. Errors are still shown.",
      { default: false },
    )
    .option(
      "--api-key <key:string>",
      "AcoustID API key (required for lookups).",
    )
    .arguments("<files:string...>")
    .action(async (options, ...files) => {
      await ensureCommandExists("fpcalc");
      await ensureCommandExists("ffprobe");
      await ensureCommandExists("ffmpeg");

      if (!options.apiKey) {
        console.error("Error: --api-key is required for AcoustID lookups.");
        console.error(
          "Please provide your AcoustID API key using the --api-key <key> option.",
        );
        Deno.exit(1);
      }

      if (!options.quiet) {
        console.log(`Processing ${files.length} file(s)...`);
        console.log(`Using API Key: ${options.apiKey.substring(0, 5)}...`); // Show a portion for confirmation
      }

      let processedCount = 0;
      let skippedCount = 0;
      let failedCount = 0;
      let lookupFailedCount = 0;
      let noResultsCount = 0;

      for (const file of files) {
        try {
          // The per-file header "Processing: ${file}" is now handled by processAcoustIDTagging (if not quiet)
          // If quiet, processAcoustIDTagging will not print it.
          // Adding a newline if not quiet for better separation if processAcoustIDTagging prints its header.
          if (!options.quiet && files.length > 1) console.log(""); // Add space between file logs

          const status = await processAcoustIDTagging(
            file,
            options.apiKey,
            options.force || false,
            options.quiet || false,
          );
          switch (status) {
            case "processed":
              processedCount++;
              break;
            case "skipped":
              skippedCount++;
              break;
            case "failed":
              failedCount++;
              break;
            case "lookup_failed":
              lookupFailedCount++;
              // Consider if lookup_failed should also increment general `failedCount`
              // For now, keeping them separate in count but maybe sum up for total errors later.
              break;
            case "no_results":
              noResultsCount++;
              break;
          }
        } catch (error) {
          // Check if the error is an instance of Error before accessing message
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error(`Unexpected error processing ${file}: ${errorMessage}`);
          // Increment failed count for unexpected errors and continue to the next file
          failedCount++;
          // Do NOT return here, continue processing other files
        }
      }

      // Print Summary Report
      console.log("\n--- Processing Complete ---");
      console.log(`Successfully processed: ${processedCount}`);
      console.log(`Skipped (already tagged/force not used): ${skippedCount}`);
      console.log(`No AcoustID results found: ${noResultsCount}`);
      console.log(
        `AcoustID lookup failed (API/network issues): ${lookupFailedCount}`,
      );
      let otherFailures = failedCount; // Start with general failures
      // If you decide lookup_failed also contributes to a total "Failed" count shown to user,
      // you might sum them here or ensure `failedCount` is incremented alongside `lookupFailedCount`.
      // For this example, let's assume `failedCount` is for errors not covered by `lookupFailedCount`.
      console.log(
        `Other failures (e.g., file access, fpcalc): ${otherFailures}`,
      );
      console.log("---------------------------");
    })
    .parse(Deno.args);
}
