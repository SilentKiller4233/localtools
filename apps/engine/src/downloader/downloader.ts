/**
 * Downloader Group C core (PROJECT_SPEC Sections 3.2 Group C, 5.8).
 *
 * The one place a user URL becomes outbound traffic. Order of defense:
 *
 *  1. assertPublicHttpUrl      — scheme (http/https only)
 *  2. resolveAndValidateHost   — initial URL: private/loopback/link-local
 *                               (incl. 169.254.169.254) rejected BEFORE
 *                               any subprocess exists
 *  3. yt-dlp runs ONLY via the validating proxy (--proxy) — every
 *     connection it makes (page, redirects, media, fragments) re-checks
 *     scheme + resolved IP per hop
 *  4. hard wall-clock timeout + output-size watchdog (abort mid-download)
 *  5. pre-download duration check against the documented cap (Section 8)
 *  6. remote-metadata filenames sanitized before they touch the disk or
 *     the response
 *
 * No raw fetch fallback: unsupported sites surface yt-dlp's
 * "Unsupported URL" as `unsupported-site` — the engine NEVER fetches
 * bytes itself except through yt-dlp's extractor logic (no proxy-of-
 * last-resort; thumbnails are fetched only through the same validating
 * proxy, for the client preview).
 */

import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { EngineConfig } from '../config.js';
import { EngineToolError } from '../errors.js';
import { type SubprocessLimiter } from '../limiter.js';
import { TempDir } from '../temp-dirs.js';
import { toolPaths } from '../tool-paths.js';
import { assertPublicHttpUrl, resolveAndValidateHost, startValidatingProxy } from './ssrf-guard.js';
import {
  PRODUCTION_EXTRACTOR_ARGS,
  TEST_EXTRACTOR_ARGS,
  baseArgs,
  formatLabel,
  runYtDlp,
  sanitizeRemoteName,
  type YtDlpInfo,
} from './ytdlp.js';
import type {
  DownloadFormat,
  DownloadItem,
  DownloadMetadataResponse,
} from '@localtools/shared-types';

export interface DownloaderCtx {
  config: EngineConfig;
  /** Subprocess concurrency slot (shared with Group B tools). */
  limiter: SubprocessLimiter;
  /**
   * Test seam: the literal `127.0.0.1:<port>` of the local mock target
   * (Section 14.2). When set, exactly that host:port is allowed through
   * the guards AND the extractor set includes generic+html5 so the mock
   * is a "supported site". Production: undefined — nothing loopback is
   * ever fetchable, and the generic extractor stays disabled.
   */
  mockTarget?: string;
}

/** Which extractor args to use for this run. */
function extractorArgsFor(ctx: DownloaderCtx): readonly string[] {
  return ctx.mockTarget !== undefined ? TEST_EXTRACTOR_ARGS : PRODUCTION_EXTRACTOR_ARGS;
}

/* ------------------------------------------------------------------ */
/* Errors mapped from yt-dlp output                                    */
/* ------------------------------------------------------------------ */

/** Map a failed yt-dlp run to the engine taxonomy. */
function mapYtDlpError(r: { code: number | null; stderr: string; timedOut: boolean }): Error {
  if (r.timedOut) {
    return new EngineToolError('tool-timeout', 'The download took too long and was stopped.');
  }
  const err = r.stderr;
  // Unsupported URL — the extractor set matched nothing (5.8: never a raw fetch).
  if (/Unsupported URL/i.test(err)) {
    return new EngineToolError(
      'unsupported-site',
      'This site isn’t supported by the downloader — try a link from a supported video or audio platform.',
    );
  }
  // Geo-restricted / login-required (Section 13): surface readable.
  if (/geo-restricted|not available in your country/i.test(err)) {
    return new EngineToolError(
      'tool-failed',
      'This content is geo-restricted and can’t be downloaded here.',
    );
  }
  if (/login|sign in|private video|members-only/i.test(err)) {
    return new EngineToolError(
      'tool-failed',
      'This content requires a login, which the downloader doesn’t support.',
    );
  }
  if (/HTTP Error 403|Forbidden/i.test(err)) {
    return new EngineToolError(
      'tool-failed',
      'The site refused the download (it may require a login or block automated access).',
    );
  }
  if (/HTTP Error 404|Not Found/i.test(err)) {
    return new EngineToolError('tool-failed', 'The page wasn’t found — check the link.');
  }
  // Live stream (Section 13): explicit unsupported, per D-024.
  if (/is live|live event|livestream/i.test(err)) {
    return new EngineToolError(
      'unsupported-site',
      'Live streams aren’t supported — wait for the stream to finish and download the saved copy.',
    );
  }
  return new EngineToolError(
    'tool-failed',
    'The download didn’t work — the site may have changed or the content is unavailable.',
  );
}

/* ------------------------------------------------------------------ */
/* Info → response mapping                                             */
/* ------------------------------------------------------------------ */

function isLiveInfo(info: YtDlpInfo): boolean {
  return (
    info.is_live === true || info.live_status === 'is_live' || info.live_status === 'post_live'
  );
}

function formatsOf(info: YtDlpInfo): DownloadFormat[] {
  return (info.formats ?? []).map((f) => ({
    formatId: f.format_id ?? 'unknown',
    label: formatLabel(f),
    ext: f.ext ?? 'mp4',
    hasVideo: f.vcodec !== null && f.vcodec !== undefined && f.vcodec !== 'none',
    hasAudio: f.acodec !== null && f.acodec !== undefined && f.acodec !== 'none',
    filesizeBytes: f.filesize ?? f.filesize_approx ?? null,
  }));
}

function subtitleLangsOf(info: YtDlpInfo): string[] {
  const subs = info.subtitles;
  if (subs === null || subs === undefined) return [];
  return Object.keys(subs).filter((k) => k !== 'live_chat');
}

function itemOf(info: YtDlpInfo, itemId: string): DownloadItem {
  return {
    itemId,
    title: sanitizeRemoteName(info.title ?? 'untitled'),
    uploader: info.uploader ?? info.channel ?? null,
    durationSeconds: typeof info.duration === 'number' ? info.duration : null,
    thumbnailUrl: info.thumbnail ?? null,
    formats: formatsOf(info),
    subtitleLangs: subtitleLangsOf(info),
    isLive: isLiveInfo(info),
    extractor: info.extractor ?? null,
  };
}

/* ------------------------------------------------------------------ */
/* Metadata preview                                                    */
/* ------------------------------------------------------------------ */

/**
 * Fetch metadata for a URL (title, duration, thumbnail, uploader,
 * formats, playlist entries) — WITHOUT downloading media. Livestreams
 * are rejected here (D-024: explicit unsupported).
 */
export async function fetchMetadata(
  url: string,
  ctx: DownloaderCtx,
): Promise<DownloadMetadataResponse> {
  const target = assertPublicHttpUrl(url);
  await validateInitialUrl(target, ctx);
  const paths = await toolPaths();
  const proxy = await startValidatingProxy({
    ...(ctx.mockTarget !== undefined ? { mockTarget: ctx.mockTarget } : {}),
  });
  try {
    const args = [
      ...baseArgs({
        proxyUrl: proxy.proxyUrl,
        extractorArgs: extractorArgsFor(ctx),
        timeoutMs: ctx.config.downloadTimeoutSeconds * 1000,
      }),
      // simulate + single JSON; flat so playlist entries come back cheap
      '-J',
      '--flat-playlist',
      '--no-warnings',
      target.href,
    ];
    const run = await ctx.limiter.run(async () =>
      runYtDlp(paths.ytdlp, args, {
        timeoutMs: Math.min(ctx.config.downloadTimeoutSeconds * 1000, 120_000),
      }),
    );
    if (run.spawnFailed) {
      throw new EngineToolError(
        'tool-unavailable',
        'This tool needs a component that isn’t installed on this device.',
      );
    }
    if (run.timedOut) {
      throw new EngineToolError('tool-timeout', 'Fetching the preview took too long.');
    }
    if (run.code !== 0) throw mapYtDlpError(run);
    let info: YtDlpInfo;
    try {
      info = JSON.parse(run.stdout) as YtDlpInfo;
    } catch {
      throw new EngineToolError('tool-failed', 'The site returned unusable metadata.');
    }
    if (isLiveInfo(info)) {
      throw new EngineToolError(
        'unsupported-site',
        'Live streams aren’t supported — wait for the stream to finish and download the saved copy.',
      );
    }
    if (info._type === 'playlist' && Array.isArray(info.entries)) {
      // reject live entries early too
      const liveEntries = info.entries.filter((e) => isLiveInfo(e));
      if (liveEntries.length === info.entries.length && info.entries.length > 0) {
        throw new EngineToolError(
          'unsupported-site',
          'Live streams aren’t supported — wait for the stream to finish.',
        );
      }
      const entries = info.entries.slice(0, 50).map((e, i) => ({
        itemId: `p${String(i + 1)}`,
        title: sanitizeRemoteName(e.title ?? `item ${String(i + 1)}`),
        uploader: e.uploader ?? e.channel ?? null,
        durationSeconds: typeof e.duration === 'number' ? e.duration : null,
        thumbnailUrl: e.thumbnail ?? null,
      }));
      const head = info.entries[0];
      const item: DownloadItem = {
        itemId: 'playlist',
        title: sanitizeRemoteName(info.title ?? head?.title ?? 'playlist'),
        uploader: info.uploader ?? head?.uploader ?? null,
        durationSeconds:
          typeof info.duration === 'number'
            ? info.duration
            : head != null && typeof head.duration === 'number'
              ? head.duration
              : null,
        thumbnailUrl: info.thumbnail ?? head?.thumbnail ?? null,
        formats: [],
        subtitleLangs: [],
        isLive: false,
        extractor: info.extractor ?? null,
      };
      return { isPlaylist: true, item, entries };
    }
    return { isPlaylist: false, item: itemOf(info, 'single'), entries: [] };
  } finally {
    await proxy.close().catch(() => {});
  }
}

/**
 * Pre-flight for the initial URL (Section 5.8): the full production
 * check — scheme already asserted, now the resolved host. Runs BEFORE
 * any subprocess exists, so a private/loopback target is rejected with
 * blocked-host and zero outbound requests — in production AND tests
 * (the mock target itself is the one exempted host:port).
 */
async function validateInitialUrl(target: URL, ctx: DownloaderCtx): Promise<void> {
  const port = target.port === '' ? (target.protocol === 'https:' ? 443 : 80) : Number(target.port);
  if (ctx.mockTarget !== undefined && `${target.hostname}:${String(port)}` === ctx.mockTarget) {
    return; // the local mock origin (Section 14.2 test target)
  }
  await resolveAndValidateHost(target.hostname, port);
}

/* ------------------------------------------------------------------ */
/* Download                                                            */
/* ------------------------------------------------------------------ */

export interface DownloadCall {
  url: string;
  mode: 'best' | 'format' | 'audio';
  formatId?: string;
  items?: number[];
  subtitleLangs?: string[];
  audioFormat?: string;
}

export interface DownloadResultFile {
  name: string;
  ext: string;
  bytes: Uint8Array;
}

/**
 * Run one download. Returns produced files (sanitized names); throws
 * the engine taxonomy otherwise. Duration/size caps enforced: metadata
 * is checked pre-download where the site reports duration, and the
 * size watchdog aborts mid-download regardless.
 */
export async function runDownload(
  call: DownloadCall,
  ctx: DownloaderCtx,
): Promise<{ files: DownloadResultFile[]; skipped: number }> {
  const target = assertPublicHttpUrl(call.url);
  await validateInitialUrl(target, ctx);
  const paths = await toolPaths();
  const ffmpegDir = dirnameOf(paths.ffmpeg.ffmpeg);

  const proxy = await startValidatingProxy({
    ...(ctx.mockTarget !== undefined ? { mockTarget: ctx.mockTarget } : {}),
  });
  const temp = await TempDir.create();
  try {
    // ── pre-download metadata + duration check (Section 8 cap) ──
    // Done inside the same run via yt-dlp's match-filter where possible;
    // for the duration cap we need metadata, so run -J first when the
    // request is not a playlist-selection.
    const meta = await probeDurationAndFormats(target, ctx, proxy);
    if (meta !== undefined) assertDurationWithinCap(meta.durationSeconds, ctx);
    if (meta !== undefined && meta.isLive) {
      throw new EngineToolError(
        'unsupported-site',
        'Live streams aren’t supported — wait for the stream to finish.',
      );
    }
    // Audio mode without an ffmpeg binary is tool-unavailable, honestly.
    if (call.mode === 'audio' && ffmpegDir === undefined) {
      throw new EngineToolError(
        'tool-unavailable',
        'Audio extraction needs ffmpeg, which isn’t installed on this device.',
      );
    }

    const outDir = join(temp.path, 'dl');
    const { mkdir } = await import('node:fs/promises');
    await mkdir(outDir, { recursive: true });

    // ── build the arg array (arg arrays ONLY — Section 5.3) ──
    const args = [
      ...baseArgs({
        proxyUrl: proxy.proxyUrl,
        extractorArgs: extractorArgsFor(ctx),
        timeoutMs: ctx.config.downloadTimeoutSeconds * 1000,
      }),
      '--paths',
      outDir,
      '--output',
      'lt-%(id)s-%(random)s.%(ext)s',
      '--max-filesize',
      String(ctx.config.maxDownloadSizeBytes),
    ];
    if (call.mode === 'format' && call.formatId !== undefined) {
      args.push('-f', call.formatId);
    } else if (call.mode === 'audio') {
      args.push('-x', '--audio-format', call.audioFormat ?? 'mp3');
      if (ffmpegDir !== undefined) args.push('--ffmpeg-location', ffmpegDir);
    } else {
      args.push('-f', 'bv*+ba/b');
    }
    if (call.items !== undefined && call.items.length > 0) {
      args.push('--playlist-items', call.items.map((n) => String(n)).join(','));
    } else {
      args.push('--no-playlist');
    }
    if (call.subtitleLangs !== undefined && call.subtitleLangs.length > 0) {
      args.push('--write-subs', '--sub-langs', call.subtitleLangs.join(','));
    }
    args.push(target.href);

    const run = await ctx.limiter.run(async () =>
      runYtDlp(paths.ytdlp, args, {
        timeoutMs: ctx.config.downloadTimeoutSeconds * 1000,
        watchDir: outDir,
        maxBytes: ctx.config.maxDownloadSizeBytes,
        watchIntervalMs: 500,
      }),
    );

    if (run.spawnFailed) {
      throw new EngineToolError(
        'tool-unavailable',
        'This tool needs a component that isn’t installed on this device.',
      );
    }
    if (run.sizeAborted) {
      throw new EngineToolError(
        'download-too-large',
        'The download exceeded the size cap and was stopped — nothing was kept.',
      );
    }
    if (run.timedOut) {
      throw new EngineToolError('tool-timeout', 'The download took too long and was stopped.');
    }
    // Exit 0 can mean "everything skipped" (max-filesize) — a run that
    // produced no files is a clean failure, not success.
    const produced = await listFiles(outDir);
    if (run.code !== 0 && produced.length === 0) throw mapYtDlpError(run);
    if (run.code === 0 && produced.length === 0) {
      throw new EngineToolError(
        'download-too-large',
        'The item exceeded the size cap and was skipped — nothing was kept.',
      );
    }

    // ── read + sanitize outputs ──
    const files: DownloadResultFile[] = [];
    let skipped = 0;
    for (const f of produced) {
      if (f.size > ctx.config.maxDownloadSizeBytes) {
        skipped += 1;
        continue; // watchdog raced the final write; drop it (temp removed in finally)
      }
      const bytes = await readFile(join(outDir, f.name));
      files.push({
        name: sanitizeRemoteName(f.name),
        ext: extOf(f.name),
        bytes: new Uint8Array(bytes),
      });
    }
    if (files.length === 0) {
      throw new EngineToolError(
        'download-too-large',
        'The item exceeded the size cap and was skipped — nothing was kept.',
      );
    }
    return { files, skipped };
  } finally {
    await proxy.close().catch(() => {});
    await temp.remove();
  }
}

/** Cheap helper: dirname of a path. */
function dirnameOf(p: string): string | undefined {
  const idx = p.replace(/\\/g, '/').lastIndexOf('/');
  return idx === -1 ? undefined : p.slice(0, idx);
}

/** Extension from a filename (without dot). */
function extOf(name: string): string {
  const idx = name.lastIndexOf('.');
  return idx === -1 ? 'bin' : name.slice(idx + 1).toLowerCase();
}

/** List files in dir with sizes. */
async function listFiles(dir: string): Promise<{ name: string; size: number }[]> {
  const entries = await readdir(dir);
  const out: { name: string; size: number }[] = [];
  for (const e of entries) {
    const s = await stat(join(dir, e));
    if (s.isFile()) out.push({ name: e, size: s.size });
  }
  return out;
}

/**
 * Pre-download probe: single-item duration + live flag via -J. Returns
 * undefined when metadata isn't retrievable (the download itself will
 * surface the site's own error). Uses --flat-playlist so playlists skip
 * full extraction (the per-item cap is enforced by the size watchdog).
 */
async function probeDurationAndFormats(
  target: URL,
  ctx: DownloaderCtx,
  proxy: { proxyUrl: string },
): Promise<{ durationSeconds: number | null; isLive: boolean } | undefined> {
  // Only meaningful for single items; playlists are governed by per-item caps.
  const paths = await toolPaths();
  const args = [
    ...baseArgs({
      proxyUrl: proxy.proxyUrl,
      extractorArgs: extractorArgsFor(ctx),
      timeoutMs: ctx.config.downloadTimeoutSeconds * 1000,
    }),
    '-J',
    '--flat-playlist',
    '--no-warnings',
    '--playlist-items',
    '1', // playlist: probe the first entry only
    target.href,
  ];
  const run = await runYtDlp(paths.ytdlp, args, {
    timeoutMs: Math.min(ctx.config.downloadTimeoutSeconds * 1000, 120_000),
  });
  if (run.spawnFailed || run.timedOut || run.code !== 0) return undefined;
  try {
    const info = JSON.parse(run.stdout) as YtDlpInfo;
    const entry = info._type === 'playlist' ? (info.entries?.[0] ?? info) : info;
    return {
      durationSeconds: typeof entry.duration === 'number' ? entry.duration : null,
      isLive: isLiveInfo(entry),
    };
  } catch {
    return undefined;
  }
}

/**
 * Section 8/13: pre-download duration gate — an item whose reported
 * duration exceeds the configured cap is rejected BEFORE any media
 * bytes are fetched. Exported as a unit-test seam (the mock target
 * reports no duration, so the gate is integration-invisible there).
 */
export function assertDurationWithinCap(
  durationSeconds: number | null,
  ctx: { config: { maxDownloadDurationSeconds: number } },
): void {
  if (durationSeconds !== null && durationSeconds > ctx.config.maxDownloadDurationSeconds) {
    throw new EngineToolError(
      'too-long',
      'This item is longer than the downloader’s duration cap.',
    );
  }
}

/* re-exports for routes */
export { sanitizeRemoteName };
