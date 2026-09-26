# Evidence: S1.3 Spoken Spanish, corrections, and Piper voices (RESEARCH)

Working directory: repo root (`~` project checkout, `feature/v2`).

## Commands run

| Time (UTC) | Command | Exit | Excerpt |
| --- | --- | --- | --- |
| 2026-09-26 | `git log -1 --format='%H %s'` (+ `git status --short`, `git branch --show-current`) | 0 | `33ad1a7… Record card S1.2 APPROVED (v2 coordination state)`; branch `feature/v2`; only coordinator state files (`docs/v2/state/*`) new/modified — left alone, nothing committed. HEAD == dispatch base commit `33ad1a7`. |
| 2026-09-26 | Web research (search + page reads, public pages only, no logins, no downloads) | n/a | ~10 searches + 9 page reads: discourse-marker taxonomy (UDEP, Wikipedia, RAE NGLE/DLE); PRESEEA Boletín de Filología 60(2)/2025; Graham 2025 CDMX hesitation markers; Guillén Escamilla 2026 CDMX *de plano*; UGA thesis (bueno/pues); TranscribeMe + GoTranscript + Vero + AAPC note conventions; Vocova 2026 Whisper benchmark (full page); OpenAI large-v3 release discussion; whisper.cpp README + models README (extracts); OHF-Voice/piper1-gpl + setup.py + rhasspy/piper; piper-voices es_MX / ald / claude / en_US / lessac / ljspeech listings + 5 MODEL_CARDs read in full. Full URL list in `docs/research/es-mx-speech.md` §1. |
| 2026-09-26 | In-repo reads (no launch, no downloads) | n/a | `server/src/ai/retractions.ts` (English marker list + narrow-list principle); `docs/v2/ACQUISITION.md` (A09/A10, L-POLICY rows); `docs/v2/cards/P3.5.md` (fixture needs); `scripts/build-whisper-candidate.sh` (pinned ggml-org/whisper.cpp@371b5a7); `docs/research/es-mx-clinical-documentation.md` §§1–3 (S1.1 method/labels convention reused). |

## Criteria

- V1 (prettier check): PASS, exit 0 (`npx prettier --check` on research + evidence + return files: "All matched files use Prettier code style!"). L0 companion `node scripts/check-no-external-urls.mjs`: exit 0.
- V2 (reviewer reads): NOT RUN — for the reviewer. Self-assessment: all four questions answered; Q1 ranked 1–10 with literature-backed top half and `[not found]`+provisional bottom half; Q2 filler inventory + drop-recommendation with convention sources; Q3 Spanish WER table (large-v3 2.9%) with read-speech caveat + es_MX-dictation `[not found]`; Q4 maintained repo (OHF-Voice/piper1-gpl, GPL-3.0) + all 3 es_MX voices + 1 recommended en_US voice (ljspeech-medium) each with model-card URL and redistribution position (`[not found]` on all five cards, with exactly what was checked); L-POLICY row 4 consequence stated (generate at test time, never commit). Every factual claim carries a URL; no clinical examples anywhere.

## Notes

- No sandbox used (L0 docs-only card; no server/db launched). No acquisitions (HS-3: no downloads). No HS contact (no port 7717, no live data, no live export/PDFs).
- Fabricated-data rule respected: only isolated marker words and short non-clinical phrases; no transcript-like content. Competitor text never copied (transcription vendor guides paraphrased for the convention only).
- Changed paths (uncommitted, left for review): `docs/research/es-mx-speech.md` (new), `docs/v2/evidence/S1.3/evidence.md` (this file), `docs/v2/state/returns/S1.3.md` (return).
