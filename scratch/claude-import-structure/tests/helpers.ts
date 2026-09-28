import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseCapture, type CaptureBundle } from '../src/capture.js';
import { parseProposal, type Proposal } from '../src/proposal.js';

/**
 * Fixture access and the one mutation helper the adversarial tests share.
 *
 * The adversarial proposals are built by *editing the gold* rather than stored
 * as separate files, and that is deliberate: a stored bad proposal freezes one
 * particular corruption, while a mutation says exactly which single thing was
 * broken, so a test failure names the defect instead of a diff. Each mutation
 * is applied to a fresh deep copy, so no test can see another's damage.
 */

const here = dirname(fileURLToPath(import.meta.url));
export const laneRoot = join(here, '..');

function readJson(relative: string): unknown {
  return JSON.parse(readFileSync(join(laneRoot, relative), 'utf8')) as unknown;
}

export function corpus(): CaptureBundle {
  return parseCapture(readJson('fixtures/capture/corpus.json'));
}

/** The raw JSON, for tests that need a capture that is *not* well formed. */
export function corpusJson(): Record<string, unknown> {
  return readJson('fixtures/capture/corpus.json') as Record<string, unknown>;
}

export function gold(): Proposal {
  return parseProposal(readJson('fixtures/proposals/gold.json'));
}

export function goldJson(): Record<string, unknown> {
  return readJson('fixtures/proposals/gold.json') as Record<string, unknown>;
}

export interface Expected {
  readonly reference_date: string;
  readonly timezone: string;
  readonly eligibility_months: number;
  readonly window: { readonly from: string; readonly to: string };
  readonly counts: Record<string, number>;
  readonly warnings_by_code: Record<string, number>;
  readonly decisions: readonly { kind: string; subject: string }[];
  readonly patients: readonly {
    identity_key: string;
    name: string;
    eligible: boolean;
    conversations: readonly string[];
    session_dates: readonly (string | null)[];
    in_window_sessions: number;
    history_sessions: number;
    new_notes: number;
  }[];
  readonly not_patients: readonly { identity_key: string; role: string; new_notes: number }[];
  readonly zero_cross_patient_merges: boolean;
  readonly uncovered: readonly unknown[];
  readonly untouched_conversations: readonly unknown[];
  readonly alternative_reference_dates: readonly {
    reference_date: string;
    window: { from: string; to: string };
    clamped_from: string | null;
    eligible: readonly string[];
  }[];
}

export function expected(): Expected {
  return readJson('fixtures/expected/corpus.json') as Expected;
}

export function promptFile(): string {
  return readFileSync(join(laneRoot, 'prompts/claude-preparation-prompt.md'), 'utf8');
}

/** The text block the owner would paste, extracted from the prompt document. */
export function promptBlock(): string {
  const match = /^## The prompt\n\n```text\n([\s\S]*?)\n```$/m.exec(promptFile());
  if (match === null) throw new Error('The prompt document has no ```text block.');
  return match[1] as string;
}

/** A fresh, mutable copy of the gold proposal. */
export function mutableGold(): {
  proposal: Proposal;
  sessions: Proposal['sessions'];
  identities: Proposal['identities'];
} {
  const proposal = gold();
  return { proposal, sessions: proposal.sessions, identities: proposal.identities };
}

export function clone<T>(value: T): T {
  return structuredClone(value);
}

/** The session of a conversation that cites a given message, for a clean edit. */
export function sessionFor(proposal: Proposal, messageId: string): Proposal['sessions'][number] {
  const session = proposal.sessions.find((candidate) => candidate.message_ids.includes(messageId));
  if (session === undefined) throw new Error(`No session in the gold proposal cites ${messageId}.`);
  return session;
}

export function identityFor(proposal: Proposal, key: string): Proposal['identities'][number] {
  const identity = proposal.identities.find((candidate) => candidate.identity_key === key);
  if (identity === undefined) throw new Error(`No identity ${key} in the gold proposal.`);
  return identity;
}
