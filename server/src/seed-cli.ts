/**
 * `npm run seed` — development only.
 *
 * Fills the database with the prototype's sample practice so the app can be
 * clicked through before any real note exists. It never invents patient-shaped
 * data of its own (CLAUDE.md hard rule 2) and never overwrites a database that
 * already has content unless `--reset` says so.
 */
import { ensureDataDir, loadConfig } from './config.js';
import { openDatabase } from './db/index.js';
import { seedDatabase } from './seed.js';

const reset = process.argv.includes('--reset');

const config = loadConfig();
ensureDataDir(config.dataDir);

const { db } = openDatabase({ file: config.dbFile, migrationsDir: config.migrationsDir });

try {
  const result = seedDatabase(db, { reset });

  if (!result.seeded) {
    console.warn(`Nothing seeded: ${result.skippedReason ?? 'unknown reason'}`);
    console.warn(`Database: ${config.dbFile}`);
  } else {
    console.warn(
      `Seeded ${String(result.formats)} formats, ${String(result.patients)} patients and ${String(result.notes)} notes into ${config.dbFile}`,
    );
  }
} finally {
  db.close();
}
