/**
 * Section 14.4 Group C security regression tests + Section 14.1
 * functional tests for the Media downloader (PROJECT_SPEC Phase 8).
 *
 * All tests run against the LOCAL MOCK TARGET (downloader-mock.ts) —
 * never a live third-party site (D-026). The engine runs in
 * LOCALTOOLS_DOWNLOADER_TEST_MODE=true: extractor set = generic,html5
 * (the mock's extractors), validating proxy allows literal loopback.
 *
 * Happy paths run the REAL yt-dlp (repo-local on the dev host). On CI
 * runners without yt-dlp they degrade to the honest 503
 * tool-unavailable — never 422 (the c88d80d lesson).
 *
 * Security cases (5.8 / 14.4):
 *  - loopback / private / link-local / 169.254.169.254 → blocked-host
 *    BEFORE any request is made
 *  - redirect chain to a private IP → blocked at the hop (per-hop
 *    checking proven: the mock redirect page IS fetched from a
 *    loopback origin in test mode, but the PRIVATE next hop never gets
 *    a request — asserted via the mock's hit log + the proxy's denial)
 *  - non-http(s) scheme → rejected
 *  - unrecognized site (production extractor set) → unsupported-site
 *    with ZERO outbound requests (mock hit log empty)
 *  - oversized download → aborted mid-flight, no full file on disk
 *  - downloader rate limit → rate-limited, distinct from engine-busy
 *  - malicious metadata filename (../../, null bytes, control chars)
 *    → sanitized before use
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startEngine, type TestApp } from './helpers.js';
import { startMockTarget, type MockTarget } from './downloader-mock.js';
import { spawn } from 'node:child_process';
import { toolPaths } from '../src/tool-paths.js';

let engine: TestApp;
let mock: MockTarget;

/** POST JSON to the engine (the downloader routes speak JSON, not multipart). */
async function postJson(
  url: string,
  body: unknown,
): Promise<{
  status: number;
  body: { ok: boolean; data?: unknown; error?: { code: string; message: string } };
}> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as never };
}

/** True when yt-dlp is resolvable on this host (happy paths run; else 503). */
async function ytdlpAvailable(): Promise<boolean> {
  const paths = await toolPaths();
  return new Promise((resolve) => {
    const child = spawn(paths.ytdlp, ['--version'], { shell: false, windowsHide: true });
    child.on('error', () => {
      resolve(false);
    });
    child.on('close', (code) => {
      resolve(code === 0);
    });
  });
}

let haveYtdlp = false;

beforeAll(async () => {
  mock = await startMockTarget();
  // Test seam: the mock origin is the ONE exempted loopback host:port.
  process.env['LOCALTOOLS_DOWNLOADER_TEST_MODE'] = 'true';
  process.env['LOCALTOOLS_DOWNLOADER_MOCK_TARGET'] = `127.0.0.1:${String(mock.port)}`;
  // High downloader rate limit: the security suite fires ~30 requests
  // against this instance; the rate-limit behavior itself is tested on
  // its own tight-limiter engine below.
  engine = await startEngine({
    downloaderRateLimit: 100,
    downloaderRateWindowSeconds: 60,
  });
  haveYtdlp = await ytdlpAvailable();
});

afterAll(async () => {
  await engine.close();
  await mock.close();
  delete process.env['LOCALTOOLS_DOWNLOADER_TEST_MODE'];
  delete process.env['LOCALTOOLS_DOWNLOADER_MOCK_TARGET'];
});

/* ------------------------------------------------------------------ */
/* Unit-level: SSRF guard classification                              */
/* ------------------------------------------------------------------ */

describe('SSRF guard: IP classification (5.8)', () => {
  it('classifies loopback/private/link-local as non-public', async () => {
    const { classifyIp } = await import('../src/downloader/ssrf-guard.js');
    const blocked: Record<string, { public: boolean; label?: string }> = {
      '127.0.0.1': classifyIp('127.0.0.1'),
      '127.8.8.8': classifyIp('127.8.8.8'), // whole 127/8
      '::1': classifyIp('::1'),
      '10.1.2.3': classifyIp('10.1.2.3'),
      '172.16.0.1': classifyIp('172.16.0.1'),
      '172.31.255.255': classifyIp('172.31.255.255'),
      '192.168.1.1': classifyIp('192.168.1.1'),
      '169.254.169.254': classifyIp('169.254.169.254'), // cloud metadata
      '169.254.0.1': classifyIp('169.254.0.1'),
      '0.0.0.0': classifyIp('0.0.0.0'),
      '100.64.1.1': classifyIp('100.64.1.1'),
      '::ffff:10.0.0.1': classifyIp('::ffff:10.0.0.1'), // v4-mapped
      'fe80::1': classifyIp('fe80::1'),
      'fd00::1': classifyIp('fd00::1'),
    };
    for (const [ip, cls] of Object.entries(blocked)) {
      expect(cls.public, `${ip} must be non-public`).toBe(false);
    }
    const publicOnes = ['8.8.8.8', '1.1.1.1', '93.184.216.34', '2606:4700::1111'];
    for (const ip of publicOnes) {
      expect(classifyIp(ip).public, `${ip} must be public`).toBe(true);
    }
    // 172.15.x.x and 172.32.x.x are OUTSIDE 172.16/12 — public.
    expect(classifyIp('172.15.0.1').public).toBe(true);
    expect(classifyIp('172.32.0.1').public).toBe(true);
  });

  it('rejects non-http(s) schemes before anything else (5.8)', async () => {
    const bad = ['file:///etc/passwd', 'ftp://example.com/x', 'data:text/html,hi', 'gopher://x'];
    for (const url of bad) {
      const r = await postJson(`${engine.url}/downloader/metadata`, { url });
      expect(r.status, url).toBe(400);
      expect(r.body.error?.code).toBe('invalid-option');
      // and crucially: no outbound request was even conceivable
    }
    const r2 = await postJson(`${engine.url}/downloader/download`, { url: 'file:///etc/passwd' });
    expect(r2.status).toBe(400);
    expect(r2.body.error?.code).toBe('invalid-option');
  });
});

/* ------------------------------------------------------------------ */
/* 14.4: private/loopback/link-local URL → rejected before any request */
/* ------------------------------------------------------------------ */

describe('downloader: private-range URL rejection (14.4)', () => {
  const cases: Array<[string, string]> = [
    ['loopback literal', 'http://127.0.0.1:9/video.html'],
    ['loopback 127/8 (non-.1)', 'http://127.200.1.1/video.html'],
    ['private 10/8', 'http://10.0.0.5/video.html'],
    ['private 172.16/12', 'http://172.16.0.1/video.html'],
    ['private 192.168/16', 'http://192.168.1.1/video.html'],
    ['link-local metadata endpoint', 'http://169.254.169.254/latest/meta-data/'],
    ['link-local other', 'http://169.254.1.1/x'],
    ['ipv6 loopback', 'http://[::1]/video.html'],
  ];

  for (const [label, url] of cases) {
    it(`rejects ${label} with blocked-host and no outbound request`, async () => {
      const hitsBefore = mock.hits().length;
      const r = await postJson(`${engine.url}/downloader/metadata`, { url });
      expect(r.status).toBe(422);
      expect(r.body.error?.code).toBe('blocked-host');
      // The mock target (loopback) was NOT hit — the only loopback
      // server we ever talk to in test mode is the mock itself, and its
      // hit log is unchanged: no request was made at all.
      expect(mock.hits().length).toBe(hitsBefore);
      const r2 = await postJson(`${engine.url}/downloader/download`, { url, mode: 'best' });
      expect(r2.status).toBe(422);
      expect(r2.body.error?.code).toBe('blocked-host');
      expect(mock.hits().length).toBe(hitsBefore);
    });
  }

  it('rejects a NAME resolving to loopback (localhost) with blocked-host', async () => {
    const r = await postJson(`${engine.url}/downloader/metadata`, {
      url: 'http://localhost:9/video.html',
    });
    expect(r.status).toBe(422);
    expect(r.body.error?.code).toBe('blocked-host');
  });
});

/* ------------------------------------------------------------------ */
/* 14.4: redirect chain → private IP rejected at the hop              */
/* ------------------------------------------------------------------ */

describe('downloader: redirect-chain SSRF (14.4 per-hop checking)', () => {
  it('a public (mock) URL redirecting to a private IP is blocked mid-chain', async () => {
    // The mock IS the "public" origin in test mode (loopback allowed for
    // the mock itself, but the REDIRECT target 192.168.13.37 is a
    // private IP — the proxy must refuse to connect to it).
    const hitsBefore = mock.hits().length;
    const r = await postJson(`${engine.url}/downloader/metadata`, {
      url: `${mock.url}/redir-deny.html`,
    });
    // The request FAILED overall — and the private hop was never fetched.
    expect(r.body.ok).toBe(false);
    const newHits = mock.hits().slice(hitsBefore);
    if (haveYtdlp) {
      // Exactly ONE hit: the redirect page itself. The private hop
      // (192.168.13.37) was denied by the proxy mid-chain.
      expect(newHits).toEqual(['GET /redir-deny.html']);
      expect(['blocked-host', 'tool-failed', 'unsupported-site']).toContain(r.body.error?.code);
    } else {
      // No yt-dlp on this host: nothing ran, so zero outbound requests —
      // the security property holds trivially; assert the honest 503.
      expect(r.body.error?.code).toBe('tool-unavailable');
      expect(newHits).toEqual([]);
    }
  });

  it('a redirect to the cloud metadata endpoint is blocked (169.254.169.254)', async () => {
    const hitsBefore = mock.hits().length;
    const r = await postJson(`${engine.url}/downloader/metadata`, {
      url: `${mock.url}/redir-meta.html`,
    });
    expect(r.body.ok).toBe(false);
    const newHits = mock.hits().slice(hitsBefore);
    if (haveYtdlp) {
      // The redirect page fetched; the metadata hop DENIED.
      expect(newHits).toEqual(['GET /redir-meta.html']);
    } else {
      expect(newHits).toEqual([]);
      expect(r.body.error?.code).toBe('tool-unavailable');
    }
  });

  it('a redirect to a loopback NAME (localhost) is blocked mid-chain', async () => {
    // localhost:<mock port> would actually be the mock — but the proxy
    // must still deny the NAME 'localhost' (it resolves to loopback),
    // proving per-hop checks are DNS-aware, not literal-IP-only.
    const hitsBefore = mock.hits().length;
    const r = await postJson(`${engine.url}/downloader/metadata`, {
      url: `${mock.url}/redir-loop.html`,
    });
    expect(r.body.ok).toBe(false);
    const newHits = mock.hits().slice(hitsBefore);
    if (haveYtdlp) {
      // the redirect page fetched; the localhost hop DENIED (would have
      // been GET /video.html on the same mock server — it's absent).
      expect(newHits).toEqual(['GET /redir-loop.html']);
    } else {
      expect(newHits).toEqual([]);
      expect(r.body.error?.code).toBe('tool-unavailable');
    }
  });
});

/* ------------------------------------------------------------------ */
/* 14.4: unsupported site → NO outbound request at all                 */
/* ------------------------------------------------------------------ */

describe('downloader: unsupported site / no open proxy (14.4)', () => {
  it('production extractor set: unrecognized site, ZERO outbound requests', async () => {
    // Direct proof of the no-open-proxy rule at the yt-dlp layer: run
    // the PRODUCTION arg builder (extractors: all,-generic) against the
    // mock URL and assert yt-dlp rejects it ("Unsupported URL") WITHOUT
    // a single HTTP request — the mock's hit log stays empty. This is
    // the exact production posture: generic extraction (the raw-fetch
    // shape) is disabled, so unknown hosts never get fetched.
    const { baseArgs, PRODUCTION_EXTRACTOR_ARGS } = await import('../src/downloader/ytdlp.js');
    const { startValidatingProxy } = await import('../src/downloader/ssrf-guard.js');
    const { toolPaths } = await import('../src/tool-paths.js');
    if (!haveYtdlp) {
      // CI: the extractor-rejection contract is verified where it
      // lives (arg builder) — assert the production set is exactly
      // 'all,-generic' and that every run gets it.
      expect(PRODUCTION_EXTRACTOR_ARGS).toEqual(['--use-extractors', 'all,-generic']);
      return;
    }
    const paths = await toolPaths();
    const { runYtDlp } = await import('../src/downloader/ytdlp.js');
    const proxy = await startValidatingProxy({ mockTarget: `127.0.0.1:${String(mock.port)}` });
    try {
      const hitsBefore = mock.hits().length;
      const args = [
        ...baseArgs({
          proxyUrl: proxy.proxyUrl,
          extractorArgs: PRODUCTION_EXTRACTOR_ARGS,
          timeoutMs: 60_000,
        }),
        '-J',
        '--flat-playlist',
        `${mock.url}/video.html`,
      ];
      const run = await runYtDlp(paths.ytdlp, args, { timeoutMs: 60_000 });
      expect(run.code).not.toBe(0);
      expect(run.stderr).toMatch(/Unsupported URL/);
      expect(mock.hits().length).toBe(hitsBefore); // ZERO outbound requests
    } finally {
      await proxy.close();
    }
  });
});

/* ------------------------------------------------------------------ */
/* 14.4: oversized download aborted mid-flight, no full file          */
/* ------------------------------------------------------------------ */

describe('downloader: size cap (14.4/5.8)', () => {
  it('aborts an oversized download mid-flight and keeps nothing', async () => {
    if (!haveYtdlp) {
      const r = await postJson(`${engine.url}/downloader/download`, {
        url: `${mock.url}/big.mp4`,
        mode: 'best',
      });
      expect(r.status).toBe(503);
      expect(r.body.error?.code).toBe('tool-unavailable');
      return;
    }
    const tight = await startEngine({ maxDownloadSizeBytes: 50 * 1024 });
    try {
      const r = await postJson(`${tight.url}/downloader/download`, {
        url: `${mock.url}/big.mp4`,
        mode: 'best',
      });
      expect(r.body.ok).toBe(false);
      expect(r.body.error?.code).toBe('download-too-large');
      // No full file left on disk: the temp dir is removed in finally —
      // verify the engine temp root has no new oversized leftovers.
      const root = join(tmpdir(), 'localtools-engine');
      const entries = await readdir(root).catch(() => [] as string[]);
      for (const e of entries) {
        const s = await stat(join(root, e)).catch(() => undefined);
        if (s !== undefined && s.isDirectory()) {
          const inner = await readdir(join(root, e)).catch(() => [] as string[]);
          for (const f of inner) {
            const st = await stat(join(root, e, f)).catch(() => undefined);
            expect(st?.size ?? 0, `leftover ${f}`).toBeLessThan(50 * 1024);
          }
        }
      }
    } finally {
      await tight.close();
    }
  });

  it('pre-download duration gate rejects over-cap durations (too-long)', async () => {
    // The mock reports no duration (html5 extractor limitation), so the
    // gate is exercised through its unit seam — the same function
    // runDownload calls before fetching any media bytes.
    const { assertDurationWithinCap } = await import('../src/downloader/downloader.js');
    const cap = { config: { maxDownloadDurationSeconds: 10_800 } };
    // within cap → no throw (including null = unknown duration)
    expect(() => {
      assertDurationWithinCap(3_600, cap);
    }).not.toThrow();
    expect(() => {
      assertDurationWithinCap(null, cap);
    }).not.toThrow();
    expect(() => {
      assertDurationWithinCap(10_800, cap);
    }).not.toThrow(); // boundary
    // over cap → too-long
    const capTiny = { config: { maxDownloadDurationSeconds: 1 } };
    try {
      assertDurationWithinCap(3_600, capTiny);
      expect.unreachable('gate must throw');
    } catch (err) {
      const e = err as { code?: string };
      expect(e.code).toBe('too-long');
    }
    // boundary+1
    try {
      assertDurationWithinCap(10_801, cap);
      expect.unreachable('gate must throw');
    } catch (err) {
      const e = err as { code?: string };
      expect(e.code).toBe('too-long');
    }
  });

  it('sanitizes malicious metadata filenames (../../, null bytes, control chars)', async () => {
    const { sanitizeRemoteName } = await import('../src/downloader/ytdlp.js');
    expect(sanitizeRemoteName('../../etc/passwd')).toBe('etcpasswd');
    expect(sanitizeName_noTraversal(sanitizeRemoteName('..\\..\\pwn'))).toBe(true);
    expect(sanitizeRemoteName('null\u0000byte')).toBe('nullbyte');
    expect(sanitizeRemoteName('ctrl\u0001\u0002chars')).toBe('ctrlchars');
    expect(sanitizeRemoteName('a/b/c/d.mp4')).toBe('abcd.mp4');
    expect(sanitizeRemoteName('')).toBe('download');
    expect(sanitizeRemoteName('   .hidden..evil   ')).toBe('hidden.evil'); // dot-runs collapse
    // no path separators survive anywhere
    for (const hostile of ['x/../../y', 'C:\\Windows\\system32', '....//....']) {
      const out = sanitizeRemoteName(hostile);
      expect(out).not.toMatch(/[\\/]/);
      expect(out).not.toMatch(/\.\./);
    }
    function sanitizeName_noTraversal(s: string): boolean {
      return !s.includes('..') && !s.includes('\\');
    }
  });

  it('download output files land inside the temp dir (no traversal escape)', async () => {
    if (!haveYtdlp) return; // 503 path covered by the size test
    const r = await postJson(`${engine.url}/downloader/download`, {
      url: `${mock.url}/evil.html`,
      mode: 'best',
    });
    // Either it succeeded with a sanitized name, or the honest 503.
    if (r.body.ok) {
      const files = (r.body.data as { files: { name: string }[] }).files;
      for (const f of files) {
        expect(f.name).not.toMatch(/[\\/]/);
        expect(f.name).not.toMatch(/\.\./);
        // eslint-disable-next-line no-control-regex -- asserting control chars are stripped
        expect(f.name).not.toMatch(/[\u0000-\u001f]/);
      }
    } else {
      expect(['tool-unavailable', 'unsupported-site', 'tool-failed']).toContain(r.body.error?.code);
    }
  });
});

/* ------------------------------------------------------------------ */
/* 14.4: downloader rate limit distinct from general 429              */
/* ------------------------------------------------------------------ */

describe('downloader: dedicated rate limit (14.4)', () => {
  it('excess requests within the window get rate-limited (distinct code)', async () => {
    const tight = await startEngine({
      downloaderRateLimit: 2,
      downloaderRateWindowSeconds: 60,
    });
    try {
      // Two allowed, third rate-limited. Use a blocked-host URL so no
      // outbound request happens while still consuming limiter slots —
      // the metadata route rate-limits BEFORE validation? No: rate
      // limit FIRST is the design; blocked-host errors also consume a
      // slot. Fire 3 requests; first two any outcome, third must be
      // rate-limited (or blocked-host if slots were consumed by prior
      // tests in-process — per-engine limiter, fresh here).
      const results: Array<{ status: number; code: string }> = [];
      for (let i = 0; i < 4; i += 1) {
        const r = await postJson(`${tight.url}/downloader/metadata`, {
          url: 'http://192.168.1.1/x',
        });
        results.push({ status: r.status, code: r.body.error?.code ?? '' });
      }
      const limited = results.filter((r) => r.code === 'rate-limited');
      expect(limited.length).toBeGreaterThan(0);
      // distinct from the general 429 (engine-busy): none of the
      // responses is engine-busy, and the rate-limited ones say so.
      const busy = results.filter((r) => r.code === 'engine-busy');
      expect(busy.length).toBe(0);
      // HTTP status is 429 but the CODE is rate-limited — the client
      // distinguishes them (distinct error copy).
      for (const l of limited) expect(l.status).toBe(429);
    } finally {
      await tight.close();
    }
  });
});

/* ------------------------------------------------------------------ */
/* 14.1: functional happy paths (real yt-dlp, 503 degradation on CI)   */
/* ------------------------------------------------------------------ */

describe('downloader: functional (14.1)', () => {
  it('metadata preview returns title + formats before download', async () => {
    const r = await postJson(`${engine.url}/downloader/metadata`, {
      url: `${mock.url}/video.html`,
    });
    if (r.status === 503) {
      expect(r.body.error?.code).toBe('tool-unavailable'); // honest CI degradation
      return;
    }
    expect(r.status).toBe(200);
    const data = r.body.data as {
      isPlaylist: boolean;
      item: { title: string; formats: { formatId: string }[]; extractor: string | null };
      entries: unknown[];
    };
    expect(data.isPlaylist).toBe(false);
    expect(data.item.title).toMatch(/^Cool Video( \(1\))?$/); // sanitized title
    expect(data.item.formats.length).toBeGreaterThan(0);
    expect(data.entries).toEqual([]);
  });

  it('playlist metadata returns per-item entries', async () => {
    const r = await postJson(`${engine.url}/downloader/metadata`, { url: `${mock.url}/two.html` });
    if (r.status === 503) {
      expect(r.body.error?.code).toBe('tool-unavailable');
      return;
    }
    expect(r.status).toBe(200);
    const data = r.body.data as { isPlaylist: boolean; entries: { itemId: string }[] };
    expect(data.isPlaylist).toBe(true);
    expect(data.entries.length).toBe(2);
  });

  it('download best produces a real mp4 (mock origin)', async () => {
    const r = await postJson(`${engine.url}/downloader/download`, {
      url: `${mock.url}/video.html`,
      mode: 'best',
    });
    if (r.status === 503) {
      expect(r.body.error?.code).toBe('tool-unavailable');
      return;
    }
    expect(r.status).toBe(200);
    const data = r.body.data as {
      files: { name: string; ext: string; data: string }[];
      skipped: number;
    };
    expect(data.files.length).toBeGreaterThan(0);
    const f = data.files[0];
    if (f === undefined) throw new Error('no file');
    expect(f.ext).toBe('mp4');
    expect(f.data.length).toBeGreaterThan(1000); // non-zero real bytes
    // mp4 magic bytes (ftyp box at offset 4)
    const head = Buffer.from(f.data, 'base64').subarray(4, 8).toString('latin1');
    expect(head).toBe('ftyp');
  });

  it('audio extraction produces an mp3', async () => {
    const r = await postJson(`${engine.url}/downloader/download`, {
      url: `${mock.url}/video.html`,
      mode: 'audio',
      audioFormat: 'mp3',
    });
    if (r.status === 503) {
      expect(r.body.error?.code).toBe('tool-unavailable');
      return;
    }
    if (r.body.ok) {
      const data = r.body.data as { files: { ext: string; data: string }[] };
      expect(data.files.length).toBeGreaterThan(0);
      const f = data.files[0];
      if (f === undefined) throw new Error('no file');
      expect(f.ext).toBe('mp3');
      const head = Buffer.from(f.data, 'base64').subarray(0, 3).toString('latin1');
      expect(head).toBe('ID3'); // or mp3 frame sync — ID3 common with yt-dlp
    } else {
      // ffmpeg missing for -x is surfaced honestly
      expect(['tool-unavailable', 'tool-failed']).toContain(r.body.error?.code);
    }
  });

  it('subtitle download where available (.srt via <track>)', async () => {
    const r = await postJson(`${engine.url}/downloader/download`, {
      url: `${mock.url}/subs.html`,
      mode: 'best',
      subtitleLangs: ['en'],
    });
    if (r.status === 503) {
      expect(r.body.error?.code).toBe('tool-unavailable');
      return;
    }
    expect(r.status).toBe(200);
    const data = r.body.data as { files: { name: string; ext: string }[] };
    const srt = data.files.find((f) => f.name.endsWith('.srt'));
    expect(srt).toBeDefined();
  });

  it('playlist item selection downloads only the requested item', async () => {
    const hitsBefore = mock.hits().length;
    const r = await postJson(`${engine.url}/downloader/download`, {
      url: `${mock.url}/two.html`,
      mode: 'best',
      items: [2],
    });
    if (r.status === 503) {
      expect(r.body.error?.code).toBe('tool-unavailable');
      return;
    }
    expect(r.status).toBe(200);
    const data = r.body.data as { files: { name: string }[] };
    expect(data.files.length).toBe(1);
    // item 2 is /media/sample2.mp4 — present in the hit log
    const newHits = mock.hits().slice(hitsBefore);
    expect(newHits.some((h) => h.includes('sample2'))).toBe(true);
    expect(newHits.some((h) => h === 'GET /media/sample.mp4')).toBe(false);
  });

  it('malformed input: garbage URL → invalid-option, empty → invalid-option', async () => {
    // 'not-a-url' fails URL parsing itself → invalid-option (400)
    const r1 = await postJson(`${engine.url}/downloader/metadata`, { url: 'not-a-url' });
    expect(r1.status).toBe(400);
    expect(r1.body.error?.code).toBe('invalid-option');
    const r2 = await postJson(`${engine.url}/downloader/metadata`, { url: '' });
    expect(r2.status).toBe(400);
    expect(r2.body.error?.code).toBe('invalid-option');
    const r3 = await postJson(`${engine.url}/downloader/download`, {});
    expect(r3.status).toBe(400);
    expect(r3.body.error?.code).toBe('invalid-option');
    // A well-formed URL with an unresolvable host → unsupported-site
    const r4 = await postJson(`${engine.url}/downloader/metadata`, {
      url: 'http://this-host-does-not-exist-zqx.example/',
    });
    expect(r4.status).toBe(422);
    expect(r4.body.error?.code).toBe('unsupported-site');
  });
});

/* ------------------------------------------------------------------ */
/* 5.6: URLs never logged                                              */
/* ------------------------------------------------------------------ */

describe('downloader: URL privacy (5.6)', () => {
  it('hostile URL never appears in the engine response or error copy', async () => {
    const weird = `http://192.168.1.1/secret-${String(Date.now())}`;
    const r = await postJson(`${engine.url}/downloader/metadata`, { url: weird });
    const raw = JSON.stringify(r.body);
    expect(raw).not.toContain('secret-');
  });
});
