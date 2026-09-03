/**
 * Shared test helpers — mirrors pdf-core's harness: committed fixtures at
 * the repo root, size-cap seam, and the image sniff helpers.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const FIXTURE_DIR = resolve(HERE, '..', '..', '..', 'fixtures', 'image');

export function fixturePath(name: string): string {
  return resolve(FIXTURE_DIR, name);
}

export async function readFixture(name: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(fixturePath(name)));
}

/** 500MB cap matching the app default; tests can pass a tiny seam. */
export const MAX_IMAGE_BYTES = 500 * 1024 * 1024;
