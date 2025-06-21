import { extname, join } from "jsr:@std/path";

export const SUPPORTED_EXTENSIONS = [
  "mp3",
  "flac",
  "ogg",
  "m4a",
  "wav",
];

export async function collectAudioFiles(
  paths: string[],
  onProgress?: (count: number) => void,
): Promise<string[]> {
  const filesToProcess: string[] = [];

  for (const fileOrDir of paths) {
    try {
      const info = await Deno.stat(fileOrDir);
      if (info.isDirectory) {
        const files = await collectAudioFilesFromDirectory(
          fileOrDir,
          (count) => {
            if (onProgress) onProgress(filesToProcess.length + count);
          },
        );
        filesToProcess.push(...files);
      } else if (info.isFile) {
        const ext = extname(fileOrDir).toLowerCase().slice(1);
        if (SUPPORTED_EXTENSIONS.includes(ext)) {
          filesToProcess.push(fileOrDir);
          if (onProgress) onProgress(filesToProcess.length);
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

  return filesToProcess.sort();
}

async function collectAudioFilesFromDirectory(
  dir: string,
  onProgress?: (count: number) => void,
): Promise<string[]> {
  const files: string[] = [];

  for await (const entry of Deno.readDir(dir)) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory) {
      const subFiles = await collectAudioFilesFromDirectory(
        fullPath,
        (count) => {
          if (onProgress) onProgress(files.length + count);
        },
      );
      files.push(...subFiles);
    } else if (entry.isFile) {
      const ext = extname(entry.name).toLowerCase().slice(1);
      if (SUPPORTED_EXTENSIONS.includes(ext)) {
        files.push(fullPath);
        if (onProgress) onProgress(files.length);
      }
    }
  }

  return files;
}
