# Sources

Every external claim in this directory and in
`docs/research/claude-import-extraction-results.md` comes from one of these.
Read on 2026-09-27. Nothing here was fetched from a signed-in account, and no
exporter code was executed.

## Documented, supported

1. **Compliance API — retrieve and delete chats, files, and projects.**
   <https://platform.claude.com/docs/en/manage-claude/compliance-content-data>
   The page states these endpoints are available only to Claude Enterprise
   organizations. `GET /v1/compliance/apps/chats` (metadata, `order_by`,
   `updated_at.*`, `limit`, `after_id`; response `data`, `has_more`,
   `first_id`, `last_id`, `deleted_at`) and
   `GET /v1/compliance/apps/chats/{id}/messages` (the chat's metadata plus
   `chat_messages` sorted by `created_at`, with `id`, `role` `user`/`assistant`,
   `content[]`, and `files` / `generated_files` / `artifacts`, each nullable).
   Key sentences used: process results idempotently keyed by chat `id`; persist
   the final `last_id` and resume from it; a chat with `deleted_at` populated
   has no content left to fetch; `files` are uploads, `generated_files` are the
   assistant's binary output, `artifacts` are versioned documents and each
   revision is a new `version_id` under the same `id`; the file content
   endpoint may return *extracted text* rather than the uploaded bytes.
2. **API reference — list chats, get chat messages, artifacts.**
   <https://platform.claude.com/docs/en/api/compliance/apps/chats>,
   <https://platform.claude.com/docs/en/api/compliance/apps/chats/messages/list>,
   <https://platform.claude.com/docs/en/api/compliance/apps/artifacts>.
   `limit` max 1000; `after_id` / `before_id` are
   opaque cursors "not to be parsed or interpreted"; messages accept `order`
   `asc`/`desc` and `tool_result_max_chars`; artifact metadata carries `md5` and
   `size_bytes` over the UTF-8 text, and the content endpoint returns
   `{content, title, artifact_type}` for a `version_id` — never for the stable
   artifact `id`.
3. **Compliance API overview and limits.**
   <https://platform.claude.com/docs/en/manage-claude/compliance-api> — the
   `/v1/compliance/*` endpoints share 600 requests per minute per parent
   organization. Cursors are bound to the sort key: an `after_id` issued under
   one `order_by` is rejected under the other.
4. **Export your Claude data** (support) —
   <https://support.claude.com/en/articles/9450526-export-your-claude-data>.
   Free, Pro and Max: Settings → Privacy → Export data; the archive arrives by
   email, the link expires after 24 hours, and it must be signed in to download.
   **There is no documented self-serve programmatic retrieval for an individual
   account.** This is the single most important fact in this directory: the only
   *supported* machine-readable retrieval is Enterprise-only.

## Undocumented, read from public source

5. **`L9RICHLATABB/claude-conversation-exporter`, `exporter.js`** (MIT, public,
   5 commits) — <https://github.com/L9RICHLATABB/claude-conversation-exporter>.
   Shows, and is the source for, the web app's conversation endpoint
   `GET /api/organizations/{orgId}/chat_conversations/{conversationId}?tree=true&rendering_mode=messages&render_all_tools=true`,
   fetched with `credentials: 'include'`, with the organization taken from the
   `lastActiveOrg` cookie that claude.ai already sets; the response carries
   `uuid`, `name`, `created_at` and `chat_messages[]` whose entries have
   `sender`, `created_at`, `uuid` and `content[]` blocks of type `text`,
   `tool_result`, `tool_use`, `image`, `document`. Its own README concedes
   "branched conversations … export the visible/main path only" and "if
   Anthropic changes their internal API shape, the script may break".
6. **`KoushikNavuluri/Claude-API`, `claude_api/claude_api.py`** (public) —
   `GET https://claude.ai/api/organizations` returning `[{uuid}]`, and
   `GET /api/organizations/{org}/chat_conversations` with the comment "Returns
   all conversation information in a list" and **no pagination parameters**.
   This is why the prototype's window/offset paging is marked unverified.
7. **`Galkurta/AI-Gateway`, `claude-web.ts`** (public) — the same base URL for
   creating a conversation and posting to `…/chat_conversations/{id}/completion`,
   which is the write path a capture must never touch.

## Chrome, official documentation

8. **Cross-origin network requests** —
   <https://developer.chrome.com/docs/extensions/develop/concepts/network-requests>.
   "Extension origins aren't so limited… as long as the extension requests host
   permissions"; "Cross-origin requests are always treated as such in content
   scripts, even if the extension has host permissions"; and the guidance to
   let a content script pass *ids* rather than arbitrary URLs to the extension.
9. **Extension service worker lifecycle** —
   <https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle>.
   Terminated after 30 s of inactivity, after a single request exceeds five
   minutes, or when a `fetch()` response takes more than 30 s; globals are lost,
   so state belongs in `storage` or IndexedDB; alarms can be set to 30 s from
   Chrome 120; `runtime.connectNative()` keeps the worker alive from Chrome 105.
10. **`browser.storage`** — <https://developer.chrome.com/docs/extensions/reference/api/storage>.
    `storage.local` is 10 MB (5 MB on Chrome 113 and earlier), raised only by
    the `unlimitedStorage` permission.
11. **Native messaging** —
    <https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging>.
    The host manifest must be written by an installer to a fixed OS location
    (a registry key on Windows, `…/NativeMessagingHosts/` under the Chrome
    profile on macOS and Linux, or `/etc/opt/chrome/native-messaging-hosts/`
    system-wide), `allowed_origins` takes exact extension origins and no
    wildcards, messages from the host are capped at 1 MB, the
    `nativeMessaging` permission is required, and the API is unavailable in
    content scripts.
12. **Chrome Web Store program policies** —
    <https://developer.chrome.com/docs/webstore/program-policies/limited-use>
    and `…/quality-guidelines`. Limited Use: an extension may only collect, use
    or transmit user data necessary for its disclosed single purpose; browsing
    activity collection is prohibited except as a prominently described
    user-facing feature; an affirmative Limited Use statement must be published.
    Quality guidelines: a single, narrow, easily understood purpose, and
    functionality that is clearly separate belongs in a separate extension.

## What the absence of a field, and the absence of a parameter, does not mean

Two cautions, because this lane's central risk is reading documentation silence
as behaviour:

- **A field the documented schema does not list is a gap in the document.** The
  Compliance API reference does not list a fork link or a per-message edit time
  on a chat message. That is what was read. It is not a finding that a live
  response cannot contain them, and it is not a finding about what a response
  would do with a branched conversation — a response that returned the thread as
  displayed would be a different thing again, and the document as written is
  consistent with either. The prototype's `compliance-api` shape is *modelled on
  the documented object*, and the test that shows a different live thread is a
  simulation of a response shaped that way, not a measurement of the API.
- **A source that sends no parameter does not show that the endpoint has no
  parameters.** The published client cited in (6) calls the inventory endpoint
  with none and comments that it returns everything; that client may have been
  written against a small account. Whether the live endpoint returns everything in
  one response, pages by window, or pages by cursor is unestablished, and all
  three are handled by the walk.
- **One archive is one archive.** The shape probe in
  `docs/eval-reports/2026-09-22-claude-export-probe.md` is the only first-hand
  evidence about an export's keys, it sampled one file, and it says nothing about
  other accounts, plans or export versions. Where it is absent from a key set, this
  lane says only that.

## Not consulted, deliberately

13. **Anthropic's terms of service.** A tool that reads a signed-in session
    through undocumented endpoints may be contrary to them, and whether it is
    has not been checked here. Nothing in this directory should be read as a
    determination that such use is or is not permitted: "public exporters do it
    this way" is an observation about source code, not an authorization. That
    check is a precondition for shipping, not a detail, and it belongs to whoever
    owns the decision.
