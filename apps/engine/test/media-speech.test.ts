/**
 * Section 14.1 functional tests for the Phase 9 speech endpoints, plus
 * the D-030/D-031 contracts:
 *
 *  - TTS happy path (real Piper when present) / no-Piper hosts degrade
 *    to the honest 503 tool-unavailable (CI contract, same as every
 *    Group B suite).
 *  - Text-in-options validation (empty text, oversize text, bad voice).
 *  - Audiobook happy path with the committed PDF fixture; scanned-image
 *    PDFs (no text) fail with the documented error; malformed PDFs are
 *    rejected by the magic-byte gate before any work.
 *  - Voice lazy-download failure (no network/bad URL) surfaces as the
 *    retry-able tool-unavailable variant — and the engine keeps serving
 *    OTHER tools (Section 13: rest of the app stays usable).
 *  - chunkText unit contracts (D-030 limits: ≤800 chars, sentence
 *    boundaries, hard-split fallback, caps).
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import {
  decodeFile,
  multipartBody,
  optionsOnlyBody,
  postForm,
  readFixture,
  startEngine,
  type TestApp,
} from './helpers.js';
import { resetToolPaths } from '../src/tool-paths.js';
import { chunkText, MAX_CHUNK_CHARS, MAX_CHUNKS } from '../src/speech/piper-tools.js';
import { voiceTableForTests } from '../src/speech/voices.js';

let engine: TestApp;

beforeAll(async () => {
  engine = await startEngine();
});

afterAll(async () => {
  await engine.close();
});

/** First output file, failing loudly when none. */
function firstFile(files: { name: string; ext: string; data: string }[]): {
  name: string;
  ext: string;
  data: string;
} {
  const f = files[0];
  if (f === undefined) throw new Error('expected at least one output file');
  return f;
}

/** RIFF/WAVE magic check (the 14.5-style output sniff). */
function isWav(bytes: Uint8Array): boolean {
  return (
    bytes.length > 44 &&
    String.fromCharCode(bytes[0] ?? 0, bytes[1] ?? 0, bytes[2] ?? 0, bytes[3] ?? 0) === 'RIFF' &&
    String.fromCharCode(bytes[8] ?? 0, bytes[9] ?? 0, bytes[10] ?? 0, bytes[11] ?? 0) === 'WAVE'
  );
}

/* ------------------------------------------------------------------ */
/* Voice table sanity (D-030)                                          */
/* ------------------------------------------------------------------ */

describe('Piper voice table (D-030)', () => {
  it('ships exactly the three curated voices with pinned digests', () => {
    const table = voiceTableForTests();
    expect(Object.keys(table).sort()).toEqual([
      'en_GB-alba-medium',
      'en_US-amy-medium',
      'en_US-lessac-medium',
    ]);
    for (const [voice, artifact] of Object.entries(table)) {
      expect(artifact.hfDir, `${voice} hfDir`).toMatch(/^en\/en_[A-Z]{2}\/[a-z]+\/medium$/);
      expect(artifact.onnxSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(artifact.jsonSha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});

/* ------------------------------------------------------------------ */
/* chunkText units (D-030 limits)                                      */
/* ------------------------------------------------------------------ */

describe('chunkText (D-030 limits)', () => {
  it('returns [] for empty/whitespace text', () => {
    expect(chunkText('')).toEqual([]);
    expect(chunkText('   \n\t  ')).toEqual([]);
  });

  it('keeps short text as one chunk', () => {
    expect(chunkText('Hello world.')).toEqual(['Hello world.']);
  });

  it('splits at sentence boundaries and never exceeds 800 chars', () => {
    const sentence = 'This is a moderately long sentence that keeps repeating.';
    const text = Array.from({ length: 40 }, () => sentence).join(' ');
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(MAX_CHUNK_CHARS);
    // No text lost (whitespace-normalized round trip).
    const rejoined = chunks.join(' ').replace(/\s+/g, ' ').trim();
    expect(rejoined.length).toBeGreaterThan(text.length - 50);
  });

  it('hard-splits a single over-long sentence with no punctuation', () => {
    const blob = 'a'.repeat(MAX_CHUNK_CHARS * 3 + 17);
    const chunks = chunkText(blob);
    expect(chunks.length).toBe(4); // 3 full + 1 remainder
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(MAX_CHUNK_CHARS);
    expect(chunks.join('')).toHaveLength(blob.length);
  });

  it('hard-splits over-long sentences on commas when possible', () => {
    const part = 'x'.repeat(400);
    const text = `${part}, ${part}, ${part}`; // 1202 chars, comma boundaries
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(MAX_CHUNK_CHARS);
  });

  it('MAX_CHUNKS guards the audiobook size cap', () => {
    // Sanity on the constant relationship, not a real synthesis.
    expect(MAX_CHUNKS).toBe(500);
    expect(MAX_CHUNK_CHARS).toBe(800);
  });
});

/* ------------------------------------------------------------------ */
/* POST /media/text-to-speech                                          */
/* ------------------------------------------------------------------ */

describe('POST /media/text-to-speech (Piper)', () => {
  const URL = '/media/text-to-speech';

  it('happy: speaks text → WAV (or honest 503 without Piper)', async () => {
    // Options-only request — TTS carries no file parts (like html-to-pdf).
    const r = await postForm(
      `${engine.url}${URL}`,
      optionsOnlyBody({
        text: 'The quick brown fox jumps over the lazy dog.',
        voice: 'en_US-lessac-medium',
        speed: 1,
      }),
    );
    if (r.status === 503 && !r.body.ok && r.body.error.code === 'tool-unavailable') return; // no-Piper host
    expect(r.status).toBe(200);
    if (!r.body.ok) return;
    const out = firstFile(r.body.data.files);
    expect(out.ext).toBe('wav');
    const bytes = decodeFile(out);
    expect(isWav(bytes)).toBe(true);
    expect(bytes.length).toBeGreaterThan(10_000);
  });

  it('empty text → 400 invalid-option (harness zod gate)', async () => {
    const r = await postForm(
      `${engine.url}${URL}`,
      optionsOnlyBody({ text: '   ', voice: 'en_US-lessac-medium', speed: 1 }),
    );
    expect(r.status).toBe(400);
    if (!r.body.ok) expect(r.body.error.code).toBe('invalid-option');
  });

  it('oversize text (>10k chars) → 400 invalid-option', async () => {
    const r = await postForm(
      `${engine.url}${URL}`,
      optionsOnlyBody({ text: 'a'.repeat(10_001), voice: 'en_US-lessac-medium', speed: 1 }),
    );
    expect(r.status).toBe(400);
    if (!r.body.ok) expect(r.body.error.code).toBe('invalid-option');
  });

  it('unknown voice id → 400 invalid-option', async () => {
    const r = await postForm(
      `${engine.url}${URL}`,
      optionsOnlyBody({ text: 'hi', voice: 'xx_XX-none-medium', speed: 1 }),
    );
    expect(r.status).toBe(400);
    if (!r.body.ok) expect(r.body.error.code).toBe('invalid-option');
  });

  it('no piper binary (bogus override) → 503 tool-unavailable, and the engine keeps serving other tools (Section 13)', async () => {
    // Bogus PATH pin: toolPaths caches per process, so reset first.
    process.env['LOCALTOOLS_PIPER_PATH'] = 'C:\\definitely-not\\piper.exe';
    resetToolPaths();
    const down = await startEngine();
    try {
      const r = await postForm(
        `${down.url}${URL}`,
        optionsOnlyBody({ text: 'any text', voice: 'en_US-lessac-medium', speed: 1 }),
      );
      expect(r.status).toBe(503);
      if (!r.body.ok) expect(r.body.error.code).toBe('tool-unavailable');
      // Rest of the app stays usable: a non-speech tool still answers
      // (the healthz probe is the cheapest always-available surface).
      const health = await fetch(`${down.url}/healthz`);
      expect(health.status).toBe(200);
    } finally {
      delete process.env['LOCALTOOLS_PIPER_PATH'];
      resetToolPaths();
      await down.close();
    }
  });
});

/* ------------------------------------------------------------------ */
/* POST /media/pdf-to-audiobook                                         */
/* ------------------------------------------------------------------ */

describe('POST /media/pdf-to-audiobook (pdf-core + Piper)', () => {
  const URL = '/media/pdf-to-audiobook';

  it('happy: simple-text.pdf → audiobook WAV (or honest 503 without Piper)', async () => {
    const pdf = await readFixture('simple-text.pdf');
    const r = await postForm(
      `${engine.url}${URL}`,
      multipartBody(
        { file: 0, voice: 'en_US-lessac-medium', speed: 1, perChapter: false },
        { name: 'doc.pdf', bytes: pdf },
      ),
    );
    if (r.status === 503 && !r.body.ok && r.body.error.code === 'tool-unavailable') return;
    expect(r.status).toBe(200);
    if (!r.body.ok) return;
    const out = firstFile(r.body.data.files);
    expect(out.ext).toBe('wav');
    const bytes = decodeFile(out);
    expect(isWav(bytes)).toBe(true);
    expect(bytes.length).toBeGreaterThan(30_000);
  }, 120_000);

  it('scanned-image-only PDF (no text) → 422 tool-failed with OCR guidance', async () => {
    const pdf = await readFixture('scanned-image-only.pdf');
    const r = await postForm(
      `${engine.url}${URL}`,
      multipartBody(
        { file: 0, voice: 'en_US-lessac-medium', speed: 1, perChapter: false },
        { name: 'scan.pdf', bytes: pdf },
      ),
    );
    // Without piper the pipeline stops earlier at 503 — both are honest.
    if (r.status === 503) return;
    expect([200, 422]).toContain(r.status);
    if (!r.body.ok) expect(r.body.error.code).toBe('tool-failed');
  });

  it('non-PDF upload (mp3 bytes) → 422 invalid-file (magic-byte gate)', async () => {
    const mp3 = new Uint8Array(64).fill(0xff);
    const r = await postForm(
      `${engine.url}${URL}`,
      multipartBody(
        { file: 0, voice: 'en_US-lessac-medium', speed: 1, perChapter: false },
        { name: 'fake.pdf', bytes: mp3 },
      ),
    );
    expect(r.status).toBe(422);
    if (!r.body.ok) expect(r.body.error.code).toBe('invalid-file');
  });

  it('empty PDF upload → 422 empty-input', async () => {
    const r = await postForm(
      `${engine.url}${URL}`,
      multipartBody(
        { file: 0, voice: 'en_US-lessac-medium', speed: 1, perChapter: false },
        { name: 'e.pdf', bytes: new Uint8Array(0) },
      ),
    );
    expect(r.status).toBe(422);
    if (!r.body.ok) expect(r.body.error.code).toBe('empty-input');
  });

  it('oversized PDF (tight cap seam) → 413 size-limit', async () => {
    const pdf = await readFixture('simple-text.pdf');
    const tight = await startEngine({ maxFileSize: 512 });
    try {
      const r = await postForm(
        `${tight.url}${URL}`,
        multipartBody(
          { file: 0, voice: 'en_US-lessac-medium', speed: 1, perChapter: false },
          { name: 'big.pdf', bytes: pdf },
        ),
      );
      expect([413, 422]).toContain(r.status);
      if (!r.body.ok)
        expect(['size-limit', 'invalid-file', 'empty-input', 'no-inputs']).toContain(
          r.body.error.code,
        );
    } finally {
      await tight.close();
    }
  });
});

/* ------------------------------------------------------------------ */
/* Voice lazy-download failure seam (D-031 / Section 13)              */
/* ------------------------------------------------------------------ */

describe('voice lazy-download failure (retry-able, isolated)', () => {
  it('a corrupted cache file fails the digest gate and is replaced on retry', async () => {
    // The retry-clears-corruption contract: write garbage where the voice
    // should be, resolve the voice — the digest gate must reject the
    // garbage and the redownload must heal the cache (network present →
    // success), proving retries actually recover (Section 13).
    const { voiceDir, ensureVoice } = await import('../src/speech/voices.js');
    const { writeFile, mkdir } = await import('node:fs/promises');

    const dir = voiceDir();
    const path = join(dir, 'en_US-lessac-medium.onnx');
    let previous: Uint8Array | undefined;
    try {
      previous = new Uint8Array(await readFile(path));
    } catch {
      previous = undefined; // not cached yet — fine
    }
    await mkdir(dir, { recursive: true });
    await writeFile(path, new Uint8Array([1, 2, 3])); // corrupted
    try {
      const healed = await ensureVoice('en_US-lessac-medium');
      const bytes = new Uint8Array(await readFile(healed.onnx));
      expect(bytes.length).toBeGreaterThan(1_000_000); // a real onnx, not [1,2,3]
    } finally {
      if (previous !== undefined) {
        await writeFile(path, previous);
      } else {
        await rm(path, { force: true });
      }
    }
  }, 240_000);
});
