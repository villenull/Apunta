import type { Message } from './t.js';

/**
 * The English catalogue — the shape every other decision is written against.
 *
 * English is the app as it has always been, so each entry here is what a
 * screen already shows for the same input: the card pins every key to the
 * function or line that produces it today, and `t.test.ts` asserts each one
 * against that oracle. S2.3 to S2.5 move the screens onto these keys; this
 * file is what they move onto, so a key added here is a string the app has
 * been saying all along.
 *
 * A key is `dotted.case`. Placeholders are `{name}`, and how each one renders
 * is declared in the entry's `kind` map — a name absent from it is `text`.
 * A key that takes a number gets `kind: { name: 'number' }` **and** a per-
 * category `plural` map, which is also how the number gets grouped: the
 * parameter `Intl.PluralRules` selects on is the one the map declares.
 *
 * `text` is required on every entry, including a plural one. On a plural key
 * it carries the `one` form and is never read — `t()` resolves a plural
 * category through the `plural` map alone, falling back to `other`, so
 * nothing renders `text` by accident.
 */
export const en = {
  /**
   * The product's own name, never translated. `BrandWordmark.tsx:34`'s
   * `aria-label`; S1.4 §3.4's keep-as-is list.
   */
  'brand.name': { text: 'Apunta' },

  /** The notes column's header, `NotesColumn.tsx:41`. */
  'notes.title': { text: 'Notes' },

  /**
   * "3 notes" / "1 note", the sub-line of a patient row — `format.ts:59-61`
   * (`noteCountLabel`) and `plural.ts:2-4` (`plural`), which agree.
   *
   * A count of 1,000 and above now groups, because the number is the key's
   * `number` parameter and goes through `Intl.NumberFormat`: `1,000 notes`
   * where `noteCountLabel` printed `1000 notes`. That is Fixed decision 5
   * (grouping is whatever `Intl` says) and it is the one English change this
   * catalogue makes; S2.7/S2.8 meet it as a decided change.
   */
  'notes.count': {
    text: '{count} note',
    plural: {
      one: '{count} note',
      other: '{count} notes',
    },
    kind: { count: 'number' },
  },

  /** "Today", for a note written in this session: `formatNoteDate`, `format.ts:34`. */
  'notes.today': { text: 'Today' },

  /**
   * A calendar date, the way a plan is dated today: `formatPlanDate`,
   * `format.ts:90`. `{day}` is a `YYYY-MM-DD` string, parsed field by field
   * rather than through `new Date(iso)`, which reads a bare date as UTC
   * midnight and shows the day before west of Greenwich.
   */
  'notes.date': {
    text: '{day}',
    kind: { day: 'dateOnly' },
  },

  /**
   * An instant as the calendar date it fell on locally:
   * `formatInstantAsDate`, `format.ts:105`.
   */
  'note.updatedAt': {
    text: '{at}',
    kind: { at: 'date' },
  },

  /**
   * The stale-backup warning, `BackupCard.tsx:180` with
   * `BACKUP_STALE_DAYS`. A number, so a large value groups; the sentence is
   * otherwise the one the app shows.
   */
  'backup.stale': {
    text: 'No backup for over {days} day.',
    plural: {
      one: 'No backup for over {days} day.',
      other: 'No backup for over {days} days.',
    },
    kind: { days: 'number' },
  },

  /**
   * The brainstorm thread's empty state, `BrainstormView.tsx:175-178`, with
   * `firstName` (`format.ts:16-18`): "Think out loud about John — this
   * conversation is never written into their notes."
   */
  'brainstorm.empty': {
    text: 'Think out loud about {name} — this conversation is never written into their notes.',
    kind: { name: 'text' },
  },

  /**
   * The first `errors.` key: the message the server sends for
   * `language_unavailable` today, byte for byte
   * (`server/src/routes/settings.test.ts:149` pins the same bytes).
   *
   * Every code's key is `errors.<code>` and the codes come from the closed
   * `ApiErrorCodeSchema`; S2.5 owns the rest of the list. Naming the text in
   * the catalogue is what lets the client render a code in the language of
   * the request while the server's own logs stay English and content-free.
   */
  'errors.language_unavailable': {
    text: 'Español is not available in this build of Apunta. Choose English, or install the Spanish edition.',
  },
} as const satisfies Record<string, Message>;
