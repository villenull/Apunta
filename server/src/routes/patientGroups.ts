import {
  CreatePatientGroupRequestSchema,
  UpdatePatientGroupRequestSchema,
  type PatientGroup,
  type PatientGroupListResponse,
} from '@apunta/shared';
import type { Database } from 'better-sqlite3';
import type { FastifyInstance } from 'fastify';

import {
  createPatientGroup,
  findPatientGroupByName,
  getPatientGroup,
  listPatientGroups,
  renamePatientGroup,
  setPatientGroupPosition,
} from '../db/patientGroups.js';
import { conflict, notFound } from '../http/errors.js';
import { IdParamsSchema, parseBody, parseParams } from '../http/validate.js';

/**
 * Patient groups: the named lists she files patients under from the "Move to
 * group" submenu (owner, 2026-09-27).
 *
 * Three routes, deliberately. There is no DELETE, because there is nowhere in
 * the UI to ask for one: she creates a group from the submenu and can rename it,
 * and a patient can always be moved out of it. An endpoint nothing can reach is
 * surface without a reason, so the absence is recorded in the handoff as a known
 * gap rather than filled in here.
 *
 * Names are checked before the insert so she gets a sentence rather than a
 * constraint error, and the unique index behind the check is what makes the
 * promise real under any interleaving.
 */
export function registerPatientGroupRoutes(app: FastifyInstance, db: Database): void {
  app.get('/api/patient-groups', async (): Promise<PatientGroupListResponse> => {
    return { groups: listPatientGroups(db) };
  });

  app.post('/api/patient-groups', async (request, reply): Promise<PatientGroup> => {
    const { name } = parseBody(CreatePatientGroupRequestSchema, request.body);
    const trimmed = name.trim();
    if (findPatientGroupByName(db, trimmed) !== undefined) {
      throw conflict('errors.conflict.group_name_taken');
    }
    const group = createPatientGroup(db, trimmed);
    reply.code(201);
    return group;
  });

  /**
   * Rename, move, or both. They share a call because they are one row and she
   * does one thing to it at a time, and separate endpoints would be a second
   * place for "the name was checked but the position wasn't".
   */
  app.patch('/api/patient-groups/:id', async (request): Promise<PatientGroup> => {
    const { id } = parseParams(IdParamsSchema, request.params);
    const { name, position } = parseBody(UpdatePatientGroupRequestSchema, request.body);
    if (getPatientGroup(db, id) === undefined) throw notFound('errors.not_found.group');

    if (name !== undefined) {
      const trimmed = name.trim();
      const clash = findPatientGroupByName(db, trimmed);
      if (clash !== undefined && clash.id !== id) throw conflict('errors.conflict.group_name_taken');
      const renamed = renamePatientGroup(db, id, trimmed);
      if (!renamed) throw notFound('errors.not_found.group');
    }
    if (position !== undefined) {
      const moved = setPatientGroupPosition(db, id, position);
      if (!moved) throw notFound('errors.not_found.group');
      return moved;
    }
    return getPatientGroup(db, id) as PatientGroup;
  });
}
