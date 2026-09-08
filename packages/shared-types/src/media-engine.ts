/**
 * Engine request/response schemas for Media Group B tools (PROJECT_SPEC
 * Sections 3.2, 5, 15 Phase 7). Shared by apps/client and apps/engine;
 * the engine validates every request body against the same zod schema
 * the client builds (same contract as pdf-engine.ts).
 */

import { z } from 'zod';

/* ------------------------------------------------------------------ */
/* Shared enums                                                        */
/* ------------------------------------------------------------------ */

/** Video containers the converter tool emits (Section 3.2 Group B list). */
export const VideoContainer = z.enum(['mp4', 'webm', 'mov', 'mkv', 'avi']);
export type VideoContainerValue = z.infer<typeof VideoContainer>;

/** Audio formats the audio converter emits. */
export const AudioFormat = z.enum(['mp3', 'wav', 'flac', 'ogg', 'aac', 'm4a']);
export type AudioFormatValue = z.infer<typeof AudioFormat>;

/** Timecode: plain seconds (number) or HH:MM:SS[.mmm] string. */
export const Timecode = z.union([
  z
    .number()
    .min(0)
    .max(86_400 * 4),
  z.string().regex(/^\d{1,2}:\d{2}:\d{2}(\.\d{1,3})?$/, 'Use seconds or HH:MM:SS.mmm'),
]);

/** Parse either Timecode shape into seconds; throws on bad clock values. */
export function timecodeToSeconds(t: z.infer<typeof Timecode>): number {
  if (typeof t === 'number') return t;
  const m = /^(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/.exec(t);
  if (m === null) throw new Error('Invalid timecode');
  const h = Number(m[1]);
  const min = Number(m[2]);
  const sec = Number(m[3]);
  const ms = m[4] === undefined ? 0 : Number(m[4].padEnd(3, '0'));
  if (min > 59 || sec > 59) throw new Error('Invalid timecode');
  return h * 3600 + min * 60 + sec + ms / 1000;
}

/* ------------------------------------------------------------------ */
/* Tool request schemas (one per Section 3.2 Group B tool)              */
/* ------------------------------------------------------------------ */

/** Video format converter (mp4/webm/mov/mkv/avi). */
export const VideoConvertRequestSchema = z.object({
  file: z.number().int().min(0),
  container: VideoContainer,
});

/** Video compressor — CRF presets small/balanced/high-quality. */
export const VideoCompressRequestSchema = z.object({
  file: z.number().int().min(0),
  preset: z.enum(['small', 'balanced', 'high-quality']).default('balanced'),
  /** Also cap the output bitrate (0 = off). */
  maxBitrateKbps: z.number().int().min(0).max(200_000).default(0),
});

/** Video trimmer/cutter. `mode` "lossless" uses -c copy when allowed. */
export const VideoTrimRequestSchema = z.object({
  file: z.number().int().min(0),
  start: Timecode.default(0),
  end: Timecode.optional(),
  duration: z.number().min(0.05).max(86_400).optional(),
  mode: z.enum(['lossless', 'reencode']).default('lossless'),
});

/** Merge/concatenate videos or audio files (same kind, one output). */
export const MediaMergeRequestSchema = z.object({
  files: z.array(z.number().int().min(0)).min(2).max(8),
  /** Output kind: video or audio (inferred but explicit per spec). */
  kind: z.enum(['video', 'audio']),
  /** Video output container when kind=video. */
  container: VideoContainer.default('mp4'),
});

/** Extract the audio track from a video. */
export const ExtractAudioRequestSchema = z.object({
  file: z.number().int().min(0),
  format: AudioFormat.default('mp3'),
});

/** Video → GIF (palette-based for quality). */
export const VideoToGifRequestSchema = z.object({
  file: z.number().int().min(0),
  /** Output width in pixels (height follows aspect). */
  width: z.number().int().min(16).max(2160).default(480),
  /** Cap the frame rate (GIFs get huge fast). */
  fps: z.number().int().min(1).max(30).default(12),
  start: Timecode.optional(),
  duration: z.number().min(0.05).max(3600).optional(),
});

/** GIF → video. */
export const GifToVideoRequestSchema = z.object({
  file: z.number().int().min(0),
  container: VideoContainer.default('mp4'),
});

/** Audio format converter (mp3/wav/flac/ogg/aac/m4a). */
export const AudioConvertRequestSchema = z.object({
  file: z.number().int().min(0),
  format: AudioFormat,
});

/** Audio compressor / bitrate reducer. */
export const AudioCompressRequestSchema = z.object({
  file: z.number().int().min(0),
  /** Target bitrate in kbps for lossy formats. */
  bitrateKbps: z.number().int().min(8).max(320).default(96),
  format: AudioFormat.optional(),
});

/** Audio trimmer. */
export const AudioTrimRequestSchema = z.object({
  file: z.number().int().min(0),
  start: Timecode.default(0),
  end: Timecode.optional(),
  duration: z.number().min(0.05).max(86_400).optional(),
});

/** Loudness normalization (audio file or a video's audio track). The
 * engine infers video vs. audio from the sniffed file kind. */
export const LoudnessNormalizeRequestSchema = z.object({
  file: z.number().int().min(0),
  /** Target integrated loudness in LUFS. */
  targetLufs: z.number().min(-60).max(-5).default(-16),
  /** Output container when the input is a video (defaults to input's). */
  container: VideoContainer.optional(),
  /** Output audio format when the input is an audio file. */
  format: AudioFormat.optional(),
});

/** Burn subtitles from an uploaded .srt/.vtt into the video. */
export const BurnSubtitlesRequestSchema = z.object({
  file: z.number().int().min(0),
  /** Index of the subtitle file within the request's files array. */
  subtitleFile: z.number().int().min(0),
  /** Optional output container (defaults to input's). */
  container: VideoContainer.optional(),
});

/** Video resolution / aspect changer: resize, crop, or pad. */
export const ResolutionChangeRequestSchema = z.object({
  file: z.number().int().min(0),
  mode: z.enum(['resize', 'crop', 'pad']).default('resize'),
  /** Target width/height (0 = derive from the other side). */
  width: z.number().int().min(0).max(7680).default(0),
  height: z.number().int().min(0).max(4320).default(0),
  /** Target aspect ratio like "9:16" (resize/crop/pad compute from it). */
  aspect: z
    .string()
    .regex(/^\d{1,2}:\d{1,2}$/)
    .optional(),
  /** Background color for pad mode. */
  padColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default('#000000'),
  container: VideoContainer.optional(),
});

export type VideoConvertRequest = z.infer<typeof VideoConvertRequestSchema>;
export type VideoCompressRequest = z.infer<typeof VideoCompressRequestSchema>;
export type VideoTrimRequest = z.infer<typeof VideoTrimRequestSchema>;
export type MediaMergeRequest = z.infer<typeof MediaMergeRequestSchema>;
export type ExtractAudioRequest = z.infer<typeof ExtractAudioRequestSchema>;
export type VideoToGifRequestSchemaType = z.infer<typeof VideoToGifRequestSchema>;
export type GifToVideoRequest = z.infer<typeof GifToVideoRequestSchema>;
export type AudioConvertRequest = z.infer<typeof AudioConvertRequestSchema>;
export type AudioCompressRequest = z.infer<typeof AudioCompressRequestSchema>;
export type AudioTrimRequest = z.infer<typeof AudioTrimRequestSchema>;
export type LoudnessNormalizeRequest = z.infer<typeof LoudnessNormalizeRequestSchema>;
export type BurnSubtitlesRequest = z.infer<typeof BurnSubtitlesRequestSchema>;
export type ResolutionChangeRequest = z.infer<typeof ResolutionChangeRequestSchema>;

/* ------------------------------------------------------------------ */
/* Phase 9 — Media speech & audio (Sections 3.2, 15)                    */
/* ------------------------------------------------------------------ */

/**
 * Piper voice ids the engine ships (D-030). Client dropdowns render the
 * display labels; the engine resolves the id to a lazy-downloaded,
 * SHA-256-verified .onnx+.json pair from rhasspy/piper-voices (MIT).
 */
export const PiperVoiceId = z.enum([
  'en_US-lessac-medium',
  'en_US-amy-medium',
  'en_GB-alba-medium',
]);
export type PiperVoiceIdValue = z.infer<typeof PiperVoiceId>;

/** Human-readable labels per voice (client-side only). */
export const PIPER_VOICE_LABELS: Readonly<Record<z.infer<typeof PiperVoiceId>, string>> = {
  'en_US-lessac-medium': 'US English — Lessac (default)',
  'en_US-amy-medium': 'US English — Amy',
  'en_GB-alba-medium': 'UK English — Alba',
};

/**
 * Text-to-speech (Group B, Phase 9). The text rides in options like
 * html-to-pdf's inline HTML — no file parts required.
 */
export const TextToSpeechRequestSchema = z.object({
  text: z.string().trim().min(1, 'Enter some text to speak.').max(10_000),
  voice: PiperVoiceId.default('en_US-lessac-medium'),
  /** Speaking-rate multiplier (Piper --length_scale; smaller = faster). */
  speed: z.number().min(0.5).max(2).default(1),
});

/**
 * PDF → audiobook (Group B, Phase 9). PDF upload; the engine extracts
 * text (pdf-core), chunks it (D-030 limits), synthesizes per chunk via
 * Piper, and concatenates to one WAV via ffmpeg.
 */
export const PdfToAudiobookRequestSchema = z.object({
  file: z.number().int().min(0),
  voice: PiperVoiceId.default('en_US-lessac-medium'),
  speed: z.number().min(0.5).max(2).default(1),
  /** Emit one WAV per detected chapter (PDF outline) instead of one file. */
  perChapter: z.boolean().default(false),
});

export type TextToSpeechRequest = z.infer<typeof TextToSpeechRequestSchema>;
export type PdfToAudiobookRequest = z.infer<typeof PdfToAudiobookRequestSchema>;
