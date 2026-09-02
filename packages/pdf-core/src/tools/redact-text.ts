import { toolError } from '../errors';
import { loadPdf } from '../load';
import { withRenderDoc } from '../render';
import { redactPdf } from './redact';
import type { RedactionRect, RedactResult } from './redact';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';

/**
 * Redact by text search (the client flow): find every occurrence of
 * `text` on the selected pages via pdfjs's text layer (which carries glyph
 * positions), convert each hit into a redaction rectangle, then run the
 * genuine content-removal redaction. Pages default to every page.
 */
export async function redactPdfByText(
  bytes: Uint8Array,
  text: string,
  pages?: string,
): Promise<RedactResult> {
  const needle = text.trim();
  if (needle === '') {
    throw toolError('invalid-option', 'Enter the text you want removed.');
  }
  await loadPdf(bytes); // taxonomy pre-flight (empty/malformed/encrypted)
  const rects: RedactionRect[] = [];
  await withRenderDoc(bytes, async (renderDoc) => {
    const pageCount = renderDoc.doc.numPages;
    const pageNumbers =
      pages === undefined || pages.trim() === ''
        ? Array.from({ length: pageCount }, (_, i) => i + 1)
        : parseAscending(pages, pageCount);
    for (const pageNumber of pageNumbers) {
      const page = await renderDoc.doc.getPage(pageNumber);
      const content = await page.getTextContent();
      for (const item of content.items) {
        if (!('str' in item) || !('transform' in item)) continue;
        const ti = item as TextItem & { transform: number[] };
        if (!ti.str.includes(needle)) continue;
        // transform = [a, b, c, d, e, f]; e,f = glyph origin, d ≈ height,
        // width approximated from glyph height (the box only needs to cover
        // the run; the scanner removes show-ops whose origin falls inside).
        const t: readonly number[] = ti.transform;
        const x = t[4] ?? 0;
        const y = t[5] ?? 0;
        const h = Math.abs(t[3] ?? 10);
        const w = Math.max(needle.length * h * 0.5, ti.str.length * h * 0.5);
        rects.push({
          page: pageNumber,
          x: x - 2,
          y: y - 2,
          width: w + 4,
          height: h + 4,
        });
      }
    }
  });
  if (rects.length === 0) {
    throw toolError(
      'invalid-option',
      `"${needle}" was not found on the selected page(s). If the document is a scan, use the Draw mode after Phase 4's OCR arrives.`,
    );
  }
  return redactPdf(bytes, rects);
}

function parseAscending(input: string, pageCount: number): number[] {
  // Inline range parse to avoid an import cycle (load.ts is already
  // imported above; parsePageRanges lives there too).
  const indices: number[] = [];
  for (const rawPart of input.split(',')) {
    const part = rawPart.trim();
    if (part === '') continue;
    const range = /^(\d+)\s*-\s*(\d+)$/.exec(part);
    const single = /^(\d+)$/.exec(part);
    if (range !== null) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      if (start < 1 || end < start || end > pageCount) throw toolError('page-range');
      for (let p = start; p <= end; p += 1) indices.push(p);
    } else if (single !== null) {
      const p = Number(part);
      if (p < 1 || p > pageCount) throw toolError('page-range');
      indices.push(p);
    } else {
      throw toolError('page-range', `"${part}" is not a page or range.`);
    }
  }
  return indices;
}
