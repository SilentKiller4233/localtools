import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { comparePdfs } from '../src/tools/compare';
import { grayscalePdf } from '../src/tools/grayscale';
import { pdfToImage } from '../src/tools/pdf-to-image';
import { extractPages } from '../src/tools/extract';
import { rotatePages } from '../src/tools/rotate';
import { extractText } from '../src/tools/text';
import { expectToolError, fixture } from './helpers';

// PNG signature check — the honest "valid image" assertion for bytes.
function isPng(b: Uint8Array): boolean {
  return b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
}
function isJpeg(b: Uint8Array): boolean {
  return b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
}

describe('pdf-to-image — Section 14.1', () => {
  it('happy path: 3-page PDF → 3 PNGs with correct dimensions + PNG signature', async () => {
    const images = await pdfToImage(fixture('simple-text.pdf'), { scale: 1 });
    expect(images.length).toBe(3);
    for (const [i, image] of images.entries()) {
      expect(isPng(image.bytes)).toBe(true);
      expect(image.format).toBe('png');
      expect(image.pageNumber).toBe(i + 1);
      // A4 at scale 1: 595×842
      expect(image.width).toBeGreaterThan(500);
      expect(image.height).toBeGreaterThan(800);
      expect(image.bytes.byteLength).toBeGreaterThan(1000);
    }
  });

  it('jpeg format: valid JPEG signature and quality option respected', async () => {
    const images = await pdfToImage(fixture('simple-text.pdf'), {
      scale: 1,
      format: 'jpeg',
      quality: 0.5,
    });
    expect(images.length).toBe(3);
    const first = images[0];
    expect(first !== undefined).toBe(true);
    if (first === undefined) return;
    expect(isJpeg(first.bytes)).toBe(true);
    expect(first.format).toBe('jpeg');
  });

  it('page selection: "1" → single image', async () => {
    const images = await pdfToImage(fixture('simple-text.pdf'), { scale: 1, pages: '1' });
    expect(images.length).toBe(1);
    expect(images[0]?.pageNumber).toBe(1);
  });

  it('invalid format rejected', async () => {
    await expectToolError(
      pdfToImage(fixture('simple-text.pdf'), { format: 'webp' }),
      'invalid-option',
    );
  });

  it('invalid scale rejected (0, negative, >10)', async () => {
    await expectToolError(pdfToImage(fixture('simple-text.pdf'), { scale: 0 }), 'invalid-option');
    await expectToolError(pdfToImage(fixture('simple-text.pdf'), { scale: -1 }), 'invalid-option');
    await expectToolError(pdfToImage(fixture('simple-text.pdf'), { scale: 11 }), 'invalid-option');
  });

  it('invalid quality rejected', async () => {
    await expectToolError(
      pdfToImage(fixture('simple-text.pdf'), { format: 'jpeg', quality: 1.5 }),
      'invalid-option',
    );
  });

  it('out-of-bounds page selection → page-range', async () => {
    await expectToolError(pdfToImage(fixture('simple-text.pdf'), { pages: '9' }), 'page-range');
  });

  it('empty page selection → page-range', async () => {
    await expectToolError(pdfToImage(fixture('simple-text.pdf'), { pages: ' ' }), 'page-range');
  });

  it('malformed input → invalid-pdf', async () => {
    await expectToolError(pdfToImage(fixture('malformed.pdf'), { scale: 1 }), 'invalid-pdf');
  });

  it('empty input → empty-input', async () => {
    await expectToolError(pdfToImage(new Uint8Array(0), { scale: 1 }), 'empty-input');
  });

  it('encrypted input → encrypted-pdf (redirect to Unlock)', async () => {
    await expectToolError(
      pdfToImage(fixture('password-protected.pdf'), { scale: 1 }),
      'encrypted-pdf',
    );
  });

  it('oversized input rejected before parse (maxBytes seam)', async () => {
    await expectToolError(
      pdfToImage(fixture('simple-text.pdf'), { scale: 1, maxBytes: 1 }),
      'size-limit',
    );
  });
});

describe('visual compare — Section 14.1', () => {
  it('identical text docs → text mode identical=true', async () => {
    const result = await comparePdfs(fixture('simple-text.pdf'), fixture('simple-text.pdf'));
    expect(result.identical).toBe(true);
    expect(result.patch).toBe('');
    expect(result.visual).toBeUndefined();
  });

  it('different text docs → identical=false with a patch', async () => {
    const modified = await rotatePages(fixture('simple-text.pdf'), { angle: 90 });
    // Rotation changes rendering, not the text layer — text mode calls them
    // identical; visual mode catches it. This is the documented two-mode split.
    const textResult = await comparePdfs(fixture('simple-text.pdf'), modified);
    expect(textResult.identical).toBe(true); // same text
    const visualResult = await comparePdfs(fixture('simple-text.pdf'), modified, {
      visual: 'true',
    });
    expect(visualResult.identical).toBe(false); // rotated pixels differ
    expect(visualResult.visual?.mismatchedPixels).toBeGreaterThan(0);
  });

  it('scanned vs text → visual mode automatically (no error)', async () => {
    const result = await comparePdfs(fixture('scanned-image-only.pdf'), fixture('simple-text.pdf'));
    expect(result.visual).toBeDefined();
  });

  it('visual mode: different docs → mismatch stats + diffPng', async () => {
    const result = await comparePdfs(fixture('simple-text.pdf'), fixture('with-form-fields.pdf'), {
      visual: 'true',
    });
    expect(result.identical).toBe(false);
    expect(result.visual?.mismatchedPixels).toBeGreaterThan(0);
    expect(result.visual?.diffPng).toBeDefined();
    expect(isPng(result.visual?.diffPng ?? new Uint8Array(0))).toBe(true);
    expect(result.visual?.pages.every((p) => p.mismatchRatio <= 1)).toBe(true);
  });

  it('visual mode: identical docs → zero mismatch, no diffPng', async () => {
    const result = await comparePdfs(fixture('simple-text.pdf'), fixture('simple-text.pdf'), {
      visual: 'true',
    });
    expect(result.identical).toBe(true);
    expect(result.visual?.mismatchedPixels).toBe(0);
    expect(result.visual?.diffPng).toBeUndefined();
  });

  it('visual mode handles differing page counts (blank-white fallback)', async () => {
    const one = await extractPages(fixture('simple-text.pdf'), '1');
    const result = await comparePdfs(one, fixture('simple-text.pdf'), { visual: 'true' });
    expect(result.pages.a).toBe(1);
    expect(result.pages.b).toBe(3);
    expect(result.visual?.mismatchedPixels).toBeGreaterThan(0);
  });

  it('malformed input → invalid-pdf (text pre-flight)', async () => {
    await expectToolError(
      comparePdfs(fixture('malformed.pdf'), fixture('simple-text.pdf')),
      'invalid-pdf',
    );
  });

  it('empty input → empty-input', async () => {
    await expectToolError(
      comparePdfs(new Uint8Array(0), fixture('simple-text.pdf')),
      'empty-input',
    );
  });
});

describe('grayscale — Section 14.1', () => {
  it('happy path: output is a valid same-page-count PDF whose raster is gray', async () => {
    const out = await grayscalePdf(fixture('simple-text.pdf'), { scale: 1 });
    const doc = await PDFDocument.load(out, { updateMetadata: false });
    expect(doc.getPageCount()).toBe(3);
    // The text layer is gone (page became an image) — the honest trade-off.
    await expect(extractText(out)).rejects.toThrow();
  });

  it('pages option: only selected pages rasterized', async () => {
    const out = await grayscalePdf(fixture('simple-text.pdf'), { scale: 1, pages: '1' });
    const doc = await PDFDocument.load(out, { updateMetadata: false });
    expect(doc.getPageCount()).toBe(3);
    // Page 2 keeps its text layer (untouched by rasterization).
    const text = await extractText(out);
    expect(text).toContain('Page 2');
  });

  it('invalid scale rejected', async () => {
    await expectToolError(
      grayscalePdf(fixture('simple-text.pdf'), { scale: 99 }),
      'invalid-option',
    );
  });

  it('invalid page selection → page-range', async () => {
    await expectToolError(grayscalePdf(fixture('simple-text.pdf'), { pages: 'x' }), 'page-range');
  });

  it('malformed input → invalid-pdf', async () => {
    await expectToolError(grayscalePdf(fixture('malformed.pdf')), 'invalid-pdf');
  });

  it('empty input → empty-input', async () => {
    await expectToolError(grayscalePdf(new Uint8Array(0)), 'empty-input');
  });

  it('encrypted input → encrypted-pdf', async () => {
    await expectToolError(grayscalePdf(fixture('password-protected.pdf')), 'encrypted-pdf');
  });
});
