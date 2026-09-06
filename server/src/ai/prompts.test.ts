import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  MAX_LOOKBACK_NOTES,
  MAX_SUMMARY_EXCERPT_CHARS,
  MAX_SUMMARY_EXCERPTS,
  MAX_SUMMARY_POINT_CHARS,
  MAX_SUMMARY_POINTS,
  UNCLEAR_MARKER,
} from '@apunta/shared';
import { describe, expect, it } from 'vitest';

import {
  defaultInstructionsFor,
  GENERIC_INSTRUCTIONS,
  instructionsFor,
  INTAKE_NOTE_INSTRUCTIONS,
  PROGRESS_NOTE_INSTRUCTIONS,
} from './default-instructions.js';
import { NUM_CTX } from './ollama.js';
import {
  approximateTokens,
  buildComposeBriefPrompt,
  buildDetectFormatPrompt,
  buildExtractRetractionsPrompt,
  buildGeneratePrompt,
  buildRefinePrompt,
  buildSuggestPlanPrompt,
  buildSummariseNotePrompt,
  orderSections,
  outputFormatBlock,
  RETRACTION_REMINDER,
  retractionReminderFor,
  tailReminder,
} from './prompts.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const SOAP = ['Subjective', 'Objective', 'Assessment', 'Plan'];
const INTAKE = ['Presenting problem', 'History', 'Formulation', 'Plan'];
const CUSTOM = ['Attendance', 'Presentation', 'Content', 'Interventions', 'Risk', 'Homework', 'Next steps'];

const TYPED = 'Sleep improved, intrusive thoughts less frequent. Engaged. Keep weekly, add grounding.';
const DICTATED = "Okay, John Smith today. He says he's sleeping a lot better.";

describe('default instructions', () => {
  /**
   * The markdown in `docs/note-instructions/` is the source the practice owner
   * reads and edits. If the two drift, the app stops doing what the document
   * says it does — so the copy is asserted, not assumed.
   */
  it('are the docs/note-instructions markdown, minus its H1', () => {
    const port = (file: string): string => {
      const text = readFileSync(join(repoRoot, 'docs', 'note-instructions', file), 'utf8');
      return `${text.split('\n').slice(1).join('\n').trim()}\n`;
    };
    expect(PROGRESS_NOTE_INSTRUCTIONS).toBe(port('progress-note-instructions.md'));
    expect(INTAKE_NOTE_INSTRUCTIONS).toBe(port('intake-note-instructions.md'));
  });

  /** The owner's answer to design question 5, in the text the model reads. */
  it('tell the model to leave a section with no material empty', () => {
    for (const instructions of [PROGRESS_NOTE_INSTRUCTIONS, INTAKE_NOTE_INSTRUCTIONS, GENERIC_INSTRUCTIONS]) {
      expect(instructions).toContain('leave that section empty');
      expect(instructions).not.toContain('Not addressed in this dictation');
    }
  });

  /** The element `rationale.md` ranks highest-impact must demonstrate it too. */
  it('carry a few-shot example with an empty section', () => {
    expect(PROGRESS_NOTE_INSTRUCTIONS).toContain('"Objective": ""');
    expect(INTAKE_NOTE_INSTRUCTIONS).toContain('"Formulation": ""');
  });

  /**
   * The editor styles this marker distinctly, which only works if the model is
   * still told to write exactly this string (owner design question 11).
   */
  it('write the same unclear-dictation marker the editor highlights', () => {
    for (const instructions of [PROGRESS_NOTE_INSTRUCTIONS, INTAKE_NOTE_INSTRUCTIONS]) {
      expect(instructions).toContain(UNCLEAR_MARKER);
    }
  });

  it('keep the banned-boilerplate list exactly as written', () => {
    expect(PROGRESS_NOTE_INSTRUCTIONS).toContain('"denies suicidal ideation"');
    expect(PROGRESS_NOTE_INSTRUCTIONS).toContain('"mood congruent');
    expect(INTAKE_NOTE_INSTRUCTIONS).toContain('"denies substance use"');
    expect(INTAKE_NOTE_INSTRUCTIONS).toContain('"No prior therapy"');
  });

  it('stay inside the token budget a small model can hold', () => {
    for (const instructions of [PROGRESS_NOTE_INSTRUCTIONS, INTAKE_NOTE_INSTRUCTIONS]) {
      expect(approximateTokens(instructions)).toBeLessThan(3000);
    }
  });

  it('picks a default by format name, then by section list, then generic', () => {
    expect(defaultInstructionsFor('Progress note', SOAP)).toBe(PROGRESS_NOTE_INSTRUCTIONS);
    expect(defaultInstructionsFor('intake note', INTAKE)).toBe(INTAKE_NOTE_INSTRUCTIONS);
    expect(defaultInstructionsFor('Weekly session', SOAP)).toBe(PROGRESS_NOTE_INSTRUCTIONS);
    expect(defaultInstructionsFor('Supervision log', CUSTOM)).toBe(GENERIC_INSTRUCTIONS);
  });

  it('prefers the format’s own instructions when it has any', () => {
    expect(instructionsFor('  Write it my way.  ', 'Progress note', SOAP)).toBe('Write it my way.');
    expect(instructionsFor('   ', 'Progress note', SOAP)).toBe(PROGRESS_NOTE_INSTRUCTIONS);
  });
});

describe('outputFormatBlock', () => {
  it('restates the schema the `format` parameter never shows the model', () => {
    expect(outputFormatBlock(SOAP)).toMatchInlineSnapshot(`
      "## Output format

      Return one JSON object and nothing else. It must have exactly these keys, in this order:

        "Subjective", "Objective", "Assessment", "Plan"

      Every key is required. Each value is that section's body as plain prose.
      Do not add any other key. Do not use markdown, headings, or bullet characters.
      Do not repeat the section name inside its value.
      If a section has no material in the source, its value is the empty string ""."
    `);
  });

  it('quotes a section name containing a quote or a colon', () => {
    expect(outputFormatBlock(['Risk: "safety"'])).toContain('"Risk: \\"safety\\""');
  });
});

describe('the retraction reminder', () => {
  it('sits in the user turn beside a source that takes something back', () => {
    const prompt = buildGeneratePrompt({
      instructions: 'Write a note.',
      sections: ['Subjective', 'Plan'],
      transcript: 'We agreed weekly, actually no, scratch that, fortnightly.',
    });
    expect(prompt.user).toContain(RETRACTION_REMINDER);
    // The JSON restatement stays last, where a head truncation cannot reach it.
    expect(prompt.user.trimEnd().endsWith('and nothing else.')).toBe(true);
    expect(prompt.system).not.toContain(RETRACTION_REMINDER);
  });

  it('stays out of a source with no retraction in it, so that prompt is unchanged', () => {
    const prompt = buildGeneratePrompt({
      instructions: 'Write a note.',
      sections: ['Subjective', 'Plan'],
      typedNotes: 'Sleeping better. Plan unchanged, weekly.',
    });
    expect(prompt.user).not.toContain(RETRACTION_REMINDER);
    expect(retractionReminderFor('no correction here, he never minds the noise')).toEqual([]);
    expect(retractionReminderFor('four out of seven, no wait, two out of seven')).toHaveLength(1);
  });
});

describe('buildExtractRetractionsPrompt', () => {
  it('asks for verbatim quotes, restates the shape, and passes the transcript through untouched', () => {
    const transcript = 'Four hours, scratch that, six hours.';
    const prompt = buildExtractRetractionsPrompt(transcript);
    expect(prompt.user).toBe(transcript);
    expect(prompt.system).toContain('copied verbatim');
    expect(prompt.system).toContain('{"corrections": [{"withdrawn": "...", "replacement": "..."}]}');
    // One example of each kind — a corrected number and a withdrawn statement.
    expect(prompt.system).toContain('{"withdrawn": "twice this week", "replacement": "three times"}');
    expect(prompt.system).toContain('{"withdrawn": "the move is going badly", "replacement": ""}');
  });
});

describe('buildGeneratePrompt', () => {
  it('labels typed notes as the therapist’s own words and authoritative', () => {
    const prompt = buildGeneratePrompt({
      instructions: '',
      sections: SOAP,
      formatName: 'Progress note',
      typedNotes: TYPED,
    });
    expect(prompt.user).toContain(
      "Therapist's written notes — her own words, written by her. Authoritative:",
    );
    expect(prompt.user).toContain(TYPED);
    expect(prompt.user).not.toContain('Dictation transcript');
    expect(prompt.system).toContain('There is no recording for this session');
  });

  it('labels a transcript as speech-to-text that may be garbled', () => {
    const prompt = buildGeneratePrompt({
      instructions: '',
      sections: SOAP,
      formatName: 'Progress note',
      transcript: DICTATED,
    });
    expect(prompt.user).toContain('Dictation transcript — speech-to-text of the same session');
    expect(prompt.user).not.toContain("Therapist's written notes");
  });

  it('carries both sources, and says which wins', () => {
    const prompt = buildGeneratePrompt({
      instructions: '',
      sections: SOAP,
      formatName: 'Progress note',
      typedNotes: TYPED,
      transcript: DICTATED,
    });
    expect(prompt.user.indexOf(TYPED)).toBeLessThan(prompt.user.indexOf(DICTATED));
    expect(prompt.system).toContain('her written notes are correct');
  });

  /**
   * Ollama truncates from the head, so the system prompt is what gets dropped
   * when a prompt overflows. The tail reminder is the only part of the contract
   * guaranteed to survive that.
   */
  it('ends the user message with the key list', () => {
    const prompt = buildGeneratePrompt({ instructions: '', sections: SOAP, typedNotes: TYPED });
    expect(prompt.user.endsWith(tailReminder(SOAP))).toBe(true);
  });

  /**
   * Both instruction files already carry two dictation→JSON pairs, which
   * `rationale.md` ranks as the highest-impact element. The builder adds none.
   */
  it('adds no few-shot example of its own', () => {
    const prompt = buildGeneratePrompt({
      instructions: 'Custom instructions with no examples.',
      sections: SOAP,
      typedNotes: TYPED,
    });
    expect(prompt.system).toBe(
      [
        'Custom instructions with no examples.',
        '',
        outputFormatBlock(SOAP),
        '',
        'Where the instructions above say "the dictation", they mean the source material below. There is no recording for this session: the source is the therapist\'s own written notes, so it carries no transcription errors and her wording is exact.',
      ].join('\n'),
    );
  });

  it('snapshots the default progress-note prompt', () => {
    const prompt = buildGeneratePrompt({
      instructions: '',
      formatName: 'Progress note',
      sections: SOAP,
      typedNotes: TYPED,
    });
    expect(prompt.system.startsWith('You are drafting a clinical progress note')).toBe(true);
    expect(prompt).toMatchSnapshot();
  });

  it('snapshots the default intake prompt', () => {
    const prompt = buildGeneratePrompt({
      instructions: '',
      formatName: 'Intake note',
      sections: INTAKE,
      transcript: 'Intake with Maria Ruiz. She came in after her mother died in March.',
    });
    expect(prompt).toMatchSnapshot();
  });

  it('snapshots a seven-section custom format with no instructions', () => {
    const prompt = buildGeneratePrompt({
      instructions: '',
      formatName: 'Supervision log',
      sections: CUSTOM,
      typedNotes: TYPED,
    });
    expect(prompt.system.startsWith('You are drafting a clinical note for a licensed therapist')).toBe(true);
    expect(prompt).toMatchSnapshot();
  });

  it('snapshots a format whose section name contains a quote and a colon', () => {
    const prompt = buildGeneratePrompt({
      instructions: 'Short instructions.',
      sections: ['Risk: "safety" review', 'Plan'],
      typedNotes: TYPED,
    });
    expect(prompt).toMatchSnapshot();
  });
});

describe('buildRefinePrompt', () => {
  it('describes the two-key contract and allows answering without editing', () => {
    const prompt = buildRefinePrompt({
      instructions: '',
      formatName: 'Progress note',
      sections: SOAP,
      noteText: 'Subjective: Sleeping better.\n\nPlan: Continue weekly.',
      history: [],
      message: 'Shorten the plan.',
    });
    expect(prompt.system).toContain('"reply"');
    expect(prompt.system).toContain('"updatedSections"');
    expect(prompt.system).toContain('Use null when she asked a question');
    expect(prompt.user).toContain('She says:');
  });

  /**
   * Found live in M10's human pass: the UI's "More clinical" quick action
   * made the 4B add "alert and oriented" and "affect congruent with reported
   * mood" — the never-write list's own named examples — to a note that said
   * neither. A register request outranked the faithfulness rules until the
   * refine prompt named the conflict explicitly.
   */
  it('tells the model a tone request changes wording, never content', () => {
    const prompt = buildRefinePrompt({
      instructions: '',
      sections: SOAP,
      noteText: 'Objective: Engaged, made eye contact.',
      history: [],
      message: 'Use a more clinical tone',
    });
    expect(prompt.system).toContain('changes wording only');
    expect(prompt.system).toContain('never permission to add an observation');
    expect(prompt.system).toContain('may only surface material already in the note');
    // And again in the user turn, beside her request, where a small model
    // actually looks — the system-prompt version alone measurably lost.
    // Stated in both directions: the first wording taught the model to
    // delete dictated numbers as "a measurement".
    expect(prompt.user).toContain('may not add observations, findings, or clinical phrasing');
    // Her own words are the one thing that rule may never refuse.
    expect(prompt.user).toContain('neither the note above nor her message gives you');
    expect(prompt.user).toContain('What she states in her message is hers');
    expect(prompt.user).toContain('may not drop anything she did not ask to have removed');
    expect(prompt.user.indexOf('Whatever she asked for')).toBeGreaterThan(prompt.user.indexOf('She says:'));
  });

  /**
   * Found live (2026-08-30): asked to *move* a line into another section,
   * the model added it there and left the original in place, because the
   * standing instruction to carry sections across verbatim reads as "change
   * only what was named".
   */
  it('tells the model that moving something empties where it came from', () => {
    const prompt = buildRefinePrompt({
      instructions: '',
      sections: SOAP,
      noteText: 'Objective: Engaged.\n\nPlan: Continue.',
      history: [],
      message: 'Move the engagement note to Plan',
    });
    expect(prompt.system).toContain('Moving something is two edits');
    expect(prompt.system).toContain('leaves the section it was in');
  });

  /**
   * Both found by `npm run check:refine` on its first real run (2026-08-31):
   * a bare question rewrote the note while answering it, and the model
   * refused an observation she asked for in her own words, on the grounds
   * that the dictation did not contain it. The second is the anti-fabrication
   * rule eating the therapist's own authorship.
   */
  it('answers a question without changing the note, and takes her word as source', () => {
    const prompt = buildRefinePrompt({
      instructions: '',
      sections: SOAP,
      noteText: 'Objective: Engaged.',
      history: [],
      message: 'What is missing from this note?',
    });
    expect(prompt.system).toContain('answered and nothing else');
    expect(prompt.system).toContain('She asked what is there, not for it to be different');
    expect(prompt.system).toContain('Her message is source material');
    expect(prompt.system).toContain('never bar her own words back to her');
  });

  /** The lock lives in the server, where it cannot be talked out of. */
  it('never mentions the published lock', () => {
    const prompt = buildRefinePrompt({
      instructions: '',
      sections: SOAP,
      noteText: 'Plan: Continue weekly.',
      history: [],
      message: 'Change the plan.',
    });
    expect(`${prompt.system}${prompt.user}`.toLowerCase()).not.toContain('publish');
  });

  it('includes the chat history and a highlighted excerpt', () => {
    const prompt = buildRefinePrompt({
      instructions: '',
      sections: SOAP,
      noteText: 'Plan: Continue weekly.',
      history: [
        { role: 'user', text: 'Shorten it.' },
        { role: 'assistant', text: 'Shortened the Plan section.' },
      ],
      message: 'Now expand it again.',
      refQuote: 'Continue weekly.',
    });
    expect(prompt.user).toContain('Therapist: Shorten it.');
    expect(prompt.user).toContain('You: Shortened the Plan section.');
    expect(prompt.user).toContain('She highlighted this part of the note:');
    expect(prompt).toMatchSnapshot();
  });
});

describe('buildDetectFormatPrompt', () => {
  it('says what kind of document it is reading', () => {
    expect(buildDetectFormatPrompt({ kind: 'template', text: 'Subjective:' }).system).toContain(
      'blank note template',
    );
    expect(buildDetectFormatPrompt({ kind: 'examples', text: 'Subjective: …' }).system).toContain(
      'ignore the clinical content',
    );
    expect(buildDetectFormatPrompt({ kind: 'manual', text: 'S, O, A, P' }).system).toContain(
      'in her own words',
    );
  });

  it('snapshots the template prompt', () => {
    expect(
      buildDetectFormatPrompt({ kind: 'template', text: 'Subjective:\nObjective:\nAssessment:\nPlan:' }),
    ).toMatchSnapshot();
  });
});

describe('orderSections', () => {
  it('reorders to the format and fills a missing section with an empty body', () => {
    expect(orderSections({ Plan: 'Weekly.', Subjective: 'Better.' }, SOAP)).toEqual({
      Subjective: 'Better.',
      Objective: '',
      Assessment: '',
      Plan: 'Weekly.',
    });
  });
});

describe('approximateTokens', () => {
  it('is conservative, so an over-long prompt is refused rather than truncated', () => {
    expect(approximateTokens('x'.repeat(3500))).toBe(1000);
  });
});

/**
 * M9's two-stage prompts.
 *
 * The context arithmetic is the point of these tests, not a detail of them:
 * both M9 paths exist in two stages *because* one call carrying six notes
 * would be truncated from the head, dropping the instructions and keeping the
 * patient material. So each stage is measured against the same budget the
 * provider enforces.
 */
describe('M9 prompts and the context budget', () => {
  const NOTE = [
    'Subjective: Patient reports improved sleep since last session and decreased frequency of intrusive thoughts.',
    '',
    'Objective: Alert and engaged in session.',
    '',
    'Assessment: Continued progress on anxiety management goals.',
    '',
    'Plan: Continue weekly sessions.',
  ].join('\n');

  it('summarises one note per call, and says to copy rather than paraphrase', () => {
    const prompt = buildSummariseNotePrompt({ noteText: NOTE, sections: SOAP });
    expect(prompt.system).toContain('character for character');
    expect(prompt.system).toContain('is discarded');
    expect(prompt.system).toContain('draw a conclusion it does not state');
    expect(prompt.user).toContain('improved sleep since last session');
    expect(prompt.user.trimEnd().endsWith('and nothing else.')).toBe(true);
  });

  it('keeps a long note inside the budget one note at a time', () => {
    // A note far longer than anything a session produces.
    const long = `Subjective: ${'The patient described the week in detail. '.repeat(200)}`;
    const prompt = buildSummariseNotePrompt({ noteText: long, sections: SOAP });
    const tokens = approximateTokens(prompt.system) + approximateTokens(prompt.user);
    expect(tokens).toBeLessThan(NUM_CTX * 0.75);
  });

  it('gives the drafting call the diagnosis as input, and no way to return one', () => {
    const prompt = buildSuggestPlanPrompt({
      diagnoses: ['F41.1 (ICD-10-CM) Generalized anxiety disorder'],
      modality: 'Individual psychotherapy (CBT)',
      frequency: 'Weekly, 50 minutes',
      existingGoals: [],
      notes: [{ index: 0, date: '2026-08-01', excerpts: ['six, six and a half hours most nights now'] }],
    });

    expect(prompt.user).toContain('Diagnosis, entered by the therapist: F41.1');
    expect(prompt.system).toContain('The diagnosis is given to you');
    expect(prompt.system).toContain('Do not invent a target number or a target date');
    // The output contract names three keys and none of them is a diagnosis.
    expect(prompt.system).toContain('"goals"');
    expect(prompt.system).not.toMatch(/"diagnos/i);
  });

  it('tells the drafting call to propose beside her goals, not over them', () => {
    const prompt = buildSuggestPlanPrompt({
      diagnoses: [],
      modality: '',
      frequency: '',
      existingGoals: ['John sleeps well enough to get through a workday.'],
      notes: [{ index: 0, date: '2026-08-01', excerpts: ['sleeping a lot better'] }],
    });
    expect(prompt.user).toContain('Do not restate, revise or replace these');
    expect(prompt.user).toContain('John sleeps well enough to get through a workday.');
    // With no diagnosis recorded it must not go looking for one.
    expect(prompt.user).toContain('without naming or implying a diagnosis');
  });

  it('cites by number, so a citation cannot be typed from memory', () => {
    const prompt = buildSuggestPlanPrompt({
      diagnoses: [],
      modality: '',
      frequency: '',
      existingGoals: [],
      notes: [
        { index: 0, date: '2026-08-01', excerpts: ['first excerpt', 'second excerpt'] },
        { index: 1, date: '2026-08-08', excerpts: ['third excerpt'] },
      ],
    });
    expect(prompt.user).toContain('Note 0 — 2026-08-01');
    expect(prompt.user).toContain('  [1] "second excerpt"');
    expect(prompt.user).toContain('Note 1 — 2026-08-08');
    expect(prompt.system).toContain('must cite at least one excerpt');
  });

  /**
   * The prohibition the owner chose, made structural: the briefing call is
   * never shown the plan, so it cannot relate a goal to a note.
   */
  it('never puts the plan in the briefing prompt', () => {
    const prompt = buildComposeBriefPrompt({
      notes: [
        {
          index: 0,
          date: '2026-08-08',
          title: 'Progress note',
          points: ['Reported sleeping better since the wind-down routine changed.'],
        },
      ],
    });

    expect(prompt.system).not.toMatch(/goal|objective|treatment plan/i);
    expect(prompt.user).not.toMatch(/goal|objective/i);
    expect(prompt.system).toContain('not an assessment');
    expect(prompt.system).toContain('Do not say whether treatment is working');
    expect(prompt.user).toContain('Note 0 — 2026-08-08 — Progress note');
  });

  it('keeps the second stage small even at the maximum lookback', () => {
    const notes = Array.from({ length: MAX_LOOKBACK_NOTES }, (_, index) => ({
      index,
      date: '2026-08-01',
      title: 'Progress note',
      points: Array.from({ length: MAX_SUMMARY_POINTS }, () => 'x'.repeat(MAX_SUMMARY_POINT_CHARS)),
    }));
    const brief = buildComposeBriefPrompt({ notes });
    expect(approximateTokens(brief.system) + approximateTokens(brief.user)).toBeLessThan(NUM_CTX * 0.75);

    const suggest = buildSuggestPlanPrompt({
      diagnoses: ['F41.1 (ICD-10-CM) Generalized anxiety disorder'],
      modality: 'Individual psychotherapy (CBT)',
      frequency: 'Weekly, 50 minutes',
      existingGoals: ['x'.repeat(500)],
      notes: Array.from({ length: MAX_LOOKBACK_NOTES }, (_, index) => ({
        index,
        date: '2026-08-01',
        excerpts: Array.from({ length: MAX_SUMMARY_EXCERPTS }, () => 'y'.repeat(MAX_SUMMARY_EXCERPT_CHARS)),
      })),
    });
    expect(approximateTokens(suggest.system) + approximateTokens(suggest.user)).toBeLessThan(NUM_CTX * 0.75);
  });
});
