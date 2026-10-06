import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  NORMAL_BOOT,
  UPDATE_HANDOFF_ENV,
  chooseBoot,
  confirmHealth,
  decideBoot,
  type BootInputs,
} from './update-boot.js';
import {
  journalPath,
  readJournal,
  writeJournal,
  type JournalPhase,
  type UpdateJournal,
} from './update-journal.js';

const TARGET = '1.1.0';
const PREVIOUS = '1.0.0';

function journal(phase: JournalPhase, overrides: Partial<UpdateJournal> = {}): UpdateJournal {
  return {
    phase,
    updateId: '7',
    fromVersion: PREVIOUS,
    toVersion: TARGET,
    snapshotPath: '/data/safety/pre-update-1.0.0-1.1.0-20261006T120000Z.db',
    createdAt: '2026-10-06T12:00:00.000Z',
    ...overrides,
  };
}

describe('decideBoot: the start-selection table', () => {
  const rows: readonly {
    name: string;
    inputs: BootInputs;
    mode: 'normal' | 'recovery';
    claim: boolean;
    reason?: string;
  }[] = [
    {
      name: 'no journal',
      inputs: { journal: null, version: TARGET, handoffId: undefined },
      mode: 'normal',
      claim: false,
    },
    {
      name: 'no journal, a stray handoff id is ignored',
      inputs: { journal: null, version: TARGET, handoffId: '7' },
      mode: 'normal',
      claim: false,
    },
    {
      name: 'pending, running the target, matching handoff: the first updated boot claims its attempt',
      inputs: { journal: journal('pending'), version: TARGET, handoffId: '7' },
      mode: 'normal',
      claim: true,
    },
    {
      name: 'pending, running the target, no handoff',
      inputs: { journal: journal('pending'), version: TARGET, handoffId: undefined },
      mode: 'recovery',
      claim: false,
      reason: 'wrong_handoff',
    },
    {
      name: 'pending, running the target, empty handoff',
      inputs: { journal: journal('pending'), version: TARGET, handoffId: '' },
      mode: 'recovery',
      claim: false,
      reason: 'wrong_handoff',
    },
    {
      name: "pending, running the target, another update's handoff",
      inputs: { journal: journal('pending'), version: TARGET, handoffId: '8' },
      mode: 'recovery',
      claim: false,
      reason: 'wrong_handoff',
    },
    {
      name: 'pending, matching handoff but the wrong build',
      inputs: { journal: journal('pending'), version: '1.0.9', handoffId: '7' },
      mode: 'recovery',
      claim: false,
      reason: 'wrong_version',
    },
    {
      name: 'pending, the old build, no handoff',
      inputs: { journal: journal('pending'), version: PREVIOUS, handoffId: undefined },
      mode: 'normal',
      claim: false,
    },
    {
      name: 'health_attempted, target, matching handoff: the one attempt is spent',
      inputs: { journal: journal('health_attempted'), version: TARGET, handoffId: '7' },
      mode: 'recovery',
      claim: false,
      reason: 'already_attempted',
    },
    {
      name: 'health_attempted, any other build',
      inputs: { journal: journal('health_attempted'), version: PREVIOUS, handoffId: undefined },
      mode: 'recovery',
      claim: false,
      reason: 'already_attempted',
    },
    {
      name: 'recovery, matching everything',
      inputs: { journal: journal('recovery'), version: TARGET, handoffId: '7' },
      mode: 'recovery',
      claim: false,
      reason: 'recovery_pending',
    },
    {
      name: 'an unreadable journal fails closed',
      inputs: { journal: 'corrupt', version: TARGET, handoffId: '7' },
      mode: 'recovery',
      claim: false,
      reason: 'corrupt_journal',
    },
  ];

  for (const row of rows) {
    it(row.name, () => {
      const decision = decideBoot(row.inputs);
      expect(decision.mode).toBe(row.mode);
      expect('claim' in decision && decision.claim).toBe(row.claim);
      if (decision.mode === 'recovery') {
        expect(decision.reason).toBe(row.reason);
        expect(decision.journal).toBe(row.inputs.journal === 'corrupt' ? null : row.inputs.journal);
      }
    });
  }
});

describe('chooseBoot and confirmHealth against a real folder', () => {
  let dir: string;
  const env = (handoff?: string): Record<string, string | undefined> => ({ [UPDATE_HANDOFF_ENV]: handoff });

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'apunta-boot-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('no journal: normal, nothing written, plain context', () => {
    const chosen = chooseBoot({ dataDir: dir, version: TARGET, env: env() });
    expect(chosen.decision).toEqual({ mode: 'normal', journal: null });
    expect(chosen.context).toEqual({ mode: 'normal' });
    expect(readJournal(dir)).toBeNull();
    expect(NORMAL_BOOT.context).toEqual({ mode: 'normal' });
  });

  it('the first updated boot writes health_attempted before returning, and reports the update in its context', () => {
    writeJournal(dir, journal('pending'));

    const chosen = chooseBoot({ dataDir: dir, version: TARGET, env: env('7') });

    expect(chosen.decision.mode).toBe('normal');
    expect(readJournal(dir)).toEqual(journal('health_attempted'));
    expect(chosen.context).toEqual({
      mode: 'normal',
      updateId: '7',
      targetVersion: TARGET,
      previousVersion: PREVIOUS,
    });
  });

  it('the attempt is spent: a second start of the same build with the same handoff is recovery, and records it', () => {
    writeJournal(dir, journal('pending'));
    expect(chooseBoot({ dataDir: dir, version: TARGET, env: env('7') }).decision.mode).toBe('normal');

    const second = chooseBoot({ dataDir: dir, version: TARGET, env: env('7') });

    expect(second.decision.mode).toBe('recovery');
    expect(readJournal(dir)).toEqual(journal('recovery'));
    expect(second.context).toEqual({
      mode: 'recovery',
      updateId: '7',
      targetVersion: TARGET,
      previousVersion: PREVIOUS,
    });
    // And stays recovery however often it is started.
    expect(chooseBoot({ dataDir: dir, version: TARGET, env: env('7') }).decision.mode).toBe('recovery');
    expect(readJournal(dir)).toEqual(journal('recovery'));
  });

  it('a consented recovery launch claims only its authorised version and cannot repeat the attempt', () => {
    const recovery = { ...journal('recovery'), recoveryTarget: PREVIOUS };
    writeJournal(dir, recovery);
    expect(chooseBoot({ dataDir: dir, version: PREVIOUS, env: env() }).decision.mode).toBe('recovery');
    expect(chooseBoot({ dataDir: dir, version: PREVIOUS, env: env('other') }).decision.mode).toBe('recovery');
    expect(chooseBoot({ dataDir: dir, version: TARGET, env: env('7') }).decision.mode).toBe('recovery');
    expect(readJournal(dir)).toEqual(recovery);

    const claimed = chooseBoot({ dataDir: dir, version: PREVIOUS, env: env('7') });
    expect(claimed.decision.mode).toBe('normal');
    expect(readJournal(dir)).toEqual({ ...journal('health_attempted'), toVersion: PREVIOUS });
    expect(chooseBoot({ dataDir: dir, version: PREVIOUS, env: env('7') }).decision.mode).toBe('recovery');
  });

  it('a wrong handoff on a pending journal enters recovery and the claim is not made', () => {
    writeJournal(dir, journal('pending'));
    const chosen = chooseBoot({ dataDir: dir, version: TARGET, env: env('other') });
    expect(chosen.decision.mode).toBe('recovery');
    expect(readJournal(dir)).toEqual(journal('recovery'));
  });

  it('a corrupt journal is recovery with a bare context, and the file is left as found', () => {
    writeFileSync(journalPath(dir), '{not json');
    const chosen = chooseBoot({ dataDir: dir, version: TARGET, env: env('7') });
    expect(chosen.decision).toEqual({ mode: 'recovery', reason: 'corrupt_journal', journal: null });
    expect(chosen.context).toEqual({ mode: 'recovery' });
    expect(readJournal(dir)).toBe('corrupt');
  });

  it('a claim that cannot be made durable is recovery, not a normal start', () => {
    writeJournal(dir, journal('pending'));
    // A directory occupying the temp name makes the atomic write fail.
    mkdirSync(`${journalPath(dir)}.tmp`);
    const onError = vi.fn();

    const chosen = chooseBoot({ dataDir: dir, version: TARGET, env: env('7'), onError });

    expect(chosen.decision).toMatchObject({ mode: 'recovery', reason: 'claim_failed' });
    expect(onError).toHaveBeenCalled();
    expect(readJournal(dir)).toEqual(journal('pending'));
  });

  describe('health confirmation', () => {
    it('clears the journal for the claimed update and nothing else', () => {
      writeJournal(dir, journal('pending'));
      chooseBoot({ dataDir: dir, version: TARGET, env: env('7') });

      expect(confirmHealth(dir, '7')).toEqual({ ok: true });
      expect(readJournal(dir)).toBeNull();
    });

    it('refuses another id, and leaves the claim in place', () => {
      writeJournal(dir, journal('health_attempted'));
      expect(confirmHealth(dir, '8')).toEqual({ ok: false, code: 'unknown_update' });
      expect(confirmHealth(dir, '')).toEqual({ ok: false, code: 'unknown_update' });
      expect(readJournal(dir)).toEqual(journal('health_attempted'));
    });

    it('refuses with no journal, a pending journal, a recovery journal or a corrupt one', () => {
      expect(confirmHealth(dir, '7')).toEqual({ ok: false, code: 'unknown_update' });
      writeJournal(dir, journal('pending'));
      expect(confirmHealth(dir, '7')).toEqual({ ok: false, code: 'unknown_update' });
      writeJournal(dir, journal('recovery'));
      expect(confirmHealth(dir, '7')).toEqual({ ok: false, code: 'unknown_update' });
      writeFileSync(journalPath(dir), 'garbage');
      expect(confirmHealth(dir, '7')).toEqual({ ok: false, code: 'unknown_update' });
      expect(readJournal(dir)).toBe('corrupt');
    });

    it('a recovery boot can never be confirmed healthy afterwards', () => {
      writeJournal(dir, journal('health_attempted'));
      expect(chooseBoot({ dataDir: dir, version: TARGET, env: env('7') }).decision.mode).toBe('recovery');
      expect(confirmHealth(dir, '7')).toEqual({ ok: false, code: 'unknown_update' });
      expect(readJournal(dir)).toEqual(journal('recovery'));
    });
  });
});
