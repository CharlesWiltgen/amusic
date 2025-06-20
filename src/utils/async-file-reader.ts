/**
 * Reads a file in chunks to avoid blocking the event loop
 * This allows UI updates (like spinners) to continue animating
 */
export async function readFileAsync(filePath: string): Promise<Uint8Array> {
  const file = await Deno.open(filePath, { read: true });
  const fileInfo = await file.stat();
  const buffer = new Uint8Array(fileInfo.size);

  const chunkSize = 1024 * 1024; // 1MB chunks
  let offset = 0;

  try {
    while (offset < fileInfo.size) {
      const remainingBytes = fileInfo.size - offset;
      const bytesToRead = Math.min(chunkSize, remainingBytes);
      const chunk = new Uint8Array(bytesToRead);

      const bytesRead = await file.read(chunk);
      if (bytesRead === null) break;

      buffer.set(chunk.subarray(0, bytesRead), offset);
      offset += bytesRead;

      // Yield to event loop after each chunk
      if (offset < fileInfo.size) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
  } finally {
    file.close();
  }

  return buffer;
}
