import { statSync } from 'node:fs';
import { join } from 'node:path';

import { describeProgress, progressSnapshot } from './bytes.js';
import { PREVIEW_SPEECH_MODEL, SPEECH_MODEL, type SpeechModelEntry } from './catalog.js';
import { hashFile, verifyFile } from './checksum.js';
import { freeBytesFor } from './disk.js';
import { commitDownload, discardDownload, downloadWithResume } from './download.js';
import { describeFailure, setupError } from './errors.js';
import { hasModel, pullModel, waitForOllama, type PullResult } from './ollama.js';
import { buildPlan, describeWeightsProvenance } from './plan.js';
import type { PlanEvent, SetupEvent } from './protocol.js';
import { assessModel, ModelRefusedError, writeReceiptFor } from './readiness.js';

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
  readonly previewModelPresent: boolean;
  readonly writingModelPresent: boolean;
  readonly freeBytes: number | null;
  readonly runtimeReachable: boolean;
}

const DEFAULT_RUNTIME_WAIT_MS = 30_000;

/** Where the speech model lives once it is downloaded. */
export function speechModelPath(modelsDir: string): string {
  return join(modelsDir, SPEECH_MODEL.filename);
}

/** Where the preview's smaller model lives, beside it. */
export function previewModelPath(modelsDir: string): string {
  return join(modelsDir, PREVIEW_SPEECH_MODEL.filename);
}

/**
 * A file counts as present only if readiness says it is *ready* — the exact
 * pinned bytes, verified — and never merely because something is there.
 *
 * The three booleans are all the plan is allowed to see, and they are derived
 * from `readiness.ts`'s verdict and from nothing else. The verdict's own code
 * is not widened into `ProbedState`, because `plan.ts` and `protocol.ts` are
 * not this card's to change; putting a code on the wire is P4.4's.
 */
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

  const [speech, preview] = await Promise.all([
    assessModel(SPEECH_MODEL, speechModelPath(environment.modelsDir)),
    assessModel(PREVIEW_SPEECH_MODEL, previewModelPath(environment.modelsDir)),
  ]);

  return {
    speechModelPresent: speech.state === 'ready',
    previewModelPresent: preview.state === 'ready',
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
    previewModelPresent: true,
    writingModelPresent: true,
    freeBytes: null,
  });

  const state = await probeState({ ...environment, modelOverride: provisional.model.tag });

  const plan = buildPlan({
    memoryGib: environment.memoryGib,
    modelOverride: environment.modelOverride,
    speechModelPresent: state.speechModelPresent,
    previewModelPresent: state.previewModelPresent,
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
        await downloadSpeechFile(environment, SPEECH_MODEL, 'speech_model');
      } else if (step.id === 'preview_model') {
        await downloadSpeechFile(environment, PREVIEW_SPEECH_MODEL, 'preview_model');
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

/**
 * One whisper file, verified against its pinned checksum; the two speech models
 * differ only in entry and step.
 *
 * The receipt is written here and nowhere else, and only after the bytes have
 * been checked — either by the fresh hash that just passed, or by the rename of
 * a verified `.part`. `assessModel` never writes: a run that only probes has
 * written nothing by the time this is reached.
 */
export async function downloadSpeechFile(
  environment: SetupEnvironment,
  entry: SpeechModelEntry,
  stepId: 'speech_model' | 'preview_model',
): Promise<void> {
  const destination = join(environment.modelsDir, entry.filename);
  const checksum = entry.sha256 ?? entry.sha1;

  // An entry with no pinned digest can never be verified, so it is refused
  // before a socket opens rather than after 75 MiB have been fetched. This
  // refusal used to sit below the download, where it could only be reached by
  // first downloading a file nobody would accept.
  if (checksum === null || checksum === '') {
    throw setupError('checksum_mismatch', `no checksum is pinned for ${entry.filename}`);
  }

  const result = await downloadWithResume({
    url: entry.url,
    destination,
    checksum,
    allowance: entry.allowance,
    allowedQueryKeys: entry.allowedQueryKeys,
    signal: environment.signal,
    ...(environment.fetchImpl === undefined ? {} : { fetchImpl: environment.fetchImpl }),
    ...(environment.now === undefined ? {} : { now: environment.now }),
    onProgress: (progress) => {
      const snapshot = progressSnapshot(progress);
      environment.emit({
        event: 'progress',
        id: stepId,
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
    id: stepId,
    status: 'verifying',
    label: 'Checking the download',
  });

  const verification = await verifyFile(
    `${destination}.part`,
    { sha1: entry.sha1, sha256: entry.sha256 },
    environment.signal,
  );

  if (!verification.ok) {
    await discardDownload(destination);
    throw setupError(
      'checksum_mismatch',
      `${verification.algorithm ?? 'checksum'} mismatch: expected ${verification.expected ?? '?'}, got ${verification.actual ?? '?'}`,
    );
  }

  await commitDownload(destination);

  // A file whose bytes match the pinned digest and whose size is not the pinned
  // size is a contradiction: the pin is wrong, not the file, and downloading
  // again cannot fix it. The verified file is left where it is rather than
  // deleted — it is not corrupt — and no receipt is written, because a receipt
  // asserting the pinned size would be false.
  const size = statSync(destination).size;
  if (size !== entry.sizeBytes) {
    throw new ModelRefusedError(
      'size_mismatch',
      `The downloaded file is ${String(size)} bytes and the catalogue pins ${String(entry.sizeBytes)} for ` +
        `${entry.filename}. The bytes match the pinned digest, so the pin is wrong rather than the download; ` +
        'this is not something trying again can fix.',
    );
  }

  // One extra hash of the committed file, to record the digest the receipt
  // asserts. `verifyFile` checks but does not return, and `checksum.ts` is not
  // this card's to change; correctness is worth one hash of 75 MiB.
  const algorithm = entry.sha256 !== null ? 'sha256' : 'sha1';
  const digest = await hashFile(destination, algorithm, environment.signal);
  writeReceiptFor(destination, entry, digest);
}

async function pullWritingModel(environment: SetupEnvironment, tag: string): Promise<void> {
  const startedAt = (environment.now ?? Date.now)();
  const result = await pullModel({
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

  environment.emit({ event: 'message', text: describePulledTag(result) });
}

/**
 * What Apunta can honestly say about a writing model it asked the runtime to
 * pull.
 *
 * The digest is the part worth having: it names the exact bytes now in the
 * runtime's store, read back over loopback with `POST /api/show`. The
 * sentence around it is not decoration — the fetch was the **runtime's**, from
 * whatever registry the runtime chose, and Apunta checked the tag afterwards
 * rather than the journey there. A user who cannot tell which of the two
 * programs reached the internet cannot reason about either one, and this is
 * where they are told. (`WritingModelEntry`'s doc comment in `catalog.ts` is
 * the other half of the same statement.)
 */
export function describePulledTag(result: PullResult): string {
  const named =
    result.digest === null
      ? `Apunta's AI engine did not report a digest for ${result.tag}, so the exact bytes in its store ` +
        'cannot be named here.'
      : `It reports digest ${result.digest} for ${result.tag}.`;
  return (
    `${result.tag} is downloaded. ${named} The download was done by Apunta's own AI engine rather than by ` +
    'the installer, so where that engine fetched it from is its own business and Apunta did not check — it ' +
    'asked the engine afterwards which model it ended up holding.'
  );
}
