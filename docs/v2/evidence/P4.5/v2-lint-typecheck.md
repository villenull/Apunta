# V2 — lint and typecheck

- **Status:** PASS
- **Working directory:** repository root
- **Node:** v24.19.0
- **Start / end (UTC):** 2026-09-29T22:04:32Z / 2026-09-29T22:04:46Z
- **Exit codes:** `npm run lint` → 0; `npm run typecheck` → 0; row exit 0

## Command

```sh
export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" && npm run lint && npm run typecheck
```

## Excerpt

```
> eslint . && prettier --check . && node scripts/check-no-external-urls.mjs && node scripts/collect-licenses.mjs --check && node scripts/check-ui-strings.mjs

All matched files use Prettier code style!
THIRD-PARTY-LICENSES.md lists all 111 shipped packages.
TOTAL 0
```

`typecheck` reported no diagnostics across the workspace projects.

## The URL-literal guarantee

The outbound-URL rule applies to every `ts`, `tsx`, `js` and `mjs` file, and the
test-file exemption covers `**/*.test.{ts,tsx}` and `e2e/**/*.ts` — **not** a
`.test.mjs`. So a vendor literal in either of this card's two files would fail
here, and the fact that it did not is the proof. Every URL in the new fixtures is
derived from `speechArtifact.url` at run time, or is a relative reference, or is
on loopback. The single `https://` that the fixed probe once carried was inside
its own doc comment and has been reworded, so the only URL literals in either
file are the two pre-existing loopback ones in the test file.

## One finding, resolved inside May edit, recorded because it changed a file

An earlier V2 at 21:58:29Z exited **1**:

```
scripts/v2/probe-redirects.mjs
  313:24  error  Unexpected control character(s) in regular expression: \x00, \x1f  no-control-regex
```

`escapeMarkdownInline` first expressed Fixed decision 5's escape set as the
character class `[\u0000-\u001f\u007f`\\|]`, and `no-control-regex` rejects a
pattern naming C0. `eslint.config.js` is not in May edit, and AM-070 forbids
adding an exemption, so the set is now walked as code points instead of written
as a pattern: `code < 0x20 || code === 0x7f || MARKDOWN_ESCAPED_CODE_POINTS.has(code)`.
The escaped set is identical — U+0000–U+001F, U+007F, U+0060, U+005C, U+007C —
and the two spellings of "C0" cannot drift, because one of them *is* the
comparison. Equivalence was checked directly against the pattern form over a
string carrying NUL, TAB, U+001F, DEL, a backtick, a backslash, a pipe, an
asterisk and an astral character: the two produce byte-identical output, the
astral character passing through untouched in both.

No rule was disabled, no exemption added, no threshold moved. Every V2 run
after that change exited 0 (21:59:19Z, 22:00:50Z and this one), and the two
earlier V1/V2 pairs are superseded by the final ordered run recorded here and in
`v1-suite.md`.
