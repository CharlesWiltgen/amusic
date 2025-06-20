import { join } from "jsr:@std/path";
import { processAcoustIDTagging } from "../lib/acoustid.ts";
import { calculateReplayGain } from "../lib/replaygain.ts";
import { getVendorBinaryPath } from "../lib/vendor_tools.ts";
import type { CommandOptions } from "../types/command.ts";
import { ensureCommandExists } from "../utils/command.ts";
import { ProcessingStats } from "../utils/processing_stats.ts";
import { exitWithError, validateDirectory } from "../utils/console_output.ts";

export async function easyCommand(
  options: CommandOptions,
  library: string,
): Promise<void> {
  if (!options.apiKey) {
    exitWithError(
      "Error: --api-key is required for AcoustID lookups in easy mode.",
    );
  }

  const fpcalcPath = getVendorBinaryPath("fpcalc");
  const rsgainPath = getVendorBinaryPath("rsgain");

  await ensureCommandExists(fpcalcPath);
  await ensureCommandExists(rsgainPath);

  await validateDirectory(library);

  const stats = new ProcessingStats();

  for await (const entry of Deno.readDir(library)) {
    if (!entry.isDirectory) continue;
    const albumDir = join(library, entry.name);
    if (!options.quiet) console.log(`\nProcessing album: ${albumDir}`);
    const result = await calculateReplayGain(albumDir, options.quiet);
    if (!result.success) {
      console.error(
        `  ERROR: ReplayGain calculation failed for album "${albumDir}". Skipping AcousticID tagging for this album.`,
      );
      continue;
    }

    for await (const fileEntry of Deno.readDir(albumDir)) {
      if (!fileEntry.isFile) continue;
      const filePath = join(albumDir, fileEntry.name);
      if (!options.quiet) console.log("");
      try {
        const status = await processAcoustIDTagging(
          filePath,
          options.apiKey!,
          options.force || false,
          options.quiet || false,
          options.dryRun || false,
        );
        stats.increment(status);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`Unexpected error processing ${filePath}: ${msg}`);
        stats.incrementFailed();
      }
    }
  }

  stats.printSummary("Easy Mode Complete", options.dryRun);
}
