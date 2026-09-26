import { en } from './en.js';
import { esMX } from './es-MX.js';
import { DEFAULT_LOCALE, type Locale } from './locales.js';

/**
 * How one parameter renders. Declared per key, in the entry's `kind` map.
 *
 * - `text` — inserted as it is. The default for a name the map does not list.
 * - `number` — through `Intl.NumberFormat(locale)`, so grouping is the
 *   locale's. A key whose `kind` names a `number` is also the key whose
 *   `plural` map `Intl.PluralRules` selects from.
 * - `dateOnly` — a `YYYY-MM-DD` string, parsed field by field and formatted
 *   in the local zone.
 * - `date` — an ISO timestamp, formatted in the local zone.
 */
export type ParamKind = 'text' | 'number' | 'date' | 'dateOnly';

export interface Message {
  /** A key with no count: one string, `{name}` placeholders only. */
  text: string;
  /**
   * Present only on a key that takes a numeric parameter (Fixed decision 4).
   *
   * A key with a `plural` map still carries `text`, and on such a key `text`
   * is never read: a category comes from the `plural` map, and a category the
   * map omits falls back to `other`. `other` is therefore the one entry no
   * plural key may leave out.
   */
  plural?: Partial<Record<Intl.LDMLPluralRule, string>>;
  /** How each `{name}` renders; a name absent here is `text`. */
  kind?: Record<string, ParamKind>;
}

/**
 * The values a caller has for one lookup.
 *
 * Flat, and no more than the entry names: `t()` ignores a name no `{…}` in
 * the chosen form asks for, so a caller may pass one bag of values to keys
 * with different parameters.
 */
export type MessageParams = Readonly<Record<string, string | number>>;

/**
 * Every key, in both namespaces at once.
 *
 * `keyof typeof en` is the definition: the English catalogue is the list, and
 * the `errors.` codes S2.5 adds are entries in it like any other key. One
 * union means one parity rule and one placeholder test guard both.
 */
export type MessageKey = keyof typeof en;

const CATALOGUES: Readonly<Record<Locale, Readonly<Record<string, Message>>>> = {
  en,
  'es-MX': esMX,
};

/**
 * The English catalogue, seen through an index signature.
 *
 * A lookup by a key that is in no catalogue at all is unreachable through
 * `MessageKey` — the type is `keyof typeof en` — and only a cast can get
 * there. Reading the English side this way keeps the "and there is no English
 * entry either" case honest instead of typed away.
 */
const ENGLISH: Readonly<Record<string, Message | undefined>> = en;

/**
 * The one date option set in the app, `web/src/lib/format.ts:20-24`.
 *
 * Shared by both date kinds, so `2026-08-08` is `Aug 8, 2026` in `en` and
 * `8 ago 2026` in `es-MX` — the day–month–year order S1.4 §2.1 verified on
 * this box.
 */
const DATE_OPTIONS: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };

/** A calendar date as the app stores it: `YYYY-MM-DD`. */
const DAY_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

const PLACEHOLDER = /\{(\w+)\}/g;

/**
 * `t(key, params)`: the message for `key`, in `locale`, with `params` filled
 * in. `locale` defaults to English (D11 — every document that exists today is
 * English), and the web provider passes the `language` setting through.
 *
 * What it will not do is print a raw key, an empty string or `undefined`:
 *
 * - a key the locale has not translated falls back to the **English** entry;
 * - a `{name}` the entry names and `params` does not carry throws in a test
 *   build, and leaves the hole empty rather than showing `{name}` anywhere
 *   else;
 * - a parameter the entry does not name is ignored, not an error.
 *
 * In a test build the first two throw instead, because a catalogue and its
 * callers are expected to agree and a disagreement should be red rather than
 * quietly English. The test build is read as `VITEST`, which vitest sets
 * (`vitest@4.1.11`) and the browser bundle never does.
 */
export function t(key: MessageKey, params: MessageParams = {}, locale: Locale = DEFAULT_LOCALE): string {
  const localised: Message | undefined = CATALOGUES[locale][key];
  if (localised !== undefined) {
    return render(key, localised, form(key, localised, params, locale), params, locale);
  }
  const english: Message | undefined = ENGLISH[key];
  if (english === undefined) {
    // A key in no catalogue is a cast away from `MessageKey`, and there is no
    // English entry to fall back to for it: the three things `t()` is
    // forbidden to return leave nothing to return but a defect, so this one
    // throws in every build rather than in a test build only.
    throw new Error(`t('${key}'): the key is in no catalogue; MessageKey is \`keyof typeof en\``);
  }
  if (isTestBuild()) {
    throw new Error(
      `t('${key}'): no ${locale} entry, and the English catalogue is the one that must be complete`,
    );
  }
  return render(key, english, form(key, english, params, DEFAULT_LOCALE), params, DEFAULT_LOCALE);
}

/**
 * The string this entry renders for these values: the `one` form of a plural
 * key, chosen by the numeric parameter the entry's own `kind` map declares.
 */
function form(key: MessageKey, entry: Message, params: MessageParams, locale: Locale): string {
  if (entry.plural === undefined) return entry.text;
  const counted = countedParam(entry);
  if (counted === undefined) {
    throw new Error(
      `t('${key}'): the entry has a plural map but no \`kind: { name: 'number' }\` to select on`,
    );
  }
  const value = params[counted];
  if (typeof value !== 'number') {
    throw new Error(`t('${key}'): \`${counted}\` must be a number to select a plural category`);
  }
  const category = new Intl.PluralRules(locale).select(value);
  const chosen = entry.plural[category] ?? entry.plural.other;
  if (chosen === undefined) {
    throw new Error(`t('${key}'): no \`${category}\` form and no \`other\` to fall back to`);
  }
  return chosen;
}

/** The one `{name}` whose `kind` is `number` — the plural selector. */
function countedParam(entry: Message): string | undefined {
  return Object.keys(entry.kind ?? {}).find((name) => entry.kind?.[name] === 'number');
}

function render(
  key: MessageKey,
  entry: Message,
  template: string,
  params: MessageParams,
  locale: Locale,
): string {
  return template.replaceAll(PLACEHOLDER, (_token, name: string) => {
    const value = params[name];
    if (value === undefined) {
      if (isTestBuild()) throw new Error(`t('${key}'): {${name}} is in the message and not in params`);
      return '';
    }
    return format(value, entry.kind?.[name] ?? 'text', locale);
  });
}

function format(value: string | number, kind: ParamKind, locale: Locale): string {
  switch (kind) {
    case 'number':
      return new Intl.NumberFormat(locale).format(typeof value === 'number' ? value : Number(value));
    case 'date':
      return formatInstant(value, locale);
    case 'dateOnly':
      return formatDay(value, locale);
    case 'text':
      return String(value);
  }
}

/**
 * A calendar date in the local zone.
 *
 * Parsed field by field rather than through `new Date(iso)`, which reads a
 * bare date as UTC midnight and renders as the day before for anyone west of
 * Greenwich — `formatPlanDate` (`web/src/lib/format.ts:90`) is the oracle,
 * and the same input therefore reads as the same day on every machine.
 */
function formatDay(value: string | number, locale: Locale): string {
  const text = String(value);
  const match = DAY_ONLY.exec(text);
  const date =
    match === null ? new Date(text) : new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? text : new Intl.DateTimeFormat(locale, DATE_OPTIONS).format(date);
}

/**
 * An instant as the calendar date it fell on locally, `formatInstantAsDate`
 * (`web/src/lib/format.ts:105`) — the local zone, because slicing the ISO
 * string instead would print the UTC date, which is the day before for
 * anyone west of Greenwich writing in the evening.
 */
function formatInstant(value: string | number, locale: Locale): string {
  const date = new Date(typeof value === 'string' ? value : Number(value));
  return Number.isNaN(date.getTime())
    ? String(value)
    : new Intl.DateTimeFormat(locale, DATE_OPTIONS).format(date);
}

/**
 * Node's `process`, described here rather than imported from `@types/node`.
 *
 * `shared/tsconfig.json` gives this package no Node types — only the
 * typecheck project sees any, and only because its test files pull `vitest`'s
 * in — so a production module in `shared` that names `process` will not
 * compile. The declaration is module-scoped, which is the whole point: it
 * says what `t()` reads, it shadows the global inside this file only, and it
 * cannot leak into the emitted `.d.ts` or into a consumer's own `process`.
 */
declare const process: { readonly env: Readonly<Record<string, string | undefined>> } | undefined;

/**
 * Whether this is a test build.
 *
 * `typeof process` first, because the same module runs in the browser bundle
 * where there is no `process` at all. The `Intl` objects are built per call
 * rather than cached for the same reason a cached one would be wrong here: a
 * formatter fixes the zone it was built in, and a test that changes
 * `process.env['TZ']` mid-run must see the new one.
 */
function isTestBuild(): boolean {
  return typeof process !== 'undefined' && process.env['VITEST'] === 'true';
}
