import { z } from 'zod';

/** Machine-readable error codes the API returns. */
export const ApiErrorCodeSchema = z.enum([
  'bad_request',
  'not_found',
  'conflict',
  // C-REQ@1's request guard. Reachable from the client only when a request
  // fails the guard, which is logged server-side; the body the guard sends is
  // the contract's `{ "error": { "code": "forbidden_request" } }` and is not
  // an `ApiErrorSchema`.
  'forbidden_request',
  'storage_error',
  'stale_write',
  'ai_unavailable',
  // C-LANG@1 rule 1: `PUT /api/settings { "language": "es-MX" }` when the
  // Language control is hidden. A 400, because the request asked for something
  // this build does not offer rather than for something that conflicts.
  'language_unavailable',
  // C-SNAP@1 rule 3: a backup was already running and the second request waited
  // its 60 s. A 409 — the request was fine, it lost the wait.
  'backup_in_progress',
  'internal_error',
]);
export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;

/**
 * Every non-2xx JSON body has this shape: a stable `error` code for the client
 * to branch on and a `message` that is safe to show the user.
 */
export const ApiErrorSchema = z.object({
  error: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;
