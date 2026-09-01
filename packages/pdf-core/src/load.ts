import { PDFDocument } from 'pdf-lib';
import { isPdfLibEncryptionError, MAX_PDF_BYTES, toolError } from './errors';

/**
 * Size guard runs BEFORE parsing (Section 5.2 sanity-check duty client-side;
 * the oversized fixture must be rejected without partial work). `maxBytes` is
 * an internal seam so tests can exercise the full oversized-rejection path
 * with a real (small) PDF under a tiny cap — a genuine >500MB fixture would
 * be an unreasonable repo artifact. Client code always uses the default.
 */
export function assertSize(bytes: Uint8Array, maxBytes: number = MAX_PDF_BYTES): void {
  if (bytes.byteLength === 0) throw toolError('empty-input');
  if (bytes.byteLength > maxBytes) throw toolError('size-limit');
}

/**
 * Parse a PDF with LocalTools semantics:
 * - empty → empty-input; too big → size-limit (checked before parse)
 * - encrypted → encrypted-pdf (redirect hint lives in the message; password
 *   workflows are the Unlock tool's job, Section 13 edge case)
 * - parse failure / zero pages → invalid-pdf / zero-page-pdf
 *
 * Encryption is detected from the raw trailer (/Encrypt entry) BEFORE any
 * parser runs: qpdf's AES-256 output contains objects strict parsing rejects
 * before pdf-lib's own EncryptedPDFError can surface (verified against
 * qpdf-wasm 0.3.0 output + pdf-lib 1.17.1). A raw scan for the trailer dict
 * is deterministic for the last-trailer convention.
 */
export async function loadPdf(
  bytes: Uint8Array,
  opts: { ignoreEncryption?: boolean; maxBytes?: number } = {},
): Promise<PDFDocument> {
  assertSize(bytes, opts.maxBytes);
  if (!opts.ignoreEncryption && looksEncrypted(bytes)) {
    throw toolError('encrypted-pdf');
  }
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(bytes, {
      ignoreEncryption: opts.ignoreEncryption ?? false,
      throwOnInvalidObject: true,
      updateMetadata: false,
    });
  } catch (err) {
    if (isPdfLibEncryptionError(err)) throw toolError('encrypted-pdf');
    throw toolError('invalid-pdf');
  }
  if (doc.getPageCount() === 0) throw toolError('zero-page-pdf');
  return doc;
}

/**
 * Raw-byte encryption sniff: find the LAST `trailer` keyword and check for
 * an /Encrypt entry within that dictionary (or an XRef-stream /Encrypt in
 * the document catalog region qpdf emits). Conservative: only reports
 * encrypted when a clear /Encrypt marker exists near the file end, where
 * trailers live.
 */
export function looksEncrypted(bytes: Uint8Array): boolean {
  const tail = new TextDecoder('latin1').decode(bytes.slice(-4096));
  const lastTrailer = tail.lastIndexOf('trailer');
  const region = lastTrailer >= 0 ? tail.slice(lastTrailer) : tail;
  return /\/Encrypt\b/.test(region);
}

/**
 * Split semantics per Section 3.1 "Split (by range/every N pages/by size)":
 * ranges like "1-3, 5, 8-10" (1-based, inclusive). Returns sorted unique
 * 0-based indices. Throws page-range on any invalid component or when the
 * result is empty; out-of-bounds indices throw.
 */
export function parsePageRanges(input: string, pageCount: number): number[] {
  const trimmed = input.trim();
  if (trimmed === '') throw toolError('page-range', 'Page selection is empty.');
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
  const unique = [...new Set(indices)].sort((a, b) => a - b);
  if (unique.length === 0) throw toolError('page-range');
  return unique;
}

/** True when the byte string starts with the %PDF- signature. */
export function hasPdfSignature(bytes: Uint8Array): boolean {
  const head = String.fromCharCode(...bytes.slice(0, 5));
  return head === '%PDF-';
}
