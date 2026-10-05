# AM-215 and the twelve review findings — the P5.3 repair worker's readings

Round 2. The subject is the same uncommitted implementation the first repair
worker built on (`docs/v2/state/reviews/P5.3-impl.md`: 1 HIGH, 4 MEDIUM, 7 LOW).
Every command below ran from the repository root on the pinned Node
(`v24.19.0`); every e2e row ran inside a `sandbox.mjs` run folder on the port the
card assigned to it. Nothing contacted 7717 or the live data folder.

## 1. The twelve findings, one by one

| # | Severity | Finding | Fix |
| --- | --- | --- | --- |
| 1 | HIGH | a retained record from an ordinary window close blocked every later quiesce for the life of the process, and the spec's one shared `E2E_TAB` hid it | AM-215: the window's last word on `pagehide` — `POST /api/app/quiesce/close?tab=<id>` with `{clean}`, sent as `navigator.sendBeacon` with a `fetch`-keepalive fallback — discharges that tab's record; `dirty` or silence keeps FD13's obligation. The shared identity is gone; each row has its own, and rows prove both directions end to end (§3) |
| 2 | MEDIUM | a report the server cannot place (`ok:false` with `[]`, an unknown blocker name, or `ok:true` with blockers) was applied as clean | `placeable()` in `maintenance.ts` answers the same rule the other way; an unplaceable claim is recorded as `no_response`, resolves nothing, and answers nothing. Four V1 cases, one per shape |
| 3 | MEDIUM | `shellMode` was unreachable in production | derived from `APUNTA_SHELL` through `shellIsListening`, the one predicate the `ready` line and the stdin reader already use; `src-tauri/src/main.rs:411` already sets it. An explicit option still wins. Two V1 cases. `app.ts`'s comment is now true of the code |
| 4 | MEDIUM | "each of the ten kinds registers" was proven by calling `begin` directly | `maintenance.test.ts` now drives **eleven real route sites** through a real app and asserts the registry held the kind while the request was open (§2). Non-vacuity was measured: deleting `begin('save', …)` from `routes/notes.ts` fails the `save` case |
| 5 | MEDIUM | V7 asserted the *absence* of the `save` registration its row names | the absence is true and cannot be otherwise — `routes/notes.ts` begins and ends it around a synchronous handler, so no other request can be served in between. The spec now says exactly that, and V1 proves the site at the route. The row's real assertions (dialog raised, navigation deferred, editor keeps its text) are unchanged |
| 6 | LOW | `run()`'s `finally` did not clear maintenance on a throw | a `settled` flag: any path that did not decide an answer clears maintenance and the held flag. One V1 case drives it with a `sleep` that rejects |
| 7 | LOW | the flush exemption outlived the flush step | the exemption now also requires the window to be **unanswered** in this quiesce (`!reported.has(id)`). One V1 case |
| 8 | LOW | a duplicated tab id deleted a live window | `registerWindow` supersedes only same-tab records that hold **no** wait; a record holding one is neither released nor deleted, and the new arrival gets its own record |
| 9 | LOW | the hot-reload guard's docstring overstated what it did | the docstring was right and the code was wrong: the registration on `window` now carries an `owner`, and `once()` re-arms only if nothing else owns the poll. Two web cases, one of them a real second module instance |
| 10 | LOW | every poll re-arm recreated the record | a re-register from a tab that holds no wait **reuses** the record, so ids no longer churn and an in-flight quiesce cannot be left with a stale `expected` id. One V1 case |
| 11 | LOW | four stray PNGs at the repo root | verified untracked, never in history, 8×8 1-bit, 296–308 bytes, written during this card's runs; deleted |
| 12 | LOW | three cosmetics | the refused report's reason now rides `details` (`quiesce_not_in_flight` / `window_not_registered`) instead of being buried in English — the code stays `conflict` because the card licenses exactly one new member of the closed vocabulary; `shell-bridge.ts`'s duplicated paragraph is gone; the `fetch` decoration now rewrites a `Request` and a `URL` too, and refuses another origin (this found a real bug: `new Request('/relative')` throws) |

## 2. The ten kinds, through their own routes (finding 4)

Each case sends the real request to the real route with the fake providers, wraps
the registry's own `begin`/`call-through`, and reads `active()` **inside** the
wrapper — so the assertion is that the site's call reached the real registry and
the real registry held that kind. Afterwards `active()` is empty, which is the
release.

| Kind | Site exercised | Request |
| --- | --- | --- |
| `draft` | `routes/draft.ts:90` | `POST /api/generate` |
| `refine` | `routes/chat.ts:122` | `POST /api/notes/:id/chat` |
| `transcription` | `routes/transcribe.ts:276` | `POST /api/transcribe` (a real WAV) |
| `plan` | `routes/plans.ts:333` | `POST /api/patients/:id/plan/suggest` |
| `briefing` | `routes/prep.ts:62` | `POST /api/patients/:id/prep` |
| `brainstorm` | `routes/brainstorm.ts:142` | `POST /api/patients/:id/brainstorm` |
| `import` | `routes/import.ts:78` | `POST /api/import/claude/run` (the e2e fixture) |
| `import` | `routes/halaxy.ts:56` | `POST /api/import/halaxy` (after its own preview) |
| `backup` | `routes/backup.ts:73` | `POST /api/backup` |
| `restore` | `routes/backup.ts:122` | `POST /api/backup/restore` |
| `save` | `routes/notes.ts:94` | `PATCH /api/notes/:id` |

A twelfth case runs every site again and asserts `recording` is never registered
server-side.

**Non-vacuity, measured.** `perl -0pi -e "s/    begin\('save', jobId\);\n//" server/src/routes/notes.ts`
then `npx vitest run server/src/maintenance.test.ts -t "registers and releases 'save'"`
→ **1 failed** (`${site} registered save`). The file was restored immediately.

## 3. AM-215 in the browser, and the two ends of it

### The transport, chosen and why

`navigator.sendBeacon` with a `Blob` typed `application/json`, falling back to
`fetch(..., { keepalive: true })` if the beacon is refused. Both survive a page
teardown, but the beacon is the one the platform makes the unload guarantee for:
the browser queues it itself and it is not tied to the document's lifetime. The
`Blob` keeps the content type JSON — a bare string would go as `text/plain`,
which the route does not read — and the request is same-origin, so the
non-safelisted content type costs no preflight.

**Measured in headless Chromium** (a scratch spec, since deleted, against the real
dev server): `page.close()` fires `pagehide` and the beacon **reaches the server**
(`POST /api/app/quiesce/close?tab=probe → 204` in the server log).
`context.close()` does **not** deliver it, and `page.route` cannot intercept it —
which is why no row relies on the teardown Playwright does by itself, and why the
crash case crashes the renderer rather than trying to block a request.

### Where a window learns it is dirty

`web/src/lib/maintenance.ts` cannot see the editor's refs and no draft of the note
text is stored anywhere in `web/src`, so `NoteView.tsx`'s existing `beforeunload`
guard — which already computes exactly that condition — publishes it as it fires
(`setEditorUnpersisted`). One added line in the one added handler, no new state,
no React.

### The e2e, with distinct identities

`E2E_TAB` is gone. Each row identifies its own window, and a row that ends dirty
comes back into the app in the **same** tab (which supersedes the record by
FD13(c)), lets that window answer one quiesce cleanly, and only then closes. That
last step is what makes the teardown independent of the beacon: a clean report
resolves a record (FD13(c2)), and a retained-but-resolved record can never block
a later quiesce.

**Measured, twice.** With the shared identity removed and rows closing as they
pleased, a full-suite run failed at V9's final settle, and the server log showed
why: of V6a's four registrations, the last one's unload beacon never arrived, so
its record stayed unresolved. That is the protocol working; it is not something a
test row should depend on. The deterministic teardown above replaced it, and the
same combination (`flush exemption|V6a|V9`) that failed now passes.

### The two new rows, and what they are worth

- **"a clean close of one tab never blocks a later quiesce (AM-215)"** — two tabs,
  one quiesce `ok:true`, maintenance held; the first closes (its word sent — the
  log shows the request), maintenance still held because the second is
  registered; the second closes and it releases; then a **third tab with an
  identity neither closed window ever used** quiesces `ok:true`. Under FD13(c) it
  could never have superseded anything, so this is the row that fails if the
  beacon stops working.
- **"a tab that dies without saying anything is never settled over (AM-215)"** —
  the same shape as V9's dirty disconnect, but the tab is killed with
  `chrome://crash`: the renderer dies, the socket closes, no `pagehide` handler
  runs and the word never leaves. A bystander window answers `ok` and the quiesce
  is still refused `no_response`. It is last in the file on purpose: that record
  is retained for the life of the process and nothing but a restart clears it.

## 4. The rows

| Row | Command | Exit |
| --- | --- | --- |
| V1 | `node --version && npm run build:shared && npx vitest run server/src/maintenance.test.ts server/src/jobs server/src/routes/app-quiesce.test.ts web/src/lib/maintenance.test.ts --reporter=verbose` | **0** — 4 files, 97 tests, 0 skipped |
| V2 | `sandbox.mjs env --port 7853 … --project=quiescence quiescence.spec.ts --grep "V2"` | **0** — 1 passed |
| V3 | `--port 7855 … --grep "V3"` | **0** — 1 passed |
| V4 | `--port 7857 … --grep "V4"` | **0** — 1 passed |
| V5 | `npm test && npm run lint && npm run typecheck` | **0** — 171 files, 2411 tests; lint `TOTAL 0`; typecheck clean |
| V6 | `--port 7875 … --grep "V6"` | **0** — 2 passed (V6a, V6b) |
| V7 | `--port 7868 … --grep "V7"` | **0** — 1 passed |
| V8 | `--port 7853 … npx playwright test` (the whole suite) | **0** — 124 passed, 6 skipped |
| V9 | `--port 7871 … --grep "V9"` | **0** — 3 passed (the original row plus the two AM-215 rows) |

`node --version` printed `v24.19.0` in every run. No row was retried, skipped or
weakened, no timeout was raised, and the `quiescence` project still runs the file
serially.

## 5. Reported, not fixed

1. **The shell-mode release is P5.4's.** `shellMode` is now real and derived, and
   in shell mode a successful quiesce holds maintenance until the shell's next
   transition — which P5.4 owns and which does not exist yet. Until P5.4 lands,
   a shell-mode server stays in maintenance after a successful quiesce for the
   life of the process. That is the direction the contract asks for (nothing may
   write through the snapshot) and it is not P5.3's to add: FD1 fixes four
   routes and AM-215 adds a fifth, both recorded.
2. **`errors.quiesce.no_response` has no renderer yet.** The catalogue key exists
   in both languages and says what clears the state; the surface that shows it is
   C-UPD@1's updater notice on the quiescing failure row, which is P5.4's. The
   alternative — putting the sentence into the 503 — is unreachable: a retained
   record makes `ok:true` unreachable, so maintenance can never be on while one
   exists.
3. **The refused report still carries the code `conflict`.** The reason now rides
   `details`, but a distinct code would need a second member in
   `shared/src/errors.ts`, which this card may not add.
4. **V7's row text still says the registration is asserted through the status
   route.** It cannot be, for the reason in finding 5; the spec says so instead.
   Rewriting the row is a card edit outside this worker's scope.
5. `spelling-assets.spec.ts` (es-MX) was reported flaky by the previous reading
   and did not fail in any run here. Not touched: another worker owns
   `SpellingProvider.tsx` and that spec.