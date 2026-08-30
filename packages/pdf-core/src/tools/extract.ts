import { PDFDocument } from 'pdf-lib';
import { loadPdf, parsePageRanges } from '../load';

/**
 * Extract the selected pages ("1-3, 5, 8-10", 1-based inclusive) into a new
 * PDF, emitted in ascending document order (duplicates collapsed). Custom
 * ordering is the Organize tool's job, per Section 3.1's split-out tool list.
 * All bad-input paths shared with loadPdf/parsePageRanges.
 */
export async function extractPages(bytes: Uint8Array, ranges: string): Promise<Uint8Array> {
  const doc = await loadPdf(bytes);
  const indices = parsePageRanges(ranges, doc.getPageCount());
  const out = await PDFDocument.create();
  const copied = await out.copyPages(doc, indices);
  for (const page of copied) out.addPage(page);
  return out.save();
}
