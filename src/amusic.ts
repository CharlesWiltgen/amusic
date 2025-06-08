// amusic.ts
import { Command } from "@cliffy/command";
import { getAcousticIDTags, processAcoustIDTagging } from "./lib/acoustid.ts";
import { getVendorBinaryPath } from "./lib/vendor_tools.ts";
import { calculateReplayGain } from "./lib/replaygain.ts";
import { join } from "jsr:@std/path";

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

// Resolve platform-specific vendor binaries for fpcalc and rsgain
const fpcalcPath = getVendorBinaryPath("fpcalc");
const rsgainPath = getVendorBinaryPath("rsgain");

// Functions `hasAcousticIDTags`, `generateFingerprint`, `writeAcousticIDFingerprint`,
// and `processAcousticIDTagging` have been moved to lib/acoustid.ts

if (import.meta.main) {
  interface CommandOptions {
    force?: boolean;
    quiet: boolean;
    showTags?: boolean;
    dryRun?: boolean;
    apiKey?: string;
  }

  const program = new Command()
    .name("amusic")
    .version("0.1.0")
    .description(
      "Calculate ReplayGain and embed AcousticID fingerprints and IDs.",
    );

  program
    .command(
      "easy <library:string>",
      "Calculate ReplayGain and AcousticID for each album in a library root directory (each album in its own folder).",
    )
    .option(
      "-f, --force",
      "Force reprocessing AcoustID fingerprints even if tags exist.",
    )
    .option(
      "-q, --quiet",
      "Suppress informational output. Errors are still shown.",
      { default: false },
    )
    .option(
      "--dry-run",
      "Simulate processing and API lookups but do not write any tags to files.",
      { default: false },
    )
    .option(
      "--api-key <key:string>",
      "AcoustID API key (required for lookups).",
    )
    .action(async (options: CommandOptions, library: string) => {
      if (!options.apiKey) {
        console.error(
          "Error: --api-key is required for AcoustID lookups in easy mode.",
        );
        Deno.exit(1);
      }
      await ensureCommandExists(fpcalcPath);
      await ensureCommandExists("ffprobe");
      await ensureCommandExists("ffmpeg");
      await ensureCommandExists(rsgainPath);

      try {
        const libInfo = await Deno.stat(library);
        if (!libInfo.isDirectory) {
          console.error(`Error: "${library}" is not a directory.`);
          Deno.exit(1);
        }
      } catch {
        console.error(`Error: Directory not found at "${library}".`);
        Deno.exit(1);
      }

      let processedCount = 0;
      let skippedCount = 0;
      let failedCount = 0;
      let lookupFailedCount = 0;
      let noResultsCount = 0;

      for await (const entry of Deno.readDir(library)) {
        if (!entry.isDirectory) continue;
        const albumDir = join(library, entry.name);
        if (!options.quiet) console.log(`\nProcessing album: ${albumDir}`);
        const success = await calculateReplayGain(albumDir, options.quiet);
        if (!success) {
          console.error(
            `  ERROR: ReplayGain calculation failed for album "${albumDir}". Skipping AcousticID tagging for this album.`,
          );
          continue;
        }

        for await (const fileEntry of Deno.readDir(albumDir)) {
          if (!fileEntry.isFile) continue;
          const filePath = join(albumDir, fileEntry.name);
          if (!options.quiet) console.log("");
          try {
            const status = await processAcoustIDTagging(
              filePath,
              options.apiKey!,
              options.force || false,
              options.quiet || false,
              options.dryRun || false,
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
                break;
              case "no_results":
                noResultsCount++;
                break;
            }
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error(`Unexpected error processing ${filePath}: ${msg}`);
            failedCount++;
          }
        }
      }

      console.log("\n--- Easy Mode Complete ---");
      console.log(`Files processed: ${processedCount}`);
      console.log(`Skipped (already tagged): ${skippedCount}`);
      console.log(`No AcoustID results found: ${noResultsCount}`);
      console.log(`AcoustID lookup failed: ${lookupFailedCount}`);
      console.log(`Other failures: ${failedCount}`);
      if (options.dryRun) {
        console.log("\nNOTE: This was a dry run. No files were modified.");
      }

  program
    .option("-f, --force", "Force reprocessing even if tags exist.", { override: true })
    .option(
      "-q, --quiet",
      "Suppress informational output. Errors are still shown.",
      { default: false, override: true },
    )
    .option(
      "--show-tags",
      "Display existing AcoustID tags for files and exit.",
    )
    .option(
      "--dry-run",
      "Simulate processing and API lookups but do not write any tags to files.",
      { override: true },
    )
    .option(
      "--api-key <key:string>",
      "AcoustID API key (required for lookups).",
      { override: true },
    )
    .arguments("<files:string...>")
    .action(async (options: CommandOptions, ...files: string[]) => {
      // Handle --show-tags
      if (options.showTags) {
        if (!options.quiet) {
          console.log("Displaying existing AcoustID tags:");
        }
        for (const file of files) {
          try {
            await ensureCommandExists("ffprobe");
            const tags = await getAcousticIDTags(file);
            if (tags) {
              console.log(`\nFile: ${file}`);
              console.log(
                `  ACOUSTID_ID: ${tags.ACOUSTID_ID || "Not found"}`,
              );
              console.log(
                `  ACOUSTID_FINGERPRINT: ${
                  tags.ACOUSTID_FINGERPRINT || "Not found"
                }`,
              );
            } else {
              console.log(`\nFile: ${file}`);
              console.log("  No AcoustID tags found.");
            }
          } catch (error) {
            const errorMessage = error instanceof Error
              ? error.message
              : String(error);
            console.error(`Error reading tags for ${file}: ${errorMessage}`);
          }
        }
        Deno.exit(0); // Exit after showing tags
      }

      if (!options.apiKey) {
        if (!options.quiet) {
          console.warn(
            "WARNING: No --api-key provided. Running in fingerprint-only mode (no AcoustID ID tagging).",
          );
        }
      }

      if (!options.quiet) {
        console.log(`Processing ${files.length} file(s)...`);
        if (options.apiKey) console.log(`Using API Key: ${options.apiKey.substring(0, 5)}...`);
      }

      let processedCount = 0;
      let skippedCount = 0;
      let failedCount = 0;
      let lookupFailedCount = 0;
      let noResultsCount = 0;

      for (const file of files) {
        try {
          if (!options.quiet && files.length > 1) console.log("");
          const status = await processAcoustIDTagging(
            file,
            options.apiKey ?? "",
            options.force || false,
            options.quiet || false,
            options.dryRun || false,
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
              break;
            case "no_results":
              noResultsCount++;
              break;
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error(`Unexpected error processing ${file}: ${errorMessage}`);
          failedCount++;
        }
      }

      console.log("\n--- Processing Complete ---");
      console.log(`Successfully processed: ${processedCount}`);
      console.log(`Skipped (already tagged/force not used): ${skippedCount}`);
      console.log(`No AcoustID results found: ${noResultsCount}`);
      console.log(
        `AcoustID lookup failed (API/network issues): ${lookupFailedCount}`,
      );
      console.log(`Other failures (e.g., file access, fpcalc): ${failedCount}`);
      console.log("---------------------------");
      if (options.dryRun) console.log("\nNOTE: This was a dry run. No files were modified.");
    });

  await program.parse(Deno.args);
}
