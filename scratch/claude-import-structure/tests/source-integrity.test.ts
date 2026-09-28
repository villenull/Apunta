import { describe, expect, it } from 'vitest';

import { validate } from '../src/validate.js';
import { corpus, gold, sessionFor } from './helpers.js';

/**
 * Source-reference integrity.
 *
 * A note in this format is a set of pointers into the capture. If a pointer can
 * be invented, misfiled or aimed at a branch the therapist abandoned, then
 * "verbatim" means nothing and a clinical record can be assembled from text that
 * was never said to anybody. Each case below breaks exactly one pointer.
 */

const capture = corpus();

function codesFor(edit: (proposal: ReturnType<typeof gold>) => void): string[] {
  const proposal = gold();
  edit(proposal);
  return validate(capture, proposal).errors.map((error) => error.code);
}

describe('a citation must resolve', () => {
  it('refuses a message id that does not exist', () => {
    const codes = codesFor((proposal) => {
      const note = sessionFor(proposal, 'a1-02').notes[0];
      if (note === undefined) throw new Error('fixture changed');
      (note.spans as unknown[])[0] = { message_id: 'a1-99', quote: 'Subjective' };
    });
    expect(codes).toContain('unknown_source_id');
  });

  it('refuses a message borrowed from another conversation', () => {
    const codes = codesFor((proposal) => {
      const note = sessionFor(proposal, 'a1-02').notes[0];
      if (note === undefined) throw new Error('fixture changed');
      (note.spans as unknown[])[0] = { message_id: 'a2-02', quote: 'Subjective' };
    });
    expect(codes).toContain('cross_conversation_source');
  });

  it('refuses a message on the branch the therapist abandoned', () => {
    // t1-01 is a discarded regeneration: t1-02 replaced it from the same parent.
    const codes = codesFor((proposal) => {
      const session = sessionFor(proposal, 't1-00b');
      session.message_ids = [...session.message_ids, 't1-01'];
    });
    expect(codes).toContain('off_thread_source');
  });

  it('refuses a quote that is not in the message, and one that is not unique', () => {
    expect(
      codesFor((proposal) => {
        const note = sessionFor(proposal, 'a1-02').notes[0];
        if (note === undefined) throw new Error('fixture changed');
        (note.spans as unknown[])[0] = { message_id: 'a1-02', quote: 'Plan: therapy twice weekly' };
      }),
    ).toContain('span_out_of_range');

    // "Subjective:" appears once in a1-02; "Plan" appears once too. Use a span
    // that really does repeat inside one message.
    expect(
      codesFor((proposal) => {
        const note = sessionFor(proposal, 'm1-05').notes[0];
        if (note === undefined) throw new Error('fixture changed');
        const session = sessionFor(proposal, 'm1-05');
        session.date_evidence = [{ message_id: 'm1-05', quote: 'de' }];
      }),
    ).toContain('span_ambiguous_quote');
  });

  it('refuses a character range that runs past the end of the message', () => {
    const codes = codesFor((proposal) => {
      const note = sessionFor(proposal, 'a1-02').notes[0];
      if (note === undefined) throw new Error('fixture changed');
      (note.spans as unknown[])[0] = { message_id: 'a1-02', start: 0, end: 9999 };
    });
    expect(codes).toContain('span_out_of_range');
  });

  it('refuses overlapping spans in one note', () => {
    const codes = codesFor((proposal) => {
      const note = sessionFor(proposal, 'a1-02').notes[0];
      if (note === undefined) throw new Error('fixture changed');
      (note.spans as unknown[]) = [
        { message_id: 'a1-02', start: 0, end: 40 },
        { message_id: 'a1-02', start: 20, end: 60 },
      ];
    });
    expect(codes).toContain('span_overlap');
  });

  it('refuses spans that are not in message order', () => {
    const codes = codesFor((proposal) => {
      const note = sessionFor(proposal, 'a1-02').notes[0];
      if (note === undefined) throw new Error('fixture changed');
      (note.spans as unknown[]) = [
        { message_id: 'a1-02', start: 0, end: 10 },
        { message_id: 'a1-01', start: 0, end: 10 },
      ];
    });
    expect(codes).toContain('span_unordered');
  });
});

describe('a session must be a contiguous run of the live thread', () => {
  it('refuses message ids out of thread order', () => {
    const codes = codesFor((proposal) => {
      const session = sessionFor(proposal, 'a1-01');
      session.message_ids = ['a1-02', 'a1-01'];
    });
    expect(codes).toContain('session_order_mismatch');
  });

  it('refuses a session that skips a message in the middle', () => {
    const codes = codesFor((proposal) => {
      const session = sessionFor(proposal, 'a1-01');
      session.message_ids = ['a1-01', 'a1-03'];
    });
    // The two ids are in order, so this is a coverage failure, not an ordering one.
    expect(codes).toEqual(expect.arrayContaining(['uncovered_interior_messages']));
  });

  it('refuses the same sitting declared twice', () => {
    const codes = codesFor((proposal) => {
      const session = sessionFor(proposal, 'a1-01');
      proposal.sessions.push(structuredClone(session));
    });
    expect(codes).toContain('session_duplicate');
  });

  it('refuses a conversation the capture never had', () => {
    const codes = codesFor((proposal) => {
      const session = sessionFor(proposal, 'a1-01');
      session.conversation_id = 'conv-does-not-exist';
    });
    expect(codes).toContain('unknown_conversation');
  });

  it('refuses a session filed under a patient with no evidence in that conversation', () => {
    const codes = codesFor((proposal) => {
      const session = sessionFor(proposal, 'a1-01');
      session.identity_key = 'diego_ramos';
    });
    expect(codes).toContain('identity_evidence_not_in_conversation');
  });
});
