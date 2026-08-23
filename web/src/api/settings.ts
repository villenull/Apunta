import { SettingsSchema, type Settings, type UpdateSettingsRequest } from '@apunta/shared';

import { requestJson } from './client.js';

/** `GET|PUT /api/settings` — a flat key → JSON store, merged on write. */

export async function getSettings(signal?: AbortSignal): Promise<Settings> {
  return requestJson('/api/settings', SettingsSchema, signal ? { signal } : {});
}

export async function putSettings(patch: UpdateSettingsRequest): Promise<Settings> {
  return requestJson('/api/settings', SettingsSchema, { method: 'PUT', body: patch });
}
