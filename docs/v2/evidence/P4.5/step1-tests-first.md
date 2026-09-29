# Step 1 — the eleven new cases against the unmodified probe

The card's Step 1 requires the new cases to be written first and to be recorded
failing on the probe as it stands at the base commit, each for the reason its
row names rather than for a shared reason like an import error. This is that
record. It is **not** V3: the entry-point guard is still intact here, so nothing
in this run wrote the evidence file.

- **Working directory:** repository root
- **Node:** v24.19.0
- **Start / end (UTC):** 2026-09-29T21:57:56Z / 2026-09-29T21:57:56Z
- **Exit code:** 1 (expected — this run is supposed to fail)

## Command

```sh
export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH"
b=<sandbox>/p4.5-testsfirst
rm -rf $b; mkdir -p $b
cp scripts/v2/probe-redirects.mjs $b/probe-fixed.mjs
sha256sum scripts/v2/probe-redirects.mjs docs/v2/evidence/P4.1/redirects.md > $b/before.sha
trap 'cp $b/probe-fixed.mjs scripts/v2/probe-redirects.mjs; sha256sum -c $b/before.sha' EXIT INT TERM
git show 6bfdcac:scripts/v2/probe-redirects.mjs > scripts/v2/probe-redirects.mjs
[ -s scripts/v2/probe-redirects.mjs ] || { echo "TRAP: empty control"; exit 2; }
node --test scripts/v2/probe-redirects.test.mjs
cp $b/probe-fixed.mjs scripts/v2/probe-redirects.mjs
sha256sum -c $b/before.sha
trap - EXIT INT TERM
git diff --name-only
```

The same `trap`/restore shape as V3, minus the mutation: the base probe is put
on disk, the new suite runs against it, and the fixed probe is put back and
proved with a checksum that can fail. Both `sha256sum -c` lines printed `OK`.

## Excerpt

```
ℹ tests 29
ℹ pass 22
ℹ fail 7
```

Seven of the eleven new cases fail, each for its own reason:

| Case | First assertion to fail on the unmodified probe |
| --- | --- |
| 1, the write precondition refuses in an import context | `typeof probe.assertMayWriteEvidence` is `undefined`, not `function` |
| 4, a fragment is redacted and never pasted | a fragment token reached the record |
| 5, a fragment that looks like a query is redacted whole | a fragment token reached the record |
| 6, user-info is redacted and the host still reads | a user name reached the record |
| 8, a name decoding to a markdown-active character is escaped | `probe.escapeMarkdownInline is not a function` |
| 9, the refusal message and the redacted line escape what they quote | the record's code spans read `[…, '', '|']` instead of the escaped name |
| 11, the unparseable branch's raw line escapes what it quotes | a raw carriage return reached the record |

Four of the eleven pass here, and that is the honest shape of this run rather
than a gap in it — V3's Expected cell says the same about cases 3, 7 and 10:

- **case 3** restates the case the file already had, and today's rule already
  does it;
- **case 7** is Fixed decision 6's deliberate no-path-redaction pin, and the base
  probe writes a path verbatim, which is the point;
- **case 10** passes because today's rule already truncates at a `?` that comes
  first. Its real target is the *over-broad* `#`-first rule, which this base does
  not have;
- **case 2** passes here and fails under V3. That is the whole of DEF-2: with
  the entry-point guard intact, an import writes nothing, so the bytes are
  unchanged; the guard is the thing being regressed, and case 2 is the thing that
  notices. V3 is where case 2 earns its place.

All eighteen pre-existing cases passed in this run. None was edited, deleted or
skipped to make room for the new ones.
