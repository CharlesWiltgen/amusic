import { Table } from "jsr:@cliffy/table@1.0.0-rc.7";
import ora from "npm:ora@8.1.1";
import { dirname } from "jsr:@std/path";
import {
  formatMetadataForDisplay,
  groupFilesByAlbum,
  scanMusicDirectory,
} from "../lib/folder_operations.ts";
import type { AudioFileMetadata } from "taglib-wasm/folder";

/**
 * Display tags using the new Folder API for better performance
 */
export async function showTagsWithFolderAPI(
  filesToProcess: string[],
  quiet: boolean,
): Promise<void> {
  if (!quiet) {
    console.log("Displaying comprehensive metadata:\n");
  }

  // Extract unique directories from the file list
  const directories = new Set<string>();
  const fileSet = new Set(filesToProcess);

  for (const file of filesToProcess) {
    directories.add(dirname(file));
  }

  // Create spinner
  const spinner = ora({
    text: "Reading metadata",
    suffixText: `0/${filesToProcess.length} (0%)`,
    spinner: "dots",
  }).start();

  let processedCount = 0;
  const allFiles: AudioFileMetadata[] = [];

  // Scan each directory using Folder API
  for (const dir of directories) {
    try {
      const result = await scanMusicDirectory(dir, {
        recursive: false, // Don't recurse since we have specific files
        onProgress: (_processed, _total, currentFile) => {
          // Only count files that were in our original list
          if (fileSet.has(currentFile)) {
            processedCount++;
            const progress = Math.round(
              (processedCount / filesToProcess.length) * 100,
            );
            spinner.suffixText =
              `${processedCount}/${filesToProcess.length} (${progress}%)`;
          }
        },
        concurrency: 8, // Process up to 8 files in parallel
      });

      // Filter to only include files we care about
      const relevantFiles = result.files.filter((f) => fileSet.has(f.path));
      allFiles.push(...relevantFiles);
    } catch (error) {
      const errorMessage = error instanceof Error
        ? error.message
        : String(error);
      spinner.fail(`Error scanning directory ${dir}: ${errorMessage}`);
      continue;
    }
  }

  spinner.succeed(`Read metadata from ${allFiles.length} files`);

  // Group files by album
  const filesByAlbum = groupFilesByAlbum(allFiles);

  // Display results
  let firstAlbum = true;
  for (const [albumName, files] of filesByAlbum) {
    if (!firstAlbum) console.log("\n" + "─".repeat(80) + "\n");
    firstAlbum = false;

    console.log(`🎵 Album: ${albumName}`);
    console.log(`📁 Files: ${files.length}`);

    // Extract common album metadata
    const firstFile = files[0];
    const albumArtist = firstFile.tags?.artist || "Unknown Artist";
    const albumYear = firstFile.tags?.year;
    const albumGenre = firstFile.tags?.genre;

    if (albumArtist) console.log(`👤 Artist: ${albumArtist}`);
    if (albumYear) console.log(`📅 Year: ${albumYear}`);
    if (albumGenre) console.log(`🎼 Genre: ${albumGenre}`);

    // Check for ReplayGain album values
    const albumGainTag =
      firstFile.tags && "replayGainAlbumGain" in firstFile.tags
        ? firstFile.tags.replayGainAlbumGain
        : undefined;
    const albumPeakTag =
      firstFile.tags && "replayGainAlbumPeak" in firstFile.tags
        ? firstFile.tags.replayGainAlbumPeak
        : undefined;

    if (albumGainTag !== undefined || albumPeakTag !== undefined) {
      console.log("\n📊 Album ReplayGain:");
      if (albumGainTag !== undefined) {
        console.log(`  Gain: ${albumGainTag}`);
      }
      if (albumPeakTag !== undefined) {
        console.log(`  Peak: ${albumPeakTag}`);
      }
    }

    console.log("\n📋 Tracks:");

    // Create table for tracks
    const table = new Table()
      .header(["#", "Title", "Duration", "AcoustID", "ReplayGain"]);

    for (const file of files) {
      const metadata = formatMetadataForDisplay(file);
      const duration = metadata.duration
        ? formatDuration(metadata.duration as number)
        : "Unknown";

      const acoustId = metadata.acoustIdId ? "✓" : "✗";

      const replayGainInfo = [];
      if (file.tags && "replayGainTrackGain" in file.tags) {
        replayGainInfo.push(`G: ${file.tags.replayGainTrackGain}`);
      }
      if (file.tags && "replayGainTrackPeak" in file.tags) {
        replayGainInfo.push(`P: ${file.tags.replayGainTrackPeak}`);
      }
      const replayGain = replayGainInfo.length > 0
        ? replayGainInfo.join(", ")
        : "✗";

      table.push([
        metadata.track?.toString() || "-",
        (metadata.title || "Unknown Title") as string,
        duration,
        acoustId,
        replayGain,
      ]);
    }

    table.render();

    // Display audio properties summary
    const bitrates = new Set<number>();
    const sampleRates = new Set<number>();
    const formats = new Set<string>();

    for (const file of files) {
      if (file.properties?.bitrate) bitrates.add(file.properties.bitrate);
      if (file.properties?.sampleRate) {
        sampleRates.add(file.properties.sampleRate);
      }
      // Try to get format from file extension
      const ext = file.path.substring(file.path.lastIndexOf(".") + 1)
        .toUpperCase();
      formats.add(ext);
    }

    console.log("\n🎧 Audio Properties:");
    if (bitrates.size > 0) {
      console.log(`  Bitrate: ${Array.from(bitrates).join(", ")} kbps`);
    }
    if (sampleRates.size > 0) {
      console.log(`  Sample Rate: ${Array.from(sampleRates).join(", ")} Hz`);
    }
    if (formats.size > 0) {
      console.log(`  Format: ${Array.from(formats).join(", ")}`);
    }

    // Check for extended metadata
    const hasAcoustId = files.some((f) =>
      f.tags && ("acoustIdId" in f.tags || "acoustIdFingerprint" in f.tags)
    );
    const hasMusicBrainz = files.some((f) =>
      f.tags && ("musicBrainzTrackId" in f.tags ||
        "musicBrainzReleaseId" in f.tags ||
        "musicBrainzArtistId" in f.tags)
    );

    if (hasAcoustId || hasMusicBrainz) {
      console.log("\n🔍 Extended Metadata:");
      if (hasAcoustId) console.log("  • AcoustID data present");
      if (hasMusicBrainz) console.log("  • MusicBrainz IDs present");
    }
  }

  // Summary
  console.log("\n" + "═".repeat(80));
  console.log(`\n📊 Summary:`);
  console.log(`  Total files: ${allFiles.length}`);
  console.log(`  Albums: ${filesByAlbum.size}`);

  const errors = allFiles.filter((f) => f.error).length;
  if (errors > 0) {
    console.log(`  Errors: ${errors}`);
  }
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}
