import { join } from "jsr:@std/path";
import { collectAudioFiles } from "../utils/file_discovery.ts";
import { AUDIO_EXTENSIONS } from "../constants.ts";

export interface FolderProcessingResult {
  albums: Map<string, string[]>; // album path -> audio files
  singles: string[]; // individual audio files to process as singles
}

export interface FolderProcessingOptions {
  singlesPatterns?: string[]; // Folder patterns to treat as singles
  quiet?: boolean;
}

/**
 * Analyzes a folder structure and determines which folders are albums
 * and which files should be processed as singles
 */
export async function analyzeFolderStructure(
  paths: string[],
  options: FolderProcessingOptions = {},
): Promise<FolderProcessingResult> {
  const result: FolderProcessingResult = {
    albums: new Map(),
    singles: [],
  };

  const { singlesPatterns = [], quiet } = options;

  for (const path of paths) {
    try {
      const stat = await Deno.stat(path);

      if (stat.isFile) {
        // Single file: always treat as single
        if (isAudioFile(path)) {
          result.singles.push(path);
        }
      } else if (stat.isDirectory) {
        // Check if this folder should be treated as singles
        const treatAsSingles = shouldTreatAsSingles(path, singlesPatterns);

        if (treatAsSingles) {
          // Collect all audio files in this directory as singles
          const audioFiles = await collectAudioFiles([path]);
          result.singles.push(...audioFiles);
          if (!quiet) {
            console.log(
              `📂 Processing "${path}" as singles (${audioFiles.length} files)`,
            );
          }
        } else {
          // Process as album(s)
          await processFolderAsAlbums(path, result, quiet, singlesPatterns);
        }
      }
    } catch (error) {
      console.error(`Error processing path "${path}": ${error}`);
    }
  }

  return result;
}

/**
 * Process a folder, determining if it's an album or contains albums
 */
async function processFolderAsAlbums(
  folderPath: string,
  result: FolderProcessingResult,
  quiet?: boolean,
  singlesPatterns: string[] = [],
): Promise<void> {
  const entries: Deno.DirEntry[] = [];
  const audioFiles: string[] = [];
  let hasSubfolders = false;

  // Scan the folder
  for await (const entry of Deno.readDir(folderPath)) {
    if (entry.isDirectory) {
      hasSubfolders = true;
      entries.push(entry);
    } else if (entry.isFile && isAudioFile(entry.name)) {
      audioFiles.push(join(folderPath, entry.name));
    }
  }

  if (hasSubfolders) {
    // This folder contains subfolders - process each as a potential album
    for (const entry of entries) {
      const subfolderPath = join(folderPath, entry.name);

      // Check if this subfolder should be treated as singles
      if (shouldTreatAsSingles(subfolderPath, singlesPatterns)) {
        const audioFiles = await collectAudioFiles([subfolderPath]);
        result.singles.push(...audioFiles);
        if (!quiet) {
          console.log(
            `📂 Processing "${subfolderPath}" as singles (${audioFiles.length} files)`,
          );
        }
      } else {
        await processFolderAsAlbums(
          subfolderPath,
          result,
          quiet,
          singlesPatterns,
        );
      }
    }

    // If there are also audio files in this parent folder, warn the user
    if (audioFiles.length > 0 && !quiet) {
      console.warn(
        `⚠️  Found ${audioFiles.length} audio files in "${folderPath}" which also contains subfolders. ` +
          `These files will be ignored. Move them to a subfolder or use --singles to process them.`,
      );
    }
  } else if (audioFiles.length > 0) {
    // This is a leaf folder with audio files - treat as album
    result.albums.set(folderPath, audioFiles);
    if (!quiet) {
      console.log(
        `💿 Found album: "${folderPath}" (${audioFiles.length} tracks)`,
      );
    }
  }
}

/**
 * Check if a folder should be treated as singles based on patterns
 */
function shouldTreatAsSingles(
  folderPath: string,
  singlesPatterns: string[],
): boolean {
  if (singlesPatterns.length === 0) {
    return false;
  }

  // Normalize the folder path for comparison
  const normalizedPath = folderPath.replace(/\\/g, "/");

  for (const pattern of singlesPatterns) {
    const normalizedPattern = pattern.replace(/\\/g, "/");

    // Exact match
    if (normalizedPath === normalizedPattern) {
      return true;
    }

    // Ends with pattern (for matching folder names)
    if (
      normalizedPath.endsWith("/" + normalizedPattern) ||
      normalizedPath.endsWith(normalizedPattern)
    ) {
      return true;
    }

    // Contains pattern
    if (normalizedPath.includes(normalizedPattern)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if a file is an audio file based on extension
 */
function isAudioFile(filename: string): boolean {
  const ext = filename.toLowerCase();
  return AUDIO_EXTENSIONS.some((audioExt) => ext.endsWith(audioExt));
}

/**
 * Get a display name for an album folder
 */
export function getAlbumDisplayName(albumPath: string): string {
  const parts = albumPath.split("/");
  if (parts.length >= 2) {
    // Return "Artist/Album" format
    return parts.slice(-2).join("/");
  }
  return parts[parts.length - 1] || albumPath;
}
