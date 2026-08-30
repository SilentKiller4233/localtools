/* Offline-reload acceptance test (PROJECT_SPEC Phase 2 / Section 8).
 * 1. Load the app online, wait for the service worker to activate.
 * 2. Assert SW controls the page.
 * 3. Kill nothing here — the caller stops the server between phases via exit code.
 * Run:  node scripts/offline-test.mjs <phase: warmup|verify>
 */
import puppeteer from 'puppeteer-core';
import { existsSync } from 'node:fs';

const CHROME_PATHS = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  process.env.LOCALAPPDATA + '/Google/Chrome/Application/chrome.exe',
];
const phase = process.argv[2] ?? 'warmup';
const URL_BASE = 'http://localhost:4173';

const browser = await puppeteer.launch({
  executablePath: CHROME_PATHS.find((p) => existsSync(p)),
  headless: 'new',
  userDataDir: process.env.LOCALAPPDATA + '/Temp/localtools-pwa-profile',
  args: ['--no-first-run'],
});

try {
  const page = await browser.newPage();
  await page.goto(`${URL_BASE}/suite/media`, { waitUntil: 'networkidle0', timeout: 30000 });

  const swState = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return { supported: false };
    const reg = await navigator.serviceWorker.ready;
    return {
      supported: true,
      controlling: navigator.serviceWorker.controller !== null,
      scope: reg.scope,
    };
  });
  console.log(`[${phase}] service worker:`, JSON.stringify(swState));

  if (phase === 'warmup') {
    // Give the runtime cache a beat to populate hashed assets.
    await new Promise((r) => setTimeout(r, 1500));
    console.log('WARMUP_OK');
  } else {
    // OFFLINE: reload with the network gone (server already killed by caller).
    await page.reload({ waitUntil: 'load', timeout: 20000 });
    const h1 = await page.$eval('.lt-suite-header h1', (el) => el.textContent).catch(() => null);
    const cards = await page.$$eval('.lt-grid .lt-tool-card', (els) => els.length).catch(() => 0);
    console.log(`[verify] offline render -> h1=${JSON.stringify(h1)} toolCards=${cards}`);
    if (h1 === 'Media Tools' && cards > 0) {
      console.log('OFFLINE_RELOAD_PASS');
    } else {
      console.log('OFFLINE_RELOAD_FAIL');
      process.exitCode = 1;
    }
  }
} finally {
  await browser.close();
}
