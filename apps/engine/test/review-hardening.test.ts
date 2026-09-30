/**
 * External-review hardening tests (Claude pre-release review, C1/C2).
 *
 * C1 (DNS-rebinding pinning) was verified clean by reading the code —
 * both proxy paths connect to the pinned validated IP literal, never a
 * re-resolved hostname. This file pins the CONNECT-path parse that was
 * broken alongside it: authority-form IPv6 targets were mangled by a
 * naive ':' split (legitimate IPv6 HTTPS sites failed; hostile literals
 * still failed closed — no bypass — but broken).
 *
 * C2 (mock-exemption backdoor): the LOCALTOOLS_DOWNLOADER_MOCK_TARGET
 * seam must be UNREACHABLE in any shipped artifact. The gate: all three
 * of NODE_ENV=test + TEST_MODE=true + MOCK_TARGET. Docker pins
 * NODE_ENV=production (Dockerfile); the desktop sidecar env_clear()s it
 * away; production `node dist/server.js` has it unset/production. The
 * static assertions below keep the shipped artifacts honest.
 */

import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const repoRoot = resolve(fileURLToPath(import.meta.url), '../../../..');

/* ------------------------------------------------------------------ */
/* CONNECT authority-form parsing (C1 companion fix)                   */
/* ------------------------------------------------------------------ */

describe('ssrf-guard: CONNECT target parsing (IPv6)', () => {
  it('parses plain host:port', async () => {
    const { parseConnectTarget } = await import('../src/downloader/ssrf-guard.js');
    expect(parseConnectTarget('example.com:443')).toEqual({
      hostname: 'example.com',
      port: 443,
    });
  });

  it('defaults the port to 443 when omitted', async () => {
    const { parseConnectTarget } = await import('../src/downloader/ssrf-guard.js');
    expect(parseConnectTarget('example.com')).toEqual({
      hostname: 'example.com',
      port: 443,
    });
  });

  it('parses bracketed IPv6 literals without mangling (the old split bug)', async () => {
    const { parseConnectTarget } = await import('../src/downloader/ssrf-guard.js');
    // The old code split on ':' → host "[2606" port "4700" — garbage.
    expect(parseConnectTarget('[2606:4700::1111]:443')).toEqual({
      hostname: '2606:4700::1111',
      port: 443,
    });
  });

  it('rejects empty and malformed targets (fails closed)', async () => {
    const { parseConnectTarget } = await import('../src/downloader/ssrf-guard.js');
    const bad = ['', ':443', ':::'];
    for (const raw of bad) {
      expect(() => parseConnectTarget(raw), `raw="${raw}"`).toThrow();
    }
  });
});

/* ------------------------------------------------------------------ */
/* C2: the mock seam is dead in any production-shaped environment     */
/* ------------------------------------------------------------------ */

/** POST /downloader/metadata helper. */
async function postMetadata(
  url: string,
  body: unknown,
): Promise<{ ok?: boolean; error?: { code: string } }> {
  const res = await fetch(`${url}/downloader/metadata`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return (await res.json()) as { ok?: boolean; error?: { code: string } };
}

describe('downloader seam gating (review C2)', () => {
  const saved = {
    nodeEnv: process.env['NODE_ENV'],
    testMode: process.env['LOCALTOOLS_DOWNLOADER_TEST_MODE'],
    mockTarget: process.env['LOCALTOOLS_DOWNLOADER_MOCK_TARGET'],
  };

  function restore() {
    for (const [k, v] of Object.entries(saved)) {
      const key =
        k === 'nodeEnv'
          ? 'NODE_ENV'
          : k === 'testMode'
            ? 'LOCALTOOLS_DOWNLOADER_TEST_MODE'
            : 'LOCALTOOLS_DOWNLOADER_MOCK_TARGET';
      if (v === undefined) Reflect.deleteProperty(process.env, key);
      else process.env[key] = v;
    }
  }

  it('NODE_ENV=production kills the seam even with both seam vars set', async () => {
    const { startEngine } = await import('./helpers.js');
    const { startMockTarget } = await import('./downloader-mock.js');

    const mock = await startMockTarget();
    try {
      // Hostile .env posture: both seam vars set — but production Node.
      process.env['LOCALTOOLS_DOWNLOADER_TEST_MODE'] = 'true';
      process.env['LOCALTOOLS_DOWNLOADER_MOCK_TARGET'] = `127.0.0.1:${String(mock.port)}`;
      process.env['NODE_ENV'] = 'production';

      const prodEngine = await startEngine({ downloaderRateLimit: 100 });
      try {
        const body = await postMetadata(prodEngine.url, {
          url: `http://127.0.0.1:${String(mock.port)}/video.html`,
        });
        // The seam is dead: loopback blocked exactly as production demands.
        expect(body.error?.code).toBe('blocked-host');
      } finally {
        await prodEngine.close();
      }
    } finally {
      restore();
      await mock.close();
    }
  });

  it('NODE_ENV unset (desktop sidecar env_clear posture) also kills the seam', async () => {
    const { startEngine } = await import('./helpers.js');
    const { startMockTarget } = await import('./downloader-mock.js');

    const mock = await startMockTarget();
    try {
      process.env['LOCALTOOLS_DOWNLOADER_TEST_MODE'] = 'true';
      process.env['LOCALTOOLS_DOWNLOADER_MOCK_TARGET'] = `127.0.0.1:${String(mock.port)}`;
      delete process.env['NODE_ENV'];

      const bareEngine = await startEngine({ downloaderRateLimit: 100 });
      try {
        const body = await postMetadata(bareEngine.url, {
          url: `http://127.0.0.1:${String(mock.port)}/video.html`,
        });
        expect(body.error?.code).toBe('blocked-host');
      } finally {
        await bareEngine.close();
      }
    } finally {
      restore();
      await mock.close();
    }
  });

  it('NODE_ENV=test + both vars set still opens the seam (proves the gate is the gate)', async () => {
    const { startEngine } = await import('./helpers.js');
    const { startMockTarget } = await import('./downloader-mock.js');

    const mock = await startMockTarget();
    try {
      process.env['NODE_ENV'] = 'test';
      process.env['LOCALTOOLS_DOWNLOADER_TEST_MODE'] = 'true';
      process.env['LOCALTOOLS_DOWNLOADER_MOCK_TARGET'] = `127.0.0.1:${String(mock.port)}`;

      const engine = await startEngine({ downloaderRateLimit: 100 });
      try {
        const body = await postMetadata(engine.url, {
          url: `http://127.0.0.1:${String(mock.port)}/video.html`,
        });
        // With the seam OPEN the exempted loopback target is never
        // blocked-host: ok (yt-dlp present) or tool-unavailable
        // (no yt-dlp on this host) — the c88d80d degradation contract.
        if (body.ok !== true) {
          expect(['tool-unavailable', 'unsupported-site']).toContain(body.error?.code);
        }
      } finally {
        await engine.close();
      }
    } finally {
      restore();
      await mock.close();
    }
  });
});

/* ------------------------------------------------------------------ */
/* C2 static: shipped artifacts never set or forward the seam vars     */
/* ------------------------------------------------------------------ */

describe('shipped artifacts never forward the mock seam (review C2)', () => {
  it('docker-compose.yml forwards only the allowlisted LOCALTOOLS_* vars', async () => {
    const compose = await readFile(resolve(repoRoot, 'docker-compose.yml'), 'utf8');
    // No compose-level passthrough of the seam vars (the environment:
    // block is an explicit allowlist — these greps prove the absence).
    expect(compose).not.toContain('LOCALTOOLS_DOWNLOADER_TEST_MODE');
    expect(compose).not.toContain('LOCALTOOLS_DOWNLOADER_MOCK_TARGET');
    // No catch-all passthrough either (${VAR} interpolation of these
    // names must not appear in ANY form).
    expect(compose).not.toMatch(/DOWNLOADER_(TEST_MODE|MOCK_TARGET)/);
  });

  it('engine.Dockerfile pins NODE_ENV=production and never sets the seam vars', async () => {
    const dockerfile = await readFile(resolve(repoRoot, 'docker/engine.Dockerfile'), 'utf8');
    expect(dockerfile).toMatch(/ENV NODE_ENV=production/);
    expect(dockerfile).not.toMatch(/DOWNLOADER_(TEST_MODE|MOCK_TARGET)/);
  });

  it('the desktop sidecar env allowlist never passes NODE_ENV or the seam vars', async () => {
    const sidecar = await readFile(
      resolve(repoRoot, 'apps/desktop/src-tauri/src/sidecar.rs'),
      'utf8',
    );
    // sidecar.rs env_clear()s then sets an explicit allowlist: PATH,
    // SYSTEMROOT, SYSTEMDRIVE, LOCALAPPDATA, TEMP/TMP + engine_env
    // (LOCALTOOLS_* tool paths/port). NODE_ENV must never appear as a
    // set var (the gate must see it unset), and the seam vars must not
    // be in the source at all.
    expect(sidecar).not.toMatch(/\.env\(\s*"NODE_ENV"/);
    expect(sidecar).not.toMatch(/DOWNLOADER_(TEST_MODE|MOCK_TARGET)/);
  });
});
