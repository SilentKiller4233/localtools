#!/usr/bin/env node
/**
 * Playwright PDF renderer for the LocalTools engine (Section 4.1 opt-in).
 *
 * Invoked by the engine with an ARGUMENT ARRAY only (Section 5.3):
 *   node playwright-pdf.mjs <input.html> <output.pdf> <pageSize> <mTop> <mRight> <mBottom> <mLeft>
 *
 * Requires the `playwright` package + Chromium browser install (the engine
 * reports tool-unavailable when LOCALTOOLS_PLAYWRIGHT_ENABLED != true, so
 * this script only runs on hosts that opted in).
 */

import { pathToFileURL } from 'node:url';
import { pathExists } from './util.mjs';

const [inputPath, outputPath, pageSize, mTop, mRight, mBottom, mLeft] = process.argv.slice(2);

if (
  inputPath === undefined ||
  outputPath === undefined ||
  pageSize === undefined ||
  mTop === undefined ||
  mRight === undefined ||
  mBottom === undefined ||
  mLeft === undefined
) {
  console.error(
    'usage: playwright-pdf.mjs <input> <output> <pageSize> <mTop> <mRight> <mBottom> <mLeft>',
  );
  process.exit(2);
}

if (!(await pathExists(inputPath))) {
  console.error('input file missing');
  process.exit(2);
}

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('playwright package not installed');
  process.exit(3);
}

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 1024 },
  });
  // Local file only — never an arbitrary URL fetch (no SSRF surface).
  await page.goto(pathToFileURL(inputPath).href, { waitUntil: 'networkidle' });
  await page.pdf({
    path: outputPath,
    format: pageSize,
    margin: { top: mTop, right: mRight, bottom: mBottom, left: mLeft },
    printBackground: true,
  });
} finally {
  await browser.close();
}
