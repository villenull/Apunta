# P3.6 attempt 6 — CODE/UNIT implementation evidence

The sixth and final attempt, bounded by **AM-209** to exactly the two HIGH
findings of `docs/v2/state/reviews/P3.6-impl5-source.md`. One source file
changed and one evidence directory was added. No card field, verification row,
Expected cell, threshold, dependency or scope was touched; F1–F5, attempt 5's
D1/D2 and every D1–D6 / R1–R7 repair from the earlier reviews are intact; the
frozen V0 evidence, the test AppImage and the attempt-1..5 histories are
unmodified; nothing was staged, committed or pushed.

| File | What it is |
| --- | --- |
| `01-scoped-checks.txt` | `node --check`, `npx eslint`, `npx prettier --check` on the harness and `node --check` on the test file — all exit 0, under the pinned Node v24.19.0 |
| `02-helper-tests.txt` | the full helper-test run: **57/57 passed, exit 0** |
| `03-file-hashes.txt` | sha256 and line counts of the harness and the test file, against the attempt-5 candidate |
| `04-return-note.md` | the append-only return note |
| `helper-tests.mjs` | the tests; `node helper-tests.mjs` runs them |

## The one source file changed

`scripts/v2/tauri-e2e-smoke.test.mjs`, 3628 → 3638 lines, sha256
`1d4bbf88bbc3977cbc0a2c26b9f5415bcdcdb629de45ebb9b9ff53d96724c6c3`
(attempt 5's candidate was `1b1e151b…33b24`). The diff is exactly two changes,
both inside the ownership helpers AM-207 added:

1. **`ownershipIdentityDiff`'s disappearance path** (`tauri-e2e-smoke.test.mjs:1759-1766`):
   the WAL pair (`apunta.db-wal`, `apunta.db-shm`) no longer lands in `lost`
   when absent at the end — SQLite deletes both on close in WAL mode, which is
   what a graceful shutdown does. The branch now checks `before.asserted`
   before `lost`, so the code matches the doc comment that was already above it
   ("`lost`: an **asserted** file that was in the baseline and is gone at the
   end and is **not** the lock"). The lock's existing C-OWN@1 rule 5 release
   handling is untouched. `apunta.db` disappearing still fails, as do a
   replaced file (new dev+inode), a name appearing under an owned name, a
   foreign lock holder and a changed nonce — all on their own, unchanged paths.
2. **`ownershipContainment`'s `vanished`** (`tauri-e2e-smoke.test.mjs:1944-1963`):
   exempts exactly the same graceful-shutdown disappearances — the lock (the
   first of the four C-OWN@1 files, per `ownershipFiles()`) and the WAL pair
   (`VOLATILE_OWNED`) — and nothing else. `apunta.db` or any other baseline
   entry vanishing still fails. `secondOwned`, `otherNew` and `owned` are
   byte-identical.

Nothing else in the checkout was created, edited or deleted by this attempt:
no `src-tauri/**`, no `web/**`, no `server/**`, no `shared/**`, no
`package.json`, no sibling script, no capability, no `invoke_handler`, no hook,
no new dependency, no global ignore, no suppression comment.
`docs/v2/state/**` and `docs/v2/cards/**` were read and not written. The
working tree carries other workers' in-flight `server/**`, `shared/**`,
`web/**`, `e2e/**` and card changes (the S6.1 spelling lane among them); per
CLAUDE.md and AM-209 those were left alone.

## What was proved, and how

- **Both changes** — 4 new tests at the end of `helper-tests.mjs`, same style
  as the D2 tests: real files in a throwaway folder, the harness's own exported
  helpers, both directions asserted.
  - a healthy shutdown end state (lock gone, `-wal`/`-shm` gone, the database
    the same inode, `backups/` new) **passes both checks**;
  - `apunta.db` vanished **fails both checks** (`lost: ['apunta.db']`, and
    `vanished` names it);
  - any other baseline entry vanishing **fails the containment check**, while
    the graceful-shutdown disappearances stay exempt in the same end state;
  - a **mutation check** reverts each exemption in a copy of the harness
    (attempt 5's code) and asserts the healthy end state **fails** against the
    mutated copy — so the exemptions are proved narrow and the tests are proved
    to pin them.
- **The earlier repairs** — attempt 5's 53 tests were carried over unchanged and
  still pass, with one exception: the F7 test "the check is no weaker for the
  four names" had a second half asserting that a vanished baseline
  `apunta.lock` is a failure. That is exactly the behavior AM-209 changes (the
  lock's clean release is exempt on this path now, as it already was on the
  identity path), so that half now lets `apunta.db` vanish instead and still
  expects a failure. The harness's own F7 check is untouched — `secondOwned`,
  `otherNew` and `owned` are byte-identical; only `vanished` changed, which is
  change 2. The test's comment records why it was edited.
- **No row was run.** V0 and native V3 remain for the coordinator, per
  AM-209's order (fresh independent source review CLEAR, then V0 once, then
  native V3). This attempt ran no harness, launched no AppImage, bound no
  port and read no audio device.
