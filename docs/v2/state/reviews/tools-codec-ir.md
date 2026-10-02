# Independent review — the dispatch table codec and its four refusals (AM-170; D1, D2, D4, D5)

**Date:** 2026-10-02. **Anchor:** `main` at `1365356`. **Reviewed:**
`docs/v2/tools/build-dispatch.mjs`, `docs/v2/tools/check-plan.mjs`,
`build-dispatch.test.mjs`, `check-plan.test.mjs`, `plan-lib.mjs` (read for the
parse path only), plus `docs/v2/state/reviews/P3.R-ir.md` §D1/§D2/§D4/§D5 and
`state/AMENDMENTS.md` AM-170.

**Nature:** read-only. This file is the only thing written. No card, dispatch,
plan or state file was edited; no `git add/commit/push/checkout --/reset/stash`;
no build, test, e2e, eval, sandbox, producer or launching command; no port
touched. `build-dispatch.mjs` was only ever run with `--print`, `check-plan.mjs`
only with `--no-write`. All mutation experiments ran against copies of
`docs/v2` and of the tools under `/tmp/opencode/ir/`. The only commands executed
from the repository's own test suites were `node --test` on the two tools'
test files (14/14 pass) and `node --test` on copies of them carrying mutants.

---

## Verdict: **approve with notes**

No code change here is wrong, and the codec claim in D4 holds over the whole
alphabet I could construct — with one documented exception (edge whitespace) that
is unreachable through the card path. The refusals all fire, and each fires for
the reason it claims. Two things must be *recorded* rather than coded, and one
latent trap is worth closing while the codec is still warm; neither is a merge
blocker.

The single most useful sentence in this review: **the codec is now exact, and
that is precisely what makes it a faithful transporter of a wrong command.**
Nothing in this tooling can distinguish a cell that means what it says from one
that is well-formed and inert — the class of defect AM-170's last paragraph
describes. Two live rows in the plan are in that class today (§4).

---

## 1. Is the codec a total inverse, or only over its author's alphabet?

**It is a total inverse over everything except edge whitespace, and I can
bound the exception set exactly.** Property test over every string of length ≤5
drawn from `{a, |, \, space}`, plus ≤8 from `{|, \}`, plus ≤4 from `{\, |, \|}`,
plus ≤3 from `{a}`, `{a, \n}`, `{a, \r}`, `{space, tab, |}` — 2,061 strings:

| alphabet | tested | cell-count failures | content differs | of which edge-trim only |
| --- | --- | --- | --- | --- |
| `{a, \|, \, space}` ≤5 | 1364 | 0 | 596 | 596 |
| `{\|, \}` ≤8 | 510 | 0 | 0 | 0 |
| `{\, \|, \|}` ≤4 | 120 | 0 | 0 | 0 |
| `{a, newline}` ≤3 | 14 | 0 | 10 | 10 |
| `{a, CR}` ≤3 | 14 | 0 | 10 | 10 |
| `{space, tab, \|}` ≤3 | 39 | 0 | 34 | 34 |

**The complete asymmetry set is one class:** `parseCells` calls `.trim()`
(`build-dispatch.mjs:90,94`), so a cell with leading or trailing space, tab,
newline or CR comes back with it removed, and a cell that is *only* whitespace
comes back empty. Nothing else fails — in particular the cell *count* never
changes for any input, including `\`, `\\`, `\|`, `\\\|`, `\\\\\\|` and
`\\\\\\\\`, so the old 4-cell blow-up is genuinely gone.

**Can it occur in a real card cell? No, and it is silent if it did.**
`parseCard`'s own `splitRow` (`plan-lib.mjs:36-52`) trims every cell too, so a
command or expected cell can never carry edge whitespace into `escapeCell`, and
the generator's round-trip assertion (`:278`) compares against the already-
trimmed `r.command`. Sweeping all 71 cards / 287 verification rows: zero rows
with leading or trailing whitespace in a command cell. The asymmetry is a
property of the *exported pair* only, and only for a future caller that feeds it
padding-bearing text.

**Finding 1 — worth noting.** `build-dispatch.mjs:37` claims
"`parseCells(emit(x)) === x` byte for byte" and `:54` calls `parseCells` "the
total inverse", both unqualified. AM-170 records the trim honestly; the code
does not.

> *Failure scenario:* a future tool imports `escapeCell`/`parseCells` to build a
> table where a trailing space is significant (a `printf '%s '` payload, a
> generated fixture list) and gets a silent one-character-per-side loss, with a
> docstring promising the opposite.
>
> *Correction:* in both docstrings, say "exact inverse of `escapeCell` for any
> string without leading or trailing whitespace; `parseCells` trims each cell,
> as GFM requires". One clause, no code.

## 2. Do the new refusals fire, and for the right reason?

All eleven scenarios below were run end-to-end against synthetic plan
directories (`--print` / `--no-write` only):

| scenario | `build-dispatch` | `check-plan` | right reason? |
| --- | --- | --- | --- |
| 6-cell row (bare `\|`×3, P3.7-V3's shape) | **exit 4**, names `V1` and "parses as 6 cells, not 3" | exit 1, same message | yes |
| bare pipe in an **expected** cell | **exit 4**, "4 cells, not 3" | exit 1, "4 cells, not 3" | yes |
| `--port <p>` | exit 0, row shows `--port 7841` | — | yes |
| `--port <p1>` | **exit 4**, `V1: <p1>` | — | yes — this is D2's generality earning its keep |
| `APUNTA_P31_PORT=<p>` | **exit 4**, `V1: <p>` | — | yes |
| `<p>` and `<port>` in **prose** only | exit 0 | — | **yes, verified on a real card**: P3.1's three `<p>` mentions (`cards/P3.1.md:271,273,286`) are prose, and `P3.1 --print` exits 0 |
| `<p>` in an **expected** cell | exit 0 (substituted) | — | by design; the scan is `cells[1]`-only |
| `printf 'a\\b'` (double backslash) | exit 0, cell byte-identical | exit 0 | yes — this is the case I expected to false-fail, and it does not |
| `grep "a\\\|b"` (the double escape) | **exit 4** | exit 1 | right refusal, **wrong advice** — see §3 |
| `grep "a\|b"` (the single escape) | exit 0 | exit 0 | **see §3: this is the trap** |

**Finding 2 — worth noting, and the sharpest one here.** There is *no spelling of
a BRE alternation that survives the pipeline*. `splitRow` unescapes `\|` → `|`
(`plan-lib.mjs:42-44`), so the moment a card writes the alternation the way
`check-plan.test.mjs:128` certifies it, the command the generator holds is a bare
pipe. Writing `\\|` instead is the only spelling that preserves it — and that is
exactly what both tools refuse, with the message *"every pipe … must be written
`\|`"*, i.e. advice that leads to the lossy spelling.

> *Failure scenario:* a new card writes
> `` `grep -rn "invoke_handler\|withGlobalTauri" src-tauri` ``. `check-plan` is
> green (that is test 14's own claim). `build-dispatch` is green. The generated
> parent row reads `grep -rn "invoke_handler\|withGlobalTauri" …` in source and
> `invoke_handler|withGlobalTauri` when rendered, which grep reads as one literal
> string that no file ever contains. The row's pass condition is that grep's
> exit code. Verified with a fixture holding the forbidden text: alternation →
> exit 0 (matches); bare pipe → exit 1 (matches nothing, so "no forbidden text",
> so PASS). Green always — D4's defect, through a door the new tests hold open.
>
> *Correction:* one rule, applied in both parsers. Make `splitRow` the same
> total inverse as `parseCells` (`plan-lib.mjs:42-44` must unescape `\\` as well
> as `\|`), so `\\|` in a card means "a literal backslash-pipe to the shell" and
> `\|` means the same in both tools; then make the refusal name `\\|`, and
> narrow `check-plan.test.mjs:128`'s comment, which currently asserts the
> opposite of what the pipeline does. Failing that, at minimum rename that test
> and state in it that `\|` is only safe because those greps are `-e`-shaped.

This is *latent*, not live: no card in the plan contains a BRE alternation any
more. It is worth closing while the codec is in the author's hands.

**Finding 3 — worth noting.** The whole-document scope of refusals 3 and 4
(`:429-442`) means a `<p>` or a `{{BASE}}` in `RUN-CONFIG.md`, `HARD-STOPS.md`, a
contract, a template, or a *prose table row* inside a card would refuse
generation for **every** card at once — a new global coupling with no precedent
in the plan. I swept the real plan: zero occurrences outside the 14 command cells
in §4, so it is latent. Related and by design: `findUnsubstitutedTokens`'s
five-token vocabulary lets another packet's `{{S32_PORT}}` survive into a
*command* cell unflagged (bash would see the literal braces) — correct for the
prose case the author had in mind, unchecked for the command case.

## 3. Did the fix change previously-correct behaviour?

**Importing the module has no side effects.** Verified: `import()` of
`build-dispatch.mjs` creates no files, writes nothing, prints nothing, does not
call `process.exit`, and returns the five exports. The `main()` guard
(`:459`, `resolve(process.argv[1]) === fileURLToPath(import.meta.url)`) holds
for `node script`, `./script`, and `node --test` (where `argv[1]` is the test
file). `check-plan.mjs` importing it is therefore safe, which is what makes the
"the two tools cannot disagree about what a cell is" claim in AM-170 true.

**`--print` genuinely writes nothing.** Verified against the real plan:
`P3.1` and `P3.4 --print` exit 0 and `git status --porcelain` plus a
`find | md5sum` fingerprint of `docs/v2` are byte-identical before and after;
`P3.7 --print` exits 4 and also changes nothing. `build-dispatch.test.mjs:249`
asserts the absence of the dispatch file, which is the right assertion.

**`check-plan --no-write` on the real plan:** exit 0, "Plan consistent: 71
cards, 12 parent reviews, 14 contracts, R01–R20 covered, no cycles". The new
`cells.length === 3` assertion is safe against all 71 cards today (287 rows, all
parse as 3). No previously-correct behaviour changed.

## 4. Are the tests meaningful, or do they test the implementation?

**Yes, and the specific worry in the brief is answered: there is a
regression-direction test and it fires.** I mutated `escapeCell` in a copy of
the tools three ways and ran the two suites against the mutants:

| mutant | tests failing |
| --- | --- |
| escape `"` as `\"` — **the failure mode of this session, in the codec** | 5 of 14 (tests 1–4 and 6) |
| double every backslash — the old behaviour | 4 of 14 (tests 1–4) |
| escape `(` | 3 of 14 |
| escape `'` | 5 of 14 |
| escape `&` | 1 of 14 — **and only incidentally** |

The `&` mutant is the interesting one. It passes all four codec tests, because
`REPRESENTATIVE` (`build-dispatch.test.mjs:37-49`) happens to contain no `&`;
it is caught only by test 6, and for the wrong reason — the over-escape breaks
the codec's invertibility, so the *generator's* round-trip assertion
(`build-dispatch.mjs:278`) refuses with "escapeCell and parseCells are not
inverses for this cell" before the cell-count refusal the test expects. So the
real safety net for over-escaping is that in-generator assertion, which is
itself only tested in its passing form.

**Finding 4 — worth noting.** The four codec tests assert a *sample*, not a
property over the alphabet in use. The commit message's "twenty thousand
generated strings" was a one-off check, not a test, so nothing keeps it.

> *Failure scenario:* someone later adds `escapeCell` escaping of `&`, `;` or
> `` ` `` for a reason they believe is right. Tests 1–4 stay green, the tool
> keeps working on synthetic plans, and the first card with an `&` in a command
> cell ships a dispatch whose row the reviewer copies with a backslash in it —
> and, as in this session, the command still exits 0 having found nothing.
>
> *Correction:* one corpus test, ~10 lines: read the plan read-only and assert
> `parseCells(\`| ${escapeCell(cmd)} | x |`)[0] === cmd` for every command cell
> (287 today), plus a generated-alphabet loop over
> `{a, |, \, space, tab, ", ', &, $, (, ), ;, \`}` to length 4 asserting the
> round trip in both directions. That is the test that would have caught the
> session's regression *and* its mirror, and it would keep catching them.

Per-test, in one line each: **1** catches loss and gain over its 11 strings;
**2** pins the D4 defect specifically; **3** is the byte-identity property the
parent depends on and catches a doubling codec; **4** is the only test that runs
a real `grep`, and it is the strongest; **5** is a genuine end-to-end D5 test
(borrowed row filled, zero `{{` in the document); **6** is end-to-end D1 and
asserts *nothing is emitted* on refusal, which is the part that matters; **7**
is end-to-end D2 and covers both directions (refuse `APUNTA_P31_PORT=<p>`,
accept `--port <p>`); **8** is the unit that backs the prose claim and it holds
on a real card too; **9** is the only guard on `--print`; **10** pins the token
vocabulary decision; **11**–**14** are `check-plan`'s, and 12 and 14 are the
negative/positive pair that would catch a wrongly-broad cell-count rule — except
that 14 asserts something false (§2). Tests 5–9 do not depend on the codec's
alphabet at all, which is why they survived every mutant.

**Finding 5 — worth noting.** Nothing checks the *rendered* form of a cell, and
the rendered form is what a reviewer copies. GFM renders `\|` as `|`, so the
codec's exactness is a property of the file, not of the command a human or agent
takes out of it. That gap is where this session's quote-escape regression lived.

**Finding 6 — worth noting, card-side.** In implement mode `body = card.text`
(`:304`) — nothing is escaped, nothing is round-tripped, and the implementer
reads the card's own rendered table. D1's correction also asked for "the command
cell has an even number of backticks"; that half was not implemented, and the
shape it was written for is already in the plan: `P3.1` V4
(`cards/P3.1.md:326`) opens a code span with a backtick and never closes it, so
the whole cell renders as code. Adding the assertion today would fail on that
one row — which is the point.

## 5. Is `cells.length === 3` safe across all 71 cards?

**Yes today, and no card is one edit from a false failure — with one exception
that is a trap rather than a false positive.** Swept all 287 rows: every one
parses to exactly 3. Specifically checked and clear: an expected cell containing
a table or several alternatives (`a \| b \| c`, `neither \| nor \| loaded`) →
3 cells, round-trips; a command containing `\\` (`printf 'a\\b'`, `tr -d "\\"`)
→ 3 cells, byte-identical, generation exits 0; 46 rows carry no backtick span at
all and are unaffected. The exception is the `\\|`-in-a-card case of §2: that
edit *is* refused, correctly (the cell is not representable), but the message
sends the author to the spelling that loses the meaning instead.

## 6. Is anything now silently dropped that used to be caught?

**Nothing is dropped, and the one row that lost a control is now whole.**
`P3.7`-V3 before: `splitRow` produced 6 cells, `parseCard` kept three, the
inherited command ended mid-word and `exit $rc` was gone — silently, with
`check-plan` exit 0. Now: the row parses as 3 cells, all three shell pipes are
present in the parsed command, `exit $rc` is the last thing in it, `check-plan`
errors with the row id and the count, and `build-dispatch` refuses with exit 4.
The refusal happens on `row.raw` (`:316-323`), i.e. *before* the truncation
`splitRow` performs, which is the only place it can be caught — that ordering is
correct and worth keeping.

**Finding 7 — must record before the next dispatch (not a code fix).** D2's
general rule is correct, and its first effect is that **nine cards and fourteen
command cells can no longer be dispatched at all**, starting with the next
packet: `P3.R --review --print` exits **4** with

```
these command cells still carry a port placeholder nothing substitutes
(only `--port <p>` is filled): P3.7-V1: <p>; P3.7-V3: <p>
```

The affected set is `P3.7` (V1, V3), `S2.3` (V5), `S2.4` (V5), `S2.9` (V1, V3),
`S2.10` (V1, V3), `S2.11` (V5, V7), `S3.3` (V1, V2, V8), `S3.3a` (V6, V7),
`S5.6` (V1). AM-170 records "check-plan green at 71 cards" and says nothing about
this, so the next session meets an exit 4 that reads like a P3.7-specific bug.

> *Correction:* one line in AM-170 (or the packet's Known facts) naming the nine
> cards and the two acceptable fixes — put a literal in-range port in the cell,
> or extend the single substitution at `build-dispatch.mjs:232` to the env-var
> spelling, which is what D2's own correction preferred. Cheapest alternative:
> have the refusal end with the count ("14 command cells across 9 cards").

**Finding 8 — worth noting, and it is not this tooling's to fix.** D4's
substantive defect is still live in two rows the new codec now transports
*perfectly*: `P3.4`-V3 (`grep -rn "invoke_handler|withGlobalTauri\": true" …`,
BRE, no `-E`) and `P3.5`-V5 (`grep -c 'module-null-sink|module-remap-source'`).
Both read as single literals; verified against fixtures holding the forbidden
text — with `-E` the pattern matches, without it, exit 1, i.e. "nothing
forbidden", i.e. the row's PASS. `P3.4`-V3's pass is that exit code, so it is
green always, exactly as D4 said. AM-170's "the cell P3.R inherits from P3.4-V3
is now byte-identical to P3.4's own cell" is true and should not be read as "the
guard now fires": faithfulness was the goal, and faithfulness was achieved. The
fix is card-side (`P3.4`'s repair round — drop the alternation, as D4's
correction prescribed), and nothing in this tooling can see it, which is the
point AM-170's closing paragraph already makes.

---

## Must fix before merge

Nothing. No defect found in the code; the codec's central claim is true over the
alphabet I could construct, the refusals fire for the reasons claimed, the module
is importable without side effects, `--print` writes nothing, and the new
`check-plan` assertion is safe against all 71 cards.

## Must record before the next dispatch

- **Finding 7** — the nine cards D2's rule now blocks, and the two ways to
  unblock them. One line in AM-170.

## Worth noting, in order of value

1. **Finding 2** — `\|` in a card is silently flattened by `splitRow` and `\\|`
   is refused with advice pointing at `\|`; `check-plan.test.mjs:128` currently
   asserts the false version of this. One parser rule in `plan-lib.mjs` closes it.
2. **Finding 4** — the codec tests assert a sample alphabet, not a property over
   the one in use; a corpus test over the plan's 287 cells plus a small generated
   alphabet would hold the line in both directions.
3. **Finding 8** — `P3.4`-V3 and `P3.5`-V5 still carry inert BRE alternations,
   faithfully copied. Card-side, but the amendment should not imply otherwise.
4. **Finding 1** — say "modulo cell padding" in the two docstrings.
5. **Finding 6** — D1's backtick-parity half is unimplemented and one row
   already has the shape it targets.
6. **Finding 5** — the codec's exactness is about the file; the *rendered* cell,
   which is what gets copied, is unverified.
7. **Finding 3** — the whole-document refusals couple every card to a stray
   `<p>` in shared prose; latent today, worth a docstring clause.