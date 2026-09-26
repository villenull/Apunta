import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { WHISPER_MODEL_FILENAME } from '@apunta/shared';
import { afterEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_MODEL,
  LARGE_MODEL,
  PROMOTED_DEFAULT_MODEL,
  recommendedModelForMemory,
  SMALL_MODEL,
} from '../ai/model-picker.js';

/**
 * What can be checked about `scripts/setup-macos.sh` from a Linux container.
 *
 * Not much, and that is the honest position: no line of that script has ever
 * run on a Mac. What *can* be checked is worth checking anyway, because it is
 * the class of mistake that survives a careful read —
 *
 * - it parses, and `--dry-run` walks every step without executing one;
 * - it does not install ffmpeg, which nothing in the app invokes;
 * - its model tags and RAM boundaries still agree with `model-picker.ts`, so
 *   the script and the running app cannot drift into choosing different
 *   models on the same machine;
 * - the speech-model filename still agrees with `shared/`, so the file the
 *   script downloads is the file the app looks for.
 *
 * The rest — that `brew install ollama` works, that the Hugging Face URL is
 * still 200, that the whole sequence produces a working stack — is what the
 * manual pass in `docs/MANUAL-VERIFICATION.md` is for.
 */

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const script = join(repoRoot, 'scripts', 'setup-macos.sh');
const source = readFileSync(script, 'utf8');

let scratch: string | null = null;

afterEach(() => {
  if (scratch !== null) rmSync(scratch, { recursive: true, force: true });
  scratch = null;
});

interface RunResult {
  readonly status: number;
  readonly output: string;
}

function dryRun(args: readonly string[] = [], env: Record<string, string> = {}): RunResult {
  try {
    const output = execFileSync('bash', [script, '--dry-run', '--yes', '--no-color', ...args], {
      encoding: 'utf8',
      // The dead port keeps the walk deterministic: on a machine with a live
      // Ollama, the real probe succeeds and step 5 stops printing the
      // `brew services start` command this suite asserts on (found on M10's
      // Linux machine, where Ollama actually answers).
      env: {
        ...process.env,
        APUNTA_SETUP_ALLOW_NON_MACOS: '1',
        APUNTA_OLLAMA_URL: 'http://127.0.0.1:9',
        ...env,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30_000,
    });
    return { status: 0, output };
  } catch (error) {
    const failure = error as { status?: number; stdout?: string; stderr?: string };
    return { status: failure.status ?? -1, output: `${failure.stdout ?? ''}${failure.stderr ?? ''}` };
  }
}

describe('setup-macos.sh', () => {
  it('parses, and --help explains itself without doing anything', () => {
    const output = execFileSync('bash', [script, '--help'], { encoding: 'utf8' });
    expect(output).toContain('--dry-run');
    expect(output).toContain('--model');
    expect(output).toContain('--skip-ollama');
  });

  it('refuses to run for real anywhere but a Mac', () => {
    // Only `scripts/` may assume macOS (CLAUDE.md rule 4), and it must say so
    // rather than half-installing something on a machine it does not know.
    let status = 0;
    try {
      execFileSync('bash', [script, '--no-color'], { encoding: 'utf8', stdio: 'pipe', timeout: 10_000 });
    } catch (error) {
      status = (error as { status?: number }).status ?? -1;
    }
    expect(status).toBe(2);
  });

  it('walks every step in a dry run and executes none of them', () => {
    scratch = join(tmpdir(), `apunta-setup-dry-${String(Date.now())}`);
    const { output } = dryRun(['--data-dir', scratch]);

    expect(output).toContain('brew install ollama');
    expect(output).toContain('brew install whisper-cpp');
    expect(output).toContain('brew services start ollama');
    expect(output).toContain('ollama pull');
    expect(output).toContain(WHISPER_MODEL_FILENAME);
    // Nine numbered steps, all reached.
    expect(output).toContain('[9]');
    // And nothing was created.
    expect(existsSync(scratch)).toBe(false);
  });

  /**
   * M5 replaced the transcode step with browser-side 16 kHz WAV capture, and
   * `whisper-cli` decodes it directly. Installing ffmpeg would put a
   * GPL-3.0 tool on her Mac for a job nothing does — and M8 would have to
   * undo it (`docs/research/m8-shell-and-runtime-2026-08.md` §4).
   */
  it('does not install ffmpeg, because nothing in the app invokes it', () => {
    const { output } = dryRun();
    expect(output.toLowerCase()).not.toContain('brew install ffmpeg');
    expect(source).not.toMatch(/brew install [^\n]*\bffmpeg\b/);
  });

  /** Prompts and responses in a log file are patient material (§2.4). */
  it('never sets OLLAMA_DEBUG', () => {
    expect(source).not.toMatch(/^[^#\n]*OLLAMA_DEBUG=/m);
  });

  /**
   * Two copies of the RAM table exist — one in bash, one in TypeScript — and
   * a Mac where the script pulls one model and the app asks for another is
   * a Mac that looks set up and cannot draft.
   *
   * Under C-MODEL@1 the table no longer *selects* anything on either side; it
   * is the informational recommendation. So this row proves two things: the
   * literals still agree with `shared/`, and the tag the resolver will return
   * is one of them — which is what keeps a constant from becoming the answer on
   * one side only.
   */
  it('picks the same model the app would pick, at the same boundaries', () => {
    const tag = (name: string): string => {
      const match = new RegExp(`^${name}="([^"]+)"`, 'm').exec(source);
      return match?.[1] ?? '';
    };
    const tier = (name: string): number => {
      const match = new RegExp(`^${name}=(\\d+)`, 'm').exec(source);
      return Number(match?.[1] ?? -1);
    };

    expect(tag('LARGE_TAG')).toBe(LARGE_MODEL);
    expect(tag('DEFAULT_TAG')).toBe(DEFAULT_MODEL);
    expect(tag('WRITING_TAG')).toBe(SMALL_MODEL);

    const large = tier('LARGE_TIER_GIB');
    const middle = tier('DEFAULT_TIER_GIB');
    expect(recommendedModelForMemory(large)).toBe(LARGE_MODEL);
    expect(recommendedModelForMemory(large - 1)).toBe(DEFAULT_MODEL);
    expect(recommendedModelForMemory(middle)).toBe(DEFAULT_MODEL);
    expect(recommendedModelForMemory(middle - 1)).toBe(SMALL_MODEL);
  });

  /**
   * The promoted default is a tag the script already carries, which is why it
   * needed no new literal (C-MODEL@1's fixed decision). A tag nothing in the
   * scripts knows is a model no machine can install, so this is the row that
   * would have caught that.
   *
   * It is named as the *writing* model, not as the small tier: the small tier
   * is a recommendation, and the model that has to be downloaded is the one
   * the app, health and eval all resolve.
   */
  it('names the promoted default as the writing model it downloads', () => {
    expect(source).toContain(`WRITING_TAG="${PROMOTED_DEFAULT_MODEL}"`);
  });

  /**
   * R03, the drift this card exists to close: at the base commit this script
   * chose the model from `hw.memsize`, so a 16 or 32 GiB Mac downloaded
   * `gemma4:12b-it-qat` while the app, health and eval all resolved
   * `qwen3.5:4b-q4_K_M` — setup reported ready and the first inference failed.
   *
   * Every memory size must now download exactly the promoted tag, and the RAM
   * tier may only ever be *reported*. `APUNTA_SETUP_RAM_GIB` is a read-only
   * seam, in the same spirit as the `APUNTA_OLLAMA_URL` one above: it lets a
   * container stand in for a Mac of a given size, so the row is checkable on
   * the platform this suite runs on. It changes no decision.
   */
  it('downloads the effective model whatever this Mac has in RAM', () => {
    for (const gib of ['64', '16', '8', '']) {
      const { output } = dryRun([], gib === '' ? {} : { APUNTA_SETUP_RAM_GIB: gib });
      expect(output, `${gib || 'unreadable'} GiB`).toContain(`ollama pull ${PROMOTED_DEFAULT_MODEL}`);
      // The large and middle tiers are recommendations, never downloads.
      expect(output, `${gib || 'unreadable'} GiB`).not.toContain(`ollama pull ${LARGE_MODEL}`);
      expect(output, `${gib || 'unreadable'} GiB`).not.toContain(`ollama pull ${DEFAULT_MODEL}`);
    }
  });

  it('never assigns the model it downloads from a RAM branch', () => {
    // The whole of the old policy in one line. `MODEL` is the tag the pull at
    // the end of the script uses, so a tier assigned to it is a tier installed.
    expect(source).not.toMatch(/MODEL="\$LARGE_TAG"/);
    expect(source).not.toMatch(/MODEL="\$DEFAULT_TAG"/);
    expect(source).toMatch(/MODEL="\$WRITING_TAG"/);
  });

  it('downloads the speech model under the name the app looks for', () => {
    expect(source).toContain(`WHISPER_MODEL="${WHISPER_MODEL_FILENAME}"`);
    // SHA-1, not SHA-256: whisper.cpp publishes only the former for this file.
    expect(source).toMatch(/shasum -a 1/);
    expect(source).not.toMatch(/shasum -a 256/);
  });

  it('refuses a non-GGUF tag rather than discovering it in a note', () => {
    // Ollama routes MLX/safetensors weights to an engine that silently ignores
    // the JSON schema, so the note's structure stops being enforced with no
    // error at all (ollama#16563).
    const { output } = dryRun(['--model', 'gemma4:12b-mlx']);
    expect(output).toContain('non-GGUF weight format');
    expect(output).not.toContain('ollama pull gemma4:12b-mlx');
  });

  it('honours --skip-models so the tools can be installed without the downloads', () => {
    const { output } = dryRun(['--skip-models']);
    expect(output).not.toContain('ollama pull');
    expect(output).not.toContain('curl -fL');
  });
});

/**
 * `scripts/preflight-macos.sh` is read-only, so unlike the setup script it
 * can be *run* off a Mac (`APUNTA_PREFLIGHT_ALLOW_NON_MACOS=1`) — which is the
 * only way to check what it tells the owner, as opposed to what it means.
 */
describe('preflight-macos.sh', () => {
  const preflight = join(repoRoot, 'scripts', 'preflight-macos.sh');
  const preflightSource = readFileSync(preflight, 'utf8');

  function preflightRun(env: Record<string, string> = {}): string {
    try {
      return execFileSync('bash', [preflight, '--no-color'], {
        encoding: 'utf8',
        env: {
          ...process.env,
          APUNTA_PREFLIGHT_ALLOW_NON_MACOS: '1',
          APUNTA_OLLAMA_URL: 'http://127.0.0.1:9',
          ...env,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 30_000,
      });
    } catch (error) {
      const failure = error as { stdout?: string; stderr?: string };
      return `${failure.stdout ?? ''}${failure.stderr ?? ''}`;
    }
  }

  it('names the writing model as the one it checks and tells the owner to pull', () => {
    expect(preflightSource).toContain(`WRITING_TAG="${PROMOTED_DEFAULT_MODEL}"`);
    // The advice, the `/api/show` probe and the "is it pulled" verdict are all
    // about the model Apunta will actually load.
    expect(preflightSource).toContain('"ollama pull $WRITING_TAG"');
    expect(preflightSource).toContain('{\\"model\\":\\"$WRITING_TAG\\"}');
    expect(preflightSource).not.toMatch(/ollama pull \$TIER_TAG/);
  });

  /**
   * The same drift as the setup script, and worse here, because this text is
   * stated to the owner as fact: at the base commit it read "memory unreadable,
   * so Apunta would pick the fallback model" and "tier: … → …", while the app,
   * health and eval all resolved one promoted tag. `APUNTA_PREFLIGHT_RAM_GIB`
   * is the same read-only seam the setup script has, so a container can stand
   * in for a Mac of a given size.
   */
  it('never tells the owner that Apunta picks a model from this Mac', () => {
    for (const gib of ['64', '16', '8', '']) {
      const label = gib === '' ? 'unreadable' : `${gib} GiB`;
      const output = preflightRun(gib === '' ? {} : { APUNTA_PREFLIGHT_RAM_GIB: gib });

      expect(output, label).not.toContain('Apunta would pick');
      expect(output, label).not.toContain('Apunta falls back to the smallest model');
      expect(output, label).toContain(PROMOTED_DEFAULT_MODEL);
      // The tier survives as a recommendation, and only as one.
      expect(output, label).toMatch(/recommend/i);
    }
  });

  it('still reports the RAM table and its boundaries, unchanged', () => {
    const tag = (name: string): string => {
      const match = new RegExp(`^${name}="([^"]+)"`, 'm').exec(preflightSource);
      return match?.[1] ?? '';
    };
    expect(tag('LARGE_TAG')).toBe(LARGE_MODEL);
    expect(tag('DEFAULT_TAG')).toBe(DEFAULT_MODEL);
    expect(tag('WRITING_TAG')).toBe(SMALL_MODEL);
  });
});

/**
 * The LaunchAgent installer. Same position as the setup script: `launchctl`
 * does not exist here, so what is checkable is the plist it generates and the
 * three decisions in it that are about privacy rather than about launchd.
 */
describe('install-launchagent.sh', () => {
  const agentScript = join(repoRoot, 'scripts', 'install-launchagent.sh');
  const agentSource = readFileSync(agentScript, 'utf8');

  function agentDryRun(args: readonly string[] = []): string {
    return execFileSync('bash', [agentScript, '--dry-run', ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30_000,
    });
  }

  it('generates a plist that parses, without writing or loading anything', () => {
    const output = agentDryRun();
    const plist = output.slice(output.indexOf('<?xml'), output.indexOf('</plist>') + '</plist>'.length);

    // A malformed plist is silently ignored by launchd, which looks exactly
    // like "the LaunchAgent did not work" with nothing to read — and the way
    // it goes malformed is an unbalanced tag from a shell substitution.
    for (const tag of ['dict', 'array', 'key', 'string']) {
      const open = plist.match(new RegExp(`<${tag}>`, 'g'))?.length ?? 0;
      const close = plist.match(new RegExp(`</${tag}>`, 'g'))?.length ?? 0;
      expect(open, `<${tag}> is unbalanced`).toBe(close);
    }
    expect(plist).toContain('<key>Label</key>');
    expect(plist).toContain('com.apunta.server');
    expect(plist).toContain('<key>RunAtLoad</key>');
    expect(existsSync(join(process.env['HOME'] ?? '/root', 'Library/LaunchAgents'))).toBe(false);
  });

  /**
   * Ranked risk 8: note text escaping into a log file is quiet, cumulative and
   * invisible until someone reads the file. A LaunchAgent redirecting stdout
   * to a permanent path is the named example.
   */
  it('sends the server output to /dev/null rather than to a log file', () => {
    const output = agentDryRun();
    expect(output).toContain('<key>StandardOutPath</key>');
    expect(output).toContain('<string>/dev/null</string>');
    expect(agentSource).not.toMatch(/StandardOutPath<\/key>\s*<string>(?!\/dev\/null)/);
  });

  it('stops the background server opening a browser tab at every login', () => {
    expect(agentDryRun()).toContain('APUNTA_NO_OPEN');
  });

  it('sets TMPDIR explicitly, because SQLite falls through to /var/tmp without it', () => {
    const output = agentDryRun();
    expect(output).toContain('<key>TMPDIR</key>');
    expect(output).not.toContain('<string>/var/tmp</string>');
  });

  it('prints its own uninstall, so it is never a thing to look up later', () => {
    expect(agentDryRun()).toContain('--uninstall');
  });
});
