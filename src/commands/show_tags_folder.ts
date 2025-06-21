import { readMetadataBatch } from "jsr:@charlesw/taglib-wasm";
import { formatChannels, formatDuration } from "../utils/format.ts";

/**
 * Format container format for display, adding descriptive names where appropriate
 */
function formatContainerFormat(format: string): string {
  switch (format) {
    case "MP4":
      return "MP4 (ISOBMFF)";
    case "OGG":
      return "OGG";
    case "MP3":
      return "MP3";
    case "FLAC":
      return "FLAC";
    case "WAV":
      return "WAV (RIFF)";
    case "AIFF":
      return "AIFF";
    default:
      return format;
  }
}

/**
 * Format codec for display, adding descriptive names where appropriate
 */
function formatCodec(codec: string): string {
  switch (codec) {
    case "AAC":
      return "AAC-LC";
    case "ALAC":
      return "Apple Lossless";
    case "MP3":
      return "MP3";
    case "FLAC":
      return "FLAC";
    case "Vorbis":
      return "Vorbis";
    case "Opus":
      return "Opus";
    case "PCM":
      return "PCM";
    case "IEEE Float":
      return "IEEE Float";
    default:
      return codec;
  }
}

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
 * Display tags using the new batch API for maximum performance
 */
export async function showTagsWithFolderAPI(
  filesToProcess: string[],
  quiet: boolean,
): Promise<void> {
  // Hide cursor
  if (!quiet) {
    Deno.stdout.writeSync(new TextEncoder().encode("\x1b[?25l"));
    Deno.stdout.writeSync(
      new TextEncoder().encode("→ Reading metadata: 0 files processed"),
    );
  }

  let lastCount = 0;

  try {
    // Use the enhanced batch API directly
    const batchResult = await readMetadataBatch(filesToProcess, {
      concurrency: 8,
      continueOnError: true,
      onProgress: (processed, total, _currentFile) => {
        if (!quiet && processed !== lastCount) {
          // Move cursor to beginning of line and clear it
          Deno.stdout.writeSync(
            new TextEncoder().encode(
              `\x1b[2K\r→ Reading metadata: ${processed}/${total} files processed`,
            ),
          );
          lastCount = processed;
        }
      },
    });

    if (!quiet) {
      // Update with final count and checkmark
      Deno.stdout.writeSync(
        new TextEncoder().encode(
          `\x1b[2K\r✅ Reading metadata: ${batchResult.results.length} files processed\n\n`,
        ),
      );
      // Show cursor
      Deno.stdout.writeSync(new TextEncoder().encode("\x1b[?25h"));
    }

    // Process and display results immediately
    let lastAlbum = "";
    let albumTrackCount = 0;

    for (let i = 0; i < batchResult.results.length; i++) {
      const result = batchResult.results[i];

      if ("error" in result && result.error) {
        console.error(`Error reading ${result.file}: ${result.error}`);
        continue;
      }

      const { data } = result;
      const metadata: FileMetadata = {
        path: result.file,
        title: data.tags?.title,
        artist: data.tags?.artist,
        album: data.tags?.album,
        year: data.tags?.year,
        track: data.tags?.track,
        genre: data.tags?.genre,
        comment: data.tags?.comment,
        duration: data.properties?.length,
        bitrate: data.properties?.bitrate,
        sampleRate: data.properties?.sampleRate,
        channels: data.properties?.channels,
        format: result.file.substring(result.file.lastIndexOf(".") + 1)
          .toUpperCase(),
        // Extended tags from dynamics
        replayGainTrackGain: data.dynamics?.replayGainTrackGain,
        replayGainTrackPeak: data.dynamics?.replayGainTrackPeak,
        replayGainAlbumGain: data.dynamics?.replayGainAlbumGain,
        replayGainAlbumPeak: data.dynamics?.replayGainAlbumPeak,
        // @ts-ignore: AcoustID fields may exist
        acoustIdFingerprint: data.tags?.acoustIdFingerprint,
        // @ts-ignore: AcoustID fields may exist
        acoustIdId: data.tags?.acoustIdId,
        // Cover art is now available in batch API!
        hasCoverArt: data.hasCoverArt || false,
        coverArtCount: data.hasCoverArt ? 1 : 0, // API doesn't provide count
      };

      const currentAlbum = metadata.album || "Unknown Album";

      // Display album header if this is a new album
      if (currentAlbum !== lastAlbum) {
        if (lastAlbum !== "") {
          console.log(); // Add spacing between albums
        }

        // Count tracks in this album
        albumTrackCount = 1;
        for (let j = i + 1; j < batchResult.results.length; j++) {
          const nextResult = batchResult.results[j];
          if (
            !("error" in nextResult) &&
            nextResult.data.tags?.album === currentAlbum
          ) {
            albumTrackCount++;
          } else {
            break;
          }
        }

        console.log(
          `💿 ${currentAlbum} - ${metadata.artist || "Unknown Artist"}${
            metadata.year ? ` (${metadata.year})` : ""
          } - ${albumTrackCount} track${albumTrackCount > 1 ? "s" : ""}`,
        );
        console.log("▔".repeat(80));
        lastAlbum = currentAlbum;
      }

      // Display track info
      console.log(`${metadata.title || "Unknown Title"}`);
      console.log(
        `🎵 Title                 ${metadata.title || "Unknown Title"}`,
      );
      console.log(
        `🎤 Artist                ${metadata.artist || "Unknown Artist"}`,
      );
      console.log(
        `📅 Year/Track/Genre      ${metadata.year || "?"} | ${
          metadata.track || "?"
        } | ${metadata.genre || "Unknown"}`,
      );
      // Display format, codec, and bitrate
      const containerFormat = data.properties?.containerFormat ||
        metadata.format || "?";
      const formattedContainer = formatContainerFormat(containerFormat);
      const codec = data.properties?.codec || "?";
      const formattedCodec = formatCodec(codec);
      const bitrate = metadata.bitrate || "?";

      console.log(
        `🎧 Format/Codec/Bitrate  ${formattedContainer} | ${formattedCodec} | ${bitrate} kbps`,
      );
      console.log(
        `⏱️ Duration              ${
          metadata.duration ? formatDuration(metadata.duration) : "Unknown"
        }`,
      );
      console.log(
        `📊 Sample Rate/Channels  ${metadata.sampleRate || "?"} Hz | ${
          formatChannels(metadata.channels)
        }`,
      );

      // Track dynamics
      if (
        metadata.replayGainTrackGain !== undefined ||
        metadata.replayGainTrackPeak !== undefined
      ) {
        console.log(
          `📈 Track Dynamics        Gain: ${
            metadata.replayGainTrackGain !== undefined
              ? metadata.replayGainTrackGain
              : "n/a"
          } | Peak: ${
            metadata.replayGainTrackPeak !== undefined
              ? metadata.replayGainTrackPeak
              : "n/a"
          }`,
        );
      } else {
        console.log(`📈 Track Dynamics        n/a`);
      }

      // Album dynamics
      if (
        metadata.replayGainAlbumGain !== undefined ||
        metadata.replayGainAlbumPeak !== undefined
      ) {
        console.log(
          `📈 Album Dynamics        Gain: ${
            metadata.replayGainAlbumGain !== undefined
              ? metadata.replayGainAlbumGain
              : "n/a"
          } | Peak: ${
            metadata.replayGainAlbumPeak !== undefined
              ? metadata.replayGainAlbumPeak
              : "n/a"
          }`,
        );
      } else {
        console.log(`📈 Album Dynamics        n/a`);
      }

      // Cover art
      console.log(
        `🖼️ Cover Art             ${metadata.hasCoverArt ? "Yes" : "No"}`,
      );

      // Add spacing between tracks
      console.log();
    }
  } catch (error) {
    if (!quiet) {
      // Show cursor on error
      Deno.stdout.writeSync(new TextEncoder().encode("\x1b[?25h"));
    }
    console.error(
      `Error: ${error instanceof Error ? error.message : String(error)}`,
    );
    throw error;
  }
}
