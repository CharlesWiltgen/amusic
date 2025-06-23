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
    // Use initializeForDenoCompile which automatically handles
    // both development mode and compiled binary mode
    taglibInstance = await initializeForDenoCompile();
  }
  return taglibInstance!;
}
