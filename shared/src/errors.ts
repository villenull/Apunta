import { z } from 'zod';

/** Machine-readable error codes the API returns. */
export const ApiErrorCodeSchema = z.enum([
  'bad_request',
  'not_found',
  'conflict',
  'ai_unavailable',
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
