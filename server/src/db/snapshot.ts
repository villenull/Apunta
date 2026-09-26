import type { Database } from 'better-sqlite3';

/**
 * Making one consistent copy of a database somebody is still writing to
 * (C-SNAP@1 rule 1).
 *
 * This is the only place in the project that knows how to do it. The backup
 * module calls it, and so will the pre-migration safety snapshot C-UPD@1 step 3
 * takes, so "how do we get a copy" has one answer rather than one per caller.
 *
 * Two methods behind one function, because two entry points exist and each
 * earns its place. `VACUUM INTO` is a single synchronous statement;
 * `better-sqlite3`'s online backup yields between page batches, so copying a
 * large practice does not hold the event loop for the whole copy. Both are
 * tested here, because a snapshot method that quietly lost its coverage would
 * lose a property along with it.
 *
 * Neither method is a file copy, and that is the whole point. `copyFileSync` of
 * a live WAL database yields every row the write-ahead log is still holding —
 * committed, durable, and missing from the copy. `snapshot.test.ts` puts the
 * two side by side.
 *
 * Creating the destination folder is deliberately *not* done here: the folder
 * belongs to the caller, and the backup module makes it `0700` inside the data
 * directory as C-SNAP@1's per-operation staging folder.
 */

export type SnapshotMethod = 'vacuum-into' | 'online-backup';

/**
 * Copy `source` to `destination` and return the copy's path.
 *
 * The destination must not exist: `VACUUM INTO` refuses to overwrite, so a
 * reused path is a bug in the caller rather than something to paper over by
 * deleting a file that might still be in use.
 */
export function snapshotDatabase(source: Database, destination: string): string;
export function snapshotDatabase(
  source: Database,
  destination: string,
  method: 'online-backup',
): Promise<string>;
export function snapshotDatabase(
  source: Database,
  destination: string,
  method: SnapshotMethod,
): string | Promise<string>;
export function snapshotDatabase(
  source: Database,
  destination: string,
  method: SnapshotMethod = 'vacuum-into',
): string | Promise<string> {
  if (method === 'online-backup') return onlineBackup(source, destination);
  vacuumInto(source, destination);
  return destination;
}

/** `VACUUM INTO`, never bare `VACUUM` — see `server/src/backup/archive.ts`. */
function vacuumInto(source: Database, destination: string): void {
  try {
    source.prepare('VACUUM INTO ?').run(destination);
  } catch (error) {
    throw new Error(`the database copy to ${destination} failed: ${describe(error)}`, { cause: error });
  }
}

async function onlineBackup(source: Database, destination: string): Promise<string> {
  try {
    await source.backup(destination);
  } catch (error) {
    throw new Error(`the database copy to ${destination} failed: ${describe(error)}`, { cause: error });
  }
  return destination;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
