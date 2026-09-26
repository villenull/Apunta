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
 * What it will not do is print a raw key, an empty string or `undefined`.
 * There are exactly three runtime paths where a lookup does not have what its
 * entry asks for, and Fixed decision 7 fixes all three — two of them answer
 * and one is a defect with nothing to answer:
 *
 * 1. **A key in no catalogue.** A cast away from `MessageKey`, which is
 *    `keyof typeof en`, and no English entry to fall back to for it, so the
 *    three prohibitions leave nothing to return: it **throws in every build**,
 *    a test build or not.
 * 2. **A key the locale has not translated.** The English entry is the answer,
 *    because the English catalogue is the one that has to be complete: a
 *    **test build throws** — a catalogue and its callers are expected to
 *    agree, and a disagreement should be red rather than quietly English —
 *    and anywhere else it renders English.
 * 3. **A value the chosen form needs and `params` does not carry**: a
 *    `{name}` the form names, or the number a plural entry selects its
 *    category from. A **test build throws**, and anywhere else it renders the
 *    **English** entry with the hole left empty — never `{name}`, never the
 *    raw key, never nothing at all.
 *
 * A parameter the entry does not name is ignored, not an error: `params` is a
 * flat bag and one caller may pass more than a single entry needs.
 *
 * Two more throws are catalogue defects rather than lookup conditions — a
 * plural entry with no `kind: 'number'` to select on, and one with no `other`
 * to fall back to — and they throw in every build too. Neither is reachable
 * without editing `en.ts` or `es-MX.ts`, where the seed entries all carry both.
 *
 * The test build is read as `VITEST`, which vitest sets (`vitest@4.1.11`) and
 * the browser bundle never does.
 */
export function t(key: MessageKey, params: MessageParams = {}, locale: Locale = DEFAULT_LOCALE): string {
  const english: Message | undefined = ENGLISH[key];
  if (english === undefined) {
    // Path 1, above.
    throw new Error(`t('${key}'): the key is in no catalogue; MessageKey is \`keyof typeof en\``);
  }
  const localised: Message | undefined = CATALOGUES[locale][key];
  if (localised === undefined && isTestBuild()) {
    // Path 2, above.
    throw new Error(
      `t('${key}'): no ${locale} entry, and the English catalogue is the one that must be complete`,
    );
  }
  const entry = localised ?? english;
  // An entry that came from the English catalogue formats its dates and
  // numbers in English, whichever locale was asked for.
  const entryLocale = localised === undefined ? DEFAULT_LOCALE : locale;
  const template = form(key, entry, params, entryLocale);
  if (template !== undefined) return render(key, entry, template, params, entryLocale);
  // Path 3, above, for a plural entry whose counted parameter is not here as a
  // number: the same throw a missing `{name}` gets in a test build, and the
  // English `other` form everywhere else.
  if (isTestBuild()) {
    throw new Error(`t('${key}'): {${countedParam(key, entry)}} is in the message and not in params`);
  }
  return render(
    key,
    english,
    otherForm(key, english),
    without(params, countedParam(key, entry)),
    DEFAULT_LOCALE,
  );
}

/**
 * `params` without `name`.
 *
 * A value that will not coerce to a number is not a value the English
 * fallback can render either — its `{count}` would come out as `NaN` — so the
 * name is dropped and `render` leaves the hole empty, exactly as it does for a
 * value that was never passed. Fixed decision 7 asks for the same answer
 * either way, and never for a raw key or an empty string.
 */
function without(params: MessageParams, name: string): MessageParams {
  if (!(name in params)) return params;
  const rest: Record<string, string | number> = { ...params };
  delete rest[name];
  return rest;
}

/**
 * The template this entry renders for these values: the per-category form of a
 * plural key, chosen by the numeric parameter the entry's own `kind` map
 * declares.
 *
 * `undefined` is the one answer `t()` has to act on, and it means the counted
 * parameter is not in `params` as a number. Fixed decision 7 makes that a
 * fallback and not a failure, so the decision belongs to the caller.
 */
function form(key: MessageKey, entry: Message, params: MessageParams, locale: Locale): string | undefined {
  if (entry.plural === undefined) return entry.text;
  const value = params[countedParam(key, entry)];
  // `MessageParams` admits `string | number`, `tsc` accepts a count written as
  // a string, and both oracles Fixed decision 6 pins `notes.count` to
  // stringify it — `noteCountLabel` (`format.ts:60`) and `plural`
  // (`plural.ts:3`) — so a caller written to look like the oracle hands `t()`
  // a string. Coerced the way `format()` coerces, never thrown on; a value
  // that will not coerce to a number is the missing-value case, not a
  // category.
  const number = value === undefined ? Number.NaN : Number(value);
  if (Number.isNaN(number)) return undefined;
  const category = new Intl.PluralRules(locale).select(number);
  return entry.plural[category] ?? otherForm(key, entry);
}

/**
 * The category every plural entry falls back to — Fixed decision 4 makes `other`
 * the one form no plural key may leave out — and the whole `text` of an entry
 * that has no `plural` map at all.
 */
function otherForm(key: MessageKey, entry: Message): string {
  if (entry.plural === undefined) return entry.text;
  const other = entry.plural.other;
  if (other === undefined) {
    throw new Error(`t('${key}'): the entry has a plural map but no \`other\` form to fall back to`);
  }
  return other;
}

/**
 * The one `{name}` whose `kind` is `number` — the plural selector.
 *
 * A plural entry that declares none is a catalogue defect no caller can cause,
 * so it throws in every build, like the two `otherForm` cases.
 */
function countedParam(key: MessageKey, entry: Message): string {
  const name = Object.keys(entry.kind ?? {}).find((candidate) => entry.kind?.[candidate] === 'number');
  if (name === undefined) {
    throw new Error(
      `t('${key}'): the entry has a plural map but no \`kind: { name: 'number' }\` to select on`,
    );
  }
  return name;
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
