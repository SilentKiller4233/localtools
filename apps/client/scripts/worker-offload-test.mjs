/**
 * Section 14.5 worker-offload check (Phase 3 acceptance): process a 50MB+
 * PDF through a real tool page IN THE PRODUCTION BUILD and assert the main
 * thread stays responsive — near-zero long tasks (>50ms) while the Web
 * Worker does the parsing/processing.
 *
 * Usage (against a running `vite preview` on :4173):
 *   node scripts/worker-offload-test.mjs
 *
 * The 50MB fixture is `simple-text.pdf` padded with a giant PDF comment
 * line (verified parseable by pdf-lib: comments after %%EOF are skipped by
 * its lexer). The pad makes parse/scan cost scale with real byte volume —
 * exactly what a 50MB input costs — without committing a 50MB fixture.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';

const PORT = 4173;
const BASE = `http://localhost:${PORT}`;

/** Chrome executable discovery (Windows-first, same as offline-test.mjs). */
function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter((p) => p !== undefined);
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  throw new Error('Chrome not found — set CHROME_PATH.');
}

function makeBigFixture() {
  const src = readFileSync(new URL('../../../fixtures/pdf/simple-text.pdf', import.meta.url));
  const target = 52 * 1024 * 1024; // just above the 50MB bar
  const head = Buffer.from('\n%');
  const tail = Buffer.from('\n');
  const padLen = Math.max(0, target - src.byteLength - head.byteLength - tail.byteLength);
  const big = Buffer.concat([src, head, Buffer.alloc(padLen, 0x61 /* 'a' */), tail]);
  const file = join(tmpdir(), 'localtools-50mb.pdf');
  writeFileSync(file, big);
  return { file, sizeMb: big.byteLength / 1024 / 1024 };
}

async function main() {
  const { file, sizeMb } = makeBigFixture();
  console.log(`fixture: ${file} (${sizeMb.toFixed(1)}MB)`);

  const browser = await puppeteer.launch({
    executablePath: findChrome(),
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const page = await browser.newPage();

    await page.evaluateOnNewDocument(() => {
      window.__longTasks = 0;
      window.__longTaskMs = 0;
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          window.__longTasks += 1;
          window.__longTaskMs += entry.duration;
        }
      });
      observer.observe({ entryTypes: ['longtask'] });
    });

    await page.goto(`${BASE}/#/tool/merge-pdf`, { waitUntil: 'networkidle0' });
    console.log('tool page loaded');

    const input = await page.$('input[type=file]');
    if (input === null) throw new Error('drop zone input not found');
    await input.uploadFile(file);
    await page.waitForFunction(() => document.querySelector('.lt-file-list li') !== null, {
      timeout: 60_000,
    });
    console.log('file selected (listed in UI)');

    // Reset the counters AFTER the (unavoidably main-thread) file read —
    // the acceptance is about PROCESSING not blocking the UI.
    await page.evaluate(() => {
      window.__longTasks = 0;
      window.__longTaskMs = 0;
    });

    const runButton = await page.$('button:not([disabled])');
    if (runButton === null) throw new Error('run button not found/enabled');
    await runButton.click();
    await page.waitForFunction(
      () =>
        document.querySelector('.lt-tool-result') !== null ||
        document.querySelector('.lt-tool-error') !== null,
      { timeout: 180_000 },
    );
    const error = await page.$('.lt-tool-error');
    if (error !== null) {
      const text = await page.evaluate((el) => el.textContent, error);
      throw new Error(`tool errored: ${text ?? 'unknown'}`);
    }
    console.log('merge completed (result section rendered)');

    const stats = await page.evaluate(() => ({
      longTasks: window.__longTasks,
      longTaskMs: window.__longTaskMs,
    }));
    console.log(
      `main-thread long tasks during processing: ${String(stats.longTasks)} (${String(Math.round(stats.longTaskMs))}ms total)`,
    );
    if (stats.longTasks > 3 || stats.longTaskMs > 200) {
      throw new Error(
        `WORKER_OFFLOAD_FAIL: ${String(stats.longTasks)} long tasks, ${String(Math.round(stats.longTaskMs))}ms — main thread was blocked`,
      );
    }
    console.log('WORKER_OFFLOAD_PASS');
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
