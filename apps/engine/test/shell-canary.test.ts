/**
 * Section 14.4 / 5.3 shell-discipline canary: static source contract that
 * the engine NEVER spawns a subprocess through a shell string.
 *
 * Phase 13 acceptance (PROJECT_SPEC Section 15): "the shell-string-subprocess
 * canary test (14.4) verified once manually then reverted" — proven live by
 * flipping `shell:false` → `shell:true` in subprocess.ts and watching this
 * test fail (SHELL_CANARY_FAIL: subprocess.ts: shell:true), then reverting
 * (evidence logged in TESTS.md).
 *
 * Why this exists on top of the functional security tests
 * (security.test.ts hostile-filename row): those prove hostile INPUT can't
 * reach argv (fresh internal names, zod enums) — they pass even under a
 * shell because injection data never gets that far. This canary is the
 * other half: if a future refactor ever turns a spawn into a shell string,
 * the build fails here regardless of input handling.
 *
 * Scope: child_process ONLY — the `exec` name is also String/RegExp's
 * method (ssrf-guard.ts uses RegExp.exec on IPs) and `spawn` appears in
 * comments/property names (tool-paths.ts). Import-aware = no false
 * positives on either.
 */

import { describe, expect, it } from 'vitest';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';

const here = fileURLToPath(new URL('.', import.meta.url));
const srcDir = resolve(here, '../src');

async function listTsFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await listTsFiles(p)));
    else if (e.name.endsWith('.ts')) out.push(p);
  }
  return out;
}

/** Does this file import from node:child_process / child_process? */
function importsChildProcess(src: string): boolean {
  return (
    /from\s+['"](?:node:)?child_process['"]/.test(src) ||
    /require\(['"](?:node:)?child_process['"]\)/.test(src)
  );
}

describe('shell-string subprocess canary (14.4 / 5.3)', () => {
  it('no engine source file spawns through a shell', async () => {
    const files = await listTsFiles(srcDir);
    expect(files.length).toBeGreaterThan(0);
    const offenders: string[] = [];

    for (const file of files) {
      const src = await readFile(file, 'utf8');
      if (!importsChildProcess(src)) continue; // not a subprocess module
      const rel = file.slice(srcDir.length + 1);

      // 1. Any explicit opt-in to a shell is a violation.
      if (/\bshell\s*:\s*true\b/.test(src)) offenders.push(`${rel}: shell:true`);

      // 2. child_process.exec / execSync are ALWAYS shell strings — banned.
      //    (Import-aware: only fires on files that actually import the
      //    module; RegExp.exec elsewhere is not this.)
      if (/\bexec(?:Sync)?\s*\(/.test(src))
        offenders.push(`${rel}: child_process.exec (always a shell)`);

      // 3. spawn/spawnSync without an explicit shell:false somewhere in the
      //    file — every child_process-importing module in this codebase has
      //    exactly one runner with hardcoded shell:false (subprocess.ts,
      //    ytdlp.ts). A spawn call that forgot it fails here.
      const spawnSites = src.match(/\bspawn(?:Sync)?\s*\(/g);
      if (spawnSites !== null && !/\bshell\s*:\s*false\b/.test(src)) {
        offenders.push(`${rel}: spawn call(s) without an explicit shell:false`);
      }
    }

    if (offenders.length > 0) {
      throw new Error(
        `SHELL_CANARY_FAIL: shell-string subprocess found —\n  ${offenders.join('\n  ')}`,
      );
    }
  });

  it('the two subprocess runners hardcode shell:false', async () => {
    const subprocess = await readFile(resolve(srcDir, 'subprocess.ts'), 'utf8');
    const ytdlp = await readFile(resolve(srcDir, 'downloader/ytdlp.ts'), 'utf8');
    expect(subprocess).toMatch(/\bshell\s*:\s*false\b/);
    expect(ytdlp).toMatch(/\bshell\s*:\s*false\b/);
  });
});
