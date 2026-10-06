# S6.1 — V3 row, review run (AM-224), review attempt 1

Independent implementation review. Row V3 of the S6.1 verification table
(`docs/v2/cards/S6.1.md:505`).

- Working directory: the repository root (the `( cd e2e && … )` subshell is one
  of the card's three subshells)
- Node: pinned A01 toolchain (`node --version` → `v24.19.0`); fake AI
- Chromium: `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium`
- Environment: sourced from `/tmp/apunta-v2-s6.1-en.env` (V2's run folder)
- Applied source: committed HEAD `d5b0d52721e3a0a058277e6ea85b4093dbfa5eca`
  plus the uncommitted notice candidate
- Review attempt: 1 (AM-224)

## Command

```
export PATH=… && export PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium &&
. /tmp/apunta-v2-s6.1-en.env &&
RUN_LOGS="$(dirname "$APUNTA_DATA_DIR")/logs" &&
export APUNTA_OBSERVED_FILE="$RUN_LOGS/observed-es-MX.txt" &&
( cd e2e && npx playwright test --project=es-MX --grep "no dictionary asset is requested until a spell surface mounts" ) > "$RUN_LOGS/v3.log" 2>&1; rc=$?; echo "exit=$rc";
ASSETS="$(ls web/dist/assets)"; printf '%s\n' "$ASSETS" | rg '\.(aff|dic)$' | sort > "$RUN_LOGS/v3-dictionary-assets.txt";
export OBS=/tmp/apunta-v2/s6.1-observed; mkdir -p "$OBS";
sort -u "$RUN_LOGS/observed-es-MX.txt" > "$OBS/observed-es-MX.txt";
cp "$RUN_LOGS/v3-dictionary-assets.txt" "$OBS/emitted-dictionary-assets.txt"; exit $rc
```

The `ls` reads the `web/dist/assets` the Playwright `webServer` build produced
(`e2e/playwright.config.ts:115-131`; there is no `web/dist/manifest.json` — the
card's A1-fix correction is applied).

## Result

- Run window (UTC): 2026-10-06T18:00:12Z–18:00:32Z
- **exit 0** — v3.log tail:

  ```
  ✓  7 [es-MX] › tests/spelling-assets.spec.ts:53:1 › no dictionary asset is requested until a spell surface mounts (945ms)
  1 skipped
  6 passed (20.2s)
  ```
  (The single skip is the same `language-control` conditional; nothing in
  `spelling-assets` is skipped.)
- Emitted dictionary assets, **exactly four**, copied verbatim to
  `/tmp/apunta-v2/s6.1-observed/emitted-dictionary-assets.txt` (also
  `…/logs/v3-dictionary-assets.txt`):

  ```
  index-CdfGWZcu.aff
  index-CmfKht-g.dic
  index-DlpzEtDK.aff
  index-HxP415V3.dic
  ```

  Two `.aff` + two `.dic` (English pair + Spanish pair, Vite-hashed).
- Observed requests under es-MX (`$APUNTA_OBSERVED_FILE`): **exactly the
  Spanish pair**, sorted and de-duplicated for V9 at
  `/tmp/apunta-v2/s6.1-observed/observed-es-MX.txt`:

  ```
  index-DlpzEtDK.aff
  index-HxP415V3.dic
  ```

- Server request log: the English pair fetched once, the Spanish pair four
  times (es-MX run folder), i.e. no staggering/deflation of the asset read.

## Verdict

**PASS** — exit 0; emitted list is exactly four `.aff`/`.dic` names; the
es-MX-positive case requests exactly the Spanish pair.