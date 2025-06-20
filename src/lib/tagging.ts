import { TagLib } from "taglib-wasm";
import { WasmCache } from "./wasm_cache.ts";

// TagLib instance - reuse for performance
let taglibInstance: TagLib | null = null;

// WASM cache instance
const wasmCache = new WasmCache();

async function ensureTagLib(): Promise<TagLib> {
  if (!taglibInstance) {
    // Get WASM data from cache (downloads if needed)
    const wasmData = await wasmCache.getWasmData();

    // Initialize TagLib with cached WASM data
    taglibInstance = await TagLib.initialize({
      wasmData: wasmData,
    });
  }
  return taglibInstance;
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
    // Read file data and open with taglib-wasm
    const fileData = await Deno.readFile(filePath);
    audioFile = await taglib.open(fileData);

    const tags: { ACOUSTID_FINGERPRINT?: string; ACOUSTID_ID?: string } = {};

    // Use the built-in AcoustID methods
    const fingerprint = audioFile.getAcoustIdFingerprint();
    const id = audioFile.getAcoustIdId();

    if (fingerprint) {
      tags.ACOUSTID_FINGERPRINT = fingerprint;
    }
    if (id) {
      tags.ACOUSTID_ID = id;
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
  const tags = await getAcoustIDTags(filePath);
  return tags !== null && (!!tags.ACOUSTID_FINGERPRINT || !!tags.ACOUSTID_ID);
}

/**
 * Gets the duration of an audio file in seconds using Taglib-Wasm.
 */
export async function getAudioDuration(filePath: string): Promise<number> {
  const taglib = await ensureTagLib();

  let audioFile = null;
  try {
    // Read file data and open with taglib-wasm
    const fileData = await Deno.readFile(filePath);
    audioFile = await taglib.open(fileData);

    const properties = audioFile.audioProperties();
    return properties?.length || 0;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(
      `Error getting audio duration from ${filePath}: ${errorMessage}`,
    );
    return 0;
  } finally {
    if (audioFile) {
      audioFile.dispose();
    }
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
    // Read file data and open with taglib-wasm
    const fileData = await Deno.readFile(filePath);
    audioFile = await taglib.open(fileData);

    // Use the built-in AcoustID methods
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
    trackGain?: number;
    trackPeak?: number;
    albumGain?: number;
    albumPeak?: number;
  } | null
> {
  const taglib = await ensureTagLib();

  let audioFile = null;
  try {
    const fileData = await Deno.readFile(filePath);
    audioFile = await taglib.open(fileData);

    const tags: {
      trackGain?: number;
      trackPeak?: number;
      albumGain?: number;
      albumPeak?: number;
    } = {};

    const trackGain = audioFile.getReplayGainTrackGain();
    const trackPeak = audioFile.getReplayGainTrackPeak();
    const albumGain = audioFile.getReplayGainAlbumGain();
    const albumPeak = audioFile.getReplayGainAlbumPeak();

    if (trackGain !== undefined) tags.trackGain = parseFloat(trackGain);
    if (trackPeak !== undefined) tags.trackPeak = parseFloat(trackPeak);
    if (albumGain !== undefined) tags.albumGain = parseFloat(albumGain);
    if (albumPeak !== undefined) tags.albumPeak = parseFloat(albumPeak);

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
    trackGain?: number;
    trackPeak?: number;
    albumGain?: number;
    albumPeak?: number;
  },
): Promise<boolean> {
  const taglib = await ensureTagLib();

  let audioFile = null;
  try {
    const fileData = await Deno.readFile(filePath);
    audioFile = await taglib.open(fileData);

    // Set ReplayGain values
    if (tags.trackGain !== undefined) {
      audioFile.setReplayGainTrackGain(tags.trackGain.toString());
    }
    if (tags.trackPeak !== undefined) {
      audioFile.setReplayGainTrackPeak(tags.trackPeak.toString());
    }
    if (tags.albumGain !== undefined) {
      audioFile.setReplayGainAlbumGain(tags.albumGain.toString());
    }
    if (tags.albumPeak !== undefined) {
      audioFile.setReplayGainAlbumPeak(tags.albumPeak.toString());
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
    replayGainTrackGain?: number;
    replayGainTrackPeak?: number;
    replayGainAlbumGain?: number;
    replayGainAlbumPeak?: number;

    // Cover art
    hasCoverArt?: boolean;
    coverArtCount?: number;
  } | null
> {
  const taglib = await ensureTagLib();

  let audioFile = null;
  try {
    const fileData = await Deno.readFile(filePath);
    audioFile = await taglib.open(fileData);

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

    // Format
    const format = audioFile.getFormat();
    if (format) metadata.format = format;

    // Extended tags
    const acoustIdFingerprint = audioFile.getAcoustIdFingerprint();
    if (acoustIdFingerprint) metadata.acoustIdFingerprint = acoustIdFingerprint;

    const acoustIdId = audioFile.getAcoustIdId();
    if (acoustIdId) metadata.acoustIdId = acoustIdId;

    const mbTrackId = audioFile.getMusicBrainzTrackId();
    if (mbTrackId) metadata.musicBrainzTrackId = mbTrackId;

    const mbReleaseId = audioFile.getMusicBrainzReleaseId();
    if (mbReleaseId) metadata.musicBrainzReleaseId = mbReleaseId;

    const mbArtistId = audioFile.getMusicBrainzArtistId();
    if (mbArtistId) metadata.musicBrainzArtistId = mbArtistId;

    // ReplayGain
    const trackGain = audioFile.getReplayGainTrackGain();
    if (trackGain !== undefined) {
      metadata.replayGainTrackGain = parseFloat(trackGain);
    }

    const trackPeak = audioFile.getReplayGainTrackPeak();
    if (trackPeak !== undefined) {
      metadata.replayGainTrackPeak = parseFloat(trackPeak);
    }

    const albumGain = audioFile.getReplayGainAlbumGain();
    if (albumGain !== undefined) {
      metadata.replayGainAlbumGain = parseFloat(albumGain);
    }

    const albumPeak = audioFile.getReplayGainAlbumPeak();
    if (albumPeak !== undefined) {
      metadata.replayGainAlbumPeak = parseFloat(albumPeak);
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
