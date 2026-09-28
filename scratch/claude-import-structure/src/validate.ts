import { CaptureIndex, type CaptureBundle } from './capture.js';
import {
  DEFAULT_WINDOW_MONTHS,
  eligibilityWindow,
  findDateCandidates,
  isEligibleDay,
  zoneDay,
} from './dates.js';
import type { EligibilityWindow } from './dates.js';
import { lintInjection } from './injection.js';
import { noteKey, sessionKey } from './keys.js';
import { isQuoteSpan, type Identity, type Proposal, type Span } from './proposal.js';

/**
 * The validator: everything in this lane that is *decided*, as opposed to
 * proposed.
 *
 * It takes a capture (facts) and a proposal (claims) and returns findings. It
 * writes nothing, calls nothing, reads no clock and no machine timezone: same
 * inputs, same report, every time, in any of the four zones the suite runs in.
 * That is deliberate — the properties below have to be checkable without a
 * browser, an account or a model, or they are not properties, they are hopes.
 *
 * The claims it defends, and the codes that defend them:
 *
 * | Criterion | Codes |
 * | --- | --- |
 * | source-reference integrity | `unknown_source_id`, `cross_conversation_source`, `off_thread_source`, `span_out_of_range`, `span_ambiguous_quote`, `span_unordered`, `span_overlap`, `session_order_mismatch`, `session_key_mismatch` |
 * | original-text preservation | `text_not_verbatim`, `injected_span` |
 * | eligibility from session dates | `date_basis_stated_without_evidence`, `unsupported_session_date`, `date_basis_unknown_with_date`, `date_evidence_rejected`, decision `date_needs_decision` |
 * | month-end and zone boundaries | `eligibilityWindow` in `dates.ts`, reported with `clamped_from`; decision on a text naming two days |
 * | full history after qualification | error `uncovered_interior_messages`, warning `uncovered_source_messages`, `history_sessions` per identity |
 * | same-name ambiguity | `ambiguous_identity`, `identity_key_duplicate`, `identity_evidence_insufficient`, `relative_promoted`, decision `identity_needs_decision` |
 * | one chat or many, one session, revised notes | `revision_conflict`, `supersedes_unknown`, decision `revision_needs_decision` |
 * | untrusted conversation text | `injected_span`, `date_evidence_rejected`, warning `injected_source_text` |
 * | an incomplete capture cannot look complete | `incomplete_capture`, `completeness_mismatch` |
 *
 * What it does **not** decide, and no amount of code here can: whether a
 * grounded session date is the *right* session date, and whether a person is who
 * the conversation says. Those are the therapist's, and every grounded date
 * reaches her as a decision with the quoted text beside it.
 */

export type Severity = 'error' | 'decision' | 'warning';

export interface Finding {
  readonly code: string;
  readonly severity: Severity;
  /** A JSON path into the proposal, or a capture locator. Never note text. */
  readonly path: string;
  /** A locator, never a name the therapist typed and never a quote. */
  readonly detail: string;
}

export interface ResolvedSpan {
  readonly message_id: string;
  readonly start: number;
  readonly end: number;
  readonly text: string;
  /** The injection rules the quoted text trips. */
  readonly injection: readonly string[];
}

export type NoteDisposition =
  /** Nothing like it has been written. */
  | 'new'
  /** An earlier run wrote this session at this revision or later. */
  | 'already_imported'
  /** A later revision than anything imported: cannot be written in place. */
  | 'revision_pending_decision'
  /** Not the live revision of its chain. */
  | 'superseded'
  /** Its session is out of the window, or its identity is out of scope. */
  | 'out_of_scope';

export interface ValidatedNote {
  readonly note_key: string;
  readonly session_key: string;
  readonly identity_key: string;
  readonly revision: number;
  readonly live: boolean;
  /** Recomputed from the capture. This is what would be written. */
  readonly text: string;
  readonly spans: readonly ResolvedSpan[];
  readonly declared_text_matches: boolean;
  readonly disposition: NoteDisposition;
}

export interface ValidatedSession {
  readonly session_key: string;
  readonly conversation_id: string;
  readonly identity_key: string;
  readonly session_date: string | null;
  readonly session_date_basis: 'stated' | 'inferred' | 'unknown';
  /** A stated date inside the window. The only way a patient qualifies. */
  readonly eligible: boolean;
  /** Imported: its identity qualified, and this session is part of that history. */
  in_scope: boolean;
  readonly first_message_day: string | null;
  readonly message_count: number;
  readonly message_ids: readonly string[];
  readonly note_count: number;
  readonly live_note_count: number;
}

export interface ValidatedIdentity {
  readonly identity_key: string;
  readonly name: string;
  readonly role: Identity['role'];
  /** Qualified: at least one session with a stated date inside the window. */
  readonly eligible: boolean;
  /** Qualified *and* asked for: what a run would actually write for them. */
  readonly in_scope: boolean;
  readonly session_count: number;
  /** Every session of theirs, however old — the coverage criterion. */
  readonly history_sessions: readonly string[];
  readonly new_notes: number;
  readonly conversations: readonly string[];
  /** Their name is only ever mentioned inside another patient's note text. */
  readonly relative_only: boolean;
}

export interface ValidationReport {
  readonly ok: boolean;
  readonly errors: readonly Finding[];
  readonly decisions: readonly Finding[];
  readonly warnings: readonly Finding[];
  readonly window: EligibilityWindow;
  readonly identities: readonly ValidatedIdentity[];
  readonly sessions: readonly ValidatedSession[];
  readonly notes: readonly ValidatedNote[];
  readonly untouched_conversations: readonly { conversation_id: string; messages: number }[];
  readonly uncovered: readonly { conversation_id: string; messages: number; interior: boolean }[];
  readonly totals: {
    readonly conversations: number;
    readonly messages: number;
    /** Messages on the captured conversation but not on its live branch. */
    readonly abandoned: number;
    readonly live_branch_messages: number;
    readonly identities: number;
    /** Identities that qualified on a stated date inside the window. */
    readonly patients: number;
    readonly sessions: number;
    readonly notes: number;
    readonly live_notes: number;
    readonly new_notes: number;
    readonly already_imported: number;
    readonly superseded: number;
    readonly out_of_scope: number;
    readonly decisions: number;
  };
}

export interface AlreadyImported {
  /** Session keys an earlier run already wrote. */
  readonly sessions?: ReadonlySet<string>;
  /** The highest revision already written, per session. */
  readonly revisions?: ReadonlyMap<string, number>;
}

interface Resolved {
  readonly span: ResolvedSpan | null;
  readonly code: string | null;
}

function resolveSpan(index: CaptureIndex, conversationId: string, span: Span): Resolved {
  const fault = index.citationFault(span.message_id, conversationId);
  if (fault !== null) return { span: null, code: fault };
  const message = index.locate(span.message_id)?.message;
  if (message === undefined) return { span: null, code: 'unknown_source_id' };

  let start: number;
  let end: number;
  if (isQuoteSpan(span)) {
    const first = message.text.indexOf(span.quote);
    if (first < 0) return { span: null, code: 'span_out_of_range' };
    if (message.text.indexOf(span.quote, first + 1) >= 0) return { span: null, code: 'span_ambiguous_quote' };
    start = first;
    end = first + span.quote.length;
  } else {
    start = span.start;
    end = span.end;
  }
  if (end > message.text.length || start >= end) return { span: null, code: 'span_out_of_range' };
  const text = message.text.slice(start, end);
  return {
    span: {
      message_id: span.message_id,
      start,
      end,
      text,
      injection: [...new Set(lintInjection(text).map((hit) => hit.rule))].sort(),
    },
    code: null,
  };
}

function daysBetween(a: string, b: string): number {
  const at = Date.parse(`${a}T00:00:00Z`);
  const bt = Date.parse(`${b}T00:00:00Z`);
  if (Number.isNaN(at) || Number.isNaN(bt)) return 0;
  return Math.round((bt - at) / 86_400_000);
}

/** A session date and the chat it was written up in may be days apart, not years. */
const CHAT_DATE_TOLERANCE_DAYS = 30;

export function validate(
  capture: CaptureBundle,
  proposal: Proposal,
  already: AlreadyImported = {},
): ValidationReport {
  const captureIndex = new CaptureIndex(capture);
  const index = captureIndex;
  const errors: Finding[] = [];
  const decisions: Finding[] = [];
  const warnings: Finding[] = [];
  const add = (list: Finding[], finding: Finding): void => void list.push(finding);

  // --- The capture itself -----------------------------------------------------
  const completeness = capture.completeness;
  if (!completeness.complete) {
    add(errors, {
      code: 'incomplete_capture',
      severity: 'error',
      path: 'capture.completeness.complete',
      detail: `complete=false, ${String(completeness.pages_read)}/${String(completeness.pages_declared)} pages read`,
    });
  }
  const messageCount = capture.conversations.reduce(
    (sum, conversation) => sum + conversation.messages.length,
    0,
  );
  if (
    completeness.messages_declared !== messageCount ||
    completeness.conversations_declared !== capture.conversations.length
  ) {
    add(errors, {
      code: 'completeness_mismatch',
      severity: 'error',
      path: 'capture.completeness',
      detail: `declared ${String(completeness.conversations_declared)} conversations / ${String(completeness.messages_declared)} messages, read ${String(capture.conversations.length)} / ${String(messageCount)}`,
    });
  }
  for (const failure of completeness.failures) {
    add(warnings, {
      code: `capture_failure_${failure.code}`,
      severity: 'warning',
      path: `capture.completeness.failures.${failure.stage}`,
      detail: `${failure.stage}: ${failure.code} x${String(failure.count)}`,
    });
  }

  // --- The window -------------------------------------------------------------
  let window: EligibilityWindow;
  try {
    window = eligibilityWindow({
      referenceDate: proposal.context.reference_date,
      timezone: proposal.context.timezone,
      months: proposal.context.eligibility_months,
    });
  } catch (error) {
    add(errors, {
      code: 'bad_context',
      severity: 'error',
      path: 'context',
      detail: error instanceof Error ? error.message : 'unusable reference date or timezone',
    });
    window = eligibilityWindow({
      referenceDate: '1970-01-01',
      timezone: 'UTC',
      months: DEFAULT_WINDOW_MONTHS,
    });
  }
  if (window.clamped_from !== null) {
    add(warnings, {
      code: 'eligibility_window_clamped',
      severity: 'warning',
      path: 'context.reference_date',
      detail: `${window.reference_date} minus ${String(window.months)} months: ${window.clamped_from} clamped to ${window.from}`,
    });
  }

  // --- Identities -------------------------------------------------------------
  const identityKeys = new Set<string>();
  const identityByKey = new Map<string, Identity>();
  proposal.identities.forEach((identity, at) => {
    if (identityKeys.has(identity.identity_key)) {
      add(errors, {
        code: 'identity_key_duplicate',
        severity: 'error',
        path: `identities[${String(at)}].identity_key`,
        detail: identity.identity_key,
      });
      return;
    }
    identityKeys.add(identity.identity_key);
    identityByKey.set(identity.identity_key, identity);
  });

  const evidenceByIdentity = new Map<string, ResolvedSpan[]>();
  const conversationsByIdentity = new Map<string, Set<string>>();
  for (const identity of proposal.identities) {
    const resolved: ResolvedSpan[] = [];
    identity.evidence.forEach((span, offset) => {
      const location = index.locate(span.message_id);
      if (location === null) {
        add(errors, {
          code: 'unknown_source_id',
          severity: 'error',
          path: `identities.${identity.identity_key}.evidence[${String(offset)}]`,
          detail: span.message_id,
        });
        return;
      }
      const result = resolveSpan(index, location.conversation.conversation_id, span);
      if (result.span === null) {
        add(errors, {
          code: result.code ?? 'span_out_of_range',
          severity: 'error',
          path: `identities.${identity.identity_key}.evidence[${String(offset)}]`,
          detail: span.message_id,
        });
        return;
      }
      resolved.push(result.span);
      const conversations = conversationsByIdentity.get(identity.identity_key) ?? new Set<string>();
      conversations.add(location.conversation.conversation_id);
      conversationsByIdentity.set(identity.identity_key, conversations);
    });
    evidenceByIdentity.set(identity.identity_key, resolved);

    if (identity.role === 'patient' && resolved.length === 0) {
      add(errors, {
        code: 'identity_evidence_insufficient',
        severity: 'error',
        path: `identities.${identity.identity_key}.evidence`,
        detail: `${identity.identity_key}: a patient needs source evidence`,
      });
    }
    for (const other of identity.same_name_as) {
      if (!identityKeys.has(other)) {
        add(errors, {
          code: 'identity_key_unknown',
          severity: 'error',
          path: `identities.${identity.identity_key}.same_name_as`,
          detail: other,
        });
      }
    }
    if (identity.disambiguation?.kind === 'needs_decision') {
      add(decisions, {
        code: 'identity_needs_decision',
        severity: 'decision',
        path: `identities.${identity.identity_key}.disambiguation`,
        detail: identity.identity_key,
      });
    }
  }

  // --- Sessions and notes -----------------------------------------------------
  const sessions: ValidatedSession[] = [];
  const notes: ValidatedNote[] = [];
  const sessionKeys = new Set<string>();

  proposal.sessions.forEach((session, at) => {
    const path = `sessions[${String(at)}]`;
    const conversation = index.conversations.get(session.conversation_id);
    if (conversation === undefined) {
      add(errors, {
        code: 'unknown_conversation',
        severity: 'error',
        path: `${path}.conversation_id`,
        detail: session.conversation_id,
      });
      return;
    }
    const identity = identityByKey.get(session.identity_key);
    if (identity === undefined) {
      add(errors, {
        code: 'identity_key_unknown',
        severity: 'error',
        path: `${path}.identity_key`,
        detail: session.identity_key,
      });
      return;
    }
    // The patient of a session must be evidenced in that session's own
    // conversation. Otherwise a proposal could file a stranger's sitting under
    // whoever happens to share the name.
    if (
      !(conversationsByIdentity.get(session.identity_key) ?? new Set<string>()).has(session.conversation_id)
    ) {
      add(errors, {
        code: 'identity_evidence_not_in_conversation',
        severity: 'error',
        path: `${path}.identity_key`,
        detail: `${session.identity_key} has no evidence in ${session.conversation_id}`,
      });
    }

    const thread = index.liveThreadIds(session.conversation_id);
    let citesOk = true;
    session.message_ids.forEach((id, offset) => {
      const fault = index.citationFault(id, session.conversation_id);
      if (fault === null) return;
      citesOk = false;
      add(errors, {
        code: fault,
        severity: 'error',
        path: `${path}.message_ids[${String(offset)}]`,
        detail: id,
      });
    });
    const positions = session.message_ids.map((id) => thread.indexOf(id));
    if (positions.some((position) => position < 0)) citesOk = false;
    if (new Set(session.message_ids).size !== session.message_ids.length) citesOk = false;
    if (!citesOk) return;
    const ascending = positions.every(
      (position, offset) => offset === 0 || (position ?? -1) > (positions[offset - 1] ?? -1),
    );
    if (!ascending) {
      add(errors, {
        code: 'session_order_mismatch',
        severity: 'error',
        path: `${path}.message_ids`,
        detail: `${String(session.message_ids.length)} ids not in thread order`,
      });
      return;
    }

    const key = sessionKey(session.conversation_id, session.message_ids);
    if (session.session_key !== undefined && session.session_key !== key) {
      add(errors, {
        code: 'session_key_mismatch',
        severity: 'error',
        path: `${path}.session_key`,
        detail: `declared ${session.session_key}, derived ${key}`,
      });
    }
    if (sessionKeys.has(key)) {
      add(errors, {
        code: 'session_duplicate',
        severity: 'error',
        path: path,
        detail: key,
      });
      return;
    }
    sessionKeys.add(key);

    // The date, and the evidence for it.
    const evidence = session.date_evidence.flatMap((span, offset) => {
      const result = resolveSpan(index, session.conversation_id, span);
      if (result.span === null) {
        add(errors, {
          code: result.code ?? 'unknown_source_id',
          severity: 'error',
          path: `${path}.date_evidence[${String(offset)}]`,
          detail: span.message_id,
        });
        return [];
      }
      return [result.span];
    });
    const datePath = `${path}.session_date`;
    // A date that is not supported cannot qualify anybody, however recent it
    // claims to be. Tracked explicitly so no later branch can forget.
    let dateOk = true;
    if (session.session_date_basis === 'unknown' && session.session_date !== null) {
      dateOk = false;
      add(errors, {
        code: 'date_basis_unknown_with_date',
        severity: 'error',
        path: datePath,
        detail: `basis unknown but date ${session.session_date}`,
      });
    }
    if (session.session_date_basis === 'stated') {
      if (evidence.length === 0) {
        dateOk = false;
        add(errors, {
          code: 'date_basis_stated_without_evidence',
          severity: 'error',
          path: `${path}.date_evidence`,
          detail: `${key}: basis stated with no evidence span`,
        });
      }
      for (const span of evidence.filter((candidate) => candidate.injection.length > 0)) {
        dateOk = false;
        add(errors, {
          code: 'date_evidence_rejected',
          severity: 'error',
          path: `${path}.date_evidence`,
          detail: `${span.message_id} cites ${span.injection.join('+')}`,
        });
      }
      const usable = evidence.filter((candidate) => candidate.injection.length === 0);
      const named = new Set(
        usable.flatMap((span) =>
          findDateCandidates(span.text)
            .filter((candidate) => candidate.kind === 'anchored')
            .flatMap((candidate) => (candidate.day === null ? [] : [candidate.day])),
        ),
      );
      if (session.session_date !== null && !named.has(session.session_date)) {
        dateOk = false;
        add(errors, {
          code: 'unsupported_session_date',
          severity: 'error',
          path: datePath,
          detail: `${key}: ${session.session_date} is not stated in the cited text`,
        });
      }
      if (named.size > 1) {
        add(decisions, {
          code: 'date_needs_decision',
          severity: 'decision',
          path: datePath,
          detail: `${key}: cited text names ${[...named].sort().join(' and ')}`,
        });
      }
      const ambiguous = usable.filter((span) =>
        findDateCandidates(span.text).some((candidate) => candidate.kind === 'ambiguous'),
      );
      if (ambiguous.length > 0 && session.session_date !== null) {
        add(decisions, {
          code: 'date_needs_decision',
          severity: 'decision',
          path: datePath,
          detail: `${key}: cited text holds a two-reading date (${ambiguous[0]?.message_id ?? ''})`,
        });
      }
    } else {
      add(decisions, {
        code: 'date_needs_decision',
        severity: 'decision',
        path: datePath,
        detail: `${key}: basis ${session.session_date_basis}${session.session_date === null ? '' : `, date ${session.session_date}`}`,
      });
    }

    const day = session.session_date;
    const firstMessage = index.locate(session.message_ids[0] ?? '')?.message;
    const firstDay =
      firstMessage === undefined || firstMessage.sent_at === null
        ? null
        : zoneDay(firstMessage.sent_at, window.timezone);
    if (
      day !== null &&
      firstDay !== null &&
      Math.abs(daysBetween(day, firstDay)) > CHAT_DATE_TOLERANCE_DAYS
    ) {
      add(warnings, {
        code: 'session_date_far_from_chat',
        severity: 'warning',
        path: datePath,
        detail: `${key}: session ${day}, first message ${firstDay}`,
      });
    }

    // The notes: resolve first, then check the revision chain against the keys
    // this validator derived, never against the ones the proposal claims.
    const resolvedNotes = session.notes.map((note, offset) => {
      const notePath = `${path}.notes[${String(offset)}]`;
      const spans = note.spans.flatMap((span, spanAt) => {
        const result = resolveSpan(index, session.conversation_id, span);
        if (result.span === null) {
          add(errors, {
            code: result.code ?? 'unknown_source_id',
            severity: 'error',
            path: `${notePath}.spans[${String(spanAt)}]`,
            detail: span.message_id,
          });
          return [];
        }
        return [result.span];
      });
      return { note, notePath, spans, complete: spans.length === note.spans.length };
    });

    const derived = resolvedNotes.map(({ note, spans }) => noteKey(key, note.revision, spans));
    const keySet = new Set(derived);
    const revisionToKey = new Map(
      session.notes.map((note, offset) => [note.revision, derived[offset] as string]),
    );
    // `supersedes` may be a note key or `supersedes_revision`; both resolve to a
    // key this validator derived, so a proposal cannot invent a chain.
    const resolvedSupersedes = session.notes.map((note) => {
      if (note.supersedes !== null) return note.supersedes;
      if (note.supersedes_revision === null) return null;
      return revisionToKey.get(note.supersedes_revision) ?? `revision:${String(note.supersedes_revision)}`;
    });
    const supersededBy = new Set(resolvedSupersedes.filter((value): value is string => value !== null));
    const liveIndexes = session.notes
      .map((_note, offset) => (supersededBy.has(derived[offset] as string) ? -1 : offset))
      .filter((offset) => offset >= 0);
    if (session.notes.length > 0 && liveIndexes.length !== 1) {
      add(errors, {
        code: 'revision_conflict',
        severity: 'error',
        path: `${path}.notes`,
        detail: `${key}: ${String(liveIndexes.length)} live revisions of ${String(session.notes.length)} notes`,
      });
    }
    for (const [offset, note] of session.notes.entries()) {
      if (note.revision === 1 && (note.supersedes !== null || note.supersedes_revision !== null)) {
        add(errors, {
          code: 'supersedes_unknown',
          severity: 'error',
          path: `${path}.notes[${String(offset)}]`,
          detail: `${key}: revision 1 supersedes something`,
        });
      }
      if (note.supersedes !== null && note.supersedes_revision !== null) {
        add(errors, {
          code: 'supersedes_unknown',
          severity: 'error',
          path: `${path}.notes[${String(offset)}]`,
          detail: `${key}: supersedes given twice`,
        });
      }
      const target = resolvedSupersedes[offset];
      if (target !== null && target !== undefined && !keySet.has(target)) {
        add(errors, {
          code: 'supersedes_unknown',
          severity: 'error',
          path: `${path}.notes[${String(offset)}]`,
          detail: `${key}: supersedes ${target}, not a note in this session`,
        });
      }
      if (derived.slice(0, offset).includes(derived[offset] as string)) {
        add(errors, {
          code: 'revision_conflict',
          severity: 'error',
          path: `${path}.notes[${String(offset)}]`,
          detail: `${key}: two notes share one derived key`,
        });
      }
    }

    const imported = already.revisions?.get(key) ?? (already.sessions?.has(key) === true ? 1 : undefined);
    const liveIndex = liveIndexes[0];

    resolvedNotes.forEach(({ note, notePath, spans, complete }, offset) => {
      if (!complete) return;
      // Message order, and position order inside one message. A span that goes
      // backwards is out of order; one that starts before the previous span ends
      // overlaps, and is reported as that rather than as disorder.
      const ordered = spans.every((span, at2) => {
        const previous = spans[at2 - 1];
        if (at2 === 0 || previous === undefined) return true;
        if (span.message_id !== previous.message_id) return span.message_id > previous.message_id;
        return span.start > previous.start;
      });
      if (!ordered) {
        add(errors, {
          code: 'span_unordered',
          severity: 'error',
          path: `${notePath}.spans`,
          detail: `${String(spans.length)} spans not in message order`,
        });
        return;
      }
      const overlapping = spans.some(
        (span, at2) =>
          at2 > 0 &&
          span.message_id === spans[at2 - 1]?.message_id &&
          span.start < (spans[at2 - 1]?.end ?? 0),
      );
      if (overlapping) {
        add(errors, {
          code: 'span_overlap',
          severity: 'error',
          path: `${notePath}.spans`,
          detail: 'two spans cover the same characters',
        });
        return;
      }
      const text = spans.map((span) => span.text).join(note.joiner);
      if (text !== note.text) {
        add(errors, {
          code: 'text_not_verbatim',
          severity: 'error',
          path: `${notePath}.text`,
          detail: `declared ${String(note.text.length)} chars, source says ${String(text.length)}`,
        });
      }
      for (const span of spans.filter((candidate) => candidate.injection.length > 0)) {
        add(errors, {
          code: 'injected_span',
          severity: 'error',
          path: `${notePath}.spans`,
          detail: `${span.message_id} cites ${span.injection.join('+')}`,
        });
      }
      const live = liveIndex === offset;
      const revision = note.revision;
      let disposition: NoteDisposition = 'new';
      if (!live) disposition = 'superseded';
      else if (imported !== undefined && revision <= imported) disposition = 'already_imported';
      else if (imported !== undefined) disposition = 'revision_pending_decision';
      if (disposition === 'revision_pending_decision') {
        add(decisions, {
          code: 'revision_needs_decision',
          severity: 'decision',
          path: notePath,
          detail: `${key} revision ${String(revision)} is ahead of the imported revision ${String(imported)}`,
        });
      }
      notes.push({
        note_key: derived[offset] as string,
        session_key: key,
        identity_key: session.identity_key,
        revision,
        live,
        text,
        spans,
        declared_text_matches: text === note.text,
        disposition,
      });
    });

    sessions.push({
      session_key: key,
      conversation_id: session.conversation_id,
      identity_key: session.identity_key,
      session_date: day,
      session_date_basis: session.session_date_basis,
      eligible: session.session_date_basis === 'stated' && dateOk && isEligibleDay(day, window),
      in_scope: false,
      first_message_day: firstDay,
      message_count: session.message_ids.length,
      message_ids: session.message_ids,
      note_count: session.notes.length,
      live_note_count: liveIndex === undefined ? 0 : 1,
    });
  });

  // --- Same name, two people ---------------------------------------------------
  const byName = new Map<string, string[]>();
  for (const identity of proposal.identities) {
    for (const name of [identity.display_name, ...identity.aliases]) {
      const key = name.trim().replace(/\s+/g, ' ').toLowerCase();
      byName.set(key, [...(byName.get(key) ?? []), identity.identity_key]);
    }
  }
  for (const [name, keys] of [...byName.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const distinct = [...new Set(keys)];
    if (distinct.length < 2) continue;
    const conversations = distinct.map((key) => conversationsByIdentity.get(key) ?? new Set<string>());
    const shared = [...(conversations[0] ?? [])].filter((id) =>
      conversations.slice(1).every((other) => other.has(id)),
    );
    if (shared.length === 0) continue;
    for (const key of distinct.sort()) {
      const identity = identityByKey.get(key);
      if (identity?.disambiguation?.kind === 'distinct_person') continue;
      add(errors, {
        code: 'ambiguous_identity',
        severity: 'error',
        path: `identities.${key}.disambiguation`,
        detail: `${name} is shared by ${distinct.sort().join(' and ')} in ${String(shared.length)} conversation(s)`,
      });
      add(decisions, {
        code: 'identity_needs_decision',
        severity: 'decision',
        path: `identities.${key}.disambiguation`,
        detail: `${name}: one person or two?`,
      });
    }
  }

  // --- Coverage ----------------------------------------------------------------
  const covered = new Map<string, Set<number>>();
  for (const session of sessions) {
    const thread = index.liveThreadIds(session.conversation_id);
    const set = covered.get(session.conversation_id) ?? new Set<number>();
    for (const id of session.message_ids) {
      const position = thread.indexOf(id);
      if (position >= 0) set.add(position);
    }
    covered.set(session.conversation_id, set);
  }
  const uncovered: { conversation_id: string; messages: number; interior: boolean }[] = [];
  const untouched: { conversation_id: string; messages: number }[] = [];
  for (const conversation of capture.conversations) {
    const set = covered.get(conversation.conversation_id) ?? new Set<number>();
    const thread = captureIndex.liveThreadIds(conversation.conversation_id);
    if (set.size === 0) {
      untouched.push({
        conversation_id: conversation.conversation_id,
        messages: conversation.messages.length,
      });
      continue;
    }
    // Only messages on the live branch count: an abandoned edit is reported as
    // `abandoned` in the totals, not as a session that was dropped.
    const missing = thread.length - set.size;
    if (missing === 0) continue;
    const first = Math.min(...set);
    const last = Math.max(...set);
    const interior = [...thread.slice(first + 1, last)].some((_, offset) => !set.has(first + 1 + offset));
    uncovered.push({ conversation_id: conversation.conversation_id, messages: missing, interior });
    add(interior ? errors : warnings, {
      code: interior ? 'uncovered_interior_messages' : 'uncovered_source_messages',
      severity: interior ? 'error' : 'warning',
      path: `capture.${conversation.conversation_id}`,
      detail: `${String(missing)} live-branch messages belong to no session`,
    });
  }

  // --- A relative named inside a note is not a patient ------------------------
  const noteMessageIds = new Set(
    notes.filter((note) => note.live).flatMap((note) => note.spans.map((span) => span.message_id)),
  );
  const relativeOnly = new Set<string>();
  for (const identity of proposal.identities) {
    if (identity.role !== 'patient') continue;
    if (identity.evidence.length === 0) continue;
    if (identity.evidence.every((span) => noteMessageIds.has(span.message_id))) {
      relativeOnly.add(identity.identity_key);
      add(errors, {
        code: 'relative_promoted',
        severity: 'error',
        path: `identities.${identity.identity_key}.role`,
        detail: `${identity.identity_key} is only ever named inside another patient's note text`,
      });
    }
  }

  // --- Identities, with their whole history ------------------------------------
  const scope = proposal.scope?.include_identities ?? null;
  // Two people, one identity: a patient's evidence would sit in a sitting that
  // is filed under somebody else. The name checks cannot see this; the message
  // map can.
  const messageOwner = new Map<string, string>();
  for (const session of sessions) {
    for (const id of session.message_ids) messageOwner.set(id, session.identity_key);
  }
  const identities: ValidatedIdentity[] = proposal.identities.map((identity) => {
    const own = sessions.filter((session) => session.identity_key === identity.identity_key);
    const eligible = identity.role === 'patient' && own.some((session) => session.eligible);
    const inScope = scope === null || scope.includes(identity.identity_key);
    for (const session of own) session.in_scope = eligible && inScope;
    if (identity.role === 'patient') {
      const elsewhere = identity.evidence.filter(
        (span) => (messageOwner.get(span.message_id) ?? identity.identity_key) !== identity.identity_key,
      );
      if (elsewhere.length > 0) {
        add(errors, {
          code: 'identity_evidence_outside_own_sessions',
          severity: 'error',
          path: `identities.${identity.identity_key}.evidence`,
          detail: `${String(elsewhere.length)} evidence messages belong to another patient's sitting`,
        });
      }
      const unowned = identity.evidence.filter((span) => messageOwner.has(span.message_id) === false);
      if (unowned.length > 0) {
        add(errors, {
          code: 'identity_session_missing',
          severity: 'error',
          path: `identities.${identity.identity_key}`,
          detail: 'a patient with cited source text and no sitting of their own',
        });
      }
    }
    return {
      identity_key: identity.identity_key,
      name: identity.display_name,
      role: identity.role,
      eligible,
      in_scope: eligible && inScope,
      session_count: own.length,
      history_sessions: own.map((session) => session.session_key),
      new_notes: notes.filter(
        (note) =>
          note.live &&
          note.identity_key === identity.identity_key &&
          own.some((session) => session.session_key === note.session_key && session.in_scope) &&
          note.disposition === 'new',
      ).length,
      conversations: [...new Set(own.map((session) => session.conversation_id))].sort(),
      relative_only: relativeOnly.has(identity.identity_key),
    };
  });

  // --- Injection anywhere in the captured text, cited or not -------------------
  for (const conversation of capture.conversations) {
    const rules = new Set<string>();
    for (const message of conversation.messages)
      for (const hit of lintInjection(message.text)) rules.add(hit.rule);
    if (rules.size === 0) continue;
    add(warnings, {
      code: 'injected_source_text',
      severity: 'warning',
      path: `capture.${conversation.conversation_id}`,
      detail: [...rules].sort().join('+'),
    });
  }

  const inScope = new Set(
    sessions.filter((session) => session.in_scope).map((session) => session.session_key),
  );
  const finalNotes = notes.map((note): ValidatedNote => ({
    ...note,
    disposition: inScope.has(note.session_key) ? note.disposition : 'out_of_scope',
  }));
  const live = finalNotes.filter((note) => note.live);

  const abandoned = capture.conversations.reduce(
    (sum, conversation) =>
      sum + conversation.messages.length - captureIndex.liveThreadIds(conversation.conversation_id).length,
    0,
  );

  return {
    ok: errors.length === 0,
    errors,
    decisions,
    warnings,
    window,
    identities,
    sessions,
    notes: finalNotes,
    untouched_conversations: untouched,
    uncovered,
    totals: {
      conversations: capture.conversations.length,
      messages: messageCount,
      abandoned,
      live_branch_messages: messageCount - abandoned,
      identities: proposal.identities.length,
      patients: identities.filter((identity) => identity.eligible).length,
      sessions: sessions.length,
      notes: finalNotes.length,
      live_notes: live.length,
      new_notes: finalNotes.filter((note) => note.disposition === 'new').length,
      already_imported: finalNotes.filter((note) => note.disposition === 'already_imported').length,
      superseded: finalNotes.filter((note) => note.disposition === 'superseded').length,
      out_of_scope: finalNotes.filter((note) => note.disposition === 'out_of_scope').length,
      decisions: decisions.length,
    },
  };
}
