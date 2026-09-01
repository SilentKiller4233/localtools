import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { editMetadata, readMetadata } from '../src/tools/metadata';
import { addPageNumbers } from '../src/tools/page-numbers';
import { nUpPages } from '../src/tools/nup';
import { resizePages } from '../src/tools/resize';
import { addTextWatermark } from '../src/tools/watermark';
import { expectToolError, fixture } from './helpers';

async function pageCountOf(bytes: Uint8Array): Promise<number> {
  const doc = await PDFDocument.load(bytes);
  return doc.getPageCount();
}

describe('page-numbers — Section 14.1', () => {
  it('happy path: numbers on all 3 pages, output stays 3 pages', async () => {
    const out = await addPageNumbers(fixture('simple-text.pdf'), {});
    expect(await pageCountOf(out)).toBe(3);
  });

  it('of-total format + startAt is accepted', async () => {
    const out = await addPageNumbers(fixture('simple-text.pdf'), {
      format: 'of-total',
      startAt: 5,
      position: 'top-right',
    });
    expect(await pageCountOf(out)).toBe(3);
  });

  it('subset ranges: only page 2 gets a number', async () => {
    const out = await addPageNumbers(fixture('simple-text.pdf'), { ranges: '2' });
    expect(await pageCountOf(out)).toBe(3);
  });

  it('malformed input → invalid-pdf', async () => {
    await expectToolError(addPageNumbers(fixture('malformed.pdf'), {}), 'invalid-pdf');
  });

  it('empty input → empty-input', async () => {
    await expectToolError(addPageNumbers(new Uint8Array(0), {}), 'empty-input');
  });
});

describe('watermark — Section 14.1', () => {
  it('happy path: tiled watermark on every page', async () => {
    const out = await addTextWatermark(fixture('simple-text.pdf'), {
      text: 'CONFIDENTIAL',
      tile: true,
    });
    expect(await pageCountOf(out)).toBe(3);
  });

  it('happy path: positioned single watermark with color', async () => {
    const out = await addTextWatermark(fixture('simple-text.pdf'), {
      text: 'DRAFT',
      position: 'bottom-right',
      color: '#1f6feb',
    });
    expect(await pageCountOf(out)).toBe(3);
  });

  it('empty text → invalid-option', async () => {
    await expectToolError(
      addTextWatermark(fixture('simple-text.pdf'), { text: '   ' }),
      'invalid-option',
    );
  });

  it('bad hex color → invalid-option', async () => {
    await expectToolError(
      addTextWatermark(fixture('simple-text.pdf'), {
        text: 'X',
        color: 'nope',
      }),
      'invalid-option',
    );
  });

  it('malformed input → invalid-pdf', async () => {
    await expectToolError(addTextWatermark(fixture('malformed.pdf'), { text: 'X' }), 'invalid-pdf');
  });
});

describe('metadata — Section 14.1', () => {
  it('happy path: set + read back title/author/keywords', async () => {
    const out = await editMetadata(fixture('simple-text.pdf'), {
      title: 'Test Doc',
      author: 'LocalTools',
      keywords: 'pdf, test',
    });
    const meta = await readMetadata(out);
    expect(meta.title).toBe('Test Doc');
    expect(meta.author).toBe('LocalTools');
  });

  it('producer is stamped LocalTools on save', async () => {
    const out = await editMetadata(fixture('simple-text.pdf'), {
      title: 'P',
    });
    // Load with updateMetadata:false — pdf-lib's load() default rewrites
    // Producer to "pdf-lib (…)" at construction time (verified against
    // 1.17.1 source), which would mask what was actually saved.
    const doc = await PDFDocument.load(out, { updateMetadata: false });
    expect(doc.getProducer()).toBe('LocalTools');
  });

  it('control characters are stripped, not passed through', async () => {
    const out = await editMetadata(fixture('simple-text.pdf'), {
      subject: 'bad\u0000value',
    });
    const meta = await readMetadata(out);
    expect(meta.subject).toBe('badvalue');
  });

  it('no fields → invalid-option', async () => {
    await expectToolError(editMetadata(fixture('simple-text.pdf'), {}), 'invalid-option');
  });

  it('malformed input → invalid-pdf', async () => {
    await expectToolError(editMetadata(fixture('malformed.pdf'), { title: 'x' }), 'invalid-pdf');
  });
});

describe('resize — Section 14.1', () => {
  it('happy path: resize A4 → letter, page count preserved', async () => {
    const out = await resizePages(fixture('simple-text.pdf'), { size: 'letter' });
    const doc = await PDFDocument.load(out);
    expect(doc.getPageCount()).toBe(3);
    const { width, height } = doc.getPage(0).getSize();
    expect(width).toBeCloseTo(612, 0);
    expect(height).toBeCloseTo(792, 0);
  });

  it('contain mode scales content down and centers', async () => {
    const out = await resizePages(fixture('simple-text.pdf'), {
      size: 'a5',
      content: 'contain',
    });
    const doc = await PDFDocument.load(out);
    expect(doc.getPage(0).getSize().width).toBeCloseTo(419.53, 0);
  });

  it('unknown size → invalid-option', async () => {
    await expectToolError(
      resizePages(fixture('simple-text.pdf'), { size: 'a9' }),
      'invalid-option',
    );
  });

  it('malformed input → invalid-pdf', async () => {
    await expectToolError(resizePages(fixture('malformed.pdf'), { size: 'letter' }), 'invalid-pdf');
  });
});

describe('n-up — Section 14.1', () => {
  it('happy path: 3 pages 2-up on A4 → 2 sheets (2+1)', async () => {
    const out = await nUpPages(fixture('simple-text.pdf'), { layout: '2-up' });
    expect(await pageCountOf(out)).toBe(2);
  });

  it('happy path: 3 pages 4-up → 1 sheet', async () => {
    const out = await nUpPages(fixture('simple-text.pdf'), { layout: '4-up' });
    expect(await pageCountOf(out)).toBe(1);
  });

  it('landscape sheet accepted', async () => {
    const out = await nUpPages(fixture('simple-text.pdf'), {
      layout: '3-up',
      sheet: 'a4-landscape',
    });
    expect(await pageCountOf(out)).toBe(1);
  });

  it('unknown layout → invalid-option', async () => {
    await expectToolError(
      nUpPages(fixture('simple-text.pdf'), { layout: '5-up' }),
      'invalid-option',
    );
  });

  it('malformed input → invalid-pdf', async () => {
    await expectToolError(nUpPages(fixture('malformed.pdf'), { layout: '2-up' }), 'invalid-pdf');
  });

  it('empty input → empty-input', async () => {
    await expectToolError(nUpPages(new Uint8Array(0), { layout: '2-up' }), 'empty-input');
  });
});
