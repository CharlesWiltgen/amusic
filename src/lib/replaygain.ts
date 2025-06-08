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
  if (!quiet) {
    console.log("  ACTION: Calculating ReplayGain for album...");
  }
  const rsgainPath = getVendorBinaryPath("rsgain");
  const command = new Deno.Command(rsgainPath, {
    args: [targetPath],
    stdout: "inherit",
    stderr: "inherit",
  });
  const { code } = await command.output();
  return code === 0;
}
