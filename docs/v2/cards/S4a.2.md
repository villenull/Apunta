# S4a.2 Spanish speech benchmark and selection

| Field | Value |
| --- | --- |
| Parent | S4a |
| Role | MEASUREMENT |
| Level | L3 |
| Contracts | C-STT@1, C-ACQ@1 |
| Depends | S4a.1, P4.1 |
| Findings | R01, R08, R20 |
| Confidence | n/a |

## Objective
Apply C-STT@1 exactly and produce `SELECTED <file>` or
`NO QUALIFYING CANDIDATE`.

## Read
`server/src/ai/whisper.ts` (transcript and preview flags);
`shared/src/transcribe.ts`; the audio from S4a.1.

## May edit
`scripts/v2/stt-benchmark.mjs` (new); `docs/eval-reports/<date>-es-mx-whisper-benchmark.md`
(new); `docs/v2/state/STT-SELECTION.json` (new).

## Must not edit
Production code (P4.3 wires the selection in).

## Fixed decisions
- Download the six candidates (A07) with the hardened downloader from P4.1
  into `<sandbox>/models/`; verify publisher checksums where published and
  record SHA-256 and size.
- Metrics and thresholds exactly as C-STT@1. Word error rate and
  clinical-term exact rate are reported for every candidate; the selection
  uses only the contract's rule.
- `STT-SELECTION.json`: `{ "result": "SELECTED"|"NO QUALIFYING CANDIDATE",
  "file", "size", "sha256", "preview": same shape or null, "evidence" }`.

## Verification
| ID | Command (cwd: repo root) | Expected |
| --- | --- | --- |
| V1 | `node scripts/v2/stt-benchmark.mjs --audio <sandbox>/audio-es --models <sandbox>/models` | exit 0; per-candidate table |
| V2 | `node -e "const s=require('./docs/v2/state/STT-SELECTION.json');process.exit(['SELECTED','NO QUALIFYING CANDIDATE'].includes(s.result)?0:1)"` | exit 0 |
| V3 | reviewer recomputes the selection from the table using C-STT@1 | same result |

## Stop conditions
A candidate cannot be downloaded within the approved hosts: record it as
unavailable (it does not qualify); do not substitute another file.
