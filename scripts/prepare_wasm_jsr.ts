#!/usr/bin/env -S deno run --allow-read --allow-write --allow-net

/**
 * Prepares the taglib.wasm file for embedding in compiled binaries using JSR package
 */

import { prepareWasmForEmbedding } from "jsr:@charlesw/taglib-wasm";

const OUTPUT_PATH = "./taglib.wasm";

console.log("Preparing taglib.wasm for embedding...");

try {
  await prepareWasmForEmbedding(OUTPUT_PATH);
  console.log(`✓ WASM file prepared at ${OUTPUT_PATH}`);
  console.log("✓ Ready for compilation with --include taglib.wasm");
} catch (error) {
  console.error("Failed to prepare taglib.wasm:", error);
  Deno.exit(1);
}
