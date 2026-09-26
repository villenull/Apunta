# V3 — no font file rides along in the bundle

Working directory: repository root, provisioned Node first on `PATH`. The two
commands exactly as the card's row writes them.

## `npm run build`

Start 2026-09-26T10:30:19Z, end 10:30:22Z. Exit **0**. It writes only the
gitignored `web/dist` and `shared/dist`, starts nothing and contacts nothing.

```
> apunta@0.0.0 build
> npm run build:shared && npm run build --workspace @apunta/server && …

✓ 294 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                              1.26 kB │ gzip:  0.61 kB
dist/assets/index-CdfGWZcu.aff               3.08 kB
dist/assets/index-CmfKht-g.dic             551.76 kB
dist/assets/index-CcWIgRc0.css              68.36 kB │ gzip: 12.69 kB
…
dist/assets/app-shared-C9zPqjLy.js         113.10 kB │ gzip: 37.06 kB
dist/assets/index-CeRnVEe6.js              134.52 kB │ gzip: 37.98 kB
dist/assets/vendor-react-g1fnW_fh.js       181.75 kB │ gzip: 57.16 kB

✓ built in 71ms
```

## The font census

Start 2026-09-26T10:30:25Z, end 10:30:25Z. Exit **0**.

```
find web/dist -type f \( -name '*.ttf' -o -name '*.woff' -o -name '*.woff2' -o -name '*.otf' -o -name '*.eot' \) -printf '%P\n' \
  | sort | tee /tmp/p21-dist-fonts.txt | wc -l
```

Output:

```
6
```

`/tmp/p21-dist-fonts.txt`, six lines:

```
fonts/inter-latin-400-normal.woff2
fonts/inter-latin-500-normal.woff2
fonts/inter-latin-600-normal.woff2
fonts/inter-latin-ext-400-normal.woff2
fonts/inter-latin-ext-500-normal.woff2
fonts/inter-latin-ext-600-normal.woff2
```

Every condition the card sets for this row, checked against that file:

| Check | Command | Result |
| --- | --- | --- |
| count is exactly 6 | `wc -l < /tmp/p21-dist-fonts.txt` | `6` |
| no Kalam anywhere | `grep -ci kalam /tmp/p21-dist-fonts.txt` | `0` |
| every line is `fonts/inter-*.woff2` | `grep -cv '^fonts/inter-.*\.woff2$' /tmp/p21-dist-fonts.txt` | `0` (no line fails the pattern) |
| the same six subsets as at base | `diff <(ls web/dist/fonts) <(ls web/public/fonts)` | identical file names, no output |

The third row is the one that matters: `grep -cv` counts the lines that do *not*
match, so `0` means all six are under `fonts/` and all six are Inter. A seventh
line, a `Kalam-Regular.ttf`, or a font anywhere but `fonts/` would each make that
count non-zero.

`web/dist/` in full: `assets/`, `fonts/`, `index.html`, `favicon.svg`,
`pcm-worklet.js`. `favicon.svg` is at the dist root because Vite copies
`public/` there verbatim — which is the whole reason the card's earlier
`ls web/dist/assets` check could not fail, and why this row walks the entire
dist tree instead. Kalam is present in the repository at
`docs/v2/assets/Kalam-Regular.ttf`, where it belongs: it is the *source* the
outlines were converted from, it is not imported by anything, and it is not in
the bundle. The name is never typed in a font at runtime, which is what
`BrandWordmark.test.tsx` and `BrandMark.test.tsx` pin (one `<path>`, no text
node, in each).

This row wrote only the gitignored `web/dist`, `shared/dist` and the `/tmp` file,
so re-running it is idempotent and no stale tree can be mistaken for fresh
output.
