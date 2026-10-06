# P5.3 implementation review 5 — run evidence (2026-10-06)

Independent acceptance of the committed candidate under review: base
`e62c94f239d634faa966636836c468d7b9cd9131`, head `386e3ea46a1c0e1ed942bb94169e9894780b0415`.
The reviewer did not write this change and did not rely on the implementer's
verdict: every row below was re-run from the committed tree.

Sanitized per RUN-CONFIG §4: sandbox paths are written `<sandbox>/…`, the home
folder `~`, and no hostname, username, key, token or real name appears. Raw logs
stay in the sandbox run folders and are not committed.

## Environment

| | |
| --- | --- |
| Working directory | repository root for every command below (the `cd e2e` inside a row's subshell is the row's own) |
| Node | `export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH"`; `node --version` printed `v24.19.0` at the head of every row |
| Chromium | `/usr/bin/chromium`, passed as `PLAYWRIGHT_CHROMIUM_EXECUTABLE` (the image ships its own browser; nothing downloads one) |
| Sandbox | `node scripts/v2/sandbox.mjs env --port <p>` → `<sandbox>/<run-id>/{data,installation,logs}`, exporting `APUNTA_DATA_DIR`, `APUNTA_PORT`, `APUNTA_NO_OPEN`, `APUNTA_TEST_RUN_ID`, `APUNTA_V2=1`, `APUNTA_CHECK_URL`, `APUNTA_E2E_PORT`. Each row got its own run folder and sourced its own env file in its own subshell |
| Fake mode | `e2e/playwright.config.ts` `serverEnv` sets `APUNTA_FAKE_AI: '1'` for all three webServers, so every browser row ran with no AI tooling installed (hard rule 3) |
| Serialisation | rows ran one after another; no two rows' time windows overlap |
| Ports (all preflighted free; none 7717) | V2/V7/V8 `7853` (es-MX `7854`, quiescence `7855`) · V3 `7855` (`7856`, `7857`) · V4 `7866` (`7867`, `7868`) · V6 `7875` (`7876`, `7877`) · V9 `7871` (`7872`, `7873`) · V1 and V5 bind no port |

## Rows

All commands are the dispatch's, verbatim.

### V1 — unit/integration on the four named paths

```text
export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" && node --version && npm run build:shared && npx vitest run server/src/maintenance.test.ts server/src/jobs server/src/routes/app-quiesce.test.ts web/src/lib/maintenance.test.ts --reporter=verbose
```

- Start `2026-10-06T16:30:34Z`, end `2026-10-06T16:30:36Z`, **exit 0**.
- `v24.19.0`; `Test Files 4 passed (4)`; `Tests 111 passed (111)`; vitest `Duration 1.33s`.
- **Zero skipped**, and no `No test files found` for any of the four paths.
- Raw: `<sandbox>/review-P5.3-impl5/V1.log`.

Every case the dispatch requires by name is present in that output, including:

```text
✓ the drain and its bound (FD4) > reaches the 30 s bound and refuses with the still-active kinds as blockers 52ms
✓ the drain and its bound (FD4) > refuses a non-empty registry at entry at once and never enters the drain
✓ the drain and its bound (FD4) > leaves the server serving writes after a refusal (FD5)
✓ the drain and its bound (FD4) > joins a second quiesce to the one in flight instead of nesting one (FD5, FD12)
✓ maintenance mode and the refusal hook (FD9) > serves every exempt read, including the chat and the plan export, and refuses a write
✓ maintenance mode and the refusal hook (FD9) > never cuts work that was already past the hook, and refuses it by name
✓ the flush-step save exemption (AM-213) > refuses a note save carrying a stale or foreign quiesce id
✓ the flush-step save exemption (AM-213) > settles ok:true when the flush's own save lands, with the text on disk
✓ the window phase (FD2) > turns a client conflict into ok:false with that blocker
✓ the window phase (FD2) > refuses a report carrying a stale or foreign quiesceId with 409, counts it, and still refuses the quiesce
✓ the window phase (FD2) > refuses a report from a window that is not registered
✓ the window phase (FD2) > yields no_response, never ok, when a registered wait loses its socket
✓ the window phase (FD2) > yields no_response when no window was ever attached at all
✓ a retained disconnected record (FD13) > keeps an unpersisted obligation counting; the same tab supersedes it and another does not
✓ the maintenance reporter > aborts the poll in flight when it is stopped
✓ the maintenance reporter > never leaves two polls open, however many times it is armed
✓ the ten server-observable kinds … > registers and releases 'backup' through 'routes/backup.ts:73'
✓ the ten server-observable kinds … > never registers the browser-side recording kind server-side
✓ a duplicated tab identity > a clean report from one copy settles nothing over the other copy's retained obligation
✓ a duplicated tab identity > asks a duplicate that arrives mid-quiesce, rather than skipping it as answered
```

The 30 s bound case runs in 52 ms — driven through the FD4 seam, not by sleeping
30 s, as the row requires.

### V2 — refine streaming

```text
export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" && node --version && node scripts/v2/sandbox.mjs env --port 7853 > /tmp/apunta-v2-p5.3-v2.env && . /tmp/apunta-v2-p5.3-v2.env && ( cd e2e && PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npx playwright test --project=quiescence quiescence.spec.ts --grep "V2" )
```

- Run `<sandbox>/2026-10-06T16-31-55-087Z-a06ecbbc`, start `16:31:55Z`, end `16:32:04Z`, **exit 0**.
- `Running 1 test using 1 worker` → `1 passed (9.5s)`; no retry, no flaky line.

### V3 — stale-write conflict

```text
… sandbox.mjs env --port 7855 … --grep "V3"
```

- Run `<sandbox>/2026-10-06T16-32-19-083Z-f40683e0`, `16:32:19Z`–`16:32:26Z`, **exit 0**.
- `Running 1 test using 1 worker` → `1 passed (7.0s)`.
- The row's own `npm run build` ran in the webServer (`[WebServer]` lines in the log), so the run is a fresh build, not a leftover.

### V4 — idle quiesce and bounded release

```text
… sandbox.mjs env --port 7866 … --grep "V4"
```

- Run `<sandbox>/2026-10-06T16-32-38-836Z-9065e504`, `16:32:38Z`–`16:32:44Z`, **exit 0**.
- `Running 1 test using 1 worker` → `1 passed (5.7s)`.

### V5 — full tests, lint, typecheck

```text
export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" && node --version && npm test && npm run lint && npm run typecheck
```

- First run exited 0 (`<sandbox>/review-P5.3-impl5/V5.log`), but that log carried
  no start stamp, so it was re-run for this record with both stamps.
- Stamped run: start `2026-10-06T16:46:37Z`, end `2026-10-06T16:47:09Z`, **exit 0**
  (`TEST_EXIT=0`, `LINT_EXIT=0`, `TYPECHECK_EXIT=0`).
- `v24.19.0`; `Test Files 170 passed (170)`; `Tests 2461 passed (2461)`; lint `TOTAL 0`
  (prettier clean, licence check clean); `tsc` clean in `server`, `web`, `shared`, `e2e`.
- Raw: `<sandbox>/review-P5.3-impl5/V5b.log`.

### V6 — the close policy (guard + recording)

```text
… sandbox.mjs env --port 7875 … --grep "V6"
```

- Run `<sandbox>/2026-10-06T16-33-27-948Z-ae68bef9`, `16:33:27Z`–`16:33:36Z`, **exit 0**.
- `Running 2 tests using 1 worker` → `2 passed (8.3s)` (V6a and V6b).

### V7 — a save in flight defers the close

```text
… sandbox.mjs env --port 7853 … --grep "V7"
```

- Run `<sandbox>/2026-10-06T16-33-43-644Z-c3146789`, `16:33:43Z`–`16:33:50Z`, **exit 0**.
- `Running 1 test using 1 worker` → `1 passed (6.3s)`.

### V8 — the whole `e2e/` suite, default-parallel, no retries

The dispatch's command is:

```text
… sandbox.mjs env --port 7853 > /tmp/apunta-v2-p5.3-v8.env && . /tmp/apunta-v2-p5.3-v8.env && ( cd e2e && PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npx playwright test )
```

**Environment note (the one deliberate deviation, and why).** This shell
inherits `CI=true`. With it, `playwright.config.ts:121-124` selects
`retries: 2`, `workers: 1`, `forbidOnly` — one worker is *not* the default-parallel
run the card's `nextAllowedAction` demands ("default-parallel V8 with no
retries"), and a retry could mask a flake. So the row was run with `CI` unset
and the no-retries flag stated explicitly:

```text
( cd e2e && env -u CI PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npx playwright test --retries=0 )
```

Nothing else was added or removed: same sandbox env, same working directory,
same browser, same projects. Under `env -u CI` the config's own `retries: 0`
and default worker count apply; `--retries=0` makes the requirement independent
of the config.

- Run `<sandbox>/2026-10-06T16-34-00-676Z-36d55018`, `16:34:00Z`–`16:35:04Z`, **exit 0**.

```text
Running 123 tests using 4 workers
  6 skipped
  117 passed (1.1m)
```

- 4 workers = Playwright's default on this 8-CPU box (the config sets no
  `workers` outside CI).
- 0 failed, 0 flaky, 0 retries: the log contains no `flaky`, `retrying` or
  second-attempt line at all.
- Passed per project: `chromium` 49, `es-MX` 52, `es-MX-language` 5,
  `quiescence` **11** — every quiescence case in the file, including all four V9 rows.

**The six skips, with their reasons.** All six are the pre-existing conditional
skips in `e2e/tests/language-control.spec.ts`; none is new, and
`quiescence.spec.ts` has no skip at all (`grep -nE "test.skip|fixme|test.setTimeout"`
over the spec returns nothing):

| # | Project | Case | Why it skips |
| --- | --- | --- | --- |
| 1 | `chromium` | `language-control.spec.ts:104` — V2: disabled with its reason while a refine streams | `test.skip(appLocale !== 'es-MX', …)` in the describe's `beforeEach` (`:101`), reason *"the Language control exists only where Spanish is offered"*; the English build has no control |
| 2 | `chromium` | `language-control.spec.ts:154` — V2: the server refuses a language change while a draft streams | same `beforeEach` |
| 3 | `chromium` | `language-control.spec.ts:203` — V3: switching applies at once and survives leaving the control | same `beforeEach` |
| 4 | `chromium` | `language-control.spec.ts:268` — V2 on the dialog | same `beforeEach` |
| 5 | `chromium` | `language-control.spec.ts:385` — V3 on the dialog | same `beforeEach` |
| 6 | `es-MX-language` | `language-control.spec.ts:80` — Language: not offered on a build without the dev switch | `test.skip(appLocale !== 'en', …)` (`:81`), reason *"the English project is the build that does not offer Spanish"*; that project's build has `APUNTA_DEV_SPANISH=1` |

That is 5 + 1 = 6, matching the historical count the implementer also reported.

### V9 — FD13 dirty pre-quiesce disconnect (AM-215 siblings)

```text
… sandbox.mjs env --port 7871 … --grep "V9"
```

- Run `<sandbox>/2026-10-06T16-35-42-187Z-2730c755`, `16:35:42Z`–`16:35:53Z`, **exit 0**.
- `Running 4 tests using 1 worker` → `4 passed (11.2s)`:
  the dirty disconnect row, plus AM-215's clean close, dirty close and silent
  death rows.

## AM-223 dispatcher verification

```text
node --test docs/v2/tools/build-dispatch.test.mjs
```

- At `386e3ea`: **exit 0 — 26 tests, 26 pass, 0 fail, 0 skipped**.
- Re-run at HEAD `df2ef35` after the formatting-only commit landed mid-review:
  **exit 0 — 26 tests, 26 pass, 0 fail, 0 skipped** (`16:49:21Z`–`16:49:22Z`),
  raw `<sandbox>/am223-build-dispatch.test.head.log`.
- `npx prettier --check docs/v2/tools/build-dispatch.mjs docs/v2/tools/build-dispatch.test.mjs`
  → *"All matched files use Prettier code style!"*, exit 0.

Boundary probes driven directly at the CLI (`--print`, so nothing is written),
each as `node docs/v2/tools/build-dispatch.mjs <card> --base 386e3ea --port 7853
--attempt <n> [--attempt-exception AM-nnn] --print`, exit code read from the
process, stderr shown trimmed. Run at HEAD `df2ef35`, after the formatting
commit:

| # | Card | Attempt | Exception | Exit | Refusal message (stderr) |
| --- | --- | --- | --- | --- | --- |
| 1 | P5.3 | 1 | — | **0** | — |
| 2 | P5.3 | 4 | *(missing)* | 2 | `--attempt 4 requires --attempt-exception <AM-nnn> naming the owner amendment that authorised it` |
| 3 | P5.3 | 4 | `AM-049` | **0** | — (any well-formed amendment reaches attempt 4; unchanged) |
| 4 | P5.3 | 5 | `AM-218` | **0** | — (AM-223's grant) |
| 5 | P5.3 | 5 | `AM-214` | 2 | `only P3.4 may carry it, except P5.3 with AM-218` |
| 6 | P5.2 | 5 | `AM-218` | 2 | `only P3.4 may carry it, except P5.3 with AM-218` |
| 7 | P3.4 | 5 | `AM-218` | **0** | — (P3.4's pre-existing AM-189 fifth-attempt grant, untouched) |
| 8 | P3.6 | 5 | `AM-214` | 2 | `only P3.4 may carry it, except P5.3 with AM-218` |
| 9 | P3.4 | 6 | `AM-214` | **0** | — (P3.4's pre-existing sixth-attempt exception, untouched) |
| 10 | P3.6 | 6 | `AM-214` | 2 | `only P3.4 may carry it` |
| 11 | P3.6 | 7 | `AM-214` | **0** | — (AM-223's other grant) |
| 12 | P3.6 | 7 | `AM-212` | **0** | — (the same grant's sibling amendment) |
| 13 | P3.6 | 7 | `AM-218` | 2 | `only P3.6 with AM-212 or AM-214 may carry it; no attempt 8` |
| 14 | P3.4 | 7 | `AM-214` | 2 | same |
| 15 | P5.3 | 8 | `AM-218` | 2 | `--attempt 8 is beyond any authorised budget; no attempt 8` |
| 16 | P5.3 | 5 | `AM218` (malformed) | 2 | `--attempt 5 requires --attempt-exception <AM-nnn> …` |
| 17 | P5.4 | 1 | — | **3** | `not dispatchable: dependencies not APPROVED: P5.3, P3.R` — the dependency gate is unchanged, and no PASS is produced on exit 3 |

Probes 4, 5, 11 and 15 are the whole of AM-223's widening: P5.3 attempt 5 with
AM-218, and P3.6 attempt 7 with AM-212 or AM-214. Everything else in the table
still fails closed exactly as it did before the repair.

AM-223 (`docs/v2/state/AMENDMENTS.md:485`) authorises exactly two keyed grants —
P5.3 attempt 5 keyed to AM-218, P3.6 attempt 7 keyed to AM-212 or AM-214 — and
nothing else: no reset, no ceiling increase, no sixth P5.3 attempt, no eighth
P3.6 attempt. That is what the tool now permits and everything else it still
refuses.

## Source review — two measurements behind the findings

### Exempt-read inventory (finding 1)

```text
grep -rn "app\.get(" server/src --include='*.ts' | grep -v '\.test\.ts'
awk '/^const EXEMPT_READS/,/^\];/' server/src/maintenance.ts | grep -c "^  '"
```

| | |
| --- | --- |
| `app.get(` handlers under `server/src/routes/` (the main app) | **20** |
| entries in `EXEMPT_READS` (`server/src/maintenance.ts:844`) | **19** |
| registered but not exempt | **1** — `GET /api/backup/folders`, `server/src/routes/backup.ts:77` |
| doc comment on the list (`maintenance.ts:837-839`) | "All **seventeen** `GET` routes in `server/src/routes/` are here" |
| test comment and loop (`maintenance.test.ts:333`, `:334-354`) | "all **seventeen** `GET`s"; 17 URLs, no `/api/backup/folders` |
| FD9 inventory (card `docs/v2/cards/P5.3.md:397-401`, copied into `dispatch/P5.3.md:437` and `dispatch/P5.3-review.md:449`) | "**eighteen**" routes, listing `backup.ts:49` (now `:57`) and `licenses.ts:27` (file deleted at `80b8089`, an ancestor of the base) |

`git diff e62c94f..386e3ea -- server/src/maintenance.ts` touches only the
`answered` re-key and its comment: `EXEMPT_READS` itself is unchanged, so the
omission is **pre-existing at the base** and not introduced by this candidate.
`/api/backup/folders` was added at the base itself (`e62c94f`, "Apply the second
owner UI feedback batch").

Effect during maintenance: that one route answers `503` with error code
`maintenance` — fail-closed, the direction C-UPD@1 requires, so no write guard is
weakened and no V row depends on it.

### Generated-dispatch wording guards (finding 2)

```text
git diff e62c94f..386e3ea -- docs/v2/tools/build-dispatch.mjs
```

The diff changes only the exception guards, their refusal messages and the
attempt-7 line; the attempt-4, attempt-5 and attempt-6 line templates and the
attempt-4/5/6 missing-exception message are byte-identical before and after.
Regenerating two shipped dispatches confirms it rather than inferring it:

```text
S2.5: attempt-4 line BYTE-IDENTICAL to docs/v2/state/dispatch/S2.5.md
P4.1: attempt-4 line BYTE-IDENTICAL to docs/v2/state/dispatch/P4.1.md
```

(`node docs/v2/tools/build-dispatch.mjs <card> --base 386e3ea --port 7853
--attempt 4 --attempt-exception <am> --print`, compared with the committed line;
`--print` writes no file.) All three files the deleted "shipped attempt-4"
test read — `S2.5.md`, `P4.1.md`, `P4.1-ir.md` — still carry a correctly shaped
attempt-4 line, so that test and `T5`, `T5b`, the attempt-5/6 parallel-sentence
tests and the attempts-1–3 line assertion would all still pass against this
tree. They were deleted rather than re-pinned, and the suite now has no
assertion over generated dispatch prose at all.

## HEAD moved during the review (recorded, not a stop)

- The review began at `386e3ea`, the head the dispatch names.
- Two commits landed on top of it while rows were running:

  | Commit | Landed | Files |
  | --- | --- | --- |
  | `df2ef35` "Format authorized dispatcher exceptions" | `16:33:20Z` | `docs/HANDOFF.md`, `docs/v2/tools/build-dispatch.mjs`, `docs/v2/tools/build-dispatch.test.mjs` |
  | `916e3eb` "Ground native smoke controls in the shipped interface" | `17:00:26Z` | `docs/HANDOFF.md`, `docs/v2/state/AMENDMENTS.md`, `docs/v2/state/cards/P3.6.json`, `docs/v2/state/reviews/P3.6-compat-source.md`, `scripts/v2/tauri-e2e-smoke.test.mjs` |

  Both are parallel work outside this card; neither commit message nor body is
  about P5.3, and `df2ef35`'s body says CI caught formatting in the two tooling
  files, applied "without changing authorization behavior".
- `git diff --name-only 386e3ea..HEAD` lists those seven files. **No P5.3 source
  path differs**, so every V row tested the same
  `server/src/maintenance.ts`, `server/src/maintenance.test.ts`,
  `e2e/tests/quiescence.spec.ts` and `shared/src/i18n/es-MX.ts` bytes as
  `386e3ea`; the web build never reads the dispatcher, and `916e3eb` touches no
  file any row executes except `scripts/v2/tauri-e2e-smoke.test.mjs`, which no P5.3
  row runs.
- `df2ef35`'s delta is whitespace only (one `fail(…)` collapsed to one line, two
  blank lines removed). Behaviour was re-verified anyway, three times in total:
  26/26 at `386e3ea`, 26/26 at `df2ef35` (`16:49:21Z`), and 26/26 at `916e3eb`
  (`17:05:35Z`), with `prettier --check` clean on both tooling files.
- AM-223 itself is untouched by either commit: `git diff 386e3ea..HEAD --
  docs/v2/state/AMENDMENTS.md` appends only AM-224 (the parallel S6.1 line), and
  AM-223 still reads exactly as quoted above.

## Working-tree hygiene

- Nine paths were already dirty when the review started and are owner-authorized
  parallel work. They were not restored, staged, edited or committed:
  `THIRD-PARTY-LICENSES.md`, `docs/v2/evidence/S6.1/acquisition.md`,
  `docs/v2/evidence/S6.1/notice-checklist.md`,
  `docs/v2/state/S6.1-NOTICE-PROVENANCE.md`, `docs/v2/state/cards/P3.6.json`,
  `docs/v2/state/cards/S6.1.json`, `docs/v2/state/dispatch/P5.3-review.md`,
  `docs/v2/state/returns/S6.1.md`, `scripts/v2/tauri-e2e-smoke.test.mjs`.
  The dispatch file's dirty diff is only the head/base line moving
  `fd1b159` → `386e3ea`, i.e. the attempt-5 regeneration; no row text changed.
- **V8 rewrote the four tracked P2.2 screenshots** (the suite regenerates them).
  They were restored with `git checkout -- docs/v2/evidence/P2.2/screenshots/…`
  — the only tracked-path change this review made, and it returned those four
  files to their committed bytes rather than adopting new historical evidence.
- `docs/v2/state/PROGRESS.json` became dirty at `16:41:27Z` from parallel work
  (`S6.1` BLOCKED → IN PROGRESS) during this review. It was left alone.
- `docs/v2/state/AMENDMENTS.md` went dirty later in the review from the same
  parallel work (AM-224 appended below AM-223 at `:489`) and was then committed
  by that line at `17:00:26Z` as `916e3eb`; `docs/v2/state/cards/P3.6.json` was
  committed in the same pass. AM-223 itself at `:485` was never changed, and it
  was re-read from `HEAD` after the commit (`git show HEAD:… | grep -c AM-223`
  → 2). The tree therefore changed under the review without any of it being
  this reviewer's doing; at the last check it held **9 dirty tracked paths**,
  every one of them owner-authorized parallel work.
- The two reports this review was asked to write are the only files it created:
  `docs/v2/evidence/P5.3/impl5-review.md` (this file) and
  `docs/v2/state/reviews/P5.3-impl5.md`.
- Every dispatcher probe used `--print`, which returns before `mkdirSync`/
  `writeFileSync` (`build-dispatch.mjs:452-459`), so the boundary table above
  regenerated no dispatch file; `git status --porcelain` was identical before
  and after that batch apart from the parallel work named above.
- Nothing was staged, committed, pushed, reset, rebased or reverted; no port
  7717, no live data directory, no real Claude export, no outbound network call
  from any command above.
