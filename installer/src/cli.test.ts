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
