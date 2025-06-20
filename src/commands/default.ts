import { processAcoustIDTagging } from "../lib/acoustid.ts";
import { collectAudioFiles } from "../utils/file_discovery.ts";
import type { CommandOptions } from "../types/command.ts";
import { ProcessingStats } from "../utils/processing_stats.ts";
import {
  logProcessingInfo,
  validateAudioFiles,
} from "../utils/console_output.ts";
import { showTagsWithFolderAPI } from "./show_tags_folder.ts";

export async function defaultCommand(
  options: CommandOptions,
  ...files: string[]
): Promise<void> {
  const filesToProcess = await collectAudioFiles(files);

  if (options.showTags) {
    // Use the new Folder API for better performance
    await showTagsWithFolderAPI(filesToProcess, options.quiet);
    return;
  }

  validateAudioFiles(filesToProcess);
  logProcessingInfo(options, filesToProcess.length);

  const stats = new ProcessingStats();

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

  stats.printSummary("Processing Complete", options.dryRun);
}
