/**
 * Image tool worker bridge — same frozen contract as pdf-worker-client.
 * One worker hosts every image-core call; processing never touches the
 * main thread (Section 8).
 *
 * Phase 11 adds the additive `progress` response member (per-file
 * batch progress) — handlers that don't opt in ignore it, so the
 * frozen request shape is unchanged.
 */

export type WorkerFileInput = { name: string; bytes: Uint8Array };

export interface ImageToolRequest {
  id: number;
  tool: string;
  options: Record<string, unknown>;
  files: WorkerFileInput[];
}

export type ImageToolResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; code: string; message: string }
  | { id: number; progress: { done: number; total: number } };

let nextId = 1;
let worker: Worker | undefined;
const pending = new Map<number, { resolve: (r: unknown) => void; reject: (e: unknown) => void }>();
const progressCb = new Map<number, (done: number, total: number) => void>();

function ensureWorker(): Worker {
  if (worker !== undefined) return worker;
  worker = new Worker(new URL('../workers/image.worker.ts', import.meta.url), { type: 'module' });
  worker.addEventListener('message', (event: MessageEvent<ImageToolResponse>) => {
    const msg = event.data;
    if ('progress' in msg) {
      progressCb.get(msg.id)?.(msg.progress.done, msg.progress.total);
      return;
    }
    const entry = pending.get(msg.id);
    if (entry === undefined) return;
    pending.delete(msg.id);
    progressCb.delete(msg.id);
    if (msg.ok) entry.resolve(msg.result);
    else entry.reject(new ImageWorkerError(msg.code, msg.message));
  });
  worker.addEventListener('error', (event) => {
    for (const [, entry] of pending) {
      entry.reject(
        new ImageWorkerError('worker-crash', event.message || 'The image worker crashed.'),
      );
    }
    pending.clear();
    worker?.terminate();
    worker = undefined;
  });
  return worker;
}

export class ImageWorkerError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'ImageWorkerError';
    this.code = code;
  }
}

export function isImageWorkerError(err: unknown): err is ImageWorkerError {
  return err instanceof ImageWorkerError;
}

export function runImageTool(
  tool: string,
  options: Record<string, unknown>,
  files: WorkerFileInput[],
): Promise<unknown> {
  const w = ensureWorker();
  const id = nextId;
  nextId += 1;
  const transfer = files.flatMap((f) => {
    const b = f.bytes.buffer;
    return b instanceof ArrayBuffer ? [b] : [];
  });
  const request: ImageToolRequest = { id, tool, options, files };
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage(request, transfer);
  });
}

/**
 * Run an image tool with per-item progress (batch: per file). The
 * callback fires on the main thread while the worker works.
 */
export function runImageToolWithProgress(
  tool: string,
  options: Record<string, unknown>,
  files: WorkerFileInput[],
  onProgress: (done: number, total: number) => void,
): Promise<unknown> {
  const w = ensureWorker();
  const id = nextId;
  nextId += 1;
  const transfer = files.flatMap((f) => {
    const b = f.bytes.buffer;
    return b instanceof ArrayBuffer ? [b] : [];
  });
  const request: ImageToolRequest = { id, tool, options, files };
  progressCb.set(id, onProgress);
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage(request, transfer);
  });
}
