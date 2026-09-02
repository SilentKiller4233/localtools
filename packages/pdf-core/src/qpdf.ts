import createModule from '@neslinesli93/qpdf-wasm';
import type { QpdfInstance } from '@neslinesli93/qpdf-wasm';
import { ToolError } from './errors';

/**
 * Node-only module imports live behind a runtime require so bundlers never
 * statically pull node:url/node:module into a browser chunk (qpdf.ts is
 * imported by the browser Worker for the shared wasm singleton). In Node
 * (tests/engine) the require resolves normally; in the browser the wasm
 * asset URL is a plain public path and these helpers are never called.
 */
interface NodeModuleShape {
  createRequire: (from: string) => { resolve: (id: string) => string };
}
interface NodeUrlShape {
  pathToFileURL: (p: string) => { href: string };
}
function nodeRequire(id: 'node:module'): NodeModuleShape;
function nodeRequire(id: 'node:url'): NodeUrlShape;
function nodeRequire(id: string): unknown {
  const requireFn = require as (mid: string) => unknown;
  return requireFn(id);
}

/**
 * Lazy singleton qpdf-wasm module. Instantiating the WASM module costs
 * ~30MB heap and several hundred ms; every qpdf-backed tool shares one
 * instance. callMain is sync; args go through MEMFS paths only.
 *
 * Spec 5.3 discipline applies even inside the WASM sandbox: argument ARRAYS
 * only, never a shell string — same rule as engine subprocesses.
 */
let qpdfPromise: Promise<QpdfInstance> | undefined;

// Runtime environment detection: this module runs in BOTH the browser (Vite
// bundle, where `process` does not exist) and Node (tests/engine). The
// eslint rule cannot see cross-environment code, hence the targeted disable.
// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
const IS_NODE = typeof process !== 'undefined' && process.versions?.node !== undefined;

function wasmUrl(): string {
  if (IS_NODE) {
    // Node: resolve the installed package's wasm via require resolution —
    // new URL(bare-specifier) does NOT resolve package specifiers. The
    // node: imports are behind nodeRequire (browser-bundle safety, above).
    const { createRequire } = nodeRequire('node:module');
    const { pathToFileURL } = nodeRequire('node:url');
    const req = createRequire(import.meta.url);
    const resolved = req.resolve('@neslinesli93/qpdf-wasm/dist/qpdf.wasm');
    return pathToFileURL(resolved).href;
  }
  // Browser: the app copies the wasm asset to /wasm/qpdf.wasm at build time.
  return '/wasm/qpdf.wasm';
}

export async function getQpdf(): Promise<QpdfInstance> {
  if (qpdfPromise === undefined) {
    qpdfPromise = createModule({ locateFile: () => wasmUrl() });
  }
  return qpdfPromise;
}

/** Run qpdf with an argument array; non-zero exit → qpdf-failed. */
export async function runQpdf(args: string[]): Promise<QpdfInstance> {
  const qpdf = await getQpdf();
  const code = qpdf.callMain(args);
  if (code !== 0) {
    throw new ToolError('qpdf-failed', `qpdf exited with code ${String(code)}.`);
  }
  return qpdf;
}

/** Write bytes into the WASM FS at `path` (dirs must exist). */
export function qpdfWriteFile(qpdf: QpdfInstance, path: string, bytes: Uint8Array): void {
  // The runtime FS has writeFile; the package's .d.ts omits it (verified
  // against dist/qpdf.js line 101 exports). One narrow cast.
  (qpdf.FS as unknown as { writeFile: (p: string, b: Uint8Array) => void }).writeFile(path, bytes);
}

/** Read bytes from the WASM FS at `path`. */
export function qpdfReadFile(qpdf: QpdfInstance, path: string): Uint8Array {
  return qpdf.FS.readFile(path);
}
