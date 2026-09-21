import { describe, expect, it } from 'vitest';

import { HealthResponseSchema } from './health.js';

const stub = {
  ok: true,
  version: '0.0.0',
  fakeAi: false,
  bundled: false,
  db: { path: '/tmp/apunta.db', migrationLevel: 1 },
  ollama: { reachable: false, model: null, modelPresent: false },
  whisper: {
    binaryPresent: false,
    modelPresent: false,
    binary: 'whisper-cli',
    model: '/tmp/models/ggml-tiny.en.bin',
  },
  fileVault: { state: 'not_applicable' as const, detail: 'disk encryption is not checked on linux' },
};

describe('HealthResponseSchema', () => {
  it('accepts a fully populated health payload', () => {
    expect(HealthResponseSchema.parse(stub)).toEqual(stub);
  });

  it('rejects a payload missing a dependency check', () => {
    const { whisper: _whisper, ...withoutWhisper } = stub;
    expect(HealthResponseSchema.safeParse(withoutWhisper).success).toBe(false);
  });

  /**
   * ffmpeg is not a dependency of the running app (M5 records WAV in the
   * browser), so it is not in the contract either — a stray key must not be
   * quietly accepted and then rendered as a red row in M7's setup checklist.
   */
  it('has no ffmpeg check', () => {
    expect(Object.keys(HealthResponseSchema.shape)).not.toContain('ffmpeg');
  });

  it('rejects unknown value types', () => {
    expect(HealthResponseSchema.safeParse({ ...stub, ok: 'yes' }).success).toBe(false);
  });

  /**
   * FileVault has five states and "we could not tell" is one of them. A schema
   * that only allowed on/off would force an unreadable machine to be reported
   * as unencrypted, which is the one wrong answer here
   * (`docs/research/data-at-rest-2026-08.md` ranked risk 2).
   */
  it('lets FileVault be unknown rather than forcing a false negative', () => {
    for (const state of ['on', 'off', 'deferred', 'unknown', 'not_applicable']) {
      expect(HealthResponseSchema.safeParse({ ...stub, fileVault: { state, detail: '' } }).success).toBe(
        true,
      );
    }
    expect(
      HealthResponseSchema.safeParse({ ...stub, fileVault: { state: 'probably', detail: '' } }).success,
    ).toBe(false);
  });
});
