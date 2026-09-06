/**
 * Downloader Group C routes (PROJECT_SPEC Phase 8, Section 3.2 Group C).
 *
 * POST /downloader/metadata — preview before committing (Section 3.2).
 * POST /downloader/download — download video/audio/subtitles.
 *
 * Both routes share the discipline:
 *  - JSON body (no file parts — this is a URL tool, not an upload tool)
 *  - downloader-specific rate limit BEFORE any work (5.8)
 *  - the full SSRF set from downloader.ts (scheme → host validation →
 *    validating proxy for every hop yt-dlp makes)
 *  - concurrency slot from the shared SubprocessLimiter (429 when full)
 *  - per-request temp dir removed in finally (5.2)
 *  - logs carry op + anonymous request id + duration — NEVER the URL (5.6)
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import { DownloadMetadataRequestSchema, DownloadRequestSchema } from '@localtools/shared-types';
import type { EngineConfig } from '../config.js';
import type { SubprocessLimiter } from '../limiter.js';
import { EngineToolError, statusForCode } from '../errors.js';
import { DownloaderRateLimiter, DownloaderRateLimitError } from '../downloader/rate-limit.js';
import { fetchMetadata, runDownload, type DownloadCall } from '../downloader/downloader.js';

/** Parse a request's JSON body (fastify's default for application/json). */
function jsonBody(request: FastifyRequest): Record<string, unknown> {
  const body = request.body;
  if (body === undefined || body === null || typeof body !== 'object') return {};
  return body as Record<string, unknown>;
}

/** Client key for the rate limiter (peer IP; loopback shares one). */
function peerKey(request: FastifyRequest): string {
  const addr = request.socket.remoteAddress ?? 'unknown';
  return addr;
}

export function registerDownloaderRoutes(
  app: FastifyInstance,
  config: EngineConfig,
  limiter: SubprocessLimiter,
): void {
  const rateLimiter = new DownloaderRateLimiter(
    config.downloaderRateLimit,
    config.downloaderRateWindowSeconds,
  );
  // Test seam (Section 14.2): when set, LOCALTOOLS_DOWNLOADER_MOCK_TARGET
  // names the literal host:port of the local mock origin — exactly that
  // target bypasses the loopback block (nothing else does), and the
  // extractor set grows generic+html5 so the mock is "supported".
  // CI/dev only; never set in production (.env.example documents it).
  const mockTargetEnv = process.env['LOCALTOOLS_DOWNLOADER_MOCK_TARGET'];
  const mockTarget =
    process.env['LOCALTOOLS_DOWNLOADER_TEST_MODE'] === 'true' &&
    mockTargetEnv !== undefined &&
    mockTargetEnv !== ''
      ? mockTargetEnv
      : undefined;

  /** Shared error→response mapping (mirrors request-harness.ts). */
  const sendError = (
    err: unknown,
    op: string,
    rid: string,
    durationMs: number,
    reply: FastifyReply,
    request: FastifyRequest,
  ): void => {
    const code: string =
      err instanceof EngineToolError
        ? err.code
        : err instanceof DownloaderRateLimitError
          ? 'rate-limited'
          : 'internal';
    const message =
      err instanceof Error && err.message !== '' && code !== 'internal'
        ? err.message
        : 'The download failed unexpectedly.';
    // Section 5.6: op + rid + duration only — never URLs.
    request.log.info(`op=${op} rid=${rid} code=${code} duration_ms=${String(durationMs)}`);
    reply.header('content-type', 'application/json');
    void reply.status(statusForCode(code as never)).send({
      ok: false,
      error: { code, message },
    });
  };

  /* ---------------------------------------------------------------- */
  /* POST /downloader/metadata                                        */
  /* ---------------------------------------------------------------- */
  app.post('/downloader/metadata', async (request: FastifyRequest, reply: FastifyReply) => {
    const rid = randomUUID().slice(0, 8);
    const started = Date.now();
    try {
      // Rate limit first (5.8) — a distinct limit from the general 429.
      const key = peerKey(request);
      if (!rateLimiter.allow(key)) throw new DownloaderRateLimitError();

      const parsed = DownloadMetadataRequestSchema.safeParse(jsonBody(request));
      if (!parsed.success) {
        throw new EngineToolError('invalid-option', 'Paste a valid link to preview first.');
      }
      const data = await fetchMetadata(parsed.data.url, {
        config,
        limiter,
        ...(mockTarget !== undefined ? { mockTarget } : {}),
      });
      request.log.info(
        `op=downloader-metadata rid=${rid} ok=true duration_ms=${String(Date.now() - started)}`,
      );
      reply.header('content-type', 'application/json');
      await reply.status(200).send({ ok: true, data });
    } catch (err) {
      sendError(err, 'downloader-metadata', rid, Date.now() - started, reply, request);
    }
  });

  /* ---------------------------------------------------------------- */
  /* POST /downloader/download                                        */
  /* ---------------------------------------------------------------- */
  app.post('/downloader/download', async (request: FastifyRequest, reply: FastifyReply) => {
    const rid = randomUUID().slice(0, 8);
    const started = Date.now();
    try {
      const key = peerKey(request);
      if (!rateLimiter.allow(key)) throw new DownloaderRateLimitError();

      const parsed = DownloadRequestSchema.safeParse(jsonBody(request));
      if (!parsed.success) {
        throw new EngineToolError('invalid-option', 'One of the settings is not valid.');
      }
      const opts = parsed.data;
      if (opts.mode === 'format' && (opts.formatId === undefined || opts.formatId === '')) {
        throw new EngineToolError('invalid-option', 'Pick a quality first.');
      }
      const call: DownloadCall = { url: opts.url, mode: opts.mode };
      if (opts.formatId !== undefined) call.formatId = opts.formatId;
      if (opts.items !== undefined) call.items = opts.items;
      if (opts.subtitleLangs !== undefined) call.subtitleLangs = opts.subtitleLangs;
      if (opts.audioFormat !== undefined) call.audioFormat = opts.audioFormat;
      const result = await runDownload(call, {
        config,
        limiter,
        ...(mockTarget !== undefined ? { mockTarget } : {}),
      });
      // Base64 files (same EngineFile contract as Group B).
      const files = result.files.map((f: { name: string; ext: string; bytes: Uint8Array }) => ({
        name: f.name,
        ext: f.ext,
        data: Buffer.from(f.bytes.buffer, f.bytes.byteOffset, f.bytes.byteLength).toString(
          'base64',
        ),
      }));
      request.log.info(
        `op=downloader-download rid=${rid} ok=true duration_ms=${String(Date.now() - started)}`,
      );
      reply.header('content-type', 'application/json');
      await reply.status(200).send({
        ok: true,
        data: { files, skipped: result.skipped },
      });
    } catch (err) {
      sendError(err, 'downloader-download', rid, Date.now() - started, reply, request);
    }
  });
}
