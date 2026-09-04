/**
 * Shared test helpers — same harness pattern as pdf/image-core: expectError
 * asserting the exact taxonomy code + committed fixture loading.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { expect } from 'vitest';
import { DevTextToolError } from '../src/types';
import type { DevTextToolErrorCode } from '../src/types';

const FIXTURE_DIR = fileURLToPath(new URL('../../../fixtures/devtext', import.meta.url));

/** Read a committed devtext fixture (text). */
export function fixtureText(name: string): string {
  return readFileSync(resolve(FIXTURE_DIR, name), 'utf-8');
}

/** Read a committed devtext fixture (bytes). */
export function fixtureBytes(name: string): Uint8Array {
  return new Uint8Array(readFileSync(resolve(FIXTURE_DIR, name)));
}

export async function expectDevError(
  p: Promise<unknown>,
  code: DevTextToolErrorCode,
): Promise<DevTextToolError> {
  const err = await p.then(
    () => {
      throw new Error('expected rejection');
    },
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(DevTextToolError);
  const toolErr = err as DevTextToolError;
  expect(toolErr.code).toBe(code);
  return toolErr;
}

/** 5,000,001 chars — one over the default MAX_TEXT_CHARS cap. */
export const OVERSIZED_TEXT = 'a'.repeat(5_000_001);
