# S2.5 implementation review, attempt 2 — row V2 (reviewer's own run)

Reviewer run. Not the implementer's file.

- Working directory: repository root
- Tree: `feature/v2`, clean (see `review-a2-head-discrepancy.md`)
- Start: 2026-09-26T20:14:23Z  End: 2026-09-26T20:14:35Z
- Node: `v24.19.0`, printed by the row

## Command, exactly as the row writes it

```sh
export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" && node --version && npm run lint && npm run typecheck
```

## Exit codes observed

| Step | Exit |
| --- | --- |
| `npm run lint` | **0** |
| `npm run typecheck` | **0** |

## `npm run lint` — full tail

```
> apunta@0.0.0 lint
> eslint . && prettier --check . && node scripts/check-no-external-urls.mjs && node scripts/collect-licenses.mjs --check && node scripts/check-ui-strings.mjs

Checking formatting...
All matched files use Prettier code style!
THIRD-PARTY-LICENSES.md lists all 111 shipped packages.
TOTAL 0
```

`TOTAL 0` is `scripts/check-ui-strings.mjs`, the step the row names explicitly:
this card adds no web literal, so a non-zero total would mean the card wrote a
user-visible string somewhere it may not. It is `TOTAL 0`.

`node scripts/check-no-external-urls.mjs` also passed inside the chain, which is
HS-6's runtime-egress guard stated as a check rather than as a claim.

## `npm run typecheck` — full tail

```
> tsc -p tsconfig.typecheck.json

> @apunta/web@0.0.0 typecheck
> tsc -p tsconfig.json

> @apunta/e2e@0.0.0 typecheck
> tsc -p tsconfig.json
```

No diagnostics. The row is right that this is where the **type-level** half of
the catalogue invariant lives, and the reviewer confirmed independently that it
is not a vacuous pass: `es-MX.ts`'s `satisfies Record<MessageKey, Message>` is
load-bearing for this card, and the reviewer separately counted the two
catalogues' key sets (718 each, zero keys on one side only — see
`review-a2-english-parity.md`). A key added to `en` and forgotten in `es-MX`
would have failed this step.

**Row V2: PASS, exit code 0.**
