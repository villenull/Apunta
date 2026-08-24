import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

import { machineMemoryGib } from './machine.js';
import { encodeEvent, type SetupEvent } from './protocol.js';
import { makePlan, runSetup, type SetupEnvironment } from './run.js';

/**
 * The process the app shell spawns for first-run setup.
 *
 *   node setup.js plan        # decide, print one `plan` event, change nothing
 *   node setup.js run         # do it, printing progress as it goes
 *
 * One JSON object per line on stdout, and nothing else on stdout ever — the
 * shell parses every line. Diagnostics go to stderr, where they are invisible
 * to the protocol and available to whoever is debugging.
 *
 * The exit status is for scripts, not for the shell: the shell reads `done` or
 * `failed`, which carry the sentence. 0 means it finished, 1 means it did not.
 */

export interface CliOptions {
  readonly command: 'plan' | 'run';
  readonly dataDir: string;
  readonly ollamaUrl: string;
  readonly modelOverride: string | null;
  readonly runtimeWaitMs: number | null;
}

const DEFAULT_OLLAMA_URL = 'http://127.0.0.1:11434';

export class UsageError extends Error {}

/** Default data directory — the same one `server/src/config.ts` computes. */
export function defaultDataDir(platformName: string, env: NodeJS.ProcessEnv): string {
  const override = env['APUNTA_DATA_DIR'];
  if (override !== undefined && override !== '') return resolve(override);
  if (platformName === 'darwin') return join(homedir(), 'Library', 'Application Support', 'Apunta');
  const xdg = env['XDG_DATA_HOME'];
  return xdg !== undefined && xdg !== '' ? join(xdg, 'apunta') : join(homedir(), '.local', 'share', 'apunta');
}

export function parseArgs(argv: readonly string[], env: NodeJS.ProcessEnv, platformName: string): CliOptions {
  const [command, ...rest] = argv;
  if (command !== 'plan' && command !== 'run') {
    throw new UsageError('usage: setup <plan|run> [--data-dir PATH] [--ollama-url URL] [--model TAG]');
  }

  let dataDir = defaultDataDir(platformName, env);
  let ollamaUrl = env['APUNTA_OLLAMA_URL']?.trim() ?? DEFAULT_OLLAMA_URL;
  let modelOverride: string | null = null;
  let runtimeWaitMs: number | null = null;

  for (let index = 0; index < rest.length; index += 1) {
    const flag = rest[index];
    const value = rest[index + 1];
    switch (flag) {
      case '--data-dir':
        if (value === undefined) throw new UsageError('--data-dir needs a path');
        dataDir = resolve(value);
        index += 1;
        break;
      case '--ollama-url':
        if (value === undefined) throw new UsageError('--ollama-url needs a URL');
        ollamaUrl = value;
        index += 1;
        break;
      case '--model':
        if (value === undefined) throw new UsageError('--model needs a tag');
        modelOverride = value;
        index += 1;
        break;
      case '--runtime-wait-ms':
        if (value === undefined) throw new UsageError('--runtime-wait-ms needs a number');
        runtimeWaitMs = Number(value);
        if (!Number.isFinite(runtimeWaitMs) || runtimeWaitMs < 0) {
          throw new UsageError('--runtime-wait-ms must be a non-negative number');
        }
        index += 1;
        break;
      default:
        throw new UsageError(`unknown option: ${String(flag)}`);
    }
  }

  assertLoopback(ollamaUrl);
  return { command, dataDir, ollamaUrl, modelOverride, runtimeWaitMs };
}

/**
 * The runtime is a process on this Mac. A non-loopback `--ollama-url` would
 * send the prompt — a therapist's account of a session — somewhere else, and
 * this process runs outside the server's egress guard, so this is the guard.
 */
export function assertLoopback(raw: string): void {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new UsageError(`not a URL: ${raw}`);
  }
  const host = parsed.hostname.replace(/^\[|\]$/g, '');
  if (host !== '127.0.0.1' && host !== 'localhost' && host !== '::1') {
    throw new UsageError(`the AI runtime must be on this Mac, not ${parsed.hostname}`);
  }
}

export function environmentFor(options: CliOptions, emit: (event: SetupEvent) => void): SetupEnvironment {
  return {
    dataDir: options.dataDir,
    modelsDir: join(options.dataDir, 'models'),
    ollamaBaseUrl: options.ollamaUrl.replace(/\/+$/, ''),
    memoryGib: machineMemoryGib(),
    modelOverride: options.modelOverride,
    emit,
    ...(options.runtimeWaitMs === null ? {} : { runtimeWaitMs: options.runtimeWaitMs }),
  };
}

export async function main(argv: readonly string[]): Promise<number> {
  let options: CliOptions;
  try {
    options = parseArgs(argv, process.env, process.platform);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }

  const emit = (event: SetupEvent): void => {
    process.stdout.write(encodeEvent(event));
  };

  const environment = environmentFor(options, emit);

  if (options.command === 'plan') {
    const { plan } = await makePlan(environment);
    emit(plan);
    return 0;
  }

  const ok = await runSetup(environment);
  return ok ? 0 : 1;
}
