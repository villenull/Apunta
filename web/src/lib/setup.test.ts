import type { BackupStatus, HealthResponse } from '@apunta/shared';
import { describe, expect, it } from 'vitest';

import { hasBlockingProblem, REOPEN_TO_DOWNLOAD, setupChecks } from './setup.js';

const HEALTHY: HealthResponse = {
  ok: true,
  version: '0.0.0',
  fakeAi: false,
  bundled: false,
  db: { path: '/data/apunta.db', migrationLevel: 2 },
  ollama: { reachable: true, model: 'gemma4:12b-it-qat', modelPresent: true },
  whisper: {
    binaryPresent: true,
    modelPresent: true,
    binary: '/opt/homebrew/bin/whisper-cli',
    model: '/data/models/ggml-tiny.en.bin',
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
    expect(hasBlockingProblem(checks)).toBe(false);
  });

  it('names the exact command for each thing that is missing', () => {
    const checks = setupChecks(
      health({
        ollama: { reachable: false, model: 'gemma4:12b-it-qat', modelPresent: false },
        whisper: { ...HEALTHY.whisper, binaryPresent: false, modelPresent: false },
      }),
      null,
      'mac',
    );
    const byId = Object.fromEntries(checks.map((check) => [check.id, check]));

    expect(byId['ollama']?.state).toBe('missing');
    expect(byId['ollama']?.fix).toBe('brew services start ollama');
    expect(byId['whisper']?.fix).toBe('brew install whisper-cpp');
    expect(byId['whisper-model']?.fix).toBe('bash scripts/setup-macos.sh');
  });

  it('does not send a non-macOS install to Homebrew', () => {
    // Homebrew and `scripts/setup-macos.sh` are not commands she can run on
    // Linux, so the row has to point at her own operating system instead.
    const checks = setupChecks(
      health({
        ollama: { reachable: false, model: 'gemma4:12b-it-qat', modelPresent: false },
        whisper: { ...HEALTHY.whisper, binaryPresent: false, modelPresent: false },
      }),
    );
    const byId = Object.fromEntries(checks.map((check) => [check.id, check]));

    for (const id of ['ollama', 'model', 'whisper', 'whisper-model']) {
      expect(byId[id]?.fixIsCommand).toBe(false);
      expect(byId[id]?.fix).toBe(
        'Install the local runtime for your operating system, then press Check again.',
      );
    }
  });

  it('tells her to reopen the app, never to open a Terminal, when the runtime shipped with the app', () => {
    // Inside Apunta.app there is no Homebrew and no script; the first-run
    // window downloads what is missing (docs/INSTALL.md). Every fix here has
    // to be something she can do from the Dock.
    const checks = setupChecks(
      health({
        bundled: true,
        ollama: { reachable: false, model: 'qwen3.5:4b-q4_K_M', modelPresent: false },
        whisper: { ...HEALTHY.whisper, binaryPresent: false, modelPresent: false },
      }),
    );
    const byId = Object.fromEntries(checks.map((check) => [check.id, check]));

    expect(byId['model']?.fix).toBe(REOPEN_TO_DOWNLOAD);
    expect(byId['whisper-model']?.fix).toBe(REOPEN_TO_DOWNLOAD);
    for (const id of ['ollama', 'model', 'whisper', 'whisper-model']) {
      expect(byId[id]?.fixIsCommand).toBe(false);
      expect(byId[id]?.fix).toContain('Quit Apunta and open it again');
    }
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
    expect(hasBlockingProblem(checks)).toBe(true);
  });

  it('distinguishes deferred enablement from off', () => {
    const checks = setupChecks(health({ fileVault: { state: 'deferred', detail: '' } }));
    const row = checks.find((check) => check.id === 'filevault');

    expect(row?.state).toBe('warn');
    expect(row?.detail).toContain('has not finished');
  });

  /**
   * An unread setting is not a passing one: the row says so rather than
   * borrowing the language of a verified one.
   */
  it('does not let an unreadable setting read as a good one', () => {
    const checks = setupChecks(health({ fileVault: { state: 'unknown', detail: '' } }));
    const row = checks.find((check) => check.id === 'filevault');

    expect(row?.state).toBe('unknown');
    expect(row?.detail).toContain('could not read');
    // …but it is not a broken machine either, so nothing is painted red.
    expect(hasBlockingProblem(checks)).toBe(false);
  });

  it('is skipped, not failed, off macOS — the app still has to run in CI', () => {
    const checks = setupChecks(
      health({ fileVault: { state: 'not_applicable', detail: 'not checked on linux' } }),
    );
    expect(checks.find((check) => check.id === 'filevault')?.state).toBe('skipped');
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

  it('names the synced destination rather than leaving it to the network claim', () => {
    const checks = setupChecks(HEALTHY, backup('sync', '/Users/her/Documents'));
    const row = checks.find((check) => check.id === 'backup-destination');

    expect(row?.state).toBe('missing');
    expect(row?.detail).toContain('/Users/her/Documents');
    expect(row?.note).toContain('synced to the cloud');
    expect(hasBlockingProblem(checks)).toBe(true);
  });
});
