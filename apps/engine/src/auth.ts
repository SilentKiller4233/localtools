/**
 * Bearer auth for the exposed engine (PROJECT_SPEC Section 5.1).
 *
 * Only active when LOCALTOOLS_EXPOSE=true (which itself refuses to boot
 * without a >=32-char token — enforced in config.ts). When active, every
 * endpoint requires `Authorization: Bearer <token>`.
 */

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { createHash, timingSafeEqual } from 'node:crypto';
import fp from 'fastify-plugin';

export interface BearerAuthOptions {
  token: string;
}

const UNAUTHORIZED = {
  ok: false,
  error: { code: 'unauthorized', message: 'This request is not authorized.' },
};

export const bearerAuthPlugin: FastifyPluginAsync<BearerAuthOptions> = fp(
  async (app: FastifyInstance, opts: BearerAuthOptions) => {
    const expected = createHash('sha256').update(opts.token, 'utf8').digest();
    await Promise.resolve();

    app.addHook('onRequest', async (request, reply) => {
      if (request.url === '/healthz') return; // health probe stays open
      const header = request.headers['authorization'];
      const parts = typeof header === 'string' ? header.split(' ') : [];
      const token = parts.length === 2 && parts[0] === 'Bearer' ? parts[1] : undefined;
      if (token === undefined) {
        return reply.status(401).send(UNAUTHORIZED);
      }
      const got = createHash('sha256').update(token, 'utf8').digest();
      const equal = expected.length === got.length && timingSafeEqual(expected, got);
      if (!equal) {
        return reply.status(401).send(UNAUTHORIZED);
      }
    });
  },
);
