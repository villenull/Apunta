/**
 * Versioned, closed vocabulary metadata for local drafting guidance.
 *
 * These names are routing/checklist vocabulary only. They are not findings,
 * treatment recommendations, patient text, or excerpts from reference files.
 */
export const CLINICAL_GUIDANCE_VERSION = '2026-09-07.1';

export const PRESENTATION_MSE_DOMAINS = [
  'appearance/behaviour',
  'speech',
  'mood',
  'affect',
  'perception',
  'thought process',
  'thought content',
  'cognition/sensorium',
  'insight/judgment',
] as const;

export const INTERVENTION_MODALITIES = [
  'EMDR',
  'CBT',
  'CBT for children',
  'ACT',
  'Solution-focused/Narrative Therapy',
  'Psychodynamic therapy',
  'DBT-C',
  'Behavioral therapy',
  'DBT',
] as const;

export type PresentationMseDomainName = (typeof PRESENTATION_MSE_DOMAINS)[number];
export type InterventionModality = (typeof INTERVENTION_MODALITIES)[number];
