/**
 * Media speech tool worker bridge — same frozen contract as the image
 * worker client. One worker hosts whisper.cpp WASM transcription; the
 * WASM + model load lazily inside it (dynamic imports → Vite code
 * splits everything heavy out of the initial bundle, D-029).
 */

export type WorkerFileInput = { name: string; bytes: Uint8Array };

export interface MediaToolRequest {
  id: number;
  tool: string;
  options: Record<string, unknown>;
  files: WorkerFileInput[];
}

export type MediaToolResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; code: string; message: string };

let nextId = 1;
let worker: Worker | undefined;
const pending = new Map<number, { resolve: (r: unknown) => void; reject: (e: unknown) => void }>();

function ensureWorker(): Worker {
  if (worker !== undefined) return worker;
  worker = new Worker(new URL('../workers/media.worker.ts', import.meta.url), { type: 'module' });
  worker.addEventListener('message', (event: MessageEvent<MediaToolResponse>) => {
    const msg = event.data;
    const entry = pending.get(msg.id);
    if (entry === undefined) return;
    pending.delete(msg.id);
    if (msg.ok) entry.resolve(msg.result);
    else entry.reject(new MediaWorkerError(msg.code, msg.message));
  });
  worker.addEventListener('error', (event) => {
    for (const [, entry] of pending) {
      entry.reject(
        new MediaWorkerError('worker-crash', event.message || 'The media worker crashed.'),
      );
    }
    pending.clear();
    worker?.terminate();
    worker = undefined;
  });
  return worker;
}

export class MediaWorkerError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'MediaWorkerError';
    this.code = code;
  }
}

export function isMediaWorkerError(err: unknown): err is MediaWorkerError {
  return err instanceof MediaWorkerError;
}

export function runMediaTool(
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
  const request: MediaToolRequest = { id, tool, options, files };
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage(request, transfer);
  });
}
