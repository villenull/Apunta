import { BackupError } from './archive.js';

/**
 * C-SNAP@1 rule 3: one backup at a time.
 *
 * Two archives written at once is not two backups, it is one practice's data
 * described two different ways, and the staging folders they used to share
 * meant the first one to finish deleted the other's copy out from under it.
 * So a second backup waits, and if the first has not finished within
 * `BACKUP_LOCK_WAIT_MS` the second is told the truth rather than being queued
 * behind a backup that may never end.
 *
 * The lock lives here, in the module both entry points go through, rather than
 * in the HTTP route: the daily automatic backup that runs at start-up
 * (`server/src/index.ts`) has to be covered by the same rule as a person
 * pressing the button, and a lock that only the route can see is not that.
 *
 * In-process, deliberately. Apunta is one server process holding one database;
 * a lock file would only add a way for two processes to corrupt each other
 * rather than a way to stop it.
 */

/** The contract's number. A case asserts it is still this, and HS-7 forbids lowering it. */
export const BACKUP_LOCK_WAIT_MS = 60_000;

/** How often a waiter looks at the door. Short enough to feel immediate, long enough to be free. */
const POLL_MS = 20;

let held = false;

/**
 * A synchronous sleep for the synchronous entry point.
 *
 * `Atomics.wait` on a shared buffer is the only sleep that does not give the
 * event loop a turn — which is exactly what `createBackup` needs, since its
 * whole body is synchronous.
 */
const clock = new Int32Array(new SharedArrayBuffer(4));

function sleepSync(ms: number): void {
  Atomics.wait(clock, 0, 0, ms);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function refused(): BackupError {
  return new BackupError(
    'another backup is already running. Wait for it to finish, then try again.',
    'backup_in_progress',
  );
}

/** Run `body` with the lock, for the async entry points. Released in a `finally`. */
export async function withBackupLock<T>(body: () => Promise<T>, waitMs?: number): Promise<T> {
  const deadline = Date.now() + (waitMs ?? BACKUP_LOCK_WAIT_MS);
  while (held) {
    if (Date.now() >= deadline) throw refused();
    await sleep(POLL_MS);
  }
  held = true;
  try {
    return await body();
  } finally {
    held = false;
  }
}

/** Run `body` with the lock, for the synchronous entry points. Released in a `finally`. */
export function withBackupLockSync<T>(body: () => T, waitMs?: number): T {
  const deadline = Date.now() + (waitMs ?? BACKUP_LOCK_WAIT_MS);
  while (held) {
    if (Date.now() >= deadline) throw refused();
    sleepSync(Math.min(POLL_MS, Math.max(1, deadline - Date.now())));
  }
  held = true;
  try {
    return body();
  } finally {
    held = false;
  }
}
