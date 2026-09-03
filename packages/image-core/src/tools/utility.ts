/**
 * Image ↔ Base64 data-URI converter + color palette extractor + favicon
 * generator (PROJECT_SPEC Section 3.3).
 */

import { imageError, type ImageDataLike } from '../types.js';
import { decodeAuto } from './convert.js';
import { png } from '../codecs.js';
import { resizePixels } from './resize.js';

/* ---------------- base64 ---------------- */

const MIME_BY_EXT: Readonly<Record<string, string>> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  webp: 'image/webp',
  avif: 'image/avif',
  bmp: 'image/bmp',
  heic: 'image/heic',
  gif: 'image/gif',
  tiff: 'image/tiff',
};

/** Raw file → `data:<mime>;base64,…` string (safe: content is base64). */
export function imageToDataUri(bytes: Uint8Array, ext: string): string {
  if (bytes.byteLength === 0) throw imageError('empty-input');
  if (bytes.byteLength > 25 * 1024 * 1024) {
    throw imageError('size-limit', 'Base64 output is limited to 25MB inputs.');
  }
  const mime = MIME_BY_EXT[ext.toLowerCase()] ?? 'application/octet-stream';
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  if (typeof btoa === 'function') {
    return `data:${mime};base64,${btoa(bin)}`;
  }
  // Node fallback (workers expose btoa; vitest node may not in strict envs)
  const b64 = Buffer.from(bin, 'binary').toString('base64');
  return `data:${mime};base64,${b64}`;
}

/** `data:…` string → { bytes, ext } (validates the prefix + base64). */
export function dataUriToImage(uri: string): { bytes: Uint8Array; ext: string } {
  const m = /^data:([a-z]+\/[a-z0-9.+-]+);base64,(.+)$/i.exec(uri.trim());
  if (m === null) {
    throw imageError('invalid-option', 'Paste a full data URI: data:image/…;base64,…');
  }
  const mime: string = (m[1] ?? '').toLowerCase();
  const b64: string = m[2] ?? '';
  const ext = Object.entries(MIME_BY_EXT).find(([, v]) => v === mime)?.[0] ?? 'bin';
  let bin: string;
  if (typeof atob === 'function') {
    try {
      bin = atob(b64);
    } catch {
      throw imageError('invalid-option', 'The base64 part is not valid.');
    }
  } else {
    try {
      bin = Buffer.from(b64, 'base64').toString('binary');
    } catch {
      throw imageError('invalid-option', 'The base64 part is not valid.');
    }
  }
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return { bytes: out, ext };
}

/* ---------------- palette extractor ---------------- */

export interface PaletteSwatch {
  hex: string;
  rgb: [number, number, number];
  /** Approximate share of the image covered by this cluster. */
  weight: number;
}

/** k-means over sampled pixels (spec: small in-house pass, no deps). */
export function extractPalette(image: ImageDataLike, k: number = 6): PaletteSwatch[] {
  const clusters = Math.max(2, Math.min(12, k));
  const { width, height, data } = image;
  // Sample on a stride so big images stay fast.
  const stride = Math.max(4, Math.floor(Math.sqrt((width * height) / 4096)));
  const samples: [number, number, number][] = [];
  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      const i = (y * width + x) * 4;
      const a = data[i + 3] ?? 255;
      if (a < 32) continue; // skip transparent
      samples.push([data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0]);
    }
  }
  if (samples.length === 0) throw imageError('invalid-image');

  // Deterministic seeding: spread across the sample list.
  const centroids: [number, number, number][] = [];
  for (let c = 0; c < clusters; c += 1) {
    const idx = Math.floor((c / clusters) * samples.length);
    const seed: [number, number, number] = samples[Math.min(idx, samples.length - 1)] ?? [0, 0, 0];
    centroids.push(seed);
  }

  const assignments = new Array<number>(samples.length).fill(0);
  for (let iter = 0; iter < 10; iter += 1) {
    let changed = false;
    for (let s = 0; s < samples.length; s += 1) {
      const sample0: [number, number, number] = samples[s] ?? [0, 0, 0];
      const r: number = sample0[0];
      const g: number = sample0[1];
      const b: number = sample0[2];
      let best = 0;
      let bestDist = Number.POSITIVE_INFINITY;
      for (let c = 0; c < centroids.length; c += 1) {
        const ctr: [number, number, number] = centroids[c] ?? [0, 0, 0];
        const dr = r - ctr[0];
        const dg = g - ctr[1];
        const db = b - ctr[2];
        const dist = dr * dr + dg * dg + db * db;
        if (dist < bestDist) {
          bestDist = dist;
          best = c;
        }
      }
      if ((assignments[s] ?? -1) !== best) {
        assignments[s] = best;
        changed = true;
      }
    }
    if (!changed && iter > 0) break;
    // Recompute centroids.
    const sums: number[][] = centroids.map(() => [0, 0, 0, 0]);
    for (let s = 0; s < samples.length; s += 1) {
      const c = assignments[s] ?? 0;
      const sum: number[] = sums[c] ?? [0, 0, 0, 0];
      const sample: [number, number, number] = samples[s] ?? [0, 0, 0];
      sum[0] = (sum[0] ?? 0) + sample[0];
      sum[1] = (sum[1] ?? 0) + sample[1];
      sum[2] = (sum[2] ?? 0) + sample[2];
      sum[3] = (sum[3] ?? 0) + 1;
    }
    for (let c = 0; c < centroids.length; c += 1) {
      const sum = sums[c];
      if (sum !== undefined) {
        const n = sum[3] ?? 0;
        if (n > 0) centroids[c] = [(sum[0] ?? 0) / n, (sum[1] ?? 0) / n, (sum[2] ?? 0) / n];
      }
    }
  }

  const counts = new Array<number>(clusters).fill(0);
  for (const a of assignments) counts[a] = (counts[a] ?? 0) + 1;
  const swatches = centroids
    .map((c, i) => ({
      rgb: [Math.round(c[0]), Math.round(c[1]), Math.round(c[2])] as [number, number, number],
      weight: (counts[i] ?? 0) / samples.length,
    }))
    .filter((s) => s.weight > 0)
    .sort((a, b) => b.weight - a.weight);
  return swatches.map((s): PaletteSwatch => ({
    hex: `#${s.rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`,
    rgb: s.rgb,
    weight: s.weight,
  }));
}

/** Decode + palette in one call. */
export async function paletteFromImage(bytes: Uint8Array, k?: number): Promise<PaletteSwatch[]> {
  if (bytes.byteLength === 0) throw imageError('empty-input');
  const image = await decodeAuto(bytes);
  return extractPalette(image, k);
}

/* ---------------- favicon generator ---------------- */

export interface FaviconOutput {
  name: string;
  bytes: Uint8Array;
}

/** PNG bytes at a given size (encoder path, no deps). */
async function pngAtSize(image: ImageDataLike, size: number): Promise<Uint8Array> {
  const resized = resizePixels(image, size, size);
  const out = await png.encode(resized);
  return out instanceof Uint8Array ? out : new Uint8Array(out);
}

/** ICO container: PNG-embedded icons (widely supported by browsers). */
function buildIco(pngs: { size: number; bytes: Uint8Array }[]): Uint8Array {
  // ICONDIR: 6 bytes; ICONDIRENTRY: 16 bytes each; then PNG data.
  const entries = pngs.length;
  let total = 6 + entries * 16;
  for (const p of pngs) total += p.bytes.byteLength;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint16(0, 0, true); // reserved
  view.setUint16(2, 1, true); // type: icon
  view.setUint16(4, entries, true);
  let offset = 6;
  let dataOffset = 6 + entries * 16;
  for (const p of pngs) {
    const s = p.size >= 256 ? 0 : p.size;
    out[offset] = s; // width
    out[offset + 1] = s; // height
    out[offset + 2] = 0; // palette
    out[offset + 3] = 0; // reserved
    view.setUint16(offset + 4, 1, true); // color planes
    view.setUint16(offset + 6, 32, true); // bpp
    view.setUint32(offset + 8, p.bytes.byteLength, true);
    view.setUint32(offset + 12, dataOffset, true);
    out.set(p.bytes, dataOffset);
    dataOffset += p.bytes.byteLength;
    offset += 16;
  }
  return out;
}

export interface FaviconOptions {
  /** Include the .ico multi-size container. Default true. */
  includeIco?: boolean;
  /** PNG sizes to emit. */
  sizes?: readonly number[];
}

export interface FaviconResult {
  files: FaviconOutput[];
  /** Ready-to-paste <link> manifest snippet. */
  htmlSnippet: string;
}

/** Standard favicon set: .ico + 16/32/180/192/512 PNGs + snippet. */
export async function generateFavicon(
  bytes: Uint8Array,
  opts: FaviconOptions = {},
): Promise<FaviconResult> {
  if (bytes.byteLength === 0) throw imageError('empty-input');
  const image = await decodeAuto(bytes);
  if (image.width < 64 || image.height < 64) {
    throw imageError('invalid-option', 'Use an image at least 64×64 so icons aren’t blurry.');
  }
  const sizes = opts.sizes ?? [16, 32, 180, 192, 512];
  const files: FaviconOutput[] = [];
  if (opts.includeIco !== false) {
    const icoPngs: { size: number; bytes: Uint8Array }[] = [];
    for (const size of [16, 32, 48]) {
      icoPngs.push({ size, bytes: await pngAtSize(image, size) });
    }
    files.push({ name: 'favicon.ico', bytes: buildIco(icoPngs) });
  }
  for (const size of sizes) {
    const pngBytes = await pngAtSize(image, size);
    const label = size === 180 ? 'apple-touch-icon' : `favicon-${String(size)}x${String(size)}`;
    files.push({ name: `${label}.png`, bytes: pngBytes });
  }
  const htmlSnippet = [
    '<link rel="icon" href="/favicon.ico" sizes="any">',
    '<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">',
    '<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">',
    '<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">',
    '<link rel="manifest" href="/site.webmanifest">',
  ].join('\n');
  return { files, htmlSnippet };
}
