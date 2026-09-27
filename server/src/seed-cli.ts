/**
 * `npm run seed` — development only.
 *
 * Fills the database with the prototype's sample practice so the app can be
 * clicked through before any real note exists. It never invents patient-shaped
 * data of its own (CLAUDE.md hard rule 2) and never overwrites a database that
 * already has content unless `--reset` says so. A database with patients is
 * refused with a non-zero exit, so a chained command stops there too.
 */
import { ensureDataDir, loadConfig } from './config.js';
import { openDatabase } from './db/index.js';
import { SeedRefusedError, seedDatabase } from './seed.js';

const reset = process.argv.includes('--reset');
// Opt-in: a fifteen-patient throwaway practice beside the sample one.
const practice = process.argv.includes('--practice');

const config = loadConfig();
ensureDataDir(config.dataDir);

const { db } = openDatabase({ file: config.dbFile, migrationsDir: config.migrationsDir });

try {
  const result = seedDatabase(db, { reset, practice });

  if (!result.seeded) {
    console.warn(`Nothing seeded: ${result.skippedReason ?? 'unknown reason'}`);
    console.warn(`Database: ${config.dbFile}`);
  } else {
    console.warn(
      `Seeded ${String(result.formats)} formats, ${String(result.patients)} patients and ${String(result.notes)} notes into ${config.dbFile}` +
        (practice ? ' (including the 15-patient throwaway practice)' : ''),
    );
  }
} catch (error) {
  if (!(error instanceof SeedRefusedError)) throw error;
  console.error(`Refusing to seed: ${error.message}`);
  console.error(`Database: ${config.dbFile}`);
  process.exitCode = 1;
} finally {
  db.close();
}
