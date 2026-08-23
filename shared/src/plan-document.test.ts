import { describe, expect, it } from 'vitest';

import { planDocumentText } from './plan-document.js';
import type { PlanGoal, TreatmentPlan } from './plan.js';

/**
 * The export is the payer-facing artefact — the plan is produced on demand,
 * months later, for the version that was in force on a service date. So this
 * suite asserts the required fields field by field rather than snapshotting
 * the whole thing, and pins the immutability the versioning exists for.
 *
 * All clinical material here is the project's synthetic practice.
 */

const PLAN: TreatmentPlan = {
  id: '0198c0f0-0000-7000-8000-000000000001',
  patient_id: '0198c0f0-0000-7000-8000-000000000002',
  version: 1,
  status: 'active',
  created_at: '2026-05-01T09:00:00.000Z',
  activated_at: '2026-05-01T09:30:00.000Z',
  review_due: '2026-07-30',
  review_interval_days: 90,
  diagnoses: [
    { code: 'F41.1', system: 'icd-10-cm', description: 'Generalized anxiety disorder', primary: true },
  ],
  presenting_problem: 'Worry through most of the day since the work transition.',
  strengths: 'Attends reliably; keeps a sleep log without prompting.',
  modality: 'Individual psychotherapy (CBT)',
  frequency: 'Weekly, 50 minutes',
  discharge_criteria: 'Sleep and worry manageable without weekly contact for two months.',
  effective_from: '2026-05-01',
  effective_to: null,
  clinician_name: 'A. Therapist',
  clinician_credential: 'LCSW',
  clinician_licence: 'LIC-000',
  clinician_npi: '0000000000',
  attested_at: '2026-05-01T09:30:00.000Z',
  attestation_text: 'I authored and reviewed this treatment plan.',
  client_participation: 'reviewed_with_client',
  client_participation_on: '2026-05-01',
  client_participation_note: '',
  superseded_by: null,
};

const ACCEPTED_GOAL: PlanGoal = {
  id: '0198c0f0-0000-7000-8000-000000000003',
  plan_id: PLAN.id,
  ordinal: 0,
  statement: 'John sleeps well enough to get through a workday without the afternoon crash.',
  objectives: [
    {
      statement: 'John will report 6 or more hours of sleep on 5 of 7 nights for 3 consecutive weeks.',
      measure: 'his weekly sleep log, reviewed in session',
      baseline: 'four hours most nights at intake',
      target_value: '6 hours on 5 of 7 nights',
      target_date: '2026-11-15',
      source: 'clinician_authored',
    },
  ],
  interventions: ['CBT for insomnia', 'Paced breathing rehearsal in session'],
  target_date: '2026-11-15',
  status: 'accepted',
  source: 'model_suggested',
  evidence: [
    {
      note_id: '0198c0f0-0000-7000-8000-000000000004',
      note_date: '2026-04-18T10:00:00.000Z',
      section: 'Subjective',
      excerpt: 'getting like six, six and a half hours most nights now',
    },
  ],
  carried_from_goal_id: null,
  created_at: '2026-05-01T09:10:00.000Z',
  accepted_at: '2026-05-01T09:20:00.000Z',
};

const PROPOSED_GOAL: PlanGoal = {
  ...ACCEPTED_GOAL,
  id: '0198c0f0-0000-7000-8000-000000000005',
  statement: 'John completes a thought record three days a week.',
  status: 'proposed',
  accepted_at: null,
};

function render(overrides: Partial<Parameters<typeof planDocumentText>[0]> = {}): string {
  return planDocumentText({
    plan: PLAN,
    goals: [ACCEPTED_GOAL],
    versions: [PLAN],
    patientName: 'John Smith',
    patientIdentifier: 'JS-001',
    ...overrides,
  });
}

describe('the exported plan document', () => {
  it('carries every field a payer audit tool asks for', () => {
    const text = render();

    expect(text).toContain('Patient: John Smith (JS-001)');
    expect(text).toContain('Version: 1 (active)');
    expect(text).toContain('Effective: 2026-05-01 to present');
    expect(text).toContain('F41.1 (ICD-10-CM) Generalized anxiety disorder — primary');
    expect(text).toContain('Presenting problem:');
    expect(text).toContain('Worry through most of the day');
    expect(text).toContain('Strengths:');
    expect(text).toContain('Service modality: Individual psychotherapy (CBT)');
    expect(text).toContain('Service frequency: Weekly, 50 minutes');
    expect(text).toContain('1. John sleeps well enough');
    expect(text).toContain('Measure: his weekly sleep log, reviewed in session');
    expect(text).toContain('Baseline: four hours most nights at intake');
    expect(text).toContain('Target date: 2026-11-15');
    expect(text).toContain('- CBT for insomnia');
    expect(text).toContain('Discharge criteria:');
    expect(text).toContain('Review interval: every 90 days');
    expect(text).toContain('Next review due: 2026-07-30');
    expect(text).toContain('Revision history:');
    expect(text).toContain('Version 1 — active — 2026-05-01 to present');
    expect(text).toContain('Attestation:');
    expect(text).toContain('Clinician: A. Therapist');
    expect(text).toContain('Credential: LCSW');
    expect(text).toContain('Licence: LIC-000');
    expect(text).toContain('NPI: 0000000000');
    expect(text).toContain('Client participation: Reviewed with client on 2026-05-01');
    expect(text).toContain('Clinician: ____');
    expect(text).toContain('Client:    ____');
  });

  /** A proposal is not part of the plan, so it is not part of the document. */
  it('leaves proposed goals out entirely', () => {
    const text = render({ goals: [ACCEPTED_GOAL, PROPOSED_GOAL] });
    expect(text).toContain('John sleeps well enough');
    expect(text).not.toContain('thought record');
  });

  it('shows a gap rather than hiding it', () => {
    const bare: TreatmentPlan = {
      ...PLAN,
      diagnoses: [],
      modality: '',
      frequency: '',
      review_due: null,
      attested_at: null,
    };
    const text = planDocumentText({
      plan: bare,
      goals: [],
      versions: [bare],
      patientName: 'John Smith',
      patientIdentifier: null,
    });
    expect(text).toContain('Service modality: (not recorded)');
    expect(text).toContain('Next review due: (not recorded)');
    expect(text).toContain('Not yet attested');
    expect(text).toContain('Patient: John Smith\n');
  });

  /**
   * The immutability the versioning exists for: an export of version 1 taken
   * today and one taken after two more reviews must be the same bytes.
   */
  it('renders a superseded version identically after later versions exist', () => {
    const superseded: TreatmentPlan = {
      ...PLAN,
      status: 'superseded',
      effective_to: '2026-08-01',
      superseded_by: '0198c0f0-0000-7000-8000-000000000009',
    };
    const later: TreatmentPlan = {
      ...PLAN,
      id: '0198c0f0-0000-7000-8000-000000000009',
      version: 2,
      status: 'active',
      effective_from: '2026-08-01',
      created_at: '2026-08-01T09:00:00.000Z',
    };

    const before = planDocumentText({
      plan: superseded,
      goals: [ACCEPTED_GOAL],
      versions: [superseded],
      patientName: 'John Smith',
      patientIdentifier: 'JS-001',
    });
    const after = planDocumentText({
      plan: superseded,
      goals: [ACCEPTED_GOAL],
      versions: [later, superseded],
      patientName: 'John Smith',
      patientIdentifier: 'JS-001',
    });

    expect(after).toBe(before);
    expect(after).toContain('Version 1 — superseded — 2026-05-01 to 2026-08-01');
    expect(after).not.toContain('Version 2');
  });

  it('uses no markdown characters, because it is printed or pasted', () => {
    const text = render();
    expect(text).not.toMatch(/^#/m);
    expect(text).not.toMatch(/\*\*/);
  });
});
