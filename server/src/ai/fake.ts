import {
  MAX_BRIEF_LINES,
  MAX_SUMMARY_EXCERPTS,
  MAX_SUMMARY_POINTS,
  textToSections,
  type BriefComposition,
  type DetectedFormat,
  type NoteSummary,
  type PlanSuggestion,
  type RetractionCorrection,
  type Sections,
  type SuggestedGoal,
} from '@apunta/shared';

import { JsonStringStreamDecoder } from './json-stream.js';
import { orderSections } from './prompts.js';
import { applyRetractions, hasRetraction, retractionMarkerMatches } from './retractions.js';
import type {
  BrainstormRequest,
  ComposeBriefRequest,
  DetectFormatRequest,
  GenerateNoteRequest,
  LlmDescription,
  LlmEvent,
  LlmProvider,
  LlmResult,
  LlmStats,
  PriorNoteInput,
  RefineNoteRequest,
  SttDescription,
  SttEvent,
  SttProvider,
  SummariseNoteRequest,
  SuggestPlanGoalsRequest,
  TranscribeRequest,
} from './types.js';

/**
 * Deterministic providers, so the whole app runs and demos with no AI tooling
 * installed (`APUNTA_FAKE_AI=1`, CLAUDE.md hard rule 3) and CI stays hermetic.
 *
 * These live in production code, not in test helpers, because "demoable on any
 * machine" is a product requirement rather than a testing convenience.
 *
 * Everything they return is keyed only on their input — same input, same
 * output — and every sentence of it comes from the prototype's sample practice
 * (John Smith, Maria Ruiz), never from real material.
 *
 * The stream is produced by serializing the finished sections object and
 * feeding it through the *same* `JsonStringStreamDecoder` the Ollama provider
 * uses. That is deliberate: if the fake emitted a convenient event shape of
 * its own, every test and every Playwright run would be proving something
 * about a path that does not exist in production.
 */

/**
 * A small per-chunk delay, on by default.
 *
 * A deviation from the packet's "no delay", and a deliberate one. The capture
 * screen's whole point is a draft visibly taking shape; a fake that finishes
 * within one animation frame makes the streaming UI unobservable — untestable
 * in Playwright, and misleading in a demo, which is the thing fake mode exists
 * for. Content stays fully deterministic; only the pacing is affected. Unit
 * tests set it to 0.
 */
export const DEFAULT_FAKE_STREAM_DELAY_MS = 12;

export interface FakeLlmOptions {
  readonly streamDelayMs?: number;
}

/** The prototype's John Smith progress note (`prototype/patients.html`). */
const SLEEP_PROGRESS: Sections = {
  Subjective:
    'Patient reports improved sleep since last session and decreased frequency of intrusive thoughts.',
  Objective: 'Alert and engaged in session. The restlessness observed at previous sessions was not present.',
  Assessment: 'Continued progress on anxiety management goals; responding well to the current CBT approach.',
  Plan: 'Continue weekly sessions. Introduce grounding exercises for use between sessions.',
};

/**
 * Maria Ruiz's note. Its Objective is blank on purpose: the therapist
 * described no in-session observations, so the fake exercises the empty
 * section that the owner asked for rather than pretending every draft is full.
 */
const GRIEF_PROGRESS: Sections = {
  Subjective:
    "Patient reports a difficult week around the anniversary of her mother's death, with poor sleep and one missed day of work. She continues to attend her bereavement group.",
  Objective: '',
  Assessment: 'Grief processing progressing as expected at this stage.',
  Plan: 'Continue weekly supportive therapy. Patient intends to resume morning walks.',
};

/** The prototype's John Smith intake note. */
const ANXIETY_INTAKE: Sections = {
  'Presenting problem':
    'Patient presents with generalized anxiety symptoms over the past six months, including worry through most of the day, difficulty falling asleep, and chest tightness.',
  History: 'No prior therapy. Family history of anxiety. Not currently taking any medication.',
  Formulation:
    'Symptoms consistent with generalized anxiety disorder, likely precipitated by the recent work transition.',
  Plan: 'Begin weekly CBT-based sessions.',
};

const CANNED: readonly { readonly pattern: RegExp; readonly sections: Sections }[] = [
  { pattern: /intake|new patient|first session|presenting problem/i, sections: ANXIETY_INTAKE },
  { pattern: /grief|bereave|anniversary|mother('s)? death|passed away/i, sections: GRIEF_PROGRESS },
  { pattern: /sleep|intrusive|anxiet/i, sections: SLEEP_PROGRESS },
];

const FAKE_STATS: LlmStats = {
  model: 'fake-llm',
  promptTokens: 0,
  outputTokens: 0,
  evalNanos: 0,
  loadNanos: 0,
  doneReason: 'stop',
  attempts: 1,
};

/** The source text as one block, in the same order the prompt builder uses it. */
function sourceText(request: { typedNotes?: string | undefined; transcript?: string | undefined }): string {
  return [request.typedNotes ?? '', request.transcript ?? ''].join('\n').trim();
}

/** A first-section body for a format whose sections we have nothing canned for. */
function condense(source: string): string {
  const collapsed = source.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= 240) return collapsed;
  const cut = collapsed.slice(0, 240);
  const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  return stop > 80 ? cut.slice(0, stop + 1) : `${cut.trimEnd()}…`;
}

/**
 * Map a canned note onto whatever sections this format actually defines.
 * A section the canned note has nothing for stays empty — which is now the
 * correct output for a section with no material, not a gap.
 */
export function fakeSectionsFor(request: GenerateNoteRequest): Sections {
  const source = sourceText(request);
  const canned = CANNED.find((entry) => entry.pattern.test(source))?.sections ?? {};
  const byLowerName = new Map(Object.entries(canned).map(([name, body]) => [name.toLowerCase(), body]));

  const sections: Sections = {};
  request.sections.forEach((name, index) => {
    const match = byLowerName.get(name.toLowerCase());
    if (match !== undefined) sections[name] = match;
    else sections[name] = index === 0 ? condense(source) : '';
  });
  return sections;
}

/**
 * The fake's answer to the quoting call: the clause before each marker, back
 * to the previous sentence end or comma, and the clause after it. Enough to
 * exercise the server's checks and the notice, and deterministic on its input.
 */
export function fakeExtractRetractions(transcript: string): RetractionCorrection[] {
  const corrections: RetractionCorrection[] = [];
  for (const marker of retractionMarkerMatches(transcript)) {
    const before = transcript.slice(0, marker.index).replace(/[\s,.;:]+$/, '');
    const withdrawn =
      before
        .split(/[.!?,;:]\s*/)
        .pop()
        ?.trim() ?? '';
    const after = transcript.slice(marker.index + marker.text.length);
    const replacement = (/^[\s,.;:]*([^.!?]*)/.exec(after)?.[1] ?? '').trim();
    if (withdrawn !== '') corrections.push({ withdrawn, replacement });
  }
  return corrections;
}

/** JSON, split so each chunk ends after a word — what a token stream looks like. */
function wordChunks(text: string): string[] {
  return text.match(/[^ ]*[ ]|[^ ]+/g) ?? [text];
}

export class FakeLlmProvider implements LlmProvider {
  private readonly streamDelayMs: number;

  constructor(options: FakeLlmOptions = {}) {
    this.streamDelayMs = options.streamDelayMs ?? DEFAULT_FAKE_STREAM_DELAY_MS;
  }

  describe(): Promise<LlmDescription> {
    return Promise.resolve({
      reachable: true,
      model: 'fake-llm',
      modelPresent: true,
      weightsFormat: 'gguf',
    });
  }

  async *generateNote(request: GenerateNoteRequest): AsyncIterable<LlmEvent> {
    // The same pass the real provider runs, on the same server-side checks.
    let drafted = request;
    const transcript = request.transcript ?? '';
    if (hasRetraction(transcript)) {
      yield { type: 'status', stage: 'correcting', message: 'Applying your corrections…' };
      const corrections = fakeExtractRetractions(transcript);
      const outcome = applyRetractions(transcript, corrections);
      yield { type: 'retractions', applied: outcome.applied, offered: corrections.length };
      drafted = { ...request, transcript: outcome.text };
    }
    const sections = orderSections(fakeSectionsFor(drafted), request.sections);
    yield { type: 'status', stage: 'drafting', message: 'Drafting the note…' };
    yield* this.streamJson(JSON.stringify(sections));
    yield { type: 'sections', sections, stats: FAKE_STATS };
  }

  /** The prototype's canned refine logic, in the order `sendChat` applies it. */
  async *refineNote(request: RefineNoteRequest): AsyncIterable<LlmEvent> {
    const current = textToSections(request.noteText, request.sections);
    const { reply, updatedSections } = fakeRefine(
      request.message,
      current,
      request.sections,
      request.refQuote,
      request.priorNotes,
    );

    yield { type: 'status', stage: 'drafting', message: 'Thinking…' };
    yield* this.streamJson(JSON.stringify({ reply, updatedSections }));
    yield { type: 'refined', reply, updatedSections, stats: FAKE_STATS };
  }

  /** A brainstorm reply: one thought, grounded in what went in. */
  async *discussPatient(request: BrainstormRequest): AsyncIterable<LlmEvent> {
    const reply = fakeBrainstorm(request);

    yield { type: 'status', stage: 'drafting', message: 'Thinking…' };
    yield* this.streamJson(JSON.stringify({ reply }));
    yield { type: 'discussed', reply, stats: FAKE_STATS };
  }

  detectFormat(request: DetectFormatRequest): Promise<DetectedFormat> {
    return Promise.resolve(fakeDetectFormat(request));
  }

  summariseNote(request: SummariseNoteRequest): Promise<LlmResult<NoteSummary>> {
    return Promise.resolve({ value: fakeSummariseNote(request), stats: FAKE_STATS });
  }

  suggestPlanGoals(request: SuggestPlanGoalsRequest): Promise<LlmResult<PlanSuggestion>> {
    return Promise.resolve({ value: fakeSuggestPlanGoals(request), stats: FAKE_STATS });
  }

  composeBrief(request: ComposeBriefRequest): Promise<LlmResult<BriefComposition>> {
    return Promise.resolve({ value: fakeComposeBrief(request), stats: FAKE_STATS });
  }

  /** Stream a JSON document through the real decoder, word by word. */
  private async *streamJson(json: string): AsyncIterable<LlmEvent> {
    const decoder = new JsonStringStreamDecoder();
    for (const chunk of wordChunks(json)) {
      if (this.streamDelayMs > 0) await delay(this.streamDelayMs);
      for (const token of decoder.push(chunk)) {
        yield { type: 'token', section: token.key, text: token.text };
      }
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** One canned brainstorm thought, naming what went in so tests can see the grounding. */
export function fakeBrainstorm(request: BrainstormRequest): string {
  const count = request.notes.length;
  const basis = count === 0 ? 'no notes yet' : count === 1 ? 'the one note' : `the ${String(count)} notes`;
  return (
    `Thinking with ${basis} for ${request.patientName}: “${request.message}” is worth sitting with. ` +
    'What in the notes supports it, and what would need a session to find out? ' +
    'Say plainly when something is not in the notes rather than filling it in.'
  );
}

/** Split out so the canned behaviour is directly unit-testable. */
export function fakeRefine(
  message: string,
  current: Sections,
  sections: readonly string[],
  refQuote?: string | undefined,
  priorNotes: readonly PriorNoteInput[] = [],
): { reply: string; updatedSections: Sections | null } {
  const has = (name: string): boolean => sections.some((section) => section.toLowerCase() === name);
  const set = (name: string, body: string): Sections => {
    const next = { ...current };
    const key = sections.find((section) => section.toLowerCase() === name) ?? name;
    next[key] = body;
    return next;
  };

  // The failure the prior-note lock exists for, on demand: asked to fill a
  // gap, the model reaches into the background and copies from another
  // note. The route is expected to hold the section back, and CI proves it.
  const newest = priorNotes[0];
  if (/\bfill\b/i.test(message) && !message.includes('?') && newest !== undefined) {
    const target = sections.find((section) => (current[section] ?? '').trim() === '') ?? sections[0];
    const lifted = /^[^:\n]*:\s*([^\n]*)/.exec(newest.text)?.[1]?.trim() ?? newest.text.trim();
    if (target !== undefined && lifted !== '') {
      return {
        reply: `Filled in the ${target} section.`,
        updatedSections: { ...current, [target]: lifted },
      };
    }
  }
  // A question about another session is answered from the background, by
  // date, and touches nothing.
  if (message.includes('?') && newest !== undefined && /last|previous|before|compare|agree/i.test(message)) {
    return {
      reply: `The note from ${newest.date} (${newest.title}) is there as background; nothing from it has gone into this note.`,
      updatedSections: null,
    };
  }
  // Reproduces M10's live finding on demand: a tone request that tries to
  // inject the never-write list's own first example. The route's boilerplate
  // lock is expected to block it, and CI keeps proving that end to end.
  if (/clinical|formal/i.test(message)) {
    const key = sections.find((section) => section.toLowerCase() === 'objective');
    if (key !== undefined) {
      return {
        reply: 'Restyled the Objective section in a clinical register.',
        updatedSections: set('objective', `Alert and oriented. ${(current[key] ?? '').trim()}`.trim()),
      };
    }
  }
  if (/expand.*plan/i.test(message) && has('plan')) {
    const key = sections.find((section) => section.toLowerCase() === 'plan') as string;
    const body = (current[key] ?? '').trim();
    return {
      // Keep the complete existing plan and elaborate only by recombining its
      // own words. This deliberately makes fake mode exercise the same
      // semantic invariant as the real route: Expand must never discard a
      // dictated detail or invent an intervention from nowhere.
      reply: 'Expanded the Plan section using details already in the note.',
      updatedSections: set('plan', body === '' ? body : `${body} ${body}`),
    };
  }
  // Keep ordinary free-form shortening deterministic for existing callers;
  // "expand the plan" above is the path with the preservation invariant.
  if (/plan/i.test(message) && has('plan')) {
    return {
      reply: 'Shortened the Plan section.',
      updatedSections: set('plan', 'Continue weekly sessions and grounding exercises.'),
    };
  }
  // Reproduces the refine harness's 2026-09-01 finding on demand: asked to
  // shorten, the model keeps the first sentence of Subjective, prunes the rest
  // as something it "cannot source", and reports the deletion as a correction.
  // Whether that loses a fact depends on the note — which is exactly what the
  // route's fact lock decides, and CI keeps proving end to end.
  if (/shorter|shorten|concise|condense/i.test(message) && has('subjective')) {
    const key = sections.find((section) => section.toLowerCase() === 'subjective') as string;
    const body = (current[key] ?? '').trim();
    const first = /^[^.!?]*[.!?]/.exec(body)?.[0] ?? body;
    return {
      reply:
        'Shortened the Subjective section, removing detail that was not present in your original dictation.',
      updatedSections: set('subjective', first.trim()),
    };
  }
  if (/sleep|subjective/i.test(message) && has('subjective')) {
    const key = sections.find((section) => section.toLowerCase() === 'subjective') as string;
    const body = `${(current[key] ?? '').trim()} Also noted improved appetite this week.`.trim();
    return { reply: 'Added that to the Subjective section.', updatedSections: set('subjective', body) };
  }
  if (message.includes('?')) {
    return {
      reply:
        (refQuote ?? '').trim() === ''
          ? "Based on the note, that detail isn't currently in the note. Want me to add it?"
          : 'Based on the note, the section you highlighted covers that — let me know if you would like it expanded.',
      updatedSections: null,
    };
  }
  return { reply: 'Updated the note based on that.', updatedSections: { ...current } };
}

/** The prototype's SOAP progress note. */
const FAKE_SOAP = ['Subjective', 'Objective', 'Assessment', 'Plan'];

/** The prototype's intake note, whose keys `ANXIETY_INTAKE` above already uses. */
const FAKE_INTAKE = ['Presenting problem', 'History', 'Formulation', 'Plan'];

/**
 * Deterministic section detection.
 *
 * The packet specifies "SOAP for anything containing 'Subjective', else a
 * fixed intake shape", and that is exactly the **fallback** below. What runs
 * first is a heading scan over the extracted text, and the difference matters
 * for what the tests above it can prove: with the fallback alone, an extractor
 * that returned an empty string would still produce a plausible four-chip
 * answer, and every integration and Playwright assertion about "uploading a
 * template shows its sections" would pass against a pipeline that never read
 * the file. Scanning first means the chips on screen came out of the document.
 *
 * Both branches are pure functions of the input, so fake mode stays as
 * repeatable as CI needs (hard rule 3).
 */
export function fakeDetectFormat(request: DetectFormatRequest): DetectedFormat {
  const found: string[] = [];
  const seen = new Set<string>();
  const separators = request.kind === 'manual' ? /[\n,]/ : /\n/;

  for (const rawLine of request.text.split(separators)) {
    const line = rawLine.trim().replace(/^[-*\d.\s]+/, '');
    const heading = /^([A-Z][A-Za-z /'-]{2,40}):?\s*$/.exec(line)?.[1]?.trim();
    if (heading === undefined) continue;
    const key = heading.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    found.push(heading);
    if (found.length === 40) break;
  }

  const fallback = /subjective/i.test(request.text) ? FAKE_SOAP : FAKE_INTAKE;
  const sections = found.length > 0 ? found : fallback;
  const name = /intake|presenting problem/i.test(request.text) ? 'Intake note' : 'Progress note';
  return { name, sections };
}

/**
 * The STT fake: what `APUNTA_FAKE_AI=1` transcribes with.
 *
 * The transcript is fixed rather than derived from the audio (or, as the packet
 * suggested, from its filename — which is a UUID here, so it would derive
 * nothing). Determinism is the point: the canned dictation below is the one
 * `FakeLlmProvider` recognises as John Smith's sleep/anxiety note, so record →
 * transcribe → draft produces a real note end to end on a machine with no AI
 * tooling at all. Every word of it is the prototype's sample practice.
 */
export class FakeSttProvider implements SttProvider {
  describe(): Promise<SttDescription> {
    return Promise.resolve({
      binaryPresent: true,
      modelPresent: true,
      binary: 'fake-whisper',
      model: 'fake-whisper-model',
    });
  }

  async *transcribe(request: TranscribeRequest): AsyncIterable<SttEvent> {
    for (const fraction of [0.25, 0.5, 0.75, 1]) {
      yield { type: 'progress', fraction, message: 'Transcribing…' };
    }
    const vocabulary = request.vocabulary.length > 0 ? ` Discussed ${request.vocabulary[0] ?? ''}.` : '';
    yield {
      type: 'transcript',
      text: `Okay, John Smith today. He says he's sleeping a lot better since we changed the wind-down routine, and the intrusive thoughts are less frequent.${vocabulary} Keep going weekly, and I want to give him some grounding exercises he can use between sessions.`,
    };
  }
}

// --- M9: plan drafting and session prep, faked ---------------------------

/** The first sentence of a body, kept as a literal slice so it stays quotable. */
function firstSentence(body: string): string {
  const trimmed = body.trim();
  const stop = /[.!?](\s|$)/.exec(trimmed);
  return stop === null ? trimmed : trimmed.slice(0, stop.index + 1);
}

/**
 * Stage one, faked: a note reduced to points and excerpts.
 *
 * The excerpts are checked against the note here, exactly as the server checks
 * them: a fake that offered a paraphrase would sail past a verification the
 * real path would fail, and every test written against it would be proving
 * something about a path that does not exist.
 */
export function fakeSummariseNote(request: SummariseNoteRequest): NoteSummary {
  const sections = textToSections(request.noteText, request.sections);
  const bodies = request.sections.map((name) => (sections[name] ?? '').trim()).filter((body) => body !== '');

  const points = bodies.slice(0, MAX_SUMMARY_POINTS).map(firstSentence);
  const excerpts = points
    .filter((excerpt) => request.noteText.includes(excerpt))
    .slice(0, MAX_SUMMARY_EXCERPTS);

  return { points, excerpts };
}

/** The prototype practice's two stories, as goals a therapist would recognise. */
const FAKE_GOALS: readonly { readonly pattern: RegExp; readonly goal: Omit<SuggestedGoal, 'evidence'> }[] = [
  {
    pattern: /grief|bereave|anniversary|mother|passed away/i,
    goal: {
      statement: 'The client re-engages with the parts of life they withdrew from after the loss.',
      objectives: [
        {
          statement:
            'The client will take part in at least one planned social contact outside the household each week.',
          measure: 'their report at the start of each session',
          baseline: '',
        },
      ],
      interventions: ['Weekly supportive therapy', 'Behavioural activation planning in session'],
    },
  },
  {
    pattern: /meeting|deadline|manager|workload|work stress/i,
    goal: {
      statement: 'The client gets through a work week without the escalating worry described at intake.',
      objectives: [
        {
          statement: 'The client will use paced breathing before at least 2 work meetings a week.',
          measure: 'their report, tallied weekly',
          baseline: '',
        },
      ],
      interventions: ['Cognitive restructuring around work-related worry'],
    },
  },
  {
    pattern: /sleep|intrusive|anxiet|restless/i,
    goal: {
      statement: 'The client sleeps well enough to get through a workday without an afternoon crash.',
      objectives: [
        {
          statement: 'The client will report 6 or more hours of sleep on at least 5 of 7 nights.',
          measure: 'their weekly sleep log, reviewed in session',
          baseline: '',
        },
      ],
      interventions: ['CBT for insomnia', 'Grounding exercises rehearsed in session'],
    },
  },
];

/**
 * Stage two of plan drafting, faked.
 *
 * Every goal cites a real offered excerpt by index, and a goal already in the
 * plan is not proposed again — the two properties a second suggestion run has
 * to have for the "propose beside it, never over it" rule to mean anything.
 */
export function fakeSuggestPlanGoals(request: SuggestPlanGoalsRequest): PlanSuggestion {
  const already = new Set(request.existingGoals.map((goal) => goal.trim().toLowerCase()));
  const goals: SuggestedGoal[] = [];
  const used = new Set<string>();

  for (const note of request.notes) {
    if (note.excerpts.length === 0) continue;
    const haystack = note.excerpts.join(' ');
    const match = FAKE_GOALS.find((entry) => entry.pattern.test(haystack));
    if (!match) continue;
    if (used.has(match.goal.statement) || already.has(match.goal.statement.trim().toLowerCase())) continue;
    used.add(match.goal.statement);

    const baseline = note.excerpts[0] ?? '';
    goals.push({
      ...match.goal,
      objectives: match.goal.objectives.map((objective) => ({ ...objective, baseline })),
      evidence: [{ note: note.index, excerpt: 0 }],
    });
  }

  return { goals };
}

/** Stage two of prep, faked: one line per point, newest note first. */
export function fakeComposeBrief(request: ComposeBriefRequest): BriefComposition {
  const lines: BriefComposition['lines'] = [];
  for (const note of request.notes) {
    for (const point of note.points.slice(0, 2)) {
      if (lines.length === MAX_BRIEF_LINES) return { lines };
      lines.push({ note: note.index, text: point });
    }
  }
  return { lines };
}
