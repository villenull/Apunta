# S4b.1 Spanish setup and speech integration

| Field | Value |
| --- | --- |
| Parent | P4 |
| Role | IMPLEMENTATION |
| Level | L3 |
| Contracts | C-LANG@1, C-ACQ@1, C-STT@1 |
| Depends | P4.4 |
| Findings | R01, R07 |
| Confidence | n/a |

## Objective
With the dev switch, a fresh Spanish setup, a later switch to Español, and
Spanish preview and final transcription all use the selected model with
`-l es`, and never fall back to the English model.

## Read
`docs/v2/state/STT-SELECTION.json`; `server/src/ai/whisper.ts`;
`server/src/ai/stt-settings.ts`; setup outputs from P4.4.

## May edit
`server/src/ai/whisper.ts`, `stt-settings.ts` and tests; `server/src/routes/transcribe*.ts`
(job context capture) and tests; `web/src` capture components (the
"Spanish speech model not installed" state); `scripts/v2/tauri-setup.test.mjs`.

## Must not edit
Prompts; the English speech path's flags.

## Fixed decisions
- C-LANG rules 4 and 7. If STT-SELECTION is `NO QUALIFYING CANDIDATE`, this
  card implements only the "not available" state and marks the remaining
  rows `NOT RUN (no model)`; Spanish stays held.
- Spanish lead-in prompt text for whisper: taken from
  `docs/research/es-mx-speech.md`, punctuated, no clinical vocabulary.

## Verification
| ID | Command (cwd: repo root) | Expected |
| --- | --- | --- |
| V1 | setup test, fresh sandbox, Español | downloads and verifies exactly the selected file(s); app opens in Español |
| V2 | English install, switch to Español in Settings | offers the single-file download; cancel leaves English working; retry completes |
| V3 | Spanish dictation of an S4a.1 clip in the app | preview and final transcript produced with `-l es`; the whisper command line in the log shows the Spanish model |
| V4 | language switched during a recording | blocked (C-LANG rule 6); the recording finishes in its captured language |
| V5 | Spanish model file removed, Español active | "not installed" state; no request to the English model (test asserts the command line) |
| V6 | `npm test && npm run lint && npm run typecheck` | exit 0 |
