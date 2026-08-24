import {
  BackupStatusResponseSchema,
  CreateBackupResponseSchema,
  RestoreBackupResponseSchema,
  VerifiedRestoreResponseSchema,
  type BackupStatusResponse,
  type CreateBackupRequest,
  type CreateBackupResponse,
  type RestoreBackupRequest,
  type RestoreBackupResponse,
  type VerifiedRestoreResponse,
} from '@apunta/shared';

import { requestJson, requestVoid } from './client.js';

/** Back up and restore (M7 deliverable 4). */
export async function fetchBackupStatus(signal?: AbortSignal): Promise<BackupStatusResponse> {
  return requestJson('/api/backup', BackupStatusResponseSchema, signal ? { signal } : {});
}

export async function createBackup(input: CreateBackupRequest = {}): Promise<CreateBackupResponse> {
  return requestJson('/api/backup', CreateBackupResponseSchema, { method: 'POST', body: input });
}

export async function restoreBackup(input: RestoreBackupRequest): Promise<RestoreBackupResponse> {
  return requestJson('/api/backup/restore', RestoreBackupResponseSchema, { method: 'POST', body: input });
}

export async function cancelRestore(): Promise<void> {
  return requestVoid('/api/backup/restore', { method: 'DELETE' });
}

export async function markRestoreVerified(): Promise<VerifiedRestoreResponse> {
  return requestJson('/api/backup/verified', VerifiedRestoreResponseSchema, { method: 'POST' });
}
