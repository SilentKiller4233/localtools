/**
 * Environment-aware codec loader for the @jsquash WASM codecs (D-017).
 *
 * Browser Worker: the public API self-initializes (fetches wasm relative
 * to import.meta.url; Vite handles the URL) — pass-through only.
 * Node (tests / dev / future server use): emscripten's default loader
 * calls fetch() on a file:// URL which Node rejects, so each codec is
 * initialized ONCE with a wasm binary read from disk:
 *   - png: init(<Buffer>) — single codec/pkg/*.wasm
 *   - jpeg/webp/avif: init(new WebAssembly.Module(bytes)) — separate
 *     codec/dec + codec/enc wasm binaries
 * decode/encode are named exports on png but DEFAULT exports on the
 * inner decode.js/encode.js of the emscripten-style packages.
 */

import type { ImageDataLike } from './types.js';

export interface Codec {
  decode(bytes: Uint8Array): Promise<ImageDataLike>;
  encode(image: ImageDataLike, opts?: Record<string, unknown>): Promise<Uint8Array>;
}

interface InitCapable {
  init(module?: unknown): unknown;
}

type MaybeProcess = { versions?: { node?: string } } | undefined;
const procView: MaybeProcess = (globalThis as { process?: MaybeProcess }).process;
const IS_NODE: boolean = procView?.versions?.node !== undefined;

/** Node-only: read a wasm file inside an installed @jsquash package,
 * returning bytes over a plain ArrayBuffer (Buffer's buffer may be
 * SharedArrayBuffer-backed, which WebAssembly rejects). */
async function readWasm(pkg: string, rel: string): Promise<Uint8Array> {
  const modModule = await import('node:module');
  const fsModule = await import('node:fs/promises');
  const pathModule = await import('node:path');
  const require = modModule.createRequire(import.meta.url);
  const pkgJson: string = require.resolve(`${pkg}/package.json`);
  const buf = await fsModule.readFile(pathModule.resolve(pathModule.dirname(pkgJson), rel));
  const out = new Uint8Array(buf.byteLength);
  out.set(buf);
  return out;
}

/** Concrete ArrayBuffer copy (Buffer views may sit on SharedArrayBuffer). */
function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const out = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(out).set(bytes);
  return out;
}

type CodecName = 'png' | 'jpeg' | 'webp' | 'avif';

const WASM_LAYOUT: Readonly<Record<CodecName, { dec: string; enc: string }>> = {
  png: { dec: 'codec/pkg/squoosh_png_bg.wasm', enc: 'codec/pkg/squoosh_png_bg.wasm' },
  jpeg: { dec: 'codec/dec/mozjpeg_dec.wasm', enc: 'codec/enc/mozjpeg_enc.wasm' },
  webp: { dec: 'codec/dec/webp_dec.wasm', enc: 'codec/enc/webp_enc.wasm' },
  avif: { dec: 'codec/dec/avif_dec.wasm', enc: 'codec/enc/avif_enc.wasm' },
};

const inited = new Set<CodecName>();

async function ensureInit(name: CodecName): Promise<void> {
  if (!IS_NODE) return;
  if (inited.has(name)) return;
  const wasm = WASM_LAYOUT[name];
  if (name === 'png') {
    // png's init takes the raw binary.
    const dec = (await import('@jsquash/png/decode.js')) as unknown as InitCapable;
    const enc = (await import('@jsquash/png/encode.js')) as unknown as InitCapable;
    const decBytes = asArrayBuffer(await readWasm('@jsquash/png', wasm.dec));
    const encBytes = asArrayBuffer(await readWasm('@jsquash/png', wasm.enc));
    await dec.init(decBytes);
    await enc.init(encBytes);
  } else {
    // emscripten-style: init takes a compiled WebAssembly.Module; dec and
    // enc have separate binaries.
    const decBytes = await readWasm(`@jsquash/${name}`, wasm.dec);
    const encBytes = await readWasm(`@jsquash/${name}`, wasm.enc);
    const decMod = (await import(`@jsquash/${name}/decode.js`)) as unknown as InitCapable;
    const encMod = (await import(`@jsquash/${name}/encode.js`)) as unknown as InitCapable;
    await decMod.init(new WebAssembly.Module(asArrayBuffer(decBytes)));
    await encMod.init(new WebAssembly.Module(asArrayBuffer(encBytes)));
  }
  inited.add(name);
}

function pickDecode(mod: Record<string, unknown>): (bytes: Uint8Array) => Promise<ImageDataLike> {
  const fn = (mod['decode'] ?? mod['default']) as
    ((bytes: Uint8Array) => Promise<ImageDataLike>) | undefined;
  if (fn === undefined) throw new Error('codec decode export missing');
  return fn;
}

function pickEncode(
  mod: Record<string, unknown>,
): (image: ImageDataLike, opts?: Record<string, unknown>) => Promise<Uint8Array> {
  const fn = (mod['encode'] ?? mod['default']) as
    ((image: ImageDataLike, opts?: Record<string, unknown>) => Promise<Uint8Array>) | undefined;
  if (fn === undefined) throw new Error('codec encode export missing');
  return fn;
}

/** Decoded-image contract shared by all codecs (subset of ImageData). */

export const png: Codec = {
  async decode(bytes) {
    await ensureInit('png');
    const mod = (await import('@jsquash/png')) as unknown as Record<string, unknown>;
    return pickDecode(mod)(bytes);
  },
  async encode(image, opts) {
    await ensureInit('png');
    const mod = (await import('@jsquash/png')) as unknown as Record<string, unknown>;
    return pickEncode(mod)(image, opts);
  },
};

function emCodec(name: 'jpeg' | 'webp' | 'avif'): Codec {
  return {
    async decode(bytes) {
      await ensureInit(name);
      const mod = (await import(`@jsquash/${name}/decode.js`)) as unknown as Record<
        string,
        unknown
      >;
      return pickDecode(mod)(bytes);
    },
    async encode(image, opts) {
      await ensureInit(name);
      const mod = (await import(`@jsquash/${name}/encode.js`)) as unknown as Record<
        string,
        unknown
      >;
      return pickEncode(mod)(image, opts);
    },
  };
}

export const jpeg: Codec = emCodec('jpeg');
export const webp: Codec = emCodec('webp');
export const avif: Codec = emCodec('avif');
