/**
 * Phase 11 acceptance tests: "no tool shows a raw/unstyled error
 * anywhere in the app" (spec line 495).
 *
 * Enforced at the copy level:
 *  1. Every code each taxonomy can throw has friendly copy in
 *     lib/tool-errors.ts (unknown codes fall back to a friendly
 *     sentence — the raw-error guarantee).
 *  2. The source taxonomies actually match: extract codes from the
 *     packages' own error-type definitions and compare.
 *  3. friendlyError NEVER returns a technical message.
 */

import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  ERROR_COPY,
  errorCodeOf,
  friendlyError,
  friendlyBridgeError,
} from '../src/lib/tool-errors';

const ROOT = join(import.meta.dirname, '..', '..', '..');

describe('error copy completeness (Phase 11 acceptance)', () => {
  it('covers every pdf-core ToolErrorCode', async () => {
    const src = await readFile(join(ROOT, 'packages', 'pdf-core', 'src', 'errors.ts'), 'utf8');
    const codes = extractCodes(src);
    for (const code of codes) {
      expect(ERROR_COPY['pdf'], `pdf copy missing for "${code}"`).toHaveProperty(code);
    }
  });

  it('covers every devtext-core DevTextToolErrorCode', async () => {
    const src = await readFile(join(ROOT, 'packages', 'devtext-core', 'src', 'types.ts'), 'utf8');
    const codes = extractCodes(src);
    for (const code of codes) {
      expect(ERROR_COPY['devtext'], `devtext copy missing for "${code}"`).toHaveProperty(code);
    }
  });

  it('covers every image-core error code', async () => {
    const src = await readFile(join(ROOT, 'packages', 'image-core', 'src', 'types.ts'), 'utf8');
    const codes = extractCodes(src);
    for (const code of codes) {
      expect(ERROR_COPY['image'], `image copy missing for "${code}"`).toHaveProperty(code);
    }
  });

  it('covers every media-core speech code', async () => {
    const src = await readFile(join(ROOT, 'packages', 'media-core', 'src', 'speech.ts'), 'utf8');
    const codes = extractCodes(src);
    for (const code of codes) {
      expect(ERROR_COPY['speech'], `speech copy missing for "${code}"`).toHaveProperty(code);
    }
  });

  it('covers every engine EngineErrorCode', async () => {
    const src = await readFile(join(ROOT, 'apps', 'engine', 'src', 'errors.ts'), 'utf8');
    const codes = extractCodes(src);
    for (const code of codes) {
      expect(ERROR_COPY['engine'], `engine copy missing for "${code}"`).toHaveProperty(code);
    }
  });
});

describe('the raw-error guarantee', () => {
  it('maps a known code to friendly copy, never the raw message', () => {
    const err = { code: 'invalid-pdf', message: 'pdfjs threw EOLibError at byte 0x99fe…' };
    const text = friendlyError(err, 'pdf');
    expect(text).toBe(ERROR_COPY['pdf']?.['invalid-pdf']);
    expect(text).not.toContain('EOLibError');
  });

  it('falls back to a friendly sentence for unknown codes', () => {
    const err = { code: 'some-new-code', message: 'TypeError: x is not a function' };
    const text = friendlyError(err, 'engine');
    expect(text).toBe('The operation failed. Please try again.');
    expect(text).not.toContain('TypeError');
  });

  it('falls back when the error has no code at all', () => {
    const text = friendlyError(new Error('ENOENT: no such file'), 'image');
    expect(text).toBe('The operation failed. Please try again.');
  });

  it('extracts codes from the worker error shapes', () => {
    expect(errorCodeOf({ code: 'size-limit', message: 'x' })).toBe('size-limit');
    expect(errorCodeOf(new Error('plain'))).toBeUndefined();
    expect(errorCodeOf({ code: 42 })).toBeUndefined();
    expect(errorCodeOf(null)).toBeUndefined();
  });

  it('renders bridge download errors with retry copy', () => {
    const text = friendlyBridgeError({ code: 'network-error', message: 'dns: no such host' });
    expect(text).toContain('retry');
    expect(text).not.toContain('dns');
  });
});

/** Pull quoted error-code strings out of a TS error-code union type.
 * Handles both `export type XError = …` unions and inline class-field
 * unions (`readonly code: 'a' | 'b';`). */
function extractCodes(source: string): string[] {
  const exportUnion = /export type \w*Error(Code)? =([\s\S]*?);/.exec(source);
  const inlineUnion = /readonly code:([\s\S]*?);/.exec(source);
  const body = exportUnion?.[2] ?? inlineUnion?.[1] ?? '';
  if (body === '') throw new Error('no error-code union found in source');
  const matches = [...body.matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1] ?? '');
  return [...new Set(matches)];
}
