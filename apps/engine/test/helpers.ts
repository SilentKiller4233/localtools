/**
 * Engine test helpers: build an app instance on an ephemeral port with a
 * tight test config, plus multipart FormData builders that mirror the
 * client contract (files[] + options JSON).
 */

import { createServer } from '../src/index.js';
import { testConfig, type EngineConfig } from '../src/config.js';
import type { FastifyInstance } from 'fastify';

export interface TestApp {
  app: FastifyInstance;
  url: string;
  close(): Promise<void>;
  config: EngineConfig;
}

/** Start an engine bound to an ephemeral loopback port. */
export async function startEngine(overrides: Partial<EngineConfig> = {}): Promise<TestApp> {
  const config = testConfig({ ...overrides, maxFileSize: overrides.maxFileSize ?? 524_288_000 });
  const app = await createServer({ config, port: 0 });
  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address();
  if (typeof address !== 'object' || address === null) throw new Error('engine failed to bind');
  return {
    app,
    url: `http://127.0.0.1:${String(address.port)}`,
    close: async () => {
      await app.close();
    },
    config,
  };
}

/** Build a multipart body: options JSON + one file blob. */
export function multipartBody(
  options: Record<string, unknown>,
  file: { name: string; bytes: Uint8Array },
): FormData {
  const form = new FormData();
  form.append('options', JSON.stringify(options));
  form.append('files', new Blob([file.bytes]), file.name);
  return form;
}

/** Multipart body with no file parts (options only) — error path helper. */
export function optionsOnlyBody(options: Record<string, unknown>): FormData {
  const form = new FormData();
  form.append('options', JSON.stringify(options));
  return form;
}

/** File blob with no options part. */
export function fileOnlyBody(file: { name: string; bytes: Uint8Array }): FormData {
  const form = new FormData();
  form.append('files', new Blob([file.bytes]), file.name);
  return form;
}

export interface EngineFileOut {
  name: string;
  ext: string;
  data: string;
}

export interface EngineOk {
  ok: true;
  data: { files: EngineFileOut[] };
}

export interface EngineErr {
  ok: false;
  error: { code: string; message: string };
}

export type EngineResponse = EngineOk | EngineErr;

export function decodeFile(out: EngineFileOut): Uint8Array {
  const bin = atob(out.data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export async function postForm(
  url: string,
  form: FormData,
): Promise<{ status: number; body: EngineResponse }> {
  const res = await fetch(url, { method: 'POST', body: form });
  const body = (await res.json()) as EngineResponse;
  return { status: res.status, body };
}

/** Path to a committed fixture. */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function fixturePath(name: string): string {
  const here = fileURLToPath(new URL('.', import.meta.url));
  return resolve(here, '../../..', 'fixtures/pdf', name);
}

export async function readFixture(name: string): Promise<Uint8Array> {
  const { readFile } = await import('node:fs/promises');
  return new Uint8Array(await readFile(fixturePath(name)));
}
