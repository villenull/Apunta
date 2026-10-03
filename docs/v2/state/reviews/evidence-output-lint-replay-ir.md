# Independent review — output-lint replay repair (D1, D2)

- **Card/commit under review:** `b457db4` ("Correct evidence replay
  normalization order and identity labels") against its base `18179fa`. The
  commit repairs the two defects (D1, D2) recorded in
  `docs/v2/state/reviews/evidence-output-lint-ir.md` against `39c6723` /
  `83b32e0`.
- **Reviewer:** independent, read-only; authors archived, no source writer
  active. No app/server/build/DB/model-runtime/audio/input/`pactl`/network/
  install was run; port 7717 never contacted; no source, config, card or
  checkpoint logic changed; nothing staged or committed.
- **Pinned interpreter:** `/home/villenull/.local/share/apunta-node/node-v24.19.0-linux-x64/bin/node`
  (`v24.19.0`), passed as `APUNTA_NODE` on every run.

## Result

**CLEAR.** Both defects are repaired and the repairs are verified by a fresh,
durable, executable control that actually exercises the branch the clean
replay never reaches. No blockers. Three bounded minor notes (§6) and one
latent imprecision clause; none affects the 12-case replay, the completion
replay, the `exit 2` source-outputs proof or global lint.

## 1. What was verified (commands and exits)

| Check | Command | Exit |
| --- | --- | --- |
| Forced-DEBUG control (new) | `APUNTA_NODE=<pinned> <pinned> docs/v2/evidence/output-lint-replay-repair/forced-debug-control.mjs` | **0** |
| Main 12-case replay | `APUNTA_NODE=<pinned> <pinned> docs/v2/evidence/P3.4/output-lint-repair/replay-check.mjs` | **0** |
| Completion replay (4 baselines) | `APUNTA_NODE=<pinned> <pinned> docs/v2/evidence/output-lint-completion/replay.mjs` | **0** |
| Completion negative control | `APUNTA_NODE=<pinned> <pinned> docs/v2/evidence/output-lint-completion/negative-control.mjs` | **0** |
| Global lint | `./node_modules/.bin/eslint .` | **0** |
| Span-audit characterization (ignored scratch) | `<pinned> build/evidence-replay-ir/audit-scratch4.mjs` | **0** |
| Historical README §1–§7 byte-comparison | `git show 18179fa:… vs b457db4:…`, `diff` | 0 |
| Rule-literal offsets in committed checker | `<pinned> -e "…indexOf…"` | **0** |

Logs: `docs/v2/evidence/output-lint-replay-review/logs/01`–`08`.

## 2. D1 — the line-number rule now runs before the greedy path rule

`replay-check.mjs:77-78` lists
`[/tooling-guard\.test\.mjs:\d+/g, 'tooling-guard.test.mjs:N']` before
`[/[^ \n]*tooling-guard\.test\.mjs/g, '<TESTFILE>']`. The previous order
(path first) let the greedy `[^ \n]*` prefix consume the `.mjs` literal, so
the line rule could never match and the `+1` import shift reached the
comparison. The committed `CASES` array is byte-identical to `18179fa` (all
twelve cases retained), and the status/stdout/stderr comparisons
(`replay-check.mjs:153-155`) are untouched.

The repair is proven, not asserted. The new
`forced-debug-control.mjs` copies the read-only ignored tool `build/ir4/`,
renames `build-dispatch.mjs` aside, and installs a wrapper that exits 1 on
one `--attempt` number and delegates every other invocation to the real tool
— so the guard's DEBUG branch fires and the stack frames appear. It runs both
sides (the `3bd142f` blob read from git each run, and the working-tree file)
under two different broken invocations:

- **C5/C10** — equal after the repaired order, stdout and stderr;
- **C6/C11** — **unequal** after the previously committed order, first
  difference `"test at <TESTFILE>:130:1"` vs `"…:131:1"` (attempt 4) and
  `154` vs `155` (attempt 1): exactly the `+1` shift, in executable form;
- **C7** — all 6 stack frames shift by exactly `+1`;
- **C0** — reads the committed checker and asserts its line-rule literal
  precedes its path-rule literal, binding the control's copy of the rules to
  the actual checker so the two cannot drift apart silently.

The control's three printed hashes match its README table exactly
(`b41edf2c…` tool, `ec99468e…` before-file, `ef402642…` after-file).

## 3. D2 — the success label now tells the truth

`replay-check.mjs:167-181` distinguishes the two claims: raw byte identity
(`before.out === after.out && before.err === after.err`) earns
`stdout/stderr byte-identical (zero normalisation)`; anything else earns
`equal after permitted normalisation:` plus the names of the rules that
fired. The observed run: eleven cases earn the strong claim,
`ir4-tooling-guard` earns `equal after permitted normalisation: reporter
timings + reporter duration line`. A scratch scan of the twelve `after`
outputs confirmed `ir4-tooling-guard` is the only one containing a permitted
shape, so every label is exactly truthful, not merely defensible.

## 4. The added span audit fails closed and weakens nothing

A fourth condition was added (`replay-check.mjs:102-107`, applied at
`:156-165`): every line normalisation changes must differ *only inside* a
permitted span — the spans are deleted from the line and its normalised form
and the remainders compared. Any line changed outside a span fails the case.
It is strictly additive: the exit-status, stdout and stderr comparisons are
all still there, and no rule was broadened. The four rules are the same
shapes as before — reporter timings, the reporter duration line, the test
file's own line numbers, its path — so no new tolerance was introduced.

Fail-closed is demonstrated two ways: the control's **N5** (0 out-of-span
lines with the four rules, 60 with an added digit-rewriting rule) and an
independent scratch run of the same parameterized audit (log 06, identical
counts; the first leak is the DEBUG line itself). **N6** shows the complement
— a change confined to a reporter timing is still absorbed — and **N1–N4**
show semantically different output stays unequal under both orders, so the
normalisation is not flattening anything. The control README's limits section
states the residual risk as a bounded claim ("no proof in these twelve does
that"), not a universal one; proof-shaped values may match, and the text
says so.

## 5. Historical records preserved

The P3.4 README's §1–§7 — including the §3 transcript and the §5 hash table —
are byte-identical between `18179fa` and `b457db4`, except that §7's final
line gained a trailing newline (log 07). The §8 addendum is purely additive
and describes the current repair. The completion replay still reports the
`exit 2` source-outputs proof identically on both sides (harness `@46419f5`
exit 0, today's harness exit 2, zero normalisation), and the completion
negative control still rejects a live binding and an impure initialiser.

## 6. Minor notes (not numbered; no fix required here)

- **m1 — stale section citation.** `replay-check.mjs:58` says "see README.md
  §7", but §7 is "What was not done"; the D1/D2 addendum is §8.
- **m2 — stale observed column.** The control README's C0 row records the
  rule literals at chars 4538/4626; the committed file has them at 4526/4614
  (log 08), which is what the run printed. The check passes on the committed
  order; only the pre-recorded table entry is off by 12 characters.
- **m3 — latent label imprecision (one clause).** The parenthetical
  "(zero normalisation)" is exactly truthful in this run because no other
  output contains a permitted shape. In a hypothetical raw-identical output
  that did contain one, the strong claim (raw byte identity) would still be
  truthfully reported and only the parenthetical would be mildly imprecise.

## 7. Write scope

- Wrote only `docs/v2/state/reviews/evidence-output-lint-replay-ir.md` and
  `docs/v2/evidence/output-lint-replay-review/**` (README + `logs/01`–`08`).
- Scratch under ignored `build/evidence-replay-ir/` (span-audit
  characterization). Running the authors' own scripts wrote only inside the
  ignored `build/` trees they already own
  (`build/evidence-replay-repair/`, `build/evidence-output-lint/`).
- Nothing staged or committed; no tracked source/config/card/checkpoint
  changed.

During this review a concurrent commit landed on `main` (`1e68dc2`, an
orchestration-log/next-session tracking commit). It changes no proof script,
harness, source or review file, so the `18179fa`..`b457db4` comparison is
unaffected.
