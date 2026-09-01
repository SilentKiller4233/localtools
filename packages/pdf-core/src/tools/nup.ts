import { PDFDocument } from 'pdf-lib';
import { loadPdf } from '../load';
import { ToolError } from '../errors';

export type NUpLayout = '2-up' | '3-up' | '4-up' | '6-up' | '9-up';

/** Grid geometry per layout: [columns, rows]. */
const GRID: Readonly<Record<NUpLayout, readonly [number, number]>> = {
  '2-up': [2, 1],
  '3-up': [3, 1],
  '4-up': [2, 2],
  '6-up': [3, 2],
  '9-up': [3, 3],
};

const GAP = 18; // points between cells
const MARGIN = 18;

export interface NUpOptions {
  /** One of GRID keys: 2-up, 3-up, 4-up, 6-up, 9-up (validated at runtime). */
  layout: string;
  /** Output sheet: a4 | a4-landscape | letter (validated at runtime). */
  sheet?: string;
}

type SheetName = 'a4' | 'a4-landscape' | 'letter';

const SHEETS: Readonly<Record<SheetName, readonly [number, number]>> = {
  a4: [595.28, 841.89],
  'a4-landscape': [841.89, 595.28],
  letter: [612, 792],
};

/**
 * N-up layout (Section 3.1): place multiple input pages onto each output
 * sheet, reading order left→right, top→bottom, each cell scaled to fit.
 * Partial final sheet keeps the same grid (empty cells left blank).
 */
export async function nUpPages(bytes: Uint8Array, options: NUpOptions): Promise<Uint8Array> {
  const grid = (GRID as Record<string, readonly [number, number] | undefined>)[options.layout];
  if (grid === undefined) {
    throw new ToolError('invalid-option', `Unknown N-up layout "${options.layout}".`);
  }
  const sheetName = options.sheet ?? 'a4';
  const sheet = (SHEETS as Record<string, readonly [number, number] | undefined>)[sheetName];
  if (sheet === undefined) {
    throw new ToolError('invalid-option', `Unknown sheet size "${sheetName}".`);
  }
  const [cols, rows] = grid;
  const [sheetW, sheetH] = sheet;
  const src = await loadPdf(bytes);
  const srcPages = src.getPages();

  // embedPage copies the source page into `out`'s context, so embedding
  // pages from the loaded source doc into the output doc is safe.
  const out = await PDFDocument.create();
  const cellW = (sheetW - MARGIN * 2 - GAP * (cols - 1)) / cols;
  const cellH = (sheetH - MARGIN * 2 - GAP * (rows - 1)) / rows;

  const per = cols * rows;
  for (let start = 0; start < srcPages.length; start += per) {
    const sheetPage = out.addPage([sheetW, sheetH]);
    for (let slot = 0; slot < per && start + slot < srcPages.length; slot += 1) {
      const srcPage = srcPages[start + slot];
      if (srcPage === undefined) continue;
      const col = slot % cols;
      const row = Math.floor(slot / cols);
      const embedded = await out.embedPage(srcPage);
      const scale = Math.min(cellW / embedded.width, cellH / embedded.height);
      const scaled = embedded.scale(scale);
      const x = MARGIN + col * (cellW + GAP) + (cellW - scaled.width) / 2;
      const y = sheetH - MARGIN - (row + 1) * cellH - row * GAP + (cellH - scaled.height) / 2;
      sheetPage.drawPage(embedded, {
        x,
        y,
        width: scaled.width,
        height: scaled.height,
      });
    }
  }
  return out.save();
}
