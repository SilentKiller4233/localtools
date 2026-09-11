/**
 * Section 13 Safari/WebKit WASM smoke (Phase 12): run the app in WebKit
 * (Playwright's WebKit is Safari's engine, the closest available on this
 * host — true macOS Safari remains an owner manual item) and prove:
 *   1. the app boots and renders (JS/CSS/Worker module support),
 *   2. a real WASM tool runs end-to-end: qpdf-wasm via PDF protect
 *      (the wasm asset must fetch + compile + execute in WebKit),
 *   3. crossOriginIsolated is NOT required (the D-029 contract: whisper
 *      single-thread path, no COOP/COEP headers — assert the app works
 *      without them, which this preview server never sets),
 *   4. the devtext worker runs (the module-init fixes from D-042).
 *
 * Usage (against a running `vite preview` on :4173):
 *   node scripts/webkit-wasm-smoke.mjs
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:4173';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const fixture = join(import.meta.dirname, '..', '..', '..', 'fixtures', 'pdf', 'simple-text.pdf');

const browser = await chromium.launch({ channel: 'webkit' }).catch(async () => {
  // Fallback: the webkit channel lives in playwright's registry.
  const { webkit } = await import('playwright');
  return webkit.launch();
});

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'FAIL'}  ${name}${detail === '' ? '' : ` — ${detail}`}`);
  if (!ok) failures += 1;
};

try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('  [pageerror]', String(e).slice(0, 200)));
  await page.goto(`${BASE}/#/suite/pdf`, { waitUntil: 'networkidle' });

  // 1. Boot + render
  const h1 = await page.textContent('.lt-suite-header h1');
  check('app boots in WebKit', h1 === 'PDF Tools', `h1=${String(h1)}`);
  check(
    'not crossOriginIsolated (single-thread WASM contract holds without COOP/COEP)',
    await page.evaluate(() => !window.crossOriginIsolated),
  );

  // 2. qpdf-wasm through a real tool: protect-pdf with a password.
  await page.goto(`${BASE}/#/tool/protect-pdf`, { waitUntil: 'networkidle0' });
  const input = await page.$('input[type=file]');
  await input.setInputFiles(fixture);
  await page.waitForSelector('.lt-file-list li', { timeout: 30_000 });
  // Type the password into its field (the page labels it) then run.
  const pw = await page.$('input[type=password]');
  if (pw !== null) await pw.fill('localtools-test');
  const runBtn = await page.$('button:not([disabled])');
  await runBtn.click();
  const okResult = await page
    .waitForSelector('.lt-tool-result', { timeout: 120_000 })
    .then(() => true)
    .catch(() => false);
  const errText = await page.$eval('.lt-tool-error', (el) => el.textContent).catch(() => null);
  check('qpdf-wasm tool completes in WebKit (protect-pdf)', okResult, `err=${String(errText)}`);

  // 3. devtext worker (D-042 module-init fixes) in WebKit.
  await page.goto(`${BASE}/#/tool/json-formatter`, { waitUntil: 'networkidle0' });
  const ta = await page.$('textarea');
  await ta.fill('{"a":1}');
  const btn = await page.$('button:not([disabled])');
  await btn.click();
  const devOk = await page
    .waitForSelector('.lt-tool-result', { timeout: 60_000 })
    .then(() => true)
    .catch(() => false);
  const devErr = await page.$eval('.lt-tool-error', (el) => el.textContent).catch(() => null);
  check('devtext worker tool completes in WebKit (json-formatter)', devOk, `err=${String(devErr)}`);
} finally {
  await browser.close();
}

if (failures > 0) {
  console.error(`WEBKIT_WASM_SMOKE_FAIL: ${String(failures)} checks failed`);
  process.exitCode = 1;
} else {
  console.log('WEBKIT_WASM_SMOKE_PASS');
}
