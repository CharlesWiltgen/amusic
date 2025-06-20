import { basename, extname } from "jsr:@std/path";
import {
  encodeToM4A,
  generateOutputPath,
  isLosslessFormat,
} from "../lib/encoding.ts";
import { getComprehensiveMetadata } from "../lib/tagging.ts";
import { collectAudioFiles } from "../utils/file_discovery.ts";
import type { CommandOptions } from "../types/command.ts";
import { ProcessingStats } from "../utils/processing_stats.ts";
import { exitWithError, validateFiles } from "../utils/console_output.ts";

interface EncodeOptions extends CommandOptions {
  forceLossyTranscodes?: boolean;
  outputDir?: string;
  flattenOutput?: boolean;
}

export async function encodeCommand(
  options: EncodeOptions,
  ...files: string[]
): Promise<void> {
  validateFiles(files);

  const filesToProcess: string[] = [];
  const fileBaseMap = new Map<string, string>();

  for (const fileOrDir of files) {
    const collectedFiles = await collectAudioFiles([fileOrDir]);
    filesToProcess.push(...collectedFiles);

    for (const file of collectedFiles) {
      fileBaseMap.set(file, fileOrDir);
    }
  }

  if (filesToProcess.length === 0) {
    exitWithError("No valid audio files found to encode.");
  }

  if (options.outputDir && !options.dryRun) {
    try {
      await Deno.mkdir(options.outputDir, { recursive: true });
    } catch (e) {
      exitWithError(
        `Error creating output directory: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }
  }

  const stats = new ProcessingStats();

  for (const file of filesToProcess) {
    try {
      if (extname(file).toLowerCase() === ".m4a") {
        if (!options.quiet) {
          console.log(`Skipping ${file} (already M4A format)`);
        }
        stats.incrementSkipped();
        continue;
      }

      const isLossless = await isLosslessFormat(file);
      if (!isLossless && !options.forceLossyTranscodes) {
        console.error(
          `Skipping ${file} (lossy format - use --force-lossy-transcodes to override)`,
        );
        stats.incrementSkipped();
        continue;
      }

      const outputPath = generateOutputPath(
        file,
        options.outputDir,
        !options.flattenOutput,
        fileBaseMap.get(file),
      );

      try {
        await Deno.stat(outputPath);
        if (!options.quiet) {
          console.log(
            `Skipping ${file} (output file already exists: ${outputPath})`,
          );
        }
        stats.incrementSkipped();
        continue;
      } catch {
        // File doesn't exist, good to proceed
      }

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

      stats.incrementSuccess();
    } catch (error) {
      const errorMessage = error instanceof Error
        ? error.message
        : String(error);
      console.error(`Error encoding ${file}: ${errorMessage}`);
      stats.incrementFailed();
    }
  }

  stats.printSummary("Encoding Complete", options.dryRun);
}
