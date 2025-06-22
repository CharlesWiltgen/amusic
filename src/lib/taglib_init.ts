/**
 * Centralized TagLib initialization that handles both development and compiled binaries
 */

import { TagLib } from "npm:taglib-wasm@latest";

// Singleton instance
let taglibInstance: TagLib | null = null;

/**
 * Initialize TagLib with proper WASM loading for both dev and compiled environments
 */
export async function ensureTagLib(): Promise<TagLib> {
  if (!taglibInstance) {
    // Initialize TagLib - it will automatically handle WASM loading
    taglibInstance = await TagLib.initialize();
  }
  return taglibInstance!;
}
