/**
 * Folder operations using taglib-wasm's new Folder API
 * Provides high-performance batch operations for music libraries
 */

import {
  exportFolderMetadata,
  findDuplicates,
  scanFolder,
  updateFolderTags,
} from "taglib-wasm/folder";
import type {
  AudioFileMetadata,
  FolderScanOptions,
  FolderScanResult,
} from "taglib-wasm/folder";
import { SUPPORTED_EXTENSIONS } from "../utils/file_discovery.ts";

/**
 * Scan a directory for audio files and retrieve their metadata
 * Uses the new Folder API for efficient parallel processing
 */
export async function scanMusicDirectory(
  directory: string,
  options?: {
    recursive?: boolean;
    onProgress?: (
      processed: number,
      total: number,
      currentFile: string,
    ) => void;
    concurrency?: number;
  },
): Promise<FolderScanResult> {
  const scanOptions: FolderScanOptions = {
    recursive: options?.recursive ?? true,
    extensions: SUPPORTED_EXTENSIONS.map((ext) => `.${ext}`),
    onProgress: options?.onProgress,
    concurrency: options?.concurrency ?? 8, // Higher concurrency for better performance
    includeProperties: true,
    continueOnError: true,
  };

  return await scanFolder(directory, scanOptions);
}

/**
 * Group scanned files by album
 */
export function groupFilesByAlbum(
  files: AudioFileMetadata[],
): Map<string, AudioFileMetadata[]> {
  const albums = new Map<string, AudioFileMetadata[]>();

  for (const file of files) {
    const albumKey = file.tags?.album || "Unknown Album";
    if (!albums.has(albumKey)) {
      albums.set(albumKey, []);
    }
    albums.get(albumKey)!.push(file);
  }

  return albums;
}

/**
 * Group scanned files by directory (for ReplayGain album processing)
 */
export function groupFilesByDirectory(
  files: AudioFileMetadata[],
): Map<string, AudioFileMetadata[]> {
  const directories = new Map<string, AudioFileMetadata[]>();

  for (const file of files) {
    const dir = file.path.substring(0, file.path.lastIndexOf("/"));
    if (!directories.has(dir)) {
      directories.set(dir, []);
    }
    directories.get(dir)!.push(file);
  }

  return directories;
}

/**
 * Batch update tags for multiple files
 */
export async function batchUpdateTags(
  updates: Array<{
    path: string;
    tags: Record<string, unknown>;
  }>,
) {
  return await updateFolderTags(updates);
}

/**
 * Find duplicate tracks in a music library
 */
export async function findDuplicateTracks(
  directory: string,
  criteria: string[] = ["artist", "title"],
) {
  // @ts-ignore - criteria is correctly typed for taglib-wasm
  return await findDuplicates(directory, criteria);
}

/**
 * Export library metadata to JSON
 */
export async function exportLibraryMetadata(
  directory: string,
  outputPath: string,
): Promise<void> {
  await exportFolderMetadata(directory, outputPath);
}

/**
 * Format file metadata for display
 */
export function formatMetadataForDisplay(
  metadata: AudioFileMetadata,
): Record<string, unknown> {
  const display: Record<string, unknown> = {};

  // Basic tags
  if (metadata.tags) {
    const tags = metadata.tags;
    if (tags.title) display.title = tags.title;
    if (tags.artist) display.artist = tags.artist;
    if (tags.album) display.album = tags.album;
    if (tags.year) display.year = tags.year;
    if (tags.track) display.track = tags.track;
    if (tags.genre) display.genre = tags.genre;
    if (tags.comment) display.comment = tags.comment;
  }

  // Audio properties
  if (metadata.properties) {
    const props = metadata.properties;
    if (props.length) display.duration = props.length;
    if (props.bitrate) display.bitrate = props.bitrate;
    if (props.sampleRate) display.sampleRate = props.sampleRate;
    if (props.channels) display.channels = props.channels;
  }

  // Extended metadata if available
  if (metadata.tags && "acoustIdFingerprint" in metadata.tags) {
    display.acoustIdFingerprint = metadata.tags.acoustIdFingerprint;
  }
  if (metadata.tags && "acoustIdId" in metadata.tags) {
    display.acoustIdId = metadata.tags.acoustIdId;
  }

  return display;
}
