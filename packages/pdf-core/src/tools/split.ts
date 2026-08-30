import { PDFDocument } from 'pdf-lib';
import { loadPdf } from '../load';
import { toolError } from '../errors';

export type SplitMode = 'every-n' | 'by-size';

export interface SplitEveryNOptions {
  mode: 'every-n';
  /** Pages per output file; >= 1. */
  everyN: number;
}

export interface SplitBySizeOptions {
  mode: 'by-size';
  /** Soft target bytes per output file; >= 1. */
  targetBytes: number;
}

export type SplitOptions = SplitEveryNOptions | SplitBySizeOptions;

export interface SplitOutput {
  /** Output files in document order; always length >= 1. */
  parts: Uint8Array[];
}

/**
 * Split a PDF (Section 3.1: by every-N pages or by size target). By-size uses
 * a deterministic greedy fill: pages are assigned to the current part until
 * adding the next page would exceed the target and the part is non-empty.
 * Encryption/invalid/empty handling identical to loadPdf.
 */
export async function splitPdf(bytes: Uint8Array, options: SplitOptions): Promise<SplitOutput> {
  const doc = await loadPdf(bytes);
  const pageCount = doc.getPageCount();

  let groups: number[][]; // 0-based page indices per output part
  if (options.mode === 'every-n') {
    const n = options.everyN;
    if (!Number.isInteger(n) || n < 1) {
      throw toolError('page-range', 'Pages per file must be a whole number >= 1.');
    }
    groups = [];
    for (let i = 0; i < pageCount; i += n) {
      groups.push(Array.from({ length: Math.min(n, pageCount - i) }, (_, k) => i + k));
    }
  } else {
    const target = options.targetBytes;
    if (!Number.isInteger(target) || target < 1) {
      throw toolError('page-range', 'Target size must be a whole number >= 1 byte.');
    }
    // Estimate per-page bytes from the source: total bytes spread over pages,
    // padded for per-part document overhead (xref/trailer/catalog/font refs).
    const perPageApprox = Math.max(1, bytes.byteLength / pageCount);
    const partOverhead = 4096;
    groups = [];
    let current: number[] = [];
    let currentApprox = partOverhead;
    for (let i = 0; i < pageCount; i += 1) {
      const pageApprox = perPageApprox + 512;
      if (current.length > 0 && currentApprox + pageApprox > target) {
        groups.push(current);
        current = [];
        currentApprox = partOverhead;
      }
      current.push(i);
      currentApprox += pageApprox;
    }
    if (current.length > 0) groups.push(current);
  }

  const parts: Uint8Array[] = [];
  for (const group of groups) {
    const part = await PDFDocument.create();
    const copied = await part.copyPages(doc, group);
    for (const page of copied) part.addPage(page);
    parts.push(await part.save());
  }
  return { parts };
}
