// Checkpoint stores: where an interrupted capture resumes from.
//
// A capture of the owner's real account is hundreds of requests long and will be
// interrupted — the tab is closed, Chrome updates, the laptop sleeps. The
// checkpoint is therefore the thing that makes a resume honest, and it is
// written after *every* unit of work, not in batches.
//
// Two stores, one interface: `load()`, `save(state)`, `clear()`. The file store
// writes to a temporary file and renames it over the target, and keeps a
// digest of the state, so a half-written file can never be read back as a
// finished one.

import { canonicalJson, digestOf } from './canonical.mjs';
import { writeFileSync, readFileSync, renameSync, unlinkSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const CHECKPOINT_VERSION = 1;

let saves = 0;

/** In-process store. What the tests use, and what a page-context run uses. */
export function createMemoryCheckpoint(initial = null) {
  let state = initial;
  let saves = 0;
  return {
    kind: 'memory',
    saves: () => saves,
    load() {
      return state;
    },
    save(next) {
      saves += 1;
      state = next;
    },
    clear() {
      state = null;
    },
  };
}

/**
 * Disk store with an atomic replace and a self-describing digest.
 *
 * `load()` returns null for a missing file, and throws for a file whose digest
 * does not match its body — a truncated or hand-edited checkpoint must stop the
 * run, not silently restart it from a half-state.
 */
export function createFileCheckpoint(path) {
  return {
    kind: 'file',
    path,
    saves: () => saves,
    load() {
      let text;
      try {
        text = readFileSync(path, 'utf8');
      } catch (error) {
        if (error.code === 'ENOENT') return null;
        throw error;
      }
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error(`checkpoint_unreadable: ${path}`);
      }
      const body = parsed?.state;
      if (body === undefined || parsed.digest !== digestOf(body)) {
        throw new Error(`checkpoint_corrupt: ${path}`);
      }
      if (body.v !== CHECKPOINT_VERSION) {
        throw new Error(`checkpoint_version_unsupported: ${String(body.v)}`);
      }
      return body;
    },
    save(state) {
      mkdirSync(dirname(path), { recursive: true });
      const temp = `${path}.tmp`;
      writeFileSync(
        temp,
        `${JSON.stringify({ v: CHECKPOINT_VERSION, digest: digestOf(state), state }, null, 2)}\n`,
        {
          encoding: 'utf8',
          mode: 0o600,
        },
      );
      renameSync(temp, path);
      saves += 1;
    },
    clear() {
      try {
        unlinkSync(path);
      } catch {
        // Already gone; clearing twice is not an error.
      }
    },
  };
}

/** A checkpoint's identity line for the manifest. */
export function checkpointSummary(state) {
  if (state === null) return { resumed: false, state_digest: null, phase: null };
  return {
    resumed: true,
    state_digest: digestOf(state),
    phase: state.phase,
    listed: state.list?.ids?.length ?? 0,
    fetched: Object.keys(state.fetched).length,
  };
}

export { canonicalJson };
