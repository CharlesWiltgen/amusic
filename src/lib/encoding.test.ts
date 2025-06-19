// encoding.test.ts
import { assertEquals, assertRejects } from "jsr:@std/assert";
import {
  encodeToM4A,
  generateOutputPath,
  isLosslessFormat,
} from "./encoding.ts";

Deno.test("isLosslessFormat - correctly identifies lossless formats", async () => {
  assertEquals(await isLosslessFormat("/path/to/file.wav"), true);
  assertEquals(await isLosslessFormat("/path/to/file.flac"), true);
  assertEquals(await isLosslessFormat("/path/to/file.WAV"), true);
  assertEquals(await isLosslessFormat("/path/to/file.FLAC"), true);
  // Note: m4a/M4A removed from this test as they need actual file inspection
});

Deno.test("isLosslessFormat - correctly identifies lossy formats", async () => {
  assertEquals(await isLosslessFormat("/path/to/file.mp3"), false);
  assertEquals(await isLosslessFormat("/path/to/file.ogg"), false);
  assertEquals(await isLosslessFormat("/path/to/file.MP3"), false);
  assertEquals(await isLosslessFormat("/path/to/file.OGG"), false);
  // M4A files will return false if they can't be read (non-existent test paths)
  assertEquals(await isLosslessFormat("/path/to/file.m4a"), false);
  assertEquals(await isLosslessFormat("/path/to/file.mp4"), false);
});

Deno.test("generateOutputPath - generates correct output paths", () => {
  assertEquals(
    generateOutputPath("/path/to/file.wav"),
    "/path/to/file.m4a",
  );

  assertEquals(
    generateOutputPath("/path/to/file.flac", "/output/dir"),
    "/output/dir/file.m4a",
  );

  assertEquals(
    generateOutputPath("/some/deep/path/song.mp3", "/custom/output"),
    "/custom/output/song.m4a",
  );
});

Deno.test("generateOutputPath - preserves structure when enabled", () => {
  // When preserving structure with a directory base
  assertEquals(
    generateOutputPath(
      "/music/artist/album/song.wav",
      "/output",
      true,
      "/music",
    ),
    "/output/artist/album/song.m4a",
  );

  // When preserving structure with a file base (no subdirs to preserve)
  assertEquals(
    generateOutputPath("/music/song.wav", "/output", true, "/music/song.wav"),
    "/output/song.m4a",
  );

  // When not preserving structure (flatten)
  assertEquals(
    generateOutputPath(
      "/music/artist/album/song.wav",
      "/output",
      false,
      "/music",
    ),
    "/output/song.m4a",
  );
});

Deno.test("encodeToM4A - rejects lossy formats without force flag", async () => {
  await assertRejects(
    async () => {
      await encodeToM4A("/path/to/file.mp3", "/output/file.m4a");
    },
    Error,
    'Cannot encode from lossy format "mp3". Use --force-lossy-transcodes to override.',
  );

  await assertRejects(
    async () => {
      await encodeToM4A("/path/to/file.ogg", "/output/file.m4a");
    },
    Error,
    'Cannot encode from lossy format "ogg". Use --force-lossy-transcodes to override.',
  );
});

Deno.test("encodeToM4A - rejects unsupported formats", async () => {
  await assertRejects(
    async () => {
      await encodeToM4A("/path/to/file.txt", "/output/file.m4a");
    },
    Error,
    "Unsupported input format: txt",
  );
});

Deno.test("encodeToM4A - dry run logs but doesn't execute", async () => {
  const originalLog = console.log;
  let logOutput = "";
  console.log = (msg: string) => {
    logOutput += msg + "\n";
  };

  try {
    await encodeToM4A("/path/to/file.wav", "/output/file.m4a", {
      dryRun: true,
    });
    assertEquals(
      logOutput.trim(),
      "[DRY RUN] Would encode: /path/to/file.wav -> /output/file.m4a",
    );
  } finally {
    console.log = originalLog;
  }
});
