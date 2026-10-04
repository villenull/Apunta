# P3.6 attempt 5 — CODE/UNIT implementation evidence

The fifth attempt, bounded by **AM-207** to exactly two defects — D1 and D2 of
`docs/v2/state/reviews/P3.6-impl4-source.md`. One source file changed and one
evidence directory was added. No card field, verification row, Expected cell,
threshold, dependency or scope was touched; F1–F5 and every D1–D6 / R1–R7 repair
from the earlier reviews are intact; the frozen V0 evidence, the test AppImage and
the attempt-1..4 histories are unmodified; nothing was staged, committed or
pushed.

| File | What it is |
| --- | --- |
| `01-scoped-checks.txt` | `node --check`, `npx eslint`, `npx prettier --check` on the harness and `node --check` on the test file — all exit 0, under the pinned Node v24.19.0 |
| `02-helper-tests.txt` | the full helper-test run: **53/53 passed, exit 0** |
| `03-file-hashes.txt` | sha256 and line counts of the harness and the test file, against the attempt-4 candidate |
| `04-defect-repair-map.md` | D1 and D2 against the code that now answers each, with the full `file:line` render path and the falsifiability table |
| `helper-tests.mjs` | the tests; `node helper-tests.mjs` runs them |
| `05-return-note.md` | the append-only return note |

## The one source file changed

`scripts/v2/tauri-e2e-smoke.test.mjs`, 3174 → 3628 lines, sha256
`1b1e151b87c96e26fd5bc866392bbeff7ba3f9a8f568b1df50f97faed2339b24`
(attempt 4's candidate was `9637b7da…452e9c`). Nothing else in the checkout was
created, edited or deleted by this attempt: no `src-tauri/**`, no `web/**`, no
`server/**`, no `shared/**`, no `package.json`, no sibling script, no capability,
no `invoke_handler`, no hook, no new dependency, no global ignore, no
suppression comment. `docs/v2/state/**` and `docs/v2/cards/**` were read and not
written. The working tree carries other workers' in-flight `server/**`,
`shared/**`, `web/**` and card changes; per CLAUDE.md those were left alone.

## D1 in one line

The settings modal is now confirmed by **`doc.settings` = `Settings`**, its own
nav title at `web/src/routes/Settings.tsx:168`, because it sits in the `<nav>` —
outside `SettingsSections`, outside every section gate — and no component on the
path from the modal root to it has an early return except `Workspace`'s two
whole-app guards, both declared with the reason they cannot fire. The label it
replaces was inside `LlmProfileSettings`, which returns `null` with fewer than two
LLM profiles and the server publishes exactly one. The proof is the render path
(11 hops, 11 gates) and the per-body set of own-indent statements, both compared
for **equality** against the tree — not a count of lines carrying `t('key')`.
Full table: `04-defect-repair-map.md`.

## D2 in one line

The ownership containment is falsifiable for the four C-OWN@1 files two ways:
their **device+inode** are recorded in the baseline and compared at the end, and
`apunta.lock` is read for its holder and must still be this run's server pid with
its own nonce, at the baseline and at the end of the flows. `-wal`/`-shm` are
recorded but never asserted (SQLite recreates them — a false-positive path), and
the lock's clean release is legitimate while a *different* file at that name is
not. The existing name-set check is byte-identical, `backups/` is still not a
failure, and `vanished` is still over the whole baseline.

## What was proved, and how

- **D1** — 8 new tests: the label is the string the nav renders and the other
  `doc.settings` reference is a document title; the label it replaced is
  unreachable (with the one-profile server side read from
  `server/src/ai/profiles.ts`); every hop is still in the source with its reason;
  each hop body has **exactly** the declared gates and every guard really
  returns; the label is inside the `<nav>` with every section gate outside it; no
  other visible `Settings` is mounted over the workspace.
- **D2** — 9 new tests against real files in throwaway folders: identity is
  recorded for all four and the WAL pair is marked volatile; an unchanged
  baseline plus `backups/` passes; a replaced `apunta.db` and a replaced
  `apunta.lock` fail; a SQLite-style WAL recreation passes; a clean lock release
  passes; a vanished database fails; the lock is read in rule 2's shape and an
  unreadable one is `null`; a foreign pid, a new nonce, a missing lock, a
  foreign baseline and a missing server pid each fail by name; and the harness's
  server pid and the lock's pid are the same number (shell spawns node directly).
- **A mutation check** proves the new D2 tests are not vacuous: neutering
  `ownershipIdentityDiff`'s `ok` and `lockHolderCheck`'s nonce comparison fails
  exactly three of them and exits 1. The mutation was reverted immediately and the
  hash in `03-file-hashes.txt` is of the restored file.
- attempt 4's 45 tests, including F1–F5 and F7, run unchanged in this copy.

## One pin corrected, and why it is not a repair

`UI_LABELS.onboardingPane.i18nLine` 2168 → 2170: a parallel lane (S6.1 / AM-203)
added two lines to `shared/src/i18n/en.ts` above that key. The F1 assertion is
unchanged and a further move still fails loudly. No other pin moved.

## Not run, by instruction

No V0, V1, V2, V3, V4 or V5; no build; no producer; no AppImage launch; no
Tauri; no cargo; no display; no `xdotool`; no audio device; no inference; no
model; no network; no port, 7879 included; no `git add`, commit or push.
Nothing outside this card's two paths was touched. This is offered as a
**CODE/UNIT candidate**; it claims no row and no flow, and whether OCR reads
`Settings` on a live modal, whether the keyboard path lands, whether the lock
carries the shell's printed pid at runtime and whether each click hits the
intended cluster remain **UNKNOWN** until V3 runs — which is a native run this
attempt is not permitted to do. AM-207's own order stands: an independent CLEAR
source review first, then V0 once, then native V3.