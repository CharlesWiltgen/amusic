import { Table } from "@cliffy/table";
import { processAcoustIDTagging } from "../lib/acoustid.ts";
import { getComprehensiveMetadata } from "../lib/tagging.ts";
import { collectAudioFiles } from "../utils/file_discovery.ts";
import type { CommandOptions } from "../types/command.ts";
import { ProcessingStats } from "../utils/processing_stats.ts";
import {
  logProcessingInfo,
  validateAudioFiles,
} from "../utils/console_output.ts";

export async function defaultCommand(
  options: CommandOptions,
  ...files: string[]
): Promise<void> {
  const filesToProcess = await collectAudioFiles(files);

  if (options.showTags) {
    await showTags(filesToProcess, options.quiet);
    return;
  }

  validateAudioFiles(filesToProcess);
  logProcessingInfo(options, filesToProcess.length);

  const stats = new ProcessingStats();

  for (const file of filesToProcess) {
    try {
      if (!options.quiet && filesToProcess.length > 1) console.log("");
      const status = await processAcoustIDTagging(
        file,
        options.apiKey || "",
        options.force || false,
        options.quiet,
        options.dryRun || false,
      );
      stats.increment(status);
    } catch (error) {
      const errorMessage = error instanceof Error
        ? error.message
        : String(error);
      console.error(`Unexpected error processing ${file}: ${errorMessage}`);
      stats.incrementFailed();
    }
  }

  stats.printSummary("Processing Complete", options.dryRun);
}

async function showTags(
  filesToProcess: string[],
  quiet: boolean,
): Promise<void> {
  if (!quiet) {
    console.log("Displaying comprehensive metadata:\n");
  }

  type FileMetadata = {
    title?: string;
    artist?: string;
    album?: string;
    comment?: string;
    genre?: string;
    year?: number;
    track?: number;
    duration?: number;
    bitrate?: number;
    sampleRate?: number;
    channels?: number;
    format?: string;
    acoustIdFingerprint?: string;
    acoustIdId?: string;
    musicBrainzTrackId?: string;
    musicBrainzReleaseId?: string;
    musicBrainzArtistId?: string;
    replayGainTrackGain?: number;
    replayGainTrackPeak?: number;
    replayGainAlbumGain?: number;
    replayGainAlbumPeak?: number;
    hasCoverArt?: boolean;
    coverArtCount?: number;
  };

  const filesByAlbum = new Map<
    string,
    Array<{ path: string; metadata: FileMetadata }>
  >();

  for (const file of filesToProcess) {
    try {
      const metadata = await getComprehensiveMetadata(file);
      if (metadata) {
        const albumKey = metadata.album || "Unknown Album";
        if (!filesByAlbum.has(albumKey)) {
          filesByAlbum.set(albumKey, []);
        }
        filesByAlbum.get(albumKey)!.push({ path: file, metadata });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`Error reading metadata from ${file}: ${msg}`);
    }
  }

  for (const [albumKey, files] of filesByAlbum) {
    files.sort((a, b) => (a.metadata.track || 0) - (b.metadata.track || 0));

    const artists = new Set(
      files.map((f) => f.metadata.artist).filter(Boolean),
    );
    const albumArtist = artists.size === 1
      ? [...artists][0]
      : "Various Artists";

    const firstFile = files[0];
    const year = firstFile.metadata.year;

    const albumHeader = year
      ? `💿 ${albumKey} - ${albumArtist} (${year}) - ${files.length} tracks`
      : `💿 ${albumKey} - ${albumArtist} - ${files.length} tracks`;

    console.log(albumHeader);
    console.log(`\x1b[36m${"▔".repeat(albumHeader.length)}\x1b[0m`);

    for (const { path, metadata } of files) {
      const fileName = basename(path);
      console.log(`${metadata.title || fileName}`);

      const tableData: string[][] = [];

      tableData.push(["🎵 Title", metadata.title || "(none)"]);
      tableData.push(["🎤 Artist", metadata.artist || "(none)"]);

      const yearTrackGenre = [
        metadata.year?.toString() || "(none)",
        metadata.track?.toString() || "(none)",
        metadata.genre || "(none)",
      ].join(" | ");
      tableData.push(["📅 Year/Track/Genre", yearTrackGenre]);

      const formatBitrate = [
        metadata.format || "Unknown",
        metadata.bitrate ? `${metadata.bitrate} kbps` : "(none)",
      ].join(" | ");
      tableData.push(["🎧 Format/Bitrate", formatBitrate]);

      let durationStr = "(none)";
      if (metadata.duration) {
        const minutes = Math.floor(metadata.duration / 60);
        const seconds = metadata.duration % 60;
        durationStr = `${minutes}:${seconds.toString().padStart(2, "0")}`;
      }
      tableData.push(["⏱️ Duration", durationStr.trim()]);

      let channelsStr = "(none)";
      if (metadata.channels === 2) {
        channelsStr = "Stereo";
      } else if (metadata.channels === 1) {
        channelsStr = "Mono";
      } else if (metadata.channels) {
        channelsStr = `${metadata.channels} ch`;
      }

      const sampleRateChannels = [
        metadata.sampleRate ? `${metadata.sampleRate} Hz` : "(none)",
        channelsStr,
      ].join(" | ");
      tableData.push(["📊 Sample Rate/Channels", sampleRateChannels]);

      const trackDynamics: string[] = [];
      const albumDynamics: string[] = [];

      if (metadata.replayGainTrackGain !== undefined) {
        trackDynamics.push(`Gain: ${metadata.replayGainTrackGain} dB`);
      }
      if (metadata.replayGainTrackPeak !== undefined) {
        trackDynamics.push(`Peak: ${metadata.replayGainTrackPeak} dB`);
      }
      if (trackDynamics.length > 0) {
        tableData.push(["📈 Track Dynamics", trackDynamics.join(" | ")]);
      }

      if (metadata.replayGainAlbumGain !== undefined) {
        albumDynamics.push(`Gain: ${metadata.replayGainAlbumGain} dB`);
      }
      if (metadata.replayGainAlbumPeak !== undefined) {
        albumDynamics.push(`Peak: ${metadata.replayGainAlbumPeak} dB`);
      }
      if (albumDynamics.length > 0) {
        tableData.push(["📈 Album Dynamics", albumDynamics.join(" | ")]);
      }

      tableData.push([
        "🖼️ Cover Art",
        (metadata.hasCoverArt
          ? `Yes (${metadata.coverArtCount} images)`.trim()
          : "No").trim(),
      ]);

      if (metadata.acoustIdId) {
        tableData.push(["🔍 AcoustID", metadata.acoustIdId]);
      }
      if (metadata.musicBrainzTrackId) {
        tableData.push(["🎵 MB Track ID", metadata.musicBrainzTrackId]);
      }

      const table = new Table()
        .body(tableData)
        .indent(0)
        .padding(2)
        .border(false);

      console.log(table.toString());
      console.log();
    }
    console.log();
  }
}

function basename(path: string): string {
  return path.split("/").pop() || path;
}
