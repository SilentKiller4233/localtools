import { loadPdf, parsePageRanges } from '../load';
import { ToolError } from '../errors';

/** Units for the crop margins. */
export type CropUnit = 'pt' | 'percent';

export interface CropOptions {
  /** All margins default to 0 (no-op crop) unless at least one is set. */
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
  unit?: CropUnit;
  /** Page selection; default every page. */
  ranges?: string;
}

/**
 * Crop pages (Section 3.1): shrink the CropBox by per-side margins, clamped
 * so the box can never collapse (min 10pt) or invert. Percent unit is
 * relative to each page's own width/height. MediaBox is left untouched —
 * content stays, only the visible region moves (the standard "trim margins"
 * behavior; content outside the crop box is not printed but never destroyed).
 */
export async function cropPages(bytes: Uint8Array, options: CropOptions): Promise<Uint8Array> {
  const unit = options.unit ?? 'pt';
  const top = options.top ?? 0;
  const right = options.right ?? 0;
  const bottom = options.bottom ?? 0;
  const left = options.left ?? 0;
  const margins = [top, right, bottom, left];
  if (margins.some((m) => !Number.isFinite(m) || m < 0)) {
    throw new ToolError('invalid-option', 'Crop margins must be zero or positive numbers.');
  }
  if (margins.every((m) => m === 0)) {
    throw new ToolError('invalid-option', 'Set at least one non-zero margin to crop.');
  }
  if (unit === 'percent' && margins.some((m) => m > 45)) {
    // 45% on every side still leaves 10% visible; anything more on one side
    // alone can collapse the box — hard clamp below enforces the remainder.
    throw new ToolError(
      'invalid-option',
      'Percent margins must stay at or below 45 so the page remains visible.',
    );
  }
  const doc = await loadPdf(bytes);
  const pages = doc.getPages();
  const indices =
    options.ranges === undefined
      ? pages.map((_, i) => i)
      : parsePageRanges(options.ranges, pages.length);
  for (const index of indices) {
    const page = pages[index];
    if (page === undefined) continue; // parsePageRanges guarantees bounds
    const { width, height } = page.getSize();
    const t = unit === 'percent' ? (top / 100) * height : top;
    const r = unit === 'percent' ? (right / 100) * width : right;
    const b = unit === 'percent' ? (bottom / 100) * height : bottom;
    const l = unit === 'percent' ? (left / 100) * width : left;
    const newWidth = Math.max(10, width - l - r);
    const newHeight = Math.max(10, height - t - b);
    // CropBox origin moves inward by (left, bottom); MediaBox origin is the
    // user-space anchor — use it so pre-cropped documents behave sanely.
    const media = page.getMediaBox();
    page.setCropBox(media.x + l, media.y + b, newWidth, newHeight);
  }
  return doc.save();
}
