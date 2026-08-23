import type { AiErrorCode, BriefLookback, Note } from '@apunta/shared';

import { AiError } from '../ai/errors.js';
import type { LlmProvider, LlmStats } from '../ai/types.js';
import { findExcerpt, sectionAtOffset } from './evidence.js';

/**
 * Stage one, for both M9 paths: read the recent notes, one call per note.
 *
 * This is the whole reason those paths are two-stage. Ollama truncates an
 * over-long prompt from the head, so a single call carrying six notes would
 * drop the instructions and keep the material — a confident invention with
 * nothing in the response to show for it
 * (`docs/research/m3-preflight-2026-08.md`). One note per call keeps every
 * prompt small enough that it cannot happen, and the caller composes from
 * these small objects instead.
 *
 * A note that cannot be read does not sink the run: it is reported as skipped
 * and named in the lookback, because a briefing that quietly read four notes
 * out of five is worse than one that says so.
 */

/** One note, reduced, with its excerpts verified against the note itself. */
export interface NoteMaterial {
  readonly note: Note;
  /** The number the second stage cites this note by. */
  readonly index: number;
  readonly points: readonly string[];
  readonly excerpts: readonly VerifiedExcerpt[];
}

export interface VerifiedExcerpt {
  /** The note's own characters. */
  readonly text: string;
  /** The section it sits in, derived from the note text. */
  readonly section: string | null;
}

export interface ReadNotesResult {
  readonly materials: readonly NoteMaterial[];
  readonly lookback: BriefLookback;
  /** Highest `prompt_eval_count` any single call reported. Logged, never guessed. */
  readonly maxPromptTokens: number;
}

/**
 * Failures that end the run rather than skip a note.
 *
 * A model that is not installed will not be installed by the next note. A note
 * the model choked on might just be an unusual note.
 */
const FATAL: ReadonlySet<AiErrorCode> = new Set<AiErrorCode>([
  'ollama_unreachable',
  'model_missing',
  'non_gguf_model',
  'unsupported_model_tag',
  'insufficient_memory',
  'timeout',
]);

export interface ReadNotesOptions {
  readonly llm: LlmProvider;
  /** Newest first, already capped by the lookback setting. */
  readonly notes: readonly Note[];
  /** The section list of a note's format, for locating an excerpt. */
  readonly sectionsFor: (note: Note) => readonly string[];
  readonly cap: number;
  readonly onProgress?: (read: number, total: number) => void;
  readonly onStats?: (stats: LlmStats) => void;
  /** The client hung up: stop calling the model. */
  readonly cancelled?: () => boolean;
}

export async function readRecentNotes(options: ReadNotesOptions): Promise<ReadNotesResult> {
  const materials: NoteMaterial[] = [];
  const skipped: string[] = [];
  let maxPromptTokens = 0;

  for (const [index, note] of options.notes.entries()) {
    if (options.cancelled?.() === true) break;
    options.onProgress?.(index + 1, options.notes.length);

    let summary;
    try {
      const result = await options.llm.summariseNote({
        noteText: note.content,
        sections: options.sectionsFor(note),
      });
      summary = result.value;
      maxPromptTokens = Math.max(maxPromptTokens, result.stats.promptTokens);
      options.onStats?.(result.stats);
    } catch (error) {
      if (error instanceof AiError && !FATAL.has(error.code)) {
        skipped.push(note.id);
        continue;
      }
      throw error;
    }

    const sections = options.sectionsFor(note);
    const excerpts: VerifiedExcerpt[] = [];
    for (const candidate of summary.excerpts) {
      // Not in the note, or paraphrased: it is not evidence, so it is dropped
      // rather than shown with a citation it has not earned.
      const match = findExcerpt(note.content, candidate);
      if (match === null) continue;
      excerpts.push({ text: match.text, section: sectionAtOffset(note.content, sections, match.start) });
    }

    materials.push({ note, index, points: summary.points.filter((point) => point.trim() !== ''), excerpts });
  }

  const read = materials.map((material) => material.note);
  return {
    materials,
    maxPromptTokens,
    lookback: {
      cap: options.cap,
      notes_read: read.length,
      // The notes are newest first, so the ends of the list are the range.
      oldest_note_date: read.at(-1)?.created_at ?? null,
      newest_note_date: read[0]?.created_at ?? null,
      skipped_note_ids: skipped,
    },
  };
}
