import {
  PatientGroupListResponseSchema,
  PatientGroupSchema,
  type CreatePatientGroupRequest,
  type PatientGroup,
  type UpdatePatientGroupRequest,
} from '@apunta/shared';

import { requestJson } from './client.js';

/**
 * The named lists patients are filed under (owner, 2026-09-27). Created from
 * the "Move to group" submenu, so there is no list screen to navigate to and no
 * route to deep-link: the menu is the whole surface.
 */

export async function listPatientGroups(signal?: AbortSignal): Promise<PatientGroup[]> {
  const { groups } = await requestJson(
    '/api/patient-groups',
    PatientGroupListResponseSchema,
    signal ? { signal } : {},
  );
  return groups;
}

export async function createPatientGroup(input: CreatePatientGroupRequest): Promise<PatientGroup> {
  return requestJson('/api/patient-groups', PatientGroupSchema, {
    method: 'POST',
    body: input,
  });
}

/**
 * Rename, move, or both — the one PATCH (owner, 2026-09-27). Kept as a
 * separate function because the call sites say which of the two they mean, and a
 * name that could also mean "and move it" would be a trap.
 */
export async function updatePatientGroup(
  id: string,
  input: UpdatePatientGroupRequest,
): Promise<PatientGroup> {
  return requestJson(`/api/patient-groups/${id}`, PatientGroupSchema, {
    method: 'PATCH',
    body: input,
  });
}
