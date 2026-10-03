# P3.4 owner proposal v5 — independent review reproductions

Produced by `docs/v2/state/reviews/P3.4-owner-proposal-ir5.md` (fresh
independent review of `docs/v2/state/P3.4-REPAIR-PROPOSAL-v5.md` and
`docs/v2/evidence/P3.4/proposal-v5/MODEL.md`, candidate commit `bf6e7f0`).

**Nothing here was run against the application.** No server, app, build, model
runtime, audio, input, display, download or network; port 7717 never contacted;
no live data folder opened; no card, dispatch, checkpoint, source, tool or test
file edited. Every script is pure synthetic JavaScript over synthetic strings
and numbers, imports the author's model read-only, and exits 0 after printing
its finding.

## 0. Pinned interpreter and hashes

```
$ ~/.local/share/apunta-node/node-v24.19.0-linux-x64/bin/node --version
v24.19.0
$ sha256sum build/p3.4-spec-v5/model.mjs build/p3.4-spec-v5/model.test.mjs
6bb4995267f81fd64dc5e181a147564f679eadd7eaabae8e2995cc112cfbf258  build/p3.4-spec-v5/model.mjs
9342192802b9890fe1102cfdd7b1a161ddfc51a949946f4b6fefd01b058e69c6  build/p3.4-spec-v5/model.test.mjs
```

Both hashes match `docs/v2/evidence/P3.4/proposal-v5/MODEL.md` §1. The author's
originals were not modified; the adversarial runs import them through
`APUNTA_P34_MODEL` (defaulting to the hashed path above).

## 1. `reader-epoch.mjs` — G4 is mislabelled, and a newer malformed header falls back

```
$ ~/.local/share/apunta-node/node-v24.19.0-linux-x64/bin/node \
    docs/v2/evidence/P3.4/proposal-ir5/reader-epoch.mjs
P1 full length=227 truncated length=120
P1 untruncated line -> kind=malformed reason=batch 1 is outside 0..0
P1 truncated line   -> kind=malformed reason=batch 1 is outside 0..0
P2 before: frame.ok=true epoch=5 highestSeen=5
P2 newer header (epoch=6) truncated -> kind=malformed highestSeenAfter=5
P2 after: frame.ok=true epoch=5 reason=undefined
```

- **P1** reproduces `model.test.mjs:263-283` (`G4`). The fixture is
  `batchLine({epoch:7,batch:1,total:6,...}).slice(0,120)`; with `total=6`,
  `ceil(6/40)=1`, so `batch 1` is out of range and the line is discarded
  **before** any truncation matters. The untruncated line is malformed for the
  identical reason. `G4` therefore does not exercise a truncated sighting at
  all, and its `highestSeenEpoch === 7` assertion is vacuous (the discarded line
  carries the same epoch 7).
- **P2** is the root divergence: after a complete epoch-5 frame, a line with a
  parseable newer header (`epoch=6`) but a truncated body is discarded and
  `highestSeenEpoch` stays 5, so `frame()` returns the **older** complete frame
  with `ok=true`. Root (`P3.4-committee-resolution.md` line 8): "A valid header
  identifying a newer epoch still prevents fallback to an older epoch while that
  publication remains incomplete." The model raises the epoch only after full
  field completeness, so a valid header with a malformed body does not block
  fallback.

## 2. `click-witness.mjs` — pre-move witness, missing `ptrN`, triple selection, no calibration

```
$ ~/.local/share/apunta-node/node-v24.19.0-linux-x64/bin/node \
    docs/v2/evidence/P3.4/proposal-ir5/click-witness.mjs
P3 ok=false dispatched=[] reason=the fresh pointer observation is 100,70 px from the target centre
P4 (ptrN never advances) ok=true dispatched=["mousemove","getmouselocation","click"] reason=href transitioned to "y"
P5 same label+tag, distinct testId: pair-key ok=false reason=no rectangle carries label "Open" with tag "button" and testId ""; 2 carry the label
P5                                  triple ok=true index=1
P6 model exports calibrate()? undefined
```

- **P3** is the material model defect. `runClick` (`model.mjs:451-457`) fetches
  `ops.nextFact()` **before** the target warp and fails unless it is within 2 px
  of the target. On a real run the newest fact before the target warp is the last
  calibration pointer, not the target, so the run ends with **no move and no
  click**. The contract (proposal §D.8) requires only a fresh observation
  **after** the warp. `J1` (`model.test.mjs:527-549`) hides this by setting
  `FACT_BEFORE.ptrCX/ptrCY` to the target.
- **P4**: a post-move fact whose `ptrN` never advances still passes and clicks.
  Contract §D.5 requires `ptrN` strictly greater; the model checks only
  `ptrCX/ptrCY`.
- **P5**: the selection key is the `(label, tag, testId)` triple. Two leaves
  with the same label and tag but different `testId` are distinguished; root
  (`P3.4-committee-resolution.md` line 16) says "unique label/tag pair".
- **P6**: no calibration flow exists in the model; `runClick` starts from a
  pre-solved transform, so the two bootstrap moves, their containment and
  read-back, and `ptrN` are unmodelled.

## 3. `hung-dispatch.mjs` — a hung dispatch is not bounded by the deadline

```
$ ~/.local/share/apunta-node/node-v24.19.0-linux-x64/bin/node \
    docs/v2/evidence/P3.4/proposal-ir5/hung-dispatch.mjs
hung-move: DID NOT RESOLVE after the deadline advanced; dispatched=["mousemove"]
```

`dispatchGuarded` (`model.mjs:113-122`) checks expiry only **before** running;
it never races the dispatched operation against the deadline. A hung
`xdotool mousemove` (or `click`) never resolves even after the injected clock
passes the deadline, so contract §E's "a hung command ends at the deadline" is
not modelled. The suite tests a hung **await** (`J5`) but no hung **dispatch**.

## 4. Tooling (author's own claim, re-run)

```
$ APUNTA_TOOL_DIR=$PWD/build/p3.4-spec-v5/tool \
    ~/.local/share/apunta-node/node-v24.19.0-linux-x64/bin/node --test \
    docs/v2/evidence/P3.4/proposal-ir4/tooling-guard.test.mjs
ℹ tests 14  ℹ pass 14  ℹ fail 0   exit 0
```

The 14 tooling tests pass against the ignored patched copy, and
`docs/v2/tools/**` is unchanged (`git diff --stat HEAD -- docs/v2/tools` is
empty). This confirms the §I grant is executable; it is not itself a defect.
