import { DEFAULT_LOCALE, type Sections } from '@apunta/shared';

import { msg, type Locale } from '../http/locale.js';
import { allFactTokens } from './fact-guard.js';

/**
 * The refine path's fourth lock: nothing from her other notes enters this one
 * unless she asks for it (2026-09-21).
 *
 * The refine chat now reads the patient's other notes as read-only
 * background, so she can ask "how does this compare to last session?". That
 * puts a second patient record beside the one being edited, and on this model
 * a rule in the prompt loses to material in front of it — the boilerplate and
 * fact locks exist because two rounds of prompt hardening each failed. So,
 * like them, this is enforced where it cannot be talked out of.
 *
 * The check is a diff against the allowed sources, not a censor: something in
 * a revised section counts as carried over only when it is **new** — absent
 * from the note as it stood, from her stored dictation, from her message and
 * from the passage she highlighted — **and** present in one of the other
 * notes. What neither place has is the model's own wording, which the other
 * locks judge; this one judges only provenance. Two signals, either enough:
 *
 *   - **a fact** — a number, month, weekday, medication, name or risk
 *     finding, by the fact lock's own tokeniser, so "four" and "4" agree;
 *   - **a run of five words** copied from another note, at least two of them
 *     not stopwords — a lifted sentence, not a shared idiom.
 *
 * A section that carries something over keeps its previous text and the
 * server says so under the reply. Her message is the way through: asked in
 * so many words to bring something across from another session
 * (`bringOverRequested`), the lock stands aside for that turn — she is
 * writing her note, and the earlier session is her own record.
 *
 * Known misses, accepted: a fact already somewhere in this note passes even
 * if the model moved it into a claim the earlier note made (set semantics,
 * like the fact lock); a paraphrase of an earlier sentence that shares no
 * fact and no five-word run. Known over-reach, accepted in the safe
 * direction: a new five-word run the model happens to share with an earlier
 * note holds the section back, and she can ask again in her own words.
 */

/** How many consecutive words make a copied run. */
const RUN_WORDS = 5;

/** Words too common to make a run distinctive on their own. */
const STOPWORDS = new Set(
  (
    'a an the and or but if of to in on at by for with from as is are was were be been being ' +
    'he she they it his her their them him this that these those there here then than so ' +
    'not no do does did has have had will would can could should may might about into over ' +
    'up down out off again very also just more most some any all each both same such own'
  ).split(' '),
);

/**
 * "Bring the homework over from last session", "add what we agreed last
 * time", "copy the risk review from the previous note". A verb of carrying
 * and a reference to another session, both, in her own message — a mention
 * of last session alone ("shorter, like last time's") is not a request for
 * its contents.
 */
const CARRY_VERB = /\b(?:bring|carry|copy|pull|include|add|insert|reuse|repeat|put)\b/i;
const OTHER_SESSION =
  /\b(?:(?:last|previous|prior|earlier|other|past|older)\s+(?:session|sessions|note|notes|time|week|visit|appointment|entry)|(?:session|note)\s+(?:before|from\s+(?:last|the\s+\w+\s+before)))\b/i;

export function bringOverRequested(message: string): boolean {
  return CARRY_VERB.test(message) && OTHER_SESSION.test(message);
}

export interface CarriedOver {
  /** The section that was kept as it was. */
  readonly section: string;
  /** What the revision tried to bring in, as it reads in the other note — shown only in her thread. */
  readonly phrase: string;
}

export interface PriorNoteGuardResult {
  readonly sections: Sections;
  readonly carried: readonly CarriedOver[];
}

/**
 * Revert any section whose revision brings in something only her other notes
 * contain, unless her message asks for exactly that.
 */
export function guardPriorNoteContent(
  previous: Sections,
  updated: Sections,
  allowedSources: readonly string[],
  priorNotes: readonly string[],
  message: string,
): PriorNoteGuardResult {
  if (priorNotes.length === 0 || bringOverRequested(message)) {
    return { sections: { ...updated }, carried: [] };
  }

  const allowed = [...Object.values(previous), ...allowedSources, message];
  const allowedFacts = new Set<string>();
  const allowedRuns = new Set<string>();
  for (const text of allowed) {
    for (const token of allFactTokens(text).keys()) allowedFacts.add(token);
    for (const run of runs(text).keys()) allowedRuns.add(run);
  }
  const priorFacts = new Map<string, string>();
  const priorRuns = new Map<string, string>();
  for (const text of priorNotes) {
    for (const [token, phrase] of allFactTokens(text))
      if (!priorFacts.has(token)) priorFacts.set(token, phrase);
    for (const [run, phrase] of runs(text)) if (!priorRuns.has(run)) priorRuns.set(run, phrase);
  }

  const sections: Record<string, string> = { ...updated };
  const carried: CarriedOver[] = [];
  for (const [name, revised] of Object.entries(updated)) {
    const before = previous[name] ?? '';
    if (revised === before) continue;
    const phrase = carriedPhrase(revised, allowedFacts, allowedRuns, priorFacts, priorRuns);
    if (phrase === null) continue;
    sections[name] = before;
    carried.push({ section: name, phrase });
  }
  return { sections, carried };
}

function carriedPhrase(
  revised: string,
  allowedFacts: ReadonlySet<string>,
  allowedRuns: ReadonlySet<string>,
  priorFacts: ReadonlyMap<string, string>,
  priorRuns: ReadonlyMap<string, string>,
): string | null {
  for (const token of allFactTokens(revised).keys()) {
    if (allowedFacts.has(token)) continue;
    const phrase = priorFacts.get(token);
    if (phrase !== undefined) return phrase;
  }
  for (const run of runs(revised).keys()) {
    if (allowedRuns.has(run)) continue;
    const phrase = priorRuns.get(run);
    if (phrase !== undefined) return phrase;
  }
  return null;
}

/**
 * Every distinctive five-word run in a text, normalised (lower case, letters
 * and digits only), mapped to how it reads there. Runs do not cross a
 * sentence end, and a run of mostly stopwords is not distinctive.
 */
function runs(text: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const sentence of text.split(/(?<=[.!?;:])\s+|\n+/)) {
    const words = sentence.split(/\s+/).filter((word) => word !== '');
    const bare = words.map((word) => word.toLowerCase().replace(/[^a-z0-9]+/g, ''));
    for (let start = 0; start + RUN_WORDS <= bare.length; start += 1) {
      const window = bare.slice(start, start + RUN_WORDS);
      if (window.some((word) => word === '')) continue;
      if (window.filter((word) => !STOPWORDS.has(word)).length < 2) continue;
      const key = window.join(' ');
      if (!found.has(key)) {
        found.set(
          key,
          words
            .slice(start, start + RUN_WORDS)
            .join(' ')
            .replace(/[,.;:!?]+$/, ''),
        );
      }
    }
  }
  return found;
}

/**
 * The server's own sentence in the chat, after the model's reply. The phrase
 * is from her earlier note, shown only in her own thread, as the fact lock's
 * is.
 */
export function priorNoteNotice(carried: readonly CarriedOver[], locale: Locale = DEFAULT_LOCALE): string {
  const parts = carried.map((c) =>
    msg(locale, 'chat.priorNoteNotice.section', { section: c.section, phrase: c.phrase }),
  );
  return [
    msg(locale, 'chat.priorNoteNotice.opening'),
    ...parts,
    msg(locale, 'chat.priorNoteNotice.tail'),
  ].join(' ');
}

/**
 * The notice's first sentence in **English**, for the same reason as
 * `GUARD_NOTICE_OPENING` in `refine-guard.ts`, which also says what the strip
 * list does about the other language.
 */
export const PRIOR_NOTE_NOTICE_OPENING = msg('en', 'chat.priorNoteNotice.opening');
