/**
 * Shared formatting utilities for displaying metadata
 */

/**
 * Format duration from seconds to MM:SS
 */
export function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

/**
 * Format channels to human readable
 */
export function formatChannels(channels?: number): string {
  if (!channels) return "Unknown";
  if (channels === 1) return "Mono";
  if (channels === 2) return "Stereo";
  return `${channels} channels`;
}

/**
 * Format file size in human readable format
 */
export function formatFileSize(bytes: number): string {
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * Format bitrate for display
 */
export function formatBitrate(bitrate?: number): string {
  if (!bitrate) return "Unknown";
  return `${bitrate} kbps`;
}

/**
 * Format sample rate for display
 */
export function formatSampleRate(sampleRate?: number): string {
  if (!sampleRate) return "Unknown";
  return `${sampleRate} Hz`;
}
