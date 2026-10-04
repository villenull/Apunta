import {
  CreatePatientRequestSchema,
  UpdatePatientRequestSchema,
  type Patient,
  type PatientListResponse,
} from '@apunta/shared';
import type { Database } from 'better-sqlite3';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { audioDirFor, collectAudioFilenames, removeAudioFiles } from '../audio/retention.js';
import { getPatientGroup } from '../db/patientGroups.js';
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
  if (!patient) throw notFound('errors.not_found.patient');
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

  /**
   * Archiving is `{ archived: true }` here rather than a separate endpoint, and
   * filing a patient under a group is `{ group_id }` on the same call: both are
   * one nullable column, and both are undone by sending the other value.
   *
   * The group is checked here so a typo or a deleted group is a 404 she can
   * read rather than a foreign-key failure; the constraint itself is the
   * backstop, and `ON DELETE SET NULL` means it can never strand a patient.
   */
  app.patch('/api/patients/:id', async (request): Promise<Patient> => {
    const { id } = parseParams(IdParamsSchema, request.params);
    const patch = parseBody(UpdatePatientRequestSchema, request.body);
    requirePatient(db, id);
    if (patch.group_id != null && getPatientGroup(db, patch.group_id) === undefined) {
      throw notFound('errors.not_found.group');
    }

    const updated = updatePatient(db, id, {
      ...(patch.name === undefined ? {} : { name: patch.name }),
      ...(patch.identifier === undefined ? {} : { identifier: patch.identifier }),
      ...(patch.archived === undefined ? {} : { archived: patch.archived }),
      ...(patch.group_id === undefined ? {} : { groupId: patch.group_id }),
      ...(patch.group_position === undefined ? {} : { groupPosition: patch.group_position }),
    });
    if (!updated) throw notFound('errors.not_found.patient');
    return updated;
  });

  /**
   * Cascades: the patient's notes, their transcripts and their refine and
   * brainstorm chat go too, along with every kept recording those transcripts
   * point at.
   */
  app.delete('/api/patients/:id', async (request, reply) => {
    const { id } = parseParams(IdParamsSchema, request.params);
    // Read the recordings before the cascade removes the rows that name them.
    const filenames = collectAudioFilenames(db, { kind: 'patient', id });
    if (!deletePatient(db, id)) throw notFound('errors.not_found.patient');
    // As for a note: the delete stands, and a file left behind is logged as a
    // count only — never by a name that is opaque, possibly sensitive data.
    const removal = await removeAudioFiles(audioDirFor(db), filenames);
    if (removal.failed > 0 || removal.rejected > 0) {
      request.log.warn(
        { failed: removal.failed, rejected: removal.rejected },
        'kept audio could not be removed after patient delete',
      );
    }
    return reply.code(204).send();
  });
}
