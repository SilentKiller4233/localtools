import { PDFArray, PDFDocument, PDFRawStream } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { comparePdfs } from '../src/tools/compare';
import { organizePages } from '../src/tools/organize';
import { repairPdf } from '../src/tools/repair';
import { quickCompress } from '../src/tools/compress';
import { redactPdf } from '../src/tools/redact';
import { setBookmarks } from '../src/tools/bookmarks';
import { extractText } from '../src/tools/text';
import { expectToolError, fixture } from './helpers';

/** Test-only Flate inflate (Node zlib). */
function inflateBytes(data: Uint8Array): Uint8Array {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const zlib = require('node:zlib') as {
    inflateSync: (d: Uint8Array) => Uint8Array;
  };
  return zlib.inflateSync(data);
}

/** Latin1-decode raw bytes — the Section 14.3 "absent EVERYWHERE" check. */
function rawText(bytes: Uint8Array): string {
  return new TextDecoder('latin1').decode(bytes);
}

describe('redact — Section 14.3 MANDATORY content-removal test', () => {
  it('redacting the email removes it from EVERYWHERE: raw bytes, text layer, and the box is drawn', async () => {
    const TARGET = 'john.doe@example.com';
    // The email sits at x=72, y=680, size=12 on page 1 (fixture geometry).
    const { output, removedTextRuns } = await redactPdf(fixture('simple-text.pdf'), [
      { page: 1, x: 60, y: 660, width: 260, height: 40 },
    ]);
    expect(removedTextRuns).toBeGreaterThanOrEqual(1);

    // 1. Raw byte scan — latin1 so every byte is visible, no escaping hides it.
    const raw = rawText(output);
    expect(raw.includes(TARGET)).toBe(false);

    // 2. Text layer — extracted text must not contain it either.
    const text = await extractText(output);
    expect(text.includes(TARGET)).toBe(false);

    // 3. The visible black box IS drawn (in the REPLACED content stream).
    //    The stream is Flate-compressed, so decompress before matching.
    const doc2 = await PDFDocument.load(output, { updateMetadata: false });
    const contentsObj = doc2.getPage(0).node.Contents();
    const rawStream =
      contentsObj instanceof PDFRawStream
        ? contentsObj
        : contentsObj instanceof PDFArray
          ? doc2.context.lookup(contentsObj.asArray()[0])
          : undefined;
    expect(rawStream).toBeInstanceOf(PDFRawStream);
    const stream = rawStream as PDFRawStream;
    const decoded = new TextDecoder('latin1').decode(inflateBytes(stream.getContents()));
    expect(decoded).toMatch(/0 0 0 rg/);
    expect(decoded).toMatch(/re\s+f/);

    // 4. Output is still a valid, 3-page PDF.
    expect(doc2.getPageCount()).toBe(3);
  });

  it('unredacted marker strings on other lines survive (surgical removal)', async () => {
    const { output } = await redactPdf(fixture('simple-text.pdf'), [
      { page: 1, x: 60, y: 660, width: 260, height: 40 },
    ]);
    const text = await extractText(output);
    expect(text).toContain('Page 1'); // header line untouched
  });

  it('no rects → invalid-option', async () => {
    await expectToolError(redactPdf(fixture('simple-text.pdf'), []), 'invalid-option');
  });

  it('rect targeting nonexistent page → page-range', async () => {
    await expectToolError(
      redactPdf(fixture('simple-text.pdf'), [{ page: 9, x: 0, y: 0, width: 10, height: 10 }]),
      'page-range',
    );
  });

  it('malformed input → invalid-pdf', async () => {
    await expectToolError(
      redactPdf(fixture('malformed.pdf'), [{ page: 1, x: 0, y: 0, width: 10, height: 10 }]),
      'invalid-pdf',
    );
  });
});

describe('compare — Section 14.1', () => {
  it('identical inputs → identical=true, empty patch', async () => {
    const result = await comparePdfs(fixture('simple-text.pdf'), fixture('simple-text.pdf'));
    expect(result.identical).toBe(true);
    expect(result.patch).toBe('');
  });

  it('different inputs → identical=false with a diff', async () => {
    const modified = await organizePages(fixture('simple-text.pdf'), '1,2');
    const result = await comparePdfs(fixture('simple-text.pdf'), modified);
    expect(result.identical).toBe(false);
  });

  it('scanned (no text) input → auto-routes to visual compare', async () => {
    // Since the D-014 canvas batch, scanned docs compare via pixels instead
    // of erroring (Section 13 image-only edge case resolved).
    const result = await comparePdfs(fixture('scanned-image-only.pdf'), fixture('simple-text.pdf'));
    expect(result.visual).toBeDefined();
    expect(result.identical).toBe(false);
  });

  it('malformed input → invalid-pdf', async () => {
    await expectToolError(
      comparePdfs(fixture('malformed.pdf'), fixture('simple-text.pdf')),
      'invalid-pdf', // shared loadPdf pre-flight rejects before extraction
    );
  });
});

describe('organize — Section 14.1', () => {
  it('happy path: "3, 1, 2" reorders pages', async () => {
    const out = await organizePages(fixture('simple-text.pdf'), '3, 1, 2');
    const doc = await PDFDocument.load(out, { updateMetadata: false });
    expect(doc.getPageCount()).toBe(3);
    const text = await extractText(out);
    expect(text.indexOf('Page 3')).toBeLessThan(text.indexOf('Page 1'));
  });

  it('duplication allowed: "1, 1" produces 2 pages', async () => {
    const out = await organizePages(fixture('simple-text.pdf'), '1, 1');
    const doc = await PDFDocument.load(out, { updateMetadata: false });
    expect(doc.getPageCount()).toBe(2);
  });

  it('empty order → page-range', async () => {
    await expectToolError(organizePages(fixture('simple-text.pdf'), ''), 'page-range');
  });

  it('out-of-bounds order → page-range', async () => {
    await expectToolError(organizePages(fixture('simple-text.pdf'), '1, 9'), 'page-range');
  });

  it('malformed input → invalid-pdf', async () => {
    await expectToolError(organizePages(fixture('malformed.pdf'), '1'), 'invalid-pdf');
  });
});

describe('repair — Section 14.1', () => {
  it('healthy input passes through unchanged structurally (page count)', async () => {
    const out = await repairPdf(fixture('simple-text.pdf'));
    const doc = await PDFDocument.load(out, { updateMetadata: false });
    expect(doc.getPageCount()).toBe(3);
  }, 60_000);

  it('garbage-with-signature input → qpdf-failed (too damaged)', async () => {
    await expectToolError(repairPdf(fixture('malformed.pdf')), 'qpdf-failed');
  }, 60_000);

  it('non-PDF bytes → invalid-pdf', async () => {
    await expectToolError(repairPdf(new TextEncoder().encode('no pdf here')), 'invalid-pdf');
  });
});

describe('quickCompress — Section 14.1', () => {
  it('happy path: output loads with same page count + size report', async () => {
    const { output, originalSize, newSize } = await quickCompress(fixture('with-form-fields.pdf'));
    const doc = await PDFDocument.load(output, { updateMetadata: false });
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(originalSize).toBeGreaterThan(0);
    expect(newSize).toBeGreaterThan(0);
  });

  it('malformed input → invalid-pdf', async () => {
    await expectToolError(quickCompress(fixture('malformed.pdf')), 'invalid-pdf');
  });

  it('empty input → empty-input', async () => {
    await expectToolError(quickCompress(new Uint8Array(0)), 'empty-input');
  });
});

describe('bookmarks — Section 14.1', () => {
  it('happy path: set + read back a nested outline', async () => {
    const out = await setBookmarks(fixture('simple-text.pdf'), [
      { title: 'Start', page: 1, children: [{ title: 'Sub', page: 2 }] },
      { title: 'End', page: 3 },
    ]);
    // Outline object exists, is linked, and round-trips.
    const { readBookmarks } = await import('../src/tools/bookmarks');
    const read = await readBookmarks(out);
    expect(read).not.toBeNull();
    expect(read?.[0]?.title).toBe('Start');
    expect(read?.[1]?.title).toBe('End');
  });

  it('no entries → invalid-option', async () => {
    await expectToolError(setBookmarks(fixture('simple-text.pdf'), []), 'invalid-option');
  });

  it('bookmark to nonexistent page → page-range', async () => {
    await expectToolError(
      setBookmarks(fixture('simple-text.pdf'), [{ title: 'X', page: 99 }]),
      'page-range',
    );
  });

  it('empty title → invalid-option', async () => {
    await expectToolError(
      setBookmarks(fixture('simple-text.pdf'), [{ title: '  ', page: 1 }]),
      'invalid-option',
    );
  });

  it('malformed input → invalid-pdf', async () => {
    await expectToolError(
      setBookmarks(fixture('malformed.pdf'), [{ title: 'X', page: 1 }]),
      'invalid-pdf',
    );
  });
});
