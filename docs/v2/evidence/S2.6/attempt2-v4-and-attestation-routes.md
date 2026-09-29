# S2.6, attempt 2: V4, V8–V11

Base `85c3fd2`. Node v24.19.0 (`~/.local/share/mise/installs/node/24.19.0/bin`).
No sandbox needed: none of these start a server or open a database.

## V4 — the L1 gate (PASS, exit 0, final tree state)

```
cwd: repo root
npm run build:shared && npx vitest run web/src && npm run lint && npm run typecheck
2026-09-29T15:49:05Z -> 2026-09-29T15:49:27Z   exit 0
```

- `build:shared` — exit 0.
- `npx vitest run web/src` — 49 files, **516 passed**, 0 failed.
- `npm run lint` — exit 0: eslint clean; `All matched files use Prettier code
  style!`; `THIRD-PARTY-LICENSES.md lists all 111 shipped packages.`;
  `check-ui-strings` `TOTAL 0`.
- `npm run typecheck` — exit 0 across `@apunta/shared`, `@apunta/server`,
  `@apunta/installer`, `@apunta/web`, `@apunta/e2e`.

Run after the V17 scratch copies were restored, so this is the state that is
being handed back. An earlier run of the same command during the attempt was
also exit 0, so neither the repair nor its restoration moved the gate.

**No repository-wide gate failed at any point in this attempt, so no
out-of-scope interference with P3.1's file list was recorded.** One P3.1 file,
`scripts/v2/package-linux-resources.test.sh`, is modified in the working tree
by that agent's own in-flight work; it was not read, staged, reverted or
formatted here, and it is not in `git diff` output for this card.

## V8, V9, V10, V11 — the plan attestation routes (PASS, exit 0)

The four rows are named cases in `server/src/routes/plans.test.ts`,
`the attestation is written in the language stored at activation`:
`V8: stores ATTESTATION_TEXT byte for byte, with no language row and with an
explicit English one`, the Spanish case below it, `V10: leaves the first
attestation alone, refuses re-activation, and writes the new one in the
language stored then`, and `V11: reads a pre-existing English attestation
under a Spanish setting, unchanged and untranslated`.

```
npx vitest run server/src/routes/plans.test.ts shared/src/i18n/t.test.ts
2026-09-29T15:44:17Z   exit 0   2 files, 56 tests
```

`shared/src/i18n/t.test.ts` is in the same command because the AM-059
`plan.attestationStatement` key is pinned there, byte for byte against
`ATTESTATION_TEXT` and against the owner's approved Spanish wording.

## V12, V13, V14 — browser

Not vitest. Recorded in `attempt2-v1-bilingual-e2e.md`, where the Spanish
project's plan flow, the English project's plan flow, and the matcher
attribution case are each named with the run they passed in.

## V5, V6, V7 — inherited, not repeated

AM-062 says not to repeat V5's deliberate scratch catalogue mutation, and the
card JSON records all three PASS at attempt 1/2:

| Row | Prior evidence | Note |
| --- | --- | --- |
| V5 | `docs/v2/evidence/S2.6/V5-oracle-can-fail.md` | the per-form oracle fails on a wrong `{name}`; `perFormMismatches` is unchanged by this attempt, so the result still holds |
| V6 | `docs/v2/evidence/S2.6/V6-per-form-parity.md` | no per-form mismatch remains; re-confirmed incidentally by the 25/25 `t.test.ts` runs here |
| V7 | `docs/v2/evidence/S2.6/V7-accent-low-contrast.md` | the accent warning behaviour, untouched by this card's three files |

Honest limits on the inheritance: V5 and V6 are vitest runs over
`shared/src/i18n/t.test.ts`, and this attempt **did** re-run that file (25/25,
exit 0) after adding a case to it, so their subject was exercised again even
though V5's mutation was not repeated. V7 is a browser row about the accent
picker; it is cited from the prior attempt and was not re-run here. Its
screenshots under `docs/v2/evidence/P2.2/screenshots/` were rewritten as a side
effect of the V1 e2e line; see the note in `attempt2-v1-bilingual-e2e.md`.
