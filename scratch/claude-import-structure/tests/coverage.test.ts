import { describe, expect, it } from 'vitest';

import { CaptureIndex, parseCapture } from '../src/capture.js';
import { validate } from '../src/validate.js';
import { corpus, corpusJson, gold, sessionFor } from './helpers.js';

/**
 * Coverage, and the difference between "she has four sessions" and "we found
 * four sessions".
 *
 * A capture that stopped at page three of nine can otherwise produce a
 * confident, complete-looking import of a truncated history — the failure mode
 * that no later review catches, because the summary is internally consistent.
 */

const capture = corpus();

function edit(change: (proposal: ReturnType<typeof gold>) => void) {
  const proposal = gold();
  change(proposal);
  return validate(capture, proposal);
}

describe('an incomplete capture cannot look complete', () => {
  it('refuses a capture that says it did not finish', () => {
    const json = corpusJson();
    (json['completeness'] as Record<string, unknown>)['complete'] = false;
    (json['completeness'] as Record<string, unknown>)['pages_read'] = 2;
    const report = validate(parseCapture(json), gold());
    expect(report.ok).toBe(false);
    expect(report.errors.map((error) => error.code)).toContain('incomplete_capture');
  });

  it('refuses a capture whose counts disagree with its contents', () => {
    const json = corpusJson();
    (json['completeness'] as Record<string, unknown>)['messages_declared'] = 39;
    const report = validate(parseCapture(json), gold());
    expect(report.errors.map((error) => error.code)).toContain('completeness_mismatch');
  });

  it('reports the failures it did record, as warnings with counts only', () => {
    const json = corpusJson();
    (json['completeness'] as Record<string, unknown>)['failures'] = [
      { stage: 'message', code: 'http_429', count: 3 },
    ];
    const report = validate(parseCapture(json), gold());
    const warning = report.warnings.find((entry) => entry.code === 'capture_failure_http_429');
    expect(warning?.detail).toBe('message: http_429 x3');
    expect(warning?.detail).not.toContain('conv-');
  });

  it('refuses a capture with a duplicate message id rather than picking one', () => {
    const json = corpusJson();
    const conversations = json['conversations'] as {
      conversation_id: string;
      messages: { message_id: string }[];
    }[];
    const first = conversations[0];
    if (first === undefined) throw new Error('fixture changed');
    first.messages[1] = { ...first.messages[1]!, message_id: 'a1-01' };
    expect(() => new CaptureIndex(parseCapture(json))).toThrow(/Duplicate message id/u);
  });
});

describe('every source message is accounted for', () => {
  it('reports nothing uncovered and nothing untouched for the clean proposal', () => {
    const report = edit(() => {});
    expect(report.uncovered).toEqual([]);
    expect(report.untouched_conversations).toEqual([]);
    expect(report.totals.live_branch_messages).toBe(39);
  });

  it('treats a hole in the middle of a thread as an error, not a warning', () => {
    const report = edit((proposal) => {
      // Two sittings claimed, the one between them dropped.
      const second = sessionFor(proposal, 'a1-04');
      second.message_ids = ['a1-05', 'a1-06'];
    });
    const finding = report.errors.find((error) => error.code === 'uncovered_interior_messages');
    expect(finding?.detail).toBe('1 live-branch messages belong to no session');
    expect(report.ok).toBe(false);
  });

  it('treats a dropped tail as a warning, because an unrelated coda is possible', () => {
    const report = edit((proposal) => {
      const session = sessionFor(proposal, 'a1-04');
      session.message_ids = ['a1-04', 'a1-05'];
    });
    expect(report.warnings.map((warning) => warning.code)).toContain('uncovered_source_messages');
    expect(report.errors).toEqual([]);
  });

  it('does not count an abandoned branch as a dropped sitting', () => {
    const report = edit((proposal) => {
      const session = sessionFor(proposal, 't1-00b');
      // Leave out the final revised reply: the tail of the live branch.
      session.message_ids = ['t1-00', 't1-00b', 't1-02'];
    });
    expect(report.totals.abandoned).toBe(1);
    const conversation = report.uncovered.find((entry) => entry.conversation_id === 'conv-tomas');
    expect(conversation?.messages).toBe(2);
  });

  it('counts an abandoned branch in the totals so it is never lost silently', () => {
    const report = edit(() => {});
    expect(report.totals.messages).toBe(40);
    expect(report.totals.abandoned).toBe(1);
    expect(report.totals.live_branch_messages).toBe(39);
  });
});
