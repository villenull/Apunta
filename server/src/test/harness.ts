import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { NoteFormat, Note, Patient } from '@patience/shared';
import type { FastifyInstance } from 'fastify';

import { buildApp } from '../app.js';
import { loadConfig, type AppConfig } from '../config.js';
import { openDatabase, type Database } from '../db/index.js';

/**
 * Integration-test harness. Every suite gets its own temp `PATIENCE_DATA_DIR`,
 * so tests exercise a real SQLite file and real migrations without ever going
 * near the user's actual data directory.
 */
export interface TestApp {
  readonly app: FastifyInstance;
  readonly config: AppConfig;
  readonly dataDir: string;
  readonly db: Database;
  close(): Promise<void>;
}

export async function createTestApp(): Promise<TestApp> {
  const dataDir = mkdtempSync(join(tmpdir(), 'patience-test-'));
  const config = loadConfig({
    PATIENCE_PORT: '0',
    PATIENCE_DATA_DIR: dataDir,
    PATIENCE_FAKE_AI: '1',
  });

  // The suite drives the same database the app does, so a test can assert on
  // rows (cascades especially) that no endpoint exposes.
  const { db } = openDatabase({ file: config.dbFile, migrationsDir: config.migrationsDir });
  const app = await buildApp({ config, db, logger: false });
  await app.ready();

  return {
    app,
    config,
    dataDir,
    db,
    async close() {
      await app.close();
      db.close();
      rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

/** Create a note format through the API and return it. */
export async function seedFormat(
  app: FastifyInstance,
  overrides: Partial<{ name: string; sections: string[] }> = {},
): Promise<NoteFormat> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/formats',
    payload: {
      name: overrides.name ?? 'Progress note',
      sections: overrides.sections ?? ['Subjective', 'Objective', 'Assessment', 'Plan'],
    },
  });
  return response.json<NoteFormat>();
}

/** Create a patient through the API and return it. */
export async function seedPatient(app: FastifyInstance, name = 'John Smith'): Promise<Patient> {
  const response = await app.inject({ method: 'POST', url: '/api/patients', payload: { name } });
  return response.json<Patient>();
}

/** Create a note through the API and return it. */
export async function seedNote(
  app: FastifyInstance,
  patientId: string,
  formatId: string,
  content = 'Subjective: Sample body.',
): Promise<Note> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/notes',
    payload: { patient_id: patientId, format_id: formatId, content },
  });
  return response.json<Note>();
}
