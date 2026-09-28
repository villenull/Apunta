/**
 * Dates, the hard way, on purpose.
 *
 * The owner's rule is a **rolling three calendar months, inclusive**, with an
 * explicit reference date and an explicit timezone. Three traps live in that
 * sentence and each has bitten a real importer:
 *
 * 1. **Chat date is not session date.** A chat opened on 2026-09-26 can be about
 *    a session in 2025. Eligibility is computed here from a *session date* the
 *    proposal must ground in quoted source text; a chat timestamp is never an
 *    input. `CaptureMessage.sent_at` and `chat_updated_at` exist only so tests
 *    can prove they were not used.
 * 2. **Month ends.** "Three months before 31 May" is 28 February (29 in a leap
 *    year), and "three months before 31 August" is 31 May. Naive
 *    `setMonth` arithmetic rolls 31 May back to 2 or 3 March, which silently
 *    drops or admits a patient.
 * 3. **The machine's timezone is not the practice's.** `instantToLocalDay` in
 *    `shared/src/common.ts` uses the local zone of whichever machine ran it. The
 *    same instant is a different calendar day in Mexico City and Sydney, so the
 *    zone is an input here and nothing reads the process zone.
 */

export const DEFAULT_WINDOW_MONTHS = 3;

export function isIanaZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** The calendar day an instant falls on **in `timeZone`**, as `YYYY-MM-DD`. */
export function zoneDay(instant: string, timeZone: string): string | null {
  const at = new Date(instant);
  if (Number.isNaN(at.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(at);
  const part = (type: string): string => parts.find((p) => p.type === type)?.value ?? '';
  const year = part('year');
  const month = part('month');
  const day = part('day');
  if (year === '' || month === '' || day === '') return null;
  return `${year}-${month}-${day}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** `day` shifted by `months`, clamped to the target month's last day. */
export function addMonths(day: string, months: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (match === null) throw new Error(`Not a calendar day: ${day}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const date = Number(match[3]);
  const zeroBased = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(zeroBased / 12);
  const targetMonth = (zeroBased % 12) + 1;
  return `${String(targetYear).padStart(4, '0')}-${pad(targetMonth)}-${pad(Math.min(date, daysInMonth(targetYear, targetMonth)))}`;
}

export function compareDays(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export interface EligibilityWindow {
  /** The reference date the window is measured from, as given. */
  readonly reference_date: string;
  /** First eligible day, **inclusive** (reference date minus the window). */
  readonly from: string;
  /** Last eligible day, **inclusive** (the reference date itself). */
  readonly to: string;
  readonly months: number;
  readonly timezone: string;
  /** The clamp that applied at the start of the window, when one did. */
  readonly clamped_from: string | null;
}

/**
 * The window. Both ends inclusive: a session on the first day of the window is
 * eligible, and so is one on the reference date itself.
 */
export function eligibilityWindow(input: {
  readonly referenceDate: string;
  readonly timezone: string;
  readonly months?: number;
}): EligibilityWindow {
  const months = input.months ?? DEFAULT_WINDOW_MONTHS;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.referenceDate)) {
    throw new Error(`Reference date is not YYYY-MM-DD: ${input.referenceDate}`);
  }
  if (!isIanaZone(input.timezone)) throw new Error(`Unknown IANA timezone: ${input.timezone}`);
  const from = addMonths(input.referenceDate, -months);
  // The same day the month arithmetic wanted, had the month been long enough.
  const wanted = (() => {
    const year = Number(input.referenceDate.slice(0, 4));
    const month = Number(input.referenceDate.slice(5, 7));
    const date = Number(input.referenceDate.slice(8, 10));
    const zeroBased = year * 12 + (month - 1) - months;
    const targetYear = Math.floor(zeroBased / 12);
    const targetMonth = (zeroBased % 12) + 1;
    return `${String(targetYear).padStart(4, '0')}-${pad(targetMonth)}-${pad(date)}`;
  })();
  return {
    reference_date: input.referenceDate,
    from,
    to: input.referenceDate,
    months,
    timezone: input.timezone,
    clamped_from: wanted === from ? null : wanted,
  };
}

/** Inside the window, both ends included. A null day is never inside. */
export function isEligibleDay(day: string | null, window: EligibilityWindow): boolean {
  if (day === null) return false;
  return compareDays(day, window.from) >= 0 && compareDays(day, window.to) <= 0;
}

// --- Reading a date out of a sentence ----------------------------------------

const MONTHS_EN = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
] as const;
const MONTHS_ES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'setiembre',
  'octubre',
  'noviembre',
  'diciembre',
] as const;
const SHORT_MONTHS = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
] as const;

function monthNumber(name: string): number | null {
  const lower = name.toLowerCase();
  const en = MONTHS_EN.indexOf(lower as (typeof MONTHS_EN)[number]);
  if (en >= 0) return en + 1;
  const es = MONTHS_ES.indexOf(lower as (typeof MONTHS_ES)[number]);
  if (es >= 0) return es + 1;
  const short = SHORT_MONTHS.indexOf(lower.slice(0, 3) as (typeof SHORT_MONTHS)[number]);
  return short >= 0 ? short + 1 : null;
}

function isCalendar(year: number, month: number, day: number): boolean {
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

function iso(year: number, month: number, day: number): string | null {
  if (!isCalendar(year, month, day)) return null;
  return `${String(year).padStart(4, '0')}-${pad(month)}-${pad(day)}`;
}

export type DateCandidateKind = 'anchored' | 'ambiguous' | 'unanchored';

export interface DateCandidate {
  readonly kind: DateCandidateKind;
  /** The day, when the text pins exactly one. */
  readonly day: string | null;
  /** The other reading, when a slash date has two. */
  readonly alternative: string | null;
  readonly match: string;
}

const NAME_MONTHS = [...MONTHS_EN, ...MONTHS_ES, ...SHORT_MONTHS]
  .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  .join('|');

const ISO_DATE = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
const SLASH_DATE = /\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/g;
const ES_LONG = new RegExp(`\\b(\\d{1,2})\\s+de\\s+(${NAME_MONTHS})(?:\\s+de)?\\s+(\\d{4})\\b`, 'giu');
const EN_MONTH_FIRST = new RegExp(
  `\\b(${NAME_MONTHS})\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`,
  'giu',
);
const EN_DAY_FIRST = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${NAME_MONTHS}),?\\s+(\\d{4})\\b`, 'giu');
/** A day and a month with no year: real, common, and not resolvable on its own. */
const NO_YEAR = new RegExp(`\\b(\\d{1,2})(?:\\s+de)?\\s+(${NAME_MONTHS})\\b`, 'giu');
const NO_YEAR_MONTH_FIRST = new RegExp(`\\b(${NAME_MONTHS})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, 'giu');

/**
 * Every date a sentence offers, in both languages, tagged with how sure we are.
 *
 * A slash date with both halves at or below 12 has two readings — `07/08/2026`
 * is 7 August in Mexico and 8 July in the United States — so it is reported as
 * `ambiguous` and never grounds a session date. That ambiguity is a decision
 * for the therapist, not a coin to flip in an importer.
 */
export function findDateCandidates(text: string): readonly DateCandidate[] {
  const found: DateCandidate[] = [];
  const claimed: [number, number][] = [];

  const overlaps = (start: number, end: number): boolean =>
    claimed.some(([from, to]) => start < to && end > from);
  const claim = (start: number, end: number): void => {
    claimed.push([start, end]);
  };

  for (const match of text.matchAll(ISO_DATE)) {
    if (overlaps(match.index, match.index + match[0].length)) continue;
    claim(match.index, match.index + match[0].length);
    found.push({
      kind: 'anchored',
      day: iso(Number(match[1]), Number(match[2]), Number(match[3])),
      alternative: null,
      match: match[0],
    });
  }

  for (const match of text.matchAll(ES_LONG)) {
    if (overlaps(match.index, match.index + match[0].length)) continue;
    const month = monthNumber(match[2] ?? '');
    if (month === null) continue;
    claim(match.index, match.index + match[0].length);
    found.push({
      kind: 'anchored',
      day: iso(Number(match[3]), month, Number(match[1])),
      alternative: null,
      match: match[0],
    });
  }

  for (const match of text.matchAll(EN_MONTH_FIRST)) {
    if (overlaps(match.index, match.index + match[0].length)) continue;
    const month = monthNumber(match[1] ?? '');
    if (month === null) continue;
    claim(match.index, match.index + match[0].length);
    found.push({
      kind: 'anchored',
      day: iso(Number(match[3]), month, Number(match[2])),
      alternative: null,
      match: match[0],
    });
  }

  for (const match of text.matchAll(EN_DAY_FIRST)) {
    if (overlaps(match.index, match.index + match[0].length)) continue;
    const month = monthNumber(match[2] ?? '');
    if (month === null) continue;
    claim(match.index, match.index + match[0].length);
    found.push({
      kind: 'anchored',
      day: iso(Number(match[3]), month, Number(match[1])),
      alternative: null,
      match: match[0],
    });
  }

  for (const match of text.matchAll(SLASH_DATE)) {
    if (overlaps(match.index, match.index + match[0].length)) continue;
    claim(match.index, match.index + match[0].length);
    const a = Number(match[1]);
    const b = Number(match[2]);
    const raw = Number(match[3]);
    const year = raw < 100 ? 2000 + raw : raw;
    if (a <= 12 && b <= 12) {
      found.push({
        kind: 'ambiguous',
        day: null,
        alternative: iso(year, b, a),
        match: match[0],
      });
    } else {
      const monthFirst = a <= 12;
      found.push({
        kind: 'anchored',
        day: monthFirst ? iso(year, a, b) : iso(year, b, a),
        alternative: monthFirst ? iso(year, b, a) : iso(year, a, b),
        match: match[0],
      });
    }
  }

  for (const match of text.matchAll(NO_YEAR)) {
    if (overlaps(match.index, match.index + match[0].length)) continue;
    if (monthNumber(match[2] ?? '') === null) continue;
    claim(match.index, match.index + match[0].length);
    found.push({ kind: 'unanchored', day: null, alternative: null, match: match[0] });
  }

  for (const match of text.matchAll(NO_YEAR_MONTH_FIRST)) {
    if (overlaps(match.index, match.index + match[0].length)) continue;
    if (monthNumber(match[1] ?? '') === null) continue;
    claim(match.index, match.index + match[0].length);
    found.push({ kind: 'unanchored', day: null, alternative: null, match: match[0] });
  }

  return found;
}
