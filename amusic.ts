// amusic.ts
import { parse as parsePath, dirname } from "https://deno.land/std@0.224.0/path/mod.ts";
import { ensureDir } from "https://deno.land/std@0.224.0/fs/ensure_dir.ts";
import { Command } from "https://deno.land/x/cliffy@v1.0.0-rc.4/command/mod.ts";

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

/**
 * Silently checks if the audio file already has AcousticID related tags.
 * Returns true if tags are found, false otherwise.
 */
async function hasAcousticIDTags(filePath: string): Promise<boolean> {
  const command = new Deno.Command("ffprobe", {
    args: [
      "-v", "quiet",
      "-show_entries", "format_tags=ACOUSTID_FINGERPRINT,ACOUSTID_ID",
      "-of", "default=noprint_wrappers=1:nokey=1",
      filePath,
    ],
    stdout: "piped",
    stderr: "piped",
  });
  const { code, stdout, stderr } = await command.output();

  if (code !== 0) {
    const errorOutput = new TextDecoder().decode(stderr).trim();
     // ffprobe can exit with 1 if tags are missing or file has no streams, this is not an "error" for this check.
    if (errorOutput && !errorOutput.includes("does not contain any stream") && !errorOutput.includes("Invalid argument")) {
        // Log a warning if it's an unexpected ffprobe issue.
        // console.warn(`  ffprobe check warning for ${filePath}: ${errorOutput.split("\n")[0]}`);
    }
    return false;
  }
  const outputText = new TextDecoder().decode(stdout).trim();
  return outputText.length > 0;
}

/**
 * Generates the AcousticID fingerprint using fpcalc.
 */
async function generateFingerprint(filePath: string): Promise<string | null> {
  // console.log("  Generating AcoustID fingerprint with fpcalc..."); // Moved to caller
  const command = new Deno.Command("fpcalc", {
    args: ["-plain", filePath],
    stdout: "piped",
    stderr: "piped",
  });
  const { code, stdout, stderr } = await command.output();

  if (code !== 0) {
    console.error(`  fpcalc error: ${new TextDecoder().decode(stderr).split("\n")[0]}`);
    return null;
  }

  const output = new TextDecoder().decode(stdout).trim();
  const match = output.match(/FINGERPRINT=([^\n]+)/);
  if (match && match[1]) {
    return match[1];
  } else {
    console.error("  Could not parse fingerprint from fpcalc output.");
    return null;
  }
}

/**
 * Writes the ACOUSTID_FINGERPRINT tag to the file using ffmpeg.
 */
async function writeAcousticIDFingerprint(filePath: string, fingerprint: string): Promise<boolean> {
  // console.log(`  Writing fingerprint to file with ffmpeg...`); // Moved to caller
  const fileMeta = parsePath(filePath);
  const tempDir = await Deno.makeTempDir({ prefix: "amusic_tagging_" });
  const tempFilePath = `${tempDir}/${fileMeta.name}_tagged${fileMeta.ext}`;

  const command = new Deno.Command("ffmpeg", {
    args: [
      "-loglevel", "error",
      "-i", filePath,
      "-c", "copy",
      "-metadata", `ACOUSTID_FINGERPRINT=${fingerprint}`,
      tempFilePath,
    ],
    stderr: "piped", // Capture stderr for error messages
  });
  const { code, stderr } = await command.output();

  if (code !== 0) {
    console.error(`  ffmpeg error: ${new TextDecoder().decode(stderr).split("\n")[0]}`);
    await Deno.remove(tempDir, { recursive: true }).catch(e => console.warn(`  Could not remove temp dir ${tempDir}: ${e.message}`));
    return false;
  }

  try {
    await Deno.rename(tempFilePath, filePath);
    await Deno.remove(tempDir, { recursive: true }).catch(e => console.warn(`  Could not remove temp dir ${tempDir}: ${e.message}`));
    return true;
  } catch (e) {
    console.error(`  Error replacing original file with tagged version: ${e.message}`);
    await Deno.remove(tempDir, { recursive: true }).catch(e => console.warn(`  Could not remove temp dir ${tempDir}: ${e.message}`));
    return false;
  }
}

/**
 * Core logic for adding AcousticID tags to a single file.
 */
async function processAcousticIDTagging(filePath: string, force: boolean) {
  console.log(`-> Processing file: ${filePath}`);

  try {
    const fileInfo = await Deno.stat(filePath);
    if (!fileInfo.isFile) {
      console.error(`Error: Path "${filePath}" is not a file.`);
      return;
    }
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) {
      console.error(`Error: File not found at "${filePath}".`);
    } else {
      console.error(`Error accessing file "${filePath}": ${e.message}`);
    }
    return;
  }

  console.log("  Checking for existing AcoustID tags...");
  const tagsExist = await hasAcousticIDTags(filePath);

  if (tagsExist && !force) {
    console.log("  INFO: File already has AcoustID tags. Skipping (use --force to overwrite).");
    return;
  }

  if (tagsExist && force) {
    console.log("  INFO: File already has AcoustID tags. --force option provided, proceeding to overwrite.");
  }

  console.log("  ACTION: Generating AcoustID fingerprint...");
  const fingerprint = await generateFingerprint(filePath);

  if (!fingerprint) {
    console.log("  WARNING: Could not generate fingerprint. Skipping.");
    return;
  }
  console.log(`    Generated Fingerprint: ${fingerprint.substring(0, 30)}...`);

  console.log("  ACTION: Writing ACOUSTID_FINGERPRINT tag...");
  const success = await writeAcousticIDFingerprint(filePath, fingerprint);

  if (success) {
    console.log("  SUCCESS: AcoustID fingerprint tag processed.");
  } else {
    console.log("  ERROR: Failed to process AcoustID fingerprint tag.");
  }
}


/**
 * Main CLI entry point.
 */
async function main() {
  // 1. Ensure required command-line tools are available
  await ensureCommandExists("ffmpeg");
  await ensureCommandExists("ffprobe");
  await ensureCommandExists("fpcalc");

  // 2. Define and parse CLI commands and options
  await new Command()
    .name("amusic")
    .version("0.1.0")
    .description("A Musing command-line audio utility.")
    .command( // Define the 'acoustid' subcommand
      "acoustid <filePath:string>", // <filePath:string> makes it a required argument
      new Command() // Configuration for the subcommand itself
        .description("Generate and add AcousticID fingerprint to an audio file.")
        .option("-f, --force", "Force recalculation and saving even if tags already exist.", {
          default: false, // Default value for force
        })
        .action(async (options, filePath) => { // Action for the 'acoustid' subcommand
            // 'options' will contain { force: boolean }, 'filePath' is the argument
            await processAcousticIDTagging(filePath, options.force);
        })
    )
    // Example of how you might add another command in the future:
    // .command("replaygain <filePath:string>", new Command().description("Add ReplayGain tags.").action(...))
    .parse(Deno.args);
}

if (import.meta.main) {
  await main();
}