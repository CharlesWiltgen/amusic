import { assertEquals } from "jsr:@std/assert";
import { processCommand } from "./process.ts";
import { join } from "jsr:@std/path";

// Create a test directory structure
async function createTestLibrary(baseDir: string) {
  // Create artist/album structure
  await Deno.mkdir(join(baseDir, "Prince/Purple Rain"), { recursive: true });
  await Deno.mkdir(join(baseDir, "Prince/1999"), { recursive: true });
  await Deno.mkdir(join(baseDir, "Madonna/Like a Virgin"), { recursive: true });
  await Deno.mkdir(join(baseDir, "Singles"), { recursive: true });

  // Add audio files
  await Deno.writeTextFile(join(baseDir, "Prince/Purple Rain/track1.mp3"), "");
  await Deno.writeTextFile(join(baseDir, "Prince/Purple Rain/track2.mp3"), "");
  await Deno.writeTextFile(join(baseDir, "Prince/1999/track1.mp3"), "");
  await Deno.writeTextFile(
    join(baseDir, "Madonna/Like a Virgin/track1.mp3"),
    "",
  );
  await Deno.writeTextFile(join(baseDir, "Singles/single1.mp3"), "");
  await Deno.writeTextFile(join(baseDir, "Singles/single2.mp3"), "");
}

Deno.test("processCommand - requires at least one operation", async () => {
  const tempDir = await Deno.makeTempDir();
  try {
    let errorMessage = "";
    const originalError = console.error;
    console.error = (msg: string) => {
      errorMessage = msg;
    };

    await processCommand({ quiet: true }, tempDir);

    console.error = originalError;

    assertEquals(errorMessage.includes("No operations specified"), true);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("processCommand - processes folders as albums by default", async () => {
  const tempDir = await Deno.makeTempDir();
  try {
    await createTestLibrary(tempDir);

    let albumCount = 0;
    let singlesCount = 0;
    const originalLog = console.log;
    console.log = (msg: string) => {
      if (msg.includes("Found") && msg.includes("albums")) {
        const match = msg.match(/Found (\d+) albums/);
        if (match) albumCount = parseInt(match[1]);
      }
      if (msg.includes("Found") && msg.includes("singles")) {
        const match = msg.match(/(\d+) singles/);
        if (match) singlesCount = parseInt(match[1]);
      }
    };

    await processCommand({
      encode: true,
      dryRun: true,
      quiet: false,
    }, tempDir);

    console.log = originalLog;

    // Should find 4 albums (Purple Rain, 1999, Like a Virgin, Singles)
    assertEquals(albumCount, 4);
    assertEquals(singlesCount, 0);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("processCommand - respects singles flag", async () => {
  const tempDir = await Deno.makeTempDir();
  try {
    await createTestLibrary(tempDir);

    let albumCount = 0;
    let singlesCount = 0;
    const originalLog = console.log;
    console.log = (msg: string) => {
      if (msg.includes("Found") && msg.includes("albums")) {
        const match = msg.match(/Found (\d+) albums/);
        if (match) albumCount = parseInt(match[1]);
      }
      if (msg.includes("Found") && msg.includes("singles")) {
        const match = msg.match(/(\d+) singles/);
        if (match) singlesCount = parseInt(match[1]);
      }
    };

    await processCommand({
      encode: true,
      singles: ["Singles"],
      dryRun: true,
      quiet: false,
    }, tempDir);

    console.log = originalLog;

    // Should find 3 albums (excluding Singles folder)
    assertEquals(albumCount, 3);
    assertEquals(singlesCount, 2);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("processCommand - processes multiple paths", async () => {
  const tempDir = await Deno.makeTempDir();
  try {
    await createTestLibrary(tempDir);
    const singleFile = join(tempDir, "standalone.mp3");
    await Deno.writeTextFile(singleFile, "");

    let albumCount = 0;
    let singlesCount = 0;
    const originalLog = console.log;
    console.log = (msg: string) => {
      if (msg.includes("Found") && msg.includes("albums")) {
        const match = msg.match(/Found (\d+) albums/);
        if (match) albumCount = parseInt(match[1]);
      }
      if (msg.includes("Found") && msg.includes("singles")) {
        const match = msg.match(/(\d+) singles/);
        if (match) singlesCount = parseInt(match[1]);
      }
    };

    await processCommand(
      {
        encode: true,
        singles: ["Singles"],
        dryRun: true,
        quiet: false,
      },
      join(tempDir, "Prince"),
      join(tempDir, "Madonna"),
      join(tempDir, "Singles"),
      singleFile,
    );

    console.log = originalLog;

    // Should find 3 albums (Purple Rain, 1999, Like a Virgin)
    // Singles: 2 from Singles folder + 1 standalone file
    assertEquals(albumCount, 3);
    assertEquals(singlesCount, 3);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("processCommand - shows progress during processing", async () => {
  const tempDir = await Deno.makeTempDir();
  try {
    await Deno.mkdir(join(tempDir, "Album"));
    await Deno.writeTextFile(join(tempDir, "Album/track1.mp3"), "");
    await Deno.writeTextFile(join(tempDir, "Album/track2.mp3"), "");

    let progressShown = false;
    const writes: string[] = [];
    const originalWrite = Deno.stdout.writeSync;
    Deno.stdout.writeSync = (data: Uint8Array) => {
      const text = new TextDecoder().decode(data);
      writes.push(text);
      if (text.includes("Progress:")) {
        progressShown = true;
      }
      return data.length;
    };

    await processCommand({
      acoustID: true,
      apiKey: "test_key",
      dryRun: true,
      quiet: false,
    }, tempDir);

    Deno.stdout.writeSync = originalWrite;

    assertEquals(progressShown, true);

    // Should hide and show cursor
    const hasHideCursor = writes.some((w) => w.includes("\x1b[?25l"));
    const hasShowCursor = writes.some((w) => w.includes("\x1b[?25h"));
    assertEquals(hasHideCursor, true);
    assertEquals(hasShowCursor, true);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("processCommand - handles empty directories gracefully", async () => {
  const tempDir = await Deno.makeTempDir();
  try {
    await Deno.mkdir(join(tempDir, "EmptyAlbum"));
    await Deno.mkdir(join(tempDir, "EmptyArtist/EmptyAlbum"), {
      recursive: true,
    });

    let albumCount = 0;
    const originalLog = console.log;
    console.log = (msg: string) => {
      if (msg.includes("Found") && msg.includes("albums")) {
        const match = msg.match(/Found (\d+) albums/);
        if (match) albumCount = parseInt(match[1]);
      }
    };

    await processCommand({
      encode: true,
      dryRun: true,
      quiet: false,
    }, tempDir);

    console.log = originalLog;

    // Should find 0 albums
    assertEquals(albumCount, 0);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});
