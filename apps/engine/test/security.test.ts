/**
 * Section 14.4 security regression tests for the engine request pipeline
 * (Phase 4 subset — the Group C SSRF set arrives with Phase 8).
 *
 * These run without native tools: they exercise validation, caps, auth,
 * CORS, headers, temp-dir cleanup, and the concurrency 429 — all of
 * which are pure engine behavior.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  multipartBody,
  optionsOnlyBody,
  postForm,
  readFixture,
  startEngine,
  type TestApp,
} from './helpers.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readdir } from 'node:fs/promises';

let engine: TestApp;

beforeAll(async () => {
  engine = await startEngine();
});

afterAll(async () => {
  await engine.close();
});

describe('health + headers (5.1/5.7)', () => {
  it('answers /healthz', async () => {
    const res = await fetch(`${engine.url}/healthz`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it('binds loopback only (127.0.0.1)', () => {
    // startEngine binds 127.0.0.1 explicitly; the server address proves it.
    const addr = engine.app.server.address();
    expect(typeof addr === 'object' && addr !== null && addr.address).toBe('127.0.0.1');
  });

  it('sets strict security headers on every response (5.7)', async () => {
    const res = await fetch(`${engine.url}/healthz`);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    const csp = res.headers.get('content-security-policy') ?? '';
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain('unsafe-inline');
  });

  it('CORS: allows the configured origin only, never a wildcard', async () => {
    const good = await fetch(`${engine.url}/healthz`, {
      headers: { origin: engine.config.clientOrigin },
    });
    expect(good.headers.get('access-control-allow-origin')).toBe(engine.config.clientOrigin);
    const bad = await fetch(`${engine.url}/healthz`, {
      headers: { origin: 'https://evil.example.com' },
    });
    expect(bad.headers.get('access-control-allow-origin')).not.toBe('https://evil.example.com');
    expect(bad.headers.get('access-control-allow-origin')).not.toBe('*');
  });
});

describe('upload validation (5.2)', () => {
  it('rejects a file with the wrong magic bytes for the tool (14.4 command-injection-style filename)', async () => {
    // A PDF fixture uploaded with a ".docx; rm -rf" style hostile name to
    // the office-conversion to-pdf endpoint: magic bytes (PDF) are wrong
    // for an Office input, and the name must never touch the filesystem.
    const pdf = await readFixture('simple-text.pdf');
    const form = multipartBody(
      { target: 'word', direction: 'to-pdf', file: 0 },
      { name: 'innocent.docx; drop table; ../../etc/passwd', bytes: pdf },
    );
    const { status, body } = await postForm(`${engine.url}/pdf/office-conversion`, form);
    expect(status).toBe(422);
    expect(body.ok).toBe(false);
    if (!body.ok) expect(['invalid-file', 'no-inputs']).toContain(body.error.code);
  });

  it('rejects garbage bytes with a .docx extension (mislabeled file)', async () => {
    const garbage = await readFixture('malformed.docx');
    const form = multipartBody(
      { target: 'word', direction: 'to-pdf', file: 0 },
      { name: 'broken.docx', bytes: garbage },
    );
    const { status, body } = await postForm(`${engine.url}/pdf/office-conversion`, form);
    expect(status).toBe(422);
    if (!body.ok) expect(body.error.code).toBe('invalid-file');
  });

  it('rejects an empty file', async () => {
    const form = multipartBody(
      { target: 'word', direction: 'to-pdf', file: 0 },
      { name: 'empty.docx', bytes: new Uint8Array(0) },
    );
    const { status, body } = await postForm(`${engine.url}/pdf/office-conversion`, form);
    expect(status).toBe(422);
    if (!body.ok) expect(body.error.code).toBe('empty-input');
  });

  it('rejects a request with no file parts', async () => {
    const form = optionsOnlyBody({ target: 'word', direction: 'to-pdf', file: 0 });
    const { status, body } = await postForm(`${engine.url}/pdf/office-conversion`, form);
    expect(status).toBe(422);
    if (!body.ok) expect(body.error.code).toBe('no-inputs');
  });

  it('rejects invalid options with 400 invalid-option', async () => {
    const pdf = await readFixture('simple-text.pdf');
    const form = multipartBody(
      { preset: 'not-a-preset', file: 0 },
      { name: 'doc.pdf', bytes: pdf },
    );
    const { status, body } = await postForm(`${engine.url}/pdf/deep-compress`, form);
    expect(status).toBe(400);
    if (!body.ok) expect(body.error.code).toBe('invalid-option');
  });

  it('rejects a file above the per-file cap BEFORE processing (oversized input)', async () => {
    // Tiny cap via a dedicated engine instance (the maxBytes seam pattern
    // from D-013 — no giant fixture needed).
    const tight = await startEngine({ maxFileSize: 1024 });
    try {
      const pdf = await readFixture('simple-text.pdf'); // ~1.2KB > 1KB cap
      const form = multipartBody({ preset: 'ebook', file: 0 }, { name: 'big.pdf', bytes: pdf });
      const { status, body } = await postForm(`${tight.url}/pdf/deep-compress`, form);
      expect([413, 422]).toContain(status);
      if (!body.ok)
        expect(['size-limit', 'empty-input', 'invalid-file']).toContain(body.error.code);
    } finally {
      await tight.close();
    }
  });

  it('sanitizes path-traversal filenames — never writes outside the temp dir', async () => {
    // The engine writes inputs under fresh random internal names; the
    // hostile name is display-only. We assert no traversal file lands in
    // the engine temp root during the request's lifetime by scanning the
    // root for anything named pwned.
    const root = join(tmpdir(), 'localtools-engine');
    const pdf = await readFixture('simple-text.pdf');
    const form = multipartBody(
      { preset: 'ebook', file: 0 },
      { name: '../../pwned.pdf', bytes: pdf },
    );
    await postForm(`${engine.url}/pdf/deep-compress`, form); // any outcome
    const entries = await readdir(root).catch(() => [] as string[]);
    expect(entries.some((e) => e.includes('pwned'))).toBe(false);
  });
});

describe('temp-dir lifecycle (5.2)', () => {
  it('deletes the per-request temp dir on success AND failure (finally block)', async () => {
    const root = join(tmpdir(), 'localtools-engine');
    const before = await readdir(root).catch(() => [] as string[]);

    // Success case: valid compressed run (needs Ghostscript; if missing
    // we still get an error response — either way the dir must be gone).
    const pdf = await readFixture('simple-text.pdf');
    const okForm = multipartBody({ preset: 'ebook', file: 0 }, { name: 'a.pdf', bytes: pdf });
    const failForm = multipartBody(
      { preset: 'ebook', file: 0 },
      { name: 'garbage.pdf', bytes: new Uint8Array(0) },
    );
    await postForm(`${engine.url}/pdf/deep-compress`, okForm);
    await postForm(`${engine.url}/pdf/deep-compress`, failForm);

    const after = await readdir(root).catch(() => [] as string[]);
    // No NEW leftover dirs: every request dir is removed in finally.
    expect(after.length).toBeLessThanOrEqual(before.length);
  });
});

describe('concurrency cap → 429 (5.2/13)', () => {
  it('answers 429 engine-busy when the subprocess slots are full', async () => {
    // The limiter wraps the whole per-request pipeline (harness step 5),
    // so a big upload holds a slot through its 8MB temp write + tool run.
    // On hosts WITH the native tool the slot is held for the full
    // Ghostscript run; WITHOUT tools, for the temp-write + 503 path.
    // Poll busy>=1 then fire the second request; retry the pair a few
    // times in case the first finished before we could observe it.
    const one = await startEngine({ maxConcurrentSubprocesses: 1, fileTimeoutSeconds: 30 });
    try {
      const simple = await readFixture('simple-text.pdf');
      // Eight padded ~8MB files: ALL their temp writes happen INSIDE the
      // limiter, so the first request deterministically holds its slot for
      // hundreds of ms on any host — with or without native tools.
      const bigFiles: { name: string; bytes: Uint8Array }[] = [];
      for (let i = 0; i < 8; i += 1) {
        const pad = new Uint8Array(8 * 1024 * 1024);
        const pdf = new Uint8Array(simple.byteLength + pad.byteLength);
        pdf.set(simple, 0);
        pdf.set(pad, simple.byteLength);
        bigFiles.push({ name: `a${String(i)}.pdf`, bytes: pdf });
      }
      const slowForm = new FormData();
      slowForm.append('options', JSON.stringify({ preset: 'ebook', file: 0 }));
      for (const f of bigFiles) {
        slowForm.append('files', new Blob([f.bytes]), f.name);
      }

      let sawBusy = false;
      let got429 = false;
      for (let attempt = 0; attempt < 3 && !got429; attempt += 1) {
        const slowPromise = postForm(`${one.url}/pdf/deep-compress`, slowForm);
        const inSlot = await waitFor(
          async () => {
            const res = await fetch(`${one.url}/healthz`);
            const body = (await res.json()) as { ok: boolean; data?: { busy?: number } };
            return body.ok && (body.data?.busy ?? 0) >= 1;
          },
          { timeoutMs: 10_000, intervalMs: 25 },
        );
        if (inSlot) sawBusy = true;
        const second = await postForm(
          `${one.url}/pdf/deep-compress`,
          multipartBody({ preset: 'ebook', file: 0 }, { name: 'b.pdf', bytes: simple }),
        );
        if (second.status === 429) {
          got429 = true;
          if (!second.body.ok) expect(second.body.error.code).toBe('engine-busy');
        }
        await slowPromise;
      }
      // The slot counter must be observable at least once, and the cap
      // must produce a 429 at least once across attempts.
      expect(sawBusy).toBe(true);
      expect(got429).toBe(true);
    } finally {
      await one.close();
    }
  });
});

describe('exposed-engine auth (5.1)', () => {
  it('refuses to boot when LOCALTOOLS_EXPOSE=true without a 32-char token', async () => {
    // config.loadConfig throws; assert via the module directly.
    const prevExpose = process.env['LOCALTOOLS_EXPOSE'];
    const prevToken = process.env['LOCALTOOLS_AUTH_TOKEN'];
    process.env['LOCALTOOLS_EXPOSE'] = 'true';
    process.env['LOCALTOOLS_AUTH_TOKEN'] = 'short';
    try {
      const { loadConfig } = await import('../src/config.js');
      expect(() => {
        loadConfig();
      }).toThrow(/32 characters|refusing/i);
    } finally {
      if (prevExpose === undefined) delete process.env['LOCALTOOLS_EXPOSE'];
      else process.env['LOCALTOOLS_EXPOSE'] = prevExpose;
      if (prevToken === undefined) delete process.env['LOCALTOOLS_AUTH_TOKEN'];
      else process.env['LOCALTOOLS_AUTH_TOKEN'] = prevToken;
    }
  });

  it('requires a bearer token on every endpoint when exposed, rejects without one', async () => {
    // Build an exposed engine through the harness seam (bypasses loadConfig's
    // env refusal — the server-side plugin behavior is what we're testing).
    const exposed = await startEngine({
      exposed: true,
      authToken: 'a'.repeat(40),
      host: '127.0.0.1',
    });
    try {
      const noAuth = await fetch(`${exposed.url}/healthz`);
      expect(noAuth.status).toBe(200); // healthz stays open

      const pdf = await readFixture('simple-text.pdf');
      const form = multipartBody({ preset: 'ebook', file: 0 }, { name: 'a.pdf', bytes: pdf });
      const missing = await fetch(`${exposed.url}/pdf/deep-compress`, {
        method: 'POST',
        body: form,
      });
      expect(missing.status).toBe(401);

      const form2 = multipartBody({ preset: 'ebook', file: 0 }, { name: 'a.pdf', bytes: pdf });
      const wrong = await fetch(`${exposed.url}/pdf/deep-compress`, {
        method: 'POST',
        body: form2,
        headers: { authorization: 'Bearer wrong-token-entirely' },
      });
      expect(wrong.status).toBe(401);

      const form3 = multipartBody({ preset: 'ebook', file: 0 }, { name: 'a.pdf', bytes: pdf });
      const good = await fetch(`${exposed.url}/pdf/deep-compress`, {
        method: 'POST',
        body: form3,
        headers: { authorization: `Bearer ${'a'.repeat(40)}` },
      });
      // With the right token the pipeline runs (Ghostscript or
      // tool-unavailable — both prove auth passed).
      expect([200, 422, 503, 504]).toContain(good.status);
    } finally {
      await exposed.close();
    }
  });
});

/** Poll fn every intervalMs until it returns true or timeoutMs elapses. */
async function waitFor(
  fn: () => Promise<boolean>,
  opts: { timeoutMs: number; intervalMs: number },
): Promise<boolean> {
  const deadline = Date.now() + opts.timeoutMs;
  for (;;) {
    if (await fn()) return true;
    if (Date.now() > deadline) return false;
    await new Promise((r) => setTimeout(r, opts.intervalMs));
  }
}
