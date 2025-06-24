import { basename, extname } from "jsr:@std/path";
import { generateOutputPath, isLosslessFormat } from "../lib/encoding.ts";
import { getComprehensiveMetadata } from "../lib/tagging.ts";
import { collectAudioFiles } from "../utils/file_discovery.ts";
import type { CommandOptions } from "../types/command.ts";
import { EncodingStats } from "../utils/encoding_stats.ts";
import { exitWithError, validateFiles } from "../utils/console_output.ts";
import { EncodingSpinner } from "../utils/spinner.ts";

interface EncodeOptions extends CommandOptions {
  forceLossyTranscodes?: boolean;
  outputDir?: string;
  flattenOutput?: boolean;
  concurrency?: number;
}

interface EncodingTask {
  file: string;
  outputPath: string;
  trackDisplayName: string;
}

function extractFolderNameFromPath(fileOrDir: string): string {
  if (fileOrDir.endsWith("/")) {
    // It's a directory path
    const trimmed = fileOrDir.slice(0, -1);
    return trimmed.substring(trimmed.lastIndexOf("/") + 1) || trimmed;
  }

  const lastSlash = fileOrDir.lastIndexOf("/");
  if (lastSlash === -1) {
    // No slashes - could be a folder name in current directory or a file
    return fileOrDir.includes(".") ? "." : fileOrDir;
  }

  // Has slashes - extract the directory part
  const dirPath = fileOrDir.substring(0, lastSlash);
  if (dirPath === ".") {
    // The folder is actually after the ./
    return fileOrDir.substring(lastSlash + 1);
  }

  return dirPath.substring(dirPath.lastIndexOf("/") + 1) || dirPath;
}

function extractFolderNames(files: string[]): string[] {
  const folders = new Set<string>();

  for (const fileOrDir of files) {
    folders.add(extractFolderNameFromPath(fileOrDir));
  }

  return Array.from(folders).sort();
}

function showEncodingFeedback(folderArray: string[]): void {
  if (folderArray.length === 1) {
    console.log(
      `\n🗜️ amusic has started to encode 📁 \x1b[1m\x1b[94m${
        folderArray[0]
      }\x1b[0m`,
    );
  } else {
    console.log(`\n🗜️ amusic has started to encode:`);
    for (const folder of folderArray) {
      console.log(`  📁 \x1b[1m\x1b[94m${folder}\x1b[0m`);
    }
  }
}

type TaskResult =
  | { type: "task"; task: EncodingTask }
  | { type: "skip"; reason: "already_m4a" | "lossy_format" | "output_exists" };

async function checkIfShouldSkipFile(
  file: string,
  options: EncodeOptions,
): Promise<TaskResult | null> {
  // Skip M4A files
  if (extname(file).toLowerCase() === ".m4a") {
    if (!options.quiet) {
      console.log(`Skipping ${file} (already M4A format)`);
    }
    return { type: "skip", reason: "already_m4a" };
  }

  // Check if file is lossless
  const isLossless = await isLosslessFormat(file);
  if (!isLossless && !options.forceLossyTranscodes) {
    console.error(
      `Skipping ${file} (lossy format - use --force-lossy-transcodes to override)`,
    );
    return { type: "skip", reason: "lossy_format" };
  }

  return null;
}

async function checkIfOutputExists(
  outputPath: string,
  file: string,
  quiet?: boolean,
): Promise<boolean> {
  try {
    await Deno.stat(outputPath);
    if (!quiet) {
      console.log(
        `Skipping ${file} (output file already exists: ${outputPath})`,
      );
    }
    return true;
  } catch {
    return false;
  }
}

async function createOutputDirectoryIfNeeded(
  outputPath: string,
  options: EncodeOptions,
): Promise<void> {
  if (options.outputDir && !options.dryRun) {
    const outputFileDir = outputPath.substring(0, outputPath.lastIndexOf("/"));
    try {
      await Deno.mkdir(outputFileDir, { recursive: true });
    } catch (e) {
      if (!(e instanceof Deno.errors.AlreadyExists)) {
        throw e;
      }
    }
  }
}

async function getTrackDisplayName(file: string): Promise<string> {
  try {
    const metadata = await getComprehensiveMetadata(file);
    if (metadata?.title) {
      return metadata.title;
    }
  } catch {
    // Fall back to filename if metadata read fails
  }
  return basename(file);
}

async function prepareEncodingTask(
  file: string,
  options: EncodeOptions,
  fileBaseMap: Map<string, string>,
): Promise<TaskResult> {
  // Check if we should skip this file
  const skipResult = await checkIfShouldSkipFile(file, options);
  if (skipResult) {
    return skipResult;
  }

  // Generate output path
  const outputPath = generateOutputPath(
    file,
    options.outputDir,
    !options.flattenOutput,
    fileBaseMap.get(file),
  );

  // Check if output already exists
  const outputExists = await checkIfOutputExists(
    outputPath,
    file,
    options.quiet,
  );
  if (outputExists) {
    return { type: "skip", reason: "output_exists" };
  }

  // Create output directory if needed
  await createOutputDirectoryIfNeeded(outputPath, options);

  // Get track display name
  const trackDisplayName = await getTrackDisplayName(file);

  return { type: "task", task: { file, outputPath, trackDisplayName } };
}

async function collectAllFiles(
  files: string[],
): Promise<{ filesToProcess: string[]; fileBaseMap: Map<string, string> }> {
  const filesToProcess: string[] = [];
  const fileBaseMap = new Map<string, string>();

  for (const fileOrDir of files) {
    const collectedFiles = await collectAudioFiles([fileOrDir]);
    filesToProcess.push(...collectedFiles);

    for (const file of collectedFiles) {
      fileBaseMap.set(file, fileOrDir);
    }
  }

  return { filesToProcess, fileBaseMap };
}

async function createOutputDirectory(
  outputDir: string | undefined,
  dryRun: boolean | undefined,
): Promise<void> {
  if (outputDir && !dryRun) {
    try {
      await Deno.mkdir(outputDir, { recursive: true });
    } catch (e) {
      exitWithError(
        `Error creating output directory: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }
  }
}

interface WorkerContext {
  workers: Worker[];
  availableWorkers: number[];
  taskQueue: EncodingTask[];
  activeJobs: Map<number, EncodingTask>;
  workerLogs: Map<number, string[]>;
  spinner: EncodingSpinner | null;
  stats: EncodingStats;
  options: EncodeOptions;
}

function createWorkerPool(
  concurrency: number,
  encodingTasks: EncodingTask[],
  ctx: WorkerContext,
): void {
  for (let i = 0; i < Math.min(concurrency, encodingTasks.length); i++) {
    const worker = new Worker(
      new URL("../workers/encode_worker.ts", import.meta.url).href,
      { type: "module" },
    );

    ctx.workers.push(worker);
    ctx.availableWorkers.push(i);

    setupWorkerMessageHandler(worker, i, ctx);
  }
}

function setupWorkerMessageHandler(
  worker: Worker,
  _workerId: number,
  ctx: WorkerContext,
): void {
  worker.onmessage = (e) => {
    const { id, type, message, error } = e.data;

    if (type === "log" && message) {
      bufferLogMessage(id, message, ctx.workerLogs);
    } else if (type === "error" && error) {
      bufferErrorMessage(id, error, ctx);
    } else if (type === "done") {
      handleWorkerDone(id, error, ctx);
    }
  };
}

function bufferLogMessage(
  id: number,
  message: string,
  workerLogs: Map<number, string[]>,
): void {
  const logs = workerLogs.get(id) ?? [];
  logs.push(message);
  workerLogs.set(id, logs);
}

function bufferErrorMessage(
  id: number,
  error: string,
  ctx: WorkerContext,
): void {
  const logs = ctx.workerLogs.get(id) ?? [];
  logs.push(error);
  ctx.workerLogs.set(id, logs);
  ctx.stats.incrementFailed();
}

function handleWorkerDone(
  id: number,
  error: string | undefined,
  ctx: WorkerContext,
): void {
  // Stop spinner and print logs
  if (ctx.spinner) {
    ctx.spinner.stop();
  }

  const logs = ctx.workerLogs.get(id) ?? [];
  if (!ctx.options.quiet && logs.length > 0) {
    logs.forEach((log) => console.log(log));
  }

  // Clean up
  ctx.workerLogs.delete(id);
  ctx.activeJobs.delete(id);

  if (!error) {
    ctx.stats.incrementSuccess();
  }

  if (ctx.spinner) {
    ctx.spinner.incrementCompleted();
    if (ctx.taskQueue.length > 0 || ctx.activeJobs.size > 0) {
      ctx.spinner.start();
    }
  }

  // Make this worker available again
  ctx.availableWorkers.push(id);

  // Process next task if available
  processNextTask(ctx);
}

function processNextTask(ctx: WorkerContext): void {
  if (ctx.taskQueue.length === 0 || ctx.availableWorkers.length === 0) {
    // Check if all work is done
    if (ctx.taskQueue.length === 0 && ctx.activeJobs.size === 0) {
      // All done - clean up workers
      ctx.workers.forEach((w) => w.terminate());
      if (ctx.spinner) {
        ctx.spinner.stop();
      }
    }
    return;
  }

  const workerId = ctx.availableWorkers.shift();
  const task = ctx.taskQueue.shift();

  // These should never be undefined due to the checks above
  if (workerId === undefined || task === undefined) {
    return;
  }

  const worker = ctx.workers[workerId];
  ctx.activeJobs.set(workerId, task);

  // Send task to worker
  worker.postMessage({
    id: workerId,
    inputPath: task.file,
    outputPath: task.outputPath,
    trackDisplayName: task.trackDisplayName,
    options: {
      forceLossyTranscodes: ctx.options.forceLossyTranscodes,
      dryRun: ctx.options.dryRun,
      outputDirectory: ctx.options.outputDir,
    },
  });
}

export async function encodeCommand(
  options: EncodeOptions,
  ...files: string[]
): Promise<void> {
  validateFiles(files);

  // Show immediate feedback FIRST - before any file processing
  if (!options.quiet && files.length > 0) {
    const folderArray = extractFolderNames(files);
    showEncodingFeedback(folderArray);
  }

  // Collect all files
  const { filesToProcess, fileBaseMap } = await collectAllFiles(files);

  if (filesToProcess.length === 0) {
    exitWithError("No valid audio files found to encode.");
  }

  // Create output directory if needed
  await createOutputDirectory(options.outputDir, options.dryRun);

  // Prepare encoding tasks
  const stats = new EncodingStats();
  const encodingTasks = await prepareAllEncodingTasks(
    filesToProcess,
    options,
    fileBaseMap,
    stats,
  );

  // Show worker info
  const concurrency = options.concurrency ?? 8;
  if (!options.quiet && encodingTasks.length > 0) {
    console.log(
      `\n🚀 Encoding ${encodingTasks.length} files with ${concurrency} parallel workers\n`,
    );
  }

  // Process with workers
  await processWithWorkers(encodingTasks, concurrency, options, stats);

  stats.printSummary("Encoding Complete", options.dryRun);
}

async function prepareAllEncodingTasks(
  filesToProcess: string[],
  options: EncodeOptions,
  fileBaseMap: Map<string, string>,
  stats: EncodingStats,
): Promise<EncodingTask[]> {
  const encodingTasks: EncodingTask[] = [];

  for (const file of filesToProcess) {
    try {
      const result = await prepareEncodingTask(file, options, fileBaseMap);
      if (result.type === "task") {
        encodingTasks.push(result.task);
      } else {
        stats.incrementSkipped(result.reason);
      }
    } catch (error) {
      const errorMessage = error instanceof Error
        ? error.message
        : String(error);
      console.error(`Error preparing ${file}: ${errorMessage}`);
      stats.incrementFailed();
    }
  }

  return encodingTasks;
}

async function processWithWorkers(
  encodingTasks: EncodingTask[],
  concurrency: number,
  options: EncodeOptions,
  stats: EncodingStats,
): Promise<void> {
  if (encodingTasks.length === 0) {
    return;
  }

  // Create context
  const ctx: WorkerContext = {
    workers: [],
    availableWorkers: [],
    taskQueue: [...encodingTasks],
    activeJobs: new Map<number, EncodingTask>(),
    workerLogs: new Map<number, string[]>(),
    spinner: options.quiet ? null : new EncodingSpinner(encodingTasks.length),
    stats,
    options,
  };

  if (ctx.spinner) {
    ctx.spinner.start();
  }

  // Create worker pool
  createWorkerPool(concurrency, encodingTasks, ctx);

  // Start processing tasks
  for (let i = 0; i < Math.min(concurrency, encodingTasks.length); i++) {
    processNextTask(ctx);
  }

  // Wait for all tasks to complete
  await waitForCompletion(ctx);
}

async function waitForCompletion(ctx: WorkerContext): Promise<void> {
  await new Promise<void>((resolve) => {
    const checkCompletion = setInterval(() => {
      if (ctx.taskQueue.length === 0 && ctx.activeJobs.size === 0) {
        clearInterval(checkCompletion);
        resolve();
      }
    }, 100);
  });
}
