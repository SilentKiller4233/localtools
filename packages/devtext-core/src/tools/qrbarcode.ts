/**
 * QR + barcode tools (PROJECT_SPEC 3.4): qrcode (generate), jsQR (scan),
 * bwip-js (1D barcodes as SVG — the one interface shared by the Node and
 * browser entries). PNG output via a tiny in-house 1-bit PNG encoder over
 * fflate's deflate (no canvas anywhere), scan via image-core's decoders.
 */

import QRCode from 'qrcode';
import jsQR from 'jsqr';
import { zlibSync } from 'fflate';
import { devError, requireBytes, requireText, assertSize, MAX_DEVTEXT_BYTES } from '../types';

/* ---------------- PNG encoding (1-bit grayscale, no canvas) ---------------- */

function crc32(buf: Uint8Array): number {
  let c: number;
  const table: number[] = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const byte of buf) {
    const slot = table[(crc ^ byte) & 0xff];
    if (slot === undefined) continue;
    crc = slot ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** Grayscale 1-bit PNG from a packed bit-row buffer (big-endian bits). */
function encodePng1bit(packed: Uint8Array, width: number, height: number): Uint8Array {
  const rowBytes = Math.ceil(width / 8);
  const filtered = new Uint8Array((rowBytes + 1) * height);
  for (let y = 0; y < height; y++) {
    filtered[y * (rowBytes + 1)] = 0; // filter: none
    filtered.set(packed.subarray(y * rowBytes, (y + 1) * rowBytes), y * (rowBytes + 1) + 1);
  }
  // PNG IDAT requires zlib format (RFC 1950) — fflate's deflateSync is RAW
  // deflate (RFC 1951); zlibSync wraps it correctly.
  const compressed = zlibSync(filtered);
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, width);
  dv.setUint32(4, height);
  ihdr[8] = 1; // bit depth 1
  ihdr[9] = 0; // color type: grayscale
  const sig = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdrChunk = pngChunk('IHDR', ihdr);
  const idatChunk = pngChunk('IDAT', compressed);
  const iendChunk = pngChunk('IEND', new Uint8Array(0));
  const png = new Uint8Array(sig.length + ihdrChunk.length + idatChunk.length + iendChunk.length);
  let off = 0;
  png.set(sig, off);
  off += sig.length;
  png.set(ihdrChunk, off);
  off += ihdrChunk.length;
  png.set(idatChunk, off);
  off += idatChunk.length;
  png.set(iendChunk, off);
  return png;
}

/* ---------------- QR generation ---------------- */

export interface QrGenerateResult {
  svg: string;
  png: Uint8Array;
}

export type QrEcc = 'L' | 'M' | 'Q' | 'H';

export async function generateQr(
  text: string,
  options: { size?: number; margin?: number; ecc?: QrEcc } = {},
): Promise<QrGenerateResult> {
  requireText(text, 'QR content');
  const size = options.size ?? 256;
  if (!Number.isFinite(size) || size < 64 || size > 2048) {
    throw devError('invalid-option', 'Size must be between 64 and 2048.');
  }
  const ecc: QrEcc = options.ecc ?? 'M';
  const margin = options.margin ?? 2;
  const svg = await QRCode.toString(text, {
    type: 'svg',
    margin,
    errorCorrectionLevel: ecc,
    width: size,
  });
  const q = QRCode.create(text, { errorCorrectionLevel: ecc });
  const modules = q.modules as unknown as { size: number; get(x: number, y: number): boolean };
  const n = modules.size;
  const dim = n + margin * 2;
  const rowBytes = Math.ceil(dim / 8);
  const packed = new Uint8Array(rowBytes * dim);
  for (let y = 0; y < dim; y++) {
    for (let x = 0; x < dim; x++) {
      const inside = x >= margin && y >= margin && x < margin + n && y < margin + n;
      const on = inside ? modules.get(x - margin, y - margin) : false;
      if (on) {
        const bitIndex = y * rowBytes * 8 + x;
        const byte = packed[Math.floor(bitIndex / 8)];
        if (byte !== undefined)
          packed[Math.floor(bitIndex / 8)] = byte | (1 << (7 - (bitIndex % 8)));
      }
    }
  }
  const png = encodePng1bit(packed, dim, dim);
  return { svg, png };
}

/* ---------------- QR scan ---------------- */

export interface QrScanResult {
  text: string;
}

/** Scan an uploaded image for a QR code (decode via image-core, then jsQR). */
export async function scanQr(
  bytes: Uint8Array,
  maxBytes: number = MAX_DEVTEXT_BYTES,
): Promise<QrScanResult> {
  requireBytes(bytes, 'image');
  assertSize(bytes, maxBytes);
  const { decodeAuto } = await import('@localtools/image-core');
  let img: { data: Uint8Array | Uint8ClampedArray; width: number; height: number };
  try {
    img = await decodeAuto(bytes);
  } catch {
    throw devError('invalid-input', 'This file could not be read as an image.');
  }
  const rgba = new Uint8ClampedArray(img.data as Uint8Array);
  const result = jsQR(rgba, img.width, img.height);
  if (result === null || result.data.length === 0) {
    throw devError(
      'invalid-input',
      'No QR code was found in this image. Make sure it is sharp, well-lit, and fills a good part of the frame.',
    );
  }
  return { text: result.data };
}

/* ---------------- Barcode generation ---------------- */

export type BarcodeFormat =
  'code128' | 'code39' | 'ean13' | 'ean8' | 'upca' | 'itf14' | 'codabar' | 'code93' | 'msi';

const BARCODE_DESC: Readonly<Record<BarcodeFormat, string>> = {
  code128: 'Code 128 (alphanumeric, most common)',
  code39: 'Code 39 (uppercase + digits)',
  ean13: 'EAN-13 (retail, 12 digits + check)',
  ean8: 'EAN-8 (retail, 7 digits + check)',
  upca: 'UPC-A (retail, 11 digits + check)',
  itf14: 'ITF-14 (shipping cartons)',
  codabar: 'Codabar (libraries, blood banks)',
  code93: 'Code 93 (compact alphanumeric)',
  msi: 'MSI (inventory)',
};

export const BARCODE_FORMATS: Readonly<Record<BarcodeFormat, string>> = BARCODE_DESC;

export interface BarcodeResult {
  svg: string;
  format: BarcodeFormat;
}

export interface BarcodeOptions {
  showText?: boolean;
  height?: number;
  scale?: number;
}

type BwipEntry = {
  toSVG(options: Record<string, unknown>): string;
};

function bwipImport(): Promise<BwipEntry> {
  // Both entries expose the same synchronous toSVG; Node uses it in tests,
  // the browser worker uses the browser build (smaller, no node deps).
  const isNode =
    typeof process !== 'undefined' &&
    (process as { versions?: { node?: string } }).versions?.node !== undefined;
  return isNode ? import('bwip-js/node') : import('bwip-js/browser');
}

export async function generateBarcode(
  text: string,
  format: BarcodeFormat = 'code128',
  options: BarcodeOptions = {},
): Promise<BarcodeResult> {
  requireText(text, 'barcode content');
  const mod = await bwipImport();
  try {
    const svg = mod.toSVG({
      bcid: format,
      text,
      height: options.height ?? 12,
      includetext: options.showText !== false,
      textxalign: 'center',
      scale: options.scale ?? 2,
    });
    return { svg, format };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw devError(
      'invalid-input',
      `Could not generate ${format.toUpperCase()} from this content: ${message.split('\n')[0] ?? message}`,
    );
  }
}
