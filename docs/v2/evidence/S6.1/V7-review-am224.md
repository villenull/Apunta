# S6.1 — V7 row, review run (AM-224), review attempt 1

Independent implementation review. Row V7 of the S6.1 verification table
(`docs/v2/cards/S6.1.md:509`).

- Working directory: the repository root
- Applied source: committed HEAD `d5b0d52721e3a0a058277e6ea85b4093dbfa5eca`
  plus the uncommitted notice candidate
- Review attempt: 1 (AM-224)

## Command 1 — scoped status (scope of May edit's paths + required outputs)

`git status --porcelain -- web/ shared/ scripts/ e2e/ package.json package-lock.json THIRD-PARTY-LICENSES.md docs/decisions.md docs/v2/state/returns/S6.1.md docs/v2/evidence/S6.1/ docs/v2/state/cards/S6.1.json`

Output (exit 0):

```
 M THIRD-PARTY-LICENSES.md
 M docs/v2/evidence/S6.1/acquisition.md
 M docs/v2/evidence/S6.1/notice-checklist.md
 M docs/v2/state/cards/S6.1.json
 M docs/v2/state/returns/S6.1.md
?? docs/v2/evidence/S6.1/V4-review-am224.md
```

Every printed path is inside the enumerated set. `git status --porcelain`
cannot print a path outside the paths it is asked about; the shared-tree clause
(`review §G`) means unrelated in-flight work elsewhere in the tree is not
reported by this row and the return file does not attribute it here. The package
source files (`web/ shared/ scripts/ e2e/ package.json package-lock.json
docs/decisions.md`) are clean — the card's changes are committed at HEAD; the
uncommitted delta is the notice candidate and this review's own new evidence
doc under `docs/v2/evidence/S6.1/`, which the row's path set explicitly
includes.

## Command 2 — no drift in May edit's source paths

`git diff --name-only -- e2e/tests/spelling.spec.ts e2e/support/ shared/src/i18n/locales.ts docs/v2/ACQUISITION.md docs/v2/CONTRACTS.md`

**Prints nothing** (exit 0).

## Command 3 — screenshots clean

`git status --porcelain -- docs/v2/evidence/P2.2/screenshots/`

**Empty** (exit 0). The AM-210 screenshot restoration stands.

## Verdict

**PASS** — nothing outside the enumerated set is reported; the second and third
commands are silently empty. The work stays uncommitted as the card requires.