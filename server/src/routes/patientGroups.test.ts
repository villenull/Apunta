import {
  PatientGroupListResponseSchema,
  PatientGroupSchema,
  PatientSchema,
  type PatientGroup,
} from '@apunta/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createTestApp, seedPatient, type TestApp } from '../test/harness.js';

/**
 * Patient groups (owner, 2026-09-27) at the routes.
 *
 * The invariants worth pinning here are the ones the UI depends on and cannot
 * see: a name is unique whatever its case, a patient can be filed only under a
 * group that exists, and `group_id: null` is a real answer that puts them back
 * rather than being rejected. The names are the prototype's sample practice
 * (hard rule 2).
 */

let harness: TestApp;

beforeEach(async () => {
  harness = await createTestApp();
});

afterEach(async () => {
  await harness.close();
});

async function makeGroup(name: string): Promise<PatientGroup> {
  const response = await harness.app.inject({
    method: 'POST',
    url: '/api/patient-groups',
    payload: { name },
  });
  expect(response.statusCode).toBe(201);
  return PatientGroupSchema.parse(response.json());
}

describe('/api/patient-groups', () => {
  it('starts empty, and answers a schema-valid list', async () => {
    const response = await harness.app.inject({ method: 'GET', url: '/api/patient-groups' });

    expect(response.statusCode).toBe(200);
    expect(PatientGroupListResponseSchema.parse(response.json())).toEqual({ groups: [] });
  });

  it('creates a group, trimmed, and lists it', async () => {
    const group = await makeGroup('  Family therapy  ');

    expect(group.name).toBe('Family therapy');
    const listed = await harness.app.inject({ method: 'GET', url: '/api/patient-groups' });
    expect(PatientGroupListResponseSchema.parse(listed.json()).groups.map((g) => g.name)).toEqual([
      'Family therapy',
    ]);
  });

  /** Creation order, not alphabetical: the sidebar reads the order she made them. */
  it('lists groups in the order they were created, not alphabetically', async () => {
    await makeGroup('Zeta');
    await makeGroup('Alpha');

    const listed = await harness.app.inject({ method: 'GET', url: '/api/patient-groups' });
    expect(PatientGroupListResponseSchema.parse(listed.json()).groups.map((g) => g.name)).toEqual([
      'Zeta',
      'Alpha',
    ]);
  });

  it('refuses a blank name, and refuses a name she already has whatever its case', async () => {
    const blank = await harness.app.inject({
      method: 'POST',
      url: '/api/patient-groups',
      payload: { name: '   ' },
    });
    expect(blank.statusCode).toBe(400);

    await makeGroup('Family therapy');
    const clash = await harness.app.inject({
      method: 'POST',
      url: '/api/patient-groups',
      payload: { name: 'family THERAPY' },
    });

    expect(clash.statusCode).toBe(409);
    expect(clash.json<{ message: string }>().message).toBe('You already have a group with that name.');
  });

  it('renames a group, and lets a name be kept as it is', async () => {
    const group = await makeGroup('Family therapy');

    const renamed = await harness.app.inject({
      method: 'PATCH',
      url: `/api/patient-groups/${group.id}`,
      payload: { name: 'Family work' },
    });
    expect(renamed.statusCode).toBe(200);
    expect(PatientGroupSchema.parse(renamed.json()).name).toBe('Family work');

    // Renaming to itself is not a clash with itself.
    const same = await harness.app.inject({
      method: 'PATCH',
      url: `/api/patient-groups/${group.id}`,
      payload: { name: 'Family work' },
    });
    expect(same.statusCode).toBe(200);
  });

  it('refuses a rename onto another group, and a rename of a group that is gone', async () => {
    await makeGroup('Family therapy');
    const second = await makeGroup('Court-mandated');

    const clash = await harness.app.inject({
      method: 'PATCH',
      url: `/api/patient-groups/${second.id}`,
      payload: { name: 'family therapy' },
    });
    expect(clash.statusCode).toBe(409);

    const missing = await harness.app.inject({
      method: 'PATCH',
      url: '/api/patient-groups/0198c0f0-0000-7000-8000-00000000ffff',
      payload: { name: 'Anything' },
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json<{ message: string }>().message).toBe('Group not found');
  });
});

describe('filing a patient under a group', () => {
  it('carries group_id on the patient, and null until she moves them', async () => {
    const patient = await seedPatient(harness.app, 'John Smith');

    expect(PatientSchema.parse(patient).group_id).toBeNull();

    const group = await makeGroup('Family therapy');
    const moved = await harness.app.inject({
      method: 'PATCH',
      url: `/api/patients/${patient.id}`,
      payload: { group_id: group.id },
    });

    expect(moved.statusCode).toBe(200);
    expect(PatientSchema.parse(moved.json()).group_id).toBe(group.id);
  });

  it('puts them back out with null, which is a state and not a rejection', async () => {
    const patient = await seedPatient(harness.app, 'John Smith');
    const group = await makeGroup('Family therapy');
    await harness.app.inject({
      method: 'PATCH',
      url: `/api/patients/${patient.id}`,
      payload: { group_id: group.id },
    });

    const cleared = await harness.app.inject({
      method: 'PATCH',
      url: `/api/patients/${patient.id}`,
      payload: { group_id: null },
    });

    expect(cleared.statusCode).toBe(200);
    expect(PatientSchema.parse(cleared.json()).group_id).toBeNull();
  });

  it('refuses a group that does not exist, and leaves the patient where they were', async () => {
    const patient = await seedPatient(harness.app, 'John Smith');

    const response = await harness.app.inject({
      method: 'PATCH',
      url: `/api/patients/${patient.id}`,
      payload: { group_id: '0198c0f0-0000-7000-8000-00000000ffff' },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json<{ message: string }>().message).toBe('Group not found');
    const row = harness.db.prepare('SELECT group_id FROM patients WHERE id = ?').get(patient.id) as {
      group_id: string | null;
    };
    expect(row.group_id).toBeNull();
  });

  it('leaves the group alone when the patch is about something else', async () => {
    const patient = await seedPatient(harness.app, 'John Smith');
    const group = await makeGroup('Family therapy');
    await harness.app.inject({
      method: 'PATCH',
      url: `/api/patients/${patient.id}`,
      payload: { group_id: group.id },
    });

    const renamed = await harness.app.inject({
      method: 'PATCH',
      url: `/api/patients/${patient.id}`,
      payload: { name: 'John A. Smith' },
    });

    expect(PatientSchema.parse(renamed.json())).toMatchObject({
      name: 'John A. Smith',
      group_id: group.id,
    });
  });
});

/**
 * Where a group sits among the others (owner, 2026-09-27), at the routes.
 *
 * The rule that matters is the quiet one: **a group nobody has dragged goes
 * last**, not first. `ORDER BY position` in SQLite sorts NULLs first, so the
 * obvious query would put every never-moved group at the top of her sidebar the
 * day the column is added — the newest group above the one she made first. The
 * `position IS NULL` term in the ORDER BY is what stops that, and this is the
 * test that would notice if it were dropped.
 */
describe('the order of her groups', () => {
  async function createGroup(name: string): Promise<PatientGroup> {
    const created = await harness.app.inject({
      method: 'POST',
      url: '/api/patient-groups',
      payload: { name },
    });
    return PatientGroupSchema.parse(created.json());
  }

  async function listNames(): Promise<string[]> {
    const listed = await harness.app.inject({ method: 'GET', url: '/api/patient-groups' });
    return PatientGroupListResponseSchema.parse(listed.json()).groups.map((group) => group.name);
  }

  it('lists a group she has never moved after the ones she has', async () => {
    const first = await createGroup('Family therapy');
    const second = await createGroup('Court-mandated');
    expect(await listNames()).toEqual(['Family therapy', 'Court-mandated']);

    // The first is dragged to the top, and it was already there, so the *new*
    // one has to still be below it.
    await harness.app.inject({
      method: 'PATCH',
      url: `/api/patient-groups/${first.id}`,
      payload: { position: 0 },
    });
    expect(await listNames()).toEqual(['Family therapy', 'Court-mandated']);

    // And a group made today, which has no position at all, lands at the end
    // rather than jumping the queue.
    const third = await createGroup('New intake');
    expect(await listNames()).toEqual(['Family therapy', 'Court-mandated', 'New intake']);
    expect(second.position).toBeNull();
    expect(third.position).toBeNull();
  });

  it('moves a group above another one, and the order survives a reload', async () => {
    const second = await createGroup('Court-mandated');
    await createGroup('Family therapy');
    await createGroup('New intake');

    await harness.app.inject({
      method: 'PATCH',
      url: `/api/patient-groups/${second.id}`,
      payload: { position: 0 },
    });

    expect(await listNames()).toEqual(['Court-mandated', 'Family therapy', 'New intake']);

    // Read it back from the database rather than from the list we just built,
    // because the client is what has to be able to trust this on the next load.
    const reread = await harness.app.inject({ method: 'GET', url: '/api/patient-groups' });
    expect(PatientGroupListResponseSchema.parse(reread.json()).groups.map((group) => group.name)).toEqual([
      'Court-mandated',
      'Family therapy',
      'New intake',
    ]);
  });

  it('renames without moving, and moves without renaming', async () => {
    const first = await createGroup('Family therapy');
    const second = await createGroup('Court-mandated');

    const renamed = await harness.app.inject({
      method: 'PATCH',
      url: `/api/patient-groups/${first.id}`,
      payload: { name: 'Families' },
    });
    expect(PatientGroupSchema.parse(renamed.json())).toMatchObject({ name: 'Families', position: null });

    // The move sends no name, and a rename that sent no name would otherwise be
    // rejected for having an empty one — the two are separate fields because
    // they are separate things she does.
    const moved = await harness.app.inject({
      method: 'PATCH',
      url: `/api/patient-groups/${second.id}`,
      payload: { position: 5 },
    });
    expect(PatientGroupSchema.parse(moved.json())).toMatchObject({ name: 'Court-mandated', position: 5 });
  });
});

/**
 * The dragged order inside groups (owner, 2026-09-27). One call writes whole
 * groups 0..n in a transaction, because a reorder written row by row could tie
 * with the order it replaced — the dropped row took the number of the row it
 * was dropped on, the two tied, and nothing visibly moved.
 */
describe('/api/patient-group-order', () => {
  async function listed(): Promise<
    { name: string; group_id: string | null; group_position: number | null }[]
  > {
    const response = await harness.app.inject({ method: 'GET', url: '/api/patients?include_archived=1' });
    return (
      response.json() as {
        patients: { name: string; group_id: string | null; group_position: number | null }[];
      }
    ).patients;
  }

  async function file(patientId: string, groupId: string, position: number | null): Promise<void> {
    const response = await harness.app.inject({
      method: 'PATCH',
      url: `/api/patients/${patientId}`,
      payload: { group_id: groupId, group_position: position },
    });
    expect(response.statusCode).toBe(200);
  }

  it('writes the listed order 0..n, so the moved row cannot tie with the one it passed', async () => {
    const group = await makeGroup('Court-mandated');
    const john = await seedPatient(harness.app, 'John Smith');
    const ana = await seedPatient(harness.app, 'Ana Torres');
    await file(john.id, group.id, 0);
    await file(ana.id, group.id, 1);

    const response = await harness.app.inject({
      method: 'PUT',
      url: '/api/patient-group-order',
      payload: { groups: [{ id: group.id, patient_ids: [ana.id, john.id] }] },
    });

    expect(response.statusCode).toBe(204);
    const rows = await listed();
    expect(rows.find((row) => row.name === 'Ana Torres')?.group_position).toBe(0);
    expect(rows.find((row) => row.name === 'John Smith')?.group_position).toBe(1);
  });

  it('keeps members she did not list, after the listed ones', async () => {
    const group = await makeGroup('Family therapy');
    const john = await seedPatient(harness.app, 'John Smith');
    const ana = await seedPatient(harness.app, 'Ana Torres');
    const maria = await seedPatient(harness.app, 'Maria Ruiz');
    await file(john.id, group.id, 0);
    await file(ana.id, group.id, 1);
    // Maria is in a group too but was hidden (archived, filtered) when she dragged.
    await file(maria.id, group.id, 2);

    await harness.app.inject({
      method: 'PUT',
      url: '/api/patient-group-order',
      payload: { groups: [{ id: group.id, patient_ids: [ana.id, john.id] }] },
    });

    const rows = await listed();
    expect(rows.find((row) => row.name === 'Maria Ruiz')).toMatchObject({
      group_id: group.id,
      group_position: 2,
    });
  });

  it('files a listed patient under the group, and writes nothing when a group does not exist', async () => {
    const group = await makeGroup('Family therapy');
    const john = await seedPatient(harness.app, 'John Smith');

    const missing = await harness.app.inject({
      method: 'PUT',
      url: '/api/patient-group-order',
      payload: {
        groups: [
          { id: group.id, patient_ids: [john.id] },
          { id: '0198c0f0-0000-7000-8000-00000000ffff', patient_ids: [] },
        ],
      },
    });
    expect(missing.statusCode).toBe(404);
    expect((await listed()).find((row) => row.name === 'John Smith')?.group_id).toBeNull();

    const ok = await harness.app.inject({
      method: 'PUT',
      url: '/api/patient-group-order',
      payload: { groups: [{ id: group.id, patient_ids: [john.id] }] },
    });
    expect(ok.statusCode).toBe(204);
    expect((await listed()).find((row) => row.name === 'John Smith')).toMatchObject({
      group_id: group.id,
      group_position: 0,
    });
  });

  it('rejects a body that is not an order', async () => {
    const response = await harness.app.inject({
      method: 'PUT',
      url: '/api/patient-group-order',
      payload: { groups: [] },
    });
    expect(response.statusCode).toBe(400);
  });

  it('forgets every dragged order on DELETE, and leaves everyone in their group', async () => {
    const group = await makeGroup('Family therapy');
    const john = await seedPatient(harness.app, 'John Smith');
    await file(john.id, group.id, 0);

    const response = await harness.app.inject({ method: 'DELETE', url: '/api/patient-group-order' });

    expect(response.statusCode).toBe(204);
    expect((await listed()).find((row) => row.name === 'John Smith')).toMatchObject({
      group_id: group.id,
      group_position: null,
    });
  });
});
