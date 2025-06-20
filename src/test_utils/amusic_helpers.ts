// Helpers specific to testing the amusic CLI
import { resolve } from "jsr:@std/path";
import { getAcoustIDTags, writeAcoustIDTags } from "../lib/tagging.ts";

export interface AmusicRunResult {
  code: number;
  stdout: string;
  stderr: string;
}

const AMUSIC_SCRIPT_PATH = "./src/amusic.ts";

/**
 * Runs the amusic.ts script with the specified arguments
 */
export async function runAmusicScript(
  args: string[],
  cwd: string,
  env?: Record<string, string>,
): Promise<AmusicRunResult> {
  const scriptPath = resolve(AMUSIC_SCRIPT_PATH);
  const importMapPath = resolve("import_map.json");
  const command = new Deno.Command(Deno.execPath(), {
    args: [
      "run",
      `--import-map=${importMapPath}`,
      "--allow-read",
      "--allow-write",
      "--allow-run",
      "--allow-env",
      "--allow-net",
      scriptPath,
      ...args,
    ],
    cwd: cwd,
    stdout: "piped",
    stderr: "piped",
    env: env,
  });
  const { code, stdout, stderr } = await command.output();
  return {
    code,
    stdout: new TextDecoder().decode(stdout),
    stderr: new TextDecoder().decode(stderr),
  };
}

/**
 * Gets the AcoustID fingerprint tag from a file
 */
export async function getAcousticIDFingerprintTag(
  filePath: string,
): Promise<string | null> {
  const tags = await getAcoustIDTags(filePath);
  return tags?.ACOUSTID_FINGERPRINT || null;
}

/**
 * Gets the AcoustID ID tag from a file
 */
export async function getAcousticIDTag(
  filePath: string,
): Promise<string | null> {
  const tags = await getAcoustIDTags(filePath);
  return tags?.ACOUSTID_ID || null;
}

/**
 * Sets AcoustID tags on a file
 */
export async function setAcousticIDTags(
  filePath: string,
  id: string,
  fingerprint: string,
): Promise<void> {
  const { exists } = await import("jsr:@std/fs");

  if (!await exists(filePath, { isFile: true })) {
    throw new Error(`File not found at ${filePath}, cannot set tags.`);
  }

  const success = await writeAcoustIDTags(filePath, fingerprint, id);
  if (!success) {
    throw new Error(`Failed to set AcoustID tags for ${filePath}`);
  }
}
