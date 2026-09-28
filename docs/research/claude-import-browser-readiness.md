# Claude direct import — browser readiness

**Lane:** 1 (extraction), second stage. **Date:** 2026-09-28.
**Subject:** D1 (branch provenance) and D15 (a loadable extension) from
`docs/research/claude-import-independent-review.md`, plus the browser-side
evidence for the trial that review recommended.
**Artifact:** `scratch/claude-import-extraction/extension/` (loadable, unpacked).
**Harness:** `scratch/claude-import-extraction/browser/check.mjs`.

**Corrections, 2026-09-28, after the acceptance review
(`claude-import-browser-review.md`).** The six corrections that review listed in
its §7 are applied in place below and are marked. The one that matters most:

> **RETRACTED.** "capture walked a synthetic account end to end" meant the *walk*
> ran end to end in a browser. It did **not** mean a user path existed: none of
> the 14 checks went through the popup, the relay or a download, and the live
> path was not wired. The relay has since been built and a real click-through run
> exists — see `claude-import-relay-results.md` — but the 14 checks below are
> still not a user path, and the readiness table's D15 row has been split to say
> so.

**Readiness: the offline and browser-side work is done and green. The
account-side is still unmeasured, and two decisions above it are still open.**
Concretely:

| | State |
| --- | --- |
| D1, branch provenance | **Fixed and tested.** A capture that cannot follow branches now says *unknown fidelity*, never *clean*, and never infers that the wrong branch was taken. |
| D15, loadable extension | **Built and loaded** (corrected 2026-09-28). Nine files, two permissions, unpacked into Chromium 152, content script running in the page's own world, the walk running and the file hashed in a real browser. **The walk is not the workflow**: the 14 checks below are CDP-injected function calls that never open the popup, never relay a message and never download a file, and the live path was not wired until the relay pass. |
| The popup → tab → page → file path | **Built and exercised by real clicks**, after the acceptance review found it unwired. 20 checks, a real popup button, a real relay, a real download whose digest was read back from disk. See `claude-import-relay-results.md`. |
| Incomplete capture passed off as complete | **Blocked in four places**, each with a test: no usable links, dangling links, a `200` carrying a sign-in page, a `200` carrying a DOM snapshot. |
| Pagination on a large account | **NOT RUN**, and eight planted conversations cannot stand in for it. |
| Anything about a real account | **NOT RUN.** No request was made to any Claude endpoint. |
| Therapist install without developer mode | **BLOCKED.** Needs a Chrome Web Store listing, which is a separate decision. |
| Whether any of this is permitted | **Unanswered.** Terms not consulted; unchanged from lane 1. |

---

## 1. What changed, in one pass and one repair

### Implementation pass

**D1 — branch provenance.** The review's finding was that a web capture whose
response carried no fork links was reported clean, after which the shipped
importer followed array order, spliced the abandoned edit into the note and
reported `abandoned: 0` — which reads as *nothing was lost*.

The fix applies the importer's own predicate — a link is usable when it names a
message that is also in the response — and records one of three states per
conversation:

| State | What it means | Verdict effect |
| --- | --- | --- |
| `links_present` (was `established`) | the mechanism carried ancestry — a **capability**, not a claim about this conversation | none on its own; other anomalies are named separately |
| `links_absent` (was `unknown`) | the response carried no usable link. **Not** evidence that there were no forks, and **not** evidence that the wrong branch was taken | gap `branch_fidelity_unknown`; never `complete` |
| `structurally_invalid` | the ancestry cannot be true: a cycle, a duplicate id, a self-reference, or an empty parent | gap `branch_structure_invalid`; never `complete` |
| unresolved | an unresolvable parent, or a root count other than one | gap `branch_ancestry_unresolved`; never `complete` |

Corrected 2026-09-28: whether a *conversation's* ancestry is complete is **not
knowable from the payload** — a capture that starts at message 40 of 200 looks
exactly like one that has all 200 — and one usable link establishes only the
mechanism capability. The capture never selects a branch, and the manifest says so
in a `branches` block on every run.

A one-message or empty conversation is not reported either way: nothing can be
branched, so there is nothing to be uncertain about. The compliance mechanism now
names the same gap in the same words, with the reason attached — the documented
message object does not list a parent link, which is a fact about the document
and not about a response.

**The reviewer's reproducer is preserved as a regression**, in
`test/branch-fidelity.test.mjs`, and it asserts the review's numbers: 2 abandoned
with links, 0 without, the abandoned reply inside the thread without. It also
asserts the sharper version the repair surfaced: a capture with *dangling* links
is just as unfollowable as one with no links, and reports `abandoned: 0` too.

**Format failures.** A body is classified before the status code is acted on, and
anything that is not the document we asked for is a named failure. The case that
matters is a `200 OK` carrying a sign-in page, a serialized DOM, a text error or
nothing: those parse, they succeed, and code that only checks the status code
files them as content. `unsupported_response_format` on the inventory blocks the
run with nothing captured; on one conversation it is `partial` with that
conversation named. The guard runs *before* the retry policy, so a sign-in page
is not mistaken for a transient error, while a real 5xx is still retried.

**D15 — a loadable extension.** The three files the manifest named and did not
have now exist, plus a popup and a mock, and the whole thing loads:

| File | Role |
| --- | --- |
| `manifest.json` | MV3, `storage` only, `https://claude.ai/*` and the loopback research host |
| `capture-core.js` | the walk, as a classic script (a page-world content script cannot `import`) |
| `inpage.js` | the page-world bootstrap: allow-listed transport, progress, save |
| `sw.js` | a relay and nothing else — the walk cannot live in a service worker |
| `panel.html` / `panel.js` / `panel.css` | the popup: mode, verdict, gaps, acknowledgement, save |
| `mock-account.js` | a synthetic account served from inside the extension |

`capture-core.js` is a second implementation of the same walk, and a second
implementation drifts. So `test/extension.test.mjs` evaluates **that file's own
text**, drives it against the same synthetic account as the reference walker, and
requires the same file digest, the same counts and the same gap codes. If the two
ever diverge, that test fails.

### The repair pass

Two defects, both found by the new tests rather than by reading the code:

1. **The service worker refused the loopback host.** `hostAllowed` compared
   against an origin string, so `http://127.0.0.1:7815/` — every loopback test
   host, which always has a port — was refused, and the browser check could never
   have run. It now parses the URL and compares hostnames: `claude.ai` on its
   default port only, loopback on any port, listed as a research affordance with
   a note to remove it before any distribution. A prefix match is what lets
   `https://claude.ai.evil.example/` through; parsing does not, and there are
   tests for both.
2. **A message naming itself counted as a link.** The importer's predicate skips
   `parent === id`; the new classifier did not, so a self-reference was reported
   as *dangling ancestry* rather than as *no ancestry*. Now skipped, and the
   branchable test (two or more messages) excludes conversations that cannot be
   branched.

Everything else that changed during the pass was a stale expectation in a test I
had written earlier, corrected in place: the documented mechanism's gap code was
renamed, a message count was miscounted by hand, and four browser-check
assertions described the fixture rather than the code.

---

## 2. Exact checks

All from the repository root, 2026-09-28, Node v26.8.2, Chromium
152.0.7977.82 (Arch), Linux x86-64. Nothing installed, nothing committed.

| # | Command | Exit | Result |
| --- | --- | --- | --- |
| 1 | `node --test scratch/claude-import-extraction/test/{traversal,resilience,fidelity,extension}.test.mjs` | 0 | 70 tests, 70 pass |
| 2 | `node_modules/.bin/tsx --test scratch/claude-import-extraction/test/*.test.mjs` | 0 | 96 tests, 96 pass |
| 3 | `TZ=UTC …`, `TZ=America/Mexico_City …`, `TZ=Australia/Sydney …` (as (2)) | 0 ×3 | 96 pass each |
| 4 | `npx eslint scratch/claude-import-extraction` | 0 | clean |
| 5 | `npx prettier --check "scratch/claude-import-extraction/**/*.{mjs,js,json,css,html,md}"` | 0 | all formatted |
| 6 | `node scratch/claude-import-extraction/browser/check.mjs <sandbox-run-folder> 7815 7816` | 0 | **14 checks, 14 pass** |

The browser run's exact preparation, which is the part that has to be right:

```sh
# a permitted sandbox port and a run folder, created by the repository's wrapper
RUNFOLDER=$(node scripts/v2/sandbox.mjs env --port 7815 \
  | grep -oP "(?<=APUNTA_DATA_DIR=')[^']+" | xargs dirname)
# 7816 is the CDP port; both are in the 7800-7889 range, and neither is
# 7717, 7867, 7868 or the 7890s
node scratch/claude-import-extraction/browser/check.mjs "$RUNFOLDER" 7815 7816
```

What the browser run does, and does not, touch:

- a **throwaway profile**: `--user-data-dir` inside the sandbox run folder, so no
  existing profile — and therefore no cookie, no history, no session — is in
  reach;
- **synthetic local content only**: a `node:http` server on loopback serving a
  page and an API shaped like the one the capture asks for, all of it invented;
- the browser is launched with background networking, sync, component updates and
  the password store off, and with `--disable-extensions-except` so only this
  extension is active;
- **developer mode is used**, which is authorized here for research and is *not*
  an install path for a therapist.

The 14 checks, in the order they run:

**Scope of these 14 checks, stated where a reader will find it (added
2026-09-28).** They are **CDP-injected function calls**: the harness constructs a
transport and invokes the capture itself. None of them opens the popup, calls
`chrome.runtime.sendMessage`, calls `chrome.tabs.sendMessage`, observes a
`window.postMessage`, or triggers a download. They establish that the *walk*
works in a real browser, the page-world script injects, the same-origin path
works, and the format and branch guards fire — and **not** that a person can press
a button. The user path is a separate harness,
`browser/roundtrip.mjs`, with its own results in
`claude-import-relay-results.md`. At the time these 14 ran, the live path was
known **not to be wired** (the acceptance review's F1–F3); that is fixed now, and
the table below is unchanged as evidence of what it checked.

| # | Check | What it would catch |
| --- | --- | --- |
| 1 | browser starts on a throwaway profile | a harness that quietly used a real profile |
| 2 | the extension's service worker is registered | a manifest that does not load |
| 3 | `ApuntaCaptureInPage` is an object in the page's own world | a content script that did not inject, or injected into the isolated world where the same-origin argument does not hold |
| 4 | a same-origin request from the page reaches the synthetic API | the assumption the whole design is built on |
| 5 | the capture walks the synthetic account (3 conversations, 5 messages) | a walk that does not traverse |
| 6 | the capture is not reported complete and is not handed over | D1's failure in its original form |
| 7 | a conversation with no links is flagged `branch_fidelity_unknown` | D1, in a real browser |
| 8 | the file is hashed in the page (`sha256:…`) | a capture whose evidence is not evidence |
| 9 | a sign-in page served with `200` → `partial`, 0 captured, not handoffable | a session expiry filed as a capture |
| 10 | a DOM snapshot served with `200` → same | a format change filed as a capture |
| 11 | the extension has an id the popup can be opened at | a prototype that only half loads |
| 12 | the popup loads the core and the mock, and **not** the page-world script | a file in the wrong world |
| 13 | the built-in mock runs in the browser with no network | a prototype that only works with an account |
| 14 | no cookie is set or read on the synthetic origin | the credential rule, checked rather than asserted |

The offline suite adds, beyond the browser:

- the extension's digest equals the reference walk's digest equals the
  independently authored expectation's digest;
- the allow-list refuses six path shapes **before** a request exists, and a
  query key that is not a name is refused;
- the extension source contains no cookie access, no `eval`, no `Function`, no
  dynamic `import`, no `XMLHttpRequest`, no `WebSocket`, and no host outside
  loopback and the one named account host;
- the service worker holds no capture, parses no JSON, and cannot widen its own
  allow-list at runtime;
- a host with no `SubtleCrypto` gets `digest_algorithm: "none"` rather than a
  digest that looks real;
- `save()` refuses a capture with gaps that nobody acknowledged, in the last place
  that can refuse.

---

## 3. Corrections to the trial protocol, recorded here because they change what a
trial result means

The owner's corrections, applied to the plan in the review rather than to code.
Each one changes how a result must be read.

1. **A fraction of dated sittings does not settle the session-date question.**
   The review's stop rule proposed: if the trial finds that few sittings state a
   date, do not build the structure lane. That statistic is a property of the
   *account used*, and an eight-conversation planted account is authored by us —
   we decide how many of its messages carry a date, so the number measures our
   fixture. It cannot establish how often this therapist states a date, and it
   must not be used to retire the actual-session-date requirement. What the trial
   can do is run **absent-date and explicit-date as two separate scenarios** and
   report what each one does to the import: with no date in the text, the
   requirement is unmet and the record says *recorded, not asserted*; with an
   explicit date, it is met for that sitting and not for the others. Both are
   legitimate outcomes to measure. The requirement stands until it is decided by
   the owner, not by a statistic from a fixture we wrote.
2. **Eight conversations cannot demonstrate pagination.** They cannot show that a
   five-hundred-conversation account is enumerated once, that a window moves
   correctly, or that a cursor does not skip or repeat at page forty. The
   browser run above covers **three** conversations and proves nothing about
   pagination on a large account; the manifest's `inventory_pages` is the field
   to read, and `conversations_declared` is the count to compare against the
   account. Account-wide coverage remains **NOT RUN**, and a clean run on a small
   account is not partial evidence for it.
3. **A simulated timestamp edit is not a live test.** A fixture that removes a
   per-message `updated_at`, or that returns a message stamped after its parent,
   exercises the *classifier*. It does not observe whether the service ever sends
   such a thing, and it must never be reported as though it had. The format and
   link tests in this document are of that kind and are labelled as simulations
   everywhere they appear.

---

## 4. Remaining NOT RUN

| Not run | Why | What it would take |
| --- | --- | --- |
| Any request to a real Claude endpoint | No account; this lane was not authorized to use one | An authorized synthetic account and a session |
| Whether the web inventory paginates, and how | Same | One observed request; the walk already handles no-paging, window paging and cursor paging |
| Whether a live response carries fork links or edit times | Same. **D1 now makes the answer recordable** instead of invisible | One observed response per fork case |
| Whether the session rides a same-origin request from a page-world script | Same | One observed request against a real signed-in page — and the browser run above deliberately did **not** attempt it |
| An artifact body from the web app | Same | One observed request |
| Real rate limits and page sizes | Same | Observed `429`s, or the absence of them |
| Pagination over hundreds of conversations | Needs a large account | An account of that size, or a source that paginates earlier |
| Whether a Blob download from a page world survives MV3 CSP | Needs a real download | One download in a real profile, which the run above did not perform: it saved nothing |
| A Chrome Web Store review, and any store publication | Out of phase | A decision, then a submission |
| Anthropic's terms, and whether any of this is permitted | Deliberately not consulted (`SOURCES.md` §13) | A decision by whoever owns it |
| Anything with lane 2 in the loop | Out of scope for this lane | Lane 2's results and a contract decision |
| A capture written to a patient database | Out of scope; the dry run is in-process | A sandbox run through `scripts/v2/sandbox.mjs`, which is a card's call |

---

## 5. Out of scope, and deliberately untouched

Recorded so nobody has to re-derive that these were considered and left alone.

| Defect | Where it lives | Why untouched |
| --- | --- | --- |
| **D10** — the shipped importer qualifies per conversation, so a qualifying patient's older chat is skipped as `before_cutoff` with no patient name on the skip row | `server/src/import/claude.ts` (production) | Production. It is a one-function change in `planImport` and the coordinator's to author |
| **D11** — `activeSince` resolves the *process* timezone, so the same bytes import differently in three zones | `shared/src/common.ts` (production) | Production. Needs a practice timezone on `ImportOptions` |
| **D16** — `DEFAULT_IMPORT_CUTOFF` is a fixed literal; and the compliance normalizer substitutes `organization_uuid` for `account.uuid` | production / this lane | The first is production. The second is mitigated by a named drift marker, is documented in `SOURCES.md`, and is not read by anything today |
| **D2, D3, D4, D5, D6, D7, D8, D9, D13, D14** | the structure lane's prototype and the seam | Not this lane. D7/D8/D9 are contract decisions, not adapter work |
| **D12** — no test in `scratch/` is in the repository's test surface | the repository's `vitest.config.ts` | Would need a change to a shared config, which is a coordinator's call, not a lane's |
| D16's second half is the only lane-1 item above | this lane | Left as-is: the fix is to *stop substituting*, which would break the export shape, so it stays a documented marker |

### Known gaps in the prototype, recorded so a later card does not rediscover them

Added 2026-09-28. The first three were found by the acceptance review in a
browser and are **fixed** by the relay pass (`claude-import-relay-results.md`); the
two properties are inherent to the design and remain.

| Was | State now |
| --- | --- |
| F1 — no receiver in the page world, so nothing could drive the capture from the popup | Fixed. `bridge.js` in the ISOLATED world relays a bounded, correlated, validated message set in both directions |
| F2 — the popup named no tab, and `sw.js`'s `hostAllowed(sender.url) || message.tabId === undefined ? null : message.tabId` parsed as `(a \|\| b) ? null : message.tabId`, so an allowed host produced `null` and "no eligible tab" either way | Fixed. The worker queries, validates, proves a receiver by pinging it, and reports `no_eligible_tab` and `no_listener` as different answers |
| F3 — `postMessage` progress and verdicts were emitted and nothing consumed them | Fixed. The bridge consumes them, correlates by request id, validates the report, and the popup renders the verdict |
| Page-world tamperability: page script shares globals with the capture, can replace `ApuntaCaptureInPage`, forge a verdict and read the capture bytes | **Inherent, and the price of the design.** The same-origin argument requires the walk to run in the page's world, which requires trusting the host. The bridge's origin and correlation checks are hygiene, *not* a security boundary — a page on the right origin can forge anything a page on the right origin may send. The real boundary is the account host, which is a distribution decision this prototype does not make. Two sharper consequences: an origin check is weaker inside a same-origin iframe, and every loopback page receives the script because the manifest lists the loopback host for research |
| A Blob download from a page world | Mechanism works (the acceptance review, then the relay pass). The **distribution** path — store-installed, from `claude.ai` — remains NOT RUN |

---

## 6. Blockers above the next step

1. **Distribution.** A therapist cannot install this without developer mode until
   a store listing exists. That is a decision, not a card.
2. **Permission.** Nobody has established that reading a signed-in session through
   undocumented endpoints is allowed. Every offline and browser result here is
   conditional on that question being answered, and it has not been.
3. **The one measurement that matters, restated (corrected 2026-09-28).** A
   single observed response from the real inventory endpoint **records what that
   response carried**: the conversation payload shape, and whether fork links and
   edit times were present. That is now reportable by name, and it is the most
   valuable thing the trial can produce.

   It does **not** settle pagination. "The response came back whole and carried no
   `has_more`" is consistent with no pagination, with a threshold above that
   account's size, and with a source that omits the field it uses; a threshold is
   not reachable by growing a synthetic account to a size a researcher can type.
   Nor does it generalise from one response to responses in general, or from one
   mechanism to another — the Compliance API documents no parent link at all. This
   paragraph previously claimed the opposite and contradicted §3.2 twelve lines
   below; that clause is withdrawn, and §3.2 stands.
4. **Store review.** Not attempted, and not predictable from here. An extension
   that reads a signed-in session is exactly the shape a reviewer will look at
   closely, and the Limited Use disclosure is a real piece of work.
