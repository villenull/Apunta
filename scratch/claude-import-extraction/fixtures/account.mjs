// A synthetic Claude account to walk.
//
// It answers the two mechanisms' endpoints from `truth.mjs`, and it can be told
// to misbehave in the ways a real account does: rate limits, a dropped session,
// a 500, a cursor that never advances, an empty page in the middle of an
// inventory, a repeated id, a deleted chat, a field that has been renamed, a
// message page smaller than the page size that was asked for.
//
// It is a `request(method, url, query)` function, which is the only seam the
// production code above it has. Nothing here talks to a network, reads a cookie
// or touches a real account; `logs` records what was asked so a test can assert
// the traversal, not only its result.

import { ACCOUNT, CONVERSATIONS, ORGANIZATION_ID } from './truth.mjs';

/**
 * The `href` the documented API returns on a chat: a link into the app. Built
 * from parts so the repository's outbound-URL lint rule — which exists to stop
 * production code from reaching a host — does not have to be relaxed for a
 * string in a fixture that no request is ever made with.
 */
const HREF_ORIGIN = ['https:', '', 'claude.ai'].join('/');

function chatHref(id) {
  return `${HREF_ORIGIN}/chat/${id}`;
}

/** Options, all optional. The defaults are a well-behaved account. */
export const DEFAULTS = {
  /** The page the web mechanism will return at most, whatever it is asked for. */
  webMaxPageSize: 4,
  /** The page the Compliance messages endpoint will return at most. */
  messagePageCap: 7,
  /** The page the Compliance inventory will return at most, whatever is asked. */
  inventoryPageCap: 4,
  /** Inventory page index (1-based) that comes back empty while claiming more. */
  emptyPageAt: null,
  /** Inventory page index whose first id is repeated on the page. */
  duplicateAtPage: null,
  /** A cursor that comes back unchanged, so the walk cannot advance. */
  stallCursor: false,
  /** Whether the web mechanism's list hides chats deleted in the app. */
  webOmitsDeleted: true,
  /** Faults: `{match, status, json, headers, times, after}`. */
  faults: [],
  /** Keyed field mutations: `detail`, `messages`. */
  drift: {},
  /** Chats the messages endpoint refuses with 404. */
  missingDetail: [],
  /** Repeat each message page's first message, as an overlapping page would. */
  duplicateMessages: false,
  /** A body that is not JSON at all, served with `200 OK`.
   *  `{match, kind: 'html' | 'dom_snapshot' | 'text' | 'empty'}` */
  formatFaults: [],
};

function applyDrift(value, mutations) {
  const out = structuredClone(value);
  for (const mutation of mutations) {
    switch (mutation) {
      case 'drop_account':
        delete out.account;
        break;
      case 'rename_messages':
        out.messages = out.chat_messages;
        delete out.chat_messages;
        break;
      case 'drop_conversation_uuid':
        delete out.uuid;
        break;
      case 'drop_chat_id':
        delete out.id;
        break;
      case 'drop_parent_links':
        // The response carries a flat array with no ancestry: the shape a
        // mechanism that returns "the visible path" would produce. Nothing here
        // says the conversation was branched; the capture must simply not be
        // able to tell, and must say that.
        for (const message of out.chat_messages ?? out.messages ?? []) {
          delete message.parent_message_uuid;
        }
        break;
      case 'dangling_parent_links':
        // Ancestry is named but not included: a fork whose root is not in the file.
        for (const message of out.chat_messages ?? out.messages ?? []) {
          if (message.parent_message_uuid === undefined) continue;
          message.parent_message_uuid = `${String(message.parent_message_uuid)}-not-in-this-response`;
        }
        break;
      case 'drop_message_sender':
        // Whichever key this mechanism used is moved into an `author` object,
        // which neither normalizer reads. Both shapes are covered, so the
        // mutation means "the sender is no longer where we look".
        for (const message of out.chat_messages ?? out.messages ?? []) {
          const role = message.role ?? message.sender;
          message.author = { role };
          delete message.role;
          delete message.sender;
        }
        break;
      case 'drop_message_uuid':
        for (const message of out.chat_messages ?? out.messages ?? []) delete message.uuid;
        break;
      case 'messages_not_array':
        out.chat_messages = { nope: true };
        break;
      case 'unknown_block_type':
        for (const message of out.chat_messages ?? out.messages ?? []) {
          (message.content ?? []).push({ type: 'some_future_block', payload: 'unreadable' });
        }
        break;
      default:
        throw new Error(`unknown drift mutation: ${mutation}`);
    }
  }
  return out;
}

function webMessage(each) {
  const message = {
    uuid: each.id,
    sender: each.sender,
    created_at: each.at,
    updated_at: each.editedAt ?? each.at,
    content: each.contentBlocks,
    files: each.attachments.map((file) => ({
      file_name: file.fileName,
      file_size: file.fileSize,
      file_type: file.fileType,
      extracted_content: null,
    })),
    attachments: [],
    parent_message_uuid: each.parent,
  };
  if (!each.omitTextField) message.text = each.text;
  return message;
}

function complianceMessage(each) {
  return {
    id: each.id,
    role: each.sender === 'human' ? 'user' : 'assistant',
    created_at: each.at,
    content: each.contentBlocks,
    files: each.attachments.map((file) => ({
      id: `claude_file_${each.id}`,
      filename: file.fileName,
      mime_type: file.fileType,
      size_bytes: file.fileSize,
      md5: null,
    })),
    generated_files: null,
    artifacts:
      each.artifacts.length === 0
        ? null
        : each.artifacts.map((artifact) => ({
            id: artifact.id,
            version_id: artifact.versionId,
            title: artifact.title,
            artifact_type: artifact.artifactType,
          })),
  };
}

function webConversation(conversation, mutations) {
  const artifacts = conversation.messages.flatMap((each) =>
    each.artifacts.map((artifact) => ({
      // UNVERIFIED shape: the app's conversation payload is understood to carry
      // an `artifacts` collection, but no public source documents its fields,
      // and no source documents an endpoint that returns an artifact's body
      // from the web app. Modelled so the capture has to *say* it saw them.
      uuid: artifact.versionId,
      artifact_id: artifact.id,
      title: artifact.title,
      artifact_type: artifact.artifactType,
    })),
  );
  return applyDrift(
    {
      uuid: conversation.id,
      name: conversation.name,
      summary: '',
      created_at: conversation.createdAt,
      updated_at: conversation.updatedAt,
      account: { uuid: ACCOUNT.uuid, organization_uuid: ACCOUNT.organization_uuid },
      // Keys the app sends that this capture has no use for. They must not
      // change the result: a reader that trips on an extra key is not a reader.
      is_starred: false,
      project: null,
      artifacts: artifacts.length === 0 ? [] : artifacts,
      chat_messages: conversation.messages.map(webMessage),
    },
    mutations,
  );
}

function ok(json) {
  return { status: 200, json, headers: { 'content-type': 'application/json' } };
}

/**
 * The bodies a browser meets when a session has gone or a deployment has moved:
 * a sign-in page, a serialized DOM, a text error, nothing. All of them arrive
 * with a success status, which is the trap.
 */
function nonJsonBody(kind) {
  if (kind === 'html') {
    return {
      status: 200,
      json: '<!DOCTYPE html><html><body><h1>Sign in to continue</h1></body></html>',
      headers: { 'content-type': 'text/html; charset=utf-8' },
    };
  }
  if (kind === 'dom_snapshot') {
    return {
      status: 200,
      json: { html: '<div data-testid="conversation">…</div>' },
      headers: { 'content-type': 'application/json' },
    };
  }
  if (kind === 'text') {
    return { status: 200, json: 'upstream connect error', headers: { 'content-type': 'text/plain' } };
  }
  return { status: 200, json: null, headers: {} };
}

function split(url) {
  const index = url.indexOf('?');
  if (index === -1) return [url, ''];
  return [url.slice(0, index), url.slice(index + 1)];
}

/**
 * Build the account.
 *
 * @param {object} [options] see `DEFAULTS`
 * @returns {{request: (method: string, url: string) => {status: number, json: unknown, headers: object}, logs: object[], config: object}}
 */
export function createSyntheticAccount(options = {}) {
  const config = { ...DEFAULTS, ...options };
  const logs = [];
  const faults = config.faults.map((fault) => ({ ...fault, matched: 0, fired: 0 }));
  const byId = new Map(CONVERSATIONS.map((conversation) => [conversation.id, conversation]));
  const artifactBodies = new Map();
  for (const conversation of CONVERSATIONS) {
    for (const each of conversation.messages) {
      for (const artifact of each.artifacts) artifactBodies.set(artifact.versionId, artifact);
    }
  }

  /** The next scheduled fault for this URL, if any. */
  function takeFault(url) {
    for (const fault of faults) {
      if (!url.includes(fault.match)) continue;
      fault.matched += 1;
      if (fault.matched <= (fault.after ?? 0)) continue;
      if (fault.fired >= (fault.times ?? 1)) continue;
      fault.fired += 1;
      return fault;
    }
    return null;
  }

  function request(method, url) {
    logs.push({ method, url });
    const fault = takeFault(url);
    if (fault !== null) {
      return { status: fault.status, json: fault.json ?? null, headers: fault.headers ?? {} };
    }
    const format = config.formatFaults.find((entry) => url.includes(entry.match));
    if (format !== undefined) {
      return nonJsonBody(format.kind);
    }
    const [path, query] = split(url);
    const params = new URLSearchParams(query);

    if (path === '/api/organizations') {
      return ok([{ uuid: ORGANIZATION_ID, name: 'Synthetic practice', capabilities: [] }]);
    }

    if (path === `/api/organizations/${ORGANIZATION_ID}/chat_conversations` && method === 'GET') {
      const limit = Math.max(1, Math.min(Number(params.get('limit') ?? 10), config.webMaxPageSize));
      const offset = Number(params.get('offset') ?? 0);
      const pool = CONVERSATIONS.filter(
        (conversation) => !(config.webOmitsDeleted && conversation.deletedAt),
      );
      const page = pool.slice(offset, offset + limit);
      const pageIndex = Math.floor(offset / limit) + 1;
      const items = page.map((conversation) => ({
        uuid: conversation.id,
        name: conversation.name,
        created_at: conversation.createdAt,
        updated_at: conversation.updatedAt,
        account: { uuid: ACCOUNT.uuid },
      }));
      if (config.emptyPageAt !== null && pageIndex === config.emptyPageAt) {
        return ok({ data: [], has_more: offset < pool.length });
      }
      if (config.duplicateAtPage !== null && pageIndex === config.duplicateAtPage && items.length > 0) {
        // Repeated at the front, so the page's last id is still a real new one:
        // an overlap that swallowed the cursor would be a different fault.
        items.unshift(items[0]);
      }
      return ok({ data: items, has_more: offset + page.length < pool.length });
    }

    const webDetail = /^\/api\/organizations\/([^/]+)\/chat_conversations\/([^/?]+)$/.exec(path);
    if (webDetail !== null && method === 'GET') {
      const conversation = byId.get(webDetail[2]);
      if (conversation === undefined) return { status: 404, json: null, headers: {} };
      return ok(webConversation(conversation, config.drift.detail ?? []));
    }

    if (path === '/v1/compliance/apps/chats' && method === 'GET') {
      const limit = Math.max(1, Math.min(Number(params.get('limit') ?? 100), 1000, config.inventoryPageCap));
      const afterId = params.get('after_id');
      const ordered = [...CONVERSATIONS].sort((left, right) =>
        String(left.updatedAt ?? '').localeCompare(String(right.updatedAt ?? '')),
      );
      const start =
        afterId === null || afterId === ''
          ? 0
          : ordered.findIndex((conversation) => conversation.id === afterId) + 1;
      const page = ordered.slice(start, start + limit);
      const pageIndex = Math.floor(start / limit) + 1;
      const items = page.map((conversation) => ({
        id: conversation.id,
        name: conversation.name,
        created_at: conversation.createdAt,
        updated_at: conversation.updatedAt,
        deleted_at: conversation.deletedAt ?? null,
        href: chatHref(conversation.id),
        model: 'claude-opus-5-5',
        organization_uuid: ACCOUNT.organization_uuid,
        project_id: null,
        user: { id: 'user_synthetic_0001', email_address: 'therapist@example.invalid' },
      }));
      if (config.emptyPageAt !== null && pageIndex === config.emptyPageAt) {
        return ok({ data: [], has_more: true, first_id: null, last_id: null });
      }
      if (config.duplicateAtPage !== null && pageIndex === config.duplicateAtPage && items.length > 0) {
        items.unshift(items[0]);
      }
      const body = {
        data: items,
        has_more: start + page.length < ordered.length,
        first_id: items[0]?.id ?? null,
        last_id: items.at(-1)?.id ?? null,
      };
      if (config.stallCursor && afterId !== null && afterId !== '') {
        // A cursor that comes back unchanged: the client cannot tell progress
        // from a loop, and must not treat "no error" as "no more pages".
        return ok({ ...body, last_id: afterId });
      }
      return ok(body);
    }

    const complianceMessages = /^\/v1\/compliance\/apps\/chats\/([^/]+)\/messages$/.exec(path);
    if (complianceMessages !== null && method === 'GET') {
      const id = complianceMessages[1];
      const conversation = byId.get(id);
      if (conversation === undefined || config.missingDetail.includes(id)) {
        return { status: 404, json: null, headers: {} };
      }
      if (conversation.deletedAt) {
        // Documented behaviour: a chat listed with `deleted_at` is still
        // returned, without its content.
        return ok({
          id,
          name: '',
          created_at: conversation.createdAt,
          updated_at: conversation.updatedAt,
          deleted_at: conversation.deletedAt,
          href: chatHref(conversation.id),
          organization_uuid: ACCOUNT.organization_uuid,
          chat_messages: [],
          has_more: false,
          first_id: null,
          last_id: null,
        });
      }
      const limit = Math.max(1, Math.min(Number(params.get('limit') ?? 100), config.messagePageCap));
      const afterId = params.get('after_id');
      const all = conversation.messages.map(complianceMessage);
      const start =
        afterId === null || afterId === '' ? 0 : all.findIndex((message) => message.id === afterId) + 1;
      const window = all.slice(start, start + limit);
      const page = config.duplicateMessages && window.length > 0 ? [window[0], ...window] : window;
      return ok(
        applyDrift(
          {
            id,
            name: conversation.name,
            created_at: conversation.createdAt,
            updated_at: conversation.updatedAt,
            deleted_at: null,
            // The documented messages response repeats the chat's metadata.
            href: chatHref(conversation.id),
            model: 'claude-opus-5-5',
            organization_uuid: ACCOUNT.organization_uuid,
            project_id: null,
            user: { id: 'user_synthetic_0001', email_address: 'therapist@example.invalid' },
            chat_messages: page,
            has_more: start + window.length < all.length,
            first_id: page[0]?.id ?? null,
            last_id: page.at(-1)?.id ?? null,
          },
          config.drift.messages ?? [],
        ),
      );
    }

    const artifactContent = /^\/v1\/compliance\/apps\/artifacts\/([^/]+)\/content$/.exec(path);
    if (artifactContent !== null && method === 'GET') {
      const artifact = artifactBodies.get(artifactContent[1]);
      if (artifact === undefined) return { status: 404, json: null, headers: {} };
      return ok({ content: artifact.text, title: artifact.title, artifact_type: artifact.artifactType });
    }

    return {
      status: 404,
      json: { error: { type: 'not_found', message: `no synthetic route for ${method} ${path}` } },
      headers: {},
    };
  }

  return { request, logs, config };
}
