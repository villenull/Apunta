# P3.6 resume anchor — attempt 2 (CODE/UNIT phase)

This file is the first thing a fresh session reads. It records what is done,
what is open, and what the next action is. Created and updated by every attempt.

## Identity

| Field | Value |
| --- | --- |
| Card | P3.6 Linux AppImage integration |
| Attempt | 2 of 3 (root-allocated after attempt 1's V0 was supervisor-killed mid-bundle) |
| Base commit (dispatch `- Base commit:` header, read by hand per S1) | `62abb28` |
| Dispatch | `docs/v2/state/dispatch/P3.6.md`, attempt 2 of 3, port 7879 |
| Sandbox port | 7879 (never 7717, HS-1) |
| HEAD when this phase ran | `b9a9e82` |

## Artefact provenance

| Artefact | Status | Path | sha256 | size | mtime |
| --- | --- | --- | --- | --- | --- |
| Test AppImage (V0 output) | **BUILT, exit 0** | `src-tauri/target/release/bundle/appimage/Apunta (test)_0.0.0_amd64.AppImage` | `e6dd3ecb13f615f01223ded8be2be9e7154b49434dcd01b4e34ae170e109f39a` | 194214392 | 2026-10-03 22:15:39 -0600 |
| Production AppImage (V1 output) | **NOT BUILT** | — | — | — | — |

The test image is a **new artefact**, not P3.4's leftover: same name, different
bytes (P3.4's was `d7fb91513e8c68b0a2e74628e7643e3079a60946866110979cb1815022d234df`,
194202104 bytes). V0 ran exactly once under `setsid`, exit 0, 134 s. Evidence:
`attempt-2/build-preparation/05-v0-run.txt`, `v0-full-stdout.log`.

## Row-by-row status (actual, measured — not the card's approval)

| Row | Status | Evidence | Note |
| --- | --- | --- | --- |
| V0 | **PASS** (exit 0) | `attempt-2/build-preparation/05-v0-run.txt` | producer + `tauri:build:test` + identity guard; build worker's lease |
| V1 | **NOT RUN** | — | production build; not this phase |
| V2 | **NOT RUN** (anchor holds) | `attempt-2/build-preparation/02-s1-anchors.txt` | `diff -r` icons empty; recorded as S1 anchor, not executed as a row |
| V3 | **NOT RUN** | — | native UI; gated on source review of the harness |
| V4 | **NOT RUN** | — | AppImage extraction; not this phase |
| V5 | **NOT RUN** | — | reads P3.3 evidence; not this phase |

## Flows — which completed, in order, by name

**None.** V3 has not run. The harness is authored and passes scoped static
checks (nodecheck, eslint, prettier) but has not driven the app. A flow is
recorded here only when V3 runs and reads its fact.

## Rule B drift

Rule B's set has **not** moved since V0 last ran. `git status --porcelain` over
the set is empty; the only newer files are under `src-tauri/target/` (build
outputs, which Rule B names as outputs, never inputs). Newest mtime under the
set's input paths predates V0. The freshness predicate
(`git diff --name-only 62abb28...HEAD -- <Rule B set>`) is therefore empty and a
resumed session may not claim V0 was needed.

## Whisper candidate (A06, P3.4's S0 — precondition, not this card's work)

| Field | Value |
| --- | --- |
| Path | `~/.cache/apunta-v2/whisper-src/whisper.cpp/build-vulkan/bin/whisper-cli` |
| mode | `-rwxr-xr-x` (executable) |
| size | 1064648 bytes |
| mtime | 2026-10-02 13:00:05 -0600 |

## V5 outcome

Not run. V5 asserts P3.3's fatal-mode evidence
(`docs/v2/evidence/P3.3/V4-fatal.md`) carries `Status: **PASS**` and both
lifecycle-code lines; it reads committed files and starts nothing.

## What this phase built (CODE/UNIT, outside Rule B)

`scripts/v2/tauri-e2e-smoke.test.mjs` (new, 1757 lines) — the V3 harness. One
mode `smoke` (any other argument exits 2). It resolves the test-identity AppImage
glob once, captures both pipes, launches under a private headless env
(`GDK_SCALE=1`, `GDK_DPI_SCALE=1`, `GDK_BACKEND=x11`, unset `WAYLAND_DISPLAY`),
**measures** the frame-to-client relationship from two captures (no guessed
decoration offset), reads the scale off the app's own line and requires 1, drives
the eleven flows with screenshot-grounded colour-cluster clicks plus the app's
own keyboard, asserts the CSP over the app's origin, asserts all five
containment facts, and stops the child by pid (server pid from the shell's own
line, then the child). No listeners, no `pkill`, no observation hook, no
producer wrapper, no source edit.

Scoped static checks (this phase, all green): `node --check`, `eslint`,
`prettier --check`. No build, no global tests, no typecheck, no native UI, no
audio — those belong to the runtime phase after source review.

Implementation evidence: `attempt-2/implementation/`.

## nextAllowedAction

Source-review `scripts/v2/tauri-e2e-smoke.test.mjs` against the V3 row, then run
V3 (and V1, V4, V5) in the card's order under `sandbox.mjs env --port 7879`.
