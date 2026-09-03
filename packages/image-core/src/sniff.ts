/**
 * Magic-byte sniffing for supported inputs (never extension trust).
 * Only the formats image-core actually decodes are recognized; the
 * client's DropZone extension filter is UX only.
 */

import { imageError, type SniffedFormat } from './types.js';

/** Decode targets we can actually process (from @jsquash codecs). */
export type DecodableFormat = 'png' | 'jpeg' | 'webp' | 'avif';

export function sniffImageFormat(bytes: Uint8Array): SniffedFormat {
  const b = bytes;
  const eq = (offset: number, sig: readonly number[]): boolean =>
    sig.every((v, i) => b[offset + i] === v);

  if (b.byteLength < 12) return 'unknown';
  if (eq(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (eq(0, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (eq(0, [0x52, 0x49, 0x46, 0x46]) && eq(8, [0x57, 0x45, 0x42, 0x50])) return 'webp';
  if (eq(4, [0x66, 0x74, 0x79, 0x70])) {
    const brand = new TextDecoder('latin1').decode(b.slice(8, 12));
    if (brand.startsWith('avif') || brand.startsWith('avis')) return 'avif';
    if (brand.startsWith('heic') || brand.startsWith('heix') || brand.startsWith('mif1'))
      return 'heic';
    return 'unknown';
  }
  if (eq(0, [0x47, 0x49, 0x46, 0x38])) return 'gif';
  if (eq(0, [0x42, 0x4d])) return 'bmp';
  if (eq(0, [0x49, 0x49, 0x2a, 0x00]) || eq(0, [0x4d, 0x4d, 0x00, 0x2a])) return 'tiff';
  return 'unknown';
}

/** Which codec handles a sniffed input, with a redirect hint for HEIC. */
export function decodableFrom(
  sniff: SniffedFormat,
): { format: DecodableFormat } | { redirect: 'heic' } | null {
  switch (sniff) {
    case 'png':
    case 'jpeg':
    case 'webp':
    case 'avif':
      return { format: sniff };
    case 'heic':
      return { redirect: 'heic' };
    default:
      return null;
  }
}

/** Sniff + assert decodable; throws the shared taxonomy. Known-but-
 * unsupported formats (gif/tiff) get a specific unsupported-format error;
 * unrecognized bytes get invalid-image. */
export function assertDecodable(bytes: Uint8Array): DecodableFormat {
  if (bytes.byteLength === 0) throw imageError('empty-input');
  const sniff = sniffImageFormat(bytes);
  if (sniff === 'gif') {
    throw imageError(
      'unsupported-format',
      'GIF files aren’t supported here yet — animated-image conversion is planned for a later release.',
    );
  }
  if (sniff === 'tiff') {
    throw imageError(
      'unsupported-format',
      'TIFF files aren’t supported here yet — convert to PNG or JPEG first.',
    );
  }
  const route = decodableFrom(sniff);
  if (route === null) {
    throw imageError('invalid-image');
  }
  if ('redirect' in route) {
    throw imageError(
      'unsupported-format',
      'This is a HEIC file — use the HEIC converter tool instead.',
    );
  }
  return route.format;
}

/** Encode-side check: formats the converter can OUTPUT today. */
export const ENCODABLE_FORMATS: readonly DecodableFormat[] = ['png', 'jpeg', 'webp', 'avif'];
