import { effectiveModel, type EffectiveModelSource } from '@apunta/shared';

import { formatBytes } from './bytes.js';
import { PREVIEW_SPEECH_MODEL, SPEECH_MODEL, writingModel } from './catalog.js';
import { checkDiskSpace } from './disk.js';
import type { ChosenModel, DiskReport, PlanEvent, PlannedStep } from './protocol.js';

/**
 * What first run has to do on *this* Mac, decided before anything is
 * downloaded.
 *
 * Entirely pure: memory in, file-presence in, free bytes in — a plan out. The
 * window is a view over this object, which is what lets the disk arithmetic,
 * the model choice and the wording all be tested on Linux
 * (`docs/agents/M8-installer.md`, acceptance criteria).
 *
 * The model is `shared/`'s resolver's answer, not a table lookup: C-MODEL@1
 * makes one policy across the installer, the server, health, preflight and the
 * eval CLI, and this is the installer's end of it. `memoryGib` is still read
 * and still reported — the window shows what it read and what else the machine
 * could run — but it no longer chooses anything.
 */

export interface PlanInput {
  /** Installed RAM, or null where it could not be read. Reported, not obeyed. */
  readonly memoryGib: number | null;
  /** `llm_model` from Settings, or a `--model` override. Beats the default. */
  readonly modelOverride?: string | null;
  readonly speechModelPresent: boolean;
  readonly previewModelPresent: boolean;
  readonly writingModelPresent: boolean;
  /** Free bytes on the volume holding the data directory, or null. */
  readonly freeBytes: number | null;
}

/**
 * Why this Mac is getting this model, in words she can check against the
 * machine.
 *
 * The answer is no longer a function of the memory, so the sentence is no
 * longer a function of the memory either. "This Mac has 8 GB, so Apunta chose
 * the small one" was true and is now the sort of half-truth that teaches an
 * owner to distrust the rest of the setup screen: the same run on a 64 GB Mac
 * would have said something different about the same model.
 */
export function explainChoice(tag: string, source: EffectiveModelSource): string {
  if (source === 'override') {
    return `Apunta is set to use ${tag}. That was chosen for this computer rather than by Apunta.`;
  }
  return (
    `Apunta uses the same writing model on every machine, and on this one that is ${tag}. It was ` +
    'not chosen from this computer’s memory, so it is the same choice here as anywhere else.'
  );
}

/**
 * Whether the preview is a file of its own.
 *
 * Dictation is English-only, so the preview and the note both run on
 * `tiny.en` and share one file. The `speech_model` step downloads it; the
 * `preview_model` step must not reach for it a second time, so it is marked
 * not needed — which also stops `requiredBytes` counting the file twice.
 */
const PREVIEW_SHARES_SPEECH_FILE = PREVIEW_SPEECH_MODEL.filename === SPEECH_MODEL.filename;

function previewNeedsItsOwnDownload(previewModelPresent: boolean): boolean {
  return !PREVIEW_SHARES_SPEECH_FILE && !previewModelPresent;
}

export function buildPlan(input: PlanInput): PlanEvent {
  // The installer has not pulled anything yet, so it has no installed list and
  // asks the resolver for the tag alone. Nothing here reads `present`.
  const resolved = effectiveModel({ override: input.modelOverride ?? null, installed: null });
  const { tag } = resolved;
  const entry = writingModel(tag);

  const steps: PlannedStep[] = [
    {
      id: 'speech_model',
      label: 'The model that reads your recordings',
      needed: !input.speechModelPresent,
      approxBytes: SPEECH_MODEL.approxBytes,
    },
    {
      id: 'preview_model',
      label: 'The model that shows your words as you speak',
      needed: previewNeedsItsOwnDownload(input.previewModelPresent),
      approxBytes: PREVIEW_SPEECH_MODEL.approxBytes,
    },
    {
      id: 'writing_model',
      label: 'The model that writes your notes',
      needed: !input.writingModelPresent,
      approxBytes: entry.approxBytes,
    },
  ];

  const requiredBytes = steps
    .filter((step) => step.needed)
    .reduce((total, step) => total + step.approxBytes, 0);

  const disk: DiskReport =
    input.freeBytes === null
      ? {
          // Refusing on an unreadable disk would strand a working Mac; the
          // download itself fails honestly if the space is not there.
          ok: true,
          freeBytes: 0,
          requiredBytes,
          headroomBytes: 0,
          shortfallBytes: 0,
          message: `${formatBytes(requiredBytes)} to download.`,
        }
      : checkDiskSpace({ freeBytes: input.freeBytes, requiredBytes });

  const model: ChosenModel = {
    tag,
    publisher: entry.publisher,
    reason: explainChoice(tag, resolved.source),
    licence: entry.licence,
  };

  return {
    event: 'plan',
    memoryGib: input.memoryGib,
    model,
    steps,
    disk,
    ready: requiredBytes === 0,
  };
}

/**
 * The sentence that names the model and its terms before anything downloads.
 *
 * This is condition 1 of the three that keep the weights at arm's length
 * (`docs/research/m8-shell-and-runtime-2026-08.md` §6.2): the person accepting
 * the publisher's terms has to be able to see whose terms they are. It says
 * "from its publisher" rather than naming a licence identifier nobody in this
 * project has read yet — the link is the part that is load-bearing, and it is
 * checked.
 */
export function describeWeightsProvenance(model: ChosenModel): string {
  return (
    `Apunta will download ${model.tag}, published by ${model.publisher}. Apunta does not host or ` +
    'copy these models — this computer downloads it from its publisher, under the publisher’s terms, ' +
    `which are here: ${model.licence.url}`
  );
}
