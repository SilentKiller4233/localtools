/**
 * Offline-reload acceptance test (PROJECT_SPEC Phase 2 / Section 8) —
 * self-contained (Phase 13): starts its own `vite preview` on an
 * ephemeral port, loads the app, waits for the service worker, then
 * simulates offline by going browser-offline via the CDP Network domain
 * (Network.setOffline), reloads, and asserts the page still renders
 * fully from the service-worker cache.
 *
 * (The original two-phase warmup/verify design needed the caller to kill
 * the server between phases — fine interactively, impossible to wire
 * into verify/CI as one step. Browser-level offline is the same
 * network-gone condition and fits one process. First CI attempt used
 * puppeteer's setOfflineMode — which wedged page.reload on the ubuntu
 * runner (run 34637640479, silent 13-min hang) — replaced with a direct
 * CDP call + hard timeouts on EVERY phase so the step can never hang a
 * job again. The original bytes/history are in git.)
 *
 * Usage:  node scripts/offline-test.mjs
 * Output: OFFLINE_RELOAD_PASS on success.
 */
import puppeteer from 'puppeteer-core';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { findChrome } from './lib/find-chrome.mjs';

const PORT = 4182;
const BASE = `http://localhost:${PORT}`;
/** Every phase is hard-bounded so a wedge fails loudly instead of hanging CI. */
const HARD_TIMEOUT_MS = 120_000;

const fail = (msg) => {
  console.error(`OFFLINE_RELOAD_FAIL: ${msg}`);
  process.exit(1);
};

/** Start vite preview on our port; resolve when it answers; return a killer. */
async function startPreviewServer() {
  const cwd = fileURLToPath(new URL('..', import.meta.url));
  const child = spawn(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['vite', 'preview', '--port', String(PORT), '--strictPort'],
    { cwd, stdio: 'pipe', shell: process.platform === 'win32' },
  );
  let killed = false;
  const kill = () => {
    if (killed) return;
    killed = true;
    if (process.platform === 'win32') {
      spawn('cmd', ['/c', `taskkill /PID ${child.pid ?? 0} /T /F`], { stdio: 'ignore' });
    } else {
      child.kill('SIGKILL');
    }
  };
  for (let i = 0; i < 120; i++) {
    try {
      const res = await fetch(`${BASE}/`);
      if (res.ok) return kill;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  kill();
  throw new Error(`vite preview did not come up on :${PORT} within 60s`);
}

async function main() {
  if (!existsSync(new URL('../dist/index.html', import.meta.url))) {
    throw new Error('dist/ missing — run `pnpm build` first.');
  }
  const killServer = await startPreviewServer();

  // Hard watchdog: whatever wedges (browser launch, goto, reload, CDP),
  // this turns a hang into a failure inside 2 minutes.
  const watchdog = setTimeout(
    () => fail(`hard timeout after ${HARD_TIMEOUT_MS}ms`),
    HARD_TIMEOUT_MS,
  );

  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: findChrome(),
      headless: 'new',
      args: ['--no-first-run', '--no-sandbox', '--disable-dev-shm-usage'],
    });
    const page = await browser.newPage();

    await page.goto(`${BASE}/suite/media`, { waitUntil: 'networkidle0', timeout: 30_000 });
    const swState = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return { supported: false };
      const reg = await navigator.serviceWorker.ready;
      return {
        supported: true,
        controlling: navigator.serviceWorker.controller !== null,
        scope: reg.scope,
      };
    });
    console.log('service worker:', JSON.stringify(swState));
    if (!swState.supported || swState.controlling !== true) {
      fail('service worker is not controlling the page.');
    }

    // Give the runtime cache a beat to populate hashed assets.
    await new Promise((r) => setTimeout(r, 1500));

    // GO OFFLINE via CDP — setOfflineMode proved unreliable on the ubuntu
    // runner (silent reload wedge), so drive the protocol directly.
    const cdp = await page.createCDPSession();
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: true,
      latency: 0,
      downloadThroughput: 0,
      uploadThroughput: 0,
    });

    await page.reload({ waitUntil: 'load', timeout: 30_000 });
    const h1 = await page.$eval('.lt-suite-header h1', (el) => el.textContent).catch(() => null);
    const cards = await page.$$eval('.lt-grid .lt-tool-card', (els) => els.length).catch(() => 0);
    console.log(`offline render -> h1=${JSON.stringify(h1)} toolCards=${String(cards)}`);
    if (h1 === 'Media Tools' && cards > 0) {
      console.log('OFFLINE_RELOAD_PASS');
    } else {
      fail('offline page did not render from the SW cache.');
    }
  } finally {
    clearTimeout(watchdog);
    if (browser !== undefined) await browser.close();
    killServer();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
