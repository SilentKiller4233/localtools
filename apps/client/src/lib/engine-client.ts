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
 */

import type { EngineError } from '@localtools/shared-types';

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

/** Resolve the engine base URL for this environment. */
function engineBaseUrl(): string {
  // Desktop shell: the bridge reports the sidecar port (Phase 10).
  // Docker/prod web: same origin behind the reverse proxy path; dev:
  // direct localhost. The client NEVER holds an auth token in
  // persistent storage (Section 5.1) — none is needed for loopback.
  const bridge = (globalThis as { __LOCALTOOLS__?: { invoke(c: string): Promise<unknown> } })
    .__LOCALTOOLS__;
  if (bridge !== undefined) {
    // The shell injects the port before this module loads (bridge.js
    // sets window.__LOCALTOOLS_ENGINE_PORT__); this stays sync.
    const port = (window as { __LOCALTOOLS_ENGINE_PORT__?: number }).__LOCALTOOLS_ENGINE_PORT__;
    if (port !== undefined) return `http://127.0.0.1:${String(port)}`;
  }
  if (import.meta.env.DEV) return 'http://127.0.0.1:8787';
  return '/engine';
}

/** Human-readable copy for engine error codes (mirrors ToolRunnerPage's). */
export const ENGINE_ERROR_TEXT: Record<string, string> = {
  'no-inputs': 'Select at least one file first.',
  'empty-input': 'The selected file appears to be empty. Try another file.',
  'invalid-file': 'This file is not a type this tool can process.',
  'size-limit': 'This file is larger than the processing cap.',
  'invalid-option': 'One of the settings above is not valid — check the highlighted fields.',
  'tool-timeout': 'The operation took too long and was stopped.',
  'tool-failed': 'The file could not be processed — it may be damaged or unsupported.',
  'tool-unavailable':
    'This tool needs a component that isn’t installed. On the desktop app it downloads on first use; on Docker it ships with the image.',
  'engine-busy': 'The processing engine is busy — try again in a moment.',
  'unsupported-site':
    'This site isn’t supported by the downloader — try a link from a supported video or audio platform.',
  'blocked-host': 'This link points at a private or local network address, which is not allowed.',
  'rate-limited': 'Too many downloads in a short time — wait a moment and try again.',
  'too-long': 'This item is longer than the downloader’s duration cap.',
  'download-too-large': 'The download exceeded the size cap and was stopped — nothing was kept.',
  unauthorized: 'This request is not authorized.',
  internal: 'The operation failed unexpectedly. Please try again.',
};

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
    throw new EngineCallError(
      'engine-unreachable',
      'The local processing engine isn’t running. Start it with the desktop app or `docker compose up`.',
    );
  }
  let parsed: { ok: boolean; data?: unknown; error?: { code: string; message: string } };
  try {
    parsed = (await res.json()) as typeof parsed;
  } catch {
    throw new EngineCallError('internal', 'The engine returned an unreadable response.');
  }
  if (!parsed.ok || parsed.error !== undefined) {
    const code = parsed.error?.code ?? 'internal';
    throw new EngineCallError(code, ENGINE_ERROR_TEXT[code] ?? parsed.error?.message ?? '');
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
    throw new EngineCallError(
      'engine-unreachable',
      'The local processing engine isn’t running. Start it with the desktop app or `docker compose up`.',
    );
  }

  let body: EngineResponse;
  try {
    body = (await res.json()) as EngineResponse;
  } catch {
    throw new EngineCallError('internal', 'The engine returned an unreadable response.');
  }

  if (!body.ok) {
    throw new EngineCallError(
      body.error.code,
      ENGINE_ERROR_TEXT[body.error.code] ?? body.error.message,
    );
  }
  return body.data.files.map((f) => ({ name: f.name, ext: f.ext, bytes: decodeEngineFile(f) }));
}
