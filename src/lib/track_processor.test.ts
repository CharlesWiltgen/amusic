import { assertEquals, assertExists } from "jsr:@std/assert";
import {
  batchProcessTracks,
  processAlbum,
  processTrack,
  TrackProcessorPool,
} from "./track_processor.ts";
import { join } from "jsr:@std/path";

// Mock the external dependencies
const originalCommand = Deno.Command;
const mockCommands: Map<
  string,
  () => { success: boolean; stdout: Uint8Array; stderr: Uint8Array }
> = new Map();

function setupMocks() {
  // @ts-ignore: Mocking Deno.Command
  Deno.Command = class MockCommand {
    constructor(public cmd: string, public options?: unknown) {}

    output() {
      const handler = mockCommands.get(this.cmd);
      if (handler) {
        return Promise.resolve(handler());
      }
      return Promise.resolve({
        success: false,
        stdout: new Uint8Array(),
        stderr: new TextEncoder().encode("Command not found"),
      });
    }
  };
}

function restoreMocks() {
  Deno.Command = originalCommand;
  mockCommands.clear();
}

Deno.test("processTrack - handles encoding only", async () => {
  const tempDir = await Deno.makeTempDir();
  try {
    const inputFile = join(tempDir, "test.wav");
    await Deno.writeTextFile(inputFile, "fake audio data");

    const result = await processTrack(inputFile, {
      encode: true,
      dryRun: true, // Use dry run to avoid actual encoding
      quiet: true,
    });

    assertEquals(result.inputPath, inputFile);
    assertEquals(result.outputPath, join(tempDir, "test.m4a"));
    assertEquals(result.encoded, true); // Dry run still sets the encoded flag
    assertEquals(result.encodingError, undefined);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("processTrack - handles lossy format rejection", async () => {
  const tempDir = await Deno.makeTempDir();
  try {
    const inputFile = join(tempDir, "test.mp3");
    await Deno.writeTextFile(inputFile, "fake mp3 data");

    const result = await processTrack(inputFile, {
      encode: true,
      forceLossyTranscodes: false,
      quiet: true,
    });

    assertEquals(result.inputPath, inputFile);
    assertEquals(
      result.encodingError,
      "Cannot encode from lossy format without --force-lossy-transcodes",
    );
    assertEquals(result.encoded, undefined);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test.ignore("processTrack - handles AcoustID processing", async () => {
  setupMocks();

  const tempDir = await Deno.makeTempDir();
  try {
    const inputFile = join(tempDir, "test.mp3");
    await Deno.writeTextFile(inputFile, "fake audio data");

    // Mock fpcalc - need to use the full path that getVendorBinaryPath returns
    const fpcalcPath = Deno.build.os === "darwin"
      ? join(Deno.cwd(), "src/vendor/macos-" + Deno.build.arch + "/fpcalc")
      : join(
        Deno.cwd(),
        "src/vendor/" + Deno.build.os + "-" + Deno.build.arch + "/fpcalc",
      );

    mockCommands.set(fpcalcPath, () => ({
      success: true,
      stdout: new TextEncoder().encode(JSON.stringify({
        fingerprint: "test_fingerprint_123",
        duration: 180,
      })),
      stderr: new Uint8Array(),
    }));

    const result = await processTrack(inputFile, {
      processAcoustID: true,
      acoustIDApiKey: "test_key",
      dryRun: true, // Use dry run to avoid actual tag writing
      quiet: true,
    });

    assertEquals(result.inputPath, inputFile);
    assertEquals(result.acoustIDStatus, "processed");
    assertEquals(result.acoustIDError, undefined);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
    restoreMocks();
  }
});

Deno.test("processTrack - handles multiple operations", async () => {
  const tempDir = await Deno.makeTempDir();
  try {
    const inputFile = join(tempDir, "test.wav");
    await Deno.writeTextFile(inputFile, "fake audio data");

    const result = await processTrack(inputFile, {
      encode: true,
      calculateGain: true,
      albumGainData: new Map([[inputFile, { albumGain: 0.5, albumPeak: 0.9 }]]),
      processAcoustID: false, // Skip AcoustID to avoid mocking
      dryRun: true,
      quiet: true,
    });

    assertEquals(result.inputPath, inputFile);
    assertEquals(result.outputPath, join(tempDir, "test.m4a"));
    assertEquals(result.replayGainApplied, true);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("batchProcessTracks - processes multiple files in parallel", async () => {
  const tempDir = await Deno.makeTempDir();
  try {
    const files = [];
    for (let i = 0; i < 5; i++) {
      const file = join(tempDir, `track${i}.wav`);
      await Deno.writeTextFile(file, "fake audio");
      files.push(file);
    }

    let progressCalls = 0;
    const results = await batchProcessTracks(files, {
      encode: true,
      dryRun: true,
      quiet: true,
      concurrency: 2,
      onProgress: () => {
        progressCalls++;
      },
    });

    assertEquals(results.length, 5);
    assertEquals(progressCalls, 5);

    // All files should have output paths
    for (let i = 0; i < 5; i++) {
      assertEquals(results[i].inputPath, files[i]);
      assertExists(results[i].outputPath);
    }
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("processAlbum - calculates ReplayGain for album", async () => {
  setupMocks();

  const tempDir = await Deno.makeTempDir();
  try {
    const albumDir = join(tempDir, "Album");
    await Deno.mkdir(albumDir);

    const files = [];
    for (let i = 0; i < 3; i++) {
      const file = join(albumDir, `track${i}.mp3`);
      await Deno.writeTextFile(file, "fake audio");
      files.push(file);
    }

    // Mock rsgain - need to use the full path
    const rsgainPath = Deno.build.os === "darwin"
      ? join(Deno.cwd(), "src/vendor/macos-" + Deno.build.arch + "/rsgain")
      : join(
        Deno.cwd(),
        "src/vendor/" + Deno.build.os + "-" + Deno.build.arch + "/rsgain",
      );

    mockCommands.set(rsgainPath, () => ({
      success: true,
      stdout: new Uint8Array(),
      stderr: new Uint8Array(),
    }));

    const results = await processAlbum(albumDir, files, {
      calculateGain: true,
      processAcoustID: false,
      dryRun: true,
      quiet: true,
    });

    assertEquals(results.length, 3);

    // Each result should have the album path
    for (const result of results) {
      assertEquals(files.includes(result.inputPath), true);
    }
  } finally {
    await Deno.remove(tempDir, { recursive: true });
    restoreMocks();
  }
});

Deno.test("TrackProcessorPool - manages concurrent processing", async () => {
  const pool = new TrackProcessorPool(2); // Max 2 concurrent workers

  const tempDir = await Deno.makeTempDir();
  try {
    const files = [];
    for (let i = 0; i < 4; i++) {
      const file = join(tempDir, `track${i}.wav`);
      await Deno.writeTextFile(file, "fake audio");
      files.push(file);
    }

    // Process files through the pool
    const promises = files.map((file) =>
      pool.processTrack(file, {
        encode: true,
        dryRun: true,
        quiet: true,
      })
    );

    // Check pool status during processing
    const status = pool.getStatus();
    assertEquals(status.activeWorkers <= 2, true);
    assertEquals(status.queuedTasks >= 0, true);
    assertEquals(status.isShuttingDown, false);

    const results = await Promise.all(promises);
    assertEquals(results.length, 4);

    await pool.shutdown();

    // Check pool status after shutdown
    const shutdownStatus = pool.getStatus();
    assertEquals(shutdownStatus.activeWorkers, 0);
    assertEquals(shutdownStatus.isShuttingDown, true);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("TrackProcessorPool - rejects tasks after shutdown", async () => {
  const pool = new TrackProcessorPool(1);
  await pool.shutdown();

  try {
    await pool.processTrack("test.mp3", { quiet: true });
    throw new Error("Should have thrown error");
  } catch (error) {
    assertEquals((error as Error).message, "Processor pool is shutting down");
  }
});

Deno.test("processTrack - preserves directory structure in output", async () => {
  const tempDir = await Deno.makeTempDir();
  try {
    const inputFile = join(tempDir, "Artist/Album/track.wav");
    await Deno.mkdir(join(tempDir, "Artist/Album"), { recursive: true });
    await Deno.writeTextFile(inputFile, "fake audio");

    const outputDir = join(tempDir, "output");

    const result = await processTrack(inputFile, {
      encode: true,
      outputDirectory: outputDir,
      preserveStructure: true,
      basePath: tempDir,
      dryRun: true,
      quiet: true,
    });

    assertEquals(result.outputPath, join(outputDir, "Artist/Album/track.m4a"));
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});
