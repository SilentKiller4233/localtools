import { StandardFonts } from 'pdf-lib';
import { loadPdf } from '../load';
import { ToolError, toolError } from '../errors';
import { sniffImage } from './image-to-pdf';

export type SignatureKind = 'draw' | 'type' | 'image';

export interface SignaturePlacement {
  /** 'draw' = PNG of hand-drawn strokes; 'type' = text; 'image' = uploaded. */
  kind: SignatureKind;
  /** 1-based target page; default 1. */
  page?: number;
  /** Bottom-left corner of the signature box, in PDF points. */
  x?: number;
  y?: number;
  /** Rendered box size in points. Height derived from aspect when omitted. */
  width?: number;
  height?: number;
  /** kind='type': the text to render (also used as cursive-style label). */
  text?: string;
  /** kind='draw'/'image': PNG/JPG image bytes of the signature/cutout. */
  imageBytes?: Uint8Array;
}

export interface SignResult {
  output: Uint8Array;
  /** Effective placement actually applied (for the UI echo). */
  applied: { page: number; x: number; y: number; width: number; height: number };
}

const DEFAULT_WIDTH = 180; // ≈ 2.5 inches
const MARGIN_FALLBACK = 40;

/**
 * Sign PDF (Section 3.1): place a VISUAL signature — drawn strokes (PNG
 * from the client's canvas pad), typed text, or an uploaded image — at a
 * position on a page. Deliberately NOT a legal e-signature workflow: no
 * audit trail, no certificate signing (Section 7 boundary). Group A: pure
 * pdf-lib drawing, no helper, no network.
 */
export async function signPdf(
  bytes: Uint8Array,
  placement: SignaturePlacement,
): Promise<SignResult> {
  if (placement.kind === 'type') {
    const text = placement.text?.trim() ?? '';
    if (text === '') {
      throw new ToolError('invalid-option', 'Type the name you want to appear as your signature.');
    }
    if (text.length > 100) {
      throw new ToolError('invalid-option', 'Signature text is limited to 100 characters.');
    }
  } else {
    const img = placement.imageBytes;
    if (img === undefined || img.byteLength === 0) {
      throw new ToolError(
        'invalid-option',
        'Provide the signature image (draw it, or upload a PNG/JPG).',
      );
    }
    const kind = sniffImage(img);
    if (kind === 'unknown') {
      throw new ToolError('invalid-option', 'Signature image must be a PNG or JPG.');
    }
  }

  const doc = await loadPdf(bytes);
  const pageCount = doc.getPageCount();
  const page = Math.trunc(placement.page ?? 1);
  if (!Number.isInteger(page) || page < 1 || page > pageCount) {
    throw toolError('page-range', `Page ${String(page)} does not exist in this document.`);
  }
  const target = doc.getPage(page - 1);
  const { width: pageW } = target.getSize();

  // Box: explicit size wins; otherwise default width with aspect-ratio
  // height from the embedded image; text derives height from font metrics.
  const w = placement.width ?? DEFAULT_WIDTH;
  const h = placement.height;
  if (h !== undefined && (!Number.isFinite(h) || h <= 0)) {
    throw new ToolError('invalid-option', 'Signature height must be a positive number.');
  }
  if (!Number.isFinite(w) || w <= 0) {
    throw new ToolError('invalid-option', 'Signature width must be a positive number.');
  }

  // Position: default = bottom-right with a margin (the common signing spot).
  const x = placement.x;
  const y = placement.y;
  if (x !== undefined && !Number.isFinite(x)) {
    throw new ToolError('invalid-option', 'Signature X position must be a number.');
  }
  if (y !== undefined && !Number.isFinite(y)) {
    throw new ToolError('invalid-option', 'Signature Y position must be a number.');
  }

  if (placement.kind === 'type') {
    const font = await doc.embedFont(StandardFonts.HelveticaOblique);
    const size = 24;
    const text = placement.text?.trim() ?? '';
    const textW = font.widthOfTextAtSize(text, size);
    const boxW = Math.min(w, Math.max(80, textW + 16));
    const boxH = h ?? size * 1.5;
    const drawX = x ?? Math.max(0, pageW - boxW - MARGIN_FALLBACK);
    const drawY = y ?? MARGIN_FALLBACK;
    target.drawText(text, { x: drawX + 4, y: drawY + boxH / 2 - size / 2 + 2, size, font });
    // A thin baseline rule under the text — reads as a signature line.
    target.drawLine({
      start: { x: drawX, y: drawY },
      end: { x: drawX + boxW, y: drawY },
      thickness: 0.75,
    });
    return {
      output: await doc.save(),
      applied: { page, x: drawX, y: drawY, width: boxW, height: boxH },
    };
  }

  const imgBytes = placement.imageBytes ?? new Uint8Array(0);
  const embedded =
    sniffImage(imgBytes) === 'png' ? await doc.embedPng(imgBytes) : await doc.embedJpg(imgBytes);
  const finalW = w;
  const finalH = h ?? (embedded.height / embedded.width) * finalW;
  const drawX = x ?? Math.max(0, pageW - finalW - MARGIN_FALLBACK);
  const drawY = y ?? MARGIN_FALLBACK;
  target.drawImage(embedded, { x: drawX, y: drawY, width: finalW, height: finalH });
  return {
    output: await doc.save(),
    applied: { page, x: drawX, y: drawY, width: finalW, height: finalH },
  };
}
