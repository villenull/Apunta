# Claude direct import — relay pass results

**Lane:** 1 (extraction), third stage. **Date:** 2026-09-28.
**Subject:** the six findings in `docs/research/claude-import-browser-review.md` §4
(F1–F4 and the `sw.js` precedence bug), the ancestry hardening in its §6, and
the popup → relay → page-world → file path it found missing.
**Artifact:** `scratch/claude-import-extraction/extension/` — now nine files, two
permissions, loadable unpacked.
**Harnesses:** `browser/roundtrip.mjs` (the user path, by real clicks) and
`browser/check.mjs` (the earlier walk-in-a-browser checks, unchanged).

**Verdict: the relay is built, the user path runs by pressing a button, and the
file the browser wrote to disk hashes to the digest the popup displayed.** The
account-side is exactly as unmeasured as it was, and the reviewer's refusal of
the "one response settles pagination" clause is upheld rather than argued with.

| | |
| --- | --- |
| F1, no receiver in the page world | **Fixed.** An ISOLATED-world `bridge.js` relays a bounded, correlated, validated set in both directions |
| F2, popup named no tab; `sw.js` precedence bug | **Fixed.** The worker queries, validates, proves a receiver, and distinguishes `no_eligible_tab` from `no_listener` |
| F3, `postMessage` emitted and never consumed | **Fixed.** The bridge consumes, correlates, validates, and the popup renders |
| F4, the popup's offline path and its gate | **Still holds**, and now also holds on the live path |
| §6 ancestry hardening | **Done.** Thirteen shapes classified conservatively; nothing is reported as more than it is |
| The user path, by real clicks | **Exercised.** 20 checks, a real Start click, a real download read back from disk |
| Two popup defects the harness found | **Fixed** in the one repair pass: the manifest button was never enabled, and failures were counted rather than listed |
| Real account, pagination, permission, store review | **NOT RUN.** Unchanged, and now measured by nobody |

**Retraction, restated once more because it is the kind of thing that gets quoted
out of context:** the previous document's "capture walked a synthetic account end
to end" was true of the *walk* and false of the *workflow*. It has been corrected
in place, in `claude-import-browser-readiness.md`, and the fourteen checks it
referred to are now labelled as CDP-injected function calls next to the table that
lists them.

---

## 1. What was built

### The bridge

`extension/bridge.js`, an ISOLATED-world content script, is the only file that has
both `chrome.*` and the page's messages. The page world has no `chrome` — that is
F1, and it is why nothing could reach it. The bridge exists to carry a **closed set**
of messages, and nothing else crosses:

| Direction | Message | Fields |
| --- | --- | --- |
| worker → bridge → page | `apunta-capture-start` | `requestId`, `mode`, `organizationId` |
| page → bridge → worker → popup | `apunta-capture-progress` | `requestId`, `progress.stage` |
| page → bridge → worker → popup | `apunta-capture-finished` | `requestId`, `bytes`, `manifest`, `report` |

Three properties, each with tests:

- **Correlation.** Every press mints a UUID; the popup renders only a report whose
  `requestId` matches the press it is waiting for, the bridge forwards only a
  request id it issued, and one request may finish exactly once.
- **Validation.** A message is accepted only if its origin is *this frame's own
  origin*, its kind is one of the two, its request id is pending, and its payload
  matches a field-by-field validator — the status is one of four, the counts are
  bounded non-negative integers, the gap and failure codes look like codes, the
  digest looks like a digest, the byte count is in range, and `branches.
  capture_selects_a_branch` is `false`. Everything else is dropped and recorded by
  name: `origin_not_this_frame`, `request_id_not_pending`, `already_finished`,
  `status_not_in_enum`, `capture_claims_to_select_a_branch`, and eleven more.
- **No proxy, no code path.** A page message cannot name a URL, a path, a method,
  a permission or a mode of its own. The bridge builds its own outgoing object
  from seven fields, so an extra field has nowhere to survive. The page world runs
  with *its own* transport, whose allow-list the walk must go through.

### What was measured about `event.source`, corrected

An earlier draft of this document claimed, in three places, that
`event.source === window` "is not usable between worlds" because the ISOLATED and
MAIN worlds do not share a `window` identity. **That claim was wrong, and it has
been removed from all three.** What is actually observed:

- **A MAIN-world message does arrive in the ISOLATED-world listener, and
  `event.source` can be compared across the two worlds.** The page world
  (`inpage.js`) filters on `event.source !== scope`, and the capture demonstrably
  starts, completes and writes a digest-matching file through real clicks — if the
  comparison could not work, nothing would ever capture. The check is kept, and
  `test/relay.test.mjs` now pins down what it buys: a message from **this window**
  is acted on, a message from **another frame** is ignored.
- **The bridge does not use `event.source` at all**, and that is a choice rather
  than a workaround. It checks `event.origin` against *this frame's own origin*,
  which is stricter than a host list — a page served from any other origin is
  refused whatever it is — and does not depend on which object the browser hands
  back as the source. A test asserts the bridge contains no `event.source`.
- **Neither check can tell the bridge from page script.** Both are this window,
  both post with the frame as source, and a page on the right origin can forge
  anything the bridge would accept. That is the host-trust property below, not a
  defect in either check, and a test states the limit so it cannot be quietly
  upgraded into a security property later.

The design decision the wrong claim was reaching for is unchanged and still
sound: the bridge checks the frame's own origin rather than a list of hosts.

### Tab resolution

The popup no longer names a tab, because it should not choose one. The worker
queries the current window, keeps candidates that are on the allow-list, are not
discarded, and are not privileged pages, prefers the active one, and then
**proves a receiver exists** by pinging it. A candidate that qualifies but has no
listener is recorded and the next one is tried; when none answers, the popup gets
`no_eligible_tab` or `no_listener` — two different messages, because they have two
different causes and two different fixes. The old expression is gone, and a
regression asserts its absence by name.

### The popup

It mints a request id, renders progress and a verdict only for that id, lists gaps
**and failures** by name, requires the acknowledgement before Save, and offers the
manifest alongside the capture. `mode` is `mock` or `live` and nothing else; a
foreign sender is refused; the organization id is pattern-checked.

### Ancestry, hardened

The second review's §6 was right that `established` did more work than it could
support, and the thirteen shapes it listed are now classified by one conservative
rule. The two claims are kept apart, everywhere, in every shape:

| | |
| --- | --- |
| `mechanism_carries_ancestry` | did this mechanism carry ancestry at all? One usable link anywhere answers that, and it is what separates a mechanism returning the flat visible path from one that can express a fork |
| `conversation_ancestry_complete` | **always `null`.** Not knowable from the payload: a capture that starts at message 40 of 200 is indistinguishable from one that has all 200 |

`fidelity` is `links_absent`, `links_present` or `structurally_invalid`, and gaps
are named for what is wrong rather than for what is reassuring: `dangling > 0` or
`roots !== 1` gives `branch_ancestry_unresolved`; a cycle, a duplicate id, a
self-reference or an empty parent gives `branch_structure_invalid`; no usable link
gives `branch_fidelity_unknown`. **The capture never selects a branch** — that is
the importer's job, from links — and every run's manifest carries a `branches`
block saying so, with the reason.

The empty-string parent is now counted as no link at all, which was the cheapest
of the review's five items and the most plausible real shape. Duplicate ids are
flagged rather than reconciled; the structure lane refuses them outright, and
reconciling the two is a decision, not a fix.

---

## 2. Exact checks

From the repository root, 2026-09-28, under the pinned **Node v24.19.0**
(`~/.local/share/apunta-node/node-v24.19.0-linux-x64/bin`), Chromium
152.0.7977.82, Linux x86-64. Nothing installed, nothing committed, no production
file touched.

| # | Command | Exit | Result |
| --- | --- | --- | --- |
| 1 | `node --test scratch/claude-import-extraction/test/{traversal,resilience,fidelity,extension,relay}.test.mjs` | 0 | **90 tests, 90 pass** |
| 2 | `node_modules/.bin/tsx --test scratch/claude-import-extraction/test/*.test.mjs` | 0 | **116 tests, 116 pass** |
| 3 | as (2) with `TZ=UTC` / `America/Mexico_City` / `Australia/Sydney` / `America/Denver` | 0 ×4 | 116 pass each |
| 4 | `npx eslint scratch/claude-import-extraction` | 0 | clean |
| 5 | `npx prettier --check "scratch/claude-import-extraction/**/*.{mjs,js,json,css,html,md}"` | 0 | all formatted |
| 6 | `npm run lint` (whole repository) | 0 | clean, `TOTAL 0` UI literals |
| 7 | `RUNFOLDER=$(node scripts/v2/sandbox.mjs env --port 7815 …)` then `node scratch/claude-import-extraction/browser/roundtrip.mjs "$RUNFOLDER" 7815 7816` | 0 | **20 checks, 20 pass** |
| 8 | `node scratch/claude-import-extraction/browser/check.mjs "$RUNFOLDER" 7815 7816` | 0 on 6 of 6 runs | 14 checks, 14 pass each — the earlier harness, unchanged. **Qualified:** the acceptance review saw 11/2 once in eight runs, and it has not reproduced in six runs here. The flake is **unlocated**; see §7. |

Browser runs used a fresh `mkdtemp` profile inside the sandbox run folder
`/tmp/apunta-v2/2026-09-28T14-31-27-425Z-bac861ad`, loopback ports 7815 and 7816,
background networking and sync off, and `--disable-extensions-except` so only this
extension was active. The roundtrip's profile is removed at the end; its
**downloaded files stay**, because they are the evidence.

### The 20 user-path checks

Measured, not injected: the harness opens the real popup, locates a control's box,
scrolls it into view and dispatches a real mouse press and release at its centre.
It never calls the capture, never builds a transport, and never shortcuts the
relay; the only thing it evaluates in the page is a *hostile* message, which is the
threat model rather than a shortcut.

| # | Check | What it establishes |
| --- | --- | --- |
| 1 | browser starts on a throwaway profile | no real profile was in reach |
| 2 | the extension loaded | the manifest loads, both worlds included |
| 3 | the page carries no capture of its own; the extension supplied it | zero `<script>` tags, no capture text in the document, and `ApuntaCaptureInPage` present — so the page is not a party to the capture |
| 4 | the popup starts with nothing captured and Save disabled | nothing is offered before a capture |
| 5 | **pressing Start finished a capture** | the button reaches the page world, through the relay |
| 6 | the popup shows the verdict the page produced | the report came back, not the harness's copy |
| 7 | the capture walked the synthetic account (3 conversations, 5 messages) | the traversal works through the real path |
| 8 | the flat conversation is named as a gap in the popup | D1, visible to a user, with the counts in the detail |
| 9 | Save is disabled until the gaps are acknowledged | the gate holds on the live path, not only the offline one |
| 10 | a forged page message does not change the popup's verdict | a page cannot move the UI to a clean verdict |
| 11 | acknowledging the gaps enables Save | the acknowledgement is a real act, by a real click |
| 12 | **Save wrote a file to disk** | the download happened, in the browser, with no fallback |
| 13 | the manifest button is enabled once there is a verdict | regression for the defect the harness found |
| 14 | the file on disk is the export shape, with every conversation | 3 conversations, 5 messages, read back from the filesystem |
| 15 | **the file's digest is the one the popup showed** | `sha256:8864f05e…` both places — the file is the capture |
| 16 | the downloaded manifest names the branch gap | the evidence file carries the verdict, not just the data |
| 17 | the capture claims no branch selection and no complete ancestry | the `branches` block survived the round trip into the file |
| 18 | with no eligible tab the popup says so, in its own words | the resolution failure is legible: "No eligible tab. Open a signed-in claude.ai tab…" |
| 19 | a qualifying tab with no listener is a distinct answer, covered offline only | stated as a limit, not faked — see below |
| 20 | a conversation answered with a sign-in page makes the run partial, is named, and blocks Save | the format guard, end to end, through the relay |

**Check 19 is a limit, not a pass.** Every document the manifest matches receives
the bridge, so a qualifying-but-silent tab cannot be posed in this configuration.
The path is covered offline instead, where a tab with no receiver is posed
directly against the worker, and the two answers are asserted distinct. The
browser check asserts only that the limit is stated.

The saved file's digest is worth reading twice: `sha256:8864f05e7eb93d1a0558c3171d3b813b57d077be88dd59b3de00870515f60a8e`
for the synthetic roundtrip account, which is a *different* number from the
offline fixture's, and that is the point — the digest is of the bytes that account
produced, and nothing hard-codes it.

---

## 3. What the page world can and cannot be trusted to do

Recorded because it is easy to read the checks above as a security boundary, and
they are not.

**A page can replace the capture, forge a verdict, and read the capture bytes.**
The capture runs in the page's own world, so it shares globals with page script.
That is the price of the same-origin argument: the whole design exists so the walk
issues requests the page could issue itself, with the session attached the way it
would be for the page. The alternative — the extension's own world — reintroduces
the unobserved cookie attribute the design exists to avoid.

So the bridge's origin check, its request correlation and its report validation are
**hygiene, not containment**:

- a page on the *right* origin can forge any report the bridge would accept;
- an origin check is weaker inside a same-origin iframe, where a frame's origin
  equals the parent's;
- every loopback page receives both scripts, because the manifest lists the loopback
  host for research, and that entry is marked for removal before any distribution.

What the checks *do* buy, precisely: they stop a message from another frame or
origin, a stale or duplicated request, a report that does not match the shape it
claims, a sender that is not the extension, and a smuggled URL, permission or code
string. They do not stop a determined page, and nothing in the extension should be
described as though they do. The real boundary is the account host, and choosing to
trust it is a distribution decision this prototype does not make.

---

## 4. The one repair pass

The harness found two defects in the popup that no offline test could have:

1. **The manifest button was never enabled.** It shipped with `disabled` in the
   HTML and nothing ever cleared it, so the evidence file — the one that says what
   the capture cost — could not be saved by a person at all. The relay pass could
   still have read the report from the DOM and passed; the roundtrip could not,
   and did not, until it was fixed. There is now a check for it (13).
2. **Failures were counted but not listed.** A conversation refused for a
   non-JSON `200` appeared in the popup as a number in a heading, and a user
   pressing Save would have seen `complete_with_gaps` with no idea that anything
   had been refused. The popup now lists each failure with its code and the
   conversation it names, and check 20 asserts the sign-in-page case is named.

Both are the same class — *the popup did not show what the capture found* — which
is why they are one repair rather than two. Everything else corrected during this
pass was a stale expectation in a test I had written earlier, fixed in place.

---

## 5. Remaining NOT RUN

| Not run | Note |
| --- | --- |
| Any request to a real Claude endpoint | Unchanged. No account exists yet |
| Whether the web inventory paginates, and how | Unchanged, and **narrower than one observation could ever show**: a response that came back whole is consistent with no pagination, with a threshold above that account's size, and with a source that omits the field. The readiness document's contrary clause is withdrawn in place |
| Whether a live response carries fork links or edit times | Unchanged. D1 and the relay pass make the answer *recordable* rather than invisible, which is the whole gain here |
| Whether the session rides a same-origin request from a page world | Unchanged. Every browser run in this pass pointed at loopback with a fabricated account, and no attempt was made against a real signed-in page |
| An artifact body from the web app; real rate limits | Unchanged |
| Account-wide coverage | Unchanged. Three synthetic conversations are not partial evidence, and the eight planted chats of the trial protocol are not either |
| A **store-installed** download from `claude.ai` | Mechanism works — page world and extension page both saved, the second review verified the first, and the roundtrip verified the second by reading the file off disk. The distribution path is NOT RUN: a real origin, the page's own CSP, Chrome's download policy, and whether review keeps permitting the pattern |
| Chrome Web Store review and publication | Unchanged. Out of phase; still a decision |
| Anthropic's terms, and whether any of this is permitted | Unchanged. Not consulted by any lane or any review |
| A same-origin iframe as the hostile case | Not posed. Named above as a limit rather than tested |
| A qualifying tab with no listener, in a browser | Not poseable in this configuration; covered offline, stated in check 19 |
| Anything with lane 2 in the loop | Unchanged |
| Production D10, D11, D16 and the structure lane's defects | Unchanged and untouched. `server/`, `web/`, `shared/` and `installer/` have no edits from this pass |

---

## 6a. Correction pass, 2026-09-28 (after the relay acceptance review)

Three items: two fixed, one unreproduced and left open rather than explained
away. Pinned Node v24.19.0 throughout, and only `scratch/claude-import-extraction`
and this lane's own documents were touched.

### B1 — progress was forwarded once per request. Fixed, with a test.

`bridge.js` collapsed progress with `if (state.lastProgress === requestId) return`,
which forwards the **first** update and drops every later one — the opposite of
what its own comment claimed, and it would have frozen the popup's progress line
for the whole of a long capture, which is the case the service-worker design
exists to survive.

The rule now: **the newest update wins a turn, and a turn boundary flushes it.**
Five updates in one turn forward the fifth. A walk that reports every few seconds
forwards each of them. A verdict overtakes progress still queued for the same
request, and progress arriving after a verdict is dropped and recorded as
`progress_after_completion`. A progress message for a request id nobody issued, or
for a foreign one, is still ignored.

Four tests, and the first one is the one the old code failed: five sequential
updates assert nothing is forwarded before the turn ends, exactly one after, and
that it is the fifth. Then a slow walk, stale and foreign ids, and
no-updates-after-completion (both after a verdict and in the same turn as one).
The flush uses a resolved promise rather than `queueMicrotask`, because
`queueMicrotask` is not present in every context this file is evaluated in and one
fewer environment assumption is worth more than the spelling.

### B2 — the `event.source` claim was wrong, and is corrected in all three places

Corrected above in §1, in `bridge.js`'s header, and in `extension/NOTES.md`. The
substance: `event.source` **is** comparable across the two worlds, the page world
depends on it, and the bridge's not using it is a choice — origin against the
frame's own origin, which is stricter than a host list. Two new tests keep it
honest: one pins that the page world acts on **this window** and ignores **another
frame** (the distinction the check actually buys), and one asserts the check is
still in `inpage.js` and that `bridge.js` still contains no `event.source`, so the
claim cannot be quietly deleted or quietly upgraded into a security property.

### R3 — `check.mjs` did not reproduce; the flake is unlocated

The review saw `11 passed, 2 failed` once in eight runs and did not capture which
two. **Six consecutive runs here: 14/14, exit 0, every one.** No cause is
asserted, because none was found and the reviewer's failing run left no
per-check output to read. Two things are true and worth keeping:

- the harness prints `PASS`/`FAIL` per check, so a future failure is diagnosable
  from the output of the run that produced it;
- the run folder's `browser-checks.json` is **overwritten** by each run, so a
  failure is only diagnosable if the run that failed is the last one. That is a
  real limitation of the evidence, recorded rather than fixed, and the fix — a
  timestamped filename per run — is a one-line change for whoever wants it.

**Unresolved:** the flake. Not caused by this pass, not fixed by it, and not
explained.

### Exact commands and exits for this pass

```sh
export PATH=~/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH

node --test scratch/claude-import-extraction/test/relay.test.mjs \
             scratch/claude-import-extraction/test/extension.test.mjs
# exit 0 — 37 tests, 37 pass   (26 relay, 11 extension)

node_modules/.bin/tsx --test scratch/claude-import-extraction/test/branch-fidelity.test.mjs
# exit 0 — 17 tests, 17 pass

npx eslint scratch/claude-import-extraction; echo $?
# exit 0

npx prettier --check "scratch/claude-import-extraction/**/*.{mjs,js,json,css,html,md}" \
  docs/research/claude-import-relay-results.md; echo $?
# exit 0

RUNFOLDER=$(node scripts/v2/sandbox.mjs env --port 7830 \
  | grep -oP "(?<=APUNTA_DATA_DIR=')[^']+" | xargs dirname)
# /tmp/apunta-v2/2026-09-28T14-48-01-081Z-971269e9 ; ports 7830 (HTTP) and 7831
# (CDP), both free, both in 7800-7889, neither 7717 / 7867 / 7868 / 7890s

node scratch/claude-import-extraction/browser/roundtrip.mjs "$RUNFOLDER" 7830 7831
# exit 0 — 20 checks, 20 pass

for i in 1 2 3 4 5 6; do
  node scratch/claude-import-extraction/browser/check.mjs "$RUNFOLDER" 7830 7831
done
# exit 0 on all six — 14 checks, 14 pass each
```

No production file, no store artefact, no live account, no inference, no
dependency, no commit, and no further agent.

---

## 6b. What this changes for the next step

The smallest remaining piece of work before a live trial is gone. What is in
place, and was not a fortnight ago:

- the walk, with a conservative verdict that cannot be talked past;
- a loadable extension whose capture, guard and gate are proven to agree with the
  reference implementation, digest for digest;
- a relay a person drives with a button, whose file lands on disk and matches the
  digest the popup showed;
- a page world that cannot hand the popup a verdict it did not receive from a
  capture.

What is still missing is not code. It is four measurements and three decisions:
the account's real shape (one observed response, and a *large* account for
pagination), whether reading a signed-in session is permitted at all, whether a
store listing is the distribution, and whether the therapist's own dates make an
actual-session-date requirement implementable — which is a question about her
writing, and the synthetic corpus cannot answer it. The trial protocol's
corrections in `claude-import-browser-readiness.md` §3 still stand: absent-date and
explicit-date are two scenarios, not a statistic, and the requirement does not
retire because a fixture we wrote happens to be dated.
