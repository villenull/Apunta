/** Display helpers shared by the workspace screens. All match `prototype/`. */

/** "John Smith" → "JS", the avatar text in the patients column. */
export function initials(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0);
  return words
    .slice(0, 2)
    .map((word) => (word[0] ?? '').toUpperCase())
    .join('');
}

/** "John Smith" → "John", for the notes column header ("John's notes"). */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

const DATE_FORMAT = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/**
 * The prototype's note dates: "Aug 8, 2026", or "Today" for a note written in
 * this session (`patients.html` labels a freshly drafted note "Today").
 */
export function formatNoteDate(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return sameDay(date, now) ? 'Today' : DATE_FORMAT.format(date);
}

/** The "· edited today" half of the note header line. */
export function formatEditedDate(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return sameDay(date, now) ? 'today' : DATE_FORMAT.format(date);
}

/** A note counts as edited once it has been saved after creation. */
export function wasEdited(createdAt: string, updatedAt: string): boolean {
  return new Date(updatedAt).getTime() > new Date(createdAt).getTime();
}

/** One-line preview under a note's title, as `patients.html` builds it. */
export function notePreview(content: string): string {
  const flattened = content.slice(0, 60).replace(/\n/g, ' ').trim();
  return flattened.length === 0 ? '' : `${flattened}…`;
}

/** "3 notes" / "1 note", the sub-line of a patient row. */
export function noteCountLabel(count: number): string {
  return `${String(count)} note${count === 1 ? '' : 's'}`;
}

/**
 * A calendar date (`YYYY-MM-DD`) as the app writes dates elsewhere.
 *
 * Parsed field by field rather than through `new Date(iso)`: that constructor
 * reads a bare date as UTC midnight, which renders as the day before for
 * anyone west of Greenwich — and these are the dates a plan is audited
 * against.
 */
export function formatPlanDate(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return date;
  const [, year, month, day] = match;
  return DATE_FORMAT.format(new Date(Number(year), Number(month) - 1, Number(day)));
}

/**
 * An instant as the calendar date it fell on **locally**.
 *
 * `formatNoteDate` says "Today" for a note written today, which is right on a
 * note but clumsy in "read back to …". Slicing the ISO string instead would
 * print the UTC date, which is the day before for anyone west of Greenwich
 * writing in the evening.
 */
export function formatInstantAsDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : DATE_FORMAT.format(date);
}

/** "in 12 days" / "12 days ago" / "today", for the review-due line. */
export function formatDayGap(daysUntil: number): string {
  if (daysUntil === 0) return 'today';
  const magnitude = Math.abs(daysUntil);
  const unit = magnitude === 1 ? 'day' : 'days';
  return daysUntil > 0 ? `in ${String(magnitude)} ${unit}` : `${String(magnitude)} ${unit} ago`;
}

/** "just now", "5 minutes ago", "3 hours ago", "yesterday", "4 days ago". */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - Date.parse(iso)) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${String(minutes)} ${minutes === 1 ? 'minute' : 'minutes'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${String(hours)} ${hours === 1 ? 'hour' : 'hours'} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  return `${String(days)} days ago`;
}
