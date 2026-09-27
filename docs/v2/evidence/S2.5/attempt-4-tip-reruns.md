# S2.5 attempt 4 — the four rows re-run at the final tip

The rows were first run at **`bc7528e`**, the only commit that changes anything
they run against (`attempt-4-v1.md` … `attempt-4-v4.md`). While the evidence was
being written, two other agents committed on top of it — `c136b8d` (two
Markdown files, AM-050) and `98b1870` (four `web/` files) — so all four rows
were **re-run at the final tip** to remove any doubt about which tree produced
them.

- Final tip when these ran: **`bea4b40`**
- `git merge-base --is-ancestor bc7528e HEAD` → true
- `git diff --name-only bc7528e HEAD -- server shared` → **empty**, so the code
  under test is byte-identical to the commit the first runs used
- Working directory: repository root (`<sandbox>/Apunta`)
- Node: `v24.19.0`, exported first as each row writes
- Working tree: **clean** — the other agent's `web/` work is committed, not dirty
- Every command below is character-for-character the row's own command, with
  `--reporter=verbose` omitted from V1 (it changes no collection) and no other
  change

| ID | Start | End | Exit | Result |
| --- | --- | --- | --- | --- |
| V1 | 18:39:03-06:00 | 18:39:05-06:00 | `build:shared` **0**, `vitest` **0** | `Test Files 9 passed (9)` / `Tests 142 passed (142)`, 0 skipped — identical to the `bc7528e` run |
| V2 | 18:39:08-06:00 | 18:39:20-06:00 | `lint` **0**, `typecheck` **0** | `All matched files use Prettier code style!` / `THIRD-PARTY-LICENSES.md lists all 111 shipped packages.` / `TOTAL 0` |
| V3 | 18:39:20-06:00 | 18:39:24-06:00 | **0** | `Test Files 92 passed (92)` / `Tests 1349 passed (1349)`, 0 skipped — identical to the `bc7528e` run |
| V4 | 18:39:27-06:00 | 18:39:28-06:00 | perturbed **1**, row **0** | `AssertionError: errors.language_unavailable in es-MX: expected [ 'detail' ] to deeply equal []` / `Tests 1 failed \| 20 passed (21)`; `es-MX.ts` restored, `git diff --quiet` **0**, tree clean afterwards |

## What this does and does not establish

Every figure reproduces exactly, so the tip's two intervening commits — one
docs, one `web/` — changed nothing this card owns or witnesses. V2 is the only
row that reads outside `server/` and `shared/`: `eslint .`,
`prettier --check .`, `check-no-external-urls.mjs`, `collect-licenses.mjs --check`
and `check-ui-strings.mjs` all reach `web/`, and all five are green at the tip
with the other agent's four `web/` files **committed**. `TOTAL 0` therefore
holds at the tip and not only at `bc7528e`.

No row launched a server, opened the live data folder or contacted **7717**. The
only socket is V3's own `real-socket-guard.test.ts:27` on **7812**; the only
databases are the tests' own `mkdtempSync` temp directories. The card's
assigned port 7839 stays unused and no browser was launched (HS-1, HS-2).

## Files touched by these re-runs

None. All four rows are read-only with respect to the checkout except V4's
single `sed`, which its own command reverts in the same row; `git status
--porcelain` is empty after it.
