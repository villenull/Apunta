import { afterEach, describe, expect, it } from 'vitest';

import { calendarDay, instantToLocalDay } from './common.js';
import { addDays } from './plan.js';

const originalTimezone = process.env.TZ;

afterEach(() => {
  if (originalTimezone === undefined) delete process.env.TZ;
  else process.env.TZ = originalTimezone;
});

describe('instantToLocalDay', () => {
  it('uses the local calendar day for an instant in a UTC-6 timezone', () => {
    process.env.TZ = 'America/Denver';
    expect(instantToLocalDay('2026-09-23T02:30:00.000Z')).toBe('2026-09-22');
    expect(instantToLocalDay('2026-09-22T15:00:00.000Z')).toBe('2026-09-22');
  });

  it('keeps calendar-only values as calendar values in a UTC-6 timezone', () => {
    process.env.TZ = 'America/Denver';
    expect(calendarDay('2026-09-22')).toBe('2026-09-22');
    expect(addDays('2026-09-22', 1)).toBe('2026-09-23');
  });
});
