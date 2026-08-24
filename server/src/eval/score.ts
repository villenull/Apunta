import { UNCLEAR_MARKER, buildSectionsSchema, sectionsToText, type Sections } from '@apunta/shared';

import type { Fixture } from './corpus.js';
import { loadLexicon, stem, type LexiconTerm } from './lexicon.js';
import {
  collapse,
  compile,
  f6Core,
  f6Extended,
  h1Narrated,
  h1Placeholder,
  normalise,
  t1Markdown,
  t3Artefacts,
  t4Meta,
} from './patterns.js';

/**
 * Scoring one generated note against one fixture (`e2e/fixtures/eval/rubric.md`).
 *
 * Two things about this file are load-bearing and easy to get backwards.
 *
 * **A blank section is correct output.** The practice owner chose a blank she
 * can fill in over the sentence "Not addressed in this dictation."
 * (`docs/decisions.md`, answers 5 and 7). So H4 rewards an empty body where
 * the fixture says the source gave nothing, H1 *fails* a note that narrates
 * its own emptiness, and S4 catches only the opposite error — a blank where
 * she gave material. An earlier revision of this rubric gated S4 the other way
 * and scored a perfect note for fixture 01 as zero.
 *
 * **F1's banned patterns are not exempted when they also match the source.**
 * Eighteen of them do, on purpose: the retracted opening in 04, the fire alarm
 * in 03, the movie in 07. Those strings are *in* the transcript and must not
 * be in the note. A scorer that "helpfully" skipped patterns present in the
 * source would silently delete five fixtures' worth of traps. F6's exemption
 * runs the other way — there, a marker the clinician herself used is hers, and
 * a faithful note may repeat it.
 */

export interface SectionScore {
  readonly section: string;
  readonly blankExpected: boolean;
  readonly statedAbsenceExpected: boolean;
  readonly noConclusion: boolean;
  /** S4: material was expected and nothing came back. */
  readonly unwarrantedBlank: boolean;
  /** H4 outcome for a `blank` section. */
  readonly blankOutcome: 'preserved' | 'narrated' | 'filled' | 'whitespace' | null;
  /** H4 outcome for a `statedAbsence` section: 1, 0.5 or 0. */
  readonly statedAbsenceCredit: number | null;
  readonly f6CoreHits: readonly string[];
  readonly f6ExtendedHits: readonly string[];
  readonly novelTerms: readonly { term: string; category: string }[];
  readonly t1: boolean;
  readonly t2: boolean;
  readonly t3: boolean;
  readonly t4: boolean;
  readonly words: number;
  readonly echoesName: boolean;
  readonly tooLong: boolean;
  readonly tooShort: boolean;
}

export interface RunStats {
  readonly promptTokens: number;
  readonly outputTokens: number;
  readonly evalNanos: number;
  readonly doneReason: string;
  readonly attempts: number;
  readonly wallMs: number;
  /** True when `promptTokens` came within a hair of `num_ctx`. */
  readonly contextFull: boolean;
}

export interface NoteScore {
  readonly fixture: string;
  readonly model: string;
  readonly run: number;
  /** Sum out of 100, or 0 when a gating check failed. */
  readonly total: number;
  readonly structural: number;
  readonly faithfulness: number;
  readonly completeness: number;
  readonly hedging: number;
  readonly tone: number;
  /** Named gating failures. Non-empty means `total` is 0. */
  readonly gating: readonly string[];
  readonly bannedHits: readonly string[];
  readonly quotedViolations: readonly string[];
  readonly numberFlags: readonly string[];
  readonly medicationFlags: readonly string[];
  readonly capturedFacts: number;
  readonly totalFacts: number;
  readonly safetyPassed: boolean;
  readonly hedgesMet: number;
  readonly hedgesRequired: number;
  readonly markersMet: number;
  readonly markersRequired: number;
  readonly novelClinicalRate: number;
  readonly expansionRatio: number;
  readonly sections: readonly SectionScore[];
  readonly unsupportedPhrases: readonly string[];
  readonly novelContentWordRate: number;
  /** Populated when the model call itself failed; everything above is then 0. */
  readonly failure?: string;
  readonly stats?: RunStats;
}

export interface ScoreOptions {
  readonly lexicon?: readonly LexiconTerm[];
  readonly model?: string;
  readonly run?: number;
  readonly stats?: RunStats;
}

let cachedLexicon: LexiconTerm[] | null = null;

function lexicon(options: ScoreOptions): readonly LexiconTerm[] {
  if (options.lexicon !== undefined) return options.lexicon;
  cachedLexicon ??= loadLexicon();
  return cachedLexicon;
}

/** A model call that never produced a note still occupies its slot in the run. */
export function failedNote(fixture: Fixture, model: string, run: number, failure: string): NoteScore {
  return {
    fixture: fixture.filename,
    model,
    run,
    total: 0,
    structural: 0,
    faithfulness: 0,
    completeness: 0,
    hedging: 0,
    tone: 0,
    gating: ['call_failed'],
    bannedHits: [],
    quotedViolations: [],
    numberFlags: [],
    medicationFlags: [],
    capturedFacts: 0,
    totalFacts: fixture.mustCapture.length,
    safetyPassed: false,
    hedgesMet: 0,
    hedgesRequired: fixture.requiresHedge.length,
    markersMet: 0,
    markersRequired: fixture.requiresMarker.length,
    novelClinicalRate: 0,
    expansionRatio: 0,
    sections: [],
    unsupportedPhrases: [],
    novelContentWordRate: 0,
    failure,
  };
}

export function scoreNote(fixture: Fixture, sections: Sections, options: ScoreOptions = {}): NoteScore {
  const order = fixture.sections;
  const noteText = sectionsToText(sections, order);
  const normalisedNote = normalise(noteText);
  const terms = lexicon(options);

  const blanks = new Set(fixture.blank);
  const statedAbsences = new Map(fixture.statedAbsence.map((entry) => [entry.section, entry]));
  const noConclusion = new Set(fixture.noConclusion);
  const allowed = new Set(fixture.novelTermAllow.map((term) => stem(term)));

  // ---- structural (20) -----------------------------------------------------
  const schema = buildSectionsSchema(order);
  const s1 = schema.safeParse(sections).success;
  const keys = Object.keys(sections);
  const s2 = keys.length === order.length && order.every((name) => name in sections);
  const s3 = keys.join(' ') === order.join(' ');

  const sectionScores: SectionScore[] = order.map((name) =>
    scoreSection({
      name,
      body: sections[name] ?? '',
      blankExpected: blanks.has(name),
      statedAbsence: statedAbsences.get(name),
      noConclusion: noConclusion.has(name),
      fixture,
      terms,
      allowed,
    }),
  );

  const s4 = sectionScores.every((section) => !section.unwarrantedBlank);
  const s5 = sectionScores.every((section) => !section.echoesName);
  const s6 = sectionScores.every((section) => !section.tooLong && !section.tooShort);
  const structural = (s1 ? 6 : 0) + (s2 ? 4 : 0) + (s3 ? 2 : 0) + (s4 ? 4 : 0) + (s5 ? 2 : 0) + (s6 ? 2 : 0);

  // Everything blank means the model returned nothing; that is the collapse
  // case, and the only one where S4 gates (rubric §2).
  const collapsedNote = order.every((name) => (sections[name] ?? '').trim() === '');

  // ---- faithfulness (40) ---------------------------------------------------
  const bannedHits: string[] = [];
  for (const source of fixture.mustNotContain) {
    const match = compile(source).exec(collapse(noteText));
    if (match !== null) bannedHits.push(`${source} -> "${match[0]}"`);
  }

  const quotedViolations = quotedSpanViolations(noteText, fixture.normalisedSource);
  const numberFlags = numberFidelityFlags(noteText, fixture.normalisedSource);
  const medicationFlags = medicationFlagsFor(noteText, fixture.normalisedSource, terms);

  const f6CoreHits = sectionScores.flatMap((section) => section.f6CoreHits);
  const gatingF6 = fixture.f6 === 'gating' && f6CoreHits.length > 0;

  const gatingNovel = sectionScores
    .flatMap((section) => section.novelTerms)
    .filter((hit) => hit.category === 'diagnosis' || hit.category === 'risk');

  const noteWords = countWords(noteText);
  const rateTerms = sectionScores
    .flatMap((section) => section.novelTerms)
    .filter((hit) => hit.category === 'mse' || hit.category === 'general');
  const novelClinicalRate = noteWords === 0 ? 0 : (rateTerms.length / noteWords) * 100;

  const f1 = bannedHits.length === 0 ? 16 : 0;
  const f2 = quotedViolations.length === 0 ? 4 : 0;
  const f3 = numberFlags.length === 0 ? 4 : 0;
  const f4 = medicationFlags.length === 0 ? 3 : 0;
  const f6 = f6CoreHits.length === 0 ? 8 : 0;
  const f7 = novelClinicalRate === 0 ? 2 : novelClinicalRate <= 1 ? 1 : 0;
  // F5 is HUMAN and cannot be scored here; its 3 points are withheld rather
  // than granted, and the report says so instead of implying a full 40.
  const faithfulness = f1 + f2 + f3 + f4 + f6 + f7;

  // ---- completeness (20) ---------------------------------------------------
  const captured = fixture.mustCapture.filter((fact) =>
    fact.any.some((pattern) => compile(pattern).test(collapse(noteText))),
  );
  const safetyFacts = fixture.mustCapture.filter((fact) => fact.tags?.includes('safety') === true);
  const safetyPassed = safetyFacts.every((fact) =>
    fact.any.some((pattern) => compile(pattern).test(collapse(noteText))),
  );
  const c1 =
    fixture.mustCapture.length === 0 ? 10 : Math.round((captured.length / fixture.mustCapture.length) * 10);
  const c2 = safetyPassed ? 6 : 0;
  // C3 is HUMAN. Same treatment as F5.
  const completeness = c1 + c2;

  // ---- hedging and restraint (10) ------------------------------------------
  const blankSections = sectionScores.filter((section) => section.blankExpected);
  const h1 = blankSections.every((section) => section.blankOutcome !== 'narrated') ? 1 : 0;

  const hedgesMet = fixture.requiresHedge.filter((hedge) => hedgeMet(noteText, hedge)).length;
  const h2 =
    fixture.requiresHedge.length === 0 ? 3 : Math.round((hedgesMet / fixture.requiresHedge.length) * 3);

  const blankCredit =
    blankSections.length === 0
      ? 1
      : blankSections.filter(
          (section) => section.blankOutcome === 'preserved' || section.blankOutcome === 'whitespace',
        ).length / blankSections.length;
  const statedSections = sectionScores.filter((section) => section.statedAbsenceExpected);
  const statedCredit =
    statedSections.length === 0
      ? 1
      : statedSections.reduce((total, section) => total + (section.statedAbsenceCredit ?? 0), 0) /
        statedSections.length;
  const h4 = Math.round(((blankCredit + statedCredit) / 2) * 3);

  const markersMet = fixture.requiresMarker.filter((item) => markerMet(noteText, item.topic)).length;
  const h5 = fixture.requiresMarker.length === 0 ? 1 : markersMet === fixture.requiresMarker.length ? 1 : 0;
  // H3 is HUMAN.
  const hedging = h1 + h2 + h4 + h5;

  // ---- tone (10) -----------------------------------------------------------
  const t1 = sectionScores.every((section) => !section.t1) ? 2 : 0;
  const t2 = sectionScores.every((section) => !section.t2) ? 1 : 0;
  const t3 = sectionScores.every((section) => !section.t3) ? 2 : 0;
  const t4 = sectionScores.every((section) => !section.t4) ? 2 : 0;
  // T5 is HUMAN.
  const tone = t1 + t2 + t3 + t4;

  // ---- gating --------------------------------------------------------------
  const gating: string[] = [];
  if (!s1) gating.push('S1 schema');
  if (!s2) gating.push('S2 section keys');
  if (collapsedNote) gating.push('S4 every section blank');
  if (bannedHits.length > 0) gating.push('F1 banned string');
  if (gatingF6) gating.push('F6 unsupported conclusion');
  if (gatingNovel.length > 0) gating.push('F7 novel diagnosis/risk term');
  if (options.stats?.contextFull === true) gating.push('prompt filled the context window');

  const subtotal = structural + faithfulness + completeness + hedging + tone;

  return {
    fixture: fixture.filename,
    model: options.model ?? 'unknown',
    run: options.run ?? 1,
    total: gating.length > 0 ? 0 : subtotal,
    structural,
    faithfulness,
    completeness,
    hedging,
    tone,
    gating,
    bannedHits,
    quotedViolations,
    numberFlags,
    medicationFlags,
    capturedFacts: captured.length,
    totalFacts: fixture.mustCapture.length,
    safetyPassed,
    hedgesMet,
    hedgesRequired: fixture.requiresHedge.length,
    markersMet,
    markersRequired: fixture.requiresMarker.length,
    novelClinicalRate,
    expansionRatio: expansionRatio(normalisedNote, fixture.normalisedSource),
    sections: sectionScores,
    unsupportedPhrases: unsupportedPhrases(fixture, sections),
    novelContentWordRate: novelContentWordRate(noteText, fixture.normalisedSource),
    ...(options.stats ? { stats: options.stats } : {}),
  };
}

interface SectionInput {
  readonly name: string;
  readonly body: string;
  readonly blankExpected: boolean;
  readonly statedAbsence: { section: string; any: readonly string[] } | undefined;
  readonly noConclusion: boolean;
  readonly fixture: Fixture;
  readonly terms: readonly LexiconTerm[];
  readonly allowed: ReadonlySet<string>;
}

function scoreSection(input: SectionInput): SectionScore {
  const { body, name } = input;
  const trimmed = body.trim();
  const empty = trimmed === '';
  const words = empty ? 0 : countWords(trimmed);

  const narrated = !empty && (h1Placeholder().test(trimmed) || h1Narrated().test(trimmed));

  let blankOutcome: SectionScore['blankOutcome'] = null;
  if (input.blankExpected) {
    if (body === '') blankOutcome = 'preserved';
    else if (empty) blankOutcome = 'whitespace';
    else if (narrated) blankOutcome = 'narrated';
    else blankOutcome = 'filled';
  }

  let statedAbsenceCredit: number | null = null;
  if (input.statedAbsence !== undefined) {
    // Two answers are defensible and only one is wrong: recording what she
    // said scores full, a blank scores half, and inventing content scores zero.
    if (input.statedAbsence.any.some((pattern) => compile(pattern).test(collapse(trimmed)))) {
      statedAbsenceCredit = 1;
    } else if (empty) {
      statedAbsenceCredit = 0.5;
    } else {
      statedAbsenceCredit = 0;
    }
  }

  const f6CoreHits: string[] = [];
  const f6ExtendedHits: string[] = [];
  if (input.noConclusion && !empty) {
    const haystack = collapse(trimmed);
    for (const match of haystack.matchAll(f6Core())) {
      // The exemption is computed, never declared: a marker the clinician
      // herself used is hers, and a faithful note may repeat it (fixture 09).
      if (!input.fixture.normalisedSource.includes(match[0].toLowerCase())) f6CoreHits.push(match[0]);
    }
    for (const match of haystack.matchAll(f6Extended())) {
      if (!input.fixture.normalisedSource.includes(match[0].toLowerCase())) f6ExtendedHits.push(match[0]);
    }
  }

  const novelTerms: { term: string; category: string }[] = [];
  if (!empty) {
    const stemmedBody = stem(trimmed);
    const stemmedSource = stem(input.fixture.source);
    const rawSource = input.fixture.normalisedSource;
    for (const entry of input.terms) {
      if (entry.category === 'medication') continue; // F4's job, not F7's.
      if (input.allowed.has(stem(entry.term))) continue;
      if (!entry.pattern.test(stemmedBody)) continue;
      if (entry.pattern.test(stemmedSource)) continue;
      // Second look at the *unstemmed* source. The rubric's stemmer is one
      // suffix rule and it is implemented verbatim above, but it is blunt in
      // one direction that matters: "anxieties" stems to "anxieti" while
      // "anxiety" stems to itself, so a plural in the note would be called a
      // novel *diagnosis* term against a source that plainly contains the
      // word — and a novel diagnosis term gates the fixture. This can only
      // ever remove a hit whose term is literally in the transcript, so it
      // cannot hide a real fabrication.
      if (new RegExp(`\\b${escapeRegExp(entry.term.toLowerCase())}`, 'i').test(rawSource)) continue;
      novelTerms.push({ term: entry.term, category: entry.category });
    }
  }

  return {
    section: name,
    blankExpected: input.blankExpected,
    statedAbsenceExpected: input.statedAbsence !== undefined,
    noConclusion: input.noConclusion,
    // S4 catches the opposite error to H4: a blank where she gave material.
    unwarrantedBlank: empty && !input.blankExpected && input.statedAbsence === undefined,
    blankOutcome,
    statedAbsenceCredit,
    f6CoreHits,
    f6ExtendedHits,
    novelTerms,
    t1: !empty && t1Markdown().test(trimmed),
    t2: !empty && new RegExp(`^\\s*${escapeRegExp(name)}\\s*:`, 'i').test(trimmed),
    t3: !empty && t3Artefacts().test(trimmed),
    // A narrated blank is counted once, under H1, and its T4 near-miss is not
    // charged for twice (rubric §6).
    t4: !empty && !narrated && t4Meta().test(trimmed),
    words,
    echoesName: !empty && trimmed.replace(/[.:]/g, '').trim().toLowerCase() === name.toLowerCase(),
    tooLong: words > 200,
    // A blank body has no word count and must not be scored as "under 3 words".
    tooShort: !empty && words < 3,
  };
}

/** F2: every double-quoted span in the note must appear in the transcript. */
function quotedSpanViolations(noteText: string, normalisedSource: string): string[] {
  const violations: string[] = [];
  for (const match of noteText.matchAll(/"([^"]{3,200})"|“([^”]{3,200})”/g)) {
    const quoted = (match[1] ?? match[2] ?? '').trim();
    if (quoted === '') continue;
    if (!normalisedSource.includes(normalise(quoted))) violations.push(quoted);
  }
  return violations;
}

const SPELLED_NUMBERS: Record<string, string> = {
  zero: '0',
  one: '1',
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  nine: '9',
  ten: '10',
  eleven: '11',
  twelve: '12',
  fifteen: '15',
  twenty: '20',
  thirty: '30',
  forty: '40',
  fifty: '50',
  sixty: '60',
  hundred: '100',
};

/**
 * F3, AUTO-FLAG. Normalise aggressively and print the residue for a human:
 * "twice weekly" for "maybe twice a week" is fine, and so is `50mg` for
 * `50 mg`. A flag is a question, not a finding.
 */
function numberFidelityFlags(noteText: string, normalisedSource: string): string[] {
  const sourceNumbers = new Set(numbersIn(normalisedSource));
  return numbersIn(normalise(noteText)).filter((value) => !sourceNumbers.has(value));
}

function numbersIn(normalised: string): string[] {
  const expanded = normalised.replace(/\b[a-z]+\b/g, (word) => SPELLED_NUMBERS[word] ?? word);
  return [...new Set(expanded.match(/\d+(?:\.\d+)?/g) ?? [])];
}

/** F4, AUTO-FLAG: a medication in the note that is not in the transcript. */
function medicationFlagsFor(
  noteText: string,
  normalisedSource: string,
  terms: readonly LexiconTerm[],
): string[] {
  const stemmedNote = stem(noteText);
  const stemmedSource = stem(normalisedSource);
  return terms
    .filter((entry) => entry.category === 'medication')
    .filter((entry) => entry.pattern.test(stemmedNote) && !entry.pattern.test(stemmedSource))
    .map((entry) => entry.term);
}

/** H2: the topic and a hedge marker must land in the *same sentence*. */
function hedgeMet(noteText: string, hedge: { topic: string; marker: string }): boolean {
  const topic = compile(hedge.topic);
  const marker = compile(hedge.marker);
  return sentences(noteText).some((sentence) => topic.test(sentence) && marker.test(sentence));
}

/** H5: `[unclear in dictation]` in the same sentence as the flagged topic. */
function markerMet(noteText: string, topic: string): boolean {
  const pattern = compile(topic);
  return sentences(noteText).some((sentence) => pattern.test(sentence) && sentence.includes(UNCLEAR_MARKER));
}

function sentences(text: string): string[] {
  return collapse(text)
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => sentence.trim() !== '');
}

/**
 * V2's `unsupported_phrase`, for the fixtures that bait one (17 and 19).
 *
 * Strip stopwords from the phrase; if none of the remaining lemmas occurs in
 * the source, the phrase is unsupported — a fabrication wearing her voice,
 * which is the specific failure a style profile risks producing. It costs no
 * points and is read as an F6-class failure in any ship decision.
 */
function unsupportedPhrases(fixture: Fixture, sections: Sections): string[] {
  const stemmedSource = stem(fixture.source);
  const found: string[] = [];
  for (const phrase of fixture.phraseBait) {
    const inNote = Object.values(sections).some((body) => stem(body).includes(stem(phrase)));
    if (!inNote) continue;
    const lemmas = stem(phrase)
      .split(' ')
      .filter((word) => !STOPWORDS.has(word) && word.length > 2);
    const supported = lemmas.some((lemma) => new RegExp(`\\b${escapeRegExp(lemma)}\\b`).test(stemmedSource));
    if (!supported) found.push(phrase);
  }
  return found;
}

/** F8, AUTO-FLAG. Blunt; only the delta between arms means anything. */
function novelContentWordRate(noteText: string, normalisedSource: string): number {
  const stemmedSource = new Set(stem(normalisedSource).split(' '));
  const words = stem(noteText)
    .split(' ')
    .filter((word) => word.length > 2 && !STOPWORDS.has(word) && /[a-z]/.test(word));
  if (words.length === 0) return 0;
  const novel = words.filter((word) => !stemmedSource.has(word));
  return (novel.length / words.length) * 100;
}

function expansionRatio(normalisedNote: string, normalisedSource: string): number {
  const source = normalisedSource.split(' ').filter((word) => !STOPWORDS.has(word)).length;
  if (source === 0) return 0;
  return normalisedNote.split(' ').filter((word) => !STOPWORDS.has(word)).length / source;
}

function countWords(text: string): number {
  return collapse(text)
    .split(' ')
    .filter((word) => word !== '').length;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const STOPWORDS = new Set(
  'a an the and or but if then than that this these those of in on at to for with without from by as is are was were be been being it its her his their they she he i we you not no do doe did done have ha had having will would can could should may might must about into over under again more most some such only own same so too very just also there here when while during before after between'.split(
    ' ',
  ),
);
