import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  closeSync,
  linkSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

/**
 * Who owns this data folder (C-OWN@1).
 *
 * One folder, one process — from before a restore touches anything to the
 * moment the app closes. The lock file is the ownership record, SQLite's
 * `locking_mode = EXCLUSIVE` (set in `db/index.ts`, after migration) is the
 * backstop for a process that ignores it, and this module is the whole of the
 * first.
 *
 * **`processStart` is a raw kernel value, not a timestamp.** Linux: field 22
 * of `/proc/<pid>/stat` — start time in clock ticks since boot — read as a
 * decimal string. macOS: whatever `ps -o lstart= -p <pid>` prints. It is
 * written into the lock file exactly as read and compared as a string, and
 * that is the only reason rule 3's equality can ever hold: a pid on its own is
 * not an identity, because the kernel reuses them. An ISO-8601 timestamp here
 * would be the mistake this comment exists to prevent — the value written
 * could never equal the value read back, so every lock would look stale, a
 * **live** owner's folder would be taken over, and two processes would run on
 * one folder.
 *
 * A start time that cannot be read at all is treated as **alive**, so the
 * takeover branch is not taken. Refusing to start is always recoverable;
 * two processes writing to one practice database is not.
 */

/** The message code C-OWN@1 rule 3 names. P3.3 carries it to the shell. */
export const DATA_FOLDER_IN_USE = 'data_folder_in_use';

/** C-OWN@1 rule 2's file name. */
const LOCK_FILENAME = 'apunta.lock';

/** Bumped only if the on-disk shape ever changes incompatibly. */
const LOCK_PROTOCOL = 1;

const require = createRequire(import.meta.url);
// Two levels up, like `config.ts`: `server/package.json` from `src/platform/`
// and from `dist/platform/` alike.
const pkg = require('../../package.json') as { version?: string };

/** The app's own version, read the way `config.ts` reads it. */
const APP_VERSION = pkg.version ?? '0.0.0';

export interface LockContents {
  readonly pid: number;
  readonly processStart: string;
  readonly appVersion: string;
  readonly protocol: number;
  readonly nonce: string;
}

export interface DataFolderLock {
  /** This acquisition's own nonce, for the caller to compare against the file. */
  readonly nonce: string;
  /** Idempotent. Removes the lock file only while it still carries `nonce`. */
  release(): void;
}

export class DataFolderInUseError extends Error {
  readonly code = DATA_FOLDER_IN_USE;
  readonly dataDir: string;

  /**
   * `pid` is the live owner when we know it. It is `undefined` only in the
   * one refusal where the file on disk stopped being readable between the
   * rename and the re-read, and a made-up number there would be worse than
   * admitting it.
   */
  readonly pid: number | undefined;

  // Written out rather than as constructor parameter properties, so that a
  // plain `node` process can import this module with nothing but its
  // annotations stripped: `data-lock.test.ts`'s two racers do exactly that,
  // because a vitest run has no build step to import from.
  constructor(dataDir: string, pid: number | undefined) {
    super(
      pid === undefined
        ? `another Apunta is already using the data folder ${dataDir}`
        : `another Apunta (pid ${String(pid)}) is already using the data folder ${dataDir}`,
    );
    this.name = 'DataFolderInUseError';
    this.dataDir = dataDir;
    this.pid = pid;
  }
}

/**
 * `/proc/<pid>/stat` field 22, counted from after the `comm` field.
 *
 * `comm` is parenthesised and may itself contain spaces and parentheses, so
 * the fields after it are counted from its **last** `)` rather than by
 * splitting the whole line.
 */
const LINUX_START_FIELD_INDEX = 19;

function linuxProcessStart(pid: number): string | undefined {
  let raw: string;
  try {
    raw = readFileSync(`/proc/${String(pid)}/stat`, 'utf8');
  } catch {
    return undefined;
  }
  const fields = raw
    .slice(raw.lastIndexOf(')') + 1)
    .trim()
    .split(/\s+/);
  const value = fields[LINUX_START_FIELD_INDEX];
  return value !== undefined && /^\d+$/.test(value) ? value : undefined;
}

function macProcessStart(pid: number): string | undefined {
  try {
    const printed = execFileSync('ps', ['-o', 'lstart=', '-p', String(pid)], {
      encoding: 'utf8',
      timeout: 5_000,
    });
    const value = printed.trim();
    return value === '' ? undefined : value;
  } catch {
    return undefined;
  }
}

/** `undefined` when the kernel will not say, which means "assume alive". */
function processStartOf(pid: number): string | undefined {
  return process.platform === 'darwin' ? macProcessStart(pid) : linuxProcessStart(pid);
}

/**
 * Is the process behind a lock still running?
 *
 * `process.kill(pid, 0)` sends no signal and only asks: `ESRCH` means there
 * is no such process, so its lock is stale. `EPERM` means a live process
 * owned by **another user** — we must not take its folder over, so it counts
 * as alive. No error means alive. Anything else is treated as alive too:
 * refusing is the direction that is recoverable.
 */
function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH';
  }
}

/**
 * Did something write this file with `acquireDataFolderLock`?
 *
 * A file that did not come out of this protocol — truncated, hand-edited, or
 * from a future version — cannot be a live owner of it, and refusing on it
 * would leave the app permanently unable to start with no way out. So it is
 * stale. Everything this function says yes to is then judged on the contract's
 * own terms.
 */
function isLockShape(contents: LockContents): boolean {
  return (
    Number.isSafeInteger(contents.pid) &&
    contents.pid > 0 &&
    typeof contents.nonce === 'string' &&
    contents.nonce !== '' &&
    typeof contents.processStart === 'string' &&
    contents.processStart !== ''
  );
}

/** C-OWN@1 rule 3's first question: alive, and still the same process? */
function ownerIsAlive(contents: LockContents): boolean {
  if (!isLockShape(contents)) return false;
  if (!processIsAlive(contents.pid)) return false;
  const current = processStartOf(contents.pid);
  if (current === undefined) return true;
  return current === contents.processStart;
}

/** One read, no retries: `undefined` for missing, empty, or unparsable. */
function parseLockFile(path: string): LockContents | undefined {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    if (parsed === null || typeof parsed !== 'object') return undefined;
    return parsed as LockContents;
  } catch {
    return undefined;
  }
}

/**
 * Sleeps, synchronously, for `ms`. Only the settle below uses it, and only
 * when a lock file exists and does not parse.
 */
function settleFor(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

const SETTLE_ATTEMPTS = 3;
const SETTLE_MS = 40;

/**
 * The lock file as it stands, or `undefined` if it is not one of ours.
 *
 * A file that exists but does not parse is re-read a few times before it is
 * called garbage, because a writer that has created the name and not yet
 * filled it is indistinguishable from a corrupt file — and taking over a
 * *live* owner's half-written lock is precisely the failure this whole
 * contract exists to prevent. After the settle it really is garbage, and a
 * garbage lock is one of the two things that must stay recoverable: the other
 * is a crash, and a crash leaves the file behind by design (rule 5).
 */
function readLockFile(path: string): LockContents | undefined {
  for (let attempt = 0; attempt < SETTLE_ATTEMPTS; attempt += 1) {
    const contents = parseLockFile(path);
    if (contents !== undefined) return contents;
    if (attempt < SETTLE_ATTEMPTS - 1) settleFor(SETTLE_MS);
  }
  return undefined;
}

/** Writes a private temporary file: never a name another process is watching. */
function writeNewFile(path: string, body: string): void {
  const handle = openSync(path, 'wx', 0o600);
  try {
    writeFileSync(handle, body);
  } finally {
    closeSync(handle);
  }
}

/**
 * Rule 2's exclusive create — the only test-and-set in the protocol, and the
 * only thing that decides a race between two first launches.
 *
 * The content has to land **atomically with the name**, and
 * `open(path, 'wx')` followed by a write does not: between the two calls the
 * file exists and is empty, and a second process that reads it in that window
 * sees something that is not a lock, decides the lock is stale, and takes the
 * folder over. Both processes then believe they own one practice's records.
 * That is not hypothetical — `data-lock.test.ts`'s two-process case did it
 * under the full suite's load before this line was `link()`.
 *
 * So the body is written to a private name first and `link()`ed into place: it
 * fails with `EEXIST` if the lock is there (an exclusive create, and one that
 * cannot expose an empty file), and it cannot expose a partial one either.
 *
 * exFAT and some network folders have no hard links, and a data folder on one
 * is a documented, supported setup, so a link that fails for want of support
 * falls back to the `open(wx)` create. That fallback does have the window,
 * which is what `readLockFile`'s settle is for.
 */
function createLockFile(path: string, temporary: string, body: string): void {
  try {
    writeNewFile(temporary, body);
    linkSync(temporary, path);
  } catch (error) {
    rmSync(temporary, { force: true });
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw error;
    writeNewFile(path, body);
    return;
  }
  rmSync(temporary, { force: true });
}

function handleFor(path: string, nonce: string): DataFolderLock {
  let released = false;
  return {
    nonce,
    release(): void {
      // Idempotent: `onClose` can be reached more than once, and a second
      // call must not unlink a lock that now belongs to somebody else.
      if (released) return;
      released = true;
      try {
        // Only while the file still carries our nonce. A lock that was taken
        // over in the meantime (a crashed owner, rule 3) is not ours to
        // remove — and removing it would be the one way this module could
        // make a second process the owner.
        if (parseLockFile(path)?.nonce !== nonce) return;
        unlinkSync(path);
      } catch {
        // Already gone, or not ours to unlink. Either way the next start
        // finds a dead pid and takes the lock over; failing a shutdown over
        // the file would be worse than leaving it.
      }
    },
  };
}

/**
 * Take the lock, or refuse with `DataFolderInUseError`.
 *
 * The caller has already ensured the folder exists — C-OWN@1 rule 1's order
 * is *ensure folder → acquire lock → apply pending restore → snapshot →
 * migrate → open for writing*, and this is the second step, so nothing has
 * touched the database when this throws.
 */
export function acquireDataFolderLock(dataDir: string): DataFolderLock {
  const processStart = processStartOf(process.pid);
  if (processStart === undefined) {
    // A lock we cannot prove we own is a lock a second process may take from
    // us, and a wrong entry in a clinical record is not recoverable by
    // restarting the app. This is the one platform shape where the failure is
    // not a mistake, and it is reported as the boot error it is.
    throw new Error(
      `cannot read the start time of process ${String(process.pid)} on ${process.platform}, so Apunta will not take a data-folder lock it cannot prove it owns`,
    );
  }

  const path = join(dataDir, LOCK_FILENAME);
  const nonce = randomUUID();
  const contents: LockContents = {
    pid: process.pid,
    processStart,
    appVersion: APP_VERSION,
    protocol: LOCK_PROTOCOL,
    nonce,
  };
  const body = `${JSON.stringify(contents, null, 2)}\n`;
  const temporary = `${path}.${String(process.pid)}.${nonce}.tmp`;

  try {
    createLockFile(path, temporary, body);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    takeOver(dataDir, path, temporary, body, nonce);
  }

  return handleFor(path, nonce);
}

/** Rule 3's stale branch, which is also the race's losing branch. */
function takeOver(dataDir: string, path: string, temporary: string, body: string, nonce: string): void {
  const existing = readLockFile(path);
  if (existing !== undefined && ownerIsAlive(existing)) {
    throw new DataFolderInUseError(dataDir, existing.pid);
  }

  // Write beside the old lock and rename over it: a rename is atomic, so a
  // second taker never reads a half-written lock, and the original is only
  // displaced once the new one is complete.
  try {
    writeNewFile(temporary, body);
    renameSync(temporary, path);
  } catch (error) {
    rmSync(temporary, { force: true });
    throw error;
  }

  // Rule 3's re-read. Two processes can reach the stale branch together; only
  // the one whose nonce is on disk afterwards may call itself the owner. The
  // other one refuses rather than run beside it.
  const onDisk = readLockFile(path);
  if (onDisk === undefined || onDisk.nonce !== nonce) {
    throw new DataFolderInUseError(dataDir, onDisk?.pid);
  }
}
