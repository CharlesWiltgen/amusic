import { processAcoustIDTagging } from "../lib/acoustid.ts";
import { calculateReplayGain } from "../lib/replaygain.ts";
import { getVendorBinaryPath } from "../lib/vendor_tools.ts";
import type { CommandOptions } from "../types/command.ts";
import { ensureCommandExists } from "../utils/command.ts";
import { ProcessingStats } from "../utils/processing_stats.ts";
import { exitWithError, validateDirectory } from "../utils/console_output.ts";
import {
  groupFilesByDirectory,
  scanMusicDirectory,
} from "../lib/folder_operations.ts";

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
  await validateDirectory(library);

  const stats = new ProcessingStats();

  if (!options.quiet) {
    console.log("🎵 Scanning music library...");
  }

  // Use Folder API to scan the entire library at once
  const scanResult = await scanMusicDirectory(library, {
    recursive: true,
    onProgress: (processed, total, _currentFile) => {
      if (!options.quiet && processed % 50 === 0) {
        console.log(`  Scanned ${processed}/${total} files...`);
      }
    },
    concurrency: 8,
  });

  if (!options.quiet) {
    console.log(
      `✅ Found ${scanResult.totalFound} audio files in ${scanResult.files.length} albums\n`,
    );
  }

  // Group files by directory (album)
  const albumDirectories = groupFilesByDirectory(scanResult.files);

  // Process each album
  for (const [albumDir, files] of albumDirectories) {
    if (!options.quiet) {
      console.log(`\n📁 Processing album: ${albumDir}`);
      console.log(`  Files: ${files.length}`);
    }

    // Step 1: Calculate ReplayGain for the album
    const replayGainResult = await calculateReplayGain(albumDir, options.quiet);
    if (!replayGainResult.success) {
      console.error(
        `  ❌ ReplayGain calculation failed for album "${albumDir}". Skipping AcoustID tagging.`,
      );
      continue;
    }

    // Step 2: Process AcoustID for each file in the album

    for (const file of files) {
      if (!options.quiet) console.log("");

      try {
        // Check if file already has AcoustID tags
        const hasAcoustId = file.tags && (
          "acoustIdFingerprint" in file.tags ||
          "acoustIdId" in file.tags
        );

        if (hasAcoustId && !options.force) {
          if (!options.quiet) {
            console.log(
              `  ⏭️  Skipping ${
                basename(file.path)
              } (already has AcoustID tags)`,
            );
          }
          stats.incrementSkipped();
          continue;
        }

        // Process AcoustID tagging
        const status = await processAcoustIDTagging(
          file.path,
          options.apiKey!,
          options.force || false,
          options.quiet || false,
          options.dryRun || false,
        );
        stats.increment(status);

        // Note: The actual tags were already written by processAcoustIDTagging
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`  ❌ Error processing ${file.path}: ${msg}`);
        stats.incrementFailed();
      }
    }
  }

  stats.printSummary("Easy Mode Complete", options.dryRun);

  // Optional: Show library statistics
  if (!options.quiet) {
    console.log("\n📊 Library Statistics:");
    console.log(`  Total albums: ${albumDirectories.size}`);
    console.log(`  Total tracks: ${scanResult.totalFound}`);

    const totalDuration = scanResult.files.reduce(
      (sum, f) => sum + (f.properties?.length || 0),
      0,
    );
    const hours = Math.floor(totalDuration / 3600);
    const minutes = Math.floor((totalDuration % 3600) / 60);
    console.log(`  Total duration: ${hours}h ${minutes}m`);

    if (scanResult.errors.length > 0) {
      console.log(`  Scan errors: ${scanResult.errors.length}`);
    }
  }
}

function basename(path: string): string {
  return path.split("/").pop() || path;
}
