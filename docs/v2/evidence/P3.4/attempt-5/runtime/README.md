# P3.4 attempt 5 — runtime continuation evidence

The once-only acceptance rows V0–V4 of `docs/v2/state/dispatch/P3.4.md`, run
in card order after the authenticated installation gate, on the pinned build
lease and sandbox port 7835. Read alongside
`docs/v2/state/dispatch/P3.4-runtime.md` (this session's brief),
`docs/v2/evidence/P3.4/attempt-5/COORDINATOR.md` (what was already CLEAR) and
`docs/v2/state/returns/P3.4.md` (the return this session updated).

No source, config, tool, card, checkpoint, contract or fixture was edited. No
row was repeated, no criterion was changed, and no failure was waived.

## Row verdicts

| Row | Status | Exit | Evidence | One line |
| --- | --- | --- | --- | --- |
| setup | PASS | 0 | `01-setup-am190-scanner.txt` | AM-190 scanner scratch + `GSTREAMER_HELPERS_DIR`, in V0's own build environment |
| V0 | **PASS** | 0 | `02-V0.txt` | 20:27:38Z→20:29:54Z; counts 1 / exactly 0 / 16; AppImage built |
| AM-190 dry inspections | **PASS** | 0 | `03-am190-four-dry-inspections.txt` | appsink, autoaudiosrc, alsasrc, pulsesrc all visible through the bundled executable scanner, fresh registry each |
| V1 | **PASS** | 0 | `04-V1.txt` | 1 file collected, 12 passed, 0 skipped |
| V2 | **FAIL** | 1 | `05-V2.txt` | 16/17 PASS, 1 FAIL, 2 NOT RUN; all five containment assertions PASS |
| V3 | **PASS** | 0 | `06-V3.txt` | `matches: 0`, no `capabilities/`; see the command-extraction note |
| V4 | **FAIL** | 1 | `07-V4.txt` | `npm test` 2235/2235 PASS, then `npm run lint` red on two **committed evidence artifacts** outside May edit — stop, not repair |

## What is proven in the shipped binary

- **(a) rule 4.** `tauri=undefined`, and the built-in IPC probe is **denied**:
  `ipc=object`, `ipcInvoke=function`, `ipcProbe=rejected`,
  `ipcProbeMsg=Command plugin:event|listen not allowed by ACL`. Attempt 4's
  `(a)` FAIL is resolved by AM-188's approved ACL check and measurement, and it
  is recorded here as read, not reinterpreted.
- **(d) header half.** A real `text/html` response over the app's own origin,
  `GET /patients`, status 200, carrying all six of rule 6 verbatim plus
  `style-src 'self' 'nonce-…'` and `style-src-attr 'unsafe-inline'`, with no
  extra source in any of the six.
- **(e).** `styleAttr` and `styleComputed` agree, so an inline style attribute
  really applies in the shipped binary.
- **Containment.** All five: no surviving process, no second lock/db/-wal/-shm,
  port free afterwards, the observation channel gone and unshippable, `ollama`
  still running.

## What is not proven

- **(d) handler half — FAIL.** The click did not land: *"pointer is not over the
  app window: WINDOW=0 PID=undefined"* after `getwindowgeometry`, `mousemove`
  and `getmouselocation`. The rectangles were published and correct, so this is
  the actuation half. Not retried, no corrective click, no timeout widened.
- **(b) and (c) — NOT RUN.** The hook published no attempt naming either,
  because the note never opened, so `scriptText` never turned true — the card's
  own precondition for those two. Neither is `PASS`.
- **V4 — FAIL.** `npm test` is green (2235/2235) and `npm run lint` is red on
  13 eslint errors that all live in two committed `.mjs` evidence artifacts from
  other workers (`attempt-5/review/03-independent-integration-probe.mjs`, 4
  errors; `P3.5/runtime-readiness/v5-provenance.unescaped.mjs`, 9 errors). No
  source path and no May-edit path is named. Per the card and HS-9 this is a
  stop for root, not a repair, and the row was run once. Root was already
  renaming the P3.5 witness in its own commit; that does not convert this row.

## Files

| File | Contents |
| --- | --- |
| `00-scope-and-authority.txt` | authority, drift check, pinned command hashes, lease |
| `01-setup-am190-scanner.txt` | the AM-190 setup, before V0 |
| `02-V0.txt` | V0 — the re-bundle |
| `03-am190-four-dry-inspections.txt` | the four dry bundled-plugin inspections |
| `04-V1.txt` | V1 |
| `05-V2.txt` | V2, the full row log |
| `06-V3.txt` | V3, including the markdown-pipe extraction note |
| `07-V4.txt` | V4 and its stop |
| `08-containment-cleanup-and-side-effects.txt` | pid-only cleanup, free port, new side effects for the checkpoint |

All sandbox paths are sanitised to `<sandbox>` and the home folder to `~`.