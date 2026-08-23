import { describe, expect, it } from 'vitest';

import {
  BriefCompositionSchema,
  briefCompositionJsonSchema,
  NoteSummarySchema,
  noteSummaryJsonSchema,
  PlanSuggestionSchema,
  planSuggestionJsonSchema,
} from './plan-ai.js';
import {
  addDays,
  CalendarDateSchema,
  CreateGoalRequestSchema,
  DiagnosisSchema,
  PlanObjectiveSchema,
  reviewDueState,
  today,
  UpdateGoalRequestSchema,
} from './plan.js';

describe('calendar dates', () => {
  it('accepts a plain date and rejects an instant', () => {
    expect(CalendarDateSchema.safeParse('2026-11-15').success).toBe(true);
    // A due date stored as a UTC instant moves by a day depending on the
    // reader's timezone, which is why these are dates and not timestamps.
    expect(CalendarDateSchema.safeParse('2026-11-15T00:00:00.000Z').success).toBe(false);
    expect(CalendarDateSchema.safeParse('15/11/2026').success).toBe(false);
  });

  it('adds days without crossing into timezone arithmetic', () => {
    expect(addDays('2026-08-23', 90)).toBe('2026-11-21');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('reads today in the local timezone, not UTC', () => {
    // 23:30 local on the 23rd is the 23rd, whatever UTC says.
    const local = new Date(2026, 7, 23, 23, 30);
    expect(today(local)).toBe('2026-08-23');
  });
});

describe('the review-due indicator', () => {
  const now = new Date(2026, 7, 23, 12, 0);

  it('reports a date that has passed as overdue', () => {
    expect(reviewDueState('2026-08-12', now)).toEqual({ due: '2026-08-12', daysUntil: -11, overdue: true });
  });

  it('reports a date still ahead as not overdue', () => {
    expect(reviewDueState('2026-09-01', now)?.overdue).toBe(false);
  });

  it('treats the due date itself as not yet overdue', () => {
    expect(reviewDueState('2026-08-23', now)).toEqual({ due: '2026-08-23', daysUntil: 0, overdue: false });
  });

  it('has nothing to say about a plan with no review date', () => {
    expect(reviewDueState(null, now)).toBeNull();
  });
});

describe('what the model is allowed to write', () => {
  /**
   * The load-bearing assertion of this packet. An ICD-10 code from a model is
   * billing-consequential invention, so the diagnosis is not something the
   * suggestion schema declines to ask for — it is a key the schema cannot
   * carry at all, in either direction.
   */
  it('has no diagnosis field in the plan suggestion schema', () => {
    const withDiagnosis = {
      goals: [
        {
          statement: 'John sleeps well enough to get through a workday.',
          objectives: [],
          interventions: [],
          evidence: [{ note: 0, excerpt: 0 }],
          diagnosis: 'F41.1',
        },
      ],
    };
    expect(PlanSuggestionSchema.safeParse(withDiagnosis).success).toBe(false);

    const topLevel = { goals: [], diagnoses: [{ code: 'F41.1' }] };
    expect(PlanSuggestionSchema.safeParse(topLevel).success).toBe(false);

    const schema = planSuggestionJsonSchema();
    const serialized = JSON.stringify(schema);
    expect(serialized).not.toMatch(/diagnos/i);
    expect(serialized).not.toMatch(/icd/i);
    expect(schema.additionalProperties).toBe(false);
    const goalItems = (schema.properties['goals'] as { items: { additionalProperties: boolean } }).items;
    expect(goalItems.additionalProperties).toBe(false);
  });

  /**
   * A note can supply a baseline — "up from four when we started" — but never
   * a target, because she never said seven. So a suggested objective has
   * nowhere to put one.
   */
  it('has no target field in a suggested objective', () => {
    const suggestion = {
      goals: [
        {
          statement: 'Sleep improves.',
          objectives: [
            {
              statement: 'Six hours a night.',
              measure: 'sleep log',
              baseline: 'four hours',
              target_value: '7',
            },
          ],
          interventions: [],
          evidence: [{ note: 0, excerpt: 0 }],
        },
      ],
    };
    expect(PlanSuggestionSchema.safeParse(suggestion).success).toBe(false);
    expect(JSON.stringify(planSuggestionJsonSchema())).not.toMatch(/target/i);
  });

  it('cites evidence by index, so a citation cannot be typed from memory', () => {
    const parsed = PlanSuggestionSchema.parse({
      goals: [
        {
          statement: 'John sleeps well enough to get through a workday.',
          objectives: [{ statement: 'Six or more hours.', measure: 'sleep log', baseline: 'four hours' }],
          interventions: ['CBT for insomnia'],
          evidence: [{ note: 1, excerpt: 2 }],
        },
      ],
    });
    expect(parsed.goals[0]?.evidence[0]).toEqual({ note: 1, excerpt: 2 });
  });

  it('rejects an extra key on a note summary — the fingerprint of an unapplied grammar', () => {
    expect(NoteSummarySchema.safeParse({ points: [], excerpts: [], thought: 'hmm' }).success).toBe(false);
    expect(NoteSummarySchema.safeParse({ points: ['Sleeping better.'], excerpts: [] }).success).toBe(true);
  });

  it('bounds every array it asks the model for', () => {
    const summary = noteSummaryJsonSchema();
    expect((summary.properties['points'] as { maxItems: number }).maxItems).toBeGreaterThan(0);
    const brief = briefCompositionJsonSchema();
    expect((brief.properties['lines'] as { maxItems: number }).maxItems).toBeGreaterThan(0);
    expect(BriefCompositionSchema.safeParse({ lines: [{ note: 0, text: 'Slept better.' }] }).success).toBe(
      true,
    );
  });

  /** No un-attributed field: every line names the note it came from. */
  it('gives a brief line nowhere to hold an un-sourced overview', () => {
    expect(
      BriefCompositionSchema.safeParse({ lines: [{ note: 0, text: 'x' }], overview: 'Going well' }).success,
    ).toBe(false);
  });
});

describe('plan request schemas', () => {
  it('takes a diagnosis from the therapist, coded and systematised', () => {
    const parsed = DiagnosisSchema.parse({
      code: 'F41.1',
      system: 'icd-10-cm',
      description: 'Generalized anxiety disorder',
      primary: true,
    });
    expect(parsed.primary).toBe(true);
    expect(DiagnosisSchema.safeParse({ code: 'F41.1', system: 'made-up', primary: true }).success).toBe(
      false,
    );
  });

  it('keeps target value and target date on the objective, where measurability belongs', () => {
    const objective = PlanObjectiveSchema.parse({
      statement: 'John will report 6 or more hours of sleep on 5 of 7 nights for 3 weeks.',
      measure: 'his weekly sleep log',
      baseline: 'four hours most nights at intake',
      target_value: '6 hours, 5 nights of 7',
      target_date: '2026-11-15',
      source: 'clinician_authored',
    });
    expect(objective.target_date).toBe('2026-11-15');
  });

  it('accepts a goal by moving its status, and refuses an empty patch', () => {
    expect(UpdateGoalRequestSchema.safeParse({ status: 'accepted' }).success).toBe(true);
    expect(UpdateGoalRequestSchema.safeParse({}).success).toBe(false);
  });

  it('lets a hand-written goal omit the objective source, which the server fills in', () => {
    const parsed = CreateGoalRequestSchema.parse({
      statement: 'Maria re-engages with the parts of her life she withdrew from.',
      objectives: [
        {
          statement: 'One planned social contact a week for six weeks.',
          measure: 'her report at the start of session',
          baseline: 'most Sundays spent in bed through July',
          target_value: '',
          target_date: '2026-10-11',
        },
      ],
    });
    expect(parsed.objectives?.[0]?.target_date).toBe('2026-10-11');
  });
});
