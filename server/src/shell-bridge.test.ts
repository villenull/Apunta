import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough, Readable } from 'node:stream';

import { describe, expect, it } from 'vitest';

import {
  BRIDGE_PROTOCOL,
  handleInboundLine,
  parseBridgeLine,
  setHealthConfirmHandler,
  setMaintenanceReleaseHandler,
  setSnapshotHandler,
  setUpdateStatusHandler,
  startStdinBridge,
  writeCloseDecision,
  writeFatal,
  writeHealthResult,
  writeReady,
  writeRecoveryRequest,
  writeSetupRequest,
  writeSnapshotResult,
  writeStartupContext,
  writeUpdateRequest,
} from './shell-bridge.js';

/**
 * The gating is asserted by passing the variables explicitly in each case, so
 * nothing here inherits a developer's shell: `shell-bridge.test.ts` runs with
 * no sandbox around it (V6) and must behave the same either way.
 */
const SHELL_ENV = { APUNTA_SHELL: '1', APUNTA_SHELL_NONCE: 'nonce-from-the-shell' };

function collector(): { lines: string[]; write: (line: string) => void } {
  const lines: string[] = [];
  return { lines, write: (line: string) => lines.push(line) };
}

function tick(ms = 50): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

describe('the ready line (C-BRIDGE@1 rule 1)', () => {
  it('carries the port, the nonce from the environment, the version and protocol 1', () => {
    const sink = collector();

    const written = writeReady({ env: SHELL_ENV, port: 7831, version: '1.2.3', write: sink.write });

    expect(written).toBe(true);
    expect(sink.lines).toHaveLength(1);
    expect(JSON.parse(sink.lines[0] as string)).toEqual({
      type: 'ready',
      port: 7831,
      nonce: 'nonce-from-the-shell',
      version: '1.2.3',
      protocol: BRIDGE_PROTOCOL,
    });
    expect(BRIDGE_PROTOCOL).toBe(1);
  });

  it('is exactly one JSON object on exactly one line', () => {
    const sink = collector();
    writeReady({ env: SHELL_ENV, port: 7831, version: '1.2.3', write: sink.write });

    const line = sink.lines[0] as string;
    expect(line.endsWith('\n')).toBe(true);
    expect(line.trimEnd().includes('\n')).toBe(false);
  });

  it('carries the nonce the shell generated, never one of its own', () => {
    const sink = collector();
    writeReady({ env: SHELL_ENV, port: 7831, version: '1.2.3', write: sink.write });

    expect(JSON.parse(sink.lines[0] as string).nonce).toBe('nonce-from-the-shell');
  });

  it('is written only when APUNTA_SHELL=1', () => {
    const sink = collector();

    const written = writeReady({
      env: { APUNTA_SHELL_NONCE: 'nonce-from-the-shell' },
      port: 7831,
      version: '1.2.3',
      write: sink.write,
    });

    expect(written).toBe(false);
    expect(sink.lines).toEqual([]);
  });

  it('refuses to announce a nonce it was never given', () => {
    const sink = collector();

    expect(() =>
      writeReady({ env: { APUNTA_SHELL: '1' }, port: 7831, version: '1.2.3', write: sink.write }),
    ).toThrow(/APUNTA_SHELL_NONCE/);
    expect(sink.lines).toEqual([]);
  });
});

describe('the fatal line', () => {
  it('carries the code and no nonce', () => {
    const sink = collector();

    const written = writeFatal('data_folder_in_use', { env: SHELL_ENV, write: sink.write });

    expect(written).toBe(true);
    const parsed = JSON.parse(sink.lines[0] as string) as Record<string, unknown>;
    expect(parsed).toEqual({ type: 'fatal', code: 'data_folder_in_use' });
    expect(parsed).not.toHaveProperty('nonce');
  });

  it('carries an unrecognised code verbatim rather than swallowing it', () => {
    const sink = collector();
    writeFatal('some_future_code', { env: SHELL_ENV, write: sink.write });

    expect(JSON.parse(sink.lines[0] as string).code).toBe('some_future_code');
  });

  it('is written only when APUNTA_SHELL=1, so browser mode stdout stays byte-for-byte today', () => {
    const sink = collector();

    expect(writeFatal('port_in_use', { env: {}, write: sink.write })).toBe(false);
    expect(writeFatal('port_in_use', { env: { APUNTA_SHELL: '0' }, write: sink.write })).toBe(false);
    expect(sink.lines).toEqual([]);
  });

  /**
   * The synchronous-write rule proved rather than asserted in prose: a real
   * child, a really piped stdout, the write and the exit in the same tick. On a
   * pipe `process.stdout` is asynchronous, so an async write queued here is
   * discarded by the exit and the shell would see a child that exited 75 with
   * no line at all — the intermittent failure the card's rule prevents.
   */
  it('arrives intact when the writer exits in the same tick, through a piped stdout', async () => {
    const scratch = mkdtempSync(join(tmpdir(), 'apunta-bridge-'));
    const script = join(scratch, 'fatal-child.mts');
    // Node 24 strips the types, so the child runs the very module under test
    // rather than a copy of its logic.
    const bridgeUrl = new URL('./shell-bridge.ts', import.meta.url).href;
    writeFileSync(
      script,
      [
        `import { writeFatal } from ${JSON.stringify(bridgeUrl)};`,
        `writeFatal('port_in_use', { env: { APUNTA_SHELL: '1' } });`,
        `process.exit(75);`,
        '',
      ].join('\n'),
    );

    try {
      const { stdout, code, stderr } = await new Promise<{
        stdout: string;
        code: number | null;
        stderr: string;
      }>((resolvePromise, rejectPromise) => {
        const child = spawn(process.execPath, [script], {
          env: { PATH: process.env['PATH'] ?? '' },
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        let out = '';
        let err = '';
        child.stdout.on('data', (chunk: Buffer) => {
          out += chunk.toString('utf8');
        });
        child.stderr.on('data', (chunk: Buffer) => {
          err += chunk.toString('utf8');
        });
        child.on('error', rejectPromise);
        child.on('close', (closed) => resolvePromise({ stdout: out, code: closed, stderr: err }));
      });

      expect(stderr).toBe('');
      expect(code).toBe(75);
      const lines = stdout.split('\n').filter((line) => line.trim() !== '');
      expect(lines).toHaveLength(1);
      expect(JSON.parse(lines[0] as string)).toEqual({ type: 'fatal', code: 'port_in_use' });
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });
});

describe('parseBridgeLine', () => {
  it('accepts one JSON object and rejects everything else', () => {
    expect(parseBridgeLine('{"type":"shutdown"}')).toEqual({ type: 'shutdown' });
    expect(parseBridgeLine('not json')).toBeNull();
    expect(parseBridgeLine('')).toBeNull();
    expect(parseBridgeLine('[1,2]')).toBeNull();
    expect(parseBridgeLine('null')).toBeNull();
  });
});

describe('inbound messages (stdin)', () => {
  it('calls the shutdown handler for `shutdown`', () => {
    let shutdowns = 0;
    const logged: string[] = [];

    handleInboundLine('{"type":"shutdown"}', {
      onShutdown: () => {
        shutdowns += 1;
      },
      log: (message) => logged.push(message),
    });

    expect(shutdowns).toBe(1);
    expect(logged).toEqual([]);
  });

  it('logs and ignores an unknown inbound type instead of treating it as fatal', () => {
    let shutdowns = 0;
    const logged: string[] = [];

    handleInboundLine('{"type":"something_new"}', {
      onShutdown: () => {
        shutdowns += 1;
      },
      log: (message) => logged.push(message),
    });

    expect(shutdowns).toBe(0);
    expect(logged.join('\n')).toContain('something_new');
  });

  it('logs and ignores a line that is not JSON', () => {
    const logged: string[] = [];

    handleInboundLine('hello?', { onShutdown: () => undefined, log: (message) => logged.push(message) });

    expect(logged).toHaveLength(1);
  });

  it('reads stdin only under APUNTA_SHELL=1', async () => {
    const input = new PassThrough();
    let shutdowns = 0;

    const started = startStdinBridge({
      env: {},
      input,
      onShutdown: () => {
        shutdowns += 1;
      },
    });

    input.write('{"type":"shutdown"}\n');
    await tick();
    expect(started).toBe(false);
    expect(shutdowns).toBe(0);
    input.destroy();
  });

  it('reads a `shutdown` line under APUNTA_SHELL=1, joining a line split across chunks', async () => {
    const input = new PassThrough();
    let shutdowns = 0;

    const started = startStdinBridge({
      env: { APUNTA_SHELL: '1' },
      input,
      onShutdown: () => {
        shutdowns += 1;
      },
    });

    expect(started).toBe(true);
    input.write('{"type":"shut');
    await tick();
    expect(shutdowns).toBe(0);
    input.write('down"}\n');
    await tick();
    expect(shutdowns).toBe(1);
    input.destroy();
  });

  it('never leaves the reader as the reason the process cannot exit', async () => {
    const input = Readable.from([]);

    const started = startStdinBridge({ env: { APUNTA_SHELL: '1' }, input, onShutdown: () => undefined });

    expect(started).toBe(true);
    await tick();
  });
});

describe('the shell disappearing (stdin end-of-file)', () => {
  // A forced X window destruction does not reach the shell's own quit handling:
  // GDK's error handler aborts the process. What is left is this — the pipe's
  // write end closed with nothing written. A server that ignored it stays alive
  // holding the port and the data folder, which is the orphan the app exists to
  // prevent, so end-of-file closes the server.

  it('closes the server when the shell closes its end without saying shutdown', async () => {
    const input = new PassThrough();
    let shutdowns = 0;

    const started = startStdinBridge({
      env: { APUNTA_SHELL: '1' },
      input,
      onShutdown: () => {
        shutdowns += 1;
      },
      onParentGone: () => {
        shutdowns += 1;
      },
    });

    expect(started).toBe(true);
    input.end();
    await tick();
    expect(shutdowns).toBe(1);
  });

  it('does nothing on end-of-file when no handler was given', async () => {
    // The old behaviour, and still the right one for a caller with no shell: an
    // end-of-file it did not ask about must not become a quit it did not ask for.
    const input = new PassThrough();
    let shutdowns = 0;

    startStdinBridge({
      env: { APUNTA_SHELL: '1' },
      input,
      onShutdown: () => {
        shutdowns += 1;
      },
    });

    input.end();
    await tick();
    expect(shutdowns).toBe(0);
  });

  it('a shutdown line followed by end-of-file is one shutdown, not two', async () => {
    // The ladder writes `shutdown` and the shell then exits, closing its end.
    // That is one quit arriving by two routes, and the server must act once.
    const input = new PassThrough();
    let shutdowns = 0;

    startStdinBridge({
      env: { APUNTA_SHELL: '1' },
      input,
      onShutdown: () => {
        shutdowns += 1;
      },
      onParentGone: () => {
        shutdowns += 1;
      },
    });

    input.write('{"type":"shutdown"}\n');
    await tick();
    input.end();
    await tick();
    expect(shutdowns).toBe(1);
  });

  it('an unterminated shutdown is still a shutdown, and the end after it adds nothing', async () => {
    const input = new PassThrough();
    let shutdowns = 0;

    startStdinBridge({
      env: { APUNTA_SHELL: '1' },
      input,
      onShutdown: () => {
        shutdowns += 1;
      },
      onParentGone: () => {
        shutdowns += 1;
      },
    });

    input.write('{"type":"shutdown"}');
    await tick();
    expect(shutdowns).toBe(0);
    input.end();
    await tick();
    expect(shutdowns).toBe(1);
  });

  it('reads nothing at all without APUNTA_SHELL=1, so browser mode is unchanged', async () => {
    const input = new PassThrough();
    let shutdowns = 0;

    const started = startStdinBridge({
      env: {},
      input,
      onShutdown: () => {
        shutdowns += 1;
      },
      onParentGone: () => {
        shutdowns += 1;
      },
    });

    input.write('{"type":"shutdown"}\n');
    input.end();
    await tick();
    expect(started).toBe(false);
    expect(shutdowns).toBe(0);
  });
});

describe('the updater messages (C-BRIDGE@1 rule 2)', () => {
  it('writes each outbound line in the contract shape, and only under APUNTA_SHELL=1', () => {
    const sink = collector();
    const options = { env: SHELL_ENV, write: sink.write };
    writeUpdateRequest('install', options);
    writeSnapshotResult('7', { ok: false, code: 'not_quiesced' }, options);
    writeSnapshotResult('8', { ok: true }, options);
    writeCloseDecision(true, options);
    writeStartupContext({ mode: 'recovery', updateId: 'u1', targetVersion: '2.0.0' }, options);
    writeHealthResult('u1', { ok: true }, options);
    writeRecoveryRequest({ id: 'r1', action: 'reinstall_previous' }, options);
    expect(sink.lines.map((line) => JSON.parse(line) as unknown)).toEqual([
      { type: 'update_request', action: 'install' },
      { type: 'snapshot_result', id: '7', ok: false, code: 'not_quiesced' },
      { type: 'snapshot_result', id: '8', ok: true },
      { type: 'close_decision', confirm: true },
      { type: 'startup_context', mode: 'recovery', updateId: 'u1', targetVersion: '2.0.0' },
      { type: 'health_result', id: 'u1', ok: true },
      { type: 'recovery_request', id: 'r1', action: 'reinstall_previous' },
    ]);
    expect(sink.lines.every((line) => line.endsWith('\n') && line.indexOf('\n') === line.length - 1)).toBe(
      true,
    );

    const quiet = collector();
    expect(writeUpdateRequest('check', { env: {}, write: quiet.write })).toBe(false);
    expect(quiet.lines).toEqual([]);
  });

  it('dispatches each inbound type, and ignores ids that are not strings', async () => {
    const statuses: unknown[] = [];
    const releases: number[] = [];
    const snapshots: string[] = [];
    setUpdateStatusHandler((status) => statuses.push(status));
    setMaintenanceReleaseHandler(() => releases.push(1));
    setSnapshotHandler((id) => {
      snapshots.push(id);
      return Promise.resolve({ ok: true });
    });
    setHealthConfirmHandler((id) => (id === 'known' ? { ok: true } : { ok: false, code: 'unknown_update' }));
    const sink = collector();
    const input = new PassThrough();
    startStdinBridge({ env: SHELL_ENV, input, onShutdown: () => undefined, write: sink.write });
    for (const message of [
      { type: 'update_status', state: 'available', version: '2.0.0' },
      { type: 'update_status', state: 'idle', code: 'offline' },
      { type: 'update_status' },
      { type: 'maintenance_release' },
      { type: 'snapshot_request', id: '5' },
      { type: 'snapshot_request', id: 5 },
      { type: 'health_confirm', id: 'known' },
      { type: 'health_confirm', id: 'other' },
    ]) {
      input.write(`${JSON.stringify(message)}\n`);
    }
    await tick();
    try {
      expect(statuses).toEqual([
        { state: 'available', version: '2.0.0' },
        { state: 'idle', code: 'offline' },
      ]);
      expect(releases).toEqual([1]);
      expect(snapshots).toEqual(['5']);
      expect(sink.lines.map((line) => JSON.parse(line) as unknown)).toEqual([
        { type: 'health_result', id: 'known', ok: true },
        { type: 'health_result', id: 'other', ok: false, code: 'unknown_update' },
        { type: 'snapshot_result', id: '5', ok: true },
      ]);
    } finally {
      setUpdateStatusHandler(null);
      setMaintenanceReleaseHandler(null);
      setSnapshotHandler(null);
      setHealthConfirmHandler(null);
      input.destroy();
    }
  });

  it('fails closed when nothing is wired: snapshot_failed and unknown_update', async () => {
    setSnapshotHandler(null);
    setHealthConfirmHandler(null);
    const sink = collector();
    const input = new PassThrough();
    startStdinBridge({ env: SHELL_ENV, input, onShutdown: () => undefined, write: sink.write });
    input.write('{"type":"snapshot_request","id":"1"}\n{"type":"health_confirm","id":"2"}\n');
    await tick();
    input.destroy();
    expect(sink.lines.map((line) => JSON.parse(line) as unknown)).toEqual([
      { type: 'snapshot_result', id: '1', ok: false, code: 'snapshot_failed' },
      { type: 'health_result', id: '2', ok: false, code: 'unknown_update' },
    ]);
  });
});

describe('the setup messages', () => {
  it('writes setup_request only when a shell is listening', () => {
    const lines: string[] = [];
    const write = (line: string): void => {
      lines.push(line);
    };
    expect(writeSetupRequest('run', { env: {}, write })).toBe(false);
    expect(writeSetupRequest('run', { env: { APUNTA_SHELL: '1' }, write })).toBe(true);
    expect(lines).toEqual(['{"type":"setup_request","action":"run"}\n']);
  });

  it('hands on a setup_event object and a setup_exit code, and drops malformed ones', () => {
    const events: unknown[] = [];
    const exits: (number | null)[] = [];
    const logged: string[] = [];
    const handlers = {
      onShutdown: () => undefined,
      onSetupEvent: (event: unknown) => events.push(event),
      onSetupExit: (code: number | null) => exits.push(code),
      log: (message: string) => logged.push(message),
    };
    handleInboundLine('{"type":"setup_event","event":{"event":"done","ok":true}}', handlers);
    handleInboundLine('{"type":"setup_event","event":"done"}', handlers);
    handleInboundLine('{"type":"setup_event","event":[1]}', handlers);
    handleInboundLine('{"type":"setup_exit","code":0}', handlers);
    handleInboundLine('{"type":"setup_exit","code":null}', handlers);
    handleInboundLine('{"type":"setup_exit","code":"1"}', handlers);
    handleInboundLine('{"type":"setup_exit"}', handlers);
    expect(events).toEqual([{ event: 'done', ok: true }]);
    expect(exits).toEqual([0, null]);
    expect(logged).toHaveLength(4);
  });
});
