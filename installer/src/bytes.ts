/**
 * Numbers a person can read, and the arithmetic behind the progress bar.
 *
 * All pure, all unit-tested, all running under the bundled `node` rather than
 * in the app shell — which is the point. A percentage that is wrong by a
 * factor of 1024, or an estimate that counts bytes that were already on disk
 * before this run, is the kind of bug nobody finds until it is in front of the
 * one person who cannot debug it.
 */

const UNITS = ['bytes', 'KB', 'MB', 'GB', 'TB'] as const;

/**
 * Bytes as macOS writes them — decimal, because that is what Finder, the
 * storage pane and every "you need N GB free" dialog on the machine say. A
 * window that says 8.6 GB next to a Finder that says 8.6 GB is a window she
 * can act on.
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1000) return `${String(Math.round(bytes))} bytes`;

  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < UNITS.length - 1) {
    value /= 1000;
    unit += 1;
  }
  const decimals = value >= 100 ? 0 : value >= 10 ? 1 : 1;
  return `${value.toFixed(decimals)} ${UNITS[unit] ?? 'bytes'}`;
}

/** "about 4 minutes", "about 30 seconds", "less than a minute". */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return 'a moment';
  if (seconds < 10) return 'a few seconds';
  if (seconds < 60) return `about ${String(Math.round(seconds / 10) * 10)} seconds`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `about ${String(minutes)} minute${minutes === 1 ? '' : 's'}`;
  const hours = seconds / 3600;
  const rounded = Math.round(hours * 10) / 10;
  return `about ${rounded.toFixed(1)} hours`;
}

export interface ProgressInput {
  /** Bytes on disk now, including anything a previous run left there. */
  readonly completedBytes: number;
  /** Total expected, or null while the server has not said. */
  readonly totalBytes: number | null;
  /** Bytes already on disk when this run started — never counted as speed. */
  readonly resumedFromBytes: number;
  /** Milliseconds since this run started transferring. */
  readonly elapsedMs: number;
}

export interface ProgressSnapshot {
  readonly completedBytes: number;
  readonly totalBytes: number | null;
  /** 0–100, or null when the total is unknown. */
  readonly percent: number | null;
  readonly bytesPerSecond: number | null;
  readonly etaSeconds: number | null;
}

/**
 * Percentage, rate and time remaining.
 *
 * The rate counts only what *this* run transferred: a resumed download that
 * divided 400 MB by four seconds of elapsed time would report 100 MB/s and an
 * ETA of zero, and then sit there.
 */
export function progressSnapshot(input: ProgressInput): ProgressSnapshot {
  const { completedBytes, totalBytes, resumedFromBytes, elapsedMs } = input;

  const percent =
    totalBytes !== null && totalBytes > 0
      ? Math.max(0, Math.min(100, (completedBytes / totalBytes) * 100))
      : null;

  const transferred = Math.max(0, completedBytes - resumedFromBytes);
  const seconds = elapsedMs / 1000;
  // Under a second of samples is noise, not a rate.
  const bytesPerSecond = seconds >= 1 && transferred > 0 ? transferred / seconds : null;

  let etaSeconds: number | null = null;
  if (bytesPerSecond !== null && totalBytes !== null && totalBytes > completedBytes) {
    etaSeconds = (totalBytes - completedBytes) / bytesPerSecond;
  } else if (bytesPerSecond !== null && totalBytes !== null) {
    etaSeconds = 0;
  }

  return { completedBytes, totalBytes, percent, bytesPerSecond, etaSeconds };
}

/** "412 MB of 574 MB — about 2 minutes left". What the window puts under the bar. */
export function describeProgress(snapshot: ProgressSnapshot): string {
  const done = formatBytes(snapshot.completedBytes);
  if (snapshot.totalBytes === null) return done;
  const total = formatBytes(snapshot.totalBytes);
  if (snapshot.etaSeconds === null) return `${done} of ${total}`;
  if (snapshot.etaSeconds <= 1) return `${done} of ${total} — almost done`;
  return `${done} of ${total} — ${formatDuration(snapshot.etaSeconds)} left`;
}
