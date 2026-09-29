import { en, esMX, type MessageKey } from '@apunta/shared';
import { expect, test, type Page } from '@playwright/test';

/**
 * `expectNoEnglishUi(page, screen)` — S2.6's check that a screen shown in
 * Spanish carries none of the English the catalogue has a Spanish word for
 * (AM-054).
 *
 * It reads every visible text node on the page, and every visible
 * `placeholder`, and matches each one against every **English** catalogue
 * value with each `{name}` widened to what it can render — a number for a
 * `number` placeholder, anything for the rest — so `3 notes` is caught as
 * `notes.count` and not missed as a number. A match is a leak when that key's
 * Spanish value, in the same form, differs from its English one: a key whose
 * two values are identical — the brand, the language names, `Language /
 * Idioma` — reads the same in both, and an identical string is not English
 * showing through.
 *
 * Nothing is excluded by construction. Patient names, model names, filenames
 * and fake-AI note text are all read like everything else, and a coincidental
 * match is **reported with its key**; the only way to silence one is an entry
 * in `ALLOWED` below, which says why. A leak that names its key costs a reviewer
 * one look; a silent skip would cost the check its meaning.
 *
 * What it cannot see, by design and not by exclusion: English that is not in
 * the catalogue at all (a literal the UI-string check missed, a server
 * sentence forwarded unchanged), two keys run together into one text node, and
 * text inside an editable field's value.
 *
 * What it cannot be: **a check that read nothing** (AM-073). A screen reached
 * by navigation is still arriving when the assertion immediately before a
 * `checkScreen` call has already passed, and a screen it read nothing on is a
 * screen it cannot report a leak for. So it waits for the screen to arrive,
 * and a call that still reads nothing **fails**, naming the screen and the
 * count. Zero English from zero strings is not a result.
 */

/** A catalogue entry, as the two objects hold it. */
interface Entry {
  readonly text: string;
  readonly plural?: Partial<Record<Intl.LDMLPluralRule, string>>;
  readonly kind?: Readonly<Record<string, string>>;
}

/**
 * Keys whose English may appear on a Spanish screen, and why. Each entry is a
 * key and a reason, never a pattern, so it can only ever silence the one key it
 * names — and each was added because a run reported it, not in advance.
 *
 * What an entry costs is written beside it: the key's own English, rendered on
 * its own, would no longer be caught on any Spanish screen.
 */
export const ALLOWED: Readonly<Partial<Record<MessageKey, string>>> = {
  // `{first} and {last}` and `{items} and {last}` have " and " as their only
  // literal, so any English sentence with an "and" in it matches them: the fake
  // transcript ("…less frequent, and I want to…") and the fake brainstorm
  // reply, which are model output and English in both projects. Cost: a list
  // joined in English and shown as a node of its own. A joined list shown
  // inside a sentence is still caught, as that sentence's own key.
  'chat.list.last': 'matches any English sentence containing " and " (fake transcript, fake model replies)',
  'common.listLast': 'matches any English sentence containing " and " (fake transcript, fake model replies)',
};

/** The form of `entry` a locale prints in `form`'s place: category, else `other`, else `text`. */
function counterpart(entry: Entry, form: string): string {
  if (form === 'text' || entry.plural === undefined) return entry.text;
  return entry.plural[form as Intl.LDMLPluralRule] ?? entry.plural.other ?? entry.text;
}

function escape(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * What `t()` can put where a placeholder is: a `number` is only ever a number
 * `Intl.NumberFormat` wrote — a digit, then digits and its separators — so it matches only
 * that, and every other kind matches anything, empty included. Widening a
 * `number` to anything would read `…rehearsed in session` as `{count} session`;
 * narrowing it this far drops nothing `t()` could have rendered.
 */
function slot(kind: string | undefined): string {
  return kind === 'number' ? '(\\d[\\d.,\\u00a0\\u202f]*)' : '(.*?)';
}

/** One English form as a whole-node pattern: literal text, each `{name}` its slot. */
function pattern(value: string, kind: Entry['kind']): RegExp {
  const normalised = value.replace(/\s+/g, ' ').trim();
  const source = normalised
    .split(/(\{\w+\})/)
    .map((part) => {
      const name = /^\{(\w+)\}$/.exec(part)?.[1];
      return name === undefined ? escape(part) : slot(kind?.[name]);
    })
    .join('');
  return new RegExp(`^${source}$`, 's');
}

interface EnglishForm {
  readonly key: MessageKey;
  readonly form: string;
  readonly english: string;
  readonly spanish: string;
  readonly regex: RegExp;
}

/**
 * Every English form whose Spanish counterpart differs — the only forms that can
 * leak. Built once, from the two catalogues `@apunta/shared` exports.
 */
export const ENGLISH_FORMS: readonly EnglishForm[] = (() => {
  const forms: EnglishForm[] = [];
  const spanishCatalogue = esMX as Readonly<Record<string, Entry | undefined>>;
  for (const [key, value] of Object.entries(en) as [MessageKey, Entry][]) {
    const spanishEntry = spanishCatalogue[key];
    if (spanishEntry === undefined) continue;
    const named: [string, string][] = [['text', value.text], ...Object.entries(value.plural ?? {})];
    for (const [form, english] of named) {
      const spanish = counterpart(spanishEntry, form);
      if (spanish.replace(/\s+/g, ' ').trim() === english.replace(/\s+/g, ' ').trim()) continue;
      forms.push({ key, form, english, spanish, regex: pattern(english, value.kind) });
    }
  }
  return forms;
})();

/** The English forms, if any, one visible string reads as. */
export function englishMatches(text: string): readonly EnglishForm[] {
  const normalised = text.replace(/\s+/g, ' ').trim();
  if (normalised === '') return [];
  return ENGLISH_FORMS.filter((form) => form.regex.test(normalised));
}

/** Every visible text node and visible `placeholder` on the page, whitespace-collapsed. */
async function visibleStrings(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const seen: string[] = [];
    const shown = (element: Element): boolean =>
      element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (parent === null || parent.closest('script, style, noscript, template') !== null) continue;
      const text = (node.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (text === '') continue;
      // An `<option>` is never "visible" on its own; its `<select>` is what shows.
      const host = parent.closest('option') === null ? parent : parent.closest('select');
      if (host === null || !shown(host)) continue;
      seen.push(text);
    }
    for (const field of document.querySelectorAll('[placeholder]')) {
      const text = (field.getAttribute('placeholder') ?? '').replace(/\s+/g, ' ').trim();
      if (text !== '' && shown(field)) seen.push(text);
    }
    return seen;
  });
}

/**
 * How long a screen is given to arrive, and how often it is looked at while it
 * does (AM-073). The transition it is waiting out is `--motion-base`, 240ms; the
 * budget is a ceiling, not a delay — a screen that has arrived is read on the
 * first look.
 */
const ARRIVAL_TIMEOUT_MS = 5_000;
const ARRIVAL_POLL_MS = 100;

/**
 * The page's visible text, read once the screen has arrived.
 *
 * The reason this waits at all: `.route-transition` is re-keyed per path
 * (`web/src/App.tsx`) and animated by `rise-in`, whose `from` is `opacity: 0`
 * (`web/src/styles/motion.css`). For the length of one motion base the whole
 * workspace subtree computes to `opacity: 0`, and `checkVisibility({
 * checkOpacity: true })` above counts a subtree at `opacity: 0` as hidden — so
 * a walker running mid-transition drops the entire screen and reads **nothing
 * from it**. Playwright's own `toBeVisible()`, which the spec runs immediately
 * before every call, does not consider opacity, so the two disagree for exactly
 * as long as the transition runs and the check reports a clean screen it never
 * looked at.
 *
 * What is deliberately **not** done: narrowing `checkOpacity` so opacity stops
 * counting, or dropping a screen from the project. Both make a mid-arrival
 * screen look empty rather than make the guard see it, which re-admits the very
 * leak the check exists to catch. The screen is waited out instead, and a
 * screen that never arrives fails below with the count it managed to read.
 */
async function arrivedStrings(page: Page): Promise<string[]> {
  const deadline = Date.now() + ARRIVAL_TIMEOUT_MS;
  for (;;) {
    const strings = await visibleStrings(page);
    if (new Set(strings).size > 0) return strings;
    if (Date.now() >= deadline) return strings;
    await page.waitForTimeout(ARRIVAL_POLL_MS);
  }
}

/**
 * Fail if the page, which must be in Spanish, shows English the catalogue
 * translates. `screen` names the screen in the failure and in the test's
 * annotations, which is the record that the check ran there — and the record of
 * how many strings it read, which is the record of whether it ran at all.
 */
export async function expectNoEnglishUi(page: Page, screen: string): Promise<void> {
  await expect(page.locator('html'), `the ${screen} screen is marked Spanish`).toHaveAttribute(
    'lang',
    'es-MX',
  );
  const strings = await arrivedStrings(page);
  const read = new Set(strings).size;
  const leaks: string[] = [];
  for (const text of new Set(strings)) {
    for (const form of englishMatches(text)) {
      if (ALLOWED[form.key] !== undefined) continue;
      leaks.push(`${form.key} [${form.form}]: "${text}" (es-MX: "${form.spanish}")`);
    }
  }
  test.info().annotations.push({
    type: 'no-english-ui',
    description: `${screen} — ${String(read)} strings read, ${String(leaks.length)} English`,
  });
  // A result is only a result if something was read (AM-073). 0 strings and 0
  // English is the shape a skipped check and a clean screen share, and V1's
  // claim — that the Spanish project is free of English catalogue text — rests
  // on this call having actually looked. So 0 is a failure, and it names the
  // screen and the count rather than passing quietly.
  expect(
    read,
    `the Spanish ${screen} screen gave the English check nothing to read: 0 visible strings after waiting ${String(ARRIVAL_TIMEOUT_MS)}ms for it to arrive, so "0 English" here is not a result`,
  ).toBeGreaterThan(0);
  expect(leaks, `English catalogue text on the Spanish ${screen} screen`).toEqual([]);
}
