import { approximateTokens, instantToLocalDay, type Note } from '@apunta/shared';

import { priorNoteBlock } from './prompts.js';
import type { PriorNoteInput } from './types.js';

/**
 * Fitting a patient's notes into a prompt — shared by Brainstorm (every note
 * is context) and the refine chat (the other notes are read-only background).
 * One implementation so the two can never disagree about what "fits" means,
 * and one renderer (`priorNoteBlock`) so the budget is the prompt's own text.
 *
 * Newest first, whole notes only, never a cut mid-note. The notes that go
 * are a run of the newest: the first note that does not fit in what is left
 * ends the run, so the model reads recent history without holes in it. The
 * one exception is a note too long to fit even on its own — it would never
 * fit, and letting it end the run would hide every older note behind it — so
 * it is skipped, and `mostRecent` turns false because the run now has a gap.
 */

export interface FittedNote extends PriorNoteInput {
  readonly id: string;
}

export interface FittedNotes {
  /** The notes that fit, newest first. */
  readonly notes: readonly FittedNote[];
  /** Every note that did not, newest first. */
  readonly omittedIds: readonly string[];
  /** True when `notes` is exactly the newest `notes.length` of the candidates. */
  readonly mostRecent: boolean;
  /** What the included notes cost, by the same estimate the provider refuses on. */
  readonly tokens: number;
}

/**
 * A note's cost in a prompt: its block, plus one token for the blank line
 * the prompt builders join it with. Rounded up per note, so the sum is never
 * below the estimate of the joined text.
 */
export function priorNoteTokens(note: PriorNoteInput): number {
  return approximateTokens(priorNoteBlock(note)) + 1;
}

export function toPriorNote(note: Note): FittedNote {
  return { id: note.id, title: note.title, date: instantToLocalDay(note.created_at), text: note.content };
}

/** `candidates` must be newest first, as `listNotesForPatient` returns them. */
export function fitNotesNewestFirst(candidates: readonly Note[], room: number): FittedNotes {
  const notes: FittedNote[] = [];
  const omittedIds: string[] = [];
  let tokens = 0;
  let full = false;

  for (const candidate of candidates) {
    const note = toPriorNote(candidate);
    const cost = priorNoteTokens(note);
    // Past the end of the run, or too long to fit even alone (see above).
    if (full || cost > room) {
      omittedIds.push(note.id);
      continue;
    }
    if (tokens + cost > room) {
      full = true;
      omittedIds.push(note.id);
      continue;
    }
    tokens += cost;
    notes.push(note);
  }

  const mostRecent = notes.every((note, index) => candidates[index]?.id === note.id);
  return { notes, omittedIds, mostRecent, tokens };
}
/**
 * Drafting deliberately gets a much smaller history than Brainstorm or refine.
 * Keep these two limits together: published notes are style examples, never
 * an unbounded source of old clinical facts.
 */
export const DRAFTING_PRIOR_NOTE_COUNT = 1;
export const DRAFTING_PRIOR_NOTE_CHARACTER_BUDGET = 12_000;

/** Select recent published notes without cutting a note or crossing the cap. */
export function fitDraftingPriorNotes(candidates: readonly Note[]): FittedNote[] {
  const notes: FittedNote[] = [];
  let characters = 0;
  for (const candidate of candidates) {
    if (candidate.status !== 'published' || notes.length >= DRAFTING_PRIOR_NOTE_COUNT) continue;
    const note = toPriorNote(candidate);
    const cost = priorNoteBlock(note).length + 2;
    if (characters + cost > DRAFTING_PRIOR_NOTE_CHARACTER_BUDGET) break;
    characters += cost;
    notes.push(note);
  }
  return notes;
}
