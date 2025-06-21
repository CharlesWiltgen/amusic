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

export async function encodeToM4A(
  inputPath: string,
  outputPath: string,
  options: EncodingOptions = {},
): Promise<void> {
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
    console.log(`[DRY RUN] Would encode: ${inputPath} -> ${outputPath}`);
    return;
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
      "3", // VBR mode 3
      "-q",
      "127", // Quality 127 (highest quality)
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
    await copyMetadata(inputPath, outputPath);
  } catch (error) {
    // Log but don't fail if metadata copy fails
    console.error(
      `Warning: Failed to copy metadata: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
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
      return audioProps.isLossless || false;
    } catch (_error) {
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
 * Copies metadata from source file to destination file using TagLib
 * Uses the PropertyMap API to ensure ALL metadata is preserved
 */
async function copyMetadata(
  sourcePath: string,
  destPath: string,
): Promise<void> {
  const taglib = await ensureTagLib();
  let sourceFile = null;
  let destFile = null;

  try {
    // Read source file
    const sourceData = await Deno.readFile(sourcePath);
    sourceFile = await taglib.open(sourceData, sourcePath);

    if (!sourceFile) {
      throw new Error("Failed to open source file");
    }

    // Get basic metadata
    const sourceTag = sourceFile.tag();
    const basicMetadata = {
      title: sourceTag.title,
      artist: sourceTag.artist,
      album: sourceTag.album,
      year: sourceTag.year,
      track: sourceTag.track,
      genre: sourceTag.genre,
      comment: sourceTag.comment,
    };

    // Get ALL metadata using properties() method
    // @ts-ignore: properties exists at runtime
    const allProperties = sourceFile.properties() || {};

    // Count properties for logging
    const propertyCount = Object.keys(allProperties).length;
    const basicCount = Object.values(basicMetadata).filter((v) =>
      v !== undefined && v !== null
    ).length;
    console.log(
      `   Copying metadata: ${basicCount} basic properties, ${propertyCount} total properties found`,
    );

    // Get cover art separately (still needed as PropertyMap doesn't handle pictures)
    const pictures = sourceFile.getPictures();

    // Now open destination file
    const destData = await Deno.readFile(destPath);
    destFile = await taglib.open(destData, destPath);

    if (!destFile) {
      throw new Error("Failed to open destination file");
    }

    // Copy basic metadata first (for compatibility)
    const destTag = destFile.tag();
    if (basicMetadata.title) destTag.setTitle(basicMetadata.title);
    if (basicMetadata.artist) destTag.setArtist(basicMetadata.artist);
    if (basicMetadata.album) destTag.setAlbum(basicMetadata.album);
    if (basicMetadata.year) destTag.setYear(basicMetadata.year);
    if (basicMetadata.track) destTag.setTrack(basicMetadata.track);
    if (basicMetadata.genre) destTag.setGenre(basicMetadata.genre);
    if (basicMetadata.comment) destTag.setComment(basicMetadata.comment);

    // Copy ALL properties using setProperties()
    // List of properties to skip (format-specific or would cause issues)
    const skipProperties = [
      // These are handled by basic tag methods above
      "TITLE",
      "ARTIST",
      "ALBUM",
      "DATE",
      "TRACKNUMBER",
      "GENRE",
      "COMMENT",
      // Format-specific picture tags that shouldn't be copied directly
      "COVERART",
      "METADATA_BLOCK_PICTURE",
      "APIC",
      "PIC",
      // File-specific properties that shouldn't be copied
      "LENGTH",
      "BITRATE",
      "SAMPLERATE",
      "CHANNELS",
    ];

    // Filter out properties that should be skipped
    const propertiesToCopy: Record<string, string[]> = {};
    for (const [key, values] of Object.entries(allProperties)) {
      if (
        !skipProperties.includes(key.toUpperCase()) && values &&
        Array.isArray(values) && values.length > 0
      ) {
        propertiesToCopy[key] = values;
      }
    }

    // Copy all filtered properties at once
    if (Object.keys(propertiesToCopy).length > 0) {
      // @ts-ignore: setProperties exists at runtime
      destFile.setProperties(propertiesToCopy);
    }

    // Add encoder information
    const encoderInfo = `Encoded with amusic v${VERSION} (taglib-wasm)`;
    const existingComment = destTag.comment;
    destTag.setComment(
      existingComment ? `${existingComment}\n${encoderInfo}` : encoderInfo,
    );

    // Handle cover art
    if (pictures && pictures.length > 0) {
      console.log(
        `Note: ${pictures.length} cover art images found but not copied (API limitation)`,
      );
      // TODO: When taglib-wasm adds picture copying support, implement it here
    }

    // Save the destination file
    destFile.save();
    const updatedData = destFile.getFileBuffer();
    await Deno.writeFile(destPath, new Uint8Array(updatedData));

    console.log(
      `Successfully copied ${
        Object.keys(allProperties).length
      } metadata properties`,
    );
  } finally {
    if (sourceFile) sourceFile.dispose();
    if (destFile) destFile.dispose();
  }
}
