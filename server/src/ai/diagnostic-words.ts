import { z } from 'zod';
import type { JsonSchemaObject } from '@apunta/shared';

import { positiveRiskTokens, riskTokens } from './clinical-phrases.js';
import { findDegeneration } from './degenerate.js';
import { factTokens, medicationTokens } from './fact-guard.js';

/**
 * Taking a diagnostic word she never used out of a drafted section.
 *
 * Eval fixture `19`: she described washing until her hands crack, 30–35 times a
 * day, and the 4B drafted "Patient presents with hand-washing compulsions" 3/3
 * runs — a diagnostic word she never said, through instructions that forbid
 * turning a description into a diagnosis. The word sits in a sentence that also
 * carries the counts and the onset, so it cannot just be cut.
 *
 * So the server finds the words, the model rewrites only that section without
 * them, and the server keeps the rewrite only when the words are gone, no other
 * diagnostic word arrived, every number, day, month, medication and risk
 * statement is unchanged, and the length is close. Anything else keeps the
 * draft as written. A word counts as hers when the same word (or its stem)
 * appears anywhere in her notes: "agoraphobic avoidance" in the dictation
 * licenses "agoraphobic" in the note.
 *
 * English only.
 */

/**
 * Diagnostic vocabulary, each with the stem that, found in her notes, makes it
 * hers. `'exact'`: only the same phrase in her notes makes it hers.
 */
const DIAGNOSTIC_TERMS: readonly (readonly [RegExp, RegExp | 'exact'])[] = [
  [/\bcompulsi\w*/gi, /\bcompulsi/i],
  [/\bobsessi\w*/gi, /\bobsessi/i],
  [/\bOCD\b/g, /\bOCD\b/],
  [/\bagoraphobi\w*/gi, /\bagoraphobi/i],
  [/\bpanic disorder\b/gi, /\bpanic disorder\b/i],
  [/\bPTSD\b|\bpost-?traumatic stress\b/gi, /\bPTSD\b|\bpost-?traumatic/i],
  [/\bGAD\b|\bgenerali[sz]ed anxiety\b/gi, /\bGAD\b|\bgenerali[sz]ed anxiety/i],
  [/\bMDD\b|\bmajor depressi\w*/gi, /\bMDD\b|\bmajor depressi/i],
  [/\bbipolar\b/gi, /\bbipolar\b/i],
  [/\bborderline\b|\bBPD\b/gi, /\bborderline\b|\bBPD\b/i],
  [/\bADHD\b|\battention[- ]deficit\b/gi, /\bADHD\b|\battention[- ]deficit/i],
  [/\bpsychos[ie]s\b|\bpsychotic\b/gi, /\bpsychos|\bpsychotic/i],
  [/\bschizo\w*/gi, /\bschizo/i],
  [/\banorexi\w*|\bbulimi\w*/gi, /\banorexi|\bbulimi/i],
  [/\bdysthymi\w*/gi, /\bdysthymi/i],
  [/\bhypomani\w*|\bmanic\b|\bmania\b/gi, /\bhypomani|\bmanic\b|\bmania\b/i],
  [/\bsomati[sz]ation\b/gi, /\bsomati[sz]ation/i],
  [/\b[a-z]+ disorder\b/gi, 'exact'],
];

/** The diagnostic words in `text` that her notes never use, as written in `text`. */
export function novelDiagnosticWords(text: string, source: string): string[] {
  const found = new Set<string>();
  for (const [inText, inSource] of DIAGNOSTIC_TERMS) {
    for (const match of text.matchAll(inText)) {
      const word = match[0];
      const hers =
        inSource === 'exact' ? source.toLowerCase().includes(word.toLowerCase()) : inSource.test(source);
      if (!hers) found.add(word);
    }
  }
  return [...found];
}

export const RewriteSchema = z.object({ text: z.string() });

/** Ollama's `format` for the rewrite. Never shown to the model; the prompt restates it. */
export function rewriteJsonSchema(): JsonSchemaObject {
  return {
    type: 'object',
    properties: { text: { type: 'string' } },
    required: ['text'],
    additionalProperties: false,
  };
}

function keys(map: ReadonlyMap<string, unknown>): string {
  return [...map.keys()].sort().join('|');
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter((word) => word !== '').length;
}

/**
 * Does the rewrite keep everything but the words? It must lose them, gain no
 * diagnostic word of its own, keep every number, day, month, medication and
 * risk statement exactly, and stay within a quarter of the original length.
 */
export function acceptsRewrite(original: string, rewrite: string, source: string): boolean {
  const text = rewrite.trim();
  if (text === '' || findDegeneration(text) !== null) return false;
  if (novelDiagnosticWords(text, source).length > 0) return false;
  if (keys(factTokens(text)) !== keys(factTokens(original))) return false;
  if (keys(medicationTokens(text)) !== keys(medicationTokens(original))) return false;
  if (keys(riskTokens(text)) !== keys(riskTokens(original))) return false;
  if (keys(positiveRiskTokens(text)) !== keys(positiveRiskTokens(original))) return false;
  const ratio = wordCount(text) / Math.max(1, wordCount(original));
  return ratio >= 0.75 && ratio <= 1.25;
}
