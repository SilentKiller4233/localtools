/**
 * Subprocess runner + timeouts (PROJECT_SPEC Section 5.3).
 *
 * THE RULE (the single most important rule in the spec): every native
 * tool invocation uses spawn with an argument ARRAY — never a shell
 * string. `shell: false` is hardcoded; no code path in the engine builds
 * a command string. Options never flow into a shell.
 *
 * Kill discipline per 5.3: hard wall-clock timeout; SIGTERM first, then
 * SIGKILL after a 5-second grace period.
 */

import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { execFile } from 'node:child_process';

/** Never buffer more than this from a subprocess's stdout/stderr. */
const MAX_CAPTURED_CHARS = 64 * 1024;

export interface SubprocessResult {
  code: number | null;
  stdout: string;
  stderr: string;
  /** True when the process was killed by the timeout discipline. */
  timedOut: boolean;
  /** True when the executable itself could not be spawned (ENOENT). */
  spawnFailed: boolean;
}

export interface RunSubprocessOptions {
  timeoutMs: number;
  /** Directory the subprocess runs in (per-request temp dir). */
  cwd?: string;
  /** Extra env (merged over process.env; never unset PATH). */
  env?: Record<string, string>;
}

/**
 * Run a native tool. Argument array only; `shell` is always false.
 * Resolves (never rejects) with the full result — callers decide policy.
 */
export function runSubprocess(
  exe: string,
  args: readonly string[],
  opts: RunSubprocessOptions,
): Promise<SubprocessResult> {
  // Defense in depth (5.3): NUL bytes can never appear in a valid argv
  // entry — reject before spawning rather than trusting every caller.
  if (exe.includes('\0') || args.some((a) => a.includes('\0'))) {
    return Promise.resolve({
      code: null,
      stdout: '',
      stderr: '',
      timedOut: false,
      spawnFailed: true,
    });
  }

  return new Promise((resolve) => {
    // Section 5.3: execFile/spawn with argument arrays ONLY.
    const child: ChildProcess = spawn(exe, args, {
      shell: false,
      cwd: opts.cwd,
      env: opts.env === undefined ? process.env : { ...process.env, ...opts.env },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let captured = 0;
    let timedOut = false;
    let settled = false;

    const feed = (chunk: Buffer, sink: 'out' | 'err'): void => {
      captured += chunk.byteLength;
      if (captured > MAX_CAPTURED_CHARS) return; // hard cap
      const text = chunk.toString('utf8');
      if (sink === 'out') stdout += text;
      else stderr += text;
    };
    if (child.stdout !== null)
      child.stdout.on('data', (c: Buffer) => {
        feed(c, 'out');
      });
    if (child.stderr !== null)
      child.stderr.on('data', (c: Buffer) => {
        feed(c, 'err');
      });

    const killTimer = setTimeout(() => {
      timedOut = true;
      // Section 5.3: SIGTERM, then SIGKILL after grace.
      killTree(child, 'SIGTERM');
      setTimeout(() => {
        killTree(child, 'SIGKILL');
      }, 5000).unref();
    }, opts.timeoutMs);
    killTimer.unref();

    const settle = (result: Omit<SubprocessResult, 'timedOut' | 'spawnFailed'>): void => {
      if (settled) return;
      settled = true;
      clearTimeout(killTimer);
      resolve({ ...result, timedOut, spawnFailed: false });
    };

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(killTimer);
      const enoent =
        (err as NodeJS.ErrnoException).code === 'ENOENT' || err.message.includes('ENOENT');
      resolve({ code: null, stdout, stderr, timedOut: false, spawnFailed: enoent });
    });
    child.on('close', (code) => {
      settle({ code, stdout, stderr });
    });
  });
}

/**
 * Kill a subprocess tree. On Windows, child.kill() only terminates the
 * direct process and soffice spawns children — use taskkill /T. On POSIX,
 * SIGTERM/SIGKILL on the direct child (process groups are the container's
 * job, not ours — we never spawn shells).
 */
function killTree(child: ChildProcess, signal: 'SIGTERM' | 'SIGKILL'): void {
  const pid = child.pid;
  try {
    child.kill(signal);
  } catch {
    // process may already be gone
  }
  if (process.platform === 'win32' && pid !== undefined) {
    // /T kills the tree (soffice spawns children); /F forces on the SIGKILL
    // pass. execFile + argument array — the same discipline as everything
    // else in this module.
    const force = signal === 'SIGKILL' ? ['/F'] : [];
    execFile('taskkill', ['/pid', String(pid), '/T', ...force], { windowsHide: true }, () => {});
  }
}
