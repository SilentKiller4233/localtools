/**
 * Pixel-domain shared ops: resize (with aspect lock + resampling) and
 * pure helpers used by compressor/resizer/batch tools.
 */

import { imageError, type ImageDataLike } from '../types.js';

export type FitMode = 'stretch' | 'contain';

/** Nearest-neighbor resample — fast, deterministic, no deps. */
export function resizePixels(
  image: ImageDataLike,
  targetW: number,
  targetH: number,
): ImageDataLike {
  if (!Number.isInteger(targetW) || !Number.isInteger(targetH) || targetW < 1 || targetH < 1) {
    throw imageError('invalid-option', 'Target dimensions must be positive whole numbers.');
  }
  if (targetW > 12000 || targetH > 12000) {
    throw imageError('invalid-option', 'Target dimensions are too large (max 12000px per side).');
  }
  const src = image.data;
  const srcW = image.width;
  const srcH = image.height;
  const out = new Uint8ClampedArray(targetW * targetH * 4);
  // Box-average when downscaling for acceptable quality; nearest when up.
  const xRatio = srcW / targetW;
  const yRatio = srcH / targetH;
  for (let y = 0; y < targetH; y += 1) {
    for (let x = 0; x < targetW; x += 1) {
      const dst = (y * targetW + x) * 4;
      if (xRatio >= 1 && yRatio >= 1) {
        // Box average over the source rect (better downscale quality).
        const x0 = Math.floor(x * xRatio);
        const y0 = Math.floor(y * yRatio);
        const x1 = Math.min(srcW, Math.max(x0 + 1, Math.floor((x + 1) * xRatio)));
        const y1 = Math.min(srcH, Math.max(y0 + 1, Math.floor((y + 1) * yRatio)));
        let r = 0;
        let g = 0;
        let b = 0;
        let a = 0;
        let count = 0;
        for (let sy = y0; sy < y1; sy += 1) {
          for (let sx = x0; sx < x1; sx += 1) {
            const s = (sy * srcW + sx) * 4;
            r += src[s] ?? 0;
            g += src[s + 1] ?? 0;
            b += src[s + 2] ?? 0;
            a += src[s + 3] ?? 255;
            count += 1;
          }
        }
        out[dst] = r / count;
        out[dst + 1] = g / count;
        out[dst + 2] = b / count;
        out[dst + 3] = a / count;
      } else {
        const sx = Math.min(srcW - 1, Math.floor(x * xRatio));
        const sy = Math.min(srcH - 1, Math.floor(y * yRatio));
        const s = (sy * srcW + sx) * 4;
        out[dst] = src[s] ?? 0;
        out[dst + 1] = src[s + 1] ?? 0;
        out[dst + 2] = src[s + 2] ?? 0;
        out[dst + 3] = src[s + 3] ?? 255;
      }
    }
  }
  return { data: out, width: targetW, height: targetH };
}

export type ResizeMode = 'exact' | 'percent' | 'max-dimension';

export interface ResizeOptions {
  mode: ResizeMode;
  /** exact: target width/height; percent: scale %; max-dimension: cap px. */
  width?: number;
  height?: number;
  percent?: number;
  maxDimension?: number;
  /** Keep aspect ratio (ignored for exact both-dims given). */
  keepAspect?: boolean;
}

/** Compute target dims per mode (never upscale for max-dimension). */
export function computeTarget(
  srcW: number,
  srcH: number,
  opts: ResizeOptions,
): { width: number; height: number } {
  switch (opts.mode) {
    case 'percent': {
      const pct = opts.percent ?? 100;
      if (!Number.isFinite(pct) || pct <= 0 || pct > 1000) {
        throw imageError('invalid-option', 'Percent must be between 1 and 1000.');
      }
      return {
        width: Math.max(1, Math.round((srcW * pct) / 100)),
        height: Math.max(1, Math.round((srcH * pct) / 100)),
      };
    }
    case 'max-dimension': {
      const cap = opts.maxDimension;
      if (cap === undefined || !Number.isFinite(cap) || cap < 1 || cap > 12000) {
        throw imageError('invalid-option', 'Max dimension must be between 1 and 12000.');
      }
      const scale = Math.min(1, cap / Math.max(srcW, srcH));
      return {
        width: Math.max(1, Math.round(srcW * scale)),
        height: Math.max(1, Math.round(srcH * scale)),
      };
    }
    case 'exact': {
      const w = opts.width;
      const h = opts.height;
      if (w === undefined && h === undefined) {
        throw imageError('invalid-option', 'Provide a width, a height, or both.');
      }
      if (w !== undefined && (!Number.isFinite(w) || w < 1 || w > 12000)) {
        throw imageError('invalid-option', 'Width must be 1-12000.');
      }
      if (h !== undefined && (!Number.isFinite(h) || h < 1 || h > 12000)) {
        throw imageError('invalid-option', 'Height must be 1-12000.');
      }
      if (opts.keepAspect !== false && w !== undefined && h !== undefined) {
        // Both given with aspect lock: fit inside (contain).
        const scale = Math.min(w / srcW, h / srcH);
        return {
          width: Math.max(1, Math.round(srcW * scale)),
          height: Math.max(1, Math.round(srcH * scale)),
        };
      }
      if (w !== undefined && h !== undefined) {
        if (w < 1 || h < 1 || w > 12000 || h > 12000) {
          throw imageError('invalid-option', 'Dimensions must be 1-12000.');
        }
        return { width: Math.round(w), height: Math.round(h) };
      }
      // One given + aspect lock: derive the other.
      if (w !== undefined) {
        if (w < 1 || w > 12000) throw imageError('invalid-option', 'Width must be 1-12000.');
        return { width: Math.round(w), height: Math.max(1, Math.round((srcH * w) / srcW)) };
      }
      const hh = h ?? 1;
      if (hh < 1 || hh > 12000) throw imageError('invalid-option', 'Height must be 1-12000.');
      return { width: Math.max(1, Math.round((srcW * hh) / srcH)), height: Math.round(hh) };
    }
    default:
      throw imageError('invalid-option', 'Unknown resize mode.');
  }
}
