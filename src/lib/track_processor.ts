import type { ProcessResultStatus } from "./acoustid.ts";
import {
  encodeToM4A,
  generateOutputPath,
  isLosslessFormat,
} from "./encoding.ts";
import { calculateReplayGain } from "./replaygain.ts";
import { processAcoustIDTagging } from "./acoustid.ts";
import { dirname } from "jsr:@std/path";
import { DEFAULT_CONCURRENCY } from "../constants.ts";

export interface TrackProcessingOptions {
  // Encoding options
  encode?: boolean;
  forceLossyTranscodes?: boolean;
  outputDirectory?: string;
  preserveStructure?: boolean;
  basePath?: string;

  // ReplayGain options
  calculateGain?: boolean;
  albumGainData?: Map<string, { albumGain: number; albumPeak: number }>;

  // AcoustID options
  processAcoustID?: boolean;
  acoustIDApiKey?: string;
  forceAcoustID?: boolean;

  // General options
  quiet?: boolean;
  dryRun?: boolean;
}

export interface TrackProcessingResult {
  inputPath: string;
  outputPath?: string;
  encoded?: boolean;
  encodingError?: string;
  replayGainApplied?: boolean;
  replayGainError?: string;
  acoustIDStatus?: ProcessResultStatus;
  acoustIDError?: string;
  duration: number;
}

export interface BatchProcessingOptions extends TrackProcessingOptions {
  concurrency?: number;
  onProgress?: (processed: number, total: number, currentFile: string) => void;
}

/**
 * Process a single track with multiple operations
 */
export async function processTrack(
  filePath: string,
  options: TrackProcessingOptions,
): Promise<TrackProcessingResult> {
  const result: TrackProcessingResult = {
    inputPath: filePath,
    duration: 0,
  };

  let workingPath = filePath;

  // Step 1: Encoding (if requested)
  if (options.encode) {
    try {
      const isLossless = await isLosslessFormat(filePath);
      if (!isLossless && !options.forceLossyTranscodes) {
        result.encodingError =
          "Cannot encode from lossy format without --force-lossy-transcodes";
        return result;
      }

      const outputPath = generateOutputPath(
        filePath,
        options.outputDirectory,
        options.preserveStructure,
        options.basePath,
      );

      result.outputPath = outputPath;

      if (!options.dryRun) {
        // Ensure output directory exists
        const outputDir = dirname(outputPath);
        await Deno.mkdir(outputDir, { recursive: true });

        await encodeToM4A(filePath, outputPath, {
          forceLossyTranscodes: options.forceLossyTranscodes,
          dryRun: false,
        });
      }

      result.encoded = true;
      workingPath = outputPath; // Continue processing with the encoded file

      if (!options.quiet) {
        console.log(`✅ Encoded: ${outputPath}`);
      }
    } catch (error) {
      result.encodingError = error instanceof Error
        ? error.message
        : String(error);
      if (!options.quiet) {
        console.error(`❌ Encoding failed: ${result.encodingError}`);
      }
      // Continue with other operations on original file
    }
  }

  // Step 2: ReplayGain (if requested and we have album data)
  if (options.calculateGain && options.albumGainData) {
    try {
      // ReplayGain is calculated at album level, but we can apply album gain data
      const albumData = options.albumGainData.get(filePath);
      if (albumData) {
        result.replayGainApplied = true;
        if (!options.quiet) {
          console.log(`✅ ReplayGain data available for track`);
        }
      }
    } catch (error) {
      result.replayGainError = error instanceof Error
        ? error.message
        : String(error);
      if (!options.quiet) {
        console.error(`❌ ReplayGain error: ${result.replayGainError}`);
      }
    }
  }

  // Step 3: AcoustID (if requested)
  if (options.processAcoustID && options.acoustIDApiKey) {
    try {
      const status = await processAcoustIDTagging(
        workingPath,
        options.acoustIDApiKey,
        options.forceAcoustID || false,
        options.quiet || false,
        options.dryRun || false,
      );
      result.acoustIDStatus = status;

      if (!options.quiet && status === "processed") {
        console.log(`✅ AcoustID processed for: ${workingPath}`);
      }
    } catch (error) {
      result.acoustIDError = error instanceof Error
        ? error.message
        : String(error);
      result.acoustIDStatus = "failed";
      if (!options.quiet) {
        console.error(`❌ AcoustID error: ${result.acoustIDError}`);
      }
    }
  }

  return result;
}

/**
 * Process multiple tracks in parallel with a worker pool
 */
export async function batchProcessTracks(
  filePaths: string[],
  options: BatchProcessingOptions,
): Promise<TrackProcessingResult[]> {
  const {
    concurrency = DEFAULT_CONCURRENCY,
    onProgress,
    ...trackOptions
  } = options;

  const results: TrackProcessingResult[] = [];
  const queue = [...filePaths];
  let processed = 0;

  // Process in parallel batches
  const processBatch = async () => {
    const batch: Promise<TrackProcessingResult>[] = [];

    for (let i = 0; i < concurrency && queue.length > 0; i++) {
      const filePath = queue.shift()!;

      batch.push(
        processTrack(filePath, trackOptions).then((result) => {
          processed++;
          if (onProgress) {
            onProgress(processed, filePaths.length, filePath);
          }
          return result;
        }),
      );
    }

    if (batch.length > 0) {
      const batchResults = await Promise.all(batch);
      results.push(...batchResults);
    }
  };

  // Process all files
  while (queue.length > 0 || processed < filePaths.length) {
    await processBatch();
  }

  return results;
}

/**
 * Process an album (directory) with ReplayGain calculation
 */
export async function processAlbum(
  albumPath: string,
  files: string[],
  options: BatchProcessingOptions,
): Promise<TrackProcessingResult[]> {
  const albumGainData = new Map<
    string,
    { albumGain: number; albumPeak: number }
  >();

  // Calculate ReplayGain for the entire album first
  if (options.calculateGain) {
    if (!options.quiet) {
      console.log(`📊 Calculating ReplayGain for album: ${albumPath}`);
    }

    const gainResult = await calculateReplayGain(
      albumPath,
      options.quiet || false,
      true, // returnData
    );

    if (gainResult.success && gainResult.data) {
      // Store album gain data for each file
      for (const [filePath, data] of Object.entries(gainResult.data)) {
        if (data.albumGain !== undefined && data.albumPeak !== undefined) {
          albumGainData.set(filePath, {
            albumGain: data.albumGain,
            albumPeak: data.albumPeak,
          });
        }
      }
    }
  }

  // Process all tracks with the album gain data
  const trackOptions: BatchProcessingOptions = {
    ...options,
    albumGainData,
  };

  return batchProcessTracks(files, trackOptions);
}

/**
 * Create a worker pool for track processing
 */
export class TrackProcessorPool {
  private processingQueue: Array<{
    filePath: string;
    options: TrackProcessingOptions;
    resolve: (result: TrackProcessingResult) => void;
    reject: (error: Error) => void;
  }> = [];
  private activeWorkers = 0;
  private maxWorkers: number;
  private isShuttingDown = false;

  constructor(maxWorkers = DEFAULT_CONCURRENCY) {
    this.maxWorkers = maxWorkers;
  }

  processTrack(
    filePath: string,
    options: TrackProcessingOptions,
  ): Promise<TrackProcessingResult> {
    if (this.isShuttingDown) {
      throw new Error("Processor pool is shutting down");
    }

    return new Promise((resolve, reject) => {
      this.processingQueue.push({ filePath, options, resolve, reject });
      this.processNext();
    });
  }

  private async processNext() {
    if (
      this.processingQueue.length === 0 ||
      this.activeWorkers >= this.maxWorkers ||
      this.isShuttingDown
    ) {
      return;
    }

    const task = this.processingQueue.shift()!;
    this.activeWorkers++;

    try {
      const result = await processTrack(task.filePath, task.options);
      task.resolve(result);
    } catch (error) {
      task.reject(error instanceof Error ? error : new Error(String(error)));
    } finally {
      this.activeWorkers--;
      this.processNext();
    }
  }

  async shutdown() {
    this.isShuttingDown = true;

    // Wait for active workers to complete
    while (this.activeWorkers > 0) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  getStatus() {
    return {
      activeWorkers: this.activeWorkers,
      queuedTasks: this.processingQueue.length,
      isShuttingDown: this.isShuttingDown,
    };
  }
}
