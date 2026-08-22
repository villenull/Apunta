import type { Sections } from '@apunta/shared';

import { instructionsFor } from './default-instructions.js';
import type { DetectFormatRequest, GenerateNoteRequest, RefineNoteRequest } from './types.js';

/**
 * Prompt assembly. Stateless per request: the full system prompt goes out on
 * every call, which is what stops instructions "wearing off" over a long chat.
 *
 * Two rules shape everything here.
 *
 * **The schema is invisible to the model.** Ollama's `format` constrains
 * sampling; it is never shown. So the key names, their meaning, and the
 * "nothing else" rule are restated in the prompt, per Ollama's own
 * structured-output guidance. Without it a grammar-constrained model produces
 * structurally valid JSON whose *content* is misfiled — the one failure the
 * schema cannot see.
 *
 * **Ollama truncates from the head.** When a prompt exceeds `num_ctx` the
 * system prompt goes first and the source material survives, which is the
 * worst possible ordering: the model keeps the patient material and loses the
 * instruction not to invent. So the key contract is restated in one line at
 * the very *end* of the user message, where it survives a truncation event.
 * It costs about thirty tokens.
 *
 * **No few-shot examples are added here.** Both built-in instruction files
 * already carry two dictation→JSON pairs each, and `rationale.md` ranks them
 * as the single highest-impact element of the instructions. A third example
 * written by the prompt builder would duplicate them, eat the token budget a
 * small model drifts past, and risk contradicting the authored pair that
 * demonstrates an empty section. Examples are the *format's* responsibility —
 * which is also what lets the owner's own material supply them later, since
 * that material may never live in this repository. See `docs/decisions.md`.
 */

export interface ChatPrompt {
  readonly system: string;
  readonly user: string;
}

/** `"Subjective", "Objective", "Assessment", "Plan"` — quoted so odd names survive. */
function quotedKeys(sections: readonly string[]): string {
  return sections.map((section) => JSON.stringify(section)).join(', ');
}

/**
 * The bridge between the authored instructions, which say "the dictation",
 * and a request that may carry typed notes, a transcript, or both.
 */
function sourceGlossary(request: {
  typedNotes?: string | undefined;
  transcript?: string | undefined;
}): string {
  const hasTyped = (request.typedNotes ?? '').trim() !== '';
  const hasTranscript = (request.transcript ?? '').trim() !== '';
  if (hasTyped && hasTranscript) {
    return 'Where the instructions above say "the dictation", they mean the source material below — the therapist\'s own written notes together with the transcript of what she recorded. Where the two disagree, her written notes are correct.';
  }
  if (hasTyped) {
    return 'Where the instructions above say "the dictation", they mean the source material below. There is no recording for this session: the source is the therapist\'s own written notes, so it carries no transcription errors and her wording is exact.';
  }
  return 'Where the instructions above say "the dictation", they mean the transcript below.';
}

/** The "## Output format" block: what `format` enforces, said out loud. */
export function outputFormatBlock(sections: readonly string[]): string {
  return [
    '## Output format',
    '',
    'Return one JSON object and nothing else. It must have exactly these keys, in this order:',
    '',
    `  ${quotedKeys(sections)}`,
    '',
    "Every key is required. Each value is that section's body as plain prose.",
    'Do not add any other key. Do not use markdown, headings, or bullet characters.',
    'Do not repeat the section name inside its value.',
    'If a section has no material in the source, its value is the empty string "".',
  ].join('\n');
}

/** The one-line restatement that survives a head truncation. */
export function tailReminder(sections: readonly string[]): string {
  return `Reply with a single JSON object with exactly the keys ${quotedKeys(sections)}, and nothing else.`;
}

/**
 * The labelled source blocks.
 *
 * Her written notes and a machine transcript are not the same kind of
 * evidence and the prompt says so: the notes are her own words, chosen
 * deliberately; the transcript is speech-to-text and may be garbled. M5 adds
 * audio alongside typed notes rather than instead of them, so both are
 * labelled separately from the start.
 */
function sourceBlocks(request: {
  typedNotes?: string | undefined;
  transcript?: string | undefined;
}): string[] {
  const blocks: string[] = [];
  const typed = (request.typedNotes ?? '').trim();
  const transcript = (request.transcript ?? '').trim();

  if (typed !== '') {
    blocks.push(
      ["Therapist's written notes — her own words, written by her. Authoritative:", '', typed].join('\n'),
    );
  }
  if (transcript !== '') {
    blocks.push(
      [
        'Dictation transcript — speech-to-text of the same session. It may contain transcription errors, especially in names, medications and clinical terms:',
        '',
        transcript,
      ].join('\n'),
    );
  }
  return blocks;
}

export function buildGeneratePrompt(request: GenerateNoteRequest): ChatPrompt {
  const instructions = instructionsFor(request.instructions, request.formatName ?? '', request.sections);
  const system = [
    instructions.trimEnd(),
    '',
    outputFormatBlock(request.sections),
    '',
    sourceGlossary(request),
  ].join('\n');

  const user = [...sourceBlocks(request), tailReminder(request.sections)].join('\n\n');
  return { system, user };
}

/**
 * The refine prompt (M4 wires the UI).
 *
 * It reuses the format's instructions unchanged — `rationale.md` anticipates
 * this: "the faithfulness and section-content rules carry over". What is
 * added is the two-field output contract and the rule that answering a
 * question is a legitimate outcome. The published-lock is **not** described
 * to the model; it is enforced server-side, where it cannot be talked out of.
 */
export function buildRefinePrompt(request: RefineNoteRequest): ChatPrompt {
  const instructions = instructionsFor(request.instructions, request.formatName ?? '', request.sections);
  const system = [
    instructions.trimEnd(),
    '',
    '## Output format',
    '',
    "You are revising a note you already drafted, at the therapist's request.",
    'Return one JSON object and nothing else, with exactly these two keys:',
    '',
    '  "reply" — one or two sentences to the therapist, saying what you changed, or answering her question. Plain prose.',
    `  "updatedSections" — the complete revised note as an object with exactly the keys ${quotedKeys(request.sections)}, or null.`,
    '',
    'Use null when she asked a question rather than for a change: answer it in "reply" and leave the note alone.',
    'When you do revise, return every section, not only the ones you changed, and carry the unchanged ones across verbatim.',
    'A section with no material stays the empty string "". The faithfulness rules above apply to every word you write here.',
  ].join('\n');

  const parts: string[] = ['The note as it currently stands:', '', request.noteText];

  if (request.history.length > 0) {
    parts.push(
      '',
      'Earlier in this conversation:',
      '',
      request.history.map((turn) => `${turn.role === 'user' ? 'Therapist' : 'You'}: ${turn.text}`).join('\n'),
    );
  }
  if ((request.refQuote ?? '').trim() !== '') {
    parts.push('', 'She highlighted this part of the note:', '', (request.refQuote ?? '').trim());
  }
  parts.push('', 'She says:', '', request.message.trim());
  parts.push(
    '',
    'Reply with a single JSON object with exactly the keys "reply" and "updatedSections", and nothing else.',
  );

  return { system, user: parts.join('\n') };
}

const DETECT_KIND_HINT: Record<DetectFormatRequest['kind'], string> = {
  template: 'The text below is a blank note template — headings with nothing filled in.',
  examples:
    'The text below is one or more completed notes. Find the section headings they share; ignore the clinical content.',
  manual: 'The text below is the therapist describing the sections she wants, in her own words.',
};

/**
 * `detectFormat` (M6 wires the UI). Deliberately narrow: it names sections,
 * it does not read clinical content, and the prompt says so — an example note
 * handed to this call is real patient material.
 */
export function buildDetectFormatPrompt(request: DetectFormatRequest): ChatPrompt {
  const system = [
    'You identify the structure of a clinical note format. You do not write, summarize, or comment on clinical content.',
    '',
    DETECT_KIND_HINT[request.kind],
    '',
    '## Output format',
    '',
    'Return one JSON object and nothing else, with exactly these keys:',
    '',
    '  "name" — a short name for this note format, in the therapist\'s own words if she gave one (for example "Progress note").',
    '  "sections" — the section headings, in the order they appear, as an array of strings.',
    '',
    'Use the headings exactly as written, minus any numbering or trailing colon.',
    'Do not invent a section that is not there, and do not merge two that are.',
    'Do not add any other key.',
  ].join('\n');

  const user = [
    request.text.trim(),
    '',
    'Reply with a single JSON object with exactly the keys "name" and "sections", and nothing else.',
  ].join('\n');

  return { system, user };
}

/**
 * A rough token count, used to refuse an over-long prompt rather than let
 * Ollama silently truncate it (which would drop the anti-fabrication rules and
 * keep the patient material). ~3.5 characters per token is the usual ratio for
 * English prose; it does not need to be exact, only conservative.
 */
export function approximateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

/** What the model produced, in the order the format defines. */
export function orderSections(sections: Sections, order: readonly string[]): Sections {
  const ordered: Sections = {};
  for (const name of order) ordered[name] = sections[name] ?? '';
  return ordered;
}
