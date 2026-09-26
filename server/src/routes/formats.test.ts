import {
  NoteFormatListResponseSchema,
  NoteFormatSchema,
  STANDARD_PROGRESS_FORMAT,
  type NoteFormat,
} from '@apunta/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { OWNER_PROGRESS_INSTRUCTIONS } from '../ai/default-instructions.js';
import { createTestApp, seedFormat, seedNote, seedPatient, type TestApp } from '../test/harness.js';

let harness: TestApp;

beforeEach(async () => {
  harness = await createTestApp();
});

afterEach(async () => {
  await harness.close();
});

describe('POST /api/formats/standard', () => {
  it('creates the owner’s progress note with her sections and her instructions', async () => {
    const response = await harness.app.inject({ method: 'POST', url: '/api/formats/standard' });

    expect(response.statusCode).toBe(201);
    const format = NoteFormatSchema.parse(response.json());
    expect(format).toMatchObject({
      name: 'Progress note',
      sections: [
        'Location',
        'Client presentation',
        'Risk review',
        'Discussion',
        'Intervention',
        'Out of session actions',
        'Note for next session',
      ],
      source: 'manual',
    });
    expect(format.sections).toEqual([...STANDARD_PROGRESS_FORMAT.sections]);
    expect(format.instructions).toBe(OWNER_PROGRESS_INSTRUCTIONS);

    const list = NoteFormatListResponseSchema.parse(
      (await harness.app.inject({ method: 'GET', url: '/api/formats' })).json(),
    );
    expect(list.formats.map((f) => f.id)).toEqual([format.id]);
  });
});

describe('POST /api/formats', () => {
  it('creates a format, defaulting source to manual and instructions to empty', async () => {
    const response = await harness.app.inject({
      method: 'POST',
      url: '/api/formats',
      payload: { name: 'Progress note', sections: ['Subjective', 'Objective', 'Assessment', 'Plan'] },
    });

    expect(response.statusCode).toBe(201);
    expect(NoteFormatSchema.parse(response.json())).toMatchObject({
      name: 'Progress note',
      sections: ['Subjective', 'Objective', 'Assessment', 'Plan'],
      source: 'manual',
      instructions: '',
    });
  });

  it('keeps the detected source and instructions when given', async () => {
    const response = await harness.app.inject({
      method: 'POST',
      url: '/api/formats',
      payload: {
        name: 'Intake note',
        sections: ['Presenting problem', 'Plan'],
        source: 'template',
        instructions: 'Write in the third person.',
      },
    });

    expect(response.json<NoteFormat>()).toMatchObject({
      source: 'template',
      instructions: 'Write in the third person.',
    });
  });

  it('400s an empty section list, duplicate sections and an unknown source', async () => {
    const cases = [
      { name: 'No sections', sections: [] },
      { name: 'Dupes', sections: ['Plan', 'plan'] },
      { name: 'Bad source', sections: ['Plan'], source: 'imported' },
      { name: '', sections: ['Plan'] },
    ];

    for (const payload of cases) {
      const response = await harness.app.inject({ method: 'POST', url: '/api/formats', payload });
      expect(response.statusCode).toBe(400);
    }
  });
});

describe('GET /api/formats', () => {
  it('lists formats in creation order', async () => {
    await seedFormat(harness.app, { name: 'Progress note' });
    await seedFormat(harness.app, { name: 'Intake note', sections: ['Presenting problem', 'Plan'] });

    const response = await harness.app.inject({ method: 'GET', url: '/api/formats' });

    const { formats } = NoteFormatListResponseSchema.parse(response.json());
    expect(formats.map((f) => f.name)).toEqual(['Progress note', 'Intake note']);
  });

  it('starts empty, which is what triggers first-run onboarding', async () => {
    const response = await harness.app.inject({ method: 'GET', url: '/api/formats' });

    expect(response.json<{ formats: NoteFormat[] }>().formats).toEqual([]);
  });
});

describe('GET/PATCH /api/formats/:id', () => {
  it('renames sections and stores instructions', async () => {
    const format = await seedFormat(harness.app);

    const response = await harness.app.inject({
      method: 'PATCH',
      url: `/api/formats/${format.id}`,
      payload: { sections: ['Subjective', 'Plan'], instructions: 'Keep it under 200 words.' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<NoteFormat>()).toMatchObject({
      sections: ['Subjective', 'Plan'],
      instructions: 'Keep it under 200 words.',
    });

    const reread = await harness.app.inject({ method: 'GET', url: `/api/formats/${format.id}` });
    expect(reread.json<NoteFormat>().sections).toEqual(['Subjective', 'Plan']);
  });

  it('lets a format with existing notes change its sections', async () => {
    const format = await seedFormat(harness.app);
    const patient = await seedPatient(harness.app);
    await seedNote(harness.app, patient.id, format.id);

    const response = await harness.app.inject({
      method: 'PATCH',
      url: `/api/formats/${format.id}`,
      payload: { sections: ['Subjective', 'Plan'] },
    });

    expect(response.statusCode).toBe(200);
  });

  it('400s an empty patch and 404s an unknown id', async () => {
    const format = await seedFormat(harness.app);

    const empty = await harness.app.inject({
      method: 'PATCH',
      url: `/api/formats/${format.id}`,
      payload: {},
    });
    expect(empty.statusCode).toBe(400);

    const missing = await harness.app.inject({ method: 'GET', url: '/api/formats/nope' });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toMatchObject({ error: 'not_found', message: 'Note format not found' });
  });
});

/**
 * C-LANG@1 rule 3's data side. A format's language is written when it is created
 * and changed when she changes it; nothing else about the format moves, and no
 * section name is ever relabelled.
 */
describe('a format’s locale', () => {
  it('is English on every format the app creates without being told otherwise', async () => {
    const manual = await harness.app.inject({
      method: 'POST',
      url: '/api/formats',
      payload: { name: 'Progress note', sections: ['Subjective', 'Plan'] },
    });
    expect(NoteFormatSchema.parse(manual.json()).locale).toBe('en');

    // The one-click standard format is still English in this card: S5.1 is the
    // card that makes it take a locale and creates the Spanish ones.
    const standard = await harness.app.inject({ method: 'POST', url: '/api/formats/standard' });
    expect(NoteFormatSchema.parse(standard.json()).locale).toBe('en');

    const { formats } = NoteFormatListResponseSchema.parse(
      (await harness.app.inject({ method: 'GET', url: '/api/formats' })).json(),
    );
    expect(formats.map((format) => format.locale)).toEqual(['en', 'en']);
  });

  it('is Spanish when the client names es-MX at creation', async () => {
    const response = await harness.app.inject({
      method: 'POST',
      url: '/api/formats',
      payload: {
        name: 'Nota de progreso',
        sections: ['Lugar', 'Temas tratados'],
        locale: 'es-MX',
      },
    });

    expect(response.statusCode).toBe(201);
    // The section names are stored exactly as given — a locale is not a
    // translation, and nothing here rewrites them.
    expect(NoteFormatSchema.parse(response.json())).toMatchObject({
      name: 'Nota de progreso',
      sections: ['Lugar', 'Temas tratados'],
      locale: 'es-MX',
    });
  });

  it('changes through PATCH, and a PATCH that names no locale leaves it alone', async () => {
    const format = await seedFormat(harness.app);

    const renamed = await harness.app.inject({
      method: 'PATCH',
      url: `/api/formats/${format.id}`,
      payload: { name: 'Fictional renamed format' },
    });
    expect(renamed.json<NoteFormat>().locale).toBe('en');

    const changed = await harness.app.inject({
      method: 'PATCH',
      url: `/api/formats/${format.id}`,
      payload: { locale: 'es-MX' },
    });
    expect(changed.statusCode).toBe(200);
    expect(changed.json<NoteFormat>()).toMatchObject({ locale: 'es-MX', name: 'Fictional renamed format' });

    // Written, not just answered: it survives a read.
    const reread = await harness.app.inject({ method: 'GET', url: `/api/formats/${format.id}` });
    expect(reread.json<NoteFormat>().locale).toBe('es-MX');
  });

  it('400s a locale that is neither en nor es-MX', async () => {
    const created = await harness.app.inject({
      method: 'POST',
      url: '/api/formats',
      payload: { name: 'Progress note', sections: ['Plan'], locale: 'de' },
    });
    expect(created.statusCode).toBe(400);

    const format = await seedFormat(harness.app);
    const patched = await harness.app.inject({
      method: 'PATCH',
      url: `/api/formats/${format.id}`,
      payload: { locale: 'es-ES' },
    });
    expect(patched.statusCode).toBe(400);
  });
});

describe('DELETE /api/formats/:id', () => {
  it('deletes an unused format', async () => {
    const format = await seedFormat(harness.app);

    const response = await harness.app.inject({ method: 'DELETE', url: `/api/formats/${format.id}` });

    expect(response.statusCode).toBe(204);
    expect(
      (await harness.app.inject({ method: 'GET', url: '/api/formats' })).json<{ formats: NoteFormat[] }>()
        .formats,
    ).toEqual([]);
  });

  it('409s while notes still use it, rather than orphaning them', async () => {
    const format = await seedFormat(harness.app);
    const patient = await seedPatient(harness.app);
    await seedNote(harness.app, patient.id, format.id);

    const response = await harness.app.inject({ method: 'DELETE', url: `/api/formats/${format.id}` });

    expect(response.statusCode).toBe(409);
    expect(response.json<{ message: string }>().message).toMatch(/used by 1 note/);
  });

  it('404s an unknown id', async () => {
    const response = await harness.app.inject({ method: 'DELETE', url: '/api/formats/nope' });

    expect(response.statusCode).toBe(404);
  });
});
