import { ClaudeImportReportSchema, ImportSkipReasonSchema } from '@apunta/shared';
import { describe, expect, it } from 'vitest';

import { dryRun } from '../src/dry-run.js';
import { sessionKey } from '../src/keys.js';
import { validate } from '../src/validate.js';
import { corpus, gold, sessionFor } from './helpers.js';

/**
 * The dry run, against Apunta's existing import contract.
 *
 * `dryRun` returns a `ClaudeImportReport` and parses it with the same zod schema
 * `POST /api/import/claude/preview` answers with, so "this proposal is
 * expressible in what Apunta already ships" is one assertion rather than an
 * opinion. Where it is not expressible, the loss is named, and the set of losses
 * is asserted exactly — so a change in `shared/src/import.ts` that closes one of
 * them fails here and gets written up, rather than being discovered later.
 *
 * Nothing here writes. No database is opened, no file is created, no server
 * starts: the function is pure, which is how "a dry run without writing to the
 * app" is demonstrated rather than promised.
 */

const capture = corpus();
const proposal = gold();
const report = validate(capture, proposal);

describe('the mapped report', () => {
  it('parses as the shipped ClaudeImportReport', () => {
    const dry = dryRun(capture, proposal, report);
    expect(ClaudeImportReportSchema.safeParse(dry.report).success).toBe(true);
  });

  it('carries the six qualifying patients and the twelve new notes', () => {
    const dry = dryRun(capture, proposal, report);
    expect(dry.report.patients).toHaveLength(6);
    expect(dry.report.notes).toBe(12);
    expect(dry.report.patients_to_create).toBe(6);
    expect(dry.report.batch_id).toBeNull();
    // The range is the history that will be written, which is wider than the
    // window: Ana's 2025 session comes with her. The shipped field means "the
    // range of the capture", so the two are not the same number.
    expect(dry.report.date_range).toEqual({ from: '2025-03-11', to: '2026-09-10' });
  });

  it('uses the first day of the rolling window as the cutoff it does have', () => {
    const dry = dryRun(capture, proposal, report);
    expect(dry.report.cutoff).toBe('2026-06-27');
  });

  it('marks a name the proposal took from a title as guessed, and one she listed as not', () => {
    const dry = dryRun(capture, proposal, report, {
      listed_names: ['Ana Ruiz'],
      existing_patients: [{ id: '01920000-0000-7000-8000-000000000001', name: 'Diego Ramos' }],
    });
    const byKey = new Map(dry.report.patients.map((patient) => [patient.key, patient]));
    expect(byKey.get('proposal:ana_ruiz')).toMatchObject({ source: 'list', name_guessed: false });
    expect(byKey.get('proposal:diego_ramos')).toMatchObject({
      source: 'existing',
      patient_id: '01920000-0000-7000-8000-000000000001',
      name_guessed: false,
    });
    // Stated in her own words, but not on her list: still checked by her.
    expect(byKey.get('proposal:maria_lopez')).toMatchObject({ source: 'title', name_guessed: true });
    // Everyone except the one who already exists in Apunta.
    expect(dry.report.patients_to_create).toBe(5);
  });

  it('reports a listed name that matched nobody', () => {
    const dry = dryRun(capture, proposal, report, { listed_names: ['Ana Ruiz', 'Nadie Aquí'] });
    expect(dry.report.unmatched_names).toEqual(['nadie aquí']);
  });

  it('leaves out a patient she unticked', () => {
    const dry = dryRun(capture, proposal, report, { excluded: new Set(['ana_ruiz']) });
    expect(dry.report.patients).toHaveLength(5);
    expect(dry.write_plan).toHaveLength(8);
  });

  it('lists the out-of-window sittings as skipped rows, with counts and no text', () => {
    const dry = dryRun(capture, proposal, report);
    expect(dry.report.skipped).toHaveLength(1);
    expect(dry.report.skipped[0]).toMatchObject({ reason: 'before_cutoff', sessions: 1 });
    expect(JSON.stringify(dry.report)).not.toContain('Petra');
  });

  it('counts attachments, abandoned branches and messages without importing any of them', () => {
    const dry = dryRun(capture, proposal, report);
    expect(dry.report.totals).toMatchObject({
      conversations: 11,
      messages: 40,
      abandoned: 1,
      unreadable: 0,
      attachments: 0,
    });
  });
});

describe('deduplication and replay', () => {
  it('writes nothing twice on a replay: the same keys come back', () => {
    const first = dryRun(capture, proposal, report);
    const secondReport = validate(capture, gold());
    const second = dryRun(capture, gold(), secondReport);
    expect(second.dedupe.new_note_keys).toEqual(first.dedupe.new_note_keys);
    expect(second.write_plan).toEqual(first.write_plan);
    expect(second.dedupe.replay_stable).toBe(true);
  });

  it('recognises what an earlier run wrote, from session keys alone', () => {
    const first = sessionFor(proposal, 'a1-01');
    const key = sessionKey(first.conversation_id, first.message_ids);
    const replay = validate(capture, gold(), { sessions: new Set([key]) });
    const dry = dryRun(capture, gold(), replay);
    expect(dry.dedupe.already_imported).toBe(1);
    expect(dry.write_plan).toHaveLength(11);
    expect(dry.report.already_imported).toBe(1);
  });

  it('blocks a revision rather than editing a note the batch ledger cannot undo', () => {
    const tomas = sessionFor(proposal, 't1-02');
    const key = sessionKey(tomas.conversation_id, tomas.message_ids);
    const replay = validate(capture, gold(), { revisions: new Map([[key, 1]]) });
    const dry = dryRun(capture, gold(), replay);
    expect(dry.dedupe.revision_pending).toBe(1);
    expect(dry.blockers).toContain('revision_pending_decision');
    expect(dry.write_plan).toHaveLength(11);
  });

  it('names the uncertainty it cannot express, instead of dropping it', () => {
    const dry = dryRun(capture, proposal, report);
    expect(dry.blockers).toContain('unmappable:unknown_date');
  });

  it('reports a relative and a non-patient conversation without blocking the run', () => {
    const dry = dryRun(capture, proposal, report);
    // They are accounted for; the shipped report simply has no row for either.
    // Blocking on them would block every real import.
    expect(dry.reported).toEqual(['relative_mention', 'role_not_a_patient']);
    expect(dry.blockers).not.toContain('unmappable:relative_mention');
    expect(dry.blockers).not.toContain('unmappable:role_not_a_patient');
  });

  it('blocks a captured conversation the proposal says nothing about', () => {
    const proposal = gold();
    const dropped = proposal.sessions.filter((session) => session.conversation_id !== 'conv-sourdough');
    const report = validate(capture, { ...proposal, sessions: dropped });
    const dry = dryRun(capture, { ...proposal, sessions: dropped }, report);
    expect(dry.blockers).toContain('unmappable:untouched_conversation');
  });

  it('states the undo plan in terms of the shipped mechanism', () => {
    const dry = dryRun(capture, proposal, report);
    expect(dry.undo_plan.join(' ')).toContain('createImportBatch');
    expect(dry.undo_plan.join(' ')).toContain('undoImportBatch');
    expect(dry.undo_plan.join(' ')).toContain('NOT covered');
  });
});

describe('the gap between this format and the shipped contract', () => {
  it('has no skip reason for an undated session, a relative or a partial capture', () => {
    const reasons = ImportSkipReasonSchema.options;
    for (const missing of [
      'unknown_date',
      'relative_mention',
      'injected_source_text',
      'revision_pending_decision',
      'incomplete_capture',
    ]) {
      expect(reasons, `${missing} is now expressible; update the results doc`).not.toContain(missing);
    }
    expect(reasons).toEqual([
      'before_cutoff',
      'single_session',
      'not_clinical',
      'no_name',
      'ambiguous',
      'excluded',
    ]);
  });

  it('lists the deltas it found, and they are all about this boundary', () => {
    const dry = dryRun(capture, proposal, report);
    expect(dry.deltas).toHaveLength(7);
    const joined = dry.deltas.join(' ');
    expect(joined).toContain('reference_date');
    expect(joined).toContain('instantToLocalDay');
    expect(joined).toContain('activeSince');
    expect(joined).toContain('MIN_SESSIONS');
    expect(joined).toContain('completeness field');
  });
});
