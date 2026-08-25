import type { EngineResult } from '@localtools/shared-types';
import Fastify, { type FastifyInstance } from 'fastify';

export const ENGINE_HOST = '127.0.0.1';
export const ENGINE_PORT = 8787;

/**
 * Builds the Layer 2 engine (PROJECT_SPEC Section 1). Phase 0 stub: exposes
 * only /healthz. All Group B/C endpoints land in Phases 4/7/8 behind the full
 * Section 5 security controls — none of which exist yet, so this server must
 * never be exposed past localhost.
 */
export async function createServer(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: true,
  });

  app.get('/healthz', (): EngineResult<{ status: string }> => {
    return { ok: true, data: { status: 'ok' } };
  });

  return app;
}
