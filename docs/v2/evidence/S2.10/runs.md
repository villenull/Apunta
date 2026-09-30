# S2.10 — runs

**Card:** S2.10, role IMPLEMENTATION, L1. **Base commit:** `3640c74` (= HEAD
for the whole session; the change is left uncommitted for the coordinator).
**Date:** 2026-09-30, UTC throughout. **Sandbox:** one
`scripts/v2/sandbox.mjs env --port 7854` for every command below, run folder
`<sandbox>` (`/tmp/apunta-v2/2026-09-30T04-02-39-478Z-2ffbbd8c/`), English server
on `7854`, es-MX server on `7854 + 1` = `7855` with `<sandbox>/data-es-MX`
(`e2e/playwright.config.ts:32-36`). Env file
`/tmp/apunta-v2-s2.10-e2e.env`, outside the checkout. A second env on `7856`
(es-MX `7857`) was taken **only** for the fresh-sandbox contrast in §Diagnosis
5, inside its own subshell, never sourced into the outer shell.

`PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium` is exported on every
Playwright command — the box's documented escape hatch
(`e2e/playwright.config.ts:57-61`; `~/.cache/ms-playwright` holds no revision for
the installed `@playwright/test`). Nothing was downloaded (HS-3); **7717 was
never contacted**; no live data folder, backup, Claude export or Halaxy PDF was
opened; no `git stash`, reset, checkout of tracked source, or commit.

The suite runs in fake-AI mode (`e2e/playwright.config.ts:48-55`) and every row
it creates is fabricated through its own API calls (HS-8). `7854`–`7859` were
verified free of listeners after the last run. `docs/v2/evidence/P2.2/screenshots/`
was restored with `git checkout -- docs/v2/evidence/P2.2/screenshots/` after
**every** Playwright test run in this session (37 of them, all in the
`<sandbox>/logs/` inventory: 3 base, 1 step-1b, 2 traced contrasts, 3 amplified
diagnostic runs, 11 traced full-suite diagnostic runs, 2 in V1, 5 in V3's first
set, 5 in V3's second). V4 below is the proof.

Logs live in `<sandbox>/logs/` and stay there (RUN-CONFIG §4); every path below
is written `<sandbox>`.

---

## Step 1 — the tripwire, at the base, before anything was edited

The RUN-CONFIG §3 e2e line, three times, default workers, tree at `3640c74`,
env sourced from `/tmp/apunta-v2-s2.10-e2e.env`.

```
for i in 1 2 3; do
  PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run e2e > "$RUN_LOGS/base-run-$i.log" 2>&1
  rc=$?
  echo "base run $i exit=$rc"
  git checkout -- docs/v2/evidence/P2.2/screenshots/
done
```

| Run | Window (UTC) | Exit | Counts | Failure |
| --- | --- | --- | --- | --- |
| 1 | 04:02:49 → 04:03:42 | **1** | 105 passed, 6 skipped | `spelling.spec.ts:87` (chromium) |
| 2 | 04:03:42 → 04:04:34 | **1** | 105 passed, 6 skipped | `plan.spec.ts:58` (chromium), `consoleErrors` |
| 3 | 04:05:40 → 04:06:32 | **0** | 106 passed, 6 skipped | — |

**The tripwire is reproduced: 2 of 3 runs red**, in line with the card's base
evidence (3 of 5 for the reviewer, 4 of 5 for the implementer). Stop condition 1
does not apply. The green run's **106 passed** is the base figure every V3 run
below is read against.

Run 1's failure, verbatim (`<sandbox>/logs/base-run-1.log`):

```
  1) [chromium] › tests/spelling.spec.ts:14:1 › marks a typo in the note body and corrects it from the menu
    Error: expect(locator).toHaveText(expected) failed
    Locator: locator('.spell-input-wrap .misspelt')
    Timeout: 5000ms
    - Expected  - 3
    + Received  + 1
    - Array [
    -   "Teh",
    - ]
    + Array []
    Call log:
      - Expect "toHaveText" with timeout 5000ms
      - waiting for locator('.spell-input-wrap .misspelt')
        14 × locator resolved to 0 elements
      85 |   const patientName = page.getByLabel(tr('common.name'));
      86 |   await patientName.fill('Teh');
    > 87 |   await expect(page.locator('.spell-input-wrap .misspelt')).toHaveText(['Teh']);
```

The test took **6.7 s** against a 2.1 s norm, i.e. the 5 s expectation expired
with the mark absent. `fill` on `:86` had succeeded, so the field was there.

Run 2's failure, verbatim (`<sandbox>/logs/base-run-2.log`):

```
  1) [chromium] › tests/plan.spec.ts:58:3 › the treatment plan › drafts goals she owns, reviews the plan, and prepares for the session
    Error: the page logged console errors
    expect(received).toEqual(expected) // deep equality
    - Expected  - 1
    + Received  + 4
    - Array []
    + Array [
    +   "Failed to load resource: the server responded with a status of 404 (Not Found)",
    +   "Failed to load resource: the server responded with a status of 404 (Not Found)",
    + ]
       at ../support/fixtures.ts:82
```

That is the exact class AM-094 admits, text and all — and the exact string
confirms the instruction review's **N2**: Chromium appends `" (Not Found)"` to
the message, so an equality against the card's quoted text
(`…status of 404`) would admit **nothing**. The predicate in
`e2e/support/fixtures.ts` anchors the pattern and allows the reason phrase as
part of the same message; see §Changes.

## Step 1b — V1's first invocation, on the now-populated sandbox

The three base runs above left the sandbox with the accumulated patients the
card warns a fresh one hides. Same command as V1-a, tree still at `3640c74`.

```
( cd e2e && PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npx playwright test \
    --project=chromium --repeat-each=3 --workers=4 plan.spec.ts spelling.spec.ts )
```

| Window (UTC) | Exit | Result |
| --- | --- | --- |
| 04:08:20 → 04:08:29 | **0** | 9 passed (3× the 2 plan tests, 3× spelling) |

`plan.spec.ts` and `spelling.spec.ts` both held this time. Log:
`<sandbox>/logs/step1b-v1-a.log`.

## The import-undo race, pinned with the server's own timestamps

`GET /api/import/batches` is global and unfiltered by source, newest first
(`server/src/db/import-batches.ts:35-46`), and `undoImportBatch` deletes the
batch row itself (`:99`), so a second undo of the same batch is a 404
(`server/src/routes/import.ts:127-132`). The Halaxy spec clicked `.first()` on
that list — the newest row, i.e. **whoever imported last**, not its own batch.

**The wrong-batch delete, reproduced in three traced full-suite runs** (logs
`<sandbox>/logs/dec5-traced-{1,7,8}.log`, tree at `3640c74`):

Run 7, English server, the two undos 487 ms apart:

```
04:19:19.828  201 POST /api/import/claude/run              ← the Claude batch is created
04:19:19.928  200 POST /api/import/batches/01a0f089-d497-70bf-b2de-ba4b90c5eff7/undo   ← import.spec.ts undoes its own batch
04:19:20.415  404 POST /api/import/batches/01a0f089-d497-70bf-b2de-ba4b90c5eff7/undo   ← halaxy-import's .first() undoes THE SAME, now-gone row
```

and the assertion that fails with it, verbatim:

```
  1) [chromium] › tests/halaxy-import.spec.ts:8:3 › importing from Halaxy › reviews sessions, imports published history, and undoes it
    Error: expect(locator).toContainText(expected) failed
    Locator: getByTestId('halaxy-undone')
    Expected substring: "Undone: 2 notes and 1 patient removed."
    Timeout: 5000ms
    Error: element(s) not found
    > 81 |     await expect(page.getByTestId('halaxy-undone')).toContainText(
```

The 487 ms gap between the two clicks is the whole window: the Claude spec
undid its batch, and 487 ms later the Halaxy spec's positional click asked for
that same id. This is the defect decision 1 fixes, and it is *not* a
`plan.spec.ts` failure — the victim is the spec that does the deleting.

**The bystander half, on both origins.** In run 1 the victim was the Halaxy
spec in the **es-MX** project, which is the instruction review's **R1** —
a one-origin predicate would have refused the class the card promises "fails no
test", and stopped a correct implementation at Stop condition 5. The full
counting is in §V3 below (22 such 404s across the five runs, both origins).

## Diagnosis 5 — the spelling flake

### What the card's own traced command does on this box

```
( cd e2e && PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npx playwright test \
    --project=chromium --repeat-each=3 --workers=4 spelling.spec.ts --trace on )
```

| Contrast | Sandbox | Window (UTC) | Exit | Result |
| --- | --- | --- | --- | --- |
| dirty, `--repeat-each=3` | `7854`, populated | 04:08:46 → 04:08:54 | **0** | 3 passed |
| fresh, `--repeat-each=3` | `7856`, its own subshell | 04:09:04 → 04:09:11 | **0** | 3 passed |

**Neither failed.** The card asks for both exit codes and for which one failed
plainly: neither did. The dirty-versus-fresh contrast the card wanted therefore
came out flat, and 30 further amplified repeats in the same dirty sandbox
(`--repeat-each=10` × 3, `<sandbox>/logs/step5-dirty-n10.log`) were also green.

Counting every run of the spec in the populated sandbox after its one failure:
**36 consecutive green runs of `spelling.spec.ts` on its own** — the two traced
contrasts and the 30 amplified repeats — plus 3 more amplified beside
`plan.spec.ts` in V1-a, against the 1-in-5 the review reported.

The one failure that *did* occur (Step 1, run 1) is from the **whole suite at
default workers**, so the amplification that reaches it is machine contention,
not the sandbox's patient count. To get a trace of it, the suite itself was
re-run with `--trace on` until the spec failed: **11 attempts**
(`<sandbox>/logs/dec5-traced-1..11.log`), 3 failing on `halaxy-import.spec.ts`
(§ above) and 1 on `plan.spec.ts:58`, 7 green, and **0 on `spelling.spec.ts`**.
With V3's ten runs on top, `spelling.spec.ts` failed **1 time in the 24
whole-suite runs on this box and 0 times in the 36 isolated ones**.

**The failing traced run the card asks for could not be produced on this box.**
Per the card that is Stop condition 5, and no remedy was invented. The
evidence below is what the diagnosis gathered.

### (i)–(iii): what was measured instead, and with what result

The card's two candidates were measured directly, with a purpose-built probe
rather than a hoped-for flake, so the numbers below are measurements and not a
story. The probe runs the spec's own sequence (`PUT /api/settings`, one format,
one patient, one note, the note page, then `/patients/new`) against a sandbox
seeded with a known number of patients, and reports the browser-side clock for
every dictionary request and every recency request, the mark, and the input's
value. It lives in `/tmp/opencode/`, runs through `scripts/v2/sandbox.mjs run`,
and creates only fabricated names (the prototype's John Smith, suffixed by an
index).

200 patients, three navigations of `/patients/new`, idle box:

| Run | storm first → last finish (recency requests seen) | dictionary first request → finished | storm first request → dictionary first request | mark, from the `goto` |
| --- | --- | --- | --- | --- |
| 1 | 1559 → 2413 ms (78) | 1725 → 1799 ms (74 ms) | +166 ms | 855 ms |
| 2 | 1414 → 2093 ms (91) | 1599 → 1644 ms (45 ms) | +185 ms | 683 ms |
| 3 | 1208 → 2004 ms (91) | 1431 → 1472 ms (41 ms) | +223 ms | 790 ms |

1200 patients, same shape:

| Run | storm first → last finish (recency requests seen) | dictionary first request → finished | storm first request → dictionary first request | mark, from the `goto` |
| --- | --- | --- | --- | --- |
| 1 | 958 → 1403 ms (142, still running) | 1026 → 1033 ms (7 ms) | +68 ms | 433 ms |
| 2 | 931 → 1356 ms (180, still running) | 975 → 986 ms (11 ms) | +44 ms | 421 ms |
| 3 | 995 → 1557 ms (87, still running) | 1088 → 1117 ms (29 ms) | +93 ms | 563 ms |

Two things about reading this table, both my own instrumentation and stated
rather than smoothed over: the probe counts a request as **two** entries (one
"start", one "finish"), so the request figures are the entries halved, and the
recency/dictionary columns are on the page's clock while the mark column is on
the `goto`'s — so the two clocks are only comparable *within* the storm and
dictionary columns, which is where the queueing claim below is made. What is on
one clock and comparable to the 5 s expectation is the mark column, because it
is measured from the `goto` and the assertion is the one right after the fill.

What these say, candidate by candidate:

- **S1's premise is not supported by measurement.** S1 holds that the storm
  "grows with accumulated patients, which is why a fresh sandbox passes 6 of 6
  and a used one fails" (`docs/v2/state/reviews/S2.9-impl.md:206-220`). The storm
  does grow — roughly twice the requests in the same first 400 ms for six times
  the patients — but going from 200 to **1200** patients left the mark landing
  **421–563 ms** after the `goto`, an order of magnitude inside the 5 s
  expectation, and the card's own amplified command then ran green **36 times**
  in the sandbox Step 1 populated. The premise the candidate rests on does not
  reproduce here.
- **S1's *mechanism* is real but far too small to be the cause.** The dictionary
  requests are measurably queued behind the storm: the storm's first recency
  request goes out 44–223 ms before the dictionary's, which is what six
  connections and a growing queue look like. Server-side the two dictionary files
  are served in **1 ms median, 12 ms max, never over 200 ms** across 70
  dictionary requests in one base run (54 × 200, 16 × 304 — Chromium revalidates
  them per document), so the delay, if any, is browser-side queueing, and once
  the queue starts moving the dictionary is through in 7–74 ms. Even so, the
  whole sequence completes in well under a second on an idle box. Reaching a 5 s
  miss needs the box to be several times busier than the suite's default workers
  make it, and the card forbids raising any timeout to cover a number of that
  kind.
- **S2 is not supported either, and the one navigation that does empty the field
  cannot fire in this spec.** Across all 6 probe navigations the value was `Teh`
  and the URL stayed `/patients/new`. An earlier probe with **no format in the
  database** did lose the field — and the reason is legible in production code:
  `AddPatient` renders `<Workspace />` behind the dialog (`AddPatient.tsx:81`),
  and `Workspace` returns `<Navigate to="/onboarding/format" replace />` when
  the formats query resolves empty (`Workspace.tsx:526-529`), which unmounts the
  whole route (`key={location.pathname}`, `App.tsx:96`) and takes `name` with it
  (`AddPatient.tsx:31`). The spec creates a format at `:23-27`, so that branch
  cannot be the flake's cause, and it is production code this card may not
  touch in any case (Must not edit; Stop condition 4).
- **(iii) the DOM snapshot at the failure** could not be read, because there was
  no second failure to snapshot. What is recorded instead is the probe's value
  column above, which reads the same field the card's own remedy would have read.


### The verdict, and what was applied

**Neither candidate is confirmed and the failing run cannot be produced: Stop
condition 5 for the remedy.** The cause is **not pinned**, stated plainly, and
no drain wait was added: a fix invented for an unpinned flake is the guess the
card refuses. The card's *unconditional* instruction was applied — the
`toHaveValue('Teh')` diagnostic at `spelling.spec.ts:87` — so the next
occurrence names its own cause in the failure message: value present, mark
absent (S1), or value gone (S2).

### The budget the conditional remedy would have needed

Recorded because the card asks for it with the arithmetic, even though the
remedy was not applied. Measured from the runs' own server logs (first recency
request of a burst → last one finished; a burst is a gap of 150 ms or more):

| Log | Bursts | Full storms (≥6 requests) | Drain max | p50 | mean |
| --- | --- | --- | --- | --- | --- |
| `base-run-2.log` (whole suite) | 63 | 52 | 560 ms | 74 ms | 118 ms |
| `v1-a.log` (V1, amplified) | 3 | 3 | **1221 ms** | 1149 ms | 878 ms |

against Playwright's 30 s default: the storm's own drain peaked at 1.22 s in the
sandbox V1 ran in, and the spelling spec's remaining work is ~1.5 s, so a
correctly budgeted drain wait would have had to clear ~1.3 s to be safe — a
number derived from a cause that is not pinned, which is why it was not used.

### The fresh-sandbox contrast the card asked for

Its own `env --port 7856`, in its own subshell, with the `7854` env **unset**
inside it. That detail is not cosmetic: sourcing the outer env first makes
`sandbox.mjs env` compute the platform default data folder from the inherited
`APUNTA_DATA_DIR` and refuse the run, which is what the wrapper is for
(C-ISO@1 rule 3). The first attempt did exactly that and was refused:

```
refusing data folder <sandbox>/data: it equals (or sits inside) the platform
default <sandbox>/data. Sandbox runs never touch the live data folder.
```

## The console-message probe — what a `ConsoleMessage` actually carries

The predicate reads the failing resource's URL from
`message.location().url`, which the instruction review's **R2** says is
reachable. Confirmed on this box's Chromium, against a sandboxed server, with
four deliberate 404s from the page (`/tmp/opencode/s2.10-probe-location.mjs`):

```
{ "type": "error",
  "text": "Failed to load resource: the server responded with a status of 404 (Not Found)",
  "location": { "url": "http://127.0.0.1:7854/api/patients/00000000-0000-4000-8000-000000000000/notes?x=1",
                "line": 0, "column": 0 } }
```

Three things follow, and all three are load-bearing: the location **is** the
failing resource's URL and not the document's; the text carries the reason phrase
(N2); and the query string is present, so the "no query string" clause is a real
clause and is exercised in the table. A `console.log` from an in-page script
reports `location.url` as `""`, which `new URL` refuses — the predicate returns
`false` for it.

## Changes

Four files, all in May edit. `git diff --name-only 3640c74`:

```
e2e/support/fixtures.ts
e2e/tests/halaxy-import.spec.ts
e2e/tests/import.spec.ts
e2e/tests/spelling.spec.ts
```

**`e2e/tests/halaxy-import.spec.ts` — decision 1, and only that.** A
`page.waitForResponse` armed **before** the `halaxy-run` click captures the
`batch_id` the server just issued (`:54-59`). After the list is on screen and
after the `checkScreen` at the old `:75` (unchanged, and still before the
click), the spec reads `GET /api/import/batches` through the `request` fixture —
the same call the page's own list is loaded from — and proves two things before
clicking: that the id at the index the API gives for `batchId` **is** `batchId`
(`:97-100`), and that the number of undo buttons in `halaxy-batches` equals the
number of rows the API returned (`:101`). Then it clicks `undoButtons.nth(ownRow)`.
`.first()` is gone. Nothing else moved: not the format POST, not `uniqueName`,
not the patient-list detour, not the `waitForTimeout(500)`, not the `checkScreen`
calls, not the undone-line assertion.

**`e2e/support/fixtures.ts` — the AM-094 narrowing, and nothing more.** The
`console` listener at `:73-77` keeps its `error`-type filter and its
`errors.push(message.text())`; between them sits one call to the new exported
pure predicate. The `pageerror` branch, the `expect` at the end of the fixture,
and everything from the appearance lock down are byte-identical. The predicate
`isAdmittedRecencyNotes404(text, url, origins)` admits a message only if **all**
of these hold:

1. the text is Chromium's own resource-load failure naming a **404** —
   `/^Failed to load resource: the server responded with a status of 404( \(Not Found\))?$/`,
   anchored at both ends, so a text that merely mentions a 404, any other
   status, and `net::ERR_ABORTED` are all refused. The optional reason phrase is
   **N2**: Chromium's real string carries ` (Not Found)`, and an equality
   against the card's quoted text would admit nothing. It is part of the same
   message, not a second shape, and the anchors keep the class where it is;
2. the URL parses, has **no query string**, is **one of the two origins this run
   serves** — `APP_ORIGINS`, built from the same `APUNTA_E2E_PORT` and
   `APUNTA_E2E_ES_PORT ?? port + 1` values `e2e/playwright.config.ts:16-17, :32-33`
   reads, so the `chromium` origin and the `es-MX` origin on `port + 1` are both
   exact and no third is (never a wildcard host or port) — and its pathname
   matches `/api/patients/<uuid>/notes` exactly, with no further segment and no
   other sub-resource;
3. the status is **404, read from the message**, never inferred from the URL and
   never from `page.on('response')` state, which could admit or refuse the same
   message by event ordering.

**The method is not checked (AM-095)**, and the code says why: a
`ConsoleMessage` carries no method and the one call site pushes
`message.text()`, so there is nothing to read it from. The path is the
constraint — the server registers only `GET` on it
(`server/src/routes/notes.ts:36`) and `web/src` never sends another method
there.

**`e2e/tests/import.spec.ts` — the one new test, outside the describe.** A
top-level `test()` placed after the `EXPORT` constant, taking no fixtures,
asserting the exported predicate over a 15-case table: the class on each of the
two origins, a 404 on `/api/patients/<uuid>`, on `/api/import/batches` and on
another patient sub-resource, a 500 and a `net::ERR_ABORTED` on the admitted
path, a 404 one segment past it, a 404 on it with a query string, a 404 on it
with a non-uuid id, a same-origin message that merely mentions a 404, a
`pageerror` string, a 404 from a port this run does not serve, a 404 from
another host on the app's own port, and a 404 with no location at all. Two
admitted cases, thirteen refused; each case fails with its own name as the
message. This is the proof the guard is still a guard, and it adds exactly one
test per project — `chromium` and `es-MX` — which is the **+2** in V3's 108
against the base's 106.

**`e2e/tests/spelling.spec.ts` — the diagnostic only.** One added line, the
`toHaveValue('Teh')` at `:87`, immediately before the unchanged `toHaveText`.
No timeout, no retry, no skip, and no change to the settings `PUT`, the note
content, or the four mark assertions.

### `import.spec.ts`'s id change is **none** — the recorded finding

Decision 1 says this is a finding, not an undone instruction, so it is measured
rather than assumed. `import.spec.ts`'s `import-undo` click at `:53` was already
its own batch: `web/src/routes/Import.tsx:183-193` binds `report.batch_id`, and
the server fills it at `server/src/routes/import.ts:103`. In the logs it shows
as such: in V1-b the Claude spec posted
`/api/import/batches/01a0f09f-767f-7044-…/undo` and the Halaxy spec posted
`/api/import/batches/01a0f09f-7a11-70e2-…/undo` — **two different ids, 1784 ms
apart, both 200**, each created by its own spec 1.9 s and 0.9 s earlier. What
was wrong on that spec was only the amplification question, which decision 3
settles as a scheduling choice, and the wrong-batch delete it could suffer,
which decision 1 removes. The only change to the file is the predicate table.

---

## V1 — the amplified, targeted repetition

The row's two invocations, with `;` between them and each exit code read
immediately after its own run, so a red first invocation cannot swallow the
second and its log (**N1**). One `env`, sourced into the sandbox the three base
runs populated.

```
( cd e2e && … npx playwright test --project=chromium --repeat-each=3 --workers=4 plan.spec.ts spelling.spec.ts ) > "$RUN_LOGS/v1-a.log" 2>&1
rc_a=$?
git checkout -- docs/v2/evidence/P2.2/screenshots/
( cd e2e && … npx playwright test --project=chromium --repeat-each=1 import.spec.ts halaxy-import.spec.ts ) > "$RUN_LOGS/v1-b.log" 2>&1
rc_b=$?
git checkout -- docs/v2/evidence/P2.2/screenshots/
```

| Invocation | Window (UTC) | Exit | Result |
| --- | --- | --- | --- |
| v1-a (plan ×3, spelling ×3) | 04:42:41 → 04:42:51 | **0** | 9 passed |
| v1-b (import, halaxy) | 04:42:51 → 04:42:59 | **0** | 3 passed |

Both exit 0. The second invocation's three tests are the new predicate table plus
the two import specs, and the undos in it are the two own-batch ones: the Claude
batch created at 04:42:57.536 and undone 45 ms later, the Halaxy batch created at
04:42:58.450 and undone 915 ms later — two different ids, 1784 ms apart, both
**200** — the wrong-batch delete is gone, and the two assertions decision 1 added
held on every run of the card.

**The recency-404 count, from this row's two logs:**

| Log | `POST …/undo` | Undo statuses | `GET /api/patients/<id>/notes` 404s |
| --- | --- | --- | --- |
| `v1-a.log` | 0 | — | **0** |
| `v1-b.log` | 2 | 200, 200 | **0** |

Zero in both, so the class did not occur here and nothing was admitted. The
storm's drain time for decision 5's budget is in §Diagnosis 5 (max 1221 ms,
p50 1149 ms over the three full storms in `v1-a.log`, 312 distinct patients
asked for).

---

## V2 — the L1 gate and the changed-path check

```
npm run lint        → exit 0
npm run typecheck   → exit 0
git diff --name-only 3640c74
```

`prettier --check` on the two files as first written flagged them (`[warn]
e2e/support/fixtures.ts`, `[warn] e2e/tests/halaxy-import.spec.ts`); both are
May-edit paths, so `npx prettier --write` on those two, and the gate is green.
Per V2, `.prettierignore` holds `*.md`, so no Markdown prettier result is quoted
here; `node docs/v2/tools/check-plan.mjs` reports `Plan consistent: 68 cards, 12
parent reviews, 14 contracts, R01-R20 covered, no cycles`, exit 0.

`git diff --name-only 3640c74` lists **only** the four May-edit paths and
nothing else. `e2e/tests/plan.spec.ts` is absent, as it must be. No production
path, no `e2e/playwright.config.ts`, no `e2e/support/no-english.ts` appears.

---

## V3 — five consecutive runs, default workers, one sandbox

Run twice, and the second set is the one that describes the tree as delivered: a
comment-only edit to `import.spec.ts` (the new test's doc comment) landed after
the first set, and a tripwire that describes a tree nobody is holding is worth
nothing. The first set was 5/5 as well. The five runs below are the second set,
run back to back with nothing between them but the screenshot restore.

```
for i in 1 2 3 4 5; do
  PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run e2e > "$RUN_LOGS/v3-run-$i.log" 2>&1
  rc=$?
  echo "run $i exit=$rc"
  git checkout -- docs/v2/evidence/P2.2/screenshots/
done
```

No `| tee` anywhere, so `$?` is Playwright's own status and not a pipe's.

| Run | Window (UTC) | Exit | Passed | Skipped | Failed |
| --- | --- | --- | --- | --- | --- |
| 1 | 04:54:57 → 04:55:51 | **0** | 108 | 6 | 0 |
| 2 | 04:55:51 → 04:56:44 | **0** | 108 | 6 | 0 |
| 3 | 04:56:44 → 04:57:38 | **0** | 108 | 6 | 0 |
| 4 | 04:57:38 → 04:58:32 | **0** | 108 | 6 | 0 |
| 5 | 04:58:32 → 04:59:26 | **0** | 108 | 6 | 0 |

**Ten consecutive exit-0 runs, five of them on the delivered tree**, and the
counts are identical across all five of that set. The passed figure is the
base's 106 **+2**, which is the new predicate table once in `chromium` and once in
`es-MX` — visible in the logs as `✓ [chromium] › tests/import.spec.ts:29:1` and
`✓ [es-MX] › tests/import.spec.ts:29:1`. The tripwire is sameness across the
five, not a match with S2.8's figures.

**The six skipped are the same six** in every run, and none is a new one: five
`language-control.spec.ts` cases in `chromium` (`:104`, `:154`, `:203`, `:268`,
`:385`) and `language-control.spec.ts:80` in `es-MX-language`. Nothing moved into
`skipped`.

**Every undo returned 200 — all 20, across four per run** (two per origin: the
Claude batch and the Halaxy batch, in both the `chromium` and the `es-MX`
project). At the base, one in three traced runs ended in a 404 on the second undo
of the same batch (§ above); after decision 1 there is not one in ten full runs.
That is the fix, measured.

**The recency-404 count, per run, read out of each run's own log beside that
run's undo lines** (Fixed decision 4's measurement; the class the owner
admitted, counted and not stopped). Each 404 is paired with the nearest undo on
its own origin, and each origin's undos are the delete that caused it:

| Run | Undos (all 200) | Admitted `GET /api/patients/<id>/notes` 404s | `7854` | `7855` | Delay from the nearest undo on that origin |
| --- | --- | --- | --- | --- | --- |
| 1 | 4 | **7** | 4 | 3 | +578, +870, +941, +1034, +70, +120, +317 ms |
| 2 | 4 | **6** | 3 | 3 | +447, +814, +1137, +461, +534, +748 ms |
| 3 | 4 | **8** | 5 | 3 | +41, +299, +380, +478, +7327, +568, +892, +1032 ms |
| 4 | 4 | **7** | 3 | 4 | +239, +782, +932, +8, +8, +839, +924 ms |
| 5 | 4 | **5** | 3 | 2 | +565, +776, +903, +722, +836 ms |

**33 in total, and the class is load-bearing in every one of the five runs** — it
occurred in all five, and the predicate admitted every message, which is why they
are reported as a number rather than as failures. Three things worth the next
reader's time:

- **Both origins carry the class** (18 on `7854`, 15 on `7855`), which is the
  instruction review's **R1** measured rather than argued: a predicate pinned to
  the English origin alone would have refused 15 of these 33 and stopped a
  correct implementation at Stop condition 5.
- **The delete → victim-fetch window is not the 25–105 ms S2.9 recorded.** It
  runs from **8 ms to 7.3 s** here, and only 4 of the 33 are inside S2.9's
  window. A short lock around the two undos — the option decision 2 rejected —
  would have had to hold for seconds, not milliseconds, to cover the tail, which
  is the same arithmetic that rejected the lock with a much wider number behind
  it.
- **Every one of the 33 is an import undo's own delete.** Checked, not assumed:
  each 404's patient id carries the UUIDv7 time of the batch that created it, and
  each pairs with that batch's undo on the same origin.

**No other console error occurred in any of the five runs.** The string
`the page logged console errors` appears **0 times** in all five logs, so no
message of any class reached the `expect` — the predicate's refusals never had to
fire, and no `pageerror` either.

The runs' logs also contain four 404 **responses** on other routes per run —
`/api/notes/does-not-exist` ×2 and `/api/notes/<uuid>` ×2 — and these are *not*
console errors: they are `api.spec.ts:69` and `api.spec.ts:52` asserting a 404
through Playwright's `request` fixture, which navigates no page and so logs
nothing to any console. They are listed here so the next reader does not mistake
them for one.

The es-MX project ran in every one of the five runs and its `checkScreen` calls
still ran; `e2e/support/no-english.ts` is untouched (`git diff --name-only` above
does not list it), so the no-English guard is the same one the base ran and no
es-MX spec failed.


---

## V4 — the P2.2 screenshots

```
git status --porcelain docs/v2/evidence/P2.2/screenshots/   → empty, exit 0
git diff --stat -- docs/v2/evidence/P2.2/screenshots/        → empty, exit 0
```

The four PNGs are unmodified after 37 Playwright test runs, each of which was
followed by `git checkout -- docs/v2/evidence/P2.2/screenshots/`. Nothing was
committed.

---

## Nothing else

- **No production code changed**: `git diff --name-only 3640c74` is four `e2e/`
  files. `web/`, `server/`, `shared/` and `src-tauri/` are untouched, including
  the three files the diagnosis names (`usePatientRecency.ts`,
  `ImportBatchList.tsx`, `AddPatient.tsx`).
- **No lock was added** (decision 2), no `workers` change, no config change, no
  skip, no `test.fixme`, no `test.slow`, no serial describe, no retry, no
  `expect.poll` inflation, no assertion deleted and none weakened. The four the
  card names are intact: `halaxy-import.spec.ts`'s undone line, `import.spec.ts`'s
  undone line and its `toContainText(\`${notes(5)}\`)`, and `spelling.spec.ts`'s
  `toHaveText(['Teh'])`.
- **No fifth file** was needed, so Stop condition 7's second half did not
  arise. Nothing discoverable and new turned up beyond the card's two residuals.
- **`e2e/playwright.config.ts:26-30` was read, not followed** (IR-05, and the
  dispatch's own instruction). It still tells the reader to give the es-MX
  server a second `sandbox.mjs env --port 7856` and pass
  `APUNTA_E2E_ES_PORT` / `APUNTA_E2E_ES_DATA_DIR`; `printEnv` exports neither
  (`scripts/v2/sandbox.mjs:299-310`), so that comment would mislead the next
  reader. It is Must-not-edit and is left as it is. One incidental confirmation:
  the only `env` this card takes for the suite is the single `7854` one, and the
  es-MX server came up on `7855` with `<sandbox>/data-es-MX` on its own.
- **Nothing was downloaded** and nothing was acquired; the box's own
  `/usr/bin/chromium` was used, and no Ollama model was pulled, listed or
  removed.
