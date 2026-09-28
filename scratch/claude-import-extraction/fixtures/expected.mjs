// What a correct capture of the synthetic account must contain, stated here
// independently of the code that produces it.
//
// Independence is the point, so this file shares nothing with `src/`: its own
// serializer, its own digest, its own field assembly, written from
// `fixtures/truth.mjs` — the account's specification — rather than from what any
// normalizer does. The walker's job is to arrive here. A test compares the two
// and says which one is wrong when they differ.
//
// The counts below are also written out as literals. `selfCheck()` recomputes
// them from the truth and reports a mismatch, so a fixture edit that forgets to
// update the stated expectation fails loudly instead of quietly redefining it.

import { createHash } from 'node:crypto';

import { ACCOUNT, CONVERSATIONS, ORGANIZATION_ID } from './truth.mjs';

/** The expectation, stated by hand. */
export const EXPECTED = {
  /** Every conversation in the account, either mechanism. */
  account: { conversations: 16, messages: 84 },
  /** The web mechanism's list hides the chat deleted in the app. */
  'web-app': {
    conversations: 15,
    messages: 84,
    ids: [
      'c-john-a',
      'c-john-b',
      'c-jane-doe',
      'c-jane-roe',
      'c-marisol',
      'c-fermin',
      'c-dana',
      'c-alex-recent-old',
      'c-recipe',
      'c-boundary',
      'c-ambiguous-dates',
      'c-empty',
      'c-attachment-only',
      'c-content-blocks',
      'c-long',
    ],
    /** Fork links and edit timestamps exist here, so nothing is lost. */
    carriesForkLinks: true,
    carriesMessageEditTimestamps: true,
  },
  /** The Compliance API lists the deleted chat and returns it without content. */
  'compliance-api': {
    conversations: 16,
    messages: 84,
    /** `order_by=updated_at`, oldest first; the two nulls sort first. */
    ids: [
      'c-ambiguous-dates',
      'c-long',
      'c-deleted',
      'c-attachment-only',
      'c-empty',
      'c-john-a',
      'c-boundary',
      'c-recipe',
      'c-fermin',
      'c-jane-roe',
      'c-marisol',
      'c-john-b',
      'c-jane-doe',
      'c-content-blocks',
      'c-dana',
      'c-alex-recent-old',
    ],
    carriesForkLinks: false,
    carriesMessageEditTimestamps: false,
  },
  /** Content blocks that carry no note text, counted across the account. */
  unsupportedBlocks: { tool_use: 1, tool_result: 1, document: 1, image: 1 },
  /** One artifact, two versions, both under the same artifact id. */
  artifacts: { declared: 2, versions: ['art-john-note-v1', 'art-john-note-v2'] },
  /** Attachments declared on the account's messages, by the importer's count. */
  attachments: 6,
  /** Messages the six-hour split turns into three or more sittings. */
  multiSessionConversations: [
    'c-john-a',
    'c-jane-doe',
    'c-jane-roe',
    'c-marisol',
    'c-dana',
    'c-long',
    'c-boundary',
    'c-ambiguous-dates',
  ],
};

/** This file's own serializer, deliberately not the one in `src/canonical.mjs`. */
function serialize(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => serialize(item)).join(',')}]`;
  const keys = Object.keys(value)
    .filter((key) => value[key] !== undefined)
    .sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${serialize(value[key])}`).join(',')}}`;
}

function digest(value) {
  return `sha256:${createHash('sha256').update(serialize(value), 'utf8').digest('hex')}`;
}

/** The text blocks of a message, joined the way both mechanisms join them. */
function textFromBlocks(blocks) {
  return blocks
    .filter((block) => block.type === undefined || block.type === 'text')
    .map((block) => block.text)
    .join('\n');
}

/**
 * One attachment reference, as the capture must record it.
 *
 * The Compliance mechanism carries a documented file id per upload; the web
 * mechanism's file entries are understood to carry only a name, a type and a
 * size. Where there is no id there is none — never the conversation's.
 */
function attachmentOf(file, messageId, isCompliance) {
  return {
    file_name: file.fileName,
    file_id: isCompliance ? `claude_file_${messageId}` : null,
    file_type: file.fileType,
    file_size: file.fileSize,
    kind: null,
    extracted_content: null,
    content_captured: false,
  };
}

/** One conversation in the export shape, as this file says it must come out. */
export function expectedConversation(conversation, mechanism) {
  const isCompliance = mechanism === 'compliance-api';
  const messages = conversation.messages.map((each) => ({
    uuid: each.id,
    sender: each.sender,
    text: each.text,
    content: each.contentBlocks,
    created_at: each.at,
    updated_at: isCompliance ? null : (each.editedAt ?? each.at),
    attachments: each.attachments.map((file) => attachmentOf(file, each.id, isCompliance)),
    files: [],
    parent_message_uuid: isCompliance ? null : each.parent,
  }));
  return {
    uuid: conversation.id,
    // Documented: a chat listed with `deleted_at` comes back with an empty name.
    name: conversation.deletedAt ? '' : conversation.name,
    created_at: conversation.createdAt,
    updated_at: conversation.updatedAt,
    // The web app's conversation payload carries the account the export names;
    // the Compliance API carries an organization id instead, so that is what a
    // Compliance capture records, under a name the manifest explains.
    account: { uuid: isCompliance ? ORGANIZATION_ID : ACCOUNT.uuid },
    chat_messages: messages,
  };
}

/** The whole expected capture for one mechanism, in inventory order. */
export function expectedCapture(mechanism) {
  const ordered =
    mechanism === 'web-app'
      ? CONVERSATIONS.filter((conversation) => conversation.deletedAt === undefined)
      : [...CONVERSATIONS].sort((left, right) =>
          String(left.updatedAt ?? '').localeCompare(String(right.updatedAt ?? '')),
        );
  return ordered.map((conversation) => expectedConversation(conversation, mechanism));
}

/** The expected digest of a capture, and of each conversation in it. */
export function expectedDigests(mechanism) {
  const capture = expectedCapture(mechanism);
  return {
    file: digest(capture),
    conversations: Object.fromEntries(
      capture.map((conversation) => [conversation.uuid, digest(conversation)]),
    ),
  };
}

/** Counts recomputed from the truth, for comparison with the stated literals. */
export function measured() {
  const blocks = {};
  let messages = 0;
  let attachments = 0;
  let artifacts = 0;
  for (const conversation of CONVERSATIONS) {
    messages += conversation.messages.length;
    for (const each of conversation.messages) {
      attachments += each.attachments.length;
      artifacts += each.artifacts.length;
      for (const block of each.contentBlocks) {
        if (block.type === undefined || block.type === 'text') continue;
        blocks[block.type] = (blocks[block.type] ?? 0) + 1;
      }
    }
  }
  return { conversations: CONVERSATIONS.length, messages, attachments, artifacts, unsupportedBlocks: blocks };
}

/** Where the stated expectation and the recomputation disagree. */
export function selfCheck() {
  const problems = [];
  const measuredNow = measured();
  if (measuredNow.conversations !== EXPECTED.account.conversations) {
    problems.push(
      `conversations: stated ${String(EXPECTED.account.conversations)}, measured ${String(measuredNow.conversations)}`,
    );
  }
  if (measuredNow.messages !== EXPECTED.account.messages) {
    problems.push(
      `messages: stated ${String(EXPECTED.account.messages)}, measured ${String(measuredNow.messages)}`,
    );
  }
  if (measuredNow.attachments !== EXPECTED.attachments) {
    problems.push(
      `attachments: stated ${String(EXPECTED.attachments)}, measured ${String(measuredNow.attachments)}`,
    );
  }
  if (measuredNow.artifacts !== EXPECTED.artifacts.declared) {
    problems.push(
      `artifacts: stated ${String(EXPECTED.artifacts.declared)}, measured ${String(measuredNow.artifacts)}`,
    );
  }
  for (const [type, count] of Object.entries(EXPECTED.unsupportedBlocks)) {
    if ((measuredNow.unsupportedBlocks[type] ?? 0) !== count) {
      problems.push(
        `block ${type}: stated ${String(count)}, measured ${String(measuredNow.unsupportedBlocks[type] ?? 0)}`,
      );
    }
  }
  for (const mechanism of ['web-app', 'compliance-api']) {
    const capture = expectedCapture(mechanism);
    const stated = EXPECTED[mechanism];
    if (capture.length !== stated.conversations) {
      problems.push(
        `${mechanism} conversations: stated ${String(stated.conversations)}, built ${String(capture.length)}`,
      );
    }
    const builtMessages = capture.reduce((sum, conversation) => sum + conversation.chat_messages.length, 0);
    if (builtMessages !== stated.messages) {
      problems.push(
        `${mechanism} messages: stated ${String(stated.messages)}, built ${String(builtMessages)}`,
      );
    }
    if (serialize(capture.map((conversation) => conversation.uuid)) !== serialize(stated.ids)) {
      problems.push(`${mechanism} ids: stated order differs from the built order`);
    }
  }
  // The text of every message must be exactly its text blocks joined, or the two
  // mechanisms would disagree about the same message and the digests would
  // differ for a reason that has nothing to do with the walk.
  for (const conversation of CONVERSATIONS) {
    for (const each of conversation.messages) {
      if (textFromBlocks(each.contentBlocks) !== each.text) {
        problems.push(`${each.id}: content blocks do not rejoin to its own text`);
      }
    }
  }
  return { ok: problems.length === 0, problems, measured: measuredNow };
}
