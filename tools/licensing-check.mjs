/**
 * Section 14.8 licensing/documentation check: the required notes must be
 * present in DECISIONS.md. The spec's list, mapped to what this repo's
 * DECISIONS.md actually contains (each is an existing decision entry):
 *
 *   - Ghostscript's AGPL/subprocess-boundary reasoning        → D-001 + D-015-era notes; grep for the reasoning, not just the word
 *   - ffmpeg's license build variant chosen                   → D-020
 *   - @imgly/background-removal's license status / fallback   → D-016 (the fallback WAS chosen)
 *   - RAR extraction-only licensing constraint (if built)      → D-001 forward constraint — v1 does not build it, so the note must say so
 *   - the mocked-downloader-testing decision                   → D-026
 *
 * Runs anywhere (no deps) — part of `pnpm verify` and the CI licensing job.
 * Usage: node tools/licensing-check.mjs   (from repo root)
 * Exit:  0 + LICENSING_CHECK_PASS, or 1 with the missing-note list.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const decisionsPath = join(here, '..', 'DECISIONS.md');
const text = readFileSync(decisionsPath, 'utf8');
const lower = text.toLowerCase();

const missing = [];

/** Each requirement: a short label + regexes that must ALL match (case-insensitive). */
const required = [
  {
    label: 'Ghostscript AGPL + subprocess-boundary reasoning',
    all: [/ghostscript[\s\S]{0,400}agpl/i, /agpl[\s\S]{0,600}subprocess/i],
  },
  {
    label: 'ffmpeg license build variant chosen',
    all: [/d-020[\s\S]{0,200}gpl/i, /ffmpeg[\s\S]{0,300}subprocess/i],
  },
  {
    label: '@imgly/background-removal license status / fallback',
    all: [/@imgly\/background-removal[\s\S]{0,300}agpl/i, /d-016[\s\S]{0,600}(onnx|fallback)/i],
  },
  {
    label: 'RAR extraction-only constraint (not built in v1)',
    all: [/rar[\s\S]{0,300}extraction/i, /unrar/i],
  },
  {
    label: 'mocked-downloader-testing decision',
    all: [/d-026[\s\S]{0,400}mock/i],
  },
];

for (const req of required) {
  const ok = req.all.every((re) => re.test(text) || re.test(lower));
  if (!ok) missing.push(req.label);
  console.log(`${ok ? 'PASS' : 'MISS'}  ${req.label}`);
}

if (missing.length > 0) {
  console.error(`LICENSING_CHECK_FAIL: missing notes — ${missing.join('; ')}`);
  process.exit(1);
}
console.log('LICENSING_CHECK_PASS');
