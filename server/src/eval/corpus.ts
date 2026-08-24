import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { sectionsToText, type Sections } from '@apunta/shared';

import { collapse, compile, f6Core, normalise } from './patterns.js';

/**
 * Loading `e2e/fixtures/eval/` and checking it before a single model call.
 *
 * The rubric §7 lists five assertions the loader must run, and each one exists
 * because failing it would be reported as a *model* failure. The worst of them
 * is assertion 3: a fixture claiming `markerFreeSource` whose source in fact
 * contains F6's marker vocabulary would make the primary endpoint fire on
 * correct notes. Checked here, once, against the actual text.
 */

const evalDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'e2e', 'fixtures', 'eval');

export const EVAL_DIR = evalDir;

export interface StatedAbsence {
  readonly section: string;
  readonly any: readonly string[];
}

export interface CaptureFact {
  readonly id: string;
  readonly any: readonly string[];
  readonly tags?: readonly string[];
}

export interface HedgeRequirement {
  readonly topic: string;
  readonly marker: string;
}

export interface FixtureExpectations {
  readonly format: 'progress' | 'intake';
  readonly sections: readonly string[];
  readonly modality: string;
  readonly words: number;
  readonly difficulty: string;
  readonly markerFreeSource: boolean;
  readonly f6: 'gating' | 'flag';
  readonly blank: readonly string[];
  readonly statedAbsence: readonly StatedAbsence[];
  readonly noConclusion: readonly string[];
  readonly mustNotContain: readonly string[];
  readonly mustCapture: readonly CaptureFact[];
  readonly requiresHedge: readonly HedgeRequirement[];
  readonly requiresMarker: readonly { topic: string }[];
  readonly novelTermAllow: readonly string[];
  readonly phraseBait: readonly string[];
}

export interface Fixture extends FixtureExpectations {
  readonly filename: string;
  /** The transcript, exactly as written. */
  readonly source: string;
  /** Whitespace-collapsed, lowercased — what every comparison uses. */
  readonly normalisedSource: string;
}

export class CorpusError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CorpusError';
  }
}

interface ExpectationsFile {
  fixtures: Record<string, FixtureExpectations>;
}

export function loadCorpus(directory: string = evalDir): Fixture[] {
  const raw = JSON.parse(readFileSync(join(directory, 'expectations.json'), 'utf8')) as ExpectationsFile;

  const transcripts = readdirSync(directory).filter((name) => /^\d{2}-.*\.txt$/.test(name));
  const missing = transcripts.filter((name) => !(name in raw.fixtures));
  if (missing.length > 0) {
    // A fixture without stated expectations cannot be scored and would quietly
    // become a vibes check (`e2e/fixtures/eval/README.md`).
    throw new CorpusError(`no expectations.json entry for: ${missing.join(', ')}`);
  }

  const fixtures = Object.entries(raw.fixtures)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([filename, expectations]) => {
      const source = readFileSync(join(directory, filename), 'utf8');
      return { ...expectations, filename, source, normalisedSource: normalise(source) };
    });

  for (const fixture of fixtures) assertFixture(fixture);
  return fixtures;
}

/** The five assertions from rubric §7, each with the corpus bug it catches. */
export function assertFixture(fixture: Fixture): void {
  const known = new Set(fixture.sections);
  const named = [
    ...fixture.blank,
    ...fixture.statedAbsence.map((entry) => entry.section),
    ...fixture.noConclusion,
  ];
  for (const section of named) {
    if (!known.has(section)) {
      throw new CorpusError(`${fixture.filename}: "${section}" is not one of its sections`);
    }
  }

  const blanks = new Set(fixture.blank);
  for (const entry of fixture.statedAbsence) {
    if (blanks.has(entry.section)) {
      throw new CorpusError(
        `${fixture.filename}: "${entry.section}" is both blank and a stated absence; they are different answers`,
      );
    }
  }

  if (fixture.f6 === 'gating') {
    if (!fixture.markerFreeSource) {
      throw new CorpusError(`${fixture.filename}: f6 is gating but markerFreeSource is false`);
    }
    const hits = collapse(fixture.source).match(f6Core());
    if (hits !== null) {
      // The claim is verified, never trusted: a gating fixture whose own source
      // contains the marker vocabulary would make F6 fire on faithful notes.
      throw new CorpusError(
        `${fixture.filename}: claims markerFreeSource but its source contains ${hits.join(', ')}`,
      );
    }
  }

  const headers = sectionsToText(
    Object.fromEntries(fixture.sections.map((name) => [name, ''])) as Sections,
    fixture.sections,
  );
  for (const source of fixture.mustNotContain) {
    let pattern: RegExp;
    try {
      pattern = compile(source);
    } catch (error) {
      throw new CorpusError(
        `${fixture.filename}: mustNotContain /${source}/ does not compile: ${String(error)}`,
      );
    }
    if (pattern.test(headers)) {
      // `/\bplan\b/` matches the serialized `Plan:` header and would fire on
      // every note, including a perfect one.
      throw new CorpusError(
        `${fixture.filename}: mustNotContain /${source}/ matches its own section headers`,
      );
    }
  }

  for (const group of [
    ...fixture.mustCapture.flatMap((fact) => fact.any),
    ...fixture.statedAbsence.flatMap((entry) => entry.any),
    ...fixture.requiresHedge.flatMap((hedge) => [hedge.topic, hedge.marker]),
  ]) {
    try {
      compile(group);
    } catch (error) {
      throw new CorpusError(`${fixture.filename}: pattern /${group}/ does not compile: ${String(error)}`);
    }
  }
}

/**
 * The corpus's own arithmetic, printed beside every rate in the report.
 *
 * "A 0% unsupported-conclusion rate" over 132 observations and over 6 are
 * different claims, and without the denominator they render identically
 * (rubric §9).
 */
export interface Denominators {
  readonly fixtures: number;
  readonly sections: number;
  readonly blankSections: number;
  readonly statedAbsenceSections: number;
  readonly noConclusionGating: number;
  readonly noConclusionFlagged: number;
  readonly markerItems: number;
}

export function denominators(fixtures: readonly Fixture[]): Denominators {
  return {
    fixtures: fixtures.length,
    sections: fixtures.reduce((total, fixture) => total + fixture.sections.length, 0),
    blankSections: fixtures.reduce((total, fixture) => total + fixture.blank.length, 0),
    statedAbsenceSections: fixtures.reduce((total, fixture) => total + fixture.statedAbsence.length, 0),
    noConclusionGating: fixtures
      .filter((fixture) => fixture.f6 === 'gating')
      .reduce((total, fixture) => total + fixture.noConclusion.length, 0),
    noConclusionFlagged: fixtures
      .filter((fixture) => fixture.f6 === 'flag')
      .reduce((total, fixture) => total + fixture.noConclusion.length, 0),
    markerItems: fixtures.reduce((total, fixture) => total + fixture.requiresMarker.length, 0),
  };
}

/**
 * Which side of `DraftSource` a fixture goes in.
 *
 * A dictated fixture is speech-to-text output and must travel as `transcript`:
 * the instruction files treat the two differently, and `[unclear in
 * dictation]` belongs to the dictation path by owner answer 11. Sending a
 * dictation down the typed-notes path would make H5 unfailable for the wrong
 * reason.
 */
export function draftSourceFor(fixture: Fixture): { typedNotes?: string; transcript?: string } {
  return fixture.modality.startsWith('dictated')
    ? { transcript: fixture.source }
    : { typedNotes: fixture.source };
}
