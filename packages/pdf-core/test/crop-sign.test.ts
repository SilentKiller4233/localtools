import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { cropPages } from '../src/tools/crop';
import { signPdf } from '../src/tools/sign';
import { extractText } from '../src/tools/text';
import { expectToolError, fixture } from './helpers';

describe('crop — Section 14.1', () => {
  it('happy path: pt margins shrink the CropBox, MediaBox untouched', async () => {
    const out = await cropPages(fixture('simple-text.pdf'), { top: 50, bottom: 50 });
    const doc = await PDFDocument.load(out, { updateMetadata: false });
    const page = doc.getPage(0);
    const crop = page.getCropBox();
    expect(crop.height).toBeLessThan(841.89);
    expect(crop.y).toBeGreaterThan(0);
    // MediaBox unchanged: content is masked, never destroyed.
    const media = page.getMediaBox();
    expect(media.height).toBeCloseTo(841.89, 1);
  });

  it('percent margins are relative to page size', async () => {
    const out = await cropPages(fixture('simple-text.pdf'), { left: 10, unit: 'percent' });
    const doc = await PDFDocument.load(out, { updateMetadata: false });
    const crop = doc.getPage(0).getCropBox();
    expect(crop.x).toBeGreaterThan(55);
    expect(crop.x).toBeLessThan(60); // ~10% of 595.28
  });

  it('page ranges apply crop to selected pages only', async () => {
    const out = await cropPages(fixture('simple-text.pdf'), { top: 80, ranges: '1' });
    const doc = await PDFDocument.load(out, { updateMetadata: false });
    expect(doc.getPage(0).getCropBox().height).toBeLessThan(800);
    expect(doc.getPage(1).getCropBox().height).toBeCloseTo(841.89, 1);
  });

  it('zero margins rejected (no-op crop)', async () => {
    await expectToolError(cropPages(fixture('simple-text.pdf'), {}), 'invalid-option');
  });

  it('negative margins rejected', async () => {
    await expectToolError(cropPages(fixture('simple-text.pdf'), { top: -5 }), 'invalid-option');
  });

  it('percent margin above 45 rejected', async () => {
    await expectToolError(
      cropPages(fixture('simple-text.pdf'), { top: 60, unit: 'percent' }),
      'invalid-option',
    );
  });

  it('clamp keeps a 10pt minimum box on extreme pt margins', async () => {
    const out = await cropPages(fixture('simple-text.pdf'), { top: 900, bottom: 900 });
    const doc = await PDFDocument.load(out, { updateMetadata: false });
    expect(doc.getPage(0).getCropBox().height).toBeGreaterThanOrEqual(10);
  });

  it('malformed input → invalid-pdf', async () => {
    await expectToolError(cropPages(fixture('malformed.pdf'), { top: 10 }), 'invalid-pdf');
  });

  it('empty input → empty-input', async () => {
    await expectToolError(cropPages(new Uint8Array(0), { top: 10 }), 'empty-input');
  });

  it('encrypted input → encrypted-pdf', async () => {
    await expectToolError(
      cropPages(fixture('password-protected.pdf'), { top: 10 }),
      'encrypted-pdf',
    );
  });
});

describe('sign — Section 14.1', () => {
  // A tiny real PNG (1x1 white) for the image path.
  const TINY_PNG = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
    0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
    0x42, 0x60, 0x82,
  ]);

  it('happy path: typed signature renders text + baseline and reports placement', async () => {
    const out = await signPdf(fixture('simple-text.pdf'), { kind: 'type', text: 'Jane Doe' });
    const doc = await PDFDocument.load(out.output, { updateMetadata: false });
    expect(doc.getPageCount()).toBe(3);
    // Text drawn into the page content stream — verifiable via text layer.
    const text = await extractText(out.output);
    expect(text).toContain('Jane Doe');
    expect(out.applied.page).toBe(1);
    expect(out.applied.width).toBeGreaterThan(0);
  });

  it('typed signature with empty text rejected', async () => {
    await expectToolError(
      signPdf(fixture('simple-text.pdf'), { kind: 'type', text: '  ' }),
      'invalid-option',
    );
  });

  it('happy path: image signature (draw/upload) embeds on target page', async () => {
    const out = await signPdf(fixture('simple-text.pdf'), {
      kind: 'image',
      imageBytes: TINY_PNG,
      page: 2,
      x: 100,
      y: 100,
      width: 120,
    });
    const doc = await PDFDocument.load(out.output, { updateMetadata: false });
    expect(doc.getPageCount()).toBe(3);
    expect(out.applied.page).toBe(2);
    expect(out.applied.width).toBe(120);
  });

  it('image signature with no image rejected', async () => {
    await expectToolError(signPdf(fixture('simple-text.pdf'), { kind: 'draw' }), 'invalid-option');
  });

  it('image signature with non-image bytes rejected', async () => {
    await expectToolError(
      signPdf(fixture('simple-text.pdf'), {
        kind: 'image',
        imageBytes: new TextEncoder().encode('not an image'),
      }),
      'invalid-option',
    );
  });

  it('out-of-bounds target page → page-range', async () => {
    await expectToolError(
      signPdf(fixture('simple-text.pdf'), { kind: 'image', imageBytes: TINY_PNG, page: 9 }),
      'page-range',
    );
  });

  it('invalid width rejected', async () => {
    await expectToolError(
      signPdf(fixture('simple-text.pdf'), { kind: 'image', imageBytes: TINY_PNG, width: -3 }),
      'invalid-option',
    );
  });

  it('malformed input → invalid-pdf', async () => {
    await expectToolError(
      signPdf(fixture('malformed.pdf'), { kind: 'type', text: 'X' }),
      'invalid-pdf',
    );
  });

  it('empty input → empty-input', async () => {
    await expectToolError(signPdf(new Uint8Array(0), { kind: 'type', text: 'X' }), 'empty-input');
  });

  it('encrypted input → encrypted-pdf', async () => {
    await expectToolError(
      signPdf(fixture('password-protected.pdf'), { kind: 'type', text: 'X' }),
      'encrypted-pdf',
    );
  });
});
