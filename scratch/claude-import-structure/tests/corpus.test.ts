import { describe, expect, it } from 'vitest';

import { corpus, expected, gold } from './helpers.js';
import { validate } from '../src/validate.js';

/**
 * The corpus against its labels.
 *
 * `fixtures/expected/corpus.json` was written by reading the corpus, not by
 * running this validator. So these assertions are a real comparison: if the
 * validator changes its mind about who qualifies, what their history is, or how
 * many notes a patient gets, this file fails instead of agreeing with itself.
 */

const capture = corpus();
const proposal = gold();
const labels = expected();
const report = validate(capture, proposal);

const codes = (list: readonly { code: string }[]): string[] => list.map((finding) => finding.code);

describe('the gold proposal is clean', () => {
  it('has no errors', () => {
    expect(report.errors).toEqual([]);
  });

  it('matches the independently authored counts', () => {
    expect({
      conversations: report.totals.conversations,
      messages: report.totals.messages,
      live_branch_messages: report.totals.live_branch_messages,
      abandoned_messages: report.totals.abandoned,
      identities: report.totals.identities,
      patients: report.totals.patients,
      sessions: report.totals.sessions,
      notes: report.totals.notes,
      live_notes: report.totals.live_notes,
      new_notes: report.totals.new_notes,
      superseded: report.totals.superseded,
      out_of_scope: report.totals.out_of_scope,
      decisions: report.totals.decisions,
      errors: report.errors.length,
      warnings: report.warnings.length,
    }).toEqual(labels.counts);
  });

  it('leaves no live-branch message without a session and no conversation untouched', () => {
    expect(report.uncovered).toEqual(labels.uncovered);
    expect(report.untouched_conversations).toEqual(labels.untouched_conversations);
  });

  it('carries exactly the expected warnings', () => {
    const counted: Record<string, number> = {};
    for (const code of codes(report.warnings)) counted[code] = (counted[code] ?? 0) + 1;
    expect(counted).toEqual(labels.warnings_by_code);
  });

  it('surfaces exactly one decision, about the undated session', () => {
    expect(report.decisions).toHaveLength(labels.decisions.length);
    expect(report.decisions.map((decision) => decision.code)).toEqual(['date_needs_decision']);
    expect(report.decisions[0]?.path).toContain('session_date');
    const declared = labels.decisions.map((decision) => decision.kind);
    expect(proposal.decisions.map((decision) => decision.kind)).toEqual(declared);
  });
});

describe('who qualifies, and on what', () => {
  it.each(labels.patients.map((patient) => [patient.identity_key, patient] as const))(
    '%s',
    (key, patient) => {
      const found = report.identities.find((identity) => identity.identity_key === key);
      expect(found, `${key} is missing from the report`).toBeDefined();
      const identity = found as (typeof report.identities)[number];
      expect(identity.eligible).toBe(patient.eligible);
      expect(identity.conversations).toEqual([...patient.conversations].sort());
      expect(identity.session_count).toBe(patient.history_sessions);
      expect(identity.new_notes).toBe(patient.new_notes);
      const dates = report.sessions
        .filter((session) => session.identity_key === key)
        .map((session) => session.session_date);
      expect([...dates].sort()).toEqual([...patient.session_dates].sort());
      const inWindow = report.sessions.filter((session) => session.identity_key === key && session.eligible);
      expect(inWindow).toHaveLength(patient.in_window_sessions);
    },
  );

  it('imports nobody who is not a patient, and creates nobody from a mention', () => {
    for (const entry of labels.not_patients) {
      const identity = report.identities.find((candidate) => candidate.identity_key === entry.identity_key);
      expect(identity, `${entry.identity_key} is missing`).toBeDefined();
      expect((identity as (typeof report.identities)[number]).role).toBe(entry.role);
      expect((identity as (typeof report.identities)[number]).eligible).toBe(false);
      expect((identity as (typeof report.identities)[number]).new_notes).toBe(entry.new_notes);
    }
  });

  it('gives every session exactly one owner, and no identity owns nothing it claims', () => {
    const known = new Set(report.identities.map((identity) => identity.identity_key));
    for (const session of report.sessions) {
      expect(known.has(session.identity_key), `${session.session_key} has no owner`).toBe(true);
    }
    const owners = new Set(report.sessions.map((session) => session.identity_key));
    // Every identity that owns a sitting is an owner, and the relative who owns
    // none is the only identity with no sessions at all.
    expect(owners.size).toBe(report.identities.filter((identity) => identity.session_count > 0).length);
    expect(report.identities.filter((identity) => identity.session_count === 0)).toHaveLength(1);
    for (const identity of report.identities) {
      const own = report.sessions.filter((session) => session.identity_key === identity.identity_key);
      expect(own.length).toBe(identity.session_count);
      // Nobody's session belongs to somebody else.
      expect(
        identity.history_sessions.every((key) => own.some((session) => session.session_key === key)),
      ).toBe(true);
    }
    expect(labels.zero_cross_patient_merges).toBe(true);
  });
});

describe('the rolling window, from other reference dates', () => {
  it.each(labels.alternative_reference_dates.map((entry) => [entry.reference_date, entry] as const))(
    'reference date %s',
    (referenceDate, entry) => {
      const moved = { ...proposal, context: { ...proposal.context, reference_date: referenceDate } };
      const result = validate(capture, moved);
      expect(result.errors).toEqual([]);
      expect({ from: result.window.from, to: result.window.to }).toEqual(entry.window);
      expect(result.window.clamped_from).toBe(entry.clamped_from);
      expect(
        result.identities
          .filter((identity) => identity.eligible)
          .map((identity) => identity.identity_key)
          .sort(),
      ).toEqual([...entry.eligible].sort());
    },
  );
});
