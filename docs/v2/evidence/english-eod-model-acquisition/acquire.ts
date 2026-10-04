/**
 * One owner-authorised English speech-model acquisition (AM-198 / A17).
 *
 * Drives the *existing* installer's exported entry points — `parseArgs` and
 * `environmentFor` from `installer/src/cli.ts`, then `makePlan`/`runSetup` from
 * `installer/src/run.ts` — with the installer's own network logic intact and a
 * fail-closed `fetchImpl` adapter supplied by `guarded-fetch.ts`.
 *
 * The destination is the git-ignored `build/eod-model-cache`, never the live
 * data folder. No server, no app, no database, no inference, no Ollama pull.
 *
 *   tsx acquire.ts <plan|run> <cacheDir> <logPath>
 */

import { mkdirSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { environmentFor, parseArgs } from '../../installer/src/cli.js';
import { encodeEvent } from '../../installer/src/protocol.js';
import { makePlan, runSetup } from '../../installer/src/run.js';
import { makeGuardedFetchImpl } from './guarded-fetch.js';

const command = process.argv[2];
const cacheDir = process.argv[3] === undefined ? '' : resolve(process.argv[3]);
const logPath = process.argv[4];

if ((command !== 'plan' && command !== 'run') || cacheDir === '' || logPath === undefined) {
  process.stderr.write('usage: acquire.ts <plan|run> <cacheDir> <logPath>\n');
  process.exit(2);
}

const options = parseArgs(
  [
    command,
    '--data-dir',
    cacheDir,
    '--ollama-url',
    'http://127.0.0.1:11434',
    '--model',
    'qwen3.5:4b-q4_K_M',
  ],
  process.env,
  process.platform,
);

const emit = (event): void => {
  process.stdout.write(encodeEvent(event));
};

mkdirSync(options.dataDir, { recursive: true, mode: 0o700 });

process.stderr.write(`mode=${command}\n`);
process.stderr.write(`dataDir=${options.dataDir}\n`);
process.stderr.write(`ollamaUrl=${options.ollamaUrl}\n`);
process.stderr.write(`modelOverride=${String(options.modelOverride)}\n`);
process.stderr.write(`cacheContentsBefore=${JSON.stringify(listDir(options.dataDir))}\n`);

const environment = {
  ...environmentFor(options, emit),
  fetchImpl: makeGuardedFetchImpl(logPath),
  runtimeWaitMs: 10_000,
};

let ok: boolean;
if (command === 'plan') {
  const { plan } = await makePlan(environment);
  emit(plan);
  ok = true;
} else {
  ok = await runSetup(environment);
}

process.stderr.write(`cacheContentsAfter=${JSON.stringify(listDir(options.dataDir))}\n`);
process.stderr.write(`${command}Ok=${ok ? 'true' : 'false'}\n`);
process.exit(ok ? 0 : 1);

function listDir(path: string): string[] {
  try {
    return readdirSync(path, { withFileTypes: true })
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}
