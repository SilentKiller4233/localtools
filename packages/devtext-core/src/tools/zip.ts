/**
 * Zip / unzip (PROJECT_SPEC 3.4 + 3.5): fflate — pure JS, no native helper.
 * Creation takes named inputs; extraction lists + extracts entries with a
 * path-traversal guard (a zip can carry "../" entry names).
 */

import { zipSync, unzipSync, strFromU8 } from 'fflate';
import { devError, requireBytes, assertSize, MAX_DEVTEXT_BYTES } from '../types';

export const MAX_ZIP_TOTAL_BYTES: number = MAX_DEVTEXT_BYTES;
export const MAX_ZIP_ENTRIES: number = 5000;

export interface ZipInput {
  name: string;
  bytes: Uint8Array;
}

export interface ZipEntryInfo {
  name: string;
  size: number;
}

export interface ZipToolResult {
  /** Created archive bytes (create mode). */
  zip?: Uint8Array;
  /** Extracted files (extract mode). */
  files?: ZipInput[];
  /** Entry listing. */
  entries: ZipEntryInfo[];
}

/** Defensive entry-name check — never allow traversal-shaped names. */
function assertSafeName(name: string): void {
  if (name.length === 0)
    throw devError('invalid-input', 'The archive contains an empty entry name.');
  if (
    name.includes('..') ||
    /^[a-zA-Z]:/.test(name) ||
    name.startsWith('/') ||
    name.startsWith('\\')
  ) {
    throw devError(
      'invalid-input',
      `The archive contains an unsafe entry name (“${name.slice(0, 40)}”).`,
    );
  }
}

export function createZip(
  inputs: ZipInput[],
  maxTotalBytes: number = MAX_ZIP_TOTAL_BYTES,
): ZipToolResult {
  if (!Array.isArray(inputs) || inputs.length === 0) {
    throw devError('no-inputs', 'Select at least one file to zip.');
  }
  if (inputs.length > MAX_ZIP_ENTRIES) {
    throw devError('too-many-files', `Too many files (cap ${String(MAX_ZIP_ENTRIES)}).`);
  }
  const map: Record<string, Uint8Array> = {};
  let total = 0;
  for (const input of inputs) {
    if (input.bytes.byteLength === 0) {
      throw devError('empty-input', `“${input.name}” is empty.`);
    }
    total += input.bytes.byteLength;
    if (total > maxTotalBytes) {
      throw devError(
        'size-limit',
        `The combined files exceed the ${String(Math.round(maxTotalBytes / (1024 * 1024)))}MB cap.`,
      );
    }
    map[input.name.replace(/^\/+/, '')] = input.bytes;
  }
  try {
    const zip = zipSync(map);
    return {
      zip,
      entries: Object.keys(map).map((name) => ({ name, size: map[name]?.byteLength ?? 0 })),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Compression failed.';
    throw devError('operation-failed', `Creating the zip failed: ${message}`);
  }
}

export function extractZip(
  bytes: Uint8Array,
  maxTotalBytes: number = MAX_ZIP_TOTAL_BYTES,
): ZipToolResult {
  requireBytes(bytes, 'zip');
  assertSize(bytes, maxTotalBytes);
  // ZIP magic: "PK\x03\x04" (local header) / "PK\x05\x06" (empty) / "PK\x07" (spanned)
  if (!(
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    (bytes[2] === 3 || bytes[2] === 5 || bytes[2] === 7)
  )) {
    throw devError('invalid-input', 'This file is not a zip archive.');
  }
  let unzipped: Record<string, Uint8Array>;
  try {
    unzipped = unzipSync(bytes);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Extraction failed.';
    throw devError(
      'invalid-input',
      `This zip could not be extracted — it may be corrupt: ${message}`,
    );
  }
  const names = Object.keys(unzipped);
  if (names.length === 0) {
    throw devError('invalid-input', 'This zip archive is empty.');
  }
  if (names.length > MAX_ZIP_ENTRIES) {
    throw devError(
      'too-many-files',
      `This archive has too many entries (cap ${String(MAX_ZIP_ENTRIES)}).`,
    );
  }
  const entries: ZipEntryInfo[] = [];
  const files: ZipInput[] = [];
  let total = 0;
  for (const name of names) {
    const data = unzipped[name];
    if (data === undefined) continue;
    if (name.endsWith('/')) continue; // directory entries
    assertSafeName(name);
    total += data.byteLength;
    if (total > maxTotalBytes) {
      throw devError(
        'size-limit',
        `The archive's contents exceed the ${String(Math.round(maxTotalBytes / (1024 * 1024)))}MB cap.`,
      );
    }
    entries.push({ name, size: data.byteLength });
    files.push({ name, bytes: data });
  }
  if (files.length === 0) {
    throw devError('invalid-input', 'This zip archive contains no files.');
  }
  return { files, entries };
}

/** Text preview for textual entries (client list view). */
export function previewTextFile(bytes: Uint8Array): string | undefined {
  try {
    const text = strFromU8(bytes);
    return /^[\x20-\x7E\t\n\r]*$/.test(text) ? text.slice(0, 4000) : undefined;
  } catch {
    return undefined;
  }
}
