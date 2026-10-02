import { existsSync } from 'node:fs';

import { PROMOTED_DEFAULT_MODEL } from '@apunta/shared';
import { textToSections } from '@apunta/shared';

import { loadControls, type ControlScore } from './controls.js';
import { draftSourceFor, type Fixture } from './corpus.js';
import {
  buildIdentity,
  readModelDigest,
  readOllamaProcessor,
  readOllamaVersion,
  type ReportIdentity,
} from './identity.js';
import { loadLocaleLexicon, type EvalLocale, type LexiconTerm } from './lexicon.js';
import { renderReport, type ModelReport } from './report.js';
import { failedNote, scoreNote, type NoteScore } from './score.js';
import { denominators } from './corpus.js';

/**
 * `--mode pipeline`: the acceptance measurement (C-EVAL@1 §1).
 *
 * The provider path is a diagnostic; this one is the note the server's draft
 * route actually persists, **read back from the API after persistence**. The
 * difference between what the SSE stream carried and what was stored is exactly
 * what this mode exists to see, so the `note` frame is never scored and is not a
 * fallback.
 *
 * It drives the HTTP surface and does not call a provider. Every pre-flight
 * refusal below is exit 2, before a single fixture is touched: a pipeline run
 * against a fake or foreign server measures nothing, and says so.
 */

/** The same loopback refusal `scripts/check-note-format.mjs` makes, for the same reason. */
const CHECK_URL = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/;

export class PipelineRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PipelineRefusal';
  }
}

/** A failure of the run itself, recorded per fixture rather than thrown (FD5). */
class FixtureFailure extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FixtureFailure';
  }
}

export interface HealthPayload {
  ok?: boolean;
  version?: string;
  fakeAi?: boolean;
  bundled?: boolean;
  testRunId?: string;
  ollama?: { tag?: string; model?: string; modelPresent?: boolean; reachable?: boolean };
}

export interface SettingsPayload {
  language?: string;
  spanish_available?: boolean;
}

export interface FormatPayload {
  id: string;
  name: string;
  sections: string[];
  instructions: string;
  locale: string;
}

export interface NotePayload {
  id: string;
  content: string;
  format_id: string;
  locale: string;
}

export interface PipelineRunOptions {
  readonly models: readonly string[];
  readonly runs: number;
  readonly locale: EvalLocale;
  readonly fixtures: readonly Fixture[];
  readonly corpusDirectory: string | undefined;
  readonly controlsDirectory?: string | undefined;
  readonly controlsSuppressed: boolean;
  readonly blindLexicon: 'negation' | 'clinical' | 'number' | 'unit' | 'medication' | 'all' | undefined;
  /** Resolved `--out`. Pipeline mode refuses an existing path (FD5). */
  readonly out: string | undefined;
  readonly fixtureFilter: string | undefined;
  readonly onProgress?: (line: string) => void;
}

export interface PipelineRunResult {
  readonly markdown: string;
  readonly models: readonly ModelReport[];
  readonly controls: readonly ControlScore[];
  readonly identity: ReportIdentity;
  /** The format each fixture was drafted through, for the report and the return. */
  readonly formatNames: ReadonlyMap<string, string>;
}

/**
 * FD5's refuse-to-overwrite, made testable without a server.
 *
 * A spent path costs no measurement, and the invariant (a report is never
 * overwritten) holds whatever happens later in the run, so the check is made
 * **before the first fixture and before any model call**.
 *
 * `--mode provider` returns `undefined` and keeps today's overwrite behaviour
 * byte for byte, including the truncation — the refusal is scoped to the mode
 * this card introduces, so no existing card's `--out` changes meaning.
 */
export function refuseExistingOut(
  mode: 'provider' | 'pipeline',
  out: string | undefined,
): string | undefined {
  if (mode !== 'pipeline' || out === undefined) return undefined;
  if (!existsSync(out)) return undefined;
  return (
    `--out ${out} already exists. A pipeline report is never silently replaced: a re-attempt ` +
    `writes attempt-<n+1>/ and leaves this one byte for byte where it is (FD5, C-ISO@1 N-5).`
  );
}

/** The loopback, sandbox-range check on `APUNTA_CHECK_URL` (FD4 step 0). */
export function checkBaseUrl(raw: string | undefined): string {
  if (raw === undefined || raw === '') {
    throw new PipelineRefusal(
      'APUNTA_CHECK_URL is unset. --mode pipeline measures a server; run it through ' +
        'scripts/v2/sandbox.mjs run, which sets it (C-ISO@1 rule 6).',
    );
  }
  if (!CHECK_URL.test(raw)) {
    throw new PipelineRefusal(
      `APUNTA_CHECK_URL refuses ${raw}: it must be http://127.0.0.1[:port] or http://localhost[:port].`,
    );
  }
  const port = Number(new URL(raw).port || '80');
  if (port === 7717) {
    throw new PipelineRefusal(`APUNTA_CHECK_URL refuses port 7717: that is the live instance (HS-1).`);
  }
  if (port < 7800 || port > 7889) {
    throw new PipelineRefusal(
      `APUNTA_CHECK_URL port ${String(port)} is outside the sandbox range 7800-7889 (C-ISO@1 rule 2).`,
    );
  }
  return raw.replace(/\/$/, '');
}

/** HS-8: the English corpora use the prototype's sample practice; Spanish uses NAMES.md. */
export const ENGLISH_EVAL_PATIENT = 'John Smith';
export const SPANISH_EVAL_PATIENT = 'César Xicará Pantoja';

async function json<T>(
  base: string,
  path: string,
  init: { method: string; body?: unknown },
): Promise<{ status: number; body: T; text: string }> {
  const response = await fetch(`${base}${path}`, {
    method: init.method,
    ...(init.body === undefined
      ? {}
      : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(init.body) }),
  });
  const text = await response.text();
  let body: unknown;
  try {
    body = text === '' ? {} : JSON.parse(text);
  } catch {
    body = {};
  }
  return { status: response.status, body: body as T, text };
}

/**
 * FD4 step 0a: **the drafting language is a setting, not the format's locale.**
 *
 * `routes/generate.ts` reads `storedLanguage(db)` and `routes/draft.ts` copies
 * `format.locale` onto the note — so an `es-MX` run against a server whose
 * stored language is English would draft **in English** and stamp the note
 * `es-MX`, and `note.locale` could not reveal it. The settings read is the
 * evidence of drafting language; `note.locale` is not.
 */
async function assertDraftingLanguage(base: string, locale: EvalLocale): Promise<SettingsPayload> {
  if (locale !== 'es-MX')
    return json<SettingsPayload>(base, '/api/settings', { method: 'GET' }).then((r) => r.body);

  const put = await json<SettingsPayload>(base, '/api/settings', {
    method: 'PUT',
    body: { language: 'es-MX' },
  });
  if (put.status === 409 || put.text.includes('language_change_blocked')) {
    throw new PipelineRefusal(
      `PUT /api/settings {"language":"es-MX"} was refused with 409 language_change_blocked: ${put.text}`,
    );
  }
  if (put.status >= 400 || put.text.includes('language_unavailable')) {
    throw new PipelineRefusal(
      `PUT /api/settings {"language":"es-MX"} was refused (${String(put.status)}). The server must be ` +
        `started with APUNTA_DEV_SPANISH=1 for an es-MX pipeline run (routes/settings.ts:26-32): ${put.text}`,
    );
  }
  if (put.body.language !== 'es-MX') {
    throw new PipelineRefusal(
      `PUT /api/settings answered language "${String(put.body.language)}", not es-MX.`,
    );
  }
  return json<SettingsPayload>(base, '/api/settings', { method: 'GET' }).then((r) => r.body);
}

interface SseFrame {
  readonly event: string;
  readonly data: unknown;
}

export function parseSse(text: string): SseFrame[] {
  const frames: SseFrame[] = [];
  for (const block of text.split('\n\n')) {
    let event = 'message';
    const dataLines: string[] = [];
    for (const line of block.split('\n')) {
      if (line.startsWith('event: ')) event = line.slice('event: '.length).trim();
      else if (line.startsWith('data: ')) dataLines.push(line.slice('data: '.length));
    }
    if (dataLines.length === 0) continue;
    try {
      frames.push({ event, data: JSON.parse(dataLines.join('\n')) as unknown });
    } catch {
      frames.push({ event, data: dataLines.join('\n') });
    }
  }
  return frames;
}

export async function runPipeline(options: PipelineRunOptions): Promise<PipelineRunResult> {
  const startedAt = new Date();
  const started = Date.now();

  // ---- pre-flight: nothing below this line runs if any of it fails ----
  const spent = refuseExistingOut('pipeline', options.out);
  if (spent !== undefined) throw new PipelineRefusal(spent);

  const base = checkBaseUrl(process.env['APUNTA_CHECK_URL']);
  const expectedRunId = process.env['APUNTA_TEST_RUN_ID'];
  if (expectedRunId === undefined || expectedRunId === '') {
    throw new PipelineRefusal(
      'APUNTA_TEST_RUN_ID is unset, so the ownership check of C-ISO@1 rule 5 cannot be made. ' +
        'Run through scripts/v2/sandbox.mjs run.',
    );
  }

  const health = await json<HealthPayload>(base, '/api/health', { method: 'GET' });
  if (health.status !== 200 || health.body.ok !== true) {
    throw new PipelineRefusal(`GET /api/health answered ${String(health.status)}: ${health.text}`);
  }
  if (health.body.fakeAi !== false) {
    throw new PipelineRefusal(
      `GET /api/health reports fakeAi=${String(health.body.fakeAi)}. A pipeline run against a fake ` +
        `server measures nothing (FD4 step 0).`,
    );
  }
  if (health.body.testRunId !== expectedRunId) {
    throw new PipelineRefusal(
      `GET /api/health reports testRunId="${String(health.body.testRunId)}", not this sandbox's ` +
        `"${expectedRunId}". That is a foreign server (C-ISO@1 rule 5).`,
    );
  }
  const serverTag = health.body.ollama?.tag;
  const serverModel = health.body.ollama?.model;
  if (serverTag === undefined || serverTag === '') {
    throw new PipelineRefusal('GET /api/health carried no ollama.tag; there is nothing to measure.');
  }
  // FD4 step 6: `--models` is a **label** here, and a silent disagreement between
  // the tag in the report and the tag that answered is the one failure mode that
  // makes a whole baseline section worthless.
  if (!options.models.includes(serverTag)) {
    throw new PipelineRefusal(
      `/api/health reports ollama.tag="${serverTag}" but --models names ` +
        `${options.models.map((model) => `"${model}"`).join(', ')}. In pipeline mode --models is a ` +
        `label for the server's own resolved model, not a control (FD4 step 6).`,
    );
  }

  const ollamaUrl = process.env['APUNTA_OLLAMA_URL'] ?? 'http://127.0.0.1:11434';
  const digest = await readModelDigest(ollamaUrl, serverTag);
  if (digest === undefined || digest === '') {
    // FD7: the digest is not in /api/health, and the pipeline runner fails rather
    // than records a blank one.
    throw new PipelineRefusal(
      `could not read a digest for "${serverTag}" from ${ollamaUrl}/api/tags. C-EVAL@1 §7 records the ` +
        `model digest for every run and this runner will not record a blank one (FD7).`,
    );
  }

  const label = options.models[0] ?? PROMOTED_DEFAULT_MODEL;

  // ---- step 0a, once per invocation, before the first fixture ----
  await assertDraftingLanguage(base, options.locale);

  // ---- step 1: one patient for the whole invocation ----
  const patientName = options.locale === 'es-MX' ? SPANISH_EVAL_PATIENT : ENGLISH_EVAL_PATIENT;
  const patient = await json<{ id: string }>(base, '/api/patients', {
    method: 'POST',
    body: { name: patientName },
  });
  if (patient.status >= 400 || typeof patient.body.id !== 'string') {
    throw new PipelineRefusal(`POST /api/patients answered ${String(patient.status)}: ${patient.text}`);
  }

  // ---- step 2: one format per distinct `(format, sections)` pair ----
  const formats = new Map<string, FormatPayload>();
  const formatNames = new Map<string, string>();
  for (const fixture of options.fixtures) {
    const key = `${fixture.format}|${fixture.sections.join(' ')}`;
    if (formats.has(key)) continue;
    const created = await json<FormatPayload>(base, '/api/formats', {
      method: 'POST',
      body: {
        // Pinned to the exact literal the provider path uses, because
        // `defaultInstructionsFor` matches the section list first, then
        // `BY_FORMAT_NAME`, then a generic fallback — and the owner's own format
        // matches no `BY_SECTIONS` entry, so the name alone decides its
        // instructions there. An unpinned name would get `GENERIC_INSTRUCTIONS`
        // while the provider path gets the owner's progress instructions, and the
        // two modes would stop measuring the same prompt.
        name: fixture.format === 'intake' ? 'Intake note' : 'Progress note',
        sections: [...fixture.sections],
        locale: options.locale,
      },
    });
    if (created.status >= 400 || typeof created.body.id !== 'string') {
      throw new PipelineRefusal(`POST /api/formats answered ${String(created.status)}: ${created.text}`);
    }
    // The runner asserts the created format, because a format-integrity failure
    // here is an inadmissible run, not a low score (FD10).
    if (JSON.stringify(created.body.sections) !== JSON.stringify([...fixture.sections])) {
      throw new PipelineRefusal(
        `POST /api/formats stored sections ${JSON.stringify(created.body.sections)}, not ` +
          `${JSON.stringify([...fixture.sections])} for ${fixture.filename}.`,
      );
    }
    if (created.body.locale !== options.locale) {
      throw new PipelineRefusal(
        `POST /api/formats stored locale "${String(created.body.locale)}", not ${options.locale}.`,
      );
    }
    if (created.body.instructions !== '') {
      throw new PipelineRefusal(
        `POST /api/formats stored instructions ${JSON.stringify(created.body.instructions)}; with no ` +
          `instructions field the server must apply instructionsFor('', name, sections).`,
      );
    }
    formats.set(key, created.body);
  }

  // ---- steps 3 and 4, per fixture per run ----
  const lexicon: readonly LexiconTerm[] = loadLocaleLexicon(options.locale);
  const scores: NoteScore[] = [];
  for (const fixture of options.fixtures) {
    const key = `${fixture.format}|${fixture.sections.join(' ')}`;
    const format = formats.get(key);
    if (format === undefined) throw new PipelineRefusal(`no format was created for ${fixture.filename}`);
    formatNames.set(fixture.filename, format.name);

    for (let run = 1; run <= options.runs; run += 1) {
      options.onProgress?.(`${fixture.filename} · run ${String(run)}`);
      scores.push(await pipelineRunOnce(base, patient.body.id, fixture, format, label, run, lexicon));
    }
  }

  // ---- step 0a, read back once more after the last fixture ----
  const after = await assertDraftingLanguage(base, options.locale);
  if (options.locale === 'es-MX' && after.language !== 'es-MX') {
    throw new PipelineRefusal(
      `GET /api/settings after the last fixture reports language "${String(after.language)}", not es-MX.`,
    );
  }

  const models: ModelReport[] = [{ model: label, runs: options.runs, scores }];
  const controls =
    options.controlsSuppressed || options.controlsDirectory === undefined
      ? []
      : loadControls({
          directory: options.controlsDirectory,
          locale: options.locale,
          ...(options.blindLexicon === undefined ? {} : { blindLexicon: options.blindLexicon }),
        }).controls;

  const ollamaVersion = await readOllamaVersion(ollamaUrl);
  const ollamaProcessor = await readOllamaProcessor(ollamaUrl, serverTag);
  const identity = buildIdentity({
    mode: 'pipeline',
    locale: options.locale,
    modelTag: serverTag,
    modelDigest: digest,
    corpusDirectory: options.corpusDirectory,
    controlsDirectory: options.controlsSuppressed ? undefined : options.controlsDirectory,
    ...(ollamaVersion === undefined ? {} : { ollamaVersion }),
    ...(ollamaProcessor === undefined ? {} : { ollamaProcessor }),
  });
  void serverModel;

  return {
    markdown: renderReport({
      fixtures: options.fixtures,
      denominators: denominators(options.fixtures),
      models,
      fake: false,
      mode: 'pipeline',
      locale: options.locale,
      ...(controls.length === 0 ? {} : { controls }),
      blindLexicon: options.blindLexicon,
      identity,
      priorNotesNote: 'not applicable: the draft route reads prior notes from the database itself',
      formatNames,
      startedAt,
      elapsedMs: Date.now() - started,
    }),
    models,
    controls,
    identity,
    formatNames,
  };
}

/**
 * One fixture, one run: post through the draft route, then read the note back
 * and score **that**.
 *
 * The note stays `draft`. This function never calls
 * `POST /api/notes/:id/publish`, so `fitDraftingPriorNotes` — which keeps only
 * published notes — can never feed one fixture's note to another.
 */
async function pipelineRunOnce(
  base: string,
  patientId: string,
  fixture: Fixture,
  format: FormatPayload,
  model: string,
  run: number,
  lexicon: readonly LexiconTerm[],
): Promise<NoteScore> {
  try {
    const response = await fetch(`${base}/api/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
      body: JSON.stringify({
        patient_id: patientId,
        format_id: format.id,
        title: fixture.filename,
        ...draftSourceFor(fixture),
      }),
    });
    if (!response.ok) {
      throw new FixtureFailure(`POST /api/generate answered ${String(response.status)}`);
    }
    const frames = parseSse(await response.text());
    for (const frame of frames) {
      if (frame.event === 'error') {
        throw new FixtureFailure(`the draft stream carried an error frame: ${JSON.stringify(frame.data)}`);
      }
    }
    const noteFrame = frames.find((frame) => frame.event === 'note');
    if (noteFrame === undefined) throw new FixtureFailure('the draft stream ended with no note frame');
    const streamed = (noteFrame.data as { note?: NotePayload }).note;
    if (streamed === undefined || typeof streamed.id !== 'string') {
      throw new FixtureFailure('the note frame carried no note id');
    }

    // FD4 step 4: the read-back is the scored artefact, and it is not optional.
    const read = await json<NotePayload>(base, `/api/notes/${encodeURIComponent(streamed.id)}`, {
      method: 'GET',
    });
    if (read.status >= 400 || read.status === 404) {
      throw new FixtureFailure(`GET /api/notes/${streamed.id} answered ${String(read.status)}: ${read.text}`);
    }
    const note = read.body;
    if (typeof note.content !== 'string' || note.content.trim() === '') {
      throw new FixtureFailure(`GET /api/notes/${streamed.id} returned empty note content`);
    }
    if (note.format_id !== format.id) {
      throw new FixtureFailure(
        `note.format_id ${String(note.format_id)} is not the created format's ${format.id}`,
      );
    }
    if (note.locale !== format.locale) {
      throw new FixtureFailure(
        `note.locale ${String(note.locale)} is not the created format's ${format.locale}`,
      );
    }
    const sections = textToSections(note.content, format.sections);
    if (format.sections.every((name) => (sections[name] ?? '').trim() === '')) {
      throw new FixtureFailure('textToSections returned every section empty');
    }

    return scoreNote(fixture, sections, {
      // Call site 3 of 3, and the one the card warns about hardest: without it an
      // `es-MX` pipeline run scores against the **English** clinical lexicon, no
      // row catches it, the run still exits 0, and every number this mode
      // produces is then measured against the wrong vocabulary.
      lexicon,
      model,
      run,
    });
  } catch (error) {
    // FD5's error rule: one rule, no judgement. It counts — one run in that
    // fixture's denominator, `safetyPassed: false`, printed per fixture with its
    // message verbatim. Never retried, never dropped from the min or the max.
    return failedNote(fixture, model, run, error instanceof Error ? error.message : String(error));
  }
}
