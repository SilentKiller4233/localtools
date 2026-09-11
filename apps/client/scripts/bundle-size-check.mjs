/**
 * Section 14.5 bundle-size gate: the client's INITIAL gzipped JS budget is
 * 250KB. "Initial" = every chunk the index.html module graph loads before
 * any lazy route/worker fires (Vite emits these in
 * `.vite/manifest.json` as entry + the CSS/JS chunks it statically
 * imports; dynamic imports are the per-tool lazy chunks and are NOT
 * initial).
 *
 * Resolves the manifest from the built dist/ — no browser needed, so it
 * runs as a plain post-build step in `pnpm verify` and in CI.
 *
 * Usage: node scripts/bundle-size-check.mjs
 * Exit:  0 + BUNDLE_SIZE_PASS  (under budget)
 *        0 + BUNDLE_SIZE_WARN  (within 10% of budget — recorded, not fatal)
 *        1                     (over budget)
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, '..', 'dist');
const BUDGET_BYTES = 250 * 1024;

const manifestPath = join(dist, '.vite', 'manifest.json');
if (!existsSync(manifestPath)) {
  console.error('bundle-size-check: dist/.vite/manifest.json not found — run `pnpm build` first.');
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

// Find the html entry — Vite marks it isEntry:true with src ending in .html
// (its `file` points at the emitted JS chunk for that html).
const entryKey = Object.keys(manifest).find(
  (k) => manifest[k].isEntry === true && (manifest[k].src ?? k).endsWith('.html'),
);
if (entryKey === undefined) {
  console.error('bundle-size-check: no html entry in manifest.');
  process.exit(1);
}

// Walk the STATIC module graph of the entry (file + imports, recursive).
// dynamicImports are lazy-loaded per tool/suite — excluded by design.
const initial = new Set();
const visit = (key) => {
  if (initial.has(key)) return;
  const chunk = manifest[key];
  if (chunk === undefined) return;
  initial.add(key);
  for (const imp of chunk.imports ?? []) visit(imp);
  for (const css of chunk.css ?? []) initial.add(`css:${css}`);
};
visit(entryKey);

let totalRaw = 0;
let totalGzip = 0;
const parts = [];
for (const key of initial) {
  const isCss = key.startsWith('css:');
  const file = isCss ? key.slice(4) : manifest[key].file;
  const bytes = readFileSync(join(dist, file));
  const gz = gzipSync(bytes, { level: 9 }).byteLength;
  totalRaw += bytes.byteLength;
  totalGzip += gz;
  parts.push({ file, raw: bytes.byteLength, gzip: gz });
}

parts.sort((a, b) => b.gzip - a.gzip);
console.log(`initial chunks (${parts.length}):`);
for (const p of parts) {
  console.log(
    `  ${String((p.gzip / 1024).toFixed(2)).padStart(9)}KB gz  ${String((p.raw / 1024).toFixed(2)).padStart(10)}KB raw  ${p.file}`,
  );
}
console.log(
  `total initial: ${(totalRaw / 1024).toFixed(2)}KB raw / ${(totalGzip / 1024).toFixed(2)}KB gzipped (budget 250KB)`,
);

if (totalGzip > BUDGET_BYTES) {
  console.error(`BUNDLE_SIZE_FAIL: ${(totalGzip / 1024).toFixed(2)}KB gzipped > 250KB budget.`);
  process.exit(1);
}
if (totalGzip > BUDGET_BYTES * 0.9) {
  console.log(`BUNDLE_SIZE_WARN: within 10% of the 250KB budget.`);
  process.exit(0);
}
console.log('BUNDLE_SIZE_PASS');
