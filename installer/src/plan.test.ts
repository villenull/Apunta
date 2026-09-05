import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { DEFAULT_MODEL, LARGE_MODEL, SMALL_MODEL } from '@apunta/shared';
import { describe, expect, it } from 'vitest';

import { checkDiskSpace, DISK_HEADROOM_BYTES, freeBytesFor } from './disk.js';
import { buildPlan, describeWeightsProvenance, explainChoice } from './plan.js';

const GB = 1000 * 1000 * 1000;

function planFor(overrides: Partial<Parameters<typeof buildPlan>[0]> = {}) {
  return buildPlan({
    memoryGib: 32,
    speechModelPresent: false,
    previewModelPresent: false,
    writingModelPresent: false,
    freeBytes: 200 * GB,
    ...overrides,
  });
}

describe('buildPlan', () => {
  it('picks the model from the shared tier table, not a copy of it', () => {
    expect(planFor({ memoryGib: 64 }).model.tag).toBe(LARGE_MODEL);
    expect(planFor({ memoryGib: 32 }).model.tag).toBe(DEFAULT_MODEL);
    expect(planFor({ memoryGib: 8 }).model.tag).toBe(SMALL_MODEL);
    expect(planFor({ memoryGib: null }).model.tag).toBe(SMALL_MODEL);
  });

  it('lets an explicit setting beat the table', () => {
    const plan = planFor({ memoryGib: 8, modelOverride: 'gemma4:12b-it-qat' });
    expect(plan.model.tag).toBe('gemma4:12b-it-qat');
    expect(plan.model.reason).toContain('chosen for this Mac rather than by Apunta');
  });

  it('is ready when both models are already there', () => {
    const plan = planFor({ speechModelPresent: true, previewModelPresent: true, writingModelPresent: true });
    expect(plan.ready).toBe(true);
    expect(plan.disk.requiredBytes).toBe(0);
    expect(plan.steps.every((step) => !step.needed)).toBe(true);
  });

  it('only counts what is missing towards the download size', () => {
    const both = planFor();
    const speechOnly = planFor({ writingModelPresent: true });
    expect(speechOnly.disk.requiredBytes).toBeLessThan(both.disk.requiredBytes);
    expect(speechOnly.ready).toBe(false);
  });

  /**
   * The refusal is the deliverable, not the download. It has to name a number
   * she can act on, and it must happen before a byte is written.
   */
  it('refuses on a full disk, with the shortfall in the message', () => {
    const plan = planFor({ memoryGib: 32, freeBytes: 3 * GB });
    expect(plan.disk.ok).toBe(false);
    expect(plan.disk.shortfallBytes).toBeGreaterThan(0);
    expect(plan.disk.message).toMatch(/GB/);
    expect(plan.disk.message).not.toMatch(/Terminal|sudo|\$ /);
  });

  it('leaves room for macOS rather than filling the disk exactly', () => {
    const required = planFor().disk.requiredBytes;
    const exact = planFor({ freeBytes: required });
    expect(exact.disk.ok).toBe(false);
    const roomy = planFor({ freeBytes: required + DISK_HEADROOM_BYTES });
    expect(roomy.disk.ok).toBe(true);
  });

  /**
   * A Mac whose free space cannot be read still works. Refusing there would
   * strand a machine over a failed `statfs`, and the download itself fails
   * honestly if the space really is not there.
   */
  it('does not refuse when free space could not be read', () => {
    const plan = planFor({ freeBytes: null });
    expect(plan.disk.ok).toBe(true);
  });
});

describe('explainChoice', () => {
  it('says which model and why, naming the boundary that decided it', () => {
    expect(explainChoice(8, SMALL_MODEL, false)).toContain('16 GB');
    expect(explainChoice(32, DEFAULT_MODEL, false)).toContain('36 GB');
    expect(explainChoice(64, LARGE_MODEL, false)).toContain('largest');
  });

  it('is honest when the memory could not be read', () => {
    const reason = explainChoice(null, SMALL_MODEL, false);
    expect(reason).toContain('could not read');
    expect(reason).toContain(SMALL_MODEL);
  });

  it('never asks the reader to run anything', () => {
    for (const memory of [null, 8, 16, 32, 64]) {
      const reason = explainChoice(memory, DEFAULT_MODEL, false);
      expect(reason).not.toMatch(/Terminal|command line|sudo|npm |brew /);
    }
  });
});

describe('describeWeightsProvenance', () => {
  /**
   * Condition 1 of the three that keep the weights at arm's length: name the
   * model and link its terms *before* downloading, because the user is the one
   * accepting them.
   */
  it('names the publisher, links the terms, and disclaims redistribution', () => {
    const plan = planFor({ memoryGib: 32 });
    const sentence = describeWeightsProvenance(plan.model);
    expect(sentence).toContain(plan.model.tag);
    expect(sentence).toContain(plan.model.publisher);
    expect(sentence).toContain(plan.model.licence.url);
    expect(sentence).toContain('does not host or copy');
  });
});

describe('freeBytesFor', () => {
  /**
   * On a first run the data directory does not exist yet, and `statfs` on a
   * path that is not there throws. Reporting "cannot tell" for the ordinary
   * case would skip the disk check on every fresh install — which is the one
   * install where it matters.
   */
  it('answers for a directory that does not exist yet, by asking its volume', () => {
    const free = freeBytesFor(join(tmpdir(), 'apunta-not-created-yet', 'models'));
    expect(free).not.toBeNull();
    expect(free ?? 0).toBeGreaterThan(0);
  });

  it('answers for a directory that does exist', () => {
    expect(freeBytesFor(tmpdir()) ?? 0).toBeGreaterThan(0);
  });
});

describe('checkDiskSpace', () => {
  it('reports the shortfall as needed-plus-headroom minus free', () => {
    const check = checkDiskSpace({ freeBytes: 10 * GB, requiredBytes: 20 * GB, headroomBytes: 5 * GB });
    expect(check.ok).toBe(false);
    expect(check.shortfallBytes).toBe(15 * GB);
  });

  it('passes with exactly enough', () => {
    const check = checkDiskSpace({ freeBytes: 25 * GB, requiredBytes: 20 * GB, headroomBytes: 5 * GB });
    expect(check.ok).toBe(true);
    expect(check.shortfallBytes).toBe(0);
  });
});
