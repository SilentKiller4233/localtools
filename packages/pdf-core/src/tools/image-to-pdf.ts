import { PDFDocument } from 'pdf-lib';
import { assertSize } from '../load';
import { ToolError, toolError } from '../errors';

export type ImageFormat = 'png' | 'jpg';

export interface ImageToPdfOptions {
  /** Output page size; 'fit' sizes each page to its image. */
  pageSize?: 'fit' | 'a4' | 'letter';
  /** 0..1 margins when a fixed page size is used. */
  margin?: number;
  imageFormat?: ImageFormat;
}

/**
 * Convert PNG/JPG images to a PDF (Section 3.1). Magic-byte validation is
 * enforced here (Section 5.2 discipline client-side): extension is never
 * trusted — a mislabeled file is rejected with a specific error, not a
 * decoder crash.
 */
export async function imagesToPdf(
  files: readonly { bytes: Uint8Array; name: string }[],
  options: ImageToPdfOptions = {},
): Promise<Uint8Array> {
  if (files.length === 0) throw toolError('no-inputs');
  const pageSize = options.pageSize ?? 'fit';
  const margin = options.margin ?? 0;
  const out = await PDFDocument.create();
  for (const file of files) {
    assertSize(file.bytes);
    const kind = sniffImage(file.bytes);
    if (kind === 'unknown') {
      throw new ToolError('invalid-pdf', `"${file.name}" is not a PNG or JPG image.`);
    }
    let image;
    if (kind === 'png') {
      image = await out.embedPng(file.bytes);
    } else {
      image = await out.embedJpg(file.bytes);
    }
    if (pageSize === 'fit') {
      const page = out.addPage([image.width, image.height]);
      page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
    } else {
      const base: [number, number] = pageSize === 'a4' ? [595.28, 841.89] : [612, 792];
      const page = out.addPage(base);
      const scale = Math.min(
        (base[0] - margin * 2) / image.width,
        (base[1] - margin * 2) / image.height,
      );
      const w = image.width * scale;
      const h = image.height * scale;
      page.drawImage(image, {
        x: (base[0] - w) / 2,
        y: (base[1] - h) / 2,
        width: w,
        height: h,
      });
    }
  }
  return out.save();
}

/** Magic-byte sniffing per Section 5.2 — never trust the extension. */
export function sniffImage(bytes: Uint8Array): ImageFormat | 'unknown' {
  if (bytes.length >= 8) {
    // PNG: 89 50 4E 47 0D 0A 1A 0A
    const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
    if (isPng) return 'png';
    // JPEG: FF D8 FF
    const isJpg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    if (isJpg) return 'jpg';
  }
  return 'unknown';
}
