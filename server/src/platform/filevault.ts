import { execFile } from 'node:child_process';
import { platform } from 'node:os';

import type { FileVaultState, FileVaultStatus } from '@apunta/shared';

/**
 * Is the disk actually encrypted?
 *
 * FileVault is the whole at-rest story for this laptop, and it is **not**
 * implied by Apple silicon: without it the volume key is protected only by the
 * hardware UID — by nothing she knows. Recent Setup Assistant does not always
 * prompt for it, so "it's a new Mac, it must be encrypted" is an assumption,
 * and the project has been making it since PLAN §8 was written. The research
 * calls promoting it from assumption to a checked precondition "the highest
 * value-per-line-of-code item in the whole document"
 * (`docs/research/data-at-rest-2026-08.md` §1, §4.2, ranked risk 2).
 *
 * Three properties this has to have:
 *
 * - **portable by omission.** `fdesetup` exists only on macOS; everywhere else
 *   the answer is `not_applicable` and nothing turns red. Server logic stays
 *   OS-portable (CLAUDE.md rule 4) — the platform check is here, not in a
 *   route.
 * - **cached.** `/api/health` is polled; shelling out per request would be
 *   both wasteful and a way to make the app feel slow.
 * - **never fatal.** A machine where `fdesetup` times out or is refused
 *   answers `unknown`, and `unknown` is reported as unknown rather than as
 *   "off" — telling someone their disk is unencrypted when it is not is how a
 *   check gets ignored.
 *
 * The output wordings below are the ones `scripts/preflight-macos.sh` verified
 * from sources; the two scripts must keep agreeing, so the parse lives in one
 * function that both the server and its tests use.
 */

/** `fdesetup status` is not a fast command, and it is not on any hot path. */
const PROBE_TIMEOUT_MS = 15_000;

/** One process per app run, unless something asks for a fresh look. */
const CACHE_TTL_MS = 5 * 60 * 1000;

export function parseFdesetupStatus(output: string): FileVaultState {
  if (/FileVault is On/i.test(output)) return 'on';
  // Checked before "Off": the deferred wording contains both, and the
  // difference matters — deferred is one logout away, off is a decision.
  if (/Deferred enablement/i.test(output)) return 'deferred';
  if (/FileVault is Off/i.test(output)) return 'off';
  return 'unknown';
}

export interface ProbeOptions {
  readonly platform?: string;
  readonly run?: (command: string, args: readonly string[]) => Promise<string>;
}

async function runFdesetup(command: string, args: readonly string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(command, [...args], { timeout: PROBE_TIMEOUT_MS, encoding: 'utf8' }, (error, stdout) => {
      // `fdesetup status` exits non-zero in some states while still printing a
      // usable line, so stdout wins whenever there is any.
      if (stdout.trim() !== '') resolve(stdout);
      else if (error) reject(error);
      else resolve(stdout);
    });
  });
}

export async function probeFileVault(options: ProbeOptions = {}): Promise<FileVaultStatus> {
  const target = options.platform ?? platform();
  if (target !== 'darwin') {
    return { state: 'not_applicable', detail: `disk encryption is not checked on ${target}` };
  }

  try {
    const output = await (options.run ?? runFdesetup)('fdesetup', ['status']);
    const state = parseFdesetupStatus(output);
    return { state, detail: output.split('\n')[0]?.trim() ?? '' };
  } catch (error) {
    return {
      state: 'unknown',
      detail: `could not read fdesetup status (${error instanceof Error ? error.message : String(error)})`,
    };
  }
}

/**
 * The cached probe the health route uses.
 *
 * Kept as a module-level cache rather than a field on some object because the
 * answer is a property of the machine, not of a request or a database.
 */
let cached: { at: number; value: FileVaultStatus } | null = null;

export async function fileVaultStatus(
  now = Date.now(),
  options: ProbeOptions = {},
): Promise<FileVaultStatus> {
  if (cached !== null && now - cached.at < CACHE_TTL_MS) return cached.value;
  const value = await probeFileVault(options);
  cached = { at: now, value };
  return value;
}

/** Tests, and the wizard's "check again" button, need a fresh look. */
export function clearFileVaultCache(): void {
  cached = null;
}
