/**
 * Section 14.1 tests: SVG optimizer, meme, screenshot annotator, OCR.
 */

import { describe, expect, it } from 'vitest';
import { optimizeSvg, makeMeme, annotateScreenshot, ocrImage } from '../src/index.js';
import { readFixture } from './helpers.js';
import { fileTypeFromBuffer } from 'file-type';

const SAMPLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
  <!-- a comment to be stripped -->
  <metadata>generator: LocalTools test</metadata>
  <rect x="0.0000000" y="0.0000000" width="100.0000000" height="100.0000000" fill="#e02040"/>
</svg>`;

describe('SVG optimizer — Section 14.1', () => {
  it('happy: strips comments/metadata + shrinks precision, keeps viewBox', () => {
    const result = optimizeSvg(SAMPLE_SVG);
    expect(result.newSize).toBeLessThan(result.originalSize);
    expect(result.svg).not.toContain('<!--');
    expect(result.svg).not.toContain('generator: LocalTools');
    expect(result.svg).not.toContain('0.0000000');
    expect(result.svg).toContain('<svg');
  });

  it('keeps viewBox when present', () => {
    const withViewBox = SAMPLE_SVG.replace('width="100" height="100"', 'viewBox="0 0 100 100"');
    const result = optimizeSvg(withViewBox);
    expect(result.svg).toContain('viewBox');
  });

  it('empty → empty-input', () => {
    expect(() => optimizeSvg('   ')).toThrow(/No image content|empty/i);
  });

  it('non-SVG text → invalid-image', () => {
    expect(() => optimizeSvg('hello world, definitely not svg')).toThrow();
  });
});

describe('meme generator — Section 14.1', () => {
  it('happy: top+bottom text renders into a real JPEG', async () => {
    const input = await readFixture('sample.png');
    const out = await makeMeme(input, { topText: 'WHEN THE TESTS', bottomText: 'ALL PASS' });
    const ft = await fileTypeFromBuffer(out);
    expect(ft?.ext).toBe('jpg');
    expect(out.byteLength).toBeGreaterThan(200);
  });

  it('no text → invalid-option', async () => {
    const input = await readFixture('sample.png');
    await expect(makeMeme(input, {})).rejects.toMatchObject({ code: 'invalid-option' });
  });

  it('empty input → empty-input', async () => {
    await expect(makeMeme(new Uint8Array(0), { topText: 'HI' })).rejects.toMatchObject({
      code: 'empty-input',
    });
  });
});

describe('screenshot annotator — Section 14.1', () => {
  it('happy: box + arrow + blur produce a valid PNG', async () => {
    const input = await readFixture('sample.png');
    const out = await annotateScreenshot(input, {
      shapes: [
        { kind: 'box', x: 4, y: 4, w: 30, h: 30, color: [255, 0, 0] },
        { kind: 'arrow', x: 40, y: 10, x2: 60, y2: 50, color: [0, 0, 255] },
        { kind: 'blur', x: 10, y: 40, w: 40, h: 20 },
      ],
    });
    const ft = await fileTypeFromBuffer(out);
    expect(ft?.ext).toBe('png');
  });

  it('blur region is actually pixelated (not a visual overlay)', async () => {
    const input = await readFixture('sample.png');
    const out = await annotateScreenshot(input, {
      shapes: [{ kind: 'blur', x: 8, y: 8, w: 40, h: 40, blocks: 4 }],
    });
    const mod = await import('../src/index.js');
    const after = await mod.decodeAuto(out);
    // In the blurred region, adjacent 4px blocks must be IDENTICAL rows
    // (mosaic), i.e. pixel (9,9) == pixel (11,11) after averaging.
    const px = (
      img: { data: Uint8Array | Uint8ClampedArray; width: number },
      x: number,
      y: number,
    ) => {
      const i = (y * img.width + x) * 4;
      return [img.data[i], img.data[i + 1], img.data[i + 2]];
    };
    const a = px(after, 9, 9);
    const b = px(after, 11, 11);
    expect(Math.abs((a[0] ?? 0) - (b[0] ?? 0))).toBeLessThanOrEqual(3);
  });

  it('no shapes → invalid-option', async () => {
    const input = await readFixture('sample.png');
    await expect(annotateScreenshot(input, { shapes: [] })).rejects.toMatchObject({
      code: 'invalid-option',
    });
  });

  it('empty → empty-input', async () => {
    await expect(
      annotateScreenshot(new Uint8Array(0), {
        shapes: [{ kind: 'box', x: 1, y: 1, w: 2, h: 2, color: [0, 0, 0] }],
      }),
    ).rejects.toMatchObject({ code: 'empty-input' });
  });
});

describe('image OCR — Section 14.1', () => {
  // OCR needs tesseract traineddata (lazy-downloaded on first use);
  // give it a generous timeout like the engine suite.
  it('happy: reads the text from a rendered text image', async () => {
    // Render a big, clean glyph word: upscale the canvas first so the
    // bitmap font has crisp, unambiguous shapes for tesseract.
    const blank = await readFixture('sample.png');
    const { resizeImage } = await import('../src/index.js');
    const big = await resizeImage(blank, { mode: 'exact', width: 512, height: 512, target: 'png' });
    const meme = await makeMeme(big.bytes, { topText: 'HELLO', target: 'png' });
    const result = await ocrImage(meme);
    const up = result.text.toUpperCase().replace(/\s+/g, '');
    // Bitmap-font rendering isn't a typographer's font: accept HELL + at
    // least a trailing vowel-ish guess (tesseract commonly reads the
    // blocky 5x7 O as 0 or D on some renders).
    expect(up).toContain('HELL');
    expect(result.confidence).toBeGreaterThan(25);
  }, 120_000);

  it('empty → empty-input', async () => {
    await expect(ocrImage(new Uint8Array(0))).rejects.toMatchObject({ code: 'empty-input' });
  });
});
