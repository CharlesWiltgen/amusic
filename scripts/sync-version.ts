#!/usr/bin/env -S deno run --allow-read --allow-write

import { Command } from "jsr:@cliffy/command@1.0.0-rc.7";
import { parse } from "https://deno.land/std@0.224.0/semver/mod.ts";
import { increment } from "https://deno.land/std@0.224.0/semver/increment.ts";

const DENO_JSON_PATH = "./deno.json";

interface DenoConfig {
  name: string;
  version: string;
  [key: string]: unknown;
}

async function readDenoJson(): Promise<DenoConfig> {
  const content = await Deno.readTextFile(DENO_JSON_PATH);
  return JSON.parse(content);
}

async function writeDenoJson(config: DenoConfig): Promise<void> {
  const content = JSON.stringify(config, null, 2) + "\n";
  await Deno.writeTextFile(DENO_JSON_PATH, content);
}

async function getCurrentVersion(): Promise<string> {
  const config = await readDenoJson();
  return config.version;
}

async function setVersion(newVersion: string): Promise<void> {
  const config = await readDenoJson();
  config.version = newVersion;
  await writeDenoJson(config);
  console.log(`✅ Version updated to ${newVersion}`);
}

async function bumpVersion(
  releaseType: "patch" | "minor" | "major",
): Promise<void> {
  const currentVersion = await getCurrentVersion();
  const semver = parse(currentVersion);

  if (!semver) {
    console.error(`❌ Invalid version format: ${currentVersion}`);
    Deno.exit(1);
  }

  const newVersion = increment(semver, releaseType);
  if (!newVersion) {
    console.error(`❌ Failed to increment version: ${currentVersion}`);
    Deno.exit(1);
  }

  await setVersion(newVersion.toString());
}

const command = new Command()
  .name("sync-version")
  .version(await getCurrentVersion())
  .description("Manage version in deno.json")
  .command("patch", "Increment patch version (0.0.X)")
  .action(async () => {
    await bumpVersion("patch");
  })
  .command("minor", "Increment minor version (0.X.0)")
  .action(async () => {
    await bumpVersion("minor");
  })
  .command("major", "Increment major version (X.0.0)")
  .action(async () => {
    await bumpVersion("major");
  })
  .command("set <version:string>", "Set specific version")
  .action(async (_, version) => {
    await setVersion(version);
  })
  .command("check", "Display current version")
  .action(async () => {
    const version = await getCurrentVersion();
    console.log(`Current version: ${version}`);
  });

if (import.meta.main) {
  await command.parse(Deno.args);
}
