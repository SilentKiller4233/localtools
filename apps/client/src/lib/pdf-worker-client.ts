/**
 * PDF tool worker bridge (Section 8: Web Workers for all Group A processing).
 *
 * One worker hosts every pdf-core call for the PDF suite. The worker module
 * is dynamically imported INSIDE the worker script (apps/client/src/workers/
 * pdf.worker.ts), keeping pdfjs/qpdf/wasm off the main bundle entirely.
 *
 * Message contract (both directions frozen):
 * - request:  { id, tool, payload } — payload holds Uint8Array inputs plus
 *   plain-JS options (transferable buffers are moved, never copied, on the
 *   way in; results are moved back the same way).
 * - response:  { id, ok: true, result } | { id, ok: false, code, message }
 *   ToolError shape is preserved so the main thread can render the exact
 *   human-readable taxonomy (Section 9 error states).
 */

export type WorkerFileInput = { name: string; bytes: Uint8Array };

export interface ToolRequest {
  id: number;
  tool: string;
  /** JSON-serializable options + the file inputs (see per-tool payload types). */
  options: Record<string, unknown>;
  files: WorkerFileInput[];
}

export type ToolResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; code: string; message: string }
  // Phase 11 real-progress: emitted mid-run for long jobs (pdf-to-image
  // per page). Additive — ignored by handlers that don't opt in.
  | { id: number; progress: { done: number; total: number } };

let nextId = 1;
let worker: Worker | undefined;
const pending = new Map<number, { resolve: (r: unknown) => void; reject: (e: unknown) => void }>();
const progressCb = new Map<number, (done: number, total: number) => void>();

function ensureWorker(): Worker {
  if (worker !== undefined) return worker;
  worker = new Worker(new URL('../workers/pdf.worker.ts', import.meta.url), { type: 'module' });
  worker.addEventListener('message', (event: MessageEvent<ToolResponse>) => {
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
    else entry.reject(new ToolWorkerError(msg.code, msg.message));
  });
  worker.addEventListener('error', (event) => {
    // Worker crashed (import failure, OOM): fail everything pending.
    for (const [, entry] of pending) {
      entry.reject(
        new ToolWorkerError('worker-crash', event.message || 'The tool worker crashed.'),
      );
    }
    pending.clear();
    worker?.terminate();
    worker = undefined;
  });
  return worker;
}

/** Error with the pdf-core ToolError taxonomy carried across the worker boundary. */
export class ToolWorkerError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'ToolWorkerError';
    this.code = code;
  }
}

export function isToolWorkerError(err: unknown): err is ToolWorkerError {
  return err instanceof ToolWorkerError;
}

/** Run a pdf-core tool in the worker. Buffers are transferred, not copied. */
export function runTool(
  tool: string,
  options: Record<string, unknown>,
  files: WorkerFileInput[],
): Promise<unknown> {
  return runToolWithProgress(tool, options, files).then((r) => r.result);
}

export interface ToolRunResult {
  result: unknown;
}

/**
 * Run a tool and receive per-item progress events while it works
 * (pdf-to-image per page). The callback fires on the main thread; the
 * promise resolves when the tool completes.
 */
export function runToolWithProgress(
  tool: string,
  options: Record<string, unknown>,
  files: WorkerFileInput[],
  onProgress?: (done: number, total: number) => void,
): Promise<ToolRunResult> {
  const w = ensureWorker();
  const id = nextId;
  nextId += 1;
  const transfer = transfersOf(files);
  const request: ToolRequest = { id, tool, options, files };
  if (onProgress !== undefined) progressCb.set(id, onProgress);
  return new Promise((resolve, reject) => {
    pending.set(id, {
      resolve: (result) => {
        resolve({ result });
      },
      reject,
    });
    w.postMessage(request, transfer);
  });
}

/** All transferable buffers are plain ArrayBuffers by construction. */
function transfersOf(files: WorkerFileInput[]): ArrayBuffer[] {
  return files.flatMap((f) => {
    const b = f.bytes.buffer;
    return b instanceof ArrayBuffer ? [b] : [];
  });
}
