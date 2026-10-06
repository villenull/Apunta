# S6.1 — V6 row, review run (AM-224), review attempt 1

Independent implementation review. Row V6 of the S6.1 verification table
(`docs/v2/cards/S6.1.md:508`).

- Working directory executed from: the repository root; the whole row runs in
  **its own subshell** with its own fresh environment
- Node: pinned A01 toolchain (`node --version` → `v24.19.0`); fake AI
- Chromium: `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium`
- Isolation: its own `sandbox.mjs env` just mints a fresh run folder (every
  `cmdEnv` call re-runs `newRunId()` + `ensureRunDir`, `scripts/v2/sandbox.mjs:353-361`),
  ports **7886** (English) / **7887** (Spanish)
- Applied source: committed HEAD `d5b0d52721e3a0a058277e6ea85b4093dbfa5eca`
  plus the uncommitted notice candidate
- Review attempt: 1 (AM-224)

## Command

```
export PATH=… && export PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium &&
( node scripts/v2/sandbox.mjs env --port 7886 > /tmp/apunta-v2-s6.1-fresh.env &&
  . /tmp/apunta-v2-s6.1-fresh.env &&
  RUN_LOGS="$(dirname "$APUNTA_DATA_DIR")/logs" &&
  export APUNTA_OBSERVED_FILE="$RUN_LOGS/observed-chromium.txt" &&
  ( cd e2e && npx playwright test --project=chromium --grep "no dictionary asset is requested until a spell surface mounts" ) > "$RUN_LOGS/v6.log" 2>&1; rc=$?; echo "exit=$rc";
  OBS=/tmp/apunta-v2/s6.1-observed; mkdir -p "$OBS";
  sort -u "$RUN_LOGS/observed-chromium.txt" > "$OBS/observed-chromium.txt"; …
  exit $rc )
```

## Result

- Run folder: `<sandbox>` (its own `data`, `data-es-MX`, `logs`);
  env file `/tmp/apunta-v2-s6.1-fresh.env`
- Window (UTC): 2026-10-06T18:10:30Z–18:10:37Z · **exit 0** — v6.log tail:

  ```
  ✓  1 [chromium] › tests/spelling-assets.spec.ts:53:1 › no dictionary asset is requested until a spell surface mounts (872ms)
  1 passed (6.1s)
  ```

- Both halves of the control asserted by the spec (exit 0):
  **(a) negative** — on `/`, zero requests ending `.aff`/`.dic`;
  **(b) positive reachability** — after a note body mounts, exactly two same-origin
  requests, one `.aff` and one `.dic`.
- Observed names (as recorded, and sorted/de-duplicated — identical):

  ```
  index-CdfGWZcu.aff
  index-CmfKht-g.dic
  ```

  Both are present in `web/dist/assets` — the English pair V3's emitted list
  also carries.
- Sorted/de-duplicated file written to
  `/tmp/apunta-v2/s6.1-observed/observed-chromium.txt` for V9.

## Verdict

**PASS** — the fresh negative control holds on its own freshly minted data
folder: nothing is fetched on `/`, and the positive half proves the case is
reachable in the English project and observes exactly the one English pair.