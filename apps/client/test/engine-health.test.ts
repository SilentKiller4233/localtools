/**
 * Engine-health + fake-progress tests (Phase 11).
 *
 * checkEngineHealth: browser path → GET /healthz on the resolved base
 * URL; desktop path → bridge desktop_status.engineReady. Both degrade
 * to 'unreachable' with no throw. Tested with a mocked global fetch
 * (node environment; no engine needed — CI never requires network).
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

describe('engine health probe', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete (globalThis as { __LOCALTOOLS__?: unknown }).__LOCALTOOLS__;
  });

  it('reports ready when /healthz answers ok (browser path)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    const { checkEngineHealth } = await import('../src/lib/engine-health');
    const result = await checkEngineHealth();
    expect(result).toEqual({ state: 'ready', fromShell: false });
    const [called] = fetchMock.mock.calls;
    expect(String(called?.[0])).toContain('/healthz');
  });

  it('reports unreachable when fetch rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const { checkEngineHealth } = await import('../src/lib/engine-health');
    const result = await checkEngineHealth();
    expect(result).toEqual({ state: 'unreachable', fromShell: false });
  });

  it('reports unreachable on a non-2xx healthz', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    const { checkEngineHealth } = await import('../src/lib/engine-health');
    const result = await checkEngineHealth();
    expect(result.state).toBe('unreachable');
  });

  it('uses the shell bridge when present (desktop path)', async () => {
    const fetchMock = vi.fn(); // must NOT be called
    vi.stubGlobal('fetch', fetchMock);
    (globalThis as { __LOCALTOOLS__?: unknown }).__LOCALTOOLS__ = {
      invoke: vi.fn().mockResolvedValue({ engineReady: true }),
    };
    const { checkEngineHealth } = await import('../src/lib/engine-health');
    const result = await checkEngineHealth();
    expect(result).toEqual({ state: 'ready', fromShell: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falls back to the HTTP probe when the bridge throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    (globalThis as { __LOCALTOOLS__?: unknown }).__LOCALTOOLS__ = {
      invoke: vi.fn().mockRejectedValue(new Error('bridge hiccup')),
    };
    const { checkEngineHealth } = await import('../src/lib/engine-health');
    const result = await checkEngineHealth();
    expect(result).toEqual({ state: 'ready', fromShell: false });
  });
});
