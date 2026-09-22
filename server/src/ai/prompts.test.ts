import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  MAX_LOOKBACK_NOTES,
  MAX_SUMMARY_EXCERPT_CHARS,
  MAX_SUMMARY_EXCERPTS,
  MAX_SUMMARY_POINT_CHARS,
  MAX_SUMMARY_POINTS,
  STANDARD_PROGRESS_FORMAT,
  UNCLEAR_MARKER,
} from '@apunta/shared';
import { describe, expect, it } from 'vitest';

import {
  defaultInstructionsFor,
  GENERIC_INSTRUCTIONS,
  instructionsFor,
  INTAKE_NOTE_INSTRUCTIONS,
  OWNER_PROGRESS_INSTRUCTIONS,
  PROGRESS_NOTE_INSTRUCTIONS,
} from './default-instructions.js';
import { NUM_CTX } from './ollama.js';
import {
  approximateTokens,
  priorNoteBlock,
  buildBrainstormPrompt,
  buildComposeBriefPrompt,
  buildDetectFormatPrompt,
  buildExtractRetractionsPrompt,
  buildGeneratePrompt,
  buildRefinePrompt,
  buildSuggestPlanPrompt,
  buildSummariseNotePrompt,
  orderSections,
  outputFormatBlock,
  REFINE_BACKGROUND_END,
  REFINE_BACKGROUND_REMINDER,
  REFINE_BACKGROUND_RULE,
  REFINE_BACKGROUND_START,
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
    expect(OWNER_PROGRESS_INSTRUCTIONS).toBe(port('owner-progress-instructions.md'));
  });

  /** Her instructions describe her sections, and her one "None." convention. */
  it('bundle the owner’s instructions for every one of her sections', () => {
    for (const section of STANDARD_PROGRESS_FORMAT.sections) {
      expect(OWNER_PROGRESS_INSTRUCTIONS).toContain(`**${section}**`);
    }
    expect(OWNER_PROGRESS_INSTRUCTIONS).toContain('"Risk review": "None."');
    expect(OWNER_PROGRESS_INSTRUCTIONS).toContain('"Client presentation": ""');
    expect(OWNER_PROGRESS_INSTRUCTIONS).toContain(UNCLEAR_MARKER);
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

  it('describe banned content without teaching the model the old example phrases', () => {
    expect(PROGRESS_NOTE_INSTRUCTIONS).toContain('risk-assessment phrase');
    expect(PROGRESS_NOTE_INSTRUCTIONS).toContain('orientation, affect, psychomotor activity');
    expect(PROGRESS_NOTE_INSTRUCTIONS).not.toContain('"denies suicidal ideation"');
    expect(PROGRESS_NOTE_INSTRUCTIONS).not.toContain('"mood congruent');
    expect(INTAKE_NOTE_INSTRUCTIONS).toContain('topic recorded as absent, denied or unremarkable');
    expect(INTAKE_NOTE_INSTRUCTIONS).toContain('did not gather something');
    expect(INTAKE_NOTE_INSTRUCTIONS).not.toContain('"denies substance use"');
    expect(INTAKE_NOTE_INSTRUCTIONS).not.toContain('"No prior therapy"');
  });

  it('stay inside the token budget a small model can hold', () => {
    for (const instructions of [PROGRESS_NOTE_INSTRUCTIONS, INTAKE_NOTE_INSTRUCTIONS]) {
      expect(approximateTokens(instructions)).toBeLessThan(3000);
    }
  });

  it('picks a default by section list, then by format name, then generic', () => {
    const HERS = [...STANDARD_PROGRESS_FORMAT.sections];
    expect(defaultInstructionsFor('Progress note', HERS)).toBe(OWNER_PROGRESS_INSTRUCTIONS);
    expect(defaultInstructionsFor('Weekly session', HERS)).toBe(OWNER_PROGRESS_INSTRUCTIONS);
    expect(
      defaultInstructionsFor(
        'Weekly session',
        HERS.map((s) => ` ${s.toUpperCase()} `),
      ),
    ).toBe(OWNER_PROGRESS_INSTRUCTIONS);
    // Her sections in another order, or one short, are not her format.
    expect(defaultInstructionsFor('Weekly session', [...HERS].reverse())).toBe(GENERIC_INSTRUCTIONS);
    expect(defaultInstructionsFor('Weekly session', HERS.slice(1))).toBe(GENERIC_INSTRUCTIONS);
    // The sections decide before the name: a "Progress note" in SOAP keeps SOAP.
    expect(defaultInstructionsFor('Progress note', SOAP)).toBe(PROGRESS_NOTE_INSTRUCTIONS);
    expect(defaultInstructionsFor('Weekly session', SOAP)).toBe(PROGRESS_NOTE_INSTRUCTIONS);
    expect(defaultInstructionsFor('intake note', INTAKE)).toBe(INTAKE_NOTE_INSTRUCTIONS);
    // A "Progress note" with sections of its own gets hers, which follow any sections.
    expect(defaultInstructionsFor('Progress note', CUSTOM)).toBe(OWNER_PROGRESS_INSTRUCTIONS);
    expect(defaultInstructionsFor('Supervision log', CUSTOM)).toBe(GENERIC_INSTRUCTIONS);
  });

  it('prefers the format’s own instructions when it has any', () => {
    expect(instructionsFor('  Write it my way.  ', 'Progress note', SOAP)).toBe('Write it my way.');
    expect(instructionsFor('   ', 'Progress note', SOAP)).toBe(PROGRESS_NOTE_INSTRUCTIONS);
    expect(instructionsFor('', 'Progress note', [...STANDARD_PROGRESS_FORMAT.sections])).toBe(
      OWNER_PROGRESS_INSTRUCTIONS,
    );
  });
});

describe('outputFormatBlock', () => {
  it('restates the schema the `format` parameter never shows the model', () => {
    expect(outputFormatBlock(SOAP)).toMatchInlineSnapshot(`
      "## Output format

      Return one JSON object and nothing else. It must have exactly these keys, in this order:

        "Subjective", "Objective", "Assessment", "Plan"

      Every key is required. Each value is that section's body as plain prose.
      Do not add any other key. Do not use markdown, headings, or bullet characters — except the subheading line a section's local guidance asks for: a few words with the first letter capitalised, ending in a colon, alone on its own line.
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

  it('adds only section-scoped clinical guidance and keeps reference documents out', () => {
    const prompt = buildGeneratePrompt({
      instructions: 'Owner-authored fictional format instructions.',
      formatName: 'Fictional progress format',
      sections: ['Subjective', 'Presentation', 'Interventions', 'Discussion', 'Risk'],
      typedNotes: 'Fictional client spoke rapidly. The therapist used cognitive restructuring.',
    });
    expect(prompt.system).toContain('Presentation/MSE routing');
    expect(prompt.system).toContain('Intervention routing');
    expect(prompt.system).toContain('Discussion routing');
    expect(prompt.system).not.toMatch(/\.pdf|MSE examples|Cheat Sheet|patient/i);
    expect(
      prompt.system.endsWith('no diagnosis, causality, severity, risk, or intervention may be added.'),
    ).toBe(true);
  });

  it('omits guidance when the caller explicitly supplies an empty guide', () => {
    const prompt = buildGeneratePrompt({
      instructions: 'Owner-authored fictional format instructions.',
      sections: ['Plan'],
      clinicalGuidance: '',
      typedNotes: 'Fictional client agreed to return.',
    });
    expect(prompt.system).not.toContain('Local clinical vocabulary guidance');
    expect(prompt.system).toContain('Faithfulness close');
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
        '## Local clinical vocabulary guidance',
        'Vocabulary version: 2026-09-07.1.',
        '',
        'Presentation/MSE routing: use the authored section "Objective" only for findings explicitly observed, measured, or reported in the current source.',
        'MSE domains are a checklist, not a completion quota: appearance/behaviour, speech, mood, affect, perception, thought process, thought content, cognition/sensorium, insight/judgment.',
        'Do not turn silence into a normal or negative finding. Preserve uncertainty and source attribution; omit an unsupported or unclear finding.',
        'Plan routing: use the authored section "Plan" only for stated future actions, follow-up, or interventions; do not add a modality or technique that the source does not state.',
        '',
        'Where the instructions above say "the dictation", they mean the source material below. There is no recording for this session: the source is the therapist\'s own written notes, so it carries no transcription errors and her wording is exact.',
        '',
        'Faithfulness close: local guidance changes wording and routing only, never content. Trace every sentence to the current source, note, or therapist message; unsupported or absent sections stay empty, and no diagnosis, causality, severity, risk, or intervention may be added.',
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
  /**
   * Her other notes as read-only background (2026-09-21). The refine call
   * edits a clinical record and fabrication is its first failure, so the
   * background is fenced and labelled at both ends, and the rule is stated
   * in the system block *and* beside her message — where, on this model, a
   * rule survives (the tone lesson above).
   */
  describe('with her other notes as background', () => {
    const base = {
      instructions: '',
      formatName: 'Progress note',
      sections: SOAP,
      noteText: 'Subjective: Sleeping better.\n\nPlan: Continue weekly.',
      history: [],
      message: 'Make it shorter',
    };
    const PRIOR = [
      { title: 'Progress note', date: '2026-09-11', text: 'Subjective: Sister Maria visited from Denver.' },
      { title: 'Progress note', date: '2026-09-04', text: 'Plan: Try the breathing app twice a day.' },
    ];

    it('leaves the prompt byte for byte as it was when there is no background', () => {
      const without = buildRefinePrompt(base);
      expect(buildRefinePrompt({ ...base, priorNotes: [] })).toEqual(without);
      for (const text of [REFINE_BACKGROUND_RULE, REFINE_BACKGROUND_START, REFINE_BACKGROUND_REMINDER]) {
        expect(without.system).not.toContain(text);
        expect(without.user).not.toContain(text);
      }
    });

    it('fences every other note inside a read-only block, before the note being revised', () => {
      const { system, user } = buildRefinePrompt({ ...base, priorNotes: PRIOR, noteDate: '2026-09-18' });
      expect(system).toContain(REFINE_BACKGROUND_RULE);

      const start = user.indexOf(REFINE_BACKGROUND_START);
      const end = user.indexOf(REFINE_BACKGROUND_END);
      const note = user.indexOf('The note as it currently stands:');
      expect(start).toBe(0);
      expect(end).toBeGreaterThan(start);
      expect(note).toBeGreaterThan(end);
      for (const prior of PRIOR) {
        const at = user.indexOf(priorNoteBlock(prior));
        expect(at).toBeGreaterThan(start);
        expect(at).toBeLessThan(end);
        // Nothing of it appears anywhere else in the prompt.
        expect(user.lastIndexOf(prior.text)).toBe(at + priorNoteBlock(prior).indexOf(prior.text));
      }
      // Newest first, and the note being revised is placed in time.
      expect(user.indexOf('2026-09-11')).toBeLessThan(user.indexOf('2026-09-04'));
      expect(user).toContain('The note you are revising is dated 2026-09-18.');
      expect(REFINE_BACKGROUND_START).toContain('READ ONLY');
      expect(REFINE_BACKGROUND_START).toContain('nothing in them goes into it unless she asks');
    });

    it('restates the rule beside an ordinary edit request, after her message', () => {
      const { user } = buildRefinePrompt({ ...base, priorNotes: PRIOR });
      const said = user.indexOf('She says:\n\nMake it shorter');
      const reminder = user.indexOf(REFINE_BACKGROUND_REMINDER);
      expect(said).toBeGreaterThan(user.indexOf(REFINE_BACKGROUND_END));
      expect(reminder).toBeGreaterThan(said);
      expect(reminder).toBeLessThan(user.indexOf('Reply with a single JSON object'));
      expect(REFINE_BACKGROUND_REMINDER).toContain('takes nothing from them');
      expect(REFINE_BACKGROUND_REMINDER).toContain('unless her message asks you to bring that thing over');
      // The standing rules beside her message are all still there.
      expect(user).toContain('may not add observations, findings, or clinical phrasing');
      expect(user).toContain('return "updatedSections": null');
    });
  });

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
   * Found live in M10's human pass: the UI's old "More clinical" quick action
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
    expect(prompt.system).toContain('Faithfulness close');
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

describe('buildBrainstormPrompt', () => {
  const NOTE = { title: 'Progress note', date: '2026-09-18', text: 'Subjective: Sleeping better.' };

  it('renders one block per note, newest first, and labels the turns', () => {
    const prompt = buildBrainstormPrompt({
      patientName: 'John Smith',
      notes: [NOTE],
      history: [{ role: 'user', text: 'He cancelled twice.' }],
      message: 'What stands out?',
    });
    expect(prompt.system).toContain('John Smith');
    expect(prompt.user).toContain('### Progress note (2026-09-18)');
    expect(prompt.user).toContain('Sleeping better.');
    expect(prompt.user).toContain('Therapist: He cancelled twice.');
    expect(prompt.user).toContain('She says:');
  });

  it('carries the whole faithfulness stance, in the system and beside her message', () => {
    const prompt = buildBrainstormPrompt({
      patientName: 'John Smith',
      notes: [NOTE],
      history: [],
      message: 'Why?',
    });
    expect(prompt.system).toContain('say plainly');
    expect(prompt.system).toContain('not in the notes');
    expect(prompt.user).toContain('say plainly');
    expect(prompt.user).toContain('not in them');
    expect(prompt.system).toContain('Never invent session history');
    expect(prompt.system).toContain('You do not diagnose');
    expect(prompt.system).toContain('never write anything that reads as a record entry');
    expect(prompt.system).toContain('"reply"');
    expect(prompt.user.trimEnd().endsWith('and nothing else.')).toBe(true);
  });

  it('says there are no notes yet instead of showing an empty context', () => {
    const prompt = buildBrainstormPrompt({
      patientName: 'John Smith',
      notes: [],
      history: [],
      message: 'Hello?',
    });
    expect(prompt.user).toContain('There are no notes for John Smith yet.');
    expect(prompt.user).not.toContain('###');
  });

  it('keeps five ordinary notes inside the budget the provider enforces', () => {
    const notes = Array.from({ length: 5 }, (_, index) => ({
      title: 'Progress note',
      date: `2026-09-${String(10 + index).padStart(2, '0')}`,
      text: `Subjective: ${'The patient described the week in detail. '.repeat(40)}`,
    }));
    const prompt = buildBrainstormPrompt({
      patientName: 'John Smith',
      notes,
      history: [],
      message: 'Where are we?',
    });
    expect(approximateTokens(prompt.system) + approximateTokens(prompt.user)).toBeLessThan(NUM_CTX * 0.75);
  });

  it('tells the model when older notes did not fit, and not otherwise', () => {
    const base = { patientName: 'John Smith', notes: [NOTE], history: [], message: 'Hi.' };
    expect(buildBrainstormPrompt(base).user).not.toContain('fit here');
    const partial = buildBrainstormPrompt({ ...base, omittedNotes: 29 }).user;
    expect(partial).toContain('Only 1 of her 30 notes on this patient fit here');
    expect(partial).toContain('say it is not in the notes you were given');
    // No notes fitted is not "no notes yet".
    const none = buildBrainstormPrompt({ ...base, notes: [], omittedNotes: 3 }).user;
    expect(none).toContain('None of her notes on John Smith fit here');
    expect(none).not.toContain('no notes for John Smith yet');
  });

  it('budgets exactly what the prompt shows, block for block', () => {
    expect(priorNoteBlock(NOTE)).toBe('### Progress note (2026-09-18)\n\nSubjective: Sleeping better.');
    const prompt = buildBrainstormPrompt({
      patientName: 'John Smith',
      notes: [NOTE],
      history: [],
      message: 'Hi.',
    });
    expect(prompt.user).toContain(priorNoteBlock(NOTE));
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
