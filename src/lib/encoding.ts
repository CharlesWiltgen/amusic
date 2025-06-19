// encoding.ts
import { extname } from "jsr:@std/path";
import { TagLib } from "taglib-wasm";
import { VERSION } from "../amusic.ts";

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
    let audioFile = null;
    try {
      // Initialize TagLib
      const taglib = await TagLib.initialize();

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
  const taglib = await TagLib.initialize();
  let sourceFile = null;
  let destFile = null;

  try {
    // Read source file
    const sourceData = await Deno.readFile(sourcePath);
    sourceFile = await taglib.open(sourceData);

    if (!sourceFile) {
      throw new Error("Failed to open source file");
    }

    // Get ALL metadata using properties() - this preserves everything
    const allMetadata = sourceFile.properties();

    // Get cover art separately (not included in properties)
    const pictures = sourceFile.getPictures();

    // Debug: log basic metadata
    console.log(
      `Copying metadata: ${Object.keys(allMetadata).length} properties found`,
    );

    // Now open destination file
    const destData = await Deno.readFile(destPath);
    destFile = await taglib.open(destData);

    if (!destFile) {
      throw new Error("Failed to open destination file");
    }

    // Copy ALL metadata properties at once
    destFile.setProperties(allMetadata);

    // Add encoder information
    destFile.setProperty("ENCODER", `amusic v${VERSION} (taglib-wasm)`);
    destFile.setProperty("ENCODER_SETTINGS", "afconvert -d aac -s 3 -q 127");

    // Copy cover art
    if (pictures && pictures.length > 0) {
      for (const picture of pictures) {
        destFile.addPicture(picture);
      }
    }

    // Save the destination file
    destFile.save();
    const updatedData = destFile.getFileBuffer();
    await Deno.writeFile(destPath, new Uint8Array(updatedData));
  } finally {
    if (sourceFile) sourceFile.dispose();
    if (destFile) destFile.dispose();
  }
}
