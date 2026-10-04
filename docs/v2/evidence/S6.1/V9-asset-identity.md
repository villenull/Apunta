# S6.1 — V9 the set difference, executed

- Working directory: the repository root
- Started: 2026-10-04T20:52Z · Ended: 2026-10-04T20:52Z
- Ran after both V3 and V6, over the two exact paths those rows own.
- Command (exactly the row's):

```
export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" && OBS=/tmp/apunta-v2/s6.1-observed && sort -c -u "$OBS/observed-es-MX.txt" && sort -c -u "$OBS/observed-chromium.txt" && comm -23 "$OBS/observed-es-MX.txt" "$OBS/observed-chromium.txt" > "$OBS/spanish-pair.txt"; chain=$?; echo "sorted-and-comm-exit=$chain"; echo "es-MX minus chromium:"; cat "$OBS/spanish-pair.txt"; n="$(wc -l < "$OBS/spanish-pair.txt")"; m="$(grep -cxF -f "$OBS/spanish-pair.txt" "$OBS/emitted-dictionary-assets.txt")"; echo "difference-lines=$n emitted-matches=$m"; test "$chain" -eq 0 && test "$n" -eq 2 && test "$m" -eq 2; rc=$?; echo "exit=$rc"; exit $rc
```

- **Exit code: 0**

## The two sorting gates

Both `sort -c -u` gates ran and both passed: each observed file is already sorted
and de-duplicated, because V3 and V6 each wrote a `sort -u` copy. The gates are
joined with `&&`, so an unsorted input would have failed the chain before `comm`
saw it — which is the wrong-but-green this row exists to prevent, since `comm` on
unsorted input can print a plausible-looking difference and exit non-zero *for the
wrong reason*.

## The output, verbatim

```
sorted-and-comm-exit=0
es-MX minus chromium:
index-DlpzEtDK.aff
index-HxP415V3.dic
difference-lines=2 emitted-matches=2
exit=0
```

## Both input files and the emitted list, copied verbatim

`/tmp/apunta-v2/s6.1-observed/observed-es-MX.txt` (written by V3):

```
index-DlpzEtDK.aff
index-HxP415V3.dic
```

`/tmp/apunta-v2/s6.1-observed/observed-chromium.txt` (written by V6):

```
index-CdfGWZcu.aff
index-CmfKht-g.dic
```

`/tmp/apunta-v2/s6.1-observed/emitted-dictionary-assets.txt` (copied by V3 from
`web/dist/assets`):

```
index-CdfGWZcu.aff
index-CmfKht-g.dic
index-DlpzEtDK.aff
index-HxP415V3.dic
```

Both lines of the difference are present verbatim in the emitted list
(`emitted-matches=2`), one `.aff` and one `.dic`.

## What each name belongs to, and why that is a result and not an assumption

Not inferred from the names being distinct — that would be an assumption. It
rests on recorded facts:

- both runs share **one build** and **one list of four emitted names**;
- the `chromium` project runs against the first `webServer`
  (`e2e/playwright.config.ts:116-129`), started **without** `APUNTA_DEV_SPANISH`,
  so its stored language is `en` and D3 rule 1 makes its observed pair the
  **English** pair;
- the `es-MX` project runs against the second `webServer` (`:140`), started
  **with** it, on its own data folder whose stored language is `es-MX`, so its
  observed pair is the **Spanish** pair;
- the Spanish pair's file sizes agree with the installed data files: the emitted
  `index-DlpzEtDK.aff` is 158.01 kB and `index-HxP415V3.dic` is 714.04 kB, against
  `node_modules/dictionary-es-mx/index.aff` 158,014 bytes and `index.dic` 714,044
  bytes (recorded in `acquisition.md`).

## Row verdict

**PASS**: `exit=0`, `sorted-and-comm-exit=0`, `difference-lines=2`,
`emitted-matches=2`, one `.aff` and one `.dic` printed. Zero lines would have
meant the two runs observed the same pair; four would have meant the builds
differed; a name absent from the emitted list would have meant the difference
named something the build did not emit.
