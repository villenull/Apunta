# The third implementation review's D, E, F, G and the port nit — round 4

Subject: the same uncommitted implementation, after
`state/reviews/P5.3-impl3.md` (1 MEDIUM, 3 LOW, 2 nits and one stale sentence in
the evidence). Every command ran from the repository root on the pinned Node
(`v24.19.0`); every e2e row ran inside a `sandbox.mjs` run folder on the port the
card assigns it. Nothing contacted 7717 or the live data folder, and nothing was
committed, staged or pushed.

`e2e/tests/spelling-es.spec.ts` belongs to another worker: read never, written
never.

## 1. Defect D — a per-document nonce, so a claim acts on its own document only

**The invariant that now holds, and it is the one the evidence used to state
wrongly:** *a clean claim only ever applies to the record of the **document** that
sent it; a predecessor document's late beacon never banks on or discharges a
successor's record.*

A `sessionStorage` tab id names a **slot**, not a page: it survives a same-tab
reload and Chromium's *Duplicate Tab* copies it. So the channel now carries a
second identity — a **per-document nonce**, minted once per page load in module
scope in `web/src/lib/maintenance.ts` (deliberately **not** in `sessionStorage`,
so it dies with the document), sent as `?doc=` on the **registration**, the
**report** and the **close beacon**, beside the `?tab=` all three already used.

| Where | What it does |
| --- | --- |
| `registerWindow(tab, doc)` | the record stores `doc`; a re-register under the same tab id **takes the record over** and rewrites `doc`, so the slot's new occupant owns it |
| `closeWindow(tab, doc, clean)` | `doc === null` → nothing (fail-closed: a claim that cannot say which document it is acts on nothing). One record under the tab id whose `doc` differs → **no-op**, neither banked nor discharged. Otherwise exactly as before: banked on a connected record, discharged on one already gone |
| `report({… doc})` | accepted only when the record's `doc` is the reporter's; otherwise refused `409`, counted, and **nothing is resolved** |
| `flushSaveExempt` (AM-213) | the flush's own `PATCH` must carry the same `doc`, so a page that used to hold the slot cannot spend the successor's flush exemption |

Both orders of the two events still end in the same place, and now so does the
third: a beacon that loses the race to its own successor's registration.

### The V1 cases, by name

- `lets a predecessor document's late beacon neither bank on nor discharge its
  successor's record` — the reviewer's ordering verbatim: document one registers
  and its socket goes; document two registers under the same tab id with its own
  `doc`; the outgoing document's `clean` beacon arrives **while the record is
  connected** (indistinguishable, without the `doc`, from the ordinary
  beacon-first close); document two then dies **saying nothing**, holding an edit;
  a bystander answers `ok` and the quiesce is **refused `no_response`**.
- `still discharges the ordinary beacon-first clean close, which the doc guard
  must not swallow` — the control, in its own case: same sequence, matching `doc`,
  discharged, and a later quiesce from another tab settles `ok:true`. So the guard
  is not "refuse every claim that beats its socket", which is the alternative that
  would have made AM-215 unreachable.
- `refuses a report whose document is not the one holding the record` — the right
  `quiesceId`, the right tab, a `doc` that never registered: refused
  (`window_not_registered`), counted (`refused()` + 1), and the document that does
  hold the record is still the one that settles it.
- `never lets a late beacon touch the record of a tab that reloaded` — the
  pre-existing case, now with two real documents rather than one document
  impersonating two.
- Client side (`web/src/lib/maintenance.test.ts`): `carries one document nonce on
  the registration, the report and the beacon` (same nonce on all three, and not
  the tab id) and `mints a new document nonce for a new page load, in the same tab`
  (after `vi.resetModules()` the tab id comes back out of `sessionStorage`
  unchanged and the nonce differs).

### Non-vacuity, measured

| Mutation | Result |
| --- | --- |
| `closeWindow`: drop the `record.doc !== doc` guard | **fails** `lets a predecessor document's late beacon…` (1 failed, 57 passed) |
| `report`: drop the `record.doc === input.doc` guard | **fails** `refuses a report whose document is not the one holding the record` (1 failed, 57 passed) |

The second row is worth recording: the first version of that case drove the
refusal through HTTP with a `virtualClock`, and it **passed with the guard
removed** — the virtual clock ran the whole quiesce to its bound before the
injected request was ever served, so the quiesce ended `no_response` for an
unrelated reason and the case was asserting nothing. It was rewritten to call the
controller directly under a `stillClock`, where the quiesce is genuinely in flight
while both reports are made. A vacuous case found by mutation, not by reading.

### The wire, from a real run

```
POST /api/app/quiesce/close?tab=e2e-quiescence-v7&doc=a5194c1d-fec0-4425-a473-39f58948a077  -> 204
GET  /api/app/quiesce/wait?tab=e2e-quiescence-teardown-witness …&doc=584f2035-7ebf-4356-b3d2-5265ee777781
POST /api/app/quiesce/report?tab=e2e-quiescence-teardown-witness …&doc=584f2035-…             -> 200
```

### Left for the coordinator

`cards/P5.3.md` FD1 says *"the query string is the only thing that carries the tab
identity, and it is the one non-`{quiesceId}` value the channel sends"*. This
change adds a second one, so FD1 (or an AM) needs a sentence naming the `doc`. The
card's own text is outside this worker's write scope, so it is recorded here and
in the return rather than edited.

## 2. Defect E — the published flag dies with the editor

One line, in the cleanup of the effect that already registers `pagehide`,
`beforeunload` and `visibilitychange` (`web/src/components/NoteView.tsx`):

```ts
setEditorUnpersisted(false);
```

The flag was published **as the guard fires** and nothing ever withdrew it, so the
reachable sequence — type, try to leave, dismiss the dialog, navigate away from
the note in-app, close the tab later — left `clean:false` published over an editor
that no longer existed, and every later quiesce was refused `no_response` until
Apunta restarted. Exactly the user-hostile outcome AM-215 was decided to remove,
reached without any fault.

**Unit case:** `says clean again once the editor that published the warning has
gone` (`web/src/lib/maintenance.test.ts`) — the contract between the two halves:
a withdrawn warning really does make the window clean, so the beacon says `clean`.

**End-to-end proof, which is where the line itself is covered:** V6 and V7 are both
refused a close (so the guard fires and publishes `true`), then leave the note
screen, then `leaveCleanly` must settle a quiesce `ok:true` from a tab that could
not have superseded the closed record — which is only reachable if the flag was
withdrawn. Remove the line and V6/V7 fail; that is the non-vacuity argument for a
one-line change whose own file is outside the four V1 collects.

## 3. Defect F — STOPPED, with the exact line

**Not implemented, and nothing in `web/src/routes/Capture.tsx` was touched.** The
claim `clean` is still narrower than FD8's wording: the Capture screen's typed
notes, its salvaged WAV and its in-flight transcription are purely client-side and
never published, so a window that closes on that screen still says `clean`.

**Why no derivation was possible without another Capture line.** Every candidate
the ruling names was checked in the tree:

| Candidate | Verdict |
| --- | --- |
| the recorder module (`web/src/lib/recorder.ts`) | Holds no screen state at all — a `PcmBuffer`, a `Recorder` class and `formatTimer`, instantiated per component. And it is in Must-not-edit |
| an existing store | There is none for this. The only global counter is `workInFlight` in `web/src/lib/i18n.tsx`, which is module-private with one reader (`useWorkInFlight`), publishes no getter, and covers only `busy \|\| recording !== 'idle'` — never `text` and never `wav`. `i18n.tsx` is in Must-not-edit |
| `useLiveRecording` (`web/src/hooks/useLiveRecording.ts`) | A hook: all of its state is per-component `useState`/`useRef`, and nothing it owns is reachable from outside the component |

The two facts F is about — the typed notes and the salvaged WAV — exist **only** as
`CaptureScreen`'s `text` and `wav` state, and `unfinished` is computed from them at
`Capture.tsx:151`. `reportDirty(unfinished)` writes to a `useRef` inside the
`Capture` wrapper, which nothing outside that component can read.

**The exact line needed** (one line, in the effect that already publishes at
`Capture.tsx:154-161`, plus its existing import at `:24`):

```ts
setEditorUnpersisted(unfinished);   // beside setRecordingActive(recording !== 'idle') at :160
```

with `setEditorUnpersisted` added to the existing `import { setRecordingActive }
from '../lib/maintenance.js'` at `:24` — the same import line, not a new one.
Nothing else in that file would change, and `unfinished` is already in that
effect's dependency list, so the flag would re-publish as it changes. This is the
coordinator's budget call (the card licenses **one** added line there and it is
spent), so it stops here rather than widening itself.

**What is not at stake while it waits:** nothing is silently discarded. Capture's
own `beforeunload` guard (`:163-173`) refuses the unload on the same `unfinished`,
so FD6's browser half holds; what is unsupported is only the server's *claim*, not
the user's data.

## 4. Defect G — the wait, and the real cause behind it

**The ruling's fix, applied.** `leaveCleanly` no longer waits for "at least one
window". Both of its waits are now on the **exact expected window set**
(`windows === 1`) before it quiesces — after the tab comes back into the app, and
after the witness registers — and nothing sleeps anywhere:

```ts
await untilStatus(request, (status) => status.windows === 1, 'the tab is registered again');
…
await untilStatus(request, (status) => status.windows === 1, 'only the witness is registered');
```

**The cause was not the one the review diagnosed, and the measurement is worth
having.** As shipped — `>= 1` at the witness step — the row failed **4 times in 15
runs**. With the ruling's exact wait in place it still failed **3 times in 12**.
Reading the full server log of each failure:

```
… POST /api/app/quiesce/close?tab=e2e-quiescence-v7&doc=d2653e0d…   -> the beacon from the RELOAD
… GET  /api/app/quiesce/wait?tab=e2e-quiescence-v7&doc=ea7ac48f…    -> the reloaded document
… POST /api/app/quiesce           -> 200                             the tab answered ok
… GET  /api/app/quiesce/wait?tab=e2e-quiescence-v7&doc=ea7ac48f…    (held)
… GET  /api/app/quiesce/wait?tab=e2e-quiescence-teardown-witness…   (held)
… POST /api/app/quiesce           -> 200 (ok:false, ["no_response"])
```

and **no second beacon for that tab ever arrives** — one beacon in the whole log,
not two. The word the witness step is looking for was **never sent**: the retained
record's obligation is doing exactly what FD13 says it does when a window says
nothing, and the row's own design ("if the beacon is lost, this teardown fails
instead of handing the next row a blocked server") turns a platform artefact into
a red row. The review's own log shows the same thing (`page.close()` at
`142314`, no beacon after it), so its "the server had not yet observed that socket
close" reading was a misattribution: the socket close *had* been observed, and the
beacon was the missing half.

**What was measured, in order:**

| Variant | Runs | Result |
| --- | --- | --- |
| bare `page.close()`, as shipped (`>= 1` at the witness step) | 15 | **4 failures** |
| the exact wait, still a bare `page.close()` | 12 | **3 failures**, every one with the word never sent |
| `page.close({ runBeforeUnload: true })` | 8 | 1 failure — the unload handlers are still not run reliably |
| `page.goto('about:blank')` then close | 15 | **15 failures**, all the same cause and a new one: an opaque origin makes the reporter's own `sessionStorage` read throw, and the `consoleErrors` fixture rightly fails the row on it |
| `page.goto('/api/health')` then close | 8 | **8 passes** |
| the same, plus the witness leaving by the same road | 15 | **15 passes** |

**What shipped:** the tab (and the witness) **navigate out of the app and are then
closed** — a real `pagehide`, the production event the reporter answers on, same
origin so storage still reads. Nothing about the row's proof changed: the tab
still goes away, the beacon still has to arrive, and a witness that could not have
superseded anything still has to settle `ok:true`. What changed is that the
teardown no longer depends on Chromium running unload handlers during a target
teardown.

The **15 × 1** run above also surfaced a second, distinct artefact, once in fifteen
runs: the *last* poll ("the last window going away releases maintenance") timed out
after 15 s. The witness's `close()` on a page holding a long-poll does not always
reach the server as a socket close at all, and FD1's release is the *last
unregistration* — so the server still believed a window was there. The witness now
leaves by the same navigation, and that step has been stable in 15 further runs.

## 5. The port nit — three servers per row, and two collisions

The config starts **three** servers per sandbox port since AM-213 (`chromium` on
`p`, `es-MX-language` on `p + 1`, `quiescence` on `p + 2`), and the sandbox
validates the base port alone, so a collision on a neighbour is an `EADDRINUSE`
rather than a refusal. Every row's triple was checked against every port named in
`docs/v2/cards/*.md`:

| Row | Was | Now | Why |
| --- | --- | --- | --- |
| V7 | 7868 → 7868/7869/7870 | **7853** → 7853/7854/7855 | `7868 + 1` is **7869, claimed by S3.2** (`state/reviews/S3.2-v2-ir.md`) |
| V4 | 7857 → 7857/7858/7859 | **7866** → 7866/7867/7868 | `7857 + 2` is **7859, named by P3.8** (`cards/P3.8.md:485`) |
| V2, V3, V6, V8, V9 | — | unchanged | no port another card names; V6's 7875 appears only in an S3.2 **review** and V9's 7871 only in an S2.8 review, and no card assigns either |

The card's port paragraph now says all three things: that a row starts three
servers, the before/after table above, and that a base port is safe only if
`p + 1` and `p + 2` are free too. V4's and V7's commands were changed to match;
no other row command changed.

## 6. The rows, run

| Row | Command (pinned Node `v24.19.0`) | Result |
| --- | --- | --- |
| V1 | `npm run build:shared && npx vitest run server/src/maintenance.test.ts server/src/jobs server/src/routes/app-quiesce.test.ts web/src/lib/maintenance.test.ts` | exit 0 — **4 files, 109 tests, 0 skipped** |
| V5 | `npm test && npm run lint && npm run typecheck` | exit 0 — `npm test` **2424 passed** (171 files), lint 0, typecheck 0 |
| V8 | the whole `e2e/` suite, sandbox port 7853 | exit 0 — **125 passed, 6 skipped** |
| V7 | the card's row command, port 7853, **15 runs** | **15 / 15 pass** |
| V9 | the card's row command, port 7871, **5 runs** | **5 / 5 pass** (4 tests each) |

V7's earlier batches, for the record and not as a result: 4 failures in 15 runs as
shipped, 3 in 12 with the wait-only fix, then 14/15 once the witness left by the
same road (that one failure is the maintenance-release poll below). Every failure
was the witness step. V2, V3, V4 and V6 run inside V8's whole-suite run and pass
with it.

The P2.2 screenshots the e2e gate rewrote were restored with `git checkout` after
the suite run. No commit, no push, no `git add`.
