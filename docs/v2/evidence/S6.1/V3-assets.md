# S6.1 — V3 the dictionary assets in Español

- Working directory: the repository root
- Sandbox run folder: `<sandbox>/2026-10-04T20-31-53-814Z-c6dbcae3/` — **V2's own env, sourced**, as the row requires (V2 writes it, V3 sources it)
- Started: 2026-10-04T20:36:45Z · Ended: 2026-10-04T20:44:00Z
- Command (exactly the row's):

```
export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" && export PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium && . /tmp/apunta-v2-s6.1-en.env && RUN_LOGS="$(dirname "$APUNTA_DATA_DIR")/logs" && export APUNTA_OBSERVED_FILE="$RUN_LOGS/observed-es-MX.txt" && ( cd e2e && npx playwright test --project=es-MX --grep "no dictionary asset is requested until a spell surface mounts" ) > "$RUN_LOGS/v3.log" 2>&1; rc=$?; echo "exit=$rc"; ASSETS="$(ls web/dist/assets)"; printf '%s\n' "$ASSETS" | rg '\.(aff|dic)$' | sort > "$RUN_LOGS/v3-dictionary-assets.txt"; export OBS=/tmp/apunta-v2/s6.1-observed; mkdir -p "$OBS"; sort -u "$RUN_LOGS/observed-es-MX.txt" > "$OBS/observed-es-MX.txt"; cp "$RUN_LOGS/v3-dictionary-assets.txt" "$OBS/emitted-dictionary-assets.txt"; echo "emitted-dictionary-assets:"; cat "$RUN_LOGS/v3-dictionary-assets.txt"; echo "observed-es-MX, as recorded:"; cat "$RUN_LOGS/observed-es-MX.txt"; echo "observed-es-MX, sorted and de-duplicated for V9:"; cat "$OBS/observed-es-MX.txt"; exit $rc
```

- **Exit code: 0** (Playwright's own status, captured immediately after the test
  command; the row ends `exit $rc`)

## The row's output, verbatim

```
exit=0
emitted-dictionary-assets:
index-CdfGWZcu.aff
index-CmfKht-g.dic
index-DlpzEtDK.aff
index-HxP415V3.dic
observed-es-MX, as recorded:
index-DlpzEtDK.aff
index-HxP415V3.dic
observed-es-MX, sorted and de-duplicated for V9:
index-DlpzEtDK.aff
index-HxP415V3.dic
```

**Exactly four** emitted names, two `.aff` and two `.dic` — the English pair
(`index-CdfGWZcu.aff`, 3.08 kB; `index-CmfKht-g.dic`, 551.76 kB, matching
P3.7's record) and the Spanish pair (`index-DlpzEtDK.aff`, 158.01 kB;
`index-HxP415V3.dic`, 714.04 kB, matching the installed `index.aff` 158,014
bytes and `index.dic` 714,044 bytes). The observation is against
`web/dist/assets`, which is what the `webServer` command's own `npm run build`
produced (`web/vite.config.ts` sets `assetsInlineLimit: 0`, and there is no
`build.manifest`, so no manifest exists to read).

## Both halves of the case

`e2e/tests/spelling-assets.spec.ts`, the one case both projects collect:

- **(a) negative** — on `/`, after the app settles, **zero** requests whose path
  ends `.aff` or `.dic`.
- **(b) positive proof of reachability** — after navigating to a note whose body
  is mounted, **exactly two**, one `.aff` and one `.dic`, both same-origin
  loopback (`127.0.0.1`, the run's own Spanish port) and both names present in
  the emitted list. In this run: `index-DlpzEtDK.aff` and `index-HxP415V3.dic`,
  which are the Spanish pair (V9 identifies them by set difference, not by name).

There is **no cross-project half inside the case** — it cannot tell which project
it is running in, and the two runs differ only in the value of
`$APUNTA_OBSERVED_FILE`, which it writes to. (c) is V9's executed `comm`.

## Collected counts (D6 condition 3)

Same build, same run folder: `chromium` 58 tests in 18 files (2 spelling-related),
`es-MX` 62 tests in 18 files (6 spelling-related). The case just run is the one
file neither `testIgnore` names.

## One precondition this case states, and why

The case waits for `html lang` to equal the project's locale before it opens the
note. Every page mounts a spell surface before its settings land, so without
that wait the first mount would load the pair for the language the app guessed at
that moment — the row would then be measuring that transient, not what D3 rule 1
says the UI language selects. With the wait, the observed pair is the settled
language's. This is recorded here because it is a condition the card does not
name.

## Cleanup (A10)

No restore of any tracked path. The servers Playwright started were stopped by
Playwright; nothing was left listening on 7884–7887.
