# Claude direct import — relay pass acceptance review

**Reviewer:** an agent with no stake in the relay pass. **Date:** 2026-09-28.
**Subject:** `docs/research/claude-import-relay-results.md` and the relay,
ancestry and popup changes in `scratch/claude-import-extraction/`
(`extension/bridge.js`, `extension/sw.js`, `extension/panel.js`,
`extension/inpage.js`, `src/shapes.mjs`, `src/walker.mjs`,
`browser/roundtrip.mjs`, `test/relay.test.mjs`,
`test/branch-fidelity.test.mjs`, `test/extension.test.mjs`).

**Verdict: ACCEPT the relay, the tab resolution, the popup repairs and the
ancestry hardening. Two defects in what was delivered — one behavioural, one
documentary — and one reported result that does not reproduce. None of the three
blocks a synthetic live trial; all three should be fixed before it, and the
behavioural one is a few lines.**

| | |
| --- | --- |
| F1–F3, the missing relay (previous review §4) | **ACCEPT.** Closed, and closed by real clicks |
| The precedence bug at `sw.js:60` | **ACCEPT.** Gone, with a named regression |
| Popup repairs (manifest button, failures listed) | **ACCEPT.** Both are real defects the harness found, not invented |
| Ancestry hardening (`conversation_ancestry_complete` always `null`) | **ACCEPT.** Answers the review's §6 items and does not let unverifiable completeness read as established |
| "One observed response settles pagination" | **UPHELD** — withdrawn in place, not argued with |
| **Defect B1** — progress forwarded once per request | **REPORTED.** Contradicts the code's own comment and the doc's popup claim |
| **Defect B2** — `event.source === window` "not usable between worlds" | **REPORTED.** Asserted in three places, untested, and contradicted by the code that relies on the opposite |
| **Result R3** — `check.mjs` "still green" | **DOES NOT REPROUCE UNCONDITIONALLY.** 7 of 8 runs green; one reported 11/2, exit 1 |
| Real account, permission, pagination, store review | **NOT RUN.** Unchanged |

---

## 1. Verification of the reported evidence

Pinned **Node v24.19.0** (`~/.local/share/apunta-node/node-v24.19.0-linux-x64/bin`),
which the doc also reports, from the repository root.

| # | Command | Exit | Result |
| --- | --- | --- | --- |
| 1 | `node --test …/test/{traversal,resilience,fidelity,extension,relay}.test.mjs` | 0 | **90 tests, 90 pass** — matches |
| 2 | `node_modules/.bin/tsx --test …/test/*.test.mjs` | 0 | **116 tests, 116 pass** — matches |
| 3 | as (2) × `TZ=UTC / America/Mexico_City / Australia/Sydney / America/Denver` | 0 ×4 | 116 pass each — matches |
| 4 | `npx eslint scratch/claude-import-extraction` | 0 | clean — matches |
| 5 | `npx prettier --check "scratch/claude-import-extraction/**/*.{mjs,js,json,css,html,md}"` + the results doc | 0 | all formatted — matches |
| 6 | `node scratch/claude-import-extraction/browser/roundtrip.mjs "$RUNFOLDER" 7830 7831` | 0 | **20 checks, 20 pass** — matches |
| 7 | `node scratch/claude-import-extraction/browser/check.mjs "$RUNFOLDER" 7830 7831` | 0 on 7 of 8 runs | 14/14 on 7 runs; **one run reported 11 passed / 2 failed, exit 1** — see R3 |

Browser runs used `scripts/v2/sandbox.mjs env --port 7830` for the run folder,
ports 7830 (HTTP) and 7831 (CDP), both free and both inside 7800–7889, neither
7717, 7867, 7868 nor the 7890s, a fresh `mkdtemp` profile inside the run folder,
loopback-only fabricated content, and `--disable-extensions-except` so only this
extension was active. No real account, no Claude endpoint, no inference, no
dependency installed, no production file touched, no commit, no further agent.
`git status` shows no tracked modification; nothing under `scratch/` was written
by this review.

**The roundtrip reproduces exactly, digest included.** My run:

```
PASS  the page carries no capture of its own; the extension supplied it — {"scripts":0,"inlineCode":false,"fromExtension":"object"}
PASS  the popup starts with nothing captured and Save disabled — {"status":"Not started.","save":true}
PASS  pressing Start in the popup finished a capture — The tab finished: complete_with_gaps
PASS  the popup shows the verdict the page produced — complete_with_gaps (not handoffable)
PASS  the capture walked the synthetic account — 3 conversations, 5 messages
PASS  the flat conversation is named as a gap in the popup — [non_text_content_not_captured, branch_fidelity_unknown, branch_ancestry_unresolved]
PASS  Save is disabled until the gaps are acknowledged — {"save":true,"acknowledgeVisible":true}
PASS  a forged page message does not change the popup’s verdict — complete_with_gaps -> complete_with_gaps
PASS  acknowledging the gaps enables Save — {"checked":true,"save":false}
PASS  Save wrote a file to disk — conversations.json
PASS  the manifest button is enabled once there is a verdict — disabled=false
PASS  the file on disk is the export shape, with every conversation — 3 conversations
PASS  the file’s digest is the one the popup showed
       — sha256:8864f05e7eb93d1a0558c3171d3b813b57d077be88dd59b3de00870515f60a8e
         vs sha256:8864f05e7eb93d1a0558c3171d3b813b57d077be88dd59b3de00870515f60a8e
PASS  the downloaded manifest names the branch gap — [non_text_content_not_captured, branch_fidelity_unknown, branch_ancestry_unresolved]
PASS  the capture claims no branch selection and no complete ancestry
       — {"capture_selects_a_branch":false,"mechanism_carries_ancestry":true,
          "conversation_ancestry_complete":"not knowable from the payload",
          "why_not_knowable":"a capture that starts at message 40 of 200 is indistinguishable from one that has all 200"}
PASS  a conversation answered with a sign-in page makes the run partial, is named, and blocks Save
```

`sha256:8864f05e…` is the doc's number. The claim that it is *not* hard-coded
holds: it is a digest of the bytes this run's account produced, over a different
fixture from the offline `check.mjs` run, and I got the same value from an
independent browser launch.

---

## 2. The three things I was asked to confirm about the harness

**It really clicks.** `browser/roundtrip.mjs:314-334` locates a control with
`getBoundingClientRect`, refuses a zero-area box, scrolls it into view, and sends
`Input.dispatchMouseEvent` `mousePressed` then `mouseReleased` at the box centre.
All four controls on the user path are clicked that way: `#start`
(lines 428 and 585), `#acknowledge` (489), `#save` (500), `#save-manifest` (515).
The comment is explicit that `element.click()` would exercise the handler
without the control, and it does not use it for those four.

**It really reads the download.** Line 518 reads the file off disk, line 519
hashes those bytes with `createHash('sha256')`, and line 534 compares that digest
against the string the popup *rendered*. The manifest is separately read and
parsed off disk (523) and its `report.branches` is asserted. This is the
strongest form the claim could take: a byte-level round trip from a real click to
a file on a filesystem, verified against a number the UI showed.

**It does not inject the capture.** Grepping `roundtrip.mjs` for
`ApuntaCaptureCore.capture`, `ApuntaCaptureInPage.run` and `makeTransport`
returns exactly one hit — a line in the file's own header explaining that the
*previous* harness did inject and this one does not. Nothing builds a transport
and nothing calls the capture. The 20 `Runtime.evaluate` calls are: reading
element boxes, reading DOM text, setting two form fields a user would type
(`mode`, `organization`), polling for a verdict, and posing the **forged hostile
message**. Check 10 confirms the forgery changes nothing.

Two accurate qualifications, neither a defect: **one of the 20 is a documentary
check, not a behavioural one** — check 19 is
`check(…, true, 'every manifest-matched document receives the bridge, so this
cannot be posed in the browser')`, and the doc says so in bold ("Check 19 is a
limit, not a pass"), which is the right way to handle it; so the behavioural count
is **19**. And check 18 drives `document.getElementById('start').click()` inside
an evaluate rather than a mouse event, so that one path is exercised through the
handler rather than the control. Same handler, weaker method; noted for
consistency, not as a gap.

---

## 3. Origin, correlation and message validation — and what stays host-trusted

The validation is real and it is the right shape. `bridge.js:135-162` checks, in
order: the message's origin against **this frame's own origin** (not a list),
`source`, `kind` against a two-member set, the request id's shape, and that the
id is one the bridge itself issued. `validateReport` (98–133) then walks the
report field by field: status in a four-member enum, booleans, three bounded
counts, array-ness and length caps on the three lists, code-shaped strings for
gap and failure codes, a digest-shaped digest, and
`branches.capture_selects_a_branch === false`. The worker validates the tab
(`hostAllowed`, not discarded, not a privileged URL), **proves a receiver by
pinging it**, and distinguishes `no_eligible_tab` from `no_listener` — two
causes, two fixes, two messages. The old precedence expression is gone and a
regression asserts its absence by name (`relay.test.mjs:571`).

**What remains host-trusted, precisely.** The doc's §3 already says the right
thing — "hygiene, not containment" — and that framing is correct and should not
be softened. The residue, itemised, because a later card will otherwise
rediscover it:

1. **The account host is the boundary.** The capture runs in the page's own
   world, so any script on `claude.ai` shares its globals: it can replace
   `ApuntaCaptureInPage`, forge any report the bridge would accept, and read the
   capture bytes. I reproduced the replacement in the previous pass. The
   alternative world reintroduces the unobserved cookie attribute the design
   exists to avoid, so this is a distribution decision, not a bug.
2. **A same-origin iframe is not distinguished.** The bridge checks
   `event.origin` only — it does not check `event.source` — so a frame on the
   parent's origin passes the origin test. Correctly named in the doc and in
   `NOTES.md`; still worth knowing it is not defended.
3. **The `manifest` string is never validated.** The bridge bounds its length
   and forwards it, and the popup offers it for save. The manifest is the file
   that says *what the capture cost*, and a forged one is not inspected. Small,
   and moot under (1), but it is the one payload with no field check at all.
4. **The `branches` check is skippable.** `if (report.branches !== undefined)`
   — a report that omits the block entirely passes. Again moot under (1).
5. **The loopback host is in `host_permissions` and `content_scripts[].matches`,
   so every local page receives both scripts.** Already marked as a research
   affordance to remove before distribution, in three places.

**I do not read check 10 as evidence of malicious-host containment, and neither
should anyone else.** It shows that one forged message, from the same origin, with
a shape the validator rejects or a request id nobody issued, does not move the
popup. It is a regression against a specific bug and a demonstration that the
validator is doing its stated job. It is not a boundary test, and the doc does
not claim it is one — which is the most important thing to keep true about this
pass.

---

## 4. Defect B1 (behavioural): progress is forwarded once per request, not collapsed to the latest

`bridge.js:173-176`:

```js
if (kind === 'apunta-capture-progress') {
  if (state.lastProgress === requestId) return;
  state.lastProgress = requestId;
}
```

with the comment above it: *"Progress is collapsed: a long walk can emit
thousands, and the popup needs the latest, not a queue."* The code does the
opposite of the second clause: it forwards the **first** progress message for a
request and silently drops every later one, because `lastProgress` is set to the
request id and never cleared until the next start. Reproduced offline against
`bridge.js` in a VM, five progress messages from the page world:

```
progress messages the page emitted    : 5
progress messages the bridge forwarded: 1 ["list 1"]
after a second Start, one more progress gets through: 2 total
```

Consequences: the popup's progress line freezes on the first step for the whole
walk, and a five-hundred-conversation capture — the case the entire service-worker
design exists to survive — would show no movement for minutes and look hung. No
offline test covers it, and the 20 checks assert the *finish*, not progress, so
the harness cannot see it. The doc's popup section claims it "renders progress
and a verdict only for that id", which is half true: the id is enforced, the
rendering is not.

Not a correctness risk to the capture, and not a reason to hold the relay. It is
a real defect in a delivered feature, the fix is a few lines (drop the dedupe, or
key it on a monotonic sequence number and keep the latest), and it should carry a
test before the live trial — because the live trial is the first time a walk will
be long enough for this to be visible.

## 5. Defect B2 (documentary, consequential): the `event.source` claim is asserted three times, tested zero times, and contradicted by the code

`claude-import-relay-results.md` §1, `bridge.js:46-51` and `NOTES.md:98-101` all
state, as fact, that **`event.source === window` is not usable between the
ISOLATED and MAIN worlds** because they "do not share a `window` identity that
can be relied on". No test asserts it — `relay.test.mjs:93` only sets up the
global the scripts see; the statements live in comments and prose.

**Observed runtime contradicts it, and the extension depends on the opposite.**
`extension/inpage.js:165` — the page-world file — filters inbound messages with

```js
scope.addEventListener('message', async function (event) {
  if (event.source !== scope) return;
```

and the capture starts, completes and writes a digest-matching file through
**real mouse clicks** in a live browser. If `event.source` could not be compared
across worlds, that comparison would drop the bridge's start message and *nothing
would ever capture*. It works. So either the claim is false, or it is true only
in a sense nobody has written down — most likely that `event.source` cannot
distinguish *page script* from the *bridge* in the page world (both post with the
page as source), which is a statement about the page as a hostile party, not
about worlds.

Consequential, and not only cosmetically: a later card reading the header would
reasonably conclude the page world's `event.source` check is also unsound and
either remove it — breaking the relay — or keep it while believing it is
decorative. The claim should be corrected in all three places to what was actually
observed, with the distinction stated: the **bridge** uses origin and does not use
`event.source` at all, so its validation is unaffected either way; the **page
world** uses `event.source` and demonstrably receives messages through it.

The design decision the comment was reaching for is still sound and should be
kept: the bridge checks the frame's own origin rather than a list of hosts, which
is stricter than anything `event.source` would give.

## 6. Result R3: `check.mjs` "unchanged, still green" does not reproduce unconditionally

Row 8 of the doc's evidence table claims 14/14, exit 0, for the earlier harness.
I ran it **eight** times on the same ports and profile method:

- 7 runs: `14 passed, 0 failed`, exit 0.
- 1 run: **`11 passed, 2 failed`, exit 1.**

I did not capture the failing run's per-check output, so I cannot name which two
checks failed, and I will not guess. The honest statement is: the claim is
reproduced on 7 of 8 runs and the harness is **not** unconditionally green, so
either there is a flake to find and fix or the row needs a qualification. For a
harness that is explicitly labelled "unchanged", a flake in it is worth two
minutes of the author's attention rather than a footnote, because the first
review's whole point was that these checks are evidence of a specific, narrow
thing — a check that fails one time in eight is evidence of a slightly different,
narrower thing.

Nothing here suggests the *roundtrip* harness is flaky: 20/20 on my run, and the
20 checks it does run are the ones that matter for the user path.

---

## 7. Ancestry: accepted, and it does answer the review's question

The review's §6 asked whether an always-`null` `conversation_ancestry_complete`
could let unverifiable completeness read as established. **It cannot, and the
thirteen shapes now classify as claimed.** Reproduced offline against
`src/shapes.mjs`:

| Shape | `fidelity` | `mechanism_carries_ancestry` | `conversation_ancestry_complete` | notes |
| --- | --- | --- | --- | --- |
| 0 links (the D1 case) | `links_absent` | false | null | roots 3 |
| **one usable edge, others none** | `links_present` | true | null | roots 2 → `branch_ancestry_unresolved` |
| all links dangling | `links_present` | false | null | dangling 2 |
| cycle `a→b, b→a` | `structurally_invalid` | true | null | cycles 2 |
| cycle + one real edge | `structurally_invalid` | true | null | cycles 2 |
| two roots, all edges resolve | `links_present` | true | null | roots 2 |
| duplicate ids | `structurally_invalid` | true | null | dupes 1 |
| self-reference + one edge | `structurally_invalid` | true | null | self 1 |
| empty-string parent + one edge | `structurally_invalid` | true | null | empty 1 |
| linear chain, complete-looking | `links_present` | true | null | roots 1 → **no gap** |
| thread starting at message 40 of 200 | `links_present` | true | null | roots 1 → **no gap** |

All five items the review listed are now distinguished rather than silently clean:
cycles, duplicate ids, self-references and empty-string parents become
`structurally_invalid`; multiple roots are counted and raise
`branch_ancestry_unresolved`; a single edge no longer reads as a per-conversation
ancestry claim. The empty-string parent is counted as no link at all, which was
the review's cheapest and most plausible item, and it is handled.

On the always-`null`: **there is no path to a `true`, by construction.** The
last two rows are the honest case — a thread that starts at message 40 of 200 is
classified exactly like a complete one — and that is not a hole, because
`conversation_ancestry_complete: null` with `why_not_knowable` is what the
manifest carries to say so, and the roundtrip's check 17 asserts that string
survives the round trip into the file on disk. The mechanism-level boolean and
the per-conversation question are kept apart everywhere, which is the right
design. One note for a later card rather than a defect: `roots` counts messages
with no *usable* parent, so a flat three-message conversation reports `roots: 3`
and a two-root thread reports `2`; the `roots !== 1` rule combined with the
two-message minimum is what makes that sound, and both are documented in the code.

**Also accepted:** the doc's withdrawal of the pagination clause, and its §3
corrections — the dated-fraction statistic and the eight-conversation pagination
claim were both withdrawn in place rather than argued with, and the requirement
is explicitly not retired because a fixture we wrote happens to be dated. That is
the right way to handle a review finding.

---

## 8. What is genuinely blocking, and what is not

**Blocking for accepting the pass as delivered (three, all small):**

- **B1** — progress forwarded once per request instead of the latest
  (`bridge.js:173-176`). Contradicts its own comment, the doc's popup claim, and
  would make a long real capture look hung. Fix plus a test.
- **B2** — the `event.source === window` claim, in three places, untested and
  contradicted by `inpage.js:165` and by the working path. Documentation only, but
  it is the kind of falsehood a later card acts on.
- **R3** — the `check.mjs` "still green" row. Find the flake or qualify the row.

**Not blocking, listed so they are not mistaken for oversights:** the unvalidated
`manifest` string and the skippable `branches` check (§3.3, §3.4); the
documentary check 19 among the 20; check 18's in-page `.click()`; the missing
same-origin-iframe case, which is named rather than hidden; and the progress
claim in the popup section.

**All prior defects stay open, and this pass correctly touched none of them.**
D2, D3, D4, D5, D6, D7, D8, D9, D10, D11, D13, D14 and D16 — the structure lane's
injection false positive, the unprovable merge, the unbounded eligibility window,
the coverage warning, the provenance-grammar break, the three seam contract gaps,
the shipped importer's per-conversation qualification, the machine-timezone
eligibility, the corpus date mismatch, the narrow date reader, and the fixed
cutoff literal — all remain exactly as the first and second reviews left them,
in the structure prototype and in production code, neither of which this pass
touched. D12 (nothing in `scratch/` is in the repository's test surface) is also
unchanged, which is worth restating at the moment a third pass of 116 tests
arrives: they still run only when someone runs them by hand.

---

## 9. Exact prerequisites for a synthetic LIVE Claude trial

No feature scope is added here; this is the list of things that must be true, not
of things to build.

**Before the trial can be attempted at all**

1. **A synthetic Claude account and a session.** None exists. This is the only
   true blocker, and it is not a code problem.
2. **A terms decision.** Whether reading a signed-in session through
   undocumented endpoints is permitted is still unanswered, and no lane or review
   has read the terms. It remains a precondition, and no amount of green tests
   substitutes for it.
3. **B1 fixed with a test**, so a real multi-hundred-request walk reports
   progress instead of appearing hung — otherwise the first live run will produce
   an ambiguous "is it working?" signal at exactly the moment the person watching
   needs a clear one.
4. **B2 corrected in all three places**, so the next card does not delete the
   page world's `event.source` check on the strength of a false statement about
   cross-world identity.
5. **The trial runs unpacked in a throwaway research profile, and is recorded as
   developer mode.** That is authorized for research and is *not* a therapist
   install path. No store listing is required for a trial and none is claimed.

**Not required, and explicitly not prerequisites:** the loopback research host may
stay for the trial (record whether removing it changes anything, as a fact about
the manifest rather than a code change); the offline mock path stays; nothing in
`server/`, `web/`, `shared/` or `installer/` needs to change; no production repair
is on this list.

**What the trial observes, unchanged from the previous reviews**

The observation list stands as written, with the same discipline attached to each:
the conversation payload shape and **whether fork links and per-message
`updated_at` were present in that response** (D1 now makes this recordable);
whether the inventory response carried any pagination affordance — **recorded as
one observation at one account size, and explicitly not as evidence that the
endpoint does not paginate**; content-block types and where artifacts sit; whether
the session rides a same-origin request from a page world; the real limits; and
the two **date scenarios** (explicitly dated, undated) run as separate scenarios
with pre-stated expected outcomes, never as a statistic that retires the
actual-session-date requirement.

**What the trial must not conclude, and the ready-made trap:** one account at one
size, one response, one mechanism. A clean run on a small account is not partial
evidence of account-wide coverage; a response without fork links is a fact about
that response; and an origin check that passed is not a hostile-host result. The
capture's own manifest is the evidence file, and it now carries `mechanism_carries_ancestry`,
`conversation_ancestry_complete` and the gaps by name — so a trial result can be
recorded as what was seen, which is the whole gain of the last two passes.

---

## 10. Exact rerun commands, with exits

```sh
export PATH=~/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH

node --test scratch/claude-import-extraction/test/traversal.test.mjs \
             scratch/claude-import-extraction/test/resilience.test.mjs \
             scratch/claude-import-extraction/test/fidelity.test.mjs \
             scratch/claude-import-extraction/test/extension.test.mjs \
             scratch/claude-import-extraction/test/relay.test.mjs
# exit 0 — 90 tests, 90 pass

node_modules/.bin/tsx --test scratch/claude-import-extraction/test/*.test.mjs
# exit 0 — 116 tests, 116 pass
for z in UTC America/Mexico_City Australia/Sydney America/Denver; do
  TZ=$z node_modules/.bin/tsx --test scratch/claude-import-extraction/test/*.test.mjs
done
# exit 0 ×4 — 116 pass each

npx eslint scratch/claude-import-extraction; echo $?   # 0
npx prettier --check "scratch/claude-import-extraction/**/*.{mjs,js,json,css,html,md}" \
  docs/research/claude-import-relay-results.md; echo $?   # 0

# Browser harnesses: wrapper, fresh profile, free permitted ports
RUNFOLDER=$(node scripts/v2/sandbox.mjs env --port 7830 \
  | grep -oP "(?<=APUNTA_DATA_DIR=')[^']+" | xargs dirname)
node scratch/claude-import-extraction/browser/roundtrip.mjs "$RUNFOLDER" 7830 7831
# exit 0 — 20 checks, 20 pass
node scratch/claude-import-extraction/browser/check.mjs "$RUNFOLDER" 7830 7831
# exit 0 on 7 of 8 runs; exit 1 once, 11 passed / 2 failed (R3)

# This review's two probes (in /tmp, not part of the repository)
node_modules/.bin/tsx /tmp/opencode/rev/ancestry2.mjs
# exit 0 — 13 ancestry shapes, §7
node_modules/.bin/tsx /tmp/opencode/rev/progress-probe.mjs
# exit 0 — B1: 5 progress messages emitted, 1 forwarded
```

`/tmp/opencode/rev/ancestry2.mjs` and `/tmp/opencode/rev/progress-probe.mjs` are
review scaffolding, deliberately not committed. The ancestry probe imports
`branchFidelity` from the prototype and calls it; the progress probe evaluates
`extension/bridge.js` in a `node:vm` context with a stub `chrome` and a fake
`window`, drives one start and five progress messages, and counts what the bridge
forwards. Neither writes into the repository. If they are discarded, B1 is
reproducible from the eleven lines quoted in §4 and the ancestry table in §7 is
reproducible by hand.
