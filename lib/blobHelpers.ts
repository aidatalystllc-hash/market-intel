import { list, get, put } from '@vercel/blob';

/**
 * Read a JSON blob by path prefix. Returns parsed JSON or null.
 * Uses the Vercel Blob SDK get() which handles private auth internally.
 */
export async function readBlob(prefix: string): Promise<unknown | null> {
  try {
    const { blobs } = await list({ prefix });
    if (blobs.length === 0) return null;

    const result = await get(blobs[0].url, { access: 'private' });
    if (!result || result.statusCode !== 200) return null;

    // Convert stream to text
    const reader = result.stream.getReader();
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
    const text = new TextDecoder().decode(
      chunks.reduce((acc, chunk) => {
        const merged = new Uint8Array(acc.length + chunk.length);
        merged.set(acc);
        merged.set(chunk, acc.length);
        return merged;
      }, new Uint8Array(0))
    );

    return JSON.parse(text);
  } catch (err) {
    console.error(`readBlob(${prefix}) failed:`, err);
    return null;
  }
}

/**
 * Write a JSON blob. Overwrites if exists.
 */
export async function writeBlob(path: string, data: unknown): Promise<string> {
  const result = await put(path, JSON.stringify(data), {
    access: 'private',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  return result.url;
}
