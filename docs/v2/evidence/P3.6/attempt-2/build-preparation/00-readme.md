# P3.6 attempt 2 — BUILD phase: V0 preparation and execution

| Field | Value |
| --- | --- |
| Card | P3.6 Linux AppImage integration, **BUILD phase only** |
| Attempt | 2 of 3 (root-allocated; not a silent within-attempt retry) |
| Base commit (dispatch header) | `62abb28` |
| Dispatch | `docs/v2/state/dispatch/P3.6.md`, sha256 `a39092ca189ebd2098221722c61979adbe4d3db843c6c43ce1a6cc82bc57b83e`, generated at `8507952`, header `port 7879`, `attempt 2 of 3` |
| HEAD at execution | `b9a9e82` |
| Working directory | repository root |
| Sandbox port | 7879 (card's pinned port; not 7717, HS-1) |
| Lease | exclusive native BUILD / global compile lease held; the concurrent `scripts/v2` harness author works outside Rule B and was not touched |

## What ran, and what deliberately did not

Ran: **S0** (read-only), **S1** anchors (read-only, no gratuitous change), **V0**
exactly once, and the **AM-190 authorised four dry AppDir plugin inspections**.

Not run, by instruction and by scope: **V3** (native UI), **V1** (production
build), **V2**, **V4**, **V5**. No acceptance decision is claimed for any of
them. No app was launched, no audio device opened, no microphone touched, no
model loaded, no inference run, no live 7717 contact, no user data read.

The owner's browser preview on **7811 / pid 3095449** was observed alive before
the build (`03:11:21` elapsed at first check, `03:17:09` at the second) and was
never signalled, never bound and never restarted.

## Statuses — actual, measured, not the card's approval

| Item | Status | Exit | Evidence |
| --- | --- | --- | --- |
| S0 A06 whisper precondition | **PASS (anchor holds)** | 0 | `01-s0-whisper-precondition.txt` |
| S1 anchors (icons, V3 invariant, drift, pins) | **PASS** | 0 | `02-s1-anchors.txt` |
| Pre-build provenance recorded | **PASS** | 0 | `03-prebuild-provenance.txt` |
| V0 command decode (owned codec) | **PASS** | 0 | `04-v0-command-decode.txt` |
| **V0 (producer + `tauri:build:test` + identity guard)** | **PASS** | **0** | `05-v0-run.txt`, `v0-full-stdout.log` |
| AM-190 scanner preparation | **PASS** | 0 | `06-am190-scanner-and-four-dry.txt` |
| AM-190 four dry AppDir plugin inspections | **PASS (all four visible)** | 0 | `06-am190-scanner-and-four-dry.txt`, `am190-four-dry-inspections.log` |
| Attempt 1's V0 | **BLOCKED — interrupted, no attributable exit** | none | `07-attempt-1-interruption.md`, `attempt-1-interrupted-v0.log` |

AM-149, observed rather than assumed: `08-am149-observation.md`.

## Artefact provenance — a new artefact, not the old one borrowed

The row's identity guard cannot tell a fresh build from a leftover, because the
artefact name is derived from the config and both runs produce
`Apunta (test)_0.0.0_amd64.AppImage`. The hashes are what separate them, and both
were recorded:

| | sha256 | size | mtime |
| --- | --- | --- | --- |
| Pre-existing (P3.4's run) | `d7fb91513e8c68b0a2e74628e7643e3079a60946866110979cb1815022d234df` | 194202104 | 2026-10-03 16:39:34 -0600 |
| **Produced by this V0 run** | `e6dd3ecb13f615f01223ded8be2be9e7154b49434dcd01b4e34ae170e109f39a` | 194214392 | 2026-10-03 22:15:39 -0600 |

Same name, different bytes. The image V3 will later drive is this run's.

## Nothing was acquired, installed or repaired

No download, no `git clone`, no `git fetch`, no new whisper revision, no backend
change, no `apt`/`pacman`, no `npm install`, no package wrapper, no
`src-tauri/**` edit, no config edit, no card, tool, manifest or coordinator-state
edit. The whisper candidate is A06's, already pinned and already executable; this
card consumed it as a precondition. `linuxdeploy` came from the existing
`~/.cache/tauri` cache, so the bundler needed no network. The one disclosed
redundant pinned fetch (the producer's own) was inside the card's authorized
producer scope and was not extended, re-aimed or given authority this session.