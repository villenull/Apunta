# Claude direct import — browser-readiness acceptance review

**Reviewer:** an agent with no stake in the second-stage extraction pass.
**Date:** 2026-09-28. **Subject:** `docs/research/claude-import-browser-readiness.md`
and `scratch/claude-import-extraction/extension/`,
`scratch/claude-import-extraction/browser/check.mjs`.

**Verdict in one line: D1 is accepted and D15 is accepted as a loadable
prototype; the popup → relay → page-world → file path is not wired and the 14
browser checks do not touch it, so "end to end" in the readiness table means the
*walk* ran end to end in a browser, not that a user path exists.**

| | |
| --- | --- |
| D1, branch provenance | **ACCEPT**, with one wording correction (`established` is a mechanism fact, not a per-conversation one) |
| D15, loadable extension | **ACCEPT** as a research prototype; it loads, and it is honest about needing developer mode |
| The popup → tab → file path | **NOT BUILT.** Three independent findings, reproduced in a browser |
| The 14 browser checks | **ACCEPT as evidence of what they check**; **REJECT as evidence of a roundtrip** — none of them goes through the popup, the relay, or a download |
| "One observed response settles pagination" (readiness §6.3) | **REJECT.** One response is one observation at one account size. See §5 |
| Blob download from a page world | **previously NOT RUN — now performed**, with a narrower unknown remaining |
| Real-account behaviour | **NOT RUN.** Unchanged |

---

## 1. What this review did, and did not, do

**Did.** Re-ran the whole reported evidence under the pinned Node **v24.19.0**
(`~/.local/share/apunta-node/node-v24.19.0-linux-x64/bin`), not the v26.8.2 the
readiness doc reports. Read the seven new extension files, the browser harness
and the two new test files. Reproduced the 14 browser checks myself, in a fresh
throwaway profile created by the repository's own wrapper
(`scripts/v2/sandbox.mjs env --port 7815`), on permitted sandbox ports 7815
(HTTP) and 7816 (CDP). Wrote and ran **twelve additional CDP probes** the
harness does not run, against the same profile and ports, plus an offline probe
of the branch classifier over thirteen ancestry shapes.

**Did not.** Edit nothing under `scratch/` and nothing in `server/`, `web/`,
`shared/`, `installer/`. No real account, no Claude endpoint, no live inference,
no GPU, no dependency installed, no store listing, no commit, no push, no
further agent, no patient database. Port 7717 never contacted; 7867/7868 not
disturbed. Browser launches used the permitted wrapper, a fresh
`mkdtemp` profile inside the sandbox run folder, loopback only, with background
networking, sync, component updates and the password store off — and when the
wrapper refused an in-use port (7825) the run was moved to a free one rather
than worked around. `docs/v2/RUN-CONFIG.md` §1 needed no port outside
7800–7889.

**Still not proven, and not claimed here:** anything about a real Claude
account, whether the session rides a same-origin request from a page-world
script, whether a live response carries fork links or edit times, whether the
inventory paginates, real rate limits, whether Anthropic's terms permit any of
this, and whether a Chrome Web Store review would pass.

**Preserved:** every finding in `claude-import-independent-review.md` (D1–D16)
and every reproduced result in the readiness doc. Nothing in §4 of the earlier
review is withdrawn, and D1's fix does not weaken it.

---

## 2. Verification of the reported evidence

All from the repository root under Node v24.19.0.

| # | Command | Exit | Result |
| --- | --- | --- | --- |
| 1 | `node --test scratch/claude-import-extraction/test/traversal.test.mjs scratch/claude-import-extraction/test/resilience.test.mjs scratch/claude-import-extraction/test/fidelity.test.mjs scratch/claude-import-extraction/test/extension.test.mjs` | 0 | **70 tests, 70 pass** — matches |
| 2 | `node_modules/.bin/tsx --test scratch/claude-import-extraction/test/*.test.mjs` | 0 | **96 tests, 96 pass** — matches |
| 3 | as (2) with `TZ=UTC` / `America/Mexico_City` / `Australia/Sydney` | 0 / 0 / 0 | 96 pass each — matches |
| 4 | `npx eslint scratch/claude-import-extraction` | 0 | clean — matches |
| 5 | `npx prettier --check "scratch/claude-import-extraction/**/*.{mjs,js,json,css,html,md}"` | 0 | all formatted — matches |
| 6 | `node scratch/claude-import-extraction/browser/check.mjs "$RUNFOLDER" 7815 7816` | 0 | **14 checks, 14 pass** — matches |

Browser run, my own reproduction, Chromium 152.0.7977.82, fresh profile
`/tmp/apunta-v2/2026-09-28T14-04-30-016Z-28abe501/profile-zm5iT7`:

```
PASS  browser started on a throwaway profile — Chrome/152.0.7977.82
PASS  the extension loaded (its service worker is registered) — chrome-extension://hbhl…/sw.js
PASS  the content script is running in the page’s own world — ApuntaCaptureInPage: object
PASS  a same-origin request from the page reaches the synthetic API — 1
PASS  the capture walks the synthetic account — 3 conversations, 5 messages, gaps [branch_fidelity_unknown]
PASS  the capture is not reported complete, and is not handed over — complete_with_gaps
PASS  a conversation whose response carries no links is flagged (D1)
PASS  the file is hashed in the page — sha256:f253fd449612b98a1a748847edfb903e908251b24bca7ac1c24d6ce48f1a0400
PASS  a sign-in page served with 200 cannot be passed off as a capture — partial, 0 captured
PASS  a DOM snapshot served with 200 cannot be passed off as a capture — partial, 0 captured
PASS  the extension has an id the popup can be opened at — hbhlpgfhapklpdigaedfdlhdjhknplin
PASS  the popup loads the core and the mock, and not the page-world script — object|object|undefined|hbhl…
PASS  the built-in mock runs in the browser with no network — 4 conversations, duplicates 1
PASS  no cookie is set or read by the extension on the synthetic origin — []
```

**Everything reported reproduces, including both file digests.** The
D1 regression test is real: it opens both captures with the **unmodified**
shipped reader and asserts the review's own numbers (2 abandoned with links, 0
without, the abandoned reply spliced in when links are absent), plus the
sharper dangling case, plus that the two files differ *only* in the ancestry
field. That is the right shape for a regression and I accept it.

**The core-parity claim holds and is not self-fulfilling.**
`test/extension.test.mjs:154` evaluates `capture-core.js`'s own text in a VM,
drives it against the same synthetic account as the reference walker, and asserts
equal conversation and message counts, equal gap **codes**, and a file digest
equal to `expected.mjs`'s — which has its own serializer and recomputes its
counts from the truth. Two implementations agreeing on an independently written
digest is real evidence. One bounded note: parity compares gap *codes*, not gap
*detail*, so the two could disagree about `fidelity` on a given conversation
without failing.

---

## 3. What the 14 browser checks actually exercise

This is the central acceptance question, so it is worth being exact. Grouped by
what the harness does to reach them:

| # | Check | How it is reached | Roundtrip? |
| --- | --- | --- | --- |
| 1 | throwaway profile | `mkdtemp` + `--user-data-dir`; asserted by construction | no |
| 2 | service worker registered | CDP target discovery | no |
| 3 | content script in the page's world | `Runtime.evaluate('typeof globalThis.ApuntaCaptureInPage')` | no |
| 4 | same-origin request works | harness's own `fetch` in the page | no |
| 5 | the capture walks the account | harness **calls `ApuntaCaptureInPage.run()` and passes its own transport** | no |
| 6 | not reported complete | same injected call | no |
| 7 | D1 flag in a browser | same injected call | no |
| 8 | the file is hashed | same injected call | no |
| 9, 10 | `200` + sign-in page / DOM snapshot | harness builds its **own** transport and calls `ApuntaCaptureCore.capture()` | no |
| 11 | extension has an id | regex over the worker URL | no |
| 12 | popup loads the right files | CDP opens `panel.html`, reads `typeof` | no |
| 13 | the mock runs | harness calls `ApuntaCaptureCore.capture()` in the **popup** | no |
| 14 | no cookie | `Network.getCookies` | no |

**Zero of the 14 goes popup → relay → MAIN world → capture → file.** Concretely,
not one of them: clicks the popup's Start button; calls
`chrome.runtime.sendMessage`; calls `chrome.tabs.sendMessage`; observes a
`window.postMessage` event; or triggers a download. Checks 5–8 and 13 are
**injected function calls** — the harness constructs the transport and invokes
the capture itself, which is a legitimate way to test the walk in a real browser
and is not a user path. The readiness doc is careful to say "the popup loads",
not "the popup drives"; the table row "capture walked a synthetic account end to
end" is true of the walk and should not be read as the workflow.

That is not a criticism of the harness — it is a precise statement of its scope,
and §6 below asks for it to be stated that way in the document.

---

## 4. The popup → relay → page-world path: three findings, all reproduced

The manifest declares **one** content script, in `world: "MAIN"`, containing
`capture-core.js` and `inpage.js` (`extension/manifest.json:15-24`). There is no
ISOLATED-world content script anywhere. That single fact is the root of all
three findings, because in the MAIN world the extension APIs are not present.

**F1 — the page world cannot receive a message, so nothing can drive the
capture from the popup.** `inpage.js` registers no `chrome.runtime.onMessage`
listener (it only defines `ApuntaCaptureInPage` and uses `window.postMessage`),
and in the page's world it could not register one anyway. Measured:

```
window.chrome / chrome.runtime / chrome.tabs in the MAIN world = object|undefined|undefined
a real chrome.tabs.sendMessage(<integer tabId>, …) from the worker
  → rejected: Could not establish connection. Receiving end does not exist.
```

**F2 — the popup never names a tab, so the relay refuses before it tries.**
`panel.js:138-142` sends `{kind, mode, organizationId}` and no `tabId`;
`sw.js:60` computes `hostAllowed(sender.url) || message.tabId === undefined ? null
: message.tabId`, which parses as `(a || b) ? null : message.tabId` — so an
allowed host yields `null` and a missing `tabId` yields `undefined`, and either
way the SW answers "no eligible tab". The worker *can* find the tab
(`chrome.tabs.query` is available to it and it saw 3 tabs including the probe
page), but nothing asks it to. Clicking the real button reproduces it:

```
NOTE  popup → SW start message exactly as panel.js sends it (no tabId) — {"ok":false,"reason":"no eligible tab"}
NOTE  status after clicking "Start capture" in the popup UI
        — No eligible tab answered. Open a signed-in claude.ai tab (or the loopback test host) and try again.
NOTE  worker chrome.tabs surface — object|function      (query available; a tabId could be discovered there)
NOTE  popup chrome.tabs surface — object
```

For a research prototype this is two small omissions, not a design failure: a
`tabId` (or a `chrome.tabs.query` in the worker) and an ISOLATED-world content
script that relays `window.postMessage` ↔ `chrome.runtime`. Both are the kind of
thing a later card does. But until they exist, **the extension's live mode does
nothing**, and the readiness table's "D15 built and loaded" is true of the
walk and of the popup's offline path, not of live mode.

**F3 — the same gap on the way back.** `inpage.js:136-143` posts progress and
the verdict with `window.postMessage`, and the page world does emit them:

```
window.postMessage events from a page-world capture — ["capture_started","progress","progress","capture_finished"]
```

but nothing in the extension subscribes to them, so the popup never learns that a
tab finished. The SW's `apunta-capture-report` handler expects a
`chrome.runtime.onMessage` from a content script, which by F1 cannot exist.

**F4 — the popup's own offline path does work, and the acknowledgement gate
holds.** Clicking "Run here instead" in the real UI produced:

```
complete_with_gaps (not handoffable) | 4 conversations, 10 messages
  | sha256:44a95ebee54782a24687e3ebefda237a132bfdb7a390ca6e4a8da76772a38e6a | save disabled = true
```

and Save stayed disabled until the gaps were acknowledged. This is the part of
the extension a researcher can actually use today, and it behaves correctly.

**On page-origin spoofing — the real trade, stated rather than fixed.** Because
the capture runs in the page's own world, page script shares its globals:

```
the page world can replace the capture object — replaced by page script
```

A page script can overwrite `ApuntaCaptureInPage` or read the capture bytes.
That is the unavoidable price of the same-origin argument — the whole design
exists so the walk issues requests the page could issue itself — and the
mitigation is trust in the host, not code. It should be **recorded as a property
of the design**, because the alternative (the extension's own world) reintroduces
the unobserved cookie attribute the design exists to avoid. Two narrower notes:
`host_permissions` includes `http://127.0.0.1/*`, so every loopback page gets a
page-world script injected; and the SW's relay accepts `apunta-capture-report`
from any allowed host without validating the report's shape, so an extension-page
sender could hand the popup a fabricated verdict. Neither is reachable from page
script (no `chrome.runtime` there), and both are research-scope. The readiness
doc already flags the loopback host as a research affordance to remove before
distribution, which is the right instinct.

---

## 5. The claim I reject: "one observed response settles pagination"

`claude-import-browser-readiness.md` §6.3 says a single observed response from
the real inventory endpoint "settles pagination, the conversation payload, fork
links and edit times together". **Rejected, and the pagination half is wrong on
its own terms.** Readiness §3.2 in the same document already gets this right —
"eight conversations cannot demonstrate pagination" — so §6.3 contradicts §3.2
twelve lines later. §6.3 needs the pagination clause removed.

Why it is wrong, precisely: one response is one observation **at one account
size**. "The response came back whole and carried no `has_more`" is consistent
with no pagination, with a threshold above this account's size, and with a
source that omits the field it uses. It does not distinguish them, and a
threshold is not reachable by growing a synthetic account to a size a researcher
can type. The other three clauses are *nearly* right and need the same qualifier:
one response can establish **what that response carried** — the shape, whether a
fork link was present, whether an edit time was present — and cannot establish
what responses in general carry, nor what a *different* mechanism (the Compliance
API, which documents no parent link) would carry. Sourced as
**one observation at one size, in one direction** — the right framing is
"records what the response carried", which is exactly what the D1 fix now makes
possible, and the strongest thing in this pass.

Lane 1's `SOURCES.md` §"What the absence of a field… does not mean" is the
standard to hold §6.3 to, and it already states it: a source that sends no
parameter does not show the endpoint has no parameters.

---

## 6. The branch classifier: correct on the case D1 was about, `established` does more work than it can support

The D1 fix is the right shape. `branchFidelity` uses the importer's own
predicate (a link is usable when it names a message also present in the
response), and the three states are honest about the original failure: absence
of links now means **unknown**, not clean, and never `complete`. The compliance
mechanism is covered by the same words with the reason attached, which is exactly
the "documentation silence is not behaviour" discipline the earlier review asked
for. The one-message and empty conversations are excluded, which is right —
nothing can be branched, so there is nothing to be uncertain about.

**The bounded correction.** `established` is computed as `usable > 0` and, per
the readiness table, has verdict effect **none**. Thirteen shapes, offline,
against `src/shapes.mjs`:

```
0 links (the D1 case)  ............ carries=0 usable=0 dangling=0 -> unknown
full chain .............           carries=2 usable=2 dangling=0 -> established
ONE usable edge, others none ...... carries=1 usable=1 dangling=0 -> established
one usable edge, 1 dangling ....... carries=2 usable=1 dangling=1 -> established
all links dangling .......          carries=2 usable=0 dangling=2 -> dangling
two independent roots, 1 edge ..... carries=1 usable=1 dangling=0 -> established
two independent roots, all edges .. carries=2 usable=2 dangling=0 -> established
cycle a->b, b->a ................  carries=2 usable=2 dangling=0 -> established
cycle plus one real edge .......... carries=3 usable=3 dangling=0 -> established
self-reference only .............. carries=0 usable=0 dangling=0 -> unknown
self-reference + one real edge ... carries=1 usable=1 dangling=0 -> established
duplicate ids, one edge .......... carries=1 usable=1 dangling=0 -> established
link to a message of '' .......... carries=2 usable=1 dangling=1 -> established
```

Four things the table does not distinguish, all reported as `established` with no
gap and no verdict effect:

1. **A single usable edge.** Three messages, one link, two with no ancestry at
   all: `established`. A single edge cannot establish that the *declared*
   ancestry is complete, and the wording "usable links exist, so a live thread
   can be followed" reads as a per-conversation claim. It is not one. What one
   usable edge **does** establish is a **mechanism capability** — this mechanism
   carries the field at all — and that is genuinely valuable, because it is
   exactly what distinguishes a mechanism that returns a flat visible path (zero
   links anywhere, caught) from one that carries ancestry. The fix is wording and
   a `detail` note, not a code change: `established` should be documented and
   reported as "the mechanism carried at least one usable link", and any claim
   that a specific conversation's ancestry is complete should be explicitly
   listed as **not knowable from the payload**.
2. **Cycles** (`a→b, b→a`, and a cycle alongside a real edge) read as
   `established`. Corrupt ancestry is reported as good ancestry. The shipped
   reader terminates on its `seen` set, so nothing hangs, but the capture says
   nothing about a structure that cannot be true.
3. **Multiple roots** are not counted. A conversation with two independent roots
   reads as `established`; the shipped `liveThread` walks back from one tip, so
   the other root's messages are silently outside the note. The root count is
   computable from the same data and is not computed. This is the closest cousin
   of D1 and the one I would fix first after the wording.
4. **Duplicate message ids** read as `established`. Lane 2's `CaptureIndex`
   refuses them outright (`capture.ts:119-126`), so the two lanes disagree about
   whether a duplicate id is an error or nothing — worth reconciling whichever way
   the owner decides.

A fifth, smaller: a `parent_message_uuid` of `''` is counted as a carried,
unresolvable link, so a source that sends an empty string reads as `established`
rather than `unknown`. Plausible real shape; cheap to guard.

**Scope note, so this is not read as a production demand.** These are
truthfulness refinements to a research classifier whose main case is already
correct. Items 1 and 3 are worth a follow-up card; 2, 4 and 5 are optional. None
of them is a reason to reject the D1 fix, and none affects the offline or browser
evidence above.

---

## 7. Bounded documentation corrections required

Six, all in `docs/research/claude-import-browser-readiness.md`. No source
change is required for any of them.

1. **§6.3, remove the pagination clause.** "Settles pagination… together" →
   "records what one response at one account size carried: the conversation
   payload shape, and whether fork links and edit times were present. It does not
   settle pagination, which depends on a threshold a small account cannot reach
   (§3.2), and it is a fact about that response, not about responses in general."
   This also removes a contradiction with §3.2.
2. **§4 and the §"Browser run" row, add the page-world download I performed.**
   Replace "which the run above did not perform: it saved nothing" with what is
   now known (§8 below), keeping the store-installed CSP question open.
3. **The 14-check table, add a scope column or a sentence** stating that the
   checks are CDP-injected function calls and that none exercises the popup →
   relay → page-world → file path, plus the finding that the live path is
   currently unwired (F1–F3). A reader of the table should not have to open
   `manifest.json` to discover there is no ISOLATED-world content script.
4. **The D1 table row for `established`**, reword per §6 item 1: a mechanism
   capability, not a per-conversation ancestry claim, with "a conversation's
   ancestry is complete" listed as not knowable from the payload.
5. **A new "known gaps in the prototype" note** recording F1–F3 (no receiver in
   the page world, no `tabId` on the popup path, the inverted host/tabId
   expression at `sw.js:60`) and the page-world tamperability property with its
   rationale, so a later card does not rediscover them. §5's table of deliberately
   untouched defects is the natural home for the first three; the tamperability
   trade belongs beside them.
6. **The D15 row**, split the claims: "the walk runs in a real browser and the
   popup's offline path works" versus "live mode does not yet work". The
   developer-mode caveat is already correct and should stay exactly as it is — it
   is the clearest statement in either document that loading unpacked is not the
   therapist's install path.

Explicitly **not** required, and worth saying so: no production repair, no
change to `server/`/`web/`/`shared/`, no store claim, no therapist UX claim, and
no widening of the classifier into something it cannot be.

---

## 8. The Blob-download question, now partly closed

The readiness doc listed "whether a Blob download from a page world survives MV3
CSP" as NOT RUN and said plainly that the run "saved nothing" — which is honest,
and the right thing to check for absence. I performed it, because the gap was
closeable in a throwaway profile with synthetic content:

```
inpage save() return value from the page world — {"saved":true,"bytes":754}
downloads dir after the PAGE world saved — ["conversations.json","page-world-capture.json"]
size on disk — 754 bytes
downloads dir after the POPUP saved — ["conversations.json"]
```

So: a Blob + anchor download triggered from a **MAIN-world content script**
lands in the download folder, and the same from an extension page lands too, in
Chromium 152, unpacked, headless, with `Browser.setDownloadBehavior` set. **What
that does not close:** a store-installed extension, where the download is
initiated from `claude.ai` rather than a loopback origin and the page's own CSP
and Chrome's download policy apply; a signed-in real page; and whether Chrome
keeps permitting the pattern for a `web_accessible`/MAIN-world script under
review. The honest restatement is: **the mechanism works; the distribution path
is NOT RUN.** Any claim that it "survives MV3 CSP" as a general statement would
be the same overreach as §6.3's pagination clause, in the opposite direction.

---

## 9. What remains NOT RUN

Unchanged from the readiness doc, with two adjustments.

| Not run | Note |
| --- | --- |
| Any request to a real Claude endpoint | Unchanged. No account exists yet |
| Whether the web inventory paginates, and how | Unchanged. §5 above narrows what one observation could ever show |
| Whether a live response carries fork links or edit times | Unchanged. D1 now makes the answer recordable — the real gain of this pass |
| Whether the session rides a same-origin request from a page-world script | Unchanged. The browser run deliberately did not attempt it and I did not either |
| An artifact body from the web app; real rate limits | Unchanged |
| Account-wide coverage | Unchanged. Three conversations (browser run) and four (built-in mock) are not partial evidence |
| Store-installed download, and the real `claude.ai` page | Unchanged — see §8 for the narrower statement |
| Chrome Web Store review and publication | Unchanged. Still out of phase; still a decision |
| Anthropic's terms, and whether any of this is permitted | Unchanged. Not consulted by either lane or by this review |
| Anything with lane 2 in the loop | Unchanged |
| **NEW:** the popup → relay → page-world → file path | Unchanged, and now **known not to be wired** rather than unknown (§4) |

---

## 10. Decision and next step

**Accept** the D1 fix, with the §6 wording correction. The original hole — a
mechanism that returns a flat visible path reported as clean — is closed, the
review's own reproducer is preserved as a regression against the unmodified
shipped reader, and the compliance mechanism now names the same gap in the same
words without claiming anything about a live response.

**Accept** D15 as a loadable research prototype. It loads, the page-world script
injects, the same-origin path works, the walk runs, the digest matches the
independently authored expectation, a `200` carrying a sign-in page or a DOM
snapshot is refused as content rather than filed as a capture, no cookie is read,
and the offline popup path works with its acknowledgement gate intact. The
developer-mode caveat is stated correctly and must not be softened.

**Do not accept** "end to end" as covering the user path (§3), and do not accept
§6.3's pagination clause (§5). Both are one-line document corrections (§7).

**The smallest next step, unchanged and now better specified:** the D1
regression and the mock prototype are done; what is missing before a live trial
is the **relay** — a tabId on the popup path, an ISOLATED-world content script
that carries `window.postMessage` ↔ `chrome.runtime`, and the `sw.js:60`
expression corrected. That is a small, well-understood piece of work, it is the
last thing standing between "the walk works in a browser" and "a person can press
a button", and it is a better use of the next card than anything on the
account-side. It also needs no account, so it can be finished and checked in a
throwaway profile exactly as this pass was.

**What this pass did not change:** the D1–D16 findings of the first review, the
interoperability verdict, the recommendation to treat the two lanes as two
products, the position that session-date eligibility does not fall back to chat
recency, and every NOT RUN above. Two small offline refinements (multiple roots,
empty-string parents) are worth a card; neither is a reason to reopen anything.

---

## 11. Exact rerun commands, with exits

Under `PATH=~/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH`, from
the repository root. All read-only; nothing writes into the repository.

```sh
# Offline suite
node --test scratch/claude-import-extraction/test/traversal.test.mjs \
             scratch/claude-import-extraction/test/resilience.test.mjs \
             scratch/claude-import-extraction/test/fidelity.test.mjs \
             scratch/claude-import-extraction/test/extension.test.mjs
# exit 0 — 70 tests, 70 pass

node_modules/.bin/tsx --test scratch/claude-import-extraction/test/*.test.mjs
# exit 0 — 96 tests, 96 pass
for z in UTC America/Mexico_City Australia/Sydney; do
  TZ=$z node_modules/.bin/tsx --test scratch/claude-import-extraction/test/*.test.mjs
done
# exit 0 ×3 — 96 pass each

npx eslint scratch/claude-import-extraction          # exit 0
npx prettier --check "scratch/claude-import-extraction/**/*.{mjs,js,json,css,html,md}"
# exit 0

# The shipped browser harness, through the repository wrapper, fresh profile
RUNFOLDER=$(node scripts/v2/sandbox.mjs env --port 7815 \
  | grep -oP "(?<=APUNTA_DATA_DIR=')[^']+" | xargs dirname)
node scratch/claude-import-extraction/browser/check.mjs "$RUNFOLDER" 7815 7816
# exit 0 — 14 checks, 14 pass

# This review's own probes (in /tmp, not part of the repository)
node_modules/.bin/tsx /tmp/opencode/rev/branch-probe.mjs
# exit 0 — 13 ancestry shapes against branchFidelity (§6)
node /tmp/opencode/rev/acceptance-probe.mjs "$RUNFOLDER" 7815 7816
# 10 checks pass, 14 notes — MAIN-world globals, the sendMessage rejection, the
# popup's "no eligible tab", the popup's offline verdict, both Blob downloads,
# and the page-world tamperability result (§4, §8)
```

`/tmp/opencode/rev/acceptance-probe.mjs` is review scaffolding and is
deliberately not committed. It opens its own `mkdtemp` profile and download
folder inside the same sandbox run folder, drives Chromium over CDP with no
dependency, serves only fabricated loopback content, and writes
`browser-acceptance-probes.json` beside the harness's own output. If it is
discarded, every finding above is reproducible from the harness plus the two
one-line evaluations quoted in §4.
