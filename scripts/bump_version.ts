#!/usr/bin/env -S deno run --allow-read --allow-write

/**
 * Bump the version in deno.json
 * Usage: deno run --allow-read --allow-write scripts/bump_version.ts [major|minor|patch|x.y.z]
 */

const args = Deno.args;
if (args.length !== 1) {
  console.error("Usage: bump_version.ts [major|minor|patch|x.y.z]");
  Deno.exit(1);
}

const denoConfigPath = "deno.json";
const denoConfig = JSON.parse(await Deno.readTextFile(denoConfigPath));
const currentVersion = denoConfig.version || "0.0.0";

function parseVersion(version: string): [number, number, number] {
  const parts = version.split(".").map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) {
    throw new Error(`Invalid version format: ${version}`);
  }
  return parts as [number, number, number];
}

function bumpVersion(current: string, type: string): string {
  // If type is a version string, use it directly
  if (type.includes(".")) {
    parseVersion(type); // Validate format
    return type;
  }

  const [major, minor, patch] = parseVersion(current);

  switch (type) {
    case "major":
      return `${major + 1}.0.0`;
    case "minor":
      return `${major}.${minor + 1}.0`;
    case "patch":
      return `${major}.${minor}.${patch + 1}`;
    default:
      throw new Error(
        `Invalid bump type: ${type}. Use major, minor, patch, or a version string.`,
      );
  }
}

try {
  const newVersion = bumpVersion(currentVersion, args[0]);
  denoConfig.version = newVersion;

  // Write back to deno.json with proper formatting
  await Deno.writeTextFile(
    denoConfigPath,
    JSON.stringify(denoConfig, null, 2) + "\n",
  );

  console.log(`Version bumped from ${currentVersion} to ${newVersion}`);
  console.log("\nNext steps:");
  console.log(
    `1. Commit: git add deno.json && git commit -m "chore: bump version to ${newVersion}"`,
  );
  console.log(`2. Push: git push origin main`);
  console.log(
    `3. Tag: git tag v${newVersion} && git push origin v${newVersion}`,
  );
} catch (error) {
  console.error(`Error: ${error.message}`);
  Deno.exit(1);
}
