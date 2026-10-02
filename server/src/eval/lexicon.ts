import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { EVAL_DIR } from './corpus.js';

/**
 * The clinical lexicon behind F7 (`novel_clinical_term_rate`), and the
 * locale-scoped vocabulary F4, FD2b and FD6 consume.
 *
 * One `term<TAB>category` per line, comments on `#`. The English file is the
 * corpus copy rather than a duplicate in the source tree, so the two cannot
 * drift; the `es-MX` file lives beside this module because it was built once,
 * at authoring time, from `docs/research/es-mx-clinical-glossary.json` and is
 * the instrument's own vocabulary from then on (FD2, FD11).
 *
 * **The loader is locale-scoped and nothing is shared across locales** (FD2c).
 * `\bno\b` is the English word "no", and a Spanish lexicon reachable from an
 * English run would match it in every note. So `--locale en` reads only the
 * clinical file and `--locale es-MX` only `lexicons/es-MX.txt`.
 */

export type TermCategory =
  'diagnosis' | 'risk' | 'medication' | 'mse' | 'general' | 'negation' | 'number' | 'unit';

/** The locales the eval instrument measures (C-LANG@1 rule 1). */
export type EvalLocale = 'en' | 'es-MX';

/**
 * A lexicon a control's sidecar may name through `{{lexicon}}`.
 *
 * `clinical` is the English file as a whole — the vocabulary F7 has always
 * read. The other four are the categories `es-MX.txt` is built from, so
 * `negation` under `--locale en` names a lexicon the run's locale does not
 * have and is a load-time `CorpusError` (FD2b validation rule 2).
 */
export type NamedLexicon = 'clinical' | 'negation' | 'number' | 'unit' | 'medication';

export interface LexiconTerm {
  readonly term: string;
  readonly category: TermCategory;
  /** Word-boundary matcher over the *stemmed* text. Built once. */
  readonly pattern: RegExp;
  /** Which named lexicon this term belongs to, for FD2b's `{{lexicon}}`. */
  readonly named: NamedLexicon;
  readonly locale: EvalLocale;
}

/**
 * The eight categories the loader admits (FD2c): F7's five, widened by
 * `negation`, `number` and `unit` for the `es-MX` file. A line outside this set
 * is a load-time error naming the file and the line, not a silent `continue` —
 * a half-empty lexicon is the failure the widened check exists to prevent.
 */
const CATEGORIES = new Set<TermCategory>([
  'diagnosis',
  'risk',
  'medication',
  'mse',
  'general',
  'negation',
  'number',
  'unit',
]);

/**
 * The named lexicon each category belongs to. `general`/`diagnosis`/`risk`/
 * `mse`/`medication` in the English file are `clinical`; the same category in
 * `es-MX.txt` is its own named lexicon, because the Spanish file is built from
 * number/unit/medication and negation and holds nothing else.
 */
const NAMED_BY_CATEGORY: Readonly<Record<TermCategory, NamedLexicon>> = {
  diagnosis: 'clinical',
  risk: 'clinical',
  medication: 'medication',
  mse: 'clinical',
  general: 'clinical',
  negation: 'negation',
  number: 'number',
  unit: 'unit',
};

/** The only lexicons each locale has (FD2c). Nothing is shared. */
const LEXICONS_BY_LOCALE: Readonly<Record<EvalLocale, readonly NamedLexicon[]>> = {
  en: ['clinical'],
  'es-MX': ['negation', 'number', 'unit', 'medication'],
};

const ES_MX_FILE = resolve(dirname(fileURLToPath(import.meta.url)), 'lexicons', 'es-MX.txt');

/**
 * FD2c's boundary, and the whole reason it exists.
 *
 * `lexicon.ts` used to build `\b${stem(term)}\b`, and JavaScript's `\b` is
 * defined over `[A-Za-z0-9_]` — so a term whose **last** character is non-ASCII
 * can never match at all. That is not hypothetical: `\bdejó\b` matches **0** of
 * the 66 tuning transcripts where the Latin-script class below matches **10**,
 * and `mié` is unreachable for the same reason.
 *
 * An **explicit Latin-script class**, deliberately *not* `\p{L}\p{N}_`:
 * `compile()` builds every sidecar pattern as `new RegExp(source, anchored ?
 * 'im' : 'i')` — with **no `u` flag** — and in a non-unicode `RegExp` a `\p{…}`
 * escape is not a property escape at all, it degrades to the literal characters
 * `p`, `{`, `L`, `}`. A `\p`-based boundary would therefore be a class of
 * punctuation letters, silently.
 *
 * What this is **not** is general Unicode word segmentation, and it is not
 * claimed to be. A term outside the Latin script is not admissible and raises
 * the same load-time error, naming the file and the line.
 */
/** Exported so a test can assert the boundary construction against the real class. */
export const LATIN_WORD = 'A-Za-zÀ-ÖØ-öø-ÿ0-9_';

/**
 * The characters an `es-MX.txt` term may contain: Latin letters (the boundary
 * class), digits, and the separators the file's own surface forms use. A term
 * outside this is not admissible and raises the load-time error below.
 */
const ADMISSIBLE_CHARACTER = new RegExp(`^[${LATIN_WORD} .,%µ/()-]+$`, 'u');

/** `(?:…)?`-free boundary assertion around one already-escaped alternative. */
export function latinBounded(escapedTerm: string): string {
  return `(?<![${LATIN_WORD}])${escapedTerm}(?![${LATIN_WORD}])`;
}

export class LexiconError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LexiconError';
  }
}

/**
 * The English clinical file, unchanged.
 *
 * Its `\b` construction is **byte-identical** to the base commit's, and F7's
 * English semantics do not move: none of its 239 terms ends in a non-ASCII
 * character after `stem()`, so the two constructions agree on a sentence
 * containing the term, on all 239. A test asserts that.
 *
 * `strict` is false here and true for `es-MX.txt` because FD2c states the
 * load-time error for the Spanish file's own lines; the English file keeps the
 * `continue` it has always had.
 */
export function loadLexicon(directory: string = EVAL_DIR): LexiconTerm[] {
  return parseLexiconFile(join(directory, 'lexicon', 'clinical-terms.txt'), 'en', false);
}

export function parseLexiconFile(file: string, locale: EvalLocale, strict: boolean): LexiconTerm[] {
  return parseLexiconLines(file, readFileSync(file, 'utf8').split('\n'), locale, strict);
}

/** Exported so the load-time category and admissibility checks are testable. */
export function parseLexiconLines(
  file: string,
  lines: readonly string[],
  locale: EvalLocale,
  strict: boolean,
): LexiconTerm[] {
  const terms: LexiconTerm[] = [];

  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const [term, category] = trimmed.split('\t').map((part) => part.trim());
    if (term === undefined || category === undefined) continue;
    if (!CATEGORIES.has(category as TermCategory)) {
      if (!strict) continue;
      throw new LexiconError(
        `${file}:${String(index + 1)}: unknown category "${category}"; a lexicon that loads ` +
          `half-empty is the failure this check prevents`,
      );
    }
    const named = NAMED_BY_CATEGORY[category as TermCategory];
    if (locale !== 'en' && !ADMISSIBLE_CHARACTER.test(term)) {
      throw new LexiconError(
        `${file}:${String(index + 1)}: "${term}" is outside the Latin script the ` +
          `boundary class admits, and would be a boundary that cannot match it`,
      );
    }
    terms.push({
      term,
      category: category as TermCategory,
      // **Stemming is stated on both sides, and it is not the same rule for both
      // kinds of term** (FD2c):
      //
      // - The English clinical file keeps F7's `\b` construction byte for byte,
      //   because F7's English semantics must not move.
      // - A `negation` entry is matched as a whole token — and a whole phrase —
      //   against the *normalised* note text, never stemmed: `stem('jamás')` is
      //   `jamá` and `stem('nos')` is `no`, so stemming a closed-class function
      //   word changes what it matches.
      // - `number`, `unit` and `medication` keep F7's stemming on **both** sides:
      //   the term and the note text are stemmed, and a multi-word alternative is
      //   stemmed per word and matched as a whole phrase.
      //
      // `scoreNote` is not edited by the card that introduced this, so F7 still
      // tests every non-medication entry against *stemmed* text. That is inert
      // for `negation`, which is neither `diagnosis`/`risk` (gating) nor
      // `mse`/`general` (the `novelClinicalRate` numerator).
      pattern:
        locale === 'en'
          ? new RegExp(`\\b${escapeRegExp(stem(term))}\\b`, 'i')
          : named === 'negation'
            ? new RegExp(latinBounded(escapeRegExp(term)), 'i')
            : new RegExp(latinBounded(escapeRegExp(stem(term))), 'i'),
      named,
      locale,
    });
  }

  return terms;
}

const cache = new Map<EvalLocale, readonly LexiconTerm[]>();

/**
 * Every term the run's locale has, in one array — the value every `scoreNote`
 * call site passes in `lexicon:` (FD2c, and the third-call-site requirement in
 * FD6). It is locale-scoped by construction, so an `es-MX` run cannot score
 * against the English clinical file and an `en` run cannot see Spanish.
 */
export function loadLocaleLexicon(locale: EvalLocale): readonly LexiconTerm[] {
  const cached = cache.get(locale);
  if (cached !== undefined) return cached;
  const loaded = locale === 'en' ? loadLexicon() : parseLexiconFile(ES_MX_FILE, 'es-MX', true);
  cache.set(locale, loaded);
  return loaded;
}

export function availableLexicons(locale: EvalLocale): readonly NamedLexicon[] {
  return LEXICONS_BY_LOCALE[locale];
}

/**
 * One named lexicon's terms, as authored on disk.
 *
 * Zero terms is FD2b's validation rule (4) — the half-empty lexicon — and the
 * caller reports it as a `CorpusError` naming the control. Blinding is a
 * substitution at the `{{lexicon}}` token and never empties this, so the rule
 * is evaluated against exactly what is on disk.
 */
export function namedLexiconTerms(locale: EvalLocale, name: string): readonly LexiconTerm[] | undefined {
  if (!availableLexicons(locale).includes(name as NamedLexicon)) return undefined;
  return loadLocaleLexicon(locale).filter((term) => term.named === name);
}

/**
 * The `{{lexicon}}` expansion: **exactly one non-capturing group** of
 * whole-token alternatives (FD2b), each `escapeRegExp`'d and wrapped in FD2c's
 * boundary, so it is safe to drop into the middle of a larger pattern without
 * changing the enclosing alternation's precedence. A multi-word cue keeps its
 * internal spaces and is matched as a whole phrase.
 *
 * Under `--blind-lexicon` the expansion is `(?!)`, **not** `(?:)`: an empty
 * group would drop the negator requirement and keep the rest of the phrase, so
 * `(?:) refiere` matches a text with no negator at all — a blind run would
 * manufacture gating rather than remove it.
 */
export function lexiconAlternation(terms: readonly LexiconTerm[], blind: boolean): string {
  if (blind) return '(?!)';
  return `(?:${terms.map((term) => latinBounded(escapeRegExp(term.term))).join('|')})`;
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

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
