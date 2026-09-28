import { describe, expect, it } from 'vitest';

import { importedKeys, liveThread } from '../../../server/src/import/claude.js';
import { CaptureIndex } from '../src/capture.js';
import { dryRun } from '../src/dry-run.js';
import { validate } from '../src/validate.js';
import { corpus, gold } from './helpers.js';

/**
 * The seam with production code, read-only.
 *
 * This is the one place the lane touches `server/`. It imports two functions and
 * changes nothing: `importedKeys` is what a second run uses to recognise what
 * the first one wrote, by parsing the first line of an imported note's
 * transcript. If this lane's provenance line is not in the grammar that parser
 * reads, then replaying a proposal writes the same notes twice — the exact
 * failure "replaying a proposal must have deterministic IDs and a testable dedupe
 * plan" is about.
 *
 * `liveThread` is imported for the same reason one line lower: the lane re-derived
 * the branch rule rather than importing it, and the two must agree or the lane is
 * testing a fiction.
 */

const capture = corpus();
const proposal = gold();
const report = validate(capture, proposal);

describe('the provenance line the shipped dedupe can read', () => {
  it('is recognised by importedKeys, with the conversation and its messages', () => {
    const dry = dryRun(capture, proposal, report);
    expect(dry.provenance).toHaveLength(12);
    const transcripts = dry.provenance.map((entry) => ({
      raw_text: `${entry.line}\n\n${'note body'}`,
      patient_id: 'patient-1',
    }));
    const keys = importedKeys(transcripts);
    expect(keys.conversations).toEqual(new Set());
    expect(keys.messages.size).toBeGreaterThan(0);
    // Every message id the plan cites is in the parsed set, so a replay of the
    // same proposal recognises all of them.
    for (const line of dry.provenance) {
      expect(keys.patients.has(line.session_key)).toBe(false);
    }
    const cited = dry.provenance.flatMap((entry) =>
      (entry.line.split('messages: ')[1] ?? '')
        .replace(']', '')
        .split(' ')
        .filter((id) => id !== ''),
    );
    expect(cited).toHaveLength(31);
    for (const id of cited) expect(keys.messages.has(id)).toBe(true);
  });

  it('falls back to whole-conversation keys when a line lists no messages', () => {
    const dry = dryRun(capture, proposal, report);
    const bare = dry.provenance[0];
    if (bare === undefined) throw new Error('no provenance produced');
    const stripped = bare.line.replace(/; messages: [^\]]*\]$/u, ']');
    const keys = importedKeys([{ raw_text: `${stripped}\n\nbody`, patient_id: 'patient-1' }]);
    const conversation = /\(([^()\s]+)\)/u.exec(stripped)?.[1];
    expect(conversation).toBeDefined();
    expect(keys.conversations.has(conversation as string)).toBe(true);
  });

  it('reads the patient a previous run landed on, from a line this lane wrote', () => {
    const dry = dryRun(capture, proposal, report);
    const line = dry.provenance[0];
    if (line === undefined) throw new Error('no provenance produced');
    const keys = importedKeys([{ raw_text: `${line.line}\n\nbody`, patient_id: '0192-ana' }]);
    const conversation = /\(([^()\s]+)\)/u.exec(line.line)?.[1] as string;
    expect(keys.patients.get(conversation)).toBe('0192-ana');
  });
});

describe('the branch rule, re-derived and compared', () => {
  it('agrees with the shipped liveThread on every conversation in the corpus', () => {
    const index = new CaptureIndex(capture);
    for (const conversation of capture.conversations) {
      const mine = index.liveThreadIds(conversation.conversation_id);
      const theirs = liveThread(
        conversation.messages.map((message) => ({
          id: message.message_id,
          parent: message.parent_message_id,
          at: message.sent_at,
        })),
      ).map((message) => message.id as string);
      expect(mine, conversation.conversation_id).toEqual(theirs);
    }
  });

  it('leaves exactly one message off the live branch, the discarded regeneration', () => {
    const index = new CaptureIndex(capture);
    const live = index.liveThreadIds('conv-tomas');
    expect(live).toEqual(['t1-00', 't1-00b', 't1-02', 't1-03', 't1-04']);
    expect(live).not.toContain('t1-01');
  });
});
