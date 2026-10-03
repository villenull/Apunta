# P3.4 — global lint red on committed evidence reproduction scripts

**Repair, output only.** 44 `console.log` calls across 12 committed reproduction
scripts under `docs/v2/evidence/P3.4/` made `npm run lint` fail on `no-console`.
Each call was a bare `ExpressionStatement` whose return value nothing read. The
fix is the substitution `console.log(X)` → `process.stdout.write(format(X) + '\n')`
with `format` imported from `node:util`, which is what `console.log` does
internally: `util.format` over the same arguments, then one `\n` to stdout.

Nothing else changed. No rule was disabled, no override or suppression was
added, no test was deleted or weakened, no threshold was relaxed, no
`eslint.config.js` edit, and no source or runtime file was touched. These are
documentation reproduction scripts, not shipped code.

## 1. Scope — the twelve files

All were byte-stable at `3bd142f` throughout the session. `git diff --stat
3bd142f HEAD -- docs/v2/evidence/P3.4/` was empty before and after; the two
commits that landed during the session (`a6b1059`, `39428a4`, both P3.5) moved
`HEAD` without touching this tree.

| File | Calls | Finding it carries |
| --- | --- | --- |
| `proposal-ir4/attempt-line-identity.mjs` | 5 | T.1(b) byte identity (B1) |
| `proposal-ir4/frame-identity-adversarial.mjs` | 9 | §E frame rule (N2) |
| `proposal-ir4/plan-fixture-filename-id.mjs` | 3 | `loadPlan` file-name invariant (N3) |
| `proposal-ir4/tooling-guard.test.mjs` | 1 | §T.1 guard / §T.2 five tests |
| `proposal-ir5/reader-epoch.mjs` | 6 | G4 mislabelled; fallback (P1/P2) |
| `proposal-ir5/click-witness.mjs` | 5 | P3–P6 |
| `proposal-ir5/hung-dispatch.mjs` | 1 | E hung command |
| `proposal-ir6/geometry-command.mjs` | 1 | F1 |
| `proposal-ir6/observation-wait.mjs` | 2 | F2 |
| `proposal-ir6/measured-native.mjs` | 3 | F3 |
| `proposal-ir6/reordered-duplicate.mjs` | 1 | F4 |
| `proposal-v5-repair/ir5-counterexamples.mjs` | 7 | P3/P4/B2/P5/P2 against the repaired model |

The `tooling-guard.test.mjs` call is the `if (r.status !== 0)` DEBUG line. Its
condition is unchanged; only the print inside it moved.

## 2. How the substitution was made

Not by hand and not by regex. `build/evidence-output-lint/transform.mjs` parses
each file with **espree** (already an ESLint dependency) and rewrites only
`CallExpression` nodes that are a bare `console.log(...)` whose parent is an
`ExpressionStatement`. It refuses the file if any such call is not a bare
statement, and re-parses the result to assert zero surviving `console`
identifiers. It reported 5/9/3/1/5/1/6/1/3/2/1/7 call sites — 44, matching the
44 `no-console` errors exactly.

The resulting diff adds one `import { format } from 'node:util';` line per file
and rewrites the 44 call sites. No fixture, probe string, argument list, control
flow, `process.exit` code or assertion changed; `git diff` is the whole
inspection surface.

## 3. Byte-exact replay

`replay-check.mjs` (this directory) rebuilds the "before" tree from
`git show 3bd142f:<path>` on every run — it cannot be satisfied by editing both
sides — and replays both trees under identical conditions:

- interpreter `~/.local/share/apunta-node/node-v24.19.0-linux-x64/bin/node`
  (`v24.19.0`, asserted), cwd repository root;
- `APUNTA_V2_PLAN_DIR_REAL=$PWD/docs/v2`, `APUNTA_TOOL_DIR=$PWD/build/ir4`;
- the same **unmodified ignored models**:
  `build/p3.4-spec-v5/model.mjs` (`6bb49952…`, the hash
  `proposal-ir5/README.md` §0 records) and
  `build/p3.4-spec-v5-repair/model.mjs` (`e9e8ce7a…`);
- the same **ignored patched tool** `build/ir4/build-dispatch.mjs`
  (`b41edf2c…`), the §T.1-patched copy the READMEs describe.

```
$ node docs/v2/evidence/P3.4/output-lint-repair/replay-check.mjs
  ok    ir4-attempt-line-identity  exit 0  stdout/stderr byte-identical
  ok    ir4-frame-identity         exit 0  stdout/stderr byte-identical
  ok    ir4-plan-fixture-filename  exit 0  stdout/stderr byte-identical
  ok    ir4-tooling-guard          exit 0  stdout/stderr byte-identical
  ok    ir5-reader-epoch           exit 0  stdout/stderr byte-identical
  ok    ir5-click-witness          exit 0  stdout/stderr byte-identical
  ok    ir5-hung-dispatch          exit 0  stdout/stderr byte-identical
  ok    ir6-geometry-command       exit 0  stdout/stderr byte-identical
  ok    ir6-observation-wait       exit 0  stdout/stderr byte-identical
  ok    ir6-measured-native        exit 0  stdout/stderr byte-identical
  ok    ir6-reordered-duplicate    exit 0  stdout/stderr byte-identical
  ok    repair2-ir5-counterex      exit 0  stdout/stderr byte-identical

12 case(s) replayed against 3bd142f; 0 failure(s).
```

Eleven of the twelve are byte-identical with **no** normalisation at all. The
twelfth, `ir4-tooling-guard`, differs only in the node test reporter's own
timings (`(15.465197ms)` vs `(15.766945ms)`, `ℹ duration_ms 485.69` vs
`484.30`); stripping those two shapes makes it byte-identical. 14 tests pass, 0
fail, exit 0, on both sides — the same 14 cases in the same order.

**The check is not vacuous.** Changing `kind=${outcome.kind}` to
`kind=CHANGED` in `reordered-duplicate.mjs` and re-running produced
`FAIL ir6-reordered-duplicate stdout` and exit 1; restoring the byte restored
exit 0. The negative control is recorded here so a reviewer does not have to
take the green on trust.

### 3.1 The DEBUG line gets its own control

In a 14/14 run `if (r.status !== 0)` never fires, so the passing replay proves
nothing about that one line. A synthetic control therefore forces it: a copy of
`build/ir4` under `build/evidence-output-lint/broken-tool/` whose
`build-dispatch.mjs` exits 1 when `--attempt 4` is passed.

```
DEBUG lines emitted: original=1 new=1
status: original=1 new=1
stderr: IDENTICAL
stdout: IDENTICAL once timings, the test file's own path, and the
        +1 line-number shift from the added import are normalised
```

The only residual differences are `tooling-guard.test.mjs:102` → `:103` and its
colon-frames — the repaired file carries exactly one line more than the
original, so every stack-trace line below the import shifts by one. Line
*content* is identical. Failure count, failure identity, exit status and the
DEBUG line's own bytes are unchanged.

## 4. The defects still read as defects

The strongest statement available is that the output is byte-identical, so every
counterexample still reports what it reported:

| Probe | Still prints |
| --- | --- |
| `ir6-geometry-command` | `geometry signal SIGKILL: ok=true clicked=true` (F1 unfixed) |
| `ir6-observation-wait` | `(a) … ok=false nextFactCalls=3` / `(b) … ok=false` (F2) |
| `ir6-measured-native` | both deltas ask `{x:627,y:653}` while a measured solve would ask `x=628` (F3) |
| `ir6-reordered-duplicate` | `kind=conflict conflict=SET frame.ok=false` (F4) |
| `ir5-hung-dispatch` | `DID NOT RESOLVE after the deadline advanced` |
| `ir5-counterexamples` | `P4 … ok=false … no click issued` |

Nothing was made to pass. No finding was closed by this repair.

## 5. Hashes

Originals were copied to the ignored `build/evidence-output-lint/originals/`
**before** any edit, and verified byte-identical to the `3bd142f` blobs.

| File | before (`3bd142f`) | after (working tree) |
| --- | --- | --- |
| `proposal-ir4/attempt-line-identity.mjs` | `dbc5630846e03fda88d56587a303a948b6648521dea5b735c6d314b10cea3b74` | `6b61a2e560fbceddd239376e58e6503d46a8077fa7744d620556b016004b97e9` |
| `proposal-ir4/frame-identity-adversarial.mjs` | `ed85709b80d35e39b70402ee811015272ff8fd3331d6545df0cb84d7b8d87bdd` | `96319c37d5245b40fdeeeccc946448166e364f47a01c3acc9024accc844ab701` |
| `proposal-ir4/plan-fixture-filename-id.mjs` | `d0562abc71a3b9cb3f75bf46c1952b5762fb7ef44469df86d5b72de5f5b49511` | `9caa1d762bbb392cf66b1280a53a84ab0de369c336792186bf627e99dbe8dc7d` |
| `proposal-ir4/tooling-guard.test.mjs` | `ec99468e0ed8a1ed622cc2c6a825f44f5215867e2ac0891907c963b065b8a851` | `ef402642e2c78dd7c69b23cc1f59cd34408433bc9a1aa9104b389cc3613d3e31` |
| `proposal-ir5/click-witness.mjs` | `0b0f27d083eaea5a0334d63a432aef7037dae6f764536f93e60f54d21178acbc` | `4d29604ee0a461a55fad01399c64c45e543623c18fa27c0f280d737860553a19` |
| `proposal-ir5/hung-dispatch.mjs` | `ac887742351673ef42a7e78aca2d52effba04f347ad2b5c8a078b59afd050120` | `4baf3cc198709f2198cc48c7049fbed317b9e2ca034a69bc0cc2ca0fbf8c0db6` |
| `proposal-ir5/reader-epoch.mjs` | `27dd7ceabda09c9882b5c3d3aa5511e7591311bc647c827a2fdd3b1ded4a3ea5` | `9206da31dfb6fee8a6d80db125ba6a55db184988b6d951d6ca2d9154fa949bff` |
| `proposal-ir6/geometry-command.mjs` | `c4c7b338d583d95c26b0863c08ffe0ccafc57279d171cf4eac34d153d9a94905` | `b3f67879887d02ad014ffd2ee85c0c7d2a194170ab9b54503af0cbc2d36bf01a` |
| `proposal-ir6/measured-native.mjs` | `8eb815d62078bceec9a6dc38b7aec926894cbd0a8a663345902ce68e8f2ae371` | `78bb979d2188ee5614719523d4185951a9afc21d78266f1352508c267b4bf51a` |
| `proposal-ir6/observation-wait.mjs` | `7526dbe61de5e1a4b74f8478adc2553cae7cbdf1af7cee3180979beaf58574e7` | `26b44077931302644ebc337f9924c77bca3b2260d631e051c4fa8229705d18bd` |
| `proposal-ir6/reordered-duplicate.mjs` | `12f4597fdc82546ac4f5c2ca6eec62254095efc4de64cca9d73bdc0efa280815` | `9142b464aeb47540e06a073005afba82e4e0824f01d88e33ca1b47114052169c` |
| `proposal-v5-repair/ir5-counterexamples.mjs` | `bfedf1397ac3f18a0d94527e859a2c157b5e7ff9159b90f008c0d5815d450c7f` | `b6e877cfb1b55b4c1f4c0a2d88a4b6d22b29b70bcc323330e7d36240980989f4` |

Historical hash reports elsewhere in this tree still describe their own earlier
commits and were deliberately left untouched — this is a new directory, not a
rewrite of an existing record.

## 6. Lint state

`npx eslint .` over the whole repository: **60 → 16 errors**. All 44 P3.4
`no-console` errors are gone and no new error was introduced.

The 16 remaining are **not** waived and **not** touched:

- **15** in `docs/v2/evidence/P3.5/review-1/` (`source-outputs-mapping.mjs` 10
  `no-console` + 1 unused `SINK_NAME`; `stale-rectangle.mjs` 5 `no-console`).
  Out of this packet's scope while the P3.5 reviewers run.
- **1** pre-existing, different rule, in a file this repair did touch:
  `proposal-v5-repair/ir5-counterexamples.mjs:29` —
  `'SCALED_NATIVE' is assigned a value but never used`
  (`@typescript-eslint/no-unused-vars`).

That last one is a deliberate non-change. `SCALED_NATIVE` is a constant the
ir5-repair author left in an evidence script; it is a pre-existing defect of a
*different* rule, it is not an output problem, and both ways of clearing it —
deleting the line or renaming it to `_SCALED_NATIVE` — would edit a reviewer's
proof rather than its printing. This is an output-only repair, so the bytes are
left as they are and the error is reported instead. It needs an owner's or
reviewer's decision, not a silent edit from here.

Per-file, therefore: `npx eslint` over the eleven untouched-by-that-issue files
is **exit 0**; over all twelve it is **exit 1** with exactly that one
pre-existing error. `npx eslint docs/v2/evidence/P3.4/output-lint-repair/` is
exit 0. `npx prettier --check` passes on all twelve and on this directory — no
reformatting was needed, so every byte outside the added import and the 44 call
sites is unchanged.

## 7. What was not done

- No application, server, build, database, model runtime, audio, microphone,
  input, display, download, install or network was invoked. Port 7717 was never
  contacted. No live data folder was opened.
- No model was changed, regenerated or re-run; the two ignored copies under
  `build/` were read only, at the hashes recorded above.
- No other P3.4 proof directory, review, proposal, model, `build-dispatch`,
  card, checkpoint, config, `eslint.config.js` or manifest was edited.
- No `docs/v2/evidence/P3.5/**` path was edited, pending those reviews.
- All scratch output stayed inside the ignored `build/`.
- Left unstaged and uncommitted for independent review.