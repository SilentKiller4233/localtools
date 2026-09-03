/**
 * EXIF viewer/stripper (PROJECT_SPEC Section 3.3) — the privacy tool.
 *
 * Strip is byte-genuine: JPEG APP1/APP2 (EXIF/ICC) segments are REMOVED
 * from the file (markers dropped, not zeroed), and XMP is dropped too.
 * The Section 14 acceptance asserts the output contains no EXIF APP1
 * marker and no GPS payload anywhere in the raw bytes.
 *
 * exifr (MIT) reads metadata for the viewer; the strip path is a small
 * hand-rolled JPEG segment walker (no re-encode = lossless, fast, and
 * the only way to guarantee nothing survives).
 */

import exifr from 'exifr';
import { imageError } from '../types.js';
import { sniffImageFormat } from '../sniff.js';

export interface ExifReport {
  format: string;
  entries: { key: string; value: string }[];
  /** GPS coordinates in decimal degrees when present. */
  gps?: { latitude: number; longitude: number; altitude?: number };
  hasExif: boolean;
}

/** Read metadata for display (viewer mode). */
export async function readExif(bytes: Uint8Array): Promise<ExifReport> {
  if (bytes.byteLength === 0) throw imageError('empty-input');
  const sniff = sniffImageFormat(bytes);
  if (sniff !== 'jpeg') {
    throw imageError(
      'unsupported-format',
      'EXIF metadata lives in JPEG and TIFF files; other formats carry none.',
    );
  }
  let meta: Record<string, unknown> = {};
  try {
    const parsed = (await exifr.parse(bytes, { tiff: true, exif: true, gps: true, xmp: true })) as
      Record<string, unknown> | undefined;
    meta = parsed ?? {};
  } catch {
    throw imageError('invalid-image');
  }
  const entries: { key: string; value: string }[] = [];
  for (const [key, value] of Object.entries(meta)) {
    if (value === undefined || value === null) continue;
    let rendered: string;
    if (value instanceof Date) {
      rendered = value.toISOString().replace('T', ' ').slice(0, 19);
    } else if (typeof value === 'object') {
      try {
        rendered = JSON.stringify(value);
      } catch {
        rendered = '[unreadable value]';
      }
    } else if (typeof value === 'string') {
      rendered = value;
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      rendered = JSON.stringify(value);
    } else {
      rendered = '[unreadable value]';
    }
    entries.push({ key, value: rendered.slice(0, 300) });
  }
  const gps = (await exifr.gps(bytes).catch(() => undefined)) as
    { latitude: number; longitude: number } | undefined;
  return {
    format: sniff,
    entries: entries.slice(0, 80),
    ...(gps !== undefined ? { gps } : {}),
    hasExif: entries.length > 0,
  };
}

/**
 * Strip ALL metadata segments from a JPEG: APP0 (JFIF, minimal and
 * harmless but often paired), APP1 (EXIF + XMP), APP2 (ICC), APP12+
 * (vendor junk). Keeps SOI, the image data, and the structure intact —
 * no re-encode, pixel-identical output.
 */
export function stripExif(bytes: Uint8Array): Uint8Array {
  if (bytes.byteLength === 0) throw imageError('empty-input');
  const sniff = sniffImageFormat(bytes);
  if (sniff !== 'jpeg') {
    throw imageError(
      'unsupported-format',
      'This tool strips metadata from JPEG files. Convert to PNG/WebP instead — those formats carry no EXIF.',
    );
  }
  const b0 = bytes[0];
  const b1 = bytes[1];
  if (b0 !== 0xff || b1 !== 0xd8) throw imageError('invalid-image');
  const out: number[] = [0xff, 0xd8]; // SOI
  const n = bytes.byteLength;
  let i = 2;
  while (i + 4 <= n) {
    const tag = bytes[i];
    if (tag !== 0xff) {
      for (let k = i; k < n; k += 1) {
        const v = bytes[k];
        out.push(v ?? 0);
      }
      i = n;
      break;
    }
    const marker = bytes[i + 1] ?? 0;
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      out.push(0xff, marker);
      i += 2;
      continue;
    }
    const lenHi = bytes[i + 2] ?? 0;
    const lenLo = bytes[i + 3] ?? 0;
    const segLen = (lenHi << 8) | lenLo;
    const segEnd = i + 2 + segLen;
    if (segEnd > n) break;
    const isApp = marker >= 0xe0 && marker <= 0xef;
    const isCom = marker === 0xfe;
    if (isApp || isCom) {
      i = segEnd;
      continue;
    }
    if (marker === 0xda) {
      for (let k = i; k < n; k += 1) {
        const v = bytes[k];
        out.push(v ?? 0);
      }
      i = n;
      break;
    }
    for (let k = i; k < segEnd; k += 1) {
      const v = bytes[k];
      out.push(v ?? 0);
    }
    i = segEnd;
  }
  if (out.length < 4) throw imageError('invalid-image');
  return new Uint8Array(out);
}
