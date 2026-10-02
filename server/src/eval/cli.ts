import { readFileSync, writeFileSync } from 'node:fs';
import { basename, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PROMOTED_DEFAULT_MODEL } from '@apunta/shared';

import { installEgressGuard } from '../egress-guard.js';
import { approximateTokens } from '../ai/prompts.js';
import { isControlsDirectory, type ControlScore } from './controls.js';
import type { ModelReport } from './report.js';
import { loadCorpus, type Fixture } from './corpus.js';
import {
  buildIdentity,
  readModelDigest,
  readOllamaProcessor,
  readOllamaVersion,
  REPOSITORY_ROOT,
} from './identity.js';
import type { ReportIdentity } from './identity.js';
import type { EvalLocale } from './lexicon.js';
import { PipelineRefusal, refuseExistingOut, runPipeline } from './pipeline.js';
import { runEval, sensitivity } from './run.js';

/**
 * `npm run eval` (M7 deliverable 6).
 *
 * ```sh
 * npm run eval -- --fake            # CI: structure only, no model needed
 * npm run eval                      # the real model on this machine
 * npm run eval -- --runs 3
 * APUNTA_EVAL_MODELS=a,b npm run eval
 * ```
 *
 * The egress guard is installed first, exactly as the server installs it: this
 * script talks to a local Ollama and to nothing else, and a run that could
 * reach the internet would be a different program from the one under test.
 */

interface Args {
  fake: boolean;
  runs: number;
  models: string[];
  fixture?: string | undefined;
  out?: string | undefined;
  /** fixture directory, from --corpus */
  directory?: string | undefined;
  /** Ollama base URL, from --ollama-url */
  ollamaUrl?: string | undefined;
  /** Number of fixture-provided published notes to include. */
  priorNoteCount: number;
  /** file paths by format, from --instructions */
  instructionFiles: Partial<Record<'progress' | 'intake', string>>;
  /** --locale: which lexicon every scoreNote call site receives. Default `en`. */
  locale: EvalLocale;
  /** --mode: the provider diagnostic path, or the pipeline acceptance path. */
  mode: 'provider' | 'pipeline';
  /** --blind-lexicon: a test-only negative control (FD1, FD8). */
  blindLexicon: 'negation' | 'clinical' | 'number' | 'unit' | 'medication' | 'all' | undefined;
  /** --controls: a directory, or `none`. */
  controls: string | 'none';
}

const BLIND_LEXICONS = ['negation', 'clinical', 'number', 'unit', 'medication', 'all'] as const;

function parseArgs(argv: readonly string[]): Args {
  const args: Args = {
    fake: process.env['APUNTA_FAKE_AI'] === '1',
    instructionFiles: {},
    runs: 3,
    priorNoteCount: 0,
    locale: 'en',
    mode: 'provider',
    blindLexicon: undefined,
    // FD1: the default is `fixtures-controls/<locale>`, so the mandated default
    // `npm run eval -- --fake` self-check loads the `en` controls. That is
    // deliberate, and C-EVAL@1 §3 makes a missed control inadmissible there too.
    controls: 'default',
    models: (process.env['APUNTA_EVAL_MODELS'] ?? '')
      .split(',')
      .map((model) => model.trim())
      .filter((model) => model !== ''),
  } as Args;

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    switch (flag) {
      case '--fake':
        args.fake = true;
        break;
      case '--runs':
        args.runs = Number(value);
        index += 1;
        break;
      case '--models':
        args.models = (value ?? '')
          .split(',')
          .map((model) => model.trim())
          .filter((m) => m !== '');
        index += 1;
        break;
      case '--locale': {
        if (value !== 'en' && value !== 'es-MX') {
          console.error(`--locale takes en or es-MX, not "${value ?? ''}"`);
          process.exit(2);
        }
        args.locale = value;
        index += 1;
        break;
      }
      case '--mode': {
        if (value !== 'provider' && value !== 'pipeline') {
          console.error(`--mode takes provider or pipeline, not "${value ?? ''}"`);
          process.exit(2);
        }
        args.mode = value;
        index += 1;
        break;
      }
      case '--blind-lexicon': {
        if (!BLIND_LEXICONS.includes(value as (typeof BLIND_LEXICONS)[number])) {
          console.error(
            `--blind-lexicon takes one of ${BLIND_LEXICONS.join(', ')}, not "${value ?? ''}". ` +
              `It is a test-only negative control and no acceptance run passes it.`,
          );
          process.exit(2);
        }
        args.blindLexicon = value as (typeof BLIND_LEXICONS)[number];
        index += 1;
        break;
      }
      case '--controls':
        args.controls = value ?? '';
        index += 1;
        break;
      case '--instructions': {
        // `--instructions her.txt` (progress) or `--instructions intake=her.txt`.
        const eq = (value ?? '').indexOf('=');
        const format = eq === -1 ? 'progress' : (value ?? '').slice(0, eq);
        const file = eq === -1 ? (value ?? '') : (value ?? '').slice(eq + 1);
        if ((format !== 'progress' && format !== 'intake') || file === '') {
          console.error('--instructions takes FILE or progress=FILE or intake=FILE');
          process.exit(2);
        }
        args.instructionFiles[format] = file;
        index += 1;
        break;
      }
      case '--fixture':
        args.fixture = value;
        index += 1;
        break;
      case '--corpus':
        args.directory = value;
        index += 1;
        break;
      case '--ollama-url':
        args.ollamaUrl = value;
        index += 1;
        break;
      case '--prior-notes':
        args.priorNoteCount = Number(value);
        index += 1;
        break;
      case '--out':
        args.out = value;
        index += 1;
        break;
      case '--help':
      case '-h':
        printUsage();
        process.exit(0);
        break;
      default:
        if (flag !== undefined && flag.startsWith('-')) {
          console.error(`unknown option: ${flag}`);
          printUsage();
          process.exit(2);
        }
    }
  }

  if (!Number.isInteger(args.runs) || args.runs < 1) {
    console.error('--runs must be a positive integer');
    process.exit(2);
  }

  if (args.ollamaUrl !== undefined && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(args.ollamaUrl)) {
    // Same refusal `scripts/check-note-format.mjs` makes. The egress guard would
    // catch it too; failing here says why.
    console.error(`--ollama-url refuses ${args.ollamaUrl}: this only ever speaks to a loopback Ollama.`);
    process.exit(2);
  }

  if (!Number.isInteger(args.priorNoteCount) || args.priorNoteCount < 0 || args.priorNoteCount > 3) {
    console.error('--prior-notes must be an integer from 0 through 3');
    process.exit(2);
  }

  if (args.controls === '') {
    console.error('--controls takes a directory or the literal none');
    process.exit(2);
  }

  return args;
}

/** Where `--out` lands, resolved exactly as `--instructions` is. */
export function resolveOut(out: string): string {
  return isAbsolute(out) ? out : resolve(process.env['INIT_CWD'] ?? process.cwd(), out);
}

function printUsage(): void {
  console.error(
    [
      'Apunta model eval — every fixture in e2e/fixtures/eval through a model, scored',
      'against rubric.md.',
      '',
      '  npm run eval -- [options]',
      '',
      '  --fake             use the deterministic fake provider (what CI runs).',
      '                     Proves the harness, says nothing about model quality.',
      '  --runs N           runs per fixture per model (default 3)',
      '  --models a,b       compare models; same as APUNTA_EVAL_MODELS=a,b',
      '  --fixture 07       only fixtures whose filename contains this',
      '  --corpus DIR       read fixtures and expectations.json from DIR instead of',
      '                     e2e/fixtures/eval. One directory is one corpus: the rubric',
      '                     denominators, the section lists and the instruction defaults',
      '                     all follow the fixtures, so two section shapes never mix.',
      '  --ollama-url URL   Ollama to measure against (default 127.0.0.1:11434).',
      '                     Loopback only: a run that could reach the internet would be',
      '  --prior-notes N     include up to N fixture-provided published notes (0, 1, or 3).',
      '                     a different program from the one under test.',
      '  --instructions F   drafting instructions to measure instead of the built-in',
      '                     defaults — the file replaces them entirely, exactly as a',
      "                     format's Instructions field does in the app. FILE applies",
      '                     to progress notes; intake=FILE to intakes. The report',
      '                     header names the file so the run cannot pass as a baseline.',
      '  --out FILE         also write the markdown report here',
      '',
      '  --locale en|es-MX  which lexicon every scorer call receives (default en). es-MX',
      '                     loads only server/src/eval/lexicons/es-MX.txt; nothing is',
      '                     shared across locales.',
      '  --mode provider|pipeline',
      '                     provider (default) calls the model directly: a diagnostic.',
      '                     pipeline posts each fixture through the server draft route',
      '                     and scores the note read back from the API after persistence:',
      '                     the acceptance measurement (C-EVAL@1 §1). Needs APUNTA_CHECK_URL',
      '                     and a sandbox, refuses --prior-notes and --instructions, and',
      '                     refuses an --out path that already exists.',
      '  --controls DIR|none  the control suite (default server/src/eval/fixtures-controls/',
      '                     <locale>). `none` loads none and prints no controls table.',
      '  --blind-lexicon NAME  TEST-ONLY negative control: every {{lexicon}} token of that',
      '                     lexicon expands to (?!). The lexicon file is read and',
      '                     validated exactly as authored and is never emptied.',
      '',
      'Note the `--`. Without it npm swallows the flags and you get the defaults',
      'while believing you asked for something else.',
    ].join('\n'),
  );
}

/**
 * The models a run measures, with no `--models` given.
 *
 * Exported and pure so C-MODEL@1's rule is checkable without running an eval:
 * the default is the promoted default, not the RAM picker, and fake mode still
 * yields `'fake'` so the CI self-check is untouched.
 */
export function defaultModels(args: {
  readonly models: readonly string[];
  readonly fake: boolean;
}): string[] {
  if (args.models.length > 0) return [...args.models];
  return [args.fake ? 'fake' : PROMOTED_DEFAULT_MODEL];
}

async function main(): Promise<void> {
  installEgressGuard();

  const args = parseArgs(process.argv.slice(2));
  const models = defaultModels(args);

  if (args.fake) {
    console.error('Running against the fake provider. This proves the harness, not the model.\n');
  }

  const loaded: { progress?: string; intake?: string } = {};
  const noteParts: string[] = [];
  for (const [format, file] of Object.entries(args.instructionFiles) as ['progress' | 'intake', string][]) {
    // npm runs this script inside server/, but the person typing the command
    // is standing at the repo root. INIT_CWD is where they actually were.
    const path = isAbsolute(file) ? file : resolve(process.env['INIT_CWD'] ?? process.cwd(), file);
    let text = '';
    try {
      text = readFileSync(path, 'utf8').trim();
    } catch (error) {
      console.error(
        `--instructions: could not read ${file}: ${error instanceof Error ? error.message : String(error)}`,
      );
      process.exit(2);
    }
    if (text === '') {
      // Blank would silently fall back to the defaults — the one outcome that
      // looks like a custom run and isn't.
      console.error(`--instructions: ${file} is empty`);
      process.exit(2);
    }
    const tokens = approximateTokens(text);
    if (tokens > 4000) {
      console.error(
        `warning: ${file} is ~${String(tokens)} tokens. Instructions share the 16K context
` + 'with the transcript; a very long block crowds out the material it governs.',
      );
    }
    loaded[format] = text;
    noteParts.push(`${format}: ${basename(file)} (~${String(tokens)} tokens)`);
  }

  const initCwd = process.env['INIT_CWD'] ?? process.cwd();
  const corpusDirectory = args.directory === undefined ? undefined : resolve(initCwd, args.directory);

  // ---- --controls resolution (FD1) ------------------------------------------
  const suppressed = args.controls === 'none';
  const controlsDirectory = suppressed
    ? undefined
    : args.controls === 'default'
      ? join(REPOSITORY_ROOT, 'server', 'src', 'eval', 'fixtures-controls', args.locale)
      : resolve(initCwd, args.controls);
  if (controlsDirectory !== undefined && !isControlsDirectory(controlsDirectory)) {
    console.error(
      `--controls ${args.controls === 'default' ? controlsDirectory : controlsDirectory} is not a ` +
        `directory containing expectations.json`,
    );
    process.exit(2);
  }

  // ---- --out, and FD5's refusal, scoped to the mode that introduces it ------
  const out = args.out === undefined ? undefined : resolveOut(args.out);
  const spent = refuseExistingOut(args.mode, out);
  if (spent !== undefined) {
    console.error(spent);
    process.exit(2);
  }

  const markdown =
    args.mode === 'pipeline'
      ? await pipelineMarkdown(args, models, {
          corpusDirectory,
          ...(controlsDirectory === undefined ? {} : { controlsDirectory }),
          suppressed,
          ...(out === undefined ? {} : { out }),
        })
      : await providerMarkdown(args, models, {
          ...(corpusDirectory === undefined ? {} : { directory: corpusDirectory }),
          ...(controlsDirectory === undefined ? {} : { controlsDirectory }),
          suppressed,
        });

  process.stdout.write(`${markdown}\n`);
  if (out !== undefined) {
    // Resolved exactly as --instructions is: against where npm was invoked,
    // not the workspace cwd. Unresolved, `--out docs/eval-reports/x.md` lands
    // in (or dies on) `server/docs/` — after the whole run has finished.
    writeFileSync(out, `${markdown}\n`, 'utf8');
    console.error(`\nwrote ${out}`);
  }

  /**
   * A missed control makes the run **inadmissible**: exit 3, a code no other
   * path returns, so a red run is diagnosable from the digit alone.
   *
   * It is checked **before** the fake-mode deflect branch, because a deflecting
   * harness exits 0 regardless of gating and C-EVAL@1 §3 says an instrument that
   * misses a control is broken and nothing it scores counts. `1` stays the
   * measured gating signal, `2` the usage refusal and `0` a clean measured or
   * deflecting run. No threshold is relaxed to accommodate it and no existing
   * gate is removed.
   */
  const missed = lastControls.filter((control) => control.missed);
  if (missed.length > 0) {
    console.error(
      `\nMISSED CONTROL — this run is inadmissible (C-EVAL@1 §3: an instrument that misses a\n` +
        `control is broken; nothing it scores counts). Nothing above is a measurement.\n`,
    );
    for (const control of missed) {
      console.error(`  ${control.key} (${control.control}): ${control.missedReason ?? ''}`);
    }
    process.exit(3);
  }

  if (!suppressedControls) {
    const tally = (name: string, want: string): string =>
      `  ${name}: ${String(lastControls.filter((control) => control.control === name && control.verdict === want).length)}` +
      ` of ${String(lastControls.filter((control) => control.control === name).length)}`;
    console.error(
      `\nControls (outside every corpus denominator):\n` +
        `${tally('positive', 'flagged')} flagged · ${tally('clean', 'pass')} passed ·\n` +
        `${tally('empty', 'fail')} failed · ${tally('degenerate', 'fail')} failed`,
    );
  }

  /**
   * The exit status means different things in the two modes, because the two
   * runs are asking different questions.
   *
   * In **fake mode** the notes are canned and their failures are expected —
   * they are the positive control. What is being tested is the *harness*, so
   * success is "it deflected": banned strings found, gating conclusions found,
   * filled blanks found, and some fixtures still clean. A fake run that
   * reports everything clean is a blind harness, which is the one outcome
   * indistinguishable from a good result and therefore the one CI must catch.
   *
   * In a **real run** a gating failure is the finding, so it is the status.
   */
  if (args.fake) {
    const found = sensitivity(lastModels);
    console.error(
      `\nHarness sensitivity: ${String(found.bannedStrings)} runs with a banned string, ` +
        `${String(found.gatingConclusions)} with a gating unsupported conclusion, ` +
        `${String(found.filledBlanks)} filled blanks, ${String(found.cleanFixtures)} clean runs.`,
    );
    if (!found.deflects) {
      console.error(
        'The harness did not deflect on the canned notes. It cannot see fabrication,\n' +
          'and no result from it is admissible. Fix the scorer before trusting a real run.',
      );
      process.exit(1);
    }
    console.error('The harness deflects. A clean real run from it would mean something.');
    process.exit(0);
  }

  const gated = lastModels.some((model) => model.scores.some((score) => score.gating.length > 0));
  process.exit(gated ? 1 : 0);
}

interface ResolvedPaths {
  readonly corpusDirectory?: string | undefined;
  readonly directory?: string | undefined;
  readonly controlsDirectory?: string | undefined;
  readonly suppressed: boolean;
  readonly out?: string | undefined;
  readonly instructions?: { loaded: Record<string, string>; note: string } | undefined;
}

/**
 * FD7 for the provider path.
 *
 * The digest is best-effort here — a fake run has no model and a provider run
 * that cannot reach the loopback Ollama still measures the harness — so it is
 * recorded as such. The **pipeline** runner is the one that fails rather than
 * records a blank digest, because that is the measurement acceptance reads.
 */
async function providerIdentity(
  args: Args,
  models: readonly string[],
  paths: ResolvedPaths,
): Promise<ReportIdentity> {
  const ollamaUrl = args.ollamaUrl ?? 'http://127.0.0.1:11434';
  const tag = models[0] ?? 'fake';
  const digest = args.fake ? 'not applicable: the fake provider' : await readModelDigest(ollamaUrl, tag);
  const version = await readOllamaVersion(ollamaUrl);
  const processor = args.fake ? undefined : await readOllamaProcessor(ollamaUrl, tag);
  return buildIdentity({
    mode: 'provider',
    locale: args.locale,
    modelTag: tag,
    modelDigest: digest ?? 'not recorded',
    ...(paths.directory === undefined ? {} : { corpusDirectory: paths.directory }),
    ...(paths.controlsDirectory === undefined ? {} : { controlsDirectory: paths.controlsDirectory }),
    ...(version === undefined ? {} : { ollamaVersion: version }),
    ...(processor === undefined ? {} : { ollamaProcessor: processor }),
  });
}

async function providerMarkdown(
  args: Args,
  models: readonly string[],
  paths: ResolvedPaths,
): Promise<string> {
  const result = await runEval({
    models,
    runs: args.runs,
    fake: args.fake,
    locale: args.locale,
    priorNoteCount: args.priorNoteCount,
    ...(paths.instructions === undefined
      ? {}
      : { instructions: paths.instructions.loaded, instructionsNote: paths.instructions.note }),
    ...(args.fixture === undefined ? {} : { fixtureFilter: args.fixture }),
    ...(paths.directory === undefined ? {} : { directory: paths.directory }),
    ...(paths.controlsDirectory === undefined ? {} : { controlsDirectory: paths.controlsDirectory }),
    controlsSuppressed: paths.suppressed,
    blindLexicon: args.blindLexicon,
    identity: await providerIdentity(args, models, paths),
    ...(args.ollamaUrl === undefined ? {} : { ollamaUrl: args.ollamaUrl }),
    onProgress: (line) => {
      // stderr, so `npm run eval > report.md` gets only the report.
      process.stderr.write(`  ${line}\n`);
    },
  });
  lastModels = result.models;
  lastControls = result.controls;
  suppressedControls = paths.suppressed || paths.controlsDirectory === undefined;
  return result.markdown;
}

async function pipelineMarkdown(
  args: Args,
  models: readonly string[],
  paths: ResolvedPaths,
): Promise<string> {
  // FD4 step 5: refused rather than silently measured as something else. The
  // draft route reads prior notes from the database itself and takes a
  // `format_id`, so these two flags would measure a configuration the pipeline
  // does not perform.
  if (args.priorNoteCount > 0) {
    console.error(
      '--prior-notes is refused in pipeline mode: the draft route reads prior notes from the ' +
        'database itself, so the flag would measure something the pipeline does not do (FD4 step 5).',
    );
    process.exit(2);
  }
  if (paths.instructions !== undefined) {
    console.error(
      '--instructions is refused in pipeline mode: POST /api/generate takes a format_id, so the ' +
        'flag would measure something the pipeline does not do (FD4 step 5).',
    );
    process.exit(2);
  }

  let fixtures: Fixture[];
  try {
    const all = loadCorpus(paths.corpusDirectory);
    fixtures =
      args.fixture === undefined
        ? all
        : all.filter((fixture) => fixture.filename.includes(args.fixture ?? ''));
    if (fixtures.length === 0) throw new Error(`no fixture matches "${args.fixture ?? ''}"`);
  } catch (error) {
    console.error(`--corpus: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(2);
  }

  try {
    const result = await runPipeline({
      models,
      runs: args.runs,
      locale: args.locale,
      fixtures,
      corpusDirectory: paths.corpusDirectory,
      ...(paths.controlsDirectory === undefined ? {} : { controlsDirectory: paths.controlsDirectory }),
      controlsSuppressed: paths.suppressed,
      blindLexicon: args.blindLexicon,
      out: paths.out,
      fixtureFilter: args.fixture,
      onProgress: (line) => {
        process.stderr.write(`  ${line}\n`);
      },
    });
    lastModels = result.models;
    lastControls = result.controls;
    suppressedControls = paths.suppressed || paths.controlsDirectory === undefined;
    return result.markdown;
  } catch (error) {
    if (error instanceof PipelineRefusal) {
      // Every one of these is exit 2, before a single fixture was touched.
      console.error(`--mode pipeline refused: ${error.message}`);
      process.exit(2);
    }
    throw error;
  }
}

let lastModels: readonly ModelReport[] = [];
let lastControls: readonly ControlScore[] = [];
let suppressedControls = true;

const invokedPath = process.argv[1];
if (invokedPath !== undefined && resolve(invokedPath) === fileURLToPath(import.meta.url)) {
  await main();
}
