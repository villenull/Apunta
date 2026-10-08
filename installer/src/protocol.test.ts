import { describe, expect, it } from 'vitest';

import { decodeEvent, encodeEvent, SETUP_STEP_IDS, type SetupEvent } from './protocol.js';

const PLAN: SetupEvent = {
  event: 'plan',
  memoryGib: 32,
  model: {
    tag: 'gemma4:12b-it-qat',
    publisher: 'Google',
    reason: 'because this computer has 32 GB',
    licence: { name: 'Gemma Terms of Use', url: 'https://ollama.com/library/gemma4', verified: false },
  },
  steps: [
    { id: 'speech_model', label: 'The model that reads your recordings', needed: true, approxBytes: 1 },
  ],
  disk: {
    ok: true,
    freeBytes: 2,
    requiredBytes: 1,
    headroomBytes: 0,
    shortfallBytes: 0,
    message: 'fine',
  },
  ready: false,
};

describe('the NDJSON protocol', () => {
  it('is one line per event, and round-trips', () => {
    const line = encodeEvent(PLAN);
    expect(line.endsWith('\n')).toBe(true);
    expect(line.trimEnd()).not.toContain('\n');
    expect(decodeEvent(line)).toEqual(PLAN);
  });

  it('round-trips every event shape the shell has to render', () => {
    const events: SetupEvent[] = [
      PLAN,
      { event: 'step', id: 'writing_model', status: 'started', label: 'x' },
      {
        event: 'progress',
        id: 'speech_model',
        completedBytes: 1,
        totalBytes: 2,
        percent: 50,
        bytesPerSecond: null,
        etaSeconds: null,
        detail: '1 of 2',
      },
      { event: 'message', text: 'hello' },
      { event: 'done', ok: true },
      { event: 'failed', code: 'not_enough_disk', title: 't', detail: 'd', retryable: true },
    ];
    for (const event of events) {
      expect(decodeEvent(encodeEvent(event)), event.event).toEqual(event);
    }
  });

  /**
   * The shell is in another language and cannot re-check the shape, so an
   * event that does not fit must fail here rather than leave a window stuck at
   * 0% with no way to find out why.
   */
  it('refuses to emit an event that does not fit the schema', () => {
    expect(() => encodeEvent({ event: 'done', ok: false } as unknown as SetupEvent)).toThrow();
    expect(() =>
      encodeEvent({ event: 'step', id: 'nope', status: 'started', label: 'x' } as unknown as SetupEvent),
    ).toThrow();
  });

  it('reads a line that is not ours as nothing, rather than throwing', () => {
    expect(decodeEvent('')).toBeNull();
    expect(decodeEvent('some log line from a library')).toBeNull();
    expect(decodeEvent('{"event":"unknown"}')).toBeNull();
  });

  it('names every step, so the window can list them before it starts', () => {
    expect([...SETUP_STEP_IDS]).toEqual(['speech_model', 'preview_model', 'writing_model']);
  });
});
