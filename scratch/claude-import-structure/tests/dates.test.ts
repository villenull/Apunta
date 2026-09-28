import { describe, expect, it } from 'vitest';

import {
  addMonths,
  compareDays,
  eligibilityWindow,
  findDateCandidates,
  isEligibleDay,
  isIanaZone,
  zoneDay,
} from '../src/dates.js';

/**
 * Calendar arithmetic, which is where "three months ago" quietly goes wrong.
 *
 * The suite runs under four timezones (see README); every function here takes
 * the zone as an argument and reads nothing from the process, so all four runs
 * must give the same answers. That is the point of running it four times.
 */

describe('month arithmetic', () => {
  it('shifts months and clamps to the target month end', () => {
    expect(addMonths('2026-09-27', -3)).toBe('2026-06-27');
    expect(addMonths('2026-08-31', -3)).toBe('2026-05-31');
    expect(addMonths('2026-05-31', -3)).toBe('2026-02-28');
    expect(addMonths('2028-05-31', -3)).toBe('2028-02-29');
    expect(addMonths('2026-03-31', -3)).toBe('2025-12-31');
    expect(addMonths('2026-12-31', -3)).toBe('2026-09-30');
    expect(addMonths('2026-01-31', -1)).toBe('2025-12-31');
  });

  it('refuses anything that is not a calendar day', () => {
    expect(() => addMonths('27/06/2026', -3)).toThrow(/calendar day/u);
  });
});

describe('the eligibility window', () => {
  it('is inclusive at both ends and three months long', () => {
    const window = eligibilityWindow({ referenceDate: '2026-09-27', timezone: 'America/Mexico_City' });
    expect(window.from).toBe('2026-06-27');
    expect(window.to).toBe('2026-09-27');
    expect(window.clamped_from).toBeNull();
    expect(isEligibleDay('2026-06-27', window)).toBe(true);
    expect(isEligibleDay('2026-09-27', window)).toBe(true);
    expect(isEligibleDay('2026-06-26', window)).toBe(false);
    expect(isEligibleDay('2026-09-28', window)).toBe(false);
    expect(isEligibleDay(null, window)).toBe(false);
  });

  it('clamps a short target month and says so', () => {
    const window = eligibilityWindow({ referenceDate: '2026-05-31', timezone: 'UTC' });
    expect(window.from).toBe('2026-02-28');
    expect(window.clamped_from).toBe('2026-02-31');
    expect(isEligibleDay('2026-02-28', window)).toBe(true);
    expect(isEligibleDay('2026-02-27', window)).toBe(false);
  });

  it('does not clamp a leap year February', () => {
    const window = eligibilityWindow({ referenceDate: '2028-02-29', timezone: 'UTC' });
    expect(window.from).toBe('2027-11-29');
    expect(window.clamped_from).toBeNull();
  });

  it('refuses an unknown zone and a malformed reference date', () => {
    expect(() => eligibilityWindow({ referenceDate: '2026-09-27', timezone: 'Mars/Olympus' })).toThrow(
      /timezone/u,
    );
    expect(() => eligibilityWindow({ referenceDate: '27/06/2026', timezone: 'UTC' })).toThrow(/YYYY-MM-DD/u);
    expect(isIanaZone('America/Mexico_City')).toBe(true);
    expect(isIanaZone('UTC+6')).toBe(false);
  });
});

describe('the practice timezone, not the machine timezone', () => {
  it('puts the same instant on different calendar days in different zones', () => {
    const instant = '2026-06-27T04:00:00.000Z';
    expect(zoneDay(instant, 'America/Mexico_City')).toBe('2026-06-26');
    expect(zoneDay(instant, 'UTC')).toBe('2026-06-27');
    expect(zoneDay(instant, 'Australia/Sydney')).toBe('2026-06-27');
    expect(zoneDay(instant, 'Asia/Tokyo')).toBe('2026-06-27');
  });

  it('moves a late-evening session into the next local day west of Greenwich', () => {
    expect(zoneDay('2026-06-28T03:30:00.000Z', 'America/Mexico_City')).toBe('2026-06-27');
    expect(zoneDay('2026-06-28T03:30:00.000Z', 'Australia/Sydney')).toBe('2026-06-28');
  });

  it('returns null for an unparseable instant', () => {
    expect(zoneDay('not a date', 'UTC')).toBeNull();
  });
});

describe('reading a date out of a sentence, in both languages', () => {
  const days = (text: string): (string | null)[] =>
    findDateCandidates(text)
      .filter((candidate) => candidate.kind === 'anchored')
      .map((candidate) => candidate.day);

  it('reads ISO, English and Spanish forms', () => {
    expect(days('Session on 2026-09-10, and again on September 10, 2026.')).toEqual([
      '2026-09-10',
      '2026-09-10',
    ]);
    expect(days('La sesión fue el 10 de septiembre de 2026.')).toEqual(['2026-09-10']);
    expect(days('The 10th September 2026 session')).toEqual(['2026-09-10']);
  });

  it('reads a slash date only when one reading is impossible', () => {
    expect(days('14/07/2026')).toEqual(['2026-07-14']);
    const ambiguous = findDateCandidates('07/08/2026');
    expect(ambiguous).toHaveLength(1);
    expect(ambiguous[0]?.kind).toBe('ambiguous');
    expect(ambiguous[0]?.day).toBeNull();
    expect(ambiguous[0]?.alternative).toBe('2026-08-07');
  });

  it('reports a day and a month with no year as unanchored, not as a date', () => {
    const found = findDateCandidates('the session was on July 14');
    expect(found.map((candidate) => candidate.kind)).toContain('unanchored');
    expect(days('the session was on July 14')).toEqual([]);
  });

  it('reads no date out of ordinary prose', () => {
    expect(days('She woke at 3am and we did grounding for ten minutes.')).toEqual([]);
  });

  it('orders and sorts days the way the window compares them', () => {
    expect(compareDays('2026-06-26', '2026-06-27')).toBe(-1);
    expect(compareDays('2026-06-27', '2026-06-27')).toBe(0);
    expect(compareDays('2026-09-28', '2026-09-27')).toBe(1);
  });
});
