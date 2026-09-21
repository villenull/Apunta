import { z } from 'zod';

import { boundedText, IdSchema, TimestampSchema } from './common.js';

/** A person the practice keeps notes about. `docs/PLAN.md` §3. */
export const PatientSchema = z.object({
  id: IdSchema,
  name: z.string(),
  identifier: z.string().nullable(),
  created_at: TimestampSchema,
  archived_at: TimestampSchema.nullable(),
  /**
   * Created by the Claude import from a conversation title rather than a name
   * she gave: shown as "name guessed — check" until she saves a name for them.
   */
  name_guessed: z.boolean().optional(),
});
export type Patient = z.infer<typeof PatientSchema>;

/** List rows carry the note count the workspace sidebar shows. */
export const PatientListItemSchema = PatientSchema.extend({
  note_count: z.number().int().nonnegative(),
});
export type PatientListItem = z.infer<typeof PatientListItemSchema>;

export const PatientListResponseSchema = z.object({
  patients: z.array(PatientListItemSchema),
});
export type PatientListResponse = z.infer<typeof PatientListResponseSchema>;

export const CreatePatientRequestSchema = z.object({
  name: boundedText(200),
  identifier: boundedText(200).nullish(),
});
export type CreatePatientRequest = z.infer<typeof CreatePatientRequestSchema>;

/**
 * Archiving is a PATCH (`archived: true`) rather than its own endpoint —
 * it is one nullable column, and un-archiving is the same call.
 */
export const UpdatePatientRequestSchema = z
  .object({
    name: boundedText(200).optional(),
    identifier: boundedText(200).nullish(),
    archived: z.boolean().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Provide at least one field to update',
  });
export type UpdatePatientRequest = z.infer<typeof UpdatePatientRequestSchema>;
