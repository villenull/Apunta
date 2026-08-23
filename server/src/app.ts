import { existsSync } from 'node:fs';

import fastifyStatic from '@fastify/static';
import type { Database } from 'better-sqlite3';
import Fastify, { type FastifyInstance } from 'fastify';

import { createProviders } from './ai/index.js';
import type { AiProviders } from './ai/types.js';
import { loadConfig, type AppConfig } from './config.js';
import { openDatabase } from './db/index.js';
import { registerErrorHandler } from './http/errors.js';
import { registerChatRoutes } from './routes/chat.js';
import { registerFormatRoutes } from './routes/formats.js';
import { registerGenerateRoute } from './routes/generate.js';
import { registerHealthRoute } from './routes/health.js';
import { registerNoteRoutes } from './routes/notes.js';
import { registerPatientRoutes } from './routes/patients.js';
import { registerSettingsRoutes } from './routes/settings.js';

export interface BuildAppOptions {
  config?: AppConfig;
  /** Pass `false` in tests to keep the output quiet. */
  logger?: boolean;
  /**
   * An already-open database. When omitted, `buildApp` opens (and migrates)
   * the one named by the config and closes it again when the app closes.
   */
  db?: Database;
  /**
   * Override the AI providers. Integration tests use it to point a real
   * Ollama provider at a dead port with fakes off, which is the only way to
   * exercise the "local AI is not running" path.
   */
  providers?: AiProviders;
}

/**
 * Build the Fastify instance. Kept separate from the `listen` bootstrap in
 * `index.ts` so tests can drive it with `app.inject()` without opening a port.
 */
export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const config = options.config ?? loadConfig();
  const app = Fastify({ logger: options.logger ?? true });

  const ownsDb = options.db === undefined;
  const db = options.db ?? openDatabase({ file: config.dbFile, migrationsDir: config.migrationsDir }).db;
  if (ownsDb) {
    app.addHook('onClose', () => {
      db.close();
    });
  }

  const providers =
    options.providers ??
    createProviders(config, db, (message, detail) => {
      app.log.warn(detail, message);
    });

  registerErrorHandler(app);

  registerHealthRoute(app, config, db, providers);
  registerPatientRoutes(app, db);
  registerNoteRoutes(app, db);
  registerFormatRoutes(app, db);
  registerSettingsRoutes(app, db);
  registerGenerateRoute(app, db, providers);
  registerChatRoutes(app, db, providers);

  const hasBuiltSpa = existsSync(config.webDistDir);
  if (hasBuiltSpa) {
    await app.register(fastifyStatic, { root: config.webDistDir });
  }

  // Unknown /api routes are always JSON 404s; everything else falls back to the
  // SPA shell so client-side routes survive a reload (when a build exists).
  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/api') || !hasBuiltSpa || request.method !== 'GET') {
      return reply.code(404).send({ error: 'not_found', message: 'Not Found', path: request.url });
    }
    return reply.sendFile('index.html');
  });

  return app;
}
