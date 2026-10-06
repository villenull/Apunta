import {
  RecoveryStatusSchema,
  UpdateStatusResponseSchema,
  type RecoveryStatus,
  type UpdateAction,
  type UpdateStatusResponse,
} from '@apunta/shared';

import { requestJson, requestVoid } from './client.js';

let browserMode = false;

/** Discover mode on a route available in every mode, without probing absent routes. */
export async function fetchAppMode(): Promise<'browser' | 'shell' | 'recovery'> {
  const response = await fetch('/api/app/quiesce/status');
  if (!response.ok) throw new Error('Unable to discover the application mode.');
  const mode = response.headers.get('x-apunta-mode');
  if (mode !== 'browser' && mode !== 'shell' && mode !== 'recovery') {
    throw new Error('The application mode could not be verified.');
  }
  browserMode = mode === 'browser';
  return mode;
}

/** Before bootstrap, only a read-only status probe is possible. */
export function updaterMayBeAvailable(): boolean {
  return !browserMode;
}

/**
 * The shell-only updater routes (C-BRIDGE@1 rule 3). In a plain browser tab
 * they answer 404, which callers read as "there is no updater here".
 */

export async function fetchUpdateStatus(signal?: AbortSignal): Promise<UpdateStatusResponse> {
  return requestJson('/api/app/update', UpdateStatusResponseSchema, signal ? { signal } : {});
}

export async function requestUpdateAction(action: UpdateAction): Promise<void> {
  await requestVoid(`/api/app/update/${action}`, { method: 'POST' });
}

export async function setAutoCheck(autoCheck: boolean): Promise<void> {
  await requestVoid('/api/app/update/settings', { method: 'PUT', body: { autoCheck } });
}

/** `GET /api/app/recovery` — answers only when the server booted into recovery mode. */
export async function fetchRecoveryStatus(signal?: AbortSignal): Promise<RecoveryStatus> {
  return requestJson('/api/app/recovery', RecoveryStatusSchema, signal ? { signal } : {});
}

export async function restoreSafetyCopy(): Promise<void> {
  await requestVoid('/api/app/recovery/restore', { method: 'POST' });
}

export async function reinstallPreviousVersion(): Promise<void> {
  await requestVoid('/api/app/recovery/reinstall-previous', { method: 'POST' });
}
