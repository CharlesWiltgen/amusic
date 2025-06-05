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
    .description("Tag audio files with AcousticID fingerprints.")
    .option("-f, --force", "Force reprocessing even if tags exist.")
    .option("-q, --quiet", "Suppress informational output. Errors are still shown.", { default: false })
    .arguments("<files:string...>")
    .action(async (options, ...files) => {
      await ensureCommandExists("fpcalc");
      await ensureCommandExists("ffprobe");
      await ensureCommandExists("ffmpeg");

      if (!options.quiet) {
        console.log(`Processing ${files.length} file(s)...`);
      }

      let processedCount = 0;
      let skippedCount = 0;
      let failedCount = 0;

      for (const file of files) {
        try {
          // The per-file header "Processing: ${file}" is now handled by processAcoustIDTagging (if not quiet)
          // If quiet, processAcoustIDTagging will not print it.
          // Adding a newline if not quiet for better separation if processAcoustIDTagging prints its header.
          if (!options.quiet && files.length > 1) console.log(""); // Add space between file logs

          const status = await processAcoustIDTagging(file, options.force || false, options.quiet || false);
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
          }
        } catch (error) {
          // This catch block might be redundant if processAcoustIDTagging handles all its errors
          // and returns "failed". However, keeping it for unexpected errors.
          console.error(`Unexpected error processing ${file}: ${error.message}`);
          failedCount++;
        }
      }

      // Print Summary Report
      console.log("\n--- Processing Complete ---");
      console.log(`Successfully processed: ${processedCount}`);
      console.log(`Skipped: ${skippedCount}`);
      console.log(`Failed: ${failedCount}`);
      console.log("---------------------------");
    })
    .parse(Deno.args);
}