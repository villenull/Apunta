# 03 — the state document: each prose correction, and why it was wrong

`docs/v2/state/P3.4-PRE-RUNTIME-CORRECTION.md` is the document the owner will read, so
its inaccuracies were the substance of this pass, not the formatting. Four corrections,
each one a factual claim. Before/after is quoted verbatim. The file is **140 lines** after
this pass (cap: 140) and still contains exactly **one** bounded owner decision.

## 1. "Nothing was executed." → scoped to what is true

**Was** (lines 10–12 of the received file):

> **Nothing was executed.** No acceptance row has run. V0–V4 are still `NOT RUN`
> and each remains once-only. No attempt 6, no counter reset, no retry. No source
> file, card, dispatch, checkpoint, contract, threshold or tool was edited.

**Why it was wrong:** it was false as written, and falsity in an owner-facing document is
the worst place for it. `node --check`, `node --test` over the repo's own 80 port/adapter
fixtures, `eslint`, `prettier` and the synthetic-IO probe all ran — the package's own
`README.md` in the very same evidence tree says so in its first line. A reader who caught
one exaggeration stops trusting the two defects the document is asking them to rule on.

**Now:**

> **No runtime and no acceptance row was executed.** V0–V4 are still `NOT RUN`
> and each remains once-only. What *did* run is offline and synthetic only:
> `node --check`, `node --test` over the repo's own port/adapter fixtures, eslint
> and prettier, and a synthetic-IO probe of scratch copies — no app, server,
> database, model, audio, input, display, port 7717 or network. No attempt 6, no
> counter reset, no retry. No source file, card, dispatch, checkpoint, contract,
> threshold or tool was edited.

The load-bearing half is unchanged and still true: **no acceptance row ran**, so V0–V4
remain once-only. The correction makes the claim narrower and true, not wider.

## 2. "P3.5+ dependents wait" → the dependents are P3.6 and P3.R

**Was** (leading sentence only; the rest of the paragraph carried over unchanged):

> **If declined:** P3.4 is `BLOCKED` (exhausted budget, §E contradiction standing),
> and P3.5+ dependents wait.

**Why it was wrong:** two errors in one clause. P3.5 is **not** a P3.4 dependent —
`docs/v2/DEPENDENCIES.md:50` gives it `P3.3, S1.R` — so the sentence told the owner that
declining would stall a card that would carry on regardless, and it hid the cards that
really would stop. COORDINATOR §4 says it precisely: *"Dependent cards do not start while
a dependency is `BLOCKED`. Independent cards continue."* The only cards depending on P3.4
are P3.6 (`:51`) and P3.R (`:44`).

**Now:**

> **If declined:** P3.4 is `BLOCKED` (exhausted budget, §E contradiction
> standing). Under COORDINATOR §4 only cards that **depend on** P3.4 wait —
> P3.6 and P3.R. **P3.5 is independent** (its dependencies are P3.3 and S1.R) and
> continues. The root does not repair either way. The two defects stay recorded as
> risks on the rows, alongside the retained O1.

The consequence for the owner is materially different: declining blocks two downstream
cards, not three, and does not stop the audio work.

## 3. No source patch before the grant; the root integrates the exact patch after

**Was:** silent on both. The request said the patch "may be applied" and then, redundantly,
twice said the corrected source "re-enters the normal review → once-only V0→V4 path" —
once at the end of the quoted request and once nowhere else. It never said whether a patch
was already sitting in the tree.

**Now** (added directly after the quoted request, which also lost its duplicated tail
sentence so the sentence appears once):

> No source patch exists in the tree and **none will be applied before the
> grant**. On a grant the root applies **exactly** `02-patch.diff`, byte for
> byte, with no further edit, and only then does the corrected source re-enter the
> normal review → once-only V0→V4 path. Any other change is a new packet.

That is the whole integration contract the owner is approving: nothing is applied on the
strength of this document alone, and the grant covers one specific byte sequence rather
than a licence to fix O3 and O2 however they come to hand.

## 4. Review status made explicit — new §7

**Was:** §4 recorded that the review returned CHANGES REQUESTED and that its one required
change (the format wrap) was made. A reader could reasonably take that as "review
resolved". It is not the same thing: the reviewer's verdict word is CHANGES REQUESTED, the
wrap being fixed afterwards does not rewrite it, and **no review has been run on the final
corrected text or on this preparation pass at all**.

**Now** (§7, four bullets): the CHANGES REQUESTED verdict is retained as recorded and is
not rewritten by the fix; `02-patch.diff`, `review/**` and the reviewer report are
historical bytes and were not edited; **a final independent review is still due** and
nothing in the document asserts otherwise; and the probe cleanup below points at
`final-preparation/`. The closing footer now reads **"Final review: still due."**

## Deliberately not changed

- **"31 other harness functions are byte-identical"** (§3). The reviewer flagged this as a
  different counting basis from its own "76 of 79 identical, 3 changed" and called it
  immaterial, and the substantive claim — only the three seam functions change — is true
  in both. It is a pre-existing, already-disclosed discrepancy in someone else's count, and
  changing it would be editing a number this pass did not compute. Left for the root or the
  final reviewer.
- Every defect, citation, line number, hash, count, table cell and alternative in §§1–4 and
  §6. This pass changed no technical claim, only the four prose points above.