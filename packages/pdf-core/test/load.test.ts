import { describe, expect, it } from 'vitest';
import { loadPdf, parsePageRanges } from '../src/load';
import { ToolError } from '../src/errors';
import { expectToolError, fixture } from './helpers';

describe('loadPdf — Section 14.1 error paths', () => {
  it('happy path: loads simple-text.pdf with 3 pages', async () => {
    const doc = await loadPdf(fixture('simple-text.pdf'));
    expect(doc.getPageCount()).toBe(3);
  });

  it('empty input: zero bytes → empty-input', async () => {
    await expectToolError(loadPdf(new Uint8Array(0)), 'empty-input');
  });

  it('malformed input: fake body → invalid-pdf', async () => {
    await expectToolError(loadPdf(fixture('malformed.pdf')), 'invalid-pdf');
  });

  it('zero-page input: valid header, no pages → zero-page-pdf', async () => {
    await expectToolError(loadPdf(fixture('zero-page.pdf')), 'zero-page-pdf');
  });

  it('oversized input: bytes above cap → size-limit (no parse attempted)', async () => {
    // Same code path as the 500MB cap, exercised via the maxBytes seam (D-013).
    const bytes = fixture('simple-text.pdf');
    await expectToolError(loadPdf(bytes, { maxBytes: bytes.byteLength - 1 }), 'size-limit');
  });

  it('encrypted input: non-Unlock tool → encrypted-pdf redirect message', async () => {
    const err = await loadPdf(fixture('password-protected.pdf')).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ToolError);
    const toolErr = err as ToolError;
    expect(toolErr.code).toBe('encrypted-pdf');
    expect(toolErr.message).toContain('Unlock');
  });

  it('non-ASCII/garbage bytes → invalid-pdf', async () => {
    await expectToolError(loadPdf(new TextEncoder().encode('not a pdf at all')), 'invalid-pdf');
  });
});

describe('parsePageRanges', () => {
  it('parses singles, ranges, and duplicates → sorted unique indices', () => {
    expect(parsePageRanges('1, 3, 2-2, 5-6, 1', 10)).toEqual([0, 1, 2, 4, 5]);
  });

  it('rejects empty selection', () => {
    expect(() => parsePageRanges('', 10)).toThrow(ToolError);
    expect(() => parsePageRanges(' , ', 10)).toThrow(ToolError);
  });

  it('rejects out-of-bounds and malformed selections', () => {
    expect(() => parsePageRanges('11', 10)).toThrow(ToolError);
    expect(() => parsePageRanges('0', 10)).toThrow(ToolError);
    expect(() => parsePageRanges('2-1', 10)).toThrow(ToolError);
  });

  it('rejects non-numeric junk', () => {
    expect(() => parsePageRanges('abc', 10)).toThrow(ToolError);
    expect(() => parsePageRanges('1-abc', 10)).toThrow(ToolError);
  });
});
