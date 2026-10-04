# Return note — P3.6 attempt 6 (CODE/UNIT), the two AM-209 shutdown exemptions

Append-only: written once, at the end of this attempt, and not rewritten by a
later session. A later attempt appends its own note rather than editing this one.

## Status

Both HIGH findings `docs/v2/state/reviews/P3.6-impl5-source.md` records — and
nothing else — are repaired in `scripts/v2/tauri-e2e-smoke.test.mjs`, each
proved by synthetic helper tests run against the harness's own exported
helpers, including a mutation check that reverts each exemption and asserts the
healthy end state fails without it. **No row was run**, so the card's rows
(V0–V5) are untouched and V3 remains unproven. Per AM-209 the next steps are
the coordinator's: a fresh independent source review of this candidate, then
V0 once, then native V3. Nothing outside this card's two paths changed, and
nothing was staged, committed or pushed.

## Files changed

- `scripts/v2/tauri-e2e-smoke.test.mjs` — 3628 → 3638 lines, sha256
  `1d4bbf88bbc3977cbc0a2c26b9f5415bcdcdb629de45ebb9b9ff53d96724c6c3`.
- `docs/v2/evidence/P3.6/attempt-6/implementation/**` — this directory:
  `00-readme.md`, `01-scoped-checks.txt`, `02-helper-tests.txt`,
  `03-file-hashes.txt`, `helper-tests.mjs`, `04-return-note.md`.

Not touched: the frozen V0 evidence, `src-tauri/target/**`, the test AppImage,
`docs/v2/cards/P3.6.json`, `docs/v2/state/**`, every attempt-1..5 history, and
every `server/**`, `shared/**`, `web/**` and `e2e/**` file — other workers
have those in flight (the S6.1 spelling lane among them) and this attempt left
them alone.

## Change 1 — `ownershipIdentityDiff`'s `lost` path no longer fails the WAL pair's shutdown deletion

`tauri-e2e-smoke.test.mjs:1759-1766`. The disappearance branch was:

```js
if (before.name === 'apunta.lock') released.push(before.name);
else lost.push(before.name);
```

It is now:

```js
if (before.name === 'apunta.lock') released.push(before.name);
else if (before.asserted) lost.push(before.name);
```

`apunta.db-wal` and `apunta.db-shm` are deleted by SQLite on close in WAL
mode, which the server's own `onClose` hook causes on every graceful shutdown —
so their absence at the end is the shutdown working, not a loss. The branch
now consults `before.asserted` (the snapshot's own volatile marker, derived
from `VOLATILE_OWNED`, which is the volatile subset of `ownershipFiles()`), so
the code matches the doc comment that was already above it: "`lost`: an
**asserted** file that was in the baseline and is gone at the end and is
**not** the lock." The lock's existing C-OWN@1 rule 5 release handling is
untouched, and no file name is written as a literal in the new code — the
exempt names come from `ownershipFiles()`/`VOLATILE_OWNED` and the existing
lock-release branch, as AM-209 requires.

Still failing, on their own unchanged paths: a replaced file (new dev+inode —
`replaced`), a file appearing under an owned name (`appearedOwned`), a foreign
lock holder or a changed nonce (`lockHolderCheck`, a separate check), and
`apunta.db` itself disappearing (`lost: ['apunta.db']`).

## Change 2 — `vanished` exempts exactly the graceful-shutdown disappearances

`tauri-e2e-smoke.test.mjs:1944-1963`. `ownershipContainment` now computes

```js
const gracefulGone = new Set([...VOLATILE_OWNED, owned[0]]);
```

— the WAL pair (`VOLATILE_OWNED`) and the lock (the first of the four C-OWN@1
files, per `ownershipFiles()`), no literals — and filters it out of `vanished`:

```js
vanished: baseline.filter((name) => !after.includes(name) && !gracefulGone.has(name)),
```

Exactly those two disappearances and nothing else: `apunta.db` or any other
baseline entry vanishing still fails the check "smoke the data folder was not
emptied behind the baseline". `secondOwned`, `otherNew` and `owned` are
byte-identical, and the doc comment above the function now states the exemption
it implements.

## Tests

`docs/v2/evidence/P3.6/attempt-6/implementation/helper-tests.mjs` — attempt
5's 53 tests carried over unchanged (they carry attempt 4's and attempt 3's),
plus 4 new AM-209 tests at the end, **57/57 passed, exit 0**:

- a healthy shutdown end state (lock gone, `-wal`/`-shm` gone, the database the
  same inode, `backups/` new) **passes both checks** — the end state that
  failed every healthy run in attempts 3–5;
- `apunta.db` vanished **fails both checks**;
- any other baseline entry vanishing **fails the containment check**, with the
  graceful-shutdown disappearances still exempt in the same end state;
- a **mutation check**: each exemption is reverted in a copy of the harness
  (attempt 5's code) and the healthy end state is asserted to **fail** against
  the mutated copy — the exemptions are narrow and the tests pin them.

One carried-over test was edited, and its comment records why: the F7 test
"the check is no weaker for the four names" had a second half asserting that a
vanished baseline `apunta.lock` is a failure — exactly the behavior AM-209
changes. That half now lets `apunta.db` vanish instead and still expects a
failure. The harness's own F7 check is untouched.

## Commands and exit codes (pinned Node v24.19.0)

```
export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH"
node --check scripts/v2/tauri-e2e-smoke.test.mjs                        # exit 0
npx eslint scripts/v2/tauri-e2e-smoke.test.mjs                           # exit 0
npx prettier --check scripts/v2/tauri-e2e-smoke.test.mjs                 # exit 0
node --check docs/v2/evidence/P3.6/attempt-6/implementation/helper-tests.mjs  # exit 0
node docs/v2/evidence/P3.6/attempt-6/implementation/helper-tests.mjs    # 57/57, exit 0
```

Full outputs: `01-scoped-checks.txt`, `02-helper-tests.txt`. Hashes and line
counts against the attempt-5 candidate: `03-file-hashes.txt`.

## Harness sha256

`1d4bbf88bbc3977cbc0a2c26b9f5415bcdcdb629de45ebb9b9ff53d96724c6c3` —
3638 lines, verified after the final edit and after all five commands above.
