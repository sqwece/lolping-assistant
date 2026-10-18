import { readFile, stat } from 'node:fs/promises';

const MAX_BYTES = 20000;

/** Reads a text file at `path`, truncated, so the model can look at it. Only called for a user-given path. */
export async function readTextFile(path: string): Promise<string> {
  const info = await stat(path);
  if (!info.isFile()) throw new Error(`not a file: ${path}`);
  const buf = await readFile(path);
  const truncated = buf.length > MAX_BYTES;
  const text = buf.subarray(0, MAX_BYTES).toString('utf-8');
  return truncated ? `${text}\n… (truncated at ${MAX_BYTES} of ${buf.length} bytes)` : text;
}
