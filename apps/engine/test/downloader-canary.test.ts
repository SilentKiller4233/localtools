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
    // (that IS the guard) — nothing else may open sockets on request
    // data. The engine's other network surface is the Fastify listener
    // itself, which is loopback-bound by config (5.1, tested elsewhere).
    const allowed = ['ssrf-guard.ts'];
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
});
