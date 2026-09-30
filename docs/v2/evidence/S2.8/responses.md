# S2.8 — responses to the S2.7 copy review

**Card:** S2.8, role IMPLEMENTATION, L1. **Base commit:** `f4c7696`. **Date:**
2026-09-29. **Input:** `docs/v2/evidence/S2.7/copy-review.md` (38 findings, in
its own numbering), plus the four minor notes in
`docs/v2/state/reviews/S2.7-impl.md`.

**Scope actually touched:** `shared/src/i18n/es-MX.ts` only — 37 keys, all of
them values, a plural map, or a comment. `en.ts` was not opened for writing and
no key was added, renamed or removed: the two catalogues still hold 802 keys
each, with identical placeholder sets and identical `kind` pairs per key
(re-derived below, command C5).

**Tally: 28 findings fixed, 10 not changed with a reason.** Nothing in the
review was left unanswered.

## Group A — defects

| # | Key(s) | Outcome | Note |
| --- | --- | --- | --- |
| 1 | `plan.diagnosesNone` | **fixed** | Took the review's own shorter alternative, `Ninguno registrado. Se espera que las metas se rastreen hasta un diagnóstico; te toca ingresarlo.` The untranslated `entered` and the inside-out `y … por ti` are gone; `tú` is kept (O-1) |
| 2 | `format.restoreLink` | **fixed** | `Restaurar en cambio`. Two defects, and the review's own proposal only fixed one: it kept `en su lugar` while finding 10 names this key as *the fourth case* of that calque. Resolved in favour of finding 10, so the four `instead` keys now read alike. `Restáurala` was the file's only voseo form and is gone |
| 3 | `backup.sameDisk` | **fixed** | `una memoria USB es más segura` |
| 4 | `format.referencedFiles` | **fixed** | `a los que Apunta no puede leer` (article on the relative pronoun, plural direct object) and the redundant `tú` dropped: `pega ese texto` |
| 5 | `errors.bad_request.transcribe_too_long` | **fixed** | `Graba en trozos más cortos`, the review's first proposal. *sesión* is kept for the clinical session (NOM-004, S1.4 §3.3) |
| 6 | `errors.bad_request.format_detect_skill_file` | **fixed** | `de la carpeta de la skill`, matching `format.skillFileTail` and the glossary's *carpeta de la skill* |
| 7 | `ai.context_overflow` | **fixed** | `así que el borrador se descartó`, the review's first proposal |
| 8 | `ai.transcription_timeout` | **fixed** | `sí va a funcionar`, the review's first proposal |
| 9 | `brainstorm.confirmBody`, `brainstorm.confirmConfirm` | **fixed** | `Esto descarta la conversación de arriba.` / button `Descartarla`. *descartar* is the catalogue's own word for the action (`common.dismiss`, `capture.discardRecording`, `plan.discardSuggestion`) |
| 10 | `capture.sourceTail`, `import.switchToClaude`, `import.switchToHalaxy` | **fixed** | `o escribe notas sin grabar` / `Importar desde Claude en cambio` / `Importar desde Halaxy en cambio`. Plus the fourth case, `format.restoreLink` (finding 2), for one rendering across all four |
| 11 | `capture.typeNotesHelp` | **fixed** | `o solo escríbelas sin grabar`, the review's first proposal: the clause now has a verb and an object |
| 12 | `patients.namePlaceholder` | **fixed** | `p. ej. Anaías Godoy Ruiz` — the first row of `e2e/fixtures/eval-es/NAMES.md`, an invented person (HS-8). S1.4 §3.5's condition ("until `NAMES.md` exists") is met. The catalogue's own header comment, which still said the file did not exist, was corrected in the same file |
| 13 | `refine.inputPlaceholder`, `capture.summaryPlaceholder` | **fixed** | `…` (U+2026) in both, so all 47 ellipses in the catalogue are the same character |
| 14 | the six `chat.*` keys | **fixed** | `«{phrase}»` / `«{label}»` in `chat.guardNotice.section`, `chat.factNotice.section`, `chat.priorNoteNotice.section`, `chat.scopeHold.additionOnly`, `chat.request.addition`, `chat.change.addition` |
| 14 | `errors.bad_request.import_bad_source`, `errors.bad_request.settings_bad_language` | **not changed** | Reason: they quote **literal protocol values** (`"assistant"`, `"human"`, `"en"`, `"es-MX"`) that the reader may have to type or match against a `curl`/a settings payload, and a straight quote mirrors the code exactly; the review itself said the argument is weaker here and left the call to S2.8. Uniformity would be bought at the price of a quoted literal that no longer looks like itself. These are now the **only two** straight-quoted strings in the catalogue, and that is a deliberate, countable exception rather than an accident |
| 15 | `patients.addClose` | **fixed** | `Cerrar «Agregar paciente»`, the catalogue's own pattern from `refine.closeLabel` |
| 15 | `settings.closeLabel` | **not changed** | Reason: the review left it "as the lead sees fit" and its own reasoning settles it — what it closes is a *page*, not a titled dialog, and `Ajustes` is the product's word (S1.4 §3.3). `Cerrar «Ajustes»` would quote a page name the user never sees as a title |
| 16 | `errors.conflict.plan_superseded_activate` | **fixed** | `Una versión del plan que quedó obsoleta…` |
| 17 | `plan.objectiveTargetLabel`, `plan.objectiveTargetDateLabel` | **not changed** | Reason: the review marked this **"not decided"** and routed it to the owner with S5 — "the *meta*/*objetivo* split itself is a terminology decision that touches clinical wording". Both candidate fixes (drop the repetition, or reorder) presuppose that split, so either one would silently answer an owner question. Recorded in the catalogue's header so the label is not mistaken for an oversight |

**Correction to finding 16's supporting list.** The review says the same
object reads `versión del plan` in `plan.superseded`, `errors.conflict.
plan_superseded_readonly`, `errors.not_found.plan_version` and
`plan.versionMeta`. Two of those four do not contain the phrase: `plan.
superseded` is `Esta versión fue reemplazada…` and `plan.versionMeta` is
`Versión {version} · {status}`. The finding itself stands — the other two do
say `versión del plan`, and `versión de plan` is a calque either way — so the
string is fixed and the mis-citation is recorded here rather than acted on.

## Group B — judgement calls, with the proposal accepted or dropped

| # | Key | Outcome | Note |
| --- | --- | --- | --- |
| 18 | `chat.firstPass` | **fixed** | `(acortar una sección, agregar algo que se me pasó, ajustar el tono)`. Accepted because it is a rule and not a taste: S1.4 §2.5 says Spanish should not use the English em-dash as a parenthetical, and the catalogue's own header claims it does not — this was the one place it did |
| 19 | `ai.unsupported_model_tag` | **fixed** | `no puede hacer que siga el formato` — the antecedent is singular (`Esa etiqueta`), so `esas sigan` had none. This is an agreement error, not a preference |
| 20 | `ai.insufficient_memory` | **fixed** | `A esta computadora se le acabó la memoria…`, reusing the idiom the catalogue already has in `ai.context_overflow` and `ai.output_truncated` |
| 21 | `note.deleteBodyFirst` | **fixed** | `se eliminan`. The glossary fixes *delete* → *eliminar*, and `eliminar` is what the same screen says. **See the S2.7-impl review's note 1:** the cross-reference in finding 21 quotes that key as `se eliminan`, but `workspace.deleteBodyThirdTail` actually reads `eso lo hace y no elimina nada`. The substance held and the fix was made; the misquote is recorded here |
| 22 | `format.instructionsHelp` | **fixed** | `instrucciones de skill en texto plano` and `La receta para convertir una skill de Claude en texto plano está en`. *skill* stays untranslated in both halves, as S1.4 §3.4 and the glossary require |
| 23 | `format.examplesSubtitle` | **fixed** | `De 2 a 3 notas terminadas para aprender el patrón que comparten` |
| 24 | `format.foundLede` | **fixed** | `el formato que usas en tu trabajo` |
| 25 | `plan.everyDays` | **not changed** | Reason: the key **cannot** express the singular, and not from this catalogue. `kind: { days: 'text' }` is fixed by `en.ts` (Must not edit) and `t.test.ts` compares `kind` per key, so no plural map can be attached; and the value that breaks it is a pre-rendered `String(plan.review_interval_days)` at `web/src/components/PlanDetails.tsx:64`, outside this card's May-edit list. The schema does allow 1 — `review_interval_days` is `z.number().int().positive()` (`shared/src/plan.ts:160`) — so `Cada 1 días` is reachable. **Follow-up for whoever owns `PlanDetails.tsx`:** either pass the count as a number and give the key a plural map in both catalogues, or constrain the interval to 2+ |
| 26 | `backup.daysAgo` | **fixed** | Added `plural: { one: 'hace {count} día', many: 'hace {count} días', other: 'hace {count} días' }`. The `many` category is not optional on es-MX (AM-051); the key set did not change, only a form on an existing key |
| 27 | `notes.emptySections` | **fixed** | `agrega lo que quieras o déjalo en blanco`. The honest fix the review identified: drop the agreement rather than pluralise a `{sections}` that is one name as often as several (`NoteBody.tsx:133` passes the format's section names). The key set and `kind` are untouched |
| 28 | `import.notFound` | **fixed** | `No se encontraron desde {cutoff}: {names}.`, matching the neighbour on the same screen (`import.noConversations`) |
| 29 | `capture.missingPatient` | **fixed** | `no se podría guardar nada de lo que se grabó aquí`; `se haya eliminado` kept, as the review says it should be |
| 30 | `plan.carriedForward` | **not changed** | Reason: the glossary's own `carried forward` entry offers `arrastrado / retomado` and then says **"Flag which verb the owner prefers."** That is an open S1.4 question, and S2.8 answering it would pre-empt the owner. The reviewer's separate point — that *arrastrar* is also the drag gesture the patients table teaches — is recorded and is worth the owner's weight, but it is an argument, not a decision. **For the owner, with S5** |
| 31 | `format.addLede` | **not changed** | Reason: not an error. The first-person `nosotros` under a `tú` imperative is licensed Spanish, and the glossary's entry for this exact sentence carries the same wording — changing the catalogue away from the glossary would create a second, unrecorded translation. The reviewer's optional reordering is left on the table |
| 32 | no catalogue key; `shared/src/i18n/t.ts:74` and `:242` | **not changed** | Reason: not a string, and not in this file. `t()` formats dates and numbers through `Intl`, so `month: 'short'` gives `8 ago 2026` and `Intl.NumberFormat('es-MX')` groups with commas. Honouring S1.4 §2.1 (`8 de agosto de 2026`) needs `month: 'long'` and honouring NOM-008-SE-2021 (§2.3, `1 234`) needs a number formatted *outside* `Intl`, because no `Intl` option produces a space. `shared/src/i18n/t.ts` is not on this card's May-edit list, and the comma is a question for the owner in any case. The catalogue's header, which pointed at S2.7/S2.8 for this, now records the answer and the reason in place. Day–month–year order and the decimal point with leading zero (`0.5`) are already correct. **For the owner: is a comma-grouped `1,234` acceptable in the note count?** |
| 33 | `settings.fontSerif` | **fixed** | `Con serifa`. The review's own test decides it: `Serif` is not a typeface name (it is not a bundled face — `Inter` is the bundled face, and `docs/v2/owner/UI-BACKLOG.md:162` describes `Serif` as "the system serif"), so §3.4's product-name exemption does not cover it, and the catalogue translates its siblings (`settings.fontSystem` → `Sistema`) |

## Group C — marked, not changed; recorded here as not for S2.8

| # | Cluster | Outcome | Reason |
| --- | --- | --- | --- |
| 34 | the attestation family (`plan.attestation`, `plan.notAttested`, `plan.attestedNote`, `plan.attestationStatement`) | **not changed** | The card's last fixed decision marks this group "not for S2.8". `plan.attestationStatement` is the owner's wording approved byte for byte in AM-059, and O-4 leaves *declaración* recommended but not chosen. **For the owner, with S5** |
| 35 | NOM-004 clinical vocabulary in the plan (13 keys) | **not changed** | S1.4 §3.2 says this catalogue reuses the S1.1/S1.2 clinical decisions rather than re-deciding them, and the review checked they are used consistently and found nothing to change. **For S5's review, as confirmation** |
| 36 | the first-person feminine forms (`plan.addGoalMyself`, `format.manualTitle`) | **not changed** | The glossary fixes *describe it myself* → *describirlo yo misma*, so the catalogue is following S1.4; changing it is a voice question about a catalogue written for one reader. **For the owner, with the voice question** |
| 37 | `patients.namePlaceholder` — the *form* of the example | **not changed** | The name itself is fixed (finding 12). The abbreviation stays `p. ej.`, which is what `format.namePlaceholder`, `format.sectionsPlaceholder` and `patients.groupNamePlaceholder` use, so the catalogue is internally consistent, and RAE treats the dotted form as correct. `por ejemplo` recorded as the alternative |
| 38 | `settings.language` — deliberately bilingual | **not changed** | The key's own comment says it is on purpose: it is the one control a Spanish speaker must find *before* switching, so translating it would hide it. An owner decision, not a translator's |

## Two of the review's own supporting claims, checked

- **Finding 2's mechanical claim (S2.7-impl note 2).** The C2 one-liner's
  `voseo: 0` and C3's `rg` hit disagreed because the two patterns were not the
  same. Re-run with C3's own pattern against the pre-change file, the hit is
  `format.restoreLink` and nothing else (command C2 below), so the finding was
  real; after the fix the same pattern returns nothing at all.
- **The clean section's plural claim (S2.7-impl note 3).** Noted, not acted on:
  it is a statement about the review's evidence, and the substance — Spanish
  carries the `many` category English lacks — is what this card's finding 26
  depends on and is confirmed by command C5.

## Commands

Working directory for all of them: the repository root (`<repo>`).

### C1 — V1, the card's verification row

- **command:** `npm run build:shared && npx vitest run shared/src/i18n`
- **start:** 2026-09-29T22:29:10Z
- **end:** 2026-09-29T22:29:12Z
- **exit code:** `0`
- **excerpt:**

  ```
   Test Files  2 passed (2)
        Tests  31 passed (31)
  ```

### C2 — the voseo scan, run before and after the change

- **command:**
  `rg -n --pcre2 "\b(Restáura\w*|Hablás|Tenés|Podés|Querés|Sabés|Mirá|Entrá|Continuá|Presioná|Usá|Copiá|Pegá|Elegí|Seguí|Escríbí|Guardá|Cerrá|Abrí)\b" shared/src/i18n/es-MX.ts`
- **exit code:** `1` (no match) against the changed file; the same pattern
  against `git show HEAD:shared/src/i18n/es-MX.ts` returns exactly one line,
  `Restáurala en su lugar` — finding 2, and nothing else
- **excerpt:** (no output on the changed file; `rg` prints nothing and exits 1)

### C3 — the two scan results that must now come back clean

- **commands:** the same `rg` as C2, plus a scan for ASCII `...` in Spanish
  string values, and `rg -n '"' shared/src/i18n/es-MX.ts`
- **exit code:** `1` (no match) for the ellipsis scan, `0` for the quote scan
- **excerpt:** the quote scan prints **9 lines, 24 occurrences**:

  ```
  36:   * "{count} nota" / "{count} notas". es-MX needs three cardinals and has
  52:  /** "Hoy", for a note written in this session. */
  56:   * "hoy" en minúscula, para la segunda mitad de la línea de la nota: en
  104:   * The stale-backup warning. "copia de seguridad" is S1.4 §3.3's rendering
  260:    text: 'El origen de las notas debe ser "assistant" o "human".',
  285:  'errors.bad_request.settings_bad_language': { text: 'El idioma debe ser "en" o "es-MX".' },
  1177:  /* --- El control junto a "Recientes" (owner, 2026-09-27) --- */
  1241:  /** "More", as Claude's own; owner, 2026-09-27. */
  1365:   * key has a plural map where English has none: "de 1 notas" was the one
  ```

  Seven of the nine lines are comments. The two string values are the
  deliberate exceptions of finding 14, and no `chat.*` key is among them any
  more.

### C4 — V2, this file

- **command:** `test -s docs/v2/evidence/S2.8/responses.md`
- **exit code:** `0`
- **excerpt:** (no output; `test -s` is silent on success)

### C5 — mechanical parity re-derived after the change

- **command:** a `tsx` one-liner reading both catalogues and comparing the key
  set, the placeholder set per key across `text` and every plural form, the
  `kind` pair, and the plural categories on every Spanish map
- **exit code:** `0`
- **excerpt:**

  ```json
  { "en": 802, "es": 802, "missing": [], "extra": [], "phBad": [], "kindBad": [],
    "esPluralCount": 32, "enPluralCount": 30, "multiWithoutPlural": [] }
  ```

  802/802 keys, nothing missing on either side, no placeholder or `kind`
  mismatch, all 32 Spanish plural maps carry `one`/`many`/`other`, and no key
  with more than one form is missing its plural map. Spanish gained exactly one
  map from this card (`backup.daysAgo`).

### C6 — the 37 changed keys, enumerated from the two catalogues rather than from the diff

- **command:** a `tsx` one-liner importing `esMX` from the working tree and from
  `git show HEAD:shared/src/i18n/es-MX.ts`, and printing every key whose entry
  is not byte-identical
- **exit code:** `0`
- **excerpt:**

  ```
  37 errors.bad_request.format_detect_skill_file errors.bad_request.transcribe_too_long
  errors.conflict.plan_superseded_activate ai.unsupported_model_tag
  ai.insufficient_memory ai.context_overflow ai.transcription_timeout chat.firstPass
  chat.guardNotice.section chat.factNotice.section chat.priorNoteNotice.section
  chat.scopeHold.additionOnly chat.request.addition chat.change.addition
  refine.inputPlaceholder notes.emptySections note.deleteBodyFirst backup.daysAgo
  backup.sameDisk brainstorm.confirmBody brainstorm.confirmConfirm plan.diagnosesNone
  patients.addClose patients.namePlaceholder format.instructionsHelp
  format.referencedFiles format.examplesSubtitle format.restoreLink format.foundLede
  settings.fontSerif capture.missingPatient capture.sourceTail capture.typeNotesHelp
  capture.summaryPlaceholder import.notFound import.switchToClaude import.switchToHalaxy
  ```

  24 keys from Group A and 13 from Group B, which is the two tables above
  counted entry by entry. `errors.*` and `settings.*` keys that are merely
  *mentioned* in a finding but not changed do not appear, which is the check
  that finding 14 and finding 15 stopped where they said they would.

### C7 — V3, the L2 e2e line, through the sandbox

- **command:**
  `node scripts/v2/sandbox.mjs env --port 7845 > /tmp/apunta-v2-e2e.env && . /tmp/apunta-v2-e2e.env && npm run e2e`
- **sandbox run ids used:** `2026-09-29T22-32-15-570Z-e0e6e587`,
  `…-22-33-…`, `…-22-34-…`, `…-22-35-…`, `…-22-43-…` (one per attempt;
  all under `<sandbox>`, none committed)
- **one line had to be added to run it at all on this box:**
  `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium`, exported before the
  run. `~/.cache/ms-playwright` holds a revision the installed
  `@playwright/test` does not ask for, so every browser test would otherwise
  fail to launch with `Executable doesn't exist`. This is the escape hatch
  `e2e/playwright.config.ts:21,55` documents, and it is the same one
  `docs/v2/state/reviews/P1.1-ir.md` and `P1.2-ir.md` record. Nothing was
  downloaded: Playwright's browsers are not in `docs/v2/ACQUISITION.md`, so
  `npx playwright install` is HS-3-forbidden and was not run
- **exit code:** `0` on the serial run (`--workers=1`, 106 passed, 6
  skipped, 1.0m → 2.6m); `1` on each of three default-worker runs, with a
  **different** pair of specs each time
- **the default-worker failures, and why they are not this card's:**

  | Run | Tree | Failed |
  | --- | --- | --- |
  | 1 | with the change | `formats.spec.ts:34` (chromium), `settings-appearance.spec.ts:21` (es-MX) |
  | 2 | with the change | `formats.spec.ts:34` (es-MX), `settings-appearance.spec.ts:77` (es-MX) |
  | 3 | with the change | `settings-appearance.spec.ts:77` (chromium), `settings-appearance.spec.ts:21` (es-MX) |
  | 4 | **base `f4c7696`** | `formats.spec.ts:34` (es-MX), `settings-appearance.spec.ts:21` (es-MX) |
  | 5 | **base `f4c7696`** | `settings-appearance.spec.ts:77` (es-MX) |

  Base fails the same way, so the flake is the suite's and not the
  catalogue's. Both assertions are races on **one stored setting**: theme is a
  single row, and the appearance specs `PUT /api/settings { theme }` and then
  assert the radio still agrees, while `workspace.spec.ts:548` and the other
  appearance spec write the same row on the same server at the same time; the
  format count is the same shape (`before + 1` across a `POST /api/formats`
  from a sibling worker). Every failing assertion is on a `data-testid`
  attribute and a `PUT`-then-read window — none is on a string. With
  `--workers=1` the change is 106/106 green, which is the base's own count
- **`docs/v2/evidence/P2.2/screenshots/` was restored with
  `git checkout --` after every run**, and `git status` confirms those four
  PNGs are not modified. They are rewritten by any e2e run and must never be
  committed

### C8 — the L1 gate and the two checkers this change could plausibly have moved

- **commands:** `npm run lint`; `npm run typecheck`;
  `node scripts/v2/check-es-fixtures.mjs`;
  `node scripts/check-no-external-urls.mjs`;
  `npx prettier --check shared/src/i18n/es-MX.ts docs/v2/evidence/S2.8/responses.md`
- **start:** 2026-09-29T22:46:09Z
- **end:** 2026-09-29T22:46:28Z
- **exit code:** `0`, `0`, `0`, `0`, `0`
- **excerpt:**

  ```
  Checking formatting...
  All matched files use Prettier code style!
  THIRD-PARTY-LICENSES.md lists all 111 shipped packages.
  TOTAL 0
  ```

  `check-es-fixtures.mjs` is the one that matters for finding 12: it holds the
  invented-name registry against the Spanish corpora in both directions, and
  it passes with `Anaías Godoy Ruiz` now sitting in the catalogue


## Things this card deliberately did not do

- **No key added, renamed or removed**, and no `en.ts` edit: the card's "Must
  not edit". Verified mechanically in C5, not asserted.
- **No call-site fix for finding 25**, because `web/src/components/PlanDetails.tsx`
  is outside the May-edit list. The reachable `Cada 1 días` is left as a known
  defect with a named owner rather than papered over.
- **No `t.ts` change for finding 32**, for the same reason, and because the
  thousands separator is the owner's call.
- **No clinical terminology change.** Findings 17, 30 and all of Group C are
  terminology or voice decisions, and the review itself routed them to the
  owner with S5. S2.8 is the lead on *copy*, not on NOM-004.
- **No attempt to open the instruction reviewer's file.** A
  `docs/v2/state/reviews/S2.8-ir.md` and, later, a
  `docs/v2/state/reviews/P3.3-ir3.md` appeared in the working tree during this
  session; both belong to other agents and were not read, edited or answered.

## One thing for the coordinator, not for S2.8

The e2e suite is **flaky on this box under Playwright's default 4 workers**,
at the base commit as well as with this change, and it costs about one minute
per run to reproduce. The two races are:

1. `settings-appearance.spec.ts:21` and `:77` — `theme` is one stored row, so
   the appearance specs and `workspace.spec.ts:548` overwrite each other
   between a `PUT /api/settings` and the assertion that reads it back.
2. `formats.spec.ts:34` — `expect(formats).toHaveLength(before + 1)` spans a
   window in which a sibling worker can `POST /api/formats`.

Nothing in either assertion is a string, and both are green with
`--workers=1`. It is recorded here because the next card that runs V3 will
hit it and should not spend the same hour proving it is not its own.


---

## Attempt 2 (AM-097) — the test expectations, not the copy

The S2.R parent review's finding 1 is a red `npm test` in all four timezones on
three cases, and it is caused by **finding 14 above being right**: commit
`393935e` changed six `chat.*` values from `"…"` to `«…»`, and the three
expectations in `server/src/ai/refine-request.test.ts` that asserted the straight
form were left behind. That file was Must-not-edit for attempt 1, so attempt 1
could not have updated it, and attempt 1's V1 ran `shared/src/i18n` only, so it
never saw the red.

**Every row above still stands, and nothing in this attempt changes any of them.**
The guillemets stay; AM-097 confirms finding 14 as applied. What changed in
attempt 2 is three lines in one test file plus the comment beside the first that
names the quote style:

- `:263` — `'"talked about work her manager"'` → `'«talked about work her manager»'`
- `:307-308` — `'Apunta no pudo agregar "Zoloft": …'` → `'Apunta no pudo agregar «Zoloft»: …'`
- `:375-376` — `'… y agregué "sertraline".'` → `'… y agregué «sertraline».'`

and the comment at `:261-262`, which read *"in straight quotes like every other
`{phrase}` in this catalogue"* and now reads *"in guillemets …"*.

The English expectation immediately below the third one
(`'I expanded the Client presentation section and added "sertraline".'`, FD6) is
**deliberately untouched** — English keeps straight quotes, `en.ts` was not
opened, and no other line in `server/` moved. `shared/src/i18n/es-MX.ts` was not
edited in this attempt either; the six rows it carries were already correct.
