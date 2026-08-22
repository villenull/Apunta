import { textToSections, type DetectedFormat, type Sections } from '@apunta/shared';

import { JsonStringStreamDecoder } from './json-stream.js';
import { orderSections } from './prompts.js';
import type {
  DetectFormatRequest,
  GenerateNoteRequest,
  LlmDescription,
  LlmEvent,
  LlmProvider,
  LlmStats,
  RefineNoteRequest,
  SttEvent,
  SttProvider,
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
    const sections = orderSections(fakeSectionsFor(request), request.sections);
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
    );

    yield { type: 'status', stage: 'drafting', message: 'Thinking…' };
    yield* this.streamJson(JSON.stringify({ reply, updatedSections }));
    yield { type: 'refined', reply, updatedSections, stats: FAKE_STATS };
  }

  detectFormat(request: DetectFormatRequest): Promise<DetectedFormat> {
    return Promise.resolve(fakeDetectFormat(request));
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

/** Split out so the canned behaviour is directly unit-testable. */
export function fakeRefine(
  message: string,
  current: Sections,
  sections: readonly string[],
  refQuote?: string | undefined,
): { reply: string; updatedSections: Sections | null } {
  const has = (name: string): boolean => sections.some((section) => section.toLowerCase() === name);
  const set = (name: string, body: string): Sections => {
    const next = { ...current };
    const key = sections.find((section) => section.toLowerCase() === name) ?? name;
    next[key] = body;
    return next;
  };

  if (/plan/i.test(message) && has('plan')) {
    return {
      reply: 'Shortened the Plan section.',
      updatedSections: set('plan', 'Continue weekly sessions and grounding exercises.'),
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

/**
 * Deterministic section detection: pick out anything that looks like a
 * heading, and fall back to the prototype's SOAP format when nothing does.
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

  const sections = found.length > 0 ? found : ['Subjective', 'Objective', 'Assessment', 'Plan'];
  const name = /intake/i.test(request.text) ? 'Intake note' : 'Progress note';
  return { name, sections };
}

/**
 * The STT fake. Real whisper.cpp is M5; this exists now so the interface is
 * defined and `APUNTA_FAKE_AI=1` covers the whole app rather than half of it.
 */
export class FakeSttProvider implements SttProvider {
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
