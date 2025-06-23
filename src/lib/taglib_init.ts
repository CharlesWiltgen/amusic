/**
 * Centralized TagLib initialization that handles both development and compiled binaries
 */

import {
  initializeForDenoCompile,
  type TagLib,
} from "jsr:@charlesw/taglib-wasm@0.5.4";

// Singleton instance
let taglibInstance: TagLib | null = null;

/**
 * Initialize TagLib with proper WASM loading for both dev and compiled environments
 */
export async function ensureTagLib(
  options?: { useWorkerPool?: boolean },
): Promise<TagLib> {
  if (!taglibInstance) {
    // Use initializeForDenoCompile which automatically handles
    // both development mode and compiled binary mode
    taglibInstance = await initializeForDenoCompile();

    // Enable worker pool mode globally after initialization if requested
    if (options?.useWorkerPool ?? true) {
      // Worker pool is configured at the folder scan level in v0.5.x
      // The global setWorkerPoolMode is not needed with initializeForDenoCompile
    }
  }
  return taglibInstance!;
}
