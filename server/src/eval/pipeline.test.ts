import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { loadControls } from './controls.js';
import { CorpusError, loadCorpus, type Fixture } from './corpus.js';
import { REPOSITORY_ROOT } from './identity.js';
import { loadLocaleLexicon, type LexiconTerm } from './lexicon.js';
import { PipelineRefusal, checkBaseUrl, parseSse, refuseExistingOut } from './pipeline.js';
import type { ModelReport } from './report.js';
import { runEval, sensitivity } from './run.js';

/**
 * The properties that are about the *wiring* rather than about the vocabulary:
 * C-EVAL@1 rule 9's independence claim, FD3's nested inventory, FD6's
 * "controls are outside every denominator", FD1's flag discipline, FD4's
 * pre-flight and FD5's refusal.
 */

// ---- C-EVAL@1 rule 9: the scorer reaches no guard ----------------------------

describe('C-EVAL@1 rule 9 — independence from the production guards', () => {
  const EVAL = join(REPOSITORY_ROOT, 'server/src/eval');

  function imports(file: string): string[] {
    const source = readFileSync(file, 'utf8');
    return [...source.matchAll(/from\s+'([^']+)'/g)]
      .map((match) => match[1] ?? '')
      .filter((specifier) => specifier.includes('ai/'));
  }

  it('reaches no file under server/src/ai/ from any scoring module', () => {
    // `corpus.ts` imports `../ai/types.js`, a type-only module, at the base
    // commit. Everything else reaches nothing at all.
    for (const file of ['score.ts', 'lexicon.ts', 'patterns.ts', 'report.ts', 'controls.ts']) {
      expect(`${file}: ${JSON.stringify(imports(join(EVAL, file)))}`).toBe(`${file}: []`);
    }
    expect(imports(join(EVAL, 'corpus.ts'))).toEqual(['../ai/types.js']);
  });

  it('has score.ts and lexicon.ts importing nothing from server/src/ai/ at all', () => {
    for (const file of ['score.ts', 'lexicon.ts']) {
      expect(`${file}: ${String(imports(join(EVAL, file)).length)}`).toBe(`${file}: 0`);
    }
  });

  it('exempts the driver and says why, rather than pretending the graph is clean', () => {
    // `run.ts` imports `ai/default-instructions.js`, `ai/fake.js` and
    // `ai/ollama.js`, and `cli.ts` imports `ai/prompts.js`, so `ai/retractions.js`
    // is reachable from the eval module graph at the base commit. This card does
    // not change that (C4 forbids `server/src/ai/`). What rule 9 actually claims
    // is that the *scorer* reaches no guard and the pipeline runner reaches the
    // server only over HTTP, so no guard code runs inside the measurement.
    expect(imports(join(EVAL, 'run.ts')).length).toBeGreaterThan(0);
    expect(imports(join(EVAL, 'cli.ts')).length).toBeGreaterThan(0);
    const pipeline = readFileSync(join(EVAL, 'pipeline.ts'), 'utf8');
    expect(pipeline.includes("from '../ai/")).toBe(false);
    expect(pipeline.includes("from './lexicon.js'")).toBe(true);
  });
});

// ---- C-EVAL@1 rule 4: one control per critical trap class --------------------

describe('C-EVAL@1 rule 4 — one control per critical class, per locale', () => {
  const MAPPING: ReadonlyArray<[string, string, string]> = [
    ['lost negation', '01-negacion-perdida', '01-lost-negation'],
    ['invented negation', '02-negacion-inventada', '02-invented-negation'],
    ['wrong dose or number', '03-dosis-incorrecta', '03-wrong-dose'],
    ['wrong experiencer', '04-experiencer-equivocado', '04-wrong-experiencer'],
    ['past risk as current', '05-riesgo-pasado-como-actual', '05-past-risk-as-current'],
    ['retracted content kept', '06-contenido-retirado-conservado', '06-retracted-content-kept'],
    [
      'content invented for an uncovered section',
      '07-contenido-inventado-seccion-no-cubierta',
      '07-invented-for-uncovered-section',
    ],
  ];

  for (const locale of ['en', 'es-MX'] as const) {
    it(`${locale} covers all seven, and every one is flagged`, () => {
      const result = loadControls({
        directory: join(REPOSITORY_ROOT, 'server/src/eval/fixtures-controls', locale),
        locale,
      });
      const positives = result.controls.filter((control) => control.control === 'positive');
      expect(positives).toHaveLength(7);
      for (const [, esName, enName] of MAPPING) {
        const key = locale === 'en' ? `positive/${enName}.txt` : `positive/${esName}.txt`;
        const control = positives.find((entry) => entry.key === key);
        expect(`${key}: ${String(control !== undefined)}`).toBe(`${key}: true`);
        expect(`${key}: ${control?.verdict}`).toBe(`${key}: flagged`);
      }
    });
  }
});

// ---- FD3: nested corpora load, and the integrity guard now sees them ---------

describe('FD3 — the transcript inventory is one level deep', () => {
  it('loads the 33 Spanish tuning fixtures with nested keys', () => {
    const fixtures = loadCorpus(join(REPOSITORY_ROOT, 'e2e/fixtures/eval-es/tuning'));
    expect(fixtures).toHaveLength(33);
    expect(fixtures.filter((fixture) => fixture.filename.includes('/')).length).toBeGreaterThan(30);
    for (const fixture of fixtures) {
      expect(`${fixture.filename}: ${String(/^[a-z-]+\/\d{2}-.*\.txt$/.test(fixture.filename))}`).toBe(
        `${fixture.filename}: true`,
      );
    }
  });

  it('loads the 33 owner-format Spanish tuning fixtures too', () => {
    expect(loadCorpus(join(REPOSITORY_ROOT, 'e2e/fixtures/eval-owner-es/tuning'))).toHaveLength(33);
  });

  it('leaves the flat English corpora untouched', () => {
    for (const corpus of ['e2e/fixtures/eval', 'e2e/fixtures/eval-owner']) {
      const fixtures = loadCorpus(join(REPOSITORY_ROOT, corpus));
      expect(`${corpus}: ${String(fixtures.some((fixture) => fixture.filename.includes('/')))}`).toBe(
        `${corpus}: false`,
      );
    }
    expect(loadCorpus(join(REPOSITORY_ROOT, 'e2e/fixtures/eval'))).toHaveLength(20);
    expect(loadCorpus(join(REPOSITORY_ROOT, 'e2e/fixtures/eval-owner'))).toHaveLength(4);
  });

  it('raises a CorpusError for a deliberately sidecar-less nested transcript', () => {
    const dir = mkdtempSync(join(tmpdir(), 'apunta-nested-'));
    const source = loadCorpus()[0] as Fixture;
    const entry: Record<string, unknown> = { ...source, filename: undefined };
    delete entry['filename'];
    delete entry['source'];
    delete entry['normalisedSource'];
    writeFileSync(
      join(dir, 'expectations.json'),
      JSON.stringify({ fixtures: { 'positive/01-kept.txt': entry } }),
      'utf8',
    );
    execFileSync('mkdir', ['-p', join(dir, 'positive')]);
    writeFileSync(join(dir, 'positive', '01-kept.txt'), 'a transcript', 'utf8');
    // The orphan is on disk but absent from the sidecar — the case the base
    // commit's non-recursive `readdirSync` never saw.
    writeFileSync(join(dir, 'positive', '02-orphan.txt'), 'a transcript nobody stated', 'utf8');
    expect(() => loadCorpus(dir)).toThrow(CorpusError);
    expect(() => loadCorpus(dir)).toThrow(/positive\/02-orphan\.txt/);
  });
});

// ---- FD6: the Spanish gold is Must-not-edit ---------------------------------

describe('FD6 — the two Spanish tuning sidecars are unchanged at the base commit’s hash', () => {
  const HASHES: Readonly<Record<string, string>> = {
    'e2e/fixtures/eval-es/tuning/expectations.json':
      '62fbaf6e5ddaa0c0465afa043bba27a8b213789398f6033785f1f40c2f482468',
    'e2e/fixtures/eval-owner-es/tuning/expectations.json':
      'd4cec02a847ed2ff238318c63222a16bad880ea2e69fd38e9bfc0c3f7ef5331d',
  };

  for (const [path, expected] of Object.entries(HASHES)) {
    it(`${path}`, () => {
      const actual = createHash('sha256')
        .update(readFileSync(join(REPOSITORY_ROOT, path)))
        .digest('hex');
      expect(actual).toBe(expected);
    });
  }
});

// ---- FD6 / IR-05: controls are outside every denominator ---------------------

describe('FD6 — a control is in no denominator, and never in ModelReport.scores', () => {
  it('yields identical corpus percentages and byte-identical sensitivity with and without controls', async () => {
    const base = {
      models: ['fake'],
      runs: 1,
      fake: true,
      controlsSuppressed: true,
    };
    const without = await runEval({ ...base, fixtureFilter: '0' });
    const withControls = await runEval({
      ...base,
      fixtureFilter: '0',
      controlsSuppressed: false,
      controlsDirectory: join(REPOSITORY_ROOT, 'server/src/eval/fixtures-controls/en'),
    });

    expect(withControls.controls).toHaveLength(10);
    expect(without.controls).toEqual([]);

    // `sensitivity` flattens `models.flatMap((model) => model.scores)`. Seven
    // `positive` controls in that array would supply the banned strings and the
    // gating conclusions that make a blind harness "deflect", and the `clean`
    // control would supply `cleanFixtures`. Asserted, not merely intended.
    expect(JSON.stringify(sensitivity(withControls.models))).toBe(
      JSON.stringify(sensitivity(without.models)),
    );

    expect(corpusBlock(withControls.markdown)).toBe(corpusBlock(without.markdown));
    expect(withControls.markdown).toContain('## Controls');
    expect(without.markdown).not.toContain('## Controls');
  });
});

// ---- FD1: provider mode with no --locale and with --locale en ---------------

describe('FD1 — provider mode is unchanged by the new flags', () => {
  it('produces the same corpus block with no locale and with --locale en', async () => {
    const without = await runEval({
      models: ['fake'],
      runs: 1,
      fake: true,
      fixtureFilter: '0',
      controlsSuppressed: true,
    });
    const withEn = await runEval({
      models: ['fake'],
      runs: 1,
      fake: true,
      locale: 'en',
      fixtureFilter: '0',
      controlsSuppressed: true,
    });
    expect(corpusBlock(withEn.markdown)).toBe(corpusBlock(without.markdown));
    // `wallMs` is measured, so the scores are compared with the timing removed
    // rather than the whole run being assumed deterministic.
    expect(JSON.stringify(withoutModels(withEn))).toBe(JSON.stringify(withoutModels(without)));
    expect(withEn.fixtures.map((fixture) => fixture.filename)).toEqual(
      without.fixtures.map((fixture) => fixture.filename),
    );
  });
});

// ---- the three scoreNote call sites -----------------------------------------

describe('the locale-scoped terms reach all three scoreNote call sites', () => {
  it('names them at the provider path, the controls loader and the pipeline path', () => {
    const read = (file: string): string =>
      readFileSync(join(REPOSITORY_ROOT, 'server/src/eval', file), 'utf8');

    // Call site 1: run.ts, in the options object the provider path builds.
    const run = read('run.ts');
    expect(run).toMatch(/return scoreNote\(fixture, sections, \{[\s\S]*?lexicon,/);
    expect(run).toContain('const lexicon = loadLocaleLexicon(locale)');

    // Call site 2: controls.ts.
    const controls = read('controls.ts');
    expect(controls).toMatch(/scoreNote\(loaded\.fixture, loaded\.note, \{[\s\S]*?lexicon: context\.lexicon/);
    expect(controls).toContain('const lexicon = loadLocaleLexicon(locale)');

    // Call site 3: pipeline.ts, scoring the note read back after persistence.
    const pipeline = read('pipeline.ts');
    expect(pipeline).toMatch(/return scoreNote\(fixture, sections, \{[\s\S]*?lexicon,/);
    expect(pipeline).toContain('const lexicon: readonly LexiconTerm[] = loadLocaleLexicon(options.locale)');

    // And the no-argument fallback still resolves to `en`, which is exactly the
    // silent failure the three fields exist to prevent.
    const score = read('score.ts');
    expect(score).toContain('cachedLexicon ??= loadLexicon()');
  });

  it('is one array per run, and it is the locale’s own', async () => {
    const spanish = await runEval({
      models: ['fake'],
      runs: 1,
      fake: true,
      locale: 'es-MX',
      directory: join(REPOSITORY_ROOT, 'e2e/fixtures/eval-es/tuning'),
      controlsSuppressed: true,
      fixtureFilter: 'clean-control',
    });
    expect(spanish.lexicon).toBe(loadLocaleLexicon('es-MX'));
    expect(spanish.lexicon.length).toBe(237);
    const english = await runEval({
      models: ['fake'],
      runs: 1,
      fake: true,
      fixtureFilter: '0',
      controlsSuppressed: true,
    });
    expect(english.lexicon).toBe(loadLocaleLexicon('en'));
    expect(english.lexicon.length).toBe(239);
  });

  it('would score es-MX against English without it, which is why the field is asserted', () => {
    // Measured, not asserted: the English clinical file holds 47 `medication`
    // entries and the Spanish one 126, so a controls run that omitted the field
    // would see a different F4 vocabulary for the same note.
    const en = loadLocaleLexicon('en').filter((entry: LexiconTerm) => entry.category === 'medication');
    const es = loadLocaleLexicon('es-MX').filter((entry: LexiconTerm) => entry.category === 'medication');
    expect(en).toHaveLength(47);
    expect(es).toHaveLength(126);
    expect(es.some((entry) => entry.term === 'alprazolam')).toBe(true);
    expect(en.some((entry) => entry.term === 'alprazolam')).toBe(true);
    // F7's gating categories are absent from the Spanish file entirely, so under
    // `--locale es-MX` F7 cannot gate at all — a recorded limitation, stated
    // rather than papered over.
    for (const entry of loadLocaleLexicon('es-MX')) {
      expect(
        `${entry.category}: ${String(entry.category === 'diagnosis' || entry.category === 'risk')}`,
      ).toBe(`${entry.category}: false`);
    }
  });
});

// ---- FD4 step 0 and FD5: the pipeline pre-flight ----------------------------

describe('FD4 step 0 — the pre-flight refuses before a single fixture is touched', () => {
  it('refuses an unset, non-loopback, live-port or out-of-range APUNTA_CHECK_URL', () => {
    expect(() => checkBaseUrl(undefined)).toThrow(PipelineRefusal);
    expect(() => checkBaseUrl('')).toThrow(/APUNTA_CHECK_URL is unset/);
    expect(() => checkBaseUrl('http://example.com:7840')).toThrow(/must be http:\/\/127\.0\.0\.1/);
    expect(() => checkBaseUrl('https://127.0.0.1:7840')).toThrow(/must be http:\/\/127\.0\.0\.1/);
    expect(() => checkBaseUrl('http://127.0.0.1:7717')).toThrow(/7717/);
    expect(() => checkBaseUrl('http://127.0.0.1:7799')).toThrow(/7800-7889/);
    expect(() => checkBaseUrl('http://127.0.0.1:7890')).toThrow(/7800-7889/);
    expect(checkBaseUrl('http://127.0.0.1:7840')).toBe('http://127.0.0.1:7840');
    expect(checkBaseUrl('http://localhost:7840')).toBe('http://localhost:7840');
    // A trailing slash is refused: the check is the card's own anchored pattern,
    // the same one `scripts/check-note-format.mjs` applies, and `sandbox.mjs`
    // never emits one.
    expect(() => checkBaseUrl('http://localhost:7840/')).toThrow(/refuses/);
  });
});

describe('FD5 — a report is never silently replaced, and provider keeps today’s behaviour', () => {
  it('refuses an existing --out in pipeline mode, naming the path', () => {
    const dir = mkdtempSync(join(tmpdir(), 'apunta-out-'));
    const path = join(dir, 'report.md');
    writeFileSync(path, 'ORIGINAL', 'utf8');
    const refusal = refuseExistingOut('pipeline', path);
    expect(refusal).toContain(path);
    expect(refusal).toContain('attempt-<n+1>');
    // Provider mode keeps today's overwrite behaviour byte for byte, so no
    // existing card's `--out` changes meaning.
    expect(refuseExistingOut('provider', path)).toBeUndefined();
    expect(refuseExistingOut('pipeline', join(dir, 'absent.md'))).toBeUndefined();
    expect(refuseExistingOut('pipeline', undefined)).toBeUndefined();
    // And the refusal happens before the file is touched.
    expect(readFileSync(path, 'utf8')).toBe('ORIGINAL');
  });

  it('leaves the existing file byte-identical when the CLI refuses', () => {
    const dir = mkdtempSync(join(tmpdir(), 'apunta-out-cli-'));
    const path = join(dir, 'spent.md');
    const before = 'FIRST MEASUREMENT\n';
    writeFileSync(path, before, 'utf8');
    const result = runCli(['--mode', 'pipeline', '--out', path, '--fixture', '01']);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain(path);
    expect(readFileSync(path, 'utf8')).toBe(before);
  });

  it('still overwrites in provider mode, which is the base commit’s behaviour', () => {
    const dir = mkdtempSync(join(tmpdir(), 'apunta-out-provider-'));
    const path = join(dir, 'report.md');
    writeFileSync(path, 'SPENT', 'utf8');
    const result = runCli(['--fake', '--runs', '1', '--fixture', '01', '--controls', 'none', '--out', path]);
    // Exit 0 or 1: `1` is the eval's own measured gating signal, which is not
    // this assertion's criterion and is never inferred.
    expect([0, 1]).toContain(result.code);
    expect(readFileSync(path, 'utf8')).not.toBe('SPENT');
    expect(readFileSync(path, 'utf8')).toContain('# Apunta model eval');
  });
});

// ---- FD5 / the pipeline never publishes -------------------------------------

describe('FD4 step 4 — pipeline mode never publishes a note', () => {
  it('has no publish call anywhere in the runner', () => {
    // Comments are stripped first: the runner *says* it never publishes, and
    // that sentence must not be mistaken for the call.
    const source = stripComments(readFileSync(join(REPOSITORY_ROOT, 'server/src/eval/pipeline.ts'), 'utf8'));
    expect(source).not.toMatch(/publish/);
    // And every endpoint it does reach is named here, so the inventory is
    // reviewable rather than inferred from an absence.
    const paths = [
      ...[...source.matchAll(/\$\{base\}(\/[^`'"]*)/g)].map((match) => match[1] ?? ''),
      ...[...source.matchAll(/json<[^>]*>\(base, '([^']*)'/g)].map((match) => match[1] ?? ''),
    ];
    expect(paths).toContain('/api/health');
    expect(paths).toContain('/api/settings');
    expect(paths).toContain('/api/patients');
    expect(paths).toContain('/api/formats');
    expect(source).toContain('/api/notes/');
    // `fitDraftingPriorNotes` keeps only published notes, so a single publish
    // would let one fixture's note feed another.
    const draft = readFileSync(join(REPOSITORY_ROOT, 'server/src/routes/draft.ts'), 'utf8');
    expect(draft).toContain('fitDraftingPriorNotes');
  });

  it('reads the note back from the API and never scores the streamed frame', () => {
    const source = readFileSync(join(REPOSITORY_ROOT, 'server/src/eval/pipeline.ts'), 'utf8');
    expect(source).toContain('GET');
    expect(source).toContain('/api/notes/');
    expect(source).toContain('textToSections(note.content, format.sections)');
  });
});

describe('the SSE reader ignores progress frames and surfaces the note and error frames', () => {
  it('parses the frames the draft route actually sends', () => {
    const text =
      'event: status\ndata: {"stage":"drafting","message":"…"}\n\n' +
      'event: token\ndata: {"section":"Subjective","text":"Reports"}\n\n' +
      'event: note\ndata: {"note":{"id":"n1","content":"Subjective: x","format_id":"f1","locale":"en"}}\n\n';
    const frames = parseSse(text);
    expect(frames.map((frame) => frame.event)).toEqual(['status', 'token', 'note']);
    expect((frames[2]?.data as { note: { id: string } }).note.id).toBe('n1');
    expect(parseSse('event: error\ndata: {"code":"timeout"}\n\n')[0]?.event).toBe('error');
    expect(parseSse('')).toEqual([]);
  });
});

// ---- helpers ----------------------------------------------------------------

/**
 * The CLI as a subprocess, so an exit code is measured rather than inferred.
 *
 * `APUNTA_CHECK_URL` and `APUNTA_TEST_RUN_ID` are deliberately blank: the
 * pipeline pre-flight refuses on the `--out` check *before* either is read, which
 * is the ordering FD5 requires, and this is how that ordering is proved without
 * a server.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function runCli(argv: readonly string[]): { code: number; stdout: string; stderr: string } {
  const result = spawnSync('npx', ['tsx', join(REPOSITORY_ROOT, 'server/src/eval/cli.ts'), ...argv], {
    cwd: REPOSITORY_ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      INIT_CWD: REPOSITORY_ROOT,
      APUNTA_CHECK_URL: '',
      APUNTA_TEST_RUN_ID: '',
    },
  });
  return { code: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

/**
 * The corpus block: every section from the headline down to the controls table.
 *
 * The cost section is excluded because it prints a measured wall time, and the
 * header line carries the run's own timestamp. Everything that is a *number about
 * the model* is inside the block, which is what "the same corpus block" means.
 */
function corpusBlock(markdown: string): string {
  const start = markdown.indexOf('## Fabrication rate');
  const boundaries = ['## Controls', '## Cost']
    .map((marker) => markdown.indexOf(marker))
    .filter((index) => index > start);
  return markdown.slice(start, boundaries.length === 0 ? undefined : Math.min(...boundaries));
}

/**
 * The run's scores with the measured wall time removed.
 *
 * `wallMs` is a clock reading, not a result, so it is the one field stripped
 * before two runs are compared — everything else must match exactly.
 */
function withoutModels(result: { models: readonly ModelReport[] }): unknown {
  return result.models.map((model) => ({
    model: model.model,
    runs: model.runs,
    scores: model.scores.map((score) => {
      const { stats: _stats, ...rest } = score as unknown as Record<string, unknown>;
      return rest;
    }),
  }));
}
