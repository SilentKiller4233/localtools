import { degrees } from 'pdf-lib';
import { loadPdf, parsePageRanges } from '../load';
import { ToolError } from '../errors';

const ALLOWED_ANGLES: readonly number[] = [90, 180, 270];

export interface RotateOptions {
  /** Clockwise degrees: 90, 180, or 270. */
  angle: number;
  /** Page selection; defaults to every page when omitted. */
  ranges?: string;
}

/**
 * Rotate pages clockwise by 90/180/270 (Section 3.1). `ranges` defaults to
 * all pages; selection syntax and all input-error paths shared with the rest
 * of the suite.
 */
export async function rotatePages(bytes: Uint8Array, options: RotateOptions): Promise<Uint8Array> {
  const doc = await loadPdf(bytes);
  const pageCount = doc.getPageCount();
  const angle = options.angle;
  if (!ALLOWED_ANGLES.includes(angle)) {
    throw new ToolError('page-range', 'Rotation must be 90, 180, or 270 degrees.');
  }
  const indices =
    options.ranges === undefined
      ? Array.from({ length: pageCount }, (_, i) => i)
      : parsePageRanges(options.ranges, pageCount);
  const pages = doc.getPages();
  for (const i of indices) {
    const page = pages[i];
    if (page === undefined) {
      throw new ToolError('page-range', `Page ${String(i + 1)} is missing.`);
    }
    page.setRotation(degrees((page.getRotation().angle + angle) % 360));
  }
  return doc.save();
}
