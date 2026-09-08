/**
 * Section 14.4 Group C canary (Phase 8): grep-style proof that the
 * downloader is the ONLY code path that can issue outbound requests on
 * a user URL, and that it always does so through the validating proxy.
 *
 * These are static source-contract tests — they fail the build if
 * anyone adds a raw fetch of a user-supplied URL outside the guard
 * (the automated backup for the manual review noted in TESTS.md).
 */

import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const here = fileURLToPath(new URL('.', import.meta.url));
const srcDir = resolve(here, '../src');

describe('downloader outbound-request canary (14.4 / 5.8)', () => {
  it('no fetch()/axios/http.request of user URLs outside the downloader module', async () => {
    // Modules allowed to make outbound HTTP: the SSRF guard's proxy
    // (that IS the guard), and the pinned-model fetchers — speech/voices.ts
    // downloads ONLY hardcoded, SHA-256-pinned Hugging Face URLs from a
    // const table (D-030/D-031); the voice id is a zod enum key, never
    // user-controlled URL data. Nothing else may open sockets on request
    // data. The engine's other network surface is the Fastify listener
    // itself, which is loopback-bound by config (5.1, tested elsewhere).
    const allowed = ['ssrf-guard.ts', 'speech/voices.ts'];
    const { readdir } = await import('node:fs/promises');
    const check = async (dir: string): Promise<void> => {
      for (const e of await readdir(dir, { withFileTypes: true })) {
        const p = resolve(dir, e.name);
        if (e.isDirectory()) {
          await check(p);
          continue;
        }
        if (!e.name.endsWith('.ts')) continue;
        const src = await readFile(p, 'utf8');
        if (allowed.some((a) => p.replace(/\\/g, '/').includes(a))) continue;
        // Any direct outbound primitive in engine source outside the
        // guard is a build failure.
        expect(
          /\bfetch\s*\(\s*[^)]*(?:url|Url|URL|target|href|link)/.test(src) &&
            !p.replace(/\\/g, '/').includes('downloader'),
          `${p} must not fetch user URLs directly`,
        ).toBe(false);
        expect(
          /http\.request\s*\(/.test(src) && !p.replace(/\\/g, '/').includes('downloader'),
          `${p} must not use http.request on user URLs`,
        ).toBe(false);
      }
    };
    await check(srcDir);
  });

  it('every yt-dlp invocation routes through --proxy (no direct egress)', async () => {
    const ytdlpSrc = await readFile(resolve(srcDir, 'downloader', 'ytdlp.ts'), 'utf8');
    const guardSrc = await readFile(resolve(srcDir, 'downloader', 'ssrf-guard.ts'), 'utf8');
    // The sandbox arg builder is the single place --proxy gets added.
    expect(ytdlpSrc).toContain("'--proxy'");
    // And the guard is the only supplier of proxy URLs.
    expect(guardSrc).toContain('startValidatingProxy');
  });

  it('speech/voices.ts fetches ONLY pinned HF URLs (never request data)', async () => {
    // The allowlist entry above is only safe while every URL handed to
    // fetch() is built from the const HF_BASE + the pinned VOICES table —
    // voice ids are zod enum keys, so no user URL can ever reach a socket.
    const voicesSrc = await readFile(resolve(srcDir, 'speech', 'voices.ts'), 'utf8');
    // The single fetch() call lives inside fetchVerified; every caller
    // passes a template literal rooted at the pinned HF_BASE.
    expect(voicesSrc).toContain('const HF_BASE =');
    const fetchCalls = [...voicesSrc.matchAll(/\bfetch\s*\(/g)].length;
    expect(fetchCalls).toBe(1);
    const callerUrls = [...voicesSrc.matchAll(/fetchVerified\(\s*`([^`]+)`/g)].map((m) => m[1]);
    expect(callerUrls.length).toBe(2);
    for (const u of callerUrls) {
      expect(u?.startsWith('${HF_BASE}/')).toBe(true);
    }
  });
});
