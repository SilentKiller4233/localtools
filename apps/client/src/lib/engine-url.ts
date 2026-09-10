/**
 * Engine base URL resolution (extracted in Phase 11 so the health poll
 * and the engine client share one source of truth).
 *
 * Desktop shell: the bridge reports the sidecar port (Phase 10) — the
 * shell injects window.__LOCALTOOLS_ENGINE_PORT__ before this module
 * loads (bridge.js), so resolution stays synchronous.
 * Docker/prod web: same origin behind the reverse proxy path; dev:
 * direct localhost. The client NEVER holds an auth token in persistent
 * storage (Section 5.1) — none is needed for loopback.
 *
 * globalThis (not window) so Node tests can exercise both paths.
 */

export function engineBaseUrl(): string {
  const g = globalThis as {
    __LOCALTOOLS__?: { invoke(c: string): Promise<unknown> };
    __LOCALTOOLS_ENGINE_PORT__?: number;
  };
  if (g.__LOCALTOOLS__ !== undefined) {
    const port = g.__LOCALTOOLS_ENGINE_PORT__;
    if (port !== undefined) return `http://127.0.0.1:${String(port)}`;
  }
  if (import.meta.env.DEV) return 'http://127.0.0.1:8787';
  return '/engine';
}
