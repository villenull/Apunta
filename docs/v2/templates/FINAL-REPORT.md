# Apunta v2: final report

Every status in this template starts unverified. Replace a status only with
evidence at the final commit.

- Final commit on `feature/v2`: NOT RECORDED
- Harness (from C0.1): NOT RECORDED
- Plan version: 2

## Status matrix

| Card | Status | Attempts | Commits | Evidence |
| --- | --- | --- | --- | --- |
(one row per card from `state/PROGRESS.json`)

## Platforms

| Platform | Status |
| --- | --- |
| Linux (AppImage) | NOT VERIFIED |
| macOS | CONFIGURED, NOT RUNTIME-VERIFIED |
| Windows | CONFIGURED, NOT RUNTIME-VERIFIED |

## Spanish release gate (C-ES-GATE)

| Gate | Status | Evidence |
| --- | --- | --- |
| UI complete | NOT RUN | |
| Instrument controls | NOT RUN | |
| Speech model selection | NOT RUN | |
| Spanish setup and speech integration | NOT RUN | |
| Pipeline acceptance on held-out set | NOT RUN | |
| English non-regression | NOT RUN | |
| Spanish spell check | NOT RUN | |
| Owner clinical verdict | NOT RUN | |

Spanish remains **held** unless every row is PASS; releasing it is an owner
action.

## Measurements
English baseline and final (pipeline and provider), Spanish tuning and
held-out results, speech benchmark: tables with numerators, denominators,
model digests, prompt and corpus hashes.

## Traceability
Copy `TRACEABILITY.md` with the execution status column filled.

## Amendments and blocked items
From `state/AMENDMENTS.md` and `state/BLOCKED.md`.

## Owner-only actions
From `DECISIONS.md` and `state/OWNER-ACTIONS.md`, each with exact steps.
