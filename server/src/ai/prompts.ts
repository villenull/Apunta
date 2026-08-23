import {
  approximateTokens,
  MAX_BRIEF_LINES,
  MAX_SUGGESTED_EVIDENCE,
  MAX_SUGGESTED_GOALS,
  MAX_SUGGESTED_INTERVENTIONS,
  MAX_SUGGESTED_OBJECTIVES,
  MAX_SUMMARY_EXCERPTS,
  MAX_SUMMARY_POINTS,
  type Sections,
} from '@apunta/shared';

import { instructionsFor } from './default-instructions.js';
import type {
  ComposeBriefRequest,
  DetectFormatRequest,
  GenerateNoteRequest,
  RefineNoteRequest,
  SuggestPlanGoalsRequest,
} from './types.js';

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
 * Re-exported rather than defined here: M6's Instructions panel shows the same
 * estimate in the browser beside its textarea, so the ratio moved to
 * `shared/src/common.ts` to keep the meter and this refusal threshold one
 * number. Every existing importer keeps importing it from here.
 */
export { approximateTokens };

/** What the model produced, in the order the format defines. */
export function orderSections(sections: Sections, order: readonly string[]): Sections {
  const ordered: Sections = {};
  for (const name of order) ordered[name] = sections[name] ?? '';
  return ordered;
}

/**
 * Stage one of both M9 paths: one note, reduced to points and verbatim
 * excerpts.
 *
 * The excerpts are the load-bearing part. They are what a proposed goal will
 * be shown standing on, and the server verifies each one is a literal
 * substring of the note before it is offered — so the instruction to copy
 * rather than paraphrase is not politeness, it is the difference between a
 * citation that survives verification and one that is silently discarded.
 *
 * Deliberately narrow: this call reduces, it does not interpret. Owner answer
 * 7 — "if I didn't say what I made of it, the note shouldn't either" — governs
 * anything derived from her notes, not only the notes themselves.
 */
export function buildSummariseNotePrompt(request: {
  noteText: string;
  sections: readonly string[];
}): ChatPrompt {
  const system = [
    'You reduce one clinical note to a small structured summary, so that a later step can read several notes without exceeding its context.',
    'You do not interpret the note, add to it, or draw a conclusion it does not state.',
    '',
    '## Output format',
    '',
    'Return one JSON object and nothing else, with exactly these keys:',
    '',
    `  "points" — up to ${String(MAX_SUMMARY_POINTS)} short lines, each one thing the note records. Plain prose, no bullet characters.`,
    `  "excerpts" — up to ${String(MAX_SUMMARY_EXCERPTS)} short passages copied from the note character for character.`,
    '',
    'Copy an excerpt exactly as it appears, including its wording and punctuation. Do not paraphrase, tidy, or join two passages: a passage that is not a literal copy of the note is discarded.',
    'Choose excerpts that carry something concrete — what the patient reported, what was agreed, a number, a change.',
    'Every point must be supported by the note. Do not add an impression, a formulation, or a recommendation the note does not contain.',
    'If the note holds nothing usable, return two empty arrays.',
  ].join('\n');

  const user = [
    'The note:',
    '',
    request.noteText.trim(),
    '',
    'Reply with a single JSON object with exactly the keys "points" and "excerpts", and nothing else.',
  ].join('\n');

  return { system, user };
}

/**
 * The rules a measurable objective has to satisfy, and the near-misses that
 * look right and are not.
 *
 * From `docs/research/m9-plan-requirements-2026-08.md` §6, which draws them
 * from the payer and accreditor documents. "Measurable" is the most-failed
 * requirement in the field — the Joint Commission standard ran a 61.69%
 * noncompliance rate — and it is a shape a model imitates rather than a rule
 * it applies, so the near-misses are here for the same reason the good
 * examples are.
 */
const OBJECTIVE_RULES = [
  '## What makes an objective measurable',
  '',
  '1. The subject is the client and the verb is observable. If the therapist is the subject, it is an intervention, not an objective.',
  '2. It carries a number — a count, a frequency, a duration, or a rating the client gives.',
  '3. It names where the number comes from: "his sleep log", "count of completed thought records", "her report at the start of session".',
  '4. It states the baseline where the notes give one.',
  "5. It uses the client's own words where they exist, in clinical register.",
  '6. It never contains "as clinically indicated", "as needed", "continue to", "work on", "explore", "process", or "improve".',
  '',
  'Objectives that work:',
  '  "John will report 6 or more hours of sleep on at least 5 of 7 nights, for 3 consecutive weeks." Measure: his weekly sleep log. Baseline: 4 hours most nights at intake.',
  '  "Maria will take part in at least one planned social contact outside her household each week." Measure: her report at the start of each session. Baseline: most Sundays spent in bed through July.',
  '',
  'Near-misses, and what is wrong with each:',
  '  "John will sleep better." — no number and no measure. That is the goal, offered as an objective.',
  '  "John will reduce intrusive thoughts." — direction without magnitude; nothing separates met from unmet.',
  '  "John will continue CBT for insomnia." — the therapist is the actor. That belongs in the interventions.',
  '  "Maria will attend weekly sessions." — attendance is a condition of treatment, not an objective.',
  '  "Maria will reduce grief symptoms by 50%." — a percentage with no instrument behind it. It looks defensible until someone asks.',
].join('\n');

/**
 * Stage two of plan drafting.
 *
 * Three things are structural rather than instructed, and the prompt only
 * restates them because the schema is invisible to the model:
 *
 * - **The diagnosis is input.** It is given here so goals are drafted toward
 *   it, which is the requirement being drafted for. The model has nowhere to
 *   write one back.
 * - **Citations are indices** into the excerpts offered below, which the
 *   server verified against the notes. A goal that cites nothing resolvable is
 *   dropped rather than shown.
 * - **Targets are blank.** A note can supply a baseline; it cannot supply a
 *   target, because she never said one. There is no field for it.
 */
export function buildSuggestPlanPrompt(request: SuggestPlanGoalsRequest): ChatPrompt {
  const system = [
    'You draft candidate treatment-plan goals for a therapist to review. Everything you write is a suggestion she will accept, edit or discard — nothing you produce goes into her plan on its own.',
    '',
    OBJECTIVE_RULES,
    '',
    '## What you may and may not draw on',
    '',
    "Work only from the excerpts below. They are quoted from the therapist's own notes.",
    'The diagnosis is given to you. It is hers. Do not restate it, question it, add to it, or infer one — you have nowhere to write one and a diagnosis from you would be worthless to her.',
    'Do not invent a target number or a target date. The notes can tell you where the client started; they cannot tell you where he should end up, and that is hers to set.',
    'Every goal you propose must cite at least one excerpt. If you cannot cite one, do not propose the goal.',
    '',
    '## Output format',
    '',
    'Return one JSON object and nothing else, with exactly this key:',
    '',
    `  "goals" — up to ${String(MAX_SUGGESTED_GOALS)} objects, each with:`,
    '      "statement" — the goal, which may be broad. One sentence about the client.',
    `      "objectives" — up to ${String(MAX_SUGGESTED_OBJECTIVES)} objects, each with "statement", "measure" and "baseline". Leave "baseline" as "" unless an excerpt gives you one.`,
    `      "interventions" — up to ${String(MAX_SUGGESTED_INTERVENTIONS)} short strings naming what the therapist does, including the modality.`,
    `      "evidence" — up to ${String(MAX_SUGGESTED_EVIDENCE)} objects, each { "note": <note number>, "excerpt": <excerpt number> }, pointing at the excerpts this goal came from.`,
    '',
    'Do not add any other key. Do not use markdown or bullet characters.',
  ].join('\n');

  const parts: string[] = [];
  parts.push(
    request.diagnoses.length === 0
      ? 'Diagnosis: not recorded. Draft goals from the material below without naming or implying a diagnosis.'
      : `Diagnosis, entered by the therapist: ${request.diagnoses.join('; ')}`,
  );
  if (request.modality.trim() !== '') parts.push(`Service modality: ${request.modality.trim()}`);
  if (request.frequency.trim() !== '') parts.push(`Service frequency: ${request.frequency.trim()}`);

  if (request.existingGoals.length > 0) {
    parts.push(
      '',
      'Goals already in her plan. Do not restate, revise or replace these — propose only what is missing:',
      ...request.existingGoals.map((goal) => `  - ${goal}`),
    );
  }

  parts.push('', 'Excerpts from her recent notes, numbered:');
  for (const note of request.notes) {
    parts.push('', `Note ${String(note.index)} — ${note.date}`);
    note.excerpts.forEach((excerpt, position) => {
      parts.push(`  [${String(position)}] "${excerpt}"`);
    });
  }

  parts.push(
    '',
    'Reply with a single JSON object with exactly the key "goals", and nothing else. Cite every goal.',
  );

  return { system, user: parts.join('\n') };
}

/**
 * Stage two of session prep.
 *
 * **The plan is not in this prompt, and must never be.** The owner declined
 * having the app draw connections between her plan and her notes, and that
 * covers prep as well as drafting (M9 §"No goal tracking"). Keeping the goals
 * out of the call is what makes the prohibition structural rather than a rule
 * the model could be talked out of: it cannot relate a goal to a note it was
 * never shown. Prep presents the notes; the screen puts the plan beside them;
 * she does the connecting.
 */
export function buildComposeBriefPrompt(request: ComposeBriefRequest): ChatPrompt {
  const system = [
    'You prepare a short reading brief for a therapist who is about to walk into a session. It is a reminder of what her recent notes say, not an assessment.',
    '',
    '## What the brief is',
    '',
    'Each line restates one thing from one note, in her own clinical register, so she can scan it in twenty seconds.',
    'Do not say whether treatment is working, whether anything is improving, or what should happen next.',
    'Do not add anything the notes do not say. If two notes cover the same ground, keep the more recent one.',
    'Put the most recent material first.',
    '',
    '## Output format',
    '',
    'Return one JSON object and nothing else, with exactly this key:',
    '',
    `  "lines" — up to ${String(MAX_BRIEF_LINES)} objects, each { "note": <the number of the note it came from>, "text": <one sentence> }.`,
    '',
    'Every line comes from exactly one note, and "note" must be that note\'s number. Do not merge two notes into one line.',
    'Do not add any other key. Do not use markdown or bullet characters.',
  ].join('\n');

  const parts: string[] = ['Her recent notes, newest first, reduced to points:'];
  for (const note of request.notes) {
    parts.push('', `Note ${String(note.index)} — ${note.date} — ${note.title}`);
    for (const point of note.points) parts.push(`  - ${point}`);
  }
  parts.push(
    '',
    'Reply with a single JSON object with exactly the key "lines", and nothing else. Every line names the note it came from.',
  );

  return { system, user: parts.join('\n') };
}
