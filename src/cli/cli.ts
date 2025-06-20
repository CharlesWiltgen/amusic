import { Command } from "jsr:@cliffy/command@1.0.0-rc.7";
import { defaultCommand } from "../commands/default.ts";
import { easyCommand } from "../commands/easy.ts";
import { encodeCommand } from "../commands/encode.ts";
import { VERSION } from "../version.ts";
import { dirname, fromFileUrl, join } from "jsr:@std/path";
import { loadSync } from "jsr:@std/dotenv";

const __dirname = dirname(fromFileUrl(import.meta.url));

export function setupCLI() {
  // Load environment variables from .env file
  try {
    loadSync({ export: true, envPath: join(__dirname, "..", ".env") });
  } catch {
    // ignore missing or invalid .env
  }

  const program = new Command()
    .name("amusic")
    .version(VERSION)
    .description(
      "Calculate ReplayGain and embed AcousticID fingerprints and IDs.",
    )
    // Default command options
    .option("-f, --force", "Force reprocessing even if tags exist.")
    .option(
      "-q, --quiet",
      "Suppress informational output. Errors are still shown.",
      { default: false },
    )
    .option(
      "--show-tags",
      "Display existing AcoustID tags and exit. No modifications made.",
    )
    .option(
      "--dry-run",
      "Simulate processing and API lookups but do not write any tags to files.",
    )
    .option(
      "--api-key <key:string>",
      "AcoustID API key (required for lookups).",
      { default: Deno.env.get("ACOUSTID_API_KEY") },
    )
    .arguments("<...files:string>")
    .action(defaultCommand);

  // Add easy subcommand
  program
    .command(
      "easy <library:string>",
      "Calculate ReplayGain and AcousticID for each album in a library root directory (each album in its own folder).",
    )
    .option(
      "-f, --force",
      "Force reprocessing AcoustID fingerprints even if tags exist.",
    )
    .option(
      "-q, --quiet",
      "Suppress informational output. Errors are still shown.",
      { default: false },
    )
    .option(
      "--dry-run",
      "Simulate processing and API lookups but do not write any tags to files.",
      { default: false },
    )
    .option(
      "--api-key <key:string>",
      "AcoustID API key (required for lookups).",
      { default: Deno.env.get("ACOUSTID_API_KEY") },
    )
    .action(easyCommand);

  // Add encode subcommand
  program
    .command(
      "encode <files...:string>",
      "Encode audio files to M4A/AAC format. By default only encodes from lossless sources (WAV, FLAC, M4A).",
    )
    .option(
      "--force-lossy-transcodes",
      "Allow transcoding from lossy formats (MP3, OGG). Not recommended due to quality loss.",
      { default: false },
    )
    .option(
      "-o, --output-dir <dir:string>",
      "Output directory for encoded files. Defaults to same directory as source files.",
    )
    .option(
      "--flatten-output",
      "When using --output-dir, put all output files in a single directory (disables directory structure preservation).",
      { default: false },
    )
    .option(
      "-q, --quiet",
      "Suppress informational output. Errors are still shown.",
      { default: false },
    )
    .option(
      "--dry-run",
      "Simulate encoding but do not write any files.",
      { default: false },
    )
    .action(encodeCommand);

  return program;
}
