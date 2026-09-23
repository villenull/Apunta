import { defaultInstructionsFor } from '../ai/default-instructions.js';
import { FakeLlmProvider } from '../ai/fake.js';
import { NUM_CTX, OllamaProvider } from '../ai/ollama.js';
import type { LlmProvider, LlmStats } from '../ai/types.js';
import { DEFAULT_OLLAMA_URL } from '../config.js';
import { denominators, draftSourceFor, loadCorpus, type Fixture } from './corpus.js';
import { renderReport, type ModelReport } from './report.js';
import { failedNote, scoreNote, type NoteScore, type RunStats } from './score.js';

/**
 * The driver: every fixture through a model, N times, scored.
 *
 * Sequential on purpose. The point of the run is to measure one model's
 * behaviour on this hardware, and two concurrent generations on one Metal GPU
 * measure contention instead.
 */

/**
 * How close to `num_ctx` counts as "the prompt filled the window".
 *
 * Ollama truncates an over-long prompt **from the head**, dropping the
 * instructions and keeping the patient material, and answers fluently with no
 * error. That note is the exact confident fabrication this eval exists to
 * measure, and it would score as a pass. So a run whose `prompt_eval_count`
 * lands near the ceiling is treated as a failed run, not as a result
 * (`docs/research/m3-preflight-2026-08.md`).
 */
const CONTEXT_FULL_MARGIN = 64;

export interface RunOptions {
  readonly models: readonly string[];
  readonly runs: number;
  readonly fake: boolean;
  readonly fixtureFilter?: string | undefined;
  /** Owner-supplied drafting instructions to measure in place of the defaults. */
  readonly instructions?: InstructionsOverride | undefined;
  /** One line for the report header saying what `instructions` was. */
  readonly instructionsNote?: string | undefined;
  /** Number of fixture-provided recent published notes to retrieve (0 disables). */
  readonly priorNoteCount?: number | undefined;
  readonly directory?: string | undefined;
  readonly ollamaUrl?: string | undefined;
  readonly onProgress?: (line: string) => void;
}

export interface RunResult {
  readonly markdown: string;
  readonly models: readonly ModelReport[];
  readonly fixtures: readonly Fixture[];
}

/**
 * Per-format instruction overrides — the owner's own drafting instructions,
 * measured instead of assumed.
 *
 * Same semantics as `ai/default-instructions.ts` `instructionsFor`, which is
 * what production applies to `note_formats.instructions`: a non-empty override
 * replaces the default *entirely*; blank means the default. The eval must
 * measure exactly the configuration that ships, or its number is about some
 * third thing that nobody runs.
 */
export interface InstructionsOverride {
  readonly progress?: string | undefined;
  readonly intake?: string | undefined;
}

export function instructionsFor(fixture: Fixture, override?: InstructionsOverride): string {
  const custom = fixture.format === 'intake' ? override?.intake : override?.progress;
  if (custom !== undefined && custom.trim() !== '') return custom.trim();
  // The same selection production applies to a format with an empty
  // `instructions` field: section fingerprint first, then the format name.
  // Hardcoding PROGRESS/INTAKE here would mean the eval could only ever
  // measure SOAP, and the shipped default is the owner's own format.
  return defaultInstructionsFor(formatNameFor(fixture), fixture.sections);
}

export function formatNameFor(fixture: Fixture): string {
  return fixture.format === 'intake' ? 'Intake note' : 'Progress note';
}

export async function runEval(options: RunOptions): Promise<RunResult> {
  const startedAt = new Date();
  const started = Date.now();

  const all = loadCorpus(options.directory);
  const fixtures =
    options.fixtureFilter === undefined
      ? all
      : all.filter((fixture) => fixture.filename.includes(options.fixtureFilter ?? ''));
  if (fixtures.length === 0) throw new Error(`no fixture matches "${options.fixtureFilter ?? ''}"`);

  const models: ModelReport[] = [];

  for (const model of options.models) {
    const provider = options.fake
      ? new FakeLlmProvider({ streamDelayMs: 0 })
      : new OllamaProvider({
          baseUrl: options.ollamaUrl ?? DEFAULT_OLLAMA_URL,
          resolveModel: () => model,
        });

    const scores: NoteScore[] = [];
    for (const fixture of fixtures) {
      for (let run = 1; run <= options.runs; run += 1) {
        options.onProgress?.(`${model} · ${fixture.filename} · run ${String(run)}`);
        scores.push(
          await scoreOneRun(provider, fixture, model, run, options.instructions, options.priorNoteCount ?? 0),
        );
      }
    }
    models.push({ model, runs: options.runs, scores });
  }

  return {
    markdown: renderReport({
      fixtures,
      denominators: denominators(fixtures),
      models,
      fake: options.fake,
      instructionsNote: options.instructionsNote,
      priorNotesNote:
        (options.priorNoteCount ?? 0) > 0
          ? `${String(options.priorNoteCount)} recent published note(s), fixture-provided`
          : 'disabled',
      startedAt,
      elapsedMs: Date.now() - started,
    }),
    models,
    fixtures,
  };
}

async function scoreOneRun(
  provider: LlmProvider,
  fixture: Fixture,
  model: string,
  run: number,
  override: InstructionsOverride | undefined,
  priorNoteCount: number,
): Promise<NoteScore> {
  const began = Date.now();
  try {
    const { sections, stats } = await generateOnce(provider, fixture, override, priorNoteCount);
    return scoreNote(fixture, sections, {
      model,
      run,
      stats: toRunStats(stats, Date.now() - began),
    });
  } catch (error) {
    return failedNote(fixture, model, run, error instanceof Error ? error.message : String(error));
  }
}

async function generateOnce(
  provider: LlmProvider,
  fixture: Fixture,
  override: InstructionsOverride | undefined,
  priorNoteCount: number,
): Promise<{ sections: Record<string, string>; stats: LlmStats }> {
  const stream = provider.generateNote({
    instructions: instructionsFor(fixture, override),
    sections: fixture.sections,
    formatName: formatNameFor(fixture),
    ...(priorNoteCount > 0 && fixture.priorNotes !== undefined
      ? { priorNotes: fixture.priorNotes.slice(0, priorNoteCount) }
      : {}),
    ...draftSourceFor(fixture),
  });
  for await (const event of stream) {
    if (event.type === 'sections') return { sections: event.sections, stats: event.stats };
  }
  throw new Error('the provider finished without producing a note');
}

export interface Sensitivity {
  readonly bannedStrings: number;
  readonly gatingConclusions: number;
  readonly filledBlanks: number;
  readonly cleanFixtures: number;
  readonly deflects: boolean;
}

/**
 * Does the harness actually deflect?
 *
 * A clean report and a blind harness produce the same table, and nothing in
 * that table tells them apart. The eval corpus README calls this out as the
 * failure most likely to be shipped: "if arm C does not fire, the harness is
 * blind, and no conclusion about arm B is admissible."
 *
 * Fake mode is the hermetic version of that positive control. The fake
 * provider answers with the prototype's canned sample notes — "Continue weekly
 * sessions", "No prior therapy. Family history of anxiety", "responding well
 * to current CBT approach" — which is, by accident and then on purpose,
 * exactly the material these fixtures are built to catch. So a fake run must
 * produce F1 hits, gating F6 hits and filled blanks, **and** must leave some
 * fixtures clean: a scorer that gated everything would also pass a
 * fires-on-everything check.
 */
export function sensitivity(models: readonly ModelReport[]): Sensitivity {
  const scores = models.flatMap((model) => model.scores);
  const bannedStrings = scores.filter((score) => score.bannedHits.length > 0).length;
  const gatingConclusions = scores.filter((score) =>
    score.gating.includes('F6 unsupported conclusion'),
  ).length;
  const filledBlanks = scores
    .flatMap((score) => score.sections)
    .filter((section) => section.blankOutcome === 'filled').length;
  const cleanFixtures = scores.filter((score) => score.gating.length === 0).length;

  return {
    bannedStrings,
    gatingConclusions,
    filledBlanks,
    cleanFixtures,
    deflects: bannedStrings > 0 && gatingConclusions > 0 && filledBlanks > 0 && cleanFixtures > 0,
  };
}

export function toRunStats(stats: LlmStats, wallMs: number): RunStats {
  return {
    promptTokens: stats.promptTokens,
    outputTokens: stats.outputTokens,
    evalNanos: stats.evalNanos,
    doneReason: stats.doneReason,
    attempts: stats.attempts,
    wallMs,
    contextFull: stats.promptTokens >= NUM_CTX - CONTEXT_FULL_MARGIN,
  };
}
