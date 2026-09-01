import { PDFDocument } from 'pdf-lib';
import { loadPdf } from '../load';
import { ToolError } from '../errors';

/** Paper sizes in points, keyed by name (Section 3.1 "Resize page dimensions"). */
export const PAGE_SIZES: Readonly<Record<string, readonly [number, number]>> = {
  a4: [595.28, 841.89],
  a3: [841.89, 1190.55],
  a5: [419.53, 595.28],
  letter: [612, 792],
  legal: [612, 1008],
};

export type PageSizeName = keyof typeof PAGE_SIZES;

export interface ResizePagesOptions {
  /** One of PAGE_SIZES keys (validated at runtime): a4, a3, a5, letter, legal. */
  size: string;
  /** Shrink/keep content on the new page: 'contain' centers content scaled down; 'top-left' pins origin. */
  content?: 'contain' | 'top-left';
}

/**
 * Resize page dimensions (Section 3.1). The page box is set via setMediaBox +
 * setCropBox; original content is preserved by embedding each old page onto a
 * new-size page ('contain' scales down to fit and centers, 'top-left' pins).
 */
export async function resizePages(
  bytes: Uint8Array,
  options: ResizePagesOptions,
): Promise<Uint8Array> {
  const entry = (PAGE_SIZES as Record<string, readonly [number, number] | undefined>)[options.size];
  if (entry === undefined) {
    throw new ToolError(
      'invalid-option',
      `Unknown page size "${options.size}". Supported: ${Object.keys(PAGE_SIZES).join(', ')}.`,
    );
  }
  const src = await loadPdf(bytes);
  const [targetW, targetH] = PAGE_SIZES[options.size] ?? [595.28, 841.89];
  const mode = options.content ?? 'contain';

  const out = await PDFDocument.create();
  for (const page of src.getPages()) {
    const { width: origW, height: origH } = page.getSize();
    const newPage = out.addPage([targetW, targetH]);
    const embedded = await out.embedPage(page);
    if (mode === 'contain') {
      const scale = Math.min(targetW / origW, targetH / origH);
      const scaled = embedded.scale(scale);
      const x = (targetW - scaled.width) / 2;
      const y = (targetH - scaled.height) / 2;
      newPage.drawPage(embedded, { x, y, width: scaled.width, height: scaled.height });
    } else {
      newPage.drawPage(embedded, { x: 0, y: 0 });
    }
  }
  return out.save();
}
