import { applyPendingRestore, maybeRunDailyBackupAsync, rollbackAppliedRestore } from './backup/index.js';
import { OllamaProcess } from './ai/ollama-process.js';
import { buildApp } from './app.js';
import { openBrowser } from './boot.js';
import { appUrl, ensureDataDir, loadConfig } from './config.js';
import { installEgressGuard } from './egress-guard.js';
import { openDatabase, type OpenedDatabase } from './db/index.js';
import { storageBootMessage } from './http/errors.js';
import { serveBootError } from './boot-error.js';

// First thing, before anything can make a request: lock outbound network access
// down to loopback. See egress-guard.ts.
installEgressGuard();

async function start(): Promise<void> {
  const config = loadConfig();
  let restored = { applied: false } as { applied: boolean; safetyCopy?: string; removedSidecars?: string[] };
  let opened: OpenedDatabase;
  try {
    ensureDataDir(config.dataDir);
    restored = applyPendingRestore(config.dataDir);
    opened = openDatabase({
      file: config.dbFile,
      migrationsDir: config.migrationsDir,
      nativeBinding: config.sqliteBinding,
    });
  } catch (error) {
    if (restored.applied && restored.safetyCopy !== undefined) {
      try {
        rollbackAppliedRestore(config.dataDir, restored.safetyCopy);
      } catch (rollbackError) {
        console.error('Apunta could not roll back the failed restore', rollbackError);
      }
    }
    const message = storageBootMessage(error, config.dataDir, config.dbFile);
    const app = await serveBootError(config, { dataDir: config.dataDir, message });
    app.log.error({ err: error, dataDir: config.dataDir, db: config.dbFile }, message);
    const url = appUrl(config);
    const openedBrowser = openBrowser({ url, disabled: process.env['APUNTA_NO_OPEN'] === '1' });
    if (!openedBrowser.opened && openedBrowser.reason !== undefined) {
      app.log.debug({ reason: openedBrowser.reason }, 'not opening a browser');
    }
    return;
  }

  const { db } = opened;
  const app = await buildApp({ config, db });
  app.addHook('onClose', () => {
    db.close();
  });

  /**
   * The bundled AI runtime (M8). Nothing happens here on a developer machine:
   * APUNTA_OLLAMA_BIN is unset, Homebrew runs Ollama as a service, and starting
   * a second one would fight it. In the packaged app there is no service, so
   * the server starts the runtime and stops it again through this hook.
   */
  const runtime = new OllamaProcess({
    binary: config.ollamaBin,
    modelsDir: config.ollamaModelsDir,
    baseUrl: config.ollamaUrl,
    log: (message, detail) => {
      app.log.warn(detail ?? {}, message);
    },
  });
  const started = runtime.start();
  if (started.status === 'started') {
    app.log.info({ pid: started.pid }, 'started the bundled AI runtime');
  } else if (started.status === 'failed') {
    app.log.error({ reason: started.reason }, 'the bundled AI runtime could not be started');
  }
  app.addHook('onClose', async () => {
    await runtime.stop();
  });

  if (restored.applied) {
    app.log.warn(
      { safetyCopy: restored.safetyCopy, removedSidecars: restored.removedSidecars?.length ?? 0 },
      'restored the database from a backup; the previous one was kept beside it',
    );
  }

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      void app.close().then(() => process.exit(0));
    });
  }

  try {
    await app.listen({ host: config.host, port: config.port });
    const url = appUrl(config);
    app.log.info({ dataDir: config.dataDir, db: config.dbFile, fakeAi: config.fakeAi }, `Apunta on ${url}`);

    void maybeRunDailyBackupAsync(db, config)
      .then((backup) => {
        if (backup !== null) {
          app.log.info(
            { file: backup.file.filename, bytes: backup.file.bytes, pruned: backup.pruned.length },
            'daily backup written',
          );
        }
      })
      .catch((error: unknown) => {
        app.log.error({ err: error }, 'the daily backup failed; see Settings');
      });

    const openedBrowser = openBrowser({ url, disabled: process.env['APUNTA_NO_OPEN'] === '1' });
    if (!openedBrowser.opened && openedBrowser.reason !== undefined) {
      app.log.debug({ reason: openedBrowser.reason }, 'not opening a browser');
    }
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

void start();
