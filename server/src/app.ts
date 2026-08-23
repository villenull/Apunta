import { existsSync } from 'node:fs';

import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { MAX_DETECT_FILES, MAX_UPLOAD_BYTES } from '@apunta/shared';
import type { Database } from 'better-sqlite3';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';

import { createProviders } from './ai/index.js';
import type { AiProviders } from './ai/types.js';
import { loadConfig, type AppConfig } from './config.js';
import { openDatabase } from './db/index.js';
import { registerErrorHandler } from './http/errors.js';
import { registerChatRoutes } from './routes/chat.js';
import { registerFormatDetectRoutes } from './routes/formats-detect.js';
import { registerFormatRoutes } from './routes/formats.js';
import { registerGenerateRoute } from './routes/generate.js';
import { registerHealthRoute } from './routes/health.js';
import { registerNoteRoutes } from './routes/notes.js';
import { registerPatientRoutes } from './routes/patients.js';
import { registerPlanRoutes } from './routes/plans.js';
import { registerPrepRoutes } from './routes/prep.js';
import { registerSettingsRoutes } from './routes/settings.js';

export interface BuildAppOptions {
  config?: AppConfig;
  /**
   * Pass `false` in tests to keep the output quiet — or a pino options object
   * with a `stream`, which is how the privacy suites read back exactly what
   * the server would have written to a log file.
   */
  logger?: FastifyServerOptions['logger'];
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

  /**
   * File uploads (M6's format detection and skill import; M5's audio).
   *
   * Everything but `fileSize` is *tighter* than the plugin's defaults, and
   * `fileSize` is raised deliberately to the packet's 10 MB. Uploads are held
   * in memory and never written to disk: `saveRequestFiles()` and
   * `part.toFile()` would put a clinical note in a temp directory, and an
   * ESLint rule keeps both names out of `server/`.
   */
  await app.register(multipart, {
    limits: {
      fileSize: MAX_UPLOAD_BYTES,
      // One above what any route accepts, so the route sees the extra file
      // and can answer "upload at most 3" rather than having busboy abort the
      // stream mid-part — which surfaces as an unexplained 500.
      files: MAX_DETECT_FILES + 1,
      fields: 4,
      parts: 8,
      fieldSize: 256,
      fieldNameSize: 64,
      headerPairs: 64,
    },
  });

  registerHealthRoute(app, config, db, providers);
  registerPatientRoutes(app, db);
  registerNoteRoutes(app, db);
  registerFormatRoutes(app, db);
  // Deliberately given no `db`: an uploaded template or example note is never
  // persisted, and a missing parameter makes that a type error.
  registerFormatDetectRoutes(app, providers);
  registerSettingsRoutes(app, db);
  registerGenerateRoute(app, db, providers);
  registerChatRoutes(app, db, providers);
  registerPlanRoutes(app, db, providers);
  registerPrepRoutes(app, db, providers);

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
