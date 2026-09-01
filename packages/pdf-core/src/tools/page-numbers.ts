import { StandardFonts } from 'pdf-lib';
import { loadPdf, parsePageRanges } from '../load';
import { ToolError } from '../errors';

/** Where the number sits on the page edge. */
export type PageNumberPosition =
  'bottom-center' | 'bottom-right' | 'bottom-left' | 'top-center' | 'top-right' | 'top-left';

export interface PageNumbersOptions {
  /** 1 = label pages 1..N; 7 = start counting at 7 (after front matter). */
  startAt?: number;
  /** "3 of 10" instead of "3". */
  format?: 'plain' | 'of-total';
  position?: PageNumberPosition;
  fontSize?: number;
  /** Page selection; default all pages. */
  ranges?: string;
}

const MARGIN = 36; // 0.5 inch

/**
 * Add page numbers (Section 3.1). Font is Helvetica; non-Latin glyph coverage
 * is a documented limitation (Section 13) — number labels themselves are
 * ASCII digits.
 */
export async function addPageNumbers(
  bytes: Uint8Array,
  options: PageNumbersOptions = {},
): Promise<Uint8Array> {
  const doc = await loadPdf(bytes);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();
  const startAt = options.startAt ?? 1;
  if (!Number.isInteger(startAt)) {
    throw new ToolError('page-range', 'startAt must be a whole number.');
  }
  const format = options.format ?? 'plain';
  const position = options.position ?? 'bottom-center';
  const size = options.fontSize ?? 10;
  const indices =
    options.ranges === undefined
      ? pages.map((_, i) => i)
      : parsePageRanges(options.ranges, pages.length);
  const total = indices.length;

  indices.forEach((pageIndex, ordinal) => {
    const page = pages[pageIndex];
    if (page === undefined) return; // parsePageRanges guarantees bounds
    const label = startAt + ordinal;
    const text =
      format === 'of-total' ? `${String(label)} of ${String(startAt + total - 1)}` : String(label);
    const { width, height } = page.getSize();
    const textWidth = font.widthOfTextAtSize(text, size);
    let x = (width - textWidth) / 2;
    let y = MARGIN / 2;
    if (position.includes('right')) x = width - MARGIN - textWidth;
    if (position.includes('left')) x = MARGIN;
    if (position.includes('top')) y = height - MARGIN;
    page.drawText(text, { x, y, size, font });
  });

  return doc.save();
}
