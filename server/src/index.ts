import { applyPendingRestore, maybeRunDailyBackupAsync, rollbackAppliedRestore } from './backup/index.js';
import type { AppliedRestore } from './backup/restore.js';
import { OllamaProcess } from './ai/ollama-process.js';
import { buildApp } from './app.js';
import { openBrowser } from './boot.js';
import { appUrl, ensureDataDir, loadConfig } from './config.js';
import { installEgressGuard } from './egress-guard.js';
import { openDatabase, type OpenedDatabase } from './db/index.js';
import { prepareDatabaseForStart } from './db/safety.js';
import { storageBootFailure } from './http/errors.js';
import { serveBootError } from './boot-error.js';
import {
  DATA_FOLDER_IN_USE_CODE,
  PORT_IN_USE_CODE,
  startStdinBridge,
  writeFatal,
  writeReady,
} from './shell-bridge.js';
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
  let restored: AppliedRestore = { applied: false };
  let opened: OpenedDatabase;
  let lock: DataFolderLock;
  try {
    // C-OWN@1 rule 1's order: the folder exists, then it is owned, and only
    // then does anything touch the database — a restore, a snapshot,
    // migration or an open. Every one of those would be two processes
    // rewriting one practice's records.
    ensureDataDir(config.dataDir);
    lock = acquireDataFolderLock(config.dataDir);
    restored = applyPendingRestore(config.dataDir, config.sqliteBinding);
    // C-UPD@1's migration steps, in the one position C-OWN@1 rule 1 gives
    // them: the restore is applied, the database is inspected read-only and
    // snapshotted if anything is pending, and only then is anything migrated —
    // all of it before the handle below opens the file for writing. A refusal
    // here is a `MigrationSafetyError` and reaches the boot-error page through
    // the same catch as every other storage failure.
    prepareDatabaseForStart({
      dataDir: config.dataDir,
      dbFile: config.dbFile,
      migrationsDir: config.migrationsDir,
      nativeBinding: config.sqliteBinding,
    });
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
      // The log line stays: it is how P3.2's own evidence proves the refusal.
      // The bridge line is additional, and it is written synchronously because
      // `process.exit` below does not wait for a queued write on a pipe.
      console.error(`${DATA_FOLDER_IN_USE}: ${error.message}`);
      writeFatal(DATA_FOLDER_IN_USE_CODE, { env: process.env });
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

  const recovery = restored.recoveredAfterCrash;
  if (recovery !== undefined && (recovery.databases > 0 || recovery.sidecars > 0)) {
    app.log.warn(
      { databases: recovery.databases, sidecars: recovery.sidecars },
      'a restore rollback was interrupted and this start put back what it had left behind: ' +
        'the previous database, and any log file that belonged to it',
    );
  }

  if ((recovery?.unattachedLogs ?? 0) > 0) {
    // Counts and nothing else: a path here would name a practice's files, and
    // this is the one case where the records are still only in a log nobody
    // has opened. It is left whole and where it is on purpose, so this is a
    // line to read, not a repair to announce.
    app.log.warn(
      { logs: recovery?.unattachedLogs },
      'a write-ahead log under a pre-restore name could not be proven to belong to the database ' +
        'now in use, so it was left where it was rather than replayed into a database that might ' +
        'not be its own; the rows only it holds are still in it',
    );
  }

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

    // C-BRIDGE@1 rule 1: exactly one JSON line when listening, and only when a
    // shell is listening. The shell navigates after reading this line with its
    // own nonce; there is no health-poll trust anywhere in the lifecycle.
    writeReady({ env: process.env, port: config.port, version: config.version });

    // C-BRIDGE@1 rule 2's inbound half. The quit ladder's first rung: the
    // shell asks, the server closes cleanly, and only if that fails does the
    // shell signal the process group.
    //
    // End-of-file on this pipe means the shell died without a `shutdown` — which
    // is what a forced X window destruction does, because GDK's error handler
    // aborts the shell process before its own quit handling can run. Closing here
    // is what keeps that from orphaning a server that still holds the port and
    // the data folder. Same callback as `shutdown`, one shot either way.
    startStdinBridge({
      env: process.env,
      onShutdown: () => {
        void app.close().then(() => process.exit(0));
      },
      onParentGone: () => {
        app.log.warn(
          { shellBridge: true },
          'the shell closed its end of the bridge; shutting down rather than being orphaned',
        );
        void app.close().then(() => process.exit(0));
      },
      log: (message) => app.log.warn({ shellBridge: true }, message),
    });

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
    // `port_in_use` is the code for one condition only: the server could not
    // listen because the port was already taken. This catch also covers the
    // daily-backup and open-browser calls, and a failure in either of those is
    // not a port clash — so it is not the EADDRINUSE branch, and it keeps
    // today's log-and-exit exactly as it is.
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    if (code === 'EADDRINUSE') {
      writeFatal(PORT_IN_USE_CODE, { env: process.env });
    }
    app.log.error(error);
    process.exit(1);
  }
}

void start();
