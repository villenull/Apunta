// The capture walk: inventory, then every conversation, then every declared
// artifact, with a checkpoint after each unit and an honest verdict at the end.
//
// The rule the whole file serves: **a run that lost anything is never reported
// as a complete capture, and a complete capture is never reported when
// anything is missing.** The verdict is one of
//
//   `complete`            every declared conversation fetched, every declared
//                         artifact fetched, no message lost, no stall, no
//                         required key missing.
//   `complete_with_gaps`  as above, but content the source declared exists that
//                         this mechanism cannot carry (an image block, an
//                     attachment's bytes, a fork's parent links on a
//                         mechanism that omits them). Importable, but only when
//                         a person says so, and the gaps are listed in the
//                         manifest.
//   `partial`             some conversations or artifacts could not be fetched.
//   `blocked`             the inventory itself could not be completed (signed
//                         out, rate limited out, pagination stalled), so what
//                         was fetched is an unknown subset of the account.
//
// `handoffable` is true for `complete` alone. That gate is the deliverable's
// safety property: the capture side may not hand a file to the import side
// unless it can say the account was walked end to end.

import { canonicalJson, digestOf, taggedDigest } from './canonical.mjs';
import { CHECKPOINT_VERSION, checkpointSummary } from './checkpoint.mjs';
import { branchFidelity, branchGaps, ShapeError, SourceError } from './shapes.mjs';

export const DEFAULT_LIMITS = {
  /** Conversations requested per inventory page. */
  pageSize: 50,
  /** Hard ceiling on inventory pages, so a broken cursor cannot loop forever. */
  maxListPages: 400,
  /** Consecutive empty pages tolerated before the pagination is called stalled. */
  maxEmptyPages: 2,
  /** Attempts per request, including the first. */
  maxAttempts: 4,
  /** Backoff for 5xx and 429, doubled per attempt, when no Retry-After is given. */
  retryBaseMs: 250,
  /** Ceiling on a single backoff wait. */
  retryMaxMs: 8000,
  /** Ceiling on detail and artifact requests in one run, so a run ends. */
  maxDetailRequests: 5000,
};

/** Statuses that can end a run, and what they mean for the file. */
export const STATUS = {
  complete: 'complete',
  completeWithGaps: 'complete_with_gaps',
  partial: 'partial',
  blocked: 'blocked',
};

function emptyState(runId) {
  return {
    v: CHECKPOINT_VERSION,
    runId,
    phase: 'list',
    list: { cursor: null, pages: 0, ids: [], seenCursors: [], listFinished: false },
    fetched: {},
    artifacts: {},
    failures: [],
    warnings: [],
    stats: { requests: 0, retries: 0, duplicateConversations: 0, duplicateMessages: 0, waitsMs: 0 },
  };
}

function freshState(runId, previous) {
  if (previous === null || previous === undefined) return emptyState(runId);
  if (previous.v !== CHECKPOINT_VERSION) return emptyState(runId);
  if (previous.runId !== runId) return emptyState(runId);
  return previous;
}

/**
 * One request, with the retry policy the two mechanisms need.
 *
 * 429 and 5xx are retried — the Compliance API documents a shared 600 rpm
 * budget, so a 429 is a "slow down", not a failure. 401 and 403 are not: the
 * session is gone, and retrying a request that cannot succeed just burns the
 * budget. The `Retry-After` value is honoured when the source sends one.
 */
async function withRetries(limits, stats, sleep, endpoint, attemptFn) {
  let lastError = null;
  for (let attempt = 1; attempt <= limits.maxAttempts; attempt += 1) {
    try {
      stats.requests += 1;
      return await attemptFn();
    } catch (error) {
      lastError = error;
      const status = error instanceof SourceError ? error.status : null;
      const retryable = status !== null && (status === 429 || (status >= 500 && status < 600));
      if (!retryable || attempt === limits.maxAttempts) break;
      stats.retries += 1;
      const wait = Math.min(error.retryAfterMs ?? limits.retryBaseMs * 2 ** (attempt - 1), limits.retryMaxMs);
      stats.waitsMs += wait;
      await sleep(wait, { endpoint, attempt, status });
    }
  }
  throw lastError;
}

function statusOf(error) {
  if (error instanceof SourceError) return String(error.status);
  if (error instanceof ShapeError) return error.code;
  return 'unexpected_error';
}

/**
 * Inventory walk.
 *
 * Three ways a paginated inventory lies, all handled explicitly because all
 * three produce a file that *looks* complete:
 *
 *  - `has_more: true` and the same cursor back: an unchanging cursor. Detected
 *    by comparing cursors already seen in this run.
 *  - a page that declares more but returns nothing: bounded by
 *    `maxEmptyPages`, then called a stall.
 *  - a page that silently repeats ids: deduped and counted, so the manifest
 *    shows the list was not distinct.
 */
async function walkInventory({ source, state, limits, sleep, normalizeListEntry }) {
  const pages = [];
  let consecutiveEmpty = 0;
  let stall = null;

  while (state.list.listFinished !== true) {
    if (state.list.pages >= limits.maxListPages) {
      stall = `page_budget_exhausted after ${String(state.list.pages)} pages`;
      break;
    }
    const requestCursor = state.list.cursor;
    const page = await withRetries(limits, state.stats, sleep, 'list', () =>
      source.listConversations({ limit: limits.pageSize, cursor: requestCursor }),
    );

    const nextCursor = page.cursor ?? null;
    if (nextCursor !== null && requestCursor !== null && nextCursor === requestCursor) {
      stall = 'cursor_did_not_advance';
      break;
    }
    if (nextCursor !== null && state.list.seenCursors.includes(nextCursor)) {
      stall = 'cursor_repeated';
      break;
    }
    if (page.hasMore === true && nextCursor === null) {
      stall = 'cursor_missing_while_more_declared';
      break;
    }

    const items = Array.isArray(page.items) ? page.items : [];
    const ids = [];
    const entries = [];
    for (const item of items) {
      const entry = normalizeListEntry(item, requestCursor);
      if (entry === null) continue;
      entries.push(entry);
      if (state.list.ids.includes(entry.id)) {
        state.stats.duplicateConversations += 1;
        continue;
      }
      state.list.ids.push(entry.id);
      ids.push(entry.id);
    }

    state.list.pages += 1;
    pages.push({
      page: state.list.pages,
      cursor_sent: requestCursor,
      cursor_received: nextCursor,
      declared_ids: entries.length,
      new_ids: ids.length,
      has_more: page.hasMore === true,
    });
    if (nextCursor !== null) state.list.seenCursors.push(nextCursor);
    state.list.cursor = nextCursor;

    consecutiveEmpty = entries.length === 0 ? consecutiveEmpty + 1 : 0;
    if (entries.length === 0 && page.hasMore === true) {
      // The window moved past rows the source did not show us. The walk may
      // continue, but the capture is no longer a full one and has to say so:
      // "there was a page here and it was empty" is the whole difference
      // between an account with gaps and an account with holes.
      state.warnings.push({
        code: 'inventory_page_empty',
        page: state.list.pages,
        cursor_sent: requestCursor,
      });
    }
    if (consecutiveEmpty > limits.maxEmptyPages) {
      stall = `empty_page_streak after ${String(consecutiveEmpty)} pages`;
      break;
    }
    if (page.hasMore !== true) {
      state.list.listFinished = true;
    }
  }

  return { pages, stall, listFinished: state.list.listFinished === true };
}

/**
 * Message-level paging inside one conversation.
 *
 * Both mechanisms can return a long chat in pages (`after_id` on the Compliance
 * API, and the web app's own limit/offset on the undocumented list). The walker
 * keeps asking until the source stops saying "more", with the same three guards
 * as the inventory: a cursor that repeats, a page that adds nothing, and a
 * budget.
 */
async function walkConversation({ source, id, state, limits, sleep, endpointFor }) {
  const collected = [];
  const seen = new Set();
  let cursor = null;
  let finished = false;
  let stall = null;
  let pages = 0;
  let emptyStreak = 0;

  while (!finished) {
    if (pages >= limits.maxListPages) {
      stall = 'message_page_budget_exhausted';
      break;
    }
    const payload = await withRetries(limits, state.stats, sleep, endpointFor(id), () =>
      source.getConversation(id, { cursor, limit: limits.pageSize }),
    );
    const normalized = source.normalize(payload, { conversationId: id });
    pages += 1;
    collected.push(normalized);

    // Measured on what the *source* returned, not on what could be read from
    // it: a page full of messages the normalizer cannot read is a parse failure
    // (recorded as `messages_dropped` elsewhere), while a page that declares
    // nothing is the signature of a broken cursor.
    for (const message of normalized.conversation.chat_messages) {
      if (typeof message.uuid === 'string') seen.add(message.uuid);
    }
    emptyStreak = normalized.meta.declaredMessages === 0 ? emptyStreak + 1 : 0;
    if (emptyStreak > limits.maxEmptyPages) {
      stall = 'message_empty_page_streak';
      break;
    }

    const next = payload?.__page ?? null;
    if (next === null || next === undefined) {
      finished = true;
    } else if (next.hasMore !== true) {
      finished = true;
    } else if (next.cursor === null || next.cursor === undefined || next.cursor === cursor) {
      // "There is more" with nowhere to go next is a stall, not progress.
      stall =
        next.cursor === null || next.cursor === undefined
          ? 'message_cursor_missing'
          : 'message_cursor_did_not_advance';
      finished = true;
    } else {
      cursor = next.cursor;
    }
  }

  return { collected, stall, pages };
}

function mergeMessages(pages) {
  const seen = new Set();
  const messages = [];
  let duplicates = 0;
  for (const page of pages) {
    for (const message of page.conversation.chat_messages) {
      const key = message.uuid;
      if (key !== null && key !== undefined) {
        if (seen.has(key)) {
          duplicates += 1;
          continue;
        }
        seen.add(key);
      }
      messages.push(message);
    }
  }
  return { messages, duplicates };
}

/**
 * Run a capture against a source.
 *
 * @param {object} options
 * @param {object} options.source      a `ConversationSource` (see `sources.mjs`)
 * @param {object} options.checkpoint  a store from `checkpoint.mjs`
 * @param {string} options.runId       identity of this attempt; a resume must
 *                                     present the same one or start over
 * @param {object} [options.limits]
 * @param {(ms:number, info:object)=>Promise<void>} [options.sleep] injected by
 *        tests so retry behaviour is asserted without waiting
 * @param {(id:string)=>string} [options.until] optional cooperative stop, checked
 *        between units — a page-context run uses it to stay inside its own
 *        budget
 */
export async function extract({
  source,
  checkpoint,
  runId,
  limits: given,
  sleep = defaultSleep,
  until = null,
}) {
  const limits = { ...DEFAULT_LIMITS, ...(given ?? {}) };
  const resumed = checkpointSummary(checkpoint.load());
  const state = freshState(runId, checkpoint.load());
  const started = { resumed: resumed.resumed, limits };

  const inventory = await safeInventory({ source, state, limits, sleep, checkpoint });
  if (inventory.fatal !== null) {
    checkpoint.save(state);
    return finalize({ state, started, inventory, source, conversations: [] });
  }

  state.phase = 'detail';
  checkpoint.save(state);

  const conversations = [];
  for (const id of state.list.ids) {
    if (until !== null && until() === false) {
      state.failures.push({ phase: 'detail', id, code: 'stopped_by_caller' });
      break;
    }
    // Already captured by an earlier attempt: the final pass below emits it, in
    // inventory order, so it is not pushed again here.
    if (state.fetched[id] !== undefined) continue;
    let walked;
    try {
      walked = await walkConversation({
        source,
        id,
        state,
        limits,
        sleep,
        endpointFor: (conversationId) => `${source.mechanism}:messages:${conversationId}`,
      });
    } catch (error) {
      state.failures.push({
        phase: 'detail',
        id,
        code: statusOf(error),
        status: error.status ?? null,
        message: error.message,
      });
      if (error instanceof SourceError && (error.status === 401 || error.status === 403)) {
        state.warnings.push({ code: 'auth_expired_during_detail', id });
      }
      continue;
    }
    const { messages, duplicates } = mergeMessages(walked.collected);
    state.stats.duplicateMessages += duplicates;
    const first = walked.collected[0]?.conversation ?? null;
    if (first === null) {
      state.failures.push({ phase: 'detail', id, code: 'no_response' });
      continue;
    }
    const merged = { ...first, chat_messages: messages };
    const unsupported = {};
    const drift = [];
    const artifacts = [];
    // Branches are a property of the whole conversation, not of a page, so the
    // usable-link test is re-applied to the merged message set.
    const branch = branchFidelity(merged.chat_messages);
    for (const page of walked.collected) {
      for (const [type, count] of Object.entries(page.meta.unsupported)) {
        unsupported[type] = (unsupported[type] ?? 0) + count;
      }
      drift.push(...page.meta.drift.map((item) => `${String(id)}:${item}`));
      artifacts.push(...page.meta.artifacts);
      state.warnings.push(...page.meta.drift.map((item) => ({ code: 'schema_drift', id, detail: item })));
    }
    // One message cannot be branched, so there is nothing to be uncertain
    // about; an empty conversation is not evidence either way and is not
    // reported as if it were. Everything else is named by `branchGaps`, and the
    // capture never selects a branch: the importer does that, from links.
    const branchable = merged.chat_messages.length >= 2;
    state.warnings.push(...branchGaps(branch, { conversationId: id, branchable }));
    if (walked.stall !== null) {
      state.warnings.push({ code: 'message_pagination_stall', id, detail: walked.stall });
      state.failures.push({ phase: 'detail', id, code: walked.stall });
    }
    const unidentified = walked.collected.reduce((sum, page) => sum + page.meta.unidentified, 0);
    if (unidentified > 0) {
      state.warnings.push({ code: 'message_ids_missing', id, detail: unidentified });
    }
    const dropped = walked.collected.reduce((sum, page) => sum + page.meta.dropped, 0);
    if (dropped > 0) {
      // A message the response declared that no message could be read from is a
      // hole in the record. It is recorded as a failure so the run cannot be
      // called complete, and counted so the size of the hole is visible.
      state.warnings.push({ code: 'messages_dropped', id, detail: dropped });
      state.failures.push({ phase: 'detail', id, code: 'messages_dropped', count: dropped });
    }
    const declaredTotal = walked.collected.reduce((sum, page) => sum + page.meta.declaredMessages, 0);
    if (walked.pages > 1 && declaredTotal < merged.chat_messages.length) {
      state.warnings.push({ code: 'declared_message_count_mismatch', id });
    }
    if (unsupportedTextLoss(unsupported)) {
      state.warnings.push({ code: 'non_text_content_not_captured', id, detail: unsupported });
    }
    if (drift.includes(`${String(id)}:parent_message_uuid:absent_in_this_mechanism`)) {
      state.warnings.push({ code: 'no_fork_links_in_this_mechanism', id });
    }
    if (artifacts.length > 0) state.phase = 'artifact';

    state.fetched[id] = {
      digest: digestOf(merged),
      message_count: merged.chat_messages.length,
      payload: merged,
      meta: {
        id,
        unsupported,
        drift,
        artifacts,
        dropped,
        branch,
        deleted: walked.collected[0].meta.deleted === true,
        pages: walked.pages,
      },
    };
    checkpoint.save(state);
  }

  for (const id of state.list.ids) {
    const record = state.fetched[id];
    if (record === undefined) continue;
    conversations.push(record.payload);
  }

  await walkArtifacts({ source, state, limits, sleep, checkpoint });

  return finalize({ state, started, inventory, source, conversations });
}

/**
 * Artifact bodies.
 *
 * Only the Compliance API documents a content endpoint, and it is keyed by
 * `version_id` rather than the artifact's stable `id` — one artifact revised
 * across several assistant turns is several versions, and only the versions
 * are fetchable. A mechanism that cannot fetch them records each one as
 * declared-not-captured, which keeps the loss visible instead of silent.
 */
async function walkArtifacts({ source, state, limits, sleep, checkpoint }) {
  if (state.phase === 'artifact') state.phase = 'artifact-done';
  for (const id of state.list.ids) {
    const record = state.fetched[id];
    if (record === undefined) continue;
    for (const ref of record.meta.artifacts) {
      const key = `${id}::${ref.ref}`;
      if (state.artifacts[key] !== undefined) continue;
      if (state.stats.requests >= limits.maxDetailRequests) {
        state.failures.push({ phase: 'artifact', id, code: 'request_budget_exhausted' });
        return;
      }
      let result;
      try {
        result = await withRetries(limits, state.stats, sleep, `artifact:${ref.ref}`, () =>
          source.getArtifactContent(ref.ref, { conversationId: id }),
        );
      } catch (error) {
        state.artifacts[key] = { ...ref, conversationId: id, captured: false, code: statusOf(error) };
        state.failures.push({ phase: 'artifact', id, code: statusOf(error), ref: ref.ref });
        checkpoint.save(state);
        continue;
      }
      if (result?.ok === true) {
        state.artifacts[key] = {
          ...ref,
          conversationId: id,
          captured: true,
          title: result.title ?? ref.title,
          artifact_type: result.artifact_type ?? ref.artifact_type,
          bytes: typeof result.content === 'string' ? Buffer.byteLength(result.content, 'utf8') : 0,
          digest: result.content === null ? null : taggedDigest(result.content),
          content: result.content,
        };
      } else {
        state.artifacts[key] = {
          ...ref,
          conversationId: id,
          captured: false,
          code: result?.code ?? 'not_available',
        };
        state.warnings.push({
          code: 'artifact_content_not_captured',
          id,
          detail: { ref: ref.ref, reason: result?.code ?? 'not_available' },
        });
      }
      checkpoint.save(state);
    }
  }
}

function unsupportedTextLoss(unsupported) {
  return Object.keys(unsupported).length > 0;
}

async function safeInventory({ source, state, limits, sleep, checkpoint }) {
  try {
    const inventory = await walkInventory({
      source,
      state,
      limits,
      sleep,
      normalizeListEntry: (item) => source.normalizeListEntry(item),
    });
    if (inventory.stall !== null) {
      state.failures.push({ phase: 'list', code: inventory.stall });
    }
    checkpoint.save(state);
    return { ...inventory, fatal: null, conversations: [] };
  } catch (error) {
    const code = statusOf(error);
    state.failures.push({ phase: 'list', code, status: error.status ?? null, message: error.message });
    return {
      pages: [],
      stall: code,
      listFinished: false,
      fatal: code,
      conversations: [],
      message: error.message,
    };
  }
}

function finalStatus({ state, inventory }) {
  if (inventory.fatal !== null) return STATUS.blocked;
  if (inventory.stall !== null) return STATUS.blocked;
  if (state.list.listFinished !== true) return STATUS.blocked;
  const missing = state.list.ids.filter((id) => state.fetched[id] === undefined);
  if (missing.length > 0) return STATUS.partial;
  if (state.failures.some((failure) => failure.phase !== 'list')) return STATUS.partial;
  const gaps = state.warnings.filter(
    (warning) =>
      warning.code === 'non_text_content_not_captured' ||
      warning.code === 'no_fork_links_in_this_mechanism' ||
      warning.code === 'message_ids_missing' ||
      warning.code === 'branch_fidelity_unknown' ||
      warning.code === 'branch_structure_invalid' ||
      warning.code === 'branch_ancestry_unresolved' ||
      warning.code === 'inventory_page_empty' ||
      warning.code === 'artifact_content_not_captured' ||
      warning.code === 'schema_drift',
  );
  return gaps.length > 0 ? STATUS.completeWithGaps : STATUS.complete;
}

function finalize({ state, started, inventory, conversations, source }) {
  const status = finalStatus({ state, inventory });
  const gaps = state.warnings
    .filter(
      (warning) =>
        warning.code === 'non_text_content_not_captured' ||
        warning.code === 'no_fork_links_in_this_mechanism' ||
        warning.code === 'message_ids_missing' ||
        warning.code === 'branch_fidelity_unknown' ||
        warning.code === 'branch_structure_invalid' ||
        warning.code === 'branch_ancestry_unresolved' ||
        warning.code === 'inventory_page_empty' ||
        warning.code === 'artifact_content_not_captured' ||
        warning.code === 'schema_drift' ||
        warning.code === 'message_pagination_stall' ||
        warning.code === 'artifact_content_not_captured' ||
        warning.code === 'declared_message_count_mismatch' ||
        warning.code === 'auth_expired_during_detail',
    )
    .map((warning) => ({ ...warning }));
  const missing = state.list.ids.filter((id) => state.fetched[id] === undefined);
  const messages = conversations.reduce((sum, conversation) => sum + conversation.chat_messages.length, 0);
  const unsupported = {};
  for (const id of state.list.ids) {
    const record = state.fetched[id];
    if (record === undefined) continue;
    for (const [type, count] of Object.entries(record.meta.unsupported)) {
      unsupported[type] = (unsupported[type] ?? 0) + count;
    }
  }
  const artifacts = Object.entries(state.artifacts).map(([key, value]) => ({ key, ...value }));
  const branchableConversations = [...state.list.ids].filter(
    (id) => (state.fetched[id]?.message_count ?? 0) >= 2,
  );
  const report = {
    mechanism: source.mechanism,
    status,
    /**
     * The one place the capture's standing on branches is written down, so no
     * reader of a manifest has to infer it from a gap list.
     */
    branches: {
      selected_by: 'importer, from the parent links this file carries',
      capture_selects_a_branch: false,
      mechanism_carries_ancestry: branchableConversations.some(
        (id) => state.fetched[id]?.meta.branch?.mechanism_carries_ancestry === true,
      ),
      conversation_ancestry_complete: 'not knowable from the payload',
      why_not_knowable:
        'a capture that starts at message 40 of 200 is indistinguishable from one that has all 200, so nothing here can claim the links held are the links the account has',
    },
    handoffable: status === STATUS.complete,
    requires_acknowledgement: status === STATUS.completeWithGaps,
    run_id: state.runId,
    resumed: started.resumed,
    declared_conversations: state.list.ids.length,
    captured_conversations: conversations.length,
    captured_messages: messages,
    missing_conversations: missing,
    inventory_pages: inventory.pages,
    declared_artifacts: [...state.list.ids].reduce(
      (sum, id) => sum + (state.fetched[id]?.meta.artifacts.length ?? 0),
      0,
    ),
    captured_artifacts: artifacts.filter((artifact) => artifact.captured === true).length,
    artifacts_not_captured: artifacts
      .filter((artifact) => artifact.captured !== true)
      .map((artifact) => ({ ref: artifact.ref, code: artifact.code })),
    artifacts,
    failures: state.failures,
    gaps,
    stats: { ...state.stats },
    unsupported_content: unsupported,
    limits: started.limits,
  };
  return { state, conversations, report, pages: inventory.pages, gaps, artifacts };
}

/**
 * The two files a capture produces.
 *
 * `conversations.json` is exactly the shape `server/src/import/claude.ts`
 * already opens, and nothing else: no manifest keys, no extra fields, so the
 * importer needs no change and a re-run is byte-comparable. The manifest sits
 * beside it and is the only place the verdict lives.
 */
export function handoff({ conversations, report, manifest = {}, allowGaps = false }) {
  const exportJson = canonicalJson(conversations);
  const files = [
    {
      name: 'conversations.json',
      bytes: exportJson,
      digest: taggedDigest(conversations),
    },
    {
      name: 'extraction-manifest.json',
      bytes: `${JSON.stringify(
        {
          kind: 'apunta.claude-import.extraction',
          version: 1,
          synthetic: true,
          ...manifest,
          report,
        },
        null,
        2,
      )}\n`,
    },
  ];
  const bodies = (report.artifacts ?? []).filter(
    (artifact) => artifact.captured === true && typeof artifact.content === 'string',
  );
  if (bodies.length > 0) {
    files.push({
      name: 'artifacts.json',
      bytes: `${JSON.stringify({ kind: 'apunta.claude-import.artifacts', version: 1, synthetic: true, artifacts: bodies }, null, 2)}\n`,
    });
  }
  // A `complete_with_gaps` run is importable, but only by someone who has been
  // shown the gaps: the caller has to say so, and the manifest records that they
  // did, with the gaps themselves.
  const acknowledged = report.requires_acknowledgement === true && allowGaps === true;
  const handoffable = report.handoffable === true || acknowledged;
  return {
    files,
    handoffable,
    requires_acknowledgement: report.requires_acknowledgement === true,
    gaps_acknowledged: acknowledged,
    files_by_name: Object.fromEntries(files.map((file) => [file.name, file])),
  };
}

async function defaultSleep(ms) {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
