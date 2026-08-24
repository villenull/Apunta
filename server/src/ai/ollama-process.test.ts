import { EventEmitter } from 'node:events';

import { describe, expect, it, vi } from 'vitest';

import { OllamaProcess, runtimeEnvironment, type Spawn } from './ollama-process.js';

class FakeChild extends EventEmitter {
  exitCode: number | null = null;
  killed = false;
  constructor(readonly pid: number | undefined = 4242) {
    super();
  }
}

function fakeSpawn(child = new FakeChild()) {
  const calls: { command: string; args: readonly string[]; options: Record<string, unknown> }[] = [];
  const spawnImpl = ((command: string, args: readonly string[], options: Record<string, unknown>) => {
    calls.push({ command, args, options });
    return child;
  }) as unknown as Spawn;
  return { spawnImpl, calls, child };
}

describe('runtimeEnvironment', () => {
  it('pins the runtime to loopback and to Apunta’s own model folder', () => {
    const env = runtimeEnvironment(
      { baseUrl: 'http://127.0.0.1:11434', modelsDir: '/data/models' },
      { PATH: '/usr/bin' },
    );
    expect(env['OLLAMA_HOST']).toBe('127.0.0.1:11434');
    expect(env['OLLAMA_MODELS']).toBe('/data/models');
    expect(env['PATH']).toBe('/usr/bin');
  });

  it('carries the two settings that make a 16K context affordable on a 16 GB Mac', () => {
    const env = runtimeEnvironment({ baseUrl: 'http://127.0.0.1:11434', modelsDir: '/m' }, {});
    expect(env['OLLAMA_FLASH_ATTENTION']).toBe('1');
    expect(env['OLLAMA_KV_CACHE_TYPE']).toBe('q8_0');
  });

  /**
   * With `OLLAMA_DEBUG` on, the runtime writes the full text of every prompt —
   * the therapist's account of a session — into a log file that stays on disk.
   * An inherited one from the surrounding environment is just as bad as one we
   * set, so it is removed rather than merely not added.
   */
  it('strips OLLAMA_DEBUG even when it was inherited', () => {
    const env = runtimeEnvironment(
      { baseUrl: 'http://127.0.0.1:11434', modelsDir: '/m' },
      { OLLAMA_DEBUG: '1' },
    );
    expect(env['OLLAMA_DEBUG']).toBeUndefined();
  });

  it('defaults the port when the URL does not carry one', () => {
    const env = runtimeEnvironment({ baseUrl: 'http://127.0.0.1', modelsDir: '/m' }, {});
    expect(env['OLLAMA_HOST']).toBe('127.0.0.1:11434');
  });
});

describe('OllamaProcess', () => {
  const options = { modelsDir: '/data/models', baseUrl: 'http://127.0.0.1:11434' };

  /**
   * The developer path. Homebrew runs Ollama as a service, so the server must
   * not start a second one — and everything about M3 has to keep working with
   * no environment variable set at all.
   */
  it('does nothing at all when no runtime is bundled', () => {
    const { spawnImpl, calls } = fakeSpawn();
    const runtime = new OllamaProcess({ ...options, binary: undefined, spawnImpl });
    expect(runtime.start()).toEqual({ status: 'not_bundled' });
    expect(runtime.running).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('spawns `ollama serve` once, detached, with no inherited stdio', () => {
    const { spawnImpl, calls } = fakeSpawn();
    const runtime = new OllamaProcess({ ...options, binary: '/app/ollama', spawnImpl });

    expect(runtime.start()).toEqual({ status: 'started', pid: 4242 });
    expect(runtime.start()).toEqual({ status: 'started', pid: 4242 });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.command).toBe('/app/ollama');
    expect(calls[0]?.args).toEqual(['serve']);
    expect(calls[0]?.options['detached']).toBe(true);
    expect(calls[0]?.options['stdio']).toBe('ignore');
  });

  it('reports a spawn failure rather than throwing out of boot', () => {
    const spawnImpl = (() => {
      throw new Error('ENOENT');
    }) as unknown as Spawn;
    const runtime = new OllamaProcess({ ...options, binary: '/app/ollama', spawnImpl });
    expect(runtime.start()).toEqual({ status: 'failed', reason: 'ENOENT' });
  });

  it('logs and forgets a runtime that dies on its own', () => {
    const { spawnImpl, child } = fakeSpawn();
    const log = vi.fn();
    const runtime = new OllamaProcess({ ...options, binary: '/app/ollama', spawnImpl, log });

    runtime.start();
    child.emit('exit', 1, null);
    expect(runtime.running).toBe(false);
    expect(log).toHaveBeenCalledWith('the bundled AI runtime stopped', { code: 1, signal: undefined });
  });

  /**
   * The acceptance criterion with the real orphan risk: the runtime spawns
   * model workers, so terminating only the parent leaves an 8 GB model
   * resident after the app has quit. The signal goes to the process group.
   */
  it('stops the whole process group, not just the parent', async () => {
    const { spawnImpl, child } = fakeSpawn();
    const kill = vi.spyOn(process, 'kill').mockImplementation(() => true);
    try {
      const runtime = new OllamaProcess({ ...options, binary: '/app/ollama', spawnImpl });
      runtime.start();

      const stopped = runtime.stop(50);
      child.emit('exit', 0, 'SIGTERM');
      await stopped;

      expect(kill).toHaveBeenCalledWith(-4242, 'SIGTERM');
      expect(runtime.running).toBe(false);
    } finally {
      kill.mockRestore();
    }
  });

  it('escalates to SIGKILL when the runtime will not go', async () => {
    vi.useFakeTimers();
    const { spawnImpl } = fakeSpawn();
    const kill = vi.spyOn(process, 'kill').mockImplementation(() => true);
    try {
      const runtime = new OllamaProcess({ ...options, binary: '/app/ollama', spawnImpl });
      runtime.start();

      const stopped = runtime.stop(3000);
      await vi.advanceTimersByTimeAsync(3100);
      await stopped;

      expect(kill).toHaveBeenCalledWith(-4242, 'SIGTERM');
      expect(kill).toHaveBeenCalledWith(-4242, 'SIGKILL');
    } finally {
      kill.mockRestore();
      vi.useRealTimers();
    }
  });

  it('stopping something that never started is not an error', async () => {
    const { spawnImpl } = fakeSpawn();
    const runtime = new OllamaProcess({ ...options, binary: undefined, spawnImpl });
    await expect(runtime.stop()).resolves.toBeUndefined();
  });
});
