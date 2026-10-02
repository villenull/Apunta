# Session handoff — 2026-10-02, end of a long orchestration session

**Read this first on a new instance, then `docs/v2/state/NEXT-SESSION.md` for the
plan-level view and `docs/v2/state/AMENDMENTS.md` for the reasoning.** The last
commit is `588d3ab` and everything below it is pushed.

## What actually landed

**P3.8 is APPROVED and functionally complete** (`AM-180`). Attempt 3 returned
**all five rows PASS**, no source change. The card's core mechanism is now
*proven on this host*: the marker reaches the child's stderr **after** the `ready`
line, forwarded verbatim through the reader thread's `Rejection` arm. Its
negative control — rebuilt so it can fail — held all seven witnesses, and the
app image was shown from outside the process to have inherited the graphics
backend the control depends on. **This unblocked the whole P3 chain.**

**The dispatch tooling is fixed structurally, not patched** (`AM-175`). There is
now **one** table parser, defined once and imported, because two had disagreed
about the one thing that mattered: the spelling that would preserve a guard's
pattern was the spelling the tools recommended, and the one they rejected was
the only one that survived. Every spelling now round-trips or is refused with a
message naming the ones that work. 25 tests, `check-plan` green at 71 cards.

**P3.4 attempt 4 cleared the blocker that cost it three attempts**, and its
substantive claims are proven: the CSP header is observed on a real `text/html`
response over the app's own origin with all six directives verbatim, a **fresh
nonce per response** (three runs, three nonces), and a style attribute that
actually applies in the shipped binary.

## The three things a new instance must decide

1. **P3.4 is `BLOCKED` on a coordinator decision, not on work** (`AM-183`).
   V2 is 13 PASS / 2 FAIL / 2 NOT RUN with all five containment assertions
   passing. **Both failures read as the card being wrong, not the software:**
   - **FAIL (a)** expects `tauri` to be defined. In a Tauri v2 app
     `window.__TAURI__` is *deliberately not installed* and
     `__TAURI_INTERNALS__` is the object — so the assertion reports undefined
     **where undefined is correct**. Check what (a) is meant to prove before
     touching anything. Do not "fix" the app.
   - **FAIL (d)** clicks a synthetic "John Smith" row in a database that has
     never been seeded, so there is no row to click. (b) and (c) are `NOT RUN`
     behind it. This is a **precondition** question — does the card require a
     seeded database? — the same class as S3.3's D-5.
   **There is no attempt 5.** This card is 4-of-3 plus AM-138's exception.

2. **S3.3a is CLEAR TO DISPATCH** (10/0/0, `AM-182`) and **needs the build
   lease**, which P3.4 was holding. It is the prerequisite for S3.3. Its FD1
   escalation — whether to give an unreachable server its own exit code — is
   **deliberately left open** and **must not be answered inside the card**,
   because catching the first `fetch` would change the no-flag path's refusal
   message (Stop 5, FD2's byte-identical stderr).

3. **S3.2's attempt 2 is cleared** (9 CLEAR, `AM-171`) and waits on the owner's
   **quiet-machine** decision for its real-model row. Do not run it contended.

## Standing rules this session established — they are not optional

- **A check that validates form cannot see a command that is well-formed and
  wrong.** The worst instance: a card's quotes were escaped, which is not a
  syntax error, not a structural error, and **still exits 0** while finding
  nothing. Every gate in the project passed it. Only running a command and
  reading its *output* catches this.
- **A repair round is an author, not a verifier.** Two of four repairs on one
  card introduced a check that cannot fail, and two agents caught a *reviewer's*
  proposed fix being wrong the same way.
- **Run the coordinator's prescribed fix before adopting it.** Three times today
  I prescribed something plausible and wrong about shell polarity, and an agent
  executing it caught the error each time. This applies to me.
- **Prefer no-alternation to correct escaping.** `\|` is alternation in BRE but a
  **literal** in ERE, and a GFM table cell forces the escape — so **a card cannot
  safely hold a regex needing alternation.** Loop over words.
- **Never write a file another agent owns**, even to restore it. Report and
  attribute instead.
- **A claim about the tree is verified by looking at the tree.** Four times today
  an agent (twice me) asserted a runtime fact that was false.
- **Watch for the inverted guard too.** `cmp -s a b || FAIL` punishes
  determinism; `cmp -s a b && FAIL` punishes variance. Same defect, opposite
  direction, and both shipped.

## Known loose ends, in priority order

1. **P3.4's V2 decision** above — blocking, and it is a judgement not a chore.
2. **Nine cards cannot dispatch** because of unfilled port placeholders: **P3.7,
   S2.3, S2.4, S2.9, S2.10, S2.11, S3.3, S3.3a, S5.6**. The rule is correct and
   new; each row needs `--port <p>` spelled or a literal in-range port. This is
   mechanical and unblocks nine cards at once.
3. **P3.5-V5 still has an inert BRE alternation** whose row is green always.
   P3.4's equivalent was fixed in `AM-179`; P3.5's was deliberately left alone.
4. **`P3.8`'s V2 evidence arithmetic** was corrected in `AM-180`; its V0
   evidence file's false claim was corrected by appended note. `V3`/`V4`
   evidence omits the literal exact command, which `RUN-CONFIG.md` §4 wants.
5. **`docs/v2/state/BLOCKED.md` and `PROGRESS.json` may be stale** for P3.4
   (now 4-of-3, BLOCKED on a decision) and S3.3a (cleared, not started). The
   checkpoints were updated; the plan-level files were not regenerated.

## Housekeeping

All subagents are archived. No build lease is held. `check-plan --no-write` is
green at 71 cards. The working tree is clean.
