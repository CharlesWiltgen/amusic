import { getVendorBinaryPath } from "./vendor_tools.ts";

/**
 * Calculates and embeds ReplayGain metadata for the given target directory or file
 * using the platform-specific rsgain vendor binary.
 *
 * @param targetPath Path to the album directory or audio file.
 * @param quiet Whether to suppress informational output.
 * @returns True if rsgain exited with code 0, false otherwise.
 */
export async function calculateReplayGain(
  targetPath: string,
  quiet: boolean,
): Promise<boolean> {
  // Determine mode based on directory (easy) or file (custom)
  let mode = "custom";
  let actionDesc = "file";
  try {
    const info = await Deno.stat(targetPath);
    if (info.isDirectory) {
      mode = "easy";
      actionDesc = "album";
    }
  } catch {
    // If stat fails, default to custom mode on file
  }
  if (!quiet) {
    console.log(`  ACTION: Calculating ReplayGain for ${actionDesc}...`);
  }
  const rsgainPath = getVendorBinaryPath("rsgain");
  const command = new Deno.Command(rsgainPath, {
    args: [mode, targetPath],
    stdout: quiet ? "null" : "inherit",
    stderr: quiet ? "null" : "inherit",
  });
  const { code } = await command.output();
  return code === 0;
}
