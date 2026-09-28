import { describe, expect, it } from 'vitest';

import { validate } from '../src/validate.js';
import { corpus, gold, sessionFor } from './helpers.js';

/**
 * Eligibility: a rolling three calendar months, inclusive, from **session
 * dates**.
 *
 * The trap this whole lane exists for is a conversation that was touched
 * recently and is about something old. `conv-petra-old` is exactly that: its
 * `chat_updated_at` is 2026-09-26, three days before the reference date and well
 * inside the window, and the only session in it happened on 2025-06-18. A
 * timestamp-driven importer files her as a current patient; she is not one, and
 * nothing in the conversation says she is.
 */

const capture = corpus();

function edit(change: (proposal: ReturnType<typeof gold>) => void) {
  const proposal = gold();
  change(proposal);
  return validate(capture, proposal);
}

const identity = (report: ReturnType<typeof validate>, key: string) =>
  report.identities.find((entry) => entry.identity_key === key);

describe('the window', () => {
  it('is the three calendar months before the reference date, both ends included', () => {
    const report = edit(() => {});
    expect(report.window).toMatchObject({
      reference_date: '2026-09-27',
      from: '2026-06-27',
      to: '2026-09-27',
      months: 3,
      timezone: 'America/Mexico_City',
    });
  });

  it('admits a session on the first day and refuses the day before it', () => {
    const report = edit(() => {});
    const onBoundary = report.sessions.find((session) => session.session_date === '2026-06-27');
    const before = report.sessions.find((session) => session.session_date === '2026-06-26');
    expect(onBoundary?.eligible).toBe(true);
    expect(before?.eligible).toBe(false);
    // María qualifies on the boundary session, so the day before is still hers.
    const maria = identity(report, 'maria_lopez');
    expect(maria?.eligible).toBe(true);
    expect(maria?.history_sessions).toHaveLength(4);
    expect(report.notes.filter((note) => note.disposition === 'new')).toHaveLength(12);
  });

  it('reads the day in the practice timezone, not the machine one', () => {
    // A session at 03:30 UTC on 28 June is the evening of 27 June in Mexico
    // City and the morning of 28 June in Sydney. Same capture, same proposal,
    // and the first day of the window falls out differently.
    const window = { reference_date: '2026-09-27', eligibility_months: 3 };
    const mexico = validate(capture, { ...gold(), context: { ...window, timezone: 'America/Mexico_City' } });
    const sydney = validate(capture, { ...gold(), context: { ...window, timezone: 'Australia/Sydney' } });
    expect(mexico.window.from).toBe('2026-06-27');
    expect(sydney.window.from).toBe('2026-06-27');
    // Chat-derived days do move with the zone; session-derived days do not,
    // because they are calendar days in the source text to begin with.
    const firstDays = (report: typeof mexico): (string | null)[] =>
      report.sessions.map((session) => session.first_message_day).sort();
    expect(firstDays(mexico)).not.toEqual(firstDays(sydney));
    expect(mexico.sessions.map((session) => session.session_date).sort()).toEqual(
      sydney.sessions.map((session) => session.session_date).sort(),
    );
  });
});

describe('chat timestamps never establish eligibility', () => {
  it('leaves a patient whose only session is old, though the chat is new', () => {
    const report = edit(() => {});
    const petra = identity(report, 'petra_vogel');
    expect(petra?.eligible).toBe(false);
    expect(petra?.new_notes).toBe(0);
    const session = report.sessions.find((entry) => entry.identity_key === 'petra_vogel');
    expect(session?.session_date).toBe('2025-06-18');
    expect(session?.first_message_day).toBe('2026-09-26');
    expect(
      report.notes.every(
        (note) => note.session_key !== session?.session_key || note.disposition === 'out_of_scope',
      ),
    ).toBe(true);
  });

  it('refuses a session date the cited text does not state', () => {
    const report = edit((proposal) => {
      const session = sessionFor(proposal, 'p1-01');
      session.session_date = '2026-09-26';
    });
    expect(report.errors.map((error) => error.code)).toContain('unsupported_session_date');
  });

  it('refuses a stated date with no evidence span at all', () => {
    const report = edit((proposal) => {
      const session = sessionFor(proposal, 'p1-01');
      session.date_evidence = [];
    });
    expect(report.errors.map((error) => error.code)).toContain('date_basis_stated_without_evidence');
  });

  it('refuses a date basis of unknown that carries a date anyway', () => {
    const report = edit((proposal) => {
      const session = sessionFor(proposal, 'i1-01');
      session.session_date_basis = 'unknown';
      session.session_date = '2026-09-05';
    });
    expect(report.errors.map((error) => error.code)).toContain('date_basis_unknown_with_date');
  });

  it('never treats an inferred date as stated, however plausible', () => {
    const report = edit((proposal) => {
      const session = sessionFor(proposal, 'i1-01');
      session.session_date_basis = 'inferred';
      session.session_date = '2026-09-05';
    });
    const ivan = identity(report, 'ivan_petrov');
    expect(ivan?.eligible).toBe(false);
    expect(report.decisions.map((decision) => decision.code)).toContain('date_needs_decision');
    // An inferred date inside the window still does not qualify anybody.
    expect(report.errors).toEqual([]);
  });

  it('asks for a decision when the cited sentence names two different days', () => {
    const report = edit((proposal) => {
      const session = sessionFor(proposal, 'm1-03');
      session.date_evidence = [
        { message_id: 'm1-03', quote: 'La sesión con María López fue el 27 de junio de 2026.' },
        { message_id: 'm1-05', quote: 'Sesión con María López el 1 de agosto de 2026.' },
      ];
    });
    expect(report.errors).toEqual([]);
    expect(report.decisions.map((decision) => decision.code)).toContain('date_needs_decision');
    expect(
      report.decisions.some(
        (decision) => decision.detail.includes('2026-06-27') && decision.detail.includes('2026-08-01'),
      ),
    ).toBe(true);
  });

  it('refuses to ground a date in a two-reading slash date', () => {
    const report = edit((proposal) => {
      const session = sessionFor(proposal, 'm1-05');
      session.session_date = '2026-08-07';
      session.date_evidence = [{ message_id: 'm1-05', quote: 'Dejamos pendiente revisar el 07/08/2026.' }];
    });
    // 2026-08-07 is not *anchored* anywhere in that quote, so it is unsupported
    // rather than silently accepted as the Mexican reading.
    expect(report.errors.map((error) => error.code)).toContain('unsupported_session_date');
    expect(report.decisions.map((decision) => decision.code)).toContain('date_needs_decision');
  });

  it('flags a session written up long after it happened, for the review screen', () => {
    const report = edit(() => {});
    const warnings = report.warnings.filter((warning) => warning.code === 'session_date_far_from_chat');
    expect(warnings).toHaveLength(2);
    expect(warnings.map((warning) => warning.path).sort()).toEqual(
      ['sessions[13].session_date', 'sessions[3].session_date'].sort(),
    );
  });
});

describe('full history after qualification', () => {
  it('brings the whole history of a qualifying patient, however old', () => {
    const report = edit(() => {});
    const ana = identity(report, 'ana_ruiz');
    expect(ana?.eligible).toBe(true);
    expect(ana?.session_count).toBe(4);
    expect(ana?.new_notes).toBe(4);
    const dates = report.sessions
      .filter((session) => session.identity_key === 'ana_ruiz')
      .map((session) => ({ date: session.session_date, in_scope: session.in_scope }));
    expect(dates).toEqual(
      expect.arrayContaining([
        { date: '2025-03-11', in_scope: true },
        { date: '2026-07-02', in_scope: true },
        { date: '2026-08-20', in_scope: true },
        { date: '2026-09-10', in_scope: true },
      ]),
    );
  });

  it('brings sessions from more than one chat for the same patient', () => {
    const report = edit(() => {});
    const ana = identity(report, 'ana_ruiz');
    expect(ana?.conversations).toEqual(['conv-ana-1', 'conv-ana-2']);
    const maria = identity(report, 'maria_lopez');
    expect(maria?.conversations).toEqual(['conv-maria-1', 'conv-maria-2']);
    expect(maria?.session_count).toBe(4);
  });

  it('brings a one-session patient, because there is no minimum-session rule', () => {
    const report = edit(() => {});
    const diego = identity(report, 'diego_ramos');
    expect(diego?.eligible).toBe(true);
    expect(diego?.session_count).toBe(1);
    expect(diego?.new_notes).toBe(1);
  });

  it('brings a patient out of a chat that also holds another patient', () => {
    const report = edit(() => {});
    expect(identity(report, 'maria_fernanda')?.eligible).toBe(true);
    expect(identity(report, 'maria_fernanda')?.new_notes).toBe(1);
  });

  it('imports nothing for a patient who never qualified', () => {
    const report = edit(() => {});
    for (const key of ['ivan_petrov', 'petra_vogel', 'rosa_hernandez', 'arrendamiento', 'masa_madre']) {
      const found = identity(report, key);
      expect(found?.eligible, key).toBe(false);
      expect(found?.new_notes, key).toBe(0);
    }
  });

  it('honours an explicit scope, and the rest of the history leaves as out of scope', () => {
    const report = validate(capture, { ...gold(), scope: { include_identities: ['ana_ruiz'] } });
    // Eligibility is a fact about the calendar; scope is her choice. Only the
    // two together decide what a run writes.
    expect(report.identities.filter((entry) => entry.eligible)).toHaveLength(6);
    expect(report.identities.filter((entry) => entry.in_scope).map((entry) => entry.identity_key)).toEqual([
      'ana_ruiz',
    ]);
    expect(identity(report, 'ana_ruiz')?.new_notes).toBe(4);
    expect(identity(report, 'maria_lopez')?.new_notes).toBe(0);
    expect(report.notes.filter((note) => note.disposition === 'new')).toHaveLength(4);
    expect(report.notes.filter((note) => note.disposition === 'out_of_scope')).toHaveLength(11);
  });
});
