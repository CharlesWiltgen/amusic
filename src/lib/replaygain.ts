import { getVendorBinaryPath } from "./vendor_tools.ts";
import { join } from "jsr:@std/path";

export interface ReplayGainResult {
  success: boolean;
  data?: {
    [filePath: string]: {
      trackGain: number;
      trackPeak: number;
      albumGain?: number;
      albumPeak?: number;
    };
  };
}

/**
 * Calculates and embeds ReplayGain metadata for the given target directory or file
 * using the platform-specific rsgain vendor binary.
 *
 * @param targetPath Path to the album directory or audio file.
 * @param quiet Whether to suppress informational output.
 * @param returnData Whether to parse and return the calculated ReplayGain values.
 * @returns ReplayGainResult with success status and optional calculated data.
 */
export async function calculateReplayGain(
  targetPath: string,
  quiet: boolean,
  returnData = false,
): Promise<ReplayGainResult> {
  // Determine mode based on directory (easy) or file (custom)
  let mode = "custom";
  let actionDesc = "file";
  let outputFile: string | undefined;

  try {
    const info = await Deno.stat(targetPath);
    if (info.isDirectory) {
      mode = "easy";
      actionDesc = "album";
      if (returnData) {
        outputFile = join(targetPath, "replaygain_data.csv");
      }
    }
  } catch {
    // If stat fails, default to custom mode on file
  }

  if (!quiet) {
    console.log(`  ACTION: Calculating ReplayGain for ${actionDesc}...`);
  }

  const rsgainPath = getVendorBinaryPath("rsgain");
  const args = [mode];

  // Add output option if we want to return data
  if (returnData && outputFile) {
    args.push("--output");
  }

  args.push(targetPath);

  const command = new Deno.Command(rsgainPath, {
    args,
    stdout: quiet ? "null" : "inherit",
    stderr: quiet ? "null" : "inherit",
  });

  const { code } = await command.output();
  const success = code === 0;

  if (!success) {
    return { success: false };
  }

  // If we don't need data or there's no output file, return just success
  if (!returnData || !outputFile) {
    return { success: true };
  }

  // Try to read and parse the CSV output
  try {
    const csvContent = await Deno.readTextFile(outputFile);
    const data = parseReplayGainCSV(csvContent);

    // Clean up the temporary CSV file
    try {
      await Deno.remove(outputFile);
    } catch {
      // Ignore cleanup errors
    }

    return { success: true, data };
  } catch (error) {
    console.error(`  Warning: Could not parse ReplayGain data: ${error}`);
    return { success: true }; // Still successful, just no data
  }
}

/**
 * Parses ReplayGain CSV output from rsgain.
 */
function parseReplayGainCSV(csvContent: string): Record<string, {
  trackGain: number;
  trackPeak: number;
  albumGain?: number;
  albumPeak?: number;
}> {
  const lines = csvContent.trim().split("\n");
  const data: Record<string, {
    trackGain: number;
    trackPeak: number;
    albumGain?: number;
    albumPeak?: number;
  }> = {};

  for (const line of lines) {
    if (line.startsWith("#") || !line.trim()) continue; // Skip comments and empty lines

    const columns = line.split("\t");
    if (columns.length < 3) continue;

    const [filePath, trackGainStr, trackPeakStr, albumGainStr, albumPeakStr] =
      columns;

    if (filePath && trackGainStr && trackPeakStr) {
      data[filePath] = {
        trackGain: parseFloat(trackGainStr),
        trackPeak: parseFloat(trackPeakStr),
      };

      if (albumGainStr && albumPeakStr) {
        data[filePath].albumGain = parseFloat(albumGainStr);
        data[filePath].albumPeak = parseFloat(albumPeakStr);
      }
    }
  }

  return data;
}
