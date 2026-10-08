import { SetupEventSchema, type SetupEvent } from '@apunta/shared';

/**
 * What the setup process says.
 *
 * One JSON object per line on stdout. The Tauri shell spawns this process,
 * wraps each line as `setup_event{event}` and hands it to the server, which
 * validates it against the same schema and mirrors it for the page. Nothing in
 * between computes: the disk arithmetic, the tier choice, the checksum and the
 * resume bookkeeping stay here, where they are unit-tested.
 *
 * NDJSON because a line is atomic enough to relay as it comes, and it survives
 * being read by a person (`node setup.js run | cat` is a debuggable session).
 */

// The shapes themselves live in `shared/src/setup.ts`, because the server
// validates every line the shell relays and must not import this package.
export {
  ChosenModelSchema,
  DiskReportSchema,
  DoneEventSchema,
  FailedEventSchema,
  LicenceReferenceSchema,
  MessageEventSchema,
  PlanEventSchema,
  PlannedStepSchema,
  ProgressEventSchema,
  SETUP_STEP_IDS,
  SetupEventSchema,
  StepEventSchema,
} from '@apunta/shared';
export type {
  ChosenModel,
  DiskReport,
  PlanEvent,
  PlannedStep,
  ProgressEvent,
  SetupEvent,
  SetupStepId,
} from '@apunta/shared';

/**
 * One event, one line.
 *
 * Validated on the way out rather than trusted: the shell is in another
 * language and cannot re-check the shape, so a malformed event would be a
 * window stuck at 0% with no way to find out why.
 */
export function encodeEvent(event: SetupEvent): string {
  return `${JSON.stringify(SetupEventSchema.parse(event))}\n`;
}

/** The shell's side, and the tests'. Returns null for a line that is not ours. */
export function decodeEvent(line: string): SetupEvent | null {
  const trimmed = line.trim();
  if (trimmed === '') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  const result = SetupEventSchema.safeParse(parsed);
  return result.success ? result.data : null;
}
