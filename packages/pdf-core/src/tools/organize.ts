import { PDFDocument } from 'pdf-lib';
import { loadPdf } from '../load';
import { toolError } from '../errors';

/**
 * Reorder/organize pages (Section 3.1): user supplies the desired order as
 * page numbers/ranges — e.g. "3, 1, 2-4" — emitted in exactly that order
 * (duplicates allowed for duplication-style organizing). This is the tool
 * behind the drag-drop thumbnail UI; the range syntax IS the serialization
 * of a drag-drop result.
 */
export async function organizePages(bytes: Uint8Array, order: string): Promise<Uint8Array> {
  const src = await loadPdf(bytes);
  const pageCount = src.getPageCount();
  const trimmed = order.trim();
  if (trimmed === '') {
    throw toolError('page-range', 'Describe the new page order, e.g. "3, 1, 2".');
  }
  // Parse WITHOUT collapsing duplicates, order preserved: parsePageRanges
  // sorts+uniques, so this tool parses inline.
  const indices: number[] = [];
  for (const rawPart of trimmed.split(',')) {
    const part = rawPart.trim();
    if (part === '') continue;
    const rangeMatch = /^(\d+)\s*-\s*(\d+)$/.exec(part);
    const singleMatch = /^(\d+)$/.exec(part);
    if (rangeMatch !== null) {
      const start = Number(rangeMatch[1]);
      const end = Number(rangeMatch[2]);
      if (start < 1 || end < start || end > pageCount) {
        throw toolError('page-range');
      }
      for (let p = start; p <= end; p += 1) indices.push(p - 1);
    } else if (singleMatch !== null) {
      const p = Number(part);
      if (p < 1 || p > pageCount) throw toolError('page-range');
      indices.push(p - 1);
    } else {
      throw toolError('page-range', `"${part}" is not a page or range.`);
    }
  }
  if (indices.length === 0) {
    throw toolError('page-range', 'The new order selects no pages.');
  }
  const out = await PDFDocument.create();
  const copied = await out.copyPages(src, indices);
  for (const page of copied) out.addPage(page);
  return out.save();
}
