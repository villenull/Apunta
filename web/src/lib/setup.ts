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

/** The local-only statement is about network locality, not disk encryption. */
export const FULLY_LOCAL = 'Apunta runs on this computer — notes are not sent over the network.';

/** The listening model shipped by the current setup is ggml-tiny.en.bin (77,704,715 bytes). */
export const LISTENING_MODEL_NOTE =
  'The configured listening model is ggml-tiny.en.bin (about 75 MB). Apunta checks it arrived intact.';

/** Homebrew commands are only useful on macOS source installs. */
const NON_MAC_FIX = 'Install the local runtime for your operating system, then press Check again.';

export type SetupPlatform = 'mac' | 'other';

function fixFor(
  platform: SetupPlatform,
  macCommand: string,
  bundled: boolean,
  bundledFix: string,
): {
  fix: string;
  fixIsCommand: boolean;
} {
  if (bundled) return { fix: bundledFix, fixIsCommand: false };
  if (platform !== 'mac') return { fix: NON_MAC_FIX, fixIsCommand: false };
  return { fix: macCommand, fixIsCommand: true };
}

export function setupChecks(
  health: HealthResponse,
  backup?: BackupStatus | null,
  platform: SetupPlatform = 'other',
): SetupCheck[] {
  const { bundled } = health;
  const ollamaFix = fixFor(platform, 'brew services start ollama', bundled, REOPEN);
  const modelFix = bundled
    ? { fix: REOPEN_TO_DOWNLOAD, fixIsCommand: false }
    : platform === 'mac'
      ? {
          fix: health.ollama.model === null ? SETUP_SCRIPT_COMMAND : `ollama pull ${health.ollama.model}`,
          fixIsCommand: true,
        }
      : { fix: NON_MAC_FIX, fixIsCommand: false };
  const whisperFix = fixFor(platform, 'brew install whisper-cpp', bundled, REOPEN);
  const listeningModelFix = fixFor(platform, SETUP_SCRIPT_COMMAND, bundled, REOPEN_TO_DOWNLOAD);
  const checks: SetupCheck[] = [
    {
      id: 'ollama',
      label: 'Ollama',
      state: health.ollama.reachable ? 'ok' : 'missing',
      detail: health.ollama.reachable
        ? 'answering on 127.0.0.1:11434'
        : 'nothing is answering on 127.0.0.1:11434',
      ...ollamaFix,
    },
    {
      id: 'model',
      label: 'Writing model',
      state: modelState(health),
      detail: modelDetail(health),
      ...modelFix,
    },
    {
      id: 'whisper',
      label: 'whisper.cpp',
      state: health.whisper.binaryPresent ? 'ok' : 'missing',
      detail: health.whisper.binaryPresent ? health.whisper.binary : `${health.whisper.binary} was not found`,
      ...whisperFix,
      note: 'Only needed to record audio. Typed notes work without it.',
    },
    {
      id: 'whisper-model',
      label: 'Listening model',
      state: health.whisper.modelPresent ? 'ok' : 'missing',
      detail: health.whisper.modelPresent ? health.whisper.model : `${health.whisper.model} is not there yet`,
      ...listeningModelFix,
      note: LISTENING_MODEL_NOTE,
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
function fileVaultCheck(health: HealthResponse): SetupCheck {
  const { state, detail } = health.fileVault;

  if (state === 'not_applicable') {
    return {
      id: 'filevault',
      label: 'Disk encryption',
      state: 'skipped',
      detail: detail || 'Not checked on this operating system',
      note: 'Apunta does not verify disk encryption on this operating system.',
    };
  }

  if (state === 'on') {
    return { id: 'filevault', label: 'Disk encryption', state: 'ok', detail };
  }

  if (state === 'unknown') {
    return {
      id: 'filevault',
      label: 'Disk encryption',
      state: 'unknown',
      detail: detail === '' ? 'could not read the disk encryption setting' : detail,
      fix: 'fdesetup status',
      fixIsCommand: true,
      note: 'Apunta could not tell. Check the setting yourself — it is worth knowing.',
    };
  }

  return {
    id: 'filevault',
    label: 'Disk encryption',
    state: state === 'deferred' ? 'warn' : 'missing',
    detail:
      state === 'deferred'
        ? 'FileVault is switched on but has not finished'
        : 'FileVault is OFF: the disk is not encrypted',
    fix: 'System Settings → Privacy & Security → FileVault → Turn On',
    note: 'Without it, anyone who takes this computer can read every note without your password.',
  };
}

/**
 * Where backups are going, if that is somewhere a sync service watches.
 *
 * A synced destination is reported separately from the local-only runtime
 * statement: the app can avoid network calls while an archive is copied into
 * a folder another service watches.
 */
function backupDestinationCheck(backup: BackupStatus | null | undefined): SetupCheck | null {
  if (backup === null || backup === undefined) return null;
  if (backup.destination.risk !== 'sync') return null;

  return {
    id: 'backup-destination',
    label: 'Backup destination',
    state: 'missing',
    detail: `backups are being written to ${backup.destination.path}`,
    fix: 'Settings → Advanced → Backup → change the folder',
    note: backup.destination.warning,
  };
}

/** True when something is actually broken, as opposed to merely unverifiable. */
export function hasBlockingProblem(checks: readonly SetupCheck[]): boolean {
  return checks.some((check) => check.state === 'missing');
}
