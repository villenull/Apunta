/**
 * The shell bridge (C-BRIDGE@1 rules 1 and 2).
 *
 * Every line is one JSON object on the child's **stdout**, and the shell reads
 * nothing else on that stream. Everything here is gated on `APUNTA_SHELL=1`,
 * which is what keeps browser mode's stdout byte-for-byte what it is today:
 * with the variable unset this module writes nothing at all and reads no
 * stdin.
 *
 * Two rules are load-bearing and easy to undo by accident:
 *
 * - **The writes are synchronous** (`fs.writeSync(1, …)`), never
 *   `console.log` or `process.stdout.write` ahead of a `process.exit`. On a
 *   pipe — which is exactly what a Tauri's child stdout is —
 *   `process.stdout` is asynchronous and `process.exit()` does not wait for
 *   pending writes, so a queued line is discarded by the exit it was written
 *   to precede. The shell would then see a child that exited 75 with no
 *   `fatal` line, and an intermittent failure would be read as a broken bridge
 *   rather than a lost write.
 * - **A code travels only as this line.** It is never parsed out of a log line,
 *   never read from an exit status and never matched on a substring. A log line
 *   and a bridge line are different channels, and guessing across them is how
 *   the app would report "port in use" for a folder that is already owned.
 */

import { writeSync } from 'node:fs';
import type { Readable } from 'node:stream';

// A **type-only** import, and the only one in this file: it is erased at compile
// time, so this module still has no runtime dependency of any kind. That is not
// tidiness — P3.3's own suite loads this file in a bare `node` process that
// resolves nothing, and a value import would break it.
import type { QuiesceResult } from './maintenance.js';

/** C-BRIDGE@1 rule 1's `protocol` field. Bumped only on an incompatible change. */
export const BRIDGE_PROTOCOL = 1;

/** The only message code P3.3 fixes for `data_folder_in_use` (C-OWN@1 rule 3). */
export const DATA_FOLDER_IN_USE_CODE = 'data_folder_in_use';

/** The code for the one other condition: the port was already taken (E5). */
export const PORT_IN_USE_CODE = 'port_in_use';

export type ShellBridgeCode = typeof DATA_FOLDER_IN_USE_CODE | typeof PORT_IN_USE_CODE | (string & {});

/** What the shell can send on stdin. Unknown types are logged and ignored. */
export type InboundMessage =
  | {
      readonly type: 'update_status';
      readonly state: string;
      readonly version?: string;
      readonly code?: string;
    }
  | { readonly type: 'quiesce' }
  | { readonly type: 'shutdown' };

/** An outbound line, in the shape C-BRIDGE@1 rules 1 and 2 fix. */
export type OutboundMessage =
  | {
      readonly type: 'ready';
      readonly port: number;
      readonly nonce: string;
      readonly version: string;
      readonly protocol: number;
    }
  | { readonly type: 'fatal'; readonly code: string }
  /**
   * C-BRIDGE@1 rule 2's quiesce answer. Exactly the two fields the contract
   * fixes — the shell branches on `ok` and reads `blockers[]`, and a
   * `quiesceId` is deliberately **not** here: it ties a client report to a
   * quiesce inside the server, and nothing on the shell's side matches on it.
   */
  | { readonly type: 'quiesce_result'; readonly ok: boolean; readonly blockers: readonly string[] };

export interface BridgeEnv {
  readonly APUNTA_SHELL?: string | undefined;
  readonly APUNTA_SHELL_NONCE?: string | undefined;
}

/** A writer that appends one already-terminated line to the stream. */
export type LineWriter = (line: string) => void;

/** The real writer: synchronous, on fd 1. See the module comment. */
export const writeSyncToStdout: LineWriter = (line) => {
  writeSync(1, line);
};

/** `APUNTA_SHELL=1` means "a shell is listening", and nothing else counts. */
export function shellIsListening(env: BridgeEnv): boolean {
  return env['APUNTA_SHELL'] === '1';
}

function serialize(message: OutboundMessage): string {
  return `${JSON.stringify(message)}\n`;
}

/**
 * C-BRIDGE@1 rule 1's ready line. Written once, when listening.
 *
 * The nonce is the shell's, out of `APUNTA_SHELL_NONCE`; the shell accepts the
 * line only if it matches, so a line from anything but this spawn is ignored.
 * It is a distinct value from the C-OWN@1 lock nonce and is never compared
 * with it: the lock nonce proves folder ownership on disk, this one proves the
 * line came out of this spawn.
 */
export function writeReady(options: {
  readonly env: BridgeEnv;
  readonly port: number;
  readonly version: string;
  readonly write?: LineWriter;
}): boolean {
  const { env, port, version } = options;
  if (!shellIsListening(env)) return false;
  const nonce = env['APUNTA_SHELL_NONCE'];
  if (nonce === undefined || nonce === '') {
    throw new Error('APUNTA_SHELL=1 but APUNTA_SHELL_NONCE is unset: the ready line carries the shell nonce');
  }
  const write = options.write ?? writeSyncToStdout;
  write(serialize({ type: 'ready', port, nonce, version, protocol: BRIDGE_PROTOCOL }));
  return true;
}

/**
 * C-BRIDGE@1 rule 2's `fatal{code}`, and C-BRIDGE@1 rule 7's trigger for the
 * bilingual error screen.
 *
 * No nonce: it is read from the same trusted stdout stream, and the shape has
 * no nonce field to add. An unrecognised code still shows the error screen,
 * carrying the code verbatim — this never validates a code into silence.
 *
 * Returns nothing meaningful and never returns at all in the intended use: the
 * caller exits immediately after it, which is why the write above is
 * synchronous.
 */
export function writeFatal(
  code: ShellBridgeCode,
  options: { readonly env: BridgeEnv; readonly write?: LineWriter },
): boolean {
  const { env } = options;
  if (!shellIsListening(env)) return false;
  const write = options.write ?? writeSyncToStdout;
  write(serialize({ type: 'fatal', code }));
  return true;
}

/**
 * The quiesce entry point, installed by `routes/app-quiesce.ts` when the app is
 * built.
 *
 * It is injected rather than imported because of the note above: this file must
 * stay importable on its own. What lands here is `quiesceFromBridge()` — the
 * **same** function `POST /api/app/quiesce` calls — so the shell's close request
 * and the HTTP trigger are one function with two callers, not two
 * implementations that can drift.
 */
let quiesceHandler: (() => Promise<QuiesceResult>) | null = null;

/** Called once, by the route module, with the app's quiesce entry point. */
export function setQuiesceHandler(handler: () => Promise<QuiesceResult>): void {
  quiesceHandler = handler;
}

/**
 * C-BRIDGE@1 rule 2's `quiesce_result{ok, blockers[]}`, written through the same
 * synchronous writer as `ready` and `fatal`, and under the same gate: nothing is
 * written in browser mode, where there is no shell to read it.
 */
export function writeQuiesceResult(
  result: QuiesceResult,
  options: { readonly env: BridgeEnv; readonly write?: LineWriter },
): boolean {
  if (!shellIsListening(options.env)) return false;
  const write = options.write ?? writeSyncToStdout;
  write(
    serialize({
      type: 'quiesce_result',
      ok: result.ok,
      blockers: [...result.blockers],
    }),
  );
  return true;
}

/**
 * One inbound line, or `null` when it is not a JSON object.
 *
 * `null` covers a blank line, a line that is not JSON, and JSON that is not an
 * object — all of which the shell's own logs should see rather than crash on.
 */
export function parseBridgeLine(line: string): InboundMessage | { readonly type: string } | null {
  const trimmed = line.trim();
  if (trimmed === '') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const type = (parsed as { type?: unknown }).type;
  if (typeof type !== 'string') return null;
  return parsed as InboundMessage | { readonly type: string };
}

/**
 * C-BRIDGE@1 rule 2's inbound half: `shutdown` and `quiesce` are acted on, and
 * **every** unknown type is logged and ignored. Nothing inbound can shut the
 * server down except the exact word, and nothing inbound is ever fatal.
 *
 * `onQuiesce` is optional because the dispatch of an inbound line is this
 * function's only job: whoever reads the pipe decides what a quiesce means.
 * `startStdinBridge` gives it the real one — the same entry point
 * `POST /api/app/quiesce` calls — and a caller that only cares about shutdown
 * passes nothing and hears a log line instead.
 */
export function handleInboundLine(
  line: string,
  handlers: {
    readonly onShutdown: () => void;
    readonly onQuiesce?: () => void;
    readonly log?: (message: string) => void;
  },
): void {
  const log = handlers.log ?? (() => undefined);
  const parsed = parseBridgeLine(line);
  if (parsed === null) {
    log(`shell bridge: ignoring an unreadable line: ${line.trim().slice(0, 200)}`);
    return;
  }
  if (parsed.type === 'shutdown') {
    handlers.onShutdown();
    return;
  }
  if (parsed.type === 'quiesce') {
    if (handlers.onQuiesce === undefined) {
      log('shell bridge: ignoring quiesce, because this reader has no quiesce handler');
      return;
    }
    handlers.onQuiesce();
    return;
  }
  log(`shell bridge: ignoring unknown inbound type ${JSON.stringify(parsed.type)}`);
}

/**
 * Reads `shutdown` from stdin, and only under `APUNTA_SHELL=1`.
 *
 * Returns whether reading started, so a caller (and a test) can tell "no shell"
 * from "a shell that has not spoken yet". The reader is `unref`'d and resumed
 * rather than kept open: a piped stdin that is never written to must not be the
 * reason the process cannot exit, and in browser mode nothing reads stdin at
 * all.
 *
 * **`end` means the shell is gone.** The shell holds the write end of this pipe
 * and this process holds the read end, so end-of-file is not a message and not
 * an ordinary shutdown: it is the shell having died without saying goodbye. That
 * happens for real — a forced X window destruction makes GDK's error handler
 * abort the shell process before any of its own quit handling can run — and the
 * consequence of ignoring it is exactly the orphan the app exists to avoid: a
 * server still holding the port and the data folder with nothing left to close
 * it. `onParentGone` therefore closes the server the same way `shutdown` does.
 * It is an optional callback rather than a hard-wired shutdown so the reader
 * stays a pure reader, and it fires only under `APUNTA_SHELL=1`, so browser mode
 * reads no stdin at all and is unchanged.
 */
export function startStdinBridge(options: {
  readonly env: BridgeEnv;
  /** `process.stdin` in production; a `Readable` in a test. */
  readonly input?: Readable;
  readonly onShutdown: () => void;
  /**
   * C-UPD@1's quiesce, from the shell's `quiesce{}` (C-BRIDGE@1 rule 2).
   *
   * Optional, and defaulted here rather than in `index.ts`: the default calls
   * the **same exported entry point** `POST /api/app/quiesce` calls
   * (`server/src/maintenance.ts`) and writes the one `quiesce_result` line
   * through this module's own writer. One function, two callers — so the shell's
   * close request and the HTTP trigger cannot drift apart, and neither is a
   * test-only switch.
   */
  readonly onQuiesce?: () => void;
  /**
   * The shell's end of the pipe closed without a `shutdown`. Absent means "do
   * nothing on end-of-file", which is the old behaviour and is what a caller
   * with no shell in front of it wants.
   */
  readonly onParentGone?: () => void;
  readonly log?: (message: string) => void;
}): boolean {
  if (!shellIsListening(options.env)) return false;
  const input = options.input ?? process.stdin;
  const log = options.log ?? (() => undefined);
  const env = options.env;
  /**
   * The quiesce half. Asynchronous because the drain is, and fire-and-forget
   * because a line reader cannot await: the answer travels back as its own
   * `quiesce_result` line, which is the whole of C-BRIDGE@1 rule 2's contract
   * for this message. A failure is a log line and never a crash — nothing
   * inbound is ever fatal.
   */
  const onQuiesce =
    options.onQuiesce ??
    ((): void => {
      const run = quiesceHandler;
      if (run === null) {
        // No app wired the entry point, so there is nothing to drain and nobody
        // to ask. Fail closed, in the contract's own shape, rather than leaving
        // the shell waiting for a line that will never come.
        writeQuiesceResult({ ok: false, blockers: ['no_response'] }, { env });
        return;
      }
      void run()
        .then((result) => {
          writeQuiesceResult(result, { env });
        })
        .catch((error: unknown) => {
          log(`shell bridge: quiesce failed: ${error instanceof Error ? error.message : String(error)}`);
        });
    });
  let buffered = '';
  // `shutdown` and end-of-file can both arrive — a shell that wrote `shutdown` and
  // then closed its end is not two quits — so the shutdown callback is one-shot.
  let stopped = false;
  const stopOnce = (): void => {
    if (stopped) return;
    stopped = true;
    options.onShutdown();
  };
  input.setEncoding('utf8');
  input.on('data', (chunk: string | Buffer) => {
    buffered += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    let newline = buffered.indexOf('\n');
    while (newline !== -1) {
      const line = buffered.slice(0, newline);
      buffered = buffered.slice(newline + 1);
      handleInboundLine(line, { onShutdown: stopOnce, onQuiesce, log });
      newline = buffered.indexOf('\n');
    }
  });
  input.on('end', () => {
    // An unterminated tail is still read, because a `shutdown` written without
    // its newline is a shutdown.
    if (buffered !== '') {
      handleInboundLine(buffered, { onShutdown: stopOnce, onQuiesce, log });
      buffered = '';
      return;
    }
    // End of file with nothing buffered: the shell closed its end without saying
    // goodbye. See the note on `onParentGone`.
    if (options.onParentGone !== undefined) {
      stopOnce();
    }
  });
  input.on('error', (error: Error) => {
    log(`shell bridge: stdin failed: ${error.message}`);
  });
  input.resume();
  // `unref` keeps an open pipe from being the reason the process cannot exit.
  (input as Readable & { unref?: () => void }).unref?.();
  return true;
}
