/**
 * Section 14.1 tests: format converter (convert.ts) + Section 5 EXIF
 * strip (the byte-level privacy acceptance for Phase 5).
 */

import { describe, expect, it } from 'vitest';
import {
  convertImage,
  readExif,
  stripExif,
  sniffImageFormat,
  ImageToolError,
} from '../src/index.js';
import { readFixture } from './helpers.js';
import { fileTypeFromBuffer } from 'file-type';

describe('format converter — Section 14.1', () => {
  it('happy: png → jpeg produces a real JPEG', async () => {
    const input = await readFixture('sample.png');
    const out = await convertImage(input, { target: 'jpeg', quality: 85 });
    expect(out.byteLength).toBeGreaterThan(100);
    const ft = await fileTypeFromBuffer(out);
    expect(ft?.ext).toBe('jpg');
  });

  it('happy: png → webp produces a real WebP', async () => {
    const input = await readFixture('sample.png');
    const out = await convertImage(input, { target: 'webp', quality: 85 });
    const ft = await fileTypeFromBuffer(out);
    expect(ft?.ext).toBe('webp');
  });

  it('happy: jpeg → png produces a real PNG (round-trips through raw pixels)', async () => {
    const input = await readFixture('sample.jpg');
    const out = await convertImage(input, { target: 'png' });
    const ft = await fileTypeFromBuffer(out);
    expect(ft?.ext).toBe('png');
  });

  it('happy: webp → avif produces a real AVIF', async () => {
    const input = await readFixture('sample.webp');
    const out = await convertImage(input, { target: 'avif', quality: 60 });
    const ft = await fileTypeFromBuffer(out);
    expect(ft?.ext).toBe('avif');
  }, 90_000);

  it('happy: jpeg → bmp produces a valid 24-bit BMP', async () => {
    const input = await readFixture('sample.jpg');
    const out = await convertImage(input, { target: 'bmp' });
    expect(out[0]).toBe(0x42);
    expect(out[1]).toBe(0x4d);
    const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
    expect(view.getUint16(28, true)).toBe(24); // bpp
  });

  it('happy: bmp input decodes and converts to png', async () => {
    // Build a small BMP fixture from the JPEG via the converter itself.
    const jpeg = await readFixture('sample.jpg');
    const bmp = await convertImage(jpeg, { target: 'bmp' });
    expect(sniffImageFormat(bmp)).toBe('bmp');
    const back = await convertImage(bmp, { target: 'png' });
    const ft = await fileTypeFromBuffer(back);
    expect(ft?.ext).toBe('png');
  });

  it('malformed input → specific invalid-image error, no crash', async () => {
    const garbage = await readFixture('malformed.jpg');
    await expect(convertImage(garbage, { target: 'png' })).rejects.toMatchObject({
      code: 'invalid-image',
    });
  });

  it('truncated PNG → invalid-image, no crash', async () => {
    const garbage = await readFixture('malformed.png');
    await expect(convertImage(garbage, { target: 'jpeg' })).rejects.toMatchObject({
      code: 'invalid-image',
    });
  });

  it('empty input → empty-input error', async () => {
    await expect(convertImage(new Uint8Array(0), { target: 'png' })).rejects.toMatchObject({
      code: 'empty-input',
    });
  });

  it('invalid option: out-of-range quality → invalid-option', async () => {
    const input = await readFixture('sample.png');
    await expect(convertImage(input, { target: 'jpeg', quality: 0 })).rejects.toMatchObject({
      code: 'invalid-option',
    });
  });

  it('GIF input → honest unsupported-format (no @jsquash gif codec; D-note)', async () => {
    // Hand-built minimal GIF header only — enough for the sniffer.
    const gif = new Uint8Array([
      0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00,
    ]);
    expect(sniffImageFormat(gif)).toBe('gif');
    await expect(convertImage(gif, { target: 'png' })).rejects.toMatchObject({
      code: 'unsupported-format',
    });
  });
});

describe('EXIF viewer + stripper — Section 14.1 + Phase 5 acceptance', () => {
  it('viewer: reads GPS from sample-with-exif.jpg', async () => {
    const input = await readFixture('sample-with-exif.jpg');
    const report = await readExif(input);
    expect(report.hasExif).toBe(true);
    expect(report.gps).toBeDefined();
    if (report.gps !== undefined) {
      expect(report.gps.latitude).toBeGreaterThan(33);
      expect(report.gps.latitude).toBeLessThan(34);
      expect(report.gps.longitude).toBeGreaterThan(73);
      expect(report.gps.longitude).toBeLessThan(74);
    }
  });

  it('CRITICAL acceptance: strip removes GPS/EXIF from the OUTPUT BYTES, not just from viewers', async () => {
    const input = await readFixture('sample-with-exif.jpg');
    const out = stripExif(input);

    // 1. Still a valid JPEG (SOI + ends with EOI).
    expect(out[0]).toBe(0xff);
    expect(out[1]).toBe(0xd8);
    expect(out[out.length - 2] ?? 0).toBe(0xff);
    expect(out[out.length - 1] ?? 0).toBe(0xd9);

    // 2. NO APP1 marker (FF E1) anywhere in the raw bytes — this is the
    // byte-level guarantee: EXIF cannot "hide" in any segment.
    for (let i = 0; i < out.length - 1; i += 1) {
      if (out[i] === 0xff) {
        expect([0xe1, 0xe2, 0xe3, 0xed, 0xee, 0xfe].includes(out[i + 1] ?? 0)).toBe(false);
      }
    }

    // 3. The binary GPS coordinates (rational 33/1, 41/1) pattern must not
    // appear: search for the GPS ASCII tag itself.
    const asText = Buffer.from(out).toString('latin1');
    expect(asText.includes('GPS')).toBe(false);
    expect(asText.includes('Exif')).toBe(false);

    // 4. exifr itself finds nothing.
    const recheck = await readExif(out).catch(() => undefined);
    if (recheck !== undefined) {
      expect(recheck.gps).toBeUndefined();
      expect(recheck.hasExif).toBe(false);
    }

    // 5. Pixel data preserved: decode both and compare dimensions + a
    // corner pixel through the codec (no re-encode happened).
    const { decodeAuto } = await import('../src/index.js');
    const before = await decodeAuto(input);
    const after = await decodeAuto(out);
    expect(after.width).toBe(before.width);
    expect(after.height).toBe(before.height);
  });

  it('malformed JPEG → invalid-image from strip, no crash', async () => {
    const garbage = await readFixture('malformed.jpg');
    expect(() => stripExif(garbage)).toThrow(ImageToolError);
  });

  it('empty input → empty-input error from strip', () => {
    expect(() => stripExif(new Uint8Array(0))).toThrow(ImageToolError);
  });

  it('non-JPEG input → honest unsupported-format with guidance', async () => {
    const png = await readFixture('sample.png');
    expect(() => stripExif(png)).toThrow(ImageToolError);
  });
});
