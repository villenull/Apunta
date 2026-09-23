import type { Sections } from '@apunta/shared';

import { factTokens, medicationTokens, removalRequested } from './fact-guard.js';

/**
 * What her message asked for, what the revision actually did, and what the
 * server may therefore tell her (2026-09-23).
 *
 * The locks below this module (`refine-guard`, `fact-guard`,
 * `prior-note-guard`) all judge a revision against *content* rules: no stock
 * clinical phrase from nowhere, no fact lost, nothing carried in from another
 * note. None of them judges the revision against the **request**, and that is
 * the gap the owner's hands-on pass found:
 *
 *   - "Make the discussion shorter" came back `outcome: "applied"` with the
 *     Discussion untouched, because an unrelated section (Location) had moved;
 *   - "Add that she's on sertraline 20 mg" came back `applied` with no
 *     sertraline anywhere in the note, while a Discussion sentence she never
 *     mentioned was deleted;
 *   - "Remove the risk review" cleared the Risk review *and* the Note for next
 *     session, and the reply claimed it had removed a medication that had
 *     never been written.
 *
 * Two things were wrong. The outcome was inferred from "did the note change"
 * rather than "did what she asked for happen", and the model's prose was shown
 * as the account of what happened. So this module reads her message as a
 * request, holds the revision to that request's **scope**, checks whether the
 * request is actually satisfied in the diff, and writes the reply the server
 * can stand behind.
 *
 * The reply for an edit turn is therefore the server's, not the model's: it
 * names the sections that really changed, then what did not happen and why. On
 * this 4B the model's own account is not evidence — it reported an added
 * medication over a note without it — and a reply that contradicts the diff is
 * worse than a terse one. A question keeps the model's answer, because a
 * question has no diff to contradict.
 *
 * Deliberately mechanical: section names, verbs and facts, never a judgement
 * about meaning. A request this module cannot read (a register change, a
 * rewrite "in her own words") yields no checks at all, and the outcome then
 * means only "the note changed" — as it did before, plus the diff naming what
 * moved.
 */

/** The prototype's test: a message with a question mark in it is a question. */
export function isQuestion(message: string): boolean {
  return message.includes('?');
}

/** How many lost words a scope report shows, so the notice stays readable. */
const PHRASE_WORDS = 5;

/**
 * Words too common to carry a scope decision: what a section lost, or a target
 * gained, is judged on its content words. Kept small — an over-broad list
 * would let a real deletion through as "just grammar".
 */
const STOPWORDS = new Set(
  (
    'a an the and or but if of to in on at by for with from as is are was were be been being ' +
    'he she they it his her their them him this that these those there here then than so ' +
    'not no do does did has have had will would can could should may might about into over ' +
    'up down out off again very also just more most some any all each both same such own ' +
    'my your our its we you i'
  ).split(' '),
);

/** Sections the format knows, matched in her message by their own name. */
const SECTION_ALIASES: Readonly<Record<string, readonly string[]>> = {
  'Risk review': ['risk'],
};

const ADDITION =
  /\b(?:add|added|include|insert|mention|note that|noting that|put in|write that|record that|document|documenting)\b/i;
const SHORTENING =
  /\b(?:short(?:er|en|ening)?|condense|condensed|trim|tighten|concise|brief(?:er)?|less wordy|less verbose|summari[sz]e)\b/i;
const MOVE = /\b(?:move|moved|shift|relocate|transfer|cut and paste)\b/i;
const WHOLE_NOTE =
  /\b(?:(?:whole|entire|full)\s+(?:the\s+)?note|every\s+section|all\s+(?:the\s+)?sections|whole\s+thing)\b/i;

/** Straight and curly double quotes, the way a request names exact words. */
const QUOTED = /"([^"\n]{3,})"|“([^”\n]{3,})”/g;

export interface RequiredAddition {
  /** What to call it in the reply — her own words, quoted. */
  readonly label: string;
  readonly kind: 'medication' | 'fact' | 'phrase';
  /** `med:<generic>` for a medication, a fact token, or normalised phrase text. */
  readonly token: string;
}

export interface RefineIntent {
  /** The sections her message names; empty means the request is not scoped. */
  readonly targets: readonly string[];
  readonly removal: boolean;
  readonly addition: boolean;
  readonly shortening: boolean;
  readonly move: boolean;
  /** Content her message supplies and asks to be in the note afterwards. */
  readonly requiredAdditions: readonly RequiredAddition[];
}

/** The sections of `sections` her message names, in format order. */
function namedSections(message: string, sections: readonly string[]): string[] {
  const found: string[] = [];
  for (const name of sections) {
    const candidates = [name, ...(SECTION_ALIASES[name] ?? [])];
    const mentioned = candidates.some((candidate) =>
      new RegExp(`\\b${candidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(message),
    );
    if (mentioned) found.push(name);
  }
  return found;
}

/**
 * Her message as a request. `targets` is empty when she named no section (or
 * asked about the whole note), and an empty scope is not enforced — the
 * request is judged by kind instead (an addition may not delete, a shortening
 * must shorten).
 */
export function parseRefineRequest(message: string, sections: readonly string[]): RefineIntent {
  const targets = WHOLE_NOTE.test(message) ? [] : namedSections(message, sections);
  const removal = removalRequested(message);
  const addition = ADDITION.test(message);
  const shortening = SHORTENING.test(message);
  const move = MOVE.test(message);

  return {
    targets,
    removal,
    addition,
    shortening,
    move,
    requiredAdditions: addition && !removal ? requiredAdditions(message) : [],
  };
}

/**
 * What her message says must be in the note afterwards. Three sources, all
 * hers: a medication she names (by the fact lock's own formulary, so "Zoloft"
 * and "sertraline" are one fact), a number or date she supplies, and any
 * passage she put in quotes. Free prose she asks for cannot be checked
 * mechanically and is left to her review, as it was before.
 *
 * A dose written beside a medication she named is that medication's, not a
 * second request: "add that she's on sertraline 20 mg" is one thing to land,
 * and reporting it as two ("could not add sertraline" *and* "could not add 20
 * mg") would read as two failures.
 */
function requiredAdditions(message: string): RequiredAddition[] {
  const found: RequiredAddition[] = [];
  const seen = new Set<string>();
  const add = (addition: RequiredAddition): void => {
    const key = `${addition.kind}:${addition.token}`;
    if (seen.has(key)) return;
    seen.add(key);
    found.push(addition);
  };

  for (const [token, phrase] of medicationTokens(message)) add({ kind: 'medication', token, label: phrase });
  const namesAMedication = found.length > 0;
  // `factTokens`, not `allFactTokens`: the numeric and calendar layer is what
  // a request to add can be checked against. The wider set folds medications
  // back in (they are already here, as medications), and a risk negation or a
  // name she supplies in prose is not something a diff can confirm.
  for (const [token, phrase] of factTokens(message)) {
    if (namesAMedication && DOSE_UNIT.test(phrase)) continue;
    add({ kind: 'fact', token, label: phrase });
  }
  for (const match of message.matchAll(QUOTED)) {
    const text = (match[1] ?? match[2] ?? '').trim();
    if (text !== '') add({ kind: 'phrase', token: normalise(text), label: text });
  }
  return found;
}

/** A dose unit: the numeric fact beside it is the medication's, not its own. */
const DOSE_UNIT = /\b(?:mg|mcg|µg|ml|units?|iu)\b/i;

/** Is what she asked for in the revised note? */
export function additionSatisfied(addition: RequiredAddition, revised: string): boolean {
  if (addition.kind === 'medication') return medicationTokens(revised).has(addition.token);
  if (addition.kind === 'fact') return factTokens(revised).has(addition.token);
  return normalise(revised).includes(addition.token);
}

/** Lower-case, punctuation-free, single-spaced — what a phrase check compares. */
function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function words(text: string): string[] {
  return normalise(text)
    .split(' ')
    .filter((word) => word !== '');
}

/** The content words `revised` no longer has, in the order they read in `before`. */
export function lostWords(before: string, revised: string): string[] {
  const pool = new Map<string, number>();
  for (const word of words(revised)) pool.set(word, (pool.get(word) ?? 0) + 1);

  const lost: string[] = [];
  for (const word of words(before)) {
    const count = pool.get(word) ?? 0;
    if (count > 0) {
      pool.set(word, count - 1);
      continue;
    }
    if (!STOPWORDS.has(word)) lost.push(word);
  }
  return lost;
}

/** The content words `revised` has that `before` did not — a reword or an addition. */
function gainedWords(before: string, revised: string): string[] {
  const pool = new Map<string, number>();
  for (const word of words(before)) pool.set(word, (pool.get(word) ?? 0) + 1);

  const gained: string[] = [];
  for (const word of words(revised)) {
    const count = pool.get(word) ?? 0;
    if (count > 0) {
      pool.set(word, count - 1);
      continue;
    }
    if (!STOPWORDS.has(word)) gained.push(word);
  }
  return gained;
}

/** A few words from where a lost stretch begins, for the reply — her own thread. */
function lostPhrase(before: string, revised: string): string {
  const lost = new Set(lostWords(before, revised));
  const all = words(before);
  const at = all.findIndex((word) => lost.has(word));
  return at === -1 ? '' : all.slice(at, at + PHRASE_WORDS).join(' ');
}

export interface ScopeHold {
  readonly section: string;
  readonly reason: string;
}

export interface ScopeResult {
  readonly sections: Sections;
  readonly held: readonly ScopeHold[];
}

/**
 * Hold the revision to what she asked for.
 *
 * Two rules, both from the owner's pass:
 *
 * - **A named section is the scope.** "Make the discussion shorter" may change
 *   the Discussion and nothing else; a revision that also rewrote Location
 *   loses that section, whatever the reason. On 2026-09-23 the Location came
 *   from a *later* session's note, which is the prior-note lock's business —
 *   but the request's own scope stops it first, without needing to know where
 *   the text came from.
 * - **A request that only adds may not delete.** "Add that she's on sertraline
 *   20 mg" has no scope of its own — she named no section — but it is plainly
 *   not permission to remove a sentence from the Discussion, which is what the
 *   revision did while claiming to have added the medication.
 *
 * The one thing a scoped request may reach outside its scope for is a **move**:
 * text has to leave the section it was in. A section outside the scope is
 * allowed to change when it only lost words and the words it lost are among the
 * ones the named section gained. Nothing else.
 */
export function enforceRefineScope(previous: Sections, updated: Sections, intent: RefineIntent): ScopeResult {
  const sections: Record<string, string> = { ...updated };
  const held: ScopeHold[] = [];
  const scoped = intent.targets.length > 0;
  const additionOnly = intent.addition && !intent.removal && !intent.shortening && !intent.move;
  const scopeLabel = listSections(intent.targets);
  const gained = new Set(
    intent.targets.flatMap((target) => gainedWords(previous[target] ?? '', updated[target] ?? '')),
  );

  for (const [name, before] of Object.entries(previous)) {
    const revised = updated[name] ?? '';
    if (revised === before) continue;

    if (scoped && !intent.targets.includes(name)) {
      const lost = lostWords(before, revised);
      const movedOut =
        intent.move && gainedWords(before, revised).length === 0 && lost.some((word) => gained.has(word));
      if (!movedOut) {
        sections[name] = before;
        held.push({
          section: name,
          reason: `Apunta left ${name} as it was: your message asked about ${scopeLabel} only.`,
        });
        continue;
      }
    }

    if (additionOnly) {
      const lost = lostWords(before, revised);
      if (lost.length > 0) {
        sections[name] = before;
        held.push({
          section: name,
          reason: `Apunta left ${name} as it was: you asked only to add, and the revision would also have taken out "${lostPhrase(before, revised)}".`,
        });
      }
    }
  }

  return { sections, held };
}

function listSections(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1] as string}`;
}

export interface RequestCheck {
  readonly kind: 'removal' | 'shortening' | 'addition';
  /** The section it concerns, or null when it is not section-shaped. */
  readonly section: string | null;
  /** What she asked to be added, in her words — null for the other kinds. */
  readonly label: string | null;
  readonly satisfied: boolean;
  /** One sentence, in the server's voice, for the reply — empty when satisfied. */
  readonly reason: string;
}

/**
 * Did what she asked for actually happen? Read off the diff, never off the
 * model's reply. A request this module cannot check contributes no entry.
 */
export function checkRequests(intent: RefineIntent, previous: Sections, updated: Sections): RequestCheck[] {
  const checks: RequestCheck[] = [];
  const revisedAll = Object.values(updated).join('\n');

  if (intent.shortening) {
    const targets = intent.targets.length > 0 ? intent.targets : [null];
    for (const section of targets) {
      const before = section === null ? Object.values(previous).join('\n') : (previous[section] ?? '');
      const revised = section === null ? revisedAll : (updated[section] ?? '');
      const satisfied = words(revised).length < words(before).length;
      const subject = section === null ? 'the note' : `the ${section} section`;
      checks.push({
        kind: 'shortening',
        section,
        label: null,
        satisfied,
        reason: satisfied ? '' : `Apunta could not shorten ${subject}: the revision came back no shorter.`,
      });
    }
  }

  if (intent.removal && intent.targets.length > 0) {
    for (const section of intent.targets) {
      const before = previous[section] ?? '';
      const revised = updated[section] ?? '';
      // Cleared, or reduced to the format's "None." convention: both are her
      // taking the content out, and neither is this module's call to insist on.
      const satisfied = before !== revised && words(revised).length < words(before).length;
      checks.push({
        kind: 'removal',
        section,
        label: null,
        satisfied,
        reason: satisfied
          ? ''
          : `Apunta could not clear the ${section} section: the revision left it as it was.`,
      });
    }
  }

  for (const addition of intent.requiredAdditions) {
    const satisfied = additionSatisfied(addition, revisedAll);
    checks.push({
      kind: 'addition',
      section: null,
      label: addition.label,
      satisfied,
      reason: satisfied ? '' : `Apunta could not add "${addition.label}": the revision came back without it.`,
    });
  }

  return checks;
}

/** Sections whose text differs between the two revisions, in the first's order. */
export function changedSections(previous: Sections, updated: Sections): string[] {
  return Object.keys(previous).filter((name) => (previous[name] ?? '') !== (updated[name] ?? ''));
}

export type RefineOutcome = 'applied' | 'partial' | 'withheld' | 'unchanged';

export interface RefineVerdict {
  readonly outcome: RefineOutcome;
  readonly reason: string | null;
  /** The reply for an edit turn, server-written, or '' when a question keeps the model's. */
  readonly reply: string;
}

export interface AssessInput {
  readonly intent: RefineIntent;
  readonly previous: Sections;
  readonly updated: Sections;
  /** The scope holds `enforceRefineScope` decided. */
  readonly held: readonly ScopeHold[];
  /**
   * The sections a lock kept as they were — the `blocked`, `dropped` and
   * `carried` results of the three content locks, by section name. Passed in
   * because a notice's own text names its section, and reading that text back
   * would be the kind of guessing this module exists to avoid.
   */
  readonly lockedSections: readonly string[];
  /** The lock notices the route composed, in the order it composed them. */
  readonly notices: readonly string[];
  /** Whether the note's content actually differs — the route's own comparison. */
  readonly changed: boolean;
}

/**
 * The outcome, its reason, and the reply — all three read off the diff and the
 * guard results rather than the model's claim.
 *
 *   - `applied`   — every change she asked for is present, and nothing was held back;
 *   - `partial`   — the note changed, and something she asked for (or a lock) did not land;
 *   - `withheld`  — the note did not change, or nothing she asked for got through;
 *   - `unchanged` — nothing changed and nothing was held back.
 *
 * `unchanged` with a satisfied request means the note already said what she
 * asked for, and the reason says so rather than reporting a silent no-op.
 */
export function assessRefine(input: AssessInput): RefineVerdict {
  const checks = checkRequests(input.intent, input.previous, input.updated);
  const unmet = checks.filter((check) => !check.satisfied);
  const heldBack = input.held.length > 0 || input.notices.length > 0;
  const explainedSections = new Set([...input.held.map((hold) => hold.section), ...input.lockedSections]);

  /**
   * A check a lock notice or a scope hold already accounts for. The notice is
   * the explanation — repeating it in the server's other voice ("Apunta could
   * not shorten the Discussion section" over "Discussion was kept as it was")
   * would read as two separate refusals. An addition is never explained away:
   * a notice about some other section says nothing about whether the
   * medication she asked for arrived.
   */
  const explained = (check: RequestCheck): boolean =>
    check.kind !== 'addition' &&
    input.notices.length > 0 &&
    (check.section === null || explainedSections.has(check.section));

  const outcome: RefineOutcome =
    !input.changed && !heldBack && unmet.length === 0
      ? 'unchanged'
      : !input.changed
        ? 'withheld'
        : unmet.length > 0 && unmet.length === checks.length
          ? 'withheld'
          : unmet.length > 0 || heldBack
            ? 'partial'
            : 'applied';

  const reasons = [
    ...input.held.map((hold) => hold.reason),
    ...unmet.filter((check) => !explained(check)).map((check) => check.reason),
    ...input.notices,
  ];
  const reason =
    outcome === 'applied'
      ? null
      : reasons.length > 0
        ? reasons.join(' ')
        : outcome === 'unchanged' && checks.length > 0
          ? 'The note already said what you asked for.'
          : 'The requested edit produced no changes.';

  return { outcome, reason, reply: replyFor(input, checks, outcome, explained) };
}

/**
 * The reply for an edit turn: the sections that really changed, then what did
 * not happen and why. The model's own prose is not used — on 2026-09-23 it
 * reported adding a medication that was not in the note, and inventing a
 * removal that never happened.
 */
function replyFor(
  input: AssessInput,
  checks: readonly RequestCheck[],
  outcome: RefineOutcome,
  explained: (check: RequestCheck) => boolean,
): string {
  const parts: string[] = [];
  if (input.changed) {
    // A satisfied addition is named with her own words: "I added that she's on
    // sertraline 20 mg" is the one thing she wants confirmed, and the check
    // above has just confirmed it is in the note.
    parts.push(
      changeSentence(
        input.previous,
        input.updated,
        checks
          .filter((check) => check.kind === 'addition' && check.satisfied && check.label !== null)
          .map((check) => check.label as string),
      ),
    );
  }

  // What the request's own scope put back, then what did not happen, then the
  // locks' notices.
  parts.push(...input.held.map((hold) => hold.reason));
  for (const check of checks) {
    if (!check.satisfied && !explained(check)) parts.push(check.reason);
  }

  parts.push(...input.notices);
  if (parts.length > 0) return parts.join('\n\n');
  if (outcome !== 'unchanged') return '';
  return checks.length > 0 && checks.every((check) => check.satisfied)
    ? ALREADY_THERE_NOTICE
    : UNCHANGED_NOTICE;
}

/** "I shortened the Discussion section and added "sertraline 20 mg"." */
function changeSentence(previous: Sections, updated: Sections, additions: readonly string[]): string {
  const parts: string[] = [];
  for (const name of Object.keys(previous)) {
    const before = previous[name] ?? '';
    const revised = updated[name] ?? '';
    if (before === revised) continue;
    const verb =
      revised.trim() === ''
        ? 'cleared'
        : words(revised).length < words(before).length
          ? 'shortened'
          : words(revised).length > words(before).length
            ? 'expanded'
            : 'rewrote';
    parts.push(`${verb} the ${name} section`);
  }
  for (const addition of additions) parts.push(`added "${addition}"`);
  return parts.length === 0 ? '' : `I ${parts.join(' and ')}.`;
}

/** The server's own sentence when an instruction left the note as it was. */
export const UNCHANGED_NOTICE = 'Apunta did not change the note: the revision came back with no edits.';

/** The server's own sentence when the note already said what she asked for. */
export const ALREADY_THERE_NOTICE = 'Apunta did not change the note: it already said what you asked for.';

/** The server's own sentence when a question came back with a rewrite attached. */
export const QUESTION_LEFT_ALONE = 'Apunta left the note unchanged: you asked a question, not for an edit.';
