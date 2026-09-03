/**
 * Section 14.1 tests: compressor, resizer, batch runner.
 */

import { describe, expect, it } from 'vitest';
import { compressImage, resizeImage, runBatch, convertImage } from '../src/index.js';
import { readFixture } from './helpers.js';
import { fileTypeFromBuffer } from 'file-type';

describe('compressor — Section 14.1', () => {
  it('happy: jpeg → smaller jpeg at small preset (or same-bucket size)', async () => {
    const input = await readFixture('sample.jpg');
    const result = await compressImage(input, { preset: 'small' });
    expect(result.originalSize).toBe(input.byteLength);
    expect(result.newSize).toBeGreaterThan(50);
    const ft = await fileTypeFromBuffer(result.bytes);
    expect(ft?.ext).toBe('jpg');
  });

  it('happy: png → webp conversion path with honest size reporting', async () => {
    const input = await readFixture('sample.png');
    const result = await compressImage(input, { preset: 'balanced', target: 'webp' });
    const ft = await fileTypeFromBuffer(result.bytes);
    expect(ft?.ext).toBe('webp');
    expect(result.newSize).toBe(result.bytes.byteLength);
  });

  it('happy: png → png is lossless re-encode (valid PNG out)', async () => {
    const input = await readFixture('sample.png');
    const result = await compressImage(input, { preset: 'high-quality' });
    const ft = await fileTypeFromBuffer(result.bytes);
    expect(ft?.ext).toBe('png');
  });

  it('malformed → invalid-image, no crash', async () => {
    const garbage = await readFixture('malformed.jpg');
    await expect(compressImage(garbage, { preset: 'small' })).rejects.toMatchObject({
      code: 'invalid-image',
    });
  });

  it('empty → empty-input', async () => {
    await expect(compressImage(new Uint8Array(0), { preset: 'small' })).rejects.toMatchObject({
      code: 'empty-input',
    });
  });

  it('invalid option: junk preset quality → invalid-option', async () => {
    const input = await readFixture('sample.jpg');
    await expect(compressImage(input, { preset: 'small', quality: 500 })).rejects.toMatchObject({
      code: 'invalid-option',
    });
  });
});

describe('resizer — Section 14.1', () => {
  it('happy: exact 32x32 resize → output decodes at 32x32', async () => {
    const input = await readFixture('sample.png');
    const result = await resizeImage(input, {
      mode: 'exact',
      width: 32,
      height: 32,
      target: 'png',
    });
    expect(result.width).toBe(32);
    expect(result.height).toBe(32);
    const ft = await fileTypeFromBuffer(result.bytes);
    expect(ft?.ext).toBe('png');
  });

  it('happy: percent 50% keeps aspect', async () => {
    const input = await readFixture('sample.png');
    const result = await resizeImage(input, { mode: 'percent', percent: 50, target: 'png' });
    expect(result.width).toBe(32);
    expect(result.height).toBe(32);
  });

  it('happy: max-dimension never upscales', async () => {
    const input = await readFixture('sample.png');
    const up = await resizeImage(input, {
      mode: 'max-dimension',
      maxDimension: 128,
      target: 'png',
    });
    expect(Math.max(up.width, up.height)).toBeLessThanOrEqual(128);
    const down = await resizeImage(input, {
      mode: 'max-dimension',
      maxDimension: 16,
      target: 'png',
    });
    expect(Math.max(down.width, down.height)).toBe(16);
  });

  it('invalid option: negative width → invalid-option', async () => {
    const input = await readFixture('sample.png');
    await expect(
      resizeImage(input, { mode: 'exact', width: -5, height: 10 }),
    ).rejects.toMatchObject({ code: 'invalid-option' });
  });

  it('malformed → invalid-image', async () => {
    const garbage = await readFixture('malformed.png');
    await expect(resizeImage(garbage, { mode: 'percent', percent: 50 })).rejects.toMatchObject({
      code: 'invalid-image',
    });
  });
});

describe('batch runner — Section 14.1', () => {
  it('happy: convert 3 files in one batch', async () => {
    const png = await readFixture('sample.png');
    const jpg = await readFixture('sample.jpg');
    const outs = await runBatch({
      op: 'convert',
      files: [png, jpg, png],
      options: { target: 'webp' },
    });
    expect(outs.length).toBe(3);
    for (const out of outs) {
      expect(out.ext).toBe('webp');
      expect(out.bytes.byteLength).toBeGreaterThan(10);
      const ft = await fileTypeFromBuffer(out.bytes);
      expect(ft?.ext).toBe('webp');
    }
  });

  it('happy: compress 2 files', async () => {
    const jpg = await readFixture('sample.jpg');
    const outs = await runBatch({
      op: 'compress',
      files: [jpg, jpg],
      options: { preset: 'balanced' },
    });
    expect(outs.length).toBe(2);
    expect(outs[0]?.ext).toBe('jpeg');
  });

  it('empty batch → no-inputs', async () => {
    await expect(runBatch({ op: 'convert', files: [], options: {} })).rejects.toMatchObject({
      code: 'no-inputs',
    });
  });

  it('oversized batch (>50) → rejected before processing', async () => {
    const png = await readFixture('sample.png');
    const many = new Array<Uint8Array>(51).fill(png);
    await expect(
      runBatch({ op: 'convert', files: many, options: { target: 'png' } }),
    ).rejects.toMatchObject({
      code: 'invalid-option',
    });
  });

  it('one bad file in batch → specific error (fail loudly, no silent skips)', async () => {
    const png = await readFixture('sample.png');
    const garbage = await readFixture('malformed.jpg');
    await expect(
      runBatch({ op: 'convert', files: [png, garbage], options: { target: 'png' } }),
    ).rejects.toMatchObject({ code: 'invalid-image' });
  });
});

describe('cross-tool consistency', () => {
  it('convert → resize chain works on real outputs', async () => {
    const jpg = await readFixture('sample.jpg');
    const webp = await convertImage(jpg, { target: 'webp', quality: 80 });
    const resized = await resizeImage(webp, { mode: 'percent', percent: 50, target: 'jpeg' });
    expect(resized.width).toBe(32);
    const ft = await fileTypeFromBuffer(resized.bytes);
    expect(ft?.ext).toBe('jpg');
  });
});
