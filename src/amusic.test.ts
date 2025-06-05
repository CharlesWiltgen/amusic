import {
  assert,
  assertEquals,
  assertExists,
  assertNotEquals,
  assertStringIncludes,
} from "std/assert/mod.ts";
import { basename, dirname, join, resolve } from "std/path/mod.ts";
import { copy, ensureDir, exists } from "std/fs/mod.ts";

const AMUSIC_SCRIPT_PATH = "./amusic.ts"; // Relative to repo root

const ORIGINAL_SAMPLE_FILES_DIR = resolve("sample_audio_files"); // Absolute path
const TEST_RUN_BASE_DIR = resolve("./test_run_files"); // Base for temp test files

// Selected sample files for testing
const SAMPLE_MP3 = "mp3_sample_512kb.mp3";
const SAMPLE_FLAC = "flac_sample_3mb.flac";
const SAMPLE_OGG = "ogg_sample_512kb.ogg"; // For variety

interface AmusicRunResult {
  code: number;
  stdout: string;
  stderr: string;
}

// Helper to create a unique temporary directory for each test run
async function createTestRunDir(testName: string): Promise<string> {
  const dirPath = join(TEST_RUN_BASE_DIR, testName);
  await ensureDir(dirPath);
  return dirPath;
}

// Helper to copy sample files to the temporary test run directory
async function setupTestFiles(
  testRunDir: string,
  fileNames: string[],
): Promise<string[]> {
  const copiedFilePaths: string[] = [];
  for (const fileName of fileNames) {
    const sourcePath = join(ORIGINAL_SAMPLE_FILES_DIR, fileName);
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

// Helper to clean up the temporary test run directory
async function cleanupTestDir(testRunDir: string): Promise<void> {
  if (await exists(testRunDir, { isDirectory: true })) {
    await Deno.remove(testRunDir, { recursive: true });
  }
}

// Helper to run the amusic.ts script
async function runAmusicScript(
  args: string[],
  cwd: string,
): Promise<AmusicRunResult> {
  const scriptPath = resolve(AMUSIC_SCRIPT_PATH); // Ensure absolute path to script
  const command = new Deno.Command(Deno.execPath(), {
    args: [
      "run",
      "--allow-read", // For reading audio files, script itself
      "--allow-write", // For writing tags, creating temp files by ffmpeg/fpcalc
      "--allow-run", // For fpcalc, ffmpeg, ffprobe
      "--allow-env", // For Deno.makeTempDir, and potentially other env vars
      scriptPath,
      ...args,
    ],
    cwd: cwd, // Critical: run the script from the directory containing the files
    stdout: "piped",
    stderr: "piped",
  });
  const { code, stdout, stderr } = await command.output();
  return {
    code,
    stdout: new TextDecoder().decode(stdout),
    stderr: new TextDecoder().decode(stderr),
  };
}

// Helper to get a specific metadata tag using ffprobe
async function getSpecificTag(
  filePath: string,
  tagName: string,
): Promise<string | null> {
  const command = new Deno.Command("ffprobe", {
    args: [
      "-v",
      "quiet",
      "-show_entries",
      `format_tags=${tagName}`,
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filePath,
    ],
    stdout: "piped",
    stderr: "piped",
  });
  const { code, stdout, stderr } = await command.output();

  if (code !== 0) {
    const errorOutput = new TextDecoder().decode(stderr).trim();
    if (
      errorOutput && !errorOutput.includes("does not contain any stream") &&
      !errorOutput.includes(filePath)
    ) {
      console.warn(
        `  ffprobe warning for ${filePath} checking tag ${tagName}: ${
          errorOutput.split("\n")[0]
        }`,
      );
    }
    return null;
  }
  const outputText = new TextDecoder().decode(stdout).trim();
  return outputText.length > 0 ? outputText : null;
}

const getAcousticIDFingerprintTag = (filePath: string) =>
  getSpecificTag(filePath, "ACOUSTID_FINGERPRINT");

// --- Test Suite ---
Deno.test("amusic.ts Integration Tests (Actual Audio Files)", async (t) => {
  let currentTestDir: string;

  await t.step("Basic Fingerprinting: Process a clean MP3 file", async () => {
    currentTestDir = await createTestRunDir("basic_fingerprinting_mp3");
    const [mp3ToTest] = await setupTestFiles(currentTestDir, [SAMPLE_MP3]);
    const mp3BaseName = basename(mp3ToTest);

    // 1. Ensure file initially has no fingerprint (or handle if it might)
    const initialTag = await getAcousticIDFingerprintTag(mp3ToTest);
    if (initialTag) {
      console.warn(
        `  Warning: Sample file ${mp3BaseName} already had an ACOUSTID_FINGERPRINT. Test will proceed assuming overwrite is fine.`,
      );
    }

    // 2. Run amusic.ts on the file
    // Pass only the basename as CWD is currentTestDir
    const result = await runAmusicScript([mp3BaseName], currentTestDir);

    // 3. Assertions
    assertEquals(
      result.code,
      0,
      "Script should exit successfully after processing.",
    );
    assertStringIncludes(result.stdout, `Processing file: ${mp3BaseName}`);
    assertStringIncludes(
      result.stdout,
      "ACTION: Generating AcoustID fingerprint...",
    );
    assertStringIncludes(
      result.stdout,
      "SUCCESS: AcoustID fingerprint tag processed.",
    );

    const finalTag = await getAcousticIDFingerprintTag(mp3ToTest);
    assertExists(
      finalTag,
      "ACOUSTID_FINGERPRINT tag should be present after processing.",
    );
    if (initialTag) {
      assertNotEquals(
        finalTag,
        initialTag,
        "If an initial tag existed, the new tag should be different (or fpcalc is very stable). This is a soft check.",
      );
    }

    await cleanupTestDir(currentTestDir);
  });

  await t.step("Skip Existing Fingerprint (No --force): MP3 file", async () => {
    currentTestDir = await createTestRunDir("skip_existing_mp3");
    const [mp3ToTest] = await setupTestFiles(currentTestDir, [SAMPLE_MP3]);
    const mp3BaseName = basename(mp3ToTest);

    // 1. Add an initial fingerprint
    let runResult = await runAmusicScript([mp3BaseName], currentTestDir);
    assertEquals(runResult.code, 0, "Initial processing failed.");
    const firstFingerprint = await getAcousticIDFingerprintTag(mp3ToTest);
    assertExists(
      firstFingerprint,
      "Fingerprint not added after initial processing.",
    );

    // 2. Run amusic.ts again without --force
    runResult = await runAmusicScript([mp3BaseName], currentTestDir);

    // 3. Assertions
    assertEquals(
      runResult.code,
      0,
      "Script should exit successfully when skipping.",
    );
    assertStringIncludes(runResult.stdout, `Processing file: ${mp3BaseName}`);
    assertStringIncludes(
      runResult.stdout,
      "INFO: File already has AcoustID tags. Skipping (use --force to overwrite).",
    );

    const secondFingerprint = await getAcousticIDFingerprintTag(mp3ToTest);
    assertEquals(
      secondFingerprint,
      firstFingerprint,
      "Fingerprint should remain unchanged after skipping.",
    );

    await cleanupTestDir(currentTestDir);
  });

  await t.step(
    "Force Overwrite Existing Fingerprint (--force): FLAC file",
    async () => {
      currentTestDir = await createTestRunDir("force_overwrite_flac");
      const [flacToTest] = await setupTestFiles(currentTestDir, [SAMPLE_FLAC]);
      const flacBaseName = basename(flacToTest);

      // 1. Add an initial fingerprint
      let runResult = await runAmusicScript([flacBaseName], currentTestDir);
      assertEquals(
        runResult.code,
        0,
        "Initial processing for force test failed.",
      );
      const firstFingerprint = await getAcousticIDFingerprintTag(flacToTest);
      assertExists(
        firstFingerprint,
        "Fingerprint not added after initial processing for force test.",
      );

      // 2. Run amusic.ts again with --force
      // Note: fpcalc should ideally generate the same fingerprint for the same file.
      // If it does, this test won't strictly prove an "overwrite" vs. "idempotent operation".
      // However, it proves the "--force" path is taken.
      runResult = await runAmusicScript(
        ["--force", flacBaseName],
        currentTestDir,
      );

      // 3. Assertions
      assertEquals(
        runResult.code,
        0,
        "Script should exit successfully during force overwrite.",
      );
      assertStringIncludes(
        runResult.stdout,
        `Processing file: ${flacBaseName}`,
      );
      assertStringIncludes(
        runResult.stdout,
        "INFO: File already has AcoustID tags. --force option provided, proceeding to overwrite.",
      );
      assertStringIncludes(
        runResult.stdout,
        "ACTION: Generating AcoustID fingerprint...",
      );
      assertStringIncludes(
        runResult.stdout,
        "SUCCESS: AcoustID fingerprint tag processed.",
      );

      const secondFingerprint = await getAcousticIDFingerprintTag(flacToTest);
      assertExists(
        secondFingerprint,
        "Fingerprint should exist after force overwrite.",
      );
      // For a deterministic fpcalc, the fingerprint should be the same.
      // If fpcalc can have slight variations (e.g. due to different fpcalc versions or subtle env changes),
      // this might occasionally fail. For now, assume deterministic.
      assertEquals(
        secondFingerprint,
        firstFingerprint,
        "Fingerprint should ideally be the same if fpcalc is deterministic.",
      );

      await cleanupTestDir(currentTestDir);
    },
  );

  await t.step("File Not Found", async () => {
    currentTestDir = await createTestRunDir("file_not_found");
    const nonExistentFileName = "non_existent_file.mp3";

    // Run amusic.ts, expecting it to handle the non-existent file path
    // CWD is currentTestDir, so nonExistentFileName is relative to it.
    const result = await runAmusicScript([nonExistentFileName], currentTestDir);

    // Assertions
    // The script currently logs an error per file and doesn't set a non-zero exit code overall
    // if other files (if any) were processed successfully.
    // For a single non-existent file, the behavior of amusic.ts might be to still exit 0.
    // We primarily care that the error is logged.
    assertStringIncludes(
      result.stdout,
      `Error: File not found at "${nonExistentFileName}".`,
    );
    // if (result.code === 0) {
    //   console.warn("  NOTE: amusic.ts exited with code 0 even for a single non-existent file.");
    // }

    await cleanupTestDir(currentTestDir);
  });

  await t.step(
    "Processing Multiple Files (MP3 clean, FLAC pre-tagged)",
    async () => {
      currentTestDir = await createTestRunDir("multiple_files");
      const [mp3File, flacFile] = await setupTestFiles(currentTestDir, [
        SAMPLE_MP3,
        SAMPLE_FLAC,
      ]);
      const mp3BaseName = basename(mp3File);
      const flacBaseName = basename(flacFile);

      // 1. Pre-tag the FLAC file
      let flacResult = await runAmusicScript([flacBaseName], currentTestDir);
      assertEquals(
        flacResult.code,
        0,
        "Initial processing of FLAC file failed.",
      );
      const flacInitialTag = await getAcousticIDFingerprintTag(flacFile);
      assertExists(flacInitialTag, "FLAC initial tag not added.");

      // 2. Ensure MP3 file is clean (it should be as it's a fresh copy)
      const mp3InitialTag = await getAcousticIDFingerprintTag(mp3File);
      if (mp3InitialTag) {
        // This case should ideally not happen with clean copies.
        // If it does, we might need to clean it manually or fail.
        throw new Error(
          `Test setup error: MP3 file ${mp3BaseName} was not clean before multiple file test.`,
        );
      }

      // 3. Run amusic.ts on both files
      const mainResult = await runAmusicScript(
        [mp3BaseName, flacBaseName],
        currentTestDir,
      );
      assertEquals(
        mainResult.code,
        0,
        "Main script run for multiple files failed.",
      );

      // 4. Assertions for MP3 (should be processed)
      assertStringIncludes(
        mainResult.stdout,
        `Processing file: ${mp3BaseName}`,
      );
      assertStringIncludes(
        mainResult.stdout,
        `SUCCESS: AcoustID fingerprint tag processed.`,
      );
      const mp3FinalTag = await getAcousticIDFingerprintTag(mp3File);
      assertExists(
        mp3FinalTag,
        "MP3 file should have a fingerprint after multi-file run.",
      );

      // 5. Assertions for FLAC (should be skipped)
      assertStringIncludes(
        mainResult.stdout,
        `Processing file: ${flacBaseName}`,
      );
      assertStringIncludes(
        mainResult.stdout,
        `INFO: File already has AcoustID tags. Skipping (use --force to overwrite).`,
      );
      const flacFinalTag = await getAcousticIDFingerprintTag(flacFile);
      assertEquals(
        flacFinalTag,
        flacInitialTag,
        "FLAC file's fingerprint should be unchanged.",
      );

      await cleanupTestDir(currentTestDir);
    },
  );

  // Final cleanup of the base test_run_files directory if it's empty or for overall cleanup
  // This is more of a global cleanup. Individual test steps clean their own subdirs.
  // Deno.test should ideally run in isolation, but just in case.
  // await Deno.remove(TEST_RUN_BASE_DIR, { recursive: true }).catch(() => {});
});
