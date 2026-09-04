/**
 * DevText tool worker bridge — same frozen contract as pdf/image bridges.
 * One worker hosts every devtext-core call; heavy libs (faker, prettier,
 * pdf-lib, image codecs for QR scan) load lazily inside the worker only.
 */

export type WorkerFileInput = { name: string; bytes: Uint8Array };

export interface DevTextToolRequest {
  id: number;
  tool: string;
  options: Record<string, unknown>;
  files: WorkerFileInput[];
}

export type DevTextToolResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; code: string; message: string };

let nextId = 1;
let worker: Worker | undefined;
const pending = new Map<number, { resolve: (r: unknown) => void; reject: (e: unknown) => void }>();

function ensureWorker(): Worker {
  if (worker !== undefined) return worker;
  worker = new Worker(new URL('../workers/devtext.worker.ts', import.meta.url), { type: 'module' });
  worker.addEventListener('message', (event: MessageEvent<DevTextToolResponse>) => {
    const msg = event.data;
    const entry = pending.get(msg.id);
    if (entry === undefined) return;
    pending.delete(msg.id);
    if (msg.ok) entry.resolve(msg.result);
    else entry.reject(new DevTextWorkerError(msg.code, msg.message));
  });
  worker.addEventListener('error', (event) => {
    for (const [, entry] of pending) {
      entry.reject(
        new DevTextWorkerError('worker-crash', event.message || 'The dev-text worker crashed.'),
      );
    }
    pending.clear();
    worker?.terminate();
    worker = undefined;
  });
  return worker;
}

export class DevTextWorkerError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'DevTextWorkerError';
    this.code = code;
  }
}

export function isDevTextWorkerError(err: unknown): err is DevTextWorkerError {
  return err instanceof DevTextWorkerError;
}

export function runDevTextTool(
  tool: string,
  options: Record<string, unknown>,
  files: WorkerFileInput[],
): Promise<unknown> {
  const wk = ensureWorker();
  const id = nextId;
  nextId += 1;
  const transfer = files.flatMap((f) => {
    const b = f.bytes.buffer;
    return b instanceof ArrayBuffer ? [b] : [];
  });
  const request: DevTextToolRequest = { id, tool, options, files };
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    wk.postMessage(request, transfer);
  });
}
