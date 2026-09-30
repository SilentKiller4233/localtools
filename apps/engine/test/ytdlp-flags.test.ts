/**
 * yt-dlp sandbox-flag presence assertion (external review H5).
 *
 * YTDLP_SANDBOX_ARGS was verified by hand against one installed
 * version's --help (2026.08.19, D-025). A future yt-dlp release could
 * rename or change the semantics of any of these flags without anyone
 * re-verifying — the Docker install is now version-pinned to match the
 * desktop manifest, and this test re-proves the flag set against the
 * binary that is ACTUALLY installed on this host so a silent flag
 * rename fails the suite instead of silently un-sandboxing the
 * downloader.
 *
 * Runs the real binary's --help only (no network, no extraction).
 * Skipped honestly (not failed) when yt-dlp is absent — the 503
 * degradation contract (c88d80d) applies to missing binaries, not to
 * wrong ones: if the binary EXISTS but no longer understands a sandbox
 * flag, that's a FAIL, because the guard's premise died.
 */

import { describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { toolPaths } from '../src/tool-paths.js';

/** True when yt-dlp is resolvable on this host. */
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

describe('yt-dlp sandbox flags still exist (review H5)', () => {
  it('every YTDLP_SANDBOX_ARGS flag appears in the installed --help', async () => {
    const { YTDLP_SANDBOX_ARGS } = await import('../src/downloader/ytdlp.js');
    if (!(await ytdlpAvailable())) {
      console.warn('SKIPPED (honest 503 contract): no yt-dlp on this host');
      return;
    }
    const paths = await toolPaths();
    const help = await new Promise<string>((resolve, reject) => {
      const child = spawn(paths.ytdlp, ['--help'], { shell: false, windowsHide: true });
      let out = '';
      child.stdout.on('data', (c: Buffer) => {
        out += c.toString('utf8');
      });
      child.stderr.on('data', (c: Buffer) => {
        out += c.toString('utf8');
      });
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) resolve(out);
        else reject(new Error(`--help exited ${String(code)}`));
      });
    });
    // Every sandbox flag must still be recognized. Flags with values
    // (e.g. --socket-timeout N) appear in help as "--flag DESC" — match
    // the flag token itself.
    const missing: string[] = [];
    for (const arg of YTDLP_SANDBOX_ARGS) {
      if (!arg.startsWith('--')) continue;
      if (!help.includes(arg)) missing.push(arg);
    }
    expect(
      missing,
      `installed yt-dlp no longer documents these sandbox flags — update YTDLP_SANDBOX_ARGS after re-verifying semantics: ${missing.join(', ')}`,
    ).toEqual([]);
  });
});
