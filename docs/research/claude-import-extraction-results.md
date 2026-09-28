# Claude direct import — extraction lane results

**Lane:** 1 (extraction) of `docs/research/claude-direct-import-feasibility.md`.
**Date:** 2026-09-27. **Extended twice on 2026-09-28**, by
`docs/research/claude-import-browser-readiness.md` (D1, D15, the browser run) and
`docs/research/claude-import-relay-results.md` (the relay, the hardened ancestry
classifier, a real click-through with the file read back from disk). Where this
document's criterion table is now out of date it is marked there; the evidence
below is unchanged and still reproduces. One statement in it is **retracted**: the
browser run's "capture walked a synthetic account end to end" meant the *walk*, not
a user path — the popup could not drive the capture at the time, and could not be
told to, because the live path was not wired. The retraction is in full in the
readiness document. **Prototype:** `scratch/claude-import-extraction/`.
**Sources:** `scratch/claude-import-extraction/SOURCES.md`.
**Shape of the extension and its costs:** `scratch/claude-import-extraction/extension/NOTES.md`.

**Verdict: PASS on the offline work, NOT RUN on everything that needs a real
account.** A capture can be walked, verified and handed to the importer that
already exists, and it can be made impossible to mistake for a complete one. What
remains unproven is everything that depends on a signed-in session, and one of
those things is not a detail: **for an individual Claude account, no supported
programmatic retrieval is documented.** The only machine-readable retrieval
Anthropic's pages describe is the Compliance API, and those pages restrict it to
Claude Enterprise. Whether some other route exists, or is permitted, has not been
established here.

Three labels are used throughout, and they are not interchangeable:

- **Observed** — a public document or a public source file says it. Cited in
  `SOURCES.md`. An observation about *what a document says* is not an
  observation about *what a service returns*: a field absent from a documented
  schema is a gap in the document, and nothing more.
- **Inferred** — a conclusion drawn from observations, marked as such. Every
  inference below is falsifiable by one observation, and §5 lists which.
- **Simulated** — demonstrated against the synthetic account in this directory.
  A simulation shows how the prototype behaves *given a response of that shape*.
  It is not evidence about any real response, and no statement below should be
  read as one.

Nothing in §§1.1–1.3 is a measurement of a live service. The prototype was never
pointed at one.

Nothing in this lane contacted a real account, an export, a browser profile, a
credential, a patient database, port 7717, or the previews on 7867/7868. Nothing
was installed, no account was created, no model was run, and no code was
committed.

---

## 1. What the research found

### 1.1 Two mechanisms, one of them documented

Every cell is **Observed** — a statement about published documentation and public
source, with one **Inferred** cell marked. None is a measurement of a live
service.

| | claude.ai web app | Compliance API |
| --- | --- | --- |
| Status | Undocumented, internal | Documented |
| Access as described | A signed-in browser session is what public exporters use. **This is not a determination that such use is permitted** — see `SOURCES.md` §13, which was deliberately not consulted | Anthropic's pages state these endpoints are available to Claude Enterprise organizations |
| Authentication | The session the browser already has | A Compliance Access Key with `read:compliance_user_data`, created in claude.ai |
| Inventory | `GET /api/organizations/{org}/chat_conversations` — **no pagination parameters appear in any public source** | `GET /v1/compliance/apps/chats` with `order_by`, `updated_at.*`, `limit`, `after_id`; response `data`, `has_more`, `first_id`, `last_id` |
| One conversation | `…/chat_conversations/{id}?tree=true&rendering_mode=messages&render_all_tools=true` → `chat_messages[]` with `sender` and `content[]` blocks | `…/chats/{id}/messages` → the chat's metadata plus `chat_messages[]` with `role: user\|assistant`, `content[]`, `files[]`, `generated_files[]`, `artifacts[]` |
| Message paging | No paging parameters appear in any public source; one published client calls the endpoint with none and comments that it returns everything | `after_id`, `limit` (max 1000), `order` |
| Fork links (`parent_message_uuid`) | Present in one probed archive shape; `tree=true` is the flag public source uses | **The documented message object does not list such a field.** Whether a live response carries one, or instead returns a pre-selected branch, or something else, is not established here |
| Message edit time | Present in one probed archive shape (`updated_at`) | **Not listed in the documented message object.** Same caveat as above |
| Artifact body | No endpoint found in any public source | `GET /v1/compliance/apps/artifacts/{version_id}/content` |
| Deleted chats | Not described by any public source | Documented: listed with `deleted_at`, returned without content |
| Rate limit | Not documented | Documented: 600 requests per minute per parent organization, shared across `/v1/compliance/*` |

Two rows deserve their own caution, because absence of evidence is being read too
easily as evidence of absence. **Inferred, low confidence:** that the web
endpoint has no pagination is an inference from published clients, not a
property of the endpoint — a source that omits a parameter does not show that the
parameter is refused, and a source that says "returns everything" may have been
written against a small account. **Inferred, not established:** that the
documented message object omits fork and edit-time fields says the *document* does
not list them; it does not show that a response cannot contain them, nor what
branch semantics a response would have if it selected one.

The individual-account route Anthropic documents is the email archive: Settings →
Privacy → Export data, a link that expires in 24 hours. That is the thing this
spike exists to avoid, and it is documented; whether a different route is
supported for an individual account is not something this lane can answer.

### 1.2 A revision-fidelity risk, demonstrated in simulation

**Observed.** One probed archive — the owner's, shape only, in
`docs/eval-reports/2026-09-22-claude-export-probe.md` — carries
`parent_message_uuid` on messages and a distinct `updated_at`. The importer's
`liveThread` follows those links back from the latest message, which is the
mechanism by which an abandoned edit is kept out of a note. **Observed:** the
documented Compliance message object does not list either field.

**What that does not establish.** It does not establish that a live Compliance
response omits fork links or edit times, and it certainly does not establish what
such a response would do with a branched conversation — a service that returns
"the thread as displayed" would be a different thing from one that returns a flat
array, and both are consistent with the document as written. Nothing here has
observed a Compliance response at all.

**Simulated.** Against the synthetic account, using a message object shaped like
the documented one, `test/importer-contract.test.mjs` shows the consequence: the
text and the ids come through unchanged, and the live thread the importer follows
is a different one — the abandoned edit and its reply are in it instead of the
edit she kept, with nothing in the file to say so. The prototype names the
condition (`no_fork_links_in_this_mechanism`) and refuses to call such a run
clean, which is the most that software can do about a field it has not been sent.
**This is a demonstration of a risk, not a measurement of the API.**

**Consequence for the coordinator, stated as a risk and not as a fact.** A
capture that must preserve which revision she kept has an *unverified* path
through the Compliance API. Until one response is observed, the safe reading is
that revision fidelity is established only for a capture that carries the links —
the archive shape, or whatever the web mechanism returns. A Compliance-API
capture should not be offered as the same artifact as an export-shaped one; if one
is taken, its manifest gap is the evidence the owner needs to see.

### 1.3 Artifacts: versioned where documented, unverified elsewhere

**Observed.** The Compliance API documents artifact references per message
(`id`, `version_id`, `title`, `artifact_type`), states that a revision is a new
`version_id` under the same `id`, and documents a content endpoint that takes a
`version_id` — never the stable `id`.

**Observed, weakly.** One probed archive carried no artifact field among its
conversation or message keys. That is a fact about that archive, and about that
archive only. It is **not** evidence that exports omit artifacts generally: the
probe sampled one file, the key set may differ by account, plan or export
version, and the shape may have changed since. No claim is made here about what
any export contains.

**Inferred, and marked as such in the code.** The web mechanism is *modelled* as
declaring artifacts on a conversation, because a capture that ignored them would
be silent about them; no public source documents the field's location, and none
documents an endpoint returning a body from the web app. A web capture therefore
reports what it saw as declared-and-not-captured. **Simulated:** the Compliance
path fetches both versions by `version_id` and the test asserts both texts
survive separately rather than collapsing to the latest.

**Consequence.** Artifacts are a bonus surface, not a fidelity requirement: the
importer ignores them either way, so a capture that declares them and one that
never saw them both reach the app's reader. What matters is that neither is
silent — hence the manifest entry, and hence the `requires_acknowledgement` gate.

---

## 2. What the prototype is

A dependency-free walker with one seam, `request(method, url) -> {status, json}`.
Everything above the seam — inventory, normalization, checkpointing, the verdict,
the manifest — is identical for a synthetic account and a real one, so a green
test run is evidence about the walk and about shape handling, and **not** about
claude.ai.

The walk is: inventory every page → fetch every declared conversation (paging
within a conversation where the mechanism allows it) → fetch every declared
artifact → one verdict. A checkpoint is written after every unit of work, with an
atomic replace and a digest of its own body, so a half-written or hand-edited
checkpoint stops the run instead of silently restarting from a half-state.

### The verdict

| Status | Meaning | May be handed to the import side? |
| --- | --- | --- |
| `complete` | Every declared conversation fetched, every declared artifact fetched, no message lost, no stall, no required key missing | Yes |
| `complete_with_gaps` | As above, but content exists that this mechanism cannot carry: an image or document block, an attachment's bytes, fork links on a mechanism without them, an inventory page that came back empty | Only with a person acknowledging the named gaps; the acknowledgement is recorded in the manifest |
| `partial` | Some conversations or artifacts could not be fetched | No |
| `blocked` | The inventory itself could not be completed — signed out, rate limited out, pagination stalled — so what was fetched is an unknown subset | No |

Every non-`complete` run carries at least one named failure, gap or missing id;
`test/resilience.test.mjs` asserts that an unqualified result with nothing to
explain it cannot be produced. A run that is not `complete` never offers a file,
and a `complete_with_gaps` run needs `allowGaps: true` at the handoff call, which
is a deliberate act with a record.

### Fidelity decisions, and what they cost

- **Text is the text blocks, joined by newlines — the same rule the production
  reader applies.** A `tool_use`, `tool_result`, `image` or `document` block is
  never folded into a note: it is counted, by type, in the manifest. Folding a
  tool result in would put words in a clinical record that no person wrote.
- **Timestamps are kept byte-for-byte**, including `null` and including a value
  that is not a date. The prototype tidies nothing; the importer's tolerance is
  exercised instead.
- **Attachment references are carried, their bytes are not.** The export carries
  extracted text for uploads; nothing in the importer reads it, and holding it in
  a message would make "text-exact" untrue. Every attachment says
  `content_captured: false`.
- **Extra keys the source sends are ignored**, which is tested: a reader that
  trips on a field it does not know is not a reader.
- **The output is the export shape and nothing else.** `conversations.json` is a
  top-level array of the export's own keys; the verdict lives in a sibling
  `extraction-manifest.json`, never in the file the Settings screen opens.

---

## 3. Evidence

All commands run from the repository root on 2026-09-27, Node v26.8.2,
Linux x86-64. No port was opened; no server was started; nothing was installed.

| # | Command | Exit | Result |
| --- | --- | --- | --- |
| 1 | `node --test scratch/claude-import-extraction/test/traversal.test.mjs scratch/claude-import-extraction/test/resilience.test.mjs scratch/claude-import-extraction/test/fidelity.test.mjs` | 0 | 59 tests, 59 pass, 0 fail |
| 2 | `node_modules/.bin/tsx --test scratch/claude-import-extraction/test/*.test.mjs` | 0 | 68 tests, 68 pass, 0 fail |
| 3 | `TZ=UTC node_modules/.bin/tsx --test scratch/claude-import-extraction/test/*.test.mjs` | 0 | 68 pass, 0 fail |
| 4 | `TZ=America/Mexico_City node_modules/.bin/tsx --test scratch/claude-import-extraction/test/*.test.mjs` | 0 | 68 pass, 0 fail |
| 5 | `TZ=Australia/Sydney node_modules/.bin/tsx --test scratch/claude-import-extraction/test/*.test.mjs` | 0 | 68 pass, 0 fail |
| 6 | `npx eslint scratch/claude-import-extraction` | 0 | clean |
| 7 | `npx prettier --check "scratch/claude-import-extraction/**/*.{mjs,md,json}"` | 0 | all files formatted |
| 8 | `npm run lint` (whole repository) | 1 | one error, in `scratch/claude-import-structure/tests/preservation.test.ts:40` — **the structure lane's directory, not this lane's**, and untouched here. This lane's own files lint clean (#6). |

The four time zones matter because the plan runs four: the capture holds instants
verbatim and never formats a local day, so a change in zone changes nothing.

### The synthetic account and its expectation

`fixtures/truth.mjs` specifies the account by hand: **16 conversations, 84
messages, 6 attachments, 2 artifact versions under 1 artifact, 4 non-text content
blocks** (one each of `tool_use`, `tool_result`, `document`, `image`). Among them:
a three-year history with an abandoned edit, a second conversation about the same
patient, two patients who share a first name and one of whom is mentioned in the
other's chat, a relative referred to by relationship, a recent chat about a
session from the year before, a multi-year-gap history, a single-sitting patient,
a non-clinical personal chat, a conversation with no messages, a conversation
whose messages are only scanned files, a message with no timestamp, a message
whose timestamp is not a date, a conversation straddling the cutoff day with an
exact six-hour gap and a six-hour-one-second gap, a thirty-message conversation
that pages, a chat deleted in the app, and a Spanish conversation.

`fixtures/expected.mjs` states what a correct capture must contain, written
through a different code path with its own serializer and its own digest. It also
states the counts as literals and recomputes them from the account, so a fixture
edit that forgets to update the expectation fails loudly
(`the stated expectation matches the account it describes`).

Two full walks, each compared against that expectation:

| Mechanism | Verdict | Conversations | Messages | Requests | Artifacts | File digest | Matches the independent expectation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `web-app` | `complete_with_gaps` | 15 (the deleted chat is not listed) | 84 | 21 | 2 declared, 0 captured | `sha256:7e1e4d7b372f721e9d8ea3b660f0a25380e0e108620631d634d69b4118e7e93f` | yes |
| `compliance-api` | `complete_with_gaps` | 16 (the deleted chat is listed, empty) | 84 | 27 | 2 declared, 2 captured | `sha256:714c5c5863dfabe2241147c2cbf4de9e874a27125f82752a351a8c69e2113df1` | yes |

Both gaps are named, and both are true: the web mechanism cannot fetch an
artifact body or carry an image block, and the documented mechanism cannot carry
fork links or edit times.

### Resilience, one line each

Rate limited with a `Retry-After` → waited exactly as long as the source asked,
then finished. Rate limited without → backoff doubled per attempt and capped
(100, 200, 250 ms in the test). Rate limited without end → `blocked`, nothing
fetched, nothing offered. Signed out (401, 403) on the inventory → `blocked` with
zero conversations, so an empty account is never read as a signed-out one. Signed
out on one conversation → `partial`, that conversation named, an
`auth_expired_during_detail` gap recorded. 500 → retried, then the capture is
byte-identical to an untroubled one. 404 on a conversation → `partial` with the
id and the code. Interrupted after three conversations → resumed from the
checkpoint, refetching only the remainder, landing on **byte-identical output**;
a run presented with a different identity starts over rather than inheriting
someone else's state. A conversation repeated across inventory pages → fetched
once, counted. A message repeated across pages → kept once, counted (19 in the
test). An empty page in a windowed inventory → survivable, and reported as a
hole, because rows it stood for were never shown. An empty page from a
cursor-based inventory → `blocked`: there is nowhere to go next. A cursor that
never advances → `blocked`. A page budget exhausted → `blocked`. A renamed
message key → `partial` with `missing_messages`, not a short file. A sender key
that moves → `partial`, with every dropped message counted (84 across 14
conversations; the two that have no messages have nothing to drop). A missing
conversation id → failure; a missing message id → gap. An optional field that
disappears (`account`) → the capture holds and the substitution is visible. An
unknown block type → counted by name, left in the file, and no text invented from
it. A corrupted checkpoint file → refused, not resumed.

### The contract with the importer that already exists

`test/importer-contract.test.mjs` writes the handoff file to a temporary
directory and opens it with **`server/src/import/claude.ts`, unmodified** — the
real reader, imported read-only through the repository's existing `tsx`. No
branch of mine, no production edit, no database, no port.

- The reader opens the capture: 13 of 16 conversations readable, 3 counted as
  unreadable (empty, deleted, and two messages that are only scanned files), 82
  messages read as record text.
- The live thread it follows is the eight-message thread the capture preserved;
  the abandoned pair is out of the thread and still in the file.
- A note body is **exactly** a captured message, and the provenance line names
  every message it came from.
- A dry run over the capture plans notes, and every message id any planned note
  cites exists in the capture — no invented source id.
- Replaying the same capture plans **zero** new notes and reports every session
  as already imported, keyed by message id.
- The capture is byte-identical before and after the importer has read it.

So: **the adapter needs no production change.** The file the capture writes is the
file `POST /api/import/claude` already accepts.

---

## 4. Criteria, one line each

Status words per `docs/v2/RUN-CONFIG.md` §4. Every PASS below is **Simulated**
— measured against the synthetic account, on a shape chosen to match published
documentation, never against a live service. None of them is evidence about what
an account would return. **Account-wide coverage — that a capture enumerates
everything in a real account, with nothing skipped, repeated or invisible — is
NOT RUN**, and no row below may be read as covering it.

| Criterion (plan §"Tests and acceptance criteria") | Status | Note |
| --- | --- | --- |
| **Complete capture** — inventory all pages, fetch every declared conversation, preserve ids/timestamps/revisions/active branch/exact text, compare against independently authored counts and hashes, make missing or unsupported content visible | **PASS** (offline) — **revised 2026-09-28**: D1 showed the "active branch" half was only proven for a response that carries links; a response without them is now reported as unknown fidelity and never `complete`. | 15/16 and 16/16 conversations, 84 messages each, per-conversation and whole-file digests equal to an independently written expectation; unsupported content counted by type; every non-`complete` run names its losses. Against a real account: **NOT RUN**. |
| **Resilience** — pagination, long histories, empty pages, duplicates, interrupted runs, expired login, rate limits, changed schema, partial failures; no unqualified success | **PASS** (offline) | Twenty-three tests; see the list above. Every case ends in a verdict, and only `complete` is handoffable. |
| **Identity and dates** — English and Spanish, shared first names, relatives, several chats per patient, a recent chat about an old session, multi-year gaps, cutoff and month-end boundaries, ambiguous dates, unrelated chats, one-session patients, zero cross-patient merges | **NOT RUN** (this is lane 2's criterion) | The *material* for it is in the fixture and captured intact, with parent links and exact instants; deciding who is who is the structure lane's work, not this lane's. |
| **Fidelity** — prefer original message/span references to generated bodies; separate existing notes from new drafts; validate references, chronology and coverage; flag uncertain versions; reject invented source ids; treat conversation text as untrusted data | **PASS** for the extraction half; **NOT RUN** for the import half | A note body is a verbatim span, ids are cited and all exist, and edits and forks survive the round trip in a shape that carries the fields. Whether a real mechanism's response carries them is the §1.2 risk, not a result. Prompt-injection resistance is not this lane's surface: nothing here interprets conversation text. |
| **Import handoff** — a proposal dry run without writing; existing duplicate/undo mechanisms; required adapter changes; deterministic ids and a testable dedupe plan | **PASS** for the dry run and the dedupe; **no adapter change required** | See §3. The idempotence test replays a capture and plans nothing new. Undo is the importer's existing one-click batch undo; this lane neither uses nor changes it. |
| **UX** — install, permission, sign-in, local pairing, preparation and confirmation documented separately; observed clicks only for an executed flow; no cookie copying, terminal, developer mode or pinning | **BLOCKED as specified**; clicks are **estimates** | No browser flow was executed *in this document's pass*, so there are no observed clicks. A 2026-09-28 browser run exists (research, developer mode, throwaway profile, synthetic content) and observes no therapist-facing flow, so the click estimate is still an estimate. Worse, the only install path without developer mode is a Chrome Web Store listing, and store publication is out of this phase — so a build satisfying "no developer mode" cannot be demonstrated yet. The design otherwise needs no cookie copying (the browser attaches the session to a same-origin request it would have made anyway), no terminal and no pairing step. Details and the ~13-click estimate are in `extension/NOTES.md`. |
| **Claude assistance** — distinguish a prompt/schema test from actual Claude account execution; no claim that chat search enumerates history | **NOT RUN** | Out of this lane entirely. No Anthropic account, model or API was used, and nothing here measures usage or completeness. |

---

## 5. Unverified assumptions

Each of these is a place where a green test run says nothing about the real
service. They are numbered so a reviewer can go after them one at a time, and each
names the observation that would settle it.

1. **Whether the web app's inventory paginates at all, and how.** No public
   source shows a parameter; one published client calls the endpoint with none
   and comments that it returns everything. That is thin evidence about a small
   account, and it is *not* evidence that the endpoint cannot return everything or
   that a parameter would be refused. All three behaviours are live options: no
   paging (the walk finishes in one page, and the manifest's
   `has_more_source: inferred_from_length` is the tell to look for), window
   paging (as modelled), or cursor paging (the walk's cursor guards still hold and
   the source adapter needs one function changed).
2. **The web app's conversation payload carries the fields modelled here**
   (`uuid`, `name`, `created_at`, `updated_at`, `account`, `chat_messages` with
   `sender`, `content[]`, `parent_message_uuid`). They come from a public exporter
   and from a shape probe of one archive; neither is a measurement of the live
   response, and a field present in a public client may have been added since.
3. **Artifact references sit on the web conversation payload, and no endpoint
   returns an artifact body from the web app.** Modelled, unverified, and marked
   as such in the code. A capture wrong here loses artifact bodies, and says so.
4. **A session established in claude.ai is usable from a content script running
   in that page.** This is the same-origin case, which is the ordinary one, but it
   has never been observed from outside a real session. It is also why the design
   does not depend on a cross-site request from an extension worker, where the
   cookie's `SameSite` attribute would decide the answer.
5. **Rate limits, timeouts and the real retry budget.** The Compliance API's 600
   rpm shared limit is documented; what the web app does is unknown. The walker's
   policy is documented in `src/walker.mjs` and its tests assert the policy, not
   the server's behaviour.
6. **A five-hundred-conversation account behaves like sixteen.** Nothing in the
   prototype depends on the count except the page budget, which is a limit and
   reports itself when reached.
7. **The Compliance API's shape is stable.** It is documented, and Anthropic
   documents the shape of `after_id` as changeable without notice. The walker's
   drift handling is what protects against that, and it is tested against renamed
   keys, moved senders and missing ids.
8. **Any of this is permitted.** Anthropic's terms were deliberately not
   consulted in this lane (`SOURCES.md` §13). Whether a tool that reads a
   signed-in session through undocumented endpoints is allowed is a decision for
   whoever owns it, and it is a precondition rather than a detail.
9. **The Chrome Web Store will accept an extension whose single purpose is
   exporting the user's own data from one named site, and whether a private
   listing is possible for a single owner.** Limited Use requires the data be
   necessary for the disclosed purpose and bans collection beyond it; browsing
   activity collection is permitted only where prominently described. The design
   is built to that rule (two permissions, no cookie access, no third party), but
   review is review.
10. **The click counts are estimates.** No browser was opened.

---

## 6. What was NOT RUN, and what it would take

| Not run | Why | What it would take |
| --- | --- | --- |
| Any request to a real Claude endpoint | No account, and this lane was not authorized to use one | An authorized **synthetic** account and session, and a browser |
| The web app's real inventory pagination, ids, artifact field and rate limits | Same | One observed capture against that account, with the manifest compared to the observation |
| Whether cookies ride a cross-site request from an extension worker | Same, and the design avoids depending on it | One observed request; nothing in the shipped design should be built on the answer |
| A Chrome Web Store review, and any store publication | Out of scope for this phase | A decision, then a submission |
| Anthropic's terms, and whether this is permitted | Deliberately not consulted here | A reading of the terms by whoever owns the decision |
| An extension loaded in a browser, at all | Nothing in this lane may execute against a signed-in session; no extension was built | A build, plus the account above |
| A capture of the owner's real export | Forbidden to this lane (HS-1) and not needed: the shape is already probed in `docs/eval-reports/2026-09-22-claude-export-probe.md` | Nothing in this lane |
| A proposal written into a real Apunta database | Out of scope; the dry run is in-process and writes nothing | A sandbox run through `scripts/v2/sandbox.mjs`, which is the coordinator's or a later card's call |
| Identity assignment, patient merges, and every other structure criterion | Lane 2 | Lane 2's results |

---

## 7. Recommendation

**Proceed with the extraction design; do not treat the account-side as solved.**

What is solid, and tested: the traversal, the two response shapes, the
checkpoint and resume, the digest equality against an independent expectation,
the failure taxonomy, the verdict gate, and the fact that the capture needs **no
production change** to reach the importer that already exists. The gap list is
short, named, and enforced.

What must not be claimed: that any of this has touched claude.ai, that the web
app's inventory behaves as modelled, that a real Compliance response lacks fork
links (only the documentation's silence is established), or that a Web Store
listing is available today. The criterion that said "no developer mode" cannot be met by anything built
this month, because the only compliant install path is a store listing and store
publication is out of this phase — that is a decision for the coordinator, not a
detail for a card.

Two risks deserve the coordinator's attention before anything else. Both are
stated as risks, because in each case what is established is the state of the
documentation and the state of a simulation — not the behaviour of a service.

1. **Revision fidelity through the Compliance API is unverified.** The documented
   message object does not list fork links or edit times, and the simulation shows
   what the importer does with a response that has none (§1.2). A response that
   carries them, or that returns a pre-selected branch with different semantics,
   would change the conclusion. If revision fidelity is required — and the
   importer is built around it — that has to be settled by one observed response
   before a Compliance capture is treated as an export substitute.
2. **No programmatic retrieval is documented for an individual account.** The
   documented individual route is the email archive, and the documented
   programmatic route is Enterprise-only. Anything built on top of the web app's
   internal endpoints therefore rests on undocumented behaviour and on a terms
   question this lane deliberately did not answer (`SOURCES.md` §13). That is a
   legitimate thing to decide to do, and it should be decided rather than
   assumed — and whatever is decided, no account-wide claim survives until a real
   trial measures it.

Shipping would additionally require the trial the plan already names: a real
synthetic-account browser trial proving account coverage, the permissions Chrome
actually grants, and the local transfer — followed by the independent review.
`extension/NOTES.md` lists what to observe, in the order that settles the most.

**One implementation pass and one targeted repair were used.** The repair was
made after the first green run, when the suite exposed a real defect: a resumed
capture emitted conversations it had already emitted, because the final pass and
the detail loop both pushed them. The second green run also corrected two
misclassifications found the same way — a page of unparseable messages was being
counted as a broken cursor, and an empty inventory page was being tolerated
without recording that rows had been skipped. The test that caught the first is
`an interrupted run resumes from its checkpoint and lands on the same bytes`.
