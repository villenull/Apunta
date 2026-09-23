import { z } from 'zod';

import { IdSchema } from './common.js';

/** Limits for practitioner exports. PDFs are held in memory for one request only. */
export const MAX_HALAXY_FILES = 20;
export const MAX_HALAXY_FILE_BYTES = 32 * 1024 * 1024;
export const MAX_HALAXY_TOTAL_BYTES = 256 * 1024 * 1024;

const IsoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use an ISO date like 2026-03-12.');

/** One session found in a patient's PDF. */
export const HalaxyPreviewNoteSchema = z.object({
  key: z.string().min(1),
  date: IsoDateSchema,
  title: z.string().min(1).optional(),
  text: z.string().min(1),
});
export type HalaxyPreviewNote = z.infer<typeof HalaxyPreviewNoteSchema>;

/** One active Apunta patient with the same normalized name as an export. */
export const HalaxyExistingPatientSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
});
export type HalaxyExistingPatient = z.infer<typeof HalaxyExistingPatientSchema>;

/** One accepted text-based PDF, ready for the review screen. */
export const HalaxyPreviewPatientSchema = z.object({
  fileName: z.string().min(1),
  patientName: z.string().min(1),
  existingPatients: z.array(HalaxyExistingPatientSchema),
  notes: z.array(HalaxyPreviewNoteSchema),
  warnings: z.array(z.string()),
});
export type HalaxyPreviewPatient = z.infer<typeof HalaxyPreviewPatientSchema>;

export const HalaxyPreviewResponseSchema = z.object({
  patients: z.array(HalaxyPreviewPatientSchema),
  rejected: z.array(z.object({ fileName: z.string().min(1), reason: z.string().min(1) })),
});
export type HalaxyPreviewResponse = z.infer<typeof HalaxyPreviewResponseSchema>;

/** The edited selection returned by the preview screen. */
export const HalaxyImportRequestSchema = z.object({
  patients: z.array(
    z.object({
      fileName: z.string().min(1),
      patientName: z.string().min(1),
      existingPatientId: IdSchema.nullable().optional(),
      notes: z.array(
        z.object({
          date: IsoDateSchema,
          title: z.string().min(1).optional(),
          text: z.string().min(1),
        }),
      ),
    }),
  ),
});
export type HalaxyImportRequest = z.infer<typeof HalaxyImportRequestSchema>;

/** Summary returned after one undoable import batch is written. */
export const HalaxyImportPatientSchema = z.object({
  fileName: z.string().min(1),
  patientName: z.string().min(1),
  patient_id: IdSchema,
  notes: z.number().int().nonnegative(),
});
export type HalaxyImportPatient = z.infer<typeof HalaxyImportPatientSchema>;

export const HalaxyImportResponseSchema = z.object({
  batch_id: IdSchema.nullable(),
  patients: z.array(HalaxyImportPatientSchema),
  notes: z.number().int().nonnegative(),
});
export type HalaxyImportResponse = z.infer<typeof HalaxyImportResponseSchema>;
