# P3.5 silence-arm completion — proposal evidence

Read-only preparation for `docs/v2/state/P3.5-SILENCE-COMPLETION-PROPOSAL.md`.
**No grant is claimed and nothing runtime was run.** No sandbox folder was
created, no port bound, no server or app started, no database opened, no build,
no install, no model, no audio, no `pactl` mutation, no display, no input, no
network, no `7717`. The only writes in this folder are these seven files plus
the proposal; the working scripts live in git-ignored
`build/p35-silence-proposal/` (`.gitignore:55 build/`, confirmed by
`git check-ignore -v` in `07-verification.txt`).

## What each file is

| File | What it shows |
| --- | --- |
| `01-source-facts.txt` | The code as it stands: `resolveSandboxDataDir` (`scripts/v2/sandbox.mjs:177-201`), `printEnv`'s seven exports (`:299-310`), `cmdEnv` (`:353-362`), `platformDataDir` (`shared/src/platform-paths.ts:25-41`), the harness's own refusals and its child-env overrides (`scripts/v2/tauri-audio.test.mjs:121-141`, `:663-690`), plus the two env files the 22:40:18 run left on disk. |
| `02-resolver-proof.txt` | The wrapper's **own exported** `resolveSandboxDataDir` called on a synthetic folder: case A reproduces the refusal verbatim with the leaked `APUNTA_DATA_DIR`, case B accepts once the seven names are absent, case C refuses the real default folder so the guard is shown intact, and a final line shows the synthetic folder does not exist. |
| `03-env-isolation-proof.txt` | The shell flow only, with a stub that prints the sandbox keys a call can see: A is the card's cell as written (both calls in one shell, seven keys inherited), B is the proposal (subshell scoping, plus targeted `env -u` from a deliberately contaminated parent, with `HOME`, `XDG_*`, `DISPLAY`, `DBUS_SESSION_BUS_ADDRESS`, `PULSE_SERVER`, `WAYLAND_DISPLAY` printed from inside the isolated call), C is what this host routes Pulse through. |
| `04-command-derivation.txt` | The completion command, derived mechanically from the card's V4 command cell through `plan-lib.mjs`'s `parseCells` and a `&&`-split — not retyped. Also prints the segment list, the patch copy, and the byte comparisons. |
| `05-v5-checker-dry-run.txt` | V5's own acceptance checker, extracted verbatim from the card's V5 cell, run twice read-only: against the real checkpoint (reproduces the recorded `FAIL`) and against a **synthetic** scratch copy with one appended attempt-4 record and anchor (exit 0, "V5 ignoring 7 PREV_DEFAULT record(s) from earlier attempts"). |
| `06-prepared-card-repair.diff.txt` | The future V4 command repair — each arm in its own subshell — as a diff against the real card. One hunk, one line, Expected cell byte-equal. |
| `07-verification.txt` | `bash -n` on all three extracted shell bodies (exit 0 ×3), `node --check` on the three scratch scripts (exit 0 ×3), `npm run typecheck` clean, `git check-ignore -v`, and the tree state. |

## Two things stated plainly

- The synthetic checkpoint in `05` is **not provenance**. The real
  `V4-silence` record can only come from the silence arm's own `RECORD {...}`
  stdout line, byte-equal to that run's `p3.5-capture-record.json`, exactly as
  `attempt-4/runtime/README.md` records for V3 and V4-tone. Nothing is invented,
  back-filled, sorted, deduplicated, restamped or deleted.
- The PASS labels in this folder are real labels about real commands: `bash -n`
  parsed the shell bodies, the resolver accepted/refused as printed, the
  checker exited as printed. Nothing here claims a capture happened.