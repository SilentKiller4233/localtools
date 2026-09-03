/**
 * Security headers (PROJECT_SPEC Section 5.7).
 *
 * CSP with no third-party CDNs and no unsafe-inline for scripts,
 * no-referrer, nosniff, and frame-ancestors 'none' on every response.
 * Wrapped with fastify-plugin so the onSend hook applies at the root
 * instance (plain plugin encapsulation would scope it to nothing).
 */

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';

export const securityHeadersPlugin: FastifyPluginAsync = fp(async (app: FastifyInstance) => {
  await Promise.resolve();
  app.addHook('onSend', async (_request, reply, payload) => {
    reply.header(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    );
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Cross-Origin-Opener-Policy', 'same-origin');
    return payload;
  });
});
