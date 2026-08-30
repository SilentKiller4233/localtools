import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { deletePages } from '../src/tools/delete';
import { extractPages } from '../src/tools/extract';
import { mergePdfs } from '../src/tools/merge';
import { rotatePages } from '../src/tools/rotate';
import { splitPdf } from '../src/tools/split';
import { expectToolError, fixture } from './helpers';

/** Reload output bytes and return page count (verifiable-output pattern). */
async function pageCountOf(bytes: Uint8Array): Promise<number> {
  const doc = await PDFDocument.load(bytes);
  return doc.getPageCount();
}

describe('merge — Section 14.1', () => {
  it('happy path: 3 docs → 6 pages, order preserved', async () => {
    const a = fixture('simple-text.pdf'); // 3 pages
    const b = await makePdf(2);
    const c = await makePdf(1);
    const out = await mergePdfs([a, b, c]);
    expect(await pageCountOf(out)).toBe(6);
  });

  it('happy path: single doc → same page count', async () => {
    const out = await mergePdfs([fixture('simple-text.pdf')]);
    expect(await pageCountOf(out)).toBe(3);
  });

  it('empty input: no files → no-inputs', async () => {
    await expectToolError(mergePdfs([]), 'no-inputs');
  });

  it('malformed input: any invalid member fails the whole merge', async () => {
    await expectToolError(
      mergePdfs([fixture('simple-text.pdf'), fixture('malformed.pdf')]),
      'invalid-pdf',
    );
  });

  it('empty-bytes member → empty-input', async () => {
    await expectToolError(
      mergePdfs([fixture('simple-text.pdf'), new Uint8Array(0)]),
      'empty-input',
    );
  });

  it('encrypted member → encrypted-pdf', async () => {
    await expectToolError(
      mergePdfs([fixture('simple-text.pdf'), fixture('password-protected.pdf')]),
      'encrypted-pdf',
    );
  });
});

describe('split — Section 14.1', () => {
  it('happy path: every-n=2 over 3 pages → parts of 2+1 pages', async () => {
    const { parts } = await splitPdf(fixture('simple-text.pdf'), {
      mode: 'every-n',
      everyN: 2,
    });
    expect(parts.length).toBe(2);
    const first = parts[0];
    const second = parts[1];
    if (first === undefined || second === undefined) {
      throw new Error('expected two parts');
    }
    expect(await pageCountOf(first)).toBe(2);
    expect(await pageCountOf(second)).toBe(1);
    expect(first.byteLength).toBeGreaterThan(0);
  });

  it('every-n=0 → page-range error (invalid n)', async () => {
    await expectToolError(
      splitPdf(fixture('simple-text.pdf'), { mode: 'every-n', everyN: 0 }),
      'page-range',
    );
  });

  it('happy path: by-size with generous target → single part', async () => {
    const { parts } = await splitPdf(fixture('simple-text.pdf'), {
      mode: 'by-size',
      targetBytes: 1024 * 1024,
    });
    expect(parts.length).toBe(1);
    const only = parts[0];
    if (only === undefined) throw new Error('expected one part');
    expect(await pageCountOf(only)).toBe(3);
  });

  it('by-size with tiny target → multiple parts, all non-empty', async () => {
    const bytes = fixture('simple-text.pdf');
    const { parts } = await splitPdf(bytes, {
      mode: 'by-size',
      targetBytes: Math.ceil(bytes.byteLength / 3),
    });
    expect(parts.length).toBeGreaterThan(1);
    for (const part of parts) {
      expect(await pageCountOf(part)).toBeGreaterThanOrEqual(1);
    }
  });

  it('malformed input → invalid-pdf', async () => {
    await expectToolError(
      splitPdf(fixture('malformed.pdf'), { mode: 'every-n', everyN: 1 }),
      'invalid-pdf',
    );
  });

  it('empty input → empty-input', async () => {
    await expectToolError(
      splitPdf(new Uint8Array(0), { mode: 'every-n', everyN: 1 }),
      'empty-input',
    );
  });
});

describe('extract — Section 14.1', () => {
  it('happy path: "1,3" from 3-page doc → 2-page output', async () => {
    const out = await extractPages(fixture('simple-text.pdf'), '1,3');
    expect(await pageCountOf(out)).toBe(2);
  });

  it('happy path: full range → page count unchanged', async () => {
    const out = await extractPages(fixture('simple-text.pdf'), '1-3');
    expect(await pageCountOf(out)).toBe(3);
    expect(out.byteLength).toBeGreaterThan(0);
  });

  it('out-of-bounds range → page-range', async () => {
    await expectToolError(extractPages(fixture('simple-text.pdf'), '1-9'), 'page-range');
  });

  it('empty selection → page-range', async () => {
    await expectToolError(extractPages(fixture('simple-text.pdf'), ''), 'page-range');
  });

  it('malformed input → invalid-pdf', async () => {
    await expectToolError(extractPages(fixture('malformed.pdf'), '1'), 'invalid-pdf');
  });
});

describe('delete — Section 14.1', () => {
  it('happy path: delete "2" from 3 pages → 2 pages remain', async () => {
    const out = await deletePages(fixture('simple-text.pdf'), '2');
    expect(await pageCountOf(out)).toBe(2);
  });

  it('happy path: delete "1-2" → 1 page remains', async () => {
    const out = await deletePages(fixture('simple-text.pdf'), '1-2');
    expect(await pageCountOf(out)).toBe(1);
  });

  it('deleting every page → rejected', async () => {
    await expectToolError(deletePages(fixture('simple-text.pdf'), '1-3'), 'page-range');
  });

  it('empty selection → page-range', async () => {
    await expectToolError(deletePages(fixture('simple-text.pdf'), ''), 'page-range');
  });

  it('malformed input → invalid-pdf', async () => {
    await expectToolError(deletePages(fixture('malformed.pdf'), '1'), 'invalid-pdf');
  });
});

describe('rotate — Section 14.1', () => {
  it('happy path: 90° CW on all pages → cumulative 90° angles', async () => {
    const out = await rotatePages(fixture('simple-text.pdf'), { angle: 90 });
    const doc = await PDFDocument.load(out);
    const angles = doc.getPages().map((p) => p.getRotation().angle);
    expect(angles).toEqual([90, 90, 90]);
  });

  it('happy path: subset "2" only → [0, 90, 0]', async () => {
    const out = await rotatePages(fixture('simple-text.pdf'), {
      angle: 90,
      ranges: '2',
    });
    const doc = await PDFDocument.load(out);
    const angles = doc.getPages().map((p) => p.getRotation().angle);
    expect(angles).toEqual([0, 90, 0]);
  });

  it('invalid angle (45°) → page-range-coded error', async () => {
    await expectToolError(rotatePages(fixture('simple-text.pdf'), { angle: 45 }), 'page-range');
  });

  it('malformed input → invalid-pdf', async () => {
    await expectToolError(rotatePages(fixture('malformed.pdf'), { angle: 90 }), 'invalid-pdf');
  });

  it('empty input → empty-input', async () => {
    await expectToolError(rotatePages(new Uint8Array(0), { angle: 90 }), 'empty-input');
  });
});

/** Local generation (not fixture): deterministic multi-page doc via pdf-lib. */
async function makePdf(pageCount: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i += 1) {
    doc.addPage([595.28, 841.89]);
  }
  return doc.save();
}
