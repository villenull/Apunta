import {
  BrainstormReplySchema,
  brainstormJsonSchema,
  BriefCompositionSchema,
  briefCompositionJsonSchema,
  buildRefineSchema,
  buildSectionsSchema,
  DEFAULT_LOCALE,
  DetectedFormatSchema,
  detectedFormatJsonSchema,
  NoteSummarySchema,
  noteSummaryJsonSchema,
  PlanSuggestionSchema,
  planSuggestionJsonSchema,
  refineJsonSchema,
  RetractionCorrectionsSchema,
  retractionCorrectionsJsonSchema,
  sectionsJsonSchema,
  type BriefComposition,
  type DetectedFormat,
  type GenerateStage,
  type JsonSchemaObject,
  type Locale,
  type NoteSummary,
  type PlanSuggestion,
  type RefineResult,
  type RetractionCorrection,
  type Sections,
} from '@apunta/shared';
import type { z } from 'zod';

import { DEFAULT_OLLAMA_URL } from '../config.js';
import { msg } from '../http/locale.js';
import { findDegeneration, findDegenerateSection } from './degenerate.js';
import { aiError, AiError, isConnectionFailure } from './errors.js';
import { JsonStringStreamDecoder, stripCodeFence } from './json-stream.js';
import { assertGgufWeights, assertSupportedModelName, defaultModelForMachine } from './model-picker.js';
import {
  approximateTokens,
  buildBrainstormPrompt,
  buildComposeBriefPrompt,
  buildDetectFormatPrompt,
  buildExtractRetractionsPrompt,
  buildExtractRiskReviewPrompt,
  buildRewriteWithoutWordsPrompt,
  buildGeneratePrompt,
  buildRefinePrompt,
  buildSuggestPlanPrompt,
  buildSummariseNotePrompt,
  orderSections,
  type ChatPrompt,
} from './prompts.js';
import {
  acceptsRewrite,
  novelDiagnosticWords,
  rewriteJsonSchema,
  RewriteSchema,
} from './diagnostic-words.js';
import { removeInventedNegatives } from './not-obtained.js';
import { applyRetractions, hasRetraction } from './retractions.js';
import {
  riskQuotesJsonSchema,
  RiskQuotesSchema,
  riskReviewLost,
  riskSentencesFromQuotes,
  withRiskReview,
} from './risk-review.js';
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
  RefineNoteRequest,
  SummariseNoteRequest,
  SuggestPlanGoalsRequest,
} from './types.js';

/**
 * The real LLM provider: Ollama over `POST /api/chat`, with the response shape
 * constrained by a JSON schema.
 *
 * `/api/chat` and not `/v1/chat/completions` (the OpenAI endpoint strands the
 * answer in `reasoning` for the models we target, ollama#15288) and not
 * `/api/generate` either — `ChatHandler` is the only handler that defers
 * grammar application until thinking finishes, so it is the only endpoint with
 * thinking-aware `format` handling (ollama#17544, open). That is settled in
 * `docs/decisions.md`.
 *
 * Nothing here trusts `format` on its own. Every response is parsed and
 * re-validated against the zod schema, and a violation is an expected error
 * path with a user-facing message — because the two ways `format` fails
 * silently (the MLX engine ignoring it, ollama#16563; a renderer regression
 * serialising reasoning as JSON, ollama#17871) both return HTTP 200 with
 * `done_reason: "stop"` and no other signal at all.
 */

/** PLAN §2: Ollama's default context is VRAM-dependent and can be as low as 4K. */
export const NUM_CTX = 16_384;
/**
 * A hard output ceiling. Ollama's default is unbounded, and a bound is the only
 * thing that stops the ollama#15502 repetition loop from running until the
 * context fills. It surfaces honestly as `done_reason: "length"`.
 */
export const NUM_PREDICT = 3072;

/**
 * Small JSON helpers do not need the note/refine ceiling. Keeping these
 * operation-specific prevents an accidental long generation from reserving
 * the same KV budget as a full note, while `done_reason=length` remains a
 * hard validation failure below.
 */
export const NUM_PREDICT_DETECT = 256;
export const NUM_PREDICT_RETRACTIONS = 768;
export const NUM_PREDICT_RISK_REVIEW = 768;
export const NUM_PREDICT_REWRITE = 1536;
export const NUM_PREDICT_SUMMARY = 768;
export const NUM_PREDICT_PLAN = 1536;
export const NUM_PREDICT_BRIEF = 1024;
export const NUM_PREDICT_BRAINSTORM = 1536;
/** Keep the drafting weights resident through a typical recording session. */
export const DRAFT_PRELOAD_KEEP_ALIVE = '30m';
/** Avoid repeating a load request when the capture screen is opened repeatedly. */
export const DRAFT_PRELOAD_INTERVAL_MS = 5 * 60 * 1000;

/** How long silence lasts before the UI is told the model is still loading. */
const LOADING_STATUS_AFTER_MS = 2500;

/** `prompt_eval_count` this close to `num_ctx` is the truncation fingerprint. */
const CONTEXT_OVERFLOW_MARGIN = 16;
/** Refuse rather than let Ollama silently drop the head of the prompt. */
const PROMPT_BUDGET = 0.75;

/**
 * What the refine prompt may be, estimated, at the default window. Equal to
 * `NUM_CTX - NUM_PREDICT - PROMPT_HEADROOM` as it happens, so the rule below
 * holds for it too. The chat route budgets the patient's earlier notes to it.
 */
export const REFINE_PROMPT_TOKENS = Math.floor(NUM_CTX * PROMPT_BUDGET);

/**
 * Room left between an estimated prompt plus its output ceiling and the end
 * of the window, for the estimate being wrong. `approximateTokens` (3.5
 * characters a token) measured 0.82–0.89 of the real count on dictation
 * prose for `qwen3.5:4b` (2026-09-21), so it over-counts; this is what still
 * stands if it were exact, and it is exceeded only below ~3.26 characters a
 * token. Past that, `context_overflow` refuses rather than truncating.
 */
export const PROMPT_HEADROOM = 1024;

/**
 * Brainstorm's prompt ceiling (2026-09-21): the window, less its own output
 * ceiling, less the headroom — 13,824 at the default window, up from the
 * flat 75% (12,288). Brainstorm now reads every note that fits, so the room
 * the flat fraction held back for the refine path's 3,072-token output is
 * room for about three more notes here. The KV cache is sized by `num_ctx`,
 * not by the prompt, so this costs no memory — only prompt-evaluation time.
 */
export function brainstormPromptTokens(numCtx: number = NUM_CTX): number {
  return numCtx - NUM_PREDICT_BRAINSTORM - PROMPT_HEADROOM;
}

export interface OllamaProviderOptions {
  /** Loopback only — the egress guard rejects anything else. */
  readonly baseUrl?: string;
  readonly resolveModel?: () => string | Promise<string>;
  readonly numCtx?: number;
  readonly numPredict?: number;
  /** Ollama's default is 5m; a therapist writing a batch would pay a cold load each time. */
  readonly keepAlive?: string;
  /** No first byte by now means the model is loading, or wedged. */
  readonly firstByteTimeoutMs?: number;
  readonly totalTimeoutMs?: number;
  readonly fetchImpl?: typeof globalThis.fetch;
  readonly log?: (message: string, detail: Record<string, unknown>) => void;
  /** Test seam for the capture preload's cooldown clock. */
  readonly now?: () => number;
  /** Override the cooldown only for controlled callers and tests. */
  readonly preloadIntervalMs?: number;
}

interface OllamaMessage {
  readonly role: 'system' | 'user' | 'assistant';
  readonly content: string;
}

interface ChatAttempt {
  /**
   * The job's captured locale (C-LANG@1 rule 4), carried on the attempt
   * because the two `status` frames below are pushed from inside the read
   * loop, where nothing else knows which language the caller asked for.
   */
  readonly locale: Locale;
  readonly messages: readonly OllamaMessage[];
  readonly format: JsonSchemaObject;
  /** `undefined` omits the field entirely, which is the documented workaround. */
  readonly think: boolean | undefined;
  readonly seed: number;
  readonly numPredict: number;
  readonly decodeNestedKeys?: readonly string[];
}

interface StreamOutcome {
  readonly raw: string;
  readonly thinking: string;
  readonly doneReason: string;
  readonly promptTokens: number;
  readonly outputTokens: number;
  readonly evalNanos: number;
  readonly loadNanos: number;
  readonly numPredict: number;
}

interface FinalFrame {
  done_reason?: string;
  prompt_eval_count?: number;
  eval_count?: number;
  eval_duration?: number;
  total_duration?: number;
  load_duration?: number;
}

interface ChatChunk extends FinalFrame {
  message?: { content?: string; thinking?: string };
  done?: boolean;
  error?: string;
}

interface TagsModel {
  name?: string;
  model?: string;
  details?: { format?: string };
}

export class OllamaProvider implements LlmProvider {
  private readonly baseUrl: string;
  private readonly resolveModel: () => string | Promise<string>;
  private readonly numCtx: number;
  private readonly numPredict: number;
  private readonly keepAlive: string;
  private readonly firstByteTimeoutMs: number;
  private readonly totalTimeoutMs: number;
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly log: (message: string, detail: Record<string, unknown>) => void;
  /** `POST /api/show` is a round trip; the answer never changes for a tag. */
  private readonly thinkingSupport = new Map<string, boolean>();
  private readonly now: () => number;
  private readonly preloadIntervalMs: number;
  private lastPreloadAt = Number.NEGATIVE_INFINITY;
  private preloadInFlight: Promise<void> | null = null;

  constructor(options: OllamaProviderOptions = {}) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_OLLAMA_URL).replace(/\/+$/, '');
    this.resolveModel = options.resolveModel ?? defaultModelForMachine;
    this.numCtx = options.numCtx ?? NUM_CTX;
    this.numPredict = options.numPredict ?? NUM_PREDICT;
    this.keepAlive = options.keepAlive ?? DRAFT_PRELOAD_KEEP_ALIVE;
    this.firstByteTimeoutMs = options.firstByteTimeoutMs ?? 120_000;
    this.totalTimeoutMs = options.totalTimeoutMs ?? 600_000;
    this.fetchImpl = options.fetchImpl ?? ((...args) => globalThis.fetch(...args));
    this.log = options.log ?? (() => {});
    this.now = options.now ?? Date.now;
    this.preloadIntervalMs = options.preloadIntervalMs ?? DRAFT_PRELOAD_INTERVAL_MS;
  }

  // --- health ------------------------------------------------------------

  async describe(): Promise<LlmDescription> {
    const model = await this.resolveModel();
    try {
      const response = await this.fetchImpl(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(2500),
      });
      if (!response.ok) return { reachable: false, model, modelPresent: false, weightsFormat: null };
      const body = (await response.json()) as { models?: TagsModel[] };
      const entry = (body.models ?? []).find((item) => item.name === model || item.model === model);
      return {
        reachable: true,
        model,
        modelPresent: entry !== undefined,
        weightsFormat: entry?.details?.format ?? null,
      };
    } catch {
      return { reachable: false, model, modelPresent: false, weightsFormat: null };
    }
  }
  /**
   * Load the resolved drafting model while the therapist is speaking. An empty
   * `/api/generate` prompt does not alter drafting prompts or decoding; it only
   * asks Ollama to create the resident model context.
   */
  async preloadDraft(): Promise<void> {
    const now = this.now();
    if (this.preloadInFlight !== null) {
      await this.preloadInFlight;
      return;
    }
    if (now - this.lastPreloadAt < this.preloadIntervalMs) return;

    this.lastPreloadAt = now;
    const work = this.runDraftPreload();
    this.preloadInFlight = work.finally(() => {
      this.preloadInFlight = null;
    });
    await this.preloadInFlight;
  }

  private async runDraftPreload(): Promise<void> {
    let model: string | null = null;
    try {
      model = await this.resolveModel();
      const response = await this.fetchImpl(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt: '',
          stream: false,
          raw: true,
          keep_alive: this.keepAlive,
          options: {
            temperature: 0,
            num_ctx: this.numCtx,
            num_predict: 1,
            seed: 0,
            repeat_penalty: 1.0,
          },
        }),
        signal: AbortSignal.timeout(this.firstByteTimeoutMs),
      });
      if (!response.ok) throw await this.mapHttpError(response, model);
      await response.text();
    } catch (error) {
      this.log('draft model preload failed', {
        model: model ?? 'unresolved',
        code: error instanceof AiError ? error.code : 'unknown',
      });
    }
  }

  /** Pre-flight for a real call: reachable, pulled, and running on llama.cpp. */
  private async requireUsableModel(model: string): Promise<void> {
    assertSupportedModelName(model);
    const described = await this.describe();
    if (!described.reachable) throw aiError('ollama_unreachable', `${this.baseUrl} did not answer /api/tags`);
    if (!described.modelPresent) throw aiError('model_missing', `model "${model}" is not in /api/tags`);
    assertGgufWeights(model, described.weightsFormat);
  }

  /**
   * Only send top-level `think` to a model that has the capability: sending it
   * to one that does not is a hard HTTP 400, which is the first thing a user
   * hits after choosing an incompatible local model in Settings.
   */
  private async supportsThinking(model: string): Promise<boolean> {
    const cached = this.thinkingSupport.get(model);
    if (cached !== undefined) return cached;
    try {
      const response = await this.fetchImpl(`${this.baseUrl}/api/show`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model }),
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) return false;
      const body = (await response.json()) as { capabilities?: unknown };
      const supported = Array.isArray(body.capabilities) && body.capabilities.includes('thinking');
      this.thinkingSupport.set(model, supported);
      return supported;
    } catch {
      return false;
    }
  }

  // --- drafting ----------------------------------------------------------

  async *generateNote(
    request: GenerateNoteRequest,
    locale: Locale = DEFAULT_LOCALE,
  ): AsyncIterable<LlmEvent> {
    const model = await this.resolveModel();
    yield status('connecting', msg(locale, 'status.thinking'));
    await this.requireUsableModel(model);

    // A spoken retraction is cut out of the transcript before the drafting
    // model sees it (`retractions.ts`). The model quotes, the server cuts.
    let drafted = request;
    const transcript = request.transcript ?? '';
    if (hasRetraction(transcript)) {
      yield status('correcting', msg(locale, 'status.applying_corrections'));
      const corrections = await this.extractRetractions(model, transcript);
      const outcome = applyRetractions(transcript, corrections);
      yield { type: 'retractions', applied: outcome.applied, offered: corrections.length };
      drafted = { ...request, transcript: outcome.text };
    }

    const prompt = buildGeneratePrompt(drafted);
    this.assertFits(prompt.system, prompt.user);

    const schema = buildSectionsSchema(request.sections);
    const format = sectionsJsonSchema(request.sections);

    const validate = (value: unknown): Sections => {
      const parsed = schema.safeParse(value);
      if (!parsed.success) throw new ShapeMismatch(describeShapeMismatch(value, request.sections));
      const ordered = orderSections(parsed.data, request.sections);
      const degenerate = findDegenerateSection(ordered);
      if (degenerate) {
        throw new DegenerateOutput(
          `section "${degenerate.section}" repeats "${degenerate.finding.token}" ${String(degenerate.finding.count)} times`,
        );
      }
      return ordered;
    };

    const { value, stats } = yield* this.runLadder<Sections>({
      locale,
      model,
      system: prompt.system,
      user: prompt.user,
      format,
      validate,
    });

    // A risk review she carried out that the draft lost entirely is put back in
    // her own words (`risk-review.ts`). The model points, the server quotes her.
    let sections = value;
    const source = `${drafted.typedNotes ?? ''}\n${drafted.transcript ?? ''}`;
    if (locale === 'en') {
      // A diagnostic word she never used is rewritten out of its section
      // (`diagnostic-words.ts`), and background she says she never gathered,
      // written up as a negative finding, is taken out (`not-obtained.ts`).
      sections = await this.withoutNovelDiagnosticWords(model, source, sections);
      sections = removeInventedNegatives(source, sections).sections;
    }
    if (locale === 'en' && riskReviewLost(source, sections)) {
      const sentences = riskSentencesFromQuotes(source, await this.extractRiskReview(model, source));
      sections = withRiskReview(sections, request.sections, sentences);
    }

    yield { type: 'sections', sections, stats };
  }

  async *refineNote(request: RefineNoteRequest, locale: Locale = DEFAULT_LOCALE): AsyncIterable<LlmEvent> {
    const model = await this.resolveModel();
    yield status('connecting', msg(locale, 'status.thinking'));
    await this.requireUsableModel(model);

    const prompt = buildRefinePrompt(request);
    this.assertFits(prompt.system, prompt.user);

    const schema = buildRefineSchema(request.sections);
    const validate = (value: unknown): RefineResult => {
      const parsed = schema.safeParse(value);
      if (!parsed.success)
        throw new ShapeMismatch(describeShapeMismatch(value, ['reply', 'updatedSections']));
      const updated = parsed.data.updatedSections;
      return {
        reply: parsed.data.reply,
        updatedSections: updated === null ? null : orderSections(updated, request.sections),
      };
    };

    const { value, stats } = yield* this.runLadder<RefineResult>({
      locale,
      model,
      system: prompt.system,
      user: prompt.user,
      format: refineJsonSchema(request.sections),
      validate,
      decodeNestedKeys: request.sections,
    });

    yield { type: 'refined', reply: value.reply, updatedSections: value.updatedSections, stats };
  }

  /**
   * M12: a brainstorm reply is one string, not a note revision, so the schema
   * is one key and the only streamed field is `reply`. Same ladder, same
   * truncation checks, same failure shapes as every other streaming call —
   * deliberately, so this path cannot fail in a way the others have already
   * learned to report.
   */
  async *discussPatient(
    request: BrainstormRequest,
    locale: Locale = DEFAULT_LOCALE,
  ): AsyncIterable<LlmEvent> {
    const model = await this.resolveModel();
    yield status('connecting', msg(locale, 'status.thinking'));
    await this.requireUsableModel(model);

    const prompt = buildBrainstormPrompt(request);
    this.assertFits(prompt.system, prompt.user, brainstormPromptTokens(this.numCtx));

    const validate = (value: unknown): string => {
      const parsed = BrainstormReplySchema.safeParse(value);
      if (!parsed.success) throw new ShapeMismatch(describeShapeMismatch(value, ['reply']));
      return parsed.data.reply;
    };

    const { value, stats } = yield* this.runLadder<string>({
      locale,
      model,
      system: prompt.system,
      user: prompt.user,
      format: brainstormJsonSchema(),
      validate,
      numPredict: NUM_PREDICT_BRAINSTORM,
    });

    yield { type: 'discussed', reply: value, stats };
  }

  // --- M9: two-stage plan drafting and session prep -----------------------

  /**
   * Stage one, one note at a time.
   *
   * The whole reason both M9 paths are two-stage: an over-long prompt is
   * truncated from the head, so six notes in one call would drop the
   * instructions and keep the material. `runJson` goes through the same retry
   * ladder as everything else, which is what checks `prompt_eval_count`
   * against `num_ctx` on every one of these calls.
   */
  async summariseNote(request: SummariseNoteRequest): Promise<LlmResult<NoteSummary>> {
    return this.runJson(
      buildSummariseNotePrompt(request),
      noteSummaryJsonSchema(),
      NoteSummarySchema,
      ['points', 'excerpts'],
      (value) => [...value.points, ...value.excerpts],
      NUM_PREDICT_SUMMARY,
    );
  }

  /** Stage two of plan drafting. Never writes accepted content — it cannot: it returns suggestions. */
  async suggestPlanGoals(request: SuggestPlanGoalsRequest): Promise<LlmResult<PlanSuggestion>> {
    return this.runJson(
      buildSuggestPlanPrompt(request),
      planSuggestionJsonSchema(),
      PlanSuggestionSchema,
      ['goals'],
      (value) => value.goals.flatMap((goal) => [goal.statement, ...goal.interventions]),
      NUM_PREDICT_PLAN,
    );
  }

  /** Stage two of session prep. The plan is not in this prompt and never is. */
  async composeBrief(request: ComposeBriefRequest): Promise<LlmResult<BriefComposition>> {
    return this.runJson(
      buildComposeBriefPrompt(request),
      briefCompositionJsonSchema(),
      BriefCompositionSchema,
      ['lines'],
      (value) => value.lines.map((line) => line.text),
      NUM_PREDICT_BRIEF,
    );
  }

  /**
   * One schema-enforced call whose result is a value rather than a stream.
   *
   * The status events the ladder yields are dropped: a promise-shaped call has
   * nowhere to show "loading the model", and the routes that use these emit
   * their own per-note progress instead. Everything else — the retry ladder,
   * the truncation check, the fenced-response diagnosis — is the same code the
   * streaming paths run, deliberately: a second AI path would be a second set
   * of failure modes to discover in production.
   */
  private async runJson<T>(
    prompt: ChatPrompt,
    format: JsonSchemaObject,
    schema: z.ZodType<T>,
    keys: readonly string[],
    freeText: (value: T) => readonly string[],
    numPredict: number,
  ): Promise<LlmResult<T>> {
    const model = await this.resolveModel();
    await this.requireUsableModel(model);
    this.assertFits(prompt.system, prompt.user);

    const validate = (value: unknown): T => {
      const parsed = schema.safeParse(value);
      if (!parsed.success) throw new ShapeMismatch(describeShapeMismatch(value, keys));
      for (const body of freeText(parsed.data)) {
        const finding = findDegeneration(body);
        if (finding) {
          throw new DegenerateOutput(`a field repeats "${finding.token}" ${String(finding.count)} times`);
        }
      }
      return parsed.data;
    };

    // English: a non-streamed call drains the ladder's events instead of
    // forwarding them, so no `status` it yields ever reaches a browser. The
    // argument is still passed rather than left optional so a caller that
    // *does* forward them cannot forget to.
    const generator = this.runLadder<T>({
      locale: DEFAULT_LOCALE,
      model,
      system: prompt.system,
      user: prompt.user,
      format,
      validate,
      numPredict,
    });

    for (;;) {
      const next = await generator.next();
      if (next.done === true) return next.value;
    }
  }

  async detectFormat(request: DetectFormatRequest): Promise<DetectedFormat> {
    const model = await this.resolveModel();
    await this.requireUsableModel(model);

    const prompt = buildDetectFormatPrompt(request);
    this.assertFits(prompt.system, prompt.user);

    const think = (await this.supportsThinking(model)) ? false : undefined;
    const response = await this.postChat(model, {
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
      format: detectedFormatJsonSchema(),
      think,
      stream: false,
      numPredict: NUM_PREDICT_DETECT,
    });

    let chunk: ChatChunk;
    try {
      chunk = (await response.json()) as ChatChunk;
    } catch (error) {
      throw aiError('ollama_error', `could not read the /api/chat response: ${String(error)}`);
    }
    if (chunk.done_reason === 'length') {
      throw aiError('output_truncated', `detectFormat stopped at num_predict ${String(NUM_PREDICT_DETECT)}`);
    }
    const { text } = stripCodeFence(chunk.message?.content ?? '');
    if (text.trim() === '') throw aiError('empty_response', 'detectFormat returned no content');

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      // `String(error)` on a JSON.parse failure quotes the first ten
      // characters of the input, and for detectFormat the input may be the
      // owner's own past notes.
      throw aiError('invalid_output', `detectFormat did not return JSON (${String(text.length)} chars)`);
    }
    const validated = DetectedFormatSchema.safeParse(parsed);
    if (!validated.success) {
      throw aiError('invalid_output', describeShapeMismatch(parsed, ['name', 'sections']));
    }
    return validated.data;
  }

  /**
   * The quoting call before a draft with a retraction in it.
   *
   * Not on the ladder, and never fatal on content: an answer that is not the
   * shape asked for means the draft goes ahead from the transcript as
   * transcribed, with the reminder beside it as before. A transport failure
   * propagates — the draft that follows would hit the same one.
   */
  private async extractRetractions(model: string, transcript: string): Promise<RetractionCorrection[]> {
    const prompt = buildExtractRetractionsPrompt(transcript);
    this.assertFits(prompt.system, prompt.user);

    const think = (await this.supportsThinking(model)) ? false : undefined;
    const response = await this.postChat(model, {
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
      format: retractionCorrectionsJsonSchema(),
      think,
      stream: false,
      seed: 0,
      numPredict: NUM_PREDICT_RETRACTIONS,
    });

    let chunk: ChatChunk;
    try {
      chunk = (await response.json()) as ChatChunk;
    } catch {
      return [];
    }
    if (chunk.done_reason === 'length') {
      throw aiError(
        'output_truncated',
        `retraction extraction stopped at num_predict ${String(NUM_PREDICT_RETRACTIONS)}`,
      );
    }
    try {
      const { text } = stripCodeFence(chunk.message?.content ?? '');
      const validated = RetractionCorrectionsSchema.safeParse(JSON.parse(text));
      return validated.success ? validated.data.corrections : [];
    } catch {
      return [];
    }
  }

  /**
   * The quoting call after a draft that lost its risk review.
   *
   * Never fatal: the note is already drafted, and losing it to a failure in a
   * repair would be worse than the omission. Anything that is not the shape
   * asked for — including a truncated answer or a transport failure — leaves
   * the draft as the model wrote it.
   */
  private async extractRiskReview(model: string, source: string): Promise<string[]> {
    try {
      const prompt = buildExtractRiskReviewPrompt(source);
      this.assertFits(prompt.system, prompt.user);
      const think = (await this.supportsThinking(model)) ? false : undefined;
      const response = await this.postChat(model, {
        messages: [
          { role: 'system', content: prompt.system },
          { role: 'user', content: prompt.user },
        ],
        format: riskQuotesJsonSchema(),
        think,
        stream: false,
        seed: 0,
        numPredict: NUM_PREDICT_RISK_REVIEW,
      });
      const chunk = (await response.json()) as ChatChunk;
      if (chunk.done_reason === 'length') return [];
      const { text } = stripCodeFence(chunk.message?.content ?? '');
      const validated = RiskQuotesSchema.safeParse(JSON.parse(text));
      return validated.success ? validated.data.quotes : [];
    } catch (error) {
      this.log('risk review extraction failed', {
        model,
        code: error instanceof AiError ? error.code : 'unknown',
      });
      return [];
    }
  }

  /**
   * Each section with a diagnostic word her notes never use, rewritten without
   * it — kept only when `acceptsRewrite` says nothing else changed. Never
   * fatal: any failure keeps the section as drafted.
   */
  private async withoutNovelDiagnosticWords(
    model: string,
    source: string,
    sections: Sections,
  ): Promise<Sections> {
    let out = sections;
    for (const [name, body] of Object.entries(sections)) {
      const words = novelDiagnosticWords(body, source);
      if (words.length === 0) continue;
      const rewrite = await this.rewriteWithoutWords(model, body, words);
      if (rewrite !== null && acceptsRewrite(body, rewrite, source)) out = { ...out, [name]: rewrite.trim() };
    }
    return out;
  }

  private async rewriteWithoutWords(
    model: string,
    text: string,
    words: readonly string[],
  ): Promise<string | null> {
    try {
      const prompt = buildRewriteWithoutWordsPrompt(text, words);
      this.assertFits(prompt.system, prompt.user);
      const think = (await this.supportsThinking(model)) ? false : undefined;
      const response = await this.postChat(model, {
        messages: [
          { role: 'system', content: prompt.system },
          { role: 'user', content: prompt.user },
        ],
        format: rewriteJsonSchema(),
        think,
        stream: false,
        seed: 0,
        numPredict: NUM_PREDICT_REWRITE,
      });
      const chunk = (await response.json()) as ChatChunk;
      if (chunk.done_reason === 'length') return null;
      const { text: content } = stripCodeFence(chunk.message?.content ?? '');
      const validated = RewriteSchema.safeParse(JSON.parse(content));
      return validated.success ? validated.data.text : null;
    } catch (error) {
      this.log('diagnostic-word rewrite failed', {
        model,
        code: error instanceof AiError ? error.code : 'unknown',
      });
      return null;
    }
  }

  // --- the retry ladder --------------------------------------------------

  /**
   * Attempt, re-ask with the error, then re-ask with `think` omitted.
   *
   * The packet asks for one automatic retry. The third rung is a deviation
   * (`docs/decisions.md`): dropping `think` entirely is the documented
   * workaround for two separate live bugs — the family-scoped `think:false`
   * regression that keeps reappearing (ollama#15260 fixed for gemma4 only,
   * ollama#17871 open for qwen3.6) — and it only runs when the diagnosis
   * actually looks like the grammar was never applied, so the common case
   * still costs at most two calls.
   */
  private async *runLadder<T>(options: {
    /** The captured locale every `status` this ladder yields is rendered in. */
    locale: Locale;
    model: string;
    system: string;
    user: string;
    format: JsonSchemaObject;
    validate: (value: unknown) => T;
    numPredict?: number;
    decodeNestedKeys?: readonly string[];
  }): AsyncGenerator<LlmEvent, { value: T; stats: LlmStats }> {
    const thinkingModel = await this.supportsThinking(options.model);
    let think: boolean | undefined = thinkingModel ? false : undefined;
    let correction: string | null = null;
    let lastError: AiError | null = null;

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      if (attempt > 1) {
        yield status('retrying', msg(options.locale, 'status.drafting_retry'));
      }

      const messages: OllamaMessage[] = [
        { role: 'system', content: options.system },
        { role: 'user', content: options.user },
      ];
      if (correction !== null) {
        // Quoting the model's own answer back to it stays inside the prompt —
        // it never reaches a log — but the reason appended below is shape-only
        // for the same reason `AiError.detail` is.
        messages.push({ role: 'assistant', content: correction.slice(0, 2000) });
        messages.push({
          role: 'user',
          content: `That response was not accepted: ${lastError?.detail ?? 'it did not match the required shape'}. Reply again with a single JSON object in exactly the required shape, and nothing else.`,
        });
      }

      const outcome = yield* this.streamChat(options.model, {
        locale: options.locale,
        messages,
        format: options.format,
        think,
        seed: attempt - 1,
        numPredict: options.numPredict ?? this.numPredict,
        ...(options.decodeNestedKeys === undefined ? {} : { decodeNestedKeys: options.decodeNestedKeys }),
      });

      try {
        const value = options.validate(this.parseOutcome(outcome, options.model));
        return {
          value,
          stats: {
            model: options.model,
            promptTokens: outcome.promptTokens,
            outputTokens: outcome.outputTokens,
            evalNanos: outcome.evalNanos,
            loadNanos: outcome.loadNanos,
            doneReason: outcome.doneReason,
            attempts: attempt,
          },
        };
      } catch (error) {
        if (error instanceof AiError && !RETRYABLE.has(error.code)) throw error;
        lastError = toAiError(error);
        const grammarLooksUnapplied = error instanceof ShapeMismatch || error instanceof NotJson;
        this.log('draft attempt rejected', {
          model: options.model,
          attempt,
          code: lastError.code,
          detail: lastError.detail,
        });
        // Echoing a repetition loop back at the model reinforces it, so a
        // degenerate answer is retried on a fresh seed instead of quoted.
        correction = error instanceof DegenerateOutput ? null : outcome.raw.slice(0, 2000);

        if (attempt === 2) {
          // The third rung only earns its cost when the grammar looks bypassed
          // *and* `think` is what we would be changing.
          if (!grammarLooksUnapplied || think === undefined) throw lastError;
          think = undefined;
        }
      }
    }

    throw lastError ?? aiError('invalid_output', 'the model never returned a valid note');
  }

  /** Turn a finished stream into a parsed JSON value, or a typed failure. */
  private parseOutcome(outcome: StreamOutcome, model: string): unknown {
    if (outcome.promptTokens >= this.numCtx - CONTEXT_OVERFLOW_MARGIN) {
      // Not retryable: the same prompt would be truncated the same way, and the
      // part that gets dropped is the instruction not to invent.
      throw aiError(
        'context_overflow',
        `prompt_eval_count ${String(outcome.promptTokens)} is flush against num_ctx ${String(this.numCtx)}`,
      );
    }
    if (outcome.doneReason === 'length') {
      throw aiError(
        'output_truncated',
        `done_reason=length after ${String(outcome.outputTokens)} tokens (num_predict ${String(outcome.numPredict)})`,
      );
    }

    const { text, fenced } = stripCodeFence(outcome.raw);
    if (fenced) {
      // A fence in a schema-constrained response is proof the grammar was never
      // applied — worth logging as "your model is not enforcing the schema"
      // rather than "the model wrote a bad note".
      this.log('model returned a fenced response despite format', { model });
    }
    if (text.trim() === '') {
      throw aiError(
        'empty_response',
        outcome.thinking.trim() === ''
          ? `no content (eval_count ${String(outcome.outputTokens)})`
          : `all ${String(outcome.thinking.length)} characters arrived in message.thinking`,
      );
    }

    try {
      return JSON.parse(text);
    } catch (error) {
      // Never the text itself: on this path `text` is the drafted note. Its
      // length and first character separate a fence from prose from a
      // truncated object, which is the whole diagnosis, and carry no content.
      throw new NotJson(
        `not JSON: ${String(text.length)} chars starting ${JSON.stringify(text.slice(0, 1))}`,
      );
    }
  }

  // --- HTTP --------------------------------------------------------------

  private assertFits(system: string, user: string, limit: number = this.numCtx * PROMPT_BUDGET): void {
    const tokens = approximateTokens(system) + approximateTokens(user);
    if (tokens > limit) {
      throw aiError(
        'input_too_long',
        `prompt is roughly ${String(tokens)} tokens, over ${String(Math.floor(limit))}`,
      );
    }
  }

  private async postChat(
    model: string,
    body: {
      messages: readonly OllamaMessage[];
      format: JsonSchemaObject;
      think: boolean | undefined;
      stream: boolean;
      seed?: number;
      numPredict?: number;
    },
    signal?: AbortSignal,
  ): Promise<Response> {
    const payload = {
      model,
      stream: body.stream,
      keep_alive: this.keepAlive,
      format: body.format,
      ...(body.think === undefined ? {} : { think: body.think }),
      options: {
        temperature: 0,
        num_ctx: this.numCtx,
        num_predict: body.numPredict ?? this.numPredict,
        // Seed 0 on the first attempt makes `smoke:live` and M7's eval
        // reproducible. A retry moves it on: at temperature 0 an unchanged
        // prompt and an unchanged seed reproduce the same failure exactly.
        seed: body.seed ?? 0,
        // Ollama changed the default in v0.32.10. A repetition penalty over
        // constrained JSON penalises the structural tokens and the repeated
        // section names, so neutralise it.
        repeat_penalty: 1.0,
      },
      messages: body.messages,
    };

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        ...(signal ? { signal } : {}),
      });
    } catch (error) {
      if (isConnectionFailure(error)) {
        throw aiError('ollama_unreachable', `${this.baseUrl}: ${describeCause(error)}`);
      }
      if (error instanceof Error && error.name === 'AbortError') {
        throw aiError('timeout', 'no response from Ollama before the timeout');
      }
      throw aiError('ollama_error', String(error));
    }

    if (!response.ok) throw await this.mapHttpError(response, model);
    return response;
  }

  private async mapHttpError(response: Response, model: string): Promise<AiError> {
    const text = await response.text().catch(() => '');
    if (response.status === 404) return aiError('model_missing', `404 for "${model}": ${text.slice(0, 200)}`);
    if (response.status === 400 && /does not support thinking/i.test(text)) {
      this.thinkingSupport.set(model, false);
      return aiError('ollama_error', `model "${model}" does not support thinking`);
    }
    if (response.status >= 500 && /memory|allocat|out of memory|oom/i.test(text)) {
      return aiError('insufficient_memory', text.slice(0, 300));
    }
    // Ollama's own error strings describe the model and the runtime, not the
    // request body, so they are safe to keep — they are the only clue to an
    // OOM or a bad tag.
    return aiError('ollama_error', `HTTP ${String(response.status)}: ${text.slice(0, 300)}`);
  }

  /**
   * One `/api/chat` call, streamed. Yields decoded per-key text as it arrives
   * and returns everything the final frame reported.
   */
  private async *streamChat(model: string, attempt: ChatAttempt): AsyncGenerator<LlmEvent, StreamOutcome> {
    const controller = new AbortController();
    const timers: ReturnType<typeof setTimeout>[] = [];

    /**
     * Producer/consumer, rather than yielding straight from the read loop.
     *
     * The point is the "loading the model" status: on a cold start Ollama
     * sends *nothing* for tens of seconds while a 7GB model becomes resident,
     * so a status emitted from inside `await reader.read()` would arrive only
     * once the wait it explains was already over.
     */
    const queue: LlmEvent[] = [];
    let wake: (() => void) | null = null;
    const push = (event: LlmEvent): void => {
      queue.push(event);
      const waiting = wake;
      wake = null;
      waiting?.();
    };

    let finished = false;
    let failure: unknown = null;
    let outcome: StreamOutcome | null = null;

    const producer = (async (): Promise<StreamOutcome> => {
      timers.push(
        setTimeout(() => {
          controller.abort();
        }, this.totalTimeoutMs),
      );
      const firstByte = setTimeout(() => {
        controller.abort();
      }, this.firstByteTimeoutMs);
      timers.push(firstByte);

      const response = await this.postChat(
        model,
        {
          messages: attempt.messages,
          format: attempt.format,
          think: attempt.think,
          stream: true,
          seed: attempt.seed,
          numPredict: attempt.numPredict,
        },
        controller.signal,
      );
      if (!response.body) throw aiError('ollama_error', 'Ollama returned no response body');

      const loading = setTimeout(() => {
        push(status('loading-model', msg(attempt.locale, 'status.loading_model')));
      }, LOADING_STATUS_AFTER_MS);
      timers.push(loading);

      const decoder = new JsonStringStreamDecoder(attempt.decodeNestedKeys);
      const reader = response.body.getReader();
      const utf8 = new TextDecoder();
      let buffer = '';
      let started = false;
      let thinking = '';
      let final: FinalFrame = {};

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        clearTimeout(firstByte);

        buffer += utf8.decode(value, { stream: true });
        let newline = buffer.indexOf('\n');
        while (newline !== -1) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          newline = buffer.indexOf('\n');
          if (line === '') continue;

          const chunk = parseChunk(line);
          if (chunk === null) continue;
          if (typeof chunk.error === 'string' && chunk.error !== '') {
            throw aiError('ollama_error', chunk.error.slice(0, 300));
          }
          if (typeof chunk.message?.thinking === 'string') thinking += chunk.message.thinking;

          const content = chunk.message?.content ?? '';
          if (content !== '') {
            clearTimeout(loading);
            if (!started) {
              started = true;
              push(status('drafting', msg(attempt.locale, 'status.drafting_note')));
            }
            for (const delta of decoder.push(content)) {
              push({ type: 'token', section: delta.key, text: delta.text });
            }
          }
          if (chunk.done === true) final = chunk;
        }
      }

      return {
        raw: decoder.text,
        thinking,
        doneReason: final.done_reason ?? 'stop',
        promptTokens: final.prompt_eval_count ?? 0,
        outputTokens: final.eval_count ?? 0,
        evalNanos: final.eval_duration ?? 0,
        loadNanos: final.load_duration ?? 0,
        numPredict: attempt.numPredict,
      };
    })()
      .then((value) => {
        outcome = value;
      })
      .catch((error: unknown) => {
        failure = error;
      })
      .finally(() => {
        finished = true;
        const waiting = wake;
        wake = null;
        waiting?.();
      });

    try {
      for (;;) {
        while (queue.length > 0) yield queue.shift() as LlmEvent;
        if (finished) break;
        // `wake` is assigned synchronously here, so the producer cannot finish
        // between the check above and this await.
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
      }
    } finally {
      // An abandoned generator (the client hung up) must not leave the request
      // and its timers running.
      controller.abort();
      for (const timer of timers) clearTimeout(timer);
      await producer;
    }

    if (failure !== null) throw asAiError(failure, this.baseUrl);
    return outcome as unknown as StreamOutcome;
  }
}

// --- helpers ------------------------------------------------------------

function status(stage: GenerateStage, message: string): LlmEvent {
  return { type: 'status', stage, message };
}

function parseChunk(line: string): ChatChunk | null {
  try {
    return JSON.parse(line) as ChatChunk;
  } catch {
    // A partial line can only happen if Ollama emitted something that is not
    // NDJSON; skipping it is better than failing the whole draft.
    return null;
  }
}

/** Everything the stream can fail with, as one typed error. */
function asAiError(error: unknown, baseUrl: string): AiError {
  if (error instanceof AiError) return error;
  if (isConnectionFailure(error)) {
    return aiError('ollama_unreachable', `${baseUrl}: ${describeCause(error)}`);
  }
  if (error instanceof Error && error.name === 'AbortError') {
    return aiError('timeout', 'the stream stopped before the model finished');
  }
  return aiError('ollama_error', String(error));
}

function describeCause(error: unknown): string {
  const cause = (error as { cause?: { code?: unknown } }).cause;
  return typeof cause?.code === 'string' ? cause.code : String(error);
}

/**
 * A key-set comparison, which reads far better than zod's
 * "Unrecognized key: thought" for a user who is not a programmer — and, more
 * usefully, tells the log whether the grammar was applied at all: an extra key
 * coming back when `additionalProperties: false` went out means it was not.
 */
function describeShapeMismatch(value: unknown, want: readonly string[]): string {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return `expected an object with keys [${want.join(', ')}], got ${Array.isArray(value) ? 'an array' : typeof value}`;
  }
  const got = Object.keys(value as Record<string, unknown>);
  const missing = want.filter((key) => !got.includes(key));
  // An unexpected key is model output, so it is truncated: `thought` is the
  // diagnosis, and a model that emitted a whole sentence as a key must not put
  // that sentence in a log line.
  const extra = got.filter((key) => !want.includes(key)).map((key) => key.slice(0, 40));
  const parts: string[] = [];
  if (missing.length > 0) parts.push(`missing [${missing.join(', ')}]`);
  if (extra.length > 0) parts.push(`unexpected [${extra.join(', ')}]`);
  if (parts.length === 0) parts.push('a value was not a string');
  return `keys did not match: ${parts.join('; ')}`;
}

/** Marker errors so the ladder can tell "wrong shape" from "not JSON at all". */
class ShapeMismatch extends AiError {
  constructor(detail: string) {
    super('invalid_output', aiError('invalid_output').message, detail);
    this.name = 'ShapeMismatch';
  }
}

class NotJson extends AiError {
  constructor(detail: string) {
    super('invalid_output', aiError('invalid_output').message, detail);
    this.name = 'NotJson';
  }
}

class DegenerateOutput extends AiError {
  constructor(detail: string) {
    super('degenerate_output', aiError('degenerate_output').message, detail);
    this.name = 'DegenerateOutput';
  }
}

/** Failures worth spending another call on. The rest are terminal. */
const RETRYABLE = new Set(['invalid_output', 'degenerate_output', 'output_truncated', 'empty_response']);

function toAiError(error: unknown): AiError {
  if (error instanceof AiError) return error;
  return aiError('invalid_output', String(error));
}
