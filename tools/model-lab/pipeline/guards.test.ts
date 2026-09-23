/**
 * The gates that keep the model lab off the therapist's data until she has
 * agreed, and out of the repository always.
 *
 * The unit cases below are the rules; the last two run the real scripts and
 * check that a refusal is a refusal — a non-zero exit, the flag named in the
 * message, and no output file written. A guard that only exists in a function
 * nobody calls is not a guard.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  CONSENT_FLAG,
  ConsentError,
  REPO_ROOT,
  labDataRoot,
  requiredArg,
  requireConsent,
  requireInputOutsideRepo,
  requireOutputUnderLab,
} from './guards.js';

const REPO = REPO_ROOT;

describe('the consent flag', () => {
  it('refuses to run without it, and says which flag is missing', () => {
    expect(() => requireConsent(['--export', '/tmp/x'], 'build-pairs')).toThrow(ConsentError);
    expect(() => requireConsent([], 'build-pairs')).toThrow(new RegExp(CONSENT_FLAG));
  });

  it('accepts the flag only as its own argument', () => {
    expect(() => requireConsent([CONSENT_FLAG], 'build-pairs')).not.toThrow();
    expect(() => requireConsent([`${CONSENT_FLAG}=1`], 'build-pairs')).toThrow(ConsentError);
    expect(() => requireConsent([`--prefix${CONSENT_FLAG}`], 'build-pairs')).toThrow(ConsentError);
  });
});

describe('where data may live', () => {
  it('refuses an input inside the repository', () => {
    expect(() => requireInputOutsideRepo(join(REPO, 'e2e', 'fixtures', 'eval'))).toThrow(
      /inside the repository/,
    );
  });

  it('refuses an output inside the repository, and one outside the lab directory', () => {
    expect(() => requireOutputUnderLab(join(REPO, 'tools', 'model-lab', 'pairs.jsonl'))).toThrow(
      ConsentError,
    );
    expect(() => requireOutputUnderLab('/tmp/pairs.jsonl')).toThrow(/lab outputs live under/);
  });

  it('allows an input outside the repository and an output under the lab directory', () => {
    const home = mkdtempSync(join(tmpdir(), 'lab-home-'));
    const exportDir = mkdtempSync(join(tmpdir(), 'lab-export-'));
    try {
      expect(requireInputOutsideRepo(exportDir, home)).toBe(exportDir);
      const target = join(labDataRoot(home), 'datasets', 'pairs.jsonl');
      expect(requireOutputUnderLab(target, home)).toBe(target);
      expect(labDataRoot(home).startsWith(REPO)).toBe(false);
    } finally {
      rmSync(home, { recursive: true, force: true });
      rmSync(exportDir, { recursive: true, force: true });
    }
  });

  it('reads a flag value, and refuses a missing one', () => {
    expect(requiredArg(['--out', '/tmp/a'], '--out')).toBe('/tmp/a');
    expect(() => requiredArg(['--out'], '--out')).toThrow(/--out is required/);
    expect(() => requiredArg(['--out', '--i-have-consent'], '--out')).toThrow(/--out is required/);
  });
});

describe('the real scripts refuse', () => {
  const run = (args: readonly string[]): { status: number; output: string } => {
    try {
      const output = execFileSync('npx', ['tsx', 'tools/model-lab/pipeline/build-pairs.ts', ...args], {
        cwd: REPO,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      return { status: 0, output };
    } catch (error) {
      const failure = error as { status?: number; stdout?: string; stderr?: string };
      return { status: failure.status ?? 1, output: `${failure.stdout ?? ''}${failure.stderr ?? ''}` };
    }
  };

  it('exits non-zero and writes nothing without the consent flag', () => {
    const home = mkdtempSync(join(tmpdir(), 'lab-home-'));
    const exportDir = mkdtempSync(join(tmpdir(), 'lab-export-'));
    writeFileSync(join(exportDir, 'conversations.json'), '[]', 'utf8');
    const out = join(labDataRoot(home), 'datasets', 'pairs.jsonl');
    try {
      const result = run(['--export', exportDir, '--out', out]);
      expect(result.status).not.toBe(0);
      expect(result.output).toContain(CONSENT_FLAG);
      expect(existsSync(out)).toBe(false);
    } finally {
      rmSync(home, { recursive: true, force: true });
      rmSync(exportDir, { recursive: true, force: true });
    }
  });

  it('exits non-zero when the output would land inside the repository', () => {
    const exportDir = mkdtempSync(join(tmpdir(), 'lab-export-'));
    writeFileSync(join(exportDir, 'conversations.json'), '[]', 'utf8');
    const out = join(REPO, 'tools', 'model-lab', 'pairs.jsonl');
    try {
      const result = run([CONSENT_FLAG, '--export', exportDir, '--out', out]);
      expect(result.status).not.toBe(0);
      expect(existsSync(out)).toBe(false);
    } finally {
      rmSync(exportDir, { recursive: true, force: true });
    }
  });
});
