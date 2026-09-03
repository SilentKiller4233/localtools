/**
 * Per-request temp directory lifecycle (PROJECT_SPEC Section 5.2).
 *
 * Every request gets a fresh random subdirectory under the engine temp
 * root. It is deleted in a `finally` block by the route, AND a sweeper
 * safety net runs every 60s removing directories older than 5 minutes —
 * so even a hard-crashed request cannot leak files beyond that window.
 */

import { mkdtemp, mkdir, rm, writeFile, stat, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const SWEEP_INTERVAL_MS = 60_000;
const SWEEP_MAX_AGE_MS = 5 * 60_000; // 5-minute sweeper safety net (Section 5.2)

export class TempDir {
  private constructor(public readonly path: string) {}

  static async create(): Promise<TempDir> {
    const root = join(tmpdir(), 'localtools-engine');
    await mkdir(root, { recursive: true });
    // mkdtemp gives a unique, unpredictable directory per request.
    const path = await mkdtemp(join(root, 'req-'));
    return new TempDir(path);
  }

  /** Write bytes into the temp dir under a fresh internal name. */
  async write(name: string, bytes: Uint8Array): Promise<string> {
    const target = join(this.path, name);
    await writeFile(target, bytes);
    return target;
  }

  async remove(): Promise<void> {
    await rm(this.path, { recursive: true, force: true });
  }
}

let sweeperStarted = false;

/** Start the background sweeper (idempotent; one interval per process). */
export function startTempSweeper(): void {
  if (sweeperStarted) return;
  sweeperStarted = true;
  const root = join(tmpdir(), 'localtools-engine');
  const sweep = (): void => {
    void (async () => {
      try {
        const entries = await readdir(root);
        const now = Date.now();
        for (const entry of entries) {
          const p = join(root, entry);
          try {
            const s = await stat(p);
            if (now - s.mtimeMs > SWEEP_MAX_AGE_MS) {
              await rm(p, { recursive: true, force: true });
            }
          } catch {
            // raced with a request's own cleanup — fine
          }
        }
      } catch {
        // root missing — nothing to sweep
      }
    })();
  };
  sweep(); // run once at startup, then on the interval
  const timer = setInterval(sweep, SWEEP_INTERVAL_MS);
  timer.unref();
}

/** Unique id for the request dir log line (Section 5.6: no names). */
export function requestId(): string {
  return randomUUID().slice(0, 8);
}
