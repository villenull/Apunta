# S2.9 — findings

Everything here is a **report**, not a change. Both items are in files outside
this card's May edit, and AM-086 authorised this card's scope specifically, so
neither was touched (Fixed decision 9, Stop conditions 6 and 7). Paths, lines
and the command that reproduces each are given, because §6 reserves widening to
the owner.

## F1 — A second family of cross-spec races on the shared database, pre-existing, and the reason V3 is 4 of 5

### What it is

The two races this card exists for are the **theme row** and the **global
formats count**. V3 run 1 failed on neither. It failed on two specs that race
each other over **other** shared stored state, through two different mechanisms,
and both mechanisms are byte-identical at the base commit — neither spec is in
`git diff --name-only ff31d42`, so neither can be affected by this card's
change.

**(a) A spec acting on the first row of a shared, global list.**

- `e2e/tests/halaxy-import.spec.ts:75-79` opens `/import/halaxy`, which renders
  `ImportBatchList` over `GET /api/import/batches` — **every** import batch in
  the shared database, from both sources and from every other spec — and clicks
  `.getByRole('button', { name: tr('common.undo') }).first()`. It is not told
  which batch it is undoing; it takes whichever is first.
- `e2e/tests/import.spec.ts:53` creates a batch and clicks `import-undo` in the
  same shared database, and the two run concurrently under `fullyParallel`
  (`e2e/playwright.config.ts:85`).
- So one spec's undo can delete the batch row the other's page had already
  listed, and the second `POST /api/import/batches/<id>/undo` then fails the
  guard at `server/src/routes/import.ts:126-131`
  (`if (!importBatchExists(db, request.params.id)) throw notFound(...)`) with a
  **404**, which the `consoleErrors` auto-fixture
  (`e2e/support/fixtures.ts:67-82`) turns into a test failure.

The endpoint is not guessed: it is in the failing run's own trace.

```
$ cd e2e && PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium \
    npx playwright test --project=chromium --trace on
...
  1) [chromium] › tests/halaxy-import.spec.ts:8:3 › importing from Halaxy › reviews sessions, imports published history, and undoes it
    Error: the page logged console errors
    +   "Failed to load resource: the server responded with a status of 404 (Not Found)"
    +   "Failed to load resource: the server responded with a status of 404 (Not Found)"
```

```
# from that run's own trace, the 404'd request
POST http://127.0.0.1:7850/api/import/batches/01a0efbc-…/undo  ->  404 Not Found
```

**(b) Two copies of one test sharing a fixed fixture, so the second one finds
nothing to import.**

`e2e/tests/import.spec.ts:18` imports a **committed fixture** (not a
`uniqueName` artefact), and the server dedupes an import against the transcripts
already stored (`planImport(upload.read, { existing, imported: importedKeys(transcripts), … })`,
`server/src/routes/import.ts:130-150`). A concurrent second copy therefore gets
nothing:

```
  1) [chromium] › tests/import.spec.ts:18:3 › importing from Claude › imports the patients seen since the cutoff, and undoes it in one click
    Error: expect(locator).toContainText(expected) failed
    Expected substring: "5 notes"
    Received string:    "Nothing new to import."
    > 47 |     await expect(page.getByTestId('import-done')).toContainText(`${notes(5)}`);
```

**(c) The same 404 symptom reaches an unrelated spec.**
`plan.spec.ts:58` (V3 run 1, es-MX; diagnostic D1, chromium) failed on the
`consoleErrors` fixture with two 404s. A base-commit traced run captured the
endpoint:

```
# at the base commit, e2e/tests/plan.spec.ts:58, chromium project, --trace on
GET http://127.0.0.1:7850/api/patients/01a0efc3-…/notes  ->  404 Not Found
```

`plan.spec.ts:58` creates its patient with `uniqueName('E2E Plan Patient')`
(`:73`), so a 404 on *its* patient means a sibling's write landed under it or its
row went away mid-test. Which sibling does it has not been established here, and
guessing is exactly what Stop condition 4 forbids — so it is reported with the
run and the endpoint, and no fix is invented.

### The base comparison, which is what makes this pre-existing rather than mine

Both files are byte-identical to the base (`git diff --name-only ff31d42` does
not list `import.spec.ts` or `halaxy-import.spec.ts`), and the race reproduces
**with the change reverted** and with the appearance tests and the formats
change entirely out of the picture:

```
$ git stash push -- e2e/            # base tree
$ cd e2e && PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium \
    npx playwright test --project=chromium --repeat-each=4 --workers=4 import.spec.ts halaxy-import.spec.ts
Running 8 tests using 4 workers
  2 failed        →  import.spec.ts:18 ×2        exit 1   (00:39:52Z)
  1 failed        →  halaxy-import.spec.ts:8    exit 1   (00:40:05Z)
```

And a full base run fails `plan.spec.ts:58` on the 404 above (00:42:13Z, base
traced chromium run 4).

### The base comparison for the two races this card *does* own

| Tree | Full-suite runs | Exit 0 | Failing spec, every time |
| --- | --- | --- | --- |
| base `ff31d42` | 7 | 1 | `settings-appearance.spec.ts:21` / `:77` — `toHaveAttribute` on `aria-checked`/`data-theme` after the reload (6 of 7 runs) |
| with the change | 8 | 5 | never `settings-appearance.spec.ts`, never `formats.spec.ts`, never `brand.spec.ts`; the 3 failures are F1 |

Base failures are in `runs.md` (Step 1) and below; the four-run base block is
00:35:56Z–00:39:36Z and the five `--repeat-each` chromium-project base runs
00:40:42Z–00:42:39Z, in which `formats.spec.ts:34` also failed twice — the card's
second race, at the base, exactly as documented.

### What F1 would need, if the owner opens it

Not done here, and deliberately:

1. `e2e/tests/halaxy-import.spec.ts:75-79` — undo **its own** batch rather than
   the first row of the global list. That is a spec change in a file outside May
   edit, and it is the owner's to authorise.
2. `e2e/tests/import.spec.ts:18` — a fixture unique per copy, or a lock around
   the import/undo window, or `--repeat-each=1` for it in an amplified row (the
   scheduling choice Fixed decision 2 already applies to `formats.spec.ts`).
3. `e2e/tests/plan.spec.ts:58` — the 404's author is not yet identified; it needs
   a traced run at the moment it fails, not a guess.

The lock this card added is the shape any of those would take, and it is
deliberately **not** widened to them: AM-086 authorised five specs and one
helper, and a lock taken by specs that do not touch the theme row would put
tests in a queue for a row they never read.

## F2 — `plan.spec.ts:58` needs no isolation: Fixed decision 5's finding, and the record

**The change is none, and the reason is the finding, not a shrug.** Three counts,
read off the code at `ff31d42`:

1. **Its format is `uniqueName('E2E plan format')`** (`:70`) — a row no other test
   creates and no assertion counts. The suite's only global format count was
   `formats.spec.ts:56`, and decision 2 scopes **both** operands to
   `name === 'Progress note'` plus the seven section names, which this row is
   not. So the format change cannot move that number.
2. **Its patient is `uniqueName('E2E Plan Patient')`** (`:73`) with the three
   notes under it (`:75-79`), reachable only through that test's own
   `?patient=` link. Nothing in the suite enumerates patients or notes globally,
   so no other spec can observe them by name.
3. **It never reads or writes the theme row** — no `data-theme`, no theme radio,
   no `PUT /api/settings`. Decision 1's lock is therefore not for it, and
   "nothing else in the suite takes it" still holds: every full-suite run took
   exactly 20 holds, 8 lock-taking tests plus the hook pair's 2, per project
   (`runs.md`, V3).

`plan.spec.ts` was run at `--repeat-each=3` in V1's first invocation (60 passed)
and in every V3 run, and **it is unmodified**: it does not appear in
`git diff --name-only ff31d42`.

**And it did fail, twice, for a reason its own code does not explain** — the
404 in F1(c), captured verbatim in `runs.md` and reproduced at the base commit.
Per Stop condition 4 that is reported with the run and the endpoint, and no fix
was invented for it.

## F3 — one observation, not a finding: `spelling.spec.ts:14`

Failed once, in V3 run 1 only, at
`await expect(page.getByTestId('spelling-menu').getByRole('menuitem', { name: 'The' })).toBeVisible()`
(`e2e/tests/spelling.spec.ts:87`). The speller loads the dictionary as two files
from the app's own origin (`web/src/lib/speller.ts:19-20`); both were fetched
with 200 in every trace inspected, so the 404 family above is a *plausible* but
**unconfirmed** explanation and is not asserted as one. Seen once in 15
Playwright runs of this session and never at the base; one observation is not a
rate. `spelling.spec.ts` is outside May edit and was not touched.

## F4 — residual: a killed worker leaves the lock file behind

Release happens in a `finally` in all ten call sites, so a failing or throwing
test cannot deadlock the run, and no stale lock was left by any run here
(checked after every V3 run). A **killed** worker (SIGKILL, a container reclaim)
is not covered: the next acquisition then fails at the 20 s deadline with this
card's own message, which names the path, the elapsed wait, the deadline and the
holder's pid, and says what to do — delete the file **in the sandbox run
folder** and re-run, never in the tree. Worth a line in NEXT-SESSION, which this
card may not edit.

The other residual is deliberate and recorded in the helper's own comment: the
lock path is one per run, from `APUNTA_DATA_DIR`, so the es-MX project's
appearance tests serialise against the English project's even though the two
servers hold separate rows. Both projects run the same eight tests, so the
alternative — a per-project key — would halve the contention at the cost of a
second key the card does not describe. It costs nothing measurable: the longest
hold of the whole session was 770 ms against a 20 s deadline.
