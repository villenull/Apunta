# P1.4 verification evidence

Card: **P1.4 One effective-model policy** (C-MODEL@1).
Attempt: **2 of 3** (repair of the four numbered findings in
`docs/v2/state/dispatch/P1.4.md` → "Findings from the previous attempt").
Base commit given by the coordinator for this attempt: `a115718`. Working
directory for every command below: repository root.

```text
$ git log -1 --format='%H %s'
a1157188e91054f44045173b0fd2bcd6ed71e820 Record card P1.3 APPROVED (v2 state)
```

HEAD was the dispatched base at the start of the session and is still that
commit. Nothing was pulled, merged, rebased or reset. Attempt 1's
implementation is already in this history (`b1ea69e`), so this attempt is a
repair of committed code, not a fresh build.

Node **24.19.0** first on `PATH` for all three rows:

```text
$ export PATH="$HOME/.local/share/mise/installs/node/24.19.0/bin:$PATH"
$ node --version
v24.19.0
$ npm --version
11.17.0
```

**Where the raw output is.** The `*-attempt2.log` and `*.out` files beside this
one are matched by `.gitignore`'s `*.log` (and the `.out` pair by the same
rule for logs in practice) and are therefore **local only** — RUN-CONFIG §4's
"raw logs stay in the sandbox run folder and are never committed". Every
excerpt, count, exit code and timestamp a reviewer needs is in this file.

No server was started, no database was opened and no app was launched, so HS-2's
non-launching allowance covers every command here. The vitest suites open only
temporary databases created by `server/src/test/harness.ts` and by
`mkdtempSync` under the OS temp dir (`server/src/routes/health.test.ts`). No row
in any of the nine files calls `listen`. Port **7813**, this card's sandbox
port, was not needed and not used; port 7717 was never contacted; no live data
folder, backup, Claude export or Halaxy PDF was touched; `recover-current-linux.mjs`
and `smoke-live.mjs` were not run.

### Another agent's uncommitted work was in the tree during the final run

Disclosed, not touched. Two files outside this card's May-edit list were being
written by another session while V1 and V3 ran:

```text
web/src/routes/Settings.test.tsx     +145 −1   mtime 2026-09-26T09:59:10Z  (C-SETTINGS@1 radio/keyboard rows)
e2e/tests/settings-appearance.spec.ts  +56 −0   mtime 2026-09-26T09:59:32Z
```

`web/src/routes/Settings.test.tsx` changed at 09:59:10Z, inside V1's window
(09:59:08Z → 09:59:12Z) and before V2's (09:59:13Z) and V3's (09:59:20Z);
`e2e/tests/settings-appearance.spec.ts` changed at 09:59:32Z, after V3 finished.
So V2 and V3's `@apunta/web` typecheck saw that file mid-write, and it is not a
P1.4 path in any form. Per CLAUDE.md's "Working alongside background agents" it
was not staged, committed, stashed or reverted, and re-running to get a quieter
window was not attempted: that agent is still writing, so any re-run races the
same way. The P1.4 code was complete at 09:56Z, before either edit, and V1's nine
paths include no `web/**` or `e2e/**` file. A reviewer who wants a
single-writer run should re-run V2 and V3 on a quiet tree.

## What this attempt changed, against the four findings

| Finding | What was wrong at `a115718` | What this attempt does |
| --- | --- | --- |
| 1 | `buildHealthResponse` computed `present` from the installed list alone and never consulted `llm.reachable`; the row named as its proof derived `modelPresent` from the same array it injected, so the assertion was a tautology | `server/src/routes/health.ts` consults reachability **before** the list, in `effectiveInstalled()`, so `present` is `null` for an unreachable runtime by construction. `health.test.ts` rewritten with stated-independent inputs, a run-based decorrelated row that **fails on the old route** (recorded below), and the unreachable direction of the invariant |
| 2 | `configuredModel` (`profiles.ts`) spelled the selection out by hand — `effectiveModel`'s rule in a second place | It is now `effectiveModel({ override: llmModelOverride(db), installed: null }).tag`; the `LLM_PROFILES.quick?.model` term is gone, and a new `profiles.test.ts` row compares the server's answer against the resolver's for four stored values |
| 3 | `scripts/setup-macos.sh` and `scripts/preflight-macos.sh` still chose or claimed to choose the model from `hw.memsize` | Both scripts name `WRITING_TAG` (= `PROMOTED_DEFAULT_MODEL`) as the model they pull, check and advise on. The RAM table survives as a reported recommendation and selects nothing. `setup-script.test.ts` extended to hold both scripts to it |
| 4 | The stop-condition report said no stored value changes meaning | The return file now names the guard-rejected stored override, its old and new meaning, and that the change is the card's own decision. Section "Stop conditions" below |

Finding 3 needed the card's conditional May-edit clause: the tag-selection logic
in both scripts changes, so editing them is in scope. No tag *literal* changed —
`qwen3.5:4b-q4_K_M` was already in both files as the small tier's value — but
the branch that used it, and the branch that used the other two, are gone.

## Criteria

| ID | Command | Started (UTC) | Exit | Elapsed | Evidence |
| --- | --- | --- | --- | --- | --- |
| — | Step 1: the new rows, against the unfixed code | 09:50:47Z | **1** (as designed) | 0.6 s | `v1-step1-failure-attempt2.log` |
| V1 | `npm run build:shared && npx vitest run <the card's nine paths>` | 09:59:08Z | **0** | 4.7 s | `v1-card-tests-attempt2.log` |
| V2 | `npm test` | 09:59:13Z | **0** | 7.9 s | `v2-npm-test-attempt2.log` |
| V3 | `npm run lint && npm run typecheck` | 09:59:20Z | lint **0**, typecheck **0** | 10.6 s | `v3-lint-typecheck-attempt2.log` |

All three were run in that order against one tree, and the tree has not changed
since (the only later edits were to this file and to the return file, both
Markdown, and `prettier --check .` covers both).

## Step 1 — the recorded failure, before the fix

The health rows were written first, against the unfixed route, and the whole
file was run before `health.ts` was touched.

```text
 ❯ |server| src/routes/health.test.ts (14 tests | 1 failed) 141ms
     × reports present: null exactly when the runtime is unreachable, list or no list 6ms

 FAIL  |server| src/routes/health.test.ts > GET /api/health — the effective model (real mode) > reports present: null exactly when the runtime is unreachable, list or no list
AssertionError: expected true to be null

- Expected:
null

+ Received:
true

 ❯ src/routes/health.test.ts:319:28
  318|     const ollama = await ollamaOf(server);
  319|     expect(ollama.present).toBeNull();
     |                            ^

 Test Files  1 failed (1)
      Tests  1 failed | 13 passed (14)
exit: 1
```

That is the reviewer's forbidden state reproduced from inside the suite: the
runtime is **unreachable**, the injected list **contains the tag**, and the
route answered `present: true` — a machine that cannot reach its runtime being
told it has the model. It is the state the old implementation could only
produce because nothing consulted `reachable`.

The other three pre-existing `present` rows pass both before and after by
design: they are the states the old code already got right. They are kept
because they are the contract, and they are now stated with independent inputs
so that they are no longer self-satisfying (see the block comment in
`health.test.ts`).

### The script rows, against the base scripts

The three new `scripts/` rows are checked here out of tree, because the base
scripts cannot be run at a given RAM size at all — that is the defect. Two
demonstrations, both read-only:

**The base `setup-macos.sh` on a 16 GiB Mac.** A copy of `a115718`'s
`scripts/setup-macos.sh` with its one memory line replaced by a 16 GiB reading
(same substitution the new `APUNTA_SETUP_RAM_GIB` seam performs):

```text
[6] Choosing the writing model for this Mac
    ✓ 16 GB of memory → gemma4:12b-it-qat

[7] Downloading the writing model
      This is a large download — several gigabytes.
    $ ollama pull gemma4:12b-it-qat
```

R03 verbatim: setup downloads `gemma4:12b-it-qat` while the app, health and eval
all resolve `qwen3.5:4b-q4_K_M`. The same script after this attempt, at the same
16 GiB:

```text
[6] The writing model Apunta will use
    ✓ qwen3.5:4b-q4_K_M — the writing model Apunta uses on every machine
      this Mac (16 GB) could also run gemma4:12b-it-qat, as a recommendation
      Apunta's writing model is qwen3.5:4b-q4_K_M on every machine, so that is what gets downloaded

[7] Downloading the writing model
      This is a large download — several gigabytes.
    $ ollama pull qwen3.5:4b-q4_K_M
```

**The base `preflight-macos.sh`, told a 16 GiB Mac.** The base has no such
seam, so the reading is unknown and it prints the sentence this card had to
remove:

```text
[ 4] Installed memory
      UNKNOWN could not read hw.memsize
              Apunta falls back to the smallest model when it cannot read this.
[ 5] Model tier — PLAN §2's table, applied to the numbers above
      testing: PLAN §2 — the RAM→model table, and its assumption that Metal can only use ~75% of unified RAM
      UNKNOWN memory unreadable, so Apunta would pick the fallback model: qwen3.5:4b-q4_K_M
```

and after this attempt, at 16 GiB:

```text
[ 4] Installed memory
      OK      16 GiB (17179869184 bytes)
[ 5] Model size — PLAN §2's table, as a recommendation
      testing: PLAN §2 — the RAM→size table and its ~75%-of-unified-RAM assumption, kept as a recommendation: memory does not choose the model, and every Apunta machine runs qwen3.5:4b-q4_K_M
      OK      size recommendation (default (16-35GB)): gemma4:12b-it-qat ~7.2 GB — Apunta writes with qwen3.5:4b-q4_K_M either way
```

**Row-by-row against the base sources** (`/tmp/opencode/p14a2/rows-vs-base.mjs`,
output in `rows-vs-base-attempt2.out`) — the same predicates the new test rows
use, evaluated on `a115718` and on the worktree:

```text
row                                                           base a115718        now (worktree)
names the promoted default as the writing model it downloads FAIL               PASS
never assigns the model it downloads from a RAM branch       FAIL               PASS
names the writing model as the one it checks and tells the owner to pull FAIL               PASS
still reports the RAM table and its boundaries, unchanged    PASS               PASS
```

The fifth new row, *"downloads the effective model whatever this Mac has in
RAM"*, **passes on the base scripts in this container and is not evidence of
anything on its own**: `hw.memsize` answers nothing here, so the base falls to
its small tier, which happens to be the promoted tag. It is a guard against
regressing to RAM selection, not a reproduction of the defect — the two walks
above are the reproduction. The row only became *checkable* because the seam
exists; that is stated here rather than left for a reviewer to discover.

## V1 — the card's nine vitest paths

`v1-card-tests-attempt2.log`, exit **0**, 09:59:08Z → 09:59:12Z.

```text
 Test Files  9 passed (9)
      Tests  177 passed (177)
   Duration  3.96s
```

177 against attempt 1's 168: the nine new rows, all of them in files the card
names. What each fix is proved by:

| Finding | File | Rows |
| --- | --- | --- |
| 1 | `server/src/routes/health.test.ts` (14 rows, was 10) | *"reports present: false when the tag is not in the installed list"* now has `describe()` say the model **is** there while the list does not have it, so `present` is the list's answer and not `describe()`'s; *"reports an override that is not installed as present: false"* likewise; *"reports an empty installed list as present: false, not as unknown"* (the `[]` ⇒ `false` leg); *"reports present: null when a reachable runtime answers nothing about its models"* (the honest residual, pinned so nobody "fixes" it into `false`); *"reports present: null exactly when the runtime is unreachable, list or no list"* (the `installedModels: null` ⇒ `null` leg, with the list deliberately containing the tag — **the row that fails on the old route**); two agreement rows, one over three stated-independent reachable cases and one for the unreachable case, which `present: null` makes agreeable by construction |
| 2 | `server/src/ai/profiles.test.ts` (11 rows, was 10) | *"names the model the resolver names, whatever the setting holds"* — the server's answer is compared with `effectiveModel(...)`'s for `''`, `'   '`, `'gemma4:12b-it-qat'` and `'qwen3.5:4b-q4_K_M-cloud'`, and the promoted case is additionally pinned to the literal so the row cannot agree with itself |
| 3 | `server/src/platform/setup-script.test.ts` (20 rows, was 15) | *"names the promoted default as the writing model it downloads"*; *"downloads the effective model whatever this Mac has in RAM"* (64/16/8/unreadable, through the seam); *"never assigns the model it downloads from a RAM branch"*; and a new `preflight-macos.sh` block: *"names the writing model as the one it checks and tells the owner to pull"*, *"never tells the owner that Apunta picks a model from this Mac"* (run at 64/16/8/unreadable), *"still reports the RAM table and its boundaries, unchanged"* |

The other six files are unchanged from attempt 1 and still green, including the
two that encoded the old policy (`installer/src/run.test.ts`,
`server/src/platform/setup-script.test.ts`).

### The probe the reviewer used, re-run

The reviewer's supplementary probe found the coupling broken by driving
`buildHealthResponse` with decorrelated `describe()` and installed-list inputs.
The same six states after this attempt (`/tmp/opencode/p14a2/probe.mts`, no
server, no port, `mkdtempSync` database only; output in
`probe-reachable-present-attempt2.out`):

```text
reachable, tag installed       reachable=true  modelPresent=true  present=true   present-null-IFF-unreachable: HOLDS   model/present agree: HOLDS
reachable, tag NOT installed   reachable=true  modelPresent=true  present=false  present-null-IFF-unreachable: HOLDS   model/present agree: VIOLATED (deliberately inconsistent input)
reachable, empty list          reachable=true  modelPresent=false present=false  present-null-IFF-unreachable: HOLDS   model/present agree: HOLDS
reachable, list unreadable     reachable=true  modelPresent=true  present=null   present-null-IFF-unreachable: VIOLATED   model/present agree: VIOLATED (residual, see below)
unreachable, list unreadable   reachable=false modelPresent=false present=null  present-null-IFF-unreachable: HOLDS   model/present agree: HOLDS
unreachable, list DID answer   reachable=false modelPresent=false present=null  present-null-IFF-unreachable: HOLDS   model/present agree: HOLDS
```

The reviewer's two VIOLATED rows are now HOLDS. Two honest qualifications:

- **"reachable, tag NOT installed"** is a deliberately inconsistent input — the
  probe tells `describe()` the model is present while the list does not have it.
  The two halves *must* disagree there; that is the decorrelation the row
  exists for. The route's own answer (`present: false`, from the list) is the
  right one.
- **"reachable, list unreadable"** is the one state the card's rule cannot
  close from the route, and it is the reviewer's own note, not a new problem: a
  runtime that answered `describe()` but whose `/api/tags` read then failed is
  `present: null`, because `false` would be a lie the owner sees and `true`
  would be a claim nobody checked. With `model`/`modelPresent` fixed by the card
  to stay `describe()`-derived and the three new fields fixed to be the
  resolver's answer over the installed list, no route can close it. It is
  reported rather than papered over, and it is item 1 of the return file's
  unresolved list for the coordinator.

## V2 — the whole repository suite

`v2-npm-test-attempt2.log`, exit **0**, 09:59:13Z → 09:59:20Z.

```text
 Test Files  127 passed (127)
      Tests  1644 passed (1644)
   Duration  7.26s
```

1644 against attempt 1's 1635: the nine new rows, and nothing else. Both suites
that encoded the old policy are in that number and pass. So is
`server/src/app.test.ts`, whose fake-mode health assertion at line 31 was never
edited. The pino lines in the log are P1.3's request-guard tests writing to the
console; the host name is replaced with `<host>` and the home folder with `~`
per RUN-CONFIG §4.

One observation, **P1.3's, not this card's**, repeated from attempt 1 because
it is still true: this run binds a fixed port, `127.0.0.1:7812`, from
`server/src/http/request-guard.test.ts` and
`server/src/test/real-socket-guard.test.ts`, outside
`scripts/v2/sandbox.mjs`. 7812 is inside the sandbox range and 7717 was never
contacted. No P1.4 test binds a port, so nothing here is charged to this card.

## V3 — lint and typecheck

`v3-lint-typecheck-attempt2.log`, exit **0** for both, 09:59:20Z → 09:59:31Z.

```text
> eslint . && prettier --check . && node scripts/check-no-external-urls.mjs && node scripts/collect-licenses.mjs --check
All matched files use Prettier code style!
THIRD-PARTY-LICENSES.md lists all 111 shipped packages.
lint exit: 0
```

`npm run typecheck` builds `@apunta/shared` and then typechecks shared, server,
installer, **web** and e2e, all clean:

```text
typecheck exit: 0
```

Attempt 1 recorded V3 as FAIL (lint 0, typecheck 2) on
`installer/src/catalog.test.ts:159,164` under `noUncheckedIndexedAccess`, a file
outside this card's May-edit list. That defect is fixed by this attempt's own
base: `07396d6` ("Fix typecheck regression in P1.5 catalog test (AM-035)") is an
ancestor of `a115718`. V3 is whole-repo green with nothing done to it here.
Must-not-edit `web/**` still typechecks against the extended `HealthResponseSchema`
with its two typed literals (`web/src/lib/setup.test.ts:11`,
`web/src/test/fakeApi.ts:300`) untouched.

## Acquisitions

None. No model was pulled, removed or replaced; no file outside the repository
was downloaded for this card; no network request was made.

## Stop conditions

The card's stop condition: a **stored** `llm_model` or `llm_profile` value would
change meaning under the new policy — report the value and the case, and do not
migrate settings or touch the owner's database. No setting was migrated and no
database was touched (HS-1). Two cases to report:

1. **By design, and not a stop** — the card's own words. An install with no
   `llm_model` on the owner's 16 GiB Linux box moves from `gemma4:12b-it-qat`
   (the RAM table's middle tier) to `qwen3.5:4b-q4_K_M` (the promoted default).
   `installer/src/run.test.ts`'s no-pull leg asserts exactly this across 64, 16,
   8 and unreadable memory. Attempt 2 adds the same assertion for the two
   scripts: across 64/16/8/unreadable memory, the setup walk's pull is always
   `ollama pull qwen3.5:4b-q4_K_M` and never a tier tag.

2. **A stored value whose meaning does change — the finding 4 case, reported
   here as the card requires.** The value is any `llm_model` naming a tag a
   guard rejects; the value the suite already uses is
   **`qwen3.5:4b-q4_K_M-cloud`**.

   | | Meaning |
   | --- | --- |
   | Before this card | `configuredModel` ran the stored tag through the `isLocalModelTag` gate and, for a cloud name, fell back to `LLM_PROFILES.quick.model` — here `qwen3.5:4b-q4_K_M` — and that was the tag that generated notes. The setting was silently *not* in effect. |
   | After this card | The stored tag resolves as `source: 'override'`; health reports `present: false` ("your setting is in effect and that model is not here"); generation returns the existing `model_missing` error and pulls nothing. |
   | Why | The card's fixed decision: "An override a guard rejects is reported `present: false` … rather than silently resolving and showing a different tag." The truth is the point. `isLocalModelTag` and `assertSupportedModelName` remain the guards at the use site, unchanged, and `present: false` is what the owner sees. |

   The test at `server/src/ai/profiles.test.ts` (*"never selects cloud-backed
   configured models, and says the one that is not here"*) proves the new
   behaviour, and this attempt's *"names the model the resolver names, whatever
   the setting holds"* now also pins that the generation path names the stored
   cloud tag rather than substituting one. This is the card's own decision, not
   a defect, and it is not something a settings migration could avoid: the value
   was never going to work, and now it says so.

`llm_profile` is unchanged: `LLM_PROFILES.quick.model` is written as
`PROMOTED_DEFAULT_MODEL`, which is the same string as before, and
`profiles.test.ts` pins the two equal. No stored `llm_profile` value changes
meaning.

## Attempt 1, for the record

Attempt 1 was verified against base `9bb587b`; attempt 2 against `a115718`.
Attempt 1's committed record is the same file's earlier state: V1 exit 0
(9 files, 168 tests), V2 exit 0 (127 files, 1635 tests), V3 lint 0 / typecheck 2
on the foreign `installer/src/catalog.test.ts` regression described above. Its
raw logs (`v1-card-tests.log`, `v1-step1-failure.log`, `v2-npm-test.log`,
`v3-lint-typecheck.log`) are still beside this file and are local only. Nothing
in attempt 1's implementation was reverted by this attempt; the four findings
are additive changes to it.
