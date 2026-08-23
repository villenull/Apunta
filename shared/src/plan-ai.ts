import { z } from 'zod';

import { IdSchema, optionalText, TimestampSchema } from './common.js';
import { GenerateErrorEventSchema } from './generate.js';
import { PlanGoalSchema } from './plan.js';
import type { JsonSchemaObject } from './sections.js';

/**
 * The LLM output shapes for M9's two AI paths, and the SSE events that carry
 * their results.
 *
 * Both paths are **two-stage**, and that is not an optimisation. Ollama
 * truncates an over-long prompt from the head, dropping the system prompt and
 * keeping the material (`docs/research/m3-preflight-2026-08.md`), so feeding
 * six whole notes into one call would silently produce exactly the confident
 * invention this project exists to prevent. So: each note is summarised in its
 * own call into a small structured object, and the second stage sees only
 * those objects. Every call stays far inside the window and
 * `prompt_eval_count` is checked on each one.
 *
 * Two structural guarantees live in these schemas rather than in a prompt:
 *
 * 1. **No diagnosis field, anywhere in what the model writes.** An ICD-10 code
 *    from a model is billing-consequential invention. `strictObject` rejects
 *    the key outright, and a test asserts it.
 * 2. **The model cannot invent a citation.** It cites evidence by *index* into
 *    the excerpts the server offered it, and those excerpts were themselves
 *    verified as literal substrings of the note. A goal whose citations do not
 *    resolve is dropped rather than shown.
 */

/** Bounds on what one summarising call may return. Small on purpose. */
export const MAX_SUMMARY_POINTS = 6;
export const MAX_SUMMARY_EXCERPTS = 4;
export const MAX_SUMMARY_POINT_CHARS = 400;
export const MAX_SUMMARY_EXCERPT_CHARS = 500;

/**
 * One note, reduced.
 *
 * `points` are short factual lines. `excerpts` are copied out verbatim, which
 * is what makes them checkable: the server verifies each one is a literal
 * substring of the note and discards the ones that are not.
 */
export const NoteSummarySchema = z.strictObject({
  points: z.array(optionalText(MAX_SUMMARY_POINT_CHARS)).max(MAX_SUMMARY_POINTS),
  excerpts: z.array(optionalText(MAX_SUMMARY_EXCERPT_CHARS)).max(MAX_SUMMARY_EXCERPTS),
});
export type NoteSummary = z.infer<typeof NoteSummarySchema>;

/**
 * Array bounds are stated in the JSON Schema, unlike string lengths.
 *
 * `sections.ts` explains why a `maxLength` on a string is harmful: the grammar
 * closes the string at the cap, turning an obviously-broken generation into a
 * valid-looking one. `maxItems` does not have that problem — an array that
 * closes early holds fewer *complete* items, not a truncated sentence — and it
 * is what keeps the second stage's input bounded by construction.
 */
export function noteSummaryJsonSchema(): JsonSchemaObject {
  return {
    type: 'object',
    properties: {
      points: { type: 'array', items: { type: 'string' }, maxItems: MAX_SUMMARY_POINTS },
      excerpts: { type: 'array', items: { type: 'string' }, maxItems: MAX_SUMMARY_EXCERPTS },
    },
    required: ['points', 'excerpts'],
    additionalProperties: false,
  };
}

export const MAX_SUGGESTED_GOALS = 6;
export const MAX_SUGGESTED_OBJECTIVES = 4;
export const MAX_SUGGESTED_INTERVENTIONS = 4;
export const MAX_SUGGESTED_EVIDENCE = 3;

/**
 * A citation: "the excerpt at `excerpt` from the note at `note`".
 *
 * Indices, not text, so the quoted evidence that reaches the therapist is the
 * excerpt the server already verified rather than something the model retyped
 * from memory.
 */
export const SuggestedEvidenceSchema = z.strictObject({
  note: z.number().int().nonnegative(),
  excerpt: z.number().int().nonnegative(),
});
export type SuggestedEvidence = z.infer<typeof SuggestedEvidenceSchema>;

/**
 * A suggested objective. No `target_value`, no `target_date`, and no way to
 * add them: the note can supply a baseline but never a target, so those are
 * left blank for her rather than invented (research §3.4). A fabricated "50%"
 * is the most plausible-looking failure this feature can produce.
 */
export const SuggestedObjectiveSchema = z.strictObject({
  statement: optionalText(600),
  measure: optionalText(300),
  baseline: optionalText(300),
});
export type SuggestedObjective = z.infer<typeof SuggestedObjectiveSchema>;

export const SuggestedGoalSchema = z.strictObject({
  statement: optionalText(2000),
  objectives: z.array(SuggestedObjectiveSchema).max(MAX_SUGGESTED_OBJECTIVES),
  interventions: z.array(optionalText(600)).max(MAX_SUGGESTED_INTERVENTIONS),
  evidence: z.array(SuggestedEvidenceSchema).max(MAX_SUGGESTED_EVIDENCE),
});
export type SuggestedGoal = z.infer<typeof SuggestedGoalSchema>;

/**
 * What a plan-drafting call returns.
 *
 * **There is no diagnosis field here, and there must never be one.** The
 * diagnosis is typed by the therapist and passed to the model as *input*; it
 * is the anchor the goals are drafted toward, not an output the model gets to
 * choose (research §3.3, `docs/decisions.md` 2026-08-23).
 */
export const PlanSuggestionSchema = z.strictObject({
  goals: z.array(SuggestedGoalSchema).max(MAX_SUGGESTED_GOALS),
});
export type PlanSuggestion = z.infer<typeof PlanSuggestionSchema>;

export function planSuggestionJsonSchema(): JsonSchemaObject {
  return {
    type: 'object',
    properties: {
      goals: {
        type: 'array',
        maxItems: MAX_SUGGESTED_GOALS,
        items: {
          type: 'object',
          properties: {
            statement: { type: 'string' },
            objectives: {
              type: 'array',
              maxItems: MAX_SUGGESTED_OBJECTIVES,
              items: {
                type: 'object',
                properties: {
                  statement: { type: 'string' },
                  measure: { type: 'string' },
                  baseline: { type: 'string' },
                },
                required: ['statement', 'measure', 'baseline'],
                additionalProperties: false,
              },
            },
            interventions: {
              type: 'array',
              maxItems: MAX_SUGGESTED_INTERVENTIONS,
              items: { type: 'string' },
            },
            evidence: {
              type: 'array',
              maxItems: MAX_SUGGESTED_EVIDENCE,
              items: {
                type: 'object',
                properties: {
                  note: { type: 'integer', minimum: 0 },
                  excerpt: { type: 'integer', minimum: 0 },
                },
                required: ['note', 'excerpt'],
                additionalProperties: false,
              },
            },
          },
          required: ['statement', 'objectives', 'interventions', 'evidence'],
          additionalProperties: false,
        },
      },
    },
    required: ['goals'],
    additionalProperties: false,
  };
}

export const MAX_BRIEF_LINES = 12;
export const MAX_BRIEF_LINE_CHARS = 600;

/** One line of a briefing, tied to the note it came from by index. */
export const ComposedBriefLineSchema = z.strictObject({
  note: z.number().int().nonnegative(),
  text: optionalText(MAX_BRIEF_LINE_CHARS),
});
export type ComposedBriefLine = z.infer<typeof ComposedBriefLineSchema>;

/**
 * What the briefing call returns.
 *
 * Every line names exactly one source note, because the reading view puts a
 * date on every line and makes it clickable through to that note. There is no
 * un-attributed field to write an overview into, which is deliberate: an
 * overview is where a summary of "how treatment is going" would appear, and
 * that is the analysis the owner declined.
 */
export const BriefCompositionSchema = z.strictObject({
  lines: z.array(ComposedBriefLineSchema).max(MAX_BRIEF_LINES),
});
export type BriefComposition = z.infer<typeof BriefCompositionSchema>;

export function briefCompositionJsonSchema(): JsonSchemaObject {
  return {
    type: 'object',
    properties: {
      lines: {
        type: 'array',
        maxItems: MAX_BRIEF_LINES,
        items: {
          type: 'object',
          properties: { note: { type: 'integer', minimum: 0 }, text: { type: 'string' } },
          required: ['note', 'text'],
          additionalProperties: false,
        },
      },
    },
    required: ['lines'],
    additionalProperties: false,
  };
}

/** A briefing line as it reaches the browser: resolved, dated, clickable. */
export const BriefLineSchema = z.strictObject({
  note_id: IdSchema,
  note_date: TimestampSchema,
  note_title: z.string(),
  text: z.string(),
});
export type BriefLine = z.infer<typeof BriefLineSchema>;

/**
 * How far back prep read, stated plainly rather than implied.
 *
 * `cap` is the lookback setting, `notes_read` what was actually there, and
 * `skipped` the notes a stage could not read (one too long for its own call,
 * say). Saying so is the difference between a briefing that read everything
 * and one that quietly read half.
 */
export const BriefLookbackSchema = z.strictObject({
  cap: z.number().int().positive(),
  notes_read: z.number().int().nonnegative(),
  oldest_note_date: TimestampSchema.nullable(),
  newest_note_date: TimestampSchema.nullable(),
  skipped_note_ids: z.array(IdSchema),
});
export type BriefLookback = z.infer<typeof BriefLookbackSchema>;

/** `session_briefs.content` — what a saved briefing holds. */
export const SessionBriefContentSchema = z.strictObject({
  lines: z.array(BriefLineSchema).max(MAX_BRIEF_LINES),
  lookback: BriefLookbackSchema,
});
export type SessionBriefContent = z.infer<typeof SessionBriefContentSchema>;

export const SessionBriefSchema = z.object({
  id: IdSchema,
  patient_id: IdSchema,
  generated_at: TimestampSchema,
  content: SessionBriefContentSchema,
  source_note_ids: z.array(IdSchema),
  saved: z.boolean(),
  created_at: TimestampSchema,
});
export type SessionBrief = z.infer<typeof SessionBriefSchema>;

/**
 * `POST /api/patients/:id/prep/save` — the brief she chose to keep.
 *
 * The browser posts back the briefing it was given, because nothing was
 * persisted while it streamed: a prep briefing is ephemeral by default (owner
 * decision 3), so there is no server-side row to promote.
 */
export const SaveBriefRequestSchema = z.object({
  generated_at: TimestampSchema,
  content: SessionBriefContentSchema,
});
export type SaveBriefRequest = z.infer<typeof SaveBriefRequestSchema>;

export const SessionBriefListResponseSchema = z.object({
  briefs: z.array(SessionBriefSchema),
});
export type SessionBriefListResponse = z.infer<typeof SessionBriefListResponseSchema>;

/**
 * What the server is doing, for the two multi-call endpoints.
 *
 * Distinct from `GenerateStage`: these paths make one call per note before
 * they make the one that matters, and "Reading note 2 of 5" is the honest
 * description of the wait.
 */
export const PlanStageSchema = z.enum(['connecting', 'reading-notes', 'drafting', 'saving']);
export type PlanStage = z.infer<typeof PlanStageSchema>;

export const PlanStatusEventSchema = z.object({
  stage: PlanStageSchema,
  message: z.string(),
});
export type PlanStatusEvent = z.infer<typeof PlanStatusEventSchema>;

/**
 * SSE event names on `POST /api/patients/:id/plan/suggest`.
 *
 * The unit of streaming is a goal, not a token: a goal can only be offered
 * once its citations have been resolved against the notes, so a half-written
 * statement is not something there is any honest way to show.
 */
export const SUGGEST_EVENT_NAMES = ['status', 'goal', 'done', 'error'] as const;
export type SuggestEventName = (typeof SUGGEST_EVENT_NAMES)[number];

/** One proposed goal, already persisted with `status: 'proposed'`. */
export const SuggestGoalEventSchema = z.object({
  goal: PlanGoalSchema,
});
export type SuggestGoalEvent = z.infer<typeof SuggestGoalEventSchema>;

export const SuggestDoneEventSchema = z.object({
  goals: z.array(PlanGoalSchema),
  /** How far back it read, and what it could not read. */
  lookback: BriefLookbackSchema,
  /** Goals the model offered that carried no resolvable citation. */
  dropped: z.number().int().nonnegative(),
});
export type SuggestDoneEvent = z.infer<typeof SuggestDoneEventSchema>;

/** SSE event names on `POST /api/patients/:id/prep`. */
export const PREP_EVENT_NAMES = ['status', 'line', 'brief', 'error'] as const;
export type PrepEventName = (typeof PREP_EVENT_NAMES)[number];

export const PrepLineEventSchema = z.object({
  line: BriefLineSchema,
});
export type PrepLineEvent = z.infer<typeof PrepLineEventSchema>;

/** The finished briefing. Nothing is persisted unless she keeps it. */
export const PrepBriefEventSchema = z.object({
  generated_at: TimestampSchema,
  content: SessionBriefContentSchema,
});
export type PrepBriefEvent = z.infer<typeof PrepBriefEventSchema>;

/** Same failure vocabulary as every other AI path. */
export const PlanErrorEventSchema = GenerateErrorEventSchema;
export type PlanErrorEvent = z.infer<typeof PlanErrorEventSchema>;
