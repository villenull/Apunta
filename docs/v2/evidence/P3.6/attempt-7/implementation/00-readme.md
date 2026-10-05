# P3.6 attempt 7 — implementation evidence (CODE/UNIT only, AM-212)

| Field | Value |
| --- | --- |
| Card | P3.6 Linux AppImage integration, attempt 7 under **AM-212** |
| Role | **CODE/UNIT repair worker.** No native harness run, no AppImage, no Tauri, no `cargo`, no build, no display launch, no `pactl`, no audio, no inference, no network, no port 7717, no V0, no V3, no commit, no push, no `git add` |
| Authority | exactly **A1, A2, A3** of `docs/v2/state/AMENDMENTS.md` (AM-212), from `docs/v2/state/returns/P3.6-attempt6-runtime.md` |
| HEAD at the start and at the end | `5033cd92d169351fec94a0d0a5f2057c7ee7dca6` (unchanged; nothing staged) |
| Node | `v24.19.0` (pinned, `$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin`) |
| Files written | `scripts/v2/tauri-e2e-smoke.test.mjs` (A1, A2), `docs/v2/cards/P3.6.md` **V3 row's command only** (A3), this folder |
| Harness sha256 after this pass | `ddd3c03eba1f0d97393937a1b7b3a957f61113ffb79c65366f8db2fb048ea0e2` |
| Files in this folder | `01-scoped-checks.txt`, `02-helper-tests.txt`, `03-imagemagick-probe.txt`, `04-v3-command-diff.txt`, `05-file-hashes.txt`, `helper-tests.mjs`, `06-return-note.md` |

## What was repaired, in one line each

- **A1** — `measureFrameClient` parsed `compare -metric AE`'s stderr with
  `Number(stderr.trim())`. ImageMagick 7.1.2-31 on this machine prints
  `0 (0)` for a perfect match, so `Number('0 (0)')` is `NaN`, the measurement
  returned `null` **for any build**, and all eleven flows were `NOT RUN`.
  `parseCompareMetric` now accepts the forms the tool actually prints (a bare
  integer, `N (normalized)`, and a scientific-notation first number), does not
  require an integer — this build's `AE` is a float — and still returns `null`
  for anything else, which is what stops the run.
- **A2** — the history arm compared Rule B's set against the dispatch header's
  literal `62abb28`, so 49 Rule B inputs committed after the dispatch made the
  row red on a bundle V0 had built from the very tree under test. It now
  compares against **the commit the AppImage was built from**, resolved by
  `resolveBuildCommit` from the artefact's own mtime
  (`git log -1 --before=<mtime>` + an ancestry check) — an input V0 already
  produces, with no sidecar file, no env var and no edit to V0's or V3's command.
  An unknown build commit fails closed and is never replaced by the dispatch base.
- **A3** — the card's V3 command ran `xvfb-run -a` with no screen size, which
  pre-empts the harness's own `1400x1000` re-exec (`ensureDisplay`) and handed
  the run a 640x480 display. The command now passes
  `-s "-screen 0 1400x1000x24"`, the exact geometry the harness's re-exec uses.

## Reading order

1. `01-scoped-checks.txt` — `node --check`, `prettier --check`, `eslint` on
   everything this pass wrote, with exit codes.
2. `03-imagemagick-probe.txt` — the installed tool's **real** output and the
   shipped documentation beside it, on four synthetic 8x8 PNGs in
   `build/p36-a7/` (scratch, gitignored, not a build output).
3. `04-v3-command-diff.txt` — A3's before/after, both decoded commands, their
   sha256s, and the corroboration that the "before" decode is byte-identical to
   the attempt-6 runtime worker's own decode of the same row.
4. `02-helper-tests.txt` — attempt 7's helper tests and attempt 6's unchanged
   copy, run back to back on this tree.
5. `helper-tests.mjs` — the tests themselves (attempt 6's file carried forward,
   plus this attempt's A1–A3 cases).
6. `05-file-hashes.txt` — hashes, numstat and line anchors.
7. `06-return-note.md` — what a fresh session needs to know, including the two
   items that need the coordinator.

## The seven failures in `02-helper-tests.txt` are not this pass's

`F1`, `F2`, `F3`, `F4/F5`, `F6/D1` (two of them) and "every grounded label in the
harness exists in `en.ts`" fail **identically on attempt 6's untouched copy**,
run on the same tree in the same file. They locate each label by **line number**
in `shared/src/i18n/en.ts`, and a parallel worker's in-flight edit to that file
(10 added lines, uncommitted at the time) moved every one of them: `'plan.title'`
is at `:1845` where the test expects `:1233`, `'patients.identifierLabel'` at
`:2180` where it expects `:1298`, and so on. This is the card's Stop 7 — a red
check in a file outside May edit is not this card's row, and the fix belongs to
whoever owns `shared/src/i18n/en.ts`. Attempt 6 reports 50/57; attempt 7 reports
65/72 — **the same 57 tests plus 15 new ones (5 for A1, 9 for A2, 1 for A3),
and all 15 of the new ones pass.**