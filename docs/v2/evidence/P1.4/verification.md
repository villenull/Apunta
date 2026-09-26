# P1.4 verification evidence

Card: **P1.4 One effective-model policy** (C-MODEL@1). Base commit given by the
coordinator: `9bb587b`. Working directory for every command below: repository
root.

Node **24.19.0** first on `PATH`, from `/tmp/opencode/n24/bin` — the tarball
already present in `/tmp/apunta-node-dl/`, which earlier cards on this branch
used. No download was made for this card.

```text
$ node --version
v24.19.0
```

**Where the raw output is.** The four `v*-*.log` files beside this one are
matched by `.gitignore`'s `*.log` and are therefore **local only** — the same
rule RUN-CONFIG §4 states for raw run logs. The excerpts, counts, exit codes and
timestamps a reviewer needs are reproduced in this file; the full logs are on
the machine that ran them, at `docs/v2/evidence/P1.4/`.

No server was started, no database was opened and no app was launched, so HS-2's
non-launching allowance covers every command here: the vitest suites open only
temporary databases created by `server/src/test/harness.ts` and by
`mkdtempSync` under the OS temp dir (`server/src/routes/health.test.ts`). No row
in any of the nine files calls `listen`, and no sandbox port was bound, so per
RUN-CONFIG §3 these rows ran bare and port 7717 was never contacted. Port
**7813**, this card's sandbox port, was not needed and not used; no sandbox run
folder exists for this card.

## Isolation, and a concurrent agent in the tree

Two facts about the working tree are recorded here because they change how these
numbers should be read. Neither is a P1.4 change, and neither was created,
touched or reverted by this session.

1. **HEAD advanced during the session.** The card was verified against base
   `9bb587b` at the start of the session (`git log -1` →
   `9bb587b502b1a47cef047152909ad5d00f7bb25b`). By the time the tests were
   running, the top commit was `a99094b5f73313b42f373ed5b822bbb570b210d0`
   ("Record card P1.5 APPROVED (v2 state)"), committed by the coordinator. That
   commit touches five paths, all under `docs/v2/`:

   ```text
   docs/v2/evidence/P1.5/verification.md
   docs/v2/state/PROGRESS.json
   docs/v2/state/cards/P1.5.json
   docs/v2/state/dispatch/P1.5-review.md
   docs/v2/state/reviews/P1.5-impl.md
   ```

   No path in this card's May-edit list is among them, so no P1.4 file was
   changed underneath this session. Nothing was pulled, merged, rebased or
   reset here.

2. **Another agent's uncommitted C-REQ@1 work is in the tree.** `git status`
   shows `server/src/http/request-guard.ts` as untracked plus edits to
   `server/src/app.ts`, `server/src/boot-error.ts`, `server/src/test/harness.ts`,
   `shared/src/errors.ts` and `web/**`. None of it is in the base commit
   (`git cat-file -e 9bb587b:server/src/http/request-guard.ts` → *not in base*).
   Per CLAUDE.md's "Working alongside background agents", none of it was
   committed, stashed, reverted or otherwise disturbed here. Its one effect on
   this card's evidence is described under *Deviations* below.

## Criteria

| ID | Command | Started (UTC) | Exit | Evidence |
| --- | --- | --- | --- | --- |
| — | Step 1, tests written before any implementation | 09:27:30Z | 1 | `v1-step1-failure.log` |
| V1 | `npm run build:shared && npx vitest run <the card's nine paths>` | 09:35:37Z | **0** | `v1-card-tests.log` |
| V2 | `npm test` | 09:35:41Z | **0** | `v2-npm-test.log` |
| V3 | `npm run lint && npm run typecheck` | 09:35:16Z | lint **0**, typecheck **2** | `v3-lint-typecheck.log` |

## Step 1 — the recorded failure, before any implementation

`v1-step1-failure.log`, 1401 lines, exit 1. Every leg named in the card's Step 1
was written first, in the file that proves it, and the whole set was run before
a single implementation line was written.

```text
 Test Files  9 failed (9)
      Tests  37 failed | 79 passed (116)
```

Two of the nine are file-level import failures — the shape a not-yet-existing
module takes, and the point of writing the test first:

- `shared/src/effective-model.test.ts` — `import { effectiveModel } from
  './effective-model.js'` against a file that did not exist.
- `server/src/eval/eval.test.ts` — `import { defaultModels } from './cli.js'`
  against a CLI that exported no such symbol, and whose bare top-level
  `await main()` would have run a full eval on import.

The seven behavioural files failed on their assertions, with the old policy
visible in the output: `installer/src/plan.test.ts` reported
`expected 'gemma4:12b-it-qat' to be 'qwen3.5:4b-q4_K_M'`, and
`installer/src/run.test.ts` reported the same inversion from the run side.

## V1 — the card's nine vitest paths

`v1-card-tests.log`, exit **0**, 09:35:37Z → 09:35:38Z.

```text
 Test Files  9 passed (9)
      Tests  168 passed (168)
   Duration  623ms
```

Every Step 1 leg is green in the file the card names for it. The legs, by file:

| File | What it now proves |
| --- | --- |
| `shared/src/effective-model.test.ts` (new) | the two contract rows; blank/whitespace/absent falling through to promoted; a cloud override resolving as `'override'` with `present: false`; all three `present` cases including `installed: null` → `null` and `installed: []` → `false`; `tag`/`source` independent of the runtime; the four memory cases; every one of those four resolving to `PROMOTED_DEFAULT_MODEL` |
| `installer/src/plan.test.ts` | the plan's tag and source; the new `reason` text, with the memory not cited as the reason and `memoryGib` still reported; the download size following the effective tag |
| `installer/src/run.test.ts` | the no-pull leg: across 64, 16, 8 and unreadable memory, `pulledTags` is exactly `[PROMOTED_DEFAULT_MODEL]` and no tier the machine could have used is pulled; the old `gemma4:12b-it-qat` and "8 GB" rows updated to the new policy rather than deleted |
| `server/src/ai/profiles.test.ts` | server resolution with and without an override, through the existing `fetchImpl` seam; an override that is not installed → `present: false` with the tag still reported and no `/api/pull` on the seam; the cloud row updated rather than deleted; `LLM_PROFILES.quick.model === PROMOTED_DEFAULT_MODEL`; `installedModelTags` splitting `null` from `[]` |
| `server/src/ai/model-picker.test.ts` | the renamed `recommendedModelForMemory` and its four answers; `defaultModelForMachine()` returning the promoted default and not consulting the memory reading |
| `server/src/ai/ollama.test.ts` | a provider built with no `resolveModel` falls back to the promoted default, not the memory picker |
| `server/src/eval/eval.test.ts` | `defaultModels(args)` returning the promoted default with no `--models`, still `'fake'` under `--fake`, and never overriding an explicit `--models` |
| `server/src/routes/health.test.ts` | the three `present` legs through `buildApp`'s providers seam plus the `installedModels` seam; the agreement rule; the fake-mode leg |
| `server/src/platform/setup-script.test.ts` | the scripts' tag literals and RAM boundaries still agreeing with `shared/`, now under the renamed function; the promoted default among the tags the script already knows |

## V2 — the whole repository suite

`v2-npm-test.log`, exit **0**, 09:35:41Z → 09:35:49Z.

```text
 Test Files  127 passed (127)
      Tests  1635 passed (1635)
```

Both suites that encoded the old policy are in that number and pass:
`installer/src/run.test.ts` and `server/src/platform/setup-script.test.ts`. So
is `server/src/app.test.ts`, whose fake-mode health assertion at line 31 was not
edited — the additive schema lets the short shape keep typechecking and the
route's real-mode answer still agrees with `describe()`.

The log's pino lines are another agent's C-REQ@1 request-guard tests writing to
the console. The host name has been replaced with `<host>` and the home folder
with `~` per RUN-CONFIG §4.

## V3 — lint and typecheck

`v3-lint-typecheck.log`. Three runs are recorded in it; the first two are the
P1.4 findings being fixed, and the third is the state of this card's code.

**Run 1** (09:34:14Z) — lint exit 1, typecheck exit 2. Five findings, all
P1.4's own:

```text
/home/villenull/Projects/Apunta/server/src/ai/model-picker.ts
  4:56  error  'recommendedModelForMemory' is defined but never used.
src/effective-model.test.ts(56,29): error TS2379: … 'exactOptionalPropertyTypes: true'
src/ai/model-picker.ts(4,56): error TS6133: 'recommendedModelForMemory' is declared but its value is never read.
src/catalog.test.ts(159,12): error TS2532: Object is possibly 'undefined'.
src/catalog.test.ts(164,12): error TS2532: Object is possibly 'undefined'.
src/plan.ts(73,35): error TS2379: … 'exactOptionalPropertyTypes: true'
```

Four were fixed: the redundant import in `model-picker.ts`, `override ?? null` at
the one `plan.ts` call site that can pass `undefined`, and the absent-override
row in `effective-model.test.ts` re-expressed as an omitted key rather than an
explicit `undefined`.

**Run 2** (09:34:48Z) — lint exit 1, typecheck exit 2. ESLint clean; Prettier
named three of this card's files. Fixed with
`npx prettier --write server/src/ai/profiles.test.ts server/src/ai/profiles.ts
server/src/eval/cli.ts` (explicit paths, all in the May-edit list).

**Run 3** (09:35:16Z), final — **lint exit 0**, typecheck **exit 2**.

```text
$ npm run lint        # eslint + prettier --check + check-no-external-urls + collect-licenses --check
lint exit code: 0
```

```text
src/catalog.test.ts(159,12): error TS2532: Object is possibly 'undefined'.
src/catalog.test.ts(164,12): error TS2532: Object is possibly 'undefined'.
```

`grep -c 'error TS'` on the log returns **2**. Both are in
`installer/src/catalog.test.ts`, and that file is outside this card's May-edit
list, so HS-9 forbids editing it. It is also not this card's breakage: all three
inputs are byte-identical to the base commit the coordinator gave, which makes
the failure independent of anything here —

```text
$ diff -q <(git show 9bb587b:installer/src/catalog.test.ts) installer/src/catalog.test.ts
installer/src/catalog.test.ts: IDENTICAL to base 9bb587b
installer/src/catalog.ts: IDENTICAL to base 9bb587b
installer/tsconfig.typecheck.json: IDENTICAL to base 9bb587b
```

The rows are `expect(WRITING_MODELS['gemma4:12b-it-qat'].licence)` under
`noUncheckedIndexedAccess`, added by P1.5's commit `0841207`, which is an
ancestor of the base. The fix is a non-null assertion or a lookup helper in a
file P1.4 may not touch; it is handed back rather than made.

Every workspace that P1.4 edited typechecks clean: `shared`, `server`, `web`
(the additive `HealthResponseSchema` leaves the two typed literals in
Must-not-edit `web/**` compiling untouched), and `e2e`.

## Acquisitions

None. No model was pulled, removed or replaced; no file outside the repository
was downloaded for this card.

## Stop conditions

The card's stop condition is a **stored** `llm_model` or `llm_profile` value
changing meaning. No such value was found, and none was migrated:

- `llm_profile` — `LLM_PROFILES.quick.model` is unchanged in value; it is now
  written as `PROMOTED_DEFAULT_MODEL`, which is that same string. No stored
  value changes meaning.
- `llm_model` — the only behaviour change is for an **absent** setting. A
  non-empty setting still resolves to itself, and a blank one still means "no
  setting".

The by-design change the card asks to be recorded as evidence: an install with
no `llm_model` on the owner's 16 GiB Linux box moves from `gemma4:12b-it-qat`
(the RAM table's middle tier) to `qwen3.5:4b-q4_K_M` (the promoted default).
`installer/src/run.test.ts`'s no-pull leg asserts exactly this across 64, 16, 8
and unreadable memory: the pull is for the promoted tag on all four. The
existing V1 data in `config/recovery/current-linux.json` says the same thing
about the old behaviour, and is out of this card's scope.
