import { SetupStatusResponseSchema, type SetupAction, type SetupStatusResponse } from '@apunta/shared';

import { requestJson, requestVoid } from './client.js';

/**
 * First-run setup's shell-only routes. In a plain browser tab they answer 404,
 * which callers read as "there is no setup here": the developer's machine gets
 * its models another way.
 */
export async function fetchSetupStatus(signal?: AbortSignal): Promise<SetupStatusResponse> {
  return requestJson('/api/app/setup', SetupStatusResponseSchema, signal ? { signal } : {});
}

export async function requestSetupAction(action: SetupAction): Promise<void> {
  await requestVoid(`/api/app/setup/${action}`, { method: 'POST' });
}
