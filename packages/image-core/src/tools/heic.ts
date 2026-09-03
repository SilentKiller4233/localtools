/**
 * HEIC/HEIF → JPG/PNG (PROJECT_SPEC Section 3.3 — iPhone photos).
 * Node + browser dual path:
 *  - Node: heic-decode (libheif-js wasm, ISC) — verified working
 *    (decode via `{ buffer }`, returns RGBA).
 *  - Browser Worker: same package works (its wasm-bundle needs no DOM;
 *    heic2any was rejected — it hard-requires `window` at import).
 * After decode, re-encode via the @jsquash codecs.
 */

import { imageError, type ImageDataLike } from '../types.js';
import { sniffImageFormat } from '../sniff.js';
import { flattenOnWhite } from './convert.js';
import { jpeg, png } from '../codecs.js';

export interface HeicOptions {
  target: 'jpeg' | 'png';
  quality?: number;
}

export async function convertHeic(bytes: Uint8Array, opts: HeicOptions): Promise<Uint8Array> {
  if (bytes.byteLength === 0) throw imageError('empty-input');
  const sniff = sniffImageFormat(bytes);
  if (sniff !== 'heic') {
    throw imageError(
      'invalid-image',
      'This doesn’t look like a HEIC/HEIF photo (iPhone photo format).',
    );
  }
  const quality = opts.quality ?? 85;
  if (!Number.isFinite(quality) || quality < 1 || quality > 100) {
    throw imageError('invalid-option', 'Quality must be between 1 and 100.');
  }

  // heic-decode is CJS; dynamic import interop.
  const mod = (await import('heic-decode')) as unknown as {
    default?: (o: {
      buffer: Uint8Array;
    }) => Promise<{ width: number; height: number; data: Uint8Array }>;
  } & Record<string, unknown>;
  const decodeFn = (mod.default ?? mod) as (o: { buffer: Uint8Array }) => Promise<{
    width: number;
    height: number;
    data: Uint8Array;
  }>;

  let raw: { width: number; height: number; data: Uint8Array };
  try {
    // Copy into a clean Uint8Array (Buffer's SharedArrayBuffer backing is
    // rejected by wasm in some paths — same lesson as D-017).
    const clean = new Uint8Array(bytes.byteLength);
    clean.set(bytes);
    raw = await decodeFn({ buffer: clean });
  } catch {
    throw imageError('invalid-image', 'This HEIC file could not be decoded — it may be damaged.');
  }

  const image: ImageDataLike = {
    data: new Uint8ClampedArray(raw.data.buffer, raw.data.byteOffset, raw.data.byteLength),
    width: raw.width,
    height: raw.height,
  };

  switch (opts.target) {
    case 'png': {
      const out = await png.encode(image);
      return out instanceof Uint8Array ? out : new Uint8Array(out);
    }
    case 'jpeg': {
      const out = await jpeg.encode(flattenOnWhite(image), { quality });
      return out instanceof Uint8Array ? out : new Uint8Array(out);
    }
    default:
      throw imageError('invalid-option', 'Target must be jpg or png.');
  }
}
