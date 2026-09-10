/**
 * PDF Group B engine client (Layer 1 → Layer 2 bridge).
 *
 * Group A tools run in the Web Worker (pdf-worker-client.ts); Group B
 * tools need native helpers, so they POST to the local engine (Layer 2)
 * and receive base64 EngineFiles back. Same ToolError-style taxonomy for
 * human-readable rendering in ToolRunnerPage.
 *
 * Engine URL: same-origin in the Docker target (Caddy/nginx proxies
 * /engine); localhost:8787 in dev. The client NEVER holds an auth token
 * in persistent storage (Section 5.1) — none is needed for loopback.
 *
 * Phase 11: the human-readable error copy moved to lib/tool-errors.ts
 * (single home for the whole app); the unreachable-copy constant lives
 * here because this module is what throws it.
 */

import type { EngineError } from '@localtools/shared-types';
import { friendlyError } from './tool-errors';
import { engineBaseUrl } from './engine-url';

export { engineBaseUrl };

export interface EngineFileOut {
  name: string;
  ext: string;
  data: string; // base64
}

export type EngineResponse =
  { ok: true; data: { files: EngineFileOut[] } } | { ok: false; error: EngineError };

export class EngineCallError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'EngineCallError';
    this.code = code;
  }
}

export function isEngineCallError(err: unknown): err is EngineCallError {
  return err instanceof EngineCallError;
}

/** Copy thrown when the engine can't be reached at all (Section 13). */
export const ENGINE_UNREACHABLE_TEXT =
  'The local processing engine isn’t running. Start it with the desktop app or `docker compose up`.';

/** Copy thrown when the engine answers something unparseable. */
const ENGINE_UNREADABLE_TEXT = 'The engine returned an unreadable response.';

/** Decode a base64 EngineFile to bytes. */
export function decodeEngineFile(f: EngineFileOut): Uint8Array {
  const bin = atob(f.data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/**
 * Call a downloader (Group C) engine endpoint — JSON body, no file
 * parts. Returns the parsed data payload; throws EngineCallError with
 * the engine's taxonomy codes on failure.
 */
export async function runEngineJson<T>(
  endpoint: string,
  body: Record<string, unknown>,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${engineBaseUrl()}${endpoint}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new EngineCallError('engine-unreachable', ENGINE_UNREACHABLE_TEXT);
  }
  let parsed: { ok: boolean; data?: unknown; error?: { code: string; message: string } };
  try {
    parsed = (await res.json()) as typeof parsed;
  } catch {
    throw new EngineCallError('internal', ENGINE_UNREADABLE_TEXT);
  }
  if (!parsed.ok || parsed.error !== undefined) {
    throw new EngineCallError(
      parsed.error?.code ?? 'internal',
      friendlyError(parsed.error, 'engine', parsed.error?.message ?? ''),
    );
  }
  return (parsed as { ok: true; data: T }).data;
}

export interface EngineClientFile {
  name: string;
  bytes: Uint8Array;
}

/**
 * Call a PDF Group B engine endpoint. `options` is the per-tool request
 * body (shared zod schemas document the shape); `files` are attached as
 * multipart parts in order (options reference them by index).
 */
export async function runEngineTool(
  endpoint: string,
  options: Record<string, unknown>,
  files: EngineClientFile[],
): Promise<{ name: string; ext: string; bytes: Uint8Array }[]> {
  const form = new FormData();
  form.append('options', JSON.stringify(options));
  for (const f of files) {
    form.append('files', new Blob([f.bytes as unknown as ArrayBuffer]), f.name);
  }

  let res: Response;
  try {
    res = await fetch(`${engineBaseUrl()}${endpoint}`, { method: 'POST', body: form });
  } catch {
    throw new EngineCallError('engine-unreachable', ENGINE_UNREACHABLE_TEXT);
  }

  let body: EngineResponse;
  try {
    body = (await res.json()) as EngineResponse;
  } catch {
    throw new EngineCallError('internal', ENGINE_UNREADABLE_TEXT);
  }

  if (!body.ok) {
    throw new EngineCallError(
      body.error.code,
      friendlyError(body.error, 'engine', body.error.message),
    );
  }
  return body.data.files.map((f) => ({ name: f.name, ext: f.ext, bytes: decodeEngineFile(f) }));
}
