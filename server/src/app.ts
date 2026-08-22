import { existsSync } from 'node:fs';

import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';

import { loadConfig, type AppConfig } from './config.js';
import { registerHealthRoute } from './routes/health.js';

export interface BuildAppOptions {
  config?: AppConfig;
  /** Pass `false` in tests to keep the output quiet. */
  logger?: boolean;
}

/**
 * Build the Fastify instance. Kept separate from the `listen` bootstrap in
 * `index.ts` so tests can drive it with `app.inject()` without opening a port.
 */
export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const config = options.config ?? loadConfig();
  const app = Fastify({ logger: options.logger ?? true });

  registerHealthRoute(app, config);

  const hasBuiltSpa = existsSync(config.webDistDir);
  if (hasBuiltSpa) {
    await app.register(fastifyStatic, { root: config.webDistDir });
  }

  // Unknown /api routes are always JSON 404s; everything else falls back to the
  // SPA shell so client-side routes survive a reload (when a build exists).
  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/api') || !hasBuiltSpa || request.method !== 'GET') {
      return reply.code(404).send({ error: 'Not Found', path: request.url });
    }
    return reply.sendFile('index.html');
  });

  return app;
}
