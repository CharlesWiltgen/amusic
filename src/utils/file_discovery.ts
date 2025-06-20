import { extname, join } from "jsr:@std/path";

export const SUPPORTED_EXTENSIONS = [
  "mp3",
  "flac",
  "ogg",
  "m4a",
  "wav",
];

export async function collectAudioFiles(paths: string[]): Promise<string[]> {
  const filesToProcess: string[] = [];

  for (const fileOrDir of paths) {
    try {
      const info = await Deno.stat(fileOrDir);
      if (info.isDirectory) {
        const files = await collectAudioFilesFromDirectory(fileOrDir);
        filesToProcess.push(...files);
      } else if (info.isFile) {
        const ext = extname(fileOrDir).toLowerCase().slice(1);
        if (SUPPORTED_EXTENSIONS.includes(ext)) {
          filesToProcess.push(fileOrDir);
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

  return filesToProcess;
}

async function collectAudioFilesFromDirectory(dir: string): Promise<string[]> {
  const files: string[] = [];

  for await (const entry of Deno.readDir(dir)) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory) {
      const subFiles = await collectAudioFilesFromDirectory(fullPath);
      files.push(...subFiles);
    } else if (entry.isFile) {
      const ext = extname(entry.name).toLowerCase().slice(1);
      if (SUPPORTED_EXTENSIONS.includes(ext)) {
        files.push(fullPath);
      }
    }
  }

  return files;
}
