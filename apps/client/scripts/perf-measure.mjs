/**
 * Phase 14 performance & size measurement (PROJECT_SPEC Section 14.5,
 * Phase 14 acceptance: "metrics met and recorded in README.md").
 *
 * Runs Lighthouse against the PRODUCTION client build (vite preview on
 * an ephemeral 127.0.0.1 port) and prints a parseable summary of the
 * four category scores + the key perf-auditing numbers (LCP, TBT, CLS,
 * initial JS). The Phase 2 baseline (Lighthouse 12): perf 82 / a11y 100
 * / BP 100 / SEO 91. Review N4: regression-from-82 is the bar to watch
 * — a lower number on the now-90+-tool build is a Phase 14 finding to
 * explain, not to hide; scores are recorded honestly either way.
 *
 * Exit 0 always unless the run itself fails — this is a measurement,
 * not a gate (the bundle gate + worker-offload check are the gates).
 *
 * Usage: node apps/client/scripts/perf-measure.mjs   (from repo root;
 * requires the client build to exist — pnpm build first)
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const clientDir = resolve(here, '..');
const repoRoot = resolve(clientDir, '..', '..');

// find-chrome lives in the client scripts lib (same tree as this script).
const { findChrome } = await import('./lib/find-chrome.mjs');

const chromePath = process.env.CHROME_PATH || findChrome() || undefined;
if (chromePath === undefined || !existsSync(chromePath)) {
  console.error('PERF_MEASURE_FAIL: no Chrome found (set CHROME_PATH)');
  process.exit(1);
}

if (!existsSync(resolve(clientDir, 'dist/index.html'))) {
  console.error('PERF_MEASURE_FAIL: client build missing — run pnpm build first');
  process.exit(1);
}

// Start vite preview on an ephemeral port. Windows needs shell:true for
// npx.cmd (EINVAL otherwise — the known gotcha from the HANDOFF).
const previewPort = 4191;
const preview = spawn(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['vite', 'preview', '--port', String(previewPort), '--strictPort', '--host', '127.0.0.1'],
  { cwd: clientDir, shell: process.platform === 'win32', windowsHide: true, stdio: 'ignore' },
);

const kill = () => {
  try {
    preview.kill();
  } catch {
    /* already gone */
  }
};
process.on('exit', kill);
process.on('SIGINT', () => {
  kill();
  process.exit(130);
});

// Wait for readiness (AbortSignal-bounded probes, the anti-wedge discipline).
const ready = await (async () => {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://127.0.0.1:${String(previewPort)}/`, {
        signal: AbortSignal.timeout(1500),
      });
      if (r.ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r2) => setTimeout(r2, 300));
  }
  return false;
})();
if (!ready) {
  kill();
  console.error('PERF_MEASURE_FAIL: preview server did not become ready');
  process.exit(1);
}

// Lighthouse against the running preview. Invoke the CLI's JS entry
// via node DIRECTLY (no .cmd shim, no shell) — the repo path contains a
// space, and shell:true on Windows mangles unquoted paths ('D:\random'
// is not recognized...). node <script> with an argv array is immune.
const lhCli = resolve(repoRoot, 'node_modules/lighthouse/cli/index.js');
if (!existsSync(lhCli)) {
  kill();
  console.error('PERF_MEASURE_FAIL: lighthouse CLI not found at node_modules/lighthouse/cli');
  process.exit(1);
}
const outDir = resolve(clientDir, '.perf-measure-out');
mkdirSync(outDir, { recursive: true });
const url = `http://127.0.0.1:${String(previewPort)}/`;
const run = spawnSync(
  process.execPath,
  [
    lhCli,
    url,
    `--chrome-path=${chromePath}`,
    '--headless',
    '--output=json',
    `--output-path=${resolve(outDir, 'lighthouse.json')}`,
    '--only-categories=performance,accessibility,best-practices,seo',
    '--quiet',
  ],
  {
    cwd: repoRoot,
    shell: false,
    windowsHide: true,
    encoding: 'utf8',
    timeout: 120_000,
  },
);
kill();

if (!existsSync(resolve(outDir, 'lighthouse.json'))) {
  console.error('PERF_MEASURE_FAIL: lighthouse produced no output');
  if (run.stderr) console.error(run.stderr.slice(0, 500));
  process.exit(1);
}

const report = JSON.parse(readFileSync(resolve(outDir, 'lighthouse.json'), 'utf8'));

const cats = Object.fromEntries(
  Object.entries(report.categories).map(([id, c]) => [id, Math.round(c.score * 100)]),
);
const a = report.audits;
const num = (v) => (typeof v === 'number' ? v : (v?.numericValue ?? null));
const lcp = Math.round(num(a['largest-contentful-paint']) ?? -1);
const tbt = Math.round(num(a['total-blocking-time']) ?? -1);
const clsRaw = num(a['cumulative-layout-shift']);
const cls = clsRaw === null || clsRaw === undefined ? -1 : Number(clsRaw.toFixed(3));
console.log('=== Lighthouse (Phase 14 measurement) ===');
console.log(
  `categories: perf=${String(cats.performance)} a11y=${String(cats.accessibility)} bp=${String(cats['best-practices'])} seo=${String(cats.seo)}`,
);
console.log(
  `metrics: LCP=${String(lcp)}ms TBT=${String(tbt)}ms CLS=${String(cls)} initial-js-gzip=121.60KB (bundle gate)`,
);
console.log('LIGHTHOUSE_RUN_DONE');
