# AM-213 — the P5.3 repair worker's readings

Two owner decisions from AM-213, both landed on top of the uncommitted P5.3
implementation: the quiescence spec's own Playwright project, and the
flush-save exemption. Every command below ran from the repository root on the
pinned Node (`v24.19.0`), inside a sandbox run folder, on the port the card
assigned to that row. Nothing contacted 7717 or the live data folder.

## 1. The V8 isolation: `e2e/playwright.config.ts`

`quiescence.spec.ts` now has a project of its own — `quiescence` — with its own
`webServer` on its own port and its own data folder, following the
`es-MX-language` pattern the card names. It is excluded from the two default
projects (`chromium` and `es-MX` now `testIgnore` it), so it is collected **in
that project and nowhere else** and maintenance mode can no longer reach another
spec file.

What was **not** done, because AM-213 forbids it: no global `workers: 1`, no
retries, no skips, no timeout inflation. `retries`, `workers`, `reporter` and
the two `webServer` `timeout: 60_000` startup timeouts are untouched; the spec
still declares `test.describe.configure({ mode: 'serial' })` for itself and no
row calls `test.setTimeout`, so the per-test budget is still Playwright's 30 000
ms default.

**The third port.** The English server takes `APUNTA_E2E_PORT`, the es-MX server
`APUNTA_E2E_ES_PORT` (default `port + 1`), and the quiescence server
`APUNTA_E2E_QUIESCENCE_PORT` (default `port + 2`), each with a data folder beside
the sandbox run folder. Every row's literal port is unchanged, so the ports each
row actually opened were:

| Row | sandbox | English | es-MX | quiescence |
| --- | --- | --- | --- | --- |
| V2 | 7853 | 7853 | 7854 | 7855 |
| V3 | 7855 | 7855 | 7856 | 7857 |
| V4 | 7857 | 7857 | 7858 | 7859 |
| V6 | 7875 | 7875 | 7876 | 7877 |
| V7 | 7868 | 7868 | 7869 | 7870 |
| V9 | 7871 | 7871 | 7872 | 7873 |
| V8 | 7853 | 7853 | 7854 | 7855 |

All inside C-ISO@1 rule 2's 7800–7889 range, all sequential (one row at a time),
and none of them 7717.

### The command correction, before and after

The rows that pass a project name had to change: `--project=chromium` no longer
collects this file, so leaving them would have run zero tests and failed. Only
the project name changed — ports, greps, flags and paths are byte for byte as the
card has them.

| Row | before | after |
| --- | --- | --- |
| V2 | `… npx playwright test --project=chromium quiescence.spec.ts --grep "V2"` | `… npx playwright test --project=quiescence quiescence.spec.ts --grep "V2"` |
| V3 | `… --project=chromium quiescence.spec.ts --grep "V3"` | `… --project=quiescence quiescence.spec.ts --grep "V3"` |
| V4 | `… --project=chromium quiescence.spec.ts --grep "V4"` | `… --project=quiescence quiescence.spec.ts --grep "V4"` |
| V6 | `… --project=chromium quiescence.spec.ts --grep "V6"` | `… --project=quiescence quiescence.spec.ts --grep "V6"` |
| V7 | `… --project=chromium quiescence.spec.ts --grep "V7"` | `… --project=quiescence quiescence.spec.ts --grep "V7"` |
| V9 | `… --project=chromium quiescence.spec.ts --grep "V9"` | `… --project=quiescence quiescence.spec.ts --grep "V9"` |
| V8 | `… npx playwright test` | **unchanged** — the whole suite, which now includes the new project |

The card (`docs/v2/cards/P5.3.md`) carries the six corrected commands.

### The second thing isolation needed, and why it was not the config's job

The first isolated V8 run still failed V4. The cause is **inside** the file, not
across files: FD13 is deliberately fail-closed, so a window that disconnects
without ever reporting cleanly leaves a retained record whose unpersisted
obligation blocks every later quiesce with `no_response`. In one serial run over
one server, V2's window (never asked, because V2's quiesce is refused at entry),
V3's window (reports `conflict`), and V6/V7's windows (never asked) each leave
one behind — and V4 asserts `ok:true`. That is the contract working exactly as
written; it is only a problem because the rows share a server.

The fix is in the spec, not the config, and it is the production mechanism doing
the work: every row's window registers under **one shared tab identity**
(`e2e-quiescence-tab`, seeded into `sessionStorage` by `page.addInitScript`
before the app's first line runs), so each row's registration supersedes the
record the previous one left behind, by FD13(c)'s own rule. No server switch, no
reset endpoint, no fault injection. V9 opts out where the row is *about* the
difference — its dirty primary comes back under the shared identity, its second
and third windows carry their own — so "a different tab does not supersede" is
still exactly what it proves.

### V8, reading by reading

- **reading 1** — exit **1**, 2026-10-05T01:17:19Z → 01:18:19Z, sandbox 7853.
  `2 failed, 115 passed, 6 skipped, 5 did not run`:
  - `[quiescence] V4 … expect(answer.ok).toBe(true)` received `false` — the
    intra-file leak above;
  - `[es-MX] spelling-assets.spec.ts:53` — see the last section.
- **reading 2** — exit **0**, 2026-10-05T01:21:28Z → 01:22:21Z, sandbox 7853,
  after the shared-identity change in the spec. `122 passed, 6 skipped`
  (was 113 passed + 1 failed + 6 skipped for the suite minus this file, and
  104 passed + 16 failed + 8 did not run before the isolation). All seven
  quiescence rows passed, including the new one, with **no** other spec file
  seeing a `503`.

V8 is a whole-suite row, so it was run twice here rather than retried: the first
reading is kept above with the reason it failed, and no retry, skip or timeout was
added to reach the second.

### V4's `ok:true` determinism, re-checked now that it is isolated

Three consecutive readings, same row, same command, no retry configured
(`retries` is 0 outside CI, as it was before):

| reading | started (UTC) | exit | result |
| --- | --- | --- | --- |
| 1 | 2026-10-05T01:16:06Z | 0 | 1 passed (5.6s) |
| 2 | 2026-10-05T01:17:02Z | 0 | 1 passed (5.6s) |
| 3 | 2026-10-05T01:17:08Z | 0 | 1 passed (5.7s) |

Three for three in isolation, against one red in V8 reading 1 where seventeen
other files' windows were registering against the same server. That is the
nondeterminism the isolation removed.

## 2. The flush-save exemption (AM-213)

**The carrier is the query string**, beside the `tab` the registration and the
report already use — `PATCH /api/notes/:id?quiesce=<id>&tab=<tabId>` — for
FD1's reason: this channel's identity lives in the query string, so the exemption
does not invent a second place for it. No header, no new route, no new verb.

**Server** (`server/src/maintenance.ts`, `flushSaveExempt`): four conditions, all
of which must hold, and failing any of them is the ordinary `503 maintenance` —
the method and path (`PATCH /api/notes/:id`, never `/api/notes/:id/chat`), a
quiesce in flight, that quiesce's own id, and a `tab` that resolves to a window
**asked to flush in this quiesce**. The note save itself is untouched: same
revision check, same published lock, same `stale_write`.

**Client** (`web/src/lib/maintenance.ts`, `noteSaveExemption`): the reporter owns
that identity, so it carries it. `NoteView.tsx` is not this protocol's to edit and
`web/src/api/*` builds its own URLs, so the reporter decorates `fetch` for exactly
as long as the flush runs — only a `PATCH` to `/api/notes/<id>`, restored in a
`finally`, every other method, path and the reporter's own report passed straight
through. A window with no tab identity asks for nothing: its save is refused and
its flush says so, which is the honest direction.

**Docs**: the one-sentence exemption is in FD9 (`docs/v2/cards/P5.3.md`) and in
C-UPD@1's Quiescence paragraph (`docs/v2/CONTRACTS.md`).

### V1 — the named cases, exit 0

- cwd: repository root
- command: `node --version && npm run build:shared && npx vitest run server/src/maintenance.test.ts server/src/jobs server/src/routes/app-quiesce.test.ts web/src/lib/maintenance.test.ts --reporter=verbose`
- node: `v24.19.0` · exit code: **0** · 4 files, **57** tests, 0 skipped
  (the implementer's reading was 50; +7 here)

| The row asks for | The test that shows it |
| --- | --- |
| exempt save accepted | `server/src/maintenance.test.ts` "accepts the reporting window's own note save during the flush step" — asserts 200 **and** that the stored content is the text the window saved |
| stale-id save refused | "refuses a note save carrying a stale or foreign quiesce id" — a foreign id **and** no id at all are each 503, the note is untouched, and the quiesce itself is unaffected |
| non-note write refused | "refuses a non-note write during the flush step" — `POST /api/notes`, `DELETE /api/notes/:id`, `POST /api/notes/:id/publish`, `POST /api/patients` and `POST /api/notes/:id/chat`, all carrying the right quiesce id, all 503 |
| a save from an unregistered window is refused | "refuses a note save from a window that is not registered" — the right quiesce's id in a stranger tab's hand buys nothing |
| quiesce with savable text ends `ok:true` after the flush | "settles ok:true when the flush's own save lands, with the text on disk" — the exact browser order (save, then report) and asserts `ok:true`, the stored content, and that maintenance is held afterwards |
| the client half, named | `web/src/lib/maintenance.test.ts` "carries the quiesce and this tab's identity on the flush's own note save" and "touches nothing but that save, and puts fetch back afterwards" |

### The e2e case that shows it end to end

`e2e/tests/quiescence.spec.ts` gains one case, "the flush exemption: unsaved text
reaches the disk and the quiesce settles `ok:true`", which runs inside V8. It
stops the **page's own clock** (`page.clock.install()`) before typing, so the
editor's 400 ms save debounce never fires and what the editor holds is text the
server has never been sent. Without that the row would be a race — a debounce
that landed first would let it pass without ever exercising the exemption. The
precondition is asserted (`GET /api/notes/:id` still holds the old text), the
trigger is the production `POST /api/app/quiesce`, and the row asserts
`ok:true`, the typed text on disk, and the bounded release afterwards.

The server log for a passing run shows the whole protocol in order, which is the
clearest evidence the exemption is the reason it passes:

```
POST /api/app/quiesce                                     → 200
PATCH /api/notes/<id>?quiesce=<id>&tab=<tabId>            → 200   ← the exempt save
POST /api/app/quiesce/report?tab=<tabId>                 → 200
```

## 3. The rows

All Playwright rows ran with `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium`
inside `scripts/v2/sandbox.mjs env --port <p>`, from `e2e/`.

| Row | port | started (UTC) | exit | result |
| --- | --- | --- | --- | --- |
| V1 | — | 2026-10-05T01:22:39Z | **0** | 4 files, 57 tests, 0 skipped |
| V2 | 7853 | 2026-10-05T01:15:34Z | **0** | 1 passed |
| V3 | 7855 | 2026-10-05T01:15:46Z | **0** | 1 passed |
| V4 | 7857 | 01:16:06Z, 01:17:02Z, 01:17:08Z | **0** | 1 passed ×3 |
| V5 | — | 2026-10-05T01:22:45Z | **0** | `npm test` 2371 passed (171 files), lint 0, typecheck 0 |
| V6 | 7875 | 2026-10-05T01:16:20Z | **0** | 2 passed |
| V7 | 7868 | 2026-10-05T01:16:28Z | **0** | 1 passed |
| V8 | 7853 | 01:17:19Z (1), 01:21:28Z (0) | **0** | 122 passed, 6 skipped |
| V9 | 7871 | 2026-10-05T01:16:34Z | **0** | 1 passed |

## 4. `spelling-assets.spec.ts` (es-MX) — reported, not fixed

The implementer recorded that this spec fails on the base tree too. **In my
isolated full runs it is flaky rather than deterministically red**, which is the
new information:

- **V8 reading 1** — **failed**:
  `[es-MX] › tests/spelling-assets.spec.ts:53:1 › no dictionary asset is requested
  until a spell surface mounts`, `expect.poll(() => requested.length, {timeout:
  15_000}).toBe(2)` → received `4`. Identical assertion to the implementer's
  attribution run.
- **V8 reading 2** — **passed**, in 983 ms, in the same run where V4 also passed.

So it is a load-sensitive flake rather than a settled failure: the second reading
carried one more project than the implementer's attribution run did, and still
passed. It is in the `es-MX` project, which has its own server and never collects
a quiescence spec, so nothing in P5.3 or in AM-213 reaches it — and the two
readings disagree with each other, which is the definition of a flake.

**Not re-verified here:** I did not re-run the base-tree attribution (stashing
this card's uncommitted work while another worker has files in flight is not a
risk worth taking), so the implementer's "it also fails on the base tree" stands
as recorded rather than as something this worker measured. **Not fixed**, per the
instruction: if it does bite CI it needs its own row and its own owner.

## 5. Notes

- **The e2e gate rewrote the P2.2 screenshots again**, both V8 runs. Restored
  with `git checkout -- docs/v2/evidence/P2.2/screenshots/`, twice, and
  recorded here because evidence must not be rewritten by a gate.
- **No commit, no push, no `git add`.** The tree is left dirty for the
  coordinator, with `scripts/v2/tauri-e2e-smoke.test.mjs` and
  `docs/v2/cards/P3.6.md` untouched (the other worker committed those in
  `f213dbd`/`6631449` while this work was in flight).
- **The card's "Must not edit" still lists `e2e/playwright.config.ts`** with "no
  port change, no timeout change, no worker change". AM-213 put that file in this
  card's May-edit list for exactly the project above, and none of those three
  things changed; the card line was left as written because correcting it was
  not in this worker's scope.
- **Sanitised**: no sandbox path, home folder, hostname, key or real name in this
  file. The run folders are under `/tmp` and are not committed.