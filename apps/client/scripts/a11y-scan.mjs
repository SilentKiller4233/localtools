/**
 * Section 14.6 accessibility acceptance (Phase 12): axe-core scan on EVERY
 * route across all four suites, in BOTH themes — zero critical/serious
 * violations, or the run fails (exit 1).
 *
 * Routes: home, the four suite pages, /dev/ui-preview, and every one of
 * the 97 tool pages. The scan loads axe-core from the workspace's
 * node_modules into the previewed production build.
 *
 * Usage (against a running `vite preview` on :4173):
 *   node scripts/a11y-scan.mjs
 */
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';
import { findChrome } from './lib/find-chrome.mjs';

const PORT = 4173;
const BASE = `http://localhost:${PORT}`;
const require = createRequire(import.meta.url);

/** Route list: fixed surfaces + every registered tool id (i18n keys). */
function allRoutes() {
  const enPath = join(import.meta.dirname, '..', 'src', 'i18n', 'en.json');
  const en = JSON.parse(readFileSync(enPath, 'utf8'));
  const toolIds = Object.keys(en.tools);
  const routes = [
    '',
    '/suite/pdf',
    '/suite/media',
    '/suite/image',
    '/suite/devtext',
    '/dev/ui-preview',
  ];
  for (const id of toolIds) routes.push(`/tool/${id}`);
  return routes;
}

const AXE_SOURCE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

async function main() {
  const routes = allRoutes();
  console.log(`scanning ${routes.length} routes x 2 themes…`);

  const browser = await puppeteer.launch({
    executablePath: findChrome(),
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  const failures = [];
  const totals = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  try {
    const page = await browser.newPage();
    await page.evaluateOnNewDocument(AXE_SOURCE);
    // Default to the light theme explicitly; each scan sets its own.
    await page.evaluateOnNewDocument(() => {
      window.localStorage.setItem('localtools.theme', 'light');
    });

    for (const route of routes) {
      for (const theme of ['light', 'dark']) {
        await page.evaluateOnNewDocument(
          `window.localStorage.setItem('localtools.theme', '${theme}')`,
        );
        const url = `${BASE}/#${route === '' ? '/' : route}`;
        await page.goto(url, { waitUntil: 'networkidle0', timeout: 30_000 });
        // Re-assert the theme in case an evaluateOnNewDocument ordering race
        // boots the other theme (the bootstrap in main.tsx reads storage).
        await page.evaluate((t) => {
          document.documentElement.setAttribute('data-theme', t);
        }, theme);
        const results = await page.evaluate(async () => {
          return await window.axe.run(document, {
            runOnly: {
              type: 'tag',
              values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'],
            },
            resultTypes: ['violations'],
          });
        });
        for (const v of results.violations) {
          const sev = v.impact ?? 'unknown';
          if (sev in totals) totals[sev] += 1;
          const nodes = v.nodes.map((n) => n.target.join(' ')).slice(0, 3);
          const line = `[${theme}] ${route || '/'} :: ${v.id} (${sev}) -> ${nodes.join(' | ')}`;
          console.log(
            `  ${sev === 'critical' || sev === 'serious' ? 'VIOLATION' : 'note'} ${line}`,
          );
          if (v.impact === 'critical' || v.impact === 'serious') {
            failures.push(line);
          }
        }
        await new Promise((r) => {
          setTimeout(r, 30);
        });
      }
    }
  } finally {
    await browser.close();
  }

  console.log(
    `totals: critical=${String(totals.critical)} serious=${String(totals.serious)} moderate=${String(totals.moderate)} minor=${String(totals.minor)}`,
  );
  if (failures.length > 0) {
    console.error(`A11Y_SCAN_FAIL: ${String(failures.length)} critical/serious violations`);
    process.exitCode = 1;
    return;
  }
  console.log('A11Y_SCAN_PASS');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
