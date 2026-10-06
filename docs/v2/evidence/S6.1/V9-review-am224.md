# S6.1 — V9 row, review run (AM-224), review attempt 1

Independent implementation review. Row V9 of the S6.1 verification table
(`docs/v2/cards/S6.1.md:511`). A non-browser row, executed **after** V3 and V6
on that row's owned paths under `/tmp/apunta-v2/s6.1-observed/`.

- Working directory: the repository root
- Node: pinned A01 toolchain (`node --version` → `v24.19.0`)
- Inputs: `observed-es-MX.txt` (V3), `observed-chromium.txt` (V6),
  `emitted-dictionary-assets.txt` (V3) — all under `/tmp/apunta-v2/s6.1-observed/`
- Review attempt: 1 (AM-224)

## Command

```
OBS=/tmp/apunta-v2/s6.1-observed &&
sort -c -u "$OBS/observed-es-MX.txt" &&
sort -c -u "$OBS/observed-chromium.txt" &&
comm -23 "$OBS/observed-es-MX.txt" "$OBS/observed-chromium.txt" > "$OBS/spanish-pair.txt";
chain=$?; echo "sorted-and-comm-exit=$chain";
echo "es-MX minus chromium:"; cat "$OBS/spanish-pair.txt";
n="$(wc -l < "$OBS/spanish-pair.txt")";
m="$(grep -cxF -f "$OBS/spanish-pair.txt" "$OBS/emitted-dictionary-assets.txt")";
echo "difference-lines=$n emitted-matches=$m";
test "$chain" -eq 0 && test "$n" -eq 2 && test "$m" -eq 2; rc=$?; echo "exit=$rc"; exit $rc
```

## Result

Window (UTC): 2026-10-06T18:10:45Z (start and end) · **exit 0**

```
sorted-and-comm-exit=0
es-MX minus chromium:
index-DlpzEtDK.aff
index-HxP415V3.dic
difference-lines=2 emitted-matches=2
exit=0
```

- Both `sort -c -u` gates passed (raw inputs were already sorted and
  de-duplicated by the rows that own them); `comm` compared two sorted inputs.
- The independent difference is **exactly the Spanish pair**. Both names occur
  in V3's emitted dictionary-assets list (`emitted-matches=2`), and both are
  present in `web/dist/assets` (`index-DlpzEtDK.aff`, `index-HxP415V3.dic`).
- The gate that matters is the chain status plus the two counts, not `comm`'s
  bare exit code — all three held.

## Verdict

**PASS** — es-MX requests exactly the set that English never requests, and that
set is shipped and reachable.