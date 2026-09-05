/**
 * Media Group B tool implementations (PROJECT_SPEC Sections 3.2, 4.2, 15
 * Phase 7). Every tool: input path(s) inside the per-request temp dir →
 * output file in the same temp dir, via ffmpeg/ffprobe subprocesses.
 *
 * All subprocess calls use runSubprocess() — spawn with an ARGUMENT ARRAY,
 * `shell: false` hardcoded, SIGTERM→SIGKILL (+ taskkill /T on Windows)
 * timeout discipline (Section 5.3). ffmpeg's rich argument space is
 * exactly where a command-string temptation would live; there is none
 * here — every option is a separate array element from a zod-validated
 * enum/number, never a user string interpolated into a shell.
 *
 * ffprobe supplies the Section 14.5 sanity seam: after each conversion
 * the route asserts the output's container/codec/resolution/bitrate
 * matches the requested preset via probeMedia().
 */

import { readFile, stat } from 'node:fs/promises';
import { EngineToolError } from './errors.js';
import { runSubprocess } from './subprocess.js';
import { toolPaths, type FfmpegPaths } from './tool-paths.js';

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */

export interface RunCtx {
  timeoutMs: number;
}

/** Run ffmpeg/ffprobe; map ENOENT → tool-unavailable, non-zero → tool-failed. */
async function runTool(
  op: string,
  exe: string,
  args: readonly string[],
  ctx: RunCtx,
): Promise<{ code: number | null; stdout: string; stderr: string; timedOut: boolean }> {
  const result = await runSubprocess(exe, args, { timeoutMs: ctx.timeoutMs });
  if (result.spawnFailed) {
    throw new EngineToolError(
      'tool-unavailable',
      `This tool needs a component that isn’t installed (${op}).`,
    );
  }
  if (result.timedOut) {
    throw new EngineToolError('tool-timeout', 'The operation took too long and was stopped.');
  }
  if (result.code !== 0) {
    throw new EngineToolError(
      'tool-failed',
      'The media file could not be processed — it may be damaged or unsupported.',
    );
  }
  return result;
}

/** Assert an output file exists and is non-empty (Section 14.1). */
async function assertOutput(path: string): Promise<void> {
  try {
    const s = await stat(path);
    if (s.size > 0) return;
  } catch {
    // fall through to the error
  }
  throw new EngineToolError(
    'tool-failed',
    'The operation produced no output — the file may be damaged or unsupported.',
  );
}

/** Display-name base without extension, sanitized (same contract as PDF). */
export function baseName(displayName: string): string {
  return (
    displayName
      .replace(/\.[^.]+$/, '')
      // eslint-disable-next-line no-control-regex -- control chars are exactly what we strip
      .replace(/[\u0000-\u001f<>:"/\\|?*]/g, '')
      .slice(0, 60) || 'media'
  );
}

/** Resolve ffmpeg/ffprobe executables once per process. */
async function ff(): Promise<FfmpegPaths> {
  return toolPaths().then((p) => p.ffmpeg);
}

/* ------------------------------------------------------------------ */
/* ffprobe metadata (Section 14.5 sanity seam + per-tool decisions)    */
/* ------------------------------------------------------------------ */

export interface ProbeStream {
  codec_type: string;
  codec_name: string;
  width?: number;
  height?: number;
  duration?: number;
  bit_rate?: string;
  sample_rate?: string;
  channels?: number;
}

export interface ProbeResult {
  format: { format_name?: string; duration?: string; bit_rate?: string; nb_streams?: number };
  streams: ProbeStream[];
}

/** JSON-escaped path for filtergraph strings (escapes ':' and '\' — 14.4). */
export function filterEscape(p: string): string {
  return p.replace(/([\\:])/g, '\\$1');
}

/** Probe a media file. Returns undefined when ffprobe cannot parse it.
 * A missing ffprobe binary surfaces as tool-unavailable (the honest 503
 * degradation contract), never as a misleading tool-failed. */
export async function probeMedia(path: string, ctx: RunCtx): Promise<ProbeResult | undefined> {
  const paths = await ff();
  // -show_format/-show_streams as JSON; exit 3 on unparseable input.
  const result = await runSubprocess(
    paths.ffprobe,
    ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', path],
    { timeoutMs: Math.min(ctx.timeoutMs, 30_000) },
  );
  if (result.spawnFailed) {
    throw new EngineToolError(
      'tool-unavailable',
      'This tool needs a component that isn’t installed on this device.',
    );
  }
  if (result.timedOut) {
    throw new EngineToolError('tool-timeout', 'The operation took too long and was stopped.');
  }
  if (result.code !== 0 || result.stdout.trim().length === 0) return undefined;
  try {
    return JSON.parse(result.stdout) as ProbeResult;
  } catch {
    return undefined;
  }
}

/** True when the file has at least one video stream (vs. audio-only). */
export function probeHasVideo(p: ProbeResult | undefined): boolean {
  return p?.streams.some((s) => s.codec_type === 'video') ?? false;
}

/** Probe a file's dimensions; throws a clean tool error when absent. */
async function probeDimensions(
  path: string,
  ctx: RunCtx,
): Promise<{ width: number; height: number }> {
  const probe = await probeMedia(path, ctx);
  const video = probe?.streams.find((s) => s.codec_type === 'video');
  if (probe === undefined || video?.width === undefined || video.height === undefined) {
    throw new EngineToolError('tool-failed', 'No video stream found in this file.');
  }
  return { width: video.width, height: video.height };
}

/* ------------------------------------------------------------------ */
/* Encoder presets (Section 3.2: CRF/bitrate small/balanced/high-q)    */
/* ------------------------------------------------------------------ */

/**
 * Video encoder args per container. libx264 (H.264) for mp4/mov/mkv/avi,
 * libvpx-vp9 for webm. CRF quality: 28=small, 23=balanced, 20=high-quality.
 * `-preset` is the x264/vp9 SPEED preset, not the quality one.
 */
export function videoEncoderArgs(
  container: string,
  quality: 'small' | 'balanced' | 'high-quality',
): string[] {
  const crf = quality === 'small' ? '28' : quality === 'high-quality' ? '20' : '23';
  if (container === 'webm') {
    const speed = quality === 'small' ? '8' : quality === 'high-quality' ? '4' : '6';
    return [
      '-c:v',
      'libvpx-vp9',
      '-crf',
      crf,
      '-b:v',
      '0',
      '-deadline',
      'good',
      '-cpu-used',
      speed,
    ];
  }
  const speed = quality === 'small' ? 'veryfast' : quality === 'high-quality' ? 'slow' : 'medium';
  return ['-c:v', 'libx264', '-crf', crf, '-preset', speed, '-pix_fmt', 'yuv420p'];
}

/** Audio encoder args per format (used by converters + extractors). */
export function audioEncoderArgs(format: string): string[] {
  switch (format) {
    case 'mp3':
      return ['-c:a', 'libmp3lame', '-q:a', '2'];
    case 'wav':
      return ['-c:a', 'pcm_s16le'];
    case 'flac':
      return ['-c:a', 'flac'];
    case 'ogg':
      return ['-c:a', 'libvorbis', '-q:a', '4'];
    case 'm4a':
    case 'aac':
      return ['-c:a', 'aac', '-b:a', '192k'];
    default:
      return ['-c:a', 'aac', '-b:a', '192k'];
  }
}

/* ------------------------------------------------------------------ */
/* The 14 Section 3.2 Group B tools                                    */
/* ------------------------------------------------------------------ */

/** 1. Video format converter (mp4/webm/mov/mkv/avi). */
export async function videoConvert(
  input: string,
  container: string,
  outPath: string,
  ctx: RunCtx,
): Promise<void> {
  const paths = await ff();
  const audio = container === 'webm' ? ['-c:a', 'libopus'] : ['-c:a', 'aac'];
  await runTool(
    'video-convert',
    paths.ffmpeg,
    [
      '-hide_banner',
      '-i',
      input,
      ...videoEncoderArgs(container, 'balanced'),
      ...audio,
      '-movflags',
      '+faststart',
      '-y',
      outPath,
    ],
    ctx,
  );
  await assertOutput(outPath);
}

/** 2. Video compressor — CRF presets + optional bitrate ceiling. */
export async function videoCompress(
  input: string,
  preset: 'small' | 'balanced' | 'high-quality',
  maxBitrateKbps: number,
  outPath: string,
  ctx: RunCtx,
): Promise<void> {
  const paths = await ff();
  const args = [
    '-hide_banner',
    '-i',
    input,
    ...videoEncoderArgs('mp4', preset),
    '-c:a',
    'aac',
    '-b:a',
    preset === 'small' ? '96k' : '128k',
  ];
  if (maxBitrateKbps > 0) {
    // Constrain the CRF output with a hard ceiling (maxrate/bufsize).
    args.push(
      '-maxrate',
      `${String(maxBitrateKbps)}k`,
      '-bufsize',
      `${String(maxBitrateKbps * 2)}k`,
    );
  }
  args.push('-movflags', '+faststart', '-y', outPath);
  await runTool('video-compress', paths.ffmpeg, args, ctx);
  await assertOutput(outPath);
}

/** 3. Video trimmer/cutter — lossless stream-copy when the codec allows. */
export async function videoTrim(
  input: string,
  startSec: number,
  endSec: number | undefined,
  durationSec: number | undefined,
  mode: 'lossless' | 'reencode',
  outPath: string,
  ctx: RunCtx,
): Promise<void> {
  const paths = await ff();
  const start = startSec > 0 ? ['-ss', String(startSec)] : [];
  const span =
    durationSec !== undefined
      ? ['-t', String(durationSec)]
      : endSec !== undefined && endSec > startSec
        ? ['-t', String(endSec - startSec)]
        : [];
  if (mode === 'lossless') {
    // Stream copy: fast, no quality loss, but cuts land on keyframes and
    // the output keeps the input codec (any container mismatch risk is
    // the user's tradeoff; mp4-family codecs copy into mp4/mkv cleanly).
    await runTool(
      'video-trim',
      paths.ffmpeg,
      ['-hide_banner', ...start, '-i', input, ...span, '-c', 'copy', '-y', outPath],
      ctx,
    );
  } else {
    await runTool(
      'video-trim',
      paths.ffmpeg,
      [
        '-hide_banner',
        ...start,
        '-i',
        input,
        ...span,
        ...videoEncoderArgs('mp4', 'balanced'),
        '-c:a',
        'aac',
        '-y',
        outPath,
      ],
      ctx,
    );
  }
  await assertOutput(outPath);
}

/** 4. Merge/concatenate videos or audio files (same kind, one output). */
export async function mediaMerge(
  inputs: string[],
  kind: 'video' | 'audio',
  container: string,
  outPath: string,
  listPath: string,
  ctx: RunCtx,
): Promise<void> {
  const paths = await ff();
  // concat demuxer list file: one `file '<path>'` line per input. Paths
  // live inside the per-request temp dir and are written by us — the
  // content is engine-generated, never user-supplied (Section 5.3 note).
  const { writeFile } = await import('node:fs/promises');
  const list = inputs.map((p) => `file '${p.replace(/([\\'])/g, '\\$1')}'`).join('\n');
  await writeFile(listPath, `${list}\n`, 'utf8');
  if (kind === 'video') {
    // Re-encode: the concat demuxer with -c copy requires identical
    // codecs/params; heterogeneous clips are the common case, so encode.
    const audio = container === 'webm' ? ['-c:a', 'libopus'] : ['-c:a', 'aac'];
    await runTool(
      'video-merge',
      paths.ffmpeg,
      [
        '-hide_banner',
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        listPath,
        ...videoEncoderArgs(container, 'balanced'),
        ...audio,
        '-y',
        outPath,
      ],
      ctx,
    );
  } else {
    await runTool(
      'audio-merge',
      paths.ffmpeg,
      [
        '-hide_banner',
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        listPath,
        ...audioEncoderArgs('mp3'),
        '-y',
        outPath,
      ],
      ctx,
    );
  }
  await assertOutput(outPath);
}

/** 5. Extract the audio track from a video. */
export async function extractAudio(
  input: string,
  format: string,
  outPath: string,
  ctx: RunCtx,
): Promise<void> {
  const paths = await ff();
  // -vn drops video; -map 0:a:0 takes the first audio stream explicitly.
  await runTool(
    'extract-audio',
    paths.ffmpeg,
    [
      '-hide_banner',
      '-i',
      input,
      '-vn',
      '-map',
      '0:a:0',
      ...audioEncoderArgs(format),
      '-y',
      outPath,
    ],
    ctx,
  );
  await assertOutput(outPath);
}

/** 6a. Video → GIF with a generated palette (quality). */
export async function videoToGif(
  input: string,
  width: number,
  fps: number,
  startSec: number | undefined,
  durationSec: number | undefined,
  palettePath: string,
  outPath: string,
  ctx: RunCtx,
): Promise<void> {
  const paths = await ff();
  const seek = startSec !== undefined && startSec > 0 ? ['-ss', String(startSec)] : [];
  const span = durationSec !== undefined ? ['-t', String(durationSec)] : [];
  // Pass 1: generate a palette from the (possibly trimmed) clip.
  await runTool(
    'video-to-gif',
    paths.ffmpeg,
    [
      '-hide_banner',
      ...seek,
      '-i',
      input,
      ...span,
      '-vf',
      `fps=${String(fps)},scale=${String(width)}:-1:flags=lanczos,palettegen`,
      '-y',
      palettePath,
    ],
    ctx,
  );
  // Pass 2: map clip + palette through paletteuse for a good-looking GIF.
  await runTool(
    'video-to-gif',
    paths.ffmpeg,
    [
      '-hide_banner',
      ...seek,
      '-i',
      input,
      '-i',
      palettePath,
      ...span,
      '-lavfi',
      `fps=${String(fps)},scale=${String(width)}:-1:flags=lanczos[x];[x][1:v]paletteuse`,
      '-y',
      outPath,
    ],
    ctx,
  );
  await assertOutput(outPath);
}

/** 6b. GIF → video. */
export async function gifToVideo(
  input: string,
  container: string,
  outPath: string,
  ctx: RunCtx,
): Promise<void> {
  const paths = await ff();
  // GIFs are usually silent; add silence so muxers expecting an audio
  // stream don't fail. -pix_fmt yuv420p keeps GIF's palette renderable.
  const audio = container === 'webm' ? ['-c:a', 'libopus'] : ['-c:a', 'aac'];
  await runTool(
    'gif-to-video',
    paths.ffmpeg,
    [
      '-hide_banner',
      '-i',
      input,
      '-f',
      'lavfi',
      '-i',
      'anullsrc=channel_layout=stereo:sample_rate=44100',
      '-shortest',
      ...videoEncoderArgs(container, 'balanced'),
      ...audio,
      '-pix_fmt',
      'yuv420p',
      '-y',
      outPath,
    ],
    ctx,
  );
  await assertOutput(outPath);
}

/** 7. Audio format converter. */
export async function audioConvert(
  input: string,
  format: string,
  outPath: string,
  ctx: RunCtx,
): Promise<void> {
  const paths = await ff();
  await runTool(
    'audio-convert',
    paths.ffmpeg,
    ['-hide_banner', '-i', input, '-vn', ...audioEncoderArgs(format), '-y', outPath],
    ctx,
  );
  await assertOutput(outPath);
}

/** 8. Audio compressor / bitrate reducer. */
export async function audioCompress(
  input: string,
  bitrateKbps: number,
  format: string | undefined,
  outPath: string,
  ctx: RunCtx,
): Promise<void> {
  const paths = await ff();
  const target = format ?? 'mp3'; // default to mp3 (universally small)
  await runTool(
    'audio-compress',
    paths.ffmpeg,
    [
      '-hide_banner',
      '-i',
      input,
      '-vn',
      '-c:a',
      target === 'mp3'
        ? 'libmp3lame'
        : target === 'aac' || target === 'm4a'
          ? 'aac'
          : target === 'ogg'
            ? 'libvorbis'
            : target === 'flac'
              ? 'flac'
              : 'libmp3lame',
      '-b:a',
      `${String(bitrateKbps)}k`,
      '-y',
      outPath,
    ],
    ctx,
  );
  await assertOutput(outPath);
}

/** 9. Audio trimmer. */
export async function audioTrim(
  input: string,
  startSec: number,
  endSec: number | undefined,
  durationSec: number | undefined,
  outPath: string,
  ctx: RunCtx,
): Promise<void> {
  const paths = await ff();
  const start = startSec > 0 ? ['-ss', String(startSec)] : [];
  const span =
    durationSec !== undefined
      ? ['-t', String(durationSec)]
      : endSec !== undefined && endSec > startSec
        ? ['-t', String(endSec - startSec)]
        : [];
  await runTool(
    'audio-trim',
    paths.ffmpeg,
    ['-hide_banner', ...start, '-i', input, ...span, '-c', 'copy', '-y', outPath],
    ctx,
  );
  await assertOutput(outPath);
}

/** 10. Loudness normalization (EBU R128) — audio or a video's audio track. */
export async function loudnessNormalize(
  input: string,
  targetLufs: number,
  isVideo: boolean,
  container: string | undefined,
  format: string | undefined,
  outPath: string,
  ctx: RunCtx,
): Promise<void> {
  const paths = await ff();
  // Single-pass loudnorm (dynamic mode): corrects toward the target with
  // linear-mode-quality results on typical material and half the passes.
  const loudnorm = `loudnorm=I=${String(targetLufs)}:TP=-1.5:LRA=11`;
  if (isVideo) {
    const c = container ?? 'mp4';
    const audio = c === 'webm' ? ['-c:a', 'libopus'] : ['-c:a', 'aac'];
    await runTool(
      'loudness-normalize',
      paths.ffmpeg,
      ['-hide_banner', '-i', input, '-c:v', 'copy', '-af', loudnorm, ...audio, '-y', outPath],
      ctx,
    );
  } else {
    const f = format ?? 'mp3';
    const encoder =
      f === 'mp3'
        ? ['-c:a', 'libmp3lame']
        : f === 'flac'
          ? ['-c:a', 'flac']
          : f === 'ogg'
            ? ['-c:a', 'libvorbis']
            : ['-c:a', 'aac'];
    await runTool(
      'loudness-normalize',
      paths.ffmpeg,
      ['-hide_banner', '-i', input, '-af', loudnorm, ...encoder, '-y', outPath],
      ctx,
    );
  }
  await assertOutput(outPath);
}

/** 11. Burn subtitles from an uploaded .srt/.vtt (libass render). */
export async function burnSubtitles(
  video: string,
  subtitle: string,
  container: string | undefined,
  outPath: string,
  ctx: RunCtx,
): Promise<void> {
  const paths = await ff();
  const dims = await probeDimensions(video, ctx);
  // Scale the ASS playfield to the video so font sizes match; the filter
  // path is engine-controlled (temp dir) and filter-escaped (14.4).
  const vf = `scale=${String(dims.width)}:${String(dims.height)},subtitles='${filterEscape(subtitle)}'`;
  const c = container ?? 'mp4';
  const audio = c === 'webm' ? ['-c:a', 'libopus'] : ['-c:a', 'aac'];
  await runTool(
    'burn-subtitles',
    paths.ffmpeg,
    [
      '-hide_banner',
      '-i',
      video,
      '-vf',
      vf,
      ...videoEncoderArgs(c, 'balanced'),
      ...audio,
      '-y',
      outPath,
    ],
    ctx,
  );
  await assertOutput(outPath);
}

/** 12. Video resolution/aspect changer: resize, crop, or pad. */
export async function resolutionChange(
  input: string,
  mode: 'resize' | 'crop' | 'pad',
  width: number,
  height: number,
  aspect: string | undefined,
  padColor: string,
  container: string | undefined,
  outPath: string,
  ctx: RunCtx,
): Promise<void> {
  const paths = await ff();
  const dims = await probeDimensions(input, ctx);

  // Resolve the target box (w,h): explicit dims > aspect ratio > error.
  let targetW = width;
  let targetH = height;
  if (targetW === 0 && targetH === 0 && aspect !== undefined) {
    const parts = aspect.split(':').map((n) => Number(n));
    const aw = parts[0];
    const ah = parts[1];
    if (aw !== undefined && ah !== undefined && aw > 0 && ah > 0) {
      targetW = dims.width;
      targetH = Math.round((dims.width * ah) / aw);
    }
  } else if (targetW > 0 && targetH === 0) {
    targetH = Math.round((targetW * dims.height) / dims.width);
  } else if (targetH > 0 && targetW === 0) {
    targetW = Math.round((targetH * dims.width) / dims.height);
  }
  // Round to even numbers (yuv420p requires mod-2 dimensions).
  targetW = Math.max(2, targetW - (targetW % 2));
  targetH = Math.max(2, targetH - (targetH % 2));
  if (targetW === 0 || targetH === 0) {
    throw new EngineToolError(
      'invalid-option',
      'Choose a width, a height, or an aspect ratio for the new size.',
    );
  }

  let vf: string;
  if (mode === 'crop') {
    // Crop to the target aspect from the center (scale down first when the
    // source is larger than the target box, so we never upscale-crop).
    vf =
      `scale=${String(targetW)}:${String(targetH)}:force_original_aspect_ratio=increase,` +
      `crop=${String(targetW)}:${String(targetH)}`;
  } else if (mode === 'pad') {
    // Fit inside the box, pad the remainder with padColor.
    vf =
      `scale=${String(targetW)}:${String(targetH)}:force_original_aspect_ratio=decrease,` +
      `pad=${String(targetW)}:${String(targetH)}:(ow-iw)/2:(oh-ih)/2:${padColor}`;
  } else {
    // Plain resize (distorting when the aspect differs — that is the
    // explicit "resize" contract for social re-uploads).
    vf = `scale=${String(targetW)}:${String(targetH)}`;
  }

  const c = container ?? 'mp4';
  const audio = c === 'webm' ? ['-c:a', 'libopus'] : ['-c:a', 'aac'];
  await runTool(
    'resolution-change',
    paths.ffmpeg,
    [
      '-hide_banner',
      '-i',
      input,
      '-vf',
      vf,
      ...videoEncoderArgs(c, 'balanced'),
      ...audio,
      '-y',
      outPath,
    ],
    ctx,
  );
  await assertOutput(outPath);
}

export { readFile };
