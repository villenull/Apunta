# S6.1 — V6 the negative control, in English

- Working directory: the repository root
- Sandbox run folder: `<sandbox>/2026-10-04T20-44-07-246Z-5b504311/` — **minted by this row's own `sandbox.mjs env --port 7886`**, created and sourced inside a subshell only, so this run cannot see V2/V3's patients (S2.10's `<p2>` rule). Spanish pair 7887.
- Started: 2026-10-04T20:44:07Z · Ended: 2026-10-04T20:44:13Z
- Command (exactly the row's):

```
export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" && export PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium && ( node scripts/v2/sandbox.mjs env --port 7886 > /tmp/apunta-v2-s6.1-fresh.env && . /tmp/apunta-v2-s6.1-fresh.env && RUN_LOGS="$(dirname "$APUNTA_DATA_DIR")/logs" && export APUNTA_OBSERVED_FILE="$RUN_LOGS/observed-chromium.txt" && ( cd e2e && npx playwright test --project=chromium --grep "no dictionary asset is requested until a spell surface mounts" ) > "$RUN_LOGS/v6.log" 2>&1; rc=$?; echo "exit=$rc"; OBS=/tmp/apunta-v2/s6.1-observed; mkdir -p "$OBS"; sort -u "$RUN_LOGS/observed-chromium.txt" > "$OBS/observed-chromium.txt"; echo "observed-chromium, as recorded:"; cat "$RUN_LOGS/observed-chromium.txt"; echo "observed-chromium, sorted and de-duplicated for V9:"; cat "$OBS/observed-chromium.txt"; exit $rc )
```

- **Exit code: 0** (Playwright's own status; the subshell ends `exit $rc`)

## Freshness of the data folder

The folder was minted by this row's own `sandbox.mjs env`, in this run: the run
id `2026-10-04T20-44-07-246Z-5b504311` did not exist before this row. No earlier
run touched it, and the Spanish server this configuration also starts (port 7887,
`data-es-MX` beside it) had a fresh folder of its own.

## The row's output, verbatim

```
exit=0
observed-chromium, as recorded:
index-CdfGWZcu.aff
index-CmfKht-g.dic
observed-chromium, sorted and de-duplicated for V9:
index-CdfGWZcu.aff
index-CmfKht-g.dic
```

## Both halves, and what makes this a control that can fail

- **(a) negative** — on `/`, zero requests ending `.aff`/`.dic`.
- **(b) positive** — after a note body mounts, exactly two, one `.aff` and one
  `.dic`, same-origin loopback, present in `web/dist/assets`. If the code fetched
  eagerly, (a) fails; if the assets were unreachable, (b) fails.

This is the **same case** as V3's (`e2e/tests/spelling-assets.spec.ts`, which
neither `testIgnore` names), so it reads the same evidence and the two are
directly comparable.

## Which pair this is, and why it is not inferred from the names

The `chromium` project runs against the **first** `webServer` block
(`e2e/playwright.config.ts:116-129`), whose `env` carries only `APUNTA_PORT` and
`APUNTA_DATA_DIR` — **without** `APUNTA_DEV_SPANISH`, which is on the second
block's `env` (`:140`). Both servers do start in this run. So Spanish is not even
offered to the English project, the stored language is `en`, and under D3 rule 1
this row observes the **English** pair. V9 differences that set against V3's to
identify the Spanish pair; the identification rests on these recorded facts and
not on the two names merely being different.

## Cleanup (A10)

No restore of any tracked path. After this row, `ss -ltn` showed nothing
listening on 7880–7889 and 7717 was never contacted.
