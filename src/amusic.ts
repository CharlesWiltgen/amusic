// amusic.ts
import { Command } from "@cliffy/command";
import { processAcoustIDTagging } from "./lib/acoustid.ts";
import { getComprehensiveMetadata } from "./lib/tagging.ts";
import { getVendorBinaryPath } from "./lib/vendor_tools.ts";
import { calculateReplayGain } from "./lib/replaygain.ts";
import {
  encodeToM4A,
  generateOutputPath,
  isLosslessFormat,
} from "./lib/encoding.ts";
import { basename, dirname, extname, fromFileUrl, join } from "jsr:@std/path";
// Auto-load environment variables from a .env file located alongside this script (allows ACOUSTID_API_KEY in .env)
import { loadSync } from "jsr:@std/dotenv";
const __dirname = dirname(fromFileUrl(import.meta.url));

// Load version from deno.json
const denoConfigPath = join(dirname(__dirname), "deno.json");
const denoConfig = JSON.parse(await Deno.readTextFile(denoConfigPath));
export const VERSION = denoConfig.version || "0.1.0";
// Load environment variables from a .env file located alongside this script (e.g. ACOUSTID_API_KEY)
try {
  loadSync({ export: true, envPath: join(__dirname, ".env") });
} catch {
  // ignore missing or invalid .env
}

const SUPPORTED_EXTENSIONS = [
  "mp3",
  "flac",
  "ogg",
  "m4a",
  "wav",
];

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
    .version(VERSION)
    .description(
      "Calculate ReplayGain and embed AcousticID fingerprints and IDs.",
    )
    // Default command options
    .option("-f, --force", "Force reprocessing even if tags exist.")
    .option(
      "-q, --quiet",
      "Suppress informational output. Errors are still shown.",
      { default: false },
    )
    .option(
      "--show-tags",
      "Display existing AcoustID tags and exit. No modifications made.",
    )
    .option(
      "--dry-run",
      "Simulate processing and API lookups but do not write any tags to files.",
    )
    .option(
      "--api-key <key:string>",
      "AcoustID API key (required for lookups).",
      { default: Deno.env.get("ACOUSTID_API_KEY") },
    )
    .arguments("<...files:string>")
    .action(async (options: CommandOptions, ...files: string[]) => {
      const filesToProcess: string[] = [];
      for (const fileOrDir of files) {
        try {
          const info = await Deno.stat(fileOrDir);
          if (info.isDirectory) {
            for await (const entry of Deno.readDir(fileOrDir)) {
              if (entry.isFile) {
                const ext = extname(entry.name).toLowerCase().slice(1);
                if (SUPPORTED_EXTENSIONS.includes(ext)) {
                  filesToProcess.push(join(fileOrDir, entry.name));
                }
              }
            }
          } else if (info.isFile) {
            const ext = extname(fileOrDir).toLowerCase().slice(1);
            if (SUPPORTED_EXTENSIONS.includes(ext)) {
              filesToProcess.push(fileOrDir);
            } else {
              console.error(
                `Warning: File "${fileOrDir}" has unsupported extension; skipping.`,
              );
            }
          }
        } catch (e) {
          if (e instanceof Deno.errors.NotFound) {
            console.error(`Error: Path "${fileOrDir}" not found; skipping.`);
          } else {
            console.error(
              `Warning: Path "${fileOrDir}" not found or inaccessible; skipping.`,
            );
          }
        }
      }

      // Handle --show-tags
      if (options.showTags) {
        if (!options.quiet) {
          console.log("Displaying comprehensive metadata:");
        }
        for (const file of filesToProcess) {
          try {
            const metadata = await getComprehensiveMetadata(file);
            console.log(`\nFile: ${file}`);

            if (metadata) {
              // Basic tags
              console.log("\n  Basic Tags:");
              console.log(`    Title: ${metadata.title || "(none)"}`);
              console.log(`    Artist: ${metadata.artist || "(none)"}`);
              console.log(`    Album: ${metadata.album || "(none)"}`);
              console.log(`    Year: ${metadata.year || "(none)"}`);
              console.log(`    Track: ${metadata.track || "(none)"}`);
              console.log(`    Genre: ${metadata.genre || "(none)"}`);
              if (metadata.comment) {
                console.log(`    Comment: ${metadata.comment}`);
              }

              // Audio properties
              console.log("\n  Audio Properties:");
              console.log(`    Format: ${metadata.format || "Unknown"}`);
              console.log(
                `    Duration: ${
                  metadata.duration ? `${metadata.duration}s` : "(none)"
                }`,
              );
              console.log(
                `    Bitrate: ${
                  metadata.bitrate ? `${metadata.bitrate} kbps` : "(none)"
                }`,
              );
              console.log(
                `    Sample Rate: ${
                  metadata.sampleRate ? `${metadata.sampleRate} Hz` : "(none)"
                }`,
              );
              console.log(`    Channels: ${metadata.channels || "(none)"}`);

              // Extended tags
              if (
                metadata.acoustIdFingerprint || metadata.acoustIdId ||
                metadata.musicBrainzTrackId || metadata.musicBrainzReleaseId ||
                metadata.musicBrainzArtistId
              ) {
                console.log("\n  Extended Tags:");
                if (metadata.acoustIdId) {
                  console.log(`    AcoustID ID: ${metadata.acoustIdId}`);
                }
                if (metadata.acoustIdFingerprint) {
                  console.log(
                    `    AcoustID Fingerprint: ${
                      metadata.acoustIdFingerprint.substring(0, 50)
                    }...`,
                  );
                }
                if (metadata.musicBrainzTrackId) {
                  console.log(
                    `    MusicBrainz Track ID: ${metadata.musicBrainzTrackId}`,
                  );
                }
                if (metadata.musicBrainzReleaseId) {
                  console.log(
                    `    MusicBrainz Release ID: ${metadata.musicBrainzReleaseId}`,
                  );
                }
                if (metadata.musicBrainzArtistId) {
                  console.log(
                    `    MusicBrainz Artist ID: ${metadata.musicBrainzArtistId}`,
                  );
                }
              }

              // ReplayGain
              if (
                metadata.replayGainTrackGain !== undefined ||
                metadata.replayGainAlbumGain !== undefined
              ) {
                console.log("\n  ReplayGain:");
                if (metadata.replayGainTrackGain !== undefined) {
                  console.log(
                    `    Track Gain: ${metadata.replayGainTrackGain} dB`,
                  );
                }
                if (metadata.replayGainTrackPeak !== undefined) {
                  console.log(
                    `    Track Peak: ${metadata.replayGainTrackPeak}`,
                  );
                }
                if (metadata.replayGainAlbumGain !== undefined) {
                  console.log(
                    `    Album Gain: ${metadata.replayGainAlbumGain} dB`,
                  );
                }
                if (metadata.replayGainAlbumPeak !== undefined) {
                  console.log(
                    `    Album Peak: ${metadata.replayGainAlbumPeak}`,
                  );
                }
              }

              // Cover art
              console.log("\n  Cover Art:");
              console.log(
                `    Has Cover: ${metadata.hasCoverArt ? "Yes" : "No"}`,
              );
              if (metadata.hasCoverArt && metadata.coverArtCount) {
                console.log(`    Cover Count: ${metadata.coverArtCount}`);
              }
            } else {
              console.log("  No metadata found or error reading file.");
            }
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.error(`\nFile: ${file}`);
            console.error(`  Error reading metadata: ${msg}`);
          }
        }
        return; // Exit after showing tags
      }

      if (filesToProcess.length === 0) {
        console.error("Error: No supported audio files found.");
        Deno.exit(1);
      }

      if (!options.quiet) {
        if (!options.apiKey) {
          console.log(
            "WARNING: No --api-key provided. Running in fingerprint-only mode (no AcoustID ID tagging).",
          );
        }
      }
      if (!options.quiet) {
        console.log(`Processing ${filesToProcess.length} file(s)...`);
        if (options.apiKey) {
          console.log(`Using API Key: ${options.apiKey.substring(0, 5)}...`);
        }
      }
      let processedCount = 0;
      let skippedCount = 0;
      let failedCount = 0;
      let lookupFailedCount = 0;
      let noResultsCount = 0;
      for (const file of filesToProcess) {
        try {
          if (!options.quiet && filesToProcess.length > 1) console.log("");
          const status = await processAcoustIDTagging(
            file,
            options.apiKey || "",
            options.force || false,
            options.quiet,
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
          const errorMessage = error instanceof Error
            ? error.message
            : String(error);
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
      if (options.dryRun) {
        console.log("\nNOTE: This was a dry run. No files were modified.");
      }
    });

  // Add easy subcommand
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
      { default: Deno.env.get("ACOUSTID_API_KEY") },
    )
    .action(async (options: CommandOptions, library: string) => {
      if (!options.apiKey) {
        console.error(
          "Error: --api-key is required for AcoustID lookups in easy mode.",
        );
        Deno.exit(1);
      }
      await ensureCommandExists(fpcalcPath);
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
        const result = await calculateReplayGain(albumDir, options.quiet);
        if (!result.success) {
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
    });

  // Add encode subcommand
  program
    .command(
      "encode <files...:string>",
      "Encode audio files to M4A/AAC format. By default only encodes from lossless sources (WAV, FLAC, M4A).",
    )
    .option(
      "--force-lossy-transcodes",
      "Allow transcoding from lossy formats (MP3, OGG). Not recommended due to quality loss.",
      { default: false },
    )
    .option(
      "-o, --output-dir <dir:string>",
      "Output directory for encoded files. Defaults to same directory as source files.",
    )
    .option(
      "--flatten-output",
      "When using --output-dir, put all output files in a single directory (disables directory structure preservation).",
      { default: false },
    )
    .option(
      "-q, --quiet",
      "Suppress informational output. Errors are still shown.",
      { default: false },
    )
    .option(
      "--dry-run",
      "Simulate encoding but do not write any files.",
      { default: false },
    )
    .action(
      async (
        options: CommandOptions & {
          forceLossyTranscodes?: boolean;
          outputDir?: string;
          flattenOutput?: boolean;
        },
        ...files: string[]
      ) => {
        if (!files || files.length === 0) {
          console.error("Error: No files specified for encoding.");
          Deno.exit(1);
        }

        // Helper function to recursively collect audio files
        async function collectAudioFiles(path: string): Promise<string[]> {
          const files: string[] = [];
          try {
            const info = await Deno.stat(path);
            if (info.isDirectory) {
              for await (const entry of Deno.readDir(path)) {
                const fullPath = join(path, entry.name);
                if (entry.isDirectory) {
                  // Recursively process subdirectories
                  const subFiles = await collectAudioFiles(fullPath);
                  files.push(...subFiles);
                } else if (entry.isFile) {
                  const ext = extname(entry.name).toLowerCase().slice(1);
                  if (SUPPORTED_EXTENSIONS.includes(ext)) {
                    files.push(fullPath);
                  }
                }
              }
            } else if (info.isFile) {
              const ext = extname(path).toLowerCase().slice(1);
              if (SUPPORTED_EXTENSIONS.includes(ext)) {
                files.push(path);
              } else if (!options.quiet) {
                console.error(
                  `Warning: File "${path}" has unsupported extension; skipping.`,
                );
              }
            }
          } catch (e) {
            if (e instanceof Deno.errors.NotFound) {
              console.error(`Error: Path "${path}" not found; skipping.`);
            } else {
              console.error(
                `Warning: Path "${path}" not found or inaccessible; skipping.`,
              );
            }
          }
          return files;
        }

        // Collect all files to process with their base directories
        const filesToProcess: string[] = [];
        const fileBaseMap = new Map<string, string>(); // Maps file path to its base input path

        for (const fileOrDir of files) {
          const collectedFiles = await collectAudioFiles(fileOrDir);
          filesToProcess.push(...collectedFiles);

          // Track base directory for each file to preserve structure
          for (const file of collectedFiles) {
            fileBaseMap.set(file, fileOrDir);
          }
        }

        if (filesToProcess.length === 0) {
          console.error("No valid audio files found to encode.");
          Deno.exit(1);
        }

        // Create output directory if specified
        if (options.outputDir && !options.dryRun) {
          try {
            await Deno.mkdir(options.outputDir, { recursive: true });
          } catch (e) {
            console.error(
              `Error creating output directory: ${
                e instanceof Error ? e.message : String(e)
              }`,
            );
            Deno.exit(1);
          }
        }

        let successCount = 0;
        let skippedCount = 0;
        let failedCount = 0;

        for (const file of filesToProcess) {
          try {
            // Skip if already M4A
            if (extname(file).toLowerCase() === ".m4a") {
              if (!options.quiet) {
                console.log(`Skipping ${file} (already M4A format)`);
              }
              skippedCount++;
              continue;
            }

            // Check if source is lossless
            const isLossless = await isLosslessFormat(file);
            if (!isLossless && !options.forceLossyTranscodes) {
              console.error(
                `Skipping ${file} (lossy format - use --force-lossy-transcodes to override)`,
              );
              skippedCount++;
              continue;
            }

            const outputPath = generateOutputPath(
              file,
              options.outputDir,
              !options.flattenOutput, // preserve structure by default unless --flatten-output is used
              fileBaseMap.get(file),
            );

            // Check if output file already exists
            try {
              await Deno.stat(outputPath);
              // File exists
              if (!options.quiet) {
                console.log(
                  `Skipping ${file} (output file already exists: ${outputPath})`,
                );
              }
              skippedCount++;
              continue;
            } catch {
              // File doesn't exist, good to proceed
            }

            // Create output directory if needed
            if (options.outputDir && !options.dryRun) {
              const outputFileDir = outputPath.substring(
                0,
                outputPath.lastIndexOf("/"),
              );
              try {
                await Deno.mkdir(outputFileDir, { recursive: true });
              } catch (_e) {
                // Directory might already exist, that's fine
              }
            }

            // Get track title for display
            let trackDisplayName = basename(file);
            try {
              const metadata = await getComprehensiveMetadata(file);
              if (metadata?.title) {
                trackDisplayName = metadata.title;
              }
            } catch {
              // Fall back to filename if metadata read fails
            }

            if (!options.quiet) {
              console.log(`💿 Encoding '${trackDisplayName}'`);
              console.log(`   ${file} -> ${outputPath}`);
            }

            await encodeToM4A(file, outputPath, {
              forceLossyTranscodes: options.forceLossyTranscodes,
              dryRun: options.dryRun,
              outputDirectory: options.outputDir,
            });

            successCount++;
          } catch (error) {
            const errorMessage = error instanceof Error
              ? error.message
              : String(error);
            console.error(`Error encoding ${file}: ${errorMessage}`);
            failedCount++;
          }
        }

        console.log("\n--- Encoding Complete ---");
        console.log(`Successfully encoded: ${successCount}`);
        console.log(`Skipped: ${skippedCount}`);
        console.log(`Failed: ${failedCount}`);
        console.log("-------------------------");
        if (options.dryRun) {
          console.log("\nNOTE: This was a dry run. No files were created.");
        }
      },
    );

  await program.parse(Deno.args);
}
