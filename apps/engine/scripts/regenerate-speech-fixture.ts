/**
 * Regenerate fixtures/media/sample-speech.wav (DECISIONS.md D-028).
 *
 * The fixture is a ~4.5s 22050Hz mono WAV of the fixed phrase
 *   "The quick brown fox jumps over the lazy dog. LocalTools speech test."
 * spoken by Piper (en_US-lessac-medium, MIT-licensed voice from
 * rhasspy/piper-voices on Hugging Face). License-clear by construction:
 * our own words, synthesized by MIT-licensed tools — no third-party
 * recording. The committed bytes are the source of truth for tests; this
 * script exists to document provenance and allow regeneration when the
 * pinned voice ever changes (the committed fixture would be replaced via
 * a reviewable diff, NOT regenerated silently at test time — CI has no
 * Piper and tests never depend on this script running).
 *
 * Usage (dev machine with the repo-local portable piper):
 *   pnpm --filter @localtools/engine exec tsx scripts/regenerate-speech-fixture.ts
 * Requires the voice model; if the lazy cache is cold the script fails
 * with instructions (it never downloads by itself — voices.ts owns that).
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..');
const OUT = join(REPO_ROOT, 'fixtures', 'media', 'sample-speech.wav');

/** The fixed phrase — every assertion in speech tests is keyed to it. */
export const SPEECH_FIXTURE_PHRASE =
  'The quick brown fox jumps over the lazy dog. LocalTools speech test.';

function findPiper(): string | undefined {
  const override = process.env['LOCALTOOLS_PIPER_PATH'];
  if (override !== undefined && override !== '') return override;
  // Repo-local portable build (piper-<tag>/piper[.exe]) — gitignored.
  try {
    const dir = readdirSync(REPO_ROOT)
      .filter((e) => /^piper-\d/.test(e))
      .sort()
      .at(-1);
    if (dir !== undefined) {
      const exe = process.platform === 'win32' ? 'piper.exe' : 'piper';
      const candidate = join(REPO_ROOT, dir, exe);
      if (existsSync(candidate)) return candidate;
    }
  } catch {
    // fall through
  }
  if (existsSync('/opt/piper/piper')) return '/opt/piper/piper';
  return undefined;
}

function findVoice(): { onnx: string; json: string } | undefined {
  // Voice cache locations (mirrors voices.ts): LOCALTOOLS_VOICE_DIR, then
  // <tmpdir>/localtools-models/piper-voices.
  const candidates = [
    process.env['LOCALTOOLS_VOICE_DIR'],
    join(tmpdir(), 'localtools-models', 'piper-voices'),
  ].filter((d): d is string => d !== undefined && d !== '');
  for (const dir of candidates) {
    const onnx = join(dir, 'en_US-lessac-medium.onnx');
    const json = `${onnx}.json`;
    if (existsSync(onnx) && existsSync(json)) return { onnx, json };
  }
  return undefined;
}

// Self-contained driver; node-builtin imports only.
function main(): void {
  const piper = findPiper();
  if (piper === undefined) {
    console.error(
      'piper not found: install the repo-local portable build (see DECISIONS.md D-030) or set LOCALTOOLS_PIPER_PATH.',
    );
    process.exit(1);
  }
  const voice = findVoice();
  if (voice === undefined) {
    console.error(
      'en_US-lessac-medium voice not found in the cache. Run any text-to-speech request once (the engine lazy-downloads it), or place the .onnx/.onnx.json pair in the voice cache dir.',
    );
    process.exit(1);
  }

  // Arg arrays only (Section 5.3 discipline extends to repo scripts).
  const result = spawnSync(
    piper,
    ['--model', voice.onnx, '--config', voice.json, '--output_file', OUT],
    {
      stdio: ['pipe', 'inherit', 'inherit'],
      input: SPEECH_FIXTURE_PHRASE,
      shell: false,
      encoding: 'utf8' as const,
    },
  );
  if (result.error !== undefined || result.status !== 0) {
    console.error('piper failed — fixture NOT replaced.');
    process.exit(1);
  }
  const bytes = readFileSync(OUT);
  if (bytes.byteLength < 10_000 || bytes.byteLength > 1_000_000) {
    console.error(`suspicious output size (${String(bytes.byteLength)} bytes) — not replacing.`);
    process.exit(1);
  }
  console.log(`OK: ${OUT} (${String(bytes.byteLength)} bytes)`);
  console.log('Phrase:', SPEECH_FIXTURE_PHRASE);
}

main();
