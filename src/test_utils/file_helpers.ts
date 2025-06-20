// File system helpers for tests
import { join, resolve } from "jsr:@std/path";
import { copy, ensureDir, exists } from "jsr:@std/fs";

const TEST_RUN_BASE_DIR = resolve("./tests/test_run_files");

/**
 * Creates a unique temporary directory for each test run
 */
export async function createTestRunDir(testName: string): Promise<string> {
  const dirPath = join(TEST_RUN_BASE_DIR, testName);
  await ensureDir(dirPath);
  return dirPath;
}

/**
 * Copies sample files to the temporary test run directory
 */
export async function setupTestFiles(
  testRunDir: string,
  fileNames: string[],
  sourceDir: string = resolve("sample_audio_files"),
): Promise<string[]> {
  const copiedFilePaths: string[] = [];
  for (const fileName of fileNames) {
    const sourcePath = join(sourceDir, fileName);
    const destPath = join(testRunDir, fileName);
    if (!await exists(sourcePath, { isFile: true })) {
      throw new Error(
        `Source sample file not found: ${sourcePath}. Ensure sample files are present.`,
      );
    }
    await copy(sourcePath, destPath, { overwrite: true });
    copiedFilePaths.push(destPath);
  }
  return copiedFilePaths;
}

/**
 * Cleans up the temporary test run directory
 */
export async function cleanupTestDir(testRunDir: string): Promise<void> {
  if (await exists(testRunDir, { isDirectory: true })) {
    await Deno.remove(testRunDir, { recursive: true });
  }
}

/**
 * Creates a short silent audio file using ffmpeg (for test purposes)
 */
export async function createSilentAudioFile(
  filePath: string,
  duration: string = "0.02",
): Promise<void> {
  const cmd = new Deno.Command("ffmpeg", {
    args: [
      "-f",
      "lavfi",
      "-i",
      `anullsrc=r=44100:cl=mono:d=${duration}`,
      "-loglevel",
      "quiet",
      "-y",
      filePath,
    ],
  });
  const { code, stderr } = await cmd.output();
  if (code !== 0) {
    throw new Error(
      `ffmpeg failed to create silent audio file ${filePath}: ${
        new TextDecoder().decode(stderr)
      }`,
    );
  }
}
