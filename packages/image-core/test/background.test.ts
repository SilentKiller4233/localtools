/**
 * Section 14.1 tests: background remover (D-016 path — onnxruntime +
 * u2netp). The model bytes are downloaded ONCE per host into the OS temp
 * cache by the tool itself (tests exercise the real fetch+cache+infer
 * pipeline); the object fixture asserts a genuine alpha mask.
 */

import { describe, expect, it, beforeAll } from 'vitest';
import { removeBackground } from '../src/index.js';
import { decodeAuto } from '../src/index.js';
import { readFixture } from './helpers.js';
import { fileTypeFromBuffer } from 'file-type';

let modelBytes: Uint8Array | undefined;

beforeAll(async () => {
  // Reuse the cache the tool created (or download once for the suite).
  const fsp = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const pathMod = await import('node:path');
  try {
    const cached: string = pathMod.join(tmpdir(), 'localtools-models', 'u2netp.onnx');
    modelBytes = new Uint8Array(await fsp.readFile(cached));
  } catch {
    modelBytes = undefined; // tool will download on first test
  }
}, 120_000);

describe('background remover — Section 14.1', () => {
  it('happy: object image → PNG with real alpha (spec: assert alpha channel)', async () => {
    const input = await readFixture('sample-object.png');
    const result = await removeBackground(input, {
      target: 'png',
      ...(modelBytes !== undefined ? { modelBytes } : {}),
    });
    const ft = await fileTypeFromBuffer(result.bytes);
    expect(ft?.ext).toBe('png');
    // Spec 14.1: output must HAVE an alpha channel with actual values.
    const after = await decodeAuto(result.bytes);
    const alphaAt = (x: number, y: number): number =>
      after.data[(y * after.width + x) * 4 + 3] ?? -1;
    expect(alphaAt(128, 128)).toBeGreaterThan(200); // object center kept
    expect(alphaAt(8, 8)).toBeLessThan(80); // background removed
    expect(result.foregroundRatio).toBeGreaterThan(0.05);
    expect(result.foregroundRatio).toBeLessThan(0.5);
  }, 180_000);

  it('happy: flat-color image (no subject) → honest near-zero foreground', async () => {
    const input = await readFixture('sample.png');
    const result = await removeBackground(input, {
      target: 'png',
      ...(modelBytes !== undefined ? { modelBytes } : {}),
    });
    // Spec 3.3 edge case: no clear subject → best-effort; the tool must
    // not crash and must return a valid file.
    const ft = await fileTypeFromBuffer(result.bytes);
    expect(ft?.ext).toBe('png');
    expect(result.foregroundRatio).toBeLessThan(0.2);
  }, 180_000);

  it('malformed → invalid-image, no crash', async () => {
    const garbage = await readFixture('malformed.png');
    await expect(
      removeBackground(garbage, ...(modelBytes !== undefined ? [{ modelBytes }] : [{}])),
    ).rejects.toMatchObject({ code: 'invalid-image' });
  });

  it('empty → empty-input', async () => {
    await expect(
      removeBackground(new Uint8Array(0), ...(modelBytes !== undefined ? [{ modelBytes }] : [{}])),
    ).rejects.toMatchObject({
      code: 'empty-input',
    });
  });

  it('oversized (>4096px) → size-limit before processing', async () => {
    const input = await readFixture('sample-object.png');
    const { resizeImage } = await import('../src/index.js');
    const huge = await resizeImage(input, {
      mode: 'exact',
      width: 4097,
      height: 4097,
      target: 'png',
    });
    await expect(
      removeBackground(huge.bytes, ...(modelBytes !== undefined ? [{ modelBytes }] : [{}])),
    ).rejects.toMatchObject({ code: 'size-limit' });
  });
});
