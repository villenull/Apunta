# Spanish draft checks and corrected figures — 2026-10-07

Two owner requests, measured together because they share the drafting path:

- **Item 9:** the server's draft checks were English-only. These are the
  lost risk review, background she never gathered written up as a negative,
  and a diagnostic word she never used.
- **Item 10:** fixture `10`, the last fabrication in the English corpus. The
  draft kept a figure the client had corrected ("five years, though she
  initially stated three years…"). The owner's call: only the revised figure
  belongs in the note.

`qwen3.5:4b-q4_K_M`, 3 runs per fixture, seed 0, synthetic fixtures only. The
scorer is unchanged.

## What changed

- **The checks read the note's language.** `GenerateNoteRequest.noteLocale`
  is the note's format language, passed by the draft route and by the eval's
  `--locale`. The interface language is no longer used for this: a Spanish
  interface can draft an English format.
- **Mexican Spanish for all three checks.** Each module has a per-language
  table (`risk-review.ts`, `not-obtained.ts`, `diagnostic-words.ts`), with
  Spanish quoting and rewrite prompts and Spanish labels:
  - risk review: `Revisión de riesgo, según lo dictado:`;
  - ungathered background: `Antecedentes aún no recabados.`

  Word boundaries are Unicode-aware, because JavaScript's `\b` stops at
  accented letters. The verbatim matcher now treats accented letters as
  letters, and sentence splitting knows Spanish titles and capitals.
- **Corrected figures** (`superseded.ts`). This only runs when her notes carry
  a correction cue ("corrected herself", "revised", "more like"; "digo",
  "o sea", "más bien", "mejor dicho").
  - The model quotes each old and new pair.
  - The server keeps a pair only if both quotes are in her notes word for
    word, in order, with a cue between or just after.
  - It then removes a clause that states the old figure, and only from a
    sentence that also states the new one.
  - A draft that kept only the old figure is not rewritten. It is reported in
    the note's chat ("the draft still says …, which you corrected").

## Measured

Fabrication rate / salient facts / safety facts.

| Corpus | Before | After |
| --- | --- | --- |
| English, 20 fixtures | 5.0% / 86.6% / 100% | **0.0%** / 86.2% / 100% |
| English, owner format | 0% / 90.0% / 100% | 0% / 90.0% / 100% |
| Spanish SOAP/intake, tuning | 6.1% / 48.3% / 66.7% | **3.0%** / 51.7% / **78.8%** |
| Spanish SOAP/intake, held-out | 4.5% / 44.5% / 72.7% | 4.5% / 47.5% / **90.9%** |
| Spanish owner format, tuning | 12.1% / 85.2% / 90.9% | 12.1% / 85.6% / **93.9%** |
| Spanish owner format, held-out | 4.5% / 85.8% / 90.9% | 4.5% / 86.4% / **95.5%** |

"Before" for English is yesterday's final run. For Spanish it is `4380737`,
with the checks off for Spanish notes.

## What is left

The remaining Spanish fabrication is two kinds:

- **`03-si-y-hi`:** the draft writes "HI" for a source that says "SI y HI".
  This is a scorer ban on the English abbreviation, not a server step.
- **Spoken corrections where the draft kept only the old figure.**
  `02-mejor-dicho-cuatrocientos` keeps "cuatro mil", and
  `01-o-sea-dos-y-media` keeps "no duerme nada". The corrected-figure step
  reports these in the note's chat but does not rewrite them; that was
  deliberate. Turning "cuatro mil" into "cuatrocientos" inside a sentence the
  model wrote is prose the server cannot stand behind.

  The lever that would close them is cutting the spoken correction out of the
  transcript before drafting, as English retractions do. That needs Spanish
  retraction markers, and the marker list only grows from her real dictations
  (`retractions.ts`).
