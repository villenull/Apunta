import { describe, expect, it } from 'vitest';

import { assertLoopback, defaultDataDir, parseArgs, UsageError } from './cli.js';
import { machineMemoryGib } from './machine.js';

describe('parseArgs', () => {
  it('needs a command', () => {
    expect(() => parseArgs([], {}, 'darwin')).toThrow(UsageError);
    expect(() => parseArgs(['go'], {}, 'darwin')).toThrow(UsageError);
    expect(parseArgs(['plan'], {}, 'darwin').command).toBe('plan');
    expect(parseArgs(['run'], {}, 'darwin').command).toBe('run');
  });

  it('takes the data directory from the flag, then the environment, then the platform default', () => {
    expect(parseArgs(['run', '--data-dir', '/tmp/x'], {}, 'darwin').dataDir).toBe('/tmp/x');
    expect(parseArgs(['run'], { APUNTA_DATA_DIR: '/tmp/y' }, 'darwin').dataDir).toBe('/tmp/y');
    expect(parseArgs(['run'], {}, 'darwin').dataDir).toContain('Library/Application Support/Apunta');
  });

  it('rejects an unknown option rather than ignoring it', () => {
    expect(() => parseArgs(['run', '--turbo'], {}, 'darwin')).toThrow(UsageError);
    expect(() => parseArgs(['run', '--model'], {}, 'darwin')).toThrow(UsageError);
  });

  /**
   * R13: the installer had no `win32` branch, so on Windows it fell through to
   * the Linux-style default. C-PATH@1's table now decides, and this is the
   * caller-level half of that: with no flag and no environment, `parseArgs`
   * hands back exactly what `defaultDataDir` says for the platform.
   */
  it('defaults a win32 run to the Windows data folder, not the Linux-style one', () => {
    expect(parseArgs(['run'], {}, 'win32').dataDir).toBe(defaultDataDir('win32', {}));
  });

  /**
   * This process runs outside the server's egress guard, so its own URL check
   * is the guard. A non-loopback runtime would be handed the prompt — the
   * therapist's account of a session.
   */
  it('refuses a runtime that is not on this Mac', () => {
    expect(() => parseArgs(['run', '--ollama-url', 'http://example.com:11434'], {}, 'darwin')).toThrow(
      UsageError,
    );
    expect(parseArgs(['run', '--ollama-url', 'http://localhost:11434'], {}, 'darwin').ollamaUrl).toBe(
      'http://localhost:11434',
    );
    expect(() => {
      assertLoopback('http://[::1]:11434');
    }).not.toThrow();
    expect(() => {
      assertLoopback('nonsense');
    }).toThrow(UsageError);
  });
});

describe('defaultDataDir', () => {
  it('matches what the server computes on each platform', () => {
    expect(defaultDataDir('darwin', {})).toContain('Library/Application Support/Apunta');
    expect(defaultDataDir('linux', { XDG_DATA_HOME: '/data' })).toBe('/data/apunta');
    expect(defaultDataDir('linux', {})).toContain('.local/share/apunta');
  });

  /**
   * The two `win32` rows, asserted as suffixes because the wrapper reads the
   * real `homedir()`. The exact strings live in
   * `shared/src/platform-paths.test.ts`; these prove the installer reaches the
   * shared function rather than keeping its own copy of the table.
   */
  it('uses APPDATA on win32', () => {
    expect(defaultDataDir('win32', { APPDATA: '/appdata' })).toBe('/appdata/Apunta');
  });

  it('falls back to Roaming under the home folder on win32, never to the XDG default', () => {
    const dir = defaultDataDir('win32', {});
    expect(dir.endsWith('AppData/Roaming/Apunta')).toBe(true);
    expect(dir).not.toContain('.local/share');
  });
});

describe('machineMemoryGib', () => {
  it('reads hw.memsize on darwin', () => {
    const gib = machineMemoryGib({
      platformName: 'darwin',
      exec: () => `${String(32 * 1024 ** 3)}\n`,
    });
    expect(gib).toBe(32);
  });

  it('answers null off darwin without running anything', () => {
    let called = false;
    const gib = machineMemoryGib({
      platformName: 'linux',
      exec: () => {
        called = true;
        return '0';
      },
    });
    expect(gib).toBeNull();
    expect(called).toBe(false);
  });

  it('answers null rather than throwing when the command fails or lies', () => {
    expect(
      machineMemoryGib({
        platformName: 'darwin',
        exec: () => {
          throw new Error('no sysctl here');
        },
      }),
    ).toBeNull();
    expect(machineMemoryGib({ platformName: 'darwin', exec: () => 'not a number' })).toBeNull();
    expect(machineMemoryGib({ platformName: 'darwin', exec: () => '0' })).toBeNull();
  });
});
