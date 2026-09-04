/**
 * Color tools (PROJECT_SPEC 3.4): hex/rgb/hsl/oklch converter + palette
 * generation, and CSS gradient generator. All in-house color math —
 * sRGB↔linear, CSS Color 4 oklch with the standard OKLab matrices.
 */

import { devError, requireText } from '../types';

export type ColorSpace = 'hex' | 'rgb' | 'hsl' | 'oklch';

export interface Rgb {
  r: number; // 0..255
  g: number;
  b: number;
}

export interface Hsl {
  h: number; // 0..360
  s: number; // 0..100 (percent)
  l: number;
}

export interface Oklch {
  l: number; // 0..1
  c: number; // 0..0.4-ish
  h: number; // 0..360
}

export interface ColorResult {
  hex: string;
  rgb: Rgb;
  hsl: Hsl;
  oklch: Oklch;
}

/* -------- parsing -------- */

export function parseColor(input: string): Rgb {
  const text = input.trim().toLowerCase();
  // #rgb #rgba #rrggbb #rrggbbaa
  const hex = /^#?([0-9a-f]{3,8})$/.exec(text);
  if (hex?.[1] !== undefined) {
    const h = hex[1];
    if (h.length === 3 || h.length === 4) {
      const digit = (i: number): number => parseInt(h[i] ?? '0', 16) * 17; // 0xf → 0xff = 15*17=255
      return { r: digit(0), g: digit(1), b: digit(2) };
    }
    if (h.length === 6 || h.length === 8) {
      const r = parseInt(h.slice(0, 2), 16);
      const g = parseInt(h.slice(2, 4), 16);
      const b = parseInt(h.slice(4, 6), 16);
      if ([r, g, b].some((v) => Number.isNaN(v))) throw devError('invalid-input', badColor(input));
      return { r, g, b };
    }
  }
  const rgbM =
    /^rgba?\(\s*([\d.]+%?)\s*[, ]\s*([\d.]+%?)\s*[, ]\s*([\d.]+%?)\s*(?:[,/].*)?\)$/.exec(text);
  if (rgbM !== null) {
    const chan = (raw: string | undefined): number => {
      if (raw === undefined) throw devError('invalid-input', badColor(input));
      return raw.endsWith('%')
        ? Math.round((parseFloat(raw) / 100) * 255)
        : Math.round(parseFloat(raw));
    };
    const r = chan(rgbM[1]),
      g = chan(rgbM[2]),
      b = chan(rgbM[3]);
    if ([r, g, b].some((v) => !Number.isFinite(v) || v < 0 || v > 255)) {
      throw devError('invalid-input', badColor(input));
    }
    return { r, g, b };
  }
  const hslM =
    /^hsla?\(\s*([\d.]+)(?:deg)?\s*[, ]\s*([\d.]+)%\s*[, ]\s*([\d.]+)%\s*(?:[,/].*)?\)$/.exec(text);
  if (hslM !== null) {
    const h = Number(hslM[1]);
    const s = Number(hslM[2]);
    const l = Number(hslM[3]);
    if (![h, s, l].every((v) => Number.isFinite(v)) || s < 0 || s > 100 || l < 0 || l > 100) {
      throw devError('invalid-input', badColor(input));
    }
    return hslToRgb({ h: ((h % 360) + 360) % 360, s, l });
  }
  const okM =
    /^oklch\(\s*([\d.]+)%?\s*[, ]\s*([\d.]+)%?\s*(?:[, ]\s*([\d.]+)(?:deg)?\s*)?.*\)$/.exec(text);
  if (okM !== null) {
    const lRaw = parseFloat(okM[1] ?? '0');
    const l = okM[1]?.endsWith('%') ? lRaw / 100 : lRaw;
    const cRaw = parseFloat(okM[2] ?? '0');
    const c = okM[2]?.endsWith('%') ? cRaw / 250 : cRaw;
    const h = parseFloat(okM[3] ?? '0');
    if (![l, c, h].every((v) => Number.isFinite(v)) || l < 0 || l > 1) {
      throw devError('invalid-input', badColor(input));
    }
    return oklchToRgb({ l, c, h: ((h % 360) + 360) % 360 });
  }
  throw devError('invalid-input', badColor(input));
}

function badColor(input: string): string {
  return `“${input.trim()}” is not a recognized color. Use hex (#0a64d0), rgb(), hsl(), or oklch().`;
}

/* -------- conversions -------- */

export function rgbToHex({ r, g, b }: Rgb): string {
  const to = (v: number): string =>
    Math.max(0, Math.min(255, Math.round(v)))
      .toString(16)
      .padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

export function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const rn = r / 255,
    gn = g / 255,
    bn = b / 255;
  const max = Math.max(rn, gn, bn),
    min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn:
        h = (gn - bn) / d + (gn < bn ? 6 : 0);
        break;
      case gn:
        h = (bn - rn) / d + 2;
        break;
      default:
        h = (rn - gn) / d + 4;
    }
    h *= 60;
  }
  return { h, s: s * 100, l: l * 100 };
}

export function hslToRgb({ h, s, l }: Hsl): Rgb {
  const sn = s / 100,
    ln = l / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let rgb: [number, number, number];
  if (hp < 1) rgb = [c, x, 0];
  else if (hp < 2) rgb = [x, c, 0];
  else if (hp < 3) rgb = [0, c, x];
  else if (hp < 4) rgb = [0, x, c];
  else if (hp < 5) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  const m = ln - c / 2;
  return {
    r: Math.round((rgb[0] + m) * 255),
    g: Math.round((rgb[1] + m) * 255),
    b: Math.round((rgb[2] + m) * 255),
  };
}

/* OKLab — Björn Ottosson's reference matrices (CSS Color 4). */
function srgbToLinear(v: number): number {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
function linearToSrgb(v: number): number {
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
  return Math.round(Math.max(0, Math.min(1, c)) * 255);
}

export function rgbToOklch(rgb: Rgb): Oklch {
  const r = srgbToLinear(rgb.r),
    g = srgbToLinear(rgb.g),
    b = srgbToLinear(rgb.b);
  const l_ = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m_ = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s_ = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const bb = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;
  const c = Math.sqrt(a * a + bb * bb);
  let h = (Math.atan2(bb, a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { l: L, c, h };
}

export function oklchToRgb({ l, c, h }: Oklch): Rgb {
  const hr = (h * Math.PI) / 180;
  const a = Math.cos(hr) * c;
  const bb = Math.sin(hr) * c;
  const l_ = l + 0.3963377774 * a + 0.2158037573 * bb;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * bb;
  const s_ = l - 0.0894841775 * a - 1.291485548 * bb;
  const l3 = l_ ** 3,
    m3 = m_ ** 3,
    s3 = s_ ** 3;
  const r = 4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
  const g = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
  const b = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3;
  const out = { r: linearToSrgb(r), g: linearToSrgb(g), b: linearToSrgb(b) };
  // Out-of-gamut oklch clamps — parseColor tests expect 0..255 range.
  if ([out.r, out.g, out.b].some((v) => !Number.isFinite(v))) {
    throw devError('invalid-input', 'This oklch color is out of range.');
  }
  return out;
}

export function convertColor(input: string): ColorResult {
  requireText(input, 'color');
  const rgb = parseColor(input);
  return {
    hex: rgbToHex(rgb),
    rgb,
    hsl: rgbToHsl(rgb),
    oklch: rgbToOklch(rgb),
  };
}

/* -------- palette generation -------- */

export interface PaletteSwatch {
  hex: string;
  role: string;
}

/** Harmonies derived in oklch — perceptual, not naive RGB shifts. */
export function generatePalette(
  input: string,
  harmony: 'complementary' | 'analogous' | 'triad' | 'monochrome' = 'analogous',
): PaletteSwatch[] {
  const base = parseColor(input);
  const baseO = rgbToOklch(base);
  const roles: { role: string; oklch: Oklch }[] = [];
  const push = (role: string, l: number, c: number, h: number): void => {
    roles.push({ role, oklch: { l: clamp01(l), c: Math.max(0, c), h: ((h % 360) + 360) % 360 } });
  };
  switch (harmony) {
    case 'complementary':
      push('base', baseO.l, baseO.c, baseO.h);
      push('complement', baseO.l, baseO.c, baseO.h + 180);
      push('light', Math.min(0.95, baseO.l + 0.2), baseO.c * 0.6, baseO.h);
      push('dark', Math.max(0.15, baseO.l - 0.2), baseO.c * 0.8, baseO.h + 180);
      break;
    case 'triad':
      push('base', baseO.l, baseO.c, baseO.h);
      push('triad-2', baseO.l, baseO.c, baseO.h + 120);
      push('triad-3', baseO.l, baseO.c, baseO.h + 240);
      push('muted', baseO.l, baseO.c * 0.4, baseO.h);
      break;
    case 'monochrome':
      push('darkest', Math.max(0.15, baseO.l - 0.3), baseO.c, baseO.h);
      push('darker', Math.max(0.2, baseO.l - 0.15), baseO.c, baseO.h);
      push('base', baseO.l, baseO.c, baseO.h);
      push('lighter', Math.min(0.9, baseO.l + 0.15), baseO.c, baseO.h);
      push('lightest', Math.min(0.97, baseO.l + 0.3), baseO.c * 0.6, baseO.h);
      break;
    default: // analogous
      push('base', baseO.l, baseO.c, baseO.h);
      push('left', baseO.l, baseO.c * 0.9, baseO.h - 30);
      push('far-left', baseO.l * 0.95, baseO.c * 0.8, baseO.h - 60);
      push('right', baseO.l, baseO.c * 0.9, baseO.h + 30);
      push('far-right', baseO.l * 0.95, baseO.c * 0.8, baseO.h + 60);
  }
  return roles.map(({ role, oklch }) => ({ role, hex: rgbToHex(oklchToRgb(oklch)) }));
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
}

/* -------- gradient generator -------- */

export interface GradientStop {
  color: string;
  position: number; // 0..100
}

export interface GradientOptions {
  stops: GradientStop[];
  angle: number; // degrees
  type: 'linear' | 'radial';
  repeating?: boolean;
}

export interface GradientResult {
  css: string;
  previewCss: string;
}

export function generateGradient(options: GradientOptions): GradientResult {
  const { stops, angle, type } = options;
  if (!Array.isArray(stops) || stops.length < 2) {
    throw devError('invalid-option', 'A gradient needs at least two color stops.');
  }
  const sorted = [...stops].sort((a, b) => a.position - b.position);
  for (const s of sorted) {
    parseColor(s.color); // validate each stop
    if (!Number.isFinite(s.position) || s.position < 0 || s.position > 100) {
      throw devError('invalid-option', 'Stop positions must be between 0 and 100.');
    }
  }
  const list = sorted
    .map((s) => `${s.color.trim()} ${String(Number(s.position.toFixed(1)))}%`)
    .join(', ');
  const kind = options.repeating === true ? 'repeating-' : '';
  const css =
    type === 'radial'
      ? `background: ${kind}radial-gradient(circle, ${list});`
      : `background: ${kind}linear-gradient(${String(angle)}deg, ${list});`;
  return { css, previewCss: css };
}
