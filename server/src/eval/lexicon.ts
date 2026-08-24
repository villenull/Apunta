import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { EVAL_DIR } from './corpus.js';

/**
 * The clinical lexicon behind F7 (`novel_clinical_term_rate`).
 *
 * One `term<TAB>category` per line, comments on `#`. The file's own header
 * says it is the seed for a future `server/src/style/lexicon.ts`; until that
 * exists, this reads the corpus copy rather than duplicating 268 lines into
 * the source tree where the two could drift.
 */

export type TermCategory = 'diagnosis' | 'risk' | 'medication' | 'mse' | 'general';

export interface LexiconTerm {
  readonly term: string;
  readonly category: TermCategory;
  /** Word-boundary matcher over the *stemmed* text. Built once. */
  readonly pattern: RegExp;
}

const CATEGORIES = new Set<TermCategory>(['diagnosis', 'risk', 'medication', 'mse', 'general']);

export function loadLexicon(directory: string = EVAL_DIR): LexiconTerm[] {
  const text = readFileSync(join(directory, 'lexicon', 'clinical-terms.txt'), 'utf8');
  const terms: LexiconTerm[] = [];

  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const [term, category] = trimmed.split('\t').map((part) => part.trim());
    if (term === undefined || category === undefined) continue;
    if (!CATEGORIES.has(category as TermCategory)) continue;
    terms.push({
      term,
      category: category as TermCategory,
      pattern: new RegExp(`\\b${escapeRegExp(stem(term))}\\b`, 'i'),
    });
  }

  return terms;
}

/**
 * The normalisation F7 specifies: lowercase, collapse whitespace, and strip a
 * trailing `s`, `es`, `ed`, `ing` or `ly` from each word.
 *
 * Crude on purpose — it is a matcher, not a lemmatiser — and applied
 * *identically* to the note, the source and the lexicon entry, which is what
 * makes it sound. Stemming only one side would report "anxious" as novel
 * against a source that says "anxiously".
 */
export function stem(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((word) => word.replace(/(?:ing|es|ed|ly|s)$/, ''))
    .join(' ');
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
