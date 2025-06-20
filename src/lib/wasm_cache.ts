// Removed @deno/cache-dir import as we're using manual cache paths
import { join } from "jsr:@std/path";
import { ensureDir } from "jsr:@std/fs";

const CDN_URL =
  "https://cdn.jsdelivr.net/npm/taglib-wasm@latest/dist/taglib.wasm";

interface CacheMetadata {
  etag: string;
  downloadedAt: string;
  size: number;
}

/**
 * Manages caching of the taglib WASM file in the Deno cache directory.
 */
export class WasmCache {
  private cacheDir: string;
  private wasmPath: string;
  private metaPath: string;

  constructor() {
    // Use standard Deno cache directory
    const home = Deno.env.get("HOME") || Deno.env.get("USERPROFILE") || "";
    const cacheBase = Deno.build.os === "windows"
      ? join(home, "AppData", "Local", "deno")
      : join(home, ".cache", "deno");
    this.cacheDir = join(cacheBase, "amusic", "lib-cache");
    this.wasmPath = join(this.cacheDir, "taglib.wasm");
    this.metaPath = join(this.cacheDir, "taglib.wasm.meta.json");
  }

  /**
   * Gets the cached WASM data, downloading if necessary.
   * @returns The WASM file data as Uint8Array
   */
  async getWasmData(): Promise<Uint8Array> {
    await ensureDir(this.cacheDir);

    // Check if cache exists and is valid
    const cachedData = await this.getCachedData();
    if (cachedData) {
      // Validate cache with CDN
      const isValid = await this.validateCache();
      if (isValid) {
        return cachedData;
      }
    }

    // Download fresh copy
    console.log("Downloading taglib.wasm from CDN...");
    return await this.downloadAndCache();
  }

  /**
   * Gets cached WASM data if it exists.
   */
  private async getCachedData(): Promise<Uint8Array | null> {
    try {
      const [wasmData, metaText] = await Promise.all([
        Deno.readFile(this.wasmPath),
        Deno.readTextFile(this.metaPath),
      ]);

      const metadata: CacheMetadata = JSON.parse(metaText);

      // Basic validation - check size matches
      if (wasmData.length !== metadata.size) {
        console.warn("Cached WASM size mismatch, will re-download");
        return null;
      }

      return wasmData;
    } catch {
      // Cache doesn't exist or is corrupted
      return null;
    }
  }

  /**
   * Validates the cached version against the CDN using ETags.
   * @returns true if cache is still valid, false if it needs updating
   */
  private async validateCache(): Promise<boolean> {
    try {
      const metaText = await Deno.readTextFile(this.metaPath);
      const metadata: CacheMetadata = JSON.parse(metaText);

      // Make HEAD request to check ETag
      const response = await fetch(CDN_URL, { method: "HEAD" });
      if (!response.ok) {
        // If we can't reach CDN, assume cache is valid
        console.warn("Cannot reach CDN, using cached version");
        return true;
      }

      const currentEtag = response.headers.get("etag");
      if (!currentEtag) {
        // No ETag from server, can't validate
        return true;
      }

      // Compare ETags
      const isValid = metadata.etag === currentEtag;
      if (!isValid) {
        console.log("New version available, updating cache");
      }

      return isValid;
    } catch (error) {
      // If validation fails, assume cache is valid to avoid breaking functionality
      console.warn("Cache validation failed:", error);
      return true;
    }
  }

  /**
   * Downloads the WASM file from CDN and caches it.
   */
  private async downloadAndCache(): Promise<Uint8Array> {
    const response = await fetch(CDN_URL);
    if (!response.ok) {
      throw new Error(`Failed to download taglib.wasm: ${response.statusText}`);
    }

    const wasmData = new Uint8Array(await response.arrayBuffer());
    const etag = response.headers.get("etag") || "";

    // Save to cache
    const metadata: CacheMetadata = {
      etag,
      downloadedAt: new Date().toISOString(),
      size: wasmData.length,
    };

    // Write both files atomically
    await Promise.all([
      Deno.writeFile(this.wasmPath, wasmData),
      Deno.writeTextFile(this.metaPath, JSON.stringify(metadata, null, 2)),
    ]);

    console.log(`Cached taglib.wasm (${wasmData.length} bytes)`);
    return wasmData;
  }
}
