/**
 * Engine health gating (Phase 11, spec line 495: "Health-check gating
 * with friendly language").
 *
 * Every Group B/C tool page asks the engine to do work. Before a run,
 * the page can check engine readiness with friendly copy instead of
 * discovering a dead engine only after a failed request:
 *
 * - In the desktop shell, `window.__LOCALTOOLS__` (Phase 10 bridge)
 *   exposes desktop_status {engineReady} + the engine://ready event —
 *   authoritative and synchronous to the shell's own spawn lifecycle.
 * - In a browser (dev/Docker), the client polls GET /healthz on the
 *   same base URL every engine call uses. Same-origin (Docker) or
 *   CORS-exact (dev localhost:5173 → engine 8787) — both configured in
 *   the engine's Section 5.1 CORS.
 *
 * Degradation is honest (Section 13): unreachable engine → friendly
 * "engine not running" copy with a Retry; the rest of the app stays
 * usable. Never a spinner that never resolves.
 */

import { engineBaseUrl } from './engine-url';

export type EngineHealth = 'checking' | 'ready' | 'unreachable';

export interface HealthCheckResult {
  state: EngineHealth;
  /** True when the shell reports the engine ready (desktop only). */
  fromShell: boolean;
}

/** One-shot probe: shell status first, then a /healthz fetch. */
export async function checkEngineHealth(): Promise<HealthCheckResult> {
  // Desktop shell: the bridge knows without a network round trip.
  const bridge = (globalThis as { __LOCALTOOLS__?: { invoke(c: string): Promise<unknown> } })
    .__LOCALTOOLS__;
  if (bridge !== undefined) {
    try {
      const status = (await bridge.invoke('desktop_status')) as { engineReady?: boolean };
      return { state: status.engineReady === true ? 'ready' : 'unreachable', fromShell: true };
    } catch {
      // Bridge hiccup — fall through to the HTTP probe.
    }
  }
  // Browser/dev/Docker: probe healthz directly.
  try {
    const res = await fetch(`${engineBaseUrl()}/healthz`, { method: 'GET' });
    return { state: res.ok ? 'ready' : 'unreachable', fromShell: false };
  } catch {
    return { state: 'unreachable', fromShell: false };
  }
}
