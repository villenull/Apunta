// The two sources, over one small `request` seam.
//
// Everything above this file — the walker, the shape adapters, the manifest —
// is mechanism-agnostic. What differs between a synthetic account and a real
// one is a single function:
//
//     request(method, path, query) -> { status, json }
//
// so the *same* walker, the *same* normalizers and the *same* manifest run in
// both, and a test that exercises the walker against a synthetic account is
// evidence about the walker's logic and about the shape handling — not about
// claude.ai.
//
// Source-grounded endpoints and response fields, with what is *not* documented
// marked as such:
//
//   web-app       GET /api/organizations                                  → [{uuid}]
//                 GET /api/organizations/{org}/chat_conversations         → list
//                     (pagination parameters: UNVERIFIED — see below)
//                 GET /api/organizations/{org}/chat_conversations/{id}
//                     ?tree=true&rendering_mode=messages&render_all_tools=true
//                                                                          → conversation + chat_messages[]
//                 artifact content                                       → NOT RETRIEVABLE here
//   compliance    GET /v1/compliance/apps/chats?limit&after_id&order_by   → data[], has_more, last_id
//                 GET /v1/compliance/apps/chats/{id}/messages?limit&after_id&order
//                                                                          → chat metadata + chat_messages[]
//                 GET /v1/compliance/apps/artifacts/{version_id}/content   → {content, title, artifact_type}
//
// Two honest asymmetries, both handled by declaration rather than by guess:
//
// 1. **The web app's inventory pagination is not in any public source.** One
//    published client calls the list endpoint with no parameters and comments
//    that it returns everything. This prototype therefore drives it with
//    `limit`/`offset`, which is the shape every other list endpoint in the app
//    family uses, and treats `has_more` as optional: an inventory that ends
//    without a `has_more` is accepted but the manifest records which rule ended
//    it. A live trial has to confirm this before anything ships.
// 2. **Artifact bodies are not reachable through the web mechanism.** Only the
//    Compliance API documents an artifact content endpoint. A web-app capture
//    therefore records every artifact it sees as declared-not-captured, which
//    makes the run `complete_with_gaps` — visible, and handoffable only on
//    purpose. Nothing is dropped in silence.

import { classifyBody, NORMALIZERS, ShapeError, SourceError } from './shapes.mjs';

/** The page size the walker asks for; the seed for an empty page's window. */
const DEFAULT_LIMITS_PAGE = 50;

function qs(query) {
  const parts = [];
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === null || value === undefined) continue;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  return parts.length === 0 ? '' : `?${parts.join('&')}`;
}

function expect(request, method, path, query) {
  const response = request(method, `${path}${qs(query)}`);
  const status = response?.status ?? 0;
  // Format first, and before the status is acted on: a `200 OK` carrying a
  // sign-in page or a DOM snapshot is the failure that must never be mistaken
  // for content, and it is only visible if the body is looked at.
  const body = classifyBody(response);
  if (status === 200 && body.format !== 'json') {
    throw new ShapeError(
      'unsupported_response_format',
      `${method} ${path} answered 200 with ${body.detail ?? body.format}`,
      { path, conversationId: null },
    );
  }
  if (status === 401 || status === 403) {
    throw new SourceError(status, `signed out (${status}) on ${method} ${path}`, {
      endpoint: `${method} ${path}`,
    });
  }
  if (status === 429) {
    const header = response.headers?.['retry-after'] ?? null;
    const seconds = header === null ? null : Number(header);
    throw new SourceError(429, `rate limited on ${method} ${path}`, {
      endpoint: `${method} ${path}`,
      retryAfterMs: Number.isFinite(seconds) ? (seconds ?? 0) * 1000 : null,
    });
  }
  if (status < 200 || status >= 300) {
    throw new SourceError(
      status === 0 ? 'transport_error' : status,
      `${String(status)} on ${method} ${path}`,
      {
        endpoint: `${method} ${path}`,
      },
    );
  }
  return response.json;
}

/**
 * The claude.ai web app mechanism. Cookie-authenticated, so it only ever works
 * from a context the browser considers same-site with claude.ai; see
 * `docs/research/claude-import-extraction-results.md` for why that pushes the
 * request into the page's own world.
 */
export function createWebAppSource({ request, organizationId = null }) {
  const normalize = NORMALIZERS['web-app'];
  let org = organizationId;
  // The window size the server last honoured, used only to move past an empty
  // page. Reset per source, never persisted: a resumed run re-learns it from
  // its first page.
  let window = DEFAULT_LIMITS_PAGE;

  const source = {
    mechanism: 'web-app',
    documented: false,
    supportsArtifactContent: false,
    inventoryPagination: 'offset (UNVERIFIED)',
    async organization() {
      if (org !== null) return org;
      const list = expect(request, 'GET', '/api/organizations', null);
      const first = Array.isArray(list) ? list[0] : null;
      const id = first !== null && typeof first === 'object' ? (first.uuid ?? first.id ?? null) : null;
      if (typeof id !== 'string')
        throw new SourceError('no_organization', 'no organization in /api/organizations');
      org = id;
      return org;
    },
    async listConversations({ limit, cursor }) {
      const offset = cursor === null || cursor === undefined ? 0 : Number(cursor);
      const body = expect(
        request,
        'GET',
        `/api/organizations/${await source.organization()}/chat_conversations`,
        {
          limit,
          offset,
        },
      );
      const items = Array.isArray(body) ? body : Array.isArray(body?.data) ? body.data : [];
      const hasMore = typeof body?.has_more === 'boolean' ? body.has_more : items.length >= limit;
      // The window moves by what the source last actually returned, so a server
      // that caps the page below the requested size does not strand the walk
      // past the end. An *empty* page that still claims more has no window to
      // infer, so the last known one is used and the walker's streak guard is
      // what stops that from reading as the end of the account.
      if (items.length > 0) window = items.length;
      const step = items.length > 0 ? items.length : window;
      return {
        items,
        hasMore,
        cursor: hasMore ? String(offset + step) : null,
        page: {
          offset,
          limit,
          has_more_source: typeof body?.has_more === 'boolean' ? 'declared' : 'inferred_from_length',
        },
      };
    },
    async getConversation(id, { cursor = null, limit = null } = {}) {
      // The public exporter reads the whole conversation in one call; there is
      // no documented message paging here, so no cursor is ever sent.
      const body = expect(
        request,
        'GET',
        `/api/organizations/${await source.organization()}/chat_conversations/${id}`,
        { tree: 'true', rendering_mode: 'messages', render_all_tools: 'true' },
      );
      return { ...body, __page: null, __unverified: { message_limit: limit, message_cursor: cursor } };
    },
    async getArtifactContent() {
      return { ok: false, code: 'artifact_content_not_reachable_in_this_mechanism' };
    },
    normalizeListEntry(item) {
      if (item === null || typeof item !== 'object') return null;
      const id = item.uuid ?? item.id ?? null;
      if (typeof id !== 'string') return null;
      return {
        id,
        name: item.name ?? item.title ?? null,
        created_at: item.created_at ?? null,
        updated_at: item.updated_at ?? null,
        deleted_at: null,
      };
    },
    normalize,
  };
  return source;
}

/**
 * The documented Compliance API mechanism.
 *
 * Enterprise only, on a Compliance Access Key with `read:compliance_user_data`.
 * The docs' own guidance is the design: page with `after_id`, persist the final
 * `last_id`, treat a populated `deleted_at` as deleted rather than updated, and
 * process results idempotently keyed by chat `id`. A deleted chat is listed but
 * has no content to fetch, so it is reported rather than fetched.
 */
export function createComplianceSource({ request, artifactContentEnabled = true }) {
  const normalize = NORMALIZERS['compliance-api'];
  const source = {
    mechanism: 'compliance-api',
    documented: true,
    supportsArtifactContent: artifactContentEnabled,
    inventoryPagination: 'after_id cursor (documented)',
    async listConversations({ limit, cursor }) {
      const body = expect(request, 'GET', '/v1/compliance/apps/chats', {
        limit,
        order_by: 'updated_at',
        after_id: cursor ?? null,
      });
      const items = Array.isArray(body?.data) ? body.data : [];
      const hasMore = body?.has_more === true;
      return {
        items,
        hasMore,
        cursor: hasMore ? (body.last_id ?? null) : null,
        page: {
          after_id: cursor ?? null,
          has_more: hasMore,
          first_id: body?.first_id ?? null,
          last_id: body?.last_id ?? null,
        },
      };
    },
    async getConversation(id, { cursor = null, limit = null } = {}) {
      const body = expect(request, 'GET', `/v1/compliance/apps/chats/${id}/messages`, {
        limit: limit ?? null,
        after_id: cursor ?? null,
        order: 'asc',
      });
      const hasMore = body?.has_more === true;
      return {
        ...body,
        __page: { hasMore, cursor: hasMore ? (body.last_id ?? null) : null },
      };
    },
    async getArtifactContent(versionId) {
      if (!artifactContentEnabled) return { ok: false, code: 'artifact_content_disabled' };
      const body = expect(request, 'GET', `/v1/compliance/apps/artifacts/${versionId}/content`, null);
      return {
        ok: true,
        content: typeof body?.content === 'string' ? body.content : null,
        title: body?.title ?? null,
        artifact_type: body?.artifact_type ?? null,
      };
    },
    normalizeListEntry(item) {
      if (item === null || typeof item !== 'object') return null;
      const id = item.id ?? item.uuid ?? null;
      if (typeof id !== 'string') return null;
      return {
        id,
        name: item.name ?? null,
        created_at: item.created_at ?? null,
        updated_at: item.updated_at ?? null,
        deleted_at: item.deleted_at ?? null,
      };
    },
    normalize,
  };
  return source;
}
