#!/usr/bin/env -S deno run --allow-read --allow-write --allow-net

/**
 * Downloads the taglib.wasm file for embedding in compiled binaries.
 */

const WASM_URL =
  "https://cdn.jsdelivr.net/npm/taglib-wasm@latest/dist/taglib.wasm";
const OUTPUT_PATH = "./taglib.wasm";

console.log("Downloading taglib.wasm for embedding...");

try {
  const response = await fetch(WASM_URL);
  if (!response.ok) {
    throw new Error(`Failed to download: ${response.statusText}`);
  }

  const wasmData = new Uint8Array(await response.arrayBuffer());
  await Deno.writeFile(OUTPUT_PATH, wasmData);

  console.log(`✓ Downloaded taglib.wasm (${wasmData.length} bytes)`);
  console.log(`✓ Saved to ${OUTPUT_PATH}`);
} catch (error) {
  console.error("Failed to download taglib.wasm:", error);
  Deno.exit(1);
}
