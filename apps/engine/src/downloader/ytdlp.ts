/**
 * yt-dlp subprocess wrapper (PROJECT_SPEC Sections 3.2 Group C, 5.3, 5.8).
 *
 * Every invocation goes through `baseArgs()` — the sandboxed flag set:
 *  - plugin/scripting hooks disabled (--no-plugin-dirs,
 *    --no-remote-components, --no-exec, --no-config-locations)
 *  - no config files, no cache, no update checks
 *  - socket timeout + the validating proxy (--proxy)
 *  - extractor set restricted (production: all named extractors, generic
 *    DISABLED — the no-open-proxy rule; tests add generic+html5 so the
 *    local mock server is "supported")
 *  - filenames sanitized by yt-dlp itself (--restrict-filenames
 *    --windows-filenames) AND by the engine before anything is returned
 *
 * Argument arrays only (Section 5.3) — no shell, no string building.
 * All output is size-capped and time-capped: a watchdog aborts the
 * subprocess when the temp output dir exceeds the configured byte cap
 * (Section 5.8 hard output-size cap DURING download), and the whole
 * operation dies on the wall-clock timeout (SIGTERM→SIGKILL, taskkill /T
 * on Windows).
 */

import { spawn, execFile } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { stat, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { platform } from 'node:os';

export interface YtDlpPaths {
  ytdlp: string;
  /** ffmpeg dir for -x/--embed operations; undefined disables them. */
  ffmpegDir: string | undefined;
}

/** Resolve the yt-dlp binary from tool-paths.ts. */
export async function ytdlpPaths(): Promise<YtDlpPaths> {
  const { toolPaths } = await import('../tool-paths.js');
  const paths = await toolPaths();
  const ffmpegDir = dirnameOf(paths.ffmpeg.ffmpeg);
  return { ytdlp: paths.ytdlp, ffmpegDir };
}

function dirnameOf(p: string): string | undefined {
  const idx = p.replace(/\\/g, '/').lastIndexOf('/');
  return idx === -1 ? undefined : p.slice(0, idx);
}

/* ------------------------------------------------------------------ */
/* Run discipline                                                      */
/* ------------------------------------------------------------------ */

const MAX_CAPTURED_CHARS = 256 * 1024; // metadata JSON can be large

export interface YtDlpRunResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  spawnFailed: boolean;
  /** True when the size watchdog killed the run. */
  sizeAborted: boolean;
}

export interface YtDlpRunOptions {
  timeoutMs: number;
  cwd?: string;
  /** Output dir watched by the size watchdog (download runs). */
  watchDir?: string;
  /** Cap applied to watchDir. */
  maxBytes?: number;
  /** Poll interval for the watchdog (ms). */
  watchIntervalMs?: number;
}

/**
 * Run yt-dlp. Resolves (never rejects) — callers decide policy, same
 * contract as subprocess.ts. Kill discipline: SIGTERM → 5s → SIGKILL
 * (+ taskkill /T on Windows); the size watchdog uses the same path.
 */
export function runYtDlp(
  exe: string,
  args: readonly string[],
  opts: YtDlpRunOptions,
): Promise<YtDlpRunResult> {
  if (exe.includes('\0') || args.some((a) => a.includes('\0'))) {
    return Promise.resolve({
      code: null,
      stdout: '',
      stderr: '',
      timedOut: false,
      spawnFailed: true,
      sizeAborted: false,
    });
  }

  return new Promise((resolve) => {
    const child = spawn(exe, args, {
      shell: false,
      cwd: opts.cwd,
      env: process.env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let captured = 0;
    let timedOut = false;
    let sizeAborted = false;
    let settled = false;

    const feed = (chunk: Buffer, sink: 'out' | 'err'): void => {
      captured += chunk.byteLength;
      if (captured > MAX_CAPTURED_CHARS) return;
      const text = chunk.toString('utf8');
      if (sink === 'out') stdout += text;
      else stderr += text;
    };
    child.stdout.on('data', (c: Buffer) => {
      feed(c, 'out');
    });
    child.stderr.on('data', (c: Buffer) => {
      feed(c, 'err');
    });

    // Wall-clock timeout (5.8): SIGTERM, then SIGKILL after grace.
    const killTimer = setTimeout(() => {
      timedOut = true;
      killTree(child, 'SIGTERM');
      setTimeout(() => {
        killTree(child, 'SIGKILL');
      }, 5000).unref();
    }, opts.timeoutMs);
    killTimer.unref();

    // Size watchdog (5.8): poll the output dir; abort mid-download when
    // the total bytes exceed the cap. Polling is cheap and robust across
    // platforms (no file-handle games with files yt-dlp is writing).
    let watchTimer: NodeJS.Timeout | undefined;
    const watchDir = opts.watchDir;
    const maxBytes = opts.maxBytes;
    if (watchDir !== undefined && maxBytes !== undefined) {
      watchTimer = setInterval(() => {
        void (async () => {
          try {
            let total = 0;
            const entries = await readdir(watchDir);
            for (const e of entries) {
              const s = await stat(join(watchDir, e));
              total += s.size;
            }
            if (total > maxBytes) {
              sizeAborted = true;
              killTree(child, 'SIGTERM');
              setTimeout(() => {
                killTree(child, 'SIGKILL');
              }, 5000).unref();
            }
          } catch {
            // dir vanished (cleanup race) — nothing to do
          }
        })();
      }, opts.watchIntervalMs ?? 1000);
      watchTimer.unref();
    }

    const settle = (
      result: Omit<YtDlpRunResult, 'timedOut' | 'spawnFailed' | 'sizeAborted'>,
    ): void => {
      if (settled) return;
      settled = true;
      clearTimeout(killTimer);
      if (watchTimer !== undefined) clearInterval(watchTimer);
      resolve({ ...result, timedOut, spawnFailed: false, sizeAborted });
    };

    child.on('error', (err: NodeJS.ErrnoException) => {
      if (settled) return;
      settled = true;
      clearTimeout(killTimer);
      if (watchTimer !== undefined) clearInterval(watchTimer);
      const enoent = err.code === 'ENOENT' || err.message.includes('ENOENT');
      resolve({
        code: null,
        stdout,
        stderr,
        timedOut: false,
        spawnFailed: enoent,
        sizeAborted: false,
      });
    });
    child.on('close', (code) => {
      settle({ code, stdout, stderr });
    });
  });
}

/** Kill tree — same discipline as subprocess.ts (taskkill /T on Windows). */
function killTree(child: ChildProcess, signal: 'SIGTERM' | 'SIGKILL'): void {
  const pid = child.pid;
  try {
    child.kill(signal);
  } catch {
    // already gone
  }
  if (platform() === 'win32' && pid !== undefined) {
    const force = signal === 'SIGKILL' ? ['/F'] : [];
    execFile('taskkill', ['/pid', String(pid), '/T', ...force], { windowsHide: true }, () => {});
  }
}

/* ------------------------------------------------------------------ */
/* Sandbox args (verified against yt-dlp 2026.08.19 --help)             */
/* ------------------------------------------------------------------ */

/**
 * The sandbox flag set applied to EVERY invocation (Section 5.8
 * yt-dlp sandboxing + 5.3 subprocess discipline).
 *
 * Verified flags (yt-dlp 2026.08.19 — the pinned version in BOTH the
 * desktop manifest and the Docker image; the flag-presence assertion in
 * test/ytdlp-flags.test.ts re-proves them against the INSTALLED binary
 * so a future release that renames a flag fails the suite instead of
 * silently un-sandboxing the downloader):
 *  --no-config-locations  don't load any user config files
 *  --no-plugin-dirs       clear plugin search dirs incl. defaults
 *  --no-remote-components disallow fetching any remote components
 *  --no-exec              strip any --exec hooks
 *  --no-cache-dir         no filesystem cache
 *  --no-progress          no progress bars in captured output
 *  --no-mtime             don't set file mtimes from remote
 *  --socket-timeout 30    hard per-connection timeout
 *  --restrict-filenames --windows-filenames  ASCII-safe output names
 */
export const YTDLP_SANDBOX_ARGS: readonly string[] = [
  '--no-config-locations',
  '--no-plugin-dirs',
  '--no-remote-components',
  '--no-exec',
  '--no-cache-dir',
  '--no-progress',
  '--no-mtime',
  '--restrict-filenames',
  '--windows-filenames',
  '--socket-timeout',
  '30',
];

/** Extractor policy: production set — everything EXCEPT generic. */
export const PRODUCTION_EXTRACTOR_ARGS: readonly string[] = ['--use-extractors', 'all,-generic'];

/** Test seam: extractor set that includes the mock target's extractors. */
export const TEST_EXTRACTOR_ARGS: readonly string[] = ['--use-extractors', 'generic,html5'];

export interface ArgBuilderOptions {
  proxyUrl: string;
  /** Extractor args (production or test). */
  extractorArgs: readonly string[];
  timeoutMs: number;
}

/** Build the shared base args for any run. */
export function baseArgs(o: ArgBuilderOptions): string[] {
  return [...YTDLP_SANDBOX_ARGS, '--proxy', o.proxyUrl, ...o.extractorArgs];
}

/* ------------------------------------------------------------------ */
/* Filename sanitization (5.8)                                          */
/* ------------------------------------------------------------------ */

/**
 * Sanitize remote metadata used as a filename (5.8): strip path
 * separators, control chars, null bytes; collapse traversal runs;
 * cap length. Applied IN ADDITION to yt-dlp's --restrict-filenames and
 * to the harness's own sanitizeName — never trust remote metadata.
 */
export function sanitizeRemoteName(name: string): string {
  const cleaned = name
    .replace(/\0/g, '') // null bytes
    .replace(/[\u0000-\u001f\u007f]/g, '') // eslint-disable-line no-control-regex
    .replace(/[\\/:*?"<>|]/g, '') // Windows + POSIX separators/reserved
    .replace(/\.{2,}/g, '.') // traversal runs
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '') // leading dots (hidden/traversal)
    .slice(0, 100);
  return cleaned.length > 0 ? cleaned : 'download';
}

/* ------------------------------------------------------------------ */
/* Metadata                                                             */
/* ------------------------------------------------------------------ */

/** Raw yt-dlp info shapes we consume. */
export interface YtDlpFormat {
  format_id?: string;
  ext?: string;
  vcodec?: string | null;
  acodec?: string | null;
  filesize?: number | null;
  filesize_approx?: number | null;
  format?: string;
  height?: number | null;
  abr?: number | null;
  tbr?: number | null;
}

export interface YtDlpInfo {
  _type?: string;
  id?: string;
  title?: string;
  uploader?: string | null;
  channel?: string | null;
  duration?: number | null;
  thumbnail?: string | null;
  is_live?: boolean | null;
  live_status?: string | null;
  extractor?: string | null;
  webpage_url?: string;
  formats?: YtDlpFormat[];
  entries?: YtDlpInfo[];
  subtitles?: Record<string, unknown> | null;
}

/** Readable label for a format row. */
export function formatLabel(f: YtDlpFormat): string {
  const h = f.height;
  const parts: string[] = [];
  if (typeof h === 'number' && h > 0) parts.push(`${String(h)}p`);
  else if (f.format !== undefined && f.format !== '') parts.push(f.format);
  else parts.push('video');
  if (f.acodec !== null && f.acodec !== undefined && f.acodec !== 'none') parts.push('+audio');
  if (f.tbr !== null && f.tbr !== undefined) {
    parts.push(`${String(Math.round(f.tbr))} kbps`);
  }
  return parts.join(' · ');
}
