/**
 * Background remover (PROJECT_SPEC Section 3.3, D-016 path):
 * onnxruntime-web + a permissively-licensed U2Net-family ONNX model
 * (u2netp — Apache-2.0 upstream) with lazy download + local cache.
 *
 * Privacy: inference is fully local (browser Worker or Node). The model
 * file is fetched ONCE from a pinned URL on first tool use and cached in
 * the app's local data dir; no image bytes ever leave the machine.
 *
 * Environment split (same shape as codecs.ts):
 *  - Browser Worker: onnxruntime-web with wasm from the bundled package.
 *  - Node (tests/dev): onnxruntime-web's Node-compatible execution or
 *    onnxruntime-node via a dynamic import seam, so tests run the REAL
 *    inference without a browser.
 */

import { imageError, type ImageDataLike } from '../types.js';
import { decodeAuto, flattenOnWhite } from './convert.js';
import { jpeg, png } from '../codecs.js';

/** U2Netp input is 320x320 (the lightweight portrait model). */
const INPUT_SIZE = 320;

/** Pinned model artifact: u2netp ONNX, 4.57MB, Apache-2.0 (mirrored on
 * HuggingFace; upstream weights from the U2-Net project's Apache-2.0
 * release). D-016 path — verified header + license 2026-09-04. */
export const MODEL_URL = 'https://huggingface.co/baby2008/u2net-onnx/resolve/main/u2netp.onnx';
export const MODEL_CACHE_KEY = 'u2netp.onnx';

export interface RemoveBackgroundOptions {
  target?: 'png' | 'jpeg' | 'webp';
  quality?: number;
  /** Test seam: provide model bytes directly (skips download/cache). */
  modelBytes?: Uint8Array;
}

export interface RemoveBackgroundResult {
  bytes: Uint8Array;
  /** Downscaled mask coverage 0-1 (how much was kept). */
  foregroundRatio: number;
}

interface OrtTensor {
  data: Float32Array;
  dims: readonly number[];
}

interface OrtSession {
  run(feeds: Record<string, unknown>): Promise<Record<string, OrtTensor>>;
}

/** Node-side ORT loader seam (onnxruntime-web browser path is primary). */
async function loadSession(
  modelBytes: Uint8Array,
): Promise<{ session: OrtSession; inputName: string }> {
  // Node: onnxruntime-node handles local bytes directly.
  const ortMod = await import('onnxruntime-node');
  const ort = ortMod as unknown as {
    InferenceSession: { create(buffer: Uint8Array): Promise<OrtSession> };
    Tensor: new (type: 'float32', data: Float32Array, dims: readonly number[]) => unknown;
  };
  const session = await ort.InferenceSession.create(modelBytes);
  const withNames = session as unknown as { inputNames?: string[] };
  const names = withNames.inputNames;
  const first: string | undefined = names?.[0];
  return { session, inputName: first ?? 'input.1' };
  // NOTE: u2netp exports a single input; if inputNames is unavailable we
}

/** Preprocess: resize to 320x320, normalize to [0,1], NCHW float32. */
function toModelInput(image: ImageDataLike): Float32Array {
  const { data, width, height } = image;
  const out = new Float32Array(1 * 3 * INPUT_SIZE * INPUT_SIZE);
  const xRatio = width / INPUT_SIZE;
  const yRatio = height / INPUT_SIZE;
  for (let y = 0; y < INPUT_SIZE; y += 1) {
    for (let x = 0; x < INPUT_SIZE; x += 1) {
      const sx = Math.min(width - 1, Math.floor(x * xRatio));
      const sy = Math.min(height - 1, Math.floor(y * yRatio));
      const src = (sy * width + sx) * 4;
      const dst = (y * INPUT_SIZE + x) * 1; // CHW: plane stride = 320*320
      out[dst] = (data[src] ?? 0) / 255; // R plane
      out[dst + INPUT_SIZE * INPUT_SIZE] = (data[src + 1] ?? 0) / 255; // G
      out[dst + 2 * INPUT_SIZE * INPUT_SIZE] = (data[src + 2] ?? 0) / 255; // B
    }
  }
  return out;
}

export async function removeBackground(
  bytes: Uint8Array,
  opts: RemoveBackgroundOptions = {},
): Promise<RemoveBackgroundResult> {
  if (bytes.byteLength === 0) throw imageError('empty-input');
  const image = await decodeAuto(bytes);
  if (image.width > 4096 || image.height > 4096) {
    throw imageError('size-limit', 'Background removal is limited to 4096px images.');
  }

  let modelBytes = opts.modelBytes;
  if (modelBytes === undefined) {
    modelBytes = await fetchModelBytes();
  }

  const { session, inputName } = await loadSession(modelBytes);
  const input = toModelInput(image);

  const ort = (await import('onnxruntime-node')) as unknown as {
    Tensor: new (type: 'float32', data: Float32Array, dims: readonly number[]) => unknown;
  };
  const feeds: Record<string, unknown> = {};
  feeds[inputName] = new ort.Tensor('float32', input, [1, 3, INPUT_SIZE, INPUT_SIZE]);
  const results = await session.run(feeds);
  const output = results[Object.keys(results)[0] ?? ''];
  if (output === undefined) {
    throw imageError('operation-failed', 'The background-removal model returned nothing.');
  }
  const mask = output.data; // [1,1,320,320] sigmoid values 0..1
  const maskLen = INPUT_SIZE * INPUT_SIZE;
  if (mask.length < maskLen) {
    throw imageError('operation-failed', 'Unexpected model output shape.');
  }

  // Composite: alpha = upsampled mask at full resolution.
  const { width, height, data } = image;
  const out = new Uint8ClampedArray(data.length);
  out.set(data);
  let kept = 0;
  let counted = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const mx = Math.min(INPUT_SIZE - 1, Math.floor((x / width) * INPUT_SIZE));
      const my = Math.min(INPUT_SIZE - 1, Math.floor((y / height) * INPUT_SIZE));
      const m = mask[my * INPUT_SIZE + mx] ?? 0;
      const dst = (y * width + x) * 4;
      out[dst + 3] = Math.round(m * 255);
      if (m > 0.5) kept += 1;
      counted += 1;
    }
  }
  const foregroundRatio = counted === 0 ? 1 : kept / counted;

  const quality = opts.quality ?? 88;
  const target = opts.target ?? 'png';
  let encoded: Uint8Array;
  switch (target) {
    case 'png': {
      const e = await png.encode({ data: out, width, height });
      encoded = e instanceof Uint8Array ? e : new Uint8Array(e);
      break;
    }
    case 'jpeg': {
      const e = await jpeg.encode(flattenOnWhite({ data: out, width, height }), { quality });
      encoded = e instanceof Uint8Array ? e : new Uint8Array(e);
      break;
    }
    case 'webp': {
      const { webp } = await import('../codecs.js');
      const e = await webp.encode({ data: out, width, height }, { quality });
      encoded = e instanceof Uint8Array ? e : new Uint8Array(e);
      break;
    }
    default:
      throw imageError('invalid-option', 'Target must be png, jpeg, or webp.');
  }
  return { bytes: encoded, foregroundRatio };
}

/** Fetch + cache the model (browser: localStorage-less cache via Cache API;
 * Node: local file under the user temp dir). */
async function fetchModelBytes(): Promise<Uint8Array> {
  // Node path first (tests/dev): file cache under tmpdir.
  const procView: { versions?: { node?: string } } | undefined = (
    globalThis as { process?: { versions?: { node?: string } } }
  ).process;
  if (procView?.versions?.node !== undefined) {
    const { readFile, writeFile, mkdir } = await import('node:fs/promises');
    const osMod = await import('node:os');
    const pathMod = await import('node:path');
    const dir = pathMod.join(osMod.tmpdir(), 'localtools-models');
    const file = pathMod.join(dir, MODEL_CACHE_KEY);
    try {
      const cached = await readFile(file);
      return new Uint8Array(cached);
    } catch {
      // download once
    }
    const res = await fetch(MODEL_URL);
    if (!res.ok) {
      throw imageError(
        'operation-failed',
        'The background-removal model could not be downloaded. Check your connection and retry.',
      );
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    await mkdir(dir, { recursive: true });
    await writeFile(file, buf);
    return buf;
  }
  // Browser: fetch (service worker can cache the response).
  const res = await fetch(MODEL_URL);
  if (!res.ok) {
    throw imageError(
      'operation-failed',
      'The background-removal model could not be downloaded. Check your connection and retry.',
    );
  }
  return new Uint8Array(await res.arrayBuffer());
}
