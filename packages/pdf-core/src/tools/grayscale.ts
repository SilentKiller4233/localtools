import { PDFDocument } from 'pdf-lib';
import { ToolError } from '../errors';
import { loadPdf, parsePageRanges } from '../load';
import {
  createBlankSurface,
  desaturate,
  encodeSurface,
  renderPageSurface,
  withRenderDoc,
} from '../render';

/** Options for grayscale. Page selection syntax shared with the suite. */
export interface GrayscaleOptions {
  /** Page selection, "1,3"/"1-3"; default every page. */
  pages?: string;
  /** Render scale, 1 = 72dpi. Default 2. */
  scale?: number;
}

/**
 * Convert selected (or all) pages of a PDF to grayscale (Section 3.1).
 * Group A via the D-014 render pipeline: pdfjs render → BT.601 luma
 * desaturation in pixel space → re-embed as a PNG image page of the SAME
 * page dimensions (PDF points), replacing the original content. Text
 * remains selectable? No — the page becomes an image. That is the honest
 * trade for true grayscale: pdf-lib cannot desaturate content streams and
 * has no non-separable blend modes (verified), so a genuine luminance-only
 * result requires rasterizing the page.
 */
export async function grayscalePdf(
  bytes: Uint8Array,
  options: GrayscaleOptions = {},
): Promise<Uint8Array> {
  const scale = options.scale ?? 2;
  if (!Number.isFinite(scale) || scale <= 0 || scale > 10) {
    throw new ToolError('invalid-option', 'Scale must be a number between 0 and 10.');
  }
  const preflight = await loadPdf(bytes); // taxonomy + zero-page checks
  const pageCount = preflight.getPageCount();
  const pageNumbers =
    options.pages === undefined || options.pages.trim() === ''
      ? Array.from({ length: pageCount }, (_, i) => i + 1)
      : indicesFrom(options.pages, pageCount);
  if (pageNumbers.length === 0) throw new ToolError('page-range', 'No pages were selected.');

  return withRenderDoc(bytes, async (renderDoc) => {
    // Target PDF: same page count/order, selected pages replaced by
    // grayscale raster pages of the SAME page dimensions (PDF points),
    // unselected pages copied verbatim from the source.
    const out = await PDFDocument.create();
    for (let pageNo = 1; pageNo <= pageCount; pageNo += 1) {
      if (!pageNumbers.includes(pageNo)) {
        const [copied] = await out.copyPages(preflight, [pageNo - 1]);
        out.addPage(copied);
        continue;
      }
      const surface = await renderPageSurface(renderDoc, pageNo, scale);
      let grayPng: Uint8Array;
      try {
        const image = surface.context.getImageData(0, 0, surface.width, surface.height);
        desaturate(image);
        // Put back onto a blank factory canvas: putImageData needs an
        // ImageData instance from the SAME context family (verified:
        // cross-context duck-typed objects are rejected by napi).
        const dst = createBlankSurface(renderDoc, surface.width, surface.height);
        try {
          const canvasImage = dst.context.createImageData(surface.width, surface.height);
          canvasImage.data.set(image.data);
          dst.context.putImageData(canvasImage, 0, 0);
          grayPng = await encodeSurface(dst, 'png', 0.85);
        } finally {
          dst.destroy();
        }
      } finally {
        surface.destroy();
      }
      const embedded = await out.embedPng(grayPng);
      const sourcePage = preflight.getPage(pageNo - 1);
      const w = sourcePage.getSize().width;
      const h = sourcePage.getSize().height;
      const page = out.addPage([w, h]);
      page.drawImage(embedded, { x: 0, y: 0, width: w, height: h });
    }
    return out.save();
  });
}

/** parsePageRanges → 1-based ascending list. */
function indicesFrom(input: string, pageCount: number): number[] {
  return parsePageRanges(input, pageCount).map((i) => i + 1);
}
