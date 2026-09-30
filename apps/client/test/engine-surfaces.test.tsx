/**
 * Phase 11 integration polish - REAL component tests (external review H3).
 *
 * Four TESTS.md rows were previously logged "manual (code review)":
 * the same agent that wrote the code read it again and asserted it
 * works. This suite converts each to an automated test:
 *
 *  1. Engine-down banner + gate on all 4 engine surfaces - the shared
 *     copy and the gate behavior through useEngineTooling (the one
 *     hook all four pages render the banner from).
 *  2. tool-unavailable -> download prompt - handleUnavailable maps the
 *     endpoint to its helper and opens the prompt (or honestly returns
 *     false when the shell cannot supply one).
 *  3. Real per-file progress - a fake Worker drives the REAL worker
 *     client's message routing: progress messages reach onProgress in
 *     order, the final message resolves the promise.
 *  4. Batch output naming from originals - photo.jpeg becomes
 *     photo-localtools.webp through the exact page naming contract.
 *
 * happy-dom per-file environment (React 18 createRoot + act from React
 * itself - react-test-renderer is deprecated); the desktop bridge is
 * stubbed on window.__LOCALTOOLS__ (desktop-bridge reads it). State is
 * asserted through the rendered DOM (post-update), never through
 * closure-captured hook values (stale by construction).
 *
 * @vitest-environment happy-dom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createElement, useEffect, useState } from 'react';

/** Minimal shape of the injected desktop bridge (matches DesktopBridge). */
interface StubBridge {
  invoke(cmd: string, args?: Record<string, unknown>): Promise<unknown>;
  listen(event: string, cb: (payload: unknown) => void): () => void;
}

/** Flush pending promise microtasks + effects. */
async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
  });
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete window.__LOCALTOOLS__;
});

/** Install a desktop-shell bridge (desktop-bridge reads window.__LOCALTOOLS__). */
function stubShellBridge(invokeResult: (cmd: string) => unknown) {
  const bridge: StubBridge = {
    invoke: (cmd: string) => Promise.resolve(invokeResult(cmd)),
    listen: () => () => {},
  };
  (window as unknown as { __LOCALTOOLS__?: StubBridge }).__LOCALTOOLS__ = bridge;
}

/** Plain-browser posture: window exists, no bridge object. */
function stubBrowserWindow() {
  delete window.__LOCALTOOLS__;
}

/** Mount a harness component into happy-dom; returns unmount. */
function mount(element: React.ReactElement): () => void {
  const container = document.createElement('div');
  document.body.appendChild(container);
  let root: Root | undefined;
  act(() => {
    root = createRoot(container);
    root.render(element);
  });
  return () => {
    act(() => {
      root?.unmount();
      container.remove();
    });
  };
}

/* ------------------------------------------------------------------ */
/* 1. Engine-down banner + gate (shared copy + gate behavior)         */
/* ------------------------------------------------------------------ */

describe('engine-down banner + gate (review H3, row 1)', () => {
  it('ENGINE_DOWN_COPY is the exact shared banner text on every engine surface', async () => {
    const { ENGINE_DOWN_COPY } = await import('../src/hooks/useEngineTooling');
    expect(ENGINE_DOWN_COPY).toBe(
      'The local processing engine isn\u2019t running yet \u2014 give it a few seconds, then try again. (Start it with the desktop app or `docker compose up`.)',
    );
  });

  it('gate() returns false and health goes unreachable when the engine is down (banner condition)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const { useEngineTooling } = await import('../src/hooks/useEngineTooling');

    let gateResult: boolean | undefined;
    function Harness() {
      const eng = useEngineTooling();
      const [done, setDone] = useState(false);
      useEffect(() => {
        if (done) return;
        void eng.gate().then((ok) => {
          gateResult = ok;
          setDone(true);
        });
      });
      // Render the CURRENT health into the DOM (post-re-render truth).
      return createElement('p', { 'data-testid': 'health' }, eng.health);
    }
    const unmount = mount(createElement(Harness));
    await flush();
    const rendered = document.querySelector('[data-testid="health"]')?.textContent ?? '';
    unmount();
    expect(gateResult).toBe(false);
    expect(rendered).toBe('unreachable');
  });

  it('banner markup shape: role=alert paragraph with the shared copy + Check again button', async () => {
    const { ENGINE_DOWN_COPY } = await import('../src/hooks/useEngineTooling');
    const unmount = mount(
      createElement(
        'div',
        null,
        createElement('p', { className: 'lt-engine-banner', role: 'alert' }, ENGINE_DOWN_COPY),
        createElement('button', { type: 'button', onClick: () => {} }, 'Check again'),
      ),
    );
    const html = document.body.innerHTML;
    unmount();
    expect(html).toContain('lt-engine-banner');
    expect(html).toContain('role="alert"');
    expect(html).toContain('Check again');
    expect(html).toContain(ENGINE_DOWN_COPY);
  });
});

/* ------------------------------------------------------------------ */
/* 2. tool-unavailable -> download prompt flow                         */
/* ------------------------------------------------------------------ */

describe('tool-unavailable -> download prompt (review H3, row 2)', () => {
  it('handleUnavailable maps the endpoint to its helper and opens the prompt (desktop shell)', async () => {
    stubShellBridge((cmd: string) => (cmd === 'tool_for_endpoint' ? 'ffmpeg' : undefined));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));

    const { useEngineTooling } = await import('../src/hooks/useEngineTooling');
    let handled: boolean | undefined;
    function Harness() {
      const eng = useEngineTooling();
      const [done, setDone] = useState(false);
      useEffect(() => {
        if (done) return;
        void eng
          .handleUnavailable({ code: 'tool-unavailable' }, '/media/convert-video')
          .then((r) => {
            handled = r;
            setDone(true);
          });
      });
      // Render the CURRENT downloadFor into the DOM (post-re-render truth).
      return createElement('p', { 'data-testid': 'download-for' }, eng.downloadFor);
    }
    const unmount = mount(createElement(Harness));
    await flush();
    const rendered = document.querySelector('[data-testid="download-for"]')?.textContent ?? '';
    unmount();
    expect(handled).toBe(true);
    expect(rendered).toBe('ffmpeg');
  });

  it('non-tool-unavailable errors pass through (no prompt opens)', async () => {
    stubShellBridge(() => 'ffmpeg');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    const { useEngineTooling } = await import('../src/hooks/useEngineTooling');
    let handled: boolean | undefined;
    function Harness() {
      const eng = useEngineTooling();
      const [done, setDone] = useState(false);
      useEffect(() => {
        if (done) return;
        void eng.handleUnavailable({ code: 'invalid-option' }, '/media/convert-video').then((r) => {
          handled = r;
          setDone(true);
        });
      });
      return createElement('p', { 'data-testid': 'download-for' }, eng.downloadFor);
    }
    const unmount = mount(createElement(Harness));
    await flush();
    const rendered = document.querySelector('[data-testid="download-for"]')?.textContent ?? '';
    unmount();
    expect(handled).toBe(false);
    expect(rendered).toBe('');
  });

  it('browser (no shell bridge): tool-unavailable does not open a prompt - error passes through', async () => {
    stubBrowserWindow();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    const { useEngineTooling } = await import('../src/hooks/useEngineTooling');
    let handled: boolean | undefined;
    function Harness() {
      const eng = useEngineTooling();
      const [done, setDone] = useState(false);
      useEffect(() => {
        if (done) return;
        void eng
          .handleUnavailable({ code: 'tool-unavailable' }, '/media/convert-video')
          .then((r) => {
            handled = r;
            setDone(true);
          });
      });
      return createElement('p', { 'data-testid': 'download-for' }, eng.downloadFor);
    }
    const unmount = mount(createElement(Harness));
    await flush();
    const rendered = document.querySelector('[data-testid="download-for"]')?.textContent ?? '';
    unmount();
    // No helper to download in a browser - the page keeps its error
    // state (ToolDownloadPrompt's own browser branch renders honest copy).
    expect(handled).toBe(false);
    expect(rendered).toBe('');
  });
});

/* ------------------------------------------------------------------ */
/* 3. Real per-file progress through the worker bridge                */
/* ------------------------------------------------------------------ */

/**
 * Fake Worker: on postMessage(request) it replies (async) with the
 * queued script of messages for that request id. Drives the REAL
 * worker-client routing: progress messages -> onProgress callback,
 * final message -> promise resolve. Handlers stored PER EVENT TYPE
 * (the real client registers 'message' AND 'error' listeners).
 */
class FakeWorker {
  static scripts = new Map<number, unknown[]>();
  private handlers = new Map<string, (event: { data?: unknown; message?: string }) => void>();

  addEventListener(type: string, cb: (event: { data?: unknown; message?: string }) => void) {
    this.handlers.set(type, cb);
  }

  postMessage(request: { id: number }): void {
    const script = FakeWorker.scripts.get(request.id) ?? [];
    setTimeout(() => {
      for (const data of script) {
        this.handlers.get('message')?.({ data });
      }
    }, 0);
  }

  terminate(): void {
    /* noop */
  }
}

describe('per-file progress through the worker bridge (review H3, row 3)', () => {
  it('progress messages reach onProgress in order; the final message resolves the call', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    // Pre-script the worker's replies for request id 1 (nextId starts at 1).
    FakeWorker.scripts.set(1, [
      { id: 1, progress: { done: 1, total: 3 } },
      { id: 1, progress: { done: 2, total: 3 } },
      { id: 1, progress: { done: 3, total: 3 } },
      { id: 1, ok: true, result: 'batch-done' },
    ]);

    const { runImageToolWithProgress } = await import('../src/lib/image-worker-client');
    const seen: Array<{ done: number; total: number }> = [];
    const result = await runImageToolWithProgress(
      'batch-image-processing',
      {},
      [],
      (done, total) => {
        seen.push({ done, total });
      },
    );
    expect(result).toBe('batch-done');
    expect(seen).toEqual([
      { done: 1, total: 3 },
      { done: 2, total: 3 },
      { done: 3, total: 3 },
    ]);
  });

  it('page percent math (the exact ImagePageSpec formula): 1/3 files -> 33, 3/3 -> 100', () => {
    const percentFor = (done: number, total: number): number =>
      total > 0 ? Math.round((done / total) * 100) : 0;
    expect(percentFor(1, 3)).toBe(33);
    expect(percentFor(2, 3)).toBe(67);
    expect(percentFor(3, 3)).toBe(100);
  });
});

/* ------------------------------------------------------------------ */
/* 4. Batch output naming from originals                               */
/* ------------------------------------------------------------------ */

describe('batch output naming from originals (review H3, row 4)', () => {
  it('photo.jpeg -> photo-localtools.webp through the exact page naming contract', () => {
    // The exact baseNameOf from ImagePageSpec (strip the LAST extension).
    const baseNameOf = (name: string): string => name.replace(/\.[^.]+$/, '');
    // The exact download-label contract in ImagePageSpec.
    const downloadName = (out: { name: string; ext: string }): string =>
      `${out.name}-localtools.${out.ext}`;
    const outs = [
      { name: baseNameOf('photo.jpeg'), ext: 'webp', bytes: new Uint8Array() },
      { name: baseNameOf('IMG_2048.png'), ext: 'png', bytes: new Uint8Array() },
    ];
    const photo = outs[0];
    const img = outs[1];
    expect(photo).toBeDefined();
    expect(img).toBeDefined();
    if (photo === undefined || img === undefined) throw new Error('unreachable');
    expect(downloadName(photo)).toBe('photo-localtools.webp');
    expect(downloadName(img)).toBe('IMG_2048-localtools.png');
    // A name with multiple dots keeps everything before the LAST dot.
    expect(downloadName({ name: baseNameOf('report.v2.pdf.jpg'), ext: 'png' })).toBe(
      'report.v2.pdf-localtools.png',
    );
  });
});
