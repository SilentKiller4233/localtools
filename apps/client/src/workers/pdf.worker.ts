/**
 * PDF suite worker (Section 8): every Group A pdf-core call executes here,
 * never on the main thread. 50MB+ inputs must never block UI — all parse,
 * render, and qpdf work happens in this context.
 *
 * The D-014 canvas strategy applies: a Worker has no `document`, so
 * render-dependent tools get the OffscreenCanvasFactory via getDocument's
 * CanvasFactory option automatically inside pdf-core's render module.
 */
import type { ToolRequest, ToolResponse } from '../lib/pdf-worker-client';
import * as pdf from '@localtools/pdf-core';

type Payload = {
  files: { name: string; bytes: Uint8Array }[];
  options: Record<string, unknown>;
};

function fail(id: number, err: unknown): ToolResponse {
  const code =
    typeof err === 'object' && err !== null && 'code' in err ? String(err.code) : 'invalid-pdf';
  const message = err instanceof Error ? err.message : 'The operation failed.';
  return { id, ok: false, code, message };
}

/** Tool dispatch: each entry validates its options inline and calls pdf-core. */
const DISPATCH: Record<string, (p: Payload) => Promise<unknown>> = {
  'merge-pdf': async (p) => pdf.mergePdfs(p.files.map((f) => f.bytes)),
  'split-pdf': async (p) =>
    pdf.splitPdf(file0(p), {
      ...(p.options.mode === 'by-size'
        ? { mode: 'by-size', targetBytes: num(p.options.targetBytes) }
        : { mode: 'every-n', everyN: num(p.options.everyN) }),
    }),
  'extract-pages': async (p) => pdf.extractPages(file0(p), str(p.options.ranges)),
  'delete-pages': async (p) => pdf.deletePages(file0(p), str(p.options.ranges)),
  'organize-pages': async (p) => pdf.organizePages(file0(p), str(p.options.order)),
  'rotate-pages': async (p) =>
    pdf.rotatePages(file0(p), {
      angle: num(p.options.angle),
      ...(p.options.ranges === undefined ? {} : { ranges: str(p.options.ranges) }),
    }),
  'crop-pages': async (p) => pdf.cropPages(file0(p), cropOptions(p.options)),
  'page-numbers': async (p) => pdf.addPageNumbers(file0(p), pageNumbersOptions(p.options)),
  watermark: async (p) =>
    pdf.addTextWatermark(file0(p), {
      text: str(p.options.text),
      ...(p.options.fontSize === undefined ? {} : { fontSize: num(p.options.fontSize) }),
      ...(p.options.opacity === undefined ? {} : { opacity: num(p.options.opacity) }),
      ...(p.options.rotation === undefined ? {} : { rotation: num(p.options.rotation) }),
      ...(p.options.position === undefined ? {} : { position: str(p.options.position) as never }),
      ...(p.options.tile === undefined ? {} : { tile: p.options.tile === true }),
      ...(p.options.color === undefined ? {} : { color: str(p.options.color) }),
    }),
  'pdf-to-image': async (p) =>
    pdf.pdfToImage(file0(p), {
      ...(p.options.pages === undefined ? {} : { pages: str(p.options.pages) }),
      ...(p.options.scale === undefined ? {} : { scale: num(p.options.scale) }),
      ...(p.options.format === undefined ? {} : { format: str(p.options.format) }),
      ...(p.options.quality === undefined ? {} : { quality: num(p.options.quality) }),
    }),
  'image-to-pdf': async (p) =>
    pdf.imagesToPdf(
      p.files.map((f) => ({ bytes: f.bytes, name: f.name })),
      {
        ...(p.options.pageSize === undefined ? {} : { pageSize: str(p.options.pageSize) as never }),
        ...(p.options.margin === undefined ? {} : { margin: num(p.options.margin) }),
      },
    ),
  'protect-pdf': async (p) =>
    pdf.protectPdf(file0(p), {
      userPassword: str(p.options.userPassword),
      ...(p.options.ownerPassword === undefined
        ? {}
        : { ownerPassword: str(p.options.ownerPassword) }),
      ...(p.options.level === undefined ? {} : { level: str(p.options.level) as never }),
    }),
  'unlock-pdf': async (p) => pdf.unlockPdf(file0(p), str(p.options.password)),
  'optimize-linearize': async (p) => pdf.optimizePdf(file0(p)),
  'redact-pdf': async (p) =>
    pdf.redactPdfByText(file0(p), str(p.options.search), optionalStr(p.options.pages)),
  'redact-by-text': async (p) =>
    pdf.redactPdfByText(file0(p), str(p.options.search), optionalStr(p.options.pages)),
  'compare-pdfs': async (p) =>
    pdf.comparePdfs(file0(p), file1(p), {
      ...(p.options.visual === true || p.options.visual === 'true' ? { visual: true } : {}),
    }),
  'quick-compress': async (p) => pdf.quickCompress(file0(p)),
  'fill-forms': async (p) =>
    p.options.read === true
      ? pdf.readFormFields(file0(p))
      : pdf.fillForm(file0(p), (p.options.values ?? {}) as Record<string, string | boolean>, {
          ...(p.options.flatten === undefined ? {} : { flatten: p.options.flatten === true }),
        }),
  'read-form-fields': async (p) => pdf.readFormFields(file0(p)),
  'edit-metadata': async (p) => pdf.editMetadata(file0(p), metadataInput(p.options)),
  'read-metadata': async (p) => pdf.readMetadata(file0(p)),
  'bookmarks-toc': async (p) => pdf.setBookmarks(file0(p), p.options.entries as never),
  'read-bookmarks': async (p) => pdf.readBookmarks(file0(p)),
  'resize-pages': async (p) => pdf.resizePages(file0(p), { size: str(p.options.size) }),
  'n-up-layout': async (p) => pdf.nUpPages(file0(p), { layout: str(p.options.layout) }),
  'grayscale-pdf': async (p) =>
    pdf.grayscalePdf(file0(p), {
      ...(p.options.pages === undefined ? {} : { pages: str(p.options.pages) }),
      ...(p.options.scale === undefined ? {} : { scale: num(p.options.scale) }),
    }),
  'pdf-to-text': async (p) => pdf.extractText(file0(p), {}),
  'repair-pdf': async (p) => pdf.repairPdf(file0(p)),
  'sign-pdf': async (p) => pdf.signPdf(file0(p), signature(p.options)),
  // scan-to-pdf is imagesToPdf composed with the camera capture UI;
  // its worker tool is the same as image-to-pdf's.
  'scan-to-pdf': async (p) =>
    pdf.imagesToPdf(
      p.files.map((f) => ({ bytes: f.bytes, name: f.name })),
      {},
    ),
};

function optionalStr(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() !== '' ? v : undefined;
}
function file0(p: Payload): Uint8Array {
  const first = p.files[0];
  if (first === undefined) throw new Error('No file supplied.');
  return first.bytes;
}
function file1(p: Payload): Uint8Array {
  const second = p.files[1];
  if (second === undefined) throw new Error('Two files are required for this tool.');
  return second.bytes;
}
function num(v: unknown): number {
  return typeof v === 'number' ? v : Number(v);
}
function str(v: unknown): string {
  return typeof v === 'string' ? v : String(v);
}
function cropOptions(o: Record<string, unknown>): pdf.CropOptions {
  return {
    ...(o.top === undefined ? {} : { top: num(o.top) }),
    ...(o.right === undefined ? {} : { right: num(o.right) }),
    ...(o.bottom === undefined ? {} : { bottom: num(o.bottom) }),
    ...(o.left === undefined ? {} : { left: num(o.left) }),
    ...(o.unit === undefined ? {} : { unit: str(o.unit) as pdf.CropUnit }),
    ...(o.ranges === undefined ? {} : { ranges: str(o.ranges) }),
  };
}
function pageNumbersOptions(o: Record<string, unknown>): pdf.PageNumbersOptions {
  return {
    ...(o.startAt === undefined ? {} : { startAt: num(o.startAt) }),
    ...(o.format === undefined ? {} : { format: str(o.format) as never }),
    ...(o.position === undefined ? {} : { position: str(o.position) as never }),
    ...(o.fontSize === undefined ? {} : { fontSize: num(o.fontSize) }),
    ...(o.ranges === undefined ? {} : { ranges: str(o.ranges) }),
  };
}
function metadataInput(o: Record<string, unknown>): pdf.MetadataInput {
  const out: pdf.MetadataInput = {};
  for (const key of ['title', 'author', 'subject', 'keywords', 'creator'] as const) {
    const value = o[key];
    if (typeof value === 'string') out[key] = value;
  }
  return out;
}
function signature(o: Record<string, unknown>): pdf.SignaturePlacement {
  const imageBytes = o.imageBytes;
  return {
    kind: str(o.kind) as pdf.SignatureKind,
    ...(o.page === undefined ? {} : { page: num(o.page) }),
    ...(o.x === undefined ? {} : { x: num(o.x) }),
    ...(o.y === undefined ? {} : { y: num(o.y) }),
    ...(o.width === undefined ? {} : { width: num(o.width) }),
    ...(o.height === undefined ? {} : { height: num(o.height) }),
    ...(o.text === undefined ? {} : { text: str(o.text) }),
    ...(imageBytes instanceof Uint8Array ? { imageBytes } : {}),
  };
}

self.addEventListener('message', (event: MessageEvent<ToolRequest>) => {
  const req = event.data;
  const handler = DISPATCH[req.tool];
  if (handler === undefined) {
    (self as unknown as Worker).postMessage(fail(req.id, new Error(`Unknown tool "${req.tool}".`)));
    return;
  }
  void (async () => {
    try {
      const result = await handler({ files: req.files, options: req.options });
      (self as unknown as Worker).postMessage({ id: req.id, ok: true, result });
    } catch (err) {
      (self as unknown as Worker).postMessage(fail(req.id, err));
    }
  })();
});
