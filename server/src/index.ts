import { applyPendingRestore, maybeRunDailyBackupAsync, rollbackAppliedRestore } from './backup/index.js';
import { OllamaProcess } from './ai/ollama-process.js';
import { buildApp } from './app.js';
import { openBrowser } from './boot.js';
import { appUrl, ensureDataDir, loadConfig } from './config.js';
import { installEgressGuard } from './egress-guard.js';
import { openDatabase, type OpenedDatabase } from './db/index.js';
import { storageBootFailure } from './http/errors.js';
import { serveBootError } from './boot-error.js';
import {
  DATA_FOLDER_IN_USE,
  DataFolderInUseError,
  acquireDataFolderLock,
  type DataFolderLock,
} from './platform/data-lock.js';

// First thing, before anything can make a request: lock outbound network access
// down to loopback. See egress-guard.ts.
installEgressGuard();

async function start(): Promise<void> {
  const config = loadConfig();
  let restored = { applied: false } as { applied: boolean; safetyCopy?: string; removedSidecars?: string[] };
  let opened: OpenedDatabase;
  let lock: DataFolderLock;
  try {
    // C-OWN@1 rule 1's order: the folder exists, then it is owned, and only
    // then does anything touch the database — a restore, a snapshot,
    // migration or an open. Every one of those would be two processes
    // rewriting one practice's records.
    ensureDataDir(config.dataDir);
    lock = acquireDataFolderLock(config.dataDir);
    restored = applyPendingRestore(config.dataDir);
    opened = openDatabase({
      file: config.dbFile,
      migrationsDir: config.migrationsDir,
      nativeBinding: config.sqliteBinding,
    });
  } catch (error) {
    // The one boot failure that is not a storage failure and gets no
    // boot-error page: another Apunta already owns this folder. Serving a
    // page here would bind the port and leave with 0, so the shell would be
    // told the second launch worked while it answered nothing — and the owner
    // would never learn why. Exit 75 and the message code is the whole of the
    // contract (P3.3 carries the code to the shell).
    if (error instanceof DataFolderInUseError) {
      console.error(`${DATA_FOLDER_IN_USE}: ${error.message}`);
      process.exit(75);
    }
    if (restored.applied && restored.safetyCopy !== undefined) {
      try {
        rollbackAppliedRestore(config.dataDir, restored.safetyCopy);
      } catch (rollbackError) {
        console.error('Apunta could not roll back the failed restore', rollbackError);
      }
    }
    const failure = storageBootFailure(error, config.dataDir, config.dbFile);
    const app = await serveBootError(config, {
      dataDir: config.dataDir,
      key: failure.key,
      params: failure.params,
    });
    app.log.error({ err: error, dataDir: config.dataDir, db: config.dbFile }, failure.message);
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
    // C-OWN@1 rule 5, on the one hook every clean exit already goes through:
    // `app.close()` on SIGINT/SIGTERM, and any other orderly close. A crash
    // skips it and leaves the file behind, which is the stale lock rule 3
    // takes over.
    lock.release();
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
