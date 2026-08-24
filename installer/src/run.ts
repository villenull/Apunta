import { statSync } from 'node:fs';
import { join } from 'node:path';

import { describeProgress, progressSnapshot } from './bytes.js';
import { SPEECH_MODEL } from './catalog.js';
import { verifyFile } from './checksum.js';
import { freeBytesFor } from './disk.js';
import { commitDownload, discardDownload, downloadWithResume } from './download.js';
import { describeFailure, setupError } from './errors.js';
import { hasModel, pullModel, waitForOllama } from './ollama.js';
import { buildPlan, describeWeightsProvenance } from './plan.js';
import type { PlanEvent, SetupEvent } from './protocol.js';

/**
 * First-run setup, start to finish.
 *
 * Runs under the bundled `node`, writes NDJSON to stdout, and never draws
 * anything. Everything it decides it decides in `plan.ts`, `disk.ts` and
 * `resume.ts`, all of which are pure and tested; what is left here is the
 * order of operations and the sentences.
 *
 * Two properties matter more than the happy path:
 *
 *  - **Nothing is downloaded before the disk is checked.** The check runs
 *    against the volume that holds the data directory, not the boot volume.
 *  - **Every failure leaves a state a retry can continue from.** A partial
 *    download keeps its bytes and its sidecar; a *corrupt* download is deleted
 *    so the retry cannot resume onto bad bytes.
 */

export interface SetupEnvironment {
  readonly dataDir: string;
  readonly modelsDir: string;
  readonly ollamaBaseUrl: string;
  readonly memoryGib: number | null;
  readonly modelOverride: string | null;
  readonly emit: (event: SetupEvent) => void;
  readonly fetchImpl?: typeof fetch;
  readonly signal?: AbortSignal | undefined;
  /** How long the runtime gets to come up before setup gives up on it. */
  readonly runtimeWaitMs?: number;
  readonly now?: () => number;
  /** Injected by tests; production reads the real volume. */
  readonly freeBytesImpl?: (path: string) => number | null;
}

export interface ProbedState {
  readonly speechModelPresent: boolean;
  readonly writingModelPresent: boolean;
  readonly freeBytes: number | null;
  readonly runtimeReachable: boolean;
}

const DEFAULT_RUNTIME_WAIT_MS = 30_000;

/** Where the speech model lives once it is downloaded. */
export function speechModelPath(modelsDir: string): string {
  return join(modelsDir, SPEECH_MODEL.filename);
}

/**
 * A file counts as present only at its final name.
 *
 * A `.part` is not the model, and a zero-byte file left by a disk that filled
 * up is not either — treating either as "done" is how an app decides it is set
 * up and then fails at the first recording.
 */
function fileIsPresent(path: string): boolean {
  try {
    return statSync(path).size > 0;
  } catch {
    return false;
  }
}

export async function probeState(environment: SetupEnvironment): Promise<ProbedState> {
  const client = {
    baseUrl: environment.ollamaBaseUrl,
    ...(environment.fetchImpl === undefined ? {} : { fetchImpl: environment.fetchImpl }),
    signal: environment.signal,
  };

  const runtimeReachable = await waitForOllama({
    ...client,
    timeoutMs: environment.runtimeWaitMs ?? DEFAULT_RUNTIME_WAIT_MS,
    ...(environment.now === undefined ? {} : { now: environment.now }),
  });

  const tag = environment.modelOverride;
  const writingModelPresent =
    runtimeReachable && tag !== null && tag !== '' ? await hasModel(tag, client) : false;

  return {
    speechModelPresent: fileIsPresent(speechModelPath(environment.modelsDir)),
    writingModelPresent,
    freeBytes: (environment.freeBytesImpl ?? freeBytesFor)(environment.dataDir),
    runtimeReachable,
  };
}

/**
 * Work out what needs doing, and say so.
 *
 * The writing model's tag comes out of the plan, but knowing whether it is
 * already pulled needs the tag first — so the plan is built twice: once to
 * learn the tag, once with the answer. Both are pure and free.
 */
export interface PlanWithState {
  readonly plan: PlanEvent;
  readonly state: ProbedState;
}

export async function makePlan(environment: SetupEnvironment): Promise<PlanWithState> {
  const provisional = buildPlan({
    memoryGib: environment.memoryGib,
    modelOverride: environment.modelOverride,
    speechModelPresent: true,
    writingModelPresent: true,
    freeBytes: null,
  });

  const state = await probeState({ ...environment, modelOverride: provisional.model.tag });

  const plan = buildPlan({
    memoryGib: environment.memoryGib,
    modelOverride: environment.modelOverride,
    speechModelPresent: state.speechModelPresent,
    writingModelPresent: state.writingModelPresent,
    freeBytes: state.freeBytes,
  });

  return { plan, state };
}

/**
 * Do it.
 *
 * Emits the plan first — so the window can show what it is about to do even
 * when it goes straight on and does it — then each step, then `done`. Any
 * throw becomes a single `failed` event with a sentence and a Try again flag;
 * nothing gets out of here as a stack trace.
 */
export async function runSetup(environment: SetupEnvironment): Promise<boolean> {
  try {
    const { plan, state } = await makePlan(environment);
    environment.emit(plan);

    if (plan.ready) {
      environment.emit({ event: 'message', text: 'Everything Apunta needs is already here.' });
      environment.emit({ event: 'done', ok: true });
      return true;
    }

    if (!plan.disk.ok) {
      throw setupError('not_enough_disk', 'insufficient free space', plan.disk.message);
    }

    // The writing model is pulled *by* the runtime, so an unreachable runtime
    // is its own failure with its own sentence — not a download that dies of a
    // connection error thirty seconds later and blames the internet.
    const needsRuntime = plan.steps.some((step) => step.id === 'writing_model' && step.needed);
    if (needsRuntime && !state.runtimeReachable) {
      throw setupError('runtime_unreachable', `nothing answered at ${environment.ollamaBaseUrl}`);
    }

    for (const step of plan.steps) {
      if (!step.needed) {
        environment.emit({ event: 'step', id: step.id, status: 'skipped', label: step.label });
        continue;
      }
      environment.emit({ event: 'step', id: step.id, status: 'started', label: step.label });
      if (step.id === 'speech_model') {
        await downloadSpeechModel(environment);
      } else {
        environment.emit({
          event: 'message',
          text: describeWeightsProvenance(plan.model),
        });
        await pullWritingModel(environment, plan.model.tag);
      }
      environment.emit({ event: 'step', id: step.id, status: 'finished', label: step.label });
    }

    environment.emit({ event: 'message', text: 'Apunta is ready.' });
    environment.emit({ event: 'done', ok: true });
    return true;
  } catch (error) {
    const failure = describeFailure(error);
    environment.emit({ event: 'failed', ...failure });
    return false;
  }
}

async function downloadSpeechModel(environment: SetupEnvironment): Promise<void> {
  const destination = speechModelPath(environment.modelsDir);
  const checksum = SPEECH_MODEL.sha256 ?? SPEECH_MODEL.sha1;

  const result = await downloadWithResume({
    url: SPEECH_MODEL.url,
    destination,
    checksum,
    signal: environment.signal,
    ...(environment.fetchImpl === undefined ? {} : { fetchImpl: environment.fetchImpl }),
    ...(environment.now === undefined ? {} : { now: environment.now }),
    onProgress: (progress) => {
      const snapshot = progressSnapshot(progress);
      environment.emit({
        event: 'progress',
        id: 'speech_model',
        completedBytes: snapshot.completedBytes,
        totalBytes: snapshot.totalBytes,
        percent: snapshot.percent,
        bytesPerSecond: snapshot.bytesPerSecond,
        etaSeconds: snapshot.etaSeconds,
        detail: describeProgress(snapshot),
      });
    },
  });

  if (result.plan.mode === 'resume') {
    environment.emit({
      event: 'message',
      text: 'Picking up where the last download stopped.',
    });
  }

  environment.emit({
    event: 'step',
    id: 'speech_model',
    status: 'verifying',
    label: 'Checking the download',
  });

  const verification = await verifyFile(
    `${destination}.part`,
    { sha1: SPEECH_MODEL.sha1, sha256: SPEECH_MODEL.sha256 },
    environment.signal,
  );

  if (!verification.ok) {
    await discardDownload(destination);
    if (verification.checked.length === 0) {
      // A catalogue entry with no checksum at all. Refusing is the only safe
      // answer: an unverified 574 MB file is exactly what a checksum is for.
      throw setupError('checksum_mismatch', 'no checksum is pinned for the speech model');
    }
    throw setupError(
      'checksum_mismatch',
      `${verification.algorithm ?? 'checksum'} mismatch: expected ${verification.expected ?? '?'}, got ${verification.actual ?? '?'}`,
    );
  }

  await commitDownload(destination);
}

async function pullWritingModel(environment: SetupEnvironment, tag: string): Promise<void> {
  const startedAt = (environment.now ?? Date.now)();
  await pullModel({
    tag,
    baseUrl: environment.ollamaBaseUrl,
    ...(environment.fetchImpl === undefined ? {} : { fetchImpl: environment.fetchImpl }),
    signal: environment.signal,
    onProgress: (progress) => {
      const snapshot = progressSnapshot({
        completedBytes: progress.completedBytes,
        totalBytes: progress.totalBytes,
        resumedFromBytes: 0,
        elapsedMs: (environment.now ?? Date.now)() - startedAt,
      });
      environment.emit({
        event: 'progress',
        id: 'writing_model',
        completedBytes: snapshot.completedBytes,
        totalBytes: snapshot.totalBytes,
        percent: snapshot.percent,
        bytesPerSecond: snapshot.bytesPerSecond,
        etaSeconds: snapshot.etaSeconds,
        detail: describeProgress(snapshot),
      });
    },
  });
}
