import { existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { DEFAULT_OLLAMA_URL, DEFAULT_PORT, defaultDataDir, ensureDataDir, loadConfig } from './config.js';
import { EgressBlockedError } from './egress-guard.js';

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

  it('defaults the Ollama URL to loopback and accepts a loopback override', () => {
    expect(loadConfig({}).ollamaUrl).toBe(DEFAULT_OLLAMA_URL);
    expect(loadConfig({ APUNTA_OLLAMA_URL: 'http://localhost:11500' }).ollamaUrl).toBe(
      'http://localhost:11500',
    );
  });

  /**
   * An env var that names a host gets the same check as everything else, and
   * it fails at boot rather than at the first draft — by which point the
   * therapist's session notes would already have been handed to `fetch`.
   */
  it('refuses an Ollama URL that is not loopback', () => {
    expect(() => loadConfig({ APUNTA_OLLAMA_URL: 'https://evil.example' })).toThrow(EgressBlockedError);
    expect(() => loadConfig({ APUNTA_OLLAMA_URL: 'http://127.0.0.1.evil.com' })).toThrow(EgressBlockedError);
    expect(() => loadConfig({ APUNTA_OLLAMA_URL: 'not a url' })).toThrow(EgressBlockedError);
  });

  it('rejects a negative fake stream delay', () => {
    expect(() => loadConfig({ APUNTA_FAKE_STREAM_DELAY_MS: '-1' })).toThrow(/APUNTA_FAKE_STREAM_DELAY_MS/);
    expect(loadConfig({ APUNTA_FAKE_STREAM_DELAY_MS: '0' }).fakeStreamDelayMs).toBe(0);
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
