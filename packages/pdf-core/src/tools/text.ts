import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';
import { ToolError } from '../errors';
import { loadPdf } from '../load';

export type TextFormat = 'text' | 'markdown';

/**
 * pdfjs is loaded lazily and environment-appropriately: the legacy build
 * (main-thread fake worker) is the documented Node path — the standard
 * build's worker spawn hangs under Node/vitest — while the browser uses the
 * normal build with its real worker.
 *
 * Typed via the main package's PDFDocumentProxy/PDFPageProxy; the dynamic
 * import target is untyped, so the module is cast to the documented shape.
 */
type PdfjsLike = {
  getDocument: (src: { data: Uint8Array; isEvalSupported: boolean }) => PDFDocumentLoadingTask;
};
let pdfjsPromise: Promise<PdfjsLike> | undefined;

// Runtime environment detection: this module runs in BOTH the browser (Vite
// bundle, where `process` does not exist) and Node (tests/engine). The
// eslint rule cannot see cross-environment code, hence the targeted disable.
// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
const IS_NODE = typeof process !== 'undefined' && process.versions?.node !== undefined;

function getPdfjs(): Promise<PdfjsLike> {
  if (pdfjsPromise === undefined) {
    pdfjsPromise = IS_NODE
      ? import('pdfjs-dist/legacy/build/pdf.mjs').then((m) => m as PdfjsLike)
      : import('pdfjs-dist').then((m) => m as PdfjsLike);
  }
  return pdfjsPromise;
}

/**
 * Extract text from a PDF via pdfjs (Section 3.1: PDF→text/Markdown).
 * Group A: in-process in both targets. Encrypted/malformed/size inputs are
 * rejected by the shared loadPdf pre-flight before pdfjs ever sees bytes.
 */
export async function extractText(
  bytes: Uint8Array,
  options: { format?: TextFormat } = {},
): Promise<string> {
  await loadPdf(bytes);
  const pdfjs = await getPdfjs();
  let text: string;
  try {
    const loadingTask = pdfjs.getDocument({
      // pdfjs transfers/detaches the buffer — pass a private copy.
      data: bytes.slice(),
      isEvalSupported: false,
    });
    const doc: PDFDocumentProxy = await loadingTask.promise;
    const pages: string[] = [];
    for (let i = 1; i <= doc.numPages; i += 1) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item) => ('str' in item && 'hasEOL' in item ? item : null))
        .filter((item): item is TextItem => item !== null)
        .map((item) => (item.hasEOL ? `${item.str}\n` : item.str))
        .join('');
      pages.push(pageText.trimEnd());
    }
    await doc.cleanup();
    // destroy() lives on the LOADING TASK in pdfjs 6 (PDFDocumentProxy only
    // has cleanup()); it tears down the worker/fake-worker.
    await loadingTask.destroy();
    text = pages.join('\n\n');
  } catch (err) {
    if (err instanceof ToolError) throw err;
    throw new ToolError('invalid-pdf', 'The text layer of this PDF could not be read.');
  }
  if (text.trim() === '') {
    // Section 13: image-only scan on a text-dependent operation.
    throw new ToolError(
      'invalid-option',
      'This PDF has no extractable text — it may be a scan. Use the OCR tool (available after Phase 4).',
    );
  }
  if (options.format === 'markdown') {
    // Structural hints (headings etc.) are a future enhancement; page
    // breaks already render as paragraph breaks via the double newline.
    return text;
  }
  return text;
}
