/**
 * Meme text overlay + screenshot annotator (PROJECT_SPEC Section 3.3).
 * Both are pure pixel/canvas-domain operations over decoded images.
 */

import { imageError, type ImageDataLike } from '../types.js';
import { decodeAuto, flattenOnWhite } from './convert.js';
import { jpeg, png } from '../codecs.js';

/** 5x7 bitmap font for pixel text (built-in, no font files needed). */
const FONT: Readonly<Record<string, string[]>> = (() => {
  // Compact 1-bit glyphs, 5 wide x 7 tall, as strings of '.'/'#'.
  const defs: Record<string, string[]> = {
    A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
    B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
    C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
    D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
    E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
    F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
    G: ['01110', '10001', '10000', '10111', '10001', '10001', '01110'],
    H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
    I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
    J: ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
    K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
    L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
    M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
    N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
    O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
    P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
    Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
    R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
    S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
    T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
    U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
    V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
    W: ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
    X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
    Y: ['10001', '10001', '10001', '01010', '00100', '00100', '00100'],
    Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
    '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
    '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
    '2': ['01110', '10001', '00001', '00110', '01000', '10000', '11111'],
    '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
    '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
    '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
    '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
    '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
    '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
    '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
    ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
    '!': ['00100', '00100', '00100', '00100', '00100', '00000', '00100'],
    '.': ['00000', '00000', '00000', '00000', '00000', '00000', '00100'],
    ',': ['00000', '00000', '00000', '00000', '00100', '00100', '01000'],
    '?': ['01110', '10001', '00001', '00110', '00100', '00000', '00100'],
    "'": ['00100', '00100', '00000', '00000', '00000', '00000', '00000'],
    '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
    ':': ['00000', '00100', '00000', '00000', '00000', '00100', '00000'],
  };
  return defs;
})();

const GLYPH_W = 5;
const GLYPH_H = 7;

/** Render text onto pixels with a scale factor and color; wraps lines. */
function drawText(
  image: ImageDataLike,
  text: string,
  opts: {
    x: number;
    y: number;
    scale: number;
    color: [number, number, number];
    strokeColor?: [number, number, number];
    maxWidth?: number;
    align?: 'left' | 'center' | 'right';
  },
): ImageDataLike {
  const { width, height, data } = image;
  const out = new Uint8ClampedArray(data.length);
  out.set(data);
  const scale = Math.max(1, Math.round(opts.scale));
  const [ir, ig, ib] = opts.color;
  const stroke = opts.strokeColor;
  const lines = text.split('\n');

  const plot = (px: number, py: number, r: number, g: number, b: number): void => {
    if (px < 0 || px >= width || py < 0 || py >= height) return;
    const dst = (py * width + px) * 4;
    out[dst] = r;
    out[dst + 1] = g;
    out[dst + 2] = b;
    out[dst + 3] = 255;
  };

  let cursorY = Math.round(opts.y);
  for (const line of lines) {
    const upper = line.toUpperCase();
    const lineW = upper.length * (GLYPH_W + 1) * scale;
    let startX = Math.round(opts.x);
    if (opts.align === 'center' && opts.maxWidth !== undefined) {
      startX = Math.round(opts.x + (opts.maxWidth - lineW) / 2);
    } else if (opts.align === 'right' && opts.maxWidth !== undefined) {
      startX = Math.round(opts.x + opts.maxWidth - lineW);
    }

    // Two passes: stroke ring first (under), ink second (over).
    for (const pass of ['stroke', 'ink'] as const) {
      let cursorX = Math.max(0, startX);
      for (const ch of upper) {
        const glyph: string[] = FONT[ch] ?? [
          '00000',
          '00100',
          '00100',
          '00100',
          '00000',
          '00100',
          '00000',
        ];
        if (pass === 'stroke' && stroke !== undefined) {
          const [sr, sg, sb] = stroke;
          for (let gy = 0; gy < GLYPH_H; gy += 1) {
            for (let gx = 0; gx < GLYPH_W; gx += 1) {
              if ((glyph[gy]?.[gx] ?? '0') === '1') continue;
              const up = gy > 0 && (glyph[gy - 1]?.[gx] ?? '0') === '1';
              const down = gy < GLYPH_H - 1 && (glyph[gy + 1]?.[gx] ?? '0') === '1';
              const left = gx > 0 && (glyph[gy]?.[gx - 1] ?? '0') === '1';
              const right = gx < GLYPH_W - 1 && (glyph[gy]?.[gx + 1] ?? '0') === '1';
              if (up || down || left || right) {
                for (let dy = 0; dy < scale; dy += 1) {
                  for (let dx = 0; dx < scale; dx += 1) {
                    plot(cursorX + gx * scale + dx, cursorY + gy * scale + dy, sr, sg, sb);
                  }
                }
              }
            }
          }
        } else if (pass === 'ink') {
          for (let gy = 0; gy < GLYPH_H; gy += 1) {
            for (let gx = 0; gx < GLYPH_W; gx += 1) {
              if ((glyph[gy]?.[gx] ?? '0') !== '1') continue;
              for (let dy = 0; dy < scale; dy += 1) {
                for (let dx = 0; dx < scale; dx += 1) {
                  plot(cursorX + gx * scale + dx, cursorY + gy * scale + dy, ir, ig, ib);
                }
              }
            }
          }
        }
        cursorX += (GLYPH_W + 1) * scale;
      }
    }
    cursorY += (GLYPH_H + 2) * scale;
  }
  return { data: out, width, height };
}

export interface MemeOptions {
  topText?: string;
  bottomText?: string;
  target?: 'jpeg' | 'png' | 'webp';
  quality?: number;
}

export async function makeMeme(bytes: Uint8Array, opts: MemeOptions): Promise<Uint8Array> {
  if (bytes.byteLength === 0) throw imageError('empty-input');
  if ((opts.topText ?? '') === '' && (opts.bottomText ?? '') === '') {
    throw imageError('invalid-option', 'Add top or bottom text first.');
  }
  const image = await decodeAuto(bytes);
  const scale = Math.max(2, Math.round(image.width / 20));
  let canvas: ImageDataLike = image;
  if (opts.topText !== undefined && opts.topText !== '') {
    canvas = drawText(canvas, opts.topText, {
      x: 0,
      y: Math.round(image.height * 0.04),
      scale,
      color: [255, 255, 255],
      strokeColor: [0, 0, 0],
      maxWidth: image.width,
      align: 'center',
    });
  }
  if (opts.bottomText !== undefined && opts.bottomText !== '') {
    const lines = opts.bottomText.split('\n').length;
    const bottomY = image.height - Math.round(image.height * 0.04) - lines * (GLYPH_H + 2) * scale;
    canvas = drawText(canvas, opts.bottomText, {
      x: 0,
      y: Math.max(0, bottomY),
      scale,
      color: [255, 255, 255],
      strokeColor: [0, 0, 0],
      maxWidth: image.width,
      align: 'center',
    });
  }
  const quality = opts.quality ?? 88;
  switch (opts.target ?? 'jpeg') {
    case 'jpeg': {
      const out = await jpeg.encode(flattenOnWhite(canvas), { quality });
      return out instanceof Uint8Array ? out : new Uint8Array(out);
    }
    case 'png': {
      const out = await png.encode(canvas);
      return out instanceof Uint8Array ? out : new Uint8Array(out);
    }
    default:
      throw imageError('invalid-option', 'Target must be jpeg, png, or webp.');
  }
}

/* ---------------- screenshot annotator ---------------- */

export type AnnotateShape =
  | {
      kind: 'box';
      x: number;
      y: number;
      w: number;
      h: number;
      color: [number, number, number];
      thickness?: number;
    }
  | {
      kind: 'arrow';
      x: number;
      y: number;
      x2: number;
      y2: number;
      color: [number, number, number];
      thickness?: number;
    }
  | { kind: 'blur'; x: number; y: number; w: number; h: number; blocks?: number };

export interface AnnotateOptions {
  shapes: AnnotateShape[];
  target?: 'png' | 'jpeg' | 'webp';
  quality?: number;
}

/** Draw one shape family onto pixels (box/arrow vector, blur = mosaic). */
function drawShape(image: ImageDataLike, shape: AnnotateShape): ImageDataLike {
  const { width, height, data } = image;
  const out = new Uint8ClampedArray(data.length);
  out.set(data);
  const put = (x: number, y: number, color: [number, number, number]): void => {
    const px = Math.round(x);
    const py = Math.round(y);
    if (px < 0 || px >= width || py < 0 || py >= height) return;
    const dst = (py * width + px) * 4;
    out[dst] = color[0];
    out[dst + 1] = color[1];
    out[dst + 2] = color[2];
    out[dst + 3] = 255;
  };
  if (shape.kind === 'box') {
    const t = shape.thickness ?? 3;
    const color = shape.color;
    for (let s = 0; s < t; s += 1) {
      for (let x = shape.x; x <= shape.x + shape.w; x += 1) {
        put(x, shape.y + s, color);
        put(x, shape.y + shape.h - s, color);
      }
      for (let y = shape.y; y <= shape.y + shape.h; y += 1) {
        put(shape.x + s, y, color);
        put(shape.x + shape.w - s, y, color);
      }
    }
  } else if (shape.kind === 'arrow') {
    const t = shape.thickness ?? 3;
    const color = shape.color;
    const dx = shape.x2 - shape.x;
    const dy = shape.y2 - shape.y;
    const len = Math.max(Math.abs(dx), Math.abs(dy));
    for (let i = 0; i <= len; i += 1) {
      const x = shape.x + (dx * i) / len;
      const y = shape.y + (dy * i) / len;
      for (let s = 0; s < t; s += 1) {
        put(x + s, y, color);
        put(x, y + s, color);
      }
    }
    // Arrowhead: two short lines back from the tip.
    const angle = Math.atan2(dy, dx);
    const headLen = Math.max(8, t * 4);
    for (const spread of [Math.PI / 7, -Math.PI / 7]) {
      const hx = shape.x2 - headLen * Math.cos(angle + spread);
      const hy = shape.y2 - headLen * Math.sin(angle + spread);
      const hdx = hx - shape.x2;
      const hdy = hy - shape.y2;
      const hlen = Math.max(1, Math.hypot(hdx, hdy));
      for (let i = 0; i <= hlen; i += 1) {
        const x = shape.x2 + (hdx * i) / hlen;
        const y = shape.y2 + (hdy * i) / hlen;
        put(x, y, color);
      }
    }
  } else {
    // Pixelate (mosaic) — honest redaction-style blur, no kernel needed.
    // (kind narrowed to 'blur' by the exhaustive else.)
    const blocks = (shape as { blocks?: number }).blocks ?? 16;
    const bx = Math.max(1, Math.round(shape.w / blocks));
    const by = Math.max(1, Math.round(shape.h / blocks));
    for (let gy = shape.y; gy < shape.y + shape.h; gy += by) {
      for (let gx = shape.x; gx < shape.x + shape.w; gx += bx) {
        let r = 0;
        let g = 0;
        let b = 0;
        let n = 0;
        for (let py = gy; py < Math.min(gy + by, shape.y + shape.h); py += 1) {
          for (let px = gx; px < Math.min(gx + bx, shape.x + shape.w); px += 1) {
            const pxr = Math.round(px);
            const pyr = Math.round(py);
            if (pxr < 0 || pxr >= width || pyr < 0 || pyr >= height) continue;
            const src = (pyr * width + pxr) * 4;
            r += data[src] ?? 0;
            g += data[src + 1] ?? 0;
            b += data[src + 2] ?? 0;
            n += 1;
          }
        }
        if (n === 0) continue;
        const avg: [number, number, number] = [r / n, g / n, b / n];
        for (let py = gy; py < Math.min(gy + by, shape.y + shape.h); py += 1) {
          for (let px = gx; px < Math.min(gx + bx, shape.x + shape.w); px += 1) {
            put(px, py, avg);
          }
        }
      }
    }
  }
  return { data: out, width, height };
}

export async function annotateScreenshot(
  bytes: Uint8Array,
  opts: AnnotateOptions,
): Promise<Uint8Array> {
  if (bytes.byteLength === 0) throw imageError('empty-input');
  if (opts.shapes.length === 0) {
    throw imageError('invalid-option', 'Add at least one annotation (box, arrow, or blur).');
  }
  if (opts.shapes.length > 50) {
    throw imageError('invalid-option', 'Annotations are limited to 50 shapes.');
  }
  let image = await decodeAuto(bytes);
  for (const shape of opts.shapes) {
    image = drawShape(image, shape);
  }
  const quality = opts.quality ?? 90;
  switch (opts.target ?? 'png') {
    case 'png': {
      const out = await png.encode(image);
      return out instanceof Uint8Array ? out : new Uint8Array(out);
    }
    case 'jpeg': {
      const out = await jpeg.encode(flattenOnWhite(image), { quality });
      return out instanceof Uint8Array ? out : new Uint8Array(out);
    }
    default:
      throw imageError('invalid-option', 'Target must be png or jpeg.');
  }
}
