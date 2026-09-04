import type { BackupStatus, HealthResponse } from '@apunta/shared';

/**
 * The first-run checklist (M7 deliverable 2), as data.
 *
 * Kept a pure function of the two payloads so every row — including the ones
 * that only appear on a Mac with FileVault off — is reachable in a unit test
 * without a Mac. The screen renders whatever this returns.
 *
 * **There is no ffmpeg row.** M5 records 16 kHz mono WAV in the browser and
 * `whisper-cli` decodes it directly, so a machine without ffmpeg is a machine
 * that works; a checklist that asked for it would paint that machine red
 * (`docs/research/m8-bundling-2026-08.md` §11.M7.1).
 */

export type CheckState = 'ok' | 'missing' | 'warn' | 'unknown' | 'skipped';

export interface SetupCheck {
  readonly id: string;
  readonly label: string;
  readonly state: CheckState;
  /** What the machine actually reports, in one line. */
  readonly detail: string;
  /** The exact thing to run, or the exact place to click. */
  readonly fix?: string;
  /** True when `fix` is a shell command, so the screen offers to copy it. */
  readonly fixIsCommand?: boolean;
  /** Why this matters, for the rows whose absence is not obvious. */
  readonly note?: string;
}

export const SETUP_SCRIPT_COMMAND = 'bash scripts/setup-macos.sh';

/**
 * What she does inside `Apunta.app`, where there is no Terminal and no
 * Homebrew: the app owns its runtime, and its first-run window downloads
 * whatever model is missing (`docs/INSTALL.md`). A Terminal command there is
 * not just unhelpful — it is a command she cannot run.
 */
export const REOPEN_TO_DOWNLOAD =
  'Quit Apunta and open it again — the setup window comes back and downloads what is missing.';
export const REOPEN = 'Quit Apunta and open it again — it starts its own copy.';

/** The prototype's sentence, and the thing it is not allowed to say too early. */
export const FULLY_LOCAL = "You're fully local — nothing leaves this Mac.";

export function setupChecks(health: HealthResponse, backup?: BackupStatus | null): SetupCheck[] {
  const { bundled } = health;
  const checks: SetupCheck[] = [
    {
      id: 'ollama',
      label: 'Ollama is running',
      state: health.ollama.reachable ? 'ok' : 'missing',
      detail: health.ollama.reachable
        ? 'answering on 127.0.0.1:11434'
        : 'nothing is answering on 127.0.0.1:11434',
      fix: bundled ? REOPEN : 'brew services start ollama',
      fixIsCommand: !bundled,
    },
    {
      id: 'model',
      label: 'The writing model is downloaded',
      state: modelState(health),
      detail: modelDetail(health),
      fix: bundled
        ? REOPEN_TO_DOWNLOAD
        : health.ollama.model === null
          ? SETUP_SCRIPT_COMMAND
          : `ollama pull ${health.ollama.model}`,
      fixIsCommand: !bundled,
    },
    {
      id: 'whisper',
      label: 'whisper.cpp is installed',
      state: health.whisper.binaryPresent ? 'ok' : 'missing',
      detail: health.whisper.binaryPresent ? health.whisper.binary : `${health.whisper.binary} was not found`,
      fix: bundled ? REOPEN : 'brew install whisper-cpp',
      fixIsCommand: !bundled,
      note: 'Only needed to record audio. Typed notes work without it.',
    },
    {
      id: 'whisper-model',
      label: 'The listening model is downloaded',
      state: health.whisper.modelPresent ? 'ok' : 'missing',
      detail: health.whisper.modelPresent ? health.whisper.model : `${health.whisper.model} is not there yet`,
      fix: bundled ? REOPEN_TO_DOWNLOAD : SETUP_SCRIPT_COMMAND,
      fixIsCommand: !bundled,
      note: bundled
        ? 'About 550 MB. Apunta downloads it and checks it arrived intact.'
        : 'About 550 MB. The setup script downloads it and checks it arrived intact.',
    },
    fileVaultCheck(health),
  ];

  const destination = backupDestinationCheck(backup);
  if (destination !== null) checks.push(destination);
  return checks;
}

function modelState(health: HealthResponse): CheckState {
  if (!health.ollama.reachable) return 'unknown';
  return health.ollama.modelPresent ? 'ok' : 'missing';
}

function modelDetail(health: HealthResponse): string {
  if (!health.ollama.reachable) return 'cannot tell until Ollama is running';
  if (health.ollama.model === null) return 'no model has been chosen yet';
  return health.ollama.modelPresent ? health.ollama.model : `${health.ollama.model} is not downloaded`;
}

/**
 * The row that is not about AI at all.
 *
 * FileVault is the entire at-rest story for this laptop and it is not implied
 * by Apple silicon — recent Setup Assistant does not always ask. Without it,
 * anyone who takes the machine reads every note without knowing a password.
 * It is the one item here Apunta cannot fix, which is why the row says exactly
 * where to click (`docs/research/data-at-rest-2026-08.md` §4.2).
 */
function fileVaultCheck(health: HealthResponse): SetupCheck {
  const { state, detail } = health.fileVault;

  if (state === 'not_applicable') {
    return {
      id: 'filevault',
      label: 'The disk is encrypted',
      state: 'skipped',
      detail,
      note: 'Disk encryption is checked on macOS, which is where this app is meant to run.',
    };
  }

  if (state === 'on') {
    return { id: 'filevault', label: 'The disk is encrypted', state: 'ok', detail };
  }

  if (state === 'unknown') {
    return {
      id: 'filevault',
      label: 'The disk is encrypted',
      state: 'unknown',
      detail: detail === '' ? 'could not read the disk encryption setting' : detail,
      fix: 'fdesetup status',
      fixIsCommand: true,
      note: 'Apunta could not tell. Run this in Terminal and read the answer yourself — it is worth knowing.',
    };
  }

  return {
    id: 'filevault',
    label: 'The disk is encrypted',
    state: state === 'deferred' ? 'warn' : 'missing',
    detail:
      state === 'deferred'
        ? 'FileVault is switched on but has not finished — log out and back in'
        : 'FileVault is OFF: the disk is not encrypted',
    fix: 'System Settings → Privacy & Security → FileVault → Turn On',
    note: 'Without it, anyone who takes this Mac can read every note on it without your password. Nothing else in Apunta makes up for that.',
  };
}

/**
 * Where backups are going, if that is somewhere a sync service watches.
 *
 * ~/Desktop and ~/Documents are the two folders iCloud syncs by default, so
 * the obvious place to save an archive is the place that uploads it to Apple —
 * and this is the screen that claims nothing leaves the Mac, so the claim has
 * to answer for it (§2.5, §5.4).
 */
function backupDestinationCheck(backup: BackupStatus | null | undefined): SetupCheck | null {
  if (backup === null || backup === undefined) return null;
  if (backup.destination.risk !== 'sync') return null;

  return {
    id: 'backup-destination',
    label: 'Backups stay on this Mac',
    state: 'missing',
    detail: `backups are being written to ${backup.destination.path}`,
    fix: 'Settings → Back up and restore → change the folder',
    note: backup.destination.warning,
  };
}

/**
 * Whether the screen may print `FULLY_LOCAL`.
 *
 * Deliberately strict. "Nothing leaves this Mac" is false while FileVault is
 * off and false while the backup folder is inside iCloud, and an *unknown*
 * FileVault is not a yes — a promise the app cannot stand behind is worse than
 * no promise (`docs/research/data-at-rest-2026-08.md` §9).
 */
export function isFullyLocal(checks: readonly SetupCheck[]): boolean {
  return checks.every((check) => check.state === 'ok' || check.state === 'skipped');
}

/** True when something is actually broken, as opposed to merely unverifiable. */
export function hasBlockingProblem(checks: readonly SetupCheck[]): boolean {
  return checks.some((check) => check.state === 'missing');
}
