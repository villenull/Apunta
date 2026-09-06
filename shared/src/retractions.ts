import { z } from 'zod';

import type { JsonSchemaObject } from './sections.js';

/**
 * Spoken retractions, applied before drafting.
 *
 * A therapist dictating says "four hours a night — scratch that, six" and
 * expects a note that says six. The instructions say so, a reminder beside the
 * source says so, and on the 4B the draft still read *"four hours, which he
 * later corrected to six"* — the retracted figure kept, and the correction
 * pinned on the patient. Measured three times on live dictations; a fourth
 * wording was tried and not shipped (`docs/eval-reports/2026-09-05-retraction-user-turn.md`).
 *
 * So the retraction is applied to the transcript itself, before the drafting
 * model sees it — and applied by the *server*, never by the model. The model
 * is asked one narrow question first: quote the exact words she took back.
 * The server deletes a quote only when it is verbatim in the transcript and
 * ends right before a spoken marker, one per marker, nearest wins; everything
 * else the model lists is ignored. A rewrite by the model was measured first
 * and rejected: asked to apply the corrections, it deleted the words "scratch
 * that" and kept the retracted claim, on seven dictations out of seven.
 */

/** One correction as the model reports it: what she took back, and what she said instead. */
export const RetractionCorrectionSchema = z.object({
  withdrawn: z.string(),
  replacement: z.string(),
});
export type RetractionCorrection = z.infer<typeof RetractionCorrectionSchema>;

export const RetractionCorrectionsSchema = z.object({
  corrections: z.array(RetractionCorrectionSchema).max(40),
});
export type RetractionCorrections = z.infer<typeof RetractionCorrectionsSchema>;

/** Ollama's `format` for the quoting call. Never shown to the model; the prompt restates it. */
export function retractionCorrectionsJsonSchema(): JsonSchemaObject {
  return {
    type: 'object',
    properties: {
      corrections: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            withdrawn: { type: 'string' },
            replacement: { type: 'string' },
          },
          required: ['withdrawn', 'replacement'],
          additionalProperties: false,
        },
        maxItems: 40,
      },
    },
    required: ['corrections'],
    additionalProperties: false,
  };
}

/**
 * One retraction the server actually applied. Both strings are slices of the
 * transcript as transcribed, never the model's quote — `replacement` is empty
 * when what she said instead could not be found verbatim after the marker.
 */
export interface AppliedRetraction {
  readonly withdrawn: string;
  readonly replacement: string;
}

/**
 * A quote counts only if it ends this close to the marker, in words. The
 * model lists things she never took back — the risk statement, the homework —
 * and on seven live dictations every one of those sat further back than this
 * while every true retraction sat at zero to ten.
 */
export const MAX_RETRACTION_GAP_WORDS = 12;

/** Longer than this is a paragraph, not a retracted claim. */
export const MAX_WITHDRAWN_WORDS = 40;
