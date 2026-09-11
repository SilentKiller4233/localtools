/**
 * Shared Chrome-executable discovery for the browser-based acceptance
 * scripts (a11y-scan, responsive-check, keyboard-sweep, worker-offload).
 *
 * Order: $CHROME_PATH → system Chrome/Chromium (Windows/macOS/Linux) →
 * Playwright's registry Chromium (CI installs it via
 * `npx playwright install chromium`; the registry layout is
 * `ms-playwright/chromium-<rev>/chrome-<plat>/chrome[.exe]`).
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

function playwrightChromium() {
  const roots =
    process.env.PLAYWRIGHT_BROWSERS_PATH !== undefined &&
    process.env.PLAYWRIGHT_BROWSERS_PATH !== ''
      ? [process.env.PLAYWRIGHT_BROWSERS_PATH]
      : [
          process.env.HOME ? join(process.env.HOME, '.cache', 'ms-playwright') : undefined,
          process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'ms-playwright') : undefined,
        ].filter((p) => p !== undefined);
  for (const root of roots) {
    if (!existsSync(root)) continue;
    // Any pinned chromium revision works; prefer the newest by name sort.
    const dirs = readdirSync(root)
      .filter((d) => /^chromium-?\d*$/.test(d) || /^chromium_headless_shell/.test(d) === false)
      .sort()
      .reverse();
    for (const d of dirs) {
      const candidates = [
        join(root, d, 'chrome-win64', 'chrome.exe'),
        join(root, d, 'chrome-win', 'chrome.exe'),
        join(root, d, 'chrome-linux', 'chrome'),
        join(root, d, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
      ];
      for (const c of candidates) {
        if (existsSync(c)) return c;
      }
    }
  }
  return undefined;
}

export function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    process.env.LOCALAPPDATA
      ? process.env.LOCALAPPDATA + '/Google/Chrome/Application/chrome.exe'
      : undefined,
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    playwrightChromium(),
  ].filter((p) => p !== undefined);
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  throw new Error('Chrome not found — set CHROME_PATH or run `npx playwright install chromium`.');
}
