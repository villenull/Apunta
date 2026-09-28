// Fidelity: what comes out is what went in.
//
// The clinical risk in a capture is not a missing conversation, it is a
// *changed* one: a tidied timestamp, a tool result folded into a note, an
// abandoned edit spliced into a thread, a fork flattened. These tests read the
// capture against the account's own specification.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { EXPECTED, gapCodes, runOnce } from './helpers.mjs';
import { CONVERSATIONS, allMessageIds } from '../fixtures/truth.mjs';

const TRUTH = new Map(CONVERSATIONS.map((conversation) => [conversation.id, conversation]));

function captured(result, id) {
  const found = result.conversations.find((conversation) => conversation.uuid === id);
  assert.ok(found, `${id} is missing from the capture`);
  return found;
}

for (const mechanism of ['web-app', 'compliance-api']) {
  test(`${mechanism}: every message is present, with its own id, role and text`, async () => {
    const { result } = await runOnce(mechanism);
    const capturedIds = result.conversations.flatMap((conversation) =>
      conversation.chat_messages.map((message) => message.uuid),
    );
    assert.deepEqual(
      [...capturedIds].sort(),
      [...allMessageIds()].sort(),
      'the capture is not the account, message for message',
    );
    assert.equal(new Set(capturedIds).size, capturedIds.length, 'a message id appears twice');
    for (const conversation of result.conversations) {
      const truth = TRUTH.get(conversation.uuid);
      for (const [index, message] of conversation.chat_messages.entries()) {
        const original = truth.messages[index];
        assert.equal(message.uuid, original.id, `${original.id} changed id`);
        assert.equal(message.sender, original.sender, `${original.id} changed role`);
        assert.equal(message.text, original.text, `${original.id} changed text`);
        assert.equal(message.created_at, original.at, `${original.id} changed its timestamp`);
      }
    }
  });

  test(`${mechanism}: the message text is the text blocks, and nothing else`, async () => {
    const { result } = await runOnce(mechanism);
    const message = captured(result, 'c-john-a').chat_messages.find((each) => each.uuid === 'c-john-a-s3-a2');
    // The reply that carried a web search, its result and an image.
    assert.equal(message.text.includes('web_search'), false, 'a tool call leaked into the note text');
    assert.equal(message.text.includes('three results'), false, 'a tool result leaked into the note text');
    assert.equal(message.text.startsWith('Subjective: Sleep six hours;'), true);
    assert.deepEqual(
      message.content.map((block) => block.type),
      ['text', 'tool_use', 'tool_result', 'text'],
      'the content blocks were not preserved as they arrived',
    );
    assert.equal(message.content[1].name, 'web_search', 'a tool block lost its content');
  });

  test(`${mechanism}: odd timestamps are kept exactly as they arrived, not tidied`, async () => {
    const { result } = await runOnce(mechanism);
    const messages = captured(result, 'c-ambiguous-dates').chat_messages;
    const ids = messages.map((message) => message.uuid);
    assert.equal(ids[2], 'c-dates-h2');
    assert.equal(messages[2].created_at, null, 'a missing timestamp became something');
    assert.equal(messages[3].created_at, 'not-a-date', 'an unparseable timestamp was replaced or dropped');
  });

  test(`${mechanism}: a conversation with nothing but files is captured, not dropped`, async () => {
    const { result } = await runOnce(mechanism);
    const conversation = captured(result, 'c-attachment-only');
    assert.equal(conversation.chat_messages.length, 2);
    assert.equal(conversation.chat_messages[0].attachments.length, 2);
    assert.equal(conversation.chat_messages[0].attachments[0].file_name, 'questionnaire-scan-1.pdf');
    for (const attachment of conversation.chat_messages[0].attachments) {
      assert.equal(attachment.extracted_content, null, 'no attachment content was invented');
      assert.equal(attachment.content_captured, false, 'an attachment with no bytes must say so');
    }
    // A conversation with no messages at all is present with nothing in it.
    assert.deepEqual(captured(result, 'c-empty').chat_messages, []);
  });

  test(`${mechanism}: the attachment count and the block census match the account`, async () => {
    const { result } = await runOnce(mechanism);
    const attachments = result.conversations
      .flatMap((conversation) => conversation.chat_messages)
      .reduce((sum, message) => sum + message.attachments.length, 0);
    assert.equal(attachments, EXPECTED.attachments);
    assert.deepEqual(result.report.unsupported_content, EXPECTED.unsupportedBlocks);
  });
}

test('the web mechanism preserves the fork: one parent, two children, one live thread', async () => {
  const { result } = await runOnce('web-app');
  const messages = captured(result, 'c-john-a').chat_messages;
  const byParent = new Map();
  for (const message of messages) {
    const key = message.parent_message_uuid ?? '<root>';
    byParent.set(key, [...(byParent.get(key) ?? []), message.uuid]);
  }
  // She edited her first message of the evening: the original pair and the
  // edit's reply both descend from the last message of the previous sitting.
  assert.deepEqual(byParent.get('c-john-a-s2-h2'), ['c-john-a-s3-h1', 'c-john-a-s3-h2']);
  assert.deepEqual(byParent.get('c-john-a-s3-h1'), ['c-john-a-s3-a1']);
  assert.deepEqual(byParent.get('c-john-a-s3-h2'), ['c-john-a-s3-a2']);
  // Every message except the first names a parent that is in the capture.
  const ids = new Set(messages.map((message) => message.uuid));
  for (const message of messages.slice(1)) {
    assert.ok(ids.has(message.parent_message_uuid), `${message.uuid} names a parent that was not captured`);
  }
});

test('the web mechanism keeps an edit’s own timestamp', async () => {
  const { result } = await runOnce('web-app');
  const edited = captured(result, 'c-john-a').chat_messages.find(
    (message) => message.uuid === 'c-john-a-s3-a2',
  );
  assert.equal(edited.created_at, '2026-07-01T00:00:00Z');
  assert.equal(edited.updated_at, '2026-07-01T00:02:00Z', 'the edit time was lost');
});

test('the documented mechanism states that it cannot carry forks or edit times, rather than faking them', async () => {
  const { result } = await runOnce('compliance-api');
  const message = captured(result, 'c-john-a').chat_messages.find((each) => each.uuid === 'c-john-a-s3-a2');
  assert.equal(message.parent_message_uuid, null, 'a fork link was invented where the source has none');
  assert.equal(message.updated_at, null, 'an edit timestamp was invented where the source has none');
  // Named as unknown fidelity, in the same words the web mechanism uses when its
  // response carries no links: the capture cannot tell, and does not guess.
  assert.ok(gapCodes(result.report).includes('branch_fidelity_unknown'));
  // The two messages of the abandoned fork are still in the file, in order, so
  // nothing is lost — but nothing marks them as abandoned either, and the
  // manifest is where that has to be said.
  const abandoned = captured(result, 'c-john-a').chat_messages.filter((each) =>
    ['c-john-a-s3-h1', 'c-john-a-s3-a1'].includes(each.uuid),
  );
  assert.equal(abandoned.length, 2);
});

test('the six-hour boundary instants are exactly on the boundary', async () => {
  const { result } = await runOnce('web-app');
  const times = captured(result, 'c-boundary').chat_messages.map((message) => message.created_at);
  assert.deepEqual(times, [
    '2026-06-30T17:59:59Z',
    '2026-06-30T23:59:59Z',
    '2026-07-01T00:00:01Z',
    '2026-07-01T06:00:02Z',
    '2026-07-01T06:00:30Z',
  ]);
  // Exactly six hours is still the same sitting; two seconds is a new one. The
  // instants are the only place this is decided, so they have to arrive exactly
  // as the account declared them.
  assert.equal(
    Date.parse(times[1]) - Date.parse(times[0]),
    6 * 60 * 60 * 1000,
    'the first gap is not exactly six hours',
  );
  assert.equal(Date.parse(times[2]) - Date.parse(times[1]), 2000, 'the second gap is not two seconds');
  assert.equal(
    Date.parse(times[3]) - Date.parse(times[2]),
    6 * 60 * 60 * 1000 + 1000,
    'the third gap is not six hours and one second',
  );
});

test('the cutoff boundary instants sit either side of the day the importer uses', async () => {
  const { result } = await runOnce('web-app');
  const times = captured(result, 'c-boundary').chat_messages.map((message) => message.created_at);
  assert.ok(
    times.some((time) => time < '2026-07-01'),
    'no message before the cutoff day',
  );
  assert.ok(
    times.some((time) => time >= '2026-07-01'),
    'no message on or after the cutoff day',
  );
});

test('artifact versions are declared by the web mechanism and fetched by the documented one', async () => {
  const web = await runOnce('web-app');
  assert.equal(web.result.report.declared_artifacts, EXPECTED.artifacts.declared);
  assert.equal(
    web.result.report.captured_artifacts,
    0,
    'the web mechanism has no documented way to fetch a body',
  );
  const refs = web.result.report.artifacts.map((artifact) => artifact.ref).sort();
  assert.deepEqual(refs, [...EXPECTED.artifacts.versions].sort());
  assert.deepEqual(
    web.result.report.artifacts_not_captured.map((artifact) => artifact.code),
    ['artifact_content_not_reachable_in_this_mechanism', 'artifact_content_not_reachable_in_this_mechanism'],
  );

  const compliance = await runOnce('compliance-api');
  assert.equal(compliance.result.report.captured_artifacts, EXPECTED.artifacts.declared);
  const bodies = JSON.parse(compliance.files.files_by_name['artifacts.json'].bytes);
  assert.deepEqual(
    bodies.artifacts.map((artifact) => artifact.version_id).sort(),
    [...EXPECTED.artifacts.versions].sort(),
  );
  // One artifact, two versions: the version id is the key, and both texts are
  // kept separately rather than collapsed to the latest.
  assert.equal(new Set(bodies.artifacts.map((artifact) => artifact.artifact_id)).size, 1);
  const v1 = bodies.artifacts.find((artifact) => artifact.version_id === 'art-john-note-v1');
  const v2 = bodies.artifacts.find((artifact) => artifact.version_id === 'art-john-note-v2');
  assert.equal(v1.content, '# Progress note\n\nSleep six hours, intrusive thoughts daily for a fortnight.');
  assert.equal(
    v2.content,
    '# Progress note\n\nRevised: sleep six hours, intrusive thoughts daily for a fortnight, breakfast as a target.',
  );
});

test('no id in the capture is one the account did not declare', async () => {
  const known = new Set(CONVERSATIONS.map((conversation) => conversation.id));
  const messageIds = new Set(allMessageIds());
  for (const mechanism of ['web-app', 'compliance-api']) {
    const { result } = await runOnce(mechanism);
    for (const conversation of result.conversations) {
      assert.ok(known.has(conversation.uuid), `${conversation.uuid} was invented`);
      for (const message of conversation.chat_messages) {
        assert.ok(messageIds.has(message.uuid), `${String(message.uuid)} was invented`);
      }
    }
  }
});

test('the handoff file contains no title, label or verdict the importer does not expect', async () => {
  const { files } = await runOnce('web-app', {}, { allowGaps: true });
  const parsed = JSON.parse(files.files_by_name['conversations.json'].bytes);
  // The account's own titles are content the importer reads. Its fixture
  // labels — the case names, the patient names, the language — are the
  // annotation this prototype is tested against, and none of it may reach a
  // file the app opens: a label in the capture would be a claim nobody wrote.
  // The annotation this prototype is tested against must not reach a file the
  // app opens: a label in the capture would be a claim nobody wrote. Checked at
  // every depth, by key name.
  const forbidden = ['labels', 'case', 'patient', 'language', 'deletedAt', 'synthetic'];
  const keysAtDepth = new Map();
  const walk = (value, depth = 0) => {
    if (value === null || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      for (const item of value) walk(item, depth);
      return;
    }
    for (const [key, item] of Object.entries(value)) {
      keysAtDepth.set(key, depth);
      walk(item, depth + 1);
    }
  };
  walk(parsed);
  assert.deepEqual(
    [...keysAtDepth.keys()].filter((key) => forbidden.includes(key)),
    [],
    'annotation keys leaked into the capture',
  );
  // The conversation and message objects carry the export's own keys, and the
  // content blocks and attachment references are carried through untouched.
  assert.deepEqual(Object.keys(parsed[0]).sort(), [
    'account',
    'chat_messages',
    'created_at',
    'name',
    'updated_at',
    'uuid',
  ]);
  assert.deepEqual(Object.keys(parsed[0].chat_messages[0]).sort(), [
    'attachments',
    'content',
    'created_at',
    'files',
    'parent_message_uuid',
    'sender',
    'text',
    'updated_at',
    'uuid',
  ]);
  assert.deepEqual(Object.keys(parsed[0].account), ['uuid']);
  const manifest = JSON.parse(files.files_by_name['extraction-manifest.json'].bytes);
  assert.equal(manifest.synthetic, true);
  assert.equal('report' in manifest, true);
});
