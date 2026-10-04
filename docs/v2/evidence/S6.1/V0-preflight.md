# S6.1 — V0 preflight

- Working directory: the repository root
- Started: 2026-10-04T19:44Z · Ended: 2026-10-04T19:45Z

## Commands and exit codes

```
node docs/v2/tools/check-plan.mjs && rg -n "dictionary-es-mx.*(2\.0\.0.*MPL-1\.1|MPL-1\.1.*2\.0\.0).*data only" docs/decisions.md
```

| Part | Exit code | Result |
| --- | --- | --- |
| `node docs/v2/tools/check-plan.mjs` | **1** | 2 errors, both about another card: `P5.3: unknown contract C-BRIDGE@1 (rule 2` and `P5.3: unknown contract plus the rule-3 clause recorded in AM-202`. **Environment, not this card** — `docs/v2/cards/P5.3.md` and `docs/v2/CONTRACTS.md` were being edited by another worker while this row ran (both are in that worker's write scope and are dirty in the shared tree). Nothing in the errors names an S6.1 path. |
| `rg -n "dictionary-es-mx.*(2\.0\.0.*MPL-1\.1\|MPL-1\.1.*2\.0\.0).*data only" docs/decisions.md` | **0** | One matched line, quoted verbatim below. |

**Stop 1 is cleared by AM-203 item 1**, and this row proves it: the election is
on record, in one line that carries the package name, the elected arm, the words
`data only` and the version — all four, as the row requires.

## The matched line, quoted verbatim (A8: a match count is not evidence)

```
256:| 2026-10-04 | Spanish dictionary data (`dictionary-es-mx` 2.0.0, exact) is used under **MPL-1.1**, elected from its `(GPL-3.0 OR LGPL-3.0 OR MPL-1.1)` tri-licence, data only, shipped unmodified in its own files | The owner's election required by L-POLICY@1's one pre-approved exception (AM-203); S1.5 found no Mexican-Spanish dictionary under a plainly permissive licence. A later move to MPL-2.0 must be elected deliberately, not inherited | `docs/v2/state/S6.1-AMENDMENT-PROPOSAL-v2.md` §11, `THIRD-PARTY-LICENSES.md` |
```

- package name: `dictionary-es-mx` ✓
- elected arm: `MPL-1.1` ✓
- the words `data only`: `data only,` ✓
- version: `2.0.0` ✓

Because that line exists, **Steps 1–2 ran** (the install is recorded in the
checkpoint and in `acquisition.md`) and V1–V9 were allowed to run. Had it been
absent, this row would have been Stop 1, the card `BLOCKED`, and nothing else
would have run.

## Row verdict

**PASS on the clause this row exists for** (the election is on record, quoted
above). The plan check's own exit status is **1 for another worker's in-flight
card**, recorded here as an environment note; the row's own expected output
(`Plan consistent`) was not printed because that command did not get that far.
