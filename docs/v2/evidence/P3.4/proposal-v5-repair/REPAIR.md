# P3.4 proposal v5 — bounded repair evidence

For the repair pass on `docs/v2/state/P3.4-REPAIR-PROPOSAL-v5.md`, answering
`docs/v2/state/reviews/P3.4-owner-proposal-ir5.md` (verdict: bounded DEFECT, five
blockers B1–B5 and seven minor defects D1–D7). Author-side evidence only: **not**
an acceptance of the contracts, not a runtime result, and not an approval of the
owner's decisions.

**Nothing here was run against the application.** No server, app, build, model
runtime, audio, input, display, download or network; port 7717 never contacted; no
live data folder opened; no card, dispatch, checkpoint, source, tool or test file
edited or committed. P3.5's in-flight `web/src/main.tsx`, `src-tauri/src/main.rs`,
`src-tauri/src/permissions.rs`, `scripts/v2/tauri-audio.test.mjs`,
`docs/v2/state/cards/P3.5.json` and `docs/v2/state/OWNER-ACTIONS.md` were left
dirty and untouched, and the build lease stays P3.5's. Every execution below was
`node --test` over pure synthetic fixtures on the **pinned** interpreter
`/home/villenull/.local/share/apunta-node/node-v24.19.0-linux-x64/bin/node`
(`v24.19.0`, the version the card pins), or `node` over synthetic string fixtures.
Normative source anchors are `git show 8783181:<path>` only; P3.5's working tree
was never read as normative.

---

## 0. What was written, and what was preserved

Only two tracked paths were written: `docs/v2/state/P3.4-REPAIR-PROPOSAL-v5.md`
and `docs/v2/evidence/P3.4/proposal-v5-repair/**`. The prior
`docs/v2/evidence/P3.4/proposal-v5/{MODEL.md,COORDINATOR.md}` and every ir5
artefact are untouched, hashes included. The work happened in a **new ignored
copy**, `build/p3.4-spec-v5-repair/`; `build/p3.4-spec-v5/` is byte-identical
before and after and still passes its own 41/41.

| File | Git | SHA-256 before | SHA-256 after |
| --- | --- | --- | --- |
| `build/p3.4-spec-v5/model.mjs` (536 lines) | ignored (`.gitignore:55`) | `6bb4995267f81fd64dc5e181a147564f679eadd7eaabae8e2995cc112cfbf258` | **unchanged** |
| `build/p3.4-spec-v5/model.test.mjs` (709 lines) | ignored | `9342192802b9890fe1102cfdd7b1a161ddfc51a949946f4b6fefd01b058e69c6` | **unchanged** |
| `build/p3.4-spec-v5/tool/build-dispatch.mjs` | ignored | `7863b411cd1a72282184dd439ecde42eb267277f594a6ba58840c05e6e2d84b3` | **unchanged** |
| `build/p3.4-spec-v5/tool/plan-lib.mjs` | ignored | `82e1d066b50ae7b57850f01b249610dcc6f809c97fb87531f968a3d085a6f767` | **unchanged** |
| `build/p3.4-spec-v5-repair/model.mjs` (741 lines) | ignored | `6bb49952…` (copied) | `e9e8ce7a422d0bb88f81a20249e2dc9e7b786038dd2012e2f1050ed49d57a699` |
| `build/p3.4-spec-v5-repair/model.test.mjs` (1103 lines) | ignored | `93421928…` (copied) | `263b3691f10b447283611cf3dcddf8b94d0ac7c580c461377d44874092c424ec` |
| `build/p3.4-spec-v5-repair/tool/*.mjs` | ignored | as above | **unchanged** |
| `docs/v2/evidence/P3.4/proposal-v5-repair/ir5-counterexamples.mjs` | tracked (new) | — | `bfedf1397ac3f18a0d94527e859a2c157b5e7ff9159b90f008c0d5815d450c7f` |
| `docs/v2/evidence/P3.4/proposal-ir5/{reader-epoch,click-witness,hung-dispatch}.mjs` | committed | — | `27dd7cea…`, `0b0f27d0…`, `ac887742…` — **unchanged** |
| `docs/v2/evidence/P3.4/proposal-ir5/README.md` | committed | — | `a3b8de97…` — **unchanged** |

`cp -a build/p3.4-spec-v5/. build/p3.4-spec-v5-repair/` copied all four files
byte-identically first (`6bb49952…`, `93421928…`, `7863b411…`, `82e1d066…`), and the
two tool copies were **not modified at all** — §I's grant is still only prepared,
never applied.

---

## 1. Commands run, and their exits

| Command | Exit | Result |
| --- | --- | --- |
| `sha256sum build/p3.4-spec-v5/{model.mjs,model.test.mjs,tool/*.mjs}` | 0 | match `proposal-v5/MODEL.md` §1 before the repair and again after it |
| `cp -a build/p3.4-spec-v5/. build/p3.4-spec-v5-repair/ && sha256sum …` | 0 | identical copies; `git check-ignore -v` confirms `.gitignore:55:build/` |
| `node --test build/p3.4-spec-v5-repair/model.test.mjs` (pinned) | 0 | **tests 60, pass 60, fail 0** |
| `node --test build/p3.4-spec-v5/model.test.mjs` (pinned) | 0 | **tests 41, pass 41, fail 0** — revision 5 still green, unmodified |
| `node docs/v2/evidence/P3.4/proposal-v5-repair/ir5-counterexamples.mjs` | 0 | every ir5 case re-run against the repaired model |
| `APUNTA_P34_MODEL=$PWD/build/p3.4-spec-v5-repair/model.mjs node docs/v2/evidence/P3.4/proposal-ir5/reader-epoch.mjs` | 0 | `P2` now refuses the fallback |
| `… node docs/v2/evidence/P3.4/proposal-ir5/click-witness.mjs` | 0 | `P3`/`P4`/`P5` all refused, each for a contract-correct reason |
| `… node docs/v2/evidence/P3.4/proposal-ir5/hung-dispatch.mjs` | 0 | now `resolved ok=false`, not `DID NOT RESOLVE` |
| `APUNTA_TOOL_DIR=$PWD/build/p3.4-spec-v5-repair/tool node --test docs/v2/evidence/P3.4/proposal-ir4/tooling-guard.test.mjs` | 0 | **tests 14, pass 14, fail 0** |
| `git show 8783181:{web/src/main.tsx,scripts/v2/tauri-security.test.mjs,docs/v2/cards/P3.4.md,docs/v2/state/dispatch/{P3.4,S2.5,P4.1}.md}` | 0 | §B anchors, Rule B set, AM-138/AM-049/AM-064 |
| `git diff --stat HEAD -- docs/v2/tools` | 0 | empty; `git status --porcelain` shows only P3.5's dirty files and this work, uncommitted |

**No sandbox anomaly to report.** Every command above ran under the pinned
interpreter and produced individual case-level output; none of them collapsed to
an outer-file-only pass/fail, and no test was changed to accommodate a runner.

---

## 2. Findings, and what each one now does

### B1 — the pre-warp proximity gate is gone (blocker)

`runClick` no longer reads a pointer fact before the target warp, and nothing about
the pointer's *position* is checked before that warp. The single post-warp witness
is unchanged and is now the only proximity check, and every move reads the pointer
**counter** before the warp and requires it **strictly greater** afterwards.

- `J1` is rewritten so its pre-warp fact carries the pointer at the **second
  bootstrap point** (client `800,430`), 100,70 px from the target. Before: `ok=false
  dispatched=[]`, "the fresh pointer observation is 100,70 px from the target
  centre". After: `ok=true`, `dispatched=["mousemove","getmouselocation","click"]`,
  reason naming `ptrN 7 -> 8`. No fixture anywhere puts a pre-target observation on
  the target — that was the self-shaped fixture ir5 caught.
- `J2` (stale witness >2 px) now dispatches `["mousemove","getmouselocation"]`
  before refusing, instead of refusing with nothing dispatched. No click, before or
  after.
- ir5's own `click-witness.mjs` P3 against the repaired model: `ok=false
  dispatched=[]` — but the reason is now `the page published no ptrN counter before
  the warp`, i.e. that fixture's synthetic facts never published `ptrN` at all. The
  contract-correct version of the same scenario, with a compliant fact line, is
  `ir5-counterexamples.mjs` P3: `ok=true`, one click.

### B2 — a hung dispatch is bounded by the immutable deadline (blocker)

`dispatchGuarded` now shares one `raceDeadline` helper with `awaitGuarded`: the
dispatched promise is raced against the deadline's own remaining time. There is no
phase timer and no second budget — `deadline.at` is asserted unchanged.

- `C5` (new): a hung `xdotool mousemove --sync` and a hung `xdotool click 1` both
  end at the deadline with `reason === 'the target deadline expired'` and
  `deadline.at === 30000`.
- `J5b` (new): a hung click dispatches exactly once, ends at the deadline, and
  **nothing runs after it** (`dispatched` stops at the click).
- `J5c` (new): a hung move ends at the deadline with no read-back and no click.
- `F7` (new): the same inside the full flow, from the geometry read onward.
- ir5's `hung-dispatch.mjs` now prints `resolved ok=false reason=… the target
  deadline expired` instead of `DID NOT RESOLVE after the deadline advanced`.

### B3 — a valid header is read separately from a complete batch (blocker, spec vs root)

`createBatchReader` now validates the header (safe-integer `epoch ≥ 1`, strict
`rects`, strict non-negative `batch` inside `0 … ceil(rects/40) − 1`) and raises
`highestSeenEpoch` **immediately**, before any body field is looked at. Only then
is the body validated, and only a complete body is installed, whole. A malformed
body is never installed, never merged over a good batch, and never a conflict
(a conflict still needs two **complete** sightings). Every `discard()` now reports
`header: true|false`, so the distinction is observable rather than inferred.

- `G13` (new, ir5 P2 verbatim): after a complete epoch-5 frame,
  `…?rects=1&batch=0&epoch=6&i0_x=1&i0_y=2` gives `kind=malformed, header=true`,
  `highestSeenEpoch === 6`, and `frame()` is `ok=false` — `epoch 6 has a valid
  header but no complete batch`. Before: `highestSeenAfter=5` and
  `frame.ok=true epoch=5`, i.e. a silent fallback to the older complete frame.
- `G6`'s epoch assertion changed from `0` to `1` and is labelled as the B3
  correction. The load-bearing assertions are untouched: `installed.size === 0`,
  `frame().ok === false`, `frame().click === false`. The three ir5 fixtures' old
  `highestSeenEpoch === 0` expectation was the *author's* reading of root, not an
  independent property of the reader, and root says the opposite; the fixture now
  asserts both halves — nothing installs, and the epoch rises.
- `G7` (unchanged and extended): every invalid epoch (`0`, `-1`, `1.5`, `01`,
  `9007199254740993`, `NaN`, `1e3`, empty) now also asserts `header === false`, so
  an invalid header provably raises nothing and the counter still cannot wrap.
- `G11` (extended): the empty-page line (`total=0`, `batch=0`) is now asserted to be
  an **invalid** header (`header === false`, `highestSeenEpoch === 0`), which is
  what keeps "no leaves" reported as an absence rather than a complete publication.

### B4 — `G4` is relabelled and the old fixture survives as a counterexample

- `G4` (replaced) is now a **valid in-range header with a truncated body**: `batch 0`
  of a `total=6` publication cut inside the `i2_h` parameter (`…&i2_`). It asserts
  `kind=malformed`, `header=true`, `missing field h`, `discarded=1`,
  `conflict=null`, nothing installed at `8:0`, the epoch-7 good batch still intact,
  `highestSeenEpoch === 8` and `frame().ok === false` — the "raises nothing" rule is
  now actually tested against a *higher* epoch — then that a later epoch-9
  publication installs and selects normally.
- `G4b` (new) keeps revision 5's exact fixture and labels it: the untruncated line
  is malformed for the identical reason (`batch 1 is outside 0..0`, because
  `ceil(6/40)=1`), and the truncated one is too, with `header=false` — so it never
  was a truncated sighting. Nothing was silently deleted.

### B5 — the whole calibration → target → click → landing flow is modelled

`runFlow` is a new exported orchestration: it reads the window and the app pid once,
reads `vpW`/`vpH`, derives both bootstrap targets from the viewport
(`calibrationTargets`, `D8`), takes **both** measurements through one `guardedMove`
helper — containment **before** each warp, `ptrN` recorded before and strictly
greater after, native read-back ≤1 px over the app window id or a positive pid, all
dispatches and awaits raced against the one deadline — then solves the affine map
with every check before the first conversion, selects the target and runs the click
stage through the landing fact. **There is no bootstrap exemption anywhere in the
model**: §D.7's clause is gone from the proposal too, and §D.4 now says move 1 is
checked as well.

- `F2` (new): the full flow — `dispatched` is exactly
  `getwindowgeometry, mousemove, getmouselocation` (bootstrap 1), the same (bootstrap
  2), `mousemove, getmouselocation` (target), `click`, with `ptrN` advancing three
  times, the solve recovering the injected 1.5× truth, all three descriptor fields
  matching, and the landing fact.
- `F3` (new): **both** bootstrap refusals. A 600 px window refuses bootstrap 1 with
  `dispatched=["getwindowgeometry"]` and zero moves; an 800 px window refuses
  bootstrap 2 after exactly one completed move — the exact case the old exemption
  waved through.
- `F4`/`F5` (new): an undelivered warp-driven `pointermove` is a **named** outcome
  with no click (`ptrN read 0, not strictly greater than 0`), and an undelivered
  move on the target only refuses the target stage, leaving the calibration intact.
- `F6` (new): a degenerate solve (the page reporting the same client x for both
  bootstrap moves) ends the row `the calibration did not solve` after exactly the
  two bootstrap moves, with no target warp and no click.
- `F8`/`F9` (new): the final step lands on `scriptText === 'true'`, and refuses a
  landing that did not happen.
- `F10` (new): an ambiguous label/tag pair ends the row after the calibration and
  **before** the target warp.
- `F11` (new): non-integer geometry, a non-positive pid, and a viewport below
  400×300 all end the row before any move.

### D1 — `ptrN` and the three descriptor fields are modelled

- The published field names are constants in the model: `POINTER = {counter: 'ptrN',
  clientX: 'ptrCX', clientY: 'ptrCY'}`, `CLICK = {counter: 'clickN', clientX:
  'clickCX', clientY: 'clickCY', tag: 'clickTag', testId: 'clickTestId', text:
  'clickText'}`, `VIEWPORT = {w: 'vpW', h: 'vpH'}`; §C.1 of the proposal lists the
  same names and keeps the nine existing facts untouched.
- `J6e` (new): a pointer counter that does not advance ends the row with no click.
  Before (`ir5 click-witness.mjs` P4): `ok=true`, click dispatched. After: `ok=false`,
  `ptrN read 9, not strictly greater than 9; no click issued`.
- `J6b` (rewritten): the three descriptor fields are compared one at a time, and a
  mismatch in any single one of them fails with that field named. Before: one opaque
  `clickEl` string compared against `expected.el`.
- Click freshness is read **before** the click (`clickN` from the newest fact) and
  **after** it, and must advance by exactly 1 — `J6c` still pins the "page never
  observed the click" failure.

### D2 — the URL-length claim is dropped and the cost is stated

§C.1 now says: one extra scalar per `sendRects` call plus **two** extra key/value
pairs per rectangle (`i{n}_t`, `i{n}_d`), up to 80 extra pairs for a full
40-rectangle batch, on top of the existing five per rectangle. No URL-length bound is
claimed.

### D3 — the amendment references are corrected

§I.2 now reads: AM-138 in `P3.4.md`, AM-049 in `S2.5.md`, AM-064 in
`P4.1.md`/`P4.1-ir.md` — verified at the baseline with `git show 8783181:`.
Revision 5 attributed `P3.4.md` to AM-049 (ir4's **M4**, repeated).

### D4 — the card's row order is retained and labelled

§J Decision 2 keeps **V0, V1, V2, V3, V4** in the card's order, states that V0 is
required because `web/src/main.tsx` changed, and offers no reorder.

### D5 — the citation names the owner-proposal review

"Prepared from" and §I now cite `P3.4-owner-proposal-ir4.md` for the ACL, tooling
and cascade before-texts, with `P3.4-ir4.md` named separately as the card
instruction review.

### D6 — only `main.tsx` is a Rule B path

§J Decision 2 says `web/src/main.tsx` changed and is a Rule B path, and that
`scripts/v2/tauri-security.test.mjs` is not in Rule B (verified against the card's
Rule B bullet at `8783181:docs/v2/cards/P3.4.md:110-136`). V0 remains required.

### D7 — selection is keyed on the label/tag pair

`selectTarget(frame, {label, tag})` matches the **pair**; `testId` is no longer part
of the key and is never a tie-breaker. It is compared after the click against the
selected rectangle's descriptor.

- `H1`/`H2` unchanged in substance (the tooltip is told apart by tag; two matches
  are ambiguous, naming global indices).
- `H3` (preserved as a counterexample): two leaves with the same label **and** tag
  but different `testId` were `ok=true index=1` under revision 5's triple. Under the
  pair key they are `ambiguous: 2 rectangles at global indices 0, 1` — root's
  reading. This is a real behaviour change and it is labelled as one, not a fixture
  quietly relaxed.
- `H4` (new): with different tags the pair picks the right leaf (index 1), and the
  `testId` mismatch is caught by `compareDescriptor`, which names `clickTestId`.

---

## 3. Every revision-5 case, and where it went

Nothing was deleted. 41 cases before, 60 after.

| Revision 5 | Repair |
| --- | --- |
| `C1`–`C4` | unchanged |
| — | **`C5`** new: hung dispatch (move and click) ends at the deadline |
| `D1`–`D7` | unchanged |
| — | **`D8`** new: calibration targets derived from the viewport |
| `F1` | unchanged |
| `G1`, `G2`, `G3`, `G5`, `G8`–`G10`, `G12` | unchanged |
| `G4` | **replaced** by the valid-header/truncated-body case |
| — | **`G4b`** new: revision 5's `G4` fixture kept and labelled |
| — | **`G5b`** new: a truncated body is never a conflict |
| `G6` | epoch assertion changed 0 → 1 (B3), labelled in place; install/refusal assertions unchanged |
| `G7`, `G11` | extended with `header: false` assertions (invalid header raises nothing) |
| — | **`G13`** new: ir5 B3's valid-newer-header / no-fallback case |
| `H1`, `H2` | re-expressed on the pair key |
| `H3` | **preserved as a counterexample** with its new `ambiguous` outcome |
| — | **`H4`** new: pair selection + `testId` compared after the click |
| `I1`–`I3` | unchanged |
| `J1` | rewritten: realistic pre-warp fact (at calibration), now clicks |
| `J2` | same intent, dispatch list corrected |
| `J3`–`J8`, `J6b`, `J6c`, `J6d` | unchanged in intent; `J6b` now per-field |
| — | **`J5b`**, **`J5c`**, **`J6e`** new: hung click, hung move, counter not advancing |
| — | **`F2`–`F11`** new: the exported flow and its failure modes |

---

## 4. The model does not prove

- That WebKitGTK under `xvfb-run` delivers a warp-driven `pointermove`. The model's
  only claim is that its absence is a named `NOT RUN` with no click (`F4`, `F5`).
- Any native geometry, the outer X rectangle, or any titlebar height. The model's
  1.5× truth is a fixture.
- That this host's release binary returns the exact ACL string, or that the
  inspector channel and the sandbox rows behave as the card describes.
- Anything about a real page: every fixture is synthetic.

## 5. Honest limitations of this repair

- **The model has no entry point named `calibrate`.** The exported orchestration is
  `runFlow`, which performs calibration *and* the click *and* the landing; splitting
  out a `calibrate` symbol would have modelled less than the contract requires, so
  ir5's `click-witness.mjs` P6 still prints `undefined` for `calibrate` while P6's
  substantive question ("is there a calibration flow?") is answered by `runFlow` and
  by `F2`–`F11`.
- **ir5's original fixtures now fail against the repaired model, on purpose and for
  a stated reason.** Their synthetic fact lines never published `ptrN`, so the
  repaired model refuses them with "the page published no `ptrN` counter before the
  warp" and no click. They were left untouched; `ir5-counterexamples.mjs` re-runs the
  same scenarios with a compliant fact line.
- **`G4b` and `H3` assert outcomes that differ from revision 5.** They are the two
  places where revision 5's behaviour contradicted a fixed root contract
  (`P3.4-committee-resolution.md` lines 8 and 16), so the fixtures changed with the
  specification rather than being weakened to keep the suite green. Both are labelled
  counterexamples, with the old outcome written down.
- The patched tool copy was re-run unchanged at **14/14**; §I is still only prepared
  and **not applied**, and `git diff --stat HEAD -- docs/v2/tools` is empty.
- The two required owner decisions and the optional A06 grant are unchanged, none is
  authorised, and **no attempt 5 was run**.

**Uncommitted, as instructed. No `git add`, no commit, no push.**