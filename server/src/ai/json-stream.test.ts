import { describe, expect, it } from 'vitest';

import { JsonStringStreamDecoder, stripCodeFence } from './json-stream.js';

/** Feed a document one character at a time — the worst case a token stream can be. */
function decodeByCharacter(json: string): { key: string; text: string }[] {
  const decoder = new JsonStringStreamDecoder();
  const deltas: { key: string; text: string }[] = [];
  for (const char of json) deltas.push(...decoder.push(char));
  return deltas;
}

/** What the UI would render from a stream: the deltas joined per key. */
function assemble(deltas: { key: string; text: string }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const delta of deltas) out[delta.key] = (out[delta.key] ?? '') + delta.text;
  return out;
}

describe('JsonStringStreamDecoder', () => {
  it('decodes top-level string values, character by character', () => {
    const json = JSON.stringify({ Subjective: 'Sleeping better.', Plan: 'Continue weekly.' });
    expect(assemble(decodeByCharacter(json))).toEqual({
      Subjective: 'Sleeping better.',
      Plan: 'Continue weekly.',
    });
  });

  it('gives the same answer however the chunks fall', () => {
    const json = JSON.stringify({ Subjective: 'Sleeping better.', Plan: 'Continue weekly.' });
    for (const size of [1, 2, 3, 5, 7, 13, 64]) {
      const decoder = new JsonStringStreamDecoder();
      const deltas: { key: string; text: string }[] = [];
      for (let at = 0; at < json.length; at += size) {
        deltas.push(...decoder.push(json.slice(at, at + size)));
      }
      expect(assemble(deltas), `chunk size ${String(size)}`).toEqual({
        Subjective: 'Sleeping better.',
        Plan: 'Continue weekly.',
      });
      expect(decoder.text).toBe(json);
    }
  });

  it('decodes escapes, including one split across two chunks', () => {
    const json = JSON.stringify({ Plan: 'She said "wait".\nThen: 50% \\ done é' });
    expect(assemble(decodeByCharacter(json))['Plan']).toBe('She said "wait".\nThen: 50% \\ done é');
  });

  it('emits nothing for an empty section', () => {
    const deltas = decodeByCharacter(JSON.stringify({ Subjective: 'A.', Objective: '', Plan: 'B.' }));
    expect(assemble(deltas)).toEqual({ Subjective: 'A.', Plan: 'B.' });
  });

  /** A colon inside a body must not be mistaken for the start of a value. */
  it('does not treat text inside a value as a key', () => {
    const json = JSON.stringify({ Subjective: 'She said: "Plan": nothing.', Plan: 'Weekly.' });
    expect(assemble(decodeByCharacter(json))).toEqual({
      Subjective: 'She said: "Plan": nothing.',
      Plan: 'Weekly.',
    });
  });

  /**
   * `refineNote` returns `{reply, updatedSections}`. Only `reply` is a
   * top-level string, and a half-written rewrite is not something to show.
   */
  it('streams only top-level strings, skipping a nested object', () => {
    const json = JSON.stringify({
      reply: 'Shortened the Plan section.',
      updatedSections: { Subjective: 'Sleeping better.', Plan: 'Weekly.' },
    });
    expect(assemble(decodeByCharacter(json))).toEqual({ reply: 'Shortened the Plan section.' });
  });

  it('skips strings inside an array', () => {
    const json = JSON.stringify({ name: 'Progress note', sections: ['Subjective', 'Plan'] });
    expect(assemble(decodeByCharacter(json))).toEqual({ name: 'Progress note' });
  });

  it('yields what it has when the document is cut off mid-string', () => {
    const decoder = new JsonStringStreamDecoder();
    const deltas = decoder.push('{"Subjective": "Sleeping bet');
    expect(assemble(deltas)).toEqual({ Subjective: 'Sleeping bet' });
  });

  it('handles a section name containing a quote', () => {
    const json = JSON.stringify({ 'Risk "review"': 'Not discussed.' });
    expect(assemble(decodeByCharacter(json))).toEqual({ 'Risk "review"': 'Not discussed.' });
  });
});

describe('stripCodeFence', () => {
  it('unwraps a fenced response and says that it was fenced', () => {
    const result = stripCodeFence('```json\n{"Plan": "Weekly."}\n```');
    expect(result).toEqual({ text: '{"Plan": "Weekly."}', fenced: true });
  });

  it('leaves bare JSON alone', () => {
    expect(stripCodeFence('{"Plan": "Weekly."}')).toEqual({ text: '{"Plan": "Weekly."}', fenced: false });
  });
});
