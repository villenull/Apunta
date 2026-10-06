import { spawn, type ChildProcess } from 'node:child_process';

/**
 * Starting and stopping the bundled AI runtime.
 *
 * On a developer's Mac, Ollama is a service Homebrew starts and this module
 * does nothing: `APUNTA_OLLAMA_BIN` is unset, `start()` returns `not_bundled`,
 * and everything behaves exactly as it did in M3.
 *
 * In the packaged app there is no Homebrew and no service, so **the server
 * owns the runtime** — the same way it already owns `whisper-cli`. That is a
 * deliberate shape, not a convenience: the app shell spawns one child (`node`)
 * and the server spawns its own, so "quitting leaves no orphans" is one kill
 * of one process group rather than process-tree bookkeeping across two
 * languages (`docs/research/m8-shell-and-runtime-2026-08.md` §3.1).
 *
 * Portability (CLAUDE.md rule 4): nothing here is macOS-specific. It spawns a
 * named binary and stops it again, which is the same on any platform.
 */

export type Spawn = typeof spawn;

export interface OllamaProcessOptions {
  /** Absolute path to the bundled `ollama`. Unset on a developer machine. */
  readonly binary: string | undefined;
  /** Where the runtime keeps its model blobs — inside Apunta's data folder. */
  readonly modelsDir: string;
  /** `http://127.0.0.1:11434`. The runtime is told to bind exactly here. */
  readonly baseUrl: string;
  readonly spawnImpl?: Spawn;
  readonly log?: (message: string, detail?: Record<string, unknown>) => void;
}

export type StartResult =
  | { readonly status: 'not_bundled' }
  | { readonly status: 'started'; readonly pid: number | undefined }
  | { readonly status: 'failed'; readonly reason: string };

/**
 * The environment the runtime is given.
 *
 * Four deliberate entries and one deliberate absence:
 *
 * - `OLLAMA_HOST` pins it to loopback. Its own default is already
 *   `127.0.0.1`, so this is the belt to that brace — an AI runtime listening
 *   on `0.0.0.0` on a clinic's wifi is a disclosure.
 * - `OLLAMA_MODELS` puts the weights inside Apunta's data folder, so
 *   uninstalling is one folder rather than a hunt through `~/.ollama`.
 * - `OLLAMA_FLASH_ATTENTION` and `OLLAMA_KV_CACHE_TYPE` are what Homebrew's
 *   service block sets, and the second is what makes a 16K context affordable
 *   on a 16 GB Mac (`docs/research/macos-setup-verification.md` §1.3). The
 *   packaged app replaces that service block, so it has to carry them.
 * - **`OLLAMA_DEBUG` is never set.** With it on, Ollama writes the full text
 *   of every prompt — which is patient material — into a log file that stays
 *   on disk (`docs/research/data-at-rest-2026-08.md` §2.4).
 */
export function runtimeEnvironment(
  options: Pick<OllamaProcessOptions, 'modelsDir' | 'baseUrl'>,
  base: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  const url = new URL(options.baseUrl);
  const host = `${url.hostname}:${url.port === '' ? '11434' : url.port}`;
  const env: NodeJS.ProcessEnv = {
    ...base,
    OLLAMA_HOST: host,
    OLLAMA_MODELS: options.modelsDir,
    OLLAMA_FLASH_ATTENTION: '1',
    OLLAMA_KV_CACHE_TYPE: 'q8_0',
  };
  delete env['OLLAMA_DEBUG'];
  return env;
}

/**
 * The bundled runtime as a supervised child.
 *
 * Not a restart-on-crash supervisor: a runtime that dies repeatedly should
 * surface as the AI banner saying it is unreachable, not as a loop nobody can
 * see. What this guarantees is the other direction — that it does not outlive
 * the server.
 */
export class OllamaProcess {
  private child: ChildProcess | null = null;
  private stopping = false;

  constructor(private readonly options: OllamaProcessOptions) {}

  get running(): boolean {
    return this.child !== null && this.child.exitCode === null && !this.child.killed;
  }

  start(): StartResult {
    const binary = this.options.binary;
    if (binary === undefined || binary.trim() === '') return { status: 'not_bundled' };
    if (this.running) return { status: 'started', pid: this.child?.pid };

    const spawnImpl = this.options.spawnImpl ?? spawn;
    try {
      const child = spawnImpl(binary, ['serve'], {
        env: runtimeEnvironment(this.options, process.env),
        // Nothing the runtime prints belongs in Apunta's output: it logs
        // model names and request shapes, and a permanent log file beside a
        // clinical database is a category of accident worth removing rather
        // than auditing.
        stdio: 'ignore',
        // Its own process group, so stopping the server stops the runtime
        // even if the runtime has spawned model workers of its own.
        detached: true,
      });
      this.child = child;

      child.on('error', (error: Error) => {
        this.options.log?.('the bundled AI runtime could not be started', { reason: error.message });
        this.child = null;
      });
      child.on('exit', (code, signal) => {
        if (!this.stopping) {
          this.options.log?.('the bundled AI runtime stopped', {
            code: code ?? undefined,
            signal: signal ?? undefined,
          });
        }
        this.child = null;
      });

      return { status: 'started', pid: child.pid };
    } catch (error) {
      return { status: 'failed', reason: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * Stop it, and mean it.
   *
   * `SIGTERM` to the whole process group (the negative pid), because the
   * runtime spawns model workers and terminating only the parent is how an
   * 8 GB model is left resident after quit. `SIGKILL` after a grace period,
   * because a shutdown that hangs is a shutdown the user force-quits.
   */
  stop(graceMs = 3000): Promise<void> {
    const child = this.child;
    if (child === null || child.pid === undefined) return Promise.resolve();
    this.stopping = true;

    return new Promise<void>((resolve) => {
      const done = (): void => {
        clearTimeout(timer);
        this.child = null;
        this.stopping = false;
        resolve();
      };
      child.once('exit', done);

      this.signal(child.pid as number, 'SIGTERM');
      const timer = setTimeout(() => {
        if (child.pid !== undefined) this.signal(child.pid, 'SIGKILL');
        done();
      }, graceMs);
      // A pending kill timer must not hold the process open by itself.
      timer.unref?.();
    });
  }

  private signal(pid: number, signal: NodeJS.Signals): void {
    try {
      process.kill(-pid, signal);
    } catch {
      try {
        process.kill(pid, signal);
      } catch {
        // Already gone. That is the outcome we wanted.
      }
    }
  }
}
