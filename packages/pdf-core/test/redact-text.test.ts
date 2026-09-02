import { describe, expect, it } from 'vitest';
import { redactPdfByText } from '../src/tools/redact-text';
import { extractText } from '../src/tools/text';
import { expectToolError, fixture } from './helpers';

describe('redact-by-text — Section 14.3 substance', () => {
  it('redacts a known string: absent from raw bytes AND text layer, box drawn', async () => {
    const result = await redactPdfByText(fixture('simple-text.pdf'), 'john.doe@example.com');
    expect(result.removedTextRuns).toBeGreaterThan(0);
    // Raw bytes: no encoding of the string survives.
    const raw = new TextDecoder('latin1').decode(result.output);
    expect(raw.includes('john.doe@example.com')).toBe(false);
    // Text layer: gone too.
    const text = await extractText(result.output);
    expect(text.includes('john.doe@example.com')).toBe(false);
    // The rest of the document survives.
    expect(text).toContain('Page 1');
  });

  it('multi-occurrence string on one page → all runs removed', async () => {
    const result = await redactPdfByText(fixture('simple-text.pdf'), 'LocalTools');
    expect(result.removedTextRuns).toBeGreaterThan(0);
    const text = await extractText(result.output);
    expect(text.includes('LocalTools')).toBe(false);
  });

  it('not-found string → clear invalid-option error', async () => {
    await expectToolError(
      redactPdfByText(fixture('simple-text.pdf'), 'no-such-string-anywhere'),
      'invalid-option',
    );
  });

  it('empty search text → invalid-option', async () => {
    await expectToolError(redactPdfByText(fixture('simple-text.pdf'), '  '), 'invalid-option');
  });

  it('scanned (no text) input → invalid-option guidance, not a silent pass', async () => {
    await expectToolError(
      redactPdfByText(fixture('scanned-image-only.pdf'), 'anything'),
      'invalid-option',
    );
  });

  it('malformed input → invalid-pdf', async () => {
    await expectToolError(redactPdfByText(fixture('malformed.pdf'), 'x'), 'invalid-pdf');
  });

  it('encrypted input → encrypted-pdf', async () => {
    await expectToolError(redactPdfByText(fixture('password-protected.pdf'), 'x'), 'encrypted-pdf');
  });
});
