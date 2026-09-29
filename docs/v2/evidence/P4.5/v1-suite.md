# V1 — the 29-case offline suite

- **Status:** PASS
- **Working directory:** repository root
- **Node:** v24.19.0
- **Start / end (UTC):** 2026-09-29T22:04:23Z / 2026-09-29T22:04:24Z
- **Exit code:** 0

## Command

```sh
export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" && npm run build:shared && npm run build --workspace @apunta/installer && node --test scripts/v2/probe-redirects.test.mjs
```

The two files this row ran against, so a reviewer can prove the three rows
were run against the same bytes:

```
caae2cd1…4264  scripts/v2/probe-redirects.mjs
e07a3cdc…1352  scripts/v2/probe-redirects.test.mjs
```

Both builds exited 0 (`tsc -p tsconfig.json` in `@apunta/shared` and in
`@apunta/installer`). They are part of the row rather than decoration: the probe
imports `installer/dist/catalog.js` at module load, and `dist/` is gitignored and
absent on a clean checkout.

## Excerpt

```
ℹ tests 29
ℹ pass 29
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

**Exactly 29, 0 failing** — the 18 cases already in the file plus the eleven below.
At this card's base the file reports 18, so 18 would have meant the new cases
were never written or never collected.

The eleven new case names, all passing, in file order:

1. `the write precondition refuses in an import context`
2. `the evidence file is byte-identical before and after this suite`
3. `a query is redacted and a query-less Location is left alone`
4. `a fragment is redacted and never pasted`
5. `a fragment that looks like a query is redacted whole`
6. `user-info is redacted and the host still reads`
7. `a path segment is written as observed, deliberately`
8. `a name decoding to a markdown-active character is escaped, never dropped`
9. `the refusal message and the redacted line escape what they quote`
10. `a query then a fragment redacts at the `?`, and the query value never lands`
11. `the unparseable branch's raw line escapes what it quotes`

Case 3 restates the case at the head of the file rather than replacing it, so a
count of 29 is 18 pre-existing plus 11 new with nothing folded together. All
eighteen pre-existing cases pass unchanged, including the two the card names:
`the parseable malformed-name Location is described, with exactly two verdicts`
(whose `the offending name must be visible` assertion still holds, because case
9 escapes the name at the display site only and the membership test and
`describeLocation().queryKeys` still see it decoded) and `redactQuery replaces a
value and leaves a queryless string alone`.

## No network request

`globalThis.fetch` is replaced with a thrower before the dynamic import, so any
request at all fails the first case; the import itself requested nothing
(`fetchCalls === 0`) and the eleven cases all render through the pure
`describeLocation` / `renderArtifact` path.
