/**
 * Phase 15 doc screenshots (PROJECT_SPEC Phase 15: "screenshots per suite").
 *
 * Boots the PRODUCTION client build (vite preview), opens Chrome headless
 * via CDP, visits the home grid + each suite grid + one representative
 * tool page per suite, and saves full-viewport PNGs into
 * docs/screenshots/ (COMMITTED — README references them, so they must
 * survive a clone; regenerate with this script when the UI changes).
 * bounded readiness probes, explicit kill, node-direct child spawning
 * (the repo path contains a space, breaking Windows .cmd shims).
 *
 * Usage (from repo root, requires `pnpm build` first):
 *   node apps/client/scripts/capture-screenshots.mjs
 *   CHROME_PATH=... node apps/client/scripts/capture-screenshots.mjs
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const clientDir = resolve(here, '..');
const repoRoot = resolve(clientDir, '..', '..');

const { findChrome } = await import('./lib/find-chrome.mjs');

const chromePath = process.env.CHROME_PATH || findChrome() || undefined;
if (chromePath === undefined || !existsSync(chromePath)) {
  console.error('SCREENSHOT_FAIL: no Chrome found (set CHROME_PATH)');
  process.exit(1);
}
if (!existsSync(resolve(clientDir, 'dist/index.html'))) {
  console.error('SCREENSHOT_FAIL: client build missing — run pnpm build first');
  process.exit(1);
}

const outDir = resolve(repoRoot, 'docs', 'screenshots');
mkdirSync(outDir, { recursive: true });

// ---- vite preview (ephemeral port, abort-bounded readiness) ----
const previewPort = 4189;
const preview = spawn(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['vite', 'preview', '--port', String(previewPort), '--strictPort', '--host', '127.0.0.1'],
  { cwd: clientDir, shell: process.platform === 'win32', windowsHide: true, stdio: 'ignore' },
);
const killPreview = () => {
  try {
    preview.kill();
  } catch {
    /* already gone */
  }
};
process.on('exit', killPreview);
process.on('SIGINT', () => {
  killPreview();
  process.exit(125);
});
async function waitHttp(url, ms) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(1500) });
      if (r.ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r2) => setTimeout(r2, 300));
  }
  return false;
}
if (!(await waitHttp(`http://127.0.0.1:${String(previewPort)}/`, 20_000))) {
  killPreview();
  console.error('SCREENSHOT_FAIL: preview server did not become ready');
  process.exit(1);
}

// ---- Chrome headless with CDP ----
const cdpPort = 9223;
const profileDir = resolve(clientDir, '.screenshot-profile');
const chrome = spawn(
  chromePath,
  [
    '--headless=new',
    `--remote-debugging-port=${String(cdpPort)}`,
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--window-size=1280,800',
    '--hide-scrollbars',
  ],
  { shell: false, windowsHide: true, stdio: 'ignore' },
);
const killChrome = () => {
  try {
    chrome.kill();
  } catch {
    /* already gone */
  }
};
process.on('exit', killChrome);
process.on('SIGINT', () => {
  killChrome();
  process.exit(125);
});
if (!(await waitHttp(`http://127.0.0.1:${String(cdpPort)}/json/version`, 20_000))) {
  killChrome();
  killPreview();
  console.error('SCREENSHOT_FAIL: Chrome CDP endpoint did not become ready');
  process.exit(1);
}

// ws lives in the pnpm store (transitive dep, hoisted only under .pnpm) —
// resolve from the store and convert to a file:// URL (Windows absolute
// paths are rejected by the ESM loader directly).
const { pathToFileURL } = await import('node:url');
const wsPath = resolve(
  repoRoot,
  'node_modules',
  '.pnpm',
  'ws@8.21.3',
  'node_modules',
  'ws',
  'index.js',
);
const wsModule = await import(pathToFileURL(wsPath).href);
const WebSocket = wsModule.default ?? wsModule.WebSocket;

/** CDP helper: send command, resolve on matching reply id. */
function makeCdp(ws) {
  let nextId = 1;
  const pending = new Map();
  ws.addEventListener('message', (raw) => {
    let m;
    try {
      m = JSON.parse(typeof raw.data === 'string' ? raw.data : String(raw.data));
    } catch {
      return;
    }
    if (m.id !== undefined && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id);
      pending.delete(m.id);
      if (m.error) rej(new Error(`CDP ${m.error.message}`));
      else res(m.result);
    }
  });
  return (method, params = {}) =>
    new Promise((res, rej) => {
      const id = nextId++;
      pending.set(id, { res, rej });
      ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id);
          rej(new Error(`CDP ${method} timeout`));
        }
      }, 30_000);
    });
}

// Home grid + every suite grid + one representative tool page per suite
// (tool pages chosen to render meaningful UI without the engine running).
const BASE = `http://127.0.0.1:${String(previewPort)}`;
const SHOTS = [
  { file: 'home.png', path: '/' },
  { file: 'suite-pdf.png', path: '/#/suite/pdf' },
  { file: 'suite-media.png', path: '/#/suite/media' },
  { file: 'suite-image.png', path: '/#/suite/image' },
  { file: 'suite-devtext.png', path: '/#/suite/devtext' },
  { file: 'tool-pdf.png', path: '/#/tool/merge-pdf' },
  { file: 'tool-media.png', path: '/#/tool/video-converter' },
  { file: 'tool-image.png', path: '/#/tool/image-converter' },
  { file: 'tool-devtext.png', path: '/#/tool/json-formatter' },
];

const wsUrl = await fetch(`http://127.0.0.1:${String(cdpPort)}/json/new?about:blank`, {
  method: 'PUT',
}).then((r) => r.json());
const ws = new WebSocket(wsUrl.webSocketDebuggerUrl, { perMessageDeflate: false });
await new Promise((res, rej) => {
  ws.addEventListener('open', res);
  ws.addEventListener('error', (e) =>
    rej(new Error(`ws error: ${String(e.message ?? 'unknown')}`)),
  );
  setTimeout(() => rej(new Error('ws open timeout')), 10_000);
});
const cdp = makeCdp(ws);

await cdp('Page.enable');
await cdp('Emulation.setDeviceMetricsOverride', {
  width: 1280,
  height: 800,
  deviceScaleFactor: 1,
  mobile: false,
});

for (const shot of SHOTS) {
  await cdp('Page.navigate', { url: `${BASE}${shot.path}` });
  // Hash routes: wait for load event fired, then fonts + two rAFs.
  await new Promise((r) => setTimeout(r, 900));
  try {
    await cdp('Runtime.evaluate', {
      expression: 'document.fonts.ready.then(() => true)',
      awaitPromise: true,
    });
  } catch {
    /* fonts API unavailable — layout wait below covers it */
  }
  await cdp('Runtime.evaluate', {
    expression: 'new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))',
    awaitPromise: true,
  });
  const { data } = await cdp('Page.captureScreenshot', { format: 'png' });
  const out = resolve(outDir, shot.file);
  const { writeFileSync } = await import('node:fs');
  writeFileSync(out, Buffer.from(data, 'base64'));
  console.log(`saved ${shot.file}`);
}

ws.close();
killChrome();
try {
  rmSync(profileDir, { recursive: true, force: true });
} catch {
  /* best effort */
}
killPreview();
console.log(`SCREENSHOT_PASS (${SHOTS.length} shots in docs/screenshots/)`);
