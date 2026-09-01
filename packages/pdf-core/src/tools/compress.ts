import { loadPdf } from '../load';

/**
 * Quick compress (Section 3.1, Group A): lossless structural optimization —
 * object-stream packing + cross-reference compression via pdf-lib's save
 * options. This is NOT content recompression (Ghostscript deep compress is
 * Phase 4); typical savings on pdf-lib-authored files come from collapsing
 * duplicate objects. Real-world results vary by input; the tool reports
 * before/after sizes so the user sees actuals.
 */
export async function quickCompress(bytes: Uint8Array): Promise<{
  output: Uint8Array;
  originalSize: number;
  newSize: number;
}> {
  const doc = await loadPdf(bytes);
  const output = await doc.save({ useObjectStreams: true });
  return {
    output,
    originalSize: bytes.byteLength,
    newSize: output.byteLength,
  };
}
