import { describe, expect, it } from 'vitest';

import { HealthResponseSchema } from './health.js';

const stub = {
  ok: true,
  version: '0.0.0',
  fakeAi: false,
  ollama: { reachable: false, model: null, modelPresent: false },
  whisper: { binaryPresent: false, modelPresent: false },
  ffmpeg: { present: false },
};

describe('HealthResponseSchema', () => {
  it('accepts a fully populated health payload', () => {
    expect(HealthResponseSchema.parse(stub)).toEqual(stub);
  });

  it('rejects a payload missing a dependency check', () => {
    const { ffmpeg: _ffmpeg, ...withoutFfmpeg } = stub;
    expect(HealthResponseSchema.safeParse(withoutFfmpeg).success).toBe(false);
  });

  it('rejects unknown value types', () => {
    expect(HealthResponseSchema.safeParse({ ...stub, ok: 'yes' }).success).toBe(false);
  });
});
