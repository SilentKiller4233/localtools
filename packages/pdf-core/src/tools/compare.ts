import { diffLines } from 'diff';
import { extractText } from './text';
import { toolError } from '../errors';

export interface CompareResult {
  /** True when text content is identical. */
  identical: boolean;
  /** Unified-style line diff (empty string when identical). */
  patch: string;
  /** Per-file page counts, for a quick structural sanity read. */
  pages: { a: number; b: number };
}

/**
 * Compare two PDFs by text content (Section 3.1 Compare). Visual diff via
 * pdfjs render + pixelmatch is the other half of this tool — it lands with
 * the canvas batch (D-014) since it needs the render pipeline in both
 * targets; text compare is fully testable today and covers the Section 14.1
 * acceptance (verifiable output, graceful failures).
 */
export async function comparePdfs(a: Uint8Array, b: Uint8Array): Promise<CompareResult> {
  const [textA, textB] = await Promise.all([
    extractText(a).catch(() => null),
    extractText(b).catch(() => null),
  ]);
  if (textA === null || textB === null) {
    throw toolError(
      'invalid-option',
      'One of the PDFs has no extractable text — visual comparison (canvas render) is required for scanned documents and arrives with the next batch.',
    );
  }
  const changes = diffLines(textA, textB);
  const identical = changes.every((c) => !c.added && !c.removed);
  const patch: string[] = [];
  for (const c of changes) {
    const lines = c.value.replace(/\n$/, '').split('\n');
    if (c.added) {
      for (const line of lines) patch.push(`+ ${line}`);
    } else if (c.removed) {
      for (const line of lines) patch.push(`- ${line}`);
    } else {
      patch.push(`  ${String(lines.length)} unchanged lines`);
    }
  }
  return {
    identical,
    patch: identical ? '' : patch.join('\n'),
    pages: { a: countPages(textA), b: countPages(textB) },
  };
}

function countPages(text: string): number {
  return Math.max(1, text.split('\n\n').length);
}
