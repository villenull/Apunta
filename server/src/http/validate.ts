import { z } from 'zod';

import { badRequest } from './errors.js';

/**
 * The zod schemas in `shared/` are the single source of truth for request
 * shapes, so validation is a `parse` at the top of a route rather than a
 * hand-written check or a duplicated JSON-Schema. Failures become 400s
 * carrying zod's issue list, which is enough for a client to point at a field.
 */
export function parseBody<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw badRequest('Request body is invalid', result.error.issues);
  }
  return result.data;
}

export function parseQuery<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw badRequest('Query string is invalid', result.error.issues);
  }
  return result.data;
}

export function parseParams<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw badRequest('Route parameters are invalid', result.error.issues);
  }
  return result.data;
}

/**
 * `?flag`, `?flag=1` and `?flag=true` all mean true; absent means false.
 * Anything else is a mistake worth a 400 rather than a silent `false`.
 */
export const BooleanQueryFlagSchema = z
  .union([z.literal(''), z.enum(['1', '0', 'true', 'false'])])
  .optional()
  .transform((value) => value === '' || value === '1' || value === 'true');

/** Every `:id` route param. Unknown ids are 404s, so the shape is all we check. */
export const IdParamsSchema = z.object({ id: z.string().min(1) });
export type IdParams = z.infer<typeof IdParamsSchema>;
