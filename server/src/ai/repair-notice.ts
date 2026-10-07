import { DEFAULT_LOCALE } from '@apunta/shared';

import { msg, type Locale } from '../http/locale.js';
import type { DraftRepairs } from './types.js';

/** The opening of the paragraph the server adds under the first-pass message. Stripped from the model's history. */
export const REPAIR_NOTICE_OPENING = msg('en', 'chat.repairNotice.opening');

/**
 * For the note's opening chat turn: what the server changed in the draft after
 * the model wrote it, so nothing in her note changed without her being told.
 */
export function repairNotice(repairs: DraftRepairs, locale: Locale = DEFAULT_LOCALE): string {
  const items = [
    ...(repairs.riskReview === null
      ? []
      : [msg(locale, 'chat.repairNotice.riskReview', { section: repairs.riskReview })]),
    ...repairs.reworded.map(({ section, words }) =>
      msg(locale, 'chat.repairNotice.reworded', { section, words: words.join('”, “') }),
    ),
    ...repairs.notGathered.map((removed) => msg(locale, 'chat.repairNotice.notGathered', { removed })),
  ];
  const list =
    items.length <= 1
      ? (items[0] ?? '')
      : msg(locale, 'chat.repairNotice.list', {
          first: items.slice(0, -1).join('; '),
          last: items[items.length - 1]!,
        });
  return msg(locale, 'chat.repairNotice.sentence', {
    opening: msg(locale, 'chat.repairNotice.opening'),
    list,
  });
}
