/**
 * Engine request/response schemas for the Media Group C downloader
 * (PROJECT_SPEC Sections 3.2 Group C, 5.8, 15 Phase 8). Shared by
 * apps/client and apps/engine — the same contract as media-engine.ts.
 *
 * The downloader is the only Group C surface: the client POSTs a URL,
 * the engine runs yt-dlp as a subprocess (argument arrays only, 5.3)
 * behind the full Section 5.8 SSRF-prevention set.
 */

import { z } from 'zod';

/* ------------------------------------------------------------------ */
/* Shared shapes                                                        */
/* ------------------------------------------------------------------ */

/** One downloadable format/quality reported by yt-dlp. */
export const DownloadFormatSchema = z.object({
  /** yt-dlp's format id, e.g. "mp4-720" or "0" — echoed back on download. */
  formatId: z.string(),
  /** Human-friendly label, e.g. "720p" or "audio only". */
  label: z.string(),
  /** Container extension yt-dlp would emit (mp4/webm/m4a/…). */
  ext: z.string(),
  /** Has a video stream. */
  hasVideo: z.boolean(),
  /** Has an audio stream. */
  hasAudio: z.boolean(),
  /** Nominal file size in bytes when the site reports one. */
  filesizeBytes: z.number().int().nonnegative().nullable(),
});
export type DownloadFormat = z.infer<typeof DownloadFormatSchema>;

/** One entry of a playlist (or the single item itself). */
export const DownloadItemSchema = z.object({
  /** Stable per-session item id (playlist index or 'single'). */
  itemId: z.string(),
  title: z.string(),
  uploader: z.string().nullable(),
  /** Duration in seconds when the site reports one. */
  durationSeconds: z.number().nonnegative().nullable(),
  /** Absolute thumbnail URL when present (client renders via engine proxy? no — see below). */
  thumbnailUrl: z.string().nullable(),
  /** Available formats (single item only; playlist entries are lazy). */
  formats: z.array(DownloadFormatSchema),
  /** Subtitle language codes available (single item only). */
  subtitleLangs: z.array(z.string()),
  /** True when the source flags this as a live stream. */
  isLive: z.boolean(),
  /** yt-dlp's extractor name (informational). */
  extractor: z.string().nullable(),
});
export type DownloadItem = z.infer<typeof DownloadItemSchema>;

/* ------------------------------------------------------------------ */
/* /downloader/metadata                                                */
/* ------------------------------------------------------------------ */

export const DownloadMetadataRequestSchema = z.object({
  /** User-supplied URL; the engine validates scheme + host before anything. */
  url: z.string().min(1).max(2048),
  /** When true, extract full per-entry metadata for playlists too. */
  fullPlaylist: z.boolean().default(false),
});
export type DownloadMetadataRequest = z.infer<typeof DownloadMetadataRequestSchema>;

export const DownloadMetadataResponseSchema = z.object({
  isPlaylist: z.boolean(),
  /** Single item (isPlaylist=false) or the playlist's own summary. */
  item: DownloadItemSchema,
  /** Playlist entries (empty when not a playlist; capped at 50 entries). */
  entries: z.array(
    z.object({
      itemId: z.string(),
      title: z.string(),
      uploader: z.string().nullable(),
      durationSeconds: z.number().nonnegative().nullable(),
      thumbnailUrl: z.string().nullable(),
    }),
  ),
});
export type DownloadMetadataResponse = z.infer<typeof DownloadMetadataResponseSchema>;

/* ------------------------------------------------------------------ */
/* /downloader/download                                                */
/* ------------------------------------------------------------------ */

/** What to download: best, a specific format id, or audio-only. */
export const DownloadModeSchema = z.enum(['best', 'format', 'audio']);
export type DownloadMode = z.infer<typeof DownloadModeSchema>;

export const DownloadRequestSchema = z.object({
  url: z.string().min(1).max(2048),
  mode: DownloadModeSchema.default('best'),
  /** yt-dlp format id when mode='format'. */
  formatId: z.string().max(128).optional(),
  /** Download only these playlist items (1-based), max 8 per request. */
  items: z.array(z.number().int().min(1).max(1000)).max(8).optional(),
  /** Also write subtitles in these language codes when available. */
  subtitleLangs: z.array(z.string().min(2).max(16)).max(8).optional(),
  /** mp3/wav/flac/ogg/m4a for mode='audio'. */
  audioFormat: z.enum(['mp3', 'wav', 'flac', 'ogg', 'm4a']).optional(),
});
export type DownloadRequest = z.infer<typeof DownloadRequestSchema>;

/** Output file returned as a base64 EngineFile. */
export const DownloadResponseSchema = z.object({
  files: z.array(
    z.object({
      name: z.string(),
      ext: z.string(),
      data: z.string(),
    }),
  ),
  /** Number of items skipped because they exceeded the duration/size cap. */
  skipped: z.number().int().nonnegative(),
});
export type DownloadResponse = z.infer<typeof DownloadResponseSchema>;

/* ------------------------------------------------------------------ */
/* Legal notice payload (Section 6 in-app notice, Phase 8 scope)        */
/* ------------------------------------------------------------------ */

export const DownloaderLegalNoticeSchema = z.object({
  title: z.string(),
  body: z.string().array(),
});
export type DownloaderLegalNotice = z.infer<typeof DownloaderLegalNoticeSchema>;

/* ------------------------------------------------------------------ */
/* Error codes (engine taxonomy additions for Group C)                  */
/* ------------------------------------------------------------------ */

/**
 * Group C error codes added to the engine taxonomy for the downloader.
 * Client-side mapping lives in engine-client.ts.
 */
export const DOWNLOADER_ERROR_CODES = [
  'unsupported-site', // URL matched no yt-dlp extractor (5.8 no-open-proxy)
  'blocked-host', // host resolves to a private/loopback/link-local IP (5.8)
  'rate-limited', // downloader-specific rate limit (5.8) — distinct from engine-busy
  'too-long', // duration exceeds the documented cap (pre-download metadata check)
  'download-too-large', // output exceeded the size cap mid-download, aborted
] as const;
export type DownloaderErrorCode = (typeof DOWNLOADER_ERROR_CODES)[number];
