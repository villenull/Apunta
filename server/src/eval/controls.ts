import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { textToSections, type Sections } from '@apunta/shared';

import {
  CorpusError,
  LEXICON_TOKEN,
  assertFixture,
  transcriptInventory,
  type CaptureFact,
  type Fixture,
  type HedgeRequirement,
  type StatedAbsence,
} from './corpus.js';
import {
  lexiconAlternation,
  loadLocaleLexicon,
  namedLexiconTerms,
  type EvalLocale,
  type LexiconTerm,
  type NamedLexicon,
} from './lexicon.js';
import { collapse, f6Core, normalise } from './patterns.js';
import { scoreNote, type NoteScore } from './score.js';

/**
 * Control fixtures: the instrument's own proof that it can see (FD6).
 *
 * **A control is not a corpus fixture.** A corpus fixture is scored on provider
 * or pipeline output and enters every denominator; a control is scored on text
 * the fixture itself injects, exists only to prove the *scorer* sees an error,
 * and contributes to none of the report's aggregates. `FakeLlmProvider` cannot
 * supply the errors — `fakeSectionsFor` echoes the source and has no mechanism
 * to drop one negator while keeping the rest, or to introduce one that was not
 * there — and `server/src/ai/fake.ts` is Must-not-edit. So the error is injected
 * deterministically and `scoreNote` is the same function either way; only the
 * provenance of the text differs.
 */

export type ControlClass = 'positive' | 'clean' | 'empty' | 'degenerate';

/**
 * The score field a class must move, named literally so the predicate below is
 * checkable against `NoteScore` and not against a judgement.
 */
export type ControlMechanism =
  | 'F1 banned string'
  | 'S4 every section blank'
  | 'F6 unsupported conclusion'
  | 'F7 novel diagnosis/risk term'
  | 'missed mustCapture';

export type ControlExpectation = 'flagged' | 'pass' | 'fail';

/** Derived, never chosen: positive→flagged, clean→pass, empty/degenerate→fail. */
const EXPECTED: Readonly<Record<ControlClass, ControlExpectation>> = {
  positive: 'flagged',
  clean: 'pass',
  empty: 'fail',
  degenerate: 'fail',
};

/** A control's `controlNote` is bounded so one control cannot dominate a report. */
export const CONTROL_NOTE_LIMIT = 4000;

/**
 * The sidecar type is a **strict subset** of `FixtureExpectations` — it omits
 * `words`, `difficulty`, `markerFreeSource`, `requiresHedge`, `requiresMarker`
 * and `novelTermAllow`, which the loader supplies deterministically below — plus
 * exactly one control-only key, `lexicon`.
 *
 * The narrower sidecar and "the existing `assertFixture` checks apply unchanged"
 * are reconciled **on the load side, not the assertion side**: the loader hands
 * `scoreNote` and `assertFixture` a *complete* `Fixture`, so neither function
 * gains a parameter and neither gains a branch. The sidecar is where a control
 * is allowed to be a different shape.
 */
export interface ControlSidecar {
  readonly control: ControlClass;
  /** The transcript at `<class>/<name>.txt`; the control's `fixture.source`. */
  readonly controlSource: string;
  /** The exact note text the control is scored on. Never the transcript. */
  readonly controlNote: string;
  readonly expect: ControlExpectation;
  /** Required for `positive`, `empty` and `degenerate`; `clean` carries none. */
  readonly mechanism?: ControlMechanism | undefined;
  /**
   * One top-level key naming a lexicon (FD2b). **Only the `es-MX`
   * `lost-negation` and `invented-negation` controls carry it** — no English
   * negation lexicon exists and this card authors none, so validation rule (2)
   * would otherwise kill the mandated default `--locale en` self-check at load.
   */
  readonly lexicon?: string | undefined;
  readonly requiresHedge?: readonly HedgeRequirement[] | undefined;
  readonly requiresMarker?: readonly { topic: string }[] | undefined;
  readonly format: Fixture['format'];
  readonly sections: readonly string[];
  readonly modality: string;
  readonly f6: Fixture['f6'];
  readonly blank: readonly string[];
  readonly statedAbsence: readonly StatedAbsence[];
  readonly noConclusion: readonly string[];
  readonly mustNotContain: readonly string[];
  readonly mustCapture: readonly CaptureFact[];
  readonly phraseBait?: readonly string[] | undefined;
}

export interface LoadedControl {
  readonly fixture: Fixture;
  readonly control: ControlClass;
  readonly expect: ControlExpectation;
  readonly mechanism: ControlMechanism | undefined;
  /** `mustNotContain` / `mustCapture` as compiled, after `{{lexicon}}` expansion. */
  readonly expandedMustNotContain: readonly string[];
  readonly expandedMustCapture: readonly CaptureFact[];
  readonly lexiconName: string | undefined;
  readonly note: Sections;
}

export interface ControlScore {
  readonly key: string;
  readonly control: ControlClass;
  readonly expect: ControlExpectation;
  readonly mechanism: ControlMechanism | undefined;
  /** Which of the three words FD6's predicates gave it, computed, never declared. */
  readonly verdict: ControlExpectation;
  readonly gating: readonly string[];
  readonly bannedHits: readonly string[];
  readonly capturedFacts: number;
  readonly totalFacts: number;
  /** True when `expect` was not met, or `mechanism` was required and not observed. */
  readonly missed: boolean;
  /** Why, in one sentence, for the report and for exit 3. */
  readonly missedReason: string | undefined;
  readonly score: NoteScore;
}

/** The ledger of every control this run loaded, and where it came from. */
export interface ControlsResult {
  readonly directory: string;
  readonly controls: readonly ControlScore[];
  /** `true` when `--controls none` suppressed them; the report then omits the table. */
  readonly suppressed: boolean;
  readonly blinded: NamedLexicon | 'all' | undefined;
}

export function controlsDirectoryFor(locale: EvalLocale, repositoryRoot: string): string {
  return join(repositoryRoot, 'server', 'src', 'eval', 'fixtures-controls', locale);
}

export function isControlsDirectory(directory: string): boolean {
  try {
    return statSync(directory).isDirectory() && existsSync(join(directory, 'expectations.json'));
  } catch {
    return false;
  }
}

export interface LoadControlsOptions {
  readonly directory: string;
  readonly locale: EvalLocale;
  /** Test-only negative control (FD1, FD8). Never an acceptance run. */
  readonly blindLexicon?: NamedLexicon | 'all' | undefined;
}

/**
 * Load and score a controls directory.
 *
 * The **third `scoreNote` call site**, and it passes the same locale-scoped terms
 * in `lexicon:` as the provider path (`run.ts`) and the pipeline path
 * (`pipeline.ts`). It is not "pass nothing extra": the no-argument fallback
 * resolves to `en`, so a control run that omitted it would score every `es-MX`
 * control against the **English** clinical lexicon — `03-dosis-incorrecta`'s F4
 * medication check would never see a Spanish medication name — and no row would
 * say so.
 */
export function loadControls(options: LoadControlsOptions): ControlsResult {
  const { locale, directory } = options;
  if (!isControlsDirectory(directory)) {
    throw new CorpusError(`--controls ${directory} is not a directory containing expectations.json`);
  }

  const raw = JSON.parse(readFileSync(join(directory, 'expectations.json'), 'utf8')) as {
    fixtures: Record<string, ControlSidecar>;
  };

  // FD3's inventory applies here too: a controls transcript on disk but absent
  // from the sidecar must be reported, not silently ignored.
  const missing = transcriptInventory(directory).filter((name) => !(name in raw.fixtures));
  if (missing.length > 0) {
    throw new CorpusError(`no expectations.json entry for: ${missing.join(', ')}`);
  }

  const lexicon = loadLocaleLexicon(locale);
  const controls = Object.entries(raw.fixtures)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, sidecar]) =>
      scoreControl(key, sidecar, { directory, locale, lexicon, blindLexicon: options.blindLexicon }),
    );

  return {
    directory,
    controls,
    suppressed: false,
    blinded: options.blindLexicon,
  };
}

interface ScoreControlContext {
  readonly directory: string;
  readonly locale: EvalLocale;
  readonly lexicon: readonly LexiconTerm[];
  readonly blindLexicon: NamedLexicon | 'all' | undefined;
}

function scoreControl(key: string, sidecar: ControlSidecar, context: ScoreControlContext): ControlScore {
  const loaded = toFixture(key, sidecar, context);
  const score = scoreNote(loaded.fixture, loaded.note, {
    lexicon: context.lexicon,
    model: 'control',
    run: 1,
  });
  const { verdict, missedReason } = judge(key, sidecar, score);
  return {
    key,
    control: sidecar.control,
    expect: sidecar.expect,
    mechanism: sidecar.mechanism,
    verdict,
    gating: score.gating,
    bannedHits: score.bannedHits,
    capturedFacts: score.capturedFacts,
    totalFacts: score.totalFacts,
    missed: missedReason !== undefined,
    missedReason,
    score,
  };
}

/**
 * FD6's three predicates, stated as predicates on the control's own `NoteScore`
 * so no implementation can disagree:
 *
 * - `flagged` ⇔ `gating.length > 0` **or** `capturedFacts < totalFacts`. The
 *   second disjunct is a real score field and a real state: `mustCapture` is
 *   scored where an uncaptured fact costs `c1`/`c2` points and adds **no**
 *   `gating` entry, so a control whose whole mechanism is an un-captured fact is
 *   detectable only through it. Gating alone would call the lost-negation
 *   control unflagged on a correct implementation.
 * - `pass` ⇔ `gating.length === 0` **and** `capturedFacts === totalFacts`.
 * - `fail` ⇔ `gating.length > 0` **and** the named `mechanism` is present in it.
 *
 * And in every case the sidecar's `mechanism` must be the one **observed**, not
 * merely the one declared: a control that flags for some other reason has not
 * tested the class it claims to test, and FD6 counts that as a miss.
 */
function judge(
  key: string,
  sidecar: ControlSidecar,
  score: NoteScore,
): { verdict: ControlExpectation; missedReason: string | undefined } {
  const gating = score.gating;
  const observed = `gating was [${gating.join(', ') || 'empty'}], captured ${String(
    score.capturedFacts,
  )}/${String(score.totalFacts)}`;

  if (sidecar.expect !== EXPECTED[sidecar.control]) {
    return {
      verdict: sidecar.expect,
      missedReason:
        `control ${key} is class "${sidecar.control}", which is ${EXPECTED[sidecar.control]}, ` +
        `but its sidecar declares expect "${sidecar.expect}"`,
    };
  }

  const mechanismObserved = sidecar.mechanism !== undefined && gating.includes(sidecar.mechanism);
  const factMissed = score.capturedFacts < score.totalFacts;

  if (sidecar.expect === 'fail') {
    // `fail` is exactly the named mechanism, present in gating.
    const met = gating.length > 0 && mechanismObserved;
    if (!met) {
      return {
        verdict: 'pass',
        missedReason:
          `control ${key} (${sidecar.control}) did not produce its named mechanism ` +
          `"${sidecar.mechanism ?? '(none declared)'}"; ${observed}`,
      };
    }
    return { verdict: 'fail', missedReason: undefined };
  }

  if (sidecar.expect === 'flagged') {
    const met = gating.length > 0 || factMissed;
    // The mechanism must be the *observed* one: either the named gating entry,
    // or `missed mustCapture` and a fact really went uncaptured.
    const mechanismMet =
      sidecar.mechanism === 'missed mustCapture'
        ? factMissed
        : mechanismObserved || (sidecar.mechanism === undefined && met);
    if (!met || !mechanismMet) {
      return {
        verdict: 'pass',
        missedReason:
          `control ${key} (${sidecar.control}) expected to be flagged through ` +
          `"${sidecar.mechanism ?? '(none declared)'}" but observed neither that gating entry nor an ` +
          `uncaptured mustCapture fact; ${observed}`,
      };
    }
    return { verdict: 'flagged', missedReason: undefined };
  }

  const met = gating.length === 0 && !factMissed;
  if (!met) {
    return {
      verdict: 'flagged',
      missedReason: `control ${key} (${sidecar.control}) expected to pass but was flagged; ${observed}`,
    };
  }
  return { verdict: 'pass', missedReason: undefined };
}

/**
 * FD6's load-side conversion: the narrow sidecar becomes a **complete** `Fixture`
 * before anything else sees it.
 *
 * Every one of the six supplied keys is a default the control could have written
 * itself, which is the test of whether a default is a weakening: none of them
 * can turn a gating check off, add a fixture to a denominator, or lower a number
 * a contract reads.
 */
function toFixture(key: string, sidecar: ControlSidecar, context: ScoreControlContext): LoadedControl {
  const [firstSegment] = key.split('/');
  if (firstSegment !== sidecar.control) {
    throw new CorpusError(
      `${key}: control is "${sidecar.control}" but the key's first path segment is "${firstSegment ?? ''}"`,
    );
  }
  if (sidecar.expect !== EXPECTED[sidecar.control]) {
    throw new CorpusError(
      `${key}: control "${sidecar.control}" derives expect "${EXPECTED[sidecar.control]}", not "${sidecar.expect}"`,
    );
  }
  if (sidecar.control !== 'clean' && sidecar.mechanism === undefined) {
    throw new CorpusError(`${key}: control "${sidecar.control}" must name a mechanism`);
  }
  if (sidecar.control === 'clean' && sidecar.mechanism !== undefined) {
    throw new CorpusError(`${key}: a clean control carries no mechanism`);
  }
  if (sidecar.controlNote.length > CONTROL_NOTE_LIMIT) {
    throw new CorpusError(
      `${key}: controlNote is ${String(sidecar.controlNote.length)} characters, over the ${String(CONTROL_NOTE_LIMIT)} limit`,
    );
  }

  const source = readFileSync(join(context.directory, key), 'utf8');
  const { mustNotContain, mustCapture } = expandLexicon(key, sidecar, context);
  const lexiconName = sidecar.lexicon;

  const fixture: Fixture = {
    filename: key,
    format: sidecar.format,
    sections: sidecar.sections,
    modality: sidecar.modality,
    // The whitespace-token count of `controlSource`. A denominator for the
    // control's own report lines and nothing else; no contract rate reads it.
    words: source
      .trim()
      .split(/\s+/)
      .filter((word) => word !== '').length,
    // A label. No gate branches on it and `BASELINE.md`'s recorded ranges are
    // not applied to a control.
    difficulty: 'control',
    // **Measured** by the same expression `assertFixture` uses to verify it, so
    // it cannot disagree with the check: an `f6: "gating"` control whose source
    // contains marker vocabulary is then correctly *refused* by `assertFixture`.
    markerFreeSource: collapse(source).match(f6Core()) === null,
    f6: sidecar.f6,
    blank: sidecar.blank,
    statedAbsence: sidecar.statedAbsence,
    noConclusion: sidecar.noConclusion,
    mustNotContain,
    mustCapture,
    // `[]` makes `assertFixture`'s compile loop and `scoreNote`'s
    // `hedgesRequired` zero-iteration rather than undefined-iterated. A control
    // that wants a hedge requirement declares it, so the capability is not lost.
    requiresHedge: sidecar.requiresHedge ?? [],
    requiresMarker: sidecar.requiresMarker ?? [],
    // A control introduces no vocabulary the class is not about; the `clean`
    // control's agreement with its `controlSource` is what keeps F7 quiet.
    novelTermAllow: [],
    phraseBait: sidecar.phraseBait ?? [],
    source,
    normalisedSource: normalise(source),
  };

  assertFixture(fixture);

  return {
    fixture,
    control: sidecar.control,
    expect: sidecar.expect,
    mechanism: sidecar.mechanism,
    expandedMustNotContain: mustNotContain,
    expandedMustCapture: mustCapture,
    lexiconName,
    note: textToSections(sidecar.controlNote, sidecar.sections),
  };
}

/**
 * FD2b's substitution: the token becomes the negator vocabulary **in the
 * negator's own slot**, before anything is compiled, and never in `score.ts`.
 *
 * Nothing downstream can tell a substituted pattern from an authored one, which
 * is the point: `score.ts`, `patterns.ts` and `compile()` are not edited, and
 * `assertFixture`'s existing compile checks therefore validate the substituted
 * strings exactly as they validate authored ones.
 */
function expandLexicon(
  key: string,
  sidecar: ControlSidecar,
  context: ScoreControlContext,
): { mustNotContain: readonly string[]; mustCapture: readonly CaptureFact[] } {
  const tokens = [...sidecar.mustNotContain, ...sidecar.mustCapture.flatMap((fact) => fact.any)].filter(
    (source) => source.includes(LEXICON_TOKEN),
  );

  if (tokens.length > 0 && sidecar.lexicon === undefined) {
    throw new CorpusError(
      `${key}: a ${LEXICON_TOKEN} token with no "lexicon" key beside it; the token is fixed and ` +
        `carries no name of its own`,
    );
  }
  if (sidecar.lexicon !== undefined && tokens.length === 0) {
    throw new CorpusError(
      `${key}: a "lexicon" key with no ${LEXICON_TOKEN} token; the key names a vocabulary the ` +
        `control never reaches`,
    );
  }

  if (sidecar.lexicon === undefined) {
    // The legacy path, byte for byte: no rewrite, no normalisation, no boundary
    // change, no new key in the `Fixture`.
    return { mustNotContain: sidecar.mustNotContain, mustCapture: sidecar.mustCapture };
  }

  const terms = namedLexiconTerms(context.locale, sidecar.lexicon);
  // Validation rule (2): a lexicon this locale does not have. `negation` under
  // `--locale en` is exactly this, because FD2c's lexicons are locale-scoped.
  if (terms === undefined) {
    throw new CorpusError(
      `${key}: lexicon "${sidecar.lexicon}" is not a lexicon --locale ${context.locale} has`,
    );
  }
  // Validation rule (4), evaluated **once, at load, before any blinding** (B-3):
  // a named lexicon that loads zero terms as authored on disk is the half-empty
  // failure, reported here rather than producing a pattern that quietly matches
  // nothing. A `--blind-lexicon negation` run substitutes `(?!)` at the token
  // and never loads zero terms, so it cannot trip this — and reaches exit 3
  // instead of this usage exit 2.
  if (terms.length === 0) {
    throw new CorpusError(`${key}: lexicon "${sidecar.lexicon}" loads zero terms as authored on disk`);
  }

  const blind =
    context.blindLexicon !== undefined &&
    (context.blindLexicon === 'all' || context.blindLexicon === sidecar.lexicon);
  const expansion = lexiconAlternation(terms, blind);

  return {
    mustNotContain: sidecar.mustNotContain.map((source) => substitute(source, expansion)),
    mustCapture: sidecar.mustCapture.map((fact) => ({
      ...fact,
      any: fact.any.map((source) => substitute(source, expansion)),
    })),
  };
}

/** Exactly the 11 characters of the token; a `{{` that is not this is left alone. */
function substitute(source: string, expansion: string): string {
  return source.split(LEXICON_TOKEN).join(expansion);
}
