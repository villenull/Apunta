// What happens when the account misbehaves, the run is interrupted, or the
// response schema moves. The rule under test: a run that lost anything is never
// reported complete, and a run that could not finish the inventory is blocked
// rather than quietly short.

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  EXPECTED,
  createFileCheckpoint,
  createMemoryCheckpoint,
  extract,
  expectedDigests,
  handoff,
  runOnce,
  synthetic,
} from './helpers.mjs';

const COMPLIANCE_LIST = '/v1/compliance/apps/chats?';

test('a rate limit is waited out, and the wait is the one the source asked for', async () => {
  const { result, sleep } = await runOnce('compliance-api', {
    faults: [{ match: COMPLIANCE_LIST, status: 429, headers: { 'retry-after': '2' }, times: 1 }],
  });
  assert.deepEqual(
    sleep.waits.map((wait) => ({ ms: wait.ms, status: wait.status })),
    [{ ms: 2000, status: 429 }],
  );
  assert.equal(result.report.stats.retries, 1);
  assert.equal(result.report.captured_conversations, EXPECTED['compliance-api'].conversations);
});

test('backoff without a Retry-After doubles, and is capped', async () => {
  const { sleep } = await runOnce(
    'compliance-api',
    { faults: [{ match: COMPLIANCE_LIST, status: 503, times: 3 }] },
    { limits: { maxAttempts: 4, retryBaseMs: 100, retryMaxMs: 250 } },
  );
  assert.deepEqual(
    sleep.waits.map((wait) => wait.ms),
    [100, 200, 250],
  );
});

test('a rate limit that never lifts blocks the run, and blocks it with nothing fetched', async () => {
  const { result, files } = await runOnce('compliance-api', {
    faults: [{ match: COMPLIANCE_LIST, status: 429, times: 50 }],
  });
  assert.equal(result.report.status, 'blocked');
  assert.equal(result.report.handoffable, false);
  assert.equal(files.handoffable, false);
  assert.deepEqual(result.conversations, []);
  assert.equal(result.report.failures[0].code, '429');
});

test('a signed-out inventory is blocked, not read as an empty account', async () => {
  for (const status of [401, 403]) {
    const { result } = await runOnce('compliance-api', {
      faults: [{ match: COMPLIANCE_LIST, status, times: 1 }],
    });
    assert.equal(result.report.status, 'blocked', `${String(status)} should block the run`);
    assert.equal(result.report.declared_conversations, 0);
    assert.deepEqual(result.conversations, []);
  }
});

test('a signed-out detail page is partial, and the missing conversation is named', async () => {
  const { result, files } = await runOnce('compliance-api', {
    faults: [{ match: '/c-john-b/messages', status: 401, times: 1 }],
  });
  assert.equal(result.report.status, 'partial');
  assert.equal(result.report.handoffable, false);
  assert.equal(files.handoffable, false);
  assert.deepEqual(result.report.missing_conversations, ['c-john-b']);
  assert.ok(
    result.report.gaps.some((gap) => gap.code === 'auth_expired_during_detail'),
    'an expired session mid-run must be reported as such',
  );
  // A partial run still writes what it did capture, and says so in the manifest.
  const manifest = JSON.parse(
    handoff({ conversations: result.conversations, report: result.report }).files_by_name[
      'extraction-manifest.json'
    ].bytes,
  );
  assert.equal(manifest.report.status, 'partial');
  assert.deepEqual(manifest.report.missing_conversations, ['c-john-b']);
});

test('a 500 is retried and then succeeds, and the capture is unaffected', async () => {
  const { result, files } = await runOnce('compliance-api', {
    faults: [{ match: '/c-jane-doe/messages', status: 500, times: 1 }],
  });
  assert.equal(result.report.stats.retries, 1);
  assert.equal(result.report.status, 'complete_with_gaps');
  assert.equal(files.files_by_name['conversations.json'].digest, expectedDigests('compliance-api').file);
});

test('a conversation the account will not serve is a named failure, not a silent gap', async () => {
  const { result } = await runOnce('compliance-api', { missingDetail: ['c-recipe'] });
  assert.equal(result.report.status, 'partial');
  assert.deepEqual(result.report.missing_conversations, ['c-recipe']);
  assert.equal(result.report.failures.length, 1);
  assert.equal(result.report.failures[0].code, '404');
  assert.equal(result.report.failures[0].id, 'c-recipe');
});

test('an interrupted run resumes from its checkpoint and lands on the same bytes', async () => {
  const checkpoint = createMemoryCheckpoint();
  let allowed = 3;
  const first = await runOnce(
    'compliance-api',
    {},
    { checkpoint, runId: 'resumable', until: () => allowed > 0 && (allowed -= 1) >= 0 },
  );
  assert.equal(first.result.report.status, 'partial');
  assert.equal(first.result.conversations.length, 3, 'the interrupted run kept only what it had finished');
  assert.ok(Object.keys(checkpoint.load().fetched).length === 3);
  // The second attempt sees the same account and finishes the rest.
  const { account, source } = synthetic('compliance-api');
  const second = await extract({ source, checkpoint, runId: 'resumable' });
  assert.equal(second.report.resumed, true);
  assert.equal(second.report.captured_conversations, EXPECTED['compliance-api'].conversations);
  assert.equal(
    handoff({ conversations: second.conversations, report: second.report }).files_by_name[
      'conversations.json'
    ].digest,
    expectedDigests('compliance-api').file,
    'a resumed capture must be byte-identical to an uninterrupted one',
  );
  assert.ok(account.logs.length < 40, 'the resume refetched the whole account instead of the remainder');
});

test('a corrupt checkpoint stops the run rather than restarting it from a half-state', () => {
  const directory = mkdtempSync(join(tmpdir(), 'apunta-extract-'));
  const path = join(directory, 'checkpoint.json');
  const store = createFileCheckpoint(path);
  store.save({
    v: 1,
    runId: 'x',
    phase: 'detail',
    list: { ids: [] },
    fetched: {},
    artifacts: {},
    failures: [],
    warnings: [],
    stats: {},
  });
  assert.equal(createFileCheckpoint(path).load().runId, 'x');
  const body = JSON.parse(readFileSync(path, 'utf8'));
  body.state.phase = 'list';
  writeFileSync(path, JSON.stringify(body), 'utf8');
  assert.throws(() => createFileCheckpoint(path).load(), /checkpoint_corrupt/);
  assert.equal(createFileCheckpoint(join(directory, 'absent.json')).load(), null);
});

test('a checkpoint on disk is written after every unit of work', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'apunta-extract-'));
  const checkpoint = createFileCheckpoint(join(directory, 'checkpoint.json'));
  const { result } = await runOnce('compliance-api', {}, { checkpoint });
  assert.ok(
    checkpoint.saves() > EXPECTED['compliance-api'].conversations,
    'the checkpoint is not being written per unit',
  );
  assert.equal(checkpoint.load().phase, 'artifact-done');
  assert.equal(result.report.captured_conversations, EXPECTED['compliance-api'].conversations);
});

test('a conversation repeated across inventory pages is fetched once and the capture is unchanged', async () => {
  const { result, files } = await runOnce('compliance-api', { duplicateAtPage: 2 });
  // One page repeats its first id, and it is counted once.
  assert.equal(result.report.stats.duplicateConversations, 1);
  assert.equal(result.report.captured_conversations, EXPECTED['compliance-api'].conversations);
  assert.equal(files.files_by_name['conversations.json'].digest, expectedDigests('compliance-api').file);
});

test('a message repeated across pages is counted once and kept once', async () => {
  const { result, files } = await runOnce('compliance-api', { duplicateMessages: true });
  assert.ok(result.report.stats.duplicateMessages > 0, 'the overlap was not noticed');
  assert.equal(result.report.captured_messages, EXPECTED['compliance-api'].messages);
  assert.equal(files.files_by_name['conversations.json'].digest, expectedDigests('compliance-api').file);
});

test('an empty page in a windowed inventory is survivable, and is reported as a hole', async () => {
  // The window moves on, so the walk finishes — but the rows the empty page
  // stood for were never shown, so the capture is not a full one and says so.
  const survived = await runOnce('web-app', { emptyPageAt: 2 });
  assert.ok(
    survived.result.report.captured_conversations < EXPECTED['web-app'].conversations,
    'the empty page should have cost conversations',
  );
  assert.equal(survived.result.report.status, 'complete_with_gaps');
  const gap = survived.result.report.gaps.find((each) => each.code === 'inventory_page_empty');
  assert.ok(gap, 'the empty page was not reported');
  assert.equal(gap.page, 2);
  // Tolerance of zero turns the same page into a stall instead.
  const stalled = await runOnce('web-app', { emptyPageAt: 2 }, { limits: { maxEmptyPages: 0 } });
  assert.equal(stalled.result.report.status, 'blocked');
  assert.match(stalled.result.report.failures[0].code, /^empty_page_streak/);
  assert.equal(stalled.files.handoffable, false);
});

test('an empty page from a cursor-based inventory is a stall: there is nowhere to go next', async () => {
  const { result, files } = await runOnce('compliance-api', { emptyPageAt: 2 });
  assert.equal(result.report.status, 'blocked');
  assert.equal(result.report.failures[0].code, 'cursor_missing_while_more_declared');
  assert.equal(files.handoffable, false);
  assert.ok(result.report.captured_conversations < EXPECTED['compliance-api'].conversations);
});

test('a cursor that never advances is a stall, not progress', async () => {
  const { result } = await runOnce('compliance-api', { stallCursor: true });
  assert.equal(result.report.status, 'blocked');
  assert.ok(
    ['cursor_repeated', 'cursor_did_not_advance'].includes(result.report.failures[0].code),
    `unexpected stall code: ${String(result.report.failures[0].code)}`,
  );
  assert.ok(result.report.declared_conversations < EXPECTED['compliance-api'].conversations);
});

test('an inventory that will not fit the page budget is blocked, not truncated', async () => {
  const { result } = await runOnce('compliance-api', {}, { limits: { maxListPages: 2 } });
  assert.equal(result.report.status, 'blocked');
  assert.match(result.report.failures[0].code, /^page_budget_exhausted/);
});

test('a caller that stops the run gets a partial, and the reason is recorded', async () => {
  const { result } = await runOnce('compliance-api', {}, { until: () => false });
  assert.equal(result.report.status, 'partial');
  assert.equal(result.report.failures.at(-1).code, 'stopped_by_caller');
  assert.equal(result.conversations.length, 0);
});

test('a renamed message key is a named failure, not a short file', async () => {
  const { result, files } = await runOnce('compliance-api', { drift: { messages: ['rename_messages'] } });
  assert.equal(result.report.status, 'partial');
  assert.equal(result.report.captured_messages, 0);
  assert.equal(files.handoffable, false);
  assert.equal(result.report.failures[0].code, 'missing_messages');
});

test('a sender key that moves is a hole in the record, and is counted as one', async () => {
  const { result } = await runOnce('compliance-api', { drift: { messages: ['drop_message_sender'] } });
  assert.equal(result.report.status, 'partial');
  // Every conversation that had messages at all; the two empty ones have
  // nothing to drop, so they are captured unchanged.
  const failures = result.report.failures.filter((failure) => failure.code === 'messages_dropped');
  assert.equal(
    failures.length,
    EXPECTED['compliance-api'].conversations - 2,
    'two conversations have no messages to drop',
  );
  assert.equal(
    failures.reduce((sum, failure) => sum + failure.count, 0),
    EXPECTED['compliance-api'].messages,
    'every message of every conversation was dropped, and the count should say so',
  );
  // A page the normalizer cannot read is a parse failure, not a broken cursor:
  // the walk must not mistake the second for the first.
  assert.deepEqual(
    result.report.failures.filter((failure) => failure.code !== 'messages_dropped'),
    [],
  );
});

test('a missing conversation id is a failure; a missing message id is a gap', async () => {
  const chat = await runOnce('compliance-api', { drift: { messages: ['drop_chat_id'] } });
  assert.equal(chat.result.report.status, 'partial');
  assert.equal(chat.result.report.failures[0].code, 'missing_uuid');
  const message = await runOnce('web-app', { drift: { detail: ['drop_message_uuid'] } });
  assert.equal(message.result.report.status, 'complete_with_gaps');
  assert.ok(message.result.report.gaps.some((gap) => gap.code === 'message_ids_missing'));
});

test('an unreadable message list is a failure that names the field', async () => {
  const { result } = await runOnce('web-app', { drift: { detail: ['messages_not_array'] } });
  assert.equal(result.report.status, 'partial');
  assert.equal(result.report.failures[0].code, 'messages_not_array');
});

test('an optional field that disappears is a gap, and the capture still holds', async () => {
  const { result, files } = await runOnce('web-app', { drift: { detail: ['drop_account'] } });
  assert.equal(result.report.captured_conversations, EXPECTED['web-app'].conversations);
  assert.equal(result.report.captured_messages, EXPECTED['web-app'].messages);
  assert.ok(result.report.gaps.some((gap) => gap.code === 'schema_drift'));
  assert.equal(result.report.status, 'complete_with_gaps');
  // The account id falls back to the conversation's own, which is visible.
  assert.equal(
    files.files_by_name['conversations.json'].bytes.includes('"account":{"uuid":"c-john-a"}'),
    true,
  );
});

test('a block type nobody has seen is counted, and no invented text is produced from it', async () => {
  const { result, files } = await runOnce('web-app', { drift: { detail: ['unknown_block_type'] } });
  assert.equal(result.report.unsupported_content.some_future_block, EXPECTED['web-app'].messages);
  assert.equal(result.report.captured_messages, EXPECTED['web-app'].messages);
  assert.equal(result.report.status, 'complete_with_gaps');
  assert.equal(
    files.files_by_name['conversations.json'].bytes.includes('unreadable'),
    true,
    'the unknown block must still be in the file, untouched',
  );
});

test('every failure mode ends with a verdict a person can read', async () => {
  const cases = [
    ['clean', {}],
    ['rate limited out', { faults: [{ match: COMPLIANCE_LIST, status: 429, times: 50 }] }],
    ['signed out', { faults: [{ match: COMPLIANCE_LIST, status: 401, times: 1 }] }],
    ['a missing conversation', { missingDetail: ['c-dana'] }],
    ['a stalled cursor', { stallCursor: true }],
  ];
  for (const [name, options] of cases) {
    const { result, files } = await runOnce('compliance-api', options);
    assert.ok(
      ['complete', 'complete_with_gaps', 'partial', 'blocked'].includes(result.report.status),
      `${name}: no verdict`,
    );
    assert.equal(
      files.handoffable,
      result.report.status === 'complete',
      `${name}: a run with status ${result.report.status} was ${String(files.handoffable)} handoffable`,
    );
    if (result.report.status !== 'complete') {
      const manifest = JSON.parse(files.files_by_name['extraction-manifest.json'].bytes);
      assert.equal(manifest.report.handoffable, false);
      assert.ok(
        manifest.report.failures.length > 0 ||
          manifest.report.gaps.length > 0 ||
          manifest.report.missing_conversations.length > 0,
        `${name}: an unqualified result with nothing to explain it`,
      );
    }
  }
});
