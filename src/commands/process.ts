import { ProcessingStats } from "../utils/processing_stats.ts";
import {
  batchProcessTracks,
  processAlbum,
  TrackProcessorPool,
} from "../lib/track_processor.ts";
import {
  analyzeFolderStructure,
  getAlbumDisplayName,
} from "../lib/folder_processor.ts";
import type { CommandOptions } from "../types/command.ts";

export interface ProcessCommandOptions extends CommandOptions {
  // Encoding options
  encode?: boolean;
  forceLossyTranscodes?: boolean;
  outputDir?: string;
  flattenOutput?: boolean;

  // Processing options
  replayGain?: boolean;
  acoustID?: boolean;

  // Folder processing
  singles?: string[]; // Folders to treat as singles
}

/**
 * Unified processing command that can handle encoding, ReplayGain, and AcoustID
 * in a single pass per track
 */
export async function processCommand(
  options: ProcessCommandOptions,
  ...paths: string[]
): Promise<void> {
  // Hide cursor for progress display
  if (!options.quiet) {
    Deno.stdout.writeSync(new TextEncoder().encode("\x1b[?25l"));
  }

  try {
    const stats = new ProcessingStats();

    // Analyze folder structure
    if (!options.quiet) {
      console.log("🎵 Analyzing folder structure...\n");
    }

    const folderAnalysis = await analyzeFolderStructure(paths, {
      singlesPatterns: options.singles || [],
      quiet: options.quiet,
    });

    if (!options.quiet) {
      console.log(
        `\n📊 Found ${folderAnalysis.albums.size} albums and ${folderAnalysis.singles.length} singles\n`,
      );
    }

    // Determine what operations to perform
    const operations: string[] = [];
    if (options.encode) operations.push("encoding");
    if (options.replayGain) operations.push("ReplayGain");
    if (options.acoustID) operations.push("AcoustID");

    if (operations.length === 0) {
      console.error(
        "Error: No operations specified. Use --encode, --replay-gain, or --acoust-id",
      );
      return;
    }

    if (!options.quiet) {
      console.log(`Operations: ${operations.join(", ")}\n`);
    }

    // Process albums
    if (folderAnalysis.albums.size > 0) {
      if (!options.quiet) {
        console.log("🎼 Processing albums...\n");
      }

      for (const [albumDir, albumFiles] of folderAnalysis.albums) {
        if (!options.quiet) {
          const albumName = getAlbumDisplayName(albumDir);
          console.log(`\n💿 Processing album: ${albumName}`);
          console.log(`   Path: ${albumDir}`);
          console.log(`   Tracks: ${albumFiles.length}`);
        }

        const results = await processAlbum(albumDir, albumFiles, {
          encode: options.encode,
          forceLossyTranscodes: options.forceLossyTranscodes,
          outputDirectory: options.outputDir,
          preserveStructure: !options.flattenOutput,
          basePath: paths[0], // Use first path as base for structure preservation
          calculateGain: options.replayGain,
          processAcoustID: options.acoustID,
          acoustIDApiKey: options.apiKey,
          forceAcoustID: options.force,
          quiet: options.quiet,
          dryRun: options.dryRun,
          concurrency: 4,
          onProgress: (processed, total) => {
            if (!options.quiet) {
              Deno.stdout.writeSync(
                new TextEncoder().encode(
                  `\x1b[2K\r   Progress: ${processed}/${total} tracks`,
                ),
              );
            }
          },
        });

        if (!options.quiet) {
          console.log(""); // New line after progress
        }

        // Update stats
        for (const result of results) {
          if (result.encodingError) stats.incrementFailed();
          else if (result.acoustIDStatus) {
            stats.increment(result.acoustIDStatus);
          } else stats.increment("processed");
        }
      }
    }

    // Process singles
    if (folderAnalysis.singles.length > 0) {
      if (!options.quiet) {
        console.log("\n🎵 Processing singles...\n");
      }

      const pool = new TrackProcessorPool(4);

      const results = await batchProcessTracks(folderAnalysis.singles, {
        encode: options.encode,
        forceLossyTranscodes: options.forceLossyTranscodes,
        outputDirectory: options.outputDir,
        preserveStructure: !options.flattenOutput,
        basePath: paths[0], // Use first path as base for structure preservation
        calculateGain: false, // No album-level ReplayGain for singles
        processAcoustID: options.acoustID,
        acoustIDApiKey: options.apiKey,
        forceAcoustID: options.force,
        quiet: options.quiet,
        dryRun: options.dryRun,
        concurrency: 4,
        onProgress: (processed, total, currentFile) => {
          if (!options.quiet) {
            const fileName = currentFile.substring(
              currentFile.lastIndexOf("/") + 1,
            );
            Deno.stdout.writeSync(
              new TextEncoder().encode(
                `\x1b[2K\r→ Processing single: ${processed}/${total} - ${fileName}`,
              ),
            );
          }
        },
      });

      if (!options.quiet) {
        console.log(""); // New line after progress
      }

      // Update stats
      for (const result of results) {
        if (result.encodingError) stats.incrementFailed();
        else if (result.acoustIDStatus) {
          stats.increment(result.acoustIDStatus);
        } else stats.increment("processed");
      }

      await pool.shutdown();
    }

    stats.printSummary("Processing Complete", options.dryRun);
  } finally {
    // Show cursor
    if (!options.quiet) {
      Deno.stdout.writeSync(new TextEncoder().encode("\x1b[?25h"));
    }
  }
}
