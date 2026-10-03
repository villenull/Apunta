# P3.4 proposal v5 — repair2 evidence (ir6 F1–F4)

For the bounded repair pass answering the four executable defects in
`docs/v2/state/reviews/P3.4-owner-proposal-ir6.md` (F1–F4). Author-side evidence
only: **not** an acceptance of the contracts, not a runtime result, and not an
approval of the owner's decisions. Prior ir5 defects are confirmed CLEAR by ir6
and were not touched.

**Nothing was run against the application.** No server, app, build, model runtime,
audio, input, display, download or network; port 7717 never contacted; no live data
folder opened; no card, dispatch, checkpoint, source, tool or test file edited or
committed. P3.5's in-flight source and the P3.5 candidate `46419f5` were left
untouched. Every execution below was `node --test` or `node` over pure synthetic
fixtures on the **pinned** interpreter
`/home/villenull/.local/share/apunta-node/node-v24.19.0-linux-x64/bin/node`
(`v24.19.0`), or the same interpreter on synthetic string fixtures.

---

## 0. What was written, and what was preserved

Only two tracked paths were written: `docs/v2/state/P3.4-REPAIR-PROPOSAL-v5.md`
(the minimal poll/measured clauses) and
`docs/v2/evidence/P3.4/proposal-v5-repair2/**`. The work happened in a **new
ignored copy**, `build/p3.4-spec-v5-repair2/`, made with
`cp -a build/p3.4-spec-v5-repair build/p3.4-spec-v5-repair2` and then edited in the
copy only.

| File | Git | SHA-256 |
| --- | --- | --- |
| `build/p3.4-spec-v5-repair2/model.mjs` (881 lines) | ignored | `dbca7da9ece908729431dbf8e83c8e66d014cbb7b87e7abc2f11480cb33ed9f4` |
| `build/p3.4-spec-v5-repair2/model.test.mjs` (1394 lines) | ignored | `9c2c58621bf1e435b7577831fc692b6db5d2ecd16af691715ebe0eeccf1346c0` |
| `build/p3.4-spec-v5-repair2/tool/build-dispatch.mjs` | ignored | `7863b411cd1a72282184dd439ecde42eb267277f594a6ba58840c05e6e2d84b3` (**unchanged**) |
| `build/p3.4-spec-v5-repair2/tool/plan-lib.mjs` | ignored | `82e1d066b50ae7b57850f01b249610dcc6f809c97fb87531f968a3d085a6f767` (**unchanged**) |
| `build/p3.4-spec-v5-repair/model.mjs` (ir6 author, untouched) | ignored | `e9e8ce7a422d0bb88f81a20249e2dc9e7b786038dd2012e2f1050ed49d57a699` |
| `build/p3.4-spec-v5-repair/model.test.mjs` (ir6 author, untouched) | ignored | `263b3691f10b447283611cf3dcddf8b94d0ac7c580c461377d44874092c424ec` |
| `build/p3.4-spec-v5/model.mjs` (revision 5, untouched) | ignored | `6bb4995267f81fd64dc5e181a147564f679eadd7eaabae8e2995cc112cfbf258` |
| `build/p3.4-spec-v5/model.test.mjs` (revision 5, untouched) | ignored | `9342192802b9890fe1102cfdd7b1a161ddfc51a949946f4b6fefd01b058e69c6` |
| `docs/v2/state/P3.4-REPAIR-PROPOSAL-v5.md` (399 lines) | tracked | `12a81e7c3361e906a88e169dce10a902f4fe0750d7db8558a7aab6acca3e60ed` |
| `docs/v2/evidence/P3.4/proposal-v5-repair2/geometry-command.adapted.mjs` | tracked (new) | `b1a2d552063f0e4b977def2ed80c4c3c9a20872d970ccf7cde90c93a7da13161` |
| `…/measured-native.adapted.mjs` | tracked (new) | `a87bc6ae033c000b3dc703cfcbf11e745ac7077a2ca7b4a5139b7ebe2f5cfde9` |
| `…/observation-wait.adapted.mjs` | tracked (new) | `6750f359d97485fb11bbb3ea2cb3d4b35c1a4405a82e8cffefd220e3c0232a79` |
| `…/reordered-duplicate.adapted.mjs` | tracked (new) | `d104e0a9e21ce16254b9dbcfe7bc2f86be32cb5bbd4fef506a4f8426a20a714a` |
| `docs/v2/evidence/P3.4/proposal-ir6/{geometry-command,observation-wait,measured-native,reordered-duplicate}.mjs` | committed | `c4c7b338…`, `7526dbe6…`, `8eb815d6…`, `12f4597f…` — **unchanged** |

The tool copies were **not modified at all**; §I's grant remains prepared, never
applied, and `git diff --stat HEAD -- docs/v2/tools` is empty.

---

## 1. The four fixes

### F1 — the geometry command's outcome is classified (fail closed)

`runFlow` now runs `checkCommand('getwindowgeometry', geometry.value)` immediately
after the geometry await and **before** any field is consumed
(`model.mjs:792-793`). A non-zero status, a signal or an `XError` in either stream
is an immediate failure naming the command; the numeric validation that follows is
unchanged. This is the same uniform command protocol applied to `mousemove`,
`getmouselocation` and `click` — no geometry special-case and no early
missing-field refusal.

Original ir6 probe, run unmodified through `APUNTA_P34_MODEL`:

```
BEFORE (build/p3.4-spec-v5-repair/model.mjs)
  healthy geometry (code 0): ok=true clicked=true
  geometry code=1 + stderr:  ok=true clicked=true
  geometry XError on stdout: ok=true clicked=true
  geometry signal SIGKILL:   ok=true clicked=true
AFTER  (build/p3.4-spec-v5-repair2/model.mjs)
  healthy geometry (code 0): ok=false clicked=false   # the probe's healthy geometry omitted the status fields
  geometry code=1 + stderr:  ok=false clicked=false reason=getwindowgeometry exited 1: xdotool: BadWindow
  geometry XError on stdout: ok=false clicked=false reason=getwindowgeometry reported XError: XError: BadValue
  geometry signal SIGKILL:   ok=false clicked=false reason=getwindowgeometry was killed by signal SIGKILL
```

Adapted copy `geometry-command.adapted.mjs` (the healthy case carries the full
`code/signal/stdout/stderr` protocol the contract's `spawnAsync` resolves with):

```
healthy geometry (code 0, full protocol): ok=true clicked=true
geometry code=1 + stderr:  ok=false clicked=false
geometry XError on stdout: ok=false clicked=false
geometry signal SIGKILL:   ok=false clicked=false
```

Model cases: `F1-g` (new) and the pre-existing `F1`.

### F2 — one shared deadline-raced observation poll

New exported pure helper `pollObservation` (`model.mjs:193-212`). It reads an
injected `currentFact` repeatedly, waits between reads through an injected
`schedule`, and races **every read and every wait** against the one immutable
deadline. `classify(fact)` is tri-state: `ok`, terminal fail, or pending (wait for
the next 250 ms hook tick). A thrown predicate is fail closed. There is no phase
timer and no reset.

It is now used for every "require a fact line" step: the viewport, the `ptrN`
baseline, the post-warp witness, the `clickN` baseline, the fresh click fact, and
the landing. A **stale** fact waits; a **fresh but wrong or malformed** fact fails
closed, so a known-wrong fresh descriptor is never skipped while a good one is
awaited. `landingFact` now reports `pending: true` for an unchanged landing so the
landing poll waits instead of failing a healthy-but-not-yet-published landing.

Original ir6 probe, run unmodified:

```
BEFORE (build/p3.4-spec-v5-repair/model.mjs)
  (a) delayed pointer observation: ok=false nextFactCalls=3
      reason=bootstrap 1: ptrN read 0, not strictly greater than 0; no click issued
  (b) delayed landing observation: ok=false readsAfterClick=1
      reason=... href did not change ("http://127.0.0.1:7717/")
AFTER  (original probe, unchanged): fails earlier at the probe's geometry protocol, which omitted the status fields.
```

Adapted copy `observation-wait.adapted.mjs`, whose fixture models the hook's
change-only publication and injects the scheduler that drives its ticks:

```
(a) delayed pointer observation: ok=true ticks=4 reason=... href transitioned ...
(b) delayed landing observation: ok=true ticks=4 reason=... href transitioned ...
(c) never-delivered pointermove: ok=false clicked=false reason=the target deadline expired
```

Model cases: `F2-a` (delayed viewport + baseline), `F2-b` (every warp waits),
`F2-c` (landing on a later tick), `F2-d` (a viewport or baseline that never
appears → deadline), `F2-e` (landing never arrives → deadline, no resurrection),
`F2-f` (interrupted read → deadline), `F2-g` (fresh malformed click fact fails
closed), `F2-h` (predicate throws → fail closed), `F2-i` (hung poll ends at the
deadline). `F4`, `F5`, `J6c`, `J6e` and `F9` keep their meaning and now end at the
deadline.

### F3 — the solve uses the measured native read-back

`guardedMove` now returns `native = { x: read.value.X, y: read.value.Y }` — the
measured read-back it already validated to ≤ 1 px — alongside the measured client
`seen` (`model.mjs:605`). `runFlow` solves from `one.native`/`two.native`, not
from the commanded `naive`/`displacement` (`model.mjs:848`). The ≤ 1 px
read-back check is unchanged and still matters.

Original ir6 probe, run unmodified (before) and adapted only to carry the geometry
status fields (after):

```
BEFORE (build/p3.4-spec-v5-repair/model.mjs)
  commanded solve: read-back delta 0 -> target asked {"x":627,"y":653} (ok=true)
  commanded solve: read-back delta 1 -> target asked {"x":627,"y":653} (ok=true)
AFTER  (measured-native.adapted.mjs)
  measured solve: read-back delta 0 -> target asked {"x":627,"y":653} (ok=true)
  measured solve: read-back delta 1 -> target asked {"x":628,"y":653} (ok=true)
  measured solve (sx = commanded + 1) asks x=628
```

Model cases: `F3-m` (a 1 px read-back difference moves the target by 1 px) and
`F3-n` (asymmetric per-point native errors at scales 1, 1.5 and 2; the target
equals the independently computed measured solve and the fresh witness validates
before the click).

### F4 — the duplicate comparison is field-by-field

`createBatchReader` now compares two complete sightings with `sameRect`, which
compares the seven named field values (`x y w h l t d`) index by index, instead of
`JSON.stringify` (`model.mjs:324-330`, `model.mjs:414-417`). Query-parameter order
and index order are irrelevant, so a permuted identical duplicate is idempotent; a
changed value is still a conflict.

Original ir6 probe, run unmodified:

```
BEFORE (build/p3.4-spec-v5-repair/model.mjs)
  reordered identical duplicate: kind=conflict conflict=SET frame.ok=false
AFTER  (build/p3.4-spec-v5-repair2/model.mjs)
  reordered identical duplicate: kind=idempotent-duplicate conflict=null frame.ok=true
```

Adapted copy `reordered-duplicate.adapted.mjs` adds an index-order permutation and
a changed-value case:

```
permuted identical duplicate: kind=idempotent-duplicate conflict=null frame.ok=true
changed value: kind=conflict frame.ok=false reason=two complete sightings of epoch 2 batch 0 differ
```

Model case: `F4-r` (new). The pre-existing `G5` still pins the differing-value
conflict.

---

## 2. Necessary fixture interface changes (before → after)

1. **Command protocol on geometry.** The geometry command result must now carry
   `code/signal/stdout/stderr`, because it is classified like every other command.
   Before, the fixtures returned only `{id,x,y,w,h,pid}`; after, they return the
   full protocol plus the parsed fields. This is why the original ir6 geometry and
   observation-wait probes fail on the repaired model at the geometry step: their
   synthetic healthy geometry omitted the status fields. The adapted copies supply
   them, and `F1-g`'s healthy case shows the full-protocol geometry still clicks.
2. **Injected observation scheduler.** The model polls, so a fixture must say when
   the page publishes. `flowHarness` injects `schedule = (ms) => { clock.advance(ms);
   fixture.tick(); }`, and the page fixture publishes `live` → `published` on that
   tick (change-only, exactly the hook's 250 ms poll). The click fixtures inject a
   scheduler that advances the clock. No test forces a correct answer through an
   instant queue; the success paths genuinely wait one or more ticks.

No check was loosened and no fixture was removed. Two assertions changed because
the contract is a wait, not a one-shot read: `J6c` and `J6e` now end at the
deadline, and `F4`/`F5`/`F9` likewise (each labelled in place).

---

## 3. Every old case is preserved; new cases added

41 → 60 → **73** cases. All 60 ir6 case prefixes are present (`J6c`, `J6e`, `F4`,
`F5` and `F9` have their titles extended in place with the ir6 F2 note). `G4b` and
`H3` remain labelled counterexamples. New cases:

```
F1-g  the getwindowgeometry command is classified before its fields are consumed (ir6 F1)
F2-a  a delayed viewport and pointer baseline are waited for, not refused (ir6 F2)
F2-b  every warp observation waits for the hook tick, then clicks once (ir6 F2)
F2-c  a landing published on a later tick is waited for, then succeeds (ir6 F2)
F2-d  a viewport or a pointer baseline that never appears ends at the deadline (ir6 F2)
F2-e  a landing that never arrives ends at the deadline, and no late publication resurrects it (ir6 F2)
F2-f  an interrupted observation read ends at the deadline with no click (ir6 F2)
F2-g  a fresh but malformed click fact fails closed (ir6 F2)
F2-h  the observation predicate is fail closed when it throws (ir6 F2)
F2-i  a hung observation poll ends at the deadline, not by a phase timer (ir6 F2)
F3-m  the solve uses the measured native read-back, not the commanded point (ir6 F3)
F3-n  asymmetric per-point native errors change the target prediction, and the witness validates first
F4-r  a permuted identical duplicate is idempotent; a changed value still conflicts (ir6 F4)
```

Full case list (the output of `grep "^test('" build/p3.4-spec-v5-repair2/model.test.mjs`):

```
C1  the deadline is immutable: no reset, no extension, no per-step cap
C2  a hung await ends at the deadline, terminal, with no work after it
C3  an await that resolves after the deadline is a failure, not a success
C4  a rejected io is terminal and fail closed
C5  a hung DISPATCH ends at the deadline too, with the same budget (ir5 B2)
D1  each scale 1, 1.5 and 2 solves and maps the target exactly
D2  the two points must differ in BOTH client axes, or the run ends with no click
D3  a non-finite measurement ends the solve before any conversion
D4  the per-axis bound is checked before use, in both directions
D5  one point is not a solve
D6  native containment rejects an off-screen point, so no move is issued
D7  native read-back needs 1 px, the app window or the app pid
D8  the calibration targets are derived from the viewport, never hard-coded
F1  every command outcome is read: status, signal and both streams
G1  one complete publication installs and selects every global index
G2  a mid-arrival read is incomplete, and the wait restarts rather than reporting an absence
G3  a newer complete epoch, still incomplete, forbids falling back to an older one
G4  a VALID header with a TRUNCATED body is discarded whole (ir5 B4)
G4b the OLD G4 fixture is preserved as a counterexample: it was never truncated (ir5 B4)
G5  an identical complete duplicate is idempotent; a differing one FAILs
G5b a truncated body is never a conflict, however it differs from the good batch
G6  a batch whose field set is incomplete is malformed, not partially installed
G7  a malformed epoch never raises the highest seen epoch, and never wraps it
G8  out-of-order and growing/shrinking publications are read, not refused as duplicates
G9  A-B-A is three distinct epochs, and the third is selected
G10 one epoch mixing two declared totals is not a frame
G11 a fact line is not a batch line, and the hook emits no line for an empty page
G12 a batch installs as a whole map: no key is carried over from any earlier sighting
G13 a valid NEWER header with a truncated body forbids the older complete frame (ir5 B3)
H1  the unique label/tag PAIR picks the row and never the tooltip
H2  the same label twice with the same tag is ambiguous, and never first-match-wins
H3  the OLD testId-tie-break fixture is preserved as a counterexample (ir5 D7)
H4  the pair picks the right leaf when the tags differ, and testId is compared after the click
I1  the gate is presence of href and ipcProbe, nothing else
I2  exact ACL denial with all conjuncts is the only pass
I3  the cascade is exactly five rows in both arms, with the cause that fits the count
J1  the pointer left at calibration still clicks: the witness is taken AFTER the warp (ir5 B1)
J2  a stale witness beyond 2 px means no click, after the move that produced it
J3  an off-screen target is refused before the move
J4  a native read-back miss fails closed after the move and before the click
J5  a hung read-back ends at the deadline with no click
J5b a hung CLICK dispatch ends at the deadline and never clicks twice (ir5 B2)
J5c a hung MOVE dispatch ends at the deadline with no click (ir5 B2)
J6  a deadline already spent refuses the dispatch
J6b each descriptor field is compared on its own (ir5 D1)
J6c a click the page never observed is a failure (ir6 F2: a bounded wait to the deadline)
J6d a non-zero exit status on the move is fail closed before any click
J6e a pointer counter that does not advance means no click (ir6 F2: a bounded wait)
J7  a click the page never observed is a failure, and a descriptor mismatch names both
J8  the rectangle signature is diagnostic text and is never a landing fact
F1-g the getwindowgeometry command is classified before its fields are consumed (ir6 F1)
F2  the exported flow calibrates, then warps to the target, then clicks once, then lands
F2-a a delayed viewport and pointer baseline are waited for, not refused (ir6 F2)
F2-b every warp observation waits for the hook tick, then clicks once (ir6 F2)
F2-c a landing published on a later tick is waited for, then succeeds (ir6 F2)
F2-d a viewport or a pointer baseline that never appears ends at the deadline (ir6 F2)
F2-e a landing that never arrives ends at the deadline, and no late publication resurrects it (ir6 F2)
F2-f an interrupted observation read ends at the deadline with no click (ir6 F2)
F2-g a fresh but malformed click fact fails closed (ir6 F2)
F2-h the observation predicate is fail closed when it throws (ir6 F2)
F2-i a hung observation poll ends at the deadline, not by a phase timer (ir6 F2)
F3  both bootstrap points are containment-checked BEFORE their warp, with no exemption
F3-m the solve uses the measured native read-back, not the commanded point (ir6 F3)
F3-n asymmetric per-point native errors change the target prediction, and the witness validates first
F4  a pointermove that never reaches the page ends at the deadline with no click (ir6 F2)
F5  an undelivered pointermove on the target leaves every earlier move intact and ends at the deadline
F6  a degenerate calibration ends the row with no target warp and no click
F7  a hung bootstrap move ends at the deadline with no click (ir5 B2)
F8  the final step lands on scriptText, not on a rectangle change
F9  the final step refuses a landing that never happens (ir6 F2: a bounded wait)
F10 an ambiguous label/tag pair ends the row before the target warp
F11 a non-integer or absent geometry, pid or viewport ends the row before any move
F4-r a permuted identical duplicate is idempotent; a changed value still conflicts (ir6 F4)
```

---

## 4. Commands run, and their exits

All read-only or confined to the ignored `build/p3.4-spec-v5-repair2/`.

| Command | Exit | Result |
| --- | --- | --- |
| `cp -a build/p3.4-spec-v5-repair build/p3.4-spec-v5-repair2 && sha256sum …` | 0 | identical copies; tool bytes unchanged |
| `node --test build/p3.4-spec-v5-repair2/model.test.mjs` (pinned) | 0 | **tests 73, pass 73, fail 0** |
| `node --test build/p3.4-spec-v5/model.test.mjs` (pinned) | 0 | **tests 41, pass 41, fail 0** — revision 5 untouched |
| `APUNTA_TOOL_DIR=$PWD/build/p3.4-spec-v5-repair2/tool node --test docs/v2/evidence/P3.4/proposal-ir4/tooling-guard.test.mjs` | 0 | **tests 14, pass 14, fail 0** |
| `APUNTA_P34_MODEL=…repair/model.mjs node docs/v2/evidence/P3.4/proposal-ir6/{geometry-command,measured-native,reordered-duplicate,observation-wait}.mjs` | 0 | F1–F4 **before** |
| `APUNTA_P34_MODEL=…repair2/model.mjs node docs/v2/evidence/P3.4/proposal-ir6/{geometry-command,measured-native,reordered-duplicate}.mjs` | 0 | F1/F3/F4 **after** (observation-wait fails early on the probe's geometry protocol) |
| `node docs/v2/evidence/P3.4/proposal-v5-repair2/{geometry-command,measured-native,reordered-duplicate,observation-wait}.adapted.mjs` | 0 | F1–F4 **after**, full protocol and injected scheduler |
| `sha256sum` on all originals and the new copy | 0 | hashes in §0 |
| `grep -nE "Date\.|Math\.random|process\.|fs\.|fetch\(|^import " build/p3.4-spec-v5-repair2/model.mjs` | 0 | the only match is the header comment "no Date.now, no Math.random": **model is pure** |
| `git diff --stat HEAD -- docs/v2/tools` | 0 | empty |

No sandbox anomaly: every run produced individual case-level output and none
collapsed to an outer-file-only pass/fail. No test was changed to accommodate a
runner.

---

## 5. Limits, and what this does not prove

- **It proves the proposed logic, not WebKitGTK input delivery.** Not that a
  warp-driven `pointermove` reaches the page under `xvfb-run`, not any native
  geometry, not this host's ACL string. Every fixture is synthetic.
- The observation wait is bounded by the fake clock's own advancement; the tests
  inject the scheduler, so they prove the poll's structure and its deadline
  ownership, not a real 250 ms wall-clock cadence.
- The revised `F4`/`F5`/`F9`/`J6c`/`J6e` outcomes are deadline failures by
  design: "require a fact line" is a wait, and a fact that never arrives ends at
  the immutable deadline with no click and no later action.
- `build/p3.4-spec-v5-repair2/model.test.mjs` is a spec model's fixture file, not a
  shipped test; nothing here is added to the repository test suite.
- The two required owner decisions and the optional A06 grant are unchanged, none
  is authorised, and **no attempt 5 was run**.

**Uncommitted, as instructed. No `git add`, no commit, no push.**
