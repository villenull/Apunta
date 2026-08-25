import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';

import { installEgressGuard } from '../egress-guard.js';
import { approximateTokens } from '../ai/prompts.js';
import { defaultModelForMachine } from '../ai/model-picker.js';
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
  /** file paths by format, from --instructions */
  instructionFiles: Partial<Record<'progress' | 'intake', string>>;
}

function parseArgs(argv: readonly string[]): Args {
  const args: Args = {
    fake: process.env['APUNTA_FAKE_AI'] === '1',
    instructionFiles: {},
    runs: 3,
    models: (process.env['APUNTA_EVAL_MODELS'] ?? '')
      .split(',')
      .map((model) => model.trim())
      .filter((model) => model !== ''),
  };

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

  return args;
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
      '  --instructions F   drafting instructions to measure instead of the built-in',
      '                     defaults — the file replaces them entirely, exactly as a',
      "                     format's Instructions field does in the app. FILE applies",
      '                     to progress notes; intake=FILE to intakes. The report',
      '                     header names the file so the run cannot pass as a baseline.',
      '  --out FILE         also write the markdown report here',
      '',
      'Note the `--`. Without it npm swallows the flags and you get the defaults',
      'while believing you asked for something else.',
    ].join('\n'),
  );
}

async function main(): Promise<void> {
  installEgressGuard();

  const args = parseArgs(process.argv.slice(2));
  const models = args.models.length > 0 ? args.models : [args.fake ? 'fake' : defaultModelForMachine()];

  if (args.fake) {
    console.error('Running against the fake provider. This proves the harness, not the model.\n');
  }

  const loaded: { progress?: string; intake?: string } = {};
  const noteParts: string[] = [];
  for (const [format, file] of Object.entries(args.instructionFiles) as ['progress' | 'intake', string][]) {
    let text = '';
    try {
      text = readFileSync(file, 'utf8').trim();
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

  const result = await runEval({
    models,
    runs: args.runs,
    fake: args.fake,
    ...(noteParts.length === 0 ? {} : { instructions: loaded, instructionsNote: noteParts.join(' · ') }),
    ...(args.fixture === undefined ? {} : { fixtureFilter: args.fixture }),
    onProgress: (line) => {
      // stderr, so `npm run eval > report.md` gets only the report.
      process.stderr.write(`  ${line}\n`);
    },
  });

  process.stdout.write(`${result.markdown}\n`);
  if (args.out !== undefined) {
    writeFileSync(args.out, `${result.markdown}\n`, 'utf8');
    console.error(`\nwrote ${args.out}`);
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
    const found = sensitivity(result.models);
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

  const gated = result.models.some((model) => model.scores.some((score) => score.gating.length > 0));
  process.exit(gated ? 1 : 0);
}

await main();
