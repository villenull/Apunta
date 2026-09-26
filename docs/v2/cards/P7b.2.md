# P7b.2 Refreshed sanitized audit

| Field | Value |
| --- | --- |
| Parent | P7b |
| Role | RESEARCH |
| Level | L0 |
| Contracts | none |
| Depends | P7b.1, S5.R, P6.R, P4.R, P3.R |
| Findings | R18 |
| Confidence | n/a |

## Objective
Re-run P7a.1's method over everything v2 added (including evidence, reports,
screenshots, fixtures and release configs), with the same sanitization.

## Read
As P7a.1.

## May edit
`docs/v2/PUBLIC-REPO-AUDIT.md` (a dated second section); the restricted raw
folder.

## Must not edit
Anything else.

## Verification
| ID | Command (cwd: repo root) | Expected |
| --- | --- | --- |
| V1 | `node scripts/v2/check-identifiers.mjs` | exit 0 |
| V2 | the P7a.1 V2 email check on the audit file | no matches |
| V3 | reviewer reads | the second section covers every path added on `feature/v2` since `main` |
