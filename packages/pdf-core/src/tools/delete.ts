import { loadPdf, parsePageRanges } from '../load';
import { toolError } from '../errors';

/**
 * Delete the selected pages ("2, 5-7"). Removing every page is rejected —
 * a PDF must keep at least one page (zero-page output would violate the
 * Section 13 zero-page edge case in reverse).
 */
export async function deletePages(bytes: Uint8Array, ranges: string): Promise<Uint8Array> {
  const doc = await loadPdf(bytes);
  const indices = new Set(parsePageRanges(ranges, doc.getPageCount()));
  if (indices.size === doc.getPageCount()) {
    throw toolError('page-range', 'Cannot delete every page — keep at least one.');
  }
  // removePage takes 0-based current-document indices; iterate descending so
  // earlier removals do not shift later targets.
  for (const index of [...indices].sort((a, b) => b - a)) {
    doc.removePage(index);
  }
  return doc.save();
}
