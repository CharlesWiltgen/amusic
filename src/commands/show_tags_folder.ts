import { dirname } from "jsr:@std/path";
import ora from "npm:ora@8.1.1";
import { scanMusicDirectory } from "../lib/folder_operations.ts";
import { formatChannels, formatDuration } from "../utils/format.ts";

interface FileMetadata {
  path: string;
  title?: string;
  artist?: string;
  album?: string;
  year?: number;
  track?: number;
  genre?: string;
  comment?: string;

  // Audio properties
  duration?: number;
  bitrate?: number;
  sampleRate?: number;
  channels?: number;
  format?: string;

  // Extended metadata
  replayGainTrackGain?: string;
  replayGainTrackPeak?: string;
  replayGainAlbumGain?: string;
  replayGainAlbumPeak?: string;
  acoustIdFingerprint?: string;
  acoustIdId?: string;
  hasCoverArt?: boolean;
  coverArtCount?: number;
}

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

  // Get unique directories from file paths
  const directories = new Set<string>();
  for (const file of filesToProcess) {
    directories.add(dirname(file));
  }

  // Create spinner
  const spinner = ora({
    text: "Scanning folders for metadata",
    spinner: "dots",
  }).start();

  try {
    const allFiles: FileMetadata[] = [];
    let totalProcessed = 0;
    let totalFound = 0;

    // Scan each directory
    for (const dir of directories) {
      spinner.text = `Scanning ${dir}`;

      const result = await scanMusicDirectory(dir, {
        recursive: false, // Don't recurse since we have specific files
        onProgress: (processed, total, _file) => {
          spinner.text = `Scanning ${dir} - ${processed}/${total} files`;
        },
        concurrency: 8,
      });

      // Filter results to only include our requested files
      for (const file of result.files) {
        if (filesToProcess.includes(file.path)) {
          const metadata: FileMetadata = {
            path: file.path,
            title: file.tags?.title,
            artist: file.tags?.artist,
            album: file.tags?.album,
            year: file.tags?.year,
            track: file.tags?.track,
            genre: file.tags?.genre,
            comment: file.tags?.comment,
            duration: file.properties?.length,
            bitrate: file.properties?.bitrate,
            sampleRate: file.properties?.sampleRate,
            channels: file.properties?.channels,
            format: file.path.substring(file.path.lastIndexOf(".") + 1)
              .toUpperCase(),
            // Extended tags - need to check if they exist in the tags object
            // Extended tags - type casting needed as these fields aren't in base interface
            replayGainTrackGain: (file.tags as Record<string, unknown>)
              ?.replayGainTrackGain as string | undefined,
            replayGainTrackPeak: (file.tags as Record<string, unknown>)
              ?.replayGainTrackPeak as string | undefined,
            replayGainAlbumGain: (file.tags as Record<string, unknown>)
              ?.replayGainAlbumGain as string | undefined,
            replayGainAlbumPeak: (file.tags as Record<string, unknown>)
              ?.replayGainAlbumPeak as string | undefined,
            acoustIdFingerprint: (file.tags as Record<string, unknown>)
              ?.acoustIdFingerprint as string | undefined,
            acoustIdId: (file.tags as Record<string, unknown>)?.acoustIdId as
              | string
              | undefined,
            hasCoverArt: (file as Record<string, unknown>).pictures &&
              Array.isArray((file as Record<string, unknown>).pictures) &&
              ((file as Record<string, unknown>).pictures as unknown[]).length >
                0,
            coverArtCount: (file as Record<string, unknown>).pictures &&
                Array.isArray((file as Record<string, unknown>).pictures)
              ? ((file as Record<string, unknown>).pictures as unknown[])
                .length
              : 0,
          };
          allFiles.push(metadata);
          totalProcessed++;
        }
      }

      totalFound += result.totalFound;

      // Report any errors
      for (const error of result.errors) {
        if (filesToProcess.includes(error.path)) {
          console.error(`\n❌ Error reading ${error.path}: ${error.error}`);
        }
      }
    }

    spinner.succeed(`Successfully read metadata from ${totalProcessed} files`);

    // Group by album
    const albums = new Map<string, FileMetadata[]>();
    for (const file of allFiles) {
      const albumKey = file.album || "Unknown Album";
      if (!albums.has(albumKey)) {
        albums.set(albumKey, []);
      }
      albums.get(albumKey)!.push(file);
    }

    // Sort files within each album by track number
    for (const files of albums.values()) {
      files.sort((a, b) => (a.track || 999) - (b.track || 999));
    }

    // Display each album
    for (const [albumName, files] of albums) {
      // Album header
      const firstFile = files[0];
      const albumArtist = firstFile.artist || "Unknown Artist";
      const albumYear = firstFile.year || "";
      const trackCount = files.length;

      console.log(
        `💿 ${albumName} - ${albumArtist}${
          albumYear ? ` (${albumYear})` : ""
        } - ${trackCount} track${trackCount > 1 ? "s" : ""}`,
      );
      console.log("▔".repeat(80));

      // Display each track
      for (const file of files) {
        console.log(`${file.title || "Unknown Title"}`);
        console.log(
          `🎵 Title                 ${file.title || "Unknown Title"}`,
        );
        console.log(
          `🎤 Artist                ${file.artist || "Unknown Artist"}`,
        );
        console.log(
          `📅 Year/Track/Genre      ${file.year || "?"} | ${
            file.track || "?"
          } | ${file.genre || "Unknown"}`,
        );
        console.log(
          `🎧 Format/Bitrate        ${file.format || "?"} | ${
            file.bitrate || "?"
          } kbps`,
        );
        console.log(
          `⏱️  Duration              ${
            file.duration ? formatDuration(file.duration) : "Unknown"
          }`,
        );
        console.log(
          `📊 Sample Rate/Channels  ${file.sampleRate || "?"} Hz | ${
            formatChannels(file.channels)
          }`,
        );

        // Track dynamics
        if (
          file.replayGainTrackGain !== undefined ||
          file.replayGainTrackPeak !== undefined
        ) {
          console.log(
            `📈 Track Dynamics        Gain: ${
              file.replayGainTrackGain !== undefined
                ? file.replayGainTrackGain
                : "N/A"
            } | Peak: ${
              file.replayGainTrackPeak !== undefined
                ? file.replayGainTrackPeak
                : "N/A"
            }`,
          );
        } else {
          console.log(`📈 Track Dynamics        N/A`);
        }

        // Album dynamics
        if (
          file.replayGainAlbumGain !== undefined ||
          file.replayGainAlbumPeak !== undefined
        ) {
          console.log(
            `📈 Album Dynamics        Gain: ${
              file.replayGainAlbumGain !== undefined
                ? file.replayGainAlbumGain
                : "N/A"
            } | Peak: ${
              file.replayGainAlbumPeak !== undefined
                ? file.replayGainAlbumPeak
                : "N/A"
            }`,
          );
        } else {
          console.log(`📈 Album Dynamics        N/A`);
        }

        // Cover art
        console.log(
          `🖼️  Cover Art             ${
            file.hasCoverArt ? `Yes (${file.coverArtCount} images)` : "No"
          }`,
        );

        // Add spacing between tracks
        console.log();
      }
    }
  } catch (error) {
    spinner.fail(
      `Error: ${error instanceof Error ? error.message : String(error)}`,
    );
    throw error;
  }
}
