import { afterEach, describe, expect, it } from 'vitest';

import { JOB_KINDS, active, anyActive, begin, end, type ActiveJob, type JobKind } from './registry.js';

afterEach(() => {
  // Nothing may leak between cases: a registry that kept a finished job would
  // report work in flight forever.
  for (const job of active()) end(job.id);
});

describe('the active job registry', () => {
  it('reports a job while it runs and nothing once it ends', () => {
    expect(active()).toEqual([]);
    expect(anyActive()).toBe(false);

    const job = begin('draft', 'job-1');
    expect(job).toEqual({ kind: 'draft', id: 'job-1' });
    expect(active()).toEqual([{ kind: 'draft', id: 'job-1' }]);
    expect(anyActive()).toBe(true);

    end('job-1');
    expect(active()).toEqual([]);
    expect(anyActive()).toBe(false);
  });

  it('keeps concurrent jobs apart, in the order they began', () => {
    begin('refine', 'note-1');
    begin('draft', 'note-2');
    begin('brainstorm', 'patient-1');

    expect(active().map((job) => `${job.kind}:${job.id}`)).toEqual([
      'refine:note-1',
      'draft:note-2',
      'brainstorm:patient-1',
    ]);

    end('note-2');
    expect(active().map((job) => job.id)).toEqual(['note-1', 'patient-1']);
  });

  it('takes an id over from a job already running under it', () => {
    // From outside, one id is one piece of work; two streams cannot both be
    // "the" job, and the newer one is the one in flight.
    begin('draft', 'note-1');
    begin('refine', 'note-1');
    expect(active()).toEqual([{ kind: 'refine', id: 'note-1' }]);

    end('note-1');
    expect(active()).toEqual([]);
  });

  it('ignores an end for a job that is not running', () => {
    begin('save', 'note-1');
    end('note-2');
    expect(active().map((job) => job.id)).toEqual(['note-1']);

    // Idempotent, because the honest caller is a `finally` on a path that may
    // already have released the job.
    end('note-1');
    end('note-1');
    expect(active()).toEqual([]);
  });

  it('hands out a registry nothing can edit, and a frozen job', () => {
    const job = begin('backup', 'job-1');
    expect(Object.isFrozen(job)).toBe(true);
    expect(Object.isFrozen(active())).toBe(true);
    expect(() => {
      (active() as ActiveJob[]).push(job);
    }).toThrow(TypeError);
  });

  it('registers and releases each server-observable kind, and never `recording`', () => {
    // P5.3 wired the ten kinds that have a route. The one that does not is
    // `recording`: the microphone is in the browser, so a recording is never a
    // server job and travels on the client half of C-UPD@1's quiescence.
    const serverObservable: JobKind[] = [
      'transcription',
      'draft',
      'refine',
      'plan',
      'briefing',
      'brainstorm',
      'import',
      'restore',
      'backup',
      'save',
    ];
    expect([...serverObservable].sort()).toEqual(JOB_KINDS.filter((k) => k !== 'recording').sort());

    for (const kind of serverObservable) {
      begin(kind, `${kind}-1`);
      expect(active()).toContainEqual({ kind, id: `${kind}-1` });
      end(`${kind}-1`);
      expect(active()).toEqual([]);
    }

    // Nothing in `server/` registers a recording, and the kind stays in the
    // vocabulary for the client half that reports it.
    expect(JOB_KINDS).toContain('recording');
  });

  it('names every kind the plan will adopt, and no others', () => {
    // `draft` and `refine` were wired by S2.1 and the rest by P5.3; the union is
    // the vocabulary every card calls `begin` with and is never widened here.
    expect(JOB_KINDS).toEqual([
      'recording',
      'transcription',
      'draft',
      'refine',
      'plan',
      'briefing',
      'brainstorm',
      'import',
      'restore',
      'backup',
      'save',
    ]);
    expect(begin('draft', 'job-1').kind).toBe('draft');
    expect(begin('refine', 'job-2').kind).toBe('refine');
  });
});
