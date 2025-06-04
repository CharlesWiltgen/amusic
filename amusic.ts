// amusic.ts
import { Command } from "https://deno.land/x/cliffy@v1.0.0-rc.4/command/mod.ts";
import { processAcousticIDTagging } from "./lib/acoustid.ts";

/**
 * Checks if a command is available in the system PATH.
 * Exits the script if a command is not found.
 */
async function ensureCommandExists(command: string): Promise<void> {
  try {
    const cmd = new Deno.Command(command, {
      args: ["-version"], // Most tools support -version or --version
      stdout: "piped", // Suppress output during check
      stderr: "piped", // Suppress output during check
    });
    await cmd.output();
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) {
      console.error(
        `Error: Command "${command}" not found. Please ensure it is installed and in your PATH.`,
      );
      Deno.exit(1);
    }
    // If it's another error (e.g., -version is not the right flag but command exists),
    // we assume it exists for this check. Actual calls later will handle specific execution errors.
    // console.warn(`Notice: Could not verify version for "${command}" (may not use -version flag), but proceeding.`);
  }
}

// Functions `hasAcousticIDTags`, `generateFingerprint`, `writeAcousticIDFingerprint`,
// and `processAcousticIDTagging` have been moved to lib/acoustid.ts