# P2.1 evidence

Brand token, wordmark, favicon, in-app mark. **Coverage-only card**: the brand
implementation already shipped in the owner-approved AM-028 baseline
(`b366be1`, an ancestor of this card's base), so the deliverable is the tests
that lock it plus runnable rows for the favicon, the `--brand-mark` values and
the no-font-in-the-bundle rule. Implementation session, attempt 1 of 3, base
commit `ff0b977` — verified with `git log -1` before the first edit and still
`ff0b977` when every row ran and at the end of the session. Nothing was pulled,
merged, rebased, reset or committed.

Every command ran from the repository root with the provisioned Node first on
`PATH` (`node --version` → `v24.19.0`; the box default is v26.8.2, outside
`engines: ">=24.19.0 <25"`). No server, database, browser, sandbox or port was
used: this card is L1 and launches nothing, so the dispatch's port 7816 is
unused and nothing could reach 7717. All times below are UTC; `vitest`'s own
`Start at` line prints local time (UTC−06:00 on this box) and is left as
printed.

| Row | Status | Exit | Evidence |
| --- | --- | --- | --- |
| V1 `npm run build:shared && npx vitest run web/src/components` | PASS, 14 files / 117 tests, **21 of them new** | 0 | [v1-unit.md](./v1-unit.md) |
| V2 favicon `cmp` + both `--brand-mark` greps | PASS | 0 | [v2-favicon-token.md](./v2-favicon-token.md) |
| V3 `npm run build` + font census of `web/dist` | PASS, exactly 6, all `fonts/inter-*.woff2` | 0 | [v3-dist-fonts.md](./v3-dist-fonts.md) |
| V4 `npm run lint && npm run typecheck` | PASS | 0 | [v4-lint-typecheck.md](./v4-lint-typecheck.md) |

**Three files created, all test-only, all in the card's May-edit list:**
`web/src/components/BrandWordmark.test.tsx` (7 cases),
`web/src/components/BrandMark.test.tsx` (7 cases),
`web/src/components/TopBar.test.tsx` (7 cases). None of the three existed at
base, so nothing was extended and no existing case was touched.
`git status --porcelain web/` lists exactly those three paths and nothing else;
the six Must-not-edit files are byte-for-byte as dispatched.

**The pass on the base commit's behaviour is the result, not a missing
failure.** The card's stop conditions say this twice: this behaviour exists, so
the first green run is the evidence, and manufacturing a failure by editing
production code is forbidden. Nothing under `web/src/components/*.tsx`,
`web/src/styles/tokens.css` or `web/public/` was modified at any point in the
session.

**Every run that failed is recorded as observed**, with the command, the exit
code and the output: two authoring mistakes in my own test code (V1's first
attempt, exit 1 — §2) and one type error in my own test file (V4's first
`typecheck`, exit 2 — §5). No row failed for a reason outside this card's own
files.

**Supplementary, not a card row:** a sensitivity pass that broke one
expectation in each of the three new files to prove they are reached and can
fail ([v1-unit.md](./v1-unit.md) §4), and a baseline run with the three new
files excluded that reproduces the card's 11 files / 96 tests figure
([v1-unit.md](./v1-unit.md) §3). Both were reverted before the run of record.

**Other cards in flight.** The tree carried the coordinator's uncommitted
dispatch and review files (`docs/v2/state/dispatch/**`,
`docs/v2/state/reviews/**`) throughout. They were left alone, and nothing of
theirs was staged. `npm run lint` and `npm run typecheck` are whole-repository,
so those two rows are green *with* that work in place.
