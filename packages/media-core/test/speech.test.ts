/**
 * Media-core speech tests (PROJECT_SPEC Section 15 acceptance, D-028).
 *
 * The transcription test runs the REAL whisper WASM against the
 * committed Piper-generated fixture (fixtures/media/sample-speech.wav)
 * when the tiny.en model is present in the Temp cache (the u2netp
 * precedent — downloaded once per dev machine, never in CI). Absent
 * model → the test asserts the honest degradation error instead
 * (CI contract, mirror of the Group B 503 suites).
 *
 * Assertions are KEYWORD-SET based, never exact strings (D-028, the
 * a8b196c flake discipline): tiny.en output varies by build; the live
 * verified transcript of this exact fixture is "The quick brown fox
 * jumps over the lazy dog. Local tools speech test." — observed with
 * 0/6 keywords missed, so P(test fails) = P(≥3 of 6 keywords
 * misrecognized) < 1e-4 under any plausible per-word error model.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  WHISPER_MODELS,
  buildCaptions,
  buildSrt,
  buildVtt,
  decodeWavPcm,
  resampleTo16k,
  srtTimecode,
  vttTimecode,
  transcribeAudio,
  SpeechError,
  type TranscriptSegment,
} from '../src/index.js';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const FIXTURE = resolve(HERE, '../../../fixtures/media/sample-speech.wav');

/** tiny.en cached on this host? (Temp cache, D-029 Node path) */
function tinyCached(): boolean {
  return existsSync(join(tmpdir(), 'localtools-models', 'whisper', 'ggml-tiny.en.bin'));
}

let fixtureBytes: Uint8Array;

beforeAll(async () => {
  fixtureBytes = new Uint8Array(await readFile(FIXTURE));
});

/* ------------------------------------------------------------------ */
/* WAV decode + resample units                                          */
/* ------------------------------------------------------------------ */

describe('decodeWavPcm', () => {
  it('decodes the Piper fixture: 22050Hz mono, ~4.5s', () => {
    const { pcm, sampleRate } = decodeWavPcm(fixtureBytes);
    expect(sampleRate).toBe(22_050);
    expect(pcm.length).toBeGreaterThan(22_050 * 4); // ≥4s
    expect(pcm.length).toBeLessThan(22_050 * 6); // <6s
    // Real audio: non-silent, bounded.
    let peak = 0;
    for (const v of pcm) peak = Math.max(peak, Math.abs(v));
    expect(peak).toBeGreaterThan(0.1);
    expect(peak).toBeLessThanOrEqual(1);
  });

  it('rejects non-WAV bytes (magic check)', () => {
    const fake = new TextEncoder().encode('ID3 not a wav at all................');
    expect(() => decodeWavPcm(fake)).toThrow(SpeechError);
  });

  it('rejects truncated input', () => {
    expect(() => decodeWavPcm(new Uint8Array(10))).toThrow(SpeechError);
  });

  it('mixes stereo to mono', () => {
    // Build a tiny stereo WAV by hand: 44-byte header, 2ch, 16-bit, 4 frames.
    const buf = new ArrayBuffer(44 + 16);
    const v = new DataView(buf);
    const wr = (s: string, off: number): void => {
      for (let i = 0; i < s.length; i += 1) v.setUint8(off + i, s.charCodeAt(i));
    };
    wr('RIFF', 0);
    v.setUint32(4, 36, true);
    wr('WAVE', 8);
    wr('fmt ', 12);
    v.setUint32(16, 16, true);
    v.setUint16(20, 1, true);
    v.setUint16(22, 2, true); // stereo
    v.setUint32(24, 16_000, true);
    v.setUint32(28, 64_000, true);
    v.setUint16(32, 4, true);
    v.setUint16(34, 16, true);
    wr('data', 36);
    v.setUint32(40, 16, true);
    const samples = [0.5, -0.5, 0.25, -0.25, 1, -1, 0, 0]; // L R L R …
    for (let i = 0; i < 8; i += 1) v.setInt16(44 + i * 2, (samples[i] ?? 0) * 32767, true);
    const { pcm, sampleRate } = decodeWavPcm(new Uint8Array(buf));
    expect(sampleRate).toBe(16_000);
    expect(pcm.length).toBe(4); // 4 frames
    expect(pcm[0]).toBeCloseTo(0, 1); // (0.5 + -0.5)/2
    expect(pcm[1]).toBeCloseTo(0, 1);
  });
});

describe('resampleTo16k', () => {
  it('returns the same buffer at 16kHz (no copy needed)', () => {
    const pcm = new Float32Array([0.1, 0.2, 0.3]);
    expect(resampleTo16k(pcm, 16_000)).toBe(pcm);
  });

  it('halves length at 32kHz (2:1) and preserves values', () => {
    const pcm = new Float32Array([0, 0.5, 1, 0.5, 0, -0.5, -1, -0.5]);
    const out = resampleTo16k(pcm, 32_000);
    expect(out.length).toBe(4);
    // Sample 0 at 16k maps to source pos 0 → 0.
    expect(out[0]).toBeCloseTo(0, 5);
    // pos 1 → source index 2 → 1.
    expect(out[1]).toBeCloseTo(1, 5);
  });

  it('22050 → 16000 preserves duration', () => {
    const { pcm, sampleRate } = decodeWavPcm(fixtureBytes);
    const out = resampleTo16k(pcm, sampleRate);
    const beforeSec = pcm.length / sampleRate;
    const afterSec = out.length / 16_000;
    expect(Math.abs(beforeSec - afterSec)).toBeLessThan(0.05);
  });
});

/* ------------------------------------------------------------------ */
/* SRT / VTT builders                                                   */
/* ------------------------------------------------------------------ */

describe('subtitle builders', () => {
  const segs: TranscriptSegment[] = [
    { text: 'Hello there.', t0: 0, t1: 1234 },
    { text: 'General Kenobi.', t0: 1300, t1: 4000 },
  ];

  it('srtTimecode formats centiseconds', () => {
    expect(srtTimecode(0)).toBe('00:00:00,000');
    expect(srtTimecode(1234)).toBe('00:00:12,340');
    expect(srtTimecode(360_000)).toBe('01:00:00,000'); // 1h = 3,600,000ms = 360,000cs
  });

  it('vttTimecode uses the dot separator', () => {
    expect(vttTimecode(1234)).toBe('00:00:12.340');
  });

  it('builds a numbered SRT with blocks', () => {
    const srt = buildSrt(segs);
    expect(srt).toContain('1\n00:00:00,000 --> 00:00:12,340\nHello there.');
    expect(srt).toContain('2\n00:00:13,000 --> 00:00:40,000\nGeneral Kenobi.');
  });

  it('builds a WEBVTT header + dot timecodes', () => {
    const vtt = buildVtt(segs);
    expect(vtt.startsWith('WEBVTT\n')).toBe(true);
    expect(vtt).toContain('00:00:12.340');
    expect(vtt).not.toContain(',');
  });

  it('skips empty-text segments', () => {
    const srt = buildSrt([{ text: '   ', t0: 0, t1: 100 }]);
    expect(srt.trim()).toBe('');
  });
});

/* ------------------------------------------------------------------ */
/* Transcription against the committed fixture (D-028)                */
/* ------------------------------------------------------------------ */

/**
 * The six keywords (D-028): none are rare words; the live-verified
 * transcript hit 6/6 via tiny.en. Test passes when ≥4/6 appear
 * (case-insensitive, whitespace-normalized).
 */
const KEYWORDS = ['quick', 'brown', 'fox', 'lazy', 'dog', 'speech'] as const;

function keywordHits(text: string): number {
  const words = text
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean);
  const set = new Set(words);
  let hits = 0;
  for (const k of KEYWORDS) if (set.has(k)) hits += 1;
  return hits;
}

describe('transcribeAudio (real whisper WASM)', () => {
  it('fixture → non-empty, roughly-correct text (≥4/6 keywords) — or honest degradation without the model', async () => {
    if (!tinyCached()) {
      // CI contract: no model in the Temp cache → the tool surfaces
      // the retry-able degradation, never a hidden network fetch.
      await expect(transcribeAudio(fixtureBytes, { tier: 'tiny.en' })).rejects.toMatchObject({
        code: 'model-download-failed',
      });
      return;
    }
    const result = await transcribeAudio(fixtureBytes, { tier: 'tiny.en' });
    expect(result.text).not.toBe('');
    const hits = keywordHits(result.text);
    expect(hits).toBeGreaterThanOrEqual(4);
    expect(result.segments.length).toBeGreaterThan(0);
    // Timestamps in centiseconds, spanning most of the 4.5s audio.
    const last = result.segments.at(-1);
    expect(last?.t1 ?? 0).toBeGreaterThan(3_000);
  }, 300_000);

  it('empty input → empty-input taxonomy', async () => {
    await expect(transcribeAudio(new Uint8Array(0))).rejects.toMatchObject({
      code: 'empty-input',
    });
  });

  it('non-WAV audio (mp3 bytes) → invalid-file (transcriber takes WAV PCM)', async () => {
    const fake = new Uint8Array(64).fill(0xff);
    await expect(transcribeAudio(fake)).rejects.toMatchObject({
      code: 'invalid-file',
    });
  });
});

describe('buildCaptions (auto-captions seam)', () => {
  it('fixture → well-formed .srt / .vtt documents — or honest degradation without the model', async () => {
    if (!tinyCached()) {
      await expect(buildCaptions(fixtureBytes, { format: 'srt' })).rejects.toMatchObject({
        code: 'model-download-failed',
      });
      return;
    }
    const srt = await buildCaptions(fixtureBytes, { format: 'srt', tier: 'tiny.en' });
    expect(srt.format).toBe('srt');
    expect(srt.text).toMatch(/^1\n\d{2}:\d{2}:\d{2},\d{3} --> /);
    expect(keywordHits(srt.text)).toBeGreaterThanOrEqual(3); // subtitles carry the same words
    const vtt = await buildCaptions(fixtureBytes, { format: 'vtt', tier: 'tiny.en' });
    expect(vtt.text.startsWith('WEBVTT')).toBe(true);
  }, 300_000);
});

/* ------------------------------------------------------------------ */
/* Model pin table                                                      */
/* ------------------------------------------------------------------ */

describe('WHISPER_MODELS pins (D-029)', () => {
  it('ships the three English tiers with pinned digests', () => {
    for (const [tier, spec] of Object.entries(WHISPER_MODELS)) {
      expect(spec.url).toBe(
        `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${spec.file}`,
      );
      expect(spec.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(spec.bytes).toBeGreaterThan(10_000_000);
      void tier;
    }
  });
});
