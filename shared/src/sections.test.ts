import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  buildRefineSchema,
  buildSectionsSchema,
  DetectedFormatSchema,
  detectedFormatJsonSchema,
  emptySectionNames,
  MAX_SECTION_CHARS,
  refineJsonSchema,
  sectionsJsonSchema,
  sectionsToText,
  textToSections,
  type Sections,
} from './sections.js';

const SOAP = ['Subjective', 'Objective', 'Assessment', 'Plan'] as const;

describe('buildSectionsSchema', () => {
  it('requires exactly the format sections', () => {
    const schema = buildSectionsSchema(SOAP);
    expect(schema.safeParse({ Subjective: 'a', Objective: 'b', Assessment: 'c', Plan: 'd' }).success).toBe(
      true,
    );
    expect(schema.safeParse({ Subjective: 'a', Objective: 'b', Assessment: 'c' }).success).toBe(false);
  });

  /**
   * The fingerprint of a grammar that was never applied (ollama#17871 returns
   * `{"thought": …}` from a schema-constrained call). It has to fail here,
   * because nothing upstream will tell us.
   */
  it('rejects an extra key', () => {
    const schema = buildSectionsSchema(SOAP);
    const parsed = schema.safeParse({
      Subjective: 'a',
      Objective: 'b',
      Assessment: 'c',
      Plan: 'd',
      thought: 'The user has provided…',
    });
    expect(parsed.success).toBe(false);
  });

  /** The owner chose a blank section; nothing downstream may assume non-empty. */
  it('accepts an empty section body', () => {
    const schema = buildSectionsSchema(SOAP);
    expect(schema.safeParse({ Subjective: 'a', Objective: '', Assessment: 'c', Plan: 'd' }).success).toBe(
      true,
    );
  });

  it('rejects a body past the ceiling, and a non-string body', () => {
    const schema = buildSectionsSchema(['Plan']);
    expect(schema.safeParse({ Plan: 'x'.repeat(MAX_SECTION_CHARS + 1) }).success).toBe(false);
    expect(schema.safeParse({ Plan: 42 }).success).toBe(false);
  });

  it('handles a section name with a quote or a colon in it', () => {
    const odd = ['Risk: "safety" review'];
    const schema = buildSectionsSchema(odd);
    expect(schema.safeParse({ 'Risk: "safety" review': 'none discussed' }).success).toBe(true);
  });
});

describe('sectionsJsonSchema', () => {
  it('is the object Ollama takes as `format`', () => {
    expect(sectionsJsonSchema(SOAP)).toEqual({
      type: 'object',
      properties: {
        Subjective: { type: 'string' },
        Objective: { type: 'string' },
        Assessment: { type: 'string' },
        Plan: { type: 'string' },
      },
      required: ['Subjective', 'Objective', 'Assessment', 'Plan'],
      additionalProperties: false,
    });
  });

  /**
   * Drift guard. The hand-built schema is what goes on the wire (see the note
   * in `sections.ts`), but it must still describe the same shape zod enforces.
   * `$schema` is stripped because `toJSONSchema` always injects it, and
   * `maxLength` because we deliberately do not send a grammar-level length cap
   * — it would let a degenerate generation close the JSON and look valid.
   */
  it('describes the same shape as the zod schema', () => {
    const derived = z.toJSONSchema(buildSectionsSchema(SOAP)) as Record<string, unknown> & {
      properties: Record<string, Record<string, unknown>>;
    };
    delete derived['$schema'];
    for (const property of Object.values(derived.properties)) delete property['maxLength'];
    expect(derived).toEqual(sectionsJsonSchema(SOAP));
  });

  it('carries no minLength, so a blank section is grammatical', () => {
    const schema = sectionsJsonSchema(SOAP);
    for (const property of Object.values(schema.properties)) {
      expect(property).not.toHaveProperty('minLength');
    }
  });
});

describe('buildRefineSchema', () => {
  it('accepts a reply that leaves the note alone', () => {
    const schema = buildRefineSchema(SOAP);
    expect(schema.safeParse({ reply: 'That detail is not in the note.', updatedSections: null }).success).toBe(
      true,
    );
  });

  it('accepts a reply that rewrites every section', () => {
    const schema = buildRefineSchema(SOAP);
    const parsed = schema.safeParse({
      reply: 'Shortened the Plan section.',
      updatedSections: { Subjective: 'a', Objective: '', Assessment: 'c', Plan: 'd' },
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects a missing updatedSections key', () => {
    const schema = buildRefineSchema(SOAP);
    expect(schema.safeParse({ reply: 'ok' }).success).toBe(false);
  });

  it('inlines the null branch rather than emitting a $ref', () => {
    const json = JSON.stringify(refineJsonSchema(SOAP));
    expect(json).not.toContain('$ref');
    expect(json).not.toContain('$defs');
    expect(refineJsonSchema(SOAP).required).toEqual(['reply', 'updatedSections']);
  });
});

describe('DetectedFormatSchema', () => {
  it('accepts a detected format and rejects an empty section list', () => {
    expect(DetectedFormatSchema.safeParse({ name: 'Progress note', sections: ['Plan'] }).success).toBe(true);
    expect(DetectedFormatSchema.safeParse({ name: 'Progress note', sections: [] }).success).toBe(false);
  });

  it('has a JSON schema that bounds the section list', () => {
    expect(detectedFormatJsonSchema().properties['sections']).toEqual({
      type: 'array',
      items: { type: 'string', minLength: 1 },
      minItems: 1,
      maxItems: 40,
    });
  });
});

describe('sectionsToText', () => {
  it('writes `Section: body` paragraphs in format order', () => {
    const text = sectionsToText(
      { Plan: 'Continue weekly.', Subjective: 'Sleeping better.', Objective: 'Engaged.', Assessment: 'Good.' },
      SOAP,
    );
    expect(text).toBe(
      'Subjective: Sleeping better.\n\nObjective: Engaged.\n\nAssessment: Good.\n\nPlan: Continue weekly.',
    );
  });

  /** Blanks travel: she fills them in on the far side, in the other system. */
  it('keeps the header of an empty section, with no trailing space', () => {
    const text = sectionsToText({ Subjective: 'Sleeping better.', Objective: '   ' }, [
      'Subjective',
      'Objective',
    ]);
    expect(text).toBe('Subjective: Sleeping better.\n\nObjective:');
  });

  it('treats a section the model omitted as empty', () => {
    expect(sectionsToText({}, ['Plan'])).toBe('Plan:');
  });
});

describe('textToSections', () => {
  it('splits on the format’s own section names', () => {
    const text = 'Subjective: Sleeping better.\n\nPlan: Continue weekly sessions.';
    expect(textToSections(text, ['Subjective', 'Plan'])).toEqual({
      Subjective: 'Sleeping better.',
      Plan: 'Continue weekly sessions.',
    });
  });

  /** A body may legitimately say "Plan: continue weekly" mid-sentence. */
  it('does not split on a colon inside a body', () => {
    const text = 'Subjective: She said: the week was hard.\n\nPlan: Continue weekly.';
    expect(textToSections(text, ['Subjective', 'Plan'])['Subjective']).toBe(
      'She said: the week was hard.',
    );
  });

  it('keeps a multi-line body together', () => {
    const text = 'Plan: Continue weekly.\nAdd grounding exercises.';
    expect(textToSections(text, ['Plan'])['Plan']).toBe('Continue weekly.\nAdd grounding exercises.');
  });

  it('reports a section the text never mentions as empty', () => {
    expect(textToSections('Plan: Continue weekly.', ['Subjective', 'Plan'])).toEqual({
      Subjective: '',
      Plan: 'Continue weekly.',
    });
  });

  /** Nothing the therapist typed may disappear on a round trip. */
  it('folds text above the first header into the first section', () => {
    const parsed = textToSections('A stray opening line.\n\nPlan: Continue weekly.', ['Subjective', 'Plan']);
    expect(parsed['Subjective']).toBe('A stray opening line.');
    expect(parsed['Plan']).toBe('Continue weekly.');
  });

  it('matches a header case-insensitively', () => {
    expect(textToSections('plan: Continue weekly.', ['Plan'])['Plan']).toBe('Continue weekly.');
  });
});

describe('round trip', () => {
  const bodies = [
    'Sleeping better.',
    '',
    'She said: the week was hard.\nStill attending the group.',
    'Continue weekly — introduce grounding exercises.',
    'Possibly propranolol [unclear in dictation].',
  ];

  /**
   * The property the whole contract rests on: what the editor shows parses
   * back into the object the model produced.
   */
  it('survives sectionsToText → textToSections for every body shape', () => {
    for (const a of bodies) {
      for (const b of bodies) {
        const sections: Sections = { Subjective: a, Plan: b };
        const order = ['Subjective', 'Plan'];
        expect(textToSections(sectionsToText(sections, order), order)).toEqual(sections);
      }
    }
  });

  it('survives a section name containing a colon', () => {
    const order = ['Risk review', 'Plan'];
    const sections: Sections = { 'Risk review': 'Not discussed.', Plan: 'Weekly.' };
    expect(textToSections(sectionsToText(sections, order), order)).toEqual(sections);
  });
});

describe('emptySectionNames', () => {
  it('lists the blanks in format order', () => {
    expect(emptySectionNames({ Subjective: 'a', Objective: '', Assessment: '  ', Plan: 'd' }, SOAP)).toEqual([
      'Objective',
      'Assessment',
    ]);
  });
});
