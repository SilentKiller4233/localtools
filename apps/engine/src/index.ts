/**
 * Layer 2 engine (PROJECT_SPEC Sections 1, 5).
 *
 * Fastify server factory. Phase 4: PDF Group B endpoints behind the full
 * Section 5 control set (loopback bind, exact-origin CORS, bearer auth
 * when exposed, magic-byte validation, size caps, per-request temp dirs
 * + sweeper, argument-array subprocess discipline with timeouts, and a
 * subprocess concurrency cap that answers 429 when full).
 */

import type { EngineResult } from '@localtools/shared-types';
import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { loadConfig, type EngineConfig } from './config.js';
import { SubprocessLimiter } from './limiter.js';
import { startTempSweeper } from './temp-dirs.js';
import { registerPdfGroupBRoutes } from './routes/pdf-group-b.js';
import { registerMediaGroupBRoutes } from './routes/media-group-b.js';
import { registerMediaSpeechRoutes } from './routes/media-speech.js';
import { registerDownloaderRoutes } from './routes/downloader-group-c.js';
import { bearerAuthPlugin } from './auth.js';
import { securityHeadersPlugin } from './headers.js';
import { ENGINE_ERROR_MESSAGES } from './errors.js';

export const ENGINE_HOST = '127.0.0.1';
export const ENGINE_PORT = 8787;

/**
 * Build the engine. `override` is a test seam (inject config + port).
 */
export async function createServer(override?: {
  config?: EngineConfig;
  port?: number;
}): Promise<FastifyInstance> {
  const config = override?.config ?? loadConfig();
  const app = Fastify({
    logger: true,
  });

  // Map multipart's stream-level size-limit rejection (and any Fastify
  // error with a statusCode) to the engine's JSON envelope — clients
  // always get { ok, error: { code, message } } (Section 5.6).
  app.setErrorHandler((err: unknown, _request, reply) => {
    const fastifyErr = err as { statusCode?: unknown; message?: unknown };
    const statusCandidate = fastifyErr.statusCode;
    const fastifyStatus: number | undefined =
      typeof statusCandidate === 'number' && statusCandidate >= 400 ? statusCandidate : undefined;
    const message = typeof fastifyErr.message === 'string' ? fastifyErr.message : '';
    const isSizeLimit =
      fastifyStatus === 413 ||
      /file\s*size|files limit|too large|RequestFileTooLarge/i.test(message);
    if (isSizeLimit) {
      void reply.status(413).send({
        ok: false,
        error: { code: 'size-limit', message: ENGINE_ERROR_MESSAGES['size-limit'] },
      });
      return;
    }
    if (fastifyStatus !== undefined && fastifyStatus < 500) {
      void reply.status(fastifyStatus).send({
        ok: false,
        error: { code: 'invalid-option', message: ENGINE_ERROR_MESSAGES['invalid-option'] },
      });
      return;
    }
    app.log.error({ err: message }, 'engine-internal');
    void reply.status(500).send({
      ok: false,
      error: { code: 'internal', message: ENGINE_ERROR_MESSAGES['internal'] },
    });
  });

  // Section 5.7: application-layer hardening headers on every response.
  await app.register(securityHeadersPlugin);

  // Section 5.1: exact-origin CORS only — never a wildcard.
  await app.register(cors, {
    origin: config.clientOrigin,
    methods: ['GET', 'POST'],
    credentials: false,
  });

  // Section 5.1: bearer token on every endpoint when exposed.
  if (config.exposed) {
    // loadConfig() refuses to boot with exposed=true unless the token is
    // >= 32 chars, so it is present whenever this branch runs.
    const token = config.authToken as string;
    await app.register(bearerAuthPlugin, { token });
  }

  // Multipart contract: options JSON field + up to 8 file parts.
  await app.register(multipart, {
    attachFieldsToBody: true,
    limits: {
      files: 8,
      fileSize: config.maxFileSize,
      fields: 4,
    },
  });

  const limiter = new SubprocessLimiter(config.maxConcurrentSubprocesses);
  startTempSweeper();

  app.get('/healthz', (): EngineResult<{ status: string; busy: number; capacity: number }> => {
    return {
      ok: true,
      data: {
        status: 'ok',
        busy: limiter.current,
        capacity: config.maxConcurrentSubprocesses,
      },
    };
  });

  registerPdfGroupBRoutes(app, config, limiter);
  registerMediaGroupBRoutes(app, config, limiter);
  registerMediaSpeechRoutes(app, config, limiter);
  registerDownloaderRoutes(app, config, limiter);

  return app;
}
