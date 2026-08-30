import { PDFDocument } from 'pdf-lib';
import { loadPdf } from '../load';
import { toolError } from '../errors';

/**
 * Merge PDFs in the given order (Section 3.1). Each input re-uses the shared
 * loadPdf semantics (size cap, encrypted redirect, invalid-PDF errors) so
 * every tool behaves identically on bad input — including failing BEFORE any
 * byte of the output is produced.
 */
export async function mergePdfs(files: readonly Uint8Array[]): Promise<Uint8Array> {
  if (files.length === 0) throw toolError('no-inputs');
  const docs: PDFDocument[] = [];
  for (const bytes of files) {
    docs.push(await loadPdf(bytes));
  }
  const out = await PDFDocument.create();
  for (const doc of docs) {
    const srcIndices = doc.getPages().map((_, i) => i);
    const copied = await out.copyPages(doc, srcIndices);
    for (const page of copied) out.addPage(page);
  }
  return out.save();
}
