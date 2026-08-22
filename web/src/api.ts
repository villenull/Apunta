import { HealthResponseSchema, type HealthResponse } from '@patience/shared';

/**
 * All requests are same-origin relative paths: in production the Fastify server
 * serves this bundle, and in dev Vite proxies /api to 127.0.0.1:7717. Never
 * build an absolute URL to anything but loopback.
 */
export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const response = await fetch('/api/health', signal ? { signal } : {});
  if (!response.ok) {
    throw new Error(`Health check failed with HTTP ${String(response.status)}`);
  }
  return HealthResponseSchema.parse(await response.json());
}
