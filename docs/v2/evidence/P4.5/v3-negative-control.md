# V3 — the negative control

- **Status:** PASS. **A failing exit code is this row's pass.**
- **Working directory:** repository root
- **Node:** v24.19.0
- **Start / end (UTC):** 2026-09-29T22:04:51Z / 2026-09-29T22:04:52Z
- **Exit code:** 1 (the pass code; `exit 2` would have been a stop, and did not
  occur)

## Command

Run verbatim from the card's row, with the base commit filled in by the
dispatch builder:

```sh
export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH"; b=<sandbox>/p4.5-control; rm -rf $b; mkdir -p $b; cp scripts/v2/probe-redirects.mjs $b/probe-fixed.mjs; cp docs/v2/evidence/P4.1/redirects.md $b/redirects-before.md; sha256sum scripts/v2/probe-redirects.mjs docs/v2/evidence/P4.1/redirects.md > $b/before.sha; trap 'cp $b/probe-fixed.mjs scripts/v2/probe-redirects.mjs; cp $b/redirects-before.md docs/v2/evidence/P4.1/redirects.md; sha256sum -c $b/before.sha' EXIT INT TERM; if ! git show 6bfdcac:scripts/v2/probe-redirects.mjs > scripts/v2/probe-redirects.mjs; then echo "V3 TRAP: no file came back from git show of the base commit - check the dispatch's Base commit"; exit 2; fi; if [ ! -s scripts/v2/probe-redirects.mjs ]; then echo "V3 TRAP: the control probe on disk is empty - the restore above has already put both files back"; exit 2; fi; node -e "const fs=require('node:fs');const p='scripts/v2/probe-redirects.mjs';const t=fs.readFileSync(p,'utf8');const o=t.replace('if (isEntryPoint()) await main();','await main();');if(o===t){throw new Error('the control mutation did not apply')};fs.writeFileSync(p,o)"; node --test scripts/v2/probe-redirects.test.mjs; rc=$?; cp $b/probe-fixed.mjs scripts/v2/probe-redirects.mjs; cp $b/redirects-before.md docs/v2/evidence/P4.1/redirects.md; sha256sum -c $b/before.sha; trap - EXIT INT TERM; git diff --name-only; exit $rc
```

The guards after `git show` both passed: the substitution produced a non-empty
control probe, and the `node -e` mutation threw nothing, so the guarded call on
the last line was byte-exactly what it replaces. The row cannot reach its
`exit 1` by failing for an unrelated reason.

## Excerpt — the failing set

```
ℹ tests 30
ℹ pass 20
ℹ fail 10
```

Thirty rather than twenty-nine because the file-level entry is the `after()` hook
asserting the evidence bytes, which is a failure in its own right.

| Entry | Failed on the unfixed probe because |
| --- | --- |
| `importing the probe performs no request` (pre-existing) | `7 !== 0` — the mutated import made all seven `HEAD`s |
| case 1, the write precondition refuses in an import context | `assertMayWriteEvidence` does not exist on the base probe (`'undefined'` vs `'function'`) |
| case 2, the evidence file is byte-identical before and after this suite | the file **had already been overwritten** before anything noticed |
| case 4, a fragment is redacted and never pasted | a fragment token reached the record |
| case 5, a fragment that looks like a query is redacted whole | a fragment token reached the record |
| case 6, user-info is redacted and the host still reads | a user name reached the record |
| case 8, a name decoding to a markdown-active character is escaped | `escapeMarkdownInline is not a function` |
| case 9, the refusal message and the redacted line escape what they quote | the code spans read `[…, '', '|']` instead of the escaped name |
| case 11, the unparseable branch's raw line escapes what it quotes | a raw carriage return reached the record |
| the `after()` hook (file-level) | `the evidence file was overwritten while this suite ran` |

Cases 3, 7 and 10 passed, which is what the row says they should do: case 3 is
the file's own case, case 7 is the deliberate no-path-redaction pin, and case 10
passes because today's rule already truncates at a `?` that comes first — its
target is the over-broad `#`-first rule, not this base. Case 10 passing here is
the expected shape, not a gap.

The pre-existing `importing the probe performs no request` also failing is the
most direct proof DEF-2 has: it is the probe's own guard test going red, with
`7 !== 0`, because the import ran the seven requests. The row's Expected cell
lists the new cases "among the failures" and does not claim the eighteen
pre-existing cases pass, so this is not a contradiction — it is the control
working. The instruction review reached the same 9-failing/20-passing arithmetic
in advance (`state/reviews/P4.5-ir2.md`, non-blocking note 1); the tenth red is
the `after()` hook, which the review counted within its nine.

## Excerpt — the restore

```
scripts/v2/probe-redirects.mjs: OK
docs/v2/evidence/P4.1/redirects.md: OK
```

Both files restored and verified by a checksum that can fail. `git diff --name-only`
afterwards listed the two script files and one dispatch file belonging to another
agent, and **did not list `docs/v2/evidence/P4.1/redirects.md`**. Its SHA-256 is
`569ddd99…114`, byte-identical to the committed blob at `6bfdcac`, and
`git status --porcelain docs/v2/evidence/P4.1/` is empty.

The row also proved it restored the *fixed* probe rather than something else: the
two script files' SHA-256 after the row (`caae2cd1…4264` and `e07a3cdc…1352`) are
the digests V1 and V2 ran against, byte for byte.

## What is deliberately not quoted

V3's raw stderr carries the catalogue's pinned host on seven `HEAD …` lines —
those are the seven requests the regressed guard made, and they are the reason
the row exists. RUN-CONFIG §4 says evidence must carry no hostnames, so this
file quotes the per-case pass/fail lines, the counts, the assertion messages and
the checksum results, and summarises those seven lines as "seven `HEAD` lines on
stderr, one per artifact". The full output stays in the sandbox scratch folder
and is not committed.

This is a sanitisation decision about this file, **not** an answer to the open
§4 question of whether the hostname bar covers public vendor CDN names. That
ruling is the coordinator's and remains open.
