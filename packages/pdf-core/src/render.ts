import type {
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
  PDFPageProxy,
  RenderTask,
} from 'pdfjs-dist';
import { ToolError, toolError } from './errors';

/**
 * Shared pdfjs render pipeline for the rendering-dependent PDF tools
 * (pdf-to-image, visual compare, grayscale). Canvas strategy: DECISIONS.md
 * D-014 — pdfjs's own auto-selected canvas factory per environment:
 * - Node: the LEGACY build's internal NodeCanvasFactory, which lazily
 *   requires `@napi-rs/canvas` (pdfjs's own optionalDependency — pdf-core
 *   never imports it directly; pnpm isolation means only pdfjs can resolve
 *   it, and all canvases therefore come from `doc.canvasFactory`).
 * - Browser main thread: pdfjs's default DOMCanvasFactory.
 * - Browser Worker: no `document` exists, so an OffscreenCanvas-based
 *   factory class is passed via getDocument's `CanvasFactory` option.
 *
 * Every pdfjs integration fact here was verified against installed
 * pdfjs-dist 6.3.289 source/typings (evidence in the D-014 notes):
 * - Node must use the legacy build (the standard build's worker spawn
 *   hangs under Node/vitest);
 * - render() takes { canvas, canvasContext, viewport };
 * - `standardFontDataUrl`/`cMapUrl`/`wasmUrl` are plain fs paths in Node
 *   (NodeBinaryDataFactory._fetch is a bare fs.readFile) and URL prefixes
 *   in the browser — the client copies pdfjs-dist's asset dirs to
 *   /pdfjs/* at build time (Batch 7 wiring);
 * - `useWorkerFetch: false` keeps font/cmap fetches on the caller thread
 *   and, critically, short-circuits getDocument's default
 *   `isValidFetchUrl(..., document.baseURI)` chain, which would throw a
 *   ReferenceError inside a Worker (no `document` there);
 * - teardown is doc.cleanup() then loadingTask.destroy() (`destroy()` lives
 *   on the LOADING TASK, not the document).
 */

export type RenderFormat = 'png' | 'jpeg';

/** One rendered page as encoded image bytes (pdf-to-image output). */
export interface RenderedPage {
  /** PNG or JPEG bytes. */
  bytes: Uint8Array;
  format: RenderFormat;
  width: number;
  height: number;
  /** 1-based page number this image came from. */
  pageNumber: number;
}

// ---------------------------------------------------------------------------
// pdfjs loading (environment-appropriate)
// ---------------------------------------------------------------------------

type PdfjsModule = {
  getDocument: (src: Record<string, unknown>) => PDFDocumentLoadingTask;
};

let pdfjsPromise: Promise<PdfjsModule> | undefined;

// Runtime environment detection: this module runs in BOTH the browser (Vite
// bundle, where `process` does not exist) and Node (tests/engine). The
// eslint rule cannot see cross-environment code, hence the targeted disable.
// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
const IS_NODE = typeof process !== 'undefined' && process.versions?.node !== undefined;

function getPdfjs(): Promise<PdfjsModule> {
  if (pdfjsPromise === undefined) {
    pdfjsPromise = IS_NODE
      ? import('pdfjs-dist/legacy/build/pdf.mjs').then((m) => m as PdfjsModule)
      : import('pdfjs-dist').then((m) => m as PdfjsModule);
  }
  return pdfjsPromise;
}

/** Node: resolve the installed pdfjs-dist's asset dirs. `new URL(bare
 * specifier)` does NOT resolve package specifiers (same trap as qpdf-wasm)
 * — createRequire().resolve() does. The node:module import is behind a
 * runtime require so browser bundles never statically reference it. */
interface NodeModuleShape {
  createRequire: (from: string) => { resolve: (id: string) => string };
}

function pdfjsSourceOptions(): Record<string, unknown> {
  if (IS_NODE) {
    const requireFn = require as (mid: string) => unknown;
    const { createRequire } = requireFn('node:module') as NodeModuleShape;
    const req = createRequire(import.meta.url);
    const base = req.resolve('pdfjs-dist/package.json').replace(/package\.json$/, '');
    return {
      standardFontDataUrl: `${base}standard_fonts/`,
      cMapUrl: `${base}cmaps/`,
      cMapPacked: true,
      wasmUrl: `${base}wasm/`,
      useWorkerFetch: false,
    };
  }
  return {
    standardFontDataUrl: '/pdfjs/standard_fonts/',
    cMapUrl: '/pdfjs/cmaps/',
    cMapPacked: true,
    wasmUrl: '/pdfjs/wasm/',
    useWorkerFetch: false,
  };
}

// ---------------------------------------------------------------------------
// Canvas surface types (uniform across skia / DOM / Offscreen)
// ---------------------------------------------------------------------------

/** Minimal pixel-data shape (napi ImageData / DOM ImageData). Callers must
 * only pass instances produced by the SAME context's getImageData/
 * createImageData — Node's @napi-rs/canvas putImageData rejects plain
 * objects ("Failed to recover ImageData type from napi value"). */
export interface ImageDataLike {
  readonly data: Uint8ClampedArray | Uint8Array;
  readonly width: number;
  readonly height: number;
}

/** Minimal 2D-context surface used by the render tools. */
export interface Canvas2D {
  getImageData(sx: number, sy: number, sw: number, sh: number): ImageDataLike;
  putImageData(imageData: ImageDataLike, dx: number, dy: number): void;
  createImageData(width: number, height: number): ImageDataLike;
}

/** pdfjs's BaseCanvasFactory contract (verified against 6.3.289 source) —
 * the view of `doc.canvasFactory` used by this module. */
export interface CanvasFactoryLike {
  create(width: number, height: number): { canvas: unknown; context: unknown };
  destroy(entry: { canvas: unknown; context: unknown }): void;
}

/**
 * Canvas factory for browser Workers (D-014): a Worker has no `document`,
 * so pdfjs's default DOMCanvasFactory would crash creating its internal
 * scratch canvases. Implements the full BaseCanvasFactory contract
 * (create/reset/destroy) over OffscreenCanvas; pdfjs instantiates the class
 * itself via getDocument's `CanvasFactory` option, passing
 * { ownerDocument, enableHWA } — deliberately ignored, hence no declared
 * constructor.
 */
export class OffscreenCanvasFactory {
  create(
    width: number,
    height: number,
  ): {
    canvas: OffscreenCanvas;
    context: OffscreenCanvasRenderingContext2D;
  } {
    if (width <= 0 || height <= 0) throw new Error('Invalid canvas size');
    const canvas = this._createCanvas(width, height);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (context === null) throw new Error('Failed to acquire 2D context');
    return { canvas, context };
  }

  reset(
    canvasAndContext: {
      canvas: OffscreenCanvas | null;
      context: OffscreenCanvasRenderingContext2D | null;
    },
    width: number,
    height: number,
  ): void {
    const { canvas } = canvasAndContext;
    if (canvas === null) throw new Error('Canvas is not specified');
    if (width <= 0 || height <= 0) throw new Error('Invalid canvas size');
    canvas.width = width;
    canvas.height = height;
  }

  destroy(canvasAndContext: {
    canvas: OffscreenCanvas | null;
    context: OffscreenCanvasRenderingContext2D | null;
  }): void {
    const { canvas } = canvasAndContext;
    if (canvas === null) throw new Error('Canvas is not specified');
    canvas.width = 0;
    canvas.height = 0;
    canvasAndContext.canvas = null;
    canvasAndContext.context = null;
  }

  private _createCanvas(width: number, height: number): OffscreenCanvas {
    return new OffscreenCanvas(width, height);
  }
}

// ---------------------------------------------------------------------------
// Document open / teardown
// ---------------------------------------------------------------------------

export interface RenderDoc {
  readonly doc: PDFDocumentProxy;
  readonly factory: CanvasFactoryLike;
  close(): Promise<void>;
}

/** Open a (pre-flight-validated) PDF in pdfjs for rendering. Callers must
 * pre-flight with pdf-lib's loadPdf first — error taxonomy stays
 * consistent and encrypted/malformed inputs never reach pdfjs. */
export async function openRenderDoc(bytes: Uint8Array): Promise<RenderDoc> {
  const pdfjs = await getPdfjs();
  const src: Record<string, unknown> = {
    // pdfjs transfers/detaches the data buffer — pass a private copy.
    data: bytes.slice(),
    isEvalSupported: false,
    ...pdfjsSourceOptions(),
  };
  // Browser Worker: no `document`, so supply the OffscreenCanvas-based
  // factory class (D-014). Read via globalThis so the DOM-lib-typed
  // `document` binding isn't statically narrowed to "always defined" in
  // browser builds (in a Worker it genuinely is undefined at runtime).
  const globals = globalThis as { document?: unknown; OffscreenCanvas?: unknown };
  const inWorker =
    !IS_NODE && globals.document === undefined && globals.OffscreenCanvas !== undefined;
  if (inWorker) {
    src.CanvasFactory = OffscreenCanvasFactory;
  }
  const loadingTask = pdfjs.getDocument(src);
  let doc: PDFDocumentProxy;
  try {
    doc = await loadingTask.promise;
  } catch {
    // The pdf-lib pre-flight already rejected the common failure modes;
    // anything pdfjs still chokes on is not a renderable PDF for us.
    throw toolError('invalid-pdf', 'This PDF could not be opened for rendering.');
  }
  return {
    doc,
    factory: doc.canvasFactory as unknown as CanvasFactoryLike,
    close: async () => {
      await doc.cleanup();
      await loadingTask.destroy();
    },
  };
}

/** openRenderDoc + guaranteed teardown + ToolError normalization. */
export async function withRenderDoc<T>(
  bytes: Uint8Array,
  fn: (renderDoc: RenderDoc) => Promise<T>,
): Promise<T> {
  const renderDoc = await openRenderDoc(bytes);
  try {
    return await fn(renderDoc);
  } catch (err) {
    if (err instanceof ToolError) throw err;
    throw toolError('invalid-pdf', 'This PDF could not be rendered.');
  } finally {
    await renderDoc.close();
  }
}

// ---------------------------------------------------------------------------
// Page rendering
// ---------------------------------------------------------------------------

/** Sanity cap on single-page pixel buffers (Section 5.2 client-side
 * analog): 64 MP ≈ A4 at scale 10, an 8K-class image. */
export const MAX_RENDER_PIXELS = 64_000_000;

export interface RenderedSurface {
  readonly width: number;
  readonly height: number;
  readonly canvas: unknown;
  readonly context: Canvas2D;
  destroy(): void;
}

/** Render one page at `scale` (1 = 72dpi) onto a factory canvas. The
 * surface must be destroyed (after encoding/pixel work) — canvases are
 * pooled by pdfjs's factory and zeroed on destroy. */
export async function renderPageSurface(
  renderDoc: RenderDoc,
  pageNumber: number,
  scale: number,
): Promise<RenderedSurface> {
  const page: PDFPageProxy = await renderDoc.doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  const width = Math.ceil(viewport.width);
  const height = Math.ceil(viewport.height);
  if (width * height > MAX_RENDER_PIXELS) {
    throw toolError(
      'invalid-option',
      'This page is too large to render at that scale — lower the scale and retry.',
    );
  }
  const entry = renderDoc.factory.create(width, height);
  const context = entry.context as Canvas2D;
  const task: RenderTask = page.render({
    // pdfjs's typings assume DOM canvas; skia/OffscreenCanvas surfaces are
    // structurally identical for rendering purposes — one cast each.
    canvas: entry.canvas as HTMLCanvasElement,
    canvasContext: entry.context as CanvasRenderingContext2D,
    viewport,
  });
  await task.promise;
  return {
    width,
    height,
    canvas: entry.canvas,
    context,
    destroy: () => {
      renderDoc.factory.destroy(entry);
    },
  };
}

/** A blank factory canvas (for building diff overlays etc.). */
export function createBlankSurface(
  renderDoc: RenderDoc,
  width: number,
  height: number,
): RenderedSurface {
  const entry = renderDoc.factory.create(width, height);
  return {
    width,
    height,
    canvas: entry.canvas,
    context: entry.context as Canvas2D,
    destroy: () => {
      renderDoc.factory.destroy(entry);
    },
  };
}

// ---------------------------------------------------------------------------
// Encoding + pixel transforms
// ---------------------------------------------------------------------------

type ToBufferFn = (mime: string, config?: { quality?: number }) => Uint8Array;

/** Encode a rendered surface to PNG/JPEG bytes. Node (@napi-rs/canvas):
 * synchronous toBuffer. Browser: HTMLCanvasElement.toBlob (main thread) or
 * OffscreenCanvas.convertToBlob (Worker), both async. */
export async function encodeSurface(
  surface: RenderedSurface,
  format: RenderFormat,
  quality: number,
): Promise<Uint8Array> {
  const skia = surface.canvas as { toBuffer?: ToBufferFn };
  const toBuffer = skia.toBuffer;
  if (typeof toBuffer === 'function') {
    return toBuffer.call(skia, format === 'png' ? 'image/png' : 'image/jpeg', { quality });
  }
  const dom = surface.canvas as HTMLCanvasElement | OffscreenCanvas;
  const mime = format === 'png' ? 'image/png' : 'image/jpeg';
  const blob: Blob =
    'convertToBlob' in dom
      ? await dom.convertToBlob({ type: mime, ...(format === 'jpeg' ? { quality } : {}) })
      : await domToBlob(dom, mime, quality);
  return new Uint8Array(await blob.arrayBuffer());
}

function domToBlob(canvas: HTMLCanvasElement, mime: string, quality: number): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob !== null) resolve(blob);
        else reject(toolError('invalid-pdf', 'Image encoding failed.'));
      },
      mime,
      quality,
    );
  });
}

/** BT.601 luma desaturation, in place (alpha untouched). pdf-lib has no
 * non-separable blend modes, so true grayscale needs this pixel-space
 * transform on a rendered image (D-014). */
export function desaturate(image: ImageDataLike): void {
  const d = image.data;
  for (let i = 0; i + 3 < d.length; i += 4) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    if (r === undefined || g === undefined || b === undefined) continue;
    const v = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    d[i] = v;
    d[i + 1] = v;
    d[i + 2] = v;
  }
}
