import {
  PatientListResponseSchema,
  PatientSchema,
  type CreatePatientRequest,
  type Patient,
  type PatientListItem,
  type UpdatePatientRequest,
} from '@apunta/shared';

import { requestJson, requestVoid } from './client.js';

export async function listPatients(signal?: AbortSignal): Promise<PatientListItem[]> {
  const { patients } = await requestJson(
    '/api/patients',
    PatientListResponseSchema,
    signal ? { signal } : {},
  );
  return patients;
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
