/**
 * SVG optimizer (PROJECT_SPEC Section 3.3 — GUI SVGOMG equivalent).
 * svgo 4 ships an ESM API: optimize(svg, { path?, multipass }) —
 * verified against the installed package's exports.
 */

import { optimize } from 'svgo';
import { imageError } from '../types.js';

export interface SvgOptimizeOptions {
  /** Run multiple passes until converged (SVGOMG's default). */
  multipass?: boolean;
  /** Precision for float attrs (SVGOMG default 3). */
  floatPrecision?: number;
}

export interface SvgOptimizeResult {
  svg: string;
  originalSize: number;
  newSize: number;
}

export function optimizeSvg(svgText: string, opts: SvgOptimizeOptions = {}): SvgOptimizeResult {
  if (svgText.trim().length === 0) throw imageError('empty-input');
  if (svgText.length > 10 * 1024 * 1024) {
    throw imageError('size-limit', 'SVG input is limited to 10MB.');
  }
  const lower = svgText.trimStart().toLowerCase();
  if (!lower.startsWith('<?xml') && !lower.startsWith('<svg')) {
    throw imageError('invalid-image', 'Paste the raw contents of an .svg file.');
  }
  const precision = opts.floatPrecision ?? 3;
  if (!Number.isFinite(precision) || precision < 0 || precision > 10) {
    throw imageError('invalid-option', 'Precision must be 0-10.');
  }
  let result: { data: string };
  try {
    result = optimize(svgText, {
      multipass: opts.multipass ?? true,
      floatPrecision: precision,
      // Conservative default preset minus metadata removal is svgo's own
      // default; we explicitly keep viewBox (never break scaling).
      plugins: [
        {
          name: 'preset-default',
          params: {
            overrides: {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any -- svgo 4 param shape
              removeViewBox: false,
            } as never,
          },
        },
      ] as never,
    });
  } catch {
    throw imageError('invalid-image', 'This SVG could not be parsed.');
  }
  return {
    svg: result.data,
    originalSize: new TextEncoder().encode(svgText).byteLength,
    newSize: new TextEncoder().encode(result.data).byteLength,
  };
}
