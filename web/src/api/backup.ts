import {
  BackupFolderListingSchema,
  BackupStatusResponseSchema,
  CreateBackupResponseSchema,
  RestoreBackupResponseSchema,
  SetBackupLocationResponseSchema,
  type BackupFolderListing,
  type BackupStatusResponse,
  type CreateBackupRequest,
  type CreateBackupResponse,
  type RestoreBackupRequest,
  type RestoreBackupResponse,
  type SetBackupLocationResponse,
} from '@apunta/shared';

import { requestJson, requestVoid } from './client.js';

/** Back up and restore (M7 deliverable 4). */
export async function fetchBackupStatus(signal?: AbortSignal): Promise<BackupStatusResponse> {
  return requestJson('/api/backup', BackupStatusResponseSchema, signal ? { signal } : {});
}

/**
 * One folder's subdirectories, for the folder picker.
 *
 * The path rides in the query string rather than a body because this is a
 * `GET`: it reads the filesystem and changes nothing, so repeating it is
 * safe, and the answer is naturally identified by its URL.
 */
export async function listBackupFolders(path?: string, signal?: AbortSignal): Promise<BackupFolderListing> {
  return requestJson(
    path === undefined ? '/api/backup/folders' : `/api/backup/folders?path=${encodeURIComponent(path)}`,
    BackupFolderListingSchema,
    signal ? { signal } : {},
  );
}

/**
 * Remember a folder as the destination.
 *
 * No archive is written: choosing where a backup goes and taking one are two
 * separate acts, and only the second one copies a practice. That separation is
 * what lets the picker be wandered around in without asking anything.
 */
export async function setBackupLocation(directory: string): Promise<SetBackupLocationResponse> {
  return requestJson('/api/backup/location', SetBackupLocationResponseSchema, {
    method: 'PUT',
    body: { directory },
  });
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
