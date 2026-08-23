import { z } from 'zod';

import { SectionsSchema } from './note-format.js';

/**
 * Format onboarding from uploaded files (M6): `POST /api/formats/detect` and
 * `POST /api/formats/flatten-skill`.
 *
 * Both endpoints are multipart, so there is no request *body* schema — the
 * parts are validated field by field against the constants here. What is
 * schematised is the response, because that is what the browser parses.
 *
 * Nothing on these paths is persisted. An uploaded template or example note
 * lives in memory for exactly one request; only the `{name, sections}` the
 * therapist confirms on the next screen ever reaches the database.
 */

/** How the upload should be read. `manual` needs no file, so it is not here. */
export const DetectKindSchema = z.enum(['template', 'examples']);
export type DetectKind = z.infer<typeof DetectKindSchema>;

/** The packet's ceiling. Also the `@fastify/multipart` `fileSize` limit. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** The packet's "1–3 files". Also the multipart `files` limit. */
export const MAX_DETECT_FILES = 3;

/**
 * How much extracted text the detection prompt may carry, in characters.
 *
 * Ollama truncates an over-long prompt **from the head**, dropping the
 * instructions and keeping the material, and answering confidently with
 * neither. Three long example notes concatenated would reach that on their
 * own. `OllamaProvider.assertFits` refuses at 75% of `num_ctx` (~12,300
 * tokens), which turns the silent failure into an error — but an error is
 * still a dead end for someone whose notes are simply long.
 *
 * So the input is capped here instead, deliberately: 20,000 characters is
 * roughly 5,700 tokens at the project's chars÷3.5 estimate, which leaves the
 * system prompt and the answer a wide margin. Sections repeat throughout a
 * note, so the head of each file is the part that carries the structure —
 * every file gets an equal share of the budget and is cut at the tail, and
 * the response says so rather than pretending it read everything.
 */
export const MAX_DETECT_CHARS = 20_000;

/** Text shorter than this came out of a file that had nothing readable in it. */
export const MIN_EXTRACTED_CHARS = 12;

export const DetectFormatResponseSchema = z.strictObject({
  name: z.string().min(1).max(120),
  sections: SectionsSchema,
  /** How many files were read. Content-free, and the UI says it back. */
  files: z.number().int().min(1).max(MAX_DETECT_FILES),
  /** True when {@link MAX_DETECT_CHARS} cut a file short. */
  truncated: z.boolean(),
});
export type DetectFormatResponse = z.infer<typeof DetectFormatResponseSchema>;

/** What the mechanical flattener removed, so a silent rewrite is checkable. */
export const SkillFlattenCountsSchema = z.strictObject({
  frontmatter: z.boolean(),
  commandBlocks: z.number().int().min(0),
  toolLines: z.number().int().min(0),
  mechanics: z.number().int().min(0),
  emptiedHeadings: z.number().int().min(0),
});
export type SkillFlattenCounts = z.infer<typeof SkillFlattenCountsSchema>;

/** Longest `SKILL.md` we will read. `instructions` itself is capped at 50,000. */
export const MAX_SKILL_BYTES = 512 * 1024;

export const SkillFlattenResponseSchema = z.strictObject({
  /** The flattened body, for review in the textarea. Never saved by this call. */
  instructions: z.string().max(50_000),
  removed: SkillFlattenCountsSchema,
  /**
   * `references/…` paths the body still mentions. The flattener warns rather
   * than inlining them: choosing which part of a reference file is the needed
   * content is judgement, and a wrong inline blows the token budget
   * (`docs/skill-porting.md` step 3).
   */
  referencedFiles: z.array(z.string().max(200)).max(50),
  /** chars ÷ 3.5, the same estimate the prompt builder uses. */
  approxTokens: z.number().int().min(0),
});
export type SkillFlattenResponse = z.infer<typeof SkillFlattenResponseSchema>;

/**
 * Small models drift past roughly this much instruction text
 * (`docs/skill-porting.md` step 7). Shown as a meter, never enforced.
 */
export const SKILL_TOKEN_BUDGET = 5_000;
