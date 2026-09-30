# S2.10, attempt 2 — S2.R finding 2, and the CI appearance-lock shape

**Card:** S2.10, role IMPLEMENTATION, L1, **attempt 2 of 3**. **Base commit:**
`cbe52d5` (= HEAD throughout; the change is left uncommitted for the
coordinator). Attempt 1's evidence is `runs.md` in this directory and is
untouched. **Date:** 2026-09-30, UTC throughout. **Node:** v24.19.0
(`~/.local/share/apunta-node/node-v24.19.0-linux-x64/bin`, pinned A01), npm
11.19.0. Chromium is the box's `/usr/bin/chromium` through the config's own
escape hatch `PLAYWRIGHT_CHROMIUM_EXECUTABLE`
(`e2e/playwright.config.ts:57-61`); nothing was downloaded (HS-3) and
`npx playwright install` was not run.

**Scope of this attempt.** One finding from the embedded S2.R review —
`docs/v2/state/dispatch/S2.10.md:1317-1334`, finding 2 — plus one coordinator
addition recorded as AM-099 (the CI shape of the appearance lock, §5 below).
Nothing else from the card was re-opened; the spelling flake's unpinned
diagnosis from attempt 1 stands and is **not** re-litigated here.

**Sandboxes** (C-ISO@1; one `env` per measurement, never a second one sourced
into the same shell):

| Env file | Run folder (`<sandbox>`) | English server | es-MX server |
| --- | --- | --- | --- |
| `/tmp/apunta-v2-s2.10-e2e.env` | `/tmp/apunta-v2/2026-09-30T16-57-13-693Z-3a8295c5/` | `7872` | `7873` (`:32-36`, `<sandbox>/data-es-MX`) |
| `/tmp/apunta-v2-s2.10-ci.env` | `/tmp/apunta-v2/2026-09-30T17-07-00-696Z-38c20040/` | `7876` | `7877` |

Every host in every log of both folders is `127.0.0.1` on `7872`, `7873`, `7876`
or `7877`; **7717 was never contacted**, no live data folder, backup, Claude
export or Halaxy PDF was opened, and no `git stash`, `reset`, commit, branch,
merge or rebase was used. `7872`–`7879` were free of listeners after the last
run. Logs live in `<sandbox>/logs/` and stay there (RUN-CONFIG §4); every path
below is written `<sandbox>`.

`docs/v2/evidence/P2.2/screenshots/` was restored with
`git checkout -- docs/v2/evidence/P2.2/screenshots/` after **every** Playwright
run in this attempt (**30** of them: 3 base, 3 pre-fix probes, 4 post-fix
probes, 2 in V1, 10 perturbation controls — 7 amplified and 3 pair — 5 in V3,
3 in §5). V4 is the proof.

---

## 0. What finding 2 is, and the shape of the fix

The reviewer caught the Halaxy spec's **count cross-check** racing a sibling's
undo: `e2e/tests/halaxy-import.spec.ts:98`,
`expect(undoButtons, 'one undo button per row the API returned').toHaveCount(batches.length)`,
**Expected 1 / Received 2**. S2.10's decision 1 fixed the *positional click*; the
count still compared **two separately timed reads** — the page's own
`GET /api/import/batches` (which renders the rows) and the spec's own
`request.get('/api/import/batches')` after `checkScreen`. A sibling spec's undo
deletes a batch between them, the second read answers a row short, and the two
disagree.

**The fix: one snapshot, and it is the page's own.** `page.waitForResponse` is
armed **before** `page.goto('/import/halaxy')` and the spec reads the batches
out of *that* response — the answer the rows on screen were rendered from
(`web/src/hooks/useImportBatch.ts:20-28`; the list is loaded when the route
mounts and only reloaded after an undo). The second read is gone, so the two
things the assertion compares cannot come from two moments:

- **What is not weakened.** Both identity assertions stay exactly as they were:
  `batches[ownRow]?.id` must be the `batch_id` this run's `POST
  /api/import/halaxy` answer carried, and the undo-button count must equal
  `batches.length` — so a DOM index and a `batches` index mean the same row or
  the test fails. The undone-line assertion at the end is untouched. Nothing is
  retried, skipped, timed out or deleted, and no production file moved.
- **It is strictly tighter.** The old check asked "does a *fresh* read agree
  with the DOM", which a sibling's delete can make false while both sides are
  honest. The new check asks the question the click actually depends on — "is
  row *n* of the DOM the row *n* of the list these rows were rendered from" —
  and by construction the DOM cannot be stale with respect to that list, because
  that list *is* its input.
- **Delivered bytes.** After the runs above, two comment sentences in the two
  May-edit files were re-wrapped (one wording fix pointing here instead of at
  attempt 1's evidence file, one line-wrap). A comment-stripped comparison
  against the exact bytes every run used reports **`code identical: True`** for
  both files, and `npm run lint` / `npm run typecheck` are 0 on the delivered
  bytes (§4's V2).

---

## 1. The base tripwire, before any edit (tree at `cbe52d5`)

The RUN-CONFIG §3 e2e line, three times, default workers, on a **populated**
sandbox (run 1 populated it, as the rows require).

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
| 1 | 16:57:21 → 16:58:15 | **0** | 108 passed, 6 skipped | — |
| 2 | 16:58:36 → 16:59:30 | **0** | 108 passed, 6 skipped | — |
| 3 | 16:59:30 → 17:00:25 | **0** | 108 passed, 6 skipped | — |

**Recorded as a deviation from Stop condition 1, and deliberately not treated as
a licence to do nothing.** The card's premise (either residual red on this box)
did not reproduce at whole-suite level in three runs — consistent with attempt 1
(5/5 and 10/10) and with this being the rarer of the two classes. So the
reproduction was **targeted** instead, below, where it fires readily. Nothing
was skipped, retried or weakened on the strength of three green runs, and V3's
five-run tripwire was run in full afterwards.

---

## 2. Targeted reproduction of finding 2 — 2 of 3 runs red, verbatim

The Halaxy spec, four concurrent copies per run, default workers, in the
populated sandbox. Four copies means four own-batch undos in flight, which is
what the race needs; nothing else is amplified and no assertion is touched.

```
( cd e2e && PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npx playwright test \
    --project=chromium --repeat-each=4 halaxy-import.spec.ts ) > "$RUN_LOGS/probe-halaxy-x4-$i.log" 2>&1
```

| Probe | Window (UTC) | Exit | Counts |
| --- | --- | --- | --- |
| #1 | 17:00:37 → 17:00:51 | **1** | 3 passed, 1 failed |
| #2 | 17:00:51 → 17:01:00 | **0** | 4 passed |
| #3 | 17:01:00 → 17:01:14 | **1** | 3 passed, 1 failed |

Probe #1's failure, verbatim (`<sandbox>/logs/probe-halaxy-x4-1.log:892-917`):

```
    Error: one undo button per row the API returned

    expect(locator).toHaveCount(expected) failed

    Locator:  getByTestId('halaxy-batches').getByRole('button', { name: 'Undo' })
    Expected: 1
    Received: 2
    Timeout:  5000ms

    Call log:
      - one undo button per row the API returned with timeout 5000ms
      - waiting for getByTestId('halaxy-batches').getByRole('button', { name: 'Undo' })
        14 × locator resolved to 2 elements
           - unexpected value "2"

       96 |       `the batch this run created (${batchId}) is in the list, so the row at its index is the one to undo`,
       97 |     ).toBe(batchId);
    >  98 |     await expect(undoButtons, 'one undo button per row the API returned').toHaveCount(batches.length);
          |                                                                           ^
       99 |     await undoButtons.nth(ownRow).click();
```

**Identical to the reviewer's report, message for message, Expected 1 / Received
2** — the same class, on this box, without amplification of anything but copies
of the one spec. The mechanism is visible in the same log's own timestamps
(English server, ms precision; `POST …/undo` is a sibling copy taking its own
batch back between the two reads):

```
1790787646.165 GET  /api/import/batches                       ← a copy's page renders its rows (2 batches)
1790787646.193 GET  /api/import/batches
1790787646.296 POST /api/import/batches/01a0f342-efc4-709e-…/undo   ← a sibling deletes a batch
1790787646.363 POST /api/import/batches/01a0f342-eff8-70ff-…/undo
1790787646.446 POST /api/import/batches/01a0f342-f03a-7094-…/undo
```

Note what the failing assertion was doing when it fired: the **id check at
`:94-97` passed** — this copy's own batch was still there — so the index was
computed from a list one row shorter than the DOM, and the click that follows
would have hit **another spec's batch**. The count check is the guard, and it
fired. That is why the fix moves the list read rather than loosening the check.

---

## 3. The fix, and the same probes after it

`e2e/tests/halaxy-import.spec.ts`: `page.waitForResponse` armed before the
`goto`, batches read from that one response, the second read and its
`ok()` check removed, and the count assertion's message reworded to name the
list the rows came from. Nothing else in the file moved — not the format POST,
not `uniqueName`, not the patient-list detour, not the `waitForTimeout(500)`,
not either `checkScreen`, not the undone-line assertion. The full diff is in
the return file.

Same command, same sandbox, four runs:

| Probe | Window (UTC) | Exit | Counts |
| --- | --- | --- | --- |
| #1 | 17:03:50 → 17:03:59 | **0** | 4 passed |
| #2 | 17:03:59 → 17:04:08 | **0** | 4 passed |
| #3 | 17:04:08 → 17:04:17 | **0** | 4 passed |
| #4 | 17:04:17 → 17:04:25 | **0** | 4 passed |

**16 of 16 copies green where 2 of 3 runs were red**, and all **16 undos
answered 200** (parsed per `reqId` out of the four logs: 4/4/4/4, none non-200).
The pre-fix probes recorded 3 undos in each red run — the failing copy never
reached its click, because the count assertion threw first.

### 3a. Control: the click is still bound to the row the id check names

A perturbation, in the May-edit file, restored byte-for-byte
(`sha256sum -c` → `OK`): the click index mirrored, `.nth(ownRow)` →
`.nth(batches.length - 1 - ownRow)`, which is a **different** row whenever the
list holds more than one batch. Thirteen runs: seven amplified runs of four
copies each and three pair runs.

| Control | Exit | Counts |
| --- | --- | --- |
| amplified, first run | 0 | 4 passed |
| pair #1–#3 (`--repeat-each=1 import.spec.ts halaxy-import.spec.ts`) | 0, 0, 0 | 3 passed each |
| amplified #1 of the six | 0 | 4 passed |
| amplified #2 of the six | **1** | 3 passed, **1 failed** |
| amplified #3–#6 of the six | 0, 0, 0, 0 | 4 passed each |

The red run's failure, verbatim:

```
    Error: expect(locator).toContainText(expected) failed
    Expected substring: "Undone: 2 notes and 1 patient removed."
    Error: element(s) not found
```

So clicking the wrong row fails the spec loudly, and the green runs after the
fix are green because the index names this copy's own row. The identity chain
is load-bearing, not decorative. `e2e/tests/halaxy-import.spec.ts` restored
from the sandbox `tmp/` copy, `sha256sum -c` → `e2e/tests/halaxy-import.spec.ts: OK`.

---

## 4. V1, V2, V3, V4

### V1 — the amplified, targeted repetition

Both invocations run, each exit code read immediately after its own run (the
card's `&&` between them replaced with `;`, as in attempt 1 — deviation 1).

| Invocation | Window (UTC) | Exit | Counts |
| --- | --- | --- | --- |
| `--project=chromium --repeat-each=3 --workers=4 plan.spec.ts spelling.spec.ts` | 17:06:19 → 17:06:30 | **0** | 9 passed |
| `--project=chromium --repeat-each=1 import.spec.ts halaxy-import.spec.ts` | 17:06:30 → 17:06:38 | **0** | 3 passed |

Both import specs' undos answered 200, each on its own batch.

### V2 — the L1 gate and the changed-path check

`npm run lint` → **exit 0** (ends `TOTAL 0`), `npm run typecheck` → **exit 0**.
`node docs/v2/tools/check-plan.mjs` → **exit 0**, *"Plan consistent: 68 cards, 12
parent reviews, 14 contracts, R01-R20 covered, no cycles."* (Markdown is not
prettier-checked in this repo, so no Markdown prettier result is quoted.)

`git diff --name-only cbe52d5`:

```
e2e/support/fixtures.ts
e2e/tests/halaxy-import.spec.ts
```

plus two `docs/v2/state/dispatch/*.md` files and one untracked
`docs/v2/state/reviews/S2.8-impl2.md`, which are **the coordinator's**, not
this attempt's (the dispatch file for this card and the S2.8 review dispatch
were edited there while this session worked; the untracked review is S2.8's).
`e2e/playwright.config.ts`, `e2e/support/no-english.ts` and `e2e/tests/plan.spec.ts`
are **absent**, as are every `web/`, `server/`, `shared/` and `src-tauri/` path.
Inside `e2e/support/fixtures.ts` the diff is the AM-099 fallback, the
`node:os` import it needs, and the two comment sentences that describe it —
`acquireAppearanceLock`, `releaseAppearanceLock`, the `openSync(path, 'wx')`,
the 20 s deadline, the 50 ms poll, the non-nesting guard, the pid in the file
and the `finally` release are all untouched.

### V3 — five consecutive default-worker runs of the e2e line

One sandbox run, nothing between the runs but the screenshot restore.

| Run | Window (UTC) | Exit | Counts |
| --- | --- | --- | --- |
| 1 | 17:10:11 → 17:11:07 | **0** | 108 passed, 6 skipped |
| 2 | 17:11:07 → 17:12:09 | **0** | 108 passed, 6 skipped |
| 3 | 17:12:09 → 17:13:07 | **0** | 108 passed, 6 skipped |
| 4 | 17:13:07 → 17:14:07 | **0** | 108 passed, 6 skipped |
| 5 | 17:14:07 → 17:15:08 | **0** | 108 passed, 6 skipped |

**Five of five exit 0, and the counts are identical across all five.** The six
skipped are byte-identical in all five runs (md5 over the `file:line` set):
`language-control.spec.ts:104`, `:154`, `:203`, `:268`, `:385` in `chromium` and
`language-control.spec.ts:80` in `es-MX-language` — the same structural six
attempt 1 recorded. Nothing moved into `skipped`.

The recency-404 class AM-094 admits, counted per run from each run's own server
log (each 404 is on `GET /api/patients/<uuid>/notes` with status 404, every one
of them an import undo's own delete), and the undo statuses:

| Run | Undos (all 200) | Admitted recency 404s | Origin |
| --- | --- | --- | --- |
| 1 | 4 | 4 | es-MX `7873` |
| 2 | 4 | 1 | es-MX `7873` |
| 3 | 3 | 2 | es-MX `7873` |
| 4 | 4 | 6 | es-MX `7873` |
| 5 | 4 | 6 | es-MX `7873` |

**19 in the five runs; no undo answered anything but 200.** The string
`the page logged console errors` appears **0** times in all five logs, so **no
console error of any class reached the guard** — which means the predicate's
refusals never had to fire and no message outside AM-094's single class
occurred. Had one occurred, this row is a FAIL (Stop condition 5); none did.

### V4 — the screenshots

`git status --porcelain docs/v2/evidence/P2.2/screenshots/` and
`git diff --stat -- docs/v2/evidence/P2.2/screenshots/`: **both empty, exit 0**,
after all 25 runs. Reverted, never committed.

---

## 5. AM-099 — the CI shape of the appearance lock

CI runs `npm run e2e` **without** `scripts/v2/sandbox.mjs`, so `APUNTA_DATA_DIR`
is unset in every worker and S2.9's `appearanceLockPath()` threw *"the appearance
lock is appearance.lock under APUNTA_DATA_DIR, and APUNTA_DATA_DIR is unset"*,
failing every lock-taking test on GitHub (run 36746655691: `brand.spec.ts:367`,
`settings-appearance.spec.ts:21`/`:86`, `workspace.spec.ts:553`, both projects).

**The fix, in `e2e/support/fixtures.ts` only:** `APUNTA_DATA_DIR` still wins
when the wrapper provided one; otherwise the lock is
`join(os.tmpdir(), 'apunta-e2e-appearance-' + String(e2ePort) + '.lock')`, where
`e2ePort` is already this file's `APUNTA_E2E_PORT ?? 7788` — the same value
`e2e/playwright.config.ts:16` computes. One path, shared by every worker
process of a run (the key is the run's own English server port), and shared with
no other run (a different run is a different port). Everything else about the
lock is unchanged: `openSync(path, 'wx')`, the 20 s deadline on a 50 ms poll,
never an `{ auto: true }` fixture, never nested, the holder's pid written at
once, released in the caller's `finally`.

### Proof, in CI's own shape

Both commands run from `e2e/` with `APUNTA_DATA_DIR` unset (the run folder is
still the sandbox's own, taken with `sandbox.mjs env --port 7876`) and `CI=1`,
which is what turns on `workers: 1` and `retries: 2`
(`e2e/playwright.config.ts:87-88`) — the config's CI branch, not a workers
override.

| Run | Command | Window (UTC) | Exit | Counts |
| --- | --- | --- | --- | --- |
| **fixed** | `CI=1 npx playwright test brand.spec.ts settings-appearance.spec.ts workspace.spec.ts` | 17:07:09 → 17:08:01 | **0** | 41 passed, 1 skipped |
| **negative control** (fallback hunk reverted, then restored) | same | 17:08:38 → 17:09:35 | **1** | 25 passed, 8 failed, 1 skipped |
| **fixed, final bytes** | same | 17:28:54 → 17:29:44 | **0** | 41 passed, 1 skipped |

- The fixed run logs **20 `appearance-lock: held … by pid …` lines across 2
  distinct worker pids**, so the fallback path was really taken and really
  serialised; the old error text appears **0** times; and
  `/tmp/apunta-e2e-appearance-7876.lock` does not exist afterwards, i.e. the
  `finally` release still removes it.
- The negative control reproduces **CI's failure set exactly** — the same eight
  tests, `brand.spec.ts:367`, `settings-appearance.spec.ts:21`, `:86` and
  `workspace.spec.ts:553` in **both** projects — with the base message
  verbatim:

```
  1) [chromium] › tests/brand.spec.ts:367:3 › rendered colours and 200% zoom › brand: light, default accent #2a9d8f …

    Error: the appearance lock is appearance.lock under APUNTA_DATA_DIR, and APUNTA_DATA_DIR is unset: run the suite through scripts/v2/sandbox.mjs, which points it at this run's sandbox folder

       at appearanceLockPath (/home/villenull/Projects/Apunta/e2e/support/fixtures.ts:244:11)
       at acquireAppearanceLock (/home/villenull/Projects/Apunta/e2e/support/fixtures.ts:288:16)
       at /home/villenull/Projects/Apunta/e2e/tests/brand.spec.ts:317:11
```

  `e2e/support/fixtures.ts` was restored from the sandbox `tmp/` copy and
  `sha256sum -c` returned `e2e/support/fixtures.ts: OK`.
- After the proof, only two **comment** sentences in that file were re-wrapped
  for readability. A comment-stripped comparison against the exact bytes the
  proof and V3 ran reports **`code identical: True`**, and the third run above
  is the CI-shaped proof repeated on the delivered bytes (exit 0, 41 passed,
  1 skipped, 20 holds, 2 pids).

**HS-1 note.** `APUNTA_DATA_DIR` was unset in the worker environment on purpose,
to match CI. The server was never at risk of touching the live folder: with that
variable unset, `e2e/playwright.config.ts:13` and `:34-36` hand the web servers
`mkdtempSync(join(tmpdir(), 'apunta-e2e-'))` and `…-es-` of their own, so the
data folders in that run are two fresh temp directories. No `XDG_DATA_HOME` or
other redirection was needed or used.

---

## 6. Deviations

1. **Stop condition 1 not treated as a licence to stop.** The three base runs
   were all green (§1), which is a deviation from the card's Step 1
   expectation. The premise was instead reproduced by targeting the one spec the
   finding names (§2), and V3's five-run tripwire was run in full regardless.
2. **V1's two invocations joined with `;`, not `&&`,** each exit code read
   immediately after its own run, as in attempt 1.
3. **Amplification shape for the reproduction and the controls:** four
   concurrent copies of `halaxy-import.spec.ts` (`--repeat-each=4`), which is
   the minimum that puts a foreign batch's undo in the window. The Claude spec
   was **not** amplified, for the reason Fixed decision 3 gives (one committed
   fixture, deduped server-side).
4. **A second sandbox env (`--port 7876`, `/tmp/apunta-v2-s2.10-ci.env`) for the
   AM-099 proof only.** It is a separate measurement that must not share a port
   or a data folder with §1–§4, it is never sourced into the outer shell
   alongside the `7872` env, and no `APUNTA_E2E_ES_*` variable is involved — the
   one-`env`-per-measurement rule of Fixed decision 9 is untouched.
5. **Two perturbations** (the mirrored click index in §3a, the reverted fallback
   in §5) were applied to May-edit files and restored from the sandbox `tmp/`
   copy, each verified by `sha256sum -c`. Neither is part of the delivered tree.
6. `npx prettier --write` was run once on `e2e/tests/halaxy-import.spec.ts`
   after the first `npm run lint` flagged the comment-only line wrap; nothing
   else was reformatted, and lint is 0 afterwards.

## 7. Unresolved

1. **The `spelling.spec.ts` flake is still unpinned** (attempt 1, Stop
   condition 5). It did not fire in any of the 16 whole-suite or amplified runs
   of this attempt (3 base + 5 V3 + 8 probes/controls), which is consistent with
   attempt 1's "1 in 24 whole-suite runs" and adds nothing to the diagnosis. The
   `toHaveValue('Teh')` diagnostic from attempt 1 is in place, so the next
   occurrence names its own cause.
2. **The whole-suite base is green on this box** (§1), which is why the
   reviewer's finding 2 survived a 10-run green streak from attempt 1. The
   amplified probe in §2 is the cheap detector a future session should reach for
   first for this class; it costs 10–15 s and fires where the full suite does
   not.
3. **`e2e/playwright.config.ts:26-30` is still stale** (Must not edit, the
   dispatch's own instruction IR-05): it tells the reader to take a second
   `sandbox.mjs env --port <p2>` and pass `APUNTA_E2E_ES_PORT` /
   `APUNTA_E2E_ES_DATA_DIR`, and `printEnv`
   (`scripts/v2/sandbox.mjs:299-310`) exports neither. Left exactly as it is.
