# Evidence: S1.2 Clinical vocabulary glossary EN to es-MX (RESEARCH)

Working directory: repo root (`~` project checkout, `feature/v2`).

## Commands run

| Time (UTC) | Command | Exit | Excerpt |
| --- | --- | --- | --- |
| 2026-09-26T02:04 | `git log -1 --format='%H %s'` (+ `git status --short`, `git branch --show-current`) | 0 | `f6cad78… Record card S1.1 APPROVED (v2 coordination state)`; branch `feature/v2`; only coordinator state files untracked (`docs/v2/state/*`) — left alone. HEAD == dispatch base commit. |
| 2026-09-26T02:05–02:14 | Web research (search tool, public pages only, no logins, no downloads) | n/a | ~12 searches: MedlinePlus Spanish MSE; CUN diccionario afecto/afecto labil; Finis Terrae examen-mental manual; es.wikipedia TFP + pensamiento circunstancial; C-SSRS official Spanish PDF; Redalyc/Scielo suicide nomenclature (Beck pasiva/activa); MINSAL Chile school protocol; Castilla y Leon centinela protocol; Elsevier heteroagresividad; Scielo Mexico riesgo grados + antecedentes; UNED EMDR; ITCC Mexico TCC; UNIR RC techniques; ResearchGate flecha descendente; Poiésis descubrimiento guiado; Scielo EPR + ACT; ChildMind ES DBT; UAEH TDC; Neuro-class DBT manual; Psara DBT; childdbt.com DBT-C Spanish; UNIR TBCS; Dialnet narrativa; ISFAP transferencia; es.wikipedia economia de fichas; Scielo DS; ClinicalTrials.gov Mexico Tafil/Rivotril; drugs.com clonazepam Mexico; WHO INN/DCI Spanish; Mexico Cuadro Basico 2017 (NEML); NOM-008-SE-2021 status page; RAE DPD/DLE. Full URL list in the JSON `source` fields and the MD companion §§1–6. |
| 2026-09-26T02:15 | `node -e "JSON.parse(require('fs').readFileSync('docs/research/es-mx-clinical-glossary.json','utf8'))"` | 0 | `V1 JSON parse OK` (399 entries; shape `{en,es_mx,category,note,source}` asserted on all; 6 `es_mx:""` unmapped with reasons; 0 missing sources). |
| 2026-09-26T02:15 | `npx prettier --check docs/research/es-mx-clinical-glossary.md` | 0 | `All matched files use Prettier code style!` |
| 2026-09-26T02:15 | `node scripts/check-no-external-urls.mjs` | 0 | No output (pass). Research URLs live in `docs/research/*`, outside the scan roots. |

## Criteria

- V1 (JSON parses): PASS, exit 0 (see above).
- V2 (prettier check on the MD): PASS, exit 0 (see above).
- V3 (reviewer compares with the English lists): NOT RUN — for the reviewer. Self-assessment for the reviewer: all 74 `presentation.ts` signals + 9 domains + status/source words mapped; all 9 intervention labels + 28 signals + technique/child-context/documentation-verb vocabulary mapped; all 29 NUMBER_WORDS + months + weekdays (+ abbreviations, lowercase-note) + dose units mapped; all `patterns.ts` phrase classes mapped as detector vocabulary; risk negation covers niega / no refiere / sin (+ datos de) / se descarta / sin evidencia de / predicate forms; history (antecedentes de) vs current (actual) documented; every entry labelled [verified]/[inferred]/[not found] with its URL; 6 terms unmapped with reasons (SI, HI, CBT-C, DBT acronyms, nil, markdown); medications vocabulary-only with Mexican brands verified only for Tafil/Rivotril and the rest [not found]-flagged for a pharmacist.

## Notes

- No sandbox used (L0 docs-only card; no server/db launched). No acquisitions (HS-3: no downloads). No HS contact (no port 7717, no live data, no committed files).
- Fabricated-data rule respected: no clinical examples of any kind in either file; only vocabulary and structure. Competitor text never copied (no competitor sources used at all).
- Changed paths (uncommitted, left for review): `docs/research/es-mx-clinical-glossary.json` (new), `docs/research/es-mx-clinical-glossary.md` (new), `docs/v2/evidence/S1.2/evidence.md` (this file), `docs/v2/state/returns/S1.2.md` (return).
