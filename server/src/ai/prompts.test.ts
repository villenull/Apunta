import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  defaultInstructionsFor,
  GENERIC_INSTRUCTIONS,
  instructionsFor,
  INTAKE_NOTE_INSTRUCTIONS,
  PROGRESS_NOTE_INSTRUCTIONS,
} from './default-instructions.js';
import {
  approximateTokens,
  buildDetectFormatPrompt,
  buildGeneratePrompt,
  buildRefinePrompt,
  orderSections,
  outputFormatBlock,
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
