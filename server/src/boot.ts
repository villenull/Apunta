import { spawn } from 'node:child_process';
import { platform } from 'node:os';

/**
 * The two things `npm start` does beyond starting a server.
 *
 * Both live here rather than inline in `index.ts` so they are unit-testable
 * without opening a port, and so the darwin-only half is one function with an
 * injectable spawn rather than a platform branch buried in the bootstrap.
 * Server *logic* stays portable (CLAUDE.md rule 4); this is a convenience that
 * knows what `open` is on the platform that has it.
 */

export type SpawnLike = typeof spawn;

export interface OpenBrowserOptions {
  readonly url: string;
  readonly platform?: string;
  readonly spawnImpl?: SpawnLike;
  /** `APUNTA_NO_OPEN=1` — for a LaunchAgent, a remote session, or a script. */
  readonly disabled?: boolean;
}

export interface OpenBrowserResult {
  readonly opened: boolean;
  readonly reason?: string;
}

/**
 * `open http://127.0.0.1:7717` once the server is listening.
 *
 * Detached and with its streams ignored: a browser that outlives the shell
 * must not keep the server's stdio open, and nothing the browser prints
 * belongs in Apunta's output. Failure is never fatal — the URL is on the
 * console either way, and a machine where `open` is missing is a machine that
 * still works.
 */
export function openBrowser(options: OpenBrowserOptions): OpenBrowserResult {
  if (options.disabled === true) return { opened: false, reason: 'APUNTA_NO_OPEN is set' };

  const target = options.platform ?? platform();
  if (target !== 'darwin') return { opened: false, reason: `no browser opener for ${target}` };

  try {
    const child = (options.spawnImpl ?? spawn)('open', [options.url], {
      detached: true,
      stdio: 'ignore',
    });
    child.on('error', () => {
      // `open` missing or refused. The console already carries the URL.
    });
    child.unref();
    return { opened: true };
  } catch (error) {
    return { opened: false, reason: error instanceof Error ? error.message : String(error) };
  }
}
