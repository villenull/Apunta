/**
 * Every way first-run setup can fail, in words.
 *
 * The packet is explicit that failure handling *is* this deliverable: network
 * loss mid-download, a corrupted file, a full disk and a cancelled download
 * must each produce a plain-language explanation and a working Retry — never a
 * stack trace, and never "open Terminal and run…".
 *
 * So the codes are closed, each one carries the sentence the window shows, and
 * a test walks the whole table asserting that none of them mentions a command,
 * a path, or a word a therapist would have to look up. Anything unrecognised
 * becomes `unexpected`, which is still a sentence.
 */

export const SETUP_ERROR_CODES = [
  'not_enough_disk',
  'download_failed',
  'checksum_mismatch',
  'cancelled',
  'runtime_unreachable',
  'model_pull_failed',
  'unexpected',
] as const;

export type SetupErrorCode = (typeof SETUP_ERROR_CODES)[number];

export interface SetupFailure {
  readonly code: SetupErrorCode;
  /** One short line, big text in the window. */
  readonly title: string;
  /** Two or three sentences under it, ending in what to do. */
  readonly detail: string;
  /** Whether the window offers Try again. */
  readonly retryable: boolean;
}

const FAILURES: Readonly<Record<SetupErrorCode, Omit<SetupFailure, 'code'>>> = {
  not_enough_disk: {
    title: 'This Mac needs more free space',
    detail:
      'Nothing was downloaded. Free up some room and try again — emptying the Trash is usually the ' +
      'quickest place to start.',
    retryable: true,
  },
  download_failed: {
    title: 'The download stopped',
    detail:
      'This is almost always the internet connection dropping. What was already downloaded has been ' +
      'kept, so trying again picks up where it left off rather than starting over.',
    retryable: true,
  },
  checksum_mismatch: {
    title: 'The downloaded file was damaged',
    detail:
      'The file did not match what it should be, so Apunta deleted it rather than use it. This ' +
      'usually means the download was interrupted in a way that went unnoticed. Trying again ' +
      'downloads a fresh copy.',
    retryable: true,
  },
  cancelled: {
    title: 'Setup was stopped',
    detail:
      'Nothing was lost. The part that had already downloaded is still there, so starting again ' +
      'continues from that point.',
    retryable: true,
  },
  runtime_unreachable: {
    title: 'Apunta could not start its own AI engine',
    detail:
      'The part of Apunta that runs the writing model did not answer. Trying again usually fixes ' +
      'it. If it keeps happening, restarting the Mac is the next thing to try.',
    retryable: true,
  },
  model_pull_failed: {
    title: 'The writing model could not be downloaded',
    detail:
      'The download did not finish. Anything that did arrive has been kept, so trying again ' +
      'continues rather than starting over.',
    retryable: true,
  },
  unexpected: {
    title: 'Something went wrong during setup',
    detail:
      'Apunta stopped rather than continue in a state it did not understand. Trying again is safe: ' +
      'it re-checks everything and only downloads what is still missing.',
    retryable: true,
  },
};

export class SetupError extends Error {
  readonly code: SetupErrorCode;
  /** Replaces the table's `detail` when there is something specific to say. */
  readonly override: string | undefined;

  constructor(code: SetupErrorCode, message: string, override?: string) {
    super(message);
    this.name = 'SetupError';
    this.code = code;
    this.override = override;
  }
}

export function setupError(code: SetupErrorCode, message: string, override?: string): SetupError {
  return new SetupError(code, message, override);
}

/** The failure the window renders, for anything that was thrown. */
export function describeFailure(error: unknown): SetupFailure {
  if (error instanceof SetupError) {
    const base = FAILURES[error.code];
    return {
      code: error.code,
      title: base.title,
      detail: error.override ?? base.detail,
      retryable: base.retryable,
    };
  }
  if (isAbort(error)) {
    return { code: 'cancelled', ...FAILURES.cancelled };
  }
  if (isNetwork(error)) {
    return { code: 'download_failed', ...FAILURES.download_failed };
  }
  return { code: 'unexpected', ...FAILURES.unexpected };
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');
}

/**
 * `fetch` reports a dropped connection as a bare `TypeError: fetch failed`
 * with the real reason on `cause`, and Node's socket errors arrive as
 * `ECONNRESET` / `ENOTFOUND` / `EAI_AGAIN`. Both are "the internet went away",
 * which is the single most likely thing to happen during a 574 MB download on
 * a domestic connection.
 */
function isNetwork(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === 'TypeError' && error.message.toLowerCase().includes('fetch failed')) return true;
  const code = (error as NodeJS.ErrnoException).code;
  return (
    code === 'ECONNRESET' ||
    code === 'ECONNREFUSED' ||
    code === 'ENOTFOUND' ||
    code === 'EAI_AGAIN' ||
    code === 'ETIMEDOUT' ||
    code === 'EPIPE'
  );
}
