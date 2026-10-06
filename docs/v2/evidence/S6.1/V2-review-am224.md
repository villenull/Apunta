# S6.1 — V2 row, review run (AM-224), review attempt 1

Independent implementation review. Row V2 of the S6.1 verification table
(`docs/v2/cards/S6.1.md:504`).

- Working directory: the repository root (the `( cd e2e && … )` subshell is one
  of the card's three subshells, made inside the row's own command)
- Node: pinned A01 toolchain (`node --version` → `v24.19.0`); fake AI
- Chromium: `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium`
- Isolation: `scripts/v2/sandbox.mjs` data + install dirs; synthetic fixtures
  only; ports **7884** (English) / **7885** (Spanish) in one run folder
- Applied source: committed HEAD `d5b0d52721e3a0a058277e6ea85b4093dbfa5eca`
  plus the uncommitted notice candidate
- Review attempt: 1 (AM-224)

## Command

```
export PATH=…/node-v24.19.0-linux-x64/bin:$PATH && export PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium &&
node scripts/v2/sandbox.mjs env --port 7884 > /tmp/apunta-v2-s6.1-en.env &&
. /tmp/apunta-v2-s6.1-en.env &&
RUN_LOGS="$(dirname "$APUNTA_DATA_DIR")/logs" &&
( cd e2e && npx playwright test --project=es-MX spelling-es.spec.ts ) > "$RUN_LOGS/v2.log" 2>&1; rc=$?; echo "exit=$rc"; exit $rc
```

One `sandbox.mjs env`; the Spanish server shares the run folder (`data-es-MX`);
`--project=es-MX` pulls its `es-MX-language` dependency in automatically.

## Result

- Run folder: `<sandbox>` (logs in `<sandbox>/logs`);
  env file `/tmp/apunta-v2-s6.1-en.env`
- Spec run window (UTC): 2026-10-06T17:55:43Z–17:56:12Z
- **exit 0** — v2.log tail:

  ```
  ✓  11 [es-MX] › tests/spelling-es.spec.ts:254:3 › … marks the add-patient name input at /patients/new (1.3s)
  1 skipped
  10 passed (28.2s)
  ```

- The single skip is `language-control.spec.ts:81` (conditional
  `appLocale !== 'en'`), a pre-existing cross-project conditional skip — it is
  **not** a `spelling-es` self-skip. No `spelling-es` case is skipped.
- Surfaces, all five required and named, all driven and green:
  note body (`note-body`, spec:149), the typed-notes box
  (`summary-input`, :180 — the surface the English spec never drove, named by
  id), the refine composer (`ChatComposer`, prop passed, :204), the patient
  rename field (`rename-field-<id>`, `PatientRenameField.tsx:64`, :230), and
  the add-patient name input at `/patients/new` (:254). For each surface the
  fabricated misspellings (`brócolido`, `zambumbia`, `telaraosa`) are marked
  `.misspelt`, clicking opens `spelling-menu` with a non-empty suggestion list,
  and a fix is accepted; `sesión`, `atención`, `psicología`, `niño`, `última`
  and `café` are never flagged.
- Stored `language` is `es-MX` at the moment the assertions run (the
  `es-MX-language` dependency is what leaves it there).

## Likes/environment checks

- Own `checkScreen` instrumentation repeat (JSON-reporter, separate invocation,
  UTC 18:59:30Z–18:59:58Z, exit 0, expected=10, skipped=1, unexpected=0):
  note screen annotation "una nota con marcas de ortografía — 31 strings read,
  0 English"; menu annotation "el menú de ortografía — 31 strings read,
  0 English".
- Collection counts via Playwright `--list`: `chromium` 54 tests / 17 files
  (includes `spelling.spec`, `spelling-assets`; no `spelling-es`); `es-MX`
  58 tests / 17 files including `es-MX-language` dependency 6 tests / 1 file
  (`es-MX` local 52; `spelling-es` 5 + `spelling-assets` 1; no `spelling.spec`)
  — T_all consistent at 70 across the two projects.

## Verdict

**PASS** — exit 0; five surfaces covered (both `AddPatient` and
`PatientRenameField` driven); stored language `es-MX`; zero English strings on
the spelled surfaces; nothing skipped in `spelling-es`.