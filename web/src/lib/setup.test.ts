import type { BackupStatus, HealthResponse } from '@apunta/shared';
import { describe, expect, it } from 'vitest';

import { FULLY_LOCAL, hasBlockingProblem, isFullyLocal, setupChecks } from './setup.js';

const HEALTHY: HealthResponse = {
  ok: true,
  version: '0.0.0',
  fakeAi: false,
  db: { path: '/data/apunta.db', migrationLevel: 2 },
  ollama: { reachable: true, model: 'gemma4:12b-it-qat', modelPresent: true },
  whisper: {
    binaryPresent: true,
    modelPresent: true,
    binary: '/opt/homebrew/bin/whisper-cli',
    model: '/data/models/ggml-large-v3-turbo-q5_0.bin',
  },
  fileVault: { state: 'on', detail: 'FileVault is On.' },
};

function health(patch: Partial<HealthResponse>): HealthResponse {
  return { ...HEALTHY, ...patch };
}

function ids(checks: ReturnType<typeof setupChecks>): string[] {
  return checks.map((check) => check.id);
}

describe('the checklist', () => {
  it('has a row per local dependency and none for ffmpeg', () => {
    // M5 records 16 kHz WAV in the browser; whisper-cli decodes it. A machine
    // without ffmpeg is a machine that works, so a red row would be a lie.
    expect(ids(setupChecks(HEALTHY))).toEqual(['ollama', 'model', 'whisper', 'whisper-model', 'filevault']);
    expect(ids(setupChecks(HEALTHY))).not.toContain('ffmpeg');
  });

  it('goes green on a fully set-up Mac', () => {
    const checks = setupChecks(HEALTHY);
    expect(checks.every((check) => check.state === 'ok')).toBe(true);
    expect(isFullyLocal(checks)).toBe(true);
    expect(hasBlockingProblem(checks)).toBe(false);
  });

  it('names the exact command for each thing that is missing', () => {
    const checks = setupChecks(
      health({
        ollama: { reachable: false, model: 'gemma4:12b-it-qat', modelPresent: false },
        whisper: { ...HEALTHY.whisper, binaryPresent: false, modelPresent: false },
      }),
    );
    const byId = Object.fromEntries(checks.map((check) => [check.id, check]));

    expect(byId['ollama']?.state).toBe('missing');
    expect(byId['ollama']?.fix).toBe('brew services start ollama');
    expect(byId['whisper']?.fix).toBe('brew install whisper-cpp');
    expect(byId['whisper-model']?.fix).toBe('bash scripts/setup-macos.sh');
  });

  it('does not claim the model is missing while Ollama is unreachable', () => {
    // "cannot tell" and "not downloaded" send someone to different places.
    const checks = setupChecks(health({ ollama: { reachable: false, model: null, modelPresent: false } }));
    const model = checks.find((check) => check.id === 'model');

    expect(model?.state).toBe('unknown');
    expect(model?.detail).toContain('cannot tell');
  });
});

describe('the FileVault row', () => {
  it('is red and says what it costs when FileVault is off', () => {
    const checks = setupChecks(health({ fileVault: { state: 'off', detail: 'FileVault is Off.' } }));
    const row = checks.find((check) => check.id === 'filevault');

    expect(row?.state).toBe('missing');
    expect(row?.fix).toContain('System Settings');
    expect(row?.note).toContain('without your password');
    expect(isFullyLocal(checks)).toBe(false);
  });

  it('distinguishes deferred enablement from off', () => {
    const checks = setupChecks(health({ fileVault: { state: 'deferred', detail: '' } }));
    const row = checks.find((check) => check.id === 'filevault');

    expect(row?.state).toBe('warn');
    expect(row?.detail).toContain('log out');
    // Still not "fully local": it is not encrypted until it finishes.
    expect(isFullyLocal(checks)).toBe(false);
  });

  /**
   * An unread setting is not a passing one. This is the whole reason
   * `FULLY_LOCAL` is gated on the checklist rather than on the AI rows.
   */
  it('will not let an unknown answer buy the "fully local" claim', () => {
    const checks = setupChecks(health({ fileVault: { state: 'unknown', detail: '' } }));
    expect(isFullyLocal(checks)).toBe(false);
    // …but it is not a broken machine either, so nothing is painted red.
    expect(hasBlockingProblem(checks)).toBe(false);
  });

  it('is skipped, not failed, off macOS — the app still has to run in CI', () => {
    const checks = setupChecks(
      health({ fileVault: { state: 'not_applicable', detail: 'not checked on linux' } }),
    );
    expect(checks.find((check) => check.id === 'filevault')?.state).toBe('skipped');
    expect(isFullyLocal(checks)).toBe(true);
  });
});

describe('the backup destination row', () => {
  const backup = (risk: BackupStatus['destination']['risk'], path: string): BackupStatus =>
    ({
      directory: path,
      destination: { risk, path, warning: 'Documents is synced to the cloud' },
      last_backup_at: null,
      last_backup_file: null,
      last_backup_error: null,
      stale: true,
      last_verified_restore: null,
      backups: [],
      counts: {},
      oldest_note_at: null,
      db_bytes: 0,
    }) satisfies BackupStatus;

  it('only appears when backups are going somewhere a sync service watches', () => {
    expect(ids(setupChecks(HEALTHY, backup('data-dir', '/data/backups')))).not.toContain(
      'backup-destination',
    );
    expect(ids(setupChecks(HEALTHY, backup('external', '/Volumes/Backup')))).not.toContain(
      'backup-destination',
    );
    expect(ids(setupChecks(HEALTHY, backup('sync', '/Users/her/Documents')))).toContain('backup-destination');
  });

  it('withdraws the "fully local" claim, because it is not true', () => {
    const checks = setupChecks(HEALTHY, backup('sync', '/Users/her/Documents'));
    expect(isFullyLocal(checks)).toBe(false);
    expect(FULLY_LOCAL).toContain('nothing leaves this Mac');
  });
});
