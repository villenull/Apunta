import type { ChildProcess } from 'node:child_process';

import { describe, expect, it, vi } from 'vitest';

import { openBrowser } from './boot.js';

function fakeSpawn(): { impl: ReturnType<typeof vi.fn>; child: { unref: ReturnType<typeof vi.fn> } } {
  const child = { on: vi.fn(), unref: vi.fn() };
  const impl = vi.fn(() => child as unknown as ChildProcess);
  return { impl, child };
}

describe('openBrowser', () => {
  it('runs `open` with the loopback URL on darwin', () => {
    const { impl, child } = fakeSpawn();
    const result = openBrowser({
      url: 'http://127.0.0.1:7717',
      platform: 'darwin',
      spawnImpl: impl as never,
    });

    expect(result.opened).toBe(true);
    expect(impl).toHaveBeenCalledWith('open', ['http://127.0.0.1:7717'], {
      detached: true,
      stdio: 'ignore',
    });
    // Detached and unref'd: a browser left open must not hold the server's
    // stdio, and must not keep the process alive after Ctrl-C.
    expect(child.unref).toHaveBeenCalled();
  });

  it('does nothing anywhere else, which is what keeps the server portable', () => {
    const { impl } = fakeSpawn();
    const result = openBrowser({ url: 'http://127.0.0.1:7717', platform: 'linux', spawnImpl: impl as never });

    expect(result.opened).toBe(false);
    expect(result.reason).toContain('linux');
    expect(impl).not.toHaveBeenCalled();
  });

  it('can be turned off, for a LaunchAgent or a remote session', () => {
    const { impl } = fakeSpawn();
    const result = openBrowser({
      url: 'http://127.0.0.1:7717',
      platform: 'darwin',
      spawnImpl: impl as never,
      disabled: true,
    });

    expect(result.opened).toBe(false);
    expect(impl).not.toHaveBeenCalled();
  });

  it('is never fatal when `open` is missing', () => {
    const impl = vi.fn(() => {
      throw new Error('spawn open ENOENT');
    });
    const result = openBrowser({
      url: 'http://127.0.0.1:7717',
      platform: 'darwin',
      spawnImpl: impl as never,
    });

    expect(result.opened).toBe(false);
    expect(result.reason).toContain('ENOENT');
  });
});
