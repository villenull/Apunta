# P5.3 — evidence

C-UPD@1's quiescence and the close policy. Every command below ran from the
repository root on the pinned Node (`v24.19.0`), inside a sandbox run folder, on
the port the coordinator assigned to that row. No command contacted 7717 or the
live data folder; `sandbox.mjs` refuses either.

`rows.md` holds the per-row records (command, port, start and end time, exit
code, excerpt). This file holds the two rows that are not Playwright greps and
the notes that belong to the whole set.

## At a glance

| Row | What it proves | Exit |
| --- | --- | --- |
| V1 | the drain's 30 s bound, the entry rule, the refusal hook and its exempt reads, the report rules, FD13's retained records, and the reporter's lifecycle — all through the FD4 clock seam, with no 30-second test | 0 |
| V2 | a quiesce is refused with `refine` while a refine streams, the stream completes, and service resumes | 0 |
| V3 | a client `conflict` refuses the quiesce and the text survives on both sides | 0 |
| V4 | an idle app quiesces `ok:true`, refuses a new draft with `maintenance`, keeps `/api/health` answering, and releases when the last window unregisters | 0 |
| V5 | `npm test`, `npm run lint`, `npm run typecheck` | 0 |
| V6 | unsaved text and a running recording both refuse a close attempt, each with the control that makes the refusal mean something | 0 |
| V7 | a close attempt while a save is outstanding is deferred and the editor keeps its text | 0 |
| V8 | the whole `e2e/` suite | 1 — BLOCKED, see below |
| V9 | a dirty disconnect is never settled over; a different tab does not clear it and the same tab does | 0 |

## V1 — targeted unit and integration

- cwd: repository root
- command: `node --version && npm run build:shared && npx vitest run server/src/maintenance.test.ts server/src/jobs server/src/routes/app-quiesce.test.ts web/src/lib/maintenance.test.ts --reporter=verbose`
- node: `v24.19.0` (exactly the version `engines` and `.nvmrc` name)
- exit code: 0
- collected: 4 files, 50 tests, 0 skipped — `No test files found` did not occur for any named path

The cases the row names, and where each one lives:

| The row asks for | The test that shows it |
| --- | --- |
| the 30 s bound, reached, `ok:false`, still-active kinds as blockers, through the seam | `server/src/maintenance.test.ts` "reaches the 30 s bound and refuses with the still-active kinds as blockers" — asserts `clock.elapsed() === 30_000` |
| a non-empty registry at entry refuses at once and never enters the drain | "refuses a non-empty registry at entry at once and never enters the drain" — asserts no sleep ran |
| a quiesce that fails leaves the server serving writes | "leaves the server serving writes after a refusal (FD5)" |
| a second quiesce joins the first | "joins a second quiesce to the one in flight instead of nesting one (FD5, FD12)" |
| a `GET` served in maintenance, a `POST` 503 `maintenance` | "serves every exempt read, including the chat and the plan export, and refuses a write" |
| every route on FD9's exempt list, **including** `GET /api/notes/:id/chat` and `GET /api/plans/:id/export` | the same case, which reads all twenty paths back and asserts 200 each |
| a client `conflict` → `ok:false` with that blocker | "turns a client conflict into ok:false with that blocker" |
| a stale or foreign `quiesceId` refused 409, counted, quiesce still `ok:false` | "refuses a report carrying a stale or foreign quiesceId with 409, counts it, and still refuses the quiesce" |
| a report from a window that is not registered is refused | "refuses a report from a window that is not registered" |
| a registered wait whose socket closes → live set empty, `no_response`, never `ok` | "yields no_response, never ok, when a registered wait loses its socket" (`app-quiesce.test.ts` repeats it over a real aborted socket) |
| a quiesce with no window attached at all → `no_response` | "yields no_response when no window was ever attached at all" |
| a retained record blocks a later quiesce with `no_response`, the same tab supersedes, a different tab does not | "keeps an unpersisted obligation counting; the same tab supersedes it and another does not" (controller) and "marks a record when its socket closes, and keeps its obligation counting" (real socket) |
| `stopMaintenanceReporter()` aborts the poll; arming twice leaves one poll | `web/src/lib/maintenance.test.ts` "aborts the poll in flight when it is stopped" and "never leaves two polls open, however many times it is armed" |
| the ten server-observable kinds register and release; `recording` never does | `server/src/jobs/registry.test.ts` "registers and releases each server-observable kind, and never `recording`", plus `server/src/routes/transcribe.test.ts` "registers a transcription job while it runs and releases it afterwards", which reads the registry from inside a live request |

## V5 — the full unit suite, lint and typecheck

- cwd: repository root
- command: `node --version && npm test && npm run lint && npm run typecheck`
- node: `v24.19.0`
- exit code: 0 (`npm test` 0, `npm run lint` 0, `npm run typecheck` 0)
- excerpt: `Test Files 171 passed (171)` / `Tests 2364 passed (2364)`; lint printed
  `All matched files use Prettier code style!` and `THIRD-PARTY-LICENSES.md lists
  all 112 shipped packages.`

## V8 — the whole `e2e/` suite: BLOCKED

- cwd: repository root
- command: `node scripts/v2/sandbox.mjs env --port 7853 > /tmp/apunta-v2-p5.3-v8.env && . /tmp/apunta-v2-p5.3-v8.env && ( cd e2e && PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npx playwright test )`
- sandbox port: 7853, with 7854 free for the es-MX project
- exit code: 1
- result: `16 failed`, `104 passed`, `6 skipped`, `8 did not run`

```
  ✘  51 [chromium] › tests/quiescence.spec.ts:265:3 › C-UPD@1 quiescence › V4: an idle app quiesces …
  ✘  48 [chromium] › tests/spelling.spec.ts:14:1 › marks a typo in the note body and corrects it from the menu
  ✘   … 13 more, in workspace.spec.ts and spelling-es.spec.ts

  1) [chromium] › tests/quiescence.spec.ts:265:3 › V4
    Error: expect(received).toBe(expected)
    Expected: true
    Received: false
      277 |     const answer = await quiesce(request);
    > 277 |     expect(answer.ok).toBe(true);

  2) [chromium] › tests/spelling.spec.ts:14:1
    Error: the page logged console errors
    + Received  + 102
    +   "Failed to load resource: the server responded with a status of 503 (Service Unavailable)",
```

### Why, precisely

Maintenance mode is server-global, and `test.describe.configure({ mode: 'serial' })`
orders the rows **within one file**. `e2e/playwright.config.ts` runs `fullyParallel:
true`, so the other seventeen spec files run at the same time against the same
server. Every write they make inside a quiesce's maintenance window is answered
`503 maintenance` — which is the contract working exactly as FD9 specifies — and
each of those becomes a failed test in a file that has nothing to do with this
card. The server log for the run shows two bursts of `503`s (106 responses over
1.3 s, 12 over 1.6 s) beginning 3 ms after a `POST /api/app/quiesce`.

The rows also stop being deterministic for the same reason. V4 asserts
`ok:true`, and with seventeen other files' windows registering, being asked to
flush and being closed mid-quiesce, `no_response` is the *correct* answer — FD13's
own rule, applied to a bystander window this card never meant to involve.

### The attribution run

The same suite with this card's file excluded:

- command: `… npx playwright test --grep-invert "C-UPD@1 quiescence|recording half"`
- sandbox port: 7853; exit code: 1
- result: `113 passed`, `1 failed`, `6 skipped`
- the one failure is `spelling-assets.spec.ts` in the **es-MX** project, and it
  **also fails on the base tree**: with this card's changes stashed, that spec
  alone exits 1 with the identical assertion. It is pre-existing and is not
  evidence about this card.

So the suite minus this card is green, and every failure above is attributable to
the server-global quiesce.

### What unblocks it, and why it is not this card's to do

The two answers are both outside the May-edit list:

1. **A dedicated Playwright project** for this file, the way
   `language-control.spec.ts` has one (`es-MX-language`) and the rest of the suite
   waits on it (`playwright.config.ts:45,107-122`). That file is Must-not-edit
   here: "no port change, no timeout change, no worker change".
2. **A cross-process lock every spec takes**, the way `acquireAppearanceLock()`
   works today (`e2e/support/fixtures.ts:278`). That fixture file is not in this
   card's May-edit list either, and changing it would touch every spec.

The card's own FD12 anticipated the problem and chose the one answer available
inside its own write scope (`mode: 'serial'` in the spec), which is not sufficient
for a server-global state. This is recorded as a scope blocker, not as a pass.

## Notes that belong to the whole set

- **The global e2e gate rewrote the P2.2 screenshots.** Both suite runs above
  regenerated `docs/v2/evidence/P2.2/screenshots/*.png`; they were restored with
  `git checkout -- docs/v2/evidence/P2.2/screenshots/`, and the restore is
  recorded here because evidence must not be rewritten by a gate.
- **Sanitised.** No sandbox path, home folder, hostname, key or real name appears
  in this directory; the sandbox run folders themselves are under `/tmp` and are
  not committed.