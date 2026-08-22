import { existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { DEFAULT_PORT, defaultDataDir, ensureDataDir, loadConfig } from './config.js';

const created: string[] = [];

afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('loadConfig', () => {
  it('binds loopback and the documented default port', () => {
    const config = loadConfig({});
    expect(config.host).toBe('127.0.0.1');
    expect(config.port).toBe(DEFAULT_PORT);
    expect(config.dataDir).toBe(defaultDataDir());
    expect(config.fakeAi).toBe(false);
  });

  it('honours APUNTA_PORT, APUNTA_DATA_DIR and APUNTA_FAKE_AI', () => {
    const config = loadConfig({
      APUNTA_PORT: '7799',
      APUNTA_DATA_DIR: '/tmp/apunta-data',
      APUNTA_FAKE_AI: '1',
    });
    expect(config.port).toBe(7799);
    expect(config.dataDir).toBe('/tmp/apunta-data');
    expect(config.fakeAi).toBe(true);
  });

  it('rejects a nonsense port', () => {
    expect(() => loadConfig({ APUNTA_PORT: 'later' })).toThrow(/APUNTA_PORT/);
  });
});

describe('ensureDataDir', () => {
  it('creates the directory when it is missing', () => {
    const dir = join(tmpdir(), `apunta-cfg-${Date.now()}`, 'nested');
    created.push(dir);
    expect(existsSync(dir)).toBe(false);
    ensureDataDir(dir);
    expect(existsSync(dir)).toBe(true);
  });
});
