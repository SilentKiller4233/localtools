/**
 * Subprocess concurrency limiter (PROJECT_SPEC Section 5.2/13).
 *
 * Engine-side capped subprocess concurrency: once
 * maxConcurrentSubprocesses tools are running, further requests get an
 * immediate HTTP 429 rather than queueing unboundedly (the client shows
 * a friendly "engine is busy" message).
 */

/** Error signaling "engine busy" → HTTP 429. */
export class ConcurrencyLimitError extends Error {
  constructor() {
    super('The processing engine is busy — try again in a moment.');
    this.name = 'ConcurrencyLimitError';
  }
}

export class SubprocessLimiter {
  private running = 0;

  constructor(private readonly max: number) {}

  get current(): number {
    return this.running;
  }

  /**
   * Run fn under the limiter. Rejects immediately with
   * ConcurrencyLimitError when the cap is already reached (429 upstream).
   */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.running >= this.max) throw new ConcurrencyLimitError();
    this.running += 1;
    try {
      return await fn();
    } finally {
      this.running -= 1;
    }
  }
}
