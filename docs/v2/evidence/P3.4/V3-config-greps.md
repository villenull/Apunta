# P3.4 — V3, the config-level greps

- Working directory: repository root
- Start: 2026-10-02T23:09:20Z
- End: 2026-10-02T23:09:20Z
- Exit code: **0**
- Status: **PASS**

## Exact command

The card's V3 cell, run verbatim — one loop over the four forbidden words with
`bad`/`hits` accumulators ending in `test "$bad" = 0`:

```
b=/tmp/apunta-v2-p3.4-v3; rm -rf $b; mkdir -p $b; bad=0; hits=0; for w in invoke_handler 'withGlobalTauri": true' VITE_APUNTA_TEST_IDENTITY p3.4-observe; do if grep -rnF -e "$w" src-tauri/src src-tauri/tauri.conf.json src-tauri/tauri.test.conf.json src-tauri/build.rs >"$b/hits"; then echo "FAIL: '$w' appears in a file the AppImage is built from:"; head -n 5 "$b/hits"; hits=$((hits+1)); fi; done; echo "P3.4-V3: 4 forbidden words over 4 paths, matches: $hits"; test "$hits" = 0 || bad=1; test ! -e src-tauri/capabilities || { echo "FAIL: src-tauri/capabilities exists, so a capability was added"; bad=1; }; test "$bad" = 0
```

## Excerpt

```
P3.4-V3: 4 forbidden words over 4 paths, matches: 0
```

## What each guard contributed to the single exit code

| Guard | Contribution |
| --- | --- |
| `invoke_handler` over `src-tauri/src`, `tauri.conf.json`, `tauri.test.conf.json`, `build.rs` | no match (a `grep` that finds nothing exits 1, which is the pass) |
| `withGlobalTauri": true` over the same four paths | no match |
| `VITE_APUNTA_TEST_IDENTITY` over the same four paths | no match |
| `p3.4-observe` over the same four paths | no match |
| `test ! -e src-tauri/capabilities` | passes — no capability directory exists, so no capability was added |
| `test "$bad" = 0` | the row's exit code, fed by the loop **and** by the capabilities test |

The loop was **not** simplified back into an alternation, and neither of the two
defects the card records was reintroduced: there is one `grep -rnF` call per
word (fixed-string, no dialect ambiguity), and every guard feeds the row's own
exit code rather than only the last command's.

This row's greps are a **report**, never a substitute for reading the page. It
did not stand in for V2's (a) — which failed on its own observed value above —
and it is not offered as a weaker reading of rule 4.

## Related measurement, outside the row

The shell side of the hook's bound also holds in the built binary, which V3
cannot see and the containment assertions on V2 do: the shipped AppDir's 16 web
JS bundles contain `p3.4-observe` in **1** and `VITE_APUNTA_TEST_IDENTITY` in
**0**. The gate is resolved by Vite at web build time, so it cannot reach the
binary; the marker can, because that bundle is a test bundle and V0 proves it
never lands in `web/dist`.