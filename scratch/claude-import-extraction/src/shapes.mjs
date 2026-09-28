// Response-shape adapters: a source's own JSON into the export shape M11 reads.
//
// Two mechanisms are modelled, and they are not interchangeable:
//
// 1. **The claude.ai web app's internal endpoints** (undocumented; observed in
//    public exporter source — see `SOURCES.md` for URLs and dates):
//      - `GET /api/organizations` → `[{ uuid, … }]`
//      - `GET /api/organizations/{org}/chat_conversations/{id}?tree=true&rendering_mode=messages&render_all_tools=true`
//        → conversation object with `chat_messages[]`, each message carrying
//        `uuid`, `sender` (`human`/`assistant`), `content[]` blocks
//        (`text`, `tool_use`, `tool_result`, `image`, `document`),
//        `created_at`, and a `parent_message_uuid` on forks.
//    What the public sources do **not** show is how the *list* endpoint
//    paginates. One published client calls it with no parameters at all. So the
//    offset/cursor parameters this prototype uses are marked `unverified` and
//    the walker treats an unexpected shape as drift, never as "done".
//
// 2. **The documented Compliance API** (Enterprise only; the one *supported*
//    programmatic path — `platform.claude.com/docs/en/manage-claude/compliance-content-data`):
//      - `GET /v1/compliance/apps/chats?order_by=updated_at&limit=…&after_id=…`
//        → `data[]`, `has_more`, `first_id`, `last_id`; entries carry `id`,
//        `name`, `created_at`, `updated_at`, `deleted_at`, `href`, `model`,
//        `organization_uuid`, `project_id`, `user`.
//      - `GET /v1/compliance/apps/chats/{id}/messages?limit=…&after_id=…&order=…`
//        → the chat's metadata plus `chat_messages[]` with `id`, `role`
//        (`user`/`assistant`), `created_at`, `content[]`, and `files[]`,
//        `generated_files[]`, `artifacts[]` (each `null` when absent).
//      - `GET /v1/compliance/apps/artifacts/{version_id}/content` → JSON with
//        `content`, `title`, `artifact_type`; the version id comes from the
//        message, never the artifact's stable `id`.
//    The docs are explicit that a chat listed with `deleted_at` has no content
//    left, and that consumers must "process results idempotently, keyed by
//    chat `id`", persisting the final `last_id` to resume. The walker does
//    exactly that.
//
// Output: the *export* shape, which `server/src/import/claude.ts` already
// reads unchanged — top-level array of
// `{uuid, name, created_at, updated_at, account:{uuid}, chat_messages:[…]}`
// with messages `{uuid, sender, text, content, created_at, updated_at,
// attachments, files, parent_message_uuid}`. No production file is touched and
// no new importer code is needed; `test/importer-contract.test.mjs` proves it
// by running the real reader over the produced file.

/** A source refusal that the walker can act on. */
export class SourceError extends Error {
  constructor(status, message, { retryAfterMs = null, endpoint = null } = {}) {
    super(message);
    this.name = 'SourceError';
    this.status = status;
    this.retryAfterMs = retryAfterMs;
    this.endpoint = endpoint;
  }
}

/**
 * A response that is not the format this capture knows how to read.
 *
 * The dangerous case is not a malformed body — `JSON.parse` refuses that, and a
 * refusal is a visible failure. The dangerous case is a body that **parses** and
 * is not the document we asked for: a sign-in page served with `200 OK`, a
 * serialized DOM snapshot, a text error page, an empty body. Those are the
 * shapes a browser extension meets the moment a session expires or a deployment
 * changes, and every one of them reads as "a response arrived" to code that only
 * checks the status code — which is how a capture of nothing gets filed as a
 * capture of everything.
 *
 * So a body is classified before anything reads it, and an unrecognised format
 * is a named failure that can never leave the run `complete`.
 */
export function classifyBody(response) {
  const headers = response?.headers ?? {};
  const contentType = typeof headers['content-type'] === 'string' ? headers['content-type'] : null;
  const body = response?.json;
  if (body === undefined || body === null) {
    return { format: 'empty', contentType, detail: 'no body' };
  }
  if (typeof body === 'string') {
    const text = body.trim();
    if (text.startsWith('<') || /<\/?(html|body|div|script)/i.test(text)) {
      return { format: 'html', contentType, detail: 'an HTML document' };
    }
    if (contentType !== null && !contentType.includes('json')) {
      return { format: 'text', contentType, detail: `a ${contentType} body` };
    }
    return { format: 'text', contentType, detail: 'a text body where JSON was expected' };
  }
  if (Array.isArray(body)) {
    if (body.length > 0 && body.every((item) => typeof item === 'string' && item.trim().startsWith('<'))) {
      return { format: 'html', contentType, detail: 'an array of HTML fragments' };
    }
    return { format: 'json', contentType, detail: null };
  }
  if (typeof body === 'object') {
    // A serialized DOM: one key, and the key is the markup.
    const keys = Object.keys(body);
    const snapshotKeys = keys.filter((key) =>
      /^(html|outerhtml|dom|snapshot|innerhtml|content|body)$/i.test(key),
    );
    if (keys.length <= 2 && snapshotKeys.length > 0) {
      for (const key of snapshotKeys) {
        const value = body[key];
        if (typeof value === 'string' && value.trim().startsWith('<')) {
          return { format: 'dom_snapshot', contentType, detail: `a DOM snapshot under "${key}"` };
        }
      }
    }
    return { format: 'json', contentType, detail: null };
  }
  return { format: 'scalar', contentType, detail: typeof body };
}

/** A response the normalizer cannot make sense of, by name rather than by exception type. */
export class ShapeError extends Error {
  constructor(code, message, { conversationId = null, path = null } = {}) {
    super(message);
    this.name = 'ShapeError';
    this.code = code;
    this.conversationId = conversationId;
    this.path = path;
  }
}

function record(value, path = null) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? { value: value, present: true, path }
    : { value: null, present: false, path };
}

function str(value) {
  return typeof value === 'string' ? value : null;
}

/** An ISO instant, kept exactly as the source gave it. Never reformatted. */
function instant(value) {
  const text = str(value);
  return text === null || text.trim() === '' ? null : text;
}

const ROLE_TO_SENDER = new Map([
  ['human', 'human'],
  ['user', 'human'],
  ['assistant', 'assistant'],
]);

function senderOf(...candidates) {
  for (const candidate of candidates) {
    const raw = str(candidate);
    if (raw === null) continue;
    const sender = ROLE_TO_SENDER.get(raw.trim().toLowerCase());
    if (sender !== undefined) return sender;
  }
  return null;
}

/**
 * The note text of a message: its `text` field when it has one, otherwise the
 * `text` blocks of `content` joined with a newline.
 *
 * This is the same rule the production reader applies to a content block list
 * (`server/src/import/claude.ts:turnText`), so "exact note text" means the same
 * thing on both sides. Non-text blocks are never folded into it: a tool result
 * is not something the therapist wrote or was shown as a note, and silently
 * inlining it would put words in her record. They are counted instead.
 */
function textOf(message) {
  const direct = message['text'];
  if (typeof direct === 'string' && direct.trim() !== '') return direct;
  const content = message['content'];
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  const parts = [];
  for (const block of content) {
    if (block === null || typeof block !== 'object') continue;
    const type = block['type'];
    if (type !== undefined && type !== 'text') continue;
    const value = block['text'];
    if (typeof value === 'string') parts.push(value);
  }
  return parts.join('\n');
}

/** Content block types present in a message that carry no note text. */
function unsupportedBlocks(message) {
  const content = message['content'];
  if (!Array.isArray(content)) return [];
  const found = [];
  for (const block of content) {
    if (block === null || typeof block !== 'object') continue;
    const type = str(block['type']);
    if (type === null || type === 'text') continue;
    found.push(type);
  }
  return found;
}

function attachmentEntry(source, { nameKeys, idKeys, kindKeys, sizeKeys }) {
  const name = firstString(source, nameKeys);
  const id = firstString(source, idKeys);
  const size = firstNumber(source, sizeKeys);
  return {
    file_name: name,
    file_id: id,
    file_type: str(source['mime_type']) ?? str(source['file_type']),
    file_size: size,
    kind: firstString(source, kindKeys),
    // The bytes and any extracted text are fetched by id, never inlined: the
    // export carries them, but nothing in the importer reads them, and holding
    // them in the message would make "text-exact" untrue.
    extracted_content: null,
    content_captured: false,
  };
}

function firstString(source, keys) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
  }
  return null;
}

function firstNumber(source, keys) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return null;
}

function emptyAttachments() {
  return [];
}

function artifactsOf(message) {
  return artifactsFrom(message['artifacts']);
}

/**
 * Artifact references declared by a message or by the conversation as a whole.
 *
 * The Compliance API documents them per message; the web app's conversation
 * payload is understood to carry them at conversation level, which no public
 * source documents — so this is a *modelled* location, and a capture that
 * relies on it has to live with the fact that a live trial may show the field
 * is somewhere else or absent.
 */
function artifactsFrom(list) {
  if (!Array.isArray(list)) return [];
  const found = [];
  for (const entry of list) {
    if (entry === null || typeof entry !== 'object') continue;
    const versionId = firstString(entry, ['version_id', 'uuid', 'id']);
    if (versionId === null) continue;
    found.push({
      ref: versionId,
      artifact_id: firstString(entry, ['artifact_id', 'id']),
      version_id: versionId,
      title: str(entry['title']),
      artifact_type: str(entry['artifact_type']),
    });
  }
  return found;
}

/**
 * What this response lets us say about which revision she ended on.
 *
 * Two things are kept apart on purpose, because conflating them is how a
 * capture ends up claiming more than it can see:
 *
 *  1. **Mechanism capability.** Did *this mechanism* carry ancestry at all? One
 *     usable link anywhere answers that, and it is a genuinely valuable fact: it
 *     is what separates a mechanism that returns the flat visible path from one
 *     that can express a fork. It says nothing about any particular
 *     conversation.
 *  2. **This conversation's ancestry.** Whether the links we hold are the links
 *     the account actually has — that the root is present, that nothing is
 *     missing, that the structure is even possible — is **not knowable from the
 *     payload**. A capture that starts at message 40 of 200 looks exactly like
 *     one that has all 200. So the classifier does not decide it, and this module
 *     never selects a branch: the importer does that, from links, and guessing at
 *     it here would put invented words in a record.
 *
 * What the classifier does instead is refuse to be reassured. Every structural
 * anomaly it can see — a cycle, a duplicate id, a self-reference, an empty
 * parent, an unresolvable parent, more than one root, or no usable link at all —
 * becomes a named gap, and a gap keeps the run off `complete`. The states below
 * are therefore about *what we can support*, never about what the branch was.
 */
export function branchFidelity(messages) {
  const list = Array.isArray(messages) ? messages : [];
  const ids = new Set();
  let duplicateIds = 0;
  for (const message of list) {
    if (typeof message.uuid !== 'string' || message.uuid === '') continue;
    if (ids.has(message.uuid)) duplicateIds += 1;
    else ids.add(message.uuid);
  }

  let carries = 0;
  let usable = 0;
  let selfLinks = 0;
  let emptyParents = 0;
  const parentOf = new Map();
  for (const message of list) {
    const parent = message.parent_message_uuid;
    if (parent === null || parent === undefined) continue;
    if (typeof parent !== 'string') {
      emptyParents += 1;
      continue;
    }
    if (parent.trim() === '') {
      // A source that sends an empty string has not sent a link.
      emptyParents += 1;
      continue;
    }
    if (parent === message.uuid) {
      // A message naming itself is not a link to anything.
      selfLinks += 1;
      continue;
    }
    carries += 1;
    parentOf.set(message.uuid, parent);
    if (ids.has(parent)) usable += 1;
  }
  const dangling = carries - usable;

  // Roots: messages with no usable parent. A whole thread has exactly one; more
  // than one means either a flat array, or a fork whose shared ancestor is not
  // in this response, and the shipped reader walks back from one tip, so the
  // other root's messages fall silently outside the note.
  let roots = 0;
  for (const message of list) {
    const own = typeof message.uuid === 'string' ? message.uuid : null;
    if (own === null) continue;
    const parent = parentOf.get(own);
    if (parent === undefined || !ids.has(parent)) roots += 1;
  }

  const cycles = countCycles(list, parentOf);

  const malformed = cycles > 0 || duplicateIds > 0 || selfLinks > 0 || emptyParents > 0;
  const fidelity = malformed ? 'structurally_invalid' : carries === 0 ? 'links_absent' : 'links_present';

  return {
    carries,
    usable,
    dangling,
    selfLinks,
    emptyParents,
    duplicateIds,
    roots,
    cycles,
    fidelity,
    // The one fact this is allowed to assert about the mechanism, and the one
    // this is explicitly not allowed to assert about any conversation.
    mechanism_carries_ancestry: usable > 0,
    conversation_ancestry_complete: null,
    selected_branch: 'not_selected_here',
  };
}

/** Cycles in a parent→parent forest, counted in nodes. Iterative, no recursion. */
function countCycles(messages, parentOf) {
  const state = new Map();
  let nodes = 0;
  for (const message of messages) {
    const own = typeof message.uuid === 'string' ? message.uuid : null;
    if (own === null || state.has(own)) continue;
    const path = [];
    let cursor = own;
    while (cursor !== null && cursor !== undefined && !state.has(cursor)) {
      state.set(cursor, 'open');
      path.push(cursor);
      cursor = parentOf.get(cursor);
    }
    if (cursor !== null && cursor !== undefined && state.get(cursor) === 'open') {
      // Back to a node on this path: everything from it onward is on a cycle.
      nodes += path.slice(path.indexOf(cursor)).length;
    }
    for (const node of path) state.set(node, 'done');
  }
  return nodes;
}

/**
 * The gaps a conversation's ancestry forces, by name. `branchable` excludes a
 * conversation that cannot be branched — one message, or none — which is
 * excluded because there is nothing to be uncertain about, not because the
 * uncertainty went away.
 */
export function branchGaps(branch, { conversationId = null, branchable = true } = {}) {
  const gaps = [];
  if (branchable === false) return gaps;
  if (branch.fidelity === 'links_absent') {
    // Not evidence that there were no forks, and not evidence that the wrong
    // branch was taken: this capture cannot tell.
    gaps.push({ code: 'branch_fidelity_unknown', id: conversationId, detail: branch });
  }
  if (branch.fidelity === 'structurally_invalid') {
    gaps.push({ code: 'branch_structure_invalid', id: conversationId, detail: branch });
  }
  if (branch.dangling > 0 || branch.roots !== 1) {
    gaps.push({ code: 'branch_ancestry_unresolved', id: conversationId, detail: branch });
  }
  return gaps;
}

/**
 * One normalized conversation, in the shape the M11 reader takes.
 *
 * `meta` never reaches the file. It is what makes loss visible: what was
 * declared, what could not be captured, and where a key the source used to send
 * has gone missing.
 */
function assemble({
  id,
  name,
  createdAt,
  updatedAt,
  account,
  messages,
  artifacts,
  drift,
  unsupported,
  deleted,
  dropped = 0,
  unidentified = 0,
}) {
  const branch = branchFidelity(messages);
  return {
    conversation: {
      uuid: id,
      name,
      created_at: createdAt,
      updated_at: updatedAt,
      account: { uuid: account },
      chat_messages: messages,
    },
    // `dropped` counts messages the response declared that no message could be
    // read from. It is never a rounding error: a dropped message is a hole in a
    // record, so the caller turns it into a visible failure.
    // `unidentified` counts messages the response carried without an id. Their
    // text is still captured, but nothing downstream can cite them, so a run
    // with any is a run with a gap rather than a clean one.
    // `branch` is the answer to "can this capture support a claim about which
    // revision the therapist kept?". It is computed from the response alone, and
    // it never guesses the answer when the response cannot give it.
    meta: {
      id,
      declaredMessages: 0,
      dropped,
      unidentified,
      unsupported,
      artifacts,
      drift,
      branch,
      deleted: deleted === true,
    },
  };
}

/**
 * The claude.ai web app shape.
 *
 * Optional keys that disappear are warnings (`drift`); a key the reader cannot
 * do without is a `ShapeError` naming the field, so a schema change is a named
 * failure rather than a short file.
 */
export function normalizeWebAppConversation(payload, { conversationId = null } = {}) {
  const source = record(payload, conversationId);
  if (!source.present)
    throw new ShapeError('not_an_object', 'conversation response is not an object', { conversationId });

  const id = firstString(source.value, ['uuid', 'id']);
  if (id === null)
    throw new ShapeError('missing_uuid', 'conversation has no uuid', { conversationId, path: 'uuid' });

  const drift = [];
  const raw = source.value['chat_messages'] ?? source.value['messages'];
  if (raw === undefined)
    throw new ShapeError('missing_messages', `conversation ${id} has no chat_messages`, {
      conversationId: id,
      path: 'chat_messages',
    });
  if (!Array.isArray(raw))
    throw new ShapeError('messages_not_array', `conversation ${id} chat_messages is not an array`, {
      conversationId: id,
      path: 'chat_messages',
    });
  if (source.value['chat_messages'] === undefined) drift.push('chat_messages->messages');

  const accountRecord = record(source.value['account']);
  const account = accountRecord.present ? firstString(accountRecord.value, ['uuid', 'id']) : null;
  if (account === null) drift.push('account');

  const messages = [];
  const unsupported = {};
  const artifacts = [];
  let dropped = 0;
  let unidentified = 0;
  raw.forEach((entry, index) => {
    const message = record(entry, `chat_messages[${String(index)}]`);
    if (!message.present) {
      drift.push(`chat_messages[${String(index)}]:not_an_object`);
      dropped += 1;
      return;
    }
    const messageId = firstString(message.value, ['uuid', 'id']);
    if (messageId === null) {
      drift.push(`chat_messages[${String(index)}]:uuid`);
      unidentified += 1;
    }
    const sender = senderOf(message.value['sender'], message.value['role']);
    if (sender === null) {
      drift.push(`chat_messages[${String(index)}]:sender`);
      dropped += 1;
      return;
    }
    for (const type of unsupportedBlocks(message.value)) {
      unsupported[type] = (unsupported[type] ?? 0) + 1;
    }
    artifacts.push(...artifactsOf(message.value));
    const files = Array.isArray(message.value['files']) ? message.value['files'] : [];
    const attachments = Array.isArray(message.value['attachments']) ? message.value['attachments'] : [];
    messages.push({
      uuid: messageId,
      sender,
      text: textOf(message.value),
      content: Array.isArray(message.value['content']) ? message.value['content'] : [],
      created_at: instant(message.value['created_at']),
      updated_at: instant(message.value['updated_at']),
      // Both mechanisms carry the user's uploads, and the export carries them
      // as `attachments`. One place in the output, whichever source they came
      // from, so two captures of the same account hash the same.
      attachments: [...files, ...attachments].map((item) =>
        attachmentEntry(record(item).present ? item : {}, {
          nameKeys: ['file_name', 'filename', 'name'],
          idKeys: ['file_id', 'uuid', 'id'],
          kindKeys: ['kind'],
          sizeKeys: ['file_size', 'size_bytes'],
        }),
      ),
      files: emptyAttachments(),
      parent_message_uuid: firstString(message.value, ['parent_message_uuid', 'parent_id', 'parent']),
    });
  });

  artifacts.push(...artifactsFrom(source.value['artifacts']));

  const out = assemble({
    id,
    name: firstString(source.value, ['name', 'title']) ?? '',
    createdAt: instant(source.value['created_at']),
    updatedAt: instant(source.value['updated_at']),
    account: account ?? id,
    messages,
    artifacts,
    drift,
    unsupported,
    dropped,
    unidentified,
    deleted: false,
  });
  out.meta.declaredMessages = raw.length;
  return out;
}

/**
 * The documented Compliance API shape.
 *
 * `role` is `user`/`assistant` there, ids are `claude_chat_msg_…`, and a chat
 * listed with `deleted_at` set has no content left to fetch: the docs say to
 * treat it as deleted, not updated, so it is reported and not invented.
 */
export function normalizeComplianceConversation(payload, { conversationId = null } = {}) {
  const source = record(payload, conversationId);
  if (!source.present)
    throw new ShapeError('not_an_object', 'messages response is not an object', { conversationId });

  const id = firstString(source.value, ['id', 'uuid']);
  if (id === null)
    throw new ShapeError('missing_uuid', 'messages response has no chat id', { conversationId, path: 'id' });

  const deletedAt = instant(source.value['deleted_at']);
  if (deletedAt !== null) {
    const out = assemble({
      id,
      name: firstString(source.value, ['name', 'title']) ?? '',
      createdAt: instant(source.value['created_at']),
      updatedAt: instant(source.value['updated_at']),
      account: firstString(source.value, ['organization_uuid']) ?? id,
      messages: [],
      artifacts: [],
      drift: [],
      unsupported: {},
      deleted: true,
    });
    out.conversation.name = '';
    return out;
  }

  const raw = source.value['chat_messages'];
  if (raw === undefined)
    throw new ShapeError('missing_messages', `chat ${id} has no chat_messages`, {
      conversationId: id,
      path: 'chat_messages',
    });
  if (!Array.isArray(raw))
    throw new ShapeError('messages_not_array', `chat ${id} chat_messages is not an array`, {
      conversationId: id,
      path: 'chat_messages',
    });

  const drift = [];
  const messages = [];
  const unsupported = {};
  const artifacts = [];
  let dropped = 0;
  let unidentified = 0;
  raw.forEach((entry, index) => {
    const message = record(entry, `chat_messages[${String(index)}]`);
    if (!message.present) {
      drift.push(`chat_messages[${String(index)}]:not_an_object`);
      dropped += 1;
      return;
    }
    const messageId = firstString(message.value, ['id', 'uuid']);
    if (messageId === null) {
      drift.push(`chat_messages[${String(index)}]:id`);
      unidentified += 1;
    }
    const sender = senderOf(message.value['role'], message.value['sender']);
    if (sender === null) {
      drift.push(`chat_messages[${String(index)}]:role`);
      dropped += 1;
      return;
    }
    for (const type of unsupportedBlocks(message.value)) {
      unsupported[type] = (unsupported[type] ?? 0) + 1;
    }
    const refs = artifactsOf(message.value);
    for (const ref of refs) ref.conversationId = id;
    artifacts.push(...refs);
    const files = Array.isArray(message.value['files']) ? message.value['files'] : [];
    const generated = Array.isArray(message.value['generated_files']) ? message.value['generated_files'] : [];
    messages.push({
      uuid: messageId,
      sender,
      text: textOf(message.value),
      content: Array.isArray(message.value['content']) ? message.value['content'] : [],
      created_at: instant(message.value['created_at']),
      updated_at: instant(message.value['updated_at']),
      attachments: [
        ...files.map((item) =>
          attachmentEntry(record(item).present ? item : {}, {
            nameKeys: ['filename', 'file_name'],
            idKeys: ['id', 'file_id'],
            kindKeys: ['kind'],
            sizeKeys: ['size_bytes'],
          }),
        ),
        ...generated.map((item) =>
          attachmentEntry(record(item).present ? item : {}, {
            nameKeys: ['filename', 'file_name'],
            idKeys: ['id', 'file_id'],
            kindKeys: ['kind'],
            sizeKeys: ['size_bytes'],
          }),
        ),
      ],
      files: emptyAttachments(),
      // The Compliance message object documents no parent link. That is a real
      // difference between the two mechanisms and is recorded, not guessed at:
      // a fork-aware capture has to use the mechanism that carries the links.
      parent_message_uuid: null,
    });
  });
  // The Compliance API exposes `organization_uuid` and a `user` object; the
  // export's `account.uuid` is neither. The organization id is the closest
  // documented value, and the substitution is named so nothing downstream can
  // mistake it for the account the export would have carried.
  drift.push('account.uuid:organization_uuid_substituted');

  const out = assemble({
    id,
    name: firstString(source.value, ['name', 'title']) ?? '',
    createdAt: instant(source.value['created_at']),
    updatedAt: instant(source.value['updated_at']),
    account: firstString(source.value, ['organization_uuid']) ?? id,
    messages,
    artifacts,
    drift,
    unsupported,
    dropped,
    unidentified,
    deleted: false,
  });
  if (out.meta.branch.fidelity === 'links_absent') {
    // Named as what it is: the documented message object does not list a parent
    // link, so a response shaped like it gives us no way to tell a flat thread
    // from a branch we cannot see. Whether the live API does better is exactly
    // what the next trial has to observe.
    drift.push('parent_message_uuid:not_listed_in_documented_schema');
  }
  out.meta.declaredMessages = raw.length;
  return out;
}

export const NORMALIZERS = {
  'web-app': normalizeWebAppConversation,
  'compliance-api': normalizeComplianceConversation,
};
