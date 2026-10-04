# P3.6 attempt 3 — CODE/UNIT implementation evidence

What attempt 3 changed, what was checked, and what was **not** run.

| File | What it is |
| --- | --- |
| `01-scoped-checks.txt` | `node --check`, `eslint`, `prettier --check` on the repaired harness — all exit 0 |
| `02-helper-tests.txt` | 20 synthetic helper tests (exit 0) plus the R5 before/after import probe |
| `03-file-hashes.txt` | sha256 and line counts of the repaired harness and the test file, against the baseline candidate |
| `04-defect-repair-map.md` | D1–D6 and R1–R7 against the code that now answers each |
| `helper-tests.mjs` | the tests themselves; `node helper-tests.mjs` runs them |

## The one source file changed

`scripts/v2/tauri-e2e-smoke.test.mjs`, 1757 → 2789 lines. No other source path was
created, edited or deleted: no `src-tauri/**`, no `web/**`, no `server/**`, no
`shared/**`, no `package.json`, no `scripts/` sibling, no capability, no
`invoke_handler`, no hook, no new dependency, no global ignore, no suppression
comment. The V0 AppImage (`e6dd3ecb…f39a`) was **not** rebuilt and **not** run —
it is frozen evidence, and the harness is outside Rule B so nothing about the
bundle moved.

## How the repairs are proved

The six defects the source review called load-bearing were answered with
behaviour a synthetic test can exercise, not with prose:

- **D5 / R4** — `exitCodeFor` is pinned for 0/1/3/4: one `NOT RUN` cannot read as
  exit 0, and all eleven named flows are recorded on an early abort.
- **D2** — the ownership baseline is a name set taken *after* the first instance
  exists; the test drives an empty folder → the app's own files → a stranger's
  directory and asserts what each one reports.
- **D4** — the bundle scan is exercised on a missing directory, a scriptless one,
  a clean one and a hooked one; the first two report `unreadable`, never "gone".
- **D6** — the freshness predicate is run against **real** `git` (read-only) over
  Rule B's set, plus a real source walk; the base is the literal `62abb28` copied
  from the dispatch header.
- **R1** — cluster selection on one, two-comparable, none and one-dominant
  screens.
- **R2 / D1** — label matching on synthetic OCR word lists: `Copy` never satisfies
  `Copied`, `Goal` never satisfies `Goals`, a label appearing twice is refused as
  a click target.
- **R3** — `pactl` table parsing and source-output classification, including the
  `-` client column, a duplicated index, a malformed row and an unresolvable
  index.
- **R5** — importing the module runs nothing: the baseline copy of `9321861`
  exits 2 at its import-time precondition, the repaired file returns and exports
  25 helpers.

**D1 and D3** have no synthetic proof of their own kind and are stated plainly:
D1's repairs are the real UI actions and pane-only assertions in the flows, which
only V3 can exercise; D3's traps are installed before the first module is loaded
and are a runtime property. Both are recorded as **repaired, unproven**.

## Not run in this phase, by instruction

No V0, V1, V2, V3, V4 or V5; no build; no producer; no AppImage launch; no
display; no audio device; no inference; no port; no global test suite; no
typecheck. No source outside the harness. The repair is offered to the source
review as a **CODE/UNIT candidate**; it claims no row and no flow.