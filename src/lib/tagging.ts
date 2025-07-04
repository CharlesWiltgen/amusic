import type { TagLib } from "jsr:@charlesw/taglib-wasm@0.5.4";
import {
  readMetadataBatch,
  readProperties,
  readTags,
} from "jsr:@charlesw/taglib-wasm@0.5.4/simple";
import { ensureTagLib } from "./taglib_init.ts";
import { readFileAsync } from "../utils/async-file-reader.ts";

/**
 * Helper to open a file for reading or writing
 * @param taglib The TagLib instance
 * @param filePath Path to the file
 * @returns The opened audio file
 */
async function openFile(
  taglib: TagLib,
  filePath: string,
) {
  const fileData = await readFileAsync(filePath);
  return await taglib.open(fileData);
}

/**
 * Reads ACOUSTID_FINGERPRINT and ACOUSTID_ID tags from a file using Taglib-Wasm.
 * Returns an object with the tags or null if not found or an error occurs.
 */
export async function getAcoustIDTags(
  filePath: string,
): Promise<{ ACOUSTID_FINGERPRINT?: string; ACOUSTID_ID?: string } | null> {
  const taglib = await ensureTagLib();

  let audioFile = null;
  try {
    // Use smart partial loading for read operations
    audioFile = await openFile(taglib, filePath);

    const tags: { ACOUSTID_FINGERPRINT?: string; ACOUSTID_ID?: string } = {};

    // Use direct methods to access AcoustID tags
    const fingerprint = audioFile.getAcoustIdFingerprint();
    if (fingerprint) {
      tags.ACOUSTID_FINGERPRINT = fingerprint;
    }

    const acoustId = audioFile.getAcoustIdId();
    if (acoustId) {
      tags.ACOUSTID_ID = acoustId;
    }

    return Object.keys(tags).length > 0 ? tags : null;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Error reading tags from ${filePath}: ${errorMessage}`);
    return null;
  } finally {
    if (audioFile) {
      audioFile.dispose();
    }
  }
}

/**
 * Checks if the audio file already has AcoustID related tags.
 * Returns true if tags are found, false otherwise.
 */
export async function hasAcoustIDTags(filePath: string): Promise<boolean> {
  try {
    // Use Simple API for efficient tag checking
    const _tags = await readTags(filePath);
    // Check if tags have acoustID properties (may need to check via Full API if not exposed)
    const fullTags = await getAcoustIDTags(filePath);
    return fullTags !== null &&
      (!!fullTags.ACOUSTID_FINGERPRINT || !!fullTags.ACOUSTID_ID);
  } catch {
    return false;
  }
}

/**
 * Gets the duration of an audio file in seconds using Taglib-Wasm.
 */
export async function getAudioDuration(filePath: string): Promise<number> {
  try {
    // Use Simple API for efficient read operation
    const properties = await readProperties(filePath);
    return properties?.length || 0;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(
      `Error getting audio duration from ${filePath}: ${errorMessage}`,
    );
    return 0;
  }
}

/**
 * Writes ACOUSTID_FINGERPRINT and ACOUSTID_ID tags to the file using Taglib-Wasm.
 *
 * @param filePath Path to the audio file to tag.
 * @param fingerprint The fingerprint to embed.
 * @param acoustID The AcoustID to embed.
 * @returns True if tagging succeeded, false otherwise.
 */
export async function writeAcoustIDTags(
  filePath: string,
  fingerprint: string,
  acoustID: string,
): Promise<boolean> {
  const taglib = await ensureTagLib();

  let audioFile = null;
  try {
    // Open file for writing
    audioFile = await openFile(taglib, filePath);

    // Use direct methods to set AcoustID tags
    audioFile.setAcoustIdFingerprint(fingerprint);
    if (acoustID) {
      audioFile.setAcoustIdId(acoustID);
    }

    // Save the file with the new tags
    const saveResult = audioFile.save();
    if (!saveResult) {
      console.error(`Failed to save tags to memory for ${filePath}`);
      return false;
    }

    // Get the modified file buffer and write to disk
    const modifiedBuffer = audioFile.getFileBuffer();
    await Deno.writeFile(filePath, new Uint8Array(modifiedBuffer));

    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(
      `Error writing AcoustID tags to ${filePath}: ${errorMessage}`,
    );
    return false;
  } finally {
    if (audioFile) {
      audioFile.dispose();
    }
  }
}

/**
 * Gets ReplayGain tags from an audio file.
 * Returns an object with all ReplayGain values or null if none exist.
 */
export async function getReplayGainTags(
  filePath: string,
): Promise<
  {
    trackGain?: string;
    trackPeak?: string;
    albumGain?: string;
    albumPeak?: string;
  } | null
> {
  const taglib = await ensureTagLib();

  let audioFile = null;
  try {
    // Use smart partial loading for read operations
    audioFile = await openFile(taglib, filePath);

    const tags: {
      trackGain?: string;
      trackPeak?: string;
      albumGain?: string;
      albumPeak?: string;
    } = {};

    // Use direct methods to access ReplayGain tags
    const trackGain = audioFile.getReplayGainTrackGain();
    if (trackGain !== null && trackGain !== undefined) {
      tags.trackGain = trackGain;
    }

    const trackPeak = audioFile.getReplayGainTrackPeak();
    if (trackPeak !== null && trackPeak !== undefined) {
      tags.trackPeak = trackPeak;
    }

    const albumGain = audioFile.getReplayGainAlbumGain();
    if (albumGain !== null && albumGain !== undefined) {
      tags.albumGain = albumGain;
    }

    const albumPeak = audioFile.getReplayGainAlbumPeak();
    if (albumPeak !== null && albumPeak !== undefined) {
      tags.albumPeak = albumPeak;
    }

    return Object.keys(tags).length > 0 ? tags : null;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(
      `Error reading ReplayGain tags from ${filePath}: ${errorMessage}`,
    );
    return null;
  } finally {
    if (audioFile) {
      audioFile.dispose();
    }
  }
}

/**
 * Writes ReplayGain tags to an audio file.
 * @param filePath Path to the audio file
 * @param tags Object containing ReplayGain values to write
 * @returns True if successful, false otherwise
 */
export async function writeReplayGainTags(
  filePath: string,
  tags: {
    trackGain?: string;
    trackPeak?: string;
    albumGain?: string;
    albumPeak?: string;
  },
): Promise<boolean> {
  const taglib = await ensureTagLib();

  let audioFile = null;
  try {
    // Open file for writing
    audioFile = await openFile(taglib, filePath);

    // Use direct methods to set ReplayGain tags
    if (tags.trackGain !== undefined) {
      audioFile.setReplayGainTrackGain(tags.trackGain);
    }
    if (tags.trackPeak !== undefined) {
      audioFile.setReplayGainTrackPeak(tags.trackPeak);
    }
    if (tags.albumGain !== undefined) {
      audioFile.setReplayGainAlbumGain(tags.albumGain);
    }
    if (tags.albumPeak !== undefined) {
      audioFile.setReplayGainAlbumPeak(tags.albumPeak);
    }

    // Save the file
    const saveResult = audioFile.save();
    if (!saveResult) {
      console.error(`Failed to save ReplayGain tags to memory for ${filePath}`);
      return false;
    }

    // Write to disk
    const modifiedBuffer = audioFile.getFileBuffer();
    await Deno.writeFile(filePath, new Uint8Array(modifiedBuffer));

    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(
      `Error writing ReplayGain tags to ${filePath}: ${errorMessage}`,
    );
    return false;
  } finally {
    if (audioFile) {
      audioFile.dispose();
    }
  }
}

/**
 * Gets comprehensive metadata from an audio file using PropertyMap.
 * This function accesses ALL metadata fields, including non-standard ones.
 */
export async function getComprehensiveMetadataWithPropertyMap(
  filePath: string,
): Promise<Record<string, string[]> | null> {
  const taglib = await ensureTagLib();

  let audioFile = null;
  try {
    audioFile = await openFile(taglib, filePath);
    // @ts-ignore: propertyMap exists at runtime
    const properties = audioFile.propertyMap();

    // Return all properties as-is for maximum flexibility
    return properties;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(
      `Error reading property map from ${filePath}: ${errorMessage}`,
    );
    return null;
  } finally {
    if (audioFile) {
      audioFile.dispose();
    }
  }
}

/**
 * Gets comprehensive metadata from an audio file.
 * Returns an object with all available metadata.
 */
export async function getComprehensiveMetadata(
  filePath: string,
): Promise<
  {
    // Basic tags
    title?: string;
    artist?: string;
    album?: string;
    comment?: string;
    genre?: string;
    year?: number;
    track?: number;

    // Audio properties
    duration?: number;
    bitrate?: number;
    sampleRate?: number;
    channels?: number;
    format?: string;

    // Extended tags
    acoustIdFingerprint?: string;
    acoustIdId?: string;
    musicBrainzTrackId?: string;
    musicBrainzReleaseId?: string;
    musicBrainzArtistId?: string;

    // ReplayGain
    replayGainTrackGain?: string;
    replayGainTrackPeak?: string;
    replayGainAlbumGain?: string;
    replayGainAlbumPeak?: string;

    // Cover art
    hasCoverArt?: boolean;
    coverArtCount?: number;
  } | null
> {
  const taglib = await ensureTagLib();

  let audioFile = null;
  try {
    // Use smart partial loading for read operations
    audioFile = await openFile(taglib, filePath);

    const metadata: Record<string, unknown> = {};

    // Basic tags
    const tag = audioFile.tag();
    if (tag.title) metadata.title = tag.title;
    if (tag.artist) metadata.artist = tag.artist;
    if (tag.album) metadata.album = tag.album;
    if (tag.comment) metadata.comment = tag.comment;
    if (tag.genre) metadata.genre = tag.genre;
    if (tag.year) metadata.year = tag.year;
    if (tag.track) metadata.track = tag.track;

    // Audio properties
    const props = audioFile.audioProperties();
    if (props?.length !== undefined) metadata.duration = props.length;
    if (props?.bitrate !== undefined) metadata.bitrate = props.bitrate;
    if (props?.sampleRate !== undefined) metadata.sampleRate = props.sampleRate;
    if (props?.channels !== undefined) metadata.channels = props.channels;

    // Format - derive from file extension
    const format = filePath.substring(filePath.lastIndexOf(".") + 1)
      .toUpperCase();
    if (format) metadata.format = format;

    // Extended tags - use direct methods
    // AcoustID
    const fingerprint = audioFile.getAcoustIdFingerprint();
    if (fingerprint) {
      metadata.acoustIdFingerprint = fingerprint;
    }
    const acoustId = audioFile.getAcoustIdId();
    if (acoustId) {
      metadata.acoustIdId = acoustId;
    }

    // MusicBrainz
    const mbTrackId = audioFile.getMusicBrainzTrackId();
    if (mbTrackId) {
      metadata.musicBrainzTrackId = mbTrackId;
    }
    const mbReleaseId = audioFile.getMusicBrainzReleaseId();
    if (mbReleaseId) {
      metadata.musicBrainzReleaseId = mbReleaseId;
    }
    const mbArtistId = audioFile.getMusicBrainzArtistId();
    if (mbArtistId) {
      metadata.musicBrainzArtistId = mbArtistId;
    }

    // ReplayGain
    const trackGain = audioFile.getReplayGainTrackGain();
    if (trackGain !== null && trackGain !== undefined) {
      metadata.replayGainTrackGain = trackGain;
    }
    const trackPeak = audioFile.getReplayGainTrackPeak();
    if (trackPeak !== null && trackPeak !== undefined) {
      metadata.replayGainTrackPeak = trackPeak;
    }
    const albumGain = audioFile.getReplayGainAlbumGain();
    if (albumGain !== null && albumGain !== undefined) {
      metadata.replayGainAlbumGain = albumGain;
    }
    const albumPeak = audioFile.getReplayGainAlbumPeak();
    if (albumPeak !== null && albumPeak !== undefined) {
      metadata.replayGainAlbumPeak = albumPeak;
    }

    // Cover art
    try {
      const pictures = audioFile.getPictures();
      if (pictures && pictures.length > 0) {
        metadata.hasCoverArt = true;
        metadata.coverArtCount = pictures.length;
      } else {
        metadata.hasCoverArt = false;
        metadata.coverArtCount = 0;
      }
    } catch {
      // Some formats may not support pictures
      metadata.hasCoverArt = false;
      metadata.coverArtCount = 0;
    }

    return Object.keys(metadata).length > 0 ? metadata : null;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(
      `Error reading comprehensive metadata from ${filePath}: ${errorMessage}`,
    );
    return null;
  } finally {
    if (audioFile) {
      audioFile.dispose();
    }
  }
}

/**
 * Batch check for AcoustID tags across multiple files.
 * Returns a map of filePath to boolean indicating presence of tags.
 */
export async function batchCheckAcoustIDTags(
  filePaths: string[],
  concurrency: number = 8,
): Promise<Map<string, boolean>> {
  const results = new Map<string, boolean>();

  // Process in chunks for memory efficiency
  const chunkSize = 100;
  for (let i = 0; i < filePaths.length; i += chunkSize) {
    const chunk = filePaths.slice(i, i + chunkSize);

    // Use readMetadataBatch for efficient batch reading
    const batchResult = await readMetadataBatch(chunk, {
      concurrency,
      continueOnError: true,
    });

    // Check each result for AcoustID tags
    for (const result of batchResult.results) {
      if ("error" in result && result.error) {
        results.set(result.file, false);
        continue;
      }

      // Check if we have AcoustID data
      // Note: May need to use Full API if Simple API doesn't expose these
      const hasAcoustId = await hasAcoustIDTags(result.file);
      results.set(result.file, hasAcoustId);
    }
  }

  return results;
}

/**
 * Batch read audio properties for multiple files.
 * Much faster than reading files individually.
 */
export async function batchGetAudioProperties(
  filePaths: string[],
  concurrency: number = 8,
): Promise<Map<string, { duration: number; bitrate: number }>> {
  const results = new Map<string, { duration: number; bitrate: number }>();

  const batchResult = await readMetadataBatch(filePaths, {
    concurrency,
    continueOnError: true,
  });

  for (const result of batchResult.results) {
    if (!("error" in result) && result.data.properties) {
      results.set(result.file, {
        duration: result.data.properties.length || 0,
        bitrate: result.data.properties.bitrate || 0,
      });
    }
  }

  return results;
}
