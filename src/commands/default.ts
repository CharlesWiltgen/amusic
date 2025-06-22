import {
  batchProcessAcoustIDTagging,
  processAcoustIDTagging,
} from "../lib/acoustid.ts";
import { collectAudioFiles } from "../utils/file_discovery.ts";
import type { CommandOptions } from "../types/command.ts";
import { ProcessingStats } from "../utils/processing_stats.ts";
import {
  logProcessingInfo,
  validateAudioFiles,
} from "../utils/console_output.ts";
import { showTagsWithFolderAPI } from "./show_tags_folder.ts";
import { HIGH_CONCURRENCY } from "../constants.ts";

export async function defaultCommand(
  options: CommandOptions,
  ...files: string[]
): Promise<void> {
  // Hide cursor
  if (!options.quiet) {
    Deno.stdout.writeSync(new TextEncoder().encode("\x1b[?25l"));
  }

  let lastCount = 0;
  if (!options.quiet) {
    Deno.stdout.writeSync(
      new TextEncoder().encode("→ Collecting audio files: 0 files found"),
    );
  }

  const filesToProcess = await collectAudioFiles(files, (count) => {
    if (!options.quiet && count !== lastCount) {
      // Move cursor to beginning of line and clear it
      Deno.stdout.writeSync(
        new TextEncoder().encode(
          `\x1b[2K\r→ Collecting audio files: ${count} files found`,
        ),
      );
      lastCount = count;
    }
  });

  if (!options.quiet) {
    // Update with final count and checkmark
    Deno.stdout.writeSync(
      new TextEncoder().encode(
        `\x1b[2K\r✅ Collecting audio files: ${filesToProcess.length} files found\n`,
      ),
    );
    // Show cursor
    Deno.stdout.writeSync(new TextEncoder().encode("\x1b[?25h"));
  }

  if (options.showTags) {
    // Use the new batch API for maximum performance
    await showTagsWithFolderAPI(filesToProcess, options.quiet);
    return;
  }

  validateAudioFiles(filesToProcess);
  logProcessingInfo(options, filesToProcess.length);

  const stats = new ProcessingStats();

  // Use batch processing for multiple files
  if (filesToProcess.length > 1 && options.apiKey) {
    if (!options.quiet) {
      console.log(`\nBatch processing ${filesToProcess.length} files...`);
    }

    const results = await batchProcessAcoustIDTagging(
      filesToProcess,
      options.apiKey,
      {
        force: options.force || false,
        quiet: options.quiet || false,
        dryRun: options.dryRun || false,
        concurrency: HIGH_CONCURRENCY,
        onProgress: (processed, total, _currentFile) => {
          if (!options.quiet) {
            // Move cursor to beginning of line and clear it
            Deno.stdout.writeSync(new TextEncoder().encode(
              `\x1b[2K\r→ Processing: ${processed}/${total} files (${
                Math.round(processed / total * 100)
              }%)`,
            ));
          }
        },
      },
    );

    if (!options.quiet) {
      Deno.stdout.writeSync(new TextEncoder().encode("\n"));
    }

    // Update stats from results
    for (const [_file, status] of results) {
      stats.increment(status);
    }
  } else {
    // Fall back to individual processing for single files or no API key
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
        stats.increment(status);
      } catch (error) {
        const errorMessage = error instanceof Error
          ? error.message
          : String(error);
        console.error(`Unexpected error processing ${file}: ${errorMessage}`);
        stats.incrementFailed();
      }
    }
  }

  stats.printSummary("Processing Complete", options.dryRun);
}
