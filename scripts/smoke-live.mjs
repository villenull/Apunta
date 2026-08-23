#!/usr/bin/env node
/**
 * Manual smoke test against the real local AI stack. Never runs in CI.
 *
 *   npm run build && npm run smoke:live
 *
 * The automated suite runs entirely against the fake providers, so it proves
 * the plumbing and nothing about the model. This is the only check that puts a
 * real dictation through a real Ollama and looks at what comes back — and the
 * gate on M3, because three of the failure modes below are silent: the note
 * arrives, it validates, and it is wrong.
 *
 * Options:
 *   --fixture <name>   an e2e/fixtures/eval/*.txt stem (default: the longest)
 *   --model <tag>      override the configured/auto-picked model
 *   --format intake    use the intake instructions instead of progress
 *   --runs <n>         repeat n times; the repetition bug is intermittent
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const AI_DIST = join(root, 'server', 'dist', 'ai');

let OllamaProvider, defaultModelForMachine, defaultInstructionsFor;
try {
  ({ OllamaProvider, defaultModelForMachine } = await import(join(AI_DIST, 'index.js')));
  ({ defaultInstructionsFor } = await import(join(AI_DIST, 'default-instructions.js')));
} catch (error) {
  fail(
    `could not load the built server from ${AI_DIST}\n` +
      `Run \`npm run build\` first — this script drives the built server.\n${error?.message ?? ''}`,
  );
}

// --- arguments -------------------------------------------------------------

const argv = process.argv.slice(2);
const arg = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? undefined : argv[i + 1];
};

// `npm run smoke:live --runs 5` does not do what it looks like: npm claims
// `--runs` as its own config and forwards only `5`. The script would then run
// once, silently, which is the weakest possible evidence about an intermittent
// bug while looking like the strong check. Catch it instead of obeying it.
const stray = argv.filter((a) => /^\d+$/.test(a) && argv[argv.indexOf(a) - 1] !== '--runs');
if (stray.length > 0) {
  fail(
    `unexpected bare argument "${stray[0]}".\n` +
      'If you meant to repeat runs, npm needs the separator:\n' +
      '  npm run smoke:live -- --runs 5',
  );
}

const FIXTURES = join(root, 'e2e', 'fixtures', 'eval');
const runs = Number(arg('runs') ?? 1);
const intake = arg('format') === 'intake';

const fixtureName = arg('fixture');
const fixtureFile = fixtureName
  ? readdirSync(FIXTURES).find((f) => f.startsWith(fixtureName) && f.endsWith('.txt'))
  : longestFixture();
if (!fixtureFile) fail(`no fixture matching "${fixtureName}" in ${FIXTURES}`);

const dictation = readFileSync(join(FIXTURES, fixtureFile), 'utf8').trim();

/**
 * Default to the longest transcript deliberately.
 *
 * ollama#15502 — a repetition loop under grammar-constrained decoding with
 * free-text string fields — needs realistic material to surface. A toy prompt
 * passes and proves nothing.
 */
function longestFixture() {
  return readdirSync(FIXTURES)
    .filter((f) => f.endsWith('.txt'))
    .map((f) => ({ f, size: readFileSync(join(FIXTURES, f), 'utf8').length }))
    .sort((a, b) => b.size - a.size)[0]?.f;
}

const SECTIONS = intake
  ? ['Presenting concern', 'History', 'Mental status', 'Formulation', 'Plan']
  : ['Subjective', 'Objective', 'Assessment', 'Plan'];
const FORMAT_NAME = intake ? 'Intake note' : 'Progress note';

// --- provider --------------------------------------------------------------

const model = arg('model') ?? defaultModelForMachine();
const baseUrl = process.env.APUNTA_OLLAMA_URL ?? 'http://127.0.0.1:11434';

console.log(`fixture   ${fixtureFile} (${dictation.split(/\s+/).length} words)`);
console.log(`format    ${FORMAT_NAME}`);
console.log(`model     ${model}`);
console.log(`ollama    ${baseUrl}\n`);

const provider = new OllamaProvider({ baseUrl, resolveModel: () => model });

const description = await provider.describe();
if (!description.reachable) {
  fail(`Ollama is not reachable at ${baseUrl}. Start it with \`ollama serve\`.`);
}
if (!description.modelPresent) {
  fail(`model "${model}" is not pulled. Run \`ollama pull ${model}\`.`);
}
if (description.weightsFormat !== 'gguf') {
  // The whole packet rests on schema-constrained sampling, and a non-GGUF
  // engine ignores `format` without saying so (ollama#16563). A note would
  // still come back; it just would not be constrained by anything.
  fail(
    `model "${model}" reports weights format "${description.weightsFormat ?? 'unknown'}", not "gguf".\n` +
      'Structured output is not enforced on that engine — the draft would be unconstrained.',
  );
}

// --- run -------------------------------------------------------------------

let failures = 0;

for (let run = 1; run <= runs; run += 1) {
  if (runs > 1) console.log(`── run ${run} of ${runs} ──`);
  failures += (await once()) ? 0 : 1;
}

if (failures > 0) {
  console.error(`\n${failures} of ${runs} run(s) FAILED.`);
  process.exit(1);
}
console.log(`\n${runs > 1 ? `All ${runs} runs` : 'Run'} passed.`);

async function once() {
  const started = Date.now();
  let sections = null;
  let stats = null;

  try {
    for await (const event of provider.generateNote({
      instructions: defaultInstructionsFor(FORMAT_NAME, SECTIONS),
      formatName: FORMAT_NAME,
      sections: SECTIONS,
      typedNotes: dictation,
    })) {
      if (event.type === 'status') process.stdout.write(`  ${event.message}\r`);
      else if (event.type === 'sections') {
        sections = event.sections;
        stats = event.stats;
      }
    }
  } catch (error) {
    console.error(`\n  FAILED: ${error?.message ?? String(error)}`);
    return false;
  }

  const wallSeconds = (Date.now() - started) / 1000;
  if (!sections) {
    console.error('\n  FAILED: the provider finished without producing a note.');
    return false;
  }

  // --- the note ------------------------------------------------------------

  console.log(`\n${'─'.repeat(72)}`);
  for (const name of SECTIONS) {
    const body = sections[name] ?? '';
    console.log(`${name}: ${body === '' ? '(empty)' : body}`);
  }
  console.log('─'.repeat(72));

  const tps = stats?.evalNanos > 0 ? stats.outputTokens / (stats.evalNanos / 1e9) : 0;
  console.log(
    `${stats?.outputTokens ?? 0} tokens in ${wallSeconds.toFixed(1)}s — ` +
      `${tps.toFixed(1)} tok/s, prompt ${stats?.promptTokens ?? 0}, ` +
      `load ${Math.round((stats?.loadNanos ?? 0) / 1e6)}ms, ` +
      `attempts ${stats?.attempts ?? '?'}, done "${stats?.doneReason ?? '?'}"`,
  );

  // --- checks --------------------------------------------------------------

  const problems = [];

  // Not "every section non-empty" — the owner asked for blanks where a topic
  // was not addressed, so an empty section is correct behaviour. A note that
  // is empty *throughout* is still a failure.
  if (SECTIONS.every((name) => (sections[name] ?? '').trim() === '')) {
    problems.push('every section came back empty');
  }

  for (const name of SECTIONS) {
    const repeat = findRepetition(sections[name] ?? '');
    if (repeat) problems.push(`repetition loop in ${name}: "${repeat}" repeats`);
  }

  // Hitting the output cap on a note this short means it never stopped —
  // the shape a repetition loop takes when it runs to the limit.
  if (stats?.doneReason === 'length') {
    problems.push('generation stopped at the token limit rather than finishing');
  }

  // Ollama truncates the prompt from the HEAD, so an over-length prompt
  // silently drops the instructions while keeping the dictation — confident
  // fabrication with nothing in the response to show for it.
  if (stats && stats.promptTokens >= 16384) {
    problems.push(
      `prompt filled the ${stats.promptTokens}-token context — instructions may have been truncated away`,
    );
  }

  if (stats?.attempts > 1) {
    console.log(`  note: took ${stats.attempts} attempts — the first response failed validation.`);
  }

  if (problems.length > 0) {
    console.error('\n  FAILED:');
    for (const problem of problems) console.error(`   - ${problem}`);
    return false;
  }

  console.log('  OK — schema-valid, no repetition, prompt within context.');
  return true;
}

/**
 * The signature of ollama#15502: a phrase that repeats verbatim several times.
 * Looks for any 6-word window occurring 3+ times, which prose does not do and
 * a stuck decoder does constantly.
 */
function findRepetition(text) {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 24) return null;

  const seen = new Map();
  for (let i = 0; i + 6 <= words.length; i += 1) {
    const gram = words
      .slice(i, i + 6)
      .join(' ')
      .toLowerCase();
    const count = (seen.get(gram) ?? 0) + 1;
    if (count >= 3) return gram;
    seen.set(gram, count);
  }
  return null;
}

function fail(message) {
  console.error(`smoke:live — ${message}`);
  process.exit(1);
}
