/**
 * Centralized TagLib initialization that handles both development and compiled binaries
 */

import {
  initializeForDenoCompile,
  type TagLib,
} from "jsr:@charlesw/taglib-wasm";

// Singleton instance
let taglibInstance: TagLib | null = null;

/**
 * Initialize TagLib with proper WASM loading for both dev and compiled environments
 */
export async function ensureTagLib(): Promise<TagLib> {
  if (!taglibInstance) {
    // Use the canonical initialization method that automatically handles:
    // - Detection of compiled vs development mode
    // - Loading embedded WASM in compiled mode
    // - Falling back to CDN in development or if embedded WASM not found
    taglibInstance = await initializeForDenoCompile();
  }
  return taglibInstance!;
}
