import {
  ClaudeImportReportSchema,
  importedNoteTitle,
  type ClaudeImportReport,
  type ImportPatientPlan,
  type ImportSkippedConversation,
} from '@apunta/shared';

import { CaptureIndex, type CaptureBundle } from './capture.js';
import type { Proposal } from './proposal.js';
import type { ValidationReport } from './validate.js';

/**
 * The dry run: a validated proposal expressed in Apunta's **existing** import
 * contract, writing nothing.
 *
 * This is the integration question made mechanical. The shape returned is
 * `ClaudeImportReport` from `shared/src/import.ts` — the same zod schema the
 * preview endpoint answers with — so a test can parse it and say, in one
 * assertion, whether a direct-import proposal is expressible in what Apunta
 * already ships. Where it is not, `deltas` names the gap, and the gaps are not
 * cosmetic:
 *
 * - The report has **one** date, `cutoff`, and no reference date and no
 *   timezone. A rolling three-month window with an explicit zone is not
 *   expressible; only its first day fits.
 * - `ImportSkipReason` has no member for a session whose date is unknown, for a
 *   relative, for an incomplete capture, for a rejected instruction or for a
 *   revision ahead of what was imported. Every one of those is a thing this
 *   lane refuses to drop silently, so each is a blocker here rather than a
 *   skip row.
 * - Dedup is by conversation id and message ids parsed out of a note's
 *   provenance line (`importedKeys` in `server/src/import/claude.ts`). This lane
 *   keys by session and note, so an adapter must emit a line that same parser
 *   reads, or the schema needs a new column.
 * - Undo is per batch, over notes the batch created (`undoImportBatch`). A
 *   revision that arrives after its note was imported is not a creation, so it
 *   cannot be taken back by that mechanism — hence `revision_pending_decision`
 *   is a blocker and not a write.
 *
 * The function is pure. It opens no database, writes no file and starts no
 * server, so "demonstrate a proposal dry run without writing to the app" is
 * demonstrated by construction rather than by an inspection.
 */

export interface TherapistContext {
  /** Her optional list, one name per line, as the import screen takes it. */
  readonly listed_names?: readonly string[];
  /** Patients already in Apunta. */
  readonly existing_patients?: readonly {
    readonly id: string;
    readonly name: string;
    readonly archived?: boolean;
  }[];
  /** Identities she has unticked. */
  readonly excluded?: ReadonlySet<string>;
}

export interface ProvenanceLine {
  readonly note_key: string;
  readonly session_key: string;
  readonly line: string;
  readonly title: string;
}

export interface DryRunResult {
  /** Parses against `ClaudeImportReportSchema` — asserted by the tests. */
  readonly report: ClaudeImportReport;
  readonly provenance: readonly ProvenanceLine[];
  readonly write_plan: readonly {
    readonly note_key: string;
    readonly session_key: string;
    readonly identity_key: string;
    readonly recorded_at: string | null;
    readonly body: string;
  }[];
  readonly dedupe: {
    readonly new_note_keys: readonly string[];
    readonly already_imported: number;
    readonly superseded: number;
    readonly revision_pending: number;
    /** Same capture, same proposal, same keys: a replay adds nothing. */
    readonly replay_stable: boolean;
  };
  readonly undo_plan: readonly string[];
  /** Reasons the run must not proceed. Empty for a clean proposal. */
  readonly blockers: readonly string[];
  /**
   * Things the shipped report has no row for that are nonetheless accounted
   * for: a relative, a conversation that is not about a patient. They are
   * reported rather than blocked, because blocking on them would block every
   * real import — what blocks is uncertainty nobody has answered.
   */
  readonly reported: readonly string[];
  /** Where this lane's decisions have no home in the shipped contract. */
  readonly deltas: readonly string[];
}

function normalize(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** The provenance line, in the exact grammar `importedKeys` parses. */
export function proposalProvenanceLine(input: {
  readonly session: string;
  readonly identityKey: string;
  readonly conversationId: string;
  readonly title: string;
  readonly recordedAt: string | null;
  readonly messageIds: readonly string[];
  readonly attachments: number;
  readonly noteKey: string;
}): string {
  const title = input.title.replace(/\s+/g, ' ').trim();
  const name = title === '' ? 'an untitled conversation' : `"${title}"`;
  const when = input.recordedAt === null ? '' : `, recorded ${input.recordedAt}`;
  const files =
    input.attachments === 0
      ? ''
      : `; ${String(input.attachments)} attached ${input.attachments === 1 ? 'file' : 'files'} not imported`;
  return (
    `[Imported from Claude conversation ${name} (${input.conversationId}), ` +
    `session ${input.identityKey}/${input.session}${when}; ` +
    `note from quoted source;${files} messages: ${input.messageIds.join(' ')}]`
  );
}

export function dryRun(
  capture: CaptureBundle,
  proposal: Proposal,
  report: ValidationReport,
  therapist: TherapistContext = {},
): DryRunResult {
  const existing = (therapist.existing_patients ?? []).filter((patient) => patient.archived !== true);
  const listed = new Set((therapist.listed_names ?? []).map(normalize));
  const excluded = therapist.excluded ?? new Set<string>();
  const byName = new Map<string, typeof existing>();
  for (const patient of existing) {
    byName.set(normalize(patient.name), [...(byName.get(normalize(patient.name)) ?? []), patient]);
  }

  const patientPlans: ImportPatientPlan[] = [];
  const planIndex = new Map<string, number>();
  const writePlan: DryRunResult['write_plan'][number][] = [];
  const provenance: ProvenanceLine[] = [];
  const conversationTitles = new Map(
    capture.conversations.map((conversation) => [conversation.conversation_id, conversation.title]),
  );

  // The validated identities, not the raw ones: qualification, scope and the
  // history counts all live in the report.
  const proposed = new Map(proposal.identities.map((identity) => [identity.identity_key, identity]));
  for (const identity of report.identities) {
    const claimed = proposed.get(identity.identity_key);
    if (identity.role !== 'patient') continue;
    if (excluded.has(identity.identity_key)) continue;
    // A patient with nothing new to write is not created and not shown, the way
    // `planImport` already behaves: a summary that lists a patient the run will
    // not create is a summary she has to re-read.
    if (identity.new_notes === 0) continue;
    const lower = normalize(identity.name);
    const matches = byName.get(lower) ?? [];
    const listedName = listed.has(lower);
    const key = `proposal:${identity.identity_key}`;
    const source: ImportPatientPlan['source'] =
      matches.length === 1
        ? 'existing'
        : (claimed?.name_basis ?? 'conversation_title') === 'therapist_list' || listedName
          ? 'list'
          : 'title';
    planIndex.set(identity.identity_key, patientPlans.length);
    patientPlans.push({
      key,
      name: matches.length === 1 ? (matches[0] as (typeof existing)[number]).name : identity.name,
      source,
      patient_id: matches.length === 1 ? (matches[0] as (typeof existing)[number]).id : null,
      name_guessed: source === 'title',
      conversations: identity.conversations.length,
      notes: identity.new_notes,
    });
  }

  const sessionByKey = new Map(report.sessions.map((session) => [session.session_key, session]));

  const attachmentsByConversation = new Map<string, number>();
  for (const conversation of capture.conversations) {
    attachmentsByConversation.set(
      conversation.conversation_id,
      conversation.messages.reduce((sum, message) => sum + message.attachments, 0),
    );
  }

  const newNoteKeys: string[] = [];
  let alreadyImported = 0;
  let superseded = 0;
  let revisionPending = 0;

  for (const note of report.notes) {
    if (note.disposition === 'superseded') superseded += 1;
    if (note.disposition === 'already_imported') alreadyImported += 1;
    if (note.disposition === 'revision_pending_decision') revisionPending += 1;
    if (note.disposition !== 'new') continue;
    const session = sessionByKey.get(note.session_key);
    const at = patientPlans[planIndex.get(note.identity_key) ?? -1];
    if (session === undefined || at === undefined) continue;
    const source = proposal.sessions.find(
      (candidate) =>
        candidate.conversation_id === session.conversation_id &&
        session.message_ids[0] === candidate.message_ids[0],
    );
    const line = proposalProvenanceLine({
      session: note.session_key,
      identityKey: note.identity_key,
      conversationId: session.conversation_id,
      title: conversationTitles.get(session.conversation_id) ?? '',
      recordedAt: session.session_date,
      messageIds: source?.message_ids ?? [],
      attachments: attachmentsByConversation.get(session.conversation_id) ?? 0,
      noteKey: note.note_key,
    });
    provenance.push({
      note_key: note.note_key,
      session_key: note.session_key,
      line,
      title: importedNoteTitle(session.session_date),
    });
    writePlan.push({
      note_key: note.note_key,
      session_key: note.session_key,
      identity_key: note.identity_key,
      recorded_at: session.session_date,
      body: note.text,
    });
    newNoteKeys.push(note.note_key);
  }

  // Skip rows the shipped enum can express.
  const skipped: ImportSkippedConversation[] = [];
  const unmappable = new Set<string>();
  for (const session of report.sessions) {
    if (session.in_scope) continue;
    const identity = report.identities.find((entry) => entry.identity_key === session.identity_key);
    const qualified = identity?.eligible === true;
    if (session.identity_key === '' || identity === undefined) {
      unmappable.add('unassigned_conversation');
      continue;
    }
    if (identity.role !== 'patient') {
      unmappable.add(`role_${identity.role}`);
      continue;
    }
    if (qualified) continue;
    if (session.session_date_basis === 'unknown' || session.session_date_basis === 'inferred') {
      unmappable.add('unknown_date');
      continue;
    }
    skipped.push({
      reason: 'before_cutoff',
      recorded_at: session.first_message_day,
      last_at: session.first_message_day,
      messages: session.message_count,
      sessions: 1,
    });
  }
  for (const identity of report.identities) {
    if (identity.relative_only) unmappable.add('relative_promoted');
    if (identity.role === 'relative_mention') unmappable.add('relative_mention');
  }
  for (const conversation of report.untouched_conversations) {
    if (conversation.messages > 0) unmappable.add('untouched_conversation');
  }

  const inScopeDates = report.sessions
    .filter((session) => session.in_scope && session.session_date !== null)
    .map((session) => session.session_date as string)
    .sort();

  const withoutBody = report.notes.filter((note) => note.live && note.text === '').length;
  const captureIndex = new CaptureIndex(capture);
  const totalMessages = capture.conversations.reduce((sum, c) => sum + c.messages.length, 0);
  const liveThreadMessages = capture.conversations.reduce(
    (sum, conversation) => sum + captureIndex.liveThreadIds(conversation.conversation_id).length,
    0,
  );
  const attachedInScope = [...new Set(writePlan.map((note) => note.session_key))]
    .map((key) => report.sessions.find((session) => session.session_key === key))
    .map((session) =>
      session === undefined ? 0 : (attachmentsByConversation.get(session.conversation_id) ?? 0),
    )
    .reduce((sum, count) => sum + count, 0);

  // Which of the unmappable cases are uncertainty, and which are a decision
  // already taken. Only the first may stop a run.
  const blocking = new Set(['unknown_date', 'untouched_conversation', 'unassigned_conversation']);
  const blockers: string[] = [];
  if (!report.ok) for (const code of new Set(report.errors.map((error) => error.code))) blockers.push(code);
  if (revisionPending > 0) blockers.push('revision_pending_decision');
  for (const code of [...unmappable].sort()) {
    if (blocking.has(code)) blockers.push(`unmappable:${code}`);
  }
  const reported = [...unmappable].filter((code) => !blocking.has(code)).sort();

  const mapped: ClaudeImportReport = {
    batch_id: null,
    source: 'assistant',
    cutoff: report.window.from,
    patients: patientPlans,
    patients_to_create: patientPlans.filter((patient) => patient.patient_id === null).length,
    notes: writePlan.length,
    unmatched_names: [...listed].filter(
      (name) => !report.identities.some((identity) => normalize(identity.name) === name),
    ),
    already_imported: alreadyImported,
    sessions_without_body: withoutBody,
    skipped,
    totals: {
      conversations: capture.conversations.length,
      messages: totalMessages,
      unreadable: 0,
      abandoned: totalMessages - liveThreadMessages,
      attachments: attachedInScope,
    },
    date_range: {
      from: inScopeDates[0] ?? null,
      to: inScopeDates.at(-1) ?? null,
    },
  };

  return {
    report: ClaudeImportReportSchema.parse(mapped),
    provenance,
    write_plan: writePlan,
    dedupe: {
      new_note_keys: newNoteKeys,
      already_imported: alreadyImported,
      superseded,
      revision_pending: revisionPending,
      replay_stable: true,
    },
    undo_plan: [
      'One batch per run, as today: createImportBatch, addBatchNote per written note, addBatchPatient per created patient.',
      'Undo removes exactly what the batch created; a note she has since published stays (undoImportBatch keeps it).',
      'A revision arriving after its note was imported is NOT covered: the batch ledger tracks creations, not edits. This lane blocks it rather than writing it.',
    ],
    blockers: [...new Set(blockers)].sort(),
    reported,
    deltas: [
      'reference_date and timezone have no field in ClaudeImportReport; only the computed first day of the window fits `cutoff`.',
      'ImportSkipReason has no member for unknown_date, relative_mention, injected_source_text, revision_pending_decision or incomplete_capture.',
      'Deduplication reads conversation id and message ids out of the provenance line; this lane keys on session_key and note_key, so the line must carry the session id or the schema needs a column.',
      'instantToLocalDay (shared/src/common.ts) resolves the machine timezone, not the practice timezone the proposal declares.',
      "activeSince (server/src/import/claude.ts) qualifies on chat message timestamps; the owner's rule is session dates.",
      'MIN_SESSIONS = 2 drops single-session patients; "complete available note history" does not have that floor.',
      'The report has no completeness field, so a partial capture currently looks like a finished import.',
    ],
  };
}
