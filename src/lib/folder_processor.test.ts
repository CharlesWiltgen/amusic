import { assertEquals } from "jsr:@std/assert";
import {
  analyzeFolderStructure,
  getAlbumDisplayName,
} from "./folder_processor.ts";
import { join } from "jsr:@std/path";

// Helper to create test directory structure
async function createTestStructure(baseDir: string) {
  // Create artist/album structure
  await Deno.mkdir(join(baseDir, "Artist1/Album1"), { recursive: true });
  await Deno.mkdir(join(baseDir, "Artist1/Album2"), { recursive: true });
  await Deno.mkdir(join(baseDir, "Artist2/Album1"), { recursive: true });
  await Deno.mkdir(join(baseDir, "Singles"), { recursive: true });
  await Deno.mkdir(join(baseDir, "Compilations/Various"), { recursive: true });

  // Create some audio files
  await Deno.writeTextFile(join(baseDir, "Artist1/Album1/track1.mp3"), "");
  await Deno.writeTextFile(join(baseDir, "Artist1/Album1/track2.flac"), "");
  await Deno.writeTextFile(join(baseDir, "Artist1/Album2/track1.m4a"), "");
  await Deno.writeTextFile(join(baseDir, "Artist2/Album1/track1.ogg"), "");
  await Deno.writeTextFile(join(baseDir, "Artist2/Album1/track2.wav"), "");
  await Deno.writeTextFile(join(baseDir, "Singles/single1.mp3"), "");
  await Deno.writeTextFile(join(baseDir, "Singles/single2.mp3"), "");
  await Deno.writeTextFile(join(baseDir, "Compilations/Various/comp1.mp3"), "");

  // Add some stray files in parent folders
  await Deno.writeTextFile(join(baseDir, "Artist1/stray.mp3"), "");
  await Deno.writeTextFile(join(baseDir, "root_file.mp3"), "");

  // Add non-audio files
  await Deno.writeTextFile(join(baseDir, "Artist1/Album1/cover.jpg"), "");
  await Deno.writeTextFile(join(baseDir, "readme.txt"), "");
}

Deno.test("analyzeFolderStructure - treats leaf folders as albums by default", async () => {
  const tempDir = await Deno.makeTempDir();
  try {
    await createTestStructure(tempDir);

    const result = await analyzeFolderStructure([tempDir], { quiet: true });

    // Should find 5 albums (Album1, Album2, Album1, Singles, Various)
    assertEquals(result.albums.size, 5);

    // Check specific albums
    const albumPaths = Array.from(result.albums.keys());
    assertEquals(albumPaths.includes(join(tempDir, "Artist1/Album1")), true);
    assertEquals(albumPaths.includes(join(tempDir, "Artist1/Album2")), true);
    assertEquals(albumPaths.includes(join(tempDir, "Artist2/Album1")), true);
    assertEquals(albumPaths.includes(join(tempDir, "Singles")), true);
    assertEquals(
      albumPaths.includes(join(tempDir, "Compilations/Various")),
      true,
    );

    // Check track counts
    assertEquals(result.albums.get(join(tempDir, "Artist1/Album1"))?.length, 2);
    assertEquals(result.albums.get(join(tempDir, "Artist2/Album1"))?.length, 2);
    assertEquals(result.albums.get(join(tempDir, "Singles"))?.length, 2);

    // No singles by default
    assertEquals(result.singles.length, 0);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("analyzeFolderStructure - respects singles patterns", async () => {
  const tempDir = await Deno.makeTempDir();
  try {
    await createTestStructure(tempDir);

    const result = await analyzeFolderStructure([tempDir], {
      singlesPatterns: ["Singles"],
      quiet: true,
    });

    // The pattern "Singles" matches any path containing "Singles"
    assertEquals(result.albums.size, 4); // 5 folders minus Singles folder

    // Singles should contain files from Singles folder
    assertEquals(result.singles.length, 2); // 2 files from Singles folder

    // Check that Singles is not in albums but Compilations/Various is
    const albumPaths = Array.from(result.albums.keys());
    assertEquals(albumPaths.includes(join(tempDir, "Singles")), false);
    assertEquals(
      albumPaths.includes(join(tempDir, "Compilations/Various")),
      true,
    );
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("analyzeFolderStructure - handles single files", async () => {
  const tempDir = await Deno.makeTempDir();
  try {
    const file1 = join(tempDir, "song1.mp3");
    const file2 = join(tempDir, "song2.flac");
    await Deno.writeTextFile(file1, "");
    await Deno.writeTextFile(file2, "");

    const result = await analyzeFolderStructure([file1, file2], {
      quiet: true,
    });

    // No albums when processing individual files
    assertEquals(result.albums.size, 0);

    // Both files should be singles
    assertEquals(result.singles.length, 2);
    assertEquals(result.singles.includes(file1), true);
    assertEquals(result.singles.includes(file2), true);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("analyzeFolderStructure - ignores non-audio files", async () => {
  const tempDir = await Deno.makeTempDir();
  try {
    await Deno.mkdir(join(tempDir, "Album"), { recursive: true });
    await Deno.writeTextFile(join(tempDir, "Album/track.mp3"), "");
    await Deno.writeTextFile(join(tempDir, "Album/cover.jpg"), "");
    await Deno.writeTextFile(join(tempDir, "Album/info.txt"), "");

    const result = await analyzeFolderStructure([tempDir], { quiet: true });

    // Should find one album with one track
    assertEquals(result.albums.size, 1);
    assertEquals(result.albums.get(join(tempDir, "Album"))?.length, 1);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("analyzeFolderStructure - warns about stray files in parent folders", async () => {
  const tempDir = await Deno.makeTempDir();
  try {
    await createTestStructure(tempDir);

    const warnMessages: string[] = [];
    const originalWarn = console.warn;
    console.warn = (msg: string) => {
      warnMessages.push(msg);
    };

    await analyzeFolderStructure([tempDir], { quiet: false });

    console.warn = originalWarn;

    // Should have warned about stray files in folders with subfolders
    const hasWarning = warnMessages.some((msg) =>
      msg.includes("audio files") && msg.includes("contains subfolders")
    );
    assertEquals(hasWarning, true);

    // Should mention at least one of the parent folders with stray files
    const mentionsFolder = warnMessages.some((msg) =>
      msg.includes("Artist1") || msg.includes(tempDir)
    );
    assertEquals(mentionsFolder, true);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("analyzeFolderStructure - handles empty folders", async () => {
  const tempDir = await Deno.makeTempDir();
  try {
    await Deno.mkdir(join(tempDir, "EmptyAlbum"), { recursive: true });
    await Deno.mkdir(join(tempDir, "Artist/EmptyAlbum"), { recursive: true });

    const result = await analyzeFolderStructure([tempDir], { quiet: true });

    // Empty folders should not be treated as albums
    assertEquals(result.albums.size, 0);
    assertEquals(result.singles.length, 0);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("analyzeFolderStructure - handles mixed paths", async () => {
  const tempDir = await Deno.makeTempDir();
  try {
    await Deno.mkdir(join(tempDir, "Album1"), { recursive: true });
    await Deno.mkdir(join(tempDir, "Album2"), { recursive: true });
    await Deno.writeTextFile(join(tempDir, "Album1/track.mp3"), "");
    await Deno.writeTextFile(join(tempDir, "Album2/track.mp3"), "");
    await Deno.writeTextFile(join(tempDir, "single.mp3"), "");

    // Pass multiple paths including folders and files
    const result = await analyzeFolderStructure([
      join(tempDir, "Album1"),
      join(tempDir, "Album2"),
      join(tempDir, "single.mp3"),
    ], { quiet: true });

    // Should find 2 albums and 1 single
    assertEquals(result.albums.size, 2);
    assertEquals(result.singles.length, 1);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("getAlbumDisplayName - formats album paths correctly", () => {
  // On Unix-like systems
  if (Deno.build.os !== "windows") {
    assertEquals(getAlbumDisplayName("/music/Artist/Album"), "Artist/Album");
    assertEquals(getAlbumDisplayName("/music/Album"), "music/Album");
    assertEquals(getAlbumDisplayName("/a/b/c/d/e"), "d/e");
  }

  // Platform-agnostic tests
  assertEquals(getAlbumDisplayName("Album"), "Album");
  assertEquals(getAlbumDisplayName(""), "");
});

Deno.test("analyzeFolderStructure - singles pattern matching", async () => {
  const tempDir = await Deno.makeTempDir();
  try {
    await Deno.mkdir(join(tempDir, "Music/Singles"), { recursive: true });
    await Deno.mkdir(join(tempDir, "Music/Albums/Singles Collection"), {
      recursive: true,
    });
    await Deno.mkdir(join(tempDir, "Music/Albums/Regular Album"), {
      recursive: true,
    });

    await Deno.writeTextFile(join(tempDir, "Music/Singles/track1.mp3"), "");
    await Deno.writeTextFile(
      join(tempDir, "Music/Albums/Singles Collection/track2.mp3"),
      "",
    );
    await Deno.writeTextFile(
      join(tempDir, "Music/Albums/Regular Album/track3.mp3"),
      "",
    );

    // Test with full path - will only match exact folder
    let result = await analyzeFolderStructure([join(tempDir, "Music")], {
      singlesPatterns: [join(tempDir, "Music/Singles")],
      quiet: true,
    });
    // Full path should only match the exact folder
    assertEquals(result.albums.size, 2); // Regular Album and Singles Collection
    assertEquals(result.singles.length, 1); // Only Music/Singles

    // Test pattern matching
    result = await analyzeFolderStructure([join(tempDir, "Music")], {
      singlesPatterns: ["Singles"],
      quiet: true,
    });
    assertEquals(result.albums.size, 1); // Only Regular Album
    assertEquals(result.singles.length, 2); // Both folders with "Singles" in name
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});
