import {
  DEFAULT_LANGUAGE,
  LANGUAGE_SETTING,
  isLanguage,
  t,
  type Locale,
  type MessageKey,
} from '@apunta/shared';
import type { Database } from 'better-sqlite3';

import { getSetting } from '../db/settings.js';

export type { Locale, MessageKey };

/**
 * What `t()` accepts as its second argument.
 *
 * Taken from `t` itself rather than imported: `MessageParams` is declared in
 * `shared/src/i18n/t.ts` but not re-exported from the package entry, and
 * `shared/src/index.ts` is read-only for this card. Deriving the type from the
 * function signature cannot drift from what `t()` actually reads.
 */
export type MessageParams = NonNullable<Parameters<typeof t>[1]>;

/**
 * Which language a request is answered in — C-LANG@1, and the one answer three
 * call sites could not reach before this module existed.
 *
 * Three rules, in the order they are asked:
 *
 * 1. **A refine uses the target note's locale** (`notes.locale`,
 *    `migrations/008_locale.sql`), whatever the setting says and whatever
 *    language the instruction is typed in. That is the contract's own named
 *    exception, and its rejection example is a Spanish instruction against an
 *    English note.
 * 2. **A job reads the setting once, at the start.** Recording, transcription,
 *    draft, plan, briefing and brainstorm all call `capture` at the top of the
 *    handler and pass the value down, so every sentence the job produces
 *    afterwards — `status` and `progress` frames, appended notices, the
 *    persisted row, a retry's error — uses that one value and never the setting
 *    as it stands later (C-LANG@1 rule 4, second sentence).
 * 3. **Anything else uses the setting**, synthesised to English when no row
 *    exists, which is the same rule `routes/settings.ts` has always answered
 *    `GET /api/settings` with.
 *
 * The read of the `language` row moved here from `routes/settings.ts`, so the
 * route and the error handler share one implementation rather than two that
 * could disagree.
 *
 * **This card does not build a `JobContext`.** `shared/src/job-context.ts`
 * reserves construction for S5.4 (the prompt set) and P4.3 (the speech model),
 * and a route building one today would be guessing at both. Capturing the
 * locale in the streaming route's closure is enough for the text this card
 * renders; the rest of the captured context is a later card's wiring.
 */
export function storedLanguage(db: Database): Locale {
  const value = getSetting<unknown>(db, LANGUAGE_SETTING);
  return isLanguage(value) ? value : DEFAULT_LANGUAGE;
}

/**
 * The locale a request is answered in, resolved once and then held.
 *
 * `noteId` is the refine exception and nothing else: pass it only for a request
 * that works on an existing note. With no `noteId` this is rule 3, and a
 * streaming route that calls it before opening its stream has captured the
 * value its whole job will use.
 */
export function capture(db: Database, noteId?: string): Locale {
  if (noteId !== undefined) {
    const row = db.prepare('SELECT locale FROM notes WHERE id = ?').get(noteId) as
      { locale?: unknown } | undefined;
    if (typeof row?.locale === 'string' && isLanguage(row.locale)) return row.locale;
  }
  return storedLanguage(db);
}

/**
 * `t()` under a name that says where the locale came from.
 *
 * Every render site in the server goes through this rather than importing `t`
 * itself, so a sentence and the locale it was rendered in are always written
 * side by side and a reader can see which of the three rules applied.
 */
export function msg(locale: Locale, key: MessageKey, params: MessageParams = {}): string {
  return t(key, params, locale);
}
