import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  DEFAULT_MODEL,
  LARGE_MODEL,
  PROMOTED_DEFAULT_MODEL,
  recommendedModelForMemory,
  SMALL_MODEL,
} from '@apunta/shared';
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
  /**
   * C-MODEL@1. The first run downloads **the effective model**, and the
   * effective model does not come from this Mac's memory — so the RAM table is
   * now a recommendation the plan may report and never a selection.
   */
  it('picks the effective model from the shared resolver, not from a RAM table', () => {
    for (const memoryGib of [null, 8, 16, 32, 64]) {
      expect(planFor({ memoryGib }).model.tag).toBe(PROMOTED_DEFAULT_MODEL);
    }
    // The tier table is still there, and still says what it always said.
    expect(recommendedModelForMemory(64)).toBe(LARGE_MODEL);
    expect(recommendedModelForMemory(32)).toBe(DEFAULT_MODEL);
    expect(recommendedModelForMemory(8)).toBe(SMALL_MODEL);
  });

  it('lets an explicit setting beat the promoted default', () => {
    const plan = planFor({ memoryGib: 8, modelOverride: 'gemma4:12b-it-qat' });
    expect(plan.model.tag).toBe('gemma4:12b-it-qat');
    expect(plan.model.reason).toContain('chosen for this Mac rather than by Apunta');
  });

  it('treats a blank override as no override', () => {
    expect(planFor({ modelOverride: '   ' }).model.tag).toBe(PROMOTED_DEFAULT_MODEL);
    expect(planFor({ modelOverride: null }).model.tag).toBe(PROMOTED_DEFAULT_MODEL);
  });

  /**
   * `memoryGib` stays on the event. It is reported, not obeyed: the window can
   * show what else the machine could run, and the owner can see what was read.
   */
  it('reports the memory it read, without letting it choose the model', () => {
    for (const memoryGib of [null, 8, 16, 32, 64]) {
      const plan = planFor({ memoryGib });
      expect(plan.memoryGib).toBe(memoryGib);
      expect(plan.model.tag).toBe(PROMOTED_DEFAULT_MODEL);
    }
  });

  it('is ready when both models are already there', () => {
    const plan = planFor({ speechModelPresent: true, previewModelPresent: true, writingModelPresent: true });
    expect(plan.ready).toBe(true);
    expect(plan.disk.requiredBytes).toBe(0);
    expect(plan.steps.every((step) => !step.needed)).toBe(true);
  });

  /**
   * The size of the download follows the effective tag, not the tier the
   * machine would have landed on. A 64 GB Mac that would have pulled 24 GB of
   * weights now pulls the promoted 4B model's, and the disk check has to be
   * checking that.
   */
  it('sizes the writing step from the effective tag', () => {
    const small = planFor({ memoryGib: 8 });
    const large = planFor({ memoryGib: 64 });
    expect(small.model.tag).toBe(large.model.tag);
    expect(small.disk.requiredBytes).toBe(large.disk.requiredBytes);
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
  /**
   * The reason is no longer the machine. It says which model, and that Apunta
   * picks the same one everywhere — which is the sentence a first-run window
   * can show without the owner wondering why *her* Mac got a different answer
   * from the last person who ran it.
   */
  it('says the promoted tag is the same on every machine, not a choice from this one', () => {
    for (const tag of [PROMOTED_DEFAULT_MODEL, DEFAULT_MODEL, LARGE_MODEL]) {
      const reason = explainChoice(tag, 'promoted');
      expect(reason).toContain(tag);
      expect(reason).toMatch(/same .*every machine/i);
      expect(reason).toMatch(/not .*from this Mac/i);
    }
  });

  /**
   * An override keeps naming the tag and says where it came from, so the owner
   * can tell her own setting from Apunta's default.
   */
  it('names an override and says it was chosen for the machine', () => {
    const reason = explainChoice('gemma4:12b-it-qat', 'override');
    expect(reason).toContain('gemma4:12b-it-qat');
    expect(reason).toContain('chosen for this Mac rather than by Apunta');
  });

  /**
   * The card's prohibition, asserted directly: no number from `sysctl` may
   * appear in the reason, because the reason is no longer a function of it.
   */
  it('never cites the machine’s memory as the reason', () => {
    for (const source of ['promoted', 'override'] as const) {
      const reason = explainChoice(PROMOTED_DEFAULT_MODEL, source);
      expect(reason).not.toMatch(/\d+\s*GB/);
      expect(reason).not.toMatch(/GiB|memory size|hw\.memsize|smallest of|middle of|largest of/);
      // And still no instructions to run.
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
