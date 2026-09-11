/**
 * Section 14.5 worker-offload check (Phase 3 acceptance, Phase 13 CI
 * wiring): process a 50MB+ PDF through a real tool page IN THE PRODUCTION
 * BUILD and assert the main thread stays responsive — near-zero long
 * tasks (>50ms) while the Web Worker does the parsing/processing.
 *
 * Self-contained (Phase 13): builds are expected to already exist (this
 * runs right after `pnpm build` in CI/verify); the script starts its own
 * `vite preview` on an ephemeral port, waits for readiness, runs the
 * check, and ALWAYS tears the server down.
 *
 * The 50MB fixture is `simple-text.pdf` padded with a giant PDF comment
 * line (verified parseable by pdf-lib: comments after %%EOF are skipped
 * by its lexer). The pad makes parse/scan cost scale with real byte
 * volume without committing a 50MB fixture.
 *
 * Usage: node scripts/worker-offload-test.mjs
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { findChrome } from './lib/find-chrome.mjs';

const PORT = 4181;
const BASE = `http://localhost:${PORT}`;

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
      // Kill the whole tree — npx.cmd → node → vite can wedge otherwise.
      spawn('cmd', ['/c', `taskkill /PID ${child.pid ?? 0} /T /F`], { stdio: 'ignore' });
    } else {
      child.kill('SIGKILL');
    }
  };
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${BASE}/`);
      if (res.ok) return kill;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  kill();
  throw new Error(`vite preview did not come up on :${PORT}`);
}

async function main() {
  if (!existsSync(new URL('../dist/index.html', import.meta.url))) {
    throw new Error('dist/ missing — run `pnpm build` first.');
  }
  const { file, sizeMb } = makeBigFixture();
  console.log(`fixture: ${file} (${sizeMb.toFixed(1)}MB)`);

  const killServer = await startPreviewServer();
  try {
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
  } finally {
    killServer();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
