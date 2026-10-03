# P3.4 proposal v5 — pure model evidence

For `docs/v2/state/P3.4-REPAIR-PROPOSAL-v5.md`. Author-side evidence only: this
is **not** an acceptance of the contracts, not a runtime result, and not an
approval of the owner's decisions.

**Nothing here was run against the application.** No server, app, build, model,
audio, input, display, network or download; port 7717 never contacted; no live
data folder opened; no card, dispatch, checkpoint, source, tool or test file
edited or committed. P3.5's in-flight `web/src/main.tsx` and
`src-tauri/src/main.rs` were left dirty and untouched.

## 1. What exists, and where

| File | Git | SHA-256 |
| --- | --- | --- |
| `build/p3.4-spec-v5/model.mjs` (536 lines, the pure model) | ignored (`.gitignore:55`) | `6bb4995267f81fd64dc5e181a147564f679eadd7eaabae8e2995cc112cfbf258` |
| `build/p3.4-spec-v5/model.test.mjs` (709 lines, adversarial fixtures) | ignored | `9342192802b9890fe1102cfdd7b1a161ddfc51a949946f4b6fefd01b058e69c6` |
| `build/p3.4-spec-v5/tool/build-dispatch.mjs` (revision-4 §T.1 applied to `git show 8783181:`) | ignored | `7863b411cd1a72282184dd439ecde42eb267277f594a6ba58840c05e6e2d84b3` |
| `build/p3.4-spec-v5/tool/plan-lib.mjs` (unmodified copy of `git show 8783181:`) | ignored | `82e1d066b50ae7b57850f01b249610dcc6f809c97fb87531f968a3d085a6f767` |
| `docs/v2/evidence/P3.4/proposal-ir4/tooling-guard.test.mjs` (reused unchanged) | committed | `ec99468e0ed8a1ed622cc2c6a825f44f5215867e2ac0891907c963b065b8a851` |

The model has no imports, no clock of its own, no `Date.now`, and no IO: time
and every side effect are injected, so a hung await, a late result and a spent
deadline are exercised without waiting and without an application. The patched
tool copy is deliberately **not** committed — committing it would be applying the
§T grant this proposal only prepares.

## 2. Exact commands and exits

```
$ git check-ignore -v build/p3.4-spec-v5
.gitignore:55:build/	build/p3.4-spec-v5                                    exit 0

$ node --test build/p3.4-spec-v5/model.test.mjs
ℹ tests 41  ℹ pass 41  ℹ fail 0                                            exit 0

$ git show 8783181:docs/v2/tools/build-dispatch.mjs > build/p3.4-spec-v5/tool/build-dispatch.mjs
$ git show 8783181:docs/v2/tools/plan-lib.mjs        > build/p3.4-spec-v5/tool/plan-lib.mjs
$ node --check build/p3.4-spec-v5/tool/build-dispatch.mjs               exit 0
$ APUNTA_TOOL_DIR=$PWD/build/p3.4-spec-v5/tool node --test \
    docs/v2/evidence/P3.4/proposal-ir4/tooling-guard.test.mjs
ℹ tests 14  ℹ pass 14  ℹ fail 0                                            exit 0

$ git diff --stat HEAD -- docs/v2/tools ; git status --porcelain
(empty) ; ?? docs/v2/state/P3.4-REPAIR-PROPOSAL-v5.md
 M src-tauri/src/main.rs   M web/src/main.tsx        # P3.5's, untouched
```

`node --version` → `v26.8.2`. Nothing staged, nothing committed.

## 3. The model's cases (41, all passing)

**Deadline (C)** — `C1` immutable: no `reset`, no `extend`, no per-step cap;
`C2` a hung await ends at the deadline and a later dispatch never runs;
`C3` a result arriving after the deadline is a failure; `C4` a rejected IO is
terminal.

**Affine calibration (D)** — `D1` scales 1, 1.5, 2 and the mixed axes 1×2, 2×1
map the target exactly; `D2` points differing in only one client axis end the run
with no click (the committee's counterexample); `D3` `NaN`, `Infinity` and a
non-numeric measurement end the solve before any conversion and expose no
`toNative`; `D4` the bound is checked **before use**, both directions (`0`, `-1`,
`4.5`, and a per-axis violation naming `k_y`); `D5` one point is not a solve;
`D6` containment rejects an off-screen point, so no move is issued; `D7` read-back
needs 1 px and the app window id or a positive matching pid.

**Commands (F)** — `F1` status, signal, `XError` in either stream, and a missing
result all fail closed.

**Reader (G)** — `G1` one publication installs and selects every global index
(45 rectangles across two batches, batch 1 carrying 40–44); `G2` a mid-arrival
read is incomplete with the missing batches named, and completes when the rest
arrives; `G3` a newer epoch forbids falling back to an older complete
publication; `G4` a truncated sighting is discarded whole — no merge, no replace,
no conflict, no epoch raised; `G5` an identical complete duplicate is idempotent
and a differing one FAILs; `G6` a missing field or an out-of-range index is
malformed and installs nothing; `G7` `0`, `-1`, `1.5`, `01`, a safe-integer
overflow (`9007199254740993`), `NaN`, `1e3` and empty epochs are all malformed and
never raise the highest seen epoch (no counter wrap); `G8` out-of-order, growing
(3 → 81) and shrinking (81 → 1) publications are read, not refused as duplicates;
`G9` A → B → A is three epochs and the third is selected; `G10` one epoch mixing
declared totals is not a frame; `G11` a fact line is not a batch line, and the
hook emits no line at all for an empty page; `G12` a batch installs as a whole map
with no key carried over.

**Selection (H)** — `H1` the `(label, tag, testId)` triple picks the row and never
the appended tooltip (no hover ritual, no wait); `H2` two matches are ambiguous,
naming the global indices, and never first-match-wins; `H3` a `testId`
distinguishes two identical leaves.

**Gate and assertion (I)** — `I1` the gate is presence of `href` **and**
`ipcProbe` and nothing else, and a `pending` probe still passes the gate;
`I2` the exact ACL denial with all four conjuncts is the only pass, and `pending`
at the deadline, `resolved`, `Command listen not found`, the unproducible
prefixed not-found string, a present `tauri`, an absent door and an absent
`invoke` are all failures; `I3` exactly five rows in **both** cascade arms, with
the zero-line arm and the incomplete-fact-set arm carrying their own causes.

**Click run (J)** — `J1` one click, dispatched only after a fresh witness within
2 px, ending on the `href` transition; `J2` a stale witness issues no dispatch at
all; `J3` an off-screen target is refused before the move; `J4` a read-back miss
fails closed after the move and before the click; `J5` a hung read-back ends at
the deadline with no click; `J6` a spent deadline refuses the dispatch;
`J6b`/`J6c`/`J6d` a descriptor mismatch, a click the page never observed, and a
non-zero move status each fail closed; `J7` the landing predicates, with
`href` unchanged a failure; `J8` the rectangle signature is diagnostic text and is
never a landing fact.

## 4. The tooling cases (14, all passing)

`T1`–`T5b` are the proposal's §T.2 tests; the nine `extra:` cases are the ir4
reviewer's. `T5`, `T5b` and the last case assert the attempt-4 line and message
**byte for byte**, which is why §I.2 branches per attempt instead of computing
arithmetic. `T3` requires exactly `status 0`; `T2`, `T4`, `extra:` 7 and 12 are
the unfired-promise cases.

**The H1 fixture correction is load-bearing and is in force here.**
`plan-lib.mjs:215` throws ``file name must be <id>.md`` when a card's H1 does not
match its file name, so a `P3.4.md` fixture whose H1 still reads `# T1 Test card`
never reaches the guard and the keyed tests fail for the wrong reason. The reused
committed test already parameterises `card(id)`'s H1 (`tooling-guard.test.mjs:55`),
which is why `T3` and `T4` reach the guard here; a new copy of that file must keep
that parameterisation.

## 5. What the model does not prove

- That WebKitGTK under `xvfb-run` delivers a warp-driven `pointermove`. The model
  proves only that its absence is a named `NOT RUN` with no click.
- Anything about native geometry, the outer X rectangle, or any titlebar height.
- That this host's release binary returns the exact ACL string, or that the
  inspector channel and the sandbox rows behave as the card describes.
- Anything about a real page: every fixture here is synthetic.

## 6. If the model goes red

Fix the specification or the model. **Never** a fixture expectation, and never a
threshold. During this authoring round exactly one model change was made on that
rule: `checkCommand` now reads `signal` before `code`, because a signalled child
reports `code === null` and the ordering had turned a kill into a bare
"exited null". Three fixture rewrites in the same round removed fixtures that
contradicted the contract (an incomplete batch with a full `total`, a `batch`
index outside its own `ceil(total/40)`, and an epoch-5 sighting that was not a
complete header), not expectations that hid a failure.