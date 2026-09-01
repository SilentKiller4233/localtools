import { StandardFonts, degrees, rgb } from 'pdf-lib';
import { loadPdf } from '../load';
import { ToolError } from '../errors';

export type WatermarkPosition =
  'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface WatermarkOptions {
  /** Watermark text. Non-Latin/RTL input is a documented limitation (Section 13). */
  text: string;
  fontSize?: number;
  /** 0..1. */
  opacity?: number;
  /** Degrees counter-clockwise; 0 = horizontal. */
  rotation?: number;
  position?: WatermarkPosition;
  /** Tile the text across the page instead of a single placement. */
  tile?: boolean;
  /** Hex like '#1f6feb'. */
  color?: string;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (m === null || m[1] === undefined) {
    throw new ToolError('invalid-option', `"${hex}" is not a #rrggbb color.`);
  }
  const v = m[1];
  return {
    r: Number.parseInt(v.slice(0, 2), 16) / 255,
    g: Number.parseInt(v.slice(2, 4), 16) / 255,
    b: Number.parseInt(v.slice(4, 6), 16) / 255,
  };
}

/**
 * Text watermark on every page (Section 3.1). Helvetica restricts glyphs to
 * WinAnsi coverage — non-Latin/RTL text is a known limitation recorded in
 * Section 13 and surfaced as a clear error here (the encode throws) rather
 * than silent tofu.
 */
export async function addTextWatermark(
  bytes: Uint8Array,
  options: WatermarkOptions,
): Promise<Uint8Array> {
  if (options.text.trim() === '') {
    throw new ToolError('invalid-option', 'Watermark text is empty.');
  }
  const doc = await loadPdf(bytes);
  let font;
  try {
    font = await doc.embedFont(StandardFonts.Helvetica);
  } catch {
    throw new ToolError('invalid-option', 'Watermark font could not be embedded.');
  }
  const size = options.fontSize ?? 48;
  const opacity = options.opacity ?? 0.15;
  const rotation = options.rotation ?? 45;
  const color = options.color === undefined ? undefined : hexToRgb(options.color);

  for (const page of doc.getPages()) {
    const { width, height } = page.getSize();
    const textWidth = font.widthOfTextAtSize(options.text, size);
    let x: number;
    let y: number;
    switch (options.position ?? 'center') {
      case 'top-left':
        x = 72;
        y = height - 72;
        break;
      case 'top-right':
        x = width - 72 - textWidth;
        y = height - 72;
        break;
      case 'bottom-left':
        x = 72;
        y = 72;
        break;
      case 'bottom-right':
        x = width - 72 - textWidth;
        y = 72;
        break;
      default:
        x = (width - textWidth) / 2;
        y = height / 2;
    }
    if (options.tile === true) {
      // Diagonal tile: repeated draws along the rotation axis, stepped so
      // the text covers the page without overlapping itself.
      const stepX = textWidth + 72;
      const stepY = size + 72;
      for (let ty = 0; ty < height + stepY; ty += stepY) {
        for (let tx = -textWidth; tx < width + stepX; tx += stepX) {
          page.drawText(options.text, {
            x: tx,
            y: ty,
            size,
            font,
            rotate: degrees(rotation),
            opacity,
            ...(color === undefined ? {} : { color: rgb(color.r, color.g, color.b) }),
          });
        }
      }
    } else {
      page.drawText(options.text, {
        x,
        y,
        size,
        font,
        rotate: degrees(rotation),
        opacity,
        ...(color === undefined ? {} : { color: rgb(color.r, color.g, color.b) }),
      });
    }
  }
  return doc.save();
}
