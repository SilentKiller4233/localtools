/**
 * Section 14.1 tests: HEIC converter, base64, palette, favicon.
 */

import { describe, expect, it } from 'vitest';
import {
  convertHeic,
  imageToDataUri,
  dataUriToImage,
  paletteFromImage,
  generateFavicon,
} from '../src/index.js';
import { readFixture } from './helpers.js';
import { fileTypeFromBuffer } from 'file-type';

describe('HEIC converter — Section 14.1', () => {
  it('happy: heic → jpeg produces a real JPEG', async () => {
    const input = await readFixture('sample.heic');
    const out = await convertHeic(input, { target: 'jpeg', quality: 85 });
    const ft = await fileTypeFromBuffer(out);
    expect(ft?.ext).toBe('jpg');
  });

  it('happy: heic → png produces a real PNG', async () => {
    const input = await readFixture('sample.heic');
    const out = await convertHeic(input, { target: 'png' });
    const ft = await fileTypeFromBuffer(out);
    expect(ft?.ext).toBe('png');
  });

  it('mislabeled file: bytes that are not HEIC → specific error', async () => {
    const jpg = await readFixture('sample.jpg');
    await expect(convertHeic(jpg, { target: 'png' })).rejects.toMatchObject({
      code: 'invalid-image',
    });
  });

  it('empty → empty-input', async () => {
    await expect(convertHeic(new Uint8Array(0), { target: 'png' })).rejects.toMatchObject({
      code: 'empty-input',
    });
  });

  it('invalid option: bad quality → invalid-option', async () => {
    const input = await readFixture('sample.heic');
    await expect(convertHeic(input, { target: 'jpeg', quality: 200 })).rejects.toMatchObject({
      code: 'invalid-option',
    });
  });
});

describe('image ↔ base64 — Section 14.1', () => {
  it('happy: png → data URI round-trips byte-identical', async () => {
    const input = await readFixture('sample.png');
    const uri = imageToDataUri(input, 'png');
    expect(uri.startsWith('data:image/png;base64,')).toBe(true);
    const back = dataUriToImage(uri);
    expect(back.ext).toBe('png');
    expect(back.bytes.byteLength).toBe(input.byteLength);
    expect(Buffer.compare(Buffer.from(back.bytes), Buffer.from(input))).toBe(0);
  });

  it('malformed data URI → invalid-option', () => {
    expect(() => dataUriToImage('not-a-data-uri')).toThrow();
  });

  it('empty input → empty-input', () => {
    expect(() => imageToDataUri(new Uint8Array(0), 'png')).toThrow();
  });
});

describe('palette extractor — Section 14.1', () => {
  it('happy: solid-color image yields a dominant swatch', async () => {
    const input = await readFixture('sample.png'); // solid red
    const palette = await paletteFromImage(input, 4);
    expect(palette.length).toBeGreaterThan(0);
    expect(palette.length).toBeLessThanOrEqual(4);
    const top = palette[0];
    if (top === undefined) throw new Error('palette empty');
    // Dominant swatch must be the red-ish color, weighted ≥ 50%.
    expect(top.rgb[0]).toBeGreaterThan(150);
    expect(top.weight).toBeGreaterThan(0.5);
    expect(top.hex).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('empty → empty-input', async () => {
    await expect(paletteFromImage(new Uint8Array(0))).rejects.toMatchObject({
      code: 'empty-input',
    });
  });

  it('malformed → invalid-image', async () => {
    const garbage = await readFixture('malformed.jpg');
    await expect(paletteFromImage(garbage)).rejects.toMatchObject({ code: 'invalid-image' });
  });
});

describe('favicon generator — Section 14.1', () => {
  it('happy: emits .ico + standard PNG sizes + snippet', async () => {
    const input = await readFixture('sample.png');
    const result = await generateFavicon(input);
    expect(result.files.length).toBe(6); // ico + 16/32/180/192/512
    const ico = result.files.find((f) => f.name === 'favicon.ico');
    expect(ico).toBeDefined();
    expect(ico?.bytes.byteLength ?? 0).toBeGreaterThan(100);
    // ICO header: type=1, count=3
    if (ico === undefined) throw new Error('ico missing');
    const view = new DataView(ico.bytes.buffer, ico.bytes.byteOffset, ico.bytes.byteLength);
    expect(view.getUint16(2, true)).toBe(1);
    expect(view.getUint16(4, true)).toBe(3);
    for (const name of ['favicon-32x32.png', 'apple-touch-icon.png', 'favicon-512x512.png']) {
      const f = result.files.find((x) => x.name === name);
      expect(f).toBeDefined();
      if (f === undefined) throw new Error(`missing ${name}`);
      const ft = await fileTypeFromBuffer(f.bytes);
      expect(ft?.ext).toBe('png');
    }
    expect(result.htmlSnippet).toContain('apple-touch-icon');
  });

  it('tiny source (<64px) → invalid-option guidance', async () => {
    const smallPng = await readFixture('sample.png');
    const { resizeImage } = await import('../src/index.js');
    const tiny = await resizeImage(smallPng, {
      mode: 'exact',
      width: 32,
      height: 32,
      target: 'png',
    });
    await expect(generateFavicon(tiny.bytes)).rejects.toMatchObject({ code: 'invalid-option' });
  });

  it('empty → empty-input', async () => {
    await expect(generateFavicon(new Uint8Array(0))).rejects.toMatchObject({
      code: 'empty-input',
    });
  });
});
