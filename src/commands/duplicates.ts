import { Table } from "jsr:@cliffy/table@1.0.0-rc.7";
import { findDuplicateTracks } from "../lib/folder_operations.ts";
import { validateDirectory } from "../utils/console_output.ts";

export interface DuplicatesOptions {
  quiet?: boolean;
  byTitle?: boolean;
  byArtistTitle?: boolean;
  byFingerprint?: boolean;
  showAll?: boolean;
}

/**
 * Find duplicate tracks in a music library
 */
export async function duplicatesCommand(
  options: DuplicatesOptions,
  directory: string,
): Promise<void> {
  await validateDirectory(directory);

  if (!options.quiet) {
    console.log("🔍 Searching for duplicate tracks...\n");
  }

  // Determine criteria based on options
  let criteria: string[] = ["artist", "title"]; // Default
  if (options.byTitle) {
    criteria = ["title"];
  } else if (options.byFingerprint) {
    criteria = ["acoustIdFingerprint"];
  }

  try {
    const duplicates = await findDuplicateTracks(directory, criteria);

    if (duplicates.size === 0) {
      console.log("✅ No duplicates found!");
      return;
    }

    console.log(`Found ${duplicates.size} groups of duplicates:\n`);

    let groupNumber = 1;
    for (const [key, files] of duplicates) {
      // Skip single files (not duplicates)
      if (files.length < 2) continue;

      console.log(`\n🎵 Duplicate Group ${groupNumber}: ${key}`);
      console.log(`   Files: ${files.length}`);

      // Sort by quality (bitrate) and show details
      const sortedFiles = [...files].sort((a, b) => {
        const aBitrate = a.properties?.bitrate || 0;
        const bBitrate = b.properties?.bitrate || 0;
        return bBitrate - aBitrate;
      });

      const table = new Table()
        .header(["Quality", "Path", "Album", "Duration", "Format"]);

      for (const [index, file] of sortedFiles.entries()) {
        const quality = index === 0 ? "⭐ BEST" : "  ";
        const bitrate = file.properties?.bitrate || "?";
        const duration = file.properties?.length
          ? formatDuration(file.properties.length)
          : "?";
        const format = file.path.substring(file.path.lastIndexOf(".") + 1)
          .toUpperCase();
        const album = file.tags?.album || "Unknown";

        table.push([
          `${quality} ${bitrate}kbps`,
          file.path,
          album,
          duration,
          format,
        ]);
      }

      table.render();

      if (!options.showAll) {
        groupNumber++;
        if (groupNumber > 10) {
          console.log(`\n... and ${duplicates.size - 10} more groups.`);
          console.log("Use --show-all to see all duplicates.");
          break;
        }
      } else {
        groupNumber++;
      }
    }

    // Summary statistics
    const totalDuplicateFiles = Array.from(duplicates.values())
      .reduce((sum, files) => sum + files.length - 1, 0); // -1 because we keep one

    console.log("\n📊 Summary:");
    console.log(`  Duplicate groups: ${duplicates.size}`);
    console.log(`  Redundant files: ${totalDuplicateFiles}`);

    // Estimate space savings
    const spaceSavings = Array.from(duplicates.values()).reduce(
      (sum, files) => {
        // Keep the highest quality file, remove others
        const sorted = [...files].sort((a, b) => {
          const aBitrate = a.properties?.bitrate || 0;
          const bBitrate = b.properties?.bitrate || 0;
          return bBitrate - aBitrate;
        });

        // Sum size of files to remove (all except first)
        return sum + sorted.slice(1).reduce((fileSum, file) => {
          const duration = file.properties?.length || 0;
          const bitrate = file.properties?.bitrate || 128;
          const estimatedSize = duration * bitrate * 125; // Convert to bytes
          return fileSum + estimatedSize;
        }, 0);
      },
      0,
    );

    const spaceSavingsMB = Math.round(spaceSavings / 1024 / 1024);
    console.log(`  Potential space savings: ~${spaceSavingsMB} MB`);
  } catch (error) {
    console.error(`❌ Error finding duplicates: ${error.message}`);
    Deno.exit(1);
  }
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}
