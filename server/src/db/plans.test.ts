import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ATTESTATION_TEXT } from '@apunta/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../config.js';
import { createSessionBrief, listSessionBriefs } from './briefs.js';
import { openDatabase, type Database } from './index.js';
import { createPatient, deletePatient } from './patients.js';
import {
  activatePlan,
  createPlanGoal,
  createPlanVersion,
  deletePlanGoal,
  getActivePlan,
  getCurrentPlan,
  getPlan,
  getPlanVersion,
  listPlanGoals,
  listPlanVersions,
  updatePlan,
  updatePlanGoal,
} from './plans.js';

const migrationsDir = loadConfig({}).migrationsDir;

let dataDir: string;
let db: Database;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'apunta-plan-'));
  db = openDatabase({ file: join(dataDir, 'apunta.db'), migrationsDir }).db;
});

afterEach(() => {
  db.close();
  rmSync(dataDir, { recursive: true, force: true });
});

function patient(): string {
  return createPatient(db, { name: 'John Smith' }).id;
}

function plan(patientId: string) {
  return createPlanVersion(db, { patient_id: patientId, review_interval_days: 90 });
}

const ACTIVATION = {
  effective_from: '2026-08-23',
  review_due: '2026-11-21',
  attestation_text: ATTESTATION_TEXT,
  clinician_name: 'A. Therapist',
  clinician_credential: 'LCSW',
  clinician_licence: 'LIC-000',
  clinician_npi: '0000000000',
};

describe('plan versions', () => {
  it('numbers versions per patient and starts every one as a draft', () => {
    const john = patient();
    const first = plan(john);
    expect(first.version).toBe(1);
    expect(first.status).toBe('draft');
    expect(first.activated_at).toBeNull();

    activatePlan(db, first.id, ACTIVATION);
    const second = plan(john);
    expect(second.version).toBe(2);
    expect(second.status).toBe('draft');
  });

  it('supersedes the version in force when the next one is activated, and keeps it readable', () => {
    const john = patient();
    const first = activatePlan(db, plan(john).id, ACTIVATION);
    const second = plan(john);
    activatePlan(db, second.id, { ...ACTIVATION, effective_from: '2026-09-20', review_due: '2026-12-19' });

    const superseded = getPlan(db, first?.id ?? '');
    expect(superseded?.status).toBe('superseded');
    expect(superseded?.superseded_by).toBe(second.id);
    expect(superseded?.effective_to).toBe('2026-09-20');
    // The historical version is still there, and still says what it said.
    expect(getPlanVersion(db, john, 1)?.review_due).toBe('2026-11-21');
    expect(getActivePlan(db, john)?.version).toBe(2);
    expect(listPlanVersions(db, john).map((version) => version.version)).toEqual([2, 1]);
  });

  it('treats the newest version as the one being worked on, active or not', () => {
    const john = patient();
    activatePlan(db, plan(john).id, ACTIVATION);
    const review = plan(john);
    expect(getCurrentPlan(db, john)?.id).toBe(review.id);
    // …while the previous one stays in force until the review is activated.
    expect(getActivePlan(db, john)?.version).toBe(1);
  });

  it('snapshots the clinician onto the version rather than joining at render time', () => {
    const activated = activatePlan(db, plan(patient()).id, ACTIVATION);
    expect(activated?.clinician_name).toBe('A. Therapist');
    expect(activated?.clinician_credential).toBe('LCSW');
    expect(activated?.attestation_text).toBe(ATTESTATION_TEXT);
    expect(activated?.attested_at).not.toBeNull();
  });

  it('round-trips diagnoses through the JSON column', () => {
    const created = plan(patient());
    const updated = updatePlan(db, created.id, {
      diagnoses: [
        { code: 'F41.1', system: 'icd-10-cm', description: 'Generalized anxiety disorder', primary: true },
      ],
      modality: 'Individual psychotherapy (CBT)',
    });
    expect(updated?.diagnoses[0]?.code).toBe('F41.1');
    expect(getPlan(db, created.id)?.diagnoses[0]?.primary).toBe(true);
  });

  it('refuses a plan row that claims to be a draft and activated at once', () => {
    const created = plan(patient());
    expect(() =>
      db
        .prepare('UPDATE treatment_plans SET activated_at = ? WHERE id = ?')
        .run('2026-08-23T00:00:00.000Z', created.id),
    ).toThrow(/CHECK constraint failed/);
  });

  it('goes with the patient when the patient is deleted', () => {
    const john = patient();
    const created = plan(john);
    createPlanGoal(db, {
      plan_id: created.id,
      statement: 'Sleep improves.',
      status: 'proposed',
      source: 'model_suggested',
    });
    deletePatient(db, john);
    expect(listPlanVersions(db, john)).toEqual([]);
    expect(listPlanGoals(db, created.id)).toEqual([]);
  });
});

describe('plan goals', () => {
  it('keeps a proposed goal unaccepted and stamps acceptance when it is accepted', () => {
    const created = plan(patient());
    const proposed = createPlanGoal(db, {
      plan_id: created.id,
      statement: 'John sleeps well enough to get through a workday.',
      status: 'proposed',
      source: 'model_suggested',
      evidence: [
        {
          note_id: '0198c0f0-0000-7000-8000-000000000004',
          note_date: '2026-08-01T09:00:00.000Z',
          section: 'Subjective',
          excerpt: 'six, six and a half hours most nights now',
        },
      ],
    });

    expect(proposed.accepted_at).toBeNull();
    expect(proposed.evidence[0]?.section).toBe('Subjective');

    const accepted = updatePlanGoal(db, proposed.id, { status: 'accepted' });
    expect(accepted?.accepted_at).not.toBeNull();
    // Accepting does not lose where it came from.
    expect(accepted?.evidence[0]?.excerpt).toContain('six and a half hours');
    expect(accepted?.source).toBe('model_suggested');
  });

  it('refuses a goal that is proposed and accepted at the same time', () => {
    const created = plan(patient());
    const goal = createPlanGoal(db, {
      plan_id: created.id,
      statement: 'Sleep improves.',
      status: 'proposed',
      source: 'model_suggested',
    });
    expect(() =>
      db
        .prepare('UPDATE plan_goals SET accepted_at = ? WHERE id = ?')
        .run('2026-08-23T00:00:00.000Z', goal.id),
    ).toThrow(/CHECK constraint failed/);
  });

  it('keeps objectives as objects, so a measurable objective is expressible', () => {
    const created = plan(patient());
    const goal = createPlanGoal(db, {
      plan_id: created.id,
      statement: 'John sleeps well enough to get through a workday.',
      status: 'accepted',
      source: 'clinician_authored',
      objectives: [
        {
          statement: 'John will report 6 or more hours of sleep on 5 of 7 nights for 3 weeks.',
          measure: 'his weekly sleep log',
          baseline: 'four hours most nights at intake',
          target_value: '6 hours',
          target_date: '2026-11-15',
          source: 'clinician_authored',
        },
      ],
    });
    const stored = listPlanGoals(db, created.id)[0];
    expect(stored?.objectives[0]?.measure).toBe('his weekly sleep log');
    expect(stored?.objectives[0]?.target_date).toBe('2026-11-15');
    expect(goal.ordinal).toBe(0);
  });

  it('records lineage across a review', () => {
    const john = patient();
    const first = plan(john);
    const original = createPlanGoal(db, {
      plan_id: first.id,
      statement: 'Sleep improves.',
      status: 'accepted',
      source: 'clinician_authored',
    });
    activatePlan(db, first.id, ACTIVATION);

    const review = plan(john);
    const carried = createPlanGoal(db, {
      plan_id: review.id,
      statement: original.statement,
      status: 'accepted',
      source: original.source,
      carried_from_goal_id: original.id,
    });

    expect(carried.carried_from_goal_id).toBe(original.id);
    // The original stays exactly where it was, on the version it belonged to.
    expect(listPlanGoals(db, first.id).map((goal) => goal.id)).toEqual([original.id]);
  });

  it('orders goals by ordinal, and deletes one by id', () => {
    const created = plan(patient());
    const first = createPlanGoal(db, {
      plan_id: created.id,
      statement: 'A',
      status: 'accepted',
      source: 'clinician_authored',
    });
    const second = createPlanGoal(db, {
      plan_id: created.id,
      statement: 'B',
      status: 'accepted',
      source: 'clinician_authored',
    });
    expect(second.ordinal).toBe(1);
    expect(listPlanGoals(db, created.id).map((goal) => goal.statement)).toEqual(['A', 'B']);

    expect(deletePlanGoal(db, first.id)).toBe(true);
    expect(listPlanGoals(db, created.id).map((goal) => goal.statement)).toEqual(['B']);
  });
});

describe('saved session briefs', () => {
  it('stores only what she kept, newest first', () => {
    const john = patient();
    expect(listSessionBriefs(db, john)).toEqual([]);

    const content = {
      lines: [
        {
          note_id: '0198c0f0-0000-7000-8000-000000000004',
          note_date: '2026-08-01T09:00:00.000Z',
          note_title: 'Progress note',
          text: 'Sleeping better since the wind-down routine changed.',
        },
      ],
      lookback: {
        cap: 5,
        notes_read: 1,
        oldest_note_date: '2026-08-01T09:00:00.000Z',
        newest_note_date: '2026-08-01T09:00:00.000Z',
        skipped_note_ids: [],
      },
    };

    createSessionBrief(db, {
      patient_id: john,
      generated_at: '2026-08-22T09:00:00.000Z',
      content,
      source_note_ids: ['0198c0f0-0000-7000-8000-000000000004'],
    });
    createSessionBrief(db, {
      patient_id: john,
      generated_at: '2026-08-23T09:00:00.000Z',
      content,
      source_note_ids: [],
    });

    const briefs = listSessionBriefs(db, john);
    expect(briefs).toHaveLength(2);
    expect(briefs[0]?.generated_at).toBe('2026-08-23T09:00:00.000Z');
    expect(briefs[0]?.saved).toBe(true);
    expect(briefs[1]?.content.lines[0]?.text).toContain('wind-down routine');
  });
});
