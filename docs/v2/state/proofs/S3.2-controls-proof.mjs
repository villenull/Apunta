#!/usr/bin/env node
// S3.2 evaluation control proof — executable, synthetic, self-contained.
// Run: node docs/v2/state/proofs/S3.2-controls-proof.mjs   (exit 0 = every case holds)
//
// A PROOF, not production code and not card acceptance. It re-implements only as much of the
// eval scorer's load and score path as the three S3.2 findings turn on, so each can be watched
// failing and the corrected shape watched passing: no server, model, database, install, network,
// production guard or app module, and **no call to `assertFixture`**. Modelled from source:
//   collapse/normalise patterns.ts:64,:70 · compile patterns.ts:66-69 ('i'/'im', no 'u')
//   f6Core patterns.ts:14 · escapeRegExp lexicon.ts:65-67
//   mustNotContain corpus.ts:51 + score.ts:303-310 · mustCapture corpus.ts:29-33 + score.ts:342-349
//   F1 gating score.ts:328,:395 · sectionsToText shared/src/sections.ts:151-159 (+ opensWithSubheading
//   :164-166, note-labels.ts:33-39) · exit 2/1/0 cli.ts:114,:288
// Negation inventory: the owner-approved nine of docs/v2/cards/S4a.2.md:452. Every sentence
// below is hand-written synthetic: no patient note, held-out fixture or real transcript. The
// slot lists are authored for THIS synthetic source; they are not the S3.1 gold's lists.
//
// EXACT MODEL LIMITATIONS, asserted as cases rather than claimed in prose:
//   L1 `assertFixture` is never called. `loadControl` stands in for it, so corpus.ts's remaining
//      load-time rules are unexercised (case 19 names one this model loads and corpus.ts refuses).
//      Not evidence that a sidecar would load in production.
//   L2 No production acceptance is claimed: no threshold, guard or denominator moves.
//   L3 "every inventory term reaches every slot" is a statement about the substitution MECHANISM.
//      It is not a claim about grammatical Spanish: which term reads well in which slot is the
//      sidecar author's call and is not measured here.
//   L4 G1 and G2 are SURFACE-SYNTAX checks on the entry as written, not a parser for the sidecar's
//      regex language. A regex form with the same effect — `(?:{{lexicon}})`, or a token followed
//      by `\s*(?:o)?\s*no` instead of a literal ` no ` — is not what they look for. This proof
//      builds no general regex parser (that would be a production design choice, not a proof), so
//      the honest claim is narrow: as PROPOSED CLAUSE TEXT G1/G2 forbid the two shapes the
//      round-1 defects take, they do not close the loophole universally, and cases
//      `G1/G2 are surface-syntax checks…` below assert the walking-past forms actually load.

import assert from 'node:assert/strict';
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, rmSync, writeSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..', '..', '..');
// mkdtemp inside gitignored `build/` (.gitignore:55): this process created the one directory and
// only ever removes that one. Never os.tmpdir(), never a fixed shared path.
const SCRATCH = mkdtempSync(join(REPO, 'build', 's3.2-controls-proof-'));

// ---------------------------------------------------------------- model ----
const collapse = (t) => t.replace(/\s+/g, ' ').trim(); // patterns.ts:64
const normalise = (t) => collapse(t).toLowerCase(); // patterns.ts:70
const compile = (s) => new RegExp(s, s.includes('^') || s.includes('$') ? 'im' : 'i'); // patterns.ts:66-69
/** patterns.ts:14, transcribed whole — `markerFreeSource` must come from this, not a subset. */
const f6Core = () =>
  /\b(?:consistent with|suggestive of|indicative of|in keeping with|appears to be|secondary to|attributable to|precipitated by|exacerbated by|maintained by|driven by|in the context of|points? (?:to|toward|towards)|progress(?:ing)? toward|respond(?:s|ing|ed)? (?:well )?to|response to treatment|suggests?|suggesting|indicates?|indicating|consistent picture|presentation is consistent|working (?:diagnosis|formulation)|differential)\b/gi;
const escapeRegExp = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // lexicon.ts:65-67
// note-labels.ts:33-39 + sections.ts:164-166, so the `sectionsToText` citation is exact.
const MAX_LABEL_CHARS = 40;
const LABEL_BODY = `\\p{L}[\\p{L}\\p{N} /&()'’-]{0,${String(MAX_LABEL_CHARS - 1)}}`;
const LEADING_LABEL = new RegExp(`^(\\s*(?:[-•]\\s+)?)(${LABEL_BODY}:)(?=\\s|$)`, 'u');
const leadingLabel = (line) => {
  const m = LEADING_LABEL.exec(line);
  if (!m) return null;
  const label = m[2] ?? '';
  if (/\s:$/.test(label)) return null;
  return { prefix: m[1] ?? '', label };
};
const opensWithSubheading = (body) => {
  const first = body.split('\n', 1)[0] ?? '';
  const label = leadingLabel(first);
  return label !== null && label.prefix === '' && first.trimEnd() === label.label;
};
const sectionsToText = (s, order) =>
  order
    .map((n) => {
      const body = (s[n] ?? '').trim();
      if (body === '') return `${n}:`;
      return opensWithSubheading(body) ? `${n}:\n${body}` : `${n}: ${body}`;
    })
    .join('\n\n');
/** FD2c's BOUNDARY(alt): explicit Latin class, never `\p{…}` (compile has no 'u'). */
const BOUNDARY = (a) => `(?<![A-Za-zÀ-ÖØ-öø-ÿ0-9_])${a}(?![A-Za-zÀ-ÖØ-öø-ÿ0-9_])`;
const NEGATION_TERMS = ['no', 'nunca', 'jamás', 'ningún', 'ninguna', 'ninguno', 'nadie', 'nada', 'tampoco']; // S4a.2.md:452
/** Counted by the G2 guard as "already a negator". NOT lexicon vocabulary. */
const OTHER_NEGATORS = ['sin', 'niega', 'nega', 'sino'];
const TOKEN = '{{lexicon}}';
const hole = (p) => p.includes(TOKEN);
/** FD2c: locale-scoped. `en` reads only the committed clinical file. */
const enLexicons = () => ({
  clinical: readFileSync(join(REPO, 'e2e/fixtures/eval/lexicon/clinical-terms.txt'), 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '' && !l.startsWith('#'))
    .map((l) => l.split('\t')[0].trim()),
});
const esLexicons = () => ({ negation: [...NEGATION_TERMS] });
class CorpusError extends Error {
  constructor(m) {
    super(m);
    this.name = 'CorpusError';
  }
}

/** FD2b: one non-capturing group of escaped, boundary-wrapped alternatives. */
const expand = (alts, blind) => (blind ? '(?!)' : `(?:${alts.map((a) => BOUNDARY(escapeRegExp(a))).join('|')})`);
const substitute = (p, alts, blind) => (hole(p) ? p.split(TOKEN).join(expand(alts, blind)) : p);
/** The literal word right after a token, regex syntax stripped: `niega(?:ndo)?` -> `niega`. */
const wordAfterToken = (p) => {
  const i = p.indexOf(TOKEN) + TOKEN.length;
  return (p.slice(i).match(/^[^\p{L}]*(\p{L}+)/u)?.[1] ?? '').toLowerCase();
};
// FD2b's four load-time `CorpusError`s plus FD2c's locale scoping, with the ordering the proposal
// leaves ambiguous: 'authored' (the correction) evaluates the zero-term rule on the lexicon as
// authored on disk, BEFORE blinding, so a blinded run substitutes `(?!)` without tripping it;
// 'effective' is the "empties that lexicon" reading, and B-3 is the collision between the two.
// G1, G2 and G3 below are the exact clauses this proof proposes ADDING to rule (1)'s list — three
// sentences of proposal text, nothing more. They are not in the proposal as written.
// G3's class is DERIVED from the control's own `mechanism`, never from a field the sidecar can
// leave out; an optional opt-in would reopen the loophole for any control that forgets it. The
// one SCHEMA DELTA this proposes — and it is a proposal, not an adoption — is an optional
// `negationClass` sidecar key: absent means "derive it from `mechanism`", and any value outside
// the closed set (or one that contradicts `mechanism`) is a load-time CorpusError rather than a
// silent downgrade. No shipped schema in this repository carries `mechanism` or `negationClass`;
// see header L1 for what that already costs this model.
const NEGATION_CLASSES = ['invented-negation', 'other'];
const INVENTED_NEGATION_MECHANISMS = ['F1 banned string'];
function negationClass(sidecar) {
  const derived = INVENTED_NEGATION_MECHANISMS.includes(sidecar.mechanism) ? 'invented-negation' : 'other';
  if (sidecar.negationClass === undefined) return derived;
  if (!NEGATION_CLASSES.includes(sidecar.negationClass))
    throw new CorpusError(
      `${sidecar.key}: negationClass "${String(sidecar.negationClass)}" is not one of ${NEGATION_CLASSES.join(', ')}`,
    );
  if (sidecar.negationClass !== derived)
    throw new CorpusError(
      `${sidecar.key}: negationClass "${sidecar.negationClass}" contradicts mechanism "${String(sidecar.mechanism)}" (${derived})`,
    );
  return derived;
}
function loadControl(sidecar, ctx) {
  const { locale, blind = null, zeroTermCheck = 'authored', lexicons, guards = true } = ctx;
  const available = lexicons ?? (locale === 'en' ? enLexicons() : esLexicons());
  const klass = negationClass(sidecar);
  const all = [...sidecar.mustNotContain, ...sidecar.mustCapture.flatMap((f) => f.any)];
  if (sidecar.lexicon !== undefined) {
    if (zeroTermCheck === 'effective' && blind === sidecar.lexicon)
      throw new CorpusError(`${sidecar.key}: lexicon "${sidecar.lexicon}" loads zero terms`);
    const zero = (why) => new CorpusError(`${sidecar.key}: lexicon "${sidecar.lexicon}" ${why}`);
    if (!(sidecar.lexicon in available)) throw zero(`is not available for locale "${locale}"`);
    if (available[sidecar.lexicon].length === 0) throw zero('loads zero terms');
  }
  if (all.some(hole) && sidecar.lexicon === undefined)
    throw new CorpusError(`${sidecar.key}: ${TOKEN} with no "lexicon" key`);
  if (sidecar.lexicon !== undefined && !all.some(hole))
    throw new CorpusError(`${sidecar.key}: "lexicon" key with no token`);
  // `guards: false` loads a sidecar as the proposal's text stands TODAY, without G1-G3, so a
  // defect in that text can be demonstrated at all. Nothing else differs.
  // G1: an entry that is nothing but the token matches any note carrying an inventory negator.
  for (const p of guards ? all : [])
    if (p.split(TOKEN).join('').trim() === '')
      throw new CorpusError(
        `${sidecar.key}: /${p}/ is a bare token; it matches every note carrying an inventory negator`,
      );
  // G2: the token sits in the negator's slot, so the word after it may not be another negator.
  for (const p of guards ? all.filter(hole) : []) {
    const w = wordAfterToken(p);
    if (NEGATION_TERMS.includes(w) || OTHER_NEGATORS.includes(w))
      throw new CorpusError(
        `${sidecar.key}: /${p}/ puts "${w}" after ${TOKEN}: two negators, and no Spanish note can match it`,
      );
  }
  // G3: an invented-negation control's source carries no inventory negator. This is what makes a
  // phrase-anchored entry safe, and the proposal states it nowhere. The class comes from
  // `negationClass()`, i.e. from the control itself, so there is no opt-in to forget.
  if (guards && klass === 'invented-negation') {
    for (const t of NEGATION_TERMS)
      if (compile(BOUNDARY(escapeRegExp(t))).test(collapse(sidecar.controlSource)))
        throw new CorpusError(
          `${sidecar.key}: invented-negation controlSource carries "${t}"; the source must be negation-free`,
        );
  }

  const isBlind = sidecar.lexicon !== undefined && blind === sidecar.lexicon;
  const alts = isBlind ? [] : available[sidecar.lexicon];
  const fixture = {
    ...sidecar,
    source: sidecar.controlSource,
    normalisedSource: normalise(sidecar.controlSource),
    markerFreeSource: collapse(sidecar.controlSource).match(f6Core()) === null, // corpus.ts:126-134
    words: sidecar.controlSource.split(/\s+/).filter(Boolean).length,
    difficulty: 'control',
    novelTermAllow: [],
    requiresHedge: [],
    requiresMarker: [],
    mustNotContain: sidecar.mustNotContain.map((p) => substitute(p, alts, isBlind)),
    mustCapture: sidecar.mustCapture.map((f) => ({ ...f, any: f.any.map((p) => substitute(p, alts, isBlind)) })),
  };
  // corpus.ts:137-168 still applies to the substituted strings, unchanged.
  const headers = sectionsToText(Object.fromEntries(fixture.sections.map((n) => [n, ''])), fixture.sections);
  for (const p of [...fixture.mustNotContain, ...fixture.mustCapture.flatMap((f) => f.any)]) {
    let re;
    try {
      re = compile(p);
    } catch (error) {
      throw new CorpusError(`${sidecar.key}: /${p}/ does not compile: ${String(error)}`);
    }
    if (fixture.mustNotContain.includes(p) && re.test(headers))
      throw new CorpusError(`${sidecar.key}: mustNotContain /${p}/ matches its own section headers`);
  }
  return fixture;
}

/** Only the score fields FD6's predicates read (score.ts:87,:92,:328,:395,:418-419). */
function scoreControl(f) {
  const text = collapse(sectionsToText(f.controlSections, f.sections));
  const bannedHits = f.mustNotContain.filter((p) => compile(p).test(text));
  const capturedFacts = f.mustCapture.filter((c) => c.any.some((p) => compile(p).test(text))).length;
  return { gating: bannedHits.length > 0 ? ['F1 banned string'] : [], capturedFacts, totalFacts: f.mustCapture.length };
}
/** FD6: flagged ⇔ gating.length > 0 or capturedFacts < totalFacts; else pass. */
const verdict = (s) => (s.gating.length > 0 || s.capturedFacts < s.totalFacts ? 'flagged' : 'pass');
/** 3 = missed control (reserved), 2 = CorpusError/usage, 0 = every control holds. */
function runControls(sidecars, ctx) {
  const missed = [];
  for (const sidecar of sidecars) {
    let fixture;
    try {
      fixture = loadControl(sidecar, ctx);
    } catch (error) {
      if (error instanceof CorpusError) return { exit: 2, reason: error.message };
      throw error;
    }
    if (verdict(scoreControl(fixture)) !== sidecar.expect)
      missed.push(`${sidecar.key} (${sidecar.mechanism})`);
  }
  return missed.length > 0
    ? { exit: 3, reason: `missed control: ${missed.join(', ')}` }
    : { exit: 0, reason: 'all controls hold' };
}

// ------------------------------------------------------------- controls ----
// Section names as the es-MX tuning corpus and the en corpus spell them
// (e2e/fixtures/eval-es/tuning/expectations.json, e2e/fixtures/eval/expectations.json).
const ES = ['Subjetivo', 'Objetivo', 'Analisis', 'Plan'];
const EN = ['Subjective', 'Objective', 'Assessment', 'Plan'];
/** One clause per note: a combined note can hide a defect behind its good half. */
const note = (body, sections = ES) => Object.fromEntries(sections.map((n, i) => [n, i === 0 ? body : '']));

// SOURCES. Synthetic, and each holds the property its control depends on (asserted below).
const ES_INV_SOURCE = 'el paciente camina todos los dias y su hermano tambien es hipertenso'; // G3: no negator
const ES_LOST_SOURCE = 'el paciente no duerme bien y sigue sin dormir bien'; // carries the negation
const EN_INV_SOURCE = 'the patient walks every day and his brother is hypertensive'; // no negator
const EN_LOST_SOURCE = 'the patient is still not sleeping well'; // carries the negation

const ES_INV_BAD = 'No refiere antecedentes de hipertension.';
const ES_INV_GOOD = 'Refiere antecedentes de hipertension.';
const ES_LOST_BAD = 'Ya duerme bien.';
const ES_LOST_GOOD = 'Sigue sin dormir bien.';
const EN_INV_BAD = 'Denies any history of hypertension.';
const EN_INV_GOOD = 'Reports a history of hypertension.';
const EN_LOST_BAD = 'Sleeping well again.';
/** Only to census the ENGLISH sources in the source-property case; this is NOT a lexicon. */
const EN_NEGATORS = ['not', 'no', 'never', 'none', 'neither', 'nor', 'nothing', 'cannot', 'denies', 'denying'];
const EN_LOST_GOOD = 'Still not sleeping well.';

/** The proposal's worked examples verbatim (S3.2-AMENDMENT-PROPOSAL-v2.md:622-627, :650-653). */
const AS_WRITTEN = {
  invented: {
    key: 'positive/02-negacion-inventada.txt',
    control: 'positive',
    expect: 'flagged',
    mechanism: 'F1 banned string',
    lexicon: 'negation',
    sections: ES,
    controlSource: ES_INV_SOURCE,
    controlSections: note(ES_INV_BAD),
    mustNotContain: [`${TOKEN} no refiere`, `${TOKEN} no reporta`, `${TOKEN} niega(?:ndo)?`, `${TOKEN} jam[aá]s`],
    mustCapture: [],
  },
  lost: {
    key: 'positive/01-negacion-perdida.txt',
    control: 'positive',
    expect: 'flagged',
    mechanism: 'missed mustCapture',
    lexicon: 'negation',
    sections: ES,
    controlSource: ES_LOST_SOURCE,
    controlSections: note(ES_LOST_BAD),
    mustNotContain: ['ya (?:volvió|ha vuelto) a dormir bien'],
    mustCapture: [{ id: 'sueno-no-restaurado', any: [`${TOKEN} (?:puede )?dormir`, `${TOKEN} dorm(?:e|ió|ir)`] }],
  },
};

// The correction, for a source this proof authors. Three mechanical rules, so a reviewer can
// re-derive every entry: an inventory negator is replaced BY the token (the token sits in the
// negator's slot); an entry whose negator is a verb (`niega`, `nega`) or `sin` — none of which is
// in the nine-term inventory — carries no token and stays an authored literal; no entry is a bare
// negator and none puts a second negator after the token (G1, G2). The lost-negation fact quotes
// the gold's own single-clause alternatives (eval-es/tuning lost-negation/01-sin-dormir, fact
// `sueno-no-restaurado`), one clause each.
const CORRECTED = {
  invented: {
    key: 'positive/02-negacion-inventada.txt',
    control: 'positive',
    expect: 'flagged',
    mechanism: 'F1 banned string',
    lexicon: 'negation',
    sections: ES,
    controlSource: ES_INV_SOURCE,
    controlSections: note(ES_INV_BAD),
    mustNotContain: [
      `${TOKEN} refiere`,
      `${TOKEN} reporta`,
      `${TOKEN} menciona`,
      `${TOKEN} hay antecedentes de`,
      `${TOKEN} tiene antecedentes de`,
      `${TOKEN} ha tenido antecedentes de`,
      `${TOKEN} camina`,
      'niega(?:ndo)?',
      'nega tener',
      'sin antecedentes de',
    ],
    mustCapture: [],
  },
  lost: {
    key: 'positive/01-negacion-perdida.txt',
    control: 'positive',
    expect: 'flagged',
    mechanism: 'missed mustCapture',
    lexicon: 'negation',
    sections: ES,
    controlSource: ES_LOST_SOURCE,
    controlSections: note(ES_LOST_BAD),
    // Affirmative restatements, sidecar-authored and token-free. Each carries a `ya ` anchor so it
    // cannot match INSIDE a faithful negated form that the same control's fact accepts.
    mustNotContain: [
      'ya duerme(?:ndo)? (?:bien|de corrido)',
      'ya (?:volvió|ha vuelto) a dormir(?: bien)?',
      'sueño (?:restaurado|normalizado|resuelto)',
      'insomnio (?:resolto|corregido|desapareci[óo])',
    ],
    mustCapture: [
      {
        id: 'sueno-no-restaurado',
        any: [
          `${TOKEN} ha vuelto a dormir(?: bien)?`,
          `${TOKEN} volvi[óo] a dormir(?: bien)?`,
          `${TOKEN} duerme bien`,
          `${TOKEN} noche (?:limpia|bien)`,
          `${TOKEN} descansa bien`,
          `el sueño ${TOKEN} (?:volvió|ha vuelto)`,
          'sigue sin dormir(?: bien)?',
        ],
      },
    ],
  },
};
/** B-2's correction: the `en` controls carry no token at all and score the legacy path. */
/** Their `controlSections` are keyed by EN, the sidecar's own `sections` — the `ES` default of
 *  `note()` once left the body unreachable behind keys the scorer never reads, and the EN invented
 *  control silently missed. A case now scores each sidecar's OWN stored sections. */
const EN_LEGACY = {
  invented: {
    key: 'positive/02-invented-negation.txt',
    control: 'positive',
    expect: 'flagged',
    mechanism: 'F1 banned string',
    sections: EN,
    controlSource: EN_INV_SOURCE,
    controlSections: note(EN_INV_BAD, EN),
    mustNotContain: ['denies', 'denying', 'never (?:takes?|took)'],
    mustCapture: [],
  },
  lost: {
    key: 'positive/01-lost-negation.txt',
    control: 'positive',
    expect: 'flagged',
    mechanism: 'missed mustCapture',
    sections: EN,
    controlSource: EN_LOST_SOURCE,
    controlSections: note(EN_LOST_BAD, EN),
    mustNotContain: [
      'sleeping well again',
      'sleeping well now',
      'sleep (?:is )?restored',
      'insomnia (?:resolved|cleared)',
    ],
    mustCapture: [
      { id: 'sleep-not-restored', any: ['not (?:sleeping|slept) well', 'still not (?:sleeping|slept)', 'has not slept well'] },
    ],
  },
};
const hits = (f, s) => {
  const t = collapse(sectionsToText(s, f.sections));
  return f.mustNotContain.filter((p) => compile(p).test(t));
};
const captured = (f, s) => {
  const t = collapse(sectionsToText(s, f.sections));
  return f.mustCapture.filter((c) => c.any.some((p) => compile(p).test(t)));
};
const PAIRS = [
  ['es invented-negation', CORRECTED.invented, ES_INV_BAD, ES_INV_GOOD, { locale: 'es-MX' }],
  ['es lost-negation', CORRECTED.lost, ES_LOST_BAD, ES_LOST_GOOD, { locale: 'es-MX' }],
  ['en invented-negation', EN_LEGACY.invented, EN_INV_BAD, EN_INV_GOOD, { locale: 'en' }],
  ['en lost-negation', EN_LEGACY.lost, EN_LOST_BAD, EN_LOST_GOOD, { locale: 'en' }],
];
/** A note string as the sections object the scorer actually serialises. */
const asNote = (sidecar, text) => note(text, sidecar.sections);

// ------------------------------------------------------------------ cases --
const cases = [];
const test = (name, fn) => cases.push([name, fn]);
const es = (extra = {}) => ({ locale: 'es-MX', ...extra }); // the es-MX run context

const TODAY = { guards: false }; // the proposal's text as it stands, without the three added clauses
test('B-1 DEFECT: prefixing the token demands two negators, so the control reads `pass` and exits 3', () => {
  const f = loadControl(AS_WRITTEN.invented, { ...es(), ...TODAY });
  assert.ok(f.mustNotContain[0].startsWith('(?:'), 'expansion is one non-capturing group');
  assert.ok(f.mustNotContain[0].endsWith(' no refiere'), 'and the phrase still carries its own negator');
  assert.equal(hits(f, note(ES_INV_BAD)).length, 0, 'a note inventing a negation is caught by nothing');
  assert.equal(hits(f, note(ES_INV_GOOD)).length, 0, 'and the entry is inert on the faithful note too');
  const r = runControls([AS_WRITTEN.invented], { ...es(), ...TODAY }); // V2 expects exit 0 on a correct implementation
  assert.equal(r.exit, 3);
  assert.match(r.reason, /missed control: positive\/02-negacion-inventada\.txt/);
});
test('B-1 DEFECT: the same defect in the fact — two gold alternatives the correction has to quote', () => {
  const f = loadControl(AS_WRITTEN.lost, { ...es(), ...TODAY });
  assert.equal(captured(f, note('No puede dormir bien.')).length, 1, '`no puede dormir` does match');
  assert.equal(captured(f, note('Sigue sin dormir bien.')).length, 0, '"sigue sin dormir bien" is a gold alternative');
  assert.equal(captured(f, note('Ninguna noche limpia.')).length, 0, 'so is "ninguna noche limpia"');
});
test('B-1 FIX: token in the negator slot discriminates, in both directions', () => {
  const inv = loadControl(CORRECTED.invented, es());
  assert.ok(hits(inv, note(ES_INV_BAD)).length > 0, 'the invented negation is caught');
  assert.equal(hits(inv, note(ES_INV_GOOD)).length, 0, 'and nothing fires on the faithful note');
  const lost = loadControl(CORRECTED.lost, es());
  assert.ok(hits(lost, note(ES_LOST_BAD)).length > 0, 'the affirmative restatement is caught');
  assert.equal(captured(lost, note(ES_LOST_GOOD)).length, 1, 'the faithful note keeps its negation');
});
test('B-1 FIX: every bad control has a paired faithful control that passes — one clause per side, both languages', () => {
  for (const [name, sidecar, bad, good, ctx] of PAIRS) {
    // The bad side is the sidecar's OWN stored `controlSections`, scored before any note is
    // rebuilt: a rebuild would replace the very field that can be keyed wrongly (round 2).
    assert.deepEqual(Object.keys(sidecar.controlSections), sidecar.sections, `${name}: stored controlSections are keyed by its own sections`);
    assert.equal(
      collapse(sectionsToText(sidecar.controlSections, sidecar.sections)).includes(bad),
      true,
      `${name}: the stored bad text is reachable at all`,
    );
    assert.equal(runControls([sidecar], ctx).exit, 0, `${name}: bad control undetected`);
    assert.equal(
      runControls([{ ...sidecar, expect: 'pass', controlSections: asNote(sidecar, good) }], ctx).exit,
      0,
      `${name}: faithful pair failed`,
    );
  }
});
test('B-1 FIX: no entry of any control fires on its own faithful note — the bare-negator loophole, measured', () => {
  for (const [name, sidecar, , good, ctx] of PAIRS) {
    const f = loadControl(sidecar, ctx);
    const t = collapse(sectionsToText(good, f.sections));
    for (const p of f.mustNotContain)
      assert.equal(compile(p).test(t), false, `${name}: /${p}/ fires on its own faithful note`);
  }
});
test('B-1 FIX: a single-clause paraphrase is still flagged, and which gate caught it is recorded', () => {
  const lost = loadControl(CORRECTED.lost, es());
  assert.equal(hits(lost, note('Duerme bien.')).length, 0, 'the restatement list is phrase-authored and evadable');
  assert.equal(captured(lost, note('Duerme bien.')).length, 0, 'the missing mustCapture fact is what flags it');
  assert.equal(verdict(scoreControl({ ...lost, controlSections: note('Duerme bien.') })), 'flagged');
  assert.equal(runControls([{ ...CORRECTED.lost, controlSections: note('Duerme bien.') }], es()).exit, 0);
});
test('B-1 FIX: every supported slot discriminates — a negator fires it, the bare phrase does not', () => {
  const inv = loadControl(CORRECTED.invented, es());
  const slots = CORRECTED.invented.mustNotContain.filter(hole).map((p) => p.split(TOKEN)[1].trim());
  assert.ok(slots.length >= 6, `expected several negator slots, got ${String(slots.length)}`);
  for (const phrase of slots) {
    assert.equal(hits(inv, note(phrase)).length, 0, `${phrase}: fires with no negator at all`);
    for (const t of NEGATION_TERMS)
      assert.ok(hits(inv, note(`${t} ${phrase}`)).length > 0, `${t} ${phrase}: the term never reaches the slot`);
  }
  const lost = loadControl(CORRECTED.lost, es());
  for (const alt of CORRECTED.lost.mustCapture[0].any.filter(hole))
    assert.equal(captured(lost, note(alt.split(TOKEN)[1].trim())).length, 0, `${alt}: captured with no negator`);
  assert.equal(captured(lost, note('Sigue sin dormir bien.')).length, 1, 'and the token-free gold alternative still captures');
});
test('B-1 FIX: G2 — a doubled negator after the token is refused at load, not merely discouraged', () => {
  for (const p of [`${TOKEN} no refiere`, `${TOKEN} niega(?:ndo)?`, `${TOKEN} sin antecedentes de`, `sigue ${TOKEN} sin dormir(?: bien)?`.slice(6)]) {
    const r = runControls([{ ...CORRECTED.invented, mustNotContain: [p] }], es());
    assert.equal(r.exit, 2, `${p}: not refused`);
    assert.match(r.reason, /two negators/, `${p}: ${r.reason}`);
  }
  const named = runControls([{ ...CORRECTED.invented, mustNotContain: [`${TOKEN} no refiere`] }], es());
  assert.match(named.reason, /puts "no" after/, 'and the refusal names the second negator');
  const asWritten = runControls([AS_WRITTEN.invented], { ...es(), ...TODAY });
  assert.equal(asWritten.exit, 3, 'and the as-written entries reach the scorer at all');
  assert.equal(runControls([AS_WRITTEN.invented], es()).exit, 2, 'whereas with G2 they are refused at load, before any scoring');
});
test('B-1 FIX: G1 — a bare token entry is refused, and it really would match every note carrying an inventory negator', () => {
  const r = runControls([{ ...CORRECTED.invented, mustNotContain: [TOKEN] }], es());
  assert.equal(r.exit, 2);
  assert.match(r.reason, /is a bare token; it matches every note carrying an inventory negator/);
  // It cannot be loaded, so drive the expansion the loader would have substituted:
  const bare = compile(expand(NEGATION_TERMS, false));
  assert.ok(bare.test('Subjetivo: Ninguna noche limpia.Objetivo: Plan:'), 'it flags a FAITHFUL restatement, on the negator alone');
  assert.equal(bare.test('Subjetivo: Duerme bien.Objetivo: Plan:'), false, 'and stays silent on the unfaithful one it was meant to catch');
});
test('G1/G2 are surface-syntax checks: equivalent-in-effect regex forms walk past them (L4)', () => {
  // The hazard G1 exists for, written in regex syntax. `(?:TOKEN)` is not "nothing but the token"
  // as a string, and its expansion is exactly the bare one.
  const walkG1 = { ...CORRECTED.invented, mustNotContain: [`(?:${TOKEN})`], controlSections: note('Ninguna noche limpia.') };
  const r1 = runControls([walkG1], es());
  assert.equal(r1.exit, 0, '(?:TOKEN) is neither refused (2) nor missed (3): G1 reads the entry as written');
  const expanded = compile(loadControl(walkG1, es()).mustNotContain[0]);
  assert.ok(expanded.test('Subjetivo: Ninguna noche limpia.'), 'and it still fires on the negator alone, flagging a FAITHFUL restatement');
  // The round-1 doubled-negator defect again, with the second negator reached through a regex
  // rather than a literal space. G2 reads the LITERAL word after the token, which here is `s`
  // (out of `\s*`), not `no` — so nothing refuses it and the control is inert on the note it
  // means to catch.
  const walkG2 = `${TOKEN}\\s*no\\s+refiere`;
  const r2 = runControls([{ ...CORRECTED.invented, mustNotContain: [walkG2], controlSections: note('No refiere antecedentes.') }], es());
  assert.equal(wordAfterToken(walkG2), 's', 'the word G2 reads is `s`, out of the `\\s*`');
  assert.equal(r2.exit, 3, 'the control loads and then MISSES the invented negation: the defect G2 exists for');
  const doubled = compile(loadControl({ ...CORRECTED.invented, mustNotContain: [walkG2] }, es()).mustNotContain[0]);
  assert.ok(doubled.test('Subjetivo: No no refiere antecedentes.'), 'it demands a doubled negator instead');
  assert.equal(doubled.test('Subjetivo: No refiere antecedentes.'), false, 'and is silent on the note it was written for');
  // What G1/G2 DO hold, stated narrowly and measured: the two literal shapes are refused at load.
  assert.equal(runControls([{ ...CORRECTED.invented, mustNotContain: [TOKEN] }], es()).exit, 2, 'the bare token');
  assert.equal(runControls([{ ...CORRECTED.invented, mustNotContain: [`${TOKEN} no refiere`] }], es()).exit, 2, 'the doubled negator');
});
test('B-1 FIX: G3 — the bare `jam[aá]s` entry is the loophole, and the control’s own class closes it', () => {
  // Measured, not asserted: the gold's own bare entry against a source that carries `jamás`,
  // scored with the guards off, i.e. the proposal's text as it stands today.
  const leaky = { ...CORRECTED.invented, lexicon: undefined, mustNotContain: ['jam[aá]s'] };
  assert.equal(leaky.precondition, undefined, 'there is no opt-in field left to set');
  assert.equal(leaky.negationClass, undefined, 'nor a classification the sidecar could omit');
  assert.equal(
    runControls([{ ...leaky, expect: 'pass', controlSections: note('Jamás ha tenido antecedentes de hipertension.') }], { ...es(), ...TODAY })
      .exit,
    3,
    "without G3 the bare entry flags the source's own negation, restated faithfully",
  );
  const withNegator = { ...leaky, controlSource: 'el paciente jamás ha tenido antecedentes de hipertension' };
  const r = runControls([withNegator], es());
  assert.equal(r.exit, 2, 'and with G3, the same source is refused at load — classified from its mechanism, not opt-in');
  assert.match(r.reason, /invented-negation controlSource carries "jamás"/);
  // A lost-negation control is NOT in the class, so its negation-carrying source is not refused:
  // G3 is scoped to the class it claims, and the scope is measured rather than asserted.
  assert.equal(runControls([{ ...CORRECTED.lost, controlSource: ES_LOST_SOURCE }], es()).exit, 0);
  const inv = loadControl(CORRECTED.invented, es());
  assert.ok(hits(inv, note('Jamás ha tenido antecedentes de hipertension.')).length > 0, 'phrase-anchored: still caught');
});
test('G3 classification: absent derives from the control; a wrong or unknown value is refused', () => {
  assert.equal(negationClass(CORRECTED.invented), 'invented-negation', 'derived from `mechanism`');
  assert.equal(negationClass(CORRECTED.lost), 'other', 'and a lost-negation control is not in the class');
  assert.equal(negationClass({ ...CORRECTED.invented, negationClass: 'invented-negation' }), 'invented-negation', 'an explicit correct value agrees');
  for (const [value, why] of [
    ['negation-free-source', 'the round-2 opt-in string is not a class'],
    ['invented', 'not in the closed set'],
    [3, 'not a string'],
  ])
    assert.throws(
      () => negationClass({ ...CORRECTED.invented, negationClass: value }),
      /negationClass/,
      `${why}: ${JSON.stringify(value)} was not refused`,
    );
  assert.throws(
    () => negationClass({ ...CORRECTED.lost, negationClass: 'invented-negation' }),
    /contradicts mechanism/,
    'a class that contradicts the mechanism is refused, not silently downgraded',
  );
  // Refused at LOAD, with the sidecar's own key, and before any scoring.
  const r = runControls([{ ...CORRECTED.lost, negationClass: 'invented-negation' }], es());
  assert.equal(r.exit, 2);
  assert.match(r.reason, /negationClass "invented-negation" contradicts mechanism "missed mustCapture"/);
});
test('B-1 FIX: every source holds the property its control depends on', () => {
  const census = (terms) => new RegExp(terms.map((t) => BOUNDARY(escapeRegExp(t))).join('|'), 'i');
  const esInventory = census(NEGATION_TERMS);
  const enInventory = census(EN_NEGATORS); // the nine are es-MX's; English has no such lexicon (B-2)
  for (const [label, src, free, re] of [
    ['ES_INV_SOURCE', ES_INV_SOURCE, true, esInventory],
    ['ES_LOST_SOURCE', ES_LOST_SOURCE, false, esInventory],
    ['EN_INV_SOURCE', EN_INV_SOURCE, true, enInventory],
    ['EN_LOST_SOURCE', EN_LOST_SOURCE, false, enInventory],
  ])
    assert.equal(re.test(collapse(src)), !free, `${label}: ${free ? 'carries' : 'carries no'} negator`);
  assert.ok(esInventory.test(collapse(ES_LOST_SOURCE)) && enInventory.test(collapse(EN_LOST_SOURCE)), 'both lost sources carry one');
});
test('B-1 FIX: `(?!)` and not `(?:)`, and the review\'s stated reason is false for a mandatory remainder', () => {
  assert.equal(compile('(?:) no refiere').test('el paciente refiere antecedentes'), false, 'remainder is mandatory');
  assert.equal(compile('(?:) refiere').test('el paciente refiere antecedentes'), true, 'so the reason does not hold as written');
  assert.equal(
    hits(loadControl(CORRECTED.invented, { locale: 'es-MX', blind: 'negation' }), note(ES_INV_BAD)).length,
    0,
    '(?!) removes gating',
  );
});
test('B-2 DEFECT: `negation` under --locale en is a load-time CorpusError — the default self-check dies', () => {
  const r = runControls([AS_WRITTEN.invented], { locale: 'en', ...TODAY });
  assert.equal(r.exit, 2);
  assert.match(r.reason, /lexicon "negation" is not available for locale "en"/);
});
test('B-2 FIX: English controls load through the literal legacy path, with no Spanish lexicon', () => {
  for (const [name, sidecar, bad, good, ctx] of PAIRS.filter(([n]) => n.startsWith('en'))) {
    const before = JSON.stringify([sidecar.mustNotContain, sidecar.mustCapture]);
    const f = loadControl(sidecar, ctx);
    assert.equal(JSON.stringify([f.mustNotContain, f.mustCapture]), before, `${name}: legacy path is byte-identical`);
    assert.ok(hits(f, note(bad, EN)).length > 0, `${name}: the English control still discriminates`);
    assert.equal(captured(f, note(good, EN)).length, sidecar.mustCapture.length, `${name}: the faithful note satisfies its fact`);
  }
  const noKey = runControls([{ ...AS_WRITTEN.invented, lexicon: undefined }], { ...es(), ...TODAY });
  assert.equal(noKey.exit, 2, 'a token with no lexicon key is still refused');
  assert.match(noKey.reason, /with no "lexicon" key/);
  const noToken = runControls([{ ...CORRECTED.invented, mustNotContain: ['no refiere'] }], es());
  assert.equal(noToken.exit, 2, 'and a lexicon key with no token too');
  assert.match(noToken.reason, /"lexicon" key with no token/);
});
test('B-3 DEFECT: reading blinding as "empties that lexicon" trips the zero-term rule — exit 2, not 3', () => {
  const r = runControls([AS_WRITTEN.invented], { ...es({ blind: 'negation', zeroTermCheck: 'effective' }), ...TODAY });
  assert.equal(r.exit, 2);
  assert.match(r.reason, /loads zero terms/);
});
test('B-3 FIX: the authored-lexicon ordering reaches the reserved exit 3, and only the intended control flips', () => {
  assert.equal(runControls([CORRECTED.invented, CORRECTED.lost], es()).exit, 0, 'positive normal operation: unblinded holds');
  const r = runControls([CORRECTED.invented, CORRECTED.lost], es({ blind: 'negation' }));
  assert.equal(r.exit, 3, r.reason);
  assert.match(r.reason, /positive\/02-negacion-inventada\.txt/);
  assert.doesNotMatch(r.reason, /01-negacion-perdida/, 'the lost-negation control is expected to stay flagged');
  const blind = es({ blind: 'negation' });
  assert.equal(verdict(scoreControl(loadControl(CORRECTED.invented, blind))), 'pass', 'lexicon-supplied control is blinded');
  assert.equal(verdict(scoreControl(loadControl(CORRECTED.lost, blind))), 'flagged', 'restatement-supplied control is untouched');
});
test('B-3 FIX: a true malformed input stays exit 2, so the wrong reason remains distinguishable', () => {
  const unknown = runControls([{ ...CORRECTED.invented, lexicon: 'nope' }], es());
  assert.equal(unknown.exit, 2);
  assert.match(unknown.reason, /is not available for locale/);
  const empty = runControls([CORRECTED.invented], es({ lexicons: { negation: [] } }));
  assert.equal(empty.exit, 2);
  assert.match(empty.reason, /loads zero terms/);
  assert.equal(
    runControls([CORRECTED.invented], es({ blind: 'negation', lexicons: { negation: [] } })).exit,
    2,
    'empty file: both readings',
  );
});
test('Invalid controls must fail: a pattern that cannot compile, and one that matches its own headers', () => {
  const broken = runControls([{ ...CORRECTED.invented, mustNotContain: [`${TOKEN} refiere (unclosed`] }], es());
  assert.equal(broken.exit, 2, 'an uncompilable pattern must be a named refusal, not a SyntaxError');
  assert.match(broken.reason, /does not compile/);
  const selfHit = runControls([{ ...CORRECTED.invented, mustNotContain: [`${TOKEN} refiere`, 'Plan'] }], es());
  assert.equal(selfHit.exit, 2);
  assert.match(selfHit.reason, /matches its own section headers/);
});
test('Boundary: FD2c\'s class differs from `\\b` on a term ending in an accented letter — and the nine have none', () => {
  assert.equal(new RegExp('\\bdejó\\b', 'i').test('el paciente dejó de fumar'), false, 'lexicon.ts:39 cannot match this at all');
  assert.equal(compile(BOUNDARY('dejó')).test('el paciente dejó de fumar'), true, "FD2c's class can");
  assert.equal(compile(BOUNDARY('no')).test('nosotros'), false, 'and `no` is not a prefix match');
  assert.equal(compile(BOUNDARY('no')).test('no-we'), true, 'hyphen is a boundary');
  // The honest limit, and the reason this is a mechanism demo and not a behaviour change: none of
  // the nine terms ends in a non-ASCII letter, so on this inventory the two constructions agree.
  assert.deepEqual(NEGATION_TERMS.filter((t) => !/[A-Za-z]$/.test(t)), [], 'no inventory term ends non-ASCII');
  for (const t of NEGATION_TERMS)
    for (const s of [`el paciente ${t} algo`, `nothing but ${t}`, `${t}-we`, `(${t})`])
      assert.equal(new RegExp(`\\b${t}\\b`, 'i').test(s), compile(BOUNDARY(t)).test(s), `${t} in ${JSON.stringify(s)}`);
});
test('Boundary: the unstated NFC precondition is real, and the inventory is what is unstable', () => {
  const unstable = NEGATION_TERMS.filter((t) => t.normalize('NFC') !== t.normalize('NFD'));
  assert.deepEqual(unstable, ['jamás', 'ningún'], 'the NFD-unstable terms of the nine, not an arbitrary one');
  for (const t of unstable) assert.equal(compile(BOUNDARY(t)).test(t.normalize('NFD')), false, `${t}: decomposed text does not match`);
  assert.ok(NEGATION_TERMS.every((t) => t.normalize('NFC') === t), 'the nine are authored NFC in this file');
  assert.equal(compile(BOUNDARY('no')).test('no\u0301'), true, 'a trailing combining mark counts as a boundary');
  assert.equal(existsSync(join(REPO, 'server/src/eval/lexicons/es-MX.txt')), false, 'es-MX.txt does not exist at this commit');
});
test('Boundary: the committed English clinical file does not move — 0 disagreements', () => {
  const terms = enLexicons().clinical;
  const census = terms.map((term) => {
    const sentence = `the patient reports ${term} today`;
    return [/[A-Za-z0-9_]$/.test(term), new RegExp(`\\b${term}\\b`, 'i').test(sentence) === compile(BOUNDARY(term)).test(sentence)];
  });
  assert.ok(terms.length >= 200, `expected the committed clinical file, got ${terms.length} terms`);
  assert.equal(census.filter(([ascii]) => !ascii).length, 0, 'no term ends non-ASCII');
  assert.equal(census.filter(([, agree]) => !agree).length, 0, 'so the legacy `\\b` construction stays byte-identical');
});
test('markerFreeSource comes from f6Core() whole, not a four-alternative subset', () => {
  const subset = /consistent with|suggestive of|indicates?/; // what round 1 modelled
  const subsetFree = 'the pain is secondary to a fall';
  assert.equal(subset.test(subsetFree), false, 'the old subset missed this member of f6Core');
  assert.notEqual(collapse(subsetFree).match(f6Core()), null, 'the whole list does not');
  assert.equal(loadControl({ ...CORRECTED.invented, controlSource: subsetFree }, es()).markerFreeSource, false);
  for (const [name, sidecar, , , ctx] of PAIRS)
    assert.equal(loadControl(sidecar, ctx).markerFreeSource, true, `${name}: its own source carries f6 marker vocabulary`);
});
test('L1 (exact limitation): assertFixture is NOT called, so corpus.ts rules this model skips go unexercised', () => {
  // corpus.ts:105-114 — `blank`, `statedAbsence` and `noConclusion` may only name one of the
  // fixture's own sections. `loadControl` drops all three keys, so it cannot see the violation.
  const bad = { ...CORRECTED.invented, noConclusion: ['Recomendaciones'], controlSections: note(ES_INV_BAD) };
  assert.equal(runControls([bad], es()).exit, 0, 'this model loads it');
  assert.equal(new Set(bad.sections).has('Recomendaciones'), false, 'and corpus.ts would refuse it: not one of its sections');
  assert.deepEqual(loadControl(bad, es()).noConclusion, ['Recomendaciones'], 'and it carries the key through unchecked: assertFixture is the only reader');
});

// ---- FD5: immutable reports, pre-flight, attempt budget (MODELLED, never enforced) ----
const MAX_ATTEMPTS = 3; // COORDINATOR.md:85 — three attempts per card, then BLOCKED, owner
const EXCEPTION = /^AM-\d{3}$/; // build-dispatch.mjs:63-75 — attempt 4 only with a keyed amendment
/** FD5 rules 1 and 2, at m-4's pre-flight position. Exclusive create; the path must be ours. */
function pipelineRun(attemptIndex, exception, outRel, payload) {
  const refuse = (reason) => ({ exit: 2, reason });
  if (!Number.isInteger(attemptIndex) || attemptIndex < 1) return refuse('attempt index must be an integer n >= 1');
  if (attemptIndex > MAX_ATTEMPTS + 1)
    return refuse(`attempt ${attemptIndex} is beyond any authorised budget: BLOCKED, owner`);
  if (attemptIndex === MAX_ATTEMPTS + 1 && !(typeof exception === 'string' && EXCEPTION.test(exception)))
    return refuse(`attempt ${attemptIndex} requires --attempt-exception <AM-nnn> naming the owner amendment that authorised it`);
  if (isAbsolute(outRel)) return refuse(`evidence path must be relative to the attempt directory: ${outRel}`);
  const dir = join(SCRATCH, `attempt-${attemptIndex}`);
  const out = resolve(dir, outRel);
  if (!out.startsWith(dir + sep)) return refuse(`evidence path escapes the attempt directory: ${outRel}`);
  mkdirSync(dirname(out), { recursive: true }); // additive; the report FILE is what must be exclusive
  let fd;
  try {
    fd = openSync(out, 'wx'); // O_EXCL: existence and creation are one step, not two
  } catch (error) {
    if (error.code === 'EEXIST') return refuse(`refusing to overwrite existing report: ${out}`);
    throw error;
  }
  try {
    writeSync(fd, payload);
  } finally {
    closeSync(fd);
  }
  return { exit: 0, reason: `wrote ${out}` };
}
test('FD5: evidence is created exclusively, its bytes are never truncated, and its path must be ours', () => {
  assert.equal(pipelineRun(1, null, 'pipeline-eval-1.md', 'ATTEMPT-1 MEASUREMENT').exit, 0);
  const path = join(SCRATCH, 'attempt-1', 'pipeline-eval-1.md');
  const before = readFileSync(path, 'utf8');
  const second = pipelineRun(1, null, 'pipeline-eval-1.md', 'ATTEMPT-1 SECOND MEASUREMENT');
  assert.equal(second.exit, 2, 'check-then-act would race; `wx` is the property');
  assert.match(second.reason, /refusing to overwrite existing report/);
  assert.equal(readFileSync(path, 'utf8'), before, 'the bytes on disk are untouched');
  for (const bad of ['../escaped.md', 'nested/../../escaped.md', '/etc/passwd'])
    assert.equal(pipelineRun(2, null, bad, 'X').exit, 2, `${bad} was not refused`);
  assert.equal(pipelineRun(1, null, 'nested/deep.md', 'DEEP').exit, 0, 'a valid nested path inside the attempt is fine');
  assert.equal(existsSync(join(SCRATCH, 'attempt-2')), false, 'and a refused attempt leaves no directory behind');
  assert.equal(pipelineRun(0, null, 'x.md', 'X').exit, 2);
});
test('FD5: the attempt budget is MODELLED, with the keyed fourth attempt the shipped rule has', () => {
  const card = JSON.parse(readFileSync(join(REPO, 'docs/v2/state/cards/S3.2.json'), 'utf8'));
  assert.ok(Number.isInteger(card.attempt) && card.attempt >= 1, 'the real counter is an integer in the card');
  for (const n of [1, 2, 3]) {
    // the existing budget: first implementation plus at most two repairs
    assert.equal(pipelineRun(n, null, `pipeline-owner-${n}.md`, `ATTEMPT-${n}`).exit, 0);
    assert.ok(readdirSync(join(SCRATCH, `attempt-${n}`)).includes(`pipeline-owner-${n}.md`), 'the attempt owns its own report');
    for (const m of [1, 2, 3]) if (m !== n && existsSync(join(SCRATCH, `attempt-${m}`)))
      assert.equal(readdirSync(join(SCRATCH, `attempt-${m}`)).includes(`pipeline-owner-${n}.md`), false, 'nothing is pooled across attempts');
  }
  assert.equal(pipelineRun(4, null, 'pipeline-owner-4.md', 'ATTEMPT-4').exit, 2, 'attempt 4 needs the keyed amendment');
  assert.match(pipelineRun(4, null, 'pipeline-owner-4.md', 'ATTEMPT-4').reason, /--attempt-exception/);
  assert.equal(pipelineRun(4, 'AM-049', 'pipeline-owner-4.md', 'ATTEMPT-4 AUTHORISED').exit, 0, 'and with it, as S2.5 did');
  assert.equal(pipelineRun(5, 'AM-049', 'pipeline-owner-5.md', 'ATTEMPT-5').exit, 2, 'there is no attempt 5');
  assert.equal(existsSync(join(SCRATCH, 'attempt-5')), false);
  // The counter is MUTABLE repo state: S3.2's second attempt would fail an `=== 1` assertion and
  // read as a proof failure. What is asserted is only its shape — that it is a positive integer —
  // and that nothing in this model read it: the model bounds a run, it enforces nothing.
  assert.equal(Object.keys(card).includes('attempt'), true, 'and the real counter is on the card at all');
});

// ------------------------------------------------------------------ runner --
let passed = 0;
const failures = [];
process.stdout.write(`S3.2 controls proof — ${String(cases.length)} cases\n`);
for (const [name, fn] of cases) {
  try {
    fn();
    passed += 1;
    process.stdout.write(`  PASS  ${name}\n`);
  } catch (error) {
    failures.push(name);
    process.stdout.write(`  FAIL  ${name}\n        ${String(error.message).split('\n')[0]}\n`);
  }
}
rmSync(SCRATCH, { recursive: true, force: true });
process.stdout.write(`\n${String(passed)}/${String(cases.length)} passed, ${String(failures.length)} failed\n`);
if (failures.length > 0) process.exitCode = 1;