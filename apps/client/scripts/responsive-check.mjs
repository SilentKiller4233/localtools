/**
 * Section 8 responsive requirement (Phase 12): 390px mobile viewport
 * through desktop, all suites. For every suite/tool route at 390px:
 *   - NO horizontal overflow (scrollWidth <= clientWidth + 1)
 *   - every interactive element (a, button, input) fully inside the viewport
 * Also samples 768px and 1280px for the same overflow rule.
 *
 * Usage (against a running `vite preview` on :4173):
 *   node scripts/responsive-check.mjs
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';
import { findChrome } from './lib/find-chrome.mjs';

const PORT = 4173;
const BASE = `http://localhost:${PORT}`;

/** Representative routes: every suite page + one tool per runner frame. */
const ROUTES = [
  '/',
  '/suite/pdf',
  '/suite/media',
  '/suite/image',
  '/suite/devtext',
  '/tool/merge-pdf', // ToolRunnerPage (worker, pdf)
  '/tool/json-formatter', // DevTextRunner
  '/tool/image-converter', // image runner
  '/tool/video-converter', // EngineRunnerPage
  '/tool/universal-downloader', // DownloaderPage
  '/tool/text-to-speech', // speech engine page
  '/tool/transcribe-media', // speech worker page
  '/dev/ui-preview',
];

const VIEWPORTS = [
  { name: '390px', width: 390, height: 844 },
  { name: '768px', width: 768, height: 1024 },
  { name: '1280px', width: 1280, height: 800 },
];

async function main() {
  const browser = await puppeteer.launch({
    executablePath: findChrome(),
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const failures = [];
  try {
    const page = await browser.newPage();
    for (const vp of VIEWPORTS) {
      await page.setViewport(vp);
      for (const route of ROUTES) {
        const url = `${BASE}/#${route === '/' ? '/' : route}`;
        await page.goto(url, { waitUntil: 'networkidle0', timeout: 30_000 });
        const report = await page.evaluate(() => {
          const doc = document.documentElement;
          const overflowX = doc.scrollWidth - doc.clientWidth;
          const offscreen = [];
          for (const el of document.querySelectorAll('a, button, input, select, textarea')) {
            const r = el.getBoundingClientRect();
            if (r.width === 0 && r.height === 0) continue; // visually hidden
            if (el.classList.contains('lt-dropzone__input')) continue; // overlay input
            if (r.right > doc.clientWidth + 1 || r.left < -1) {
              offscreen.push(
                `${el.tagName.toLowerCase()}.${String(el.className)}@${String(Math.round(r.left))}..${String(Math.round(r.right))} (vw=${String(doc.clientWidth)})`,
              );
            }
          }
          return { overflowX, offscreen };
        });
        if (report.overflowX > 1) {
          failures.push(`[${vp.name}] ${route}: horizontal overflow ${String(report.overflowX)}px`);
        }
        for (const o of report.offscreen) {
          failures.push(`[${vp.name}] ${route}: element outside viewport — ${o}`);
        }
        await new Promise((r) => {
          setTimeout(r, 20);
        });
      }
      console.log(`${vp.name}: scanned ${String(ROUTES.length)} routes`);
    }
  } finally {
    await browser.close();
  }
  if (failures.length > 0) {
    for (const f of failures) console.error(`  ${f}`);
    console.error(`RESPONSIVE_CHECK_FAIL: ${String(failures.length)} issues`);
    process.exitCode = 1;
    return;
  }
  console.log('RESPONSIVE_CHECK_PASS');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
