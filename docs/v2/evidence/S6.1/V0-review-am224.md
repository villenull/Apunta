# S6.1 — V0 row, review run (AM-224), review attempt 1

Independent implementation review. Row V0 of the S6.1 verification table
(`docs/v2/cards/S6.1.md:502`).

- Working directory: the repository root
- Node: pinned A01 toolchain (`node --version` → `v24.19.0`), exported via
  `PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH"`
- Applied source: committed HEAD `d5b0d52721e3a0a058277e6ea85b4093dbfa5eca`
  plus the uncommitted notice candidate
- Review attempt: 1 (AM-224)

## Commands

1. `node docs/v2/tools/check-plan.mjs`
2. `rg -n "dictionary-es-mx.*(2\.0\.0.*MPL-1\.1|MPL-1\.1.*2\.0\.0).*data only" docs/decisions.md`
   (the alternation is a bare pipe in the shell, per the card)

## Result

1. Start 2026-10-06T17:54:14Z · End 2026-10-06T17:54:14Z · **exit 0**

   ```
   Plan consistent: 71 cards, 12 parent reviews, 14 contracts.
   ```

2. Exit 0. The matched line, quoted **verbatim** from `docs/decisions.md`:

   ```
   docs/decisions.md:256: | 2026-10-04 | Spanish dictionary data (`dictionary-es-mx`
   2.0.0, exact) is used under **MPL-1.1**, elected from its
   `(GPL-3.0 OR LGPL-3.0 OR MPL-1.1)` tri-licence, data only, shipped unmodified
   in its own files | The owner's election required by L-POLICY@1's one
   pre-approved exception (AM-203); … | `docs/v2/state/S6.1-AMENDMENT-PROPOSAL-v2.md` §11, `THIRD-PARTY-LICENSES.md` |
   ```

   The line is quoted exactly as printed (its three cells have been wrapped for
   reading; the unbroken line is on record). It carries, in the same line: the
   package name (`dictionary-es-mx`), the elected arm (`MPL-1.1`), the words
   `data only`, and the version `2.0.0` — the full Stop-1 gate. The 2026-10-04
   election row is on record.

## Verdict

**PASS** — both commands exit 0; the decision line is on record and quoted
verbatim. No FAIL, no workaround; Stop 1 is clear and the row is runnable.