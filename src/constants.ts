/**
 * Application constants
 */

// Processing limits
export const DEFAULT_CONCURRENCY = 4;
export const HIGH_CONCURRENCY = 8;
export const MAX_QUEUE_SIZE = 100;

// File reading limits
export const MAX_LINE_LENGTH = 2000;
export const MAX_OUTPUT_CHARS = 30000;
export const DEFAULT_READ_LINES = 2000;

// Timeouts (in milliseconds)
export const DEFAULT_COMMAND_TIMEOUT = 120000; // 2 minutes
export const MAX_COMMAND_TIMEOUT = 600000; // 10 minutes

// Progress update intervals
export const PROGRESS_UPDATE_INTERVAL = 50; // Update every 50 files in large scans
export const BATCH_PROGRESS_INTERVAL = 5; // Update every 5 files in batch processing

// Audio file extensions
export const AUDIO_EXTENSIONS = [
  ".mp3",
  ".flac",
  ".ogg",
  ".m4a",
  ".wav",
  ".aac",
  ".opus",
  ".wma",
];

// Vendor binary platforms
export const SUPPORTED_PLATFORMS = {
  darwin: "macos",
  linux: "linux",
  windows: "windows",
};

// API endpoints
export const ACOUSTID_API_URL = "https://api.acoustid.org/v2/lookup";
