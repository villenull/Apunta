import { describe, expect, it } from 'vitest';

import { uuidv7 } from './uuid.js';

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('uuidv7', () => {
  it('produces a well-formed v7 uuid with the right variant bits', () => {
    for (let i = 0; i < 100; i += 1) {
      expect(uuidv7()).toMatch(UUID_SHAPE);
    }
  });

  it('encodes the millisecond timestamp in the leading 48 bits', () => {
    // Ahead of "now" so the monotonic clamp (exercised below) does not move it.
    const timestamp = Date.now() + 60_000;
    const id = uuidv7(timestamp);
    const encoded = Number.parseInt(id.slice(0, 8) + id.slice(9, 13), 16);

    expect(encoded).toBe(timestamp);
  });

  it('sorts lexicographically by creation order, even within one millisecond', () => {
    const ids = Array.from({ length: 500 }, () => uuidv7());

    expect([...ids].sort()).toEqual(ids);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('never goes backwards when the clock does', () => {
    const first = uuidv7();
    const second = uuidv7(Date.UTC(2020, 0, 1)); // clock stepped back years

    expect(second > first).toBe(true);
  });
});
