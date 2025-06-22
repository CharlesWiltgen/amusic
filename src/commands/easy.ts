import { getVendorBinaryPath } from "../lib/vendor_tools.ts";
import type { CommandOptions } from "../types/command.ts";
import { ensureCommandExists } from "../utils/command.ts";
import { ProcessingStats } from "../utils/processing_stats.ts";
import { exitWithError } from "../utils/console_output.ts";
import { analyzeFolderStructure } from "../lib/folder_processor.ts";
import { processAlbum } from "../lib/track_processor.ts";

/**
 * Enhanced easy mode using the Folder API for better performance
 */
export async function easyCommand(
  options: CommandOptions,
  library: string,
): Promise<void> {
  if (!options.apiKey) {
    exitWithError(
      "Error: --api-key is required for AcoustID lookups in easy mode.",
    );
  }

  const fpcalcPath = getVendorBinaryPath("fpcalc");
  const rsgainPath = getVendorBinaryPath("rsgain");

  await ensureCommandExists(fpcalcPath);
  await ensureCommandExists(rsgainPath);

  const stats = new ProcessingStats();

  if (!options.quiet) {
    console.log("🎵 Analyzing music library structure...\n");
  }

  // Use the new folder analyzer to find albums
  const folderAnalysis = await analyzeFolderStructure([library], {
    singlesPatterns: [], // Easy mode treats everything as albums
    quiet: options.quiet,
  });

  if (!options.quiet) {
    console.log(
      `\n✅ Found ${folderAnalysis.albums.size} albums to process\n`,
    );
  }

  if (folderAnalysis.singles.length > 0 && !options.quiet) {
    console.warn(
      `⚠️  Found ${folderAnalysis.singles.length} single files not in album folders. ` +
        `These will be skipped in easy mode.\n`,
    );
  }

  // Process each album using unified track processor
  for (const [albumDir, files] of folderAnalysis.albums) {
    if (!options.quiet) {
      console.log(`\n📁 Processing album: ${albumDir}`);
      console.log(`  Files: ${files.length}`);
    }

    // No need to map paths, 'files' already contains the paths

    // Use unified track processor for album
    const results = await processAlbum(albumDir, files, {
      calculateGain: true, // Always calculate ReplayGain in easy mode
      processAcoustID: true, // Always process AcoustID in easy mode
      acoustIDApiKey: options.apiKey,
      forceAcoustID: options.force,
      quiet: options.quiet,
      dryRun: options.dryRun,
      concurrency: 4,
      onProgress: (processed, total) => {
        if (!options.quiet) {
          Deno.stdout.writeSync(
            new TextEncoder().encode(
              `\x1b[2K\r  Progress: ${processed}/${total} tracks`,
            ),
          );
        }
      },
    });

    if (!options.quiet) {
      console.log(""); // New line after progress
    }

    // Update stats from results
    for (const result of results) {
      if (result.acoustIDStatus) {
        stats.increment(result.acoustIDStatus);
      } else if (result.acoustIDError || result.replayGainError) {
        stats.incrementFailed();
      } else {
        stats.increment("processed");
      }
    }
  }

  stats.printSummary("Easy Mode Complete", options.dryRun);

  // Optional: Show library statistics
  if (!options.quiet) {
    console.log("\n📊 Library Statistics:");
    console.log(`  Total albums: ${folderAnalysis.albums.size}`);

    let totalTracks = 0;
    for (const [_albumDir, files] of folderAnalysis.albums) {
      totalTracks += files.length;
    }
    console.log(`  Total tracks: ${totalTracks}`);

    if (folderAnalysis.singles.length > 0) {
      console.log(`  Skipped singles: ${folderAnalysis.singles.length}`);
    }
  }
}
