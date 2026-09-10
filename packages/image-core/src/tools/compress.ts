/**
 * Image compressor + resizer + batch runner (PROJECT_SPEC Section 3.3).
 * Compressor: per-format quality controls (the @jsquash encoders already
 * do the actual compression; this tool exposes it with quality presets
 * and honest size reporting). PNG "compression" is lossless-only (oxipng
 * via @jsquash/png ignores quality) — the tool says so instead of lying.
 */

import { avif, jpeg, png, webp } from '../codecs.js';
import { assertDecodable, sniffImageFormat } from '../sniff.js';
import { imageError, type ImageDataLike } from '../types.js';
import { computeTarget, resizePixels, type ResizeOptions } from './resize.js';
import { decodeAuto, flattenOnWhite } from './convert.js';

/** Normalize encoder outputs (ArrayBuffer) to Uint8Array. */
function asBytes(out: ArrayBuffer | Uint8Array): Uint8Array {
  if (out instanceof Uint8Array) return out;
  return new Uint8Array(out);
}

export type QualityPreset = 'small' | 'balanced' | 'high-quality';

const PRESET_QUALITY: Readonly<Record<QualityPreset, number>> = {
  small: 40,
  balanced: 70,
  'high-quality': 92,
};

export interface CompressOptions {
  preset: QualityPreset;
  /** Override the preset with an explicit 1-100 quality. */
  quality?: number;
  /** Output format; default = input format (png stays png). */
  target?: 'png' | 'jpeg' | 'webp' | 'avif';
}

export interface CompressResult {
  bytes: Uint8Array;
  originalSize: number;
  newSize: number;
}

export async function compressImage(
  bytes: Uint8Array,
  opts: CompressOptions,
): Promise<CompressResult> {
  if (bytes.byteLength === 0) throw imageError('empty-input');
  const sniff = sniffImageFormat(bytes);
  assertDecodable(bytes);
  const quality = opts.quality ?? PRESET_QUALITY[opts.preset];
  if (!Number.isFinite(quality) || quality < 1 || quality > 100) {
    throw imageError('invalid-option', 'Quality must be between 1 and 100.');
  }
  const image = await decodeAuto(bytes);
  const target = opts.target ?? (sniff === 'bmp' ? 'png' : sniff);
  let out: Uint8Array;
  switch (target) {
    case 'jpeg':
      out = asBytes(await jpeg.encode(flattenOnWhite(image), { quality }));
      break;
    case 'webp':
      out = asBytes(await webp.encode(image, { quality }));
      break;
    case 'avif':
      out = asBytes(await avif.encode(image, { quality, speed: 6 }));
      break;
    case 'png':
      // PNG is lossless — quality is ignored; re-encode drops metadata only.
      out = asBytes(await png.encode(image));
      break;
    default:
      throw imageError('invalid-option', 'Unknown target format.');
  }
  return { bytes: out, originalSize: bytes.byteLength, newSize: out.byteLength };
}

export interface ResizeFileOptions extends ResizeOptions {
  target?: 'png' | 'jpeg' | 'webp' | 'avif' | 'bmp';
  quality?: number;
}

export async function resizeImage(
  bytes: Uint8Array,
  opts: ResizeFileOptions,
): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  if (bytes.byteLength === 0) throw imageError('empty-input');
  assertDecodable(bytes);
  const image = await decodeAuto(bytes);
  const dims = computeTarget(image.width, image.height, opts);
  const resized = resizePixels(image, dims.width, dims.height);
  const quality = opts.quality ?? 82;
  const target = opts.target ?? 'png';
  let out: Uint8Array;
  switch (target) {
    case 'png':
      out = asBytes(await png.encode(resized));
      break;
    case 'jpeg':
      out = asBytes(await jpeg.encode(flattenOnWhite(resized), { quality }));
      break;
    case 'webp':
      out = asBytes(await webp.encode(resized, { quality }));
      break;
    case 'avif':
      out = asBytes(await avif.encode(resized, { quality, speed: 6 }));
      break;
    case 'bmp':
      out = encodeBmpFromPixels(resized);
      break;
    default:
      throw imageError('invalid-option', 'Unknown target format.');
  }
  return { bytes: out, ...dims };
}

function encodeBmpFromPixels(image: ImageDataLike): Uint8Array {
  const { width, height } = image;
  const src = image.data;
  const rowLen = width * 3;
  const padding = (4 - (rowLen % 4)) % 4;
  const pixelBytes = (rowLen + padding) * height;
  const out = new Uint8Array(54 + pixelBytes);
  const view = new DataView(out.buffer);
  out.set([0x42, 0x4d], 0);
  view.setUint32(2, out.byteLength, true);
  view.setUint32(10, 54, true);
  view.setUint32(14, 40, true);
  view.setInt32(18, width, true);
  view.setInt32(22, height, true);
  view.setUint16(26, 1, true);
  view.setUint16(28, 24, true);
  view.setUint32(34, pixelBytes, true);
  for (let y = 0; y < height; y += 1) {
    const srcY = height - 1 - y;
    for (let x = 0; x < width; x += 1) {
      const s = (srcY * width + x) * 4;
      const d = 54 + y * (rowLen + padding) + x * 3;
      out[d] = src[s + 2] ?? 0;
      out[d + 1] = src[s + 1] ?? 0;
      out[d + 2] = src[s] ?? 0;
    }
  }
  return out;
}

/** Batch pipeline: apply one operation to many files (capped count). */
export const BATCH_FILE_LIMIT = 50;

export interface BatchJob {
  op: 'convert' | 'compress' | 'resize';
  files: Uint8Array[];
  options: Record<string, unknown>;
  /** Phase 11 real-progress seam: (filesDone, totalFiles) per file. */
  onProgress?: (done: number, total: number) => void;
}

export interface BatchOutput {
  name: string;
  ext: string;
  bytes: Uint8Array;
}

export async function runBatch(job: BatchJob): Promise<BatchOutput[]> {
  if (job.files.length === 0) throw imageError('no-inputs');
  if (job.files.length > BATCH_FILE_LIMIT) {
    throw imageError(
      'invalid-option',
      `Batch is limited to ${String(BATCH_FILE_LIMIT)} files at a time.`,
    );
  }
  const outs: BatchOutput[] = [];
  for (const [i, file] of job.files.entries()) {
    if (job.op === 'convert') {
      const bytes = await convertForBatch(file, job.options);
      const target = job.options['target'];
      outs.push({
        name: `image-${String(i + 1)}`,
        ext: typeof target === 'string' ? target : 'png',
        bytes,
      });
    } else if (job.op === 'compress') {
      const result = await compressImage(file, job.options as unknown as CompressOptions);
      const sniff = sniffImageFormat(file);
      const ext: string = sniff === 'bmp' ? 'png' : sniff;
      outs.push({ name: `image-${String(i + 1)}`, ext, bytes: result.bytes });
    } else {
      const result = await resizeImage(file, job.options as unknown as ResizeFileOptions);
      const targetOpt = (job.options as { target?: string }).target;
      const ext: string = typeof targetOpt === 'string' ? targetOpt : 'png';
      outs.push({ name: `image-${String(i + 1)}`, ext, bytes: result.bytes });
    }
    job.onProgress?.(outs.length, job.files.length);
  }
  return outs;
}

async function convertForBatch(
  bytes: Uint8Array,
  options: Record<string, unknown>,
): Promise<Uint8Array> {
  const { convertImage } = await import('./convert.js');
  return convertImage(bytes, options as unknown as Parameters<typeof convertImage>[1]);
}
