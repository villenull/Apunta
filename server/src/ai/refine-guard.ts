import type { Sections } from '@apunta/shared';

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
 * The list is deliberately short and high-precision. A false positive here
 * blocks an edit she asked for, which teaches her the chat is broken; a miss
 * costs one boilerplate phrase her review pass can catch. Grow it only with
 * phrases that are (a) stock clinical assertions, (b) clinically load-bearing
 * if false, and (c) unlikely in her own free dictation.
 */
const STOCK_CLINICAL_ASSERTIONS: readonly RegExp[] = [
  // Mental-status boilerplate — observations, not defaults.
  /\balert and (?:fully )?oriented\b/i,
  /\boriented\s*(?:x|times)\s*[1-4]\b/i,
  /\b(?:mood|affect)\s+(?:was\s+|is\s+)?congruent\b/i,
  /\bcongruent with (?:his |her |their )?(?:reported |stated )?(?:mood|affect|speech)\b/i,
  /\bwithin normal limits\b/i,
  /\bno acute distress\b/i,
  /\bwell[- ]groomed\b/i,
  /\bpsychomotor\b/i,
  /\b(?:insight and judgment|judgment and insight)\b/i,
  // Risk assertions — silence is never a negative finding, and a risk
  // statement that was not dictated is the most dangerous sentence a note
  // can gain.
  /\bdenie[sd]\s+(?:any\s+)?(?:current\s+)?(?:suicidal|self[- ]harm|homicidal)/i,
  /\bno (?:safety concerns?|acute risk|risk indicators)\b/i,
  // The shorthand must be uppercase — "SI"/"HI" as clinical abbreviations,
  // never the words "si"/"hi" — while the "no" may open a sentence.
  /\b[Nn]o (?:SI|HI)\b/,
];

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
  for (const pattern of STOCK_CLINICAL_ASSERTIONS) {
    const match = revised.match(pattern);
    if (!match) continue;
    if (pattern.test(before)) continue;
    if (sources.some((source) => pattern.test(source))) continue;
    return match[0];
  }
  return null;
}

/**
 * The server's own sentence in the chat, after the model's reply — which may
 * well be claiming it added nothing. The phrase shown is the matched
 * boilerplate, never dictation content, so it is safe for the thread.
 */
export function guardNotice(blocked: readonly BlockedRevision[]): string {
  const parts = blocked.map(
    (b) =>
      `${b.section} was kept as it was: the revision would have added "${b.phrase}", which is not in the note or your dictation.`,
  );
  return `Apunta blocked part of this revision. ${parts.join(' ')}`;
}
