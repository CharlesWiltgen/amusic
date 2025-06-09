import { dirname, fromFileUrl, join } from "jsr:@std/path";

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
  const baseDir = dirname(fromFileUrl(import.meta.url));
  const toolDir = join(baseDir, "../vendor", platformDir, tool);
  const binaryName = tool + (os === "windows" ? ".exe" : "");
  const vendorPath = join(toolDir, binaryName);
  try {
    const info = Deno.statSync(vendorPath);
    if (info.isFile) {
      return vendorPath;
    }
  } catch {
    // Vendor binary not present; fall back to system-installed tool
  }
  console.warn(
    `Vendor binary for "${tool}" not found at "${vendorPath}"; falling back to "${binaryName}" from PATH.`,
  );
  return binaryName;
}
