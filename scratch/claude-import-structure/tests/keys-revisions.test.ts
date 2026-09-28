import { describe, expect, it } from 'vitest';

import { noteKey, sessionKey, spanFingerprint } from '../src/keys.js';
import { validate } from '../src/validate.js';
import { corpus, gold, sessionFor } from './helpers.js';

/**
 * Deterministic keys, and revised notes.
 *
 * Two claims are tested together because they are the same claim: a key that is
 * derived, not supplied, is what makes a replay idempotent *and* what makes a
 * revision chain checkable. If the proposal could name its own keys, both would
 * be decoration.
 */

const capture = corpus();

function edit(change: (proposal: ReturnType<typeof gold>) => void) {
  const proposal = gold();
  change(proposal);
  return validate(capture, proposal);
}

describe('keys are derived, never supplied', () => {
  it('gives the same session key for the same conversation and messages, in any order of calls', () => {
    const first = sessionKey('conv-ana-1', ['a1-01', 'a1-02', 'a1-03']);
    const second = sessionKey('conv-ana-1', ['a1-01', 'a1-02', 'a1-03']);
    expect(first).toBe(second);
    expect(first).toMatch(/^ses_[0-9a-f]{16}$/u);
    expect(sessionKey('conv-ana-1', ['a1-01', 'a1-02'])).not.toBe(first);
    expect(sessionKey('conv-ana-2', ['a1-01', 'a1-02', 'a1-03'])).not.toBe(first);
  });

  it('gives a different note key per revision of the same sitting', () => {
    const spans = [{ message_id: 'a1-02', start: 0, end: 10 }];
    expect(noteKey('ses_x', 1, spans)).not.toBe(noteKey('ses_x', 2, spans));
    expect(noteKey('ses_x', 1, spans)).not.toBe(
      noteKey('ses_x', 1, [{ message_id: 'a1-02', start: 0, end: 11 }]),
    );
    expect(spanFingerprint(spans)).toBe('a1-02:0:10');
  });

  it('is byte-identical across repeated validations of the same proposal', () => {
    const first = validate(capture, gold());
    const second = validate(capture, gold());
    expect(second.notes.map((note) => note.note_key)).toEqual(first.notes.map((note) => note.note_key));
    expect(second.sessions.map((session) => session.session_key)).toEqual(
      first.sessions.map((session) => session.session_key),
    );
  });

  it('rejects a session key the proposal made up', () => {
    const report = edit((proposal) => {
      sessionFor(proposal, 'a1-01').session_key = 'ses_0000000000000000';
    });
    expect(report.errors.map((error) => error.code)).toContain('session_key_mismatch');
  });

  it('accepts a session key that matches what it derives', () => {
    const report = edit((proposal) => {
      const session = sessionFor(proposal, 'a1-01');
      session.session_key = sessionKey(session.conversation_id, session.message_ids);
    });
    expect(report.errors).toEqual([]);
  });
});

describe('revised notes', () => {
  it('keeps the chain and imports only the live revision', () => {
    const report = edit(() => {});
    const tomas = report.sessions.find((session) => session.identity_key === 'tomas_ibarra');
    const notes = report.notes.filter((note) => note.session_key === tomas?.session_key);
    expect(notes).toHaveLength(2);
    expect(notes.map((note) => note.revision)).toEqual([1, 2]);
    expect(notes.map((note) => note.live)).toEqual([false, true]);
    expect(notes.map((note) => note.disposition)).toEqual(['superseded', 'new']);
    expect(notes[1]?.text).toContain('Duelo en las próximas dos sesiones');
    expect(notes[0]?.text).toContain('Trabajar el duelo en las próximas sesiones');
  });

  it('refuses two live revisions of one sitting', () => {
    const report = edit((proposal) => {
      const session = sessionFor(proposal, 't1-02');
      const second = session.notes[1];
      if (second === undefined) throw new Error('fixture changed');
      second.supersedes_revision = null;
    });
    expect(report.errors.map((error) => error.code)).toContain('revision_conflict');
  });

  it('refuses a chain that points at a revision which is not there', () => {
    const report = edit((proposal) => {
      const session = sessionFor(proposal, 't1-02');
      const second = session.notes[1];
      if (second === undefined) throw new Error('fixture changed');
      second.supersedes_revision = 7;
    });
    expect(report.errors.map((error) => error.code)).toContain('supersedes_unknown');
  });

  it('refuses a first revision that supersedes something', () => {
    const report = edit((proposal) => {
      const session = sessionFor(proposal, 't1-02');
      const first = session.notes[0];
      if (first === undefined) throw new Error('fixture changed');
      first.supersedes = noteKey(
        sessionKey('conv-tomas', session.message_ids),
        2,
        first.spans as unknown as { message_id: string; start: number; end: number }[],
      );
    });
    expect(report.errors.map((error) => error.code)).toContain('supersedes_unknown');
  });

  it('refuses a cycle in the chain, which leaves the sitting with no live note', () => {
    const report = edit((proposal) => {
      const session = sessionFor(proposal, 't1-02');
      const [first, second] = session.notes;
      if (first === undefined || second === undefined) throw new Error('fixture changed');
      first.supersedes_revision = 2;
      second.supersedes_revision = 1;
    });
    expect(report.errors.map((error) => error.code)).toContain('revision_conflict');
  });

  it('cites only the abandoned branch as a defect, and keeps the discarded reply out', () => {
    const report = edit(() => {});
    expect(report.errors).toEqual([]);
    // t1-01 is the regeneration that t1-02 replaced. It is in the capture and
    // in nobody's note.
    expect(report.totals.abandoned).toBe(1);
    expect(report.notes.some((note) => note.spans.some((span) => span.message_id === 't1-01'))).toBe(false);
  });

  it('blocks a revision that arrives after its note was already imported', () => {
    const proposal = gold();
    const tomas = sessionFor(proposal, 't1-02');
    const key = sessionKey(tomas.conversation_id, tomas.message_ids);
    const notesFor = (report: ReturnType<typeof validate>): string[] =>
      report.notes.filter((note) => note.session_key === key).map((note) => note.disposition);

    // Everything up to revision 2 is already in Apunta: nothing to do.
    const done = validate(capture, proposal, { revisions: new Map([[key, 2]]) });
    expect(notesFor(done)).toEqual(['superseded', 'already_imported']);
    expect(done.decisions.map((decision) => decision.code)).not.toContain('revision_needs_decision');

    // Only revision 1 is in. Revision 2 is an edit of a note that already
    // exists, which the batch ledger cannot take back, so it is a decision.
    const ahead = validate(capture, proposal, { revisions: new Map([[key, 1]]) });
    expect(notesFor(ahead)).toEqual(['superseded', 'revision_pending_decision']);
    expect(ahead.decisions.map((decision) => decision.code)).toContain('revision_needs_decision');
  });

  it('skips a whole sitting an earlier run already wrote', () => {
    const proposal = gold();
    const first = sessionFor(proposal, 'a1-01');
    const key = sessionKey(first.conversation_id, first.message_ids);
    const report = validate(capture, proposal, { sessions: new Set([key]) });
    const notes = report.notes.filter((note) => note.session_key === key);
    expect(notes).toHaveLength(1);
    expect(notes[0]?.disposition).toBe('already_imported');
    expect(report.totals.new_notes).toBe(11);
  });
});
