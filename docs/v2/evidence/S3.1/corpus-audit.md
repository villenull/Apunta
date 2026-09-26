# S3.1 — corpus audit

What the two corpora actually contain, counted from the shipped files rather than asserted.
The four `expectations.json` sidecars and the 110 transcripts as they sit in the tree.

## Shape

| Measure | eval-es | eval-owner-es | total |
| --- | --- | --- | --- |
| fixtures | 55 | 55 | 110 |
| words of dictation | 12956 | 8234 | 21190 |
| `mustCapture` facts | 496 | 426 | 922 |
| …of them safety-tagged | 45 | 76 | 121 |
| `mustNotContain` bans | 759 | 679 | 1438 |
| `blank` sections | 5 | 11 | 16 |
| `statedAbsence` sections | 3 | 0 | 3 |
| `requiresHedge` | 15 | 15 | 30 |
| `requiresMarker` | 5 | 5 | 10 |
| `f6: "gating"` | 5 | 2 | 7 |

Format mix, `eval-es`: `{"progress":33,"intake":22}`. `eval-owner-es` is her seven sections throughout.

Modality across both corpora: `{"dictated":74,"dictated-with-aside":5,"dictated-long":18,"dictated-short":13}` — every one starts with
`dictated`, which is the prefix `draftSourceFor` keys on to route a fixture down the transcript path.

## Does each gold entry belong to the transcript it is filed against?

The failure this catches is a fragment filed against the wrong file: invisible in review, fatal to a score,
and the kind of thing that survives a hand-written merge. For all 110 entries, at least one `mustCapture`
alternative is a plain literal that appears verbatim in that transcript. 110/110.

## `mustNotContain` patterns that match their own source: 12, and all 12 are the point

A banned pattern matching its own source is normally a bug — the fixture would be unpassable. These are not.
In each case the pattern names the *retracted* or *explicitly waved off* span, and the source has to contain
it for the correction or the aside to be real.

- **both corpora** `spoken-correction/01-o-sea-dos-y-media` — `o sea` (rank 1): the loose figure is corrected in
  the same breath, so it is in the source and must not reach the note.
- **both corpora** `spoken-correction/02-mejor-dicho-cuatrocientos` — `mejor dicho` (rank 2): the retracted amount.
- **both corpora** `spoken-correction/03-mas-bien-ataque` — `más bien` (rank 3): the retracted description.
- **both corpora** `spoken-correction/05-digo-dos-veces` — `digo` (rank 5): the retracted frequency.
- **both corpora** `english-loanword/03-si-y-hi` — the untranslated sigla `HI`, which the note must expand to
  `ideación homicida` (S1.2 §8 has no Spanish letter-abbreviation). A bare ``\bSI\b`` ban would
  have been wrong: matching is case-insensitive, so it would ban the conjunction *si* in every Spanish note.
- **eval-owner-es** `dose-and-number/04-ochenta-y-dos-kilos` — an aside the clinician waved off ("lo del clima
  no viene al caso"), so the word must not leak into the note.
- **eval-owner-es** `experiencer/02-papa-bebe` — the same, for an aside about a neighbour.

## Things a reviewer should look at first

- **The split sits at exactly the floor.** 40.0% held out per corpus, zero margin. Adding a sixth fixture to
  any trap type, or a twelfth trap type, drops the share and fails V1. That is intended, and it is why the
  checker re-derives the split from the filenames rather than trusting `NAMES.md`.
- **Seven gating fixtures, all `section-never-covered/`.** Their `markerFreeSource` claim is verified against
  the epistemic-marker list written from the S1 research and printed in `e2e/fixtures/eval-es/README.md`,
  because reading the scorer to build the gold would have broken C-EVAL rule 9. If S3.2’s F6 list differs,
  seven fixtures need re-labelling — not the corpus.
- **Ten `requiresMarker` entries** whose pattern is a *shape* rather than a string, pending S3.2 settling the
  Spanish unclear-dictation marker. The shipped English instruction literal is `[unclear in dictation]`.
- **The owner corpus never blanks `Revisión de riesgo` or `Tareas entre sesiones`.** Her standing convention
  writes `"None."` in exactly those two when she gave nothing, and every other section empty
  (`docs/note-instructions/owner-progress-instructions.md`, "Empty sections"). A gold entry claiming those two
  are blank would be false, so the `section-never-covered/` fixtures in her format blank the other five
  sections, one per fixture.
- **The Spanish section names are proposals, not decisions.**
  `docs/research/es-mx-clinical-documentation.md` §5 leaves owner flags O-O1 (`cliente` vs `paciente`) and O-O2
  (`Análisis` vs `Evaluación`) open, so `defaultInstructionsFor` matches none of them and these fixtures route
  to the generic fallback until S3.2 settles locale-aware instruction selection. That, plus the `loadCorpus`
  recursion the card names, is what makes this corpus unrunnable through `npm run eval` today — by design of
  the packet order, not by omission here.
- **The one thing this card could not check.** No note was ever generated from these fixtures, so "the gold
  is right" rests on the text: every `mustNotContain` was written to be a form no faithful note could contain,
  and each author checked that against the note a flawless drafter would write. That is a static argument.
  The dynamic one — the scorer actually flagging these traps — is S3.2’s V1 and C-EVAL rule 9’s second half.

