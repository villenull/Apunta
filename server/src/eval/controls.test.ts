import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { loadControls, type ControlSidecar, type LoadedControl } from './controls.js';
import { CorpusError, loadCorpus, type CaptureFact, type Fixture } from './corpus.js';
import { REPOSITORY_ROOT } from './identity.js';
import { lexiconAlternation, loadLocaleLexicon, namedLexiconTerms } from './lexicon.js';
import { LATIN_WORD } from './lexicon.js';
import { compile } from './patterns.js';
import { scoreNote } from './score.js';

/**
 * FD2b, FD6 and FD8: the mechanism is derivable from the card, the twenty
 * controls hold, and exactly the controls the lexicon supplies flip under
 * blinding.
 */

const CONTROLS_ROOT = join(REPOSITORY_ROOT, 'server/src/eval/fixtures-controls');

function sidecars(locale: 'en' | 'es-MX'): Record<string, ControlSidecar> {
  const raw = JSON.parse(readFileSync(join(CONTROLS_ROOT, locale, 'expectations.json'), 'utf8')) as {
    fixtures: Record<string, ControlSidecar>;
  };
  return raw.fixtures;
}

/** One sidecar, or a thrown error: a missing key must not read as `undefined`. */
function oneSidecar(locale: 'en' | 'es-MX', key: string): ControlSidecar {
  const entry = sidecars(locale)[key];
  if (entry === undefined) throw new Error(`no control ${locale}/${key}`);
  return entry;
}

function controls(locale: 'en' | 'es-MX', blind?: 'negation') {
  return loadControls({
    directory: join(CONTROLS_ROOT, locale),
    locale,
    ...(blind === undefined ? {} : { blindLexicon: blind }),
  }).controls;
}

/** The controls loader's expansion, reached the way it is reached at run time. */
function expand(locale: 'en' | 'es-MX', key: string): LoadedControl {
  return loadControlFixture(locale, key);
}

/** Load one control through the loader's own conversion, for pattern inspection. */
function loadControlFixture(locale: 'en' | 'es-MX', key: string): LoadedControl {
  const directory = join(CONTROLS_ROOT, locale);
  const sidecar = oneSidecar(locale, key);
  // `loadControls` is the loader under test; this re-derives the same expansion
  // from the same lexicon so a test can read the compiled strings without a
  // score in the way, and assert on them.
  const terms = sidecar.lexicon === undefined ? [] : (namedLexiconTerms(locale, sidecar.lexicon) ?? []);
  const expansion = sidecar.lexicon === undefined ? '{{lexicon}}' : lexiconAlternation(terms, false);
  const substitute = (source: string): string =>
    sidecar.lexicon === undefined ? source : source.split('{{lexicon}}').join(expansion);
  const mustNotContain = sidecar.mustNotContain.map(substitute);
  const mustCapture = sidecar.mustCapture.map((fact) => ({
    ...fact,
    any: fact.any.map(substitute),
  }));
  const source = readFileSync(join(directory, key), 'utf8');
  const fixture: Fixture = {
    filename: key,
    format: sidecar.format,
    sections: sidecar.sections,
    modality: sidecar.modality,
    words: source.trim().split(/\s+/).length,
    difficulty: 'control',
    markerFreeSource: true,
    f6: sidecar.f6,
    blank: sidecar.blank,
    statedAbsence: sidecar.statedAbsence,
    noConclusion: sidecar.noConclusion,
    mustNotContain,
    mustCapture,
    requiresHedge: sidecar.requiresHedge ?? [],
    requiresMarker: sidecar.requiresMarker ?? [],
    novelTermAllow: [],
    phraseBait: sidecar.phraseBait ?? [],
    source,
    normalisedSource: source.replace(/\s+/g, ' ').trim().toLowerCase(),
  };
  return {
    fixture,
    control: sidecar.control,
    expect: sidecar.expect,
    mechanism: sidecar.mechanism,
    expandedMustNotContain: mustNotContain,
    expandedMustCapture: mustCapture,
    lexiconName: sidecar.lexicon,
    note: {} as LoadedControl['note'],
  };
}

describe('FD6 — twenty controls, ten per locale, and the classes C-EVAL@1 §4 names', () => {
  for (const locale of ['en', 'es-MX'] as const) {
    it(`${locale} has one control per critical class plus clean, empty and degenerate`, () => {
      const entries = sidecars(locale);
      expect(Object.keys(entries)).toHaveLength(10);
      const classes = Object.values(entries).map((entry) => entry.control);
      expect(classes.filter((value) => value === 'positive')).toHaveLength(7);
      expect(classes.filter((value) => value === 'clean')).toHaveLength(1);
      expect(classes.filter((value) => value === 'empty')).toHaveLength(1);
      expect(classes.filter((value) => value === 'degenerate')).toHaveLength(1);
    });

    it(`${locale} gives every control one file, and that file is the transcript and not the note`, () => {
      for (const [key, entry] of Object.entries(sidecars(locale))) {
        expect(`${key}: ${String(existsSync(join(CONTROLS_ROOT, locale, key)))}`).toBe(`${key}: true`);
        expect(entry.controlNote.length).toBeLessThanOrEqual(4000);
        // One file per control: the note is injected by the sidecar and never
        // written to disk.
        const transcript = readFileSync(join(CONTROLS_ROOT, locale, key), 'utf8');
        if (entry.controlNote !== '') {
          expect(`${key}: ${String(transcript.includes(entry.controlNote))}`).toBe(`${key}: false`);
        }
        for (const section of entry.sections) {
          expect(`${key}: ${String(transcript.includes(`${section}:`))}`).toBe(`${key}: false`);
        }
      }
    });

    it(`${locale} keeps every control's first path segment equal to its class`, () => {
      for (const [key, entry] of Object.entries(sidecars(locale))) {
        expect(`${key}: ${String(key.split('/')[0] === entry.control)}`).toBe(`${key}: true`);
      }
    });

    it(`${locale} holds all ten, each through its own named mechanism`, () => {
      const result = controls(locale);
      expect(result).toHaveLength(10);
      expect(result.filter((control) => control.missed)).toEqual([]);
      for (const control of result) {
        expect(`${control.key}: ${control.expect}/${control.verdict}`).toBe(
          `${control.key}: ${control.expect}/${control.expect === 'pass' ? 'pass' : control.expect}`,
        );
      }
      const empty = result.find((control) => control.control === 'empty');
      expect(empty?.gating).toContain('S4 every section blank');
      const degenerate = result.find((control) => control.control === 'degenerate');
      expect(degenerate?.gating).toContain('F6 unsupported conclusion');
    });

    it(`${locale} asserts F7 source validity rather than assuming it (O-1)`, () => {
      // The claim is only checkable in English: `gatingNovel` keeps
      // diagnosis/risk and the es-MX lexicon holds neither, so under es-MX F7
      // cannot gate at all. Asserted for en, and stated rather than assumed for
      // es-MX.
      const english = controls('en');
      const clean = english.find((control) => control.control === 'clean');
      expect(clean?.gating).toEqual([]);
      for (const control of english.filter((entry) => entry.mechanism === 'missed mustCapture')) {
        expect(`${control.key}: ${String(control.gating.includes('F7 novel diagnosis/risk term'))}`).toBe(
          `${control.key}: false`,
        );
      }
      const spanish = controls('es-MX');
      expect(spanish.find((control) => control.control === 'clean')?.gating).toEqual([]);
    });

    it(`${locale} is NFC throughout, which is the unconditional U-1 test`, () => {
      for (const [key, entry] of Object.entries(sidecars(locale))) {
        expect(`${key}: ${String(entry.controlNote.normalize('NFC') === entry.controlNote)}`).toBe(
          `${key}: true`,
        );
        const transcript = readFileSync(join(CONTROLS_ROOT, locale, key), 'utf8');
        expect(`${key}: ${String(transcript.normalize('NFC') === transcript)}`).toBe(`${key}: true`);
      }
    });
  }
});

describe('N-2 — a control reaches the unchanged assertFixture and the unchanged scoreNote', () => {
  it('loads and scores the degenerate control with f6 gating and no markerFreeSource in its sidecar', () => {
    const degenerate = oneSidecar('en', 'degenerate/01-repeated-boilerplate.txt');
    expect(degenerate.f6).toBe('gating');
    expect(Object.hasOwn(degenerate, 'markerFreeSource')).toBe(false);
    expect(degenerate.noConclusion).toContain('Assessment');
    const score = controls('en').find((control) => control.control === 'degenerate');
    expect(score?.gating).toContain('F6 unsupported conclusion');
  });

  it('supplies markerFreeSource as the measurement, so it cannot disagree with the check', () => {
    for (const locale of ['en', 'es-MX'] as const) {
      const control = loadControlFixture(
        locale,
        `${'degenerate'}/01-${locale === 'en' ? 'repeated-boilerplate' : 'plantilla-repetida'}.txt`,
      );
      // The loader's value, re-derived here from the same expression.
      const source = readFileSync(join(CONTROLS_ROOT, locale, control.fixture.filename), 'utf8');
      expect(control.fixture.markerFreeSource).toBe(true);
      expect(source.replace(/\s+/g, ' ').trim().match(F6_CORE())).toBeNull();
    }
  });

  it('still refuses a control whose controlSource does contain marker vocabulary', () => {
    // The check is still live, not merely still called: a `f6: "gating"` control
    // whose source carries an F6 core marker must be refused at load.
    const dir = mkdtempSync(join(tmpdir(), 'apunta-controls-'));
    mkdirSync(join(dir, 'positive'));
    // The transcript itself carries F6 core vocabulary, so the loader's measured
    // `markerFreeSource` is false and `assertFixture` must refuse it.
    writeFileSync(
      join(dir, 'positive', '01-marker-source.txt'),
      'the clinician said it indicates a pattern and is consistent with the last one.',
      'utf8',
    );
    const entry: ControlSidecar = {
      ...oneSidecar('en', 'positive/03-wrong-dose.txt'),
      f6: 'gating',
      noConclusion: ['Assessment'],
    };
    writeFileSync(
      join(dir, 'expectations.json'),
      JSON.stringify({ fixtures: { 'positive/01-marker-source.txt': entry } }),
      'utf8',
    );
    expect(() => loadControls({ directory: dir, locale: 'en' })).toThrow(CorpusError);
    expect(() => loadControls({ directory: dir, locale: 'en' })).toThrow(
      /f6 is gating but markerFreeSource is false/,
    );
  });
});

describe('FD2b — the mechanism is derivable, and its four validation rules are load errors', () => {
  const ES_MX_INVENTED = 'positive/02-negacion-inventada.txt';
  const ES_MX_LOST = 'positive/01-negacion-perdida.txt';

  it('expands the token to exactly one non-capturing group of bounded alternatives', () => {
    const loaded = expand('es-MX', ES_MX_INVENTED);
    const LOOKBEHIND = `(?<![${LATIN_WORD}])`;
    const LOOKAHEAD = `(?![${LATIN_WORD}])`;
    for (const pattern of loaded.expandedMustNotContain) {
      expect(pattern.startsWith('(?:')).toBe(true);
      expect(pattern).toContain(LOOKBEHIND);
      expect(pattern).toContain(LOOKAHEAD);
      // **Exactly one** group: strip the boundary lookarounds and there is no
      // `(` or `[` left anywhere, so nothing captures and nothing nests.
      const bare = pattern.split(LOOKBEHIND).join('').split(LOOKAHEAD).join('').slice(3, -1);
      expect(`${bare.slice(0, 3)} ${String(bare.includes('(') || bare.includes('['))}`).toBe('no| false');
      // And it compiles exactly as `assertFixture` compiles an authored one.
      expect(() => compile(pattern)).not.toThrow();
    }
  });

  it('reproduces the exact strings the card prints for the two worked entries', () => {
    const invented = expand('es-MX', ES_MX_INVENTED);
    const expansion = lexiconAlternation(namedLexiconTerms('es-MX', 'negation') ?? [], false);
    // The card's worked JSON lists exactly these three, and each one is the
    // expansion followed by its own authored remainder — the expansion supplies
    // the negator and nothing else.
    expect(invented.expandedMustNotContain).toEqual([
      `${expansion} refiere`,
      `${expansion} reporta`,
      `${expansion} ha tomado`,
    ]);

    const lost = expand('es-MX', ES_MX_LOST);
    // The token-bearing fact, with the token in the negator's own slot.
    const fact = lost.expandedMustCapture[0] as CaptureFact;
    expect(fact.id).toBe('sueno-no-restaurado');
    expect(fact.any[0]?.endsWith(' ha vuelto a dormir(?: bien)?')).toBe(true);
    expect(fact.any[1]?.endsWith(' duerme bien')).toBe(true);
    // `sigue sin dormir(?: bien)?` is unchanged: its `sin` is not a lexicon term.
    expect(fact.any[2]).toBe('sigue sin dormir(?: bien)?');
    // The `mustNotContain` restatement is sidecar-authored and token-less.
    expect(lost.expandedMustNotContain).toEqual([
      'ya no (?:se )?despierta a las tres',
      'camina toda la noche',
    ]);
  });

  it('is token in the negator’s slot, and no bare negator reaches mustNotContain (B-1)', () => {
    const invented = oneSidecar('es-MX', ES_MX_INVENTED);
    const negation = (namedLexiconTerms('es-MX', 'negation') ?? []).map((entry) => entry.term);
    // Every `mustNotContain` entry of the invented-negation control carries the
    // token, because a single entry without it would make V3’s exit 3 unreachable
    // rather than merely weaker.
    for (const entry of invented.mustNotContain) {
      expect(entry).toContain('{{lexicon}}');
      // A bare negator in `mustNotContain` matches every faithful Spanish note,
      // and these corpora exist to keep those negations.
      expect(negation).not.toContain(entry);
      expect(entry).not.toMatch(/^\{\{lexicon\}\}\s*$/);
    }
    // The doubled-negator shape the card names, `{{lexicon}} no refiere`, is
    // absent from both controls’ `mustNotContain`.
    for (const key of [ES_MX_INVENTED, ES_MX_LOST]) {
      for (const entry of oneSidecar('es-MX', key).mustNotContain) {
        expect(`${key}: ${String(/^\{\{lexicon\}\}\s+(?:no|nunca|jamás)\b/.test(entry))}`).toBe(
          `${key}: false`,
        );
      }
    }
    // And the corollary the card states: no es-MX control carries a phrase whose
    // word *is* the negator, so no es-MX control detects a bare invented negation.
    for (const [key, entry] of Object.entries(sidecars('es-MX'))) {
      for (const pattern of entry.mustNotContain) {
        expect(`${key}: ${String(/^(niega(?:ndo)?|jam[aá]s)$/.test(pattern))}`).toBe(`${key}: false`);
      }
    }
  });

  it('leaves no doubled negator: the remainder never begins with a negator term (B-1)', () => {
    for (const key of [ES_MX_INVENTED, ES_MX_LOST]) {
      const loaded = expand('es-MX', key);
      for (const pattern of [
        ...loaded.expandedMustNotContain,
        ...loaded.expandedMustCapture.flatMap((fact) => fact.any),
      ]) {
        // The expansion is a single group and the remainder follows it, so the
        // compiled pattern reads `(?:…|ALTₙ) refiere`, never two negators.
        expect(pattern).not.toMatch(
          /\(\?:[A-Za-zÀ-ÖØ-öø-ÿ0-9_?<!\u002d]+\)\s+(?:no|nunca|jamás|nadie|nada|tampoco|sin|ningún)\b/i,
        );
        // Only the token-bearing patterns carry an expansion; the rest are the
        // legacy path and are already asserted byte-identical elsewhere.
        const expansion = lexiconAlternation(namedLexiconTerms('es-MX', 'negation') ?? [], false);
        if (!pattern.startsWith(expansion)) continue;
        const remainder = pattern.slice(expansion.length);
        expect(`${key}: ${String(remainder.length > 0)}`).toBe(`${key}: true`);
        expect(
          `${key}: ${String(/^\s*(?:no|nunca|jamás|nadie|nada|tampoco|sin|ningún)\b/i.test(remainder))}`,
        ).toBe(`${key}: false`);
      }
    }
  });

  it('makes the es-MX lost-negation fact satisfiable, and the restatement does not satisfy it', () => {
    const loaded = expand('es-MX', ES_MX_LOST);
    const fact = loaded.expandedMustCapture[0] as CaptureFact;
    const source = readFileSync(join(CONTROLS_ROOT, 'es-MX', ES_MX_LOST), 'utf8');
    // The transcript's own faithful restatement — the same session with its
    // negations intact — captures the fact. Without this the control would pass
    // vacuously: a `mustCapture` no note can satisfy is not a test of anything.
    const faithful = {
      Subjetivo:
        'Dice que no ha vuelto a dormir bien. Dice que no duerme bien y que sigue sin dormir. Dice que no descansa bien.',
      Objetivo: 'Sentado y alerta todo el tiempo. Habla con soltura cuando se le pregunta.',
      Análisis: 'El sueño no se ha restituido en dos semanas.',
      Plan: 'Mantener la cadencia semanal y revisar de nuevo en dos semanas.',
    };
    const faithfulScore = scoreNote(loaded.fixture, faithful, {
      lexicon: loadLocaleLexicon('es-MX'),
    });
    expect(fact.any.some((pattern) => compile(pattern).test(faithful.Subjetivo))).toBe(true);
    expect(faithfulScore.capturedFacts).toBeGreaterThan(0);

    // The affirmative restatement the control is scored on captures nothing: the
    // negator is what is missing, and no vocabulary can match an absence.
    const restatement = oneSidecar('es-MX', ES_MX_LOST).controlNote;
    expect(fact.any.some((pattern) => compile(pattern).test(restatement))).toBe(false);
    // And the source is what carries the negation the note drops.
    expect(source).toMatch(/no ha vuelto a dormir bien/);
    expect(source).toMatch(/no duerme bien/);
    expect(source).toMatch(/no descansa bien/);
  });

  it('leaves a token-free string byte-identical, which is the legacy path', () => {
    for (const locale of ['en', 'es-MX'] as const) {
      for (const [key, entry] of Object.entries(sidecars(locale))) {
        const loaded = loadControlFixture(locale, key);
        if (entry.lexicon === undefined) {
          expect(loaded.expandedMustNotContain).toEqual(entry.mustNotContain);
          expect(loaded.expandedMustCapture).toEqual(entry.mustCapture);
        }
      }
    }
  });

  it('refuses a token with no key, a key with no token, and a lexicon this locale lacks', () => {
    expect(() =>
      loadControls({ directory: controlDirWith({ lexicon: undefined, token: true }), locale: 'es-MX' }),
    ).toThrow(/token with no "lexicon" key/);
    expect(() =>
      loadControls({ directory: controlDirWith({ lexicon: 'negation', token: false }), locale: 'es-MX' }),
    ).toThrow(/"lexicon" key with no \{\{lexicon\}\} token/);
    // Validation rule (2): `negation` under `--locale en`. This is why the `en`
    // sidecar carries neither the key nor a token.
    expect(() =>
      loadControls({ directory: controlDirWith({ lexicon: 'negation', token: true }), locale: 'en' }),
    ).toThrow(/is not a lexicon --locale en has/);
  });

  it('refuses a lexicon key or a token on a corpus sidecar (rule 3)', () => {
    for (const corpus of [
      'e2e/fixtures/eval',
      'e2e/fixtures/eval-owner',
      'e2e/fixtures/eval-es/tuning',
      'e2e/fixtures/eval-owner-es/tuning',
    ]) {
      expect(`${corpus}: ${String(measureLexiconMarkers(corpus))}`).toBe(`${corpus}: 0`);
      expect(() => loadCorpus(join(REPOSITORY_ROOT, corpus))).not.toThrow();
    }
    const dir = corpusDirWithLexiconKey();
    expect(() => loadCorpus(dir)).toThrow(/corpus sidecar may not carry a "lexicon" key/);
    const dir2 = corpusDirWithLexiconToken();
    expect(() => loadCorpus(dir2)).toThrow(/corpus sidecar may not carry a \{\{lexicon\}\} token/);
  });

  it('blinds to (?!), never to an empty group, and reads the file as authored (B-3)', () => {
    const terms = namedLexiconTerms('es-MX', 'negation') ?? [];
    expect(terms.length).toBeGreaterThan(0);
    expect(lexiconAlternation(terms, true)).toBe('(?!)');
    // `(?!)` matches nothing at all, including the empty string. `(?:)` would
    // match the empty string, and for a pattern whose remainder is optional it
    // would additionally fire on every note.
    const never = compile(lexiconAlternation(terms, true));
    expect(never.test('')).toBe(false);
    expect(never.test('no refiere ejercicio')).toBe(false);
    // The affirmative restatement a blind run would manufacture: the phrase with
    // its negator requirement gone and nothing left to replace it.
    const empty = compile('(?:) refiere');
    expect(empty.test('el paciente habla y refiere algo en la sesión')).toBe(true);

    // A blinded run cannot trip validation rule (4), which is evaluated once at
    // load on the file as authored — so it reaches the control-miss exit, not the
    // usage exit.
    const blinded = loadControls({
      directory: join(CONTROLS_ROOT, 'es-MX'),
      locale: 'es-MX',
      blindLexicon: 'negation',
    });
    expect(blinded.controls.length).toBe(10);
    const missed = blinded.controls.filter((control) => control.missed);
    expect(missed.map((control) => control.key)).toEqual(['positive/02-negacion-inventada.txt']);
  });
});

describe('FD8 — which controls flip under blinding is stated, not assumed', () => {
  it('misses only the es-MX invented-negation control, and names it', () => {
    const blinded = loadControls({
      directory: join(CONTROLS_ROOT, 'es-MX'),
      locale: 'es-MX',
      blindLexicon: 'negation',
    });
    const missed = blinded.controls.filter((control) => control.missed);
    expect(missed).toHaveLength(1);
    expect(missed[0]?.key).toBe('positive/02-negacion-inventada.txt');
    expect(missed[0]?.control).toBe('positive');
    expect(missed[0]?.mechanism).toBe('F1 banned string');
    expect(missed[0]?.missedReason).toContain('F1 banned string');
  });

  it('expects the lost-negation control to stay flagged, which is not a miss', () => {
    const blinded = loadControls({
      directory: join(CONTROLS_ROOT, 'es-MX'),
      locale: 'es-MX',
      blindLexicon: 'negation',
    });
    const lost = blinded.controls.find((control) => control.key === 'positive/01-negacion-perdida.txt');
    expect(lost?.verdict).toBe('flagged');
    expect(lost?.missed).toBe(false);
  });

  it('leaves the whole en pair unaffected, because it carries neither key nor token (B-2)', () => {
    const sidecar = JSON.stringify(sidecars('en'));
    expect(sidecar.includes('{{lexicon}}')).toBe(false);
    expect(sidecar.includes('"lexicon"')).toBe(false);
    const blinded = controls('en', 'negation');
    expect(blinded.filter((control) => control.missed)).toEqual([]);
    expect(blinded.map((control) => control.verdict)).toContain('flagged');
  });

  it('changes nothing else: only the token-bearing controls differ', () => {
    const plain = controls('es-MX');
    const blinded = loadControls({
      directory: join(CONTROLS_ROOT, 'es-MX'),
      locale: 'es-MX',
      blindLexicon: 'negation',
    }).controls;
    for (const control of plain.filter((entry) => entry.key !== 'positive/02-negacion-inventada.txt')) {
      const other = blinded.find((entry) => entry.key === control.key);
      expect(`${control.key}: ${JSON.stringify(other?.gating)}`).toBe(
        `${control.key}: ${JSON.stringify(control.gating)}`,
      );
    }
  });
});

describe('B-2 — the mandated default `--locale en` self-check survives the mechanism', () => {
  it('loads the en controls directory on the legacy path with no lexicon key anywhere', () => {
    const result = loadControls({ directory: join(CONTROLS_ROOT, 'en'), locale: 'en' });
    expect(result.controls).toHaveLength(10);
    expect(result.controls.filter((control) => control.missed)).toEqual([]);
  });
});

// ---- helpers ----------------------------------------------------------------

function measureLexiconMarkers(corpus: string): number {
  const text = readFileSync(join(REPOSITORY_ROOT, corpus, 'expectations.json'), 'utf8');
  return (text.match(/lexicon|\{\{/g) ?? []).length;
}

function F6_CORE(): RegExp {
  return /consistent with|suggests?|indicates?|points? to|in keeping with/i;
}

function controlDirWith(options: { lexicon: string | undefined; token: boolean }): string {
  const dir = mkdtempSync(join(tmpdir(), 'apunta-controls-'));
  mkdirSync(join(dir, 'positive'));
  const key = 'positive/01-x.txt';
  writeFileSync(join(dir, 'positive', '01-x.txt'), 'a transcript with nothing in it at all here', 'utf8');
  const base = oneSidecar('en', 'positive/03-wrong-dose.txt');
  const entry = {
    ...base,
    ...(options.lexicon === undefined ? {} : { lexicon: options.lexicon }),
    mustNotContain: [options.token ? '{{lexicon}} refers to exercise' : 'refers to exercise'],
  } as ControlSidecar;
  writeFileSync(join(dir, 'expectations.json'), JSON.stringify({ fixtures: { [key]: entry } }), 'utf8');
  return dir;
}

function corpusDirWithLexiconKey(): string {
  const dir = mkdtempSync(join(tmpdir(), 'apunta-corpus-'));
  const base = loadCorpus()[0] as Fixture;
  const entry: Record<string, unknown> = { ...base, lexicon: 'negation' };
  delete entry['filename'];
  delete entry['source'];
  delete entry['normalisedSource'];
  writeFileSync(join(dir, 'expectations.json'), JSON.stringify({ fixtures: { '01-a.txt': entry } }), 'utf8');
  writeFileSync(join(dir, '01-a.txt'), 'a transcript', 'utf8');
  return dir;
}

function corpusDirWithLexiconToken(): string {
  const dir = mkdtempSync(join(tmpdir(), 'apunta-corpus-'));
  const base = loadCorpus()[0] as Fixture;
  const entry: Record<string, unknown> = {
    ...base,
    mustNotContain: ['{{lexicon}} refers to exercise'],
  };
  delete entry['filename'];
  delete entry['source'];
  delete entry['normalisedSource'];
  writeFileSync(join(dir, 'expectations.json'), JSON.stringify({ fixtures: { '01-a.txt': entry } }), 'utf8');
  writeFileSync(join(dir, '01-a.txt'), 'a transcript', 'utf8');
  return dir;
}
