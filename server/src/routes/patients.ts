import {
  CreatePatientRequestSchema,
  UpdatePatientRequestSchema,
  type Patient,
  type PatientListResponse,
} from '@apunta/shared';
import type { Database } from 'better-sqlite3';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { createPatient, deletePatient, getPatient, listPatients, updatePatient } from '../db/patients.js';
import { notFound } from '../http/errors.js';
import {
  BooleanQueryFlagSchema,
  IdParamsSchema,
  parseBody,
  parseParams,
  parseQuery,
} from '../http/validate.js';

const ListQuerySchema = z.object({ include_archived: BooleanQueryFlagSchema });

export function requirePatient(db: Database, id: string): Patient {
  const patient = getPatient(db, id);
  if (!patient) throw notFound('Patient not found');
  return patient;
}

export function registerPatientRoutes(app: FastifyInstance, db: Database): void {
  /** Archived patients are hidden unless `?include_archived=1`. */
  app.get('/api/patients', async (request): Promise<PatientListResponse> => {
    const { include_archived } = parseQuery(ListQuerySchema, request.query);
    return { patients: listPatients(db, { includeArchived: include_archived }) };
  });

  app.post('/api/patients', async (request, reply): Promise<Patient> => {
    const input = parseBody(CreatePatientRequestSchema, request.body);
    const patient = createPatient(db, { name: input.name, identifier: input.identifier ?? null });
    reply.code(201);
    return patient;
  });

  app.get('/api/patients/:id', async (request): Promise<Patient> => {
    const { id } = parseParams(IdParamsSchema, request.params);
    return requirePatient(db, id);
  });

  /** Archiving is `{ archived: true }` here rather than a separate endpoint. */
  app.patch('/api/patients/:id', async (request): Promise<Patient> => {
    const { id } = parseParams(IdParamsSchema, request.params);
    const patch = parseBody(UpdatePatientRequestSchema, request.body);
    requirePatient(db, id);

    const updated = updatePatient(db, id, {
      ...(patch.name === undefined ? {} : { name: patch.name }),
      ...(patch.identifier === undefined ? {} : { identifier: patch.identifier }),
      ...(patch.archived === undefined ? {} : { archived: patch.archived }),
    });
    if (!updated) throw notFound('Patient not found');
    return updated;
  });

  /** Cascades: the patient's notes, their transcripts and their chat go too. */
  app.delete('/api/patients/:id', async (request, reply) => {
    const { id } = parseParams(IdParamsSchema, request.params);
    if (!deletePatient(db, id)) throw notFound('Patient not found');
    return reply.code(204).send();
  });
}
