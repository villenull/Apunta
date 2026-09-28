/**
 * capture-core.js — the capture, as a plain classic script.
 *
 * This is the same walk the offline prototype runs (`../src/walker.mjs`,
 * `../src/sources.mjs`, `../src/shapes.mjs`), re-expressed as a single classic
 * script because a content script in the page's world cannot `import` anything:
 * it is evaluated, not resolved. One file, no bundler, no dependency, no
 * network of its own.
 *
 * The duplication is deliberate and it is not allowed to drift: a test runs this
 * file — the very file Chrome loads — against the same synthetic account as the
 * reference walker and requires the two to produce the **same file digest**. If
 * this file ever stops agreeing, that test fails.
 *
 * What it does not do, by construction:
 *   - no cookies: nothing here reads `document.cookie` or any cookie API, and
 *     the transport below is handed a `fetch` that the *page* owns;
 *   - no arbitrary URL: the transport refuses any path not on the allow-list,
 *     and takes a path and a query, never a URL from a message;
 *   - no remote code: no `eval`, no `Function`, no `import`, no script URL;
 *   - no writes: it returns a capture. Saving it is the caller's job.
 */
(function initCaptureCore(scope) {
  'use strict';

  // --- canonical form and digest ---------------------------------------------

  function canonicalJson(value) {
    if (value === null) return 'null';
    const type = typeof value;
    if (type === 'string') return JSON.stringify(value);
    if (type === 'boolean') return value ? 'true' : 'false';
    if (type === 'number') {
      if (!Number.isFinite(value)) throw new TypeError('canonicalJson: non-finite number');
      return JSON.stringify(value);
    }
    if (type === 'object' && Array.isArray(value)) {
      return (
        '[' +
        value
          .map(function (item) {
            return canonicalJson(item === undefined ? null : item);
          })
          .join(',') +
        ']'
      );
    }
    if (type === 'object') {
      const keys = Object.keys(value)
        .filter(function (key) {
          return value[key] !== undefined;
        })
        .sort();
      return (
        '{' +
        keys
          .map(function (key) {
            return JSON.stringify(key) + ':' + canonicalJson(value[key]);
          })
          .join(',') +
        '}'
      );
    }
    throw new TypeError('canonicalJson: unsupported value of type ' + type);
  }

  /**
   * SHA-256, or null when the host has no SubtleCrypto.
   *
   * A null digest is not a silent pass: the manifest records `digest_algorithm`
   * as `none`, so a capture without a digest says so instead of looking hashed.
   */
  function digestOf(value) {
    const text = canonicalJson(value);
    const subtle = scope.crypto && scope.crypto.subtle;
    if (subtle === undefined || typeof subtle.digest !== 'function') {
      return { algorithm: 'none', value: null, bytes: text.length };
    }
    const bytes = new TextEncoder().encode(text);
    return subtle
      .digest('SHA-256', bytes)
      .then(function (buffer) {
        return { algorithm: 'sha256', value: toHex(new Uint8Array(buffer)), bytes: text.length };
      })
      .catch(function () {
        return { algorithm: 'none', value: null, bytes: text.length };
      });
  }

  function toHex(bytes) {
    let out = '';
    for (const byte of bytes) out += byte.toString(16).padStart(2, '0');
    return out;
  }

  // --- the shape of a body ---------------------------------------------------

  /**
   * A body is classified before anything reads it, and anything that is not the
   * document we asked for is a named failure. The case that matters is a `200`
   * carrying a sign-in page or a serialized DOM: it parses, it has a success
   * status, and a capture that only checked the status code would file it as
   * content. That is the whole reason this function exists.
   */
  function classifyBody(response) {
    const headers = (response && response.headers) || {};
    const contentType = typeof headers['content-type'] === 'string' ? headers['content-type'] : null;
    const body = response && response.json;
    if (body === undefined || body === null) return { format: 'empty', contentType, detail: 'no body' };
    if (typeof body === 'string') {
      const text = body.trim();
      if (text.startsWith('<') || /<\/?(html|body|div|script)/i.test(text)) {
        return { format: 'html', contentType, detail: 'an HTML document' };
      }
      return { format: 'text', contentType, detail: 'a text body where JSON was expected' };
    }
    if (Array.isArray(body)) {
      if (
        body.length > 0 &&
        body.every(function (item) {
          return typeof item === 'string' && item.trim().startsWith('<');
        })
      ) {
        return { format: 'html', contentType, detail: 'an array of HTML fragments' };
      }
      return { format: 'json', contentType, detail: null };
    }
    if (typeof body === 'object') {
      const keys = Object.keys(body);
      const snapshots = keys.filter(function (key) {
        return /^(html|outerhtml|dom|snapshot|innerhtml|content|body)$/i.test(key);
      });
      if (keys.length <= 2 && snapshots.length > 0) {
        for (const key of snapshots) {
          const value = body[key];
          if (typeof value === 'string' && value.trim().startsWith('<')) {
            return { format: 'dom_snapshot', contentType, detail: 'a DOM snapshot under "' + key + '"' };
          }
        }
      }
      return { format: 'json', contentType, detail: null };
    }
    return { format: 'scalar', contentType, detail: typeof body };
  }

  /**
   * Can this capture support a claim about which revision she kept?
   *
   * Two things are kept apart on purpose. **Mechanism capability** — did this
   * mechanism carry ancestry at all? One usable link anywhere answers that, and it
   * is what separates a mechanism returning the flat visible path from one that
   * can express a fork. **This conversation's ancestry** — whether the links held
   * are the links the account has — is *not knowable from the payload*: a capture
   * starting at message 40 of 200 looks exactly like one that has all 200. So the
   * classifier does not decide it, never selects a branch, and refuses to be
   * reassured: every anomaly it can see becomes a named gap, and a gap keeps the
   * run off `complete`.
   */
  function branchFidelity(messages) {
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
        emptyParents += 1;
        continue;
      }
      if (parent === message.uuid) {
        selfLinks += 1;
        continue;
      }
      carries += 1;
      parentOf.set(message.uuid, parent);
      if (ids.has(parent)) usable += 1;
    }
    const dangling = carries - usable;
    let roots = 0;
    for (const message of list) {
      const own = typeof message.uuid === 'string' ? message.uuid : null;
      if (own === null) continue;
      const parent = parentOf.get(own);
      if (parent === undefined || !ids.has(parent)) roots += 1;
    }
    const cycles = countCycles(list, parentOf);
    const malformed = cycles > 0 || duplicateIds > 0 || selfLinks > 0 || emptyParents > 0;
    return {
      carries,
      usable,
      dangling,
      selfLinks,
      emptyParents,
      duplicateIds,
      roots,
      cycles,
      fidelity: malformed ? 'structurally_invalid' : carries === 0 ? 'links_absent' : 'links_present',
      mechanism_carries_ancestry: usable > 0,
      conversation_ancestry_complete: null,
      selected_branch: 'not_selected_here',
    };
  }

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
        nodes += path.slice(path.indexOf(cursor)).length;
      }
      for (const node of path) state.set(node, 'done');
    }
    return nodes;
  }

  /** The gaps a conversation's ancestry forces, by name. */
  function branchGaps(branch, options) {
    const settings = options || {};
    const gaps = [];
    if (settings.branchable === false) return gaps;
    const id = settings.conversationId === undefined ? null : settings.conversationId;
    if (branch.fidelity === 'links_absent') {
      gaps.push({ code: 'branch_fidelity_unknown', id, detail: branch });
    }
    if (branch.fidelity === 'structurally_invalid') {
      gaps.push({ code: 'branch_structure_invalid', id, detail: branch });
    }
    if (branch.dangling > 0 || branch.roots !== 1) {
      gaps.push({ code: 'branch_ancestry_unresolved', id, detail: branch });
    }
    return gaps;
  }

  // --- normalization ---------------------------------------------------------

  function textOf(message) {
    const direct = message.text;
    if (typeof direct === 'string' && direct.trim() !== '') return direct;
    const content = message.content;
    if (typeof content === 'string') return content;
    if (!Array.isArray(content)) return '';
    const parts = [];
    for (const block of content) {
      if (block === null || typeof block !== 'object') continue;
      const type = block.type;
      if (type !== undefined && type !== 'text') continue;
      if (typeof block.text === 'string') parts.push(block.text);
    }
    return parts.join('\n');
  }

  function nonTextBlocks(message) {
    const content = message.content;
    if (!Array.isArray(content)) return {};
    const found = {};
    for (const block of content) {
      if (block === null || typeof block !== 'object') continue;
      const type = typeof block.type === 'string' ? block.type : null;
      if (type === null || type === 'text') continue;
      found[type] = (found[type] || 0) + 1;
    }
    return found;
  }

  function instant(value) {
    return typeof value === 'string' && value.trim() !== '' ? value : null;
  }

  function firstString(source, keys) {
    for (const key of keys) {
      const value = source[key];
      if (typeof value === 'string' && value.trim() !== '') return value.trim();
    }
    return null;
  }

  function senderOf(value) {
    if (typeof value !== 'string') return null;
    const role = value.trim().toLowerCase();
    if (role === 'human' || role === 'user') return 'human';
    if (role === 'assistant') return 'assistant';
    return null;
  }

  function attachmentOf(entry) {
    const record = entry !== null && typeof entry === 'object' ? entry : {};
    const size = typeof record.file_size === 'number' ? record.file_size : null;
    return {
      file_name: firstString(record, ['file_name', 'filename', 'name']),
      file_id: firstString(record, ['file_id', 'uuid', 'id']),
      file_type:
        typeof record.file_type === 'string'
          ? record.file_type
          : typeof record.mime_type === 'string'
            ? record.mime_type
            : null,
      file_size: size,
      kind: typeof record.kind === 'string' ? record.kind : null,
      // Bytes and extracted text are fetched by id, never inlined: nothing in the
      // importer reads them, and inlining them would make "text-exact" untrue.
      extracted_content: null,
      content_captured: false,
    };
  }

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
        title: typeof entry.title === 'string' ? entry.title : null,
        artifact_type: typeof entry.artifact_type === 'string' ? entry.artifact_type : null,
      });
    }
    return found;
  }

  /** One conversation in the export shape, plus what we could not do with it. */
  function normalizeWebConversation(payload) {
    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
      throw shapeError('not_an_object', 'conversation response is not an object');
    }
    const id = firstString(payload, ['uuid', 'id']);
    if (id === null) throw shapeError('missing_uuid', 'conversation has no uuid');
    let raw = payload.chat_messages;
    const drift = [];
    if (raw === undefined) raw = payload.messages;
    if (raw === undefined)
      throw shapeError('missing_messages', 'conversation ' + id + ' has no chat_messages');
    if (!Array.isArray(raw))
      throw shapeError('messages_not_array', 'conversation ' + id + ' chat_messages is not an array');

    const messages = [];
    const unsupported = {};
    const artifacts = artifactsFrom(payload.artifacts);
    let dropped = 0;
    let unidentified = 0;
    raw.forEach(function (entry, index) {
      if (entry === null || typeof entry !== 'object') {
        drift.push('chat_messages[' + index + ']:not_an_object');
        dropped += 1;
        return;
      }
      const messageId = firstString(entry, ['uuid', 'id']);
      if (messageId === null) {
        drift.push('chat_messages[' + index + ']:uuid');
        unidentified += 1;
      }
      const sender = senderOf(entry.sender) || senderOf(entry.role);
      if (sender === null) {
        drift.push('chat_messages[' + index + ']:sender');
        dropped += 1;
        return;
      }
      const blocks = nonTextBlocks(entry);
      for (const type of Object.keys(blocks)) unsupported[type] = (unsupported[type] || 0) + blocks[type];
      const refs = artifactsFrom(entry.artifacts);
      for (const ref of refs) artifacts.push(ref);
      const files = Array.isArray(entry.files) ? entry.files : [];
      const extra = Array.isArray(entry.attachments) ? entry.attachments : [];
      messages.push({
        uuid: messageId,
        sender,
        text: textOf(entry),
        content: Array.isArray(entry.content) ? entry.content : [],
        created_at: instant(entry.created_at),
        updated_at: instant(entry.updated_at),
        attachments: files.concat(extra).map(attachmentOf),
        files: [],
        parent_message_uuid: firstString(entry, ['parent_message_uuid', 'parent_id', 'parent']),
      });
    });

    const account =
      payload.account !== null && typeof payload.account === 'object'
        ? firstString(payload.account, ['uuid', 'id'])
        : null;
    if (account === null) drift.push('account');
    return {
      conversation: {
        uuid: id,
        name: firstString(payload, ['name', 'title']) || '',
        created_at: instant(payload.created_at),
        updated_at: instant(payload.updated_at),
        account: { uuid: account === null ? id : account },
        chat_messages: messages,
      },
      meta: {
        id,
        declaredMessages: raw.length,
        dropped,
        unidentified,
        unsupported,
        artifacts,
        drift,
        branch: branchFidelity(messages),
      },
    };
  }

  function shapeError(code, message) {
    const error = new Error(message);
    error.name = 'ShapeError';
    error.code = code;
    return error;
  }

  function codeOf(error) {
    if (error && error.name === 'ShapeError') return error.code;
    if (error && typeof error.status === 'number') return String(error.status);
    return 'unexpected_error';
  }

  // --- the walk --------------------------------------------------------------

  const GAP_CODES = {
    non_text_content_not_captured: true,
    artifact_content_not_captured: true,
    branch_fidelity_unknown: true,
    branch_structure_invalid: true,
    branch_ancestry_unresolved: true,
    message_ids_missing: true,
    inventory_page_empty: true,
    schema_drift: true,
    message_pagination_stall: true,
  };

  /**
   * Walk an account through a transport and return a capture and a verdict.
   *
   * `transport` is `function (method, path, query) -> Promise<{status, json,
   * headers}>`. It is the only thing that touches the network, and the caller
   * owns the allow-list inside it.
   */
  async function capture(options) {
    const settings = options || {};
    const transport = settings.transport;
    const pageSize = typeof settings.pageSize === 'number' ? settings.pageSize : 50;
    const maxPages = typeof settings.maxPages === 'number' ? settings.maxPages : 400;
    const onProgress = typeof settings.onProgress === 'function' ? settings.onProgress : function () {};
    const stats = { requests: 0, duplicates: 0, retries: 0 };
    const failures = [];
    const warnings = [];
    const conversations = [];
    const seenIds = new Set();
    const capturedIds = new Set();
    const missing = [];
    const seenMessages = new Set();

    // 1. Inventory. Nothing is fetched until the list is complete, because a
    //    partial list makes every later count a count of a subset.
    let offset = null;
    let window = pageSize;
    let pages = 0;
    let listFinished = false;
    let stall = null;
    let emptyStreak = 0;
    while (!listFinished) {
      if (pages >= maxPages) {
        stall = 'page_budget_exhausted after ' + pages + ' pages';
        break;
      }
      let response;
      try {
        response = await call(
          transport,
          'GET',
          '/api/organizations/' + String(settings.organizationId) + '/chat_conversations',
          {
            limit: pageSize,
            offset: offset === null ? 0 : offset,
          },
        );
      } catch (error) {
        failures.push({ phase: 'list', code: codeOf(error), message: error.message });
        break;
      }
      if (response.blocked) {
        failures.push({ phase: 'list', code: response.code, message: response.detail });
        break;
      }
      const items = Array.isArray(response.json)
        ? response.json
        : Array.isArray(response.json && response.json.data)
          ? response.json.data
          : [];
      const declared =
        response.json && typeof response.json.has_more === 'boolean'
          ? response.json.has_more
          : items.length >= pageSize;
      pages += 1;
      if (items.length > 0) window = items.length;
      for (const item of items) {
        const id = firstString(item, ['uuid', 'id']);
        if (id === null) {
          failures.push({ phase: 'list', code: 'list_entry_without_id' });
          continue;
        }
        if (seenIds.has(id)) {
          stats.duplicates += 1;
          continue;
        }
        seenIds.add(id);
      }
      if (items.length === 0 && declared) {
        warnings.push({ code: 'inventory_page_empty', page: pages });
      }
      emptyStreak = items.length === 0 ? emptyStreak + 1 : 0;
      if (emptyStreak > 2) {
        stall = 'empty_page_streak after ' + emptyStreak + ' pages';
        break;
      }
      if (declared)
        offset = String((offset === null ? 0 : Number(offset)) + (items.length > 0 ? items.length : window));
      else listFinished = true;
      onProgress({ stage: 'list', page: pages, seen: seenIds.size });
    }
    if (stall !== null) failures.push({ phase: 'list', code: stall });
    if (!listFinished) {
      return verdict({
        status: 'blocked',
        stats,
        failures,
        warnings,
        conversations,
        missing: missing,
        declaredConversations: seenIds.size,
        pages,
      });
    }

    // 2. Every conversation, in inventory order.
    let index = 0;
    for (const id of seenIds) {
      index += 1;
      onProgress({ stage: 'detail', id, at: index, of: seenIds.size });
      let payload;
      try {
        const response = await call(
          transport,
          'GET',
          '/api/organizations/' + String(settings.organizationId) + '/chat_conversations/' + id,
          {
            tree: 'true',
            rendering_mode: 'messages',
            render_all_tools: 'true',
          },
        );
        if (response.blocked) {
          failures.push({ phase: 'detail', id, code: response.code });
          missing.push(id);
          continue;
        }
        payload = response.json;
      } catch (error) {
        failures.push({ phase: 'detail', id, code: codeOf(error), message: error.message });
        missing.push(id);
        continue;
      }
      let normalized;
      try {
        normalized = normalizeWebConversation(payload);
      } catch (error) {
        failures.push({ phase: 'detail', id, code: codeOf(error), message: error.message });
        missing.push(id);
        continue;
      }
      const messages = [];
      for (const message of normalized.conversation.chat_messages) {
        if (typeof message.uuid === 'string') {
          if (seenMessages.has(message.uuid)) {
            stats.duplicates += 1;
            continue;
          }
          seenMessages.add(message.uuid);
        }
        messages.push(message);
      }
      const conversation = Object.assign({}, normalized.conversation, { chat_messages: messages });
      const branch = branchFidelity(messages);
      const branchable = messages.length >= 2;
      for (const gap of branchGaps(branch, { conversationId: id, branchable })) warnings.push(gap);
      if (normalized.meta.unidentified > 0) {
        warnings.push({ code: 'message_ids_missing', id, detail: normalized.meta.unidentified });
      }
      if (normalized.meta.dropped > 0) {
        failures.push({ phase: 'detail', id, code: 'messages_dropped', count: normalized.meta.dropped });
      }
      if (Object.keys(normalized.meta.unsupported).length > 0) {
        warnings.push({ code: 'non_text_content_not_captured', id, detail: normalized.meta.unsupported });
      }
      if (normalized.meta.artifacts.length > 0) {
        // Declared and not fetched. The page's world has no documented way to
        // fetch a body from here, and pretending otherwise would be the worst
        // kind of wrong.
        for (const ref of normalized.meta.artifacts) {
          warnings.push({
            code: 'artifact_content_not_captured',
            id,
            detail: { ref: ref.ref, reason: 'not_available_in_this_mechanism' },
          });
        }
      }
      for (const item of normalized.meta.drift) {
        warnings.push({ code: 'schema_drift', id, detail: item });
      }
      conversations.push(conversation);
      capturedIds.add(id);
    }

    return verdict({
      status: null,
      stats,
      failures,
      warnings,
      conversations,
      missing: missing,
      declaredConversations: seenIds.size,
      pages,
    });
  }

  /** One request, with the format guard in front of the status code. */
  async function call(transport, method, path, query) {
    const response = await transport(method, path, query);
    const status = response && typeof response.status === 'number' ? response.status : 0;
    const body = classifyBody(response);
    if (status >= 200 && status < 300 && body.format !== 'json') {
      return {
        blocked: true,
        code: 'unsupported_response_format',
        detail: method + ' ' + path + ' answered ' + status + ' with ' + (body.detail || body.format),
      };
    }
    if (status === 401 || status === 403) {
      const error = new Error('signed out (' + status + ') on ' + method + ' ' + path);
      error.status = status;
      throw error;
    }
    if (status < 200 || status >= 300) {
      const error = new Error(status + ' on ' + method + ' ' + path);
      error.status = status;
      throw error;
    }
    return { json: response.json, blocked: false };
  }

  /**
   * One verdict, and the gate. A capture that lost anything, or that cannot say
   * what it does not know, is not handed over. `complete_with_gaps` is
   * importable only when a person acknowledges the named gaps.
   */
  async function verdict(input) {
    const missing = input.missing || [];
    const gaps = input.warnings.filter(function (warning) {
      return GAP_CODES[warning.code] === true;
    });
    let status = input.status;
    if (status === null) {
      if (
        input.failures.some(function (failure) {
          return failure.phase !== 'list';
        })
      )
        status = 'partial';
      else if (gaps.length > 0) status = 'complete_with_gaps';
      else status = 'complete';
    }
    const digest = await digestOf(input.conversations);
    const branchable = input.conversations.filter(function (conversation) {
      return conversation.chat_messages.length >= 2;
    });
    const report = {
      mechanism: 'web-app',
      status,
      /**
       * Where the capture's standing on branches is written down, so nobody has
       * to infer it from a gap list.
       */
      branches: {
        selected_by: 'importer, from the parent links this file carries',
        capture_selects_a_branch: false,
        mechanism_carries_ancestry: branchable.some(function (conversation) {
          return branchFidelity(conversation.chat_messages).mechanism_carries_ancestry === true;
        }),
        conversation_ancestry_complete: 'not knowable from the payload',
        why_not_knowable:
          'a capture that starts at message 40 of 200 is indistinguishable from one that has all 200',
      },
      handoffable: status === 'complete',
      requires_acknowledgement: status === 'complete_with_gaps',
      declared_conversations: input.declaredConversations,
      captured_conversations: input.conversations.length,
      missing_conversations: missing,
      captured_messages: input.conversations.reduce(function (sum, conversation) {
        return sum + conversation.chat_messages.length;
      }, 0),
      inventory_pages: input.pages,
      failures: input.failures,
      gaps,
      stats: input.stats,
      digest_algorithm: digest.algorithm,
      digest: digest.value === null ? null : 'sha256:' + digest.value,
      capture_bytes: digest.bytes,
    };
    return {
      conversations: input.conversations,
      report,
      bytes: canonicalJson(input.conversations),
      manifest: JSON.stringify(manifest(report), null, 2) + '\n',
    };
  }

  function manifest(report) {
    return {
      kind: 'apunta.claude-import.extraction',
      version: 1,
      synthetic: false,
      note: 'A capture is only as good as the verdict beside it. Read the verdict; the file itself cannot say what it lost.',
      report,
    };
  }

  scope.ApuntaCaptureCore = {
    capture: capture,
    canonicalJson: canonicalJson,
    digestOf: digestOf,
    classifyBody: classifyBody,
    branchFidelity: branchFidelity,
    branchGaps: branchGaps,
    countCycles: countCycles,
    normalizeWebConversation: normalizeWebConversation,
    GAP_CODES: GAP_CODES,
  };
})(typeof globalThis === 'undefined' ? this : globalThis);
