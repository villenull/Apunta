import { existsSync } from 'node:fs';

import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { MAX_AUDIO_BYTES, MAX_DETECT_FILES } from '@apunta/shared';
import type { Database } from 'better-sqlite3';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';

import { createProviders } from './ai/index.js';
import type { AiProviders } from './ai/types.js';
import { loadConfig, type AppConfig } from './config.js';
import { openDatabase } from './db/index.js';
import { registerCsp } from './http/csp.js';
import { registerErrorHandler } from './http/errors.js';
import { msg, storedLanguage } from './http/locale.js';
import { registerRequestGuard } from './http/request-guard.js';
import { registerBackupRoutes } from './routes/backup.js';
import { registerBrainstormRoutes } from './routes/brainstorm.js';
import { registerImportRoutes } from './routes/import.js';
import { registerChatRoutes } from './routes/chat.js';
import { registerFormatDetectRoutes } from './routes/formats-detect.js';
import { registerFormatRoutes } from './routes/formats.js';
import { registerGenerateRoute } from './routes/generate.js';
import { registerHealthRoute } from './routes/health.js';
import { registerLicensesRoute } from './routes/licenses.js';
import { registerNoteRoutes } from './routes/notes.js';
import { registerPatientGroupRoutes } from './routes/patientGroups.js';
import { registerPatientRoutes } from './routes/patients.js';
import { registerPlanRoutes } from './routes/plans.js';
import { registerPrepRoutes } from './routes/prep.js';
import { registerSettingsRoutes } from './routes/settings.js';
import { registerTranscribeRoute } from './routes/transcribe.js';
import { registerHalaxyRoutes } from './routes/halaxy.js';

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
  /**
   * C-MODEL@1's installed-tag list, carried through to `registerHealthRoute`.
   * Production passes nothing and the route asks `ai/profiles.ts` itself; the
   * field exists so `routes/health.test.ts` can make `ollama.present` false
   * without a listener or a stub HTTP server. A stub `providers.llm` decides
   * only `describe()`, so it cannot do that on its own.
   */
  installedModels?: readonly string[] | null;
}

/**
 * Build the Fastify instance. Kept separate from the `listen` bootstrap in
 * `index.ts` so tests can drive it with `app.inject()` without opening a port.
 */
export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const config = options.config ?? loadConfig();
  const app = Fastify({ logger: options.logger ?? true });

  /**
   * C-REQ@1, first so that no route, body parser or upload handler registered
   * below can run ahead of it. The boot-error server registers the same guard.
   */
  registerRequestGuard(app, { port: config.port });

  /**
   * C-BRIDGE@1 rule 6, beside the guard above and after it: the CSP is an
   * `onSend` hook, so it only ever decorates a reply that has already passed
   * the guard, and no route body has to change.
   */
  registerCsp(app);

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

  /**
   * One multipart registration, because the plugin is global and registering
   * it twice throws.
   *
   * These limits are the app-wide ceiling, not any route's policy: a
   * 60-minute recording is ~115 MB of PCM, so the ceiling cannot be the 10 MB
   * that document upload wants. Each route narrows this to what it actually
   * accepts by passing its own limits to `request.parts()` — see
   * `routes/formats-detect.ts` and `routes/transcribe.ts`. A route that
   * forgets to narrow gets the ceiling, which is why the ceiling is still a
   * limit and not `Infinity`.
   *
   * Audio is streamed to disk; documents are held in memory and never written
   * there. `saveRequestFiles()` and `part.toFile()` would put a clinical note
   * in a temp directory, and an ESLint rule keeps both names out of `server/`.
   */
  await app.register(multipart, {
    limits: {
      fileSize: MAX_AUDIO_BYTES,
      // One above what any route accepts, so the route sees the extra file
      // and can answer "upload at most 3" rather than having busboy abort the
      // stream mid-part — which surfaces as an unexplained 500.
      files: MAX_DETECT_FILES + 1,
      fields: 8,
      parts: 16,
      fieldSize: 1024 * 1024,
      fieldNameSize: 64,
      headerPairs: 64,
    },
  });

  // The `locale` reader is why this line is here and not a bare `dataDir`: the
  // handler is built once, before any route exists, and it renders four bodies
  // of its own. C-LANG@1 rule 3 — a request that is not a job and not a refine
  // is answered in the stored setting, which is what this closure reads.
  registerErrorHandler(app, { dataDir: config.dataDir, locale: () => storedLanguage(db) });

  registerHealthRoute(app, config, db, providers, options.installedModels);
  registerLicensesRoute(app, config);
  registerPatientRoutes(app, db);
  registerPatientGroupRoutes(app, db);
  registerNoteRoutes(app, db);
  registerFormatRoutes(app, db);
  // Deliberately given no `db`: an uploaded template or example note is never
  // persisted, and a missing parameter makes that a type error.
  registerFormatDetectRoutes(app, providers);
  registerSettingsRoutes(app, db, config);
  registerGenerateRoute(app, db, providers);
  registerTranscribeRoute(app, config, db, providers);
  registerChatRoutes(app, db, providers);
  registerPlanRoutes(app, db, providers);
  registerPrepRoutes(app, db, providers);
  registerBackupRoutes(app, config, db);
  registerBrainstormRoutes(app, db, providers);
  registerHalaxyRoutes(app, db);
  registerImportRoutes(app, db);

  const hasBuiltSpa = existsSync(config.webDistDir);
  if (hasBuiltSpa) {
    await app.register(fastifyStatic, { root: config.webDistDir });
  }

  // Unknown /api routes are always JSON 404s; everything else falls back to the
  // SPA shell so client-side routes survive a reload (when a build exists).
  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/api') || !hasBuiltSpa || request.method !== 'GET') {
      return reply.code(404).send({
        error: 'not_found',
        message: msg(storedLanguage(db), 'errors.not_found.route'),
        path: request.url,
      });
    }
    return reply.sendFile('index.html');
  });

  return app;
}
