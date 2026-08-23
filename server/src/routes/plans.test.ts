import type { NoteFormat, Patient, PlanGoal, PlanResponse, TreatmentPlan } from '@apunta/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { listPlanGoals, listPlanVersions } from '../db/plans.js';
import { createTestApp, seedFormat, seedNote, seedPatient, type TestApp } from '../test/harness.js';
import { recordingProviders, type RecordingLlmProvider } from '../test/providers.js';

/**
 * The plan endpoints, end to end against a real SQLite file.
 *
 * The suite is organised around the three things this packet gets wrong most
 * easily: proposed is not accepted, the model never proposes a diagnosis, and
 * nothing connects goals to notes.
 *
 * Every note body here is the project's synthetic practice.
 */

interface SseEvent {
  readonly name: string;
  readonly data: Record<string, unknown>;
}

function parseSse(body: string): SseEvent[] {
  const events: SseEvent[] = [];
  for (const frame of body.split('\n\n')) {
    const name = /^event: (.+)$/m.exec(frame)?.[1];
    const data = /^data: (.+)$/m.exec(frame)?.[1];
    if (name === undefined || data === undefined) continue;
    events.push({ name, data: JSON.parse(data) as Record<string, unknown> });
  }
  return events;
}

const SLEEP_NOTE = [
  'Subjective: Patient reports improved sleep since last session and decreased frequency of intrusive thoughts.',
  '',
  'Objective: Alert and engaged in session.',
  '',
  'Assessment: Continued progress on anxiety management goals.',
  '',
  'Plan: Continue weekly sessions.',
].join('\n');

let harness: TestApp;
let llm: RecordingLlmProvider;
let patient: Patient;
let format: NoteFormat;

beforeEach(async () => {
  const providers = recordingProviders();
  llm = providers.llm;
  harness = await createTestApp({ providers });
  patient = await seedPatient(harness.app, 'John Smith');
  format = await seedFormat(harness.app);
});

afterEach(async () => {
  await harness.close();
});

async function suggest(app: FastifyInstance = harness.app): Promise<SseEvent[]> {
  const response = await app.inject({
    method: 'POST',
    url: `/api/patients/${patient.id}/plan/suggest`,
    payload: {},
  });
  return parseSse(response.body);
}

async function readPlan(query = ''): Promise<PlanResponse> {
  const response = await harness.app.inject({
    method: 'GET',
    url: `/api/patients/${patient.id}/plan${query}`,
  });
  return response.json<PlanResponse>();
}

describe('GET /api/patients/:id/plan', () => {
  it('answers "no plan yet" rather than a 404', async () => {
    const response = await harness.app.inject({ method: 'GET', url: `/api/patients/${patient.id}/plan` });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ plan: null, goals: [] });
  });

  it('404s for an unknown patient and an unknown version', async () => {
    const missing = await harness.app.inject({
      method: 'GET',
      url: '/api/patients/0198c0f0-0000-7000-8000-0000000000ff/plan',
    });
    expect(missing.statusCode).toBe(404);

    await harness.app.inject({ method: 'POST', url: `/api/patients/${patient.id}/plan`, payload: {} });
    const version = await harness.app.inject({
      method: 'GET',
      url: `/api/patients/${patient.id}/plan?version=7`,
    });
    expect(version.statusCode).toBe(404);
  });
});

describe('POST /api/patients/:id/plan/suggest', () => {
  beforeEach(async () => {
    await seedNote(harness.app, patient.id, format.id, SLEEP_NOTE);
  });

  it('persists what it proposes as proposed, with evidence, and leaves the plan alone', async () => {
    const events = await suggest();

    expect(events.map((event) => event.name)).toContain('goal');
    expect(events.at(-1)?.name).toBe('done');

    const { plan, goals } = await readPlan();
    expect(goals.length).toBeGreaterThan(0);
    for (const goal of goals) {
      expect(goal.status).toBe('proposed');
      expect(goal.accepted_at).toBeNull();
      expect(goal.source).toBe('model_suggested');
      // A proposal with no citable evidence is not offered at all.
      expect(goal.evidence.length).toBeGreaterThan(0);
      expect(goal.evidence[0]?.note_id).toBeTruthy();
      expect(SLEEP_NOTE).toContain(goal.evidence[0]?.excerpt ?? 'not in the note');
      expect(goal.evidence[0]?.section).toBe('Subjective');
    }

    // The plan itself is untouched: nothing accepted, nothing typed.
    expect(plan?.status).toBe('draft');
    expect(plan?.diagnoses).toEqual([]);
    expect(plan?.modality).toBe('');
    expect(plan?.attested_at).toBeNull();
  });

  it('reads each note in its own call, and says how far back it read', async () => {
    await seedNote(harness.app, patient.id, format.id, SLEEP_NOTE);
    await seedNote(harness.app, patient.id, format.id, SLEEP_NOTE);

    const events = await suggest();

    // Three notes, three summarising calls, then one drafting call.
    expect(llm.summarised).toHaveLength(3);
    expect(llm.suggestions).toHaveLength(1);
    for (const call of llm.summarised) expect(call.noteText).toBe(SLEEP_NOTE);

    const done = events.at(-1)?.data as { lookback: { cap: number; notes_read: number } };
    expect(done.lookback.notes_read).toBe(3);
    expect(done.lookback.cap).toBe(5);
  });

  it('respects the lookback cap', async () => {
    for (let index = 0; index < 8; index += 1) {
      await seedNote(harness.app, patient.id, format.id, SLEEP_NOTE);
    }
    await harness.app.inject({ method: 'PUT', url: '/api/settings', payload: { ai_lookback_notes: 2 } });

    const events = await suggest();
    expect(llm.summarised).toHaveLength(2);
    const done = events.at(-1)?.data as { lookback: { notes_read: number; cap: number } };
    expect(done.lookback).toMatchObject({ notes_read: 2, cap: 2 });
  });

  it('passes the diagnosis in as input, and cannot get one back', async () => {
    const { plan } = await readPlan();
    const started = await harness.app.inject({
      method: 'POST',
      url: `/api/patients/${patient.id}/plan`,
      payload: {},
    });
    const started_plan = started.json<PlanResponse>().plan as TreatmentPlan;
    await harness.app.inject({
      method: 'PATCH',
      url: `/api/plans/${started_plan.id}`,
      payload: {
        diagnoses: [
          { code: 'F41.1', system: 'icd-10-cm', description: 'Generalized anxiety disorder', primary: true },
        ],
      },
    });
    expect(plan).toBeNull();

    await suggest();

    expect(llm.suggestions[0]?.diagnoses).toEqual(['F41.1 (ICD-10-CM) Generalized anxiety disorder']);
    // Whatever it proposed, the diagnosis on the plan is still only hers.
    const after = await readPlan();
    expect(after.plan?.diagnoses).toEqual([
      { code: 'F41.1', system: 'icd-10-cm', description: 'Generalized anxiety disorder', primary: true },
    ]);
  });

  it('drops a goal whose citation does not resolve', async () => {
    const providers = recordingProviders({
      suggestPlanGoals: () => ({
        goals: [
          {
            statement: 'A goal standing on a note that was never read.',
            objectives: [],
            interventions: [],
            evidence: [{ note: 9, excerpt: 3 }],
          },
          {
            statement: 'A goal standing on something real.',
            objectives: [],
            interventions: [],
            evidence: [{ note: 0, excerpt: 0 }],
          },
        ],
      }),
    });
    const stubbed = await createTestApp({ providers });
    try {
      const stubPatient = await seedPatient(stubbed.app, 'John Smith');
      const stubFormat = await seedFormat(stubbed.app);
      await seedNote(stubbed.app, stubPatient.id, stubFormat.id, SLEEP_NOTE);

      const response = await stubbed.app.inject({
        method: 'POST',
        url: `/api/patients/${stubPatient.id}/plan/suggest`,
        payload: {},
      });
      const events = parseSse(response.body);
      const goals = events.filter((event) => event.name === 'goal');

      expect(goals).toHaveLength(1);
      expect((goals[0]?.data['goal'] as PlanGoal).statement).toBe('A goal standing on something real.');
      expect(events.at(-1)?.data['dropped']).toBe(1);
    } finally {
      await stubbed.close();
    }
  });

  it('writes nothing at all when it has nothing citable to propose', async () => {
    const providers = recordingProviders({ suggestPlanGoals: () => ({ goals: [] }) });
    const stubbed = await createTestApp({ providers });
    try {
      const stubPatient = await seedPatient(stubbed.app, 'John Smith');
      const stubFormat = await seedFormat(stubbed.app);
      await seedNote(stubbed.app, stubPatient.id, stubFormat.id, SLEEP_NOTE);

      await stubbed.app.inject({
        method: 'POST',
        url: `/api/patients/${stubPatient.id}/plan/suggest`,
        payload: {},
      });

      // No empty plan version left behind by a run that proposed nothing.
      expect(listPlanVersions(stubbed.db, stubPatient.id)).toEqual([]);
    } finally {
      await stubbed.close();
    }
  });

  it('has nothing to read for a patient with no notes', async () => {
    const other = await seedPatient(harness.app, 'Maria Ruiz');
    const response = await harness.app.inject({
      method: 'POST',
      url: `/api/patients/${other.id}/plan/suggest`,
      payload: {},
    });
    const events = parseSse(response.body);

    expect(llm.summarised).toHaveLength(0);
    expect(llm.suggestions).toHaveLength(0);
    expect(events.at(-1)?.name).toBe('done');
    expect(events.at(-1)?.data['goals']).toEqual([]);
  });

  /**
   * The rule the whole packet turns on. A re-draft proposes beside the plan;
   * it never rewrites a goal she has accepted.
   */
  it('leaves an accepted goal untouched on a second run', async () => {
    await suggest();
    const before = (await readPlan()).goals[0] as PlanGoal;

    const accepted = await harness.app.inject({
      method: 'PATCH',
      url: `/api/plans/${before.plan_id}/goals/${before.id}`,
      payload: { status: 'accepted', statement: 'John sleeps through the night, in her words.' },
    });
    expect(accepted.statusCode).toBe(200);

    await suggest();

    const after = (await readPlan()).goals.find((goal) => goal.id === before.id);
    expect(after?.status).toBe('accepted');
    expect(after?.statement).toBe('John sleeps through the night, in her words.');
    expect(after?.accepted_at).not.toBeNull();
    // And the model was told what is already there, so it proposes beside it.
    expect(llm.suggestions[1]?.existingGoals).toContain('John sleeps through the night, in her words.');
  });

  it('reports an AI failure inside the stream, with no note content in it', async () => {
    const providers = recordingProviders({
      summariseNote: () => {
        throw Object.assign(new Error('boom'), { name: 'nope' });
      },
    });
    const stubbed = await createTestApp({ providers });
    try {
      const stubPatient = await seedPatient(stubbed.app, 'John Smith');
      const stubFormat = await seedFormat(stubbed.app);
      await seedNote(stubbed.app, stubPatient.id, stubFormat.id, SLEEP_NOTE);

      const response = await stubbed.app.inject({
        method: 'POST',
        url: `/api/patients/${stubPatient.id}/plan/suggest`,
        payload: {},
      });
      const events = parseSse(response.body);
      const failure = events.at(-1);

      expect(failure?.name).toBe('error');
      expect(Object.keys(failure?.data ?? {}).sort()).toEqual(['code', 'message']);
      expect(String(failure?.data['message'])).not.toContain('intrusive thoughts');
    } finally {
      await stubbed.close();
    }
  });
});

describe('accepting, editing and discarding a goal', () => {
  beforeEach(async () => {
    await seedNote(harness.app, patient.id, format.id, SLEEP_NOTE);
    await suggest();
  });

  it('accepts a proposal, which stamps it and makes it part of the plan', async () => {
    const proposed = (await readPlan()).goals[0] as PlanGoal;

    const response = await harness.app.inject({
      method: 'PATCH',
      url: `/api/plans/${proposed.plan_id}/goals/${proposed.id}`,
      payload: { status: 'accepted' },
    });

    expect(response.statusCode).toBe(200);
    const goal = response.json<PlanGoal>();
    expect(goal.status).toBe('accepted');
    expect(goal.accepted_at).not.toBeNull();
    // Provenance survives acceptance: this was the model's idea, and stays so.
    expect(goal.source).toBe('model_suggested');
  });

  it('discards a proposal outright', async () => {
    const proposed = (await readPlan()).goals[0] as PlanGoal;

    const response = await harness.app.inject({
      method: 'DELETE',
      url: `/api/plans/${proposed.plan_id}/goals/${proposed.id}`,
    });

    expect(response.statusCode).toBe(204);
    expect((await readPlan()).goals.some((goal) => goal.id === proposed.id)).toBe(false);
  });

  it('takes a goal she wrote herself, accepted on arrival', async () => {
    const { plan } = await readPlan();
    const response = await harness.app.inject({
      method: 'POST',
      url: `/api/plans/${plan?.id ?? ''}/goals`,
      payload: {
        statement: 'John uses paced breathing before work meetings.',
        objectives: [
          {
            statement: 'John will use paced breathing before at least 2 meetings a week for 6 weeks.',
            measure: 'his report, tallied weekly',
            baseline: 'using it before some meetings, not tracked',
            target_value: '2 meetings a week',
            target_date: '2026-10-04',
          },
        ],
        interventions: ['Rehearse paced breathing in session'],
      },
    });

    expect(response.statusCode).toBe(201);
    const goal = response.json<PlanGoal>();
    expect(goal.status).toBe('accepted');
    expect(goal.source).toBe('clinician_authored');
    expect(goal.objectives[0]?.target_date).toBe('2026-10-04');
    expect(goal.objectives[0]?.source).toBe('clinician_authored');
  });

  it('refuses a goal from another plan', async () => {
    const proposed = (await readPlan()).goals[0] as PlanGoal;
    const other = await seedPatient(harness.app, 'Maria Ruiz');
    const started = await harness.app.inject({
      method: 'POST',
      url: `/api/patients/${other.id}/plan`,
      payload: {},
    });
    const otherPlan = started.json<PlanResponse>().plan as TreatmentPlan;

    const response = await harness.app.inject({
      method: 'PATCH',
      url: `/api/plans/${otherPlan.id}/goals/${proposed.id}`,
      payload: { status: 'accepted' },
    });
    expect(response.statusCode).toBe(404);
  });
});

describe('reviews and versions', () => {
  async function startPlan(): Promise<TreatmentPlan> {
    const response = await harness.app.inject({
      method: 'POST',
      url: `/api/patients/${patient.id}/plan`,
      payload: {},
    });
    return response.json<PlanResponse>().plan as TreatmentPlan;
  }

  it('carries accepted goals forward, supersedes the old version, and keeps it readable', async () => {
    const first = await startPlan();
    await harness.app.inject({
      method: 'PATCH',
      url: `/api/plans/${first.id}`,
      payload: { modality: 'Individual psychotherapy (CBT)', frequency: 'Weekly, 50 minutes' },
    });
    const goal = (
      await harness.app.inject({
        method: 'POST',
        url: `/api/plans/${first.id}/goals`,
        payload: { statement: 'John sleeps well enough to get through a workday.' },
      })
    ).json<PlanGoal>();
    await harness.app.inject({ method: 'POST', url: `/api/plans/${first.id}/activate`, payload: {} });

    const review = await startPlan();
    expect(review.version).toBe(2);
    expect(review.status).toBe('draft');
    // Plan-level fields come forward; she edits rather than retypes.
    expect(review.modality).toBe('Individual psychotherapy (CBT)');

    const carried = listPlanGoals(harness.db, review.id);
    expect(carried).toHaveLength(1);
    expect(carried[0]?.carried_from_goal_id).toBe(goal.id);
    expect(carried[0]?.status).toBe('accepted');

    // The previous version stays in force until the review is activated.
    const beforeActivation = await readPlan('?version=1');
    expect(beforeActivation.plan?.status).toBe('active');

    await harness.app.inject({ method: 'POST', url: `/api/plans/${review.id}/activate`, payload: {} });

    const historical = await readPlan('?version=1');
    expect(historical.plan?.status).toBe('superseded');
    expect(historical.plan?.superseded_by).toBe(review.id);
    expect(historical.plan?.modality).toBe('Individual psychotherapy (CBT)');
    // And its goals are exactly the ones it had.
    expect(historical.goals.map((item) => item.id)).toEqual([goal.id]);

    const versions = await harness.app.inject({
      method: 'GET',
      url: `/api/patients/${patient.id}/plan/versions`,
    });
    expect(versions.json<{ versions: TreatmentPlan[] }>().versions.map((v) => v.version)).toEqual([2, 1]);
  });

  it('does not carry a proposal she never accepted', async () => {
    await seedNote(harness.app, patient.id, format.id, SLEEP_NOTE);
    await suggest();
    const current = await readPlan();
    expect(current.goals.every((goal) => goal.status === 'proposed')).toBe(true);
    await harness.app.inject({
      method: 'POST',
      url: `/api/plans/${current.plan?.id ?? ''}/activate`,
      payload: {},
    });

    const review = await startPlan();
    expect(listPlanGoals(harness.db, review.id)).toEqual([]);
  });

  it('refuses a second draft version while one is open', async () => {
    await startPlan();
    const response = await harness.app.inject({
      method: 'POST',
      url: `/api/patients/${patient.id}/plan`,
      payload: {},
    });
    expect(response.statusCode).toBe(409);
  });

  it('makes a superseded version read-only', async () => {
    const first = await startPlan();
    await harness.app.inject({ method: 'POST', url: `/api/plans/${first.id}/activate`, payload: {} });
    const review = await startPlan();
    await harness.app.inject({ method: 'POST', url: `/api/plans/${review.id}/activate`, payload: {} });

    const response = await harness.app.inject({
      method: 'PATCH',
      url: `/api/plans/${first.id}`,
      payload: { modality: 'Rewriting history' },
    });
    expect(response.statusCode).toBe(409);
  });

  it('dates the attestation and snapshots the clinician from settings', async () => {
    await harness.app.inject({
      method: 'PUT',
      url: '/api/settings',
      payload: {
        clinician_name: 'A. Therapist',
        clinician_credential: 'LCSW',
        clinician_licence: 'LIC-000',
        clinician_npi: '0000000000',
        plan_review_interval_days: 30,
      },
    });

    const first = await startPlan();
    const activated = (
      await harness.app.inject({
        method: 'POST',
        url: `/api/plans/${first.id}/activate`,
        payload: { effective_from: '2026-08-23' },
      })
    ).json<PlanResponse>().plan as TreatmentPlan;

    expect(activated.status).toBe('active');
    expect(activated.clinician_name).toBe('A. Therapist');
    expect(activated.clinician_credential).toBe('LCSW');
    expect(activated.attested_at).not.toBeNull();
    expect(activated.attestation_text).toContain('sign the copy in your records system');
    // The review interval is data, not a constant: 30 days from Settings.
    expect(activated.review_due).toBe('2026-09-22');
  });

  /**
   * The one carve-out from "nothing connects goals to notes": comparing a date
   * she chose to today reads no note and connects nothing.
   */
  it('refuses to re-activate a version that is already in force', async () => {
    const first = await startPlan();
    await harness.app.inject({ method: 'POST', url: `/api/plans/${first.id}/activate`, payload: {} });

    // Re-activating would move `effective_from` and re-date the attestation on
    // the record a payer reads against a service date.
    const again = await harness.app.inject({
      method: 'POST',
      url: `/api/plans/${first.id}/activate`,
      payload: {},
    });
    expect(again.statusCode).toBe(409);
  });

  it('keeps a goal’s evidence when she edits it', async () => {
    await seedNote(harness.app, patient.id, format.id, SLEEP_NOTE);
    await suggest();
    const proposed = (await readPlan()).goals[0] as PlanGoal;
    expect(proposed.evidence.length).toBeGreaterThan(0);

    const edited = await harness.app.inject({
      method: 'PATCH',
      url: `/api/plans/${proposed.plan_id}/goals/${proposed.id}`,
      payload: { status: 'accepted', statement: 'Rewritten in her own words.' },
    });

    // What it was drafted from does not change because she reworded it.
    expect(edited.json<PlanGoal>().evidence).toEqual(proposed.evidence);
  });

  it('carries the review date, and nothing derived from the notes', async () => {
    await seedNote(harness.app, patient.id, format.id, SLEEP_NOTE);
    const first = await startPlan();
    await harness.app.inject({
      method: 'PATCH',
      url: `/api/plans/${first.id}`,
      payload: { review_due: '2026-01-01' },
    });

    const { plan } = await readPlan();
    expect(plan?.review_due).toBe('2026-01-01');
    // Nothing on the plan payload counts sessions, scores coverage, or knows
    // that notes exist at all.
    expect(Object.keys(plan ?? {}).sort()).toEqual(
      [
        'activated_at',
        'attestation_text',
        'attested_at',
        'client_participation',
        'client_participation_note',
        'client_participation_on',
        'clinician_credential',
        'clinician_licence',
        'clinician_name',
        'clinician_npi',
        'created_at',
        'diagnoses',
        'discharge_criteria',
        'effective_from',
        'effective_to',
        'frequency',
        'id',
        'modality',
        'patient_id',
        'presenting_problem',
        'review_due',
        'review_interval_days',
        'status',
        'strengths',
        'superseded_by',
        'version',
      ].sort(),
    );
  });
});

describe('GET /api/plans/:id/export', () => {
  it('renders the payer-facing document, without the proposals', async () => {
    await seedNote(harness.app, patient.id, format.id, SLEEP_NOTE);
    await suggest();
    const { plan, goals } = await readPlan();
    const proposal = goals[0] as PlanGoal;

    await harness.app.inject({
      method: 'PATCH',
      url: `/api/plans/${plan?.id ?? ''}`,
      payload: {
        diagnoses: [
          { code: 'F41.1', system: 'icd-10-cm', description: 'Generalized anxiety disorder', primary: true },
        ],
        modality: 'Individual psychotherapy (CBT)',
        frequency: 'Weekly, 50 minutes',
      },
    });
    await harness.app.inject({
      method: 'POST',
      url: `/api/plans/${plan?.id ?? ''}/goals`,
      payload: { statement: 'John sleeps well enough to get through a workday.' },
    });

    const response = await harness.app.inject({
      method: 'GET',
      url: `/api/plans/${plan?.id ?? ''}/export`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.body).toContain('Patient: John Smith');
    expect(response.body).toContain('F41.1 (ICD-10-CM) Generalized anxiety disorder — primary');
    expect(response.body).toContain('Service modality: Individual psychotherapy (CBT)');
    expect(response.body).toContain('Service frequency: Weekly, 50 minutes');
    expect(response.body).toContain('John sleeps well enough to get through a workday.');
    expect(response.body).toContain('Revision history:');
    expect(response.body).toContain('Signatures:');
    // A proposal is not part of the plan, so it is not in the document.
    expect(response.body).not.toContain(proposal.statement);
  });
});

describe('POST /api/patients/:id/plan/suggest over a real connection', () => {
  it('streams proposed goals to a client that is actually connected', async () => {
    await seedNote(harness.app, patient.id, format.id, SLEEP_NOTE);
    const address = await harness.app.listen({ port: 0, host: '127.0.0.1' });

    try {
      const response = await fetch(`${address}/api/patients/${patient.id}/plan/suggest`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/event-stream');

      const events = parseSse(await response.text());
      // `app.inject` never opens a socket, so only this test can catch an SSE
      // stream that returns nothing over a real connection.
      expect(events.length).toBeGreaterThan(0);
      expect(events.some((event) => event.name === 'goal')).toBe(true);
      expect(events.at(-1)?.name).toBe('done');
    } finally {
      await harness.app.close();
    }
  });
});
