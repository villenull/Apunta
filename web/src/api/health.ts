import { HealthResponseSchema, type HealthResponse } from '@apunta/shared';

import { requestJson } from './client.js';

export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  return requestJson('/api/health', HealthResponseSchema, signal ? { signal } : {});
}
