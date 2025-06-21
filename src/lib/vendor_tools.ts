import { dirname, fromFileUrl, join } from "jsr:@std/path";

/**
 * Detects if the code is running in a compiled Deno binary.
 */
function isDenoCompiled(): boolean {
  return typeof Deno !== "undefined" &&
    typeof Deno.mainModule === "string" &&
    Deno.mainModule.includes("/deno-compile-");
}

/**
 * Determine the platform-specific vendor binary path for the given tool.
 * Supports 'fpcalc' and 'rsgain'.
 */
export function getVendorBinaryPath(
  tool: "fpcalc" | "rsgain",
): string {
  const os = Deno.build.os; // 'darwin', 'linux', 'windows'
  const arch = Deno.build.arch; // e.g., 'x86_64', 'aarch64'

  let vendorOs: string;
  if (os === "darwin") {
    vendorOs = "macos";
  } else if (os === "linux") {
    vendorOs = "linux";
  } else if (os === "windows") {
    vendorOs = "windows";
  } else {
    throw new Error(`Unsupported OS for vendor binaries: ${os}`);
  }

  let vendorArch: string;
  if (arch === "x86_64") {
    vendorArch = "x86_64";
  } else if (arch === "aarch64") {
    vendorArch = "arm64";
  } else {
    throw new Error(`Unsupported architecture for vendor binaries: ${arch}`);
  }

  const platformDir = `${vendorOs}-${vendorArch}`;
  const binaryName = tool + (os === "windows" ? ".exe" : "");

  let vendorPath: string;

  if (isDenoCompiled()) {
    // In compiled mode, binaries are included in the executable
    // The extraction preserves the src/vendor structure from --include=src/vendor
    const baseUrl = new URL(
      `../../src/vendor/${platformDir}/${tool}/${binaryName}`,
      import.meta.url,
    );
    vendorPath = fromFileUrl(baseUrl);
  } else {
    // In development mode, use the relative path from source
    const baseDir = dirname(fromFileUrl(import.meta.url));
    const toolDir = join(baseDir, "../vendor", platformDir, tool);
    vendorPath = join(toolDir, binaryName);
  }

  // Ensure the vendor binary exists; fail if missing
  try {
    const info = Deno.statSync(vendorPath);
    if (info.isFile) {
      return vendorPath;
    }
  } catch {
    // vendorPath stat failed
  }
  throw new Error(
    `Vendored binary for "${tool}" not found at "${vendorPath}". ` +
      `Please ensure the vendor/${platformDir}/${tool}/${binaryName} binary is present.`,
  );
}
