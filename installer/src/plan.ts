import { DEFAULT_TIER_GIB, LARGE_TIER_GIB, modelForMemory } from '@apunta/shared';

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
 * the tier choice and the wording all be tested on Linux
 * (`docs/agents/M8-installer.md`, acceptance criteria).
 *
 * The tier table itself is `@apunta/shared`'s, the same one the server and
 * `scripts/setup-macos.sh` use. Reimplementing it here is the specific mistake
 * the packet names.
 */

export interface PlanInput {
  /** Installed RAM, or null where it could not be read. */
  readonly memoryGib: number | null;
  /** `llm_model` from Settings, or a `--model` override. Beats the table. */
  readonly modelOverride?: string | null;
  readonly speechModelPresent: boolean;
  readonly previewModelPresent: boolean;
  readonly writingModelPresent: boolean;
  /** Free bytes on the volume holding the data directory, or null. */
  readonly freeBytes: number | null;
}

/**
 * Why this Mac got this model, in words she can check against the machine.
 *
 * The boundaries are named because the answer "it chose the small one" is
 * useless without "because this Mac has 8 GB and the middle model needs 16".
 */
export function explainChoice(memoryGib: number | null, tag: string, overridden: boolean): string {
  if (overridden) {
    return `Apunta is set to use ${tag}. That was chosen for this Mac rather than by Apunta.`;
  }
  if (memoryGib === null) {
    return (
      `Apunta could not read how much memory this Mac has, so it chose ${tag} — the smallest of ` +
      'the three writing models. It works on any Mac; the notes are a little rougher than the ' +
      'larger models produce.'
    );
  }
  const rounded = Math.round(memoryGib);
  if (memoryGib >= LARGE_TIER_GIB) {
    return (
      `This Mac has ${String(rounded)} GB of memory, which is enough for the largest of the three ` +
      `writing models, so Apunta chose ${tag}. It writes the best notes and is the slowest.`
    );
  }
  if (memoryGib >= DEFAULT_TIER_GIB) {
    return (
      `This Mac has ${String(rounded)} GB of memory, so Apunta chose ${tag} — the middle of three ` +
      `writing models. The largest one needs ${String(LARGE_TIER_GIB)} GB, because the Mac can only ` +
      'give the model about three quarters of its memory.'
    );
  }
  return (
    `This Mac has ${String(rounded)} GB of memory, so Apunta chose ${tag} — the smallest of three ` +
    `writing models. The next one up needs ${String(DEFAULT_TIER_GIB)} GB. This one works; the notes ` +
    'are a little rougher, and there is more to read before publishing.'
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
  const override = input.modelOverride?.trim();
  const overridden = typeof override === 'string' && override !== '';
  const tag = overridden ? override : modelForMemory(input.memoryGib);
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
    reason: explainChoice(input.memoryGib, tag, overridden),
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
    'copy these models — this Mac downloads it from its publisher, under the publisher’s terms, ' +
    `which are here: ${model.licence.url}`
  );
}
