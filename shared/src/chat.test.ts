import { describe, expect, it } from 'vitest';

import { ChatRequestSchema, ChatTokenEventSchema, FIRST_PASS_MESSAGE, PUBLISHED_REFUSAL } from './chat.js';

describe('ChatRequestSchema', () => {
  it('accepts a message on its own — the highlight is optional', () => {
    const parsed = ChatRequestSchema.safeParse({ message: 'Make the plan shorter' });
    expect(parsed.success).toBe(true);
    expect(parsed.data?.ref_quote).toBeUndefined();
  });

  it('accepts a highlighted excerpt alongside it, and an explicit null', () => {
    expect(
      ChatRequestSchema.safeParse({ message: 'Tighten this', ref_quote: 'Plan: Continue weekly sessions.' })
        .success,
    ).toBe(true);
    expect(ChatRequestSchema.safeParse({ message: 'Tighten this', ref_quote: null }).success).toBe(true);
  });

  it('rejects an empty message: there is nothing to ask the model', () => {
    expect(ChatRequestSchema.safeParse({ message: '' }).success).toBe(false);
    expect(ChatRequestSchema.safeParse({ message: '   ' }).success).toBe(false);
  });

  it('trims the message, so a stray newline from the composer is not a turn', () => {
    expect(ChatRequestSchema.parse({ message: '  Make it shorter\n' }).message).toBe('Make it shorter');
  });
});

describe('ChatTokenEventSchema', () => {
  it('carries decoded reply text and no section name', () => {
    expect(ChatTokenEventSchema.parse({ text: 'Shortened ' })).toEqual({ text: 'Shortened ' });
  });
});

describe('the prototype copy', () => {
  it('refuses a published note in the prototype’s own words', () => {
    expect(PUBLISHED_REFUSAL).toContain('This note is published, so I won’t change it.');
    expect(PUBLISHED_REFUSAL).toContain('“Published (click to edit)”');
  });

  it('opens the thread with the prototype’s first-pass line', () => {
    expect(FIRST_PASS_MESSAGE).toContain("Here's a first pass based on your dictation.");
    expect(FIRST_PASS_MESSAGE).toContain('Highlight any part of the note to point me right at it.');
  });
});
