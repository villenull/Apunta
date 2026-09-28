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
   * The group this patient is filed under, or null for "no group" — which is
   * where a patient is until she moves them, and where they return if she moves
   * them back (owner, 2026-09-27). At most one group: a named list, not a tag.
   */
  group_id: IdSchema.nullable(),
  /**
   * Where they sit in that group's order, as she dragged them. Null whenever
   * they are in no group, because Recents has its own ordering rules and a
   * position would say nothing (owner, 2026-09-27).
   */
  group_position: z.number().int().nonnegative().nullable(),
  /**
   * Created by the Claude import from a conversation title rather than a name
   * she gave: shown as "name guessed — check" until she saves a name for them.
   */
  name_guessed: z.boolean().optional(),
});
export type Patient = z.infer<typeof PatientSchema>;

/**
 * A named list patients can be filed under. Created from the "Move to group"
 * submenu, so the name is short and it is shown in a narrow menu.
 */
export const PatientGroupSchema = z.object({
  id: IdSchema,
  name: z.string(),
  created_at: TimestampSchema,
  /**
   * Where she dragged it among the others. Null for a group she has never moved,
   * which sorts last — so a group made today goes to the bottom without anyone
   * having to write a number for it (owner, 2026-09-27).
   */
  position: z.number().int().nullable(),
});
export type PatientGroup = z.infer<typeof PatientGroupSchema>;

export const PatientGroupListResponseSchema = z.object({
  groups: z.array(PatientGroupSchema),
});
export type PatientGroupListResponse = z.infer<typeof PatientGroupListResponseSchema>;

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
 * it is one nullable column, and un-archiving is the same call. Filing a patient
 * under a group is the same call for the same reason: `group_id: null` is how a
 * patient comes out of a group, which is a state she needs and not an undo.
 */
export const UpdatePatientRequestSchema = z
  .object({
    name: boundedText(200).optional(),
    identifier: boundedText(200).nullish(),
    archived: z.boolean().optional(),
    /** `null` takes the patient out of their group. */
    group_id: IdSchema.nullish(),
    /** Where they sit in that group's order; `null` leaves it to the group. */
    group_position: z.number().int().nonnegative().nullish(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Provide at least one field to update',
  });
export type UpdatePatientRequest = z.infer<typeof UpdatePatientRequestSchema>;

/**
 * A group name she typed. Trimmed and non-empty: a blank heading in the sidebar
 * is not a group, and the unique index behind it would make "" unrepresentable
 * twice over.
 */
const patientGroupName = boundedText(80).refine((value) => value.trim().length > 0, {
  message: 'A group needs a name',
});

export const CreatePatientGroupRequestSchema = z.object({ name: patientGroupName });
export type CreatePatientGroupRequest = z.infer<typeof CreatePatientGroupRequestSchema>;

export const UpdatePatientGroupRequestSchema = z
  .object({ name: patientGroupName.optional(), position: z.number().int().nullable().optional() })
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Provide at least one field to update',
  });
export type UpdatePatientGroupRequest = z.infer<typeof UpdatePatientGroupRequestSchema>;
