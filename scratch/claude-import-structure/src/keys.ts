import { createHash } from 'node:crypto';

/**
 * Keys, always derived.
 *
 * The proposal format never *carries* a session or note key as an input to be
 * trusted: the validator recomputes both from the capture and compares, and a
 * mismatch is an error. That is what makes replay deterministic — the same
 * capture and the same proposal produce byte-identical keys, so a second run
 * recognises what the first wrote instead of writing it again — and it is why
 * a hand-authored fixture cannot smuggle in a key of its own.
 *
 * The inputs are deliberately narrow: a conversation id and the session's
 * message ids for a session key; the session key, the revision number and the
 * *resolved* span offsets for a note key. Offsets rather than quotes, because a
 * quote can be re-worded by a capture that re-wraps text and two different
 * revisions of the same reply can quote the same words.
 */

export const PROPOSAL_FORMAT = 'apunta.claude-import.proposal';
export const PROPOSAL_VERSION = 1;

function digest(parts: readonly string[]): string {
  return createHash('sha256').update(parts.join('|'), 'utf8').digest('hex').slice(0, 16);
}

export function spanFingerprint(
  spans: readonly { message_id: string; start: number; end: number }[],
): string {
  return spans.map((span) => `${span.message_id}:${String(span.start)}:${String(span.end)}`).join(';');
}

/** Stable for a set of messages inside one conversation, in thread order. */
export function sessionKey(conversationId: string, messageIds: readonly string[]): string {
  const first = messageIds[0] ?? '';
  const last = messageIds.at(-1) ?? '';
  return `ses_${digest([PROPOSAL_FORMAT, String(PROPOSAL_VERSION), 'session', conversationId, first, last])}`;
}

/**
 * Stable per revision, and **different** per revision: a corrected note gets a
 * new key, so the importer can tell "this is a revision of note X" from "this is
 * a note I have not seen". The chain itself is carried explicitly in
 * `supersedes`, so a validator can check it without reverse-engineering hashes.
 */
export function noteKey(
  session: string,
  revision: number,
  spans: readonly { message_id: string; start: number; end: number }[],
): string {
  return `not_${digest([PROPOSAL_FORMAT, String(PROPOSAL_VERSION), 'note', session, String(revision), spanFingerprint(spans)])}`;
}
