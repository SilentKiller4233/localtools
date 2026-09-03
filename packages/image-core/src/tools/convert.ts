/**
 * Format converter (PROJECT_SPEC Section 3.3): PNG ↔ JPG ↔ WebP ↔ AVIF ↔
 * BMP ↔ GIF ↔ TIFF.
 *
 * Decode: png/jpeg/webp/avif via the @jsquash codecs. BMP decode: hand
 * rolled (uncompressed 24/32-bit is trivial). GIF/TIFF inputs: honest
 * unsupported error today (the @jsquash family has no gif/tiff codec
 * package; recorded in DECISIONS as a v1.1 candidate via a different
 * WASM codec) — the UI shows the message, never a silent failure.
 * Encode: png/jpeg/webp/avif via codecs; BMP via a hand-rolled 24-bit
 * writer (uncompressed BMP is a header + raw BGR rows, lossless).
 */

import { avif, jpeg, png, webp, type Codec } from '../codecs.js';
import { assertDecodable, sniffImageFormat } from '../sniff.js';
import { imageError, type ImageDataLike } from '../types.js';

export type TargetFormat = 'png' | 'jpeg' | 'webp' | 'avif' | 'bmp';

export interface ConvertOptions {
  target: TargetFormat;
  /** JPEG/WebP/AVIF quality, 1-100. Ignored for png/bmp. */
  quality?: number;
}

const CODECS: Readonly<Record<'png' | 'jpeg' | 'webp' | 'avif', Codec>> = {
  png,
  jpeg,
  webp,
  avif,
};

/** Decode BMP (uncompressed 24/32-bit, bottom-up rows, BGR[A]). */
function decodeBmp(bytes: Uint8Array): ImageDataLike {
  if (bytes.byteLength < 54 || bytes[0] !== 0x42 || bytes[1] !== 0x4d) {
    throw imageError('invalid-image');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const pixelOffset = view.getUint32(10, true);
  const headerSize = view.getUint32(14, true);
  if (headerSize < 40) throw imageError('invalid-image', 'Unsupported BMP variant.');
  const width = view.getInt32(18, true);
  const heightRaw = view.getInt32(22, true);
  const bpp = view.getUint16(28, true);
  if (bpp !== 24 && bpp !== 32) {
    throw imageError('unsupported-format', 'Only uncompressed 24/32-bit BMP files are supported.');
  }
  if (width <= 0 || width > 30000 || Math.abs(heightRaw) === 0 || Math.abs(heightRaw) > 30000) {
    throw imageError('invalid-image', 'BMP dimensions are out of range.');
  }
  const topDown = heightRaw < 0;
  const height = Math.abs(heightRaw);
  const rowLen = Math.ceil((bpp * width) / 32) * 4; // 4-byte aligned rows
  const out = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const srcY = topDown ? y : height - 1 - y;
    for (let x = 0; x < width; x += 1) {
      const src = pixelOffset + srcY * rowLen + x * (bpp / 8);
      const b = bytes[src] ?? 0;
      const g = bytes[src + 1] ?? 0;
      const r = bytes[src + 2] ?? 0;
      const a = bpp === 32 ? (bytes[src + 3] ?? 255) : 255;
      const dst = (y * width + x) * 4;
      out[dst] = r;
      out[dst + 1] = g;
      out[dst + 2] = b;
      out[dst + 3] = a;
    }
  }
  return { data: out, width, height };
}

/** Encode BMP (24-bit uncompressed, bottom-up rows — the lossless classic). */
function encodeBmp(image: ImageDataLike): Uint8Array {
  const { width, height } = image;
  const src = image.data;
  const rowLen = width * 3;
  const padding = (4 - (rowLen % 4)) % 4;
  const pixelBytes = (rowLen + padding) * height;
  const fileLen = 54 + pixelBytes;
  const out = new Uint8Array(fileLen);
  const view = new DataView(out.buffer);
  out.set([0x42, 0x4d], 0);
  view.setUint32(2, fileLen, true);
  view.setUint32(10, 54, true); // pixel data offset
  view.setUint32(14, 40, true); // BITMAPINFOHEADER
  view.setInt32(18, width, true);
  view.setInt32(22, height, true);
  view.setUint16(26, 1, true); // planes
  view.setUint16(28, 24, true); // bpp
  view.setUint32(34, pixelBytes, true); // image size
  for (let y = 0; y < height; y += 1) {
    const srcY = height - 1 - y; // bottom-up
    for (let x = 0; x < width; x += 1) {
      const s = (srcY * width + x) * 4;
      const d = 54 + y * (rowLen + padding) + x * 3;
      out[d] = src[s + 2] ?? 0; // B
      out[d + 1] = src[s + 1] ?? 0; // G
      out[d + 2] = src[s] ?? 0; // R
    }
  }
  return out;
}

/** Decode any supported input to raw RGBA. */
export async function decodeAuto(bytes: Uint8Array): Promise<ImageDataLike> {
  const sniff = sniffImageFormat(bytes);
  if (sniff === 'bmp') return decodeBmp(bytes);
  const format = assertDecodable(bytes); // throws for empty/unsupported
  const codec = CODECS[format];
  try {
    return await codec.decode(bytes);
  } catch {
    throw imageError('invalid-image');
  }
}

export async function convertImage(bytes: Uint8Array, opts: ConvertOptions): Promise<Uint8Array> {
  if (bytes.byteLength === 0) throw imageError('empty-input');
  const quality = opts.quality ?? 82;
  if (!Number.isFinite(quality) || quality < 1 || quality > 100) {
    throw imageError('invalid-option', 'Quality must be between 1 and 100.');
  }
  const image = await decodeAuto(bytes);
  switch (opts.target) {
    case 'bmp':
      return encodeBmp(image);
    case 'png':
      return asBytes(await png.encode(image));
    case 'jpeg': {
      // JPEG has no alpha: composite onto white (standard converter behavior).
      const flattened = flattenOnWhite(image);
      return asBytes(await jpeg.encode(flattened, { quality }));
    }
    case 'webp':
      return asBytes(await webp.encode(image, { quality }));
    case 'avif':
      return asBytes(await avif.encode(image, { quality, speed: 6 }));
    default:
      throw imageError('invalid-option', 'Unknown target format.');
  }
}

/**
 * @jsquash encoders return ArrayBuffer; normalize every output to a plain
 * Uint8Array so sniffers/decoders downstream see real typed-array bytes.
 */
function asBytes(out: ArrayBuffer | Uint8Array): Uint8Array {
  if (out instanceof Uint8Array) return out;
  return new Uint8Array(out);
}

/** Composite RGBA onto white for alpha-less targets. */
export function flattenOnWhite(image: ImageDataLike): ImageDataLike {
  const src = image.data;
  if (src instanceof Uint8ClampedArray && image.width * image.height * 4 === src.length) {
    // check whether any pixel is actually transparent
    let hasAlpha = false;
    for (let i = 3; i < src.length; i += 4) {
      if ((src[i] ?? 255) < 255) {
        hasAlpha = true;
        break;
      }
    }
    if (!hasAlpha) return image;
  }
  const out = new Uint8ClampedArray(src.length);
  for (let i = 0; i < src.length; i += 4) {
    const a = (src[i + 3] ?? 255) / 255;
    const r = src[i] ?? 0;
    const g = src[i + 1] ?? 0;
    const bl = src[i + 2] ?? 0;
    out[i] = Math.min(255, Math.round(r * a + 255 * (1 - a)));
    out[i + 1] = Math.min(255, Math.round(g * a + 255 * (1 - a)));
    out[i + 2] = Math.min(255, Math.round(bl * a + 255 * (1 - a)));
    out[i + 3] = 255;
  }
  return { data: out, width: image.width, height: image.height };
}
