import { describe, expect, it } from 'vitest';

import { validate } from '../src/validate.js';
import { corpus, gold, sessionFor } from './helpers.js';

/**
 * Original-text preservation.
 *
 * The proposal declares each note's text *and* the spans it must equal. The
 * declared text is never written — the recomputed one is — but requiring it to
 * be there means a paraphrase is a detectable defect rather than a silent
 * substitution, and that the original language survives the trip byte for byte.
 */

const capture = corpus();

function edit(change: (proposal: ReturnType<typeof gold>) => void) {
  const proposal = gold();
  change(proposal);
  return validate(capture, proposal);
}

describe('the note is what the source says', () => {
  it('recomputes the body from the spans and matches the declared text', () => {
    const report = edit(() => {});
    expect(report.errors).toEqual([]);
    expect(report.notes.every((note) => note.declared_text_matches)).toBe(true);
    for (const note of report.notes) {
      const joined = note.spans.map((span) => span.text).join('\n\n');
      expect(note.text).toBe(joined);
    }
  });

  it('rejects a paraphrase, an added clinical sentence and a tidied sentence', () => {
    const rewrites: readonly ((text: string) => string)[] = [
      (text) => text.replace('insomnio persistente', 'insomnio crónico'),
      (text) => `${text}\n\nRisk: ideation pasiva reportada.`,
      (text) => text.replace(/\n\n/g, '\n'),
      (text) => text.toLowerCase(),
      () => 'Subjective: patient reports insomnia.\n\nPlan: weekly.',
    ];
    for (const rewrite of rewrites) {
      const report = edit((proposal) => {
        const note = sessionFor(proposal, 'a1-02').notes[0];
        if (note === undefined) throw new Error('fixture changed');
        note.text = rewrite(note.text);
      });
      expect(report.errors.map((error) => error.code)).toContain('text_not_verbatim');
    }
  });

  it('rejects a translation of a Spanish note into English', () => {
    const report = edit((proposal) => {
      const note = sessionFor(proposal, 'm1-02').notes[0];
      if (note === undefined) throw new Error('fixture changed');
      note.text =
        'Subjective: María López arrived anxious.\n\nAssessment: situational anxiety.\n\nPlan: weekly.';
    });
    expect(report.errors.map((error) => error.code)).toContain('text_not_verbatim');
  });

  it('keeps Spanish characters, punctuation and paragraph breaks intact', () => {
    const report = edit(() => {});
    const spanish = report.notes.find((note) => note.spans[0]?.message_id === 'm1-06');
    expect(spanish?.text).toContain('María López más tranquila.');
    expect(spanish?.text).toContain('\n\nPlan: Revisar la fecha pendiente en la próxima sesión.');
    // The ambiguous date sits in the message but outside the cited evidence
    // span, which is the whole reason a span is a span.
    const evidence = report.sessions.find((session) => session.message_ids.includes('m1-05'));
    expect(evidence?.session_date).toBe('2026-08-01');
    expect(evidence?.session_date_basis).toBe('stated');
  });

  it('does not strip Markdown at the structure stage, and says so in the dry run', () => {
    // The importer converts Markdown when it writes
    // (server/src/import/markdown.ts). What the validator holds is the source
    // text, so a stored note and its cited span differ by exactly that
    // conversion and by nothing else.
    const report = edit((proposal) => {
      const session = sessionFor(proposal, 'a1-02');
      const note = session.notes[0];
      if (note === undefined) throw new Error('fixture changed');
      session.notes = [
        {
          ...note,
          spans: [{ message_id: 'a1-02', quote: '**Plan:** Continuar sesiones semanales' }],
          text: '**Plan:** Continuar sesiones semanales',
        },
      ];
    });
    expect(report.errors).toEqual([]);
    const plan = report.notes[0];
    expect(plan?.text).toBe('**Plan:** Continuar sesiones semanales');
    const full = edit(() => {});
    expect(full.notes.find((note) => note.spans[0]?.message_id === 'a1-02')?.text).toContain('**Plan:**');
  });

  it('joins several spans with the declared joiner, and refuses a body that ignores it', () => {
    const built = edit((proposal) => {
      const session = sessionFor(proposal, 'a1-01');
      const note = session.notes[0];
      if (note === undefined) throw new Error('fixture changed');
      session.notes = [
        {
          ...note,
          joiner: ' | ',
          spans: [
            { message_id: 'a1-01', quote: 'Sigue con insomnio' },
            { message_id: 'a1-01', quote: 'cambio de trabajo' },
          ],
          text: 'Sigue con insomnio | cambio de trabajo',
        },
      ];
    });
    expect(built.errors).toEqual([]);
    expect(built.notes[0]?.text).toBe('Sigue con insomnio | cambio de trabajo');

    const wrongJoiner = edit((proposal) => {
      const session = sessionFor(proposal, 'a1-01');
      const note = session.notes[0];
      if (note === undefined) throw new Error('fixture changed');
      session.notes = [
        {
          ...note,
          joiner: ' | ',
          spans: [
            { message_id: 'a1-01', quote: 'Sigue con insomnio' },
            { message_id: 'a1-01', quote: 'cambio de trabajo' },
          ],
          text: 'Sigue con insonniocambio de trabajo',
        },
      ];
    });
    expect(wrongJoiner.errors.map((error) => error.code)).toContain('text_not_verbatim');
  });

  it('never writes the declared text: the report carries the recomputed one', () => {
    const report = edit((proposal) => {
      const note = sessionFor(proposal, 'a1-02').notes[0];
      if (note === undefined) throw new Error('fixture changed');
      note.text = 'anything at all';
    });
    const written = report.notes.find((note) => note.spans[0]?.message_id === 'a1-02');
    expect(written?.declared_text_matches).toBe(false);
    expect(written?.text).toContain('Subjective: Ana Ruiz reporta insomnio persistente');
  });
});
