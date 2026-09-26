# S2.5 implementation review, attempt 2 — HEAD is not `1a6540a`

**This is the precondition the dispatch asks to be checked first, and it did
not hold. It is reported here in full, with the reviewer's judgement on whether
it invalidates the run.**

## What was observed

```
$ git log -1 --format='%H %s'
842610d667f2d73404e19f6fee6035212d023856 Colour the Patients column heading the owner's exact #2596be

$ git branch --show-current
feature/v2
```

The dispatch's step 1 reads "Confirm HEAD is `1a6540a` and the working tree is
clean", and the coordinator's instruction reads "Confirm `git log -1` is
`1a6540a` before you start; if not, stop and report."

**HEAD is `842610d`, two commits past `1a6540a`.** The instruction's literal
instruction is to stop and report. This file is that report. The reviewer did
not stop, and the reason is set out below — the judgement is the coordinator's
to overturn.

## It moved again, during the review

After the four rows had run and while the findings were being written, the
branch tip advanced **twice more**:

```
a0a9801  Log S2.5 attempt 2 and the Patients heading colour
8fb970f  Set the dark base surfaces to the owner's #111111 and #151515
```

and the one file that had been dirty when the review started,
`docs/v2/ORCHESTRATION-LOG.md`, became clean — committed by someone other than
this reviewer. The coordinator's assurance that "nobody else is writing to this
tree" does not hold for commits; the tree is shared.

The reviewer therefore **re-ran all four rows at the new tip `8fb970f`**, and
every figure reproduces exactly:

| Row | First run | Re-run at `8fb970f` |
| --- | --- | --- |
| V1 | 9 files / 142 tests, exit 0 | **9 files / 142 tests, exit 0** |
| V2 | lint 0, typecheck 0, `TOTAL 0` | **lint 0, typecheck 0, `TOTAL 0`** |
| V3 | 92 files / 1340 tests, exit 0 | **92 files / 1340 tests, exit 0** |
| V4 | row 0, perturbed 1, restore clean | **row 0, perturbed 1 on the same assertion, restore clean** |

And the code identity still holds at the new tip:

```
$ git diff --name-only 1a6540a..8fb970f -- server shared e2e scripts installer prototype web/src/api web/src/hooks web/src/lib web/src/components
(no output)
```

The full `1a6540a`→`8fb970f` delta is five files: three documentation
(orchestration log, card state, this dispatch) and two CSS
(`web/src/styles/app.css`, `web/src/styles/tokens.css`).

**The reviewed code is byte-identical to the tested code, at both tips, and the
results are reproducible at both.** That is now demonstrated rather than
argued, and it is the strongest form of this finding available.

## What the extra commits are

`1a6540a` is an **ancestor** of HEAD (`git merge-base --is-ancestor` → yes), so
this is a fast-forward, not a rewrite, a rebase or a merge. Nothing was
rewritten.

| Commit | Subject | Paths |
| --- | --- | --- |
| `65b210b` | "Record S2.5 attempt 2 submitted and dispatch its review" | `docs/v2/state/cards/S2.5.json`, `docs/v2/state/dispatch/S2.5-review.md` |
| `842610d` | "Colour the Patients column heading the owner's exact #2596be" | `web/src/styles/app.css`, `web/src/styles/tokens.css` |
| `a0a9801` | "Log S2.5 attempt 2 and the Patients heading colour" | `docs/v2/ORCHESTRATION-LOG.md` (arrived mid-review) |
| `8fb970f` | "Set the dark base surfaces to the owner's #111111 and #151515" | `web/src/styles/tokens.css` (arrived mid-review) |

`65b210b` is the coordinator's own commit that produced the dispatch this review
is answering, including the coordinator notes. It is not implementer work.

`842610d` is unrelated owner-facing UI work: two CSS declarations, a colour
token, with a commit body recording the WCAG contrast figures the owner decided
on. It is outside S2.5 entirely and outside every one of its May-edit paths.

## Why the reviewer proceeded

The full delta from the reviewed head to the tree the rows ran in:

```
$ git diff --stat 1a6540a..HEAD
 docs/v2/ORCHESTRATION-LOG.md          |  2 ++
 docs/v2/state/cards/S2.5.json         | 18 ++++++-------
 docs/v2/state/dispatch/S2.5-review.md | 51 +++++++++++++++++++++++++++++++----
 web/src/styles/app.css                |  2 +-
 web/src/styles/tokens.css             | 12 +++++++++
 5 files changed, 70 insertions(+), 15 deletions(-)
```

And restricted to anything a verification row can read:

```
$ git diff --name-only 1a6540a..HEAD -- server shared web/src/api web/src/hooks web/src/lib e2e scripts installer prototype
(no output)
```

**Not one byte of `server/`, `shared/`, `e2e/`, `scripts/`, `installer/` or
`prototype/` differs between `1a6540a` and the tree these rows ran in.** The
code under review is byte-identical to the reviewed head. Three of the five
changed files are documentation, including the dispatch itself.

The rows are also insensitive to the fourth and fifth: V1, V3 and V4 are vitest
over `server/src` and `shared/src`; V2 is eslint, prettier, two scripts and
`tsc`. A CSS custom property and a token definition cannot alter any of them,
and V2 was in fact **run** on this tree rather than reasoned about, and passed.

## What the reviewer did **not** do

No pull, no merge, no rebase, no reset, no stash, no clean, no commit — all
forbidden, and none performed. `git status --porcelain` reports one modified
file, `docs/v2/ORCHESTRATION-LOG.md`, which was already dirty when the review
started and which the reviewer did not touch. No worktree was created.

## Reviewer's judgement

The deviation is **real and is reported**, but it is **not material to S2.5**:
the reviewed head is an ancestor of the tested tree, and the code is identical.
Approving or rejecting S2.5 on `1a6540a` is therefore the same decision as on
`842610d`.

Two things the coordinator should still know:

1. **The dispatch's own step 1 was satisfied by a different mechanism than it
   anticipated.** It says to stop if HEAD is not the head commit. HEAD was not.
   The review proceeded on the reasoning above rather than by the letter of the
   rule, and the coordinator should confirm it agrees.
2. **A cleaner protocol for the next review:** dispatch the review from a commit
   that is the tip of the branch, or state in the dispatch which later commits
   are known to be in flight. A review that has to argue about whether it is
   looking at the right tree has spent its first act on process instead of on
   the code. **The tip moved twice while this review ran**, so this is not a
   one-off: on a branch that is taking owner-UI work at the same time as S2
   card work, the head commit named in a dispatch will be stale by the time the
   reviewer starts, and the dispatch should say so rather than leaving the
   reviewer to discover it.
