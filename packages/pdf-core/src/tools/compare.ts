import { diffLines } from 'diff';
import pixelmatch from 'pixelmatch';
import { extractText } from './text';
import { loadPdf } from '../load';
import type { RenderDoc, RenderedSurface } from '../render';
import { createBlankSurface, encodeSurface, renderPageSurface, withRenderDoc } from '../render';

export interface ComparePageStat {
  pageNumber: number;
  mismatchedPixels: number;
  /** 0..1 share of this page's compared pixels that mismatch. */
  mismatchRatio: number;
}

export interface CompareVisual {
  /** Total mismatched pixels across all compared pages. */
  mismatchedPixels: number;
  /** 0..1 share of all compared pixels that mismatch. */
  mismatchRatio: number;
  pages: ComparePageStat[];
  /** PNG overlay of the first differing page (red = different), when any differs. */
  diffPng?: Uint8Array;
}

export interface CompareResult {
  /** True when compared content is identical (text, or pixels when visual). */
  identical: boolean;
  /** Unified-style line diff (empty when identical or visual mode). */
  patch: string;
  /** Per-file page counts, for a quick structural sanity read. */
  pages: { a: number; b: number };
  /** Present iff the comparison ran in visual mode. */
  visual?: CompareVisual;
}

/** pixelmatch threshold: default 0.1 (sensitive but anti-alias-tolerant). */
const PIXEL_THRESHOLD = 0.1;
/** Visual-compare render scale — moderate; speed over print quality. */
const COMPARE_SCALE = 1.5;

/**
 * Compare two PDFs (Section 3.1 Compare). Two modes:
 * - text (default): jsdiff line diff of extracted text.
 * - visual: pdfjs render + pixelmatch, chosen automatically when either
 *   input has no extractable text (scanned docs — the Section 13
 *   image-only-scan edge case) or explicitly via `visual: 'true'`.
 *
 * Visual mode compares page-by-page at a fixed scale; when page
 * dimensions differ, both are letterboxed onto the max-area white canvas
 * (content differences, not layout-size differences, dominate the
 * signal). A missing page on one side renders as blank white.
 */
export async function comparePdfs(
  a: Uint8Array,
  b: Uint8Array,
  options: { visual?: string | boolean } = {},
): Promise<CompareResult> {
  // Shared pre-flight FIRST: empty/malformed/encrypted/oversized inputs get
  // the suite taxonomy before any text extraction or rendering happens.
  await loadPdf(a);
  await loadPdf(b);
  const wantVisual = options.visual === 'true' || options.visual === true;
  const [textA, textB] = await Promise.all([
    extractText(a).catch(() => null),
    extractText(b).catch(() => null),
  ]);
  if (wantVisual || textA === null || textB === null) {
    return visualCompare(a, b);
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

async function visualCompare(a: Uint8Array, b: Uint8Array): Promise<CompareResult> {
  return withRenderDoc(a, async (docA) =>
    withRenderDoc(b, async (docB) => {
      const numA = docA.doc.numPages;
      const numB = docB.doc.numPages;
      const pageCount = Math.max(numA, numB);
      const pageStats: ComparePageStat[] = [];
      let totalMismatched = 0;
      let totalPixels = 0;
      let diffPng: Uint8Array | undefined;
      for (let pageNo = 1; pageNo <= pageCount; pageNo += 1) {
        // First render the page that exists (or a 1×1 white placeholder),
        // then letterbox the other side onto the shared canvas size.
        const surfA = await renderOrBlank(docA, pageNo, 1, 1);
        const surfB = await renderOrBlank(docB, pageNo, surfA.width, surfA.height);
        try {
          const width = Math.max(surfA.width, surfB.width);
          const height = Math.max(surfA.height, surfB.height);
          const pixelsA = toFullCanvas(surfA, width, height);
          const pixelsB = toFullCanvas(surfB, width, height);
          const diffTarget = new Uint8ClampedArray(width * height * 4);
          const mismatched = pixelmatch(pixelsA, pixelsB, diffTarget, width, height, {
            threshold: PIXEL_THRESHOLD,
          });
          const pagePixels = width * height;
          totalMismatched += mismatched;
          totalPixels += pagePixels;
          pageStats.push({
            pageNumber: pageNo,
            mismatchedPixels: mismatched,
            mismatchRatio: pagePixels === 0 ? 0 : mismatched / pagePixels,
          });
          if (mismatched > 0 && diffPng === undefined) {
            const diffSurface = createBlankSurface(docA, width, height);
            try {
              const img = diffSurface.context.createImageData(width, height);
              img.data.set(diffTarget);
              diffSurface.context.putImageData(img, 0, 0);
              diffPng = await encodeSurface(diffSurface, 'png', 0.85);
            } finally {
              diffSurface.destroy();
            }
          }
        } finally {
          surfA.destroy();
          surfB.destroy();
        }
      }
      const identical = totalMismatched === 0;
      return {
        identical,
        patch: '',
        pages: { a: numA, b: numB },
        visual: {
          mismatchedPixels: totalMismatched,
          mismatchRatio: totalPixels === 0 ? 0 : totalMismatched / totalPixels,
          pages: pageStats,
          ...(diffPng === undefined ? {} : { diffPng }),
        },
      };
    }),
  );
}

/** Render `pageNo`, or a blank white surface of `fallbackWidth ×
 * fallbackHeight` when the page does not exist on this side (missing
 * pages must still participate in the pixel compare as white space). */
async function renderOrBlank(
  doc: RenderDoc,
  pageNo: number,
  fallbackWidth: number,
  fallbackHeight: number,
): Promise<RenderedSurface> {
  if (pageNo > doc.doc.numPages) {
    const blank = createBlankSurface(doc, Math.max(1, fallbackWidth), Math.max(1, fallbackHeight));
    const img = blank.context.createImageData(blank.width, blank.height);
    img.data.fill(255);
    blank.context.putImageData(img, 0, 0);
    return blank;
  }
  return renderPageSurface(doc, pageNo, COMPARE_SCALE);
}

/** Letterbox a rendered surface onto a width×height white RGBA buffer so
 * pixelmatch dimensions always line up. */
function toFullCanvas(surface: RenderedSurface, width: number, height: number): Uint8ClampedArray {
  if (surface.width === width && surface.height === height) {
    return surface.context.getImageData(0, 0, width, height).data as Uint8ClampedArray;
  }
  const out = new Uint8ClampedArray(width * height * 4).fill(255);
  const rowBytes = surface.width * 4;
  const src = surface.context.getImageData(0, 0, surface.width, surface.height);
  for (let y = 0; y < surface.height; y += 1) {
    const srcStart = y * rowBytes;
    out.set(src.data.subarray(srcStart, srcStart + rowBytes), y * width * 4);
  }
  return out;
}

function countPages(text: string): number {
  return Math.max(1, text.split('\n\n').length);
}
