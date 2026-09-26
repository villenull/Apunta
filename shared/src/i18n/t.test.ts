import { afterEach, describe, expect, it, vi } from 'vitest';

import { en } from './en.js';
import { esMX } from './es-MX.js';
import type { Message, MessageKey } from './t.js';
import { t } from './t.js';

/**
 * The seed catalogue's guardrails: parity, placeholder names, plurals, the two
 * date kinds, the number, the English the app already shows, and the runtime
 * fallbacks.
 *
 * The type-level parity rule — a key `es-MX` is missing, or one English does
 * not have — is *not* proved here: vitest strips types. It lives in the last
 * two cases, and `tsc` is the only thing that can see it (`npm run
 * typecheck`, which is the card's V4).
 */

/** The nine keys Fixed decision 8 fixes, spelled out so a tenth is a failure. */
const SEED: readonly MessageKey[] = [
  'brand.name',
  'notes.title',
  'notes.count',
  'notes.today',
  'notes.date',
  'note.updatedAt',
  'backup.stale',
  'brainstorm.empty',
  'errors.language_unavailable',
];

/** The two keys that take a number, and therefore a plural map. */
const COUNTED: readonly MessageKey[] = ['notes.count', 'backup.stale'];

/** `DATE_FORMAT` of `web/src/lib/format.ts:20-24` — the oracle's option set. */
const DATE_OPTIONS: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };

/** The calendar date the seed table is written against. */
const DAY = '2026-08-08';

/** The instant the seed table is written against, in the box's own zone. */
const INSTANT = '2026-08-08T12:00:00.000Z';

/** `{name}` tokens in one entry: its `text` and every one of its plural forms. */
function placeholders(entry: Message): string[] {
  const names = new Set<string>();
  for (const form of [entry.text, ...Object.values(entry.plural ?? {})]) {
    for (const match of form.matchAll(/\{(\w+)\}/g)) {
      const name = match[1];
      if (name !== undefined) names.add(name);
    }
  }
  return [...names].sort();
}

/**
 * The oracles, transcribed.
 *
 * The functions they come from live in `web/src`, and `shared` may not import
 * across packages — `shared/tsconfig.typecheck.json` sets a `rootDir` and
 * would refuse a file outside it — so each is copied here with the line it was
 * read at. The card's seed table is the reviewer's check on the copies; the
 * real oracles, `web/src/lib/format.ts` and `web/src/lib/plural.ts`, are
 * read-only for this card and no line of either changes.
 */

/** `noteCountLabel`, `format.ts:59-61`; `plural`, `plural.ts:2-4`. */
function noteCountLabel(count: number): string {
  return `${String(count)} note${count === 1 ? '' : 's'}`;
}

/** `BackupCard.tsx:180` with `BACKUP_STALE_DAYS`. */
function staleWarning(days: number): string {
  return `No backup for over ${String(days)} day${days === 1 ? '' : 's'}.`;
}

/** `firstName`, `format.ts:16-18`, applied to the prototype's sample patient. */
function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/** What `Intl` says a number is in `locale` — never a hardcoded separator. */
function grouped(value: number, locale: 'en' | 'es-MX'): string {
  return new Intl.NumberFormat(locale).format(value);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('the two catalogues', () => {
  it('holds exactly the nine seed keys in both, and nothing else', () => {
    expect(Object.keys(en).sort()).toEqual([...SEED].sort());
    expect(Object.keys(esMX).sort()).toEqual([...SEED].sort());
  });

  it('names the same placeholders in both, per key', () => {
    // A type cannot see inside a string, so this is the check that a
    // translation kept the placeholders its English entry names.
    for (const key of SEED) {
      expect(placeholders(esMX[key] as Message), `${key} in es-MX`).toEqual(placeholders(en[key] as Message));
    }
    expect(placeholders(en['notes.count'])).toEqual(['count']);
    expect(placeholders(en['brainstorm.empty'])).toEqual(['name']);
  });

  it('answers every plural category its locale can select', () => {
    // es-MX selects three cardinals on this box (ICU 78.3), so its entries
    // need three forms. English selects two, and a category an entry omits
    // falls back to `other` — which is why `en` needs no `many`.
    const spanish = [...new Intl.PluralRules('es-MX').resolvedOptions().pluralCategories].sort();
    expect(spanish).toEqual(['many', 'one', 'other']);
    const english = [...new Intl.PluralRules('en').resolvedOptions().pluralCategories].sort();
    expect(english).toEqual(['one', 'other']);
    for (const key of COUNTED) {
      for (const category of spanish) {
        expect((esMX[key] as Message).plural?.[category], `es-MX ${key} ${category}`).toBeTypeOf('string');
      }
      for (const category of english) {
        expect((en[key] as Message).plural?.[category], `en ${key} ${category}`).toBeTypeOf('string');
      }
    }
  });
});

describe('plurals', () => {
  it('takes `one` for 1 in both locales, and the numbers the oracles print', () => {
    expect(t('notes.count', { count: 1 }, 'en')).toBe(noteCountLabel(1));
    expect(t('notes.count', { count: 3 }, 'en')).toBe(noteCountLabel(3));
    expect(t('notes.count', { count: 0 }, 'en')).toBe(noteCountLabel(0));
    expect(t('notes.count', { count: 1 }, 'es-MX')).toBe('1 nota');
    expect(t('notes.count', { count: 3 }, 'es-MX')).toBe('3 notas');
    expect(t('notes.count', { count: 0 }, 'es-MX')).toBe('0 notas');
  });

  it("takes es-MX's `many` and en's `other` for 1,000,000", () => {
    const million = 1_000_000;
    expect(new Intl.PluralRules('es-MX').select(million)).toBe('many');
    expect(new Intl.PluralRules('en').select(million)).toBe('other');
    expect(t('notes.count', { count: million }, 'en')).toBe(`${grouped(million, 'en')} notes`);
    expect(t('notes.count', { count: million }, 'es-MX')).toBe(`${grouped(million, 'es-MX')} notas`);
    // The es-MX `many` form is the one carrying `notas`; if it were missing,
    // the `other` fallback would hide the difference, so the form is read
    // directly as well.
    expect((esMX['notes.count'] as Message).plural?.['many']).toBe('{count} notas');
  });

  it('pluralises the stale-backup sentence the way the warning reads today', () => {
    expect(t('backup.stale', { days: 7 }, 'en')).toBe(staleWarning(7));
    expect(t('backup.stale', { days: 1 }, 'en')).toBe(staleWarning(1));
    expect(t('backup.stale', { days: 1 }, 'es-MX')).toBe('No hay copias de seguridad de hace más de 1 día.');
    // `many` and `other` are the same sentence in Spanish, and both are there.
    expect(t('backup.stale', { days: 7 }, 'es-MX')).toBe('No hay copias de seguridad de hace más de 7 días.');
    expect(t('backup.stale', { days: 1_000_000 }, 'es-MX')).toBe(
      `No hay copias de seguridad de hace más de ${grouped(1_000_000, 'es-MX')} días.`,
    );
  });
});

describe('dates and numbers', () => {
  it('reads a calendar date as the same day in every zone', () => {
    // The field-by-field parse, not `new Date(iso)`: a bare date read as UTC
    // midnight is the day before west of Greenwich, and these are the dates a
    // plan is audited against.
    const original = process.env['TZ'];
    try {
      for (const zone of ['UTC', 'Australia/Sydney', 'America/Los_Angeles']) {
        process.env['TZ'] = zone;
        expect(t('notes.date', { day: DAY }, 'en'), zone).toBe('Aug 8, 2026');
        expect(t('notes.date', { day: DAY }, 'es-MX'), zone).toBe('8 ago 2026');
      }
    } finally {
      if (original === undefined) delete process.env['TZ'];
      else process.env['TZ'] = original;
    }
  });

  it('agrees with the two oracles it is pinned to', () => {
    // `formatPlanDate`, `format.ts:90`.
    expect(t('notes.date', { day: DAY }, 'en')).toBe(
      new Intl.DateTimeFormat('en', DATE_OPTIONS).format(new Date(2026, 7, 8)),
    );
    // `formatInstantAsDate`, `format.ts:105`: the local zone of the instant,
    // which is whatever zone the run is in.
    expect(t('note.updatedAt', { at: INSTANT }, 'en')).toBe(
      new Intl.DateTimeFormat('en', DATE_OPTIONS).format(new Date(INSTANT)),
    );
    expect(t('note.updatedAt', { at: INSTANT }, 'es-MX')).toBe(
      new Intl.DateTimeFormat('es-MX', DATE_OPTIONS).format(new Date(INSTANT)),
    );
  });

  it("groups a number the way each locale's Intl says, in both catalogues", () => {
    // No separator is hardcoded: `Intl.NumberFormat('es-MX')` gives `1,234` on
    // this box, which differs from S1.4 §2.3's prose recommendation of a
    // space. `Intl` wins (Fixed decision 5), and the difference is a finding
    // recorded for S2.7/S2.8.
    for (const locale of ['en', 'es-MX'] as const) {
      const n = grouped(1234, locale);
      const noun = locale === 'en' ? 'notes' : 'notas';
      expect(t('notes.count', { count: 1234 }, locale)).toBe(`${n} ${noun}`);
      expect(t('backup.stale', { days: 1234 }, locale)).toBe(
        locale === 'en'
          ? `No backup for over ${n} days.`
          : `No hay copias de seguridad de hace más de ${n} días.`,
      );
    }
  });
});

describe('the English the app already shows', () => {
  it('is the string each seed key is pinned to', () => {
    // `BrandWordmark.tsx:34`'s aria-label, and the wordmark's own name.
    expect(t('brand.name', {}, 'en')).toBe('Apunta');
    // `NotesColumn.tsx:41`.
    expect(t('notes.title', {}, 'en')).toBe('Notes');
    // `formatNoteDate`, `format.ts:34`, the same-day case.
    expect(t('notes.today', {}, 'en')).toBe('Today');
    // `formatPlanDate`, `format.ts:90`.
    expect(t('notes.date', { day: DAY }, 'en')).toBe('Aug 8, 2026');
    // `formatInstantAsDate`, `format.ts:105`, in the local zone.
    expect(t('note.updatedAt', { at: INSTANT }, 'en')).toBe(
      new Intl.DateTimeFormat('en', DATE_OPTIONS).format(new Date(INSTANT)),
    );
    // `BackupCard.tsx:180` with `BACKUP_STALE_DAYS`.
    expect(t('backup.stale', { days: 7 }, 'en')).toBe(staleWarning(7));
    // `BrainstormView.tsx:175-178` with `firstName` on the sample patient.
    expect(t('brainstorm.empty', { name: firstName('John Smith') }, 'en')).toBe(
      'Think out loud about John — this conversation is never written into their notes.',
    );
    // `server/src/routes/settings.test.ts:149`, byte for byte.
    expect(t('errors.language_unavailable', {}, 'en')).toBe(
      'Español is not available in this build of Apunta. Choose English, or install the Spanish edition.',
    );
  });

  it('keeps the brand untranslated and the other eight translated', () => {
    expect(t('brand.name', {}, 'es-MX')).toBe('Apunta');
    expect(t('notes.title', {}, 'es-MX')).toBe('Notas');
    expect(t('notes.today', {}, 'es-MX')).toBe('Hoy');
  });
});

describe("Fixed decision 7's fallbacks", () => {
  it('ignores a parameter the entry does not name', () => {
    expect(t('notes.title', { count: 3, unused: 'ignored' }, 'en')).toBe('Notes');
    expect(t('brainstorm.empty', { name: 'John', count: 2 }, 'en')).toBe(
      'Think out loud about John — this conversation is never written into their notes.',
    );
  });

  it('throws on a `{name}` the entry names and `params` does not carry, in a test build', () => {
    expect(() => t('brainstorm.empty', {}, 'en')).toThrow(/\{name\}/);
    expect(() => t('brainstorm.empty', {}, 'es-MX')).toThrow(/\{name\}/);
    // The plural selector is a parameter too.
    expect(() => t('notes.count', {}, 'en')).toThrow(/count/);
  });

  it('coerces a count that arrived as a string, in a test build too', () => {
    // `MessageParams` admits `string | number`, so `{ count: '3' }` is a legal
    // argument and `tsc` accepts it — and both oracles FD 6 pins this key to
    // stringify the count, so a caller written to look like them hands `t()`
    // one. Coerced the way `format()` coerces, never thrown on.
    expect(t('notes.count', { count: '3' }, 'en')).toBe(`${grouped(3, 'en')} notes`);
    expect(t('notes.count', { count: '3' }, 'es-MX')).toBe('3 notas');
    expect(t('notes.count', { count: '1' }, 'en')).toBe('1 note');
    // The coerced number is the one `Intl.PluralRules` selects on, so a large
    // count still takes es-MX's `many` and en's `other`.
    expect(t('notes.count', { count: '1000000' }, 'es-MX')).toBe(`${grouped(1_000_000, 'es-MX')} notas`);
    expect(t('notes.count', { count: '1000000' }, 'en')).toBe(`${grouped(1_000_000, 'en')} notes`);
    // A string that is not a number is not a count at all, and that is the
    // missing-value case rather than a category: strict in a test build.
    expect(() => t('notes.count', { count: 'three' }, 'en')).toThrow(/\{count\}/);
  });

  it('answers a missing count with the English `other` form outside a test build', () => {
    // The third of FD 7's three paths, in the build the browser is: a count
    // `params` does not carry must not crash a render, and must not leave a
    // raw key, a `{count}` or an empty string behind either.
    vi.stubEnv('VITEST', 'false');
    // Exactly the English `other` form with the hole left empty — not the raw
    // key, not `{count}`, not `NaN`, and not the empty string.
    const missing = t('notes.count', {}, 'en');
    expect(missing).toBe(' notes');
    expect(missing).not.toBe('');
    expect(missing).not.toContain('{count}');
    // FD 7 says the *English* string, and the English catalogue is the one
    // required to be complete — so this is English even where a translation
    // exists, and the same for a count that cannot be coerced.
    expect(t('notes.count', {}, 'es-MX')).toBe(missing);
    expect(t('notes.count', { count: 'three' }, 'es-MX')).toBe(missing);
    expect(t('notes.count', { count: 'three' }, 'en')).toBe(missing);
    expect(t('backup.stale', {}, 'es-MX')).toBe('No backup for over  days.');
  });

  it('throws on a key no catalogue has', () => {
    const unknown = 'notes.nonexistent' as MessageKey;
    expect(() => t(unknown, {}, 'en')).toThrow(/no catalogue/);
    expect(() => t(unknown, {}, 'es-MX')).toThrow(/no catalogue/);
  });

  it('throws on a key the locale has not translated, in a test build', () => {
    // Reached by removing one entry from the es-MX catalogue for the length of
    // the case, which is the only way to get here: `esMX` is
    // `Record<MessageKey, Message>`, so a missing key is a compile error and
    // a build can only disagree with its own types if the two objects differ
    // at runtime. Restored in `finally`, so no other case sees it.
    const catalogue = esMX as Record<string, Message | undefined>;
    const held = catalogue['notes.title'];
    delete catalogue['notes.title'];
    try {
      expect(() => t('notes.title', {}, 'es-MX')).toThrow(/no es-MX entry/);
    } finally {
      if (held !== undefined) catalogue['notes.title'] = held;
    }
  });

  it('answers in English outside a test build, and never with the key', () => {
    // The non-test read is the browser's, where `VITEST` is unset: the same
    // two failures now render English rather than throwing, and a hole left by
    // a missing value is empty rather than a visible `{name}`.
    vi.stubEnv('VITEST', 'false');
    const catalogue = esMX as Record<string, Message | undefined>;
    const held = catalogue['notes.title'];
    delete catalogue['notes.title'];
    try {
      expect(t('notes.title', {}, 'es-MX')).toBe('Notes');
      expect(t('brainstorm.empty', {}, 'en')).not.toContain('{name}');
      expect(t('brainstorm.empty', {}, 'en')).not.toBe('');
    } finally {
      if (held !== undefined) catalogue['notes.title'] = held;
    }
  });
});

describe('the type-level parity rule', () => {
  it('rejects a key es-MX is missing', () => {
    const { 'notes.title': _omitted, ...withoutNotesTitle } = esMX;
    // @ts-expect-error — `Record<MessageKey, Message>` demands all nine keys,
    // so leaving one out is a compile error. An unused `@ts-expect-error` is
    // itself an error, so this case cannot go vacuous.
    const incomplete: Record<MessageKey, Message> = withoutNotesTitle;
    // At runtime the object is simply shorter, which is all the assertion can
    // see; the type half is the line above.
    expect(Object.keys(incomplete)).not.toContain('notes.title');
    expect(Object.keys(incomplete)).toHaveLength(SEED.length - 1);
  });

  it('rejects a key English does not have', () => {
    // @ts-expect-error — the union is `keyof typeof en`, so an es-MX entry
    // English has no word for is an excess property.
    const extra: Record<MessageKey, Message> = { ...esMX, 'notes.invented': { text: 'Inventada' } };
    expect(Object.keys(extra)).toContain('notes.invented');
  });
});
