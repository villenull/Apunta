import {
  PatientListResponseSchema,
  PatientSchema,
  type CreatePatientRequest,
  type Patient,
  type PatientListItem,
  type UpdatePatientRequest,
} from '@apunta/shared';

import { requestJson, requestVoid } from './client.js';

/**
 * `includeArchived` is a query flag rather than a second endpoint: an archived
 * patient is still a patient, and the workspace hides them by default because
 * a list of everyone she has ever seen is not the list she works from.
 */
export async function listPatients(
  signal?: AbortSignal,
  includeArchived = false,
): Promise<PatientListItem[]> {
  const { patients } = await requestJson(
    includeArchived ? '/api/patients?include_archived=1' : '/api/patients',
    PatientListResponseSchema,
    signal ? { signal } : {},
  );
  return patients;
}

/** Archiving hides; it never deletes. Restoring is the same call inverted. */
export async function setPatientArchived(id: string, archived: boolean): Promise<Patient> {
  return requestJson(`/api/patients/${id}`, PatientSchema, { method: 'PATCH', body: { archived } });
}

export async function getPatient(id: string, signal?: AbortSignal): Promise<Patient> {
  return requestJson(`/api/patients/${id}`, PatientSchema, signal ? { signal } : {});
}

export async function createPatient(input: CreatePatientRequest): Promise<Patient> {
  return requestJson('/api/patients', PatientSchema, { method: 'POST', body: input });
}

export async function updatePatient(id: string, patch: UpdatePatientRequest): Promise<Patient> {
  return requestJson(`/api/patients/${id}`, PatientSchema, { method: 'PATCH', body: patch });
}

/** Cascades on the server: the patient's notes go with them. */
export async function deletePatient(id: string): Promise<void> {
  return requestVoid(`/api/patients/${id}`, { method: 'DELETE' });
}

/**
 * Filing a patient under a group, and taking them out again, is the same PATCH
 * the archive uses: `group_id` is one nullable column, and `null` is a state
 * she can put a patient back into rather than an undo.
 */
export async function setPatientGroup(id: string, groupId: string | null): Promise<Patient> {
  return requestJson(`/api/patients/${id}`, PatientSchema, {
    method: 'PATCH',
    body: { group_id: groupId },
  });
}
