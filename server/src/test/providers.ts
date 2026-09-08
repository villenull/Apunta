import type { BriefComposition, DetectedFormat, NoteSummary, PlanSuggestion, Sections } from '@apunta/shared';

import { FakeLlmProvider, FakeSttProvider } from '../ai/fake.js';
import type {
  AiProviders,
  ComposeBriefRequest,
  DetectFormatRequest,
  GenerateNoteRequest,
  LlmDescription,
  LlmEvent,
  LlmProvider,
  LlmResult,
  LlmStats,
  RefineNoteRequest,
  SummariseNoteRequest,
  SuggestPlanGoalsRequest,
} from '../ai/types.js';

/**
 * A provider that remembers what it was asked, and can be told what to answer.
 *
 * M9's endpoints make several model calls per request — one per note, then one
 * that composes — and the properties that matter are about the *calls*: that
 * each note went out on its own, that the briefing call never saw the plan,
 * that a goal citing nothing is dropped. None of that is visible in the
 * response alone, so the suites drive this instead of the plain fake.
 *
 * Everything it does not override is the real fake, so a test that does not
 * care gets the same behaviour production does in `APUNTA_FAKE_AI=1`.
 */
export interface ProviderStubs {
  summariseNote?: (request: SummariseNoteRequest) => NoteSummary;
  suggestPlanGoals?: (request: SuggestPlanGoalsRequest) => PlanSuggestion;
  composeBrief?: (request: ComposeBriefRequest) => BriefComposition;
}

const STATS: LlmStats = {
  model: 'recording-llm',
  promptTokens: 900,
  outputTokens: 120,
  evalNanos: 1,
  loadNanos: 0,
  doneReason: 'stop',
  attempts: 1,
};

export class RecordingLlmProvider implements LlmProvider {
  readonly summarised: SummariseNoteRequest[] = [];
  readonly suggestions: SuggestPlanGoalsRequest[] = [];
  readonly compositions: ComposeBriefRequest[] = [];
  /** M6: what a format's saved `instructions` turn into on a drafting call. */
  readonly drafts: GenerateNoteRequest[] = [];
  /** M6: what the detect endpoint actually handed the model. */
  readonly detections: DetectFormatRequest[] = [];
  /** Refine calls carry the same section-scoped guidance as first drafts. */
  readonly refines: RefineNoteRequest[] = [];

  private readonly inner = new FakeLlmProvider({ streamDelayMs: 0 });

  constructor(private readonly stubs: ProviderStubs = {}) {}

  generateNote(request: GenerateNoteRequest): AsyncIterable<LlmEvent> {
    this.drafts.push(request);
    return this.inner.generateNote(request);
  }

  refineNote(request: RefineNoteRequest): AsyncIterable<LlmEvent> {
    this.refines.push(request);
    return this.inner.refineNote(request);
  }

  detectFormat(request: DetectFormatRequest): Promise<DetectedFormat> {
    this.detections.push(request);
    return this.inner.detectFormat(request);
  }

  async summariseNote(request: SummariseNoteRequest): Promise<LlmResult<NoteSummary>> {
    this.summarised.push(request);
    if (this.stubs.summariseNote) {
      return { value: this.stubs.summariseNote(request), stats: STATS };
    }
    return this.inner.summariseNote(request);
  }

  async suggestPlanGoals(request: SuggestPlanGoalsRequest): Promise<LlmResult<PlanSuggestion>> {
    this.suggestions.push(request);
    if (this.stubs.suggestPlanGoals) {
      return { value: this.stubs.suggestPlanGoals(request), stats: STATS };
    }
    return this.inner.suggestPlanGoals(request);
  }

  async composeBrief(request: ComposeBriefRequest): Promise<LlmResult<BriefComposition>> {
    this.compositions.push(request);
    if (this.stubs.composeBrief) {
      return { value: this.stubs.composeBrief(request), stats: STATS };
    }
    return this.inner.composeBrief(request);
  }

  describe(): Promise<LlmDescription> {
    return this.inner.describe();
  }
}

export function recordingProviders(stubs: ProviderStubs = {}): AiProviders & {
  llm: RecordingLlmProvider;
} {
  return { llm: new RecordingLlmProvider(stubs), stt: new FakeSttProvider() };
}

/** A sections object as the fake would produce one, for building note bodies. */
export function noteBody(sections: Sections): string {
  return Object.entries(sections)
    .map(([name, body]) => (body === '' ? `${name}:` : `${name}: ${body}`))
    .join('\n\n');
}
