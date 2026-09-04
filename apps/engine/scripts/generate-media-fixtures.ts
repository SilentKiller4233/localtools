/**
 * Deterministic Section 14.2 Media fixture generator (PROJECT_SPEC Phase 7).
 *
 * Same contract as the pdf/devtext generators: fixtures are COMMITTED so
 * CI never depends on a generation step, and this script exists to
 * (re)create them deterministically on demand:
 *   pnpm --filter @localtools/engine exec tsx scripts/generate-fixtures.ts
 *
 * Provenance/licensing (Section 14.2 "license-clear"): every fixture is
 * SELF-GENERATED — ffmpeg synthesizes the video/audio from test sources
 * (testsrc video pattern + sine audio tone) and the SRT is hand-written
 * text. No third-party media is used anywhere; there is nothing to
 * attribute. The ffmpeg binary used to generate them is the repo-local
 * BtbN static build (documented in DECISIONS.md D-020).
 *
 * Fixtures:
 *   sample-short.mp4  — 3s, 320x240, h264+aac (the canonical media input)
 *   sample-short.mp3  — 3s, sine tone, 44.1kHz
 *   sample.gif       — 1s, 160x120 animated GIF (gif-to-video input)
 *   malformed.mp4    — sample-short.mp4 truncated at 40% of its bytes
 *   sample.srt       — 2 cues timed inside the 3s window
 *   sample.vtt       — the same cues in WebVTT form (round-trip sniffing)
 *
 * The engine's tests read these from fixtures/media/ at repo root.
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';

const REPO_ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..');
const OUT_DIR = join(REPO_ROOT, 'fixtures', 'media');

/** ffmpeg/ffprobe resolution — mirrors src/tool-paths.ts (dev host only). */
async function resolveFfmpeg(): Promise<{ ffmpeg: string; ffprobe: string }> {
  const ffmpegOverride = process.env['LOCALTOOLS_FFMPEG_PATH'];
  if (ffmpegOverride !== undefined) {
    return {
      ffmpeg: ffmpegOverride,
      ffprobe: process.env['LOCALTOOLS_FFPROBE_PATH'] ?? join(ffmpegOverride, '..', 'ffprobe'),
    };
  }
  // scan repo root for ffmpeg-<ver>/bin (same sort/pick rule as the engine)
  const fsSync = await import('node:fs');
  const entries = fsSync
    .readdirSync(REPO_ROOT)
    .filter((e) => e.startsWith('ffmpeg-'))
    .sort();
  const dir = entries.at(-1);
  const isWin = process.platform === 'win32';
  if (dir !== undefined) {
    const bin = join(REPO_ROOT, dir, 'bin');
    const ffmpeg = join(bin, isWin ? 'ffmpeg.exe' : 'ffmpeg');
    const ffprobe = join(bin, isWin ? 'ffprobe.exe' : 'ffprobe');
    if (fsSync.existsSync(ffmpeg) && fsSync.existsSync(ffprobe)) return { ffmpeg, ffprobe };
  }
  return { ffmpeg: 'ffmpeg', ffprobe: 'ffprobe' };
}

/** Run ffmpeg with an argument array (Section 5.3 discipline, even here). */
function run(exe: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(exe, args, { shell: false, stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    child.stderr.on('data', (c: Buffer) => {
      err += c.toString('utf8');
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${exe} exited ${String(code)}: ${err.slice(-800)}`));
    });
  });
}

/** Write bytes only when missing (or FORCE=1) — committed-first contract. */
const FORCE = process.env['FORCE'] === '1';
function write(name: string, bytes: Uint8Array | string): void {
  const path = join(OUT_DIR, name);
  if (!FORCE && existsSync(path)) {
    console.log(`kept fixtures/media/${name} (committed)`);
    return;
  }
  writeFileSync(path, bytes);
  console.log(
    `wrote fixtures/media/${name} (${String(typeof bytes === 'string' ? bytes.length : bytes.byteLength)} bytes)`,
  );
}

async function generateAll(): Promise<void> {
  const { ffmpeg } = await resolveFfmpeg();
  const work = join(tmpdir(), `localtools-fixtures-${randomUUID()}`);
  mkdirSync(work, { recursive: true });
  mkdirSync(OUT_DIR, { recursive: true });

  // 1. sample-short.mp4 — 3s 320x240 h264+aac, fully synthetic.
  const mp4 = join(work, 'sample-short.mp4');
  await run(ffmpeg, [
    '-hide_banner',
    '-f',
    'lavfi',
    '-i',
    'testsrc=duration=3:size=320x240:rate=10',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:duration=3:sample_rate=44100',
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-shortest',
    '-y',
    mp4,
  ]);
  write('sample-short.mp4', new Uint8Array(readFileSync(mp4)));

  // 2. sample-short.mp3 — 3s 440Hz tone, 128kbps CBR.
  const mp3 = join(work, 'sample-short.mp3');
  await run(ffmpeg, [
    '-hide_banner',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:duration=3:sample_rate=44100',
    '-c:a',
    'libmp3lame',
    '-b:a',
    '128k',
    '-y',
    mp3,
  ]);
  write('sample-short.mp3', new Uint8Array(readFileSync(mp3)));

  // 3. sample.gif — 1s animated GIF from the same test source.
  const gif = join(work, 'sample.gif');
  await run(ffmpeg, [
    '-hide_banner',
    '-f',
    'lavfi',
    '-i',
    'testsrc=duration=1:size=160x120:rate=8',
    '-vf',
    'split[a][b];[a]palettegen[p];[b][p]paletteuse',
    '-y',
    gif,
  ]);
  write('sample.gif', new Uint8Array(readFileSync(gif)));

  // 4. malformed.mp4 — sample-short.mp4 truncated at 40% (mid-moov).
  const full = readFileSync(mp4);
  write('malformed.mp4', full.subarray(0, Math.floor(full.byteLength * 0.4)));

  // 5. sample.srt — 2 cues inside the 3s window.
  const srt = [
    '1',
    '00:00:00,200 --> 00:00:01,400',
    'Hello LocalTools',
    '',
    '2',
    '00:00:01,600 --> 00:00:02,800',
    'Burned subtitle fixture',
    '',
    '',
  ].join('\n');
  write('sample.srt', srt);

  // 6. sample.vtt — same cues, WebVTT form.
  const vtt = [
    'WEBVTT',
    '',
    '1',
    '00:00:00.200 --> 00:00:01.400',
    'Hello LocalTools',
    '',
    '2',
    '00:00:01.600 --> 00:00:02.800',
    'Burned subtitle fixture',
    '',
    '',
  ].join('\n');
  write('sample.vtt', vtt);
}

await generateAll();
