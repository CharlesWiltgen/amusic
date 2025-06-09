// @ts-nocheck
// scripts/sign_macos.ts
// Automatically un-quarantine and ad-hoc code sign the 'dist/amusic' binary on macOS.
if (Deno.build.os !== "darwin") {
  console.log("Skipping macOS codesign/unquarantine: not on Darwin.");
  Deno.exit(0);
}

const binaryPath = "dist/amusic";

async function runCommand(cmd: string[]) {
  const p = Deno.run({ cmd, stdout: "inherit", stderr: "inherit" });
  const status = await p.status();
  p.close();
  if (!status.success) {
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
} catch (err) {
  console.error("Error during macOS code-sign/unquarantine:", err);
  Deno.exit(1);
}
