import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { WHISPER_MODEL_FILENAME } from '@apunta/shared';
import { afterEach, describe, expect, it } from 'vitest';

import { DEFAULT_MODEL, LARGE_MODEL, SMALL_MODEL, modelForMemory } from '../ai/model-picker.js';

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

function dryRun(args: readonly string[] = []): RunResult {
  try {
    const output = execFileSync('bash', [script, '--dry-run', '--yes', '--no-color', ...args], {
      encoding: 'utf8',
      env: { ...process.env, APUNTA_SETUP_ALLOW_NON_MACOS: '1' },
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

  it('picks the same model the app would pick, at the same boundaries', () => {
    // Two copies of the RAM table exist — one in bash, one in TypeScript — and
    // a Mac where the script pulls one model and the app asks for another is
    // a Mac that looks set up and cannot draft.
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
    expect(tag('SMALL_TAG')).toBe(SMALL_MODEL);

    const large = tier('LARGE_TIER_GIB');
    const middle = tier('DEFAULT_TIER_GIB');
    expect(modelForMemory(large)).toBe(LARGE_MODEL);
    expect(modelForMemory(large - 1)).toBe(DEFAULT_MODEL);
    expect(modelForMemory(middle)).toBe(DEFAULT_MODEL);
    expect(modelForMemory(middle - 1)).toBe(SMALL_MODEL);
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
