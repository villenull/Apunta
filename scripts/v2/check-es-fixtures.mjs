#!/usr/bin/env node
/**
 * The Spanish eval corpora's own checker (S3.1, contract C-EVAL@1).
 *
 * `node scripts/v2/check-es-fixtures.mjs` — run from the repository root, exit 0
 * and print the coverage table.
 *
 * ## What it is for
 *
 * The English corpora are held honest by a scorer that has been reading the same
 * twenty fixtures for months. Nothing holds a *new* corpus honest except these
 * structural facts, and each of them has a way of being quietly wrong that would
 * make a measurement meaningless rather than noisy:
 *
 *   1. filename shape — `<split>/<trap-type>/<name>.txt`. A stray fixture in the
 *      wrong directory is not measured at all, and the denominator quietly
 *      changes.
 *   2. the name registry — a fabricated corpus is the only thing standing between
 *      a public repository and real patient text, so a name that is not in
 *      `NAMES.md` is a hard failure, not a warning.
 *   3. the held-out share — a corpus with 10% held out is not an acceptance
 *      instrument, whatever it is called.
 *   4. gold expectations — a transcript with no expectation is a vibes check.
 *   5. exactly five fixtures per trap type per corpus — the split rule only holds
 *      if every trap type has the same size.
 *   6. the coverage table — the counts have to be printed, because a corpus
 *      whose composition is only in the author's head is a corpus nobody can
 *      review.
 *
 * Those six are the card's. The extra assertions below are marked `extra:`; they
 * exist because the same failure modes arrive through a different door otherwise,
 * and they are what make a future edit to either corpus safe to review by diff.
 *
 * ## `--root`
 *
 * `--root <dir>` points at the directory that **contains** the two corpus roots —
 * `NAMES.md` is read from `<root>/eval-es/NAMES.md` and the transcripts from
 * `<root>/eval-es/<split>/…` and `<root>/eval-owner-es/<split>/…`. It defaults to
 * this repository's `e2e/fixtures`. Point it at a copy to demonstrate a failure
 * without editing the shipped tree (verification V3).
 *
 * Nothing outside `<root>` is written, and the default run writes nothing at all.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const defaultRoot = join(repoRoot, 'e2e', 'fixtures');

/** The two corpus roots, and the one name registry they share. */
const CORPORA = [
  { id: 'eval-es', root: 'eval-es' },
  { id: 'eval-owner-es', root: 'eval-owner-es' },
];
const NAMES_PATH = 'eval-es/NAMES.md';

/** Splits, in the order the coverage table prints them. */
const SPLITS = ['tuning', 'heldout'];

/**
 * The trap types this card commits to (C-EVAL rule 4 "and more"), spelled exactly
 * as the directory names. Hard-coded on purpose: assertion 5 is vacuous if the
 * expected set is read back out of the corpus being checked. Adding a trap type
 * is a deliberate edit to this list, which is the point.
 */
const TRAP_TYPES = [
  'clean-control',
  'dose-and-number',
  'english-loanword',
  'experiencer',
  'invented-negation',
  'lost-negation',
  'past-vs-current-risk',
  'section-never-covered',
  'spoken-correction',
  'uncertainty',
  'unclear-speech',
];

/** Five per trap type per corpus; two of them held out. */
const PER_TRAP = 5;
/** C-EVAL rule 2 and the card's Fixed decisions: heldout/(tuning+heldout) >= 40%. */
const MIN_HELDOUT_SHARE = 0.4;

/** `<name>.txt` inside a trap-type directory. The `NN-` prefix is the sort index. */
const NAME_RE = /^\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*\.txt$/;
const INDEX_RE = /^(\d{2})-/;

/** Section sets, from `docs/research/es-mx-clinical-documentation.md` §5. */
const SECTIONS = {
  progress: ['Subjetivo', 'Objetivo', 'Análisis', 'Plan'],
  intake: ['Motivo de consulta', 'Antecedentes', 'Formulación', 'Plan terapéutico'],
  owner: [
    'Lugar',
    'Presentación del cliente',
    'Revisión de riesgo',
    'Temas tratados',
    'Intervención',
    'Tareas entre sesiones',
    'Nota para la próxima sesión',
  ],
};
/** `eval-owner-es` is her format by definition; `eval-es` is SOAP or intake. */
const CORPUS_FORMATS = {
  'eval-es': ['progress', 'intake'],
  'eval-owner-es': ['owner'],
};

/**
 * Capitalised words that are legitimately not a person's name. Kept as small as
 * possible: every entry here is a place where the name check is switched off, so
 * an entry needs a reason.
 */
const NON_PERSON = new Map([
  ['tcc', 'terapia cognitivo-conductual — the Mexican abbreviation (S1.2 glossary §3)'],
  ['emdr', 'therapy acronym kept in English in Mexican practice (S1.2 §3)'],
  ['act', 'terapia de aceptación y compromiso, kept in English in Mexican practice (S1.2 §3)'],
  ['dbt', 'terapia dialéctico-conductual, kept in English in Mexican practice (S1.2 §3)'],
  ['si', 'an untranslated English loanword in one english-loanword fixture, and nothing else'],
  ['hi', 'an untranslated English loanword in one english-loanword fixture, and nothing else'],
  ['doña', 'honorific, and never followed by a second name: the corpora name no provider'],
  ['don', 'honorific, same'],
  ['doctora', 'honorific, same'],
  ['doctor', 'honorific, same'],
]);

/**
 * Names that are in no Spanish corpus, matched case-insensitively on word
 * boundaries across the whole source. This is the layer that catches a name
 * written in lower case, which the capitalised-token scan cannot see, and it is
 * the reason the corpora avoid the commonest surnames in the country.
 */
const NAME_DENYLIST = [
  'juan',
  'pedro',
  'luis',
  'jose',
  'carlos',
  'miguel',
  'ricardo',
  'eduardo',
  'fernando',
  'gustavo',
  'alejandro',
  'silvia',
  'veronica',
  'roberto',
  'patricia',
  'garcia',
  'hernandez',
  'martinez',
  'lopez',
  'rodriguez',
  'perez',
  'sanchez',
  'gonzalez',
  'jimenez',
  'diaz',
];

/** Sentence enders and openers, including the Spanish `¿` and `¡`. */
const SENTENCE_BREAK_RE = /[.!?…¿¡"“«»)\]]/u;

/** Strip case and accents so `Bermúdez`, `BERMÚDEZ` and `bermudez` are one token. */
function fold(value) {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function countWords(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function compile(source) {
  const flags = source.includes('^') || source.includes('$') ? 'im' : 'i';
  return new RegExp(source, flags);
}

/** The serialized `Header:` form the harness matches against, headers included. */
function headersToText(sections) {
  return sections.map((name) => `${name}:`).join('\n');
}

function walk(dir, base = dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, base, out);
    else if (entry.isFile()) out.push(relative(base, full).split('\\').join('/'));
  }
  return out;
}

/* ------------------------------------------------------------------ reporting */

const problems = [];
function fail(message) {
  problems.push(message);
}

/* --------------------------------------------------------------- the registry */

/**
 * Reads the name table out of `NAMES.md`. That table is the registry, and it
 * carries more than names: the `###` heading it sits under says which corpus a
 * block belongs to, and the last column says which transcript the person is in —
 * so the registry can also prove that every name is still used, in the file it
 * was registered for. That is a much stronger claim than "appears somewhere".
 */
function readRegistry(path) {
  const text = readFileSync(path, 'utf8');
  const entries = [];
  let corpus = null;
  for (const line of text.split('\n')) {
    const heading = /^###\s+(.*)$/.exec(line);
    if (heading !== null) {
      const title = heading[1];
      corpus = title.includes('eval-owner-es')
        ? 'eval-owner-es'
        : title.includes('eval-es')
          ? 'eval-es'
          : null;
      continue;
    }
    const row = /^\|(.+)\|\s*$/.exec(line);
    if (row === null) continue;
    const cells = row[1].split('|').map((cell) => cell.trim().replace(/`/g, ''));
    if (cells.length < 4) continue;
    const [name, , split, transcript] = cells;
    if (name === '' || /^-+$/.test(name)) continue;
    if (name.split(/\s+/).length < 2) continue; // a one-word cell is not a person
    entries.push({ name, corpus, split, transcript });
  }
  if (entries.length === 0) {
    fail(`${relative(repoRoot, path)}: no names found — is the registry table still there?`);
  }
  return entries;
}

/**
 * Capitalised, non-sentence-initial words in `text`, as `{ word, index }`.
 *
 * Two shapes qualify, because a person can be written in either: Titlecase
 * (`Bermúdez`) and SHOUTED (`BERMÚDEZ`). One capital letter does not qualify —
 * a stray `S` or `L` is a fragment of a regex, not a person, and treating it as
 * one is how a name check acquires a false failure.
 *
 * Sentence-initial is where this has to be generous: a Spanish sentence opens
 * with a capital, and so does one after `¿`. Being generous here means a name in
 * first position is not checked by this layer — which is why `capitalisedRuns`
 * exists.
 */
const NAME_SHAPES = [/^[\p{Lu}][\p{Ll}\p{M}]+$/u, /^[\p{Lu}\p{M}]{2,}$/u];

function capitalisedTokens(text) {
  const found = [];
  const tokenRe = /[\p{L}]+(?:[’'][\p{L}]+)*/gu;
  let match;
  while ((match = tokenRe.exec(text)) !== null) {
    if (!NAME_SHAPES.some((shape) => shape.test(match[0]))) continue;
    const before = text.slice(0, match.index);
    if (before.slice(before.lastIndexOf('\n') + 1).trim() === '') continue; // opens a line
    const trimmed = before.trimEnd();
    if (trimmed.length === 0) continue;
    if (SENTENCE_BREAK_RE.test(trimmed.at(-1))) continue;
    found.push({ word: match[0], index: match.index });
  }
  return found;
}

/**
 * Runs of two or more adjacent Titlecase words — the shape a name has wherever it
 * stands, including in first position, which is exactly where the clinician puts
 * it. A single capitalised word is not evidence: `Bueno`, `Pues` and `Eh` open half
 * the sentences in this corpus, and `Revisión de riesgo` is a header. Two in a row
 * is not a sentence opener, and it is the shortest span that can be a full name.
 */
function capitalisedRuns(text) {
  const tokens = [];
  const tokenRe = /[\p{L}]+(?:[’'][\p{L}]+)*/gu;
  let match;
  while ((match = tokenRe.exec(text)) !== null) {
    tokens.push({ word: match[0], start: match.index, end: match.index + match[0].length });
  }
  const runs = [];
  for (let i = 0; i < tokens.length; i += 1) {
    if (!/^[\p{Lu}][\p{Ll}\p{M}]+$/u.test(tokens[i].word)) continue;
    const run = [tokens[i]];
    for (let j = i + 1; j < tokens.length; j += 1) {
      if (!/^[\p{Lu}][\p{Ll}\p{M}]+$/u.test(tokens[j].word)) break;
      if (text.slice(tokens[j - 1].end, tokens[j].start).trim() !== '') break;
      run.push(tokens[j]);
    }
    if (run.length >= 2) {
      runs.push({ words: run.map((token) => token.word), index: run[0].start });
      i += run.length - 1;
    }
  }
  return runs;
}

/* ------------------------------------------------------------------ fixtures */

/**
 * Every transcript under the corpus root, as a path relative to the **corpus
 * root** — `<split>/<trap-type>/<name>.txt`. Relative to the root, not to the
 * split, because the two checks below want different halves of it: the filename
 * assertion wants the split, and so does opening the file, while the sidecar key
 * is split-relative (`<trap-type>/<name>.txt`). Getting this wrong silently
 * points file reads at paths that do not exist.
 */
function splitEntries(corpusRoot) {
  const splitFixtures = new Map();
  for (const split of SPLITS) {
    const dir = join(corpusRoot, split);
    if (!existsSync(dir) || !statSync(dir).isDirectory()) {
      fail(`${relative(repoRoot, dir)}: missing — the ${SPLITS.join(' and ')} split roots must both exist`);
      splitFixtures.set(split, []);
      continue;
    }
    splitFixtures.set(
      split,
      walk(dir, corpusRoot).filter((path) => path !== `${split}/expectations.json`),
    );
  }
  return splitFixtures;
}

/** The sidecar key for a transcript: its path with the split segment dropped. */
function goldKeyFor(entry) {
  return entry.split('/').slice(1).join('/');
}

/** Assertion 1 — the filename shape, and the per-trap split assignment. */
function checkFilenames(corpusRoot, corpusId, splitFixtures) {
  for (const [split, entries] of splitFixtures) {
    for (const entry of entries) {
      const parts = entry.split('/');
      if (parts.length !== 3) {
        fail(
          `${corpusId}/${entry}: expected <split>/<trap-type>/<name>.txt, found ${parts.length} path segments`,
        );
        continue;
      }
      const [gotSplit, trap, name] = parts;
      if (gotSplit !== split) {
        fail(`${corpusId}/${entry}: listed under ${split}/ but its path begins with ${gotSplit}/`);
        continue;
      }
      if (!TRAP_TYPES.includes(trap)) {
        fail(
          `${corpusId}/${entry}: "${trap}" is not one of the ${TRAP_TYPES.length} trap types this card commits to`,
        );
        continue;
      }
      if (!NAME_RE.test(name)) {
        fail(`${corpusId}/${entry}: "${name}" is not NN-kebab-case.txt`);
      }
    }
  }

  // Assertion 5, plus the split rule: exactly PER_TRAP per trap type per corpus,
  // with the two held out at the sorted positions where `i % 5` is 1 or 3.
  for (const trap of TRAP_TYPES) {
    const found = [];
    for (const split of SPLITS) {
      for (const entry of splitFixtures.get(split) ?? []) {
        const parts = entry.split('/');
        if (parts.length === 3 && parts[0] === split && parts[1] === trap && NAME_RE.test(parts[2])) {
          found.push(entry);
        }
      }
    }
    if (found.length === 0) continue;
    // Sorted by **name**, not by path: sorting by path would sort `heldout/`
    // before `tuning/` and the `NN-` prefix could never match the position.
    found.sort((a, b) => a.split('/')[2].localeCompare(b.split('/')[2]));
    if (found.length !== PER_TRAP) {
      fail(`${corpusId}/${trap}/: ${found.length} fixtures, expected exactly ${PER_TRAP}`);
    }
    found.forEach((entry, i) => {
      const index = Number(INDEX_RE.exec(entry.split('/')[2])[1]);
      if (index !== i + 1) {
        fail(
          `${corpusId}/${entry}: sorted position in ${trap}/ is ${i + 1} but the name prefix says ${index}`,
        );
      }
      const expectedSplit = i % 5 === 1 || i % 5 === 3 ? 'heldout' : 'tuning';
      if (entry.split('/')[0] !== expectedSplit) {
        fail(
          `${corpusId}/${entry}: "${entry.split('/')[2]}" is sorted position ${i} in ${trap}/ ` +
            `and belongs in ${expectedSplit}/ (i % 5 = ${i % 5})`,
        );
      }
    });
  }
}

/* ---------------------------------------------------------------- expectations */

/** Assertion 4 — one gold expectation per transcript, and no orphan keys. */
function checkExpectations(corpusRoot, corpusId, splitFixtures) {
  for (const split of SPLITS) {
    const path = join(corpusRoot, split, 'expectations.json');
    if (!existsSync(path)) {
      fail(`${relative(repoRoot, path)}: missing — every split root needs its gold sidecar`);
      continue;
    }
    let raw;
    try {
      raw = JSON.parse(readFileSync(path, 'utf8'));
    } catch (error) {
      fail(`${relative(repoRoot, path)}: does not parse: ${String(error)}`);
      continue;
    }
    if (raw._schema === undefined) {
      fail(`${relative(repoRoot, path)}: no _schema block`);
    }
    const fixtures = raw.fixtures ?? {};
    const transcripts = new Set((splitFixtures.get(split) ?? []).map(goldKeyFor));
    for (const key of [...transcripts].sort()) {
      if (!(key in fixtures)) fail(`${corpusId}/${split}: no gold expectation for ${key}`);
    }
    for (const key of Object.keys(fixtures).sort()) {
      if (!transcripts.has(key))
        fail(`${corpusId}/${split}: gold expectation for ${key}, which is not a transcript`);
    }
    checkEntryShape(corpusId, split, path, fixtures, raw._schema);
  }
}

function checkEntryShape(corpusId, split, sidecarPath, fixtures, schema) {
  // extra: the same `_schema` keys as the English sidecars, so the two can be read
  // side by side and S3.2 can load them with one code path.
  const english = join(repoRoot, 'e2e', 'fixtures', 'eval', 'expectations.json');
  if (existsSync(english)) {
    const englishKeys = Object.keys(JSON.parse(readFileSync(english, 'utf8'))._schema ?? {}).sort();
    const mine = Object.keys(schema ?? {}).sort();
    const missing = englishKeys.filter((key) => !mine.includes(key));
    const extra = mine.filter((key) => !englishKeys.includes(key));
    if (missing.length > 0 || extra.length > 0) {
      fail(
        `${relative(repoRoot, sidecarPath)}: _schema keys differ from the English sidecar` +
          `${missing.length > 0 ? `; missing ${missing.join(', ')}` : ''}` +
          `${extra.length > 0 ? `; unexpected ${extra.join(', ')}` : ''}`,
      );
    }
  }

  const schemaKeys = Object.keys(schema ?? {});
  const formats = CORPUS_FORMATS[corpusId];

  for (const [key, entry] of Object.entries(fixtures)) {
    const where = `${corpusId}/${split}: ${key}`;
    if (schemaKeys.length > 0) {
      const entryKeys = Object.keys(entry);
      const mismatched = schemaKeys.filter((k) => !entryKeys.includes(k));
      const extraKeys = entryKeys.filter((k) => !schemaKeys.includes(k));
      if (mismatched.length > 0 || extraKeys.length > 0) {
        fail(
          `${where}: entry keys do not match _schema` +
            `${mismatched.length > 0 ? `; missing ${mismatched.join(', ')}` : ''}` +
            `${extraKeys.length > 0 ? `; unexpected ${extraKeys.join(', ')}` : ''}`,
        );
        continue;
      }
    }

    if (!formats.includes(entry.format)) {
      fail(`${where}: format "${entry.format}" is not one of ${formats.join(' and ')} for this corpus`);
      continue;
    }
    const sections = SECTIONS[entry.format];
    if (JSON.stringify(entry.sections) !== JSON.stringify(sections)) {
      fail(
        `${where}: sections ${JSON.stringify(entry.sections)} are not the ${entry.format} set ${JSON.stringify(sections)}`,
      );
    }
    if (!/^dictated/.test(String(entry.modality))) {
      fail(
        `${where}: modality "${entry.modality}" — these corpora are spoken dictations, so it must start with "dictated"`,
      );
    }
    if (!Number.isInteger(entry.words) || entry.words < 1) {
      fail(`${where}: words must be a positive integer`);
    }
    if (entry.f6 !== 'gating' && entry.f6 !== 'flag') {
      fail(`${where}: f6 must be "gating" or "flag"`);
    }
    if (typeof entry.markerFreeSource !== 'boolean') {
      fail(`${where}: markerFreeSource must be a boolean`);
    }
    if (entry.f6 === 'gating' && entry.markerFreeSource !== true) {
      fail(`${where}: f6 is gating but markerFreeSource is false`);
    }

    // extra: named sections must be the fixture's own, a blank cannot also be a
    // stated absence, and no banned pattern may match the fixture's own headers —
    // `/\bplan\b/` would fire on the serialized `Plan:` header of every note,
    // including a perfect one.
    for (const section of [
      ...entry.blank,
      ...entry.noConclusion,
      ...entry.statedAbsence.map((s) => s.section),
    ]) {
      if (!entry.sections.includes(section)) fail(`${where}: "${section}" is not one of its sections`);
    }
    for (const absence of entry.statedAbsence) {
      if (entry.blank.includes(absence.section)) {
        fail(`${where}: "${absence.section}" is both blank and a stated absence; they are different answers`);
      }
    }
    const headers = headersToText(entry.sections);
    for (const source of entry.mustNotContain) {
      let pattern;
      try {
        pattern = compile(source);
      } catch (error) {
        fail(`${where}: mustNotContain /${source}/ does not compile: ${String(error)}`);
        continue;
      }
      if (pattern.test(headers)) {
        fail(
          `${where}: mustNotContain /${source}/ matches its own section headers ${JSON.stringify(headers)}`,
        );
      }
    }
    for (const group of [
      ...entry.mustCapture.flatMap((fact) => fact.any),
      ...entry.statedAbsence.flatMap((absence) => absence.any),
      ...entry.requiresHedge.flatMap((hedge) => [hedge.topic, hedge.marker]),
      ...entry.requiresMarker.map((requirement) => requirement.marker),
      ...entry.novelTermAllow,
      ...entry.phraseBait,
    ]) {
      try {
        compile(group);
      } catch (error) {
        fail(`${where}: pattern /${group}/ does not compile: ${String(error)}`);
      }
    }
  }
}

/* ------------------------------------------------------------- the name check */

/**
 * Assertion 2 — every personal name is registered, and nothing else is named.
 *
 * Three layers, because the failure arrives three ways. A **full name** check in
 * both directions catches the case that matters: this transcript has a patient, and
 * `NAMES.md` has a row for that patient. Checking *words* instead would not, because
 * surnames recur — delete the row for `Anaías Godoy Ruiz` and `Ruiz` is still
 * authorised by six other rows, so nothing fails and an unregistered patient has
 * walked into a public repository. The two word-level layers then catch what the
 * full-name check cannot: a stray second person mid-sentence, and a name in first
 * position.
 */
function checkNames(corpusId, corpusRoot, splitFixtures, permitted, corpusNames) {
  for (const split of SPLITS) {
    for (const entry of splitFixtures.get(split) ?? []) {
      const source = readFileSync(join(corpusRoot, entry), 'utf8');
      const collapsed = source.replace(/\s+/gu, ' ').trim();
      const where = `${corpusId}/${entry}`;
      if (collapsed.length === 0) {
        fail(`${where}: empty transcript`);
        continue;
      }
      const haystack = fold(collapsed);
      if (!corpusNames.some((name) => haystack.includes(fold(name)))) {
        const runs = capitalisedRuns(source);
        const lead = runs.length > 0 ? runs[0].words.join(' ') : '(no name-shaped text)';
        fail(`${where}: this transcript names a person NAMES.md does not register — "${lead}"`);
      }
      for (const { word, index } of capitalisedTokens(source)) {
        const folded = fold(word);
        if (permitted.has(folded) || NON_PERSON.has(folded)) continue;
        fail(`${where}: personal name not in NAMES.md: "${word}" (offset ${index})`);
      }
      // …and the runs, which catch the name in first position. Without this layer
      // a second person opening a sentence would pass whenever their surname
      // happens to be one of ours.
      for (const run of capitalisedRuns(source)) {
        const unregistered = run.words.filter(
          (word) => !permitted.has(fold(word)) && !NON_PERSON.has(fold(word)),
        );
        if (unregistered.length === 0) continue;
        fail(`${where}: personal name not in NAMES.md: "${run.words.join(' ')}" (offset ${run.index})`);
      }
      for (const banned of NAME_DENYLIST) {
        const hit = new RegExp(`(?<![\\p{L}])${banned}(?![\\p{L}])`, 'iu').exec(collapsed);
        if (hit !== null) {
          fail(
            `${where}: personal name not in NAMES.md: "${hit[0]}" (offset ${hit.index}) — on the denylist`,
          );
        }
      }
    }
  }
}

/** extra: every registered name is used, in the file the registry points it at. */
function checkRegistryUsed(corpusId, corpusRoot, registry) {
  const mine = registry.filter((entry) => entry.corpus === corpusId);
  for (const entry of mine) {
    const path = entry.transcript === '' ? null : join(corpusRoot, entry.transcript);
    if (path === null || !existsSync(path)) {
      fail(`${corpusId}: NAMES.md points ${entry.name} at "${entry.transcript}", which is not a transcript`);
      continue;
    }
    const collapsed = fold(readFileSync(path, 'utf8').replace(/\s+/gu, ' ').trim());
    if (!collapsed.includes(fold(entry.name))) {
      fail(
        `${corpusId}/${entry.transcript}: NAMES.md lists ${entry.name}, who does not appear in that transcript`,
      );
    }
  }
}

/* --------------------------------------------------------------------- the run */

function usage() {
  return [
    'Usage: node scripts/v2/check-es-fixtures.mjs [--root <dir>] [--help]',
    '',
    '  --root <dir>   directory containing eval-es/ and eval-owner-es/, and hence',
    '                 eval-es/NAMES.md. Default: e2e/fixtures in this repository.',
    '  --help         this text',
    '',
    'Exit 0 and print the coverage table when every assertion holds; exit 1 and',
    'print one line per failure otherwise.',
  ].join('\n');
}

function main(argv) {
  let root = defaultRoot;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      process.stdout.write(`${usage()}\n`);
      return 0;
    }
    if (arg === '--root') {
      if (argv[i + 1] === undefined) {
        process.stderr.write('check-es-fixtures: --root needs a directory\n');
        return 1;
      }
      root = resolve(argv[i + 1]);
      i += 1;
      continue;
    }
    process.stderr.write(`check-es-fixtures: unknown argument ${arg}\n\n${usage()}\n`);
    return 1;
  }

  const namesFile = join(root, NAMES_PATH);
  if (!existsSync(namesFile)) {
    process.stderr.write(
      `FAIL ${relative(repoRoot, namesFile)}: missing — the name registry is the corpus's privacy boundary\n`,
    );
    return 1;
  }
  const registry = readRegistry(namesFile);
  const permitted = new Set();
  for (const entry of registry) {
    for (const word of entry.name.split(/\s+/)) permitted.add(fold(word));
  }

  const table = new Map();
  for (const corpus of CORPORA) {
    const corpusRoot = join(root, corpus.root);
    const perTrap = new Map();
    table.set(corpus.id, perTrap);
    if (!existsSync(corpusRoot)) {
      fail(`${relative(repoRoot, corpusRoot)}: corpus root missing`);
      continue;
    }
    const splitFixtures = splitEntries(corpusRoot);
    checkFilenames(corpusRoot, corpus.id, splitFixtures);
    checkExpectations(corpusRoot, corpus.id, splitFixtures);
    const corpusNames = registry.filter((entry) => entry.corpus === corpus.id).map((entry) => entry.name);
    checkNames(corpus.id, corpusRoot, splitFixtures, permitted, corpusNames);
    checkRegistryUsed(corpus.id, corpusRoot, registry);
    for (const split of SPLITS) {
      for (const entry of splitFixtures.get(split) ?? []) {
        const parts = entry.split('/');
        if (parts.length !== 3 || !TRAP_TYPES.includes(parts[1])) continue;
        if (!perTrap.has(parts[1])) perTrap.set(parts[1], { tuning: 0, heldout: 0 });
        perTrap.get(parts[1])[split] += 1;
      }
    }

    // extra: `words` is reporting-only for the scorer, but a stale count is a
    // defect here and nothing downstream would ever catch it.
    for (const split of SPLITS) {
      for (const entry of splitFixtures.get(split) ?? []) {
        const sidecar = readSidecar(join(corpusRoot, split, 'expectations.json'));
        const expectation = sidecar?.[goldKeyFor(entry)];
        if (expectation === undefined) continue;
        const actual = countWords(readFileSync(join(corpusRoot, entry), 'utf8'));
        if (expectation.words !== actual) {
          fail(`${corpus.id}/${entry}: words says ${expectation.words}, the transcript has ${actual}`);
        }
      }
    }
  }

  /* ------------------------------------------------------------- the table */

  const out = [];
  const say = (line = '') => out.push(line);
  const width = 24;
  const columns = [width];
  for (const _corpus of CORPORA) {
    columns.push(22, 26);
  }
  columns.push(9);
  const rule = '-'.repeat(columns.reduce((a, b) => a + b, 0));

  say();
  say('Spanish eval corpora — coverage');
  say();
  say(`root:      ${root === defaultRoot ? 'e2e/fixtures (shipped)' : root}`);
  say(`registry:  ${relative(repoRoot, namesFile)} — ${registry.length} invented people`);
  say();
  const header = ['trap type'.padEnd(width)];
  for (const corpus of CORPORA) {
    header.push(`${corpus.id}/tuning`.padStart(22), `${corpus.id}/heldout`.padStart(26));
  }
  header.push('per trap'.padStart(9));
  say(header.join(''));
  say(rule);

  for (const trap of TRAP_TYPES) {
    const cells = [trap.padEnd(width)];
    let perTrapTotal = 0;
    for (const corpus of CORPORA) {
      const row = table.get(corpus.id)?.get(trap) ?? { tuning: 0, heldout: 0 };
      perTrapTotal += row.tuning + row.heldout;
      cells.push(String(row.tuning).padStart(22), String(row.heldout).padStart(26));
    }
    cells.push(String(perTrapTotal).padStart(9));
    say(cells.join(''));
  }
  say(rule);

  const totals = ['total'.padEnd(width)];
  for (const corpus of CORPORA) {
    let tuning = 0;
    let heldout = 0;
    for (const trap of TRAP_TYPES) {
      const row = table.get(corpus.id)?.get(trap) ?? { tuning: 0, heldout: 0 };
      tuning += row.tuning;
      heldout += row.heldout;
    }
    const share = tuning + heldout === 0 ? 0 : heldout / (tuning + heldout);
    totals.push(
      String(tuning).padStart(22),
      ` ${String(heldout).padEnd(4)} (${(share * 100).toFixed(1)}%)`.padEnd(26),
    );
    // Assertion 3: the held-out share, per corpus, separately.
    if (tuning + heldout > 0 && share < MIN_HELDOUT_SHARE) {
      fail(
        `${corpus.id}: heldout share is ${(share * 100).toFixed(1)}% (${heldout}/${tuning + heldout}), ` +
          `below the ${(MIN_HELDOUT_SHARE * 100).toFixed(0)}% floor ` +
          `(heldout/(tuning+heldout), computed separately per corpus)`,
      );
    }
    if (tuning + heldout !== TRAP_TYPES.length * PER_TRAP) {
      fail(
        `${corpus.id}: ${tuning + heldout} transcripts, expected ${TRAP_TYPES.length * PER_TRAP} ` +
          `(${TRAP_TYPES.length} trap types x ${PER_TRAP})`,
      );
    }
  }
  say(totals.join(''));
  say();
  say(`split rule:  within a trap type, sorted by name, index i where i % 5 is 1 or 3 is heldout (2 of 5)`);
  say(
    `C-EVAL rule 2:  heldout >= ${(MIN_HELDOUT_SHARE * 100).toFixed(0)}%, ${CORPORA.map((c) => c.id).join(' and ')} checked separately`,
  );
  say();

  process.stdout.write(`${out.join('\n')}\n`);
  if (problems.length > 0) {
    for (const problem of problems) process.stderr.write(`FAIL ${problem}\n`);
    process.stderr.write(`\ncheck-es-fixtures: ${problems.length} problem(s)\n`);
    return 1;
  }
  return 0;
}

const sidecarCache = new Map();
function readSidecar(path) {
  let parsed = sidecarCache.get(path);
  if (parsed === undefined) {
    parsed = existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')).fixtures ?? {}) : null;
    sidecarCache.set(path, parsed);
  }
  return parsed;
}

process.exitCode = main(process.argv.slice(2));
