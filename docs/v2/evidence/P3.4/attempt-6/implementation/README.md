# P3.4 attempt 6 — AM-195 apply (implementation side)

**Scope of this directory: the apply only.** Four prepared patches, applied to
four shipping paths in the working tree on `main` at `4060909`. **Nothing staged,
nothing committed, no dispatch generated, no runtime run, no attempt 6 in
existence, and no authority exercised beyond the four named patches.**

Authority: owner amendment **AM-195** (`docs/v2/state/AMENDMENTS.md:429`),
"Apply exactly candidate.patch and tooling.patch from eod-instrument-proposal
plus fixture.patch and tooling-fixture.patch from eod-instrument-proposal-repair."
Package: `docs/v2/state/P3.4-EOD-INSTRUMENT-PROPOSAL.md` §5 Option A and §4.1.
Independent review of the package: `docs/v2/state/reviews/P3.4-eod-instrument-ir2.md`
— **CLEAR and owner-ready**, 80/80 and 29/29, with the instrument byte-identical
at `cc733cd0…`.

## Resulting source candidate

| file | sha256 | |
| --- | --- | --- |
| `scripts/v2/tauri-security.test.mjs` | `cc733cd0791cb896e57b07608dd97e4c1e835efb06f8b491d5f1010619df7a16` | ✅ expected `cc733cd0…` |
| `docs/v2/tools/build-dispatch.mjs` | `3f77b55bdea4a2e00019d3f66b5e96479c476a3e4a5af45575c6b9971cef56c4` | ✅ expected `3f77b55b…` |
| `docs/v2/tools/build-dispatch.test.mjs` | `ee8e051cc467ef62c55d00a128d496da94eeaaee6364789c694a85d5d6de8b8f` | ✅ expected `ee8e051c…` |
| `…/attempt-5/implementation/ported-model.test.mjs` | `e4790fe909e0352fdba94b0f54db48397deac436a35d3c267937f468796d607b` | ✅ expected `e4790fe9…` |
| `…/attempt-5/implementation/adapters.test.mjs` | `325b2884f31dc1c8f3cf0767d279cfacde1e40b07e09437e904e87b815d9a4c8` | untouched, as reviewed |

## Suites (all green)

| suite | result |
| --- | --- |
| committed synthetic suite, `ported-model` + `adapters` | **80 / 80**, fail 0, skipped 0, todo 0 |
| tool guard, `build-dispatch` | **29 / 29**, fail 0 |
| `plan-lib` + `check-plan` | **13 / 13**, fail 0 |
| `node --check`, ESLint `--no-ignore`, Prettier `--check` on all four paths | clean, exit 0 |

The prior independent review's **32 adversarial instrument controls carry forward
on hash identity** — the harness is at the same `cc733cd0…` bytes they were
carried on. Not re-run; not needed.

## Index

| File | What it shows |
| --- | --- |
| `01-baseline-check-and-apply.txt` | the five baseline hashes, the four patch hashes (same bytes as the evidence directories), all four `--check` clean before any mutation, per-patch `--stat` scope, the apply itself, and the post-apply hashes with the working-tree scope. |
| `02-test-suites.txt` | full transcripts: 80/80, 29/29, 13/13, and the skip/only/todo audit (0 in all three files). |
| `03-syntax-lint-format.txt` | `node --check` ×4, ESLint `--no-ignore` exit 0, Prettier clean — on the real paths, not a mirror. |
| `04-tool-attempt6-print-only.txt` | `--print` only: P3.4 attempt 6 + AM-195 renders the one correct line; P3.5 attempt 6 refused; attempt 7 refused; attempt 6 without the amendment refused. No dispatch written. |
| `05-writes-and-authority.txt` | the four shipping writes, this directory, and the long list of what was deliberately **not** written and **not** exercised. |

## Not this work's, left alone

`docs/v2/state/cards/P3.5.json` (modified) and
`docs/v2/evidence/P3.5/attempt-4/silence-completion/` (untracked) belong to a
concurrent background agent (AM-196, P3.5 runtime) and arrived mid-session. They
were not read, staged, committed or altered.

## Next step — root's, not this work's

A **fresh independent SOURCE review of the applied tree** (the AM-192/AM-194
precedent), *before* any serial runtime lease. Only then: regenerate the
dispatch, delegate the sole checkpoint writer, V0 → V4 once each in card order.
No attempt 7, no reset, no retry, no partial re-run, no waiver.
