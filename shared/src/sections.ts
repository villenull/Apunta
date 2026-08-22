import { z } from 'zod';

/**
 * The sections contract (PLAN §3, "Note content contract").
 *
 * Generation and refinement always round-trip through a sections object —
 * `{ "<Section name>": "<body>", … }`, one key per format section, in format
 * order — which is serialized to editor text as `Section: body` paragraphs
 * separated by blank lines, exactly the prototype's note style.
 *
 * **A section body may be empty.** The practice owner chose a blank section
 * over the fixed sentence the instructions originally emitted
 * (`docs/feedback/2026-08-22-owner-answers.md`, design question 5), so
 * "every section is non-empty" is not a property anything downstream may
 * assume. The header still travels — `sectionsToText` writes `Objective:` for
 * an empty body — because the note is pasted into another records system and
 * she fills the blank in on the far side.
 */

/** A section body long enough for any real note, short enough to bound memory. */
export const MAX_SECTION_CHARS = 20_000;

/** One body per section name, in the format's order. */
export type Sections = Record<string, string>;

/**
 * The zod schema a model's parsed output is re-validated against.
 *
 * `strictObject`, not `object`: it always emits `additionalProperties: false`
 * when converted to JSON Schema, whereas a plain object emits it only for the
 * output direction. The guarantee is the whole point here — an extra key in
 * the response is the fingerprint of a grammar that was never applied
 * (ollama#17871), so it has to fail rather than be tolerated.
 *
 * No `.min(1)`: see the empty-section note above. No `.trim()` either — a
 * transform-free schema keeps the zod → JSON Schema mapping boring, and
 * trimming belongs in the serializer.
 */
export function buildSectionsSchema(sections: readonly string[]): z.ZodType<Sections> {
  const shape: Record<string, z.ZodString> = {};
  for (const name of sections) shape[name] = z.string().max(MAX_SECTION_CHARS);
  return z.strictObject(shape) as unknown as z.ZodType<Sections>;
}

/** A JSON Schema object, as Ollama's `format` parameter takes it. */
export interface JsonSchemaObject {
  readonly type: 'object';
  readonly properties: Readonly<Record<string, unknown>>;
  readonly required: readonly string[];
  readonly additionalProperties: false;
}

/**
 * The JSON Schema sent as Ollama's `format`, built by hand rather than derived
 * with `z.toJSONSchema`.
 *
 * Three reasons: `toJSONSchema` injects a `$schema` key that is noise in a
 * payload we want to be able to eyeball; it emits `$defs`/`$ref` for any
 * reused sub-schema, and llama.cpp's converter has broken nested `$ref`s and
 * skips what it does not support *silently*; and six explicit lines are what
 * we want to see in a snapshot test.
 *
 * Deliberately **no `maxLength`**. A grammar-level length cap makes the model
 * close the JSON at the cap, turning an obviously-broken degenerate generation
 * into a valid-looking one. Output length is bounded by `num_predict`, where
 * it surfaces honestly as `done_reason: "length"`; the zod schema above still
 * carries `MAX_SECTION_CHARS` as the server-side ceiling.
 */
export function sectionsJsonSchema(sections: readonly string[]): JsonSchemaObject {
  return {
    type: 'object',
    properties: Object.fromEntries(sections.map((name) => [name, { type: 'string' }])),
    required: [...sections],
    additionalProperties: false,
  };
}

/**
 * `refineNote`'s output (PLAN §5): the model may answer a question without
 * touching the note, which is `updatedSections: null`.
 *
 * `updatedSections` is required **and** nullable rather than optional: a
 * grammar expresses "must be present, may be null" far more cleanly than "may
 * be absent", and it removes an ambiguity the server would otherwise guess at.
 */
export function buildRefineSchema(sections: readonly string[]): z.ZodType<RefineResult> {
  return z.strictObject({
    reply: z.string().max(MAX_SECTION_CHARS),
    updatedSections: buildSectionsSchema(sections).nullable(),
  }) as unknown as z.ZodType<RefineResult>;
}

export interface RefineResult {
  reply: string;
  updatedSections: Sections | null;
}

/** The `format` payload for a refine call. The null branch is inlined, not `$ref`ed. */
export function refineJsonSchema(sections: readonly string[]): JsonSchemaObject {
  return {
    type: 'object',
    properties: {
      reply: { type: 'string' },
      updatedSections: { anyOf: [sectionsJsonSchema(sections), { type: 'null' }] },
    },
    required: ['reply', 'updatedSections'],
    additionalProperties: false,
  };
}

/** `detectFormat`'s output (PLAN §4, used by M6). */
export const DetectedFormatSchema = z.strictObject({
  name: z.string().min(1).max(120),
  sections: z.array(z.string().min(1).max(120)).min(1).max(40),
});
export type DetectedFormat = z.infer<typeof DetectedFormatSchema>;

export function detectedFormatJsonSchema(): JsonSchemaObject {
  return {
    type: 'object',
    properties: {
      name: { type: 'string', minLength: 1 },
      sections: { type: 'array', items: { type: 'string', minLength: 1 }, minItems: 1, maxItems: 40 },
    },
    required: ['name', 'sections'],
    additionalProperties: false,
  };
}

/**
 * Sections → editor text. `Section: body` paragraphs, blank line between,
 * in the format's order. An empty body still gets its header, with no
 * trailing space.
 */
export function sectionsToText(sections: Sections, order: readonly string[]): string {
  return order
    .map((name) => {
      const body = (sections[name] ?? '').trim();
      return body === '' ? `${name}:` : `${name}: ${body}`;
    })
    .join('\n\n');
}

/**
 * Editor text → sections, best effort.
 *
 * Anchored on the format's own section names at the start of a line: a body
 * can legitimately contain "Plan: continue weekly", so a naive `/^(\w+):/`
 * split would shred the note. Text before the first recognised header is
 * folded into the first section rather than dropped — nothing the therapist
 * typed may disappear on a round trip.
 *
 * Every key in `order` is present in the result; an unmatched section is `''`.
 */
export function textToSections(text: string, order: readonly string[]): Sections {
  const result: Sections = {};
  for (const name of order) result[name] = '';
  if (order.length === 0) return result;

  const byLowerName = new Map(order.map((name) => [name.toLowerCase(), name]));
  const collected = new Map<string, string[]>();

  let current: string | null = null;
  const preamble: string[] = [];

  for (const line of text.split('\n')) {
    const header = matchHeader(line, byLowerName);
    if (header) {
      current = header.name;
      if (!collected.has(current)) collected.set(current, []);
      if (header.rest !== '') collected.get(current)?.push(header.rest);
      continue;
    }
    if (current === null) preamble.push(line);
    else collected.get(current)?.push(line);
  }

  for (const [name, lines] of collected) result[name] = lines.join('\n').trim();

  const leading = preamble.join('\n').trim();
  if (leading !== '') {
    const first = order[0] as string;
    result[first] = result[first] === '' ? leading : `${leading}\n\n${result[first] ?? ''}`;
  }
  return result;
}

/** `Subjective: body` at the start of a line, matched case-insensitively. */
function matchHeader(
  line: string,
  byLowerName: ReadonlyMap<string, string>,
): { name: string; rest: string } | null {
  const colon = line.indexOf(':');
  if (colon <= 0) return null;
  const name = byLowerName.get(line.slice(0, colon).trim().toLowerCase());
  if (name === undefined) return null;
  return { name, rest: line.slice(colon + 1).trim() };
}

/**
 * The sections with nothing in them, in format order.
 *
 * The owner's blanks are deliberate, so this drives an indicator rather than a
 * gate (`docs/decisions.md`, design question 11).
 */
export function emptySectionNames(sections: Sections, order: readonly string[]): string[] {
  return order.filter((name) => (sections[name] ?? '').trim() === '');
}
