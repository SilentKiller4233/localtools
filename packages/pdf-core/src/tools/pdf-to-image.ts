import { toolError, ToolError } from '../errors';
import { loadPdf, parsePageRanges } from '../load';
import {
  encodeSurface,
  renderPageSurface,
  withRenderDoc,
  type RenderFormat,
  type RenderedPage,
} from '../render';

export type { RenderedPage, RenderFormat } from '../render';

/** Options accepted by pdf→image. Fields are typed `string` and validated
 * at runtime (user input arrives as arbitrary strings; closed unions plus
 * defensive checks are rejected by `no-unnecessary-condition`). */
export interface PdfToImageOptions {
  /** Page selection, "1,3"/"1-3" syntax; default every page. */
  pages?: string;
  /** Render scale, 1 = 72dpi. Default 2 (≈144dpi). Range (0, 10]. */
  scale?: number;
  /** 'png' (default) or 'jpeg'. */
  format?: string;
  /** JPEG quality 0..1, default 0.85. Ignored for PNG. */
  quality?: number;
  /** Internal oversized-input seam (D-013); client callers use the default. */
  maxBytes?: number;
  /**
   * Phase 11 real-progress seam: called after each rendered page with
   * (pagesDone, totalPages). Worker callers thread this to the main
   * thread; direct callers ignore it.
   */
  onProgress?: (done: number, total: number) => void;
}

const FORMATS: Readonly<Record<string, RenderFormat | undefined>> = {
  png: 'png',
  jpeg: 'jpeg',
};

/**
 * Render PDF pages to PNG or JPEG images (Section 3.1 PDF→JPG/PNG).
 * Group A: pdfjs render through the D-014 canvas pipeline — no helper, no
 * network. Input validation (empty/malformed/encrypted/oversized) happens
 * in the shared loadPdf pre-flight before pdfjs ever sees bytes.
 */
export async function pdfToImage(
  bytes: Uint8Array,
  options: PdfToImageOptions = {},
): Promise<RenderedPage[]> {
  await loadPdf(bytes, options.maxBytes === undefined ? {} : { maxBytes: options.maxBytes });
  const scale = options.scale ?? 2;
  if (!Number.isFinite(scale) || scale <= 0 || scale > 10) {
    throw new ToolError('invalid-option', 'Scale must be a number between 0 and 10.');
  }
  const format = options.format === undefined ? 'png' : options.format.trim().toLowerCase();
  const resolvedFormat = FORMATS[format];
  if (resolvedFormat === undefined) {
    throw new ToolError('invalid-option', 'Format must be "png" or "jpeg".');
  }
  const quality = options.quality ?? 0.85;
  if (!Number.isFinite(quality) || quality < 0 || quality > 1) {
    throw new ToolError('invalid-option', 'Quality must be between 0 and 1.');
  }
  return withRenderDoc(bytes, async (renderDoc) => {
    const pageCount = renderDoc.doc.numPages;
    const pageNumbers =
      options.pages === undefined
        ? Array.from({ length: pageCount }, (_, i) => i + 1)
        : parseAscending(options.pages, pageCount);
    const results: RenderedPage[] = [];
    for (const pageNumber of pageNumbers) {
      if (pageNumber < 1 || pageNumber > pageCount) {
        throw toolError('page-range', `Page ${String(pageNumber)} is outside this document.`);
      }
      const surface = await renderPageSurface(renderDoc, pageNumber, scale);
      try {
        const encoded = await encodeSurface(surface, resolvedFormat, quality);
        results.push({
          bytes: encoded,
          format: resolvedFormat,
          width: surface.width,
          height: surface.height,
          pageNumber,
        });
      } finally {
        surface.destroy();
      }
      options.onProgress?.(results.length, pageNumbers.length);
    }
    if (results.length === 0) throw toolError('page-range', 'No pages were selected.');
    return results;
  });
}

/** parsePageRanges (shared syntax + bounds checking) → 1-based ascending. */
function parseAscending(input: string, pageCount: number): number[] {
  return parsePageRanges(input, pageCount).map((i) => i + 1);
}
