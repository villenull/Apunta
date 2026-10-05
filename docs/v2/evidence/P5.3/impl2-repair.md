# The second implementation review's three defects — the P5.3 repair worker's readings

Round 3. The subject is the same uncommitted implementation the second repair
worker built on (`docs/v2/state/reviews/P5.3-impl2.md`: 3 new defects — 2 MEDIUM,
1 MEDIUM — plus three nits, two stale row texts and one missing row). Every
command below ran from the repository root on the pinned Node (`v24.19.0`); every
e2e row ran inside a `sandbox.mjs` run folder on the port the card assigned. No
network, no 7717, no live data folder.

## 1. Defect A — `closeWindow` acted on records it could not see, by tab identity alone

The coordinator's ruling: discharge only a **retained** record, at most one, never
delete a live record and never release a live wait; a late beacon after a same-tab
reload must not touch the new document's live record; and with a duplicated tab
identity a clean close of one copy must never make the other copy's record
disappear.

**The literal reading does not work, and the e2e is what showed it.** Implemented
first as written — `release === null && disconnectedAt !== null` — and the
AM-215 clean-close row failed:

```
Error: expect(received).toMatchObject(expected)
-   "blockers": Array [],  "ok": true,
+   "blockers": Array [ "no_response" ],  "ok": false,
> 691 |     expect(await quiesce(request)).toMatchObject({ ok: true, blockers: [] });
```

The server log says why, and it is a fact about the browser rather than about the
code. On `page.close()` the beacon and the aborted poll reach the server in **this**
order:

```
POST /api/app/quiesce/close?tab=e2e-quiescence-am215-first   → 204
POST /api/app/quiesce/close?tab=e2e-quiescence-am215-second  → 204
```

The `POST /close` is answered while the tab's own `GET …/wait` is still open on
the server — the socket close is observed *after* the word, every time, in this
engine. So a rule that only ever discharges an already-disconnected record makes
AM-215's own decision ("an ordinary clean close never blocks a later quiesce")
unreachable, which is not something a repair worker may decide.

**What shipped instead, and why it is still the ruling.** The discharge needs the
window's **own socket** to have gone — but not necessarily *before* the word:

| Event | What it does |
| --- | --- |
| `closeWindow(tab, clean=false)` | nothing, exactly as before |
| `closeWindow(tab, true)`, **two or more** records under that tab id | nothing at all — a clean claim cannot say which window it is about, and guessing is the one direction FD13 is fail-closed about |
| `closeWindow(tab, true)`, one record whose socket is already gone | **discharged**: the record is deleted (this is the pre-existing AM-215 path) |
| `closeWindow(tab, true)`, one record still connected | **banked** on that record (`cleanClaimed`), and nothing else: no wait released, no record deleted, no obligation touched |
| `disconnect(id)` on a banked record | **discharged**: the record is deleted, so the ordinary clean close leaves nothing counting |
| `disconnect(id)` on any other record | retained, and `resolved` goes back to `false` (Defect B) |
| `registerWindow(tab)` reusing a record | the banked word is **dropped**: a registration is a new document arriving, and it has said nothing |

So a claim never acts on a connected record, is spent only by the socket it was
made against, and is ignored outright when two windows share that identity. Both
orders of the beacon and the socket close end in the same place, which is what
makes the word reliable rather than a race — the browser produces the beacon-first
order.

> **Corrected 2026-10-05 (round 4, Defect D).** The sentence here used to read
> "cannot survive into the next document under the same tab identity" **and that
> was false as shipped** — `reviews/P5.3-impl3.md` reproduced the ordering where
> it does exactly the opposite, and the code has since changed: a claim now acts
> only on the record of the **document** that sent it (a per-page-load `doc`
> nonce), so a predecessor's late beacon neither banks on nor discharges its
> successor's record. `evidence/P5.3/impl3-repair.md` §1 has the proof, the two
> cases and the mutations. The table above is left as it was written, and every
> row of it is subject to that one added condition: the record's `doc` must be
> the claimer's.

**A held wait is not the test for "gone".** The ruling's parenthetical says
`release === null / disconnected`, and the first half of that is not sufficient: a
connected window holds no wait between a quiesce asking it and the browser
re-arming. `disconnectedAt` is the stamp that says the socket closed, and it is
what the code tests.

### The V1 cases, by name

| Case | Covers |
| --- | --- |
| `a clean claim on a connected record is remembered, not applied, and the window is still asked` | the claim applies nothing while the record is connected: no wait released, no record deleted, the window still registered and still asked, the quiesce refused |
| `spends a claim banked on a connected record when that window's own socket closes` | the ordinary clean close, in the order this browser produces: word first, socket second, and a different tab's quiesce settles after |
| `discharges the record when the claiming window's own socket closes, and then a later quiesce settles` | the other order — socket first, word second |
| `never lets a late beacon touch the record of a tab that reloaded` | a beacon from the outgoing document after the incoming one has registered: the live record is still asked, and it settles on its own answer |
| `drops a banked word when the same tab registers again, so it cannot be spent on the next document` | a word banked on a connected record, then a reload, then the incoming document killed holding an edit: another tab's `ok` is refused `no_response` |
| `a clean claim under a duplicated identity acts on neither copy` | Chromium's *Duplicate Tab*: two records under one id, the claim touches neither, and after both sockets go the dirty copy's text is still something a quiesce cannot settle over |

### Non-vacuity, measured

Each mutation was applied to `server/src/maintenance.ts`, the named tests were
run, and the file was restored from a copy (`diff` clean afterwards, verified by
`grep -c "if (false"` → 0 and a re-run of all 55 cases).

| Mutation | Cases that failed |
| --- | --- |
| `disconnect()` ignores a banked word | 2 — `releases browser-mode maintenance when the last window goes away, and its word changes nothing`, `spends a claim banked on a connected record when that window's own socket closes` |
| the re-register keeps the banked word | 1 — `drops a banked word when the same tab registers again…` |
| a claim acts even when two records share the identity | **none** — see below |
| a claim on a connected record discharges it at once (round 2's behaviour) | 4 — including `a clean claim on a connected record is remembered, not applied…` and `never lets a late beacon touch the record of a tab that reloaded` |

**The duplicated-identity guard is not distinguishable by any assertion, and that
is recorded rather than papered over.** With *n* ≥ 2 records under one tab id, at
most one can be banked, and every record that was not banked is retained at its own
socket close — so the identity always keeps at least one blocker, whichever record
the single banked word lands on. Both readings are fail-closed for the tab; only
the guess differs. The guard stays because the ruling asks for it and because it
removes the guess entirely, not because a test fails without it.

## 2. Defect B — a clean report used to be permanent

`disconnect()` now sets `resolved = false`. An `ok` covers what the window held
**when it said so**; a tab that keeps working and is then killed — crash, OS,
browser quit — has said nothing about the text typed since. This is AM-215's own
fail-closed reading applied where the review put it.

One V1 case, by name: `refuses a later quiesce after a window reported ok and then
went away` — a quiesce the window answers `ok` and settles, then the socket goes,
then another tab answers `ok` and is refused `no_response`. Non-vacuity measured:
deleting the one line fails that case and nothing else.

**What it cost, and the e2e change it forced.** A record that leaves *cleanly* is
now retained until its word arrives, so the suite's teardown can no longer claim
that a clean report disarms a record (it did exactly that before). `leaveCleanly`
therefore **depends on the beacon honestly**: after the row's tab closes, it opens
a window under a **fresh identity** and asserts that a quiesce settles `ok:true`.
A fresh identity is the only vantage point from which the beacon is visible —
under FD13(c) it could not have cleared the closed tab's record by re-registering —
so if the word is lost the teardown fails instead of leaving the next row a blocked
server to trip over. Nothing is suppressed and no assertion is weakened; the cost is
one extra page load and one quiesce per teardown.

One existing case moved with it: the route-level
`is answered during a successful quiesce, and releases the held maintenance` had
`abort()` **after** `close`, and its "socket is gone" wait was
`status.windows === 0`, which a *held* window also satisfies. It now re-arms the
wait the way the reporter does, sends the word while that socket is open (which is
the browser's order), asserts maintenance is still held — a claim is not an
unregistration — then aborts and waits for the release.

## 3. Defect C — a bfcache-able hide was treated as a close

`onPageHide` now returns immediately on `event.persisted`: no last word, no
discharge, and the poll keeps running. `pageshow` with `persisted` re-arms the
registration — the abort goes through `once()`'s own re-arm, and a reporter that
was stopped outright is armed afresh. Both listeners are removed by
`stopMaintenanceReporter()`.

Two V1 cases, by name, in jsdom (this Chromium does not bfcache the app, which the
review also found): `says nothing on a persisted hide and keeps polling` and
`re-arms the registration on the way back out of the cache`.

Non-vacuity measured: ignoring `event.persisted` fails both cases; removing the
`pageshow` re-arm fails the second.

**The client half of Defect A is in the same place.** `onPageHide` now aborts the
poll **before** sending the word, so the socket close is on the wire first. That is
not what makes the discharge work — the server's rule is order-independent — but it
puts the browser's two events in the order the server prefers, and it is documented
as such rather than relied upon.

## 4. The review's nits and stale texts

| # | Nit | What was done |
| --- | --- | --- |
| 1 | the duplicated comment paragraph in `closeWindow` | gone; the paragraph now says once what the loop used to say twice, and `closeWindow`'s body was rewritten around the three cases above |
| 2 | the card's catalogue May-edit bullet said "exactly one key each" | corrected to **two keys each** — `errors.maintenance` (FD10) and `errors.quiesce.no_response` (AM-215) — with the reason, in `docs/v2/cards/P5.3.md` |
| 3 | `window.fetch` was restored to a bound copy | the **exact** original is captured and restored; the decoration calls it with `original.call(window, …)`, because `fetch` needs `window` as its receiver |
| 4 | V7's and V9's row texts | both corrected below |
| 5 | no row proved a dirty close says `dirty` | a new row, below |

**V7's row text, before → after.** Before: "The spec asserts the save registration
through `GET /api/app/quiesce/status` before the close attempt, never by elapsed
time". After: what the spec really asserts — that the save is genuinely in flight
and unacknowledged, and that the `save` registration is **not** visible from
another request, with the reason (`routes/notes.ts` begins and ends it around a
synchronous handler, so the event loop is busy in between) and V1 named as the
proof at the route. **No assertion is weakened**; the row's real assertions are
untouched.

**V9's row text, before → after.** Before: step (c) and the second half of (f)
described "the `page.route` gate of `save-integrity.spec.ts:99-107`" keeping the
content unpersisted. After: the mechanism the spec uses — the runner writes the
note underneath the editor with a stale `PATCH` (V3's own control), so the
best-effort flush has nothing to send, and the app is then unloaded out of that tab
— and one added sentence recording that the row now also carries AM-215's three
rows, which run under the same `--grep`. Nothing removed.

**The new row** (nit 5), placed after every row that needs a quiesce to settle and
before the crash row, which stays last: `V9: a tab closed with unsaved text says
dirty, and is still counted (AM-215)`. A note is opened, the editor's save is held
in flight by the same production gate the other rows use, the server is asked and
confirmed to have none of the words, a second inert window registers, the dirty tab
is then navigated out of the app (its own `beforeunload` guard fires, the dialog is
accepted, `pagehide` sends the word with the other answer) and a quiesce from the
bystander is refused `no_response`. The row asserts the **obligation**, and says so:
whether the beacon arrived as `dirty` or never arrived at all, FD13's obligation is
the same, and the row does not claim the words were recovered.

## 5. Rows

| Row | Command (abridged) | Exit | Reading |
| --- | --- | --- | --- |
| V1 | pinned Node, `build:shared`, `vitest run server/src/maintenance.test.ts server/src/jobs server/src/routes/app-quiesce.test.ts web/src/lib/maintenance.test.ts` | **0** | 4 files, **104 tests**, 0 skipped. Every case the row names is present, plus the six above: A's five, B's one, C's two (one case covers both of C's halves in the server, two in the browser) |
| V5 | `npm test && npm run lint && npm run typecheck` | **0** | `npm test` **171 files, 2419 tests**; `prettier --check` clean, `TOTAL 0`, licences in step; typecheck clean |
| V8 | the whole `e2e/` suite, `--port 7853` | **0** | runs 3 and 4 below |
| V9 | `--project=quiescence --grep "V9" --port 7871` | **0** | **4 passed**: the card's row, the AM-215 clean close, the new dirty close, and the crash row |

`node --version` printed `v24.19.0` in every run. No row was retried, skipped or
weakened, no timeout was raised, and the `quiescence` project still runs the file
serially. The P2.2 screenshots the e2e gate rewrote were restored with
`git checkout` after the suite runs.

### V8, four runs, honestly

| Run | Result |
| --- | --- |
| 1 | **1 failed** — `V7: a close attempt while a save is outstanding…`; 119 passed, 5 did not run (serial mode), 6 skipped |
| 2 | **1 failed** — `spelling-es.spec.ts` (es-MX project, "marks the typed-notes box"); 124 passed, 6 skipped |
| 3 | **0** — 125 passed, 6 skipped |
| 4 | **0** — 125 passed, 6 skipped |

Neither failure is in P5.3's file and neither reproduced.

- `V7` **passed alone** (`--grep "V7"`, 6.3 s) and passed in runs 3 and 4; the
  whole `quiescence` project also passed on its own (11 passed, 23.2 s). It is a
  load-sensitive row — it holds a `PATCH` open and waits on a `beforeunload` dialog
  — and run 1's error text was not captured before the run was repeated. **Not
  measured to a conclusion, and not fixed.**
- `spelling-es.spec.ts` is the es-MX spelling flake the previous two readings
  recorded under its sibling `spelling-assets.spec.ts`, in the project that never
  collects a quiescence spec. It **passed alone** (`--project=es-MX
  tests/spelling-es.spec.ts`: 10 passed, 1 skipped, 20.9 s). Not touched: another
  worker owns `SpellingProvider.tsx` and those specs.

## 6. Scope

Changed on top of the second repair: `server/src/maintenance.ts`,
`server/src/maintenance.test.ts`, `server/src/routes/app-quiesce.test.ts`,
`web/src/lib/maintenance.ts`, `web/src/lib/maintenance.test.ts`,
`e2e/tests/quiescence.spec.ts`, `docs/v2/cards/P5.3.md` (the two row texts and
the catalogue May-edit bullet, all coordinator-authorised corrections), this file
and `docs/v2/state/returns/P5.3.md`. Nothing else. No commit, no push, no
`git add`.