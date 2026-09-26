import { DEFAULT_LOCALE, type Sections } from '@apunta/shared';

import { msg, type Locale } from '../http/locale.js';
import { clinicalAssertionTokens } from './clinical-phrases.js';

/**
 * The refine path's server-side faithfulness check (found necessary in M10's
 * live human pass, 2026-08-28).
 *
 * The UI's "More clinical" quick action made the model add "alert and
 * oriented" and "mood congruent with affect" — the never-write list's own
 * named examples — to a note containing neither, while its reply claimed no
 * content was added. Two rounds of prompt hardening moved but did not close
 * the hole: a register request outranks standing rules at this model scale,
 * and the second round taught the inverse failure (content she dictated was
 * deleted as "a measurement"). So, like the published lock one function up
 * the file, this is enforced where it cannot be talked out of.
 *
 * The check is a diff, not a censor: a phrase on the list blocks a section's
 * revision only when it is NEW — absent from that section's previous text and
 * absent from every allowed source (the note's transcripts). Boilerplate the
 * therapist actually dictated passes; the model recombining her words passes;
 * only stock clinical language appearing from nowhere is stopped, and the
 * section keeps its previous text while the rest of the revision goes
 * through.
 *
 * The list lives in `clinical-phrases.ts`, shared with the drop lock. It is
 * broad but every entry is anchored to a clinical collocation: because the
 * lock fires only on a NEW, ungrounded phrase, breadth is free on text she
 * dictated and costs only a phrase that reads as an unearned finding. Grow it
 * only with phrases that are (a) stock clinical assertions, (b) clinically
 * load-bearing if false, and (c) unlikely in her own free dictation.
 */

export interface BlockedRevision {
  /** The section whose revision was discarded. */
  readonly section: string;
  /** What the revision tried to add, as matched — boilerplate, never patient content. */
  readonly phrase: string;
}

export interface RefineGuardResult {
  /** The revision with any violating section reverted to its previous text. */
  readonly sections: Sections;
  readonly blocked: readonly BlockedRevision[];
}

/**
 * Revert any section whose revision introduces a stock clinical assertion
 * that neither the section's previous text nor any allowed source contains.
 */
export function guardRefinedSections(
  previous: Sections,
  updated: Sections,
  allowedSources: readonly string[],
): RefineGuardResult {
  const sections: Record<string, string> = {};
  const blocked: BlockedRevision[] = [];

  for (const [name, revised] of Object.entries(updated)) {
    const before = previous[name] ?? '';
    const violation = newAssertion(before, revised, allowedSources);
    if (violation === null) {
      sections[name] = revised;
    } else {
      sections[name] = before;
      blocked.push({ section: name, phrase: violation });
    }
  }

  return { sections, blocked };
}

function newAssertion(before: string, revised: string, sources: readonly string[]): string | null {
  const beforeTokens = clinicalAssertionTokens(before);
  const sourceTokens = new Set<string>();
  for (const source of sources)
    for (const token of clinicalAssertionTokens(source).keys()) sourceTokens.add(token);

  for (const [token, phrase] of clinicalAssertionTokens(revised)) {
    if (beforeTokens.has(token) || sourceTokens.has(token)) continue;
    return phrase;
  }
  return null;
}

/**
 * The server's own sentence in the chat, after the model's reply — which may
 * well be claiming it added nothing. The phrase shown is the matched
 * boilerplate, never dictation content, so it is safe for the thread.
 */
export function guardNotice(blocked: readonly BlockedRevision[], locale: Locale = DEFAULT_LOCALE): string {
  const parts = blocked.map((b) =>
    msg(locale, 'chat.guardNotice.section', { section: b.section, phrase: b.phrase }),
  );
  return `${msg(locale, 'chat.guardNotice.opening')} ${parts.join(' ')}`;
}

/**
 * The notice's first sentence in **English** — the catalogue's English rather
 * than a second copy, and the marker this module's own callers and
 * `routes/chat.ts` match a server-written paragraph by.
 *
 * The sentence itself is *not* the same string in every language: the es-MX
 * catalogue says `Apunta bloqueó una parte de esta revisión.` and the thread may
 * hold a notice written in the note's locale. What covers both is the **strip
 * list**, which `routes/chat.ts` builds by reading this key in both languages —
 * so a notice in either one is recognised and neither reaches the model.
 */
export const GUARD_NOTICE_OPENING = msg('en', 'chat.guardNotice.opening');
