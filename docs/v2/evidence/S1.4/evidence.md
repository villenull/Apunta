# Evidence: S1.4 Interface conventions and UI glossary (RESEARCH)

Working directory: repo root (project checkout, branch `feature/v2`).

## Commands run

| Time (UTC) | Command | Exit | Excerpt |
| --- | --- | --- | --- |
| 2026-09-26T02:35 | `git log -1 --format='%H %s'` (+ `git status --short`, `git branch --show-current`) | 0 | `cd0cb7a7… Record card S1.3 APPROVED (v2 coordination state)`; branch `feature/v2`; only coordinator state files under `docs/v2/state/*` new/modified — left alone. HEAD == dispatch base commit `cd0cb7a`. |
| 2026-09-26T02:35–03:05 | Web research (search + page reads, public pages only, no logins, no downloads) | n/a | ~12 searches and page reads: RAE *Nueva gramática básica* / *El buen uso* / DPD (tú/usted, fecha, signos de interrogación y exclamación), RAE *Ortografía* (separador decimal), RAE *Libro de estilo* (fecha/hora, comunicación ser humano-máquina), FundéuRAE (fechas, horas, meses en minúscula, mediodía, backup, brainstorming), Microsoft es-MX and es-ES localization style guides, Ubuntu Spanish Translators style, NOM-008-SE-2021 (DOF/SIDOF/CENAM), DGN-R-13-1973 (DOF), NOM-004-SSA3-2012 (DOF), FENAPSIME ethics code, UNAM FES Iztacala SOAP material, CONASAMA expediente guide, UNAM ECLIME Psicología 2025, Samsung Mexico and Audible es_MX settings pages, RAE DLE *nota* and *borrador*. Source list in `docs/research/es-mx-ui-conventions.md` §5 and the JSON `source` fields. |
| 2026-09-26T03:03 | `node -e "const g=JSON.parse(require('fs').readFileSync('docs/research/es-mx-ui-glossary.json','utf8')); ..."` | 0 | `V1 JSON parse OK; entries=195`; 0 entries missing a required field (`category`/`en`/`es_mx`/`note`/`source`). |
| 2026-09-26T03:03 | `npx prettier --check docs/research/es-mx-ui-conventions.md` | 0 | `Checking formatting... All matched files use Prettier code style!` |
| 2026-09-26T03:04 | `node scripts/check-no-external-urls.mjs` | 0 | No output (pass). Research URLs live in `docs/research/*`, outside the scan roots. |
| 2026-09-26T03:06 | UI-string coverage self-check (TypeScript compiler API extraction of `web/src/routes/*.tsx` + `web/src/components/*.tsx`, test files excluded; every extracted visible string compared with the union of glossary `ui` arrays) | 0 | 195 glossary entries. All translatable visible strings matched. 22 remaining unmatched are non-translatable: CSS class-name strings (`btn btn-mic`, `home-result is-active`, `modal card`, `chat-col is-sheet`, `shell wide`, `dropzone-over`, `dot done`, etc.), a focus-selector string (`button, [href], input, textarea, …`), the `×` close glyph, HTML entities `&ldquo;`/`&rdquo;`, and the filename `docs/skill-porting.md`. |

## Criteria

- V1 (JSON parses): PASS, exit 0 — 195 entries; required-field check clean.
- V2 (prettier check on the MD): PASS, exit 0.
- V3 (reviewer spot-checks 20 UI strings, each maps to a glossary entry): NOT RUN — for the reviewer. Self-assessment: every distinct visible string in the two globs either appears verbatim in a `ui` array or is a non-translatable class name, symbol, entity or filename (list above). The JSON is flat with one entry per noun/verb; the `ui` arrays let a reviewer map any chosen string. Candidate sample of 20: Notes, New note, Draft, Publish, Finish & copy, Refine note, Dictate a message, Transcribing, Backup, Restore, Import from Claude, Import from Halaxy, Patient name, Session, Treatment plan, Prepare for session, Brainstorm, Settings, Attestation, Add objective.

## Notes

- No sandbox used (L0 docs-only card; no server/db launched). No acquisitions (HS-3: none). No HS contact (no port 7717, no live data, no owner export, no Halaxy PDFs, no commits).
- Fabricated-data rule respected: the glossary is vocabulary only; no clinical examples. Competitor sites were not needed for this card (terminology came from RAE/Fundéu/Microsoft/standards); no competitor text is copied.
- Spanish sample names: `e2e/fixtures/eval-es/NAMES.md` does not exist at this commit (`find` and `git ls-files` both empty), so the Add-patient placeholder is flagged (O-3), not invented.
- Changed paths (uncommitted, left for review): `docs/research/es-mx-ui-conventions.md` (new), `docs/research/es-mx-ui-glossary.json` (new), `docs/v2/evidence/S1.4/evidence.md` (this file), `docs/v2/state/returns/S1.4.md` (return).
