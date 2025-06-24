// encoding.ts
import { extname } from "jsr:@std/path";
import { VERSION } from "../version.ts";
import { ensureTagLib } from "./taglib_init.ts";

const LOSSLESS_FORMATS = ["wav", "flac"]; // m4a removed - will check codec
const LOSSY_FORMATS = ["mp3", "ogg"];
const AMBIGUOUS_FORMATS = ["m4a", "mp4"]; // Need to check codec

export interface EncodingOptions {
  forceLossyTranscodes?: boolean;
  dryRun?: boolean;
  outputDirectory?: string;
}

export interface EncodingResult {
  metadataInfo?: string;
  success?: string;
}

export async function encodeToM4A(
  inputPath: string,
  outputPath: string,
  options: EncodingOptions = {},
): Promise<EncodingResult> {
  const ext = extname(inputPath).toLowerCase().slice(1);

  // Check if input format is allowed
  const isLossless = await isLosslessFormat(inputPath);

  if (!isLossless && !options.forceLossyTranscodes) {
    if (LOSSY_FORMATS.includes(ext) || AMBIGUOUS_FORMATS.includes(ext)) {
      throw new Error(
        `Cannot encode from lossy format "${ext}". Use --force-lossy-transcodes to override.`,
      );
    } else {
      throw new Error(`Unsupported input format: ${ext}`);
    }
  }

  if (options.dryRun) {
    return {
      success: `[DRY RUN] Would encode: ${inputPath} -> ${outputPath}`,
    };
  }

  // Use afconvert for encoding
  const afconvertPath = await getAfconvertPath();

  const cmd = new Deno.Command(afconvertPath, {
    args: [
      "-f",
      "m4af", // M4A container format
      "-d",
      "aac", // AAC codec
      "-s",
      "2", // Bitrate allocation strategy (Constrained VBR)
      "-q",
      "127", // VBR quality 127 (highest quality)
      "-b",
      "320000", // Bitrate up to 320 kbps
      inputPath,
      outputPath,
    ],
    stdout: "piped",
    stderr: "piped",
  });

  const process = await cmd.output();

  if (!process.success) {
    const errorOutput = new TextDecoder().decode(process.stderr);
    throw new Error(`Encoding failed: ${errorOutput}`);
  }

  // Copy metadata from source to destination
  try {
    const metadataResult = await copyMetadata(inputPath, outputPath);
    return metadataResult;
  } catch (error) {
    // Return warning but don't fail if metadata copy fails
    return {
      metadataInfo: `⚠️  Warning: Failed to copy metadata: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}

async function getAfconvertPath(): Promise<string> {
  // First check if afconvert is available in the system
  try {
    const cmd = new Deno.Command("afconvert", {
      args: ["-h"],
      stdout: "null",
      stderr: "null",
    });
    await cmd.output();
    return "afconvert";
  } catch {
    // afconvert not found in system, this is macOS-only tool
    throw new Error("afconvert not found. Audio encoding requires macOS.");
  }
}

export async function isLosslessFormat(filePath: string): Promise<boolean> {
  const ext = extname(filePath).toLowerCase().slice(1);

  // Known lossless formats
  if (LOSSLESS_FORMATS.includes(ext)) {
    return true;
  }

  // Known lossy formats
  if (LOSSY_FORMATS.includes(ext)) {
    return false;
  }

  // For M4A/MP4, we need to check if it's Apple Lossless (ALAC) or AAC
  if (AMBIGUOUS_FORMATS.includes(ext)) {
    const taglib = await ensureTagLib();
    let audioFile = null;
    try {
      // Read the file
      const fileData = await Deno.readFile(filePath);
      audioFile = await taglib.open(fileData);

      if (!audioFile) {
        // If we can't read it, assume it's lossy to be safe
        return false;
      }

      // Get audio properties to check if it's lossless
      const audioProps = audioFile.audioProperties();

      if (!audioProps) {
        // If we can't get audio properties, assume it's lossy to be safe
        return false;
      }

      // Use the isLossless property from TagLib-Wasm
      return audioProps.isLossless ?? false;
    } catch {
      // For non-existent files or read errors, just return false without logging
      // This is expected in tests and when checking non-existent paths
      return false;
    } finally {
      if (audioFile) {
        audioFile.dispose();
      }
    }
  }

  // Unknown format
  return false;
}

export function generateOutputPath(
  inputPath: string,
  outputDirectory?: string,
  preserveStructure?: boolean,
  basePath?: string,
): string {
  const inputDir = inputPath.substring(0, inputPath.lastIndexOf("/"));
  const inputFilename = inputPath.substring(inputPath.lastIndexOf("/") + 1);
  const nameWithoutExt = inputFilename.substring(
    0,
    inputFilename.lastIndexOf("."),
  );

  if (outputDirectory && preserveStructure && basePath) {
    // Calculate relative path from base to preserve structure
    let relativePath = "";

    // Check if basePath appears to be a file (has an extension)
    const baseHasExtension = extname(basePath).length > 0;

    if (!baseHasExtension) {
      // Base is a directory path
      relativePath = inputPath.substring(basePath.length);
      if (relativePath.startsWith("/")) {
        relativePath = relativePath.substring(1);
      }
      // Remove filename to get just the directory path
      const lastSlash = relativePath.lastIndexOf("/");
      if (lastSlash > 0) {
        relativePath = relativePath.substring(0, lastSlash);
      } else {
        relativePath = "";
      }
    }
    // If base is a file, no subdirectory structure to preserve

    const outputPath = relativePath
      ? `${outputDirectory}/${relativePath}/${nameWithoutExt}.m4a`
      : `${outputDirectory}/${nameWithoutExt}.m4a`;
    return outputPath;
  }

  const outputDir = outputDirectory || inputDir;
  return `${outputDir}/${nameWithoutExt}.m4a`;
}

/**
 * Extract basic metadata from source file
 */
// deno-lint-ignore no-explicit-any
function extractBasicMetadata(sourceTag: any) {
  return {
    title: sourceTag.title,
    artist: sourceTag.artist,
    album: sourceTag.album,
    year: sourceTag.year,
    track: sourceTag.track,
    genre: sourceTag.genre,
    comment: sourceTag.comment,
  };
}

/**
 * Apply basic metadata to destination file
 */
// deno-lint-ignore no-explicit-any
function applyBasicMetadata(destTag: any, metadata: any) {
  if (metadata.title) destTag.setTitle(metadata.title);
  if (metadata.artist) destTag.setArtist(metadata.artist);
  if (metadata.album) destTag.setAlbum(metadata.album);
  if (metadata.year) destTag.setYear(metadata.year);
  if (metadata.track) destTag.setTrack(metadata.track);
  if (metadata.genre) destTag.setGenre(metadata.genre);
  if (metadata.comment) destTag.setComment(metadata.comment);
}

/**
 * Filter properties that should be copied based on target format
 */
function filterPropertiesToCopy(
  allProperties: Record<string, string[]>,
  _targetPath: string,
): Record<string, string[]> {
  // Properties that are handled separately or shouldn't be copied
  const skipProperties = [
    // Audio properties that are format-specific
    "LENGTH",
    "BITRATE",
    "SAMPLERATE",
    "CHANNELS",
    "CODEC",
    // Cover art - handled separately
    "COVERART",
    "METADATA_BLOCK_PICTURE",
    "APIC",
    "PIC",
  ];

  const propertiesToCopy: Record<string, string[]> = {};
  for (const [key, values] of Object.entries(allProperties)) {
    if (
      !skipProperties.includes(key.toUpperCase()) && values &&
      Array.isArray(values) && values.length > 0
    ) {
      propertiesToCopy[key] = values;
    }
  }
  return propertiesToCopy;
}

/**
 * Format metadata copy information
 */
function formatMetadataInfo(
  propertyCount: number,
  pictureCount: number,
): string {
  let metadataInfo = `ℹ️ Copying metadata: ${propertyCount} tags`;
  if (pictureCount > 0) {
    if (pictureCount === 1) {
      metadataInfo += " (including cover art)";
    } else {
      metadataInfo += ` (including ${pictureCount} images)`;
    }
  }
  return metadataInfo;
}

/**
 * Copy cover art with error handling
 */
function copyCoverArtSafe(
  // deno-lint-ignore no-explicit-any
  pictures: any[] | undefined,
  // deno-lint-ignore no-explicit-any
  destFile: any,
): string | undefined {
  if (!pictures || pictures.length === 0) return undefined;

  try {
    destFile.setPictures(pictures);
    return undefined;
  } catch (error) {
    return `⚠️  Warning: Failed to copy ${pictures.length} cover art image(s): ${
      error instanceof Error ? error.message : String(error)
    }`;
  }
}

/**
 * Copies metadata from source file to destination file using TagLib
 * Uses the PropertyMap API to ensure ALL metadata is preserved
 */
async function copyMetadata(
  sourcePath: string,
  destPath: string,
): Promise<EncodingResult> {
  const taglib = await ensureTagLib();
  let sourceFile = null;
  let destFile = null;

  try {
    // Read both files in parallel for better performance
    const [sourceData, destData] = await Promise.all([
      Deno.readFile(sourcePath),
      Deno.readFile(destPath),
    ]);

    // Open both files
    sourceFile = await taglib.open(sourceData);
    if (!sourceFile) {
      throw new Error("Failed to open source file");
    }

    destFile = await taglib.open(destData);
    if (!destFile) {
      throw new Error("Failed to open destination file");
    }

    // Get all metadata from source
    const sourceTag = sourceFile.tag();
    const basicMetadata = extractBasicMetadata(sourceTag);
    const allProperties = sourceFile.properties() ?? {};
    const pictures = sourceFile.getPictures();

    // Format what we're copying
    const propertyCount = Object.keys(allProperties).length;
    const pictureCount = pictures?.length ?? 0;
    const metadataInfo = formatMetadataInfo(propertyCount, pictureCount);

    // Apply everything to destination
    const destTag = destFile.tag();

    // 1. Copy basic metadata
    applyBasicMetadata(destTag, basicMetadata);

    // 2. Copy all extended properties
    const propertiesToCopy = filterPropertiesToCopy(allProperties, destPath);
    if (Object.keys(propertiesToCopy).length > 0) {
      destFile.setProperties(propertiesToCopy);
    }

    // 3. Copy cover art
    const coverArtWarning = copyCoverArtSafe(pictures, destFile);

    // 4. Add encoder information
    const encoderInfo = `Encoded with amusic v${VERSION} (taglib-wasm)`;
    const existingComment = destTag.comment;
    destTag.setComment(
      existingComment ? `${existingComment}\n${encoderInfo}` : encoderInfo,
    );

    // Save everything in one write operation
    destFile.save();
    const updatedData = destFile.getFileBuffer();
    await Deno.writeFile(destPath, new Uint8Array(updatedData));

    return {
      metadataInfo: coverArtWarning
        ? `${metadataInfo}\n   ${coverArtWarning}`
        : metadataInfo,
      success: "Successfully copied all metadata",
    };
  } finally {
    if (sourceFile) sourceFile.dispose();
    if (destFile) destFile.dispose();
  }
}
