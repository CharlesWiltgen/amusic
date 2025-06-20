// @ts-nocheck: Uses Deno.Command API that may not be available in all type definitions
// scripts/sign_macos.ts
// Automatically un-quarantine and ad-hoc code sign the 'dist/amusic' binary on macOS.
if (Deno.build.os !== "darwin") {
  console.log("Skipping macOS codesign/unquarantine: not on Darwin.");
  Deno.exit(0);
}

const binaryPath = "dist/amusic";

async function runCommand(cmd: string[]) {
  const command = new Deno.Command(cmd[0], {
    args: cmd.slice(1),
    stdout: "inherit",
    stderr: "inherit",
  });
  const { success } = await command.output();
  if (!success) {
    throw new Error(`Command failed: ${cmd.join(" ")}`);
  }
}

try {
  console.log("Un-quarantining 'dist/amusic'...");
  await runCommand(["xattr", "-r", "-d", "com.apple.quarantine", binaryPath]);

  console.log("Code-signing 'dist/amusic' (ad-hoc)...");
  await runCommand([
    "codesign",
    "--force",
    "--deep",
    "--sign",
    "-",
    binaryPath,
  ]);

  // Create/update symlink to /usr/local/bin
  console.log("Creating/updating symlink to /usr/local/bin/amusic...");
  const absoluteBinaryPath = await Deno.realPath(binaryPath);

  // Ensure /usr/local/bin exists
  try {
    await Deno.mkdir("/usr/local/bin", { recursive: true });
  } catch {
    // Directory might already exist
  }

  // Remove existing symlink if it exists
  try {
    await Deno.remove("/usr/local/bin/amusic");
  } catch {
    // Symlink might not exist
  }

  // Create new symlink
  await Deno.symlink(absoluteBinaryPath, "/usr/local/bin/amusic");
  console.log(
    "✅ Symlink created: /usr/local/bin/amusic -> " + absoluteBinaryPath,
  );
  console.log("You can now run 'amusic' from any terminal window!");
} catch (err) {
  console.error("Error during macOS code-sign/unquarantine:", err);
  Deno.exit(1);
}
