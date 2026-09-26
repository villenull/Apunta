# V2 — the favicon and the `--brand-mark` pair

Working directory: repository root. The command exactly as the card's row writes
it. No Node needed: `cmp` and two `grep -cE | grep -qx 1` pipelines.

Start 2026-09-26T10:30:16Z, end 10:30:16Z. Exit **0**.

```
cmp web/public/favicon.svg docs/v2/assets/favicon.svg \
  && grep -cE '^\s*--brand-mark:\s*#1f6f63;' web/src/styles/tokens.css | grep -qx 1 \
  && grep -cE '^\s*--brand-mark:\s*#ffffff;' web/src/styles/tokens.css | grep -qx 1
```

The row produces no output of its own, so each link is shown separately. This is
a pin, not new work: both facts are already true at the base commit, and the
card says so.

| Link | Command | Output | Exit |
| --- | --- | --- | --- |
| 1 | `cmp web/public/favicon.svg docs/v2/assets/favicon.svg` | *(silent)* | 0 |
| 2 | `grep -cE '^\s*--brand-mark:\s*#1f6f63;' web/src/styles/tokens.css` | `1` | 0 |
| 3 | `grep -cE '^\s*--brand-mark:\s*#ffffff;' web/src/styles/tokens.css` | `1` | 0 |

Link 2 piping into `grep -qx 1` is what makes the count a *declaration count*:
a second `--brand-mark: #1f6f63` anywhere in the sheet would print `2` and fail
the pipeline. Link 3 likewise.

Supporting detail, the same two facts read a second way:

```
$ md5sum web/public/favicon.svg docs/v2/assets/favicon.svg
1ebaaff99f25a2f0d4155c49d2f5c7d8  web/public/favicon.svg
1ebaaff99f25a2f0d4155c49d2f5c7d8  docs/v2/assets/favicon.svg

$ wc -c web/public/favicon.svg docs/v2/assets/favicon.svg
 1091 web/public/favicon.svg
 1091 docs/v2/assets/favicon.svg
 2182 total
```

Byte-for-byte identical, 1091 bytes each, same digest — so AM-028's replacement
of `web/public/favicon.svg` and the design asset in `docs/v2/assets/` have not
drifted apart.

`--brand-mark` is declared at `web/src/styles/tokens.css:183` (`#1f6f63`, the
light theme) and `:332` (`#ffffff`, the dark theme), once each, which is D10's
pair. Neither declaration mentions `--accent`; that is also asserted from inside
the A mark's test case, so a future `--brand-mark: var(--accent)` fails V1 as
well as this row. `--logo-h: 20px` at `:132` is pinned the same way by the
wordmark's test case.

No file was written by this row.
