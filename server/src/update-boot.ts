/**
 * Which kind of start this is, decided from the update journal before anything
 * touches the user's database (C-UPD@1 "Recovery startup").
 *
 * | journal                                                   | start                          |
 * | --------------------------------------------------------- | ------------------------------ |
 * | none                                                      | normal                         |
 * | `pending`, running the target, the handoff id matches     | normal, claims its one attempt |
 * | `pending`, the old version, no handoff                    | normal, journal discarded      |
 * | `pending`, any other version or handoff                   | recovery                       |
 * | `health_attempted` (any version, any handoff)             | recovery                       |
 * | `recovery`                                                | recovery                       |
 * | present but unreadable                                    | recovery                       |
 *
 * `decideBoot` is pure. `chooseBoot` is the one place that reads the journal and
 * makes the durable writes the decision calls for, so the claim is on disk
 * before the caller opens the database and a crash anywhere after it re-enters
 * recovery instead of retrying a normal start.
 */
import type { StartupContext } from '@apunta/shared';

import { clearJournal, readJournal, writeJournal, type UpdateJournal } from './update-journal.js';

/** The private handoff the old shell gives the replacement it launches. */
export const UPDATE_HANDOFF_ENV = 'APUNTA_UPDATE_HANDOFF';

export type RecoveryReason =
  | 'corrupt_journal'
  | 'already_attempted'
  | 'recovery_pending'
  | 'wrong_version'
  | 'wrong_handoff'
  | 'claim_failed';

export type BootDecision =
  | { readonly mode: 'normal'; readonly journal: null }
  /** The first legitimate updated boot: write `health_attempted`, then start normally. */
  | { readonly mode: 'normal'; readonly journal: UpdateJournal; readonly claim: true }
  /** `pending`, but this is the old version with no handoff: the install never happened. Discard the journal. */
  | { readonly mode: 'normal'; readonly journal: UpdateJournal; readonly stale: true }
  | {
      readonly mode: 'recovery';
      readonly reason: RecoveryReason;
      /** `null` only when the journal could not be read. */
      readonly journal: UpdateJournal | null;
    };

export interface BootInputs {
  readonly journal: UpdateJournal | null | 'corrupt';
  /** This build's own version. */
  readonly version: string;
  /** `APUNTA_UPDATE_HANDOFF`, if the shell passed one. */
  readonly handoffId: string | undefined;
}

export function decideBoot(inputs: BootInputs): BootDecision {
  const { journal } = inputs;
  if (journal === null) return { mode: 'normal', journal: null };
  if (journal === 'corrupt') return { mode: 'recovery', reason: 'corrupt_journal', journal: null };
  if (journal.phase === 'health_attempted') {
    return { mode: 'recovery', reason: 'already_attempted', journal };
  }
  if (journal.phase === 'recovery') {
    if (journal.recoveryTarget === inputs.version && inputs.handoffId === journal.updateId) {
      const { recoveryTarget, ...restored } = journal;
      return { mode: 'normal', journal: { ...restored, toVersion: recoveryTarget }, claim: true };
    }
    return { mode: 'recovery', reason: 'recovery_pending', journal };
  }
  if (inputs.version !== journal.toVersion) {
    const noHandoff = inputs.handoffId === undefined || inputs.handoffId === '';
    if (inputs.version === journal.fromVersion && noHandoff) return { mode: 'normal', journal, stale: true };
    return { mode: 'recovery', reason: 'wrong_version', journal };
  }
  if (inputs.handoffId === undefined || inputs.handoffId === '' || inputs.handoffId !== journal.updateId) {
    return { mode: 'recovery', reason: 'wrong_handoff', journal };
  }
  return { mode: 'normal', journal, claim: true };
}

export interface ChosenBoot {
  readonly decision: BootDecision;
  /** What `startup_context` carries. */
  readonly context: StartupContext;
}

function contextFor(decision: BootDecision): StartupContext {
  const journal = decision.journal;
  // A stale journal was discarded: nothing about it is the owner's business.
  if (journal === null || (decision.mode === 'normal' && 'stale' in decision)) return { mode: decision.mode };
  return {
    mode: decision.mode,
    updateId: journal.updateId,
    targetVersion: journal.toVersion,
    previousVersion: journal.fromVersion,
  };
}

/**
 * Reads the journal, decides, and writes what the decision requires:
 * `health_attempted` for a claim, `recovery` for a recovery start that found a
 * readable journal in any other phase. A claim that cannot be made durable is
 * not a normal start — an unrecorded attempt could be repeated — so it becomes
 * recovery. A recovery write that fails is logged by the caller's `onError` and
 * recovery proceeds in memory: the next boot reads the older phase, which still
 * selects recovery.
 */
export function chooseBoot(options: {
  readonly dataDir: string;
  readonly version: string;
  readonly env: { readonly [key: string]: string | undefined };
  readonly onError?: ((message: string, error: unknown) => void) | undefined;
}): ChosenBoot {
  const journal = readJournal(options.dataDir);
  let decision: BootDecision =
    options.env['APUNTA_UPDATE_RECOVERY'] === '1'
      ? { mode: 'recovery', reason: 'already_attempted', journal: journal === 'corrupt' ? null : journal }
      : decideBoot({
          journal,
          version: options.version,
          handoffId: options.env[UPDATE_HANDOFF_ENV],
        });

  if (decision.mode === 'normal' && 'stale' in decision) {
    // The install never happened (aborted, failed, or closed mid-update) and
    // this is the old version, intact: the journal describes nothing. If it
    // cannot be removed the next start reaches this same row, so say so and go on.
    try {
      clearJournal(options.dataDir);
    } catch (error) {
      options.onError?.('could not remove the record of an update that never happened', error);
    }
  }

  if (decision.mode === 'normal' && 'claim' in decision) {
    try {
      writeJournal(options.dataDir, { ...decision.journal, phase: 'health_attempted' });
    } catch (error) {
      options.onError?.('could not record the first start of the updated version', error);
      decision = { mode: 'recovery', reason: 'claim_failed', journal: decision.journal };
    }
  }

  if (decision.mode === 'recovery' && decision.journal !== null && decision.journal.phase !== 'recovery') {
    const recovering: UpdateJournal = { ...decision.journal, phase: 'recovery' };
    try {
      writeJournal(options.dataDir, recovering);
    } catch (error) {
      options.onError?.('could not record that this start is in recovery mode', error);
    }
    // Recovery reports itself as recovery whether or not the write landed.
    decision = { ...decision, journal: recovering };
  }

  return { decision, context: contextFor(decision) };
}

export interface HealthConfirmation {
  readonly ok: boolean;
  readonly code?: string;
}

/**
 * The shell's `health_confirm{id}`: it validated its own child's ready line
 * (nonce, protocol, target version) and says the claimed update is healthy.
 * Accepted only for the journal in `health_attempted` whose update id matches
 * exactly; the journal is removed durably before the positive answer. Anything
 * else — no journal, a recovery journal, another id — is `unknown_update`.
 */
export function confirmHealth(dataDir: string, id: string): HealthConfirmation {
  const journal = readJournal(dataDir);
  if (
    journal === null ||
    journal === 'corrupt' ||
    journal.phase !== 'health_attempted' ||
    journal.updateId !== id
  ) {
    return { ok: false, code: 'unknown_update' };
  }
  try {
    clearJournal(dataDir);
  } catch {
    return { ok: false, code: 'journal_failed' };
  }
  return { ok: true };
}

/** The start with no update in play: what a browser-mode start always is. */
export const NORMAL_BOOT: ChosenBoot = {
  decision: { mode: 'normal', journal: null },
  context: { mode: 'normal' },
};
