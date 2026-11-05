/**
 * @file Tiny JSON file persistence for single-process stores. Writes go to a
 * temp file first and are renamed into place, so a crash never leaves half a file.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Reads and parses a JSON file.
 * @param path File path.
 * @returns The parsed value, or undefined when the file does not exist yet.
 * @throws On unreadable files or invalid JSON, so a corrupt store is never silently reset.
 */
export function readJsonFile(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as unknown;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw err;
  }
}

/**
 * Atomically replaces a JSON file, creating its directory when needed.
 * @param path File path.
 * @param value Value to serialize.
 */
export function writeJsonFile(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2));
  renameSync(tmp, path);
}
