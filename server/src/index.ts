import { applyPendingRestore, maybeRunDailyBackup } from './backup/index.js';
import { buildApp } from './app.js';
import { openBrowser } from './boot.js';
import { appUrl, ensureDataDir, loadConfig } from './config.js';
import { installEgressGuard } from './egress-guard.js';
import { openDatabase } from './db/index.js';

// First thing, before anything can make a request: lock outbound network access
// down to loopback. See egress-guard.ts.
installEgressGuard();

const config = loadConfig();
ensureDataDir(config.dataDir);

/**
 * A restore staged from Settings is applied here — before anything opens the
 * database, which is the whole reason it waits for a restart. Swapping the
 * file under a live `better-sqlite3` handle is how a restore becomes a
 * corruption (`server/src/backup/restore.ts`).
 */
const restored = applyPendingRestore(config.dataDir);

const { db } = openDatabase({ file: config.dbFile, migrationsDir: config.migrationsDir });
const app = await buildApp({ config, db });
app.addHook('onClose', () => {
  db.close();
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

  /**
   * The daily automatic backup, on the first start of the day (M7 deliverable
   * 4). After `listen`, so a slow archive never delays the app coming up, and
   * never fatal: a failed backup is recorded in Settings and shown there,
   * because a backup that silently did not happen is the failure the research
   * ranks first.
   */
  try {
    const backup = maybeRunDailyBackup(db, config);
    if (backup !== null) {
      app.log.info(
        { file: backup.file.filename, bytes: backup.file.bytes, pruned: backup.pruned.length },
        'daily backup written',
      );
    }
  } catch (error) {
    app.log.error({ err: error }, 'the daily backup failed; see Settings');
  }

  const opened = openBrowser({ url, disabled: process.env['APUNTA_NO_OPEN'] === '1' });
  if (!opened.opened && opened.reason !== undefined)
    app.log.debug({ reason: opened.reason }, 'not opening a browser');
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
