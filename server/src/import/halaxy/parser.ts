import { calendarDay, type HalaxyPreviewNote, type HalaxyPreviewPatient } from '@apunta/shared';

import { msg, type Locale, type MessageKey, type MessageParams } from '../../http/locale.js';

const MONTHS: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

const SHORT_MONTHS: Record<string, number> = Object.fromEntries(
  Object.entries(MONTHS).map(([name, month]) => [name.slice(0, 3), month]),
);

/**
 * A Halaxy PDF the parser could not read.
 *
 * `reason` is the category the route and the log branch on; `key` and `params`
 * are the sentence, which `routes/halaxy.ts` shows in the request's language
 * and `routes/halaxy.ts`'s importer turns into a 400. The two are separate on
 * purpose: two of the three sentences share the `missing_sessions` category,
 * so a key cannot be derived from the reason.
 */
export class HalaxyParseError extends Error {
  constructor(
    readonly reason: 'missing_patient' | 'missing_sessions' | 'ambiguous_sessions',
    readonly key: MessageKey,
    readonly params: MessageParams = {},
  ) {
    super(msg('en', key, params));
    this.name = 'HalaxyParseError';
  }

  /** The same failure, sentence rendered in `locale`. */
  messageIn(locale: Locale): string {
    return msg(locale, this.key, this.params);
  }
}

interface DateHeading {
  readonly line: number;
  readonly date: string;
  readonly title?: string;
}

/** Parse the text layer returned by pdf.js without retaining the source text. */
export function parseHalaxyText(text: string, fileName: string): HalaxyPreviewPatient {
  const lines = cleanLines(text);
  const patientName = findPatientName(lines);
  if (patientName === null) {
    throw new HalaxyParseError('missing_patient', 'errors.bad_request.halaxy_no_patient_header');
  }

  const headings = findDateHeadings(lines);
  if (headings.length === 0) {
    throw new HalaxyParseError('missing_sessions', 'errors.bad_request.halaxy_no_dated_sessions');
  }

  const warnings: string[] = [];
  const firstDate = headings[0]?.line ?? 0;
  const preamble = lines.slice(0, firstDate).filter((line) => !isHeaderLine(line, patientName));
  if (preamble.length > 0) warnings.push('Text before the first dated session was not imported.');
  if (headings.some((heading) => heading.line > 0 && lines[heading.line - 1]?.trim() === 'Date')) {
    warnings.push('Some date labels were close to other headings; check the session boundaries.');
  }
  if (headings.some((heading) => /^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}$/.test(lines[heading.line] ?? ''))) {
    warnings.push('Some sessions had a bare date heading; check those session boundaries before importing.');
  }
  if (lines.some((line) => /\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/.test(line) && !looksLikeDateHeading(line))) {
    warnings.push(
      'A date-like line inside a session was left in that session; check the session boundaries.',
    );
  }

  const notes: HalaxyPreviewNote[] = [];
  headings.forEach((heading, index) => {
    const next = headings[index + 1]?.line ?? lines.length;
    const body = lines
      .slice(heading.line + 1, next)
      .filter((line) => !isHeaderLine(line, patientName) && !isFooterLine(line))
      .join('\n')
      .trim();
    if (!body) {
      warnings.push(`The session on ${heading.date} has no text.`);
      return;
    }
    notes.push({
      key: `${fileName}:${heading.date}:${String(index + 1)}`,
      date: heading.date,
      ...(heading.title === undefined ? {} : { title: heading.title }),
      text: body,
    });
  });

  if (notes.length === 0) {
    throw new HalaxyParseError('missing_sessions', 'errors.bad_request.halaxy_no_session_text');
  }
  return { fileName, patientName, existingPatients: [], notes, warnings };
}

function cleanLines(text: string): string[] {
  const raw = text
    .replace(/\r\n?/g, '\n')
    .replace(/\f/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean);

  // Page numbers and repeated page furniture are never note content. A line is
  // furniture when it occurs on at least two pages and is not a date heading.
  const pageLines = text.replace(/\r\n?/g, '\n').split(/\f/);
  const repeated = new Set<string>();
  if (pageLines.length > 1) {
    const counts = new Map<string, number>();
    for (const page of pageLines) {
      const seen = new Set(
        page
          .split('\n')
          .map((line) => line.replace(/[ \t]+/g, ' ').trim())
          .filter(Boolean),
      );
      for (const line of seen) counts.set(line, (counts.get(line) ?? 0) + 1);
    }
    for (const [line, count] of counts) if (count >= 2 && !looksLikeDateHeading(line)) repeated.add(line);
  }
  return raw.filter((line) => !repeated.has(line) && !isFooterLine(line));
}

function findPatientName(lines: readonly string[]): string | null {
  for (const line of lines.slice(0, 20)) {
    const match = /^(?:patient(?:\s+name)?|client(?:\s+name)?)\s*[:-]\s*(.+)$/i.exec(line);
    if (match?.[1]) return cleanName(match[1]);
  }
  const dateLine = lines.findIndex((line) => looksLikeDateHeading(line));
  for (const line of lines.slice(0, dateLine < 0 ? 12 : dateLine)) {
    if (/^(?:halaxy|clinical|progress|notes?|page|practice|date|session)\b/i.test(line)) continue;
    if (line.length >= 3 && line.length <= 100 && /[A-Za-z]/.test(line)) return cleanName(line);
  }
  return null;
}

function cleanName(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .replace(/[|,;]+$/, '')
    .trim();
}

function findDateHeadings(lines: readonly string[]): DateHeading[] {
  const found: DateHeading[] = [];
  lines.forEach((line, index) => {
    const parsed = parseHeadingDate(line);
    if (parsed === null) return;
    found.push({ line: index, date: parsed.date, ...(parsed.title ? { title: parsed.title } : {}) });
  });
  return found;
}

function parseHeadingDate(line: string): { date: string; title?: string } | null {
  // A date heading is short and starts with optional session/date furniture;
  // requiring this keeps dates in the note body from becoming new sessions.
  if (line.length > 120 || /[.!?].*\d/.test(line)) return null;
  const match =
    /^(?:(?:date|session|appointment|consult(?:ation)?|note)\s*[:-–—]?\s*)?(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(?:\s*[-–—:]\s*(.*))?$/i.exec(
      line,
    );
  if (match) {
    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = Number(match[3]);
    if (day < 1 || day > 31 || month < 1 || month > 12) return null;
    const date = isoDate(year < 100 ? 2000 + year : year, month, day);
    const headingTitle = title(match[4]);
    return headingTitle === undefined ? { date } : { date, title: headingTitle };
  }
  const words =
    /^(?:(?:date|session|appointment|consult(?:ation)?|note)\s*[:\-–—]?\s*)?(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})(?:\s*[-–—:]\s*(.*))?$/i.exec(
      line,
    );
  if (!words) return null;
  const month = MONTHS[words[2]!.toLowerCase()] ?? SHORT_MONTHS[words[2]!.slice(0, 3).toLowerCase()];
  if (!month) return null;
  const day = Number(words[1]);
  if (day < 1 || day > 31) return null;
  const date = isoDate(Number(words[3]), month, day);
  const headingTitle = title(words[4]);
  return headingTitle === undefined ? { date } : { date, title: headingTitle };
}

function isoDate(year: number, month: number, day: number): string {
  const value = new Date(Date.UTC(year, month - 1, day));
  if (value.getUTCFullYear() !== year || value.getUTCMonth() !== month - 1 || value.getUTCDate() !== day)
    return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return calendarDay(
    `${String(value.getUTCFullYear()).padStart(4, '0')}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}`,
  );
}

function title(value: string | undefined): string | undefined {
  const cleaned = value?.trim();
  return cleaned && !/^(?:session|appointment|consult(?:ation)?|note|date)$/i.test(cleaned)
    ? cleaned
    : undefined;
}

function looksLikeDateHeading(line: string): boolean {
  return parseHeadingDate(line) !== null;
}

function isFooterLine(line: string): boolean {
  return /^page\s+\d+(?:\s+of\s+\d+)?$/i.test(line) || /^\d+$/.test(line);
}

function isHeaderLine(line: string, patientName: string): boolean {
  return (
    line === patientName ||
    /^(?:halaxy|clinical notes?|patient(?:\s+name)?|client(?:\s+name)?|practice)\b/i.test(line)
  );
}
