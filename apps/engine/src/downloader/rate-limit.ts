/**
 * Downloader-specific rate limiter (PROJECT_SPEC Section 5.8).
 *
 * A SEPARATE, stricter limit from the general engine 429: the downloader
 * is the most bandwidth-intensive operation, so it gets its own per-client
 * window (e.g. 6 downloads / 5 minutes). Exhausting it answers
 * `rate-limited` (429 with a distinct code) — never conflated with the
 * general engine-busy cap.
 *
 * Keying: per client IP. On loopback all clients share one key — the
 * honest, conservative posture for a local engine (Section 5.1: the
 * engine is not multi-tenant). When exposed, remote peer IPs are used.
 */

import { EngineToolError } from '../errors.js';

interface WindowState {
  hits: number[];
}

export class DownloaderRateLimiter {
  private readonly windows = new Map<string, WindowState>();
  private readonly max: number;
  private readonly windowMs: number;

  constructor(max: number, windowSeconds: number) {
    this.max = max;
    this.windowMs = windowSeconds * 1000;
  }

  /** Client key from a request (peer IP; loopback clients share one). */
  keyFor(peerIp: string): string {
    return peerIp;
  }

  /**
   * Consume one slot. Returns true when allowed. Expired hits are pruned
   * opportunistically; a background sweep is unnecessary because a window
   * entry with zero live hits is deleted on prune.
   */
  allow(key: string): boolean {
    const now = Date.now();
    const state = this.windows.get(key) ?? { hits: [] };
    state.hits = state.hits.filter((t) => now - t < this.windowMs);
    if (state.hits.length >= this.max) {
      this.windows.set(key, state);
      return false;
    }
    state.hits.push(now);
    if (state.hits.length === 1) this.windows.set(key, state);
    else this.windows.set(key, state);
    return true;
  }

  /** Test seam: reset all windows. */
  reset(): void {
    this.windows.clear();
  }

  /** Test seam: how many live hits a key has. */
  current(key: string): number {
    const now = Date.now();
    const state = this.windows.get(key);
    if (state === undefined) return 0;
    return state.hits.filter((t) => now - t < this.windowMs).length;
  }
}

/** Thrown when the downloader window is exhausted → rate-limited (429). */
export class DownloaderRateLimitError extends EngineToolError {
  constructor() {
    super('rate-limited', 'Too many downloads in a short time — wait a moment and try again.');
    this.name = 'DownloaderRateLimitError';
  }
}
