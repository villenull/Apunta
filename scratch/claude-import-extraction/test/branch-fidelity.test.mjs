// D1, and the failure class around it.
//
// The independent review (docs/research/claude-import-independent-review.md,
// D1) found that a web capture whose response carried no fork links was reported
// **clean**: the normalizer read `parent_message_uuid` when present and never
// said when it was absent, so the shipped importer then followed array order,
// spliced the abandoned edit into the note, and reported `abandoned: 0` — which
// reads as *nothing was lost*.
//
// The reviewer's reproducer is kept here as the regression it should be: the
// links are removed from the response, and the same file is opened with the
// unmodified shipped reader so the consequence stays visible in the suite rather
// than only in the review.
//
// The fix is not "a response without links means the wrong branch was taken".
// Absence of links means the capture cannot tell. So the capture says
// **unknown**, the verdict is never `complete`, and the tests below assert that
// wording as well as the flag.

import assert from 'node:assert/strict';
import { join } from 'node:path';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { runOnce } from './helpers.mjs';
import { branchFidelity, classifyBody } from '../src/shapes.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repository = resolve(here, '../../..');
const { openExport, readConversations } = await import(join(repository, 'server/src/import/claude.ts'));

function gapCodes(result) {
  return [...new Set(result.report.gaps.map((gap) => gap.code))];
}

/** The reviewer's reproducer, run against the shipped reader. */
function shippedReaderOn(capture) {
  const read = openExport(Buffer.from(capture, 'utf8'), 'conversations.json');
  const john = read.conversations.find((conversation) => conversation.id === 'c-john-a');
  return {
    abandoned: john?.abandoned ?? null,
    thread: (john?.turns ?? []).map((turn) => turn.id),
    hasAbandonedReply: (john?.turns ?? []).some((turn) => turn.id === 'c-john-a-s3-a1'),
  };
}

test('the usable-link test is the importer’s own predicate', () => {
  const linked = [
    { uuid: 'a', parent_message_uuid: null },
    { uuid: 'b', parent_message_uuid: 'a' },
    { uuid: 'c', parent_message_uuid: 'b' },
  ];
  const chain = branchFidelity(linked);
  assert.equal(chain.fidelity, 'links_present');
  assert.equal(chain.usable, 2);
  assert.equal(chain.mechanism_carries_ancestry, true);
  // The one thing the classifier refuses to say, even about a perfect chain.
  assert.equal(chain.conversation_ancestry_complete, null);
  assert.equal(chain.selected_branch, 'not_selected_here');

  // No links at all: not evidence of an unbranched conversation.
  const flat = linked.map((message) => ({ uuid: message.uuid, parent_message_uuid: null }));
  const flatBranch = branchFidelity(flat);
  assert.equal(flatBranch.fidelity, 'links_absent');
  assert.equal(flatBranch.carries, 0);
  assert.equal(flatBranch.mechanism_carries_ancestry, false);

  // Links that name messages outside the response: ancestry is missing.
  const dangling = linked.map((message) => ({
    uuid: message.uuid,
    parent_message_uuid:
      message.parent_message_uuid === null ? null : `${message.parent_message_uuid}-absent`,
  }));
  assert.equal(branchFidelity(dangling).fidelity, 'links_present');
  assert.equal(branchFidelity(dangling).dangling, 2);

  // A message naming itself is not a link to anything.
  const self = [
    { uuid: 'a', parent_message_uuid: null },
    { uuid: 'b', parent_message_uuid: 'b' },
  ];
  assert.equal(branchFidelity(self).fidelity, 'structurally_invalid');
  assert.equal(branchFidelity(self).selfLinks, 1);
});

test('D1 regression: a flat response is flagged, not reported clean', async () => {
  const flat = await runOnce('web-app', { drift: { detail: ['drop_parent_links'] } });
  assert.ok(
    gapCodes(flat.result).includes('branch_fidelity_unknown'),
    `a capture that cannot follow branches must say so; gaps were ${gapCodes(flat.result).join(', ')}`,
  );
  assert.equal(flat.result.report.status, 'complete_with_gaps');
  assert.notEqual(flat.result.report.status, 'complete');
  const gap = flat.result.report.gaps.find((each) => each.code === 'branch_fidelity_unknown');
  assert.equal(gap.detail.fidelity, 'links_absent');
  assert.equal(gap.detail.usable, 0, 'the detail must say no usable link was found');
});

test('D1 regression: the reviewer’s reproducer, and why the flag matters', async () => {
  const withLinks = await runOnce('web-app');
  const flat = await runOnce('web-app', { drift: { detail: ['drop_parent_links'] } });

  // The review's numbers, reproduced: 9 of 10 messages carry a link in the
  // fixture; the shipped reader reports abandoned 2 with links and 0 without,
  // and the abandoned reply is inside the thread in the second case.
  const linked = shippedReaderOn(withLinks.files.files_by_name['conversations.json'].bytes);
  const flattened = shippedReaderOn(flat.files.files_by_name['conversations.json'].bytes);
  assert.equal(linked.abandoned, 2);
  assert.equal(flattened.abandoned, 0);
  assert.equal(linked.hasAbandonedReply, false);
  assert.equal(flattened.hasAbandonedReply, true, 'the abandoned reply is spliced in when links are absent');

  // The record is the same either way — same messages, same text, same instants.
  // What changes is only the ancestry field, and therefore only what the file is
  // *allowed to claim*: so the claim has to come from the manifest, and the
  // manifest has to be read before the file is used.
  const strip = (bytes) => {
    const parsed = JSON.parse(bytes);
    return JSON.stringify(
      parsed.map((conversation) => ({
        uuid: conversation.uuid,
        name: conversation.name,
        chat_messages: conversation.chat_messages.map((message) => ({
          uuid: message.uuid,
          sender: message.sender,
          text: message.text,
          created_at: message.created_at,
        })),
      })),
    );
  };
  assert.equal(
    strip(withLinks.files.files_by_name['conversations.json'].bytes),
    strip(flat.files.files_by_name['conversations.json'].bytes),
    'only the ancestry should differ between the two captures',
  );
  assert.equal(withLinks.result.report.status === 'complete', false);
  assert.equal(flat.result.report.status === 'complete', false);
  // And the acknowledgement gate still stands between a flagged capture and the
  // import side: neither run hands over unasked.
  assert.equal(withLinks.files.handoffable, false);
  assert.equal(flat.files.handoffable, false);
});

test('D1 regression: a capture that lost its ancestry says so, and says which links', async () => {
  const dangling = await runOnce('web-app', { drift: { detail: ['dangling_parent_links'] } });
  const gap = dangling.result.report.gaps.find((each) => each.code === 'branch_ancestry_unresolved');
  assert.ok(gap, 'unresolved ancestry was not reported');
  assert.equal(gap.detail.fidelity, 'links_present');
  assert.ok(gap.detail.dangling > 0);
  assert.equal(dangling.result.report.status, 'complete_with_gaps');
  // The links are carried through untouched, and they are no more usable than if
  // they had been absent: the shipped reader cannot resolve a single one, so it
  // falls back to array order and reports nothing abandoned. That is the sharper
  // version of D1 — a capture can look well-formed and still be unfollowable.
  const read = readConversations(JSON.parse(dangling.files.files_by_name['conversations.json'].bytes));
  const john = read.conversations.find((conversation) => conversation.id === 'c-john-a');
  assert.equal(john.abandoned, 0, 'dangling links are as unusable as no links at all');
  assert.ok(
    john.turns.some((turn) => turn.id === 'c-john-a-s3-a1'),
    'the abandoned reply is in the thread',
  );
});

test('the documented mechanism names the same gap in the same words', async () => {
  const { result } = await runOnce('compliance-api');
  const gap = result.report.gaps.find((each) => each.code === 'branch_fidelity_unknown');
  assert.ok(gap, 'the compliance run must name unknown branch fidelity too');
  assert.equal(result.report.status, 'complete_with_gaps');
  // And the schema note says why, without claiming the live API behaves so.
  const drift = result.state.warnings.find(
    (warning) =>
      warning.code === 'schema_drift' && String(warning.detail).includes('not_listed_in_documented_schema'),
  );
  assert.ok(drift, 'the reason the link is absent was not recorded');
});

test('a one-message conversation is not reported as having unknown branch fidelity', async () => {
  // Nothing can be branched, so there is nothing to be uncertain about. An empty
  // conversation is likewise not evidence either way, and must not be dressed up
  // as a finding.
  const { result } = await runOnce('web-app');
  const single = result.state.fetched['c-empty'];
  assert.equal(single.meta.branch.carries, 0);
  assert.ok(
    !result.report.gaps.some((gap) => gap.id === 'c-empty' && gap.code.startsWith('branch_')),
    'an empty conversation was reported as a branch finding',
  );
});

// --- the other half: a body that is not the document we asked for -------------

test('a 200 that carries a sign-in page is a format failure, not content', () => {
  const html = classifyBody({
    status: 200,
    json: '<!DOCTYPE html><html><body><h1>Sign in to continue</h1></body></html>',
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
  assert.equal(html.format, 'html');
  const dom = classifyBody({
    status: 200,
    json: { html: '<div data-testid="conversation">…</div>' },
    headers: { 'content-type': 'application/json' },
  });
  assert.equal(dom.format, 'dom_snapshot');
  const text = classifyBody({
    status: 200,
    json: 'upstream connect error',
    headers: { 'content-type': 'text/plain' },
  });
  assert.equal(text.format, 'text');
  assert.equal(classifyBody({ status: 200, json: null, headers: {} }).format, 'empty');
  assert.equal(classifyBody({ status: 200, json: { uuid: 'c-1' }, headers: {} }).format, 'json');
  assert.equal(classifyBody({ status: 200, json: [{ uuid: 'c-1' }], headers: {} }).format, 'json');
});

for (const kind of ['html', 'dom_snapshot', 'text', 'empty']) {
  test(`a ${kind} body on the inventory blocks the run and captures nothing`, async () => {
    const { result, files } = await runOnce('web-app', {
      formatFaults: [{ match: '/api/organizations', kind }],
    });
    assert.equal(result.report.status, 'blocked', `a ${kind} body must not leave a capture`);
    assert.deepEqual(result.conversations, [], 'nothing was captured, and nothing may be offered');
    assert.equal(files.handoffable, false);
    assert.equal(result.report.failures[0].code, 'unsupported_response_format');
    const manifest = JSON.parse(files.files_by_name['extraction-manifest.json'].bytes);
    assert.equal(manifest.report.status, 'blocked');
    assert.equal(manifest.report.handoffable, false);
  });

  test(`a ${kind} body on one conversation is partial, and the conversation is named`, async () => {
    const { result, files } = await runOnce('web-app', { formatFaults: [{ match: '/c-john-b', kind }] });
    assert.equal(result.report.status, 'partial');
    assert.deepEqual(result.report.missing_conversations, ['c-john-b']);
    assert.equal(files.handoffable, false);
    assert.equal(result.report.failures[0].code, 'unsupported_response_format');
    // The rest of the account is still captured, and the manifest says the file
    // is short one conversation — a capture of most of an account is not a
    // capture of the account.
    assert.equal(result.report.captured_conversations, 14);
  });
}

test('a format failure cannot be retried into success by accident', async () => {
  // The format guard runs before the retry policy is consulted, so a body that
  // is not the document is never counted as a transient error.
  const { result, sleep } = await runOnce('web-app', {
    formatFaults: [{ match: '/c-dana', kind: 'html' }],
  });
  const failures = result.report.failures.filter((failure) => failure.id === 'c-dana');
  assert.equal(failures.length, 1);
  assert.equal(result.report.stats.retries, 0, 'a sign-in page is not a transient error');
  assert.equal(sleep.waits.length, 0);
});

test('a real 5xx is still retried, so the guard has not cost resilience', async () => {
  const { result, sleep } = await runOnce('web-app', {
    faults: [{ match: '/c-dana', status: 503, times: 1 }],
  });
  assert.equal(result.report.stats.retries, 1);
  assert.equal(sleep.waits.length, 1);
  assert.equal(result.report.status, 'complete_with_gaps');
});
