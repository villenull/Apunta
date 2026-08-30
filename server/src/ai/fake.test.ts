import { sectionsToText, type Sections } from '@apunta/shared';
import { describe, expect, it } from 'vitest';

import {
  fakeComposeBrief,
  fakeDetectFormat,
  fakeRefine,
  fakeSummariseNote,
  fakeSuggestPlanGoals,
  FakeLlmProvider,
  FakeSttProvider,
} from './fake.js';
import type { LlmEvent } from './types.js';

const SOAP = ['Subjective', 'Objective', 'Assessment', 'Plan'];
const INTAKE = ['Presenting problem', 'History', 'Formulation', 'Plan'];

/** Instant, because pacing is a demo concern and these tests are not one. */
const provider = new FakeLlmProvider({ streamDelayMs: 0 });

async function drain(events: AsyncIterable<LlmEvent>): Promise<LlmEvent[]> {
  const collected: LlmEvent[] = [];
  for await (const event of events) collected.push(event);
  return collected;
}

function streamed(events: LlmEvent[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const event of events) {
    if (event.type === 'token') out[event.section] = (out[event.section] ?? '') + event.text;
  }
  return out;
}

function finalSections(events: LlmEvent[]): Sections {
  const last = events.at(-1);
  if (last?.type !== 'sections') throw new Error('the stream did not end with a sections event');
  return last.sections;
}

describe('FakeLlmProvider.generateNote', () => {
  it('returns the prototype’s sample SOAP note for a summary about sleep', async () => {
    const events = await drain(
      provider.generateNote({
        instructions: '',
        formatName: 'Progress note',
        sections: SOAP,
        typedNotes: 'Sleep improved, intrusive thoughts less frequent.',
      }),
    );
    expect(finalSections(events)['Subjective']).toContain('improved sleep');
    expect(finalSections(events)['Plan']).toContain('Continue weekly sessions');
  });

  it('is deterministic: the same input gives the same note', async () => {
    const request = {
      instructions: '',
      formatName: 'Progress note',
      sections: SOAP,
      typedNotes: 'Sleep improved.',
    };
    const first = finalSections(await drain(provider.generateNote(request)));
    const second = finalSections(await drain(provider.generateNote(request)));
    expect(second).toEqual(first);
  });

  it('picks the intake note when the summary reads like one', async () => {
    const events = await drain(
      provider.generateNote({
        instructions: '',
        formatName: 'Intake note',
        sections: INTAKE,
        typedNotes: 'New patient, first session. Anxious six months.',
      }),
    );
    expect(finalSections(events)['Presenting problem']).toContain('generalized anxiety');
  });

  /** The empty-section path has to be reachable without a real model. */
  it('leaves a section blank when the canned note has nothing for it', async () => {
    const events = await drain(
      provider.generateNote({
        instructions: '',
        sections: SOAP,
        typedNotes: 'Difficult week around the anniversary of her mother’s death. Grief.',
      }),
    );
    expect(finalSections(events)['Objective']).toBe('');
  });

  it('maps onto whatever sections the format defines', async () => {
    const sections = ['Attendance', 'Presentation', 'Next steps'];
    const events = await drain(
      provider.generateNote({ instructions: '', sections, typedNotes: 'Sleep improved.' }),
    );
    const result = finalSections(events);
    expect(Object.keys(result)).toEqual(sections);
    expect(result['Attendance']).toBe('Sleep improved.');
    expect(result['Presentation']).toBe('');
  });

  /**
   * The event shape is the point: Playwright and the web tests exercise the
   * fake, so if it streamed differently from the Ollama provider they would be
   * proving something about a path that does not exist in production.
   */
  it('streams decoded section text, never raw JSON', async () => {
    const events = await drain(
      provider.generateNote({ instructions: '', sections: SOAP, typedNotes: 'Sleep improved.' }),
    );
    expect(streamed(events)).toEqual(
      Object.fromEntries(Object.entries(finalSections(events)).filter(([, body]) => body !== '')),
    );
    for (const event of events) {
      if (event.type === 'token') expect(event.text).not.toContain('{"');
    }
  });

  it('opens with a status event and ends with the sections', async () => {
    const events = await drain(
      provider.generateNote({ instructions: '', sections: SOAP, typedNotes: 'Sleep improved.' }),
    );
    expect(events[0]?.type).toBe('status');
    expect(events.at(-1)?.type).toBe('sections');
  });
});

describe('FakeLlmProvider.refineNote', () => {
  const noteText = sectionsToText(
    {
      Subjective: 'Patient reports improved sleep.',
      Objective: 'Engaged.',
      Assessment: 'Progressing.',
      Plan: 'Continue weekly sessions and introduce grounding exercises between sessions.',
    },
    SOAP,
  );

  it('mirrors the prototype’s canned logic', async () => {
    const events = await drain(
      provider.refineNote({
        instructions: '',
        sections: SOAP,
        noteText,
        history: [],
        message: 'Make the plan shorter',
      }),
    );
    const last = events.at(-1);
    expect(last?.type).toBe('refined');
    if (last?.type !== 'refined') throw new Error('unreachable');
    expect(last.reply).toBe('Shortened the Plan section.');
    expect(last.updatedSections?.['Plan']).toBe('Continue weekly sessions and grounding exercises.');
  });

  it('streams the reply and never a half-written note', async () => {
    const events = await drain(
      provider.refineNote({
        instructions: '',
        sections: SOAP,
        noteText,
        history: [],
        message: 'Make the plan shorter',
      }),
    );
    expect(Object.keys(streamed(events))).toEqual(['reply']);
  });
});

describe('fakeRefine', () => {
  const current: Sections = {
    Subjective: 'Patient reports improved sleep.',
    Objective: '',
    Assessment: 'Progressing.',
    Plan: 'Continue weekly.',
  };

  it('appends to Subjective when asked about sleep', () => {
    const result = fakeRefine('Add something about her sleep', current, SOAP);
    expect(result.reply).toBe('Added that to the Subjective section.');
    expect(result.updatedSections?.['Subjective']).toContain('improved appetite');
  });

  it('answers a question without touching the note', () => {
    const result = fakeRefine('Is anything missing?', current, SOAP);
    expect(result.updatedSections).toBeNull();
  });

  it("routes the What's missing? quick action to the question branch", () => {
    // The exact phrase `RefineColumn` sends. Its old imperative form fell
    // through every question check and rewrote the note in live testing, so
    // this pins the phrase to the branch that answers without editing.
    const result = fakeRefine('What is missing from this note?', current, SOAP);
    expect(result.updatedSections).toBeNull();
    expect(result.reply).toContain('Based on the note');
  });

  it('acknowledges a highlighted excerpt in its answer', () => {
    const result = fakeRefine('Does this cover it?', current, SOAP, 'Continue weekly.');
    expect(result.reply).toContain('the section you highlighted');
  });

  it('falls back to an unchanged note', () => {
    const result = fakeRefine('Tidy it up', current, SOAP);
    expect(result.reply).toBe('Updated the note based on that.');
    expect(result.updatedSections).toEqual(current);
  });
});

describe('fakeDetectFormat', () => {
  it('reads headings out of a template', () => {
    expect(
      fakeDetectFormat({ kind: 'template', text: 'Subjective:\nObjective:\nAssessment:\nPlan:' }),
    ).toEqual({ name: 'Progress note', sections: ['Subjective', 'Objective', 'Assessment', 'Plan'] });
  });

  it('splits a comma-separated description', () => {
    expect(fakeDetectFormat({ kind: 'manual', text: 'Subjective, Objective, Plan' }).sections).toEqual([
      'Subjective',
      'Objective',
      'Plan',
    ]);
  });

  it('falls back to SOAP when it recognises no heading but the text says "Subjective"', () => {
    expect(
      fakeDetectFormat({ kind: 'examples', text: 'she wrote a Subjective paragraph and stopped' }).sections,
    ).toEqual(['Subjective', 'Objective', 'Assessment', 'Plan']);
  });

  it('falls back to the intake shape when it recognises nothing at all', () => {
    expect(fakeDetectFormat({ kind: 'examples', text: 'nothing heading-like here' }).sections).toEqual([
      'Presenting problem',
      'History',
      'Formulation',
      'Plan',
    ]);
  });

  it('is deterministic', () => {
    const request = { kind: 'template', text: 'Presenting problem:\nHistory:\nIntake summary' } as const;
    expect(fakeDetectFormat(request)).toEqual(fakeDetectFormat(request));
    expect(fakeDetectFormat(request).name).toBe('Intake note');
  });
});

describe('FakeSttProvider', () => {
  it('reports progress and then a transcript', async () => {
    const events: string[] = [];
    let transcript = '';
    const request = { wavPath: '/tmp/a.wav', durationSeconds: 12, vocabulary: [] };
    for await (const event of new FakeSttProvider().transcribe(request)) {
      events.push(event.type);
      if (event.type === 'transcript') transcript = event.text;
    }
    expect(events).toEqual(['progress', 'progress', 'progress', 'progress', 'transcript']);
    expect(transcript).toContain('John Smith');
  });

  /** Hard rule 3: fake mode is a working app, so nothing in it reports missing. */
  it('reports whisper as present, so fake mode is not a half-broken setup', async () => {
    await expect(new FakeSttProvider().describe()).resolves.toMatchObject({
      binaryPresent: true,
      modelPresent: true,
    });
  });
});

describe('the faked M9 stages', () => {
  const SOAP = ['Subjective', 'Objective', 'Assessment', 'Plan'];
  const NOTE = [
    'Subjective: Patient reports improved sleep since last session. He is getting six hours most nights.',
    '',
    'Objective:',
    '',
    'Assessment: Continued progress on anxiety management goals.',
    '',
    'Plan: Continue weekly sessions.',
  ].join('\n');

  /**
   * The property the whole evidence chain rests on. A fake that offered a
   * paraphrase would pass a verification the real path fails, and every test
   * built on it would be proving something about a path that does not exist.
   */
  it('only offers excerpts that are literally in the note', () => {
    const summary = fakeSummariseNote({ noteText: NOTE, sections: SOAP });

    expect(summary.excerpts.length).toBeGreaterThan(0);
    for (const excerpt of summary.excerpts) expect(NOTE).toContain(excerpt);
    // The empty section contributes nothing rather than an invented line.
    expect(summary.points.join(' ')).not.toContain('Objective');
  });

  it('has nothing to say about an empty note', () => {
    expect(fakeSummariseNote({ noteText: '', sections: SOAP })).toEqual({ points: [], excerpts: [] });
  });

  it('proposes goals that cite an offered excerpt, and never a diagnosis', () => {
    const suggestion = fakeSuggestPlanGoals({
      diagnoses: ['F41.1 (ICD-10-CM) Generalized anxiety disorder'],
      modality: 'Individual psychotherapy (CBT)',
      frequency: 'Weekly, 50 minutes',
      existingGoals: [],
      notes: [{ index: 0, date: '2026-08-08', excerpts: ['improved sleep since last session'] }],
    });

    expect(suggestion.goals).toHaveLength(1);
    const goal = suggestion.goals[0];
    expect(goal?.statement).toContain('sleeps well enough');
    expect(goal?.evidence).toEqual([{ note: 0, excerpt: 0 }]);
    expect(JSON.stringify(suggestion)).not.toMatch(/F41|diagnos/i);
    // A baseline may be cited; a target may not be invented.
    expect(goal?.objectives[0]?.baseline).toBe('improved sleep since last session');
    expect(JSON.stringify(suggestion)).not.toMatch(/target/i);
  });

  it('does not propose a goal that is already in the plan', () => {
    const notes = [{ index: 0, date: '2026-08-08', excerpts: ['improved sleep since last session'] }];
    const first = fakeSuggestPlanGoals({
      diagnoses: [],
      modality: '',
      frequency: '',
      existingGoals: [],
      notes,
    });
    const second = fakeSuggestPlanGoals({
      diagnoses: [],
      modality: '',
      frequency: '',
      existingGoals: [first.goals[0]?.statement ?? ''],
      notes,
    });
    expect(second.goals).toEqual([]);
  });

  it('composes a briefing whose every line names one note', () => {
    const brief = fakeComposeBrief({
      notes: [
        { index: 0, date: '2026-08-08', title: 'Progress note', points: ['Sleeping better.', 'Alert.'] },
        { index: 1, date: '2026-08-01', title: 'Progress note', points: ['Poor sleep.'] },
      ],
    });

    expect(brief.lines.map((line) => line.note)).toEqual([0, 0, 1]);
    expect(brief.lines[0]?.text).toBe('Sleeping better.');
  });
});
