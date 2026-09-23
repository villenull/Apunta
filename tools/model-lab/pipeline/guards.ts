/**
 * The consent and data-path gates for every real-data entry point in the
 * model lab.
 *
 * The synthetic prototype runs anywhere. Everything that could touch the
 * therapist's own material is gated here, and the gates are code, not a
 * comment, for one reason: a script that *can* read her export will eventually
 * be run by someone in a hurry, and the run that matters is the one nobody
 * checked twice.
 *
 * Two rules, both enforced before a single byte is read:
 *
 * 1. **An explicit consent flag.** `--i-have-consent` must be on the command
 *    line. The therapist's agreement is recorded in `docs/decisions.md`; the
 *    flag is the operator saying, at the moment of the run, that this run is
 *    the one that agreement covers. There is no environment variable, no
 *    config file and no default that can stand in for it.
 * 2. **Data outside the repository.** Inputs and outputs must resolve outside
 *    the repo's own tree, so an export, a dataset or an adapter can never be
 *    staged, committed or pushed by accident. Outputs must sit under the
 *    model-lab directory in the user's data directory, the same place the
 *    database lives and with the same protection.
 */

import { homedir } from 'node:os';
import { realpathSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CONSENT_FLAG = '--i-have-consent';

/** `tools/model-lab/pipeline/` → the repository root. */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** Where consented artifacts live: alongside the database, never in the repo. */
export function labDataRoot(home: string = homedir()): string {
  return resolve(home, '.local', 'share', 'apunta', 'model-lab');
}

export class ConsentError extends Error {
  readonly code: 'no_consent' | 'inside_repo' | 'outside_lab';
  constructor(code: ConsentError['code'], message: string) {
    super(message);
    this.name = 'ConsentError';
    this.code = code;
  }
}

function isInside(parent: string, candidate: string): boolean {
  const rel = relative(parent, candidate);
  return rel === '' || (!rel.startsWith('..') && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

/** Resolve a path for comparison, tolerating one that does not exist yet. */
function realpathOrSelf(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

/**
 * The consent gate. `argv` is the process arguments; the flag must be present
 * as its own argument, exactly.
 */
export function requireConsent(argv: readonly string[], purpose: string): void {
  if (!argv.includes(CONSENT_FLAG)) {
    throw new ConsentError(
      'no_consent',
      `${purpose} reads the therapist's own material and will not run without ${CONSENT_FLAG}. ` +
        'Pass it only when this run is covered by her recorded agreement (docs/decisions.md).',
    );
  }
}

/**
 * An input path: it must exist, and it must not be inside the repository.
 */
export function requireInputOutsideRepo(path: string, home: string = homedir()): string {
  const resolved = realpathOrSelf(resolve(path));
  if (isInside(REPO_ROOT, resolved)) {
    throw new ConsentError('inside_repo', `refusing to read ${resolved}: it is inside the repository`);
  }
  if (isInside(labDataRoot(home), resolved)) {
    throw new ConsentError(
      'inside_repo',
      `refusing to read ${resolved}: that is a lab artifact, not an export`,
    );
  }
  return resolved;
}

/**
 * An output path: it must sit under the lab data directory. Nothing the lab
 * writes may be inside the repository, and nothing may be written anywhere
 * else on the machine either.
 */
export function requireOutputUnderLab(path: string, home: string = homedir()): string {
  const resolved = resolve(path);
  const root = realpathOrSelf(labDataRoot(home));
  if (!isInside(root, resolved)) {
    throw new ConsentError(
      'outside_lab',
      `refusing to write ${resolved}: lab outputs live under ${root} (outside the repository, same protection as the database)`,
    );
  }
  if (isInside(REPO_ROOT, resolved)) {
    throw new ConsentError('inside_repo', `refusing to write ${resolved}: it is inside the repository`);
  }
  return resolved;
}

/** Reads a `--flag value` pair out of argv, or throws with the usage line. */
export function requiredArg(argv: readonly string[], flag: string): string {
  const index = argv.indexOf(flag);
  const value = index === -1 ? undefined : argv[index + 1];
  if (value === undefined || value.startsWith('--')) {
    throw new ConsentError('no_consent', `${flag} is required`);
  }
  return value;
}
