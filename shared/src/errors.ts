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
  // C-LANG@1 rule 2's server-side half: a language change was refused because
  // a job or a save was in flight. A 409, and distinct from
  // `language_unavailable` on purpose — that one says this build does not offer
  // the language (a 400, the request asked for something impossible), this one
  // says the language exists and the moment is wrong (the request was fine, it
  // lost the wait). The client's own disabling is convenience; this is the
  // guard that holds when the client is stale, a second tab, or a direct call.
  'language_change_blocked',
  // C-SNAP@1 rule 3: a backup was already running and the second request waited
  // its 60 s. A 409 — the request was fine, it lost the wait.
  'backup_in_progress',
  // P5.4: an updater or close-decision request that arrived in a state that
  // cannot take it (a check while downloading, a close decision when no close
  // was refused). A 409, like `backup_in_progress`.
  'invalid_state',
  // C-UPD@1's Quiescence sentence: "The server enters maintenance mode: new
  // jobs and writes get 503 `maintenance`". A 503 — the request was fine and
  // the moment is wrong, like `backup_in_progress`, and the code is what the
  // client branches on to say "wait a moment" instead of "try again later"
  // (web/src/api/client.ts parses this body as an ordinary `ApiErrorSchema`).
  'maintenance',
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
