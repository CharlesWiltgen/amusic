import type { CommandOptions } from "../types/command.ts";

export function logProcessingInfo(
  options: CommandOptions,
  fileCount: number,
): void {
  if (!options.quiet) {
    if (!options.apiKey) {
      console.log(
        "WARNING: No --api-key provided. Running in fingerprint-only mode (no AcoustID ID tagging).",
      );
    }
    console.log(`Processing ${fileCount} file(s)...`);
    if (options.apiKey) {
      console.log(`Using API Key: ${options.apiKey.substring(0, 5)}...`);
    }
  }
}

export function logError(message: string): void {
  console.error(message);
}

export function exitWithError(message: string, code: number = 1): never {
  console.error(message);
  Deno.exit(code);
}

export function validateDirectory(path: string): Promise<void> {
  return Deno.stat(path).then((info) => {
    if (!info.isDirectory) {
      exitWithError(`Error: "${path}" is not a directory.`);
    }
  }).catch(() => {
    exitWithError(`Error: Directory not found at "${path}".`);
  });
}

export function validateFiles(files: string[]): void {
  if (!files || files.length === 0) {
    exitWithError("Error: No files specified.");
  }
}

export function validateAudioFiles(files: string[]): void {
  if (files.length === 0) {
    exitWithError("Error: No supported audio files found.");
  }
}
