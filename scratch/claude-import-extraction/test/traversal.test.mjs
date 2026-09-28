// Complete capture: every declared conversation fetched, once, and the result
// equal to what an independently written expectation says it must be.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  EXPECTED,
  assertOnlyKnownEndpoints,
  expectedCapture,
  expectedDigests,
  extract,
  gapCodes,
  requestsFor,
  runOnce,
} from './helpers.mjs';
import { selfCheck } from '../fixtures/expected.mjs';

test('the stated expectation matches the account it describes', () => {
  const check = selfCheck();
  assert.deepEqual(
    check.problems,
    [],
    `the fixture and its stated expectation disagree: ${check.problems.join('; ')}`,
  );
});

for (const mechanism of ['web-app', 'compliance-api']) {
  test(`${mechanism}: the capture equals the independently built expectation`, async () => {
    const { files, result } = await runOnce(mechanism);
    assert.equal(
      files.files_by_name['conversations.json'].digest,
      expectedDigests(mechanism).file,
      'the capture digest is not the expected one',
    );
    assert.deepEqual(
      result.conversations.map((conversation) => conversation.uuid),
      expectedCapture(mechanism).map((conversation) => conversation.uuid),
    );
  });

  test(`${mechanism}: every declared conversation is fetched exactly once`, async () => {
    const { account, result } = await runOnce(mechanism);
    assert.equal(result.report.declared_conversations, EXPECTED[mechanism].conversations);
    assert.equal(result.report.captured_conversations, EXPECTED[mechanism].conversations);
    assert.equal(result.report.captured_messages, EXPECTED[mechanism].messages);
    assert.deepEqual(result.report.missing_conversations, []);
    // One captured record per declared conversation, and no id left behind.
    assert.deepEqual(Object.keys(result.state.fetched).sort(), [...EXPECTED[mechanism].ids].sort());
    for (const id of EXPECTED[mechanism].ids) {
      assert.ok(requestsFor(account, `/${id}`) >= 1, `${id} was never fetched`);
      assert.equal(
        requestsFor(account, `/${id}`),
        result.state.fetched[id].meta.pages,
        `${id} was asked for more times than it declared pages`,
      );
    }
  });

  test(`${mechanism}: the inventory is walked page by page, and the pages are recorded`, async () => {
    const { result } = await runOnce(mechanism);
    const pages = result.report.inventory_pages;
    assert.ok(pages.length >= 2, `expected a multi-page inventory, saw ${String(pages.length)}`);
    for (const [index, page] of pages.entries()) {
      assert.equal(page.page, index + 1, 'pages are not numbered in order');
      if (index > 0) {
        assert.equal(
          page.cursor_sent,
          pages[index - 1].cursor_received,
          'a page did not continue from the previous cursor',
        );
      }
      assert.equal(typeof page.has_more, 'boolean');
    }
    const declared = pages.reduce((sum, page) => sum + page.declared_ids, 0);
    assert.ok(
      declared >= result.report.declared_conversations,
      'the pages declare fewer ids than were captured',
    );
    assert.equal(pages.at(-1).has_more, false, 'the last page still claims there is more');
  });

  test(`${mechanism}: nothing is lost, and nothing outside the modelled endpoints is called`, async () => {
    const { account, result } = await runOnce(mechanism);
    assertOnlyKnownEndpoints(assert, account);
    assert.deepEqual(result.report.failures, [], 'a well-behaved account produced failures');
    assert.deepEqual(
      gapCodes(result.report),
      mechanism === 'web-app'
        ? ['artifact_content_not_captured', 'non_text_content_not_captured']
        : [
            'branch_ancestry_unresolved',
            'branch_fidelity_unknown',
            'non_text_content_not_captured',
            'schema_drift',
          ],
      'the gaps of a clean run are not the expected ones',
    );
  });
}

test('the web mechanism lists the chat deleted in the app; the documented one lists it and says so', async () => {
  const web = await runOnce('web-app');
  const compliance = await runOnce('compliance-api');
  assert.equal(
    web.result.conversations.some((conversation) => conversation.uuid === 'c-deleted'),
    false,
  );
  const deleted = compliance.result.conversations.find((conversation) => conversation.uuid === 'c-deleted');
  assert.ok(deleted, 'the documented mechanism should still list a chat deleted in the app');
  assert.equal(deleted.name, '', 'a deleted chat comes back with an empty name');
  assert.deepEqual(deleted.chat_messages, [], 'a deleted chat has no content left to fetch');
});

test('a long conversation is read in message-sized pages and reassembled in order', async () => {
  const { account, result } = await runOnce('compliance-api', { messagePageCap: 7 });
  const long = result.conversations.find((conversation) => conversation.uuid === 'c-long');
  assert.equal(long.chat_messages.length, 30);
  // 30 messages, 7 per page: five pages, and the walk asks for each one once.
  assert.equal(requestsFor(account, '/c-long/messages'), 5);
  assert.deepEqual(
    long.chat_messages.map((message) => message.uuid),
    expectedCapture('compliance-api')
      .find((conversation) => conversation.uuid === 'c-long')
      .chat_messages.map((message) => message.uuid),
  );
});

test('the handoff is exactly the export file plus a manifest beside it', async () => {
  const { files } = await runOnce('compliance-api', {}, { allowGaps: true });
  assert.deepEqual(
    files.files.map((file) => file.name),
    ['conversations.json', 'extraction-manifest.json', 'artifacts.json'],
  );
  const parsed = JSON.parse(files.files_by_name['conversations.json'].bytes);
  assert.ok(Array.isArray(parsed), 'conversations.json is a top-level array, as the export is');
  const manifest = JSON.parse(files.files_by_name['extraction-manifest.json'].bytes);
  assert.equal(manifest.kind, 'apunta.claude-import.extraction');
  assert.equal(manifest.synthetic, true, 'the manifest must say the capture came from a synthetic account');
  assert.equal(manifest.report.mechanism, 'compliance-api');
  assert.equal(manifest.report.captured_conversations, EXPECTED['compliance-api'].conversations);
  // The export file carries no manifest keys: it must be interchangeable with
  // the file the Settings screen already opens.
  assert.deepEqual(Object.keys(parsed[0]).sort(), [
    'account',
    'chat_messages',
    'created_at',
    'name',
    'updated_at',
    'uuid',
  ]);
});

test('both mechanisms produce the same note text, the same ids and the same attachment records', async () => {
  const web = await runOnce('web-app');
  const compliance = await runOnce('compliance-api');
  const webById = new Map(web.result.conversations.map((conversation) => [conversation.uuid, conversation]));
  for (const conversation of compliance.result.conversations) {
    const other = webById.get(conversation.uuid);
    if (other === undefined) continue;
    assert.deepEqual(
      conversation.chat_messages.map((message) => [message.uuid, message.sender, message.text]),
      other.chat_messages.map((message) => [message.uuid, message.sender, message.text]),
      `${conversation.uuid} differs between the two mechanisms beyond the fields the mechanisms cannot carry`,
    );
  }
});

test('a run with a different identity starts over rather than resuming someone else’s state', async () => {
  const first = await runOnce('compliance-api', {}, { runId: 'run-a' });
  const second = await runOnce('compliance-api', {}, { runId: 'run-b' });
  assert.equal(second.result.report.resumed, false);
  assert.equal(second.result.report.captured_conversations, first.result.report.captured_conversations);
});

test('a run with no gaps and no failures is the only one whose file may be handed over unasked', async () => {
  const withGaps = await runOnce('web-app');
  assert.equal(withGaps.result.report.status, 'complete_with_gaps');
  assert.equal(withGaps.files.handoffable, false, 'a run with gaps must not be handed over silently');
  assert.equal(withGaps.files.gaps_acknowledged, false);
  const acknowledged = await runOnce('web-app', {}, { allowGaps: true });
  assert.equal(acknowledged.files.handoffable, true);
  assert.equal(acknowledged.files.gaps_acknowledged, true);
});

test('extract() is a pure function of its inputs: the same account twice gives the same bytes', async () => {
  const first = await runOnce('compliance-api');
  const second = await runOnce('compliance-api');
  assert.equal(
    first.files.files_by_name['conversations.json'].bytes,
    second.files.files_by_name['conversations.json'].bytes,
  );
});

test('an account with no conversations at all is an empty capture, not a failure', async () => {
  const { createSyntheticAccount } = await import('../fixtures/account.mjs');
  const { createComplianceSource } = await import('../src/sources.mjs');
  const { createMemoryCheckpoint } = await import('../src/checkpoint.mjs');
  const account = createSyntheticAccount();
  const empty = {
    request: (method, url) =>
      url.startsWith('/v1/compliance/apps/chats?')
        ? { status: 200, json: { data: [], has_more: false, first_id: null, last_id: null }, headers: {} }
        : account.request(method, url),
  };
  const result = await extract({
    source: createComplianceSource({ request: empty.request }),
    checkpoint: createMemoryCheckpoint(),
    runId: 'empty',
  });
  assert.equal(result.report.status, 'complete');
  assert.equal(result.report.handoffable, true);
  assert.deepEqual(result.conversations, []);
});
