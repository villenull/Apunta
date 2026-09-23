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
import { renderClinicalKnowledgeGuide } from './clinical-knowledge/integration.js';
import { hasRetraction } from './retractions.js';
import type {
  BrainstormRequest,
  ComposeBriefRequest,
  DetectFormatRequest,
  GenerateNoteRequest,
  PriorNoteInput,
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

/** A final, source-first guard shared by generation and refine prompts. */
export const FAITHFULNESS_CLOSE =
  'Faithfulness close: local guidance changes wording and routing only, never content. Trace every sentence to the current source, note, or therapist message; unsupported or absent sections stay empty, and no diagnosis, causality, severity, risk, or intervention may be added.';

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
    "Do not add any other key. Do not use markdown, headings, or bullet characters — except the subheading line a section's local guidance asks for: a few words with the first letter capitalised, ending in a colon, alone on its own line.",
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

export const DRAFTING_PRIOR_NOTES_RULE =
  'The previous notes below are published notes from this patient, shown only as style and continuity examples. They are not evidence for today’s session. Do not copy any fact, name, number, finding, medication, risk statement, plan, mood, or sentence from them into today’s note unless the current source says it again.';

export const DRAFTING_PRIOR_NOTES_START =
  'PREVIOUS NOTES — STYLE AND CONTINUITY EXAMPLES ONLY. These published notes are not evidence for today’s session.';

export const DRAFTING_PRIOR_NOTES_END =
  'END OF PREVIOUS NOTES. Use only the current session source below as evidence for today’s note.';

export function draftingPriorNotesBlock(notes: readonly PriorNoteInput[]): string {
  return [
    DRAFTING_PRIOR_NOTES_START,
    ...notes.flatMap((note) => ['', priorNoteBlock(note)]),
    '',
    DRAFTING_PRIOR_NOTES_END,
  ].join('\n');
}

export function buildGeneratePrompt(request: GenerateNoteRequest): ChatPrompt {
  const priorNotes = request.priorNotes ?? [];
  const instructions = instructionsFor(request.instructions, request.formatName ?? '', request.sections);
  const clinicalGuidance =
    request.clinicalGuidance ?? renderClinicalKnowledgeGuide(request.formatName, request.sections);
  const system = [
    instructions.trimEnd(),
    '',
    outputFormatBlock(request.sections),
    ...(clinicalGuidance.trim() === '' ? [] : ['', clinicalGuidance.trim()]),
    ...(priorNotes.length === 0 ? [] : ['', DRAFTING_PRIOR_NOTES_RULE]),
    '',
    sourceGlossary(request),
    '',
    FAITHFULNESS_CLOSE,
  ].join('\n');

  const source = `${request.typedNotes ?? ''}\n${request.transcript ?? ''}`;
  const user = [
    ...(priorNotes.length === 0 ? [] : [draftingPriorNotesBlock(priorNotes), '']),
    ...sourceBlocks(request),
    ...retractionReminderFor(source),
    ...restatedFigureReminderFor(source),
    ...riskReviewReminderFor(source, request.sections),
    tailReminder(request.sections),
  ].join('\n\n');
  return { system, user };
}

/**
 * The retraction rule, restated in the user turn — but only when the source
 * shows a retraction.
 *
 * The instructions already say a retracted version leaves no trace, and the
 * worked example shows one. On this model that was not enough: a live
 * dictation on 2026-09-04 ("four out of seven... scratch that, two out of
 * seven") came back as "four out of seven, though he corrects this to two"
 * — both numbers kept, and the correction pinned on the patient. The refine
 * path learned the same lesson twice over: a rule in the system block loses
 * to the source text under it, and the same rule beside the source wins.
 *
 * Measured on the corpus (2026-09-05, 3 runs each): put beside every source,
 * the sentence cleared the retraction fixture and, on a fixture with no
 * retraction in it, made the model open with an "anxiety" the source never
 * mentions — a longer prompt sends the decoder down a different path, and
 * that is the whole of it. So the sentence appears only when the source
 * contains a retraction, and every other source gets the prompt it had
 * before, byte for byte.
 */
export const RETRACTION_REMINDER =
  'Where she takes something back as she speaks — "scratch that", "actually no", "that was last session" — the note carries only what replaced it. The earlier version does not appear, and the note never says that anyone corrected anything.';

export function retractionReminderFor(source: string): string[] {
  return hasRetraction(source) ? [RETRACTION_REMINDER] : [];
}

/**
 * The restated-figure rule, restated in the user turn — only when the source
 * gives an earlier figure without saying which way it moved.
 *
 * "Four was back in February" came back as "down from four in February"
 * (2026-09-06): the source states a past figure and no direction, and the
 * model supplied one. The direction it supplies is not reliably the right
 * one, and a note that says the opposite of what happened is worse than one
 * that says less.
 *
 * The detector is deliberately narrow — a quantity, a past-time marker, and
 * no direction word anywhere in the source — because a reminder that fires
 * on a source which *does* state a direction would suppress a comparison she
 * actually made.
 */
const RESTATED_QUANTITY = /\b(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|couple|few|several)\b/i;

const RESTATED_PAST_MARKER =
  /\b(?:was|were|used to|back (?:in|at|when)|previously|last (?:month|year|week|session|time|term)|in (?:january|february|march|april|may|june|july|august|september|october|november|december))\b/i;

const RESTATED_DIRECTION =
  /\b(?:up|down|more|less|fewer|increas\w*|decreas\w*|reduc\w*|rose|risen|fell|fallen|drop\w*|improv\w*|worsen\w*|better|worse|higher|lower|gain\w*|lost|gain|losing|cut (?:back|down)|quit)\b/i;

export function hasRestatedFigure(source: string): boolean {
  return (
    RESTATED_QUANTITY.test(source) && RESTATED_PAST_MARKER.test(source) && !RESTATED_DIRECTION.test(source)
  );
}

export const RESTATED_FIGURE_REMINDER =
  'She gave an earlier figure without saying which way it moved. Write the figures she gave and nothing about the direction: no "up from", "down from", "better since" or any other comparison she did not make. If she did not say the change went one way, the note does not say it either.';

export function restatedFigureReminderFor(source: string): string[] {
  return hasRestatedFigure(source) ? [RESTATED_FIGURE_REMINDER] : [];
}

/**
 * The risk-review rule, restated in the user turn — only when the source shows
 * a review she carried out.
 *
 * Two measured failures, one rule. Both were on the "safety facts" measure,
 * which is the one number in the eval that is about the record being
 * clinically complete rather than merely faithful:
 *
 * - **Her format**: "I asked about risk, she denied any thoughts of self harm"
 *   came back as `"Risk review": "None."` — a review she carried out replaced
 *   by the word for a review that never happened, which is a record saying the
 *   opposite of what occurred. Seen 5/5 on the owner-format corpus, and the
 *   reason `check:format` grew that flag in the first place.
 * - **A four-section intake**: the same review came back nowhere at all. The
 *   intake instructions' section list never mentions risk, so it had no home
 *   and the "nothing dictated should disappear" rule lost to that.
 *
 * The sentence differs by whether the format has a section for risk, because
 * the two failures need opposite instructions: with a section, the danger is
 * the default word; without one, the danger is silence.
 */
const RISK_TERM = /\b(?:self[-\s]?harm|suicid\w*|homicid\w*|hurt(?:ing)?|risk|safety plan|SI|HI)\b/i;
const RISK_REVIEW_VERB = /\b(?:denie[sd]|denies|asked|no (?:thoughts|history|plan|intent)|said no)\b/i;
const RISK_SECTION = /^(?:risk|risk review|risk assessment|safety|safety review)$/i;

export const RISK_REVIEW_REMINDER =
  'She asked about risk in this session. The risk section carries what she asked and what the client said, in her words: history first if she named any, then today. "None." belongs only to a session where she said nothing about risk at all, and it never stands in for a review she carried out.';

export const RISK_CONTENT_REMINDER =
  'She asked about risk in this session and the answer is in the dictation. This format has no section for risk, so it goes in the section it fits best; it never disappears from the note.';

export function riskReviewReminderFor(source: string, sections: readonly string[]): string[] {
  if (!RISK_TERM.test(source) || !RISK_REVIEW_VERB.test(source)) return [];
  return sections.some((section) => RISK_SECTION.test(section.trim()))
    ? [RISK_REVIEW_REMINDER]
    : [RISK_CONTENT_REMINDER];
}

/**
 * The quoting call that runs before a draft when the transcript has a spoken
 * retraction in it (`retractions.ts`). The model quotes; the server decides
 * what to cut.
 *
 * Measured on seven live dictations with the provider's own decoding. Without
 * the examples the model quoted the retracted claim on four of them and, on
 * the others, quoted the *replacement* as the thing withdrawn or the marker
 * itself; with one example (a corrected number) it quoted tight spans but lost
 * the withdrawn-statement case ("…scratch that, that was last session"). With
 * one example of each kind it found all seven, quoting the number rather than
 * the sentence around it. It still lists things she never took back — the
 * homework, the aside — every time; that is what the server's checks are for,
 * and an example cannot leak into a note because only a verbatim quote is
 * ever cut.
 */
export function buildExtractRetractionsPrompt(transcript: string): ChatPrompt {
  const system = [
    'A therapist dictated her session notes. As she spoke she sometimes took something back, with phrases like "scratch that", "actually no", "no wait", "hold on", "that was last session" or "start over". List every such correction. For each one, quote the exact words she took back — the statement the correction replaces, copied verbatim from the dictation, usually just before the phrase — and the exact words that replaced it, also verbatim, or an empty string if she simply withdrew it. Quote; never paraphrase. If she took nothing back, return an empty list.',
    '',
    'Example dictation: "She has been to the gym twice this week, no wait, three times. Her sister visited on Sunday. She said the move is going badly, scratch that, that was her brother."',
    'Example answer: {"corrections": [{"withdrawn": "twice this week", "replacement": "three times"}, {"withdrawn": "the move is going badly", "replacement": ""}]}',
    '',
    '## Output format',
    '',
    'Reply with a single JSON object of the form {"corrections": [{"withdrawn": "...", "replacement": "..."}]} and nothing else.',
  ].join('\n');
  return { system, user: transcript };
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
  const priorNotes = request.priorNotes ?? [];
  const instructions = instructionsFor(request.instructions, request.formatName ?? '', request.sections);
  const clinicalGuidance =
    request.clinicalGuidance ?? renderClinicalKnowledgeGuide(request.formatName, request.sections);
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
    'A question about the note — what is missing from it, what a section says, why one is empty — is answered and nothing else. Return "updatedSections": null even when you can see something you would change, and offer that change in words instead. She asked what is there, not for it to be different.',
    'Her message is source material. When she tells you something about the session — a fact, an observation, the wording she wants — it is hers, and it goes into the note as if she had typed it there herself. The rules above bar what neither the note nor her message gives you; they never bar her own words back to her.',
    'When you do revise, return every section, not only the ones you changed, and carry the unchanged ones across verbatim.',
    'Moving something is two edits, not one: it leaves the section it was in and appears in the section she named. Carrying sections across verbatim covers only the sections her request does not touch — a request to move, replace or delete is asking you to touch two of them.',
    'A section with no material stays the empty string "". The faithfulness rules above apply to every word you write here.',
    '',
    'A request about tone or register ("more clinical", "more formal") changes wording only. It is never permission to add an observation, a finding, or a stock clinical phrase the note does not already contain: rewriting "engaged, made eye contact" in a more clinical register still describes exactly engagement and eye contact, nothing more.',
    'A request to expand a section may only surface material already in the note, the source, or this conversation. If her request cannot be met without adding something the rules above forbid, change what can be changed, and say what you left alone and why in "reply".',
    ...(priorNotes.length === 0 ? [] : ['', REFINE_BACKGROUND_RULE]),
    ...(clinicalGuidance.trim() === '' ? [] : ['', clinicalGuidance.trim()]),
    '',
    FAITHFULNESS_CLOSE,
  ].join('\n');

  // Before the note, not after: the note and her request stay nearest the
  // answer, and the background — unchanged from turn to turn while the note
  // is edited — is a prefix Ollama can reuse.
  const parts: string[] =
    priorNotes.length === 0 ? [] : [refineBackgroundBlock(priorNotes, request.noteDate), ''];
  parts.push('The note as it currently stands:', '', request.noteText);

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
    // Repeated here, beside her request, because the system prompt alone
    // demonstrably loses to a tone request on a small model (found live in
    // M10's human pass). Class names only — a quoted example phrase becomes
    // primed vocabulary the moment "clinical" is requested. And stated in
    // both directions, because the first wording of this rule taught the
    // model to delete her sleep numbers as "a measurement".
    'Whatever she asked for, this revision may not add observations, findings, or clinical phrasing that neither the note above nor her message gives you, and may not drop anything she did not ask to have removed. A tone or register request restyles her words, adding nothing and losing nothing. If part of the request would need clinical content from neither of those places, leave that part undone and say so in "reply".',
    'What she states in her message is hers and goes in, even wording the rules above would refuse from anywhere else: she is the clinician writing her own note, and this is her telling you what it says.',
    'If her message only asks about the note rather than asking for a change, answer it and return "updatedSections": null.',
    ...(priorNotes.length === 0 ? [] : [REFINE_BACKGROUND_REMINDER]),
    '',
    'Reply with a single JSON object with exactly the keys "reply" and "updatedSections", and nothing else.',
  );

  return { system, user: parts.join('\n') };
}

/**
 * The refine chat's background (2026-09-21): her other notes on this patient,
 * so she can ask how this session compares with the last. Faithfulness-
 * critical — the refine call edits a clinical record, and fabrication is its
 * first failure — so the background is fenced, labelled read-only at both
 * ends, stated in the system block, and restated beside her message, where a
 * rule survives on this model and a rule in the system block alone does not
 * (the tone lesson of M10). The server's prior-note lock
 * (`prior-note-guard.ts`) stands behind all of it.
 *
 * Every one of these strings appears only when there is background to fence:
 * with none, the refine prompt is byte for byte what it was before.
 */
export const REFINE_BACKGROUND_RULE =
  'Her other notes on this patient may appear before the note, fenced as BACKGROUND. They are read-only: a record of other sessions, not part of the note you are revising. Use them to answer her questions about other sessions — what changed, what was agreed — and say which note, by date, an answer comes from. Nothing from them goes into this note — not a fact, a name, a number, a finding or a sentence — unless her message asks you to bring that specific thing over. A section with nothing from this session stays empty even when an earlier note has something that would fill it.';

export const REFINE_BACKGROUND_START =
  'BACKGROUND — READ ONLY. Her other notes on this patient, newest first. They are not the note you are revising, and nothing in them goes into it unless she asks for that exact thing.';

export const REFINE_BACKGROUND_END = 'END OF BACKGROUND. Everything above this line is read-only.';

export const REFINE_BACKGROUND_REMINDER =
  'The BACKGROUND notes are read-only: this revision takes nothing from them — no fact, name, number or sentence — unless her message asks you to bring that thing over. Answer a question about another session in "reply", saying which note it comes from.';

export function refineBackgroundBlock(notes: readonly PriorNoteInput[], noteDate?: string): string {
  return [
    REFINE_BACKGROUND_START,
    ...(noteDate === undefined ? [] : [`The note you are revising is dated ${noteDate}.`]),
    ...notes.flatMap((note) => ['', priorNoteBlock(note)]),
    '',
    REFINE_BACKGROUND_END,
  ].join('\n');
}

/**
 * What the background costs apart from the notes in it — every fenced string
 * above, estimated as the route budgets. Each note adds `priorNoteTokens`.
 */
export function refineBackgroundOverheadTokens(noteDate?: string): number {
  return (
    approximateTokens(REFINE_BACKGROUND_RULE) +
    approximateTokens(refineBackgroundBlock([], noteDate)) +
    approximateTokens(REFINE_BACKGROUND_REMINDER) +
    8
  );
}

/**
 * One of the patient's notes as a prompt shows it — Brainstorm's context and
 * the refine chat's background — and as `prior-notes.ts` budgets it. A single
 * renderer for all three, so the budget never drifts from the prompt.
 */
export function priorNoteBlock(note: { title: string; date: string; text: string }): string {
  return [`### ${note.title} (${note.date})`, '', note.text].join('\n');
}

/**
 * `discussPatient` (M12): freeform thinking with the therapist about one
 * patient, with that patient's recent notes as context.
 *
 * The faithfulness stance is the whole prompt, not a line in it: the model is
 * told to keep what the notes say apart from general clinical ideas, and to
 * say plainly when something is not in the notes rather than invent history.
 * It is also told what this conversation is not — no diagnosis, and nothing
 * that reads as a record entry — because a thinking aid that drafts the
 * record unasked is the failure being designed against. The tail restates the
 * contract beside her message, where it survives a head truncation.
 */
export function buildBrainstormPrompt(request: BrainstormRequest): ChatPrompt {
  const system = [
    `You are thinking with a psychotherapist about one of her patients, ${request.patientName}. This is a private working conversation, not a clinical record: nothing said here is filed anywhere, and you never write anything that reads as a record entry — no note, no plan, no summary for filing.`,
    '',
    'Her notes on this patient, newest first, follow below. Keep two things apart: what those notes actually say, and general clinical ideas. When you draw on an idea that is not in the notes, say so.',
    '',
    'When she asks about something the notes do not cover, say plainly that it is not in the notes rather than filling it in. Never invent session history, observations, or facts about this patient. You do not diagnose.',
    '',
    '## Output format',
    '',
    'Return one JSON object and nothing else, with exactly this key:',
    '',
    '  "reply" — your reply to the therapist, in plain prose. Markdown is welcome (short headings, bold, lists); nothing else is read.',
    '',
    'Do not add any other key.',
  ].join('\n');

  const omitted = request.omittedNotes ?? 0;
  const parts: string[] = [
    request.notes.length > 0
      ? 'The notes as they currently stand, newest first:'
      : omitted > 0
        ? `None of her notes on ${request.patientName} fit here. Think only from what she tells you in this conversation, and say so when you have nothing to stand on.`
        : `There are no notes for ${request.patientName} yet. Think only from what she tells you in this conversation, and say so when you have nothing to stand on.`,
  ];
  for (const note of request.notes) {
    parts.push('', priorNoteBlock(note));
  }
  if (request.notes.length > 0 && omitted > 0) {
    parts.push('', omittedNotesLine(request.notes.length, omitted));
  }

  if (request.history.length > 0) {
    parts.push(
      '',
      'Earlier in this conversation:',
      '',
      request.history.map((turn) => `${turn.role === 'user' ? 'Therapist' : 'You'}: ${turn.text}`).join('\n'),
    );
  }
  parts.push('', 'She says:', '', request.message.trim());
  parts.push(
    '',
    'Whatever she asked for, keep what the notes above say apart from general clinical ideas, and say plainly when something is not in them rather than inventing it.',
    '',
    'Reply with a single JSON object with exactly the key "reply", and nothing else.',
  );

  return { system, user: parts.join('\n') };
}

/**
 * Said when older notes did not fit: without it, "that is not in the notes"
 * reads as "that never happened", and the note that says otherwise may simply
 * be one the model was never shown.
 */
export function omittedNotesLine(shown: number, omitted: number): string {
  return `Only ${String(shown)} of her ${String(shown + omitted)} notes on this patient fit here; the older ones are not shown. When something is not in these notes, say it is not in the notes you were given — it may be in an older one.`;
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
