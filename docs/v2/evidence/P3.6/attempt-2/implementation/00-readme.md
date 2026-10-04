# P3.6 attempt 2 — CODE/UNIT phase: implementation evidence

| Field | Value |
| --- | --- |
| Card | P3.6 Linux AppImage integration, **CODE/UNIT phase** |
| Attempt | 2 of 3 |
| Base commit (dispatch header) | `62abb28` |
| Working directory | repository root |
| Node under test | v24.19.0 (`~/.local/share/apunta-node/node-v24.19.0-linux-x64/bin`) |
| Phase owner | harness author (outside Rule B); build worker owns `attempt-2/build-preparation/` |

## What this phase built

One new file, outside Rule B's set:

- `scripts/v2/tauri-e2e-smoke.test.mjs` — the V3 harness (1757 lines).

It is the only path this phase wrote. No `npm install`, no dependency, no build,
no global test suite, no typecheck, no native UI run, no audio, no producer
wrapper, no `src-tauri/**` or `web/**` or `server/**` edit, no config edit, no
card/coordinator-state edit.

## What the harness does (summary)

One mode `smoke`; any other argument exits 2. It:

- resolves the test-identity AppImage glob (`'Apunta (test)_'*.AppImage`) **once**,
  failing with the directory listing on zero or more than one match;
- captures both pipes and launches under a private headless env
  (`GDK_SCALE=1`, `GDK_DPI_SCALE=1`, `GDK_BACKEND=x11`, unset `WAYLAND_DISPLAY`,
  sandboxed `XDG_*`/`HOME`);
- **measures** the frame-to-client relationship by cropping the display capture
  at the window geometry and comparing it pixel-for-pixel with the window
  capture — identical means the client origin is the window origin; a difference
  stops the run rather than being worked around with a guessed decoration offset;
- reads the scale off the app's own stderr geometry line and requires it to be 1;
- drives the eleven flows (onboarding, capture, draft, refine, publish+copy,
  patient list, plan, briefing, brainstorm, settings, backup) with
  screenshot-grounded colour-cluster clicks for primary actions and the app's
  own keyboard (Tab/Return/Escape/typing) for controls that carry no colour;
- asserts the Content-Security-Policy over the app's own origin (rule 6's six
  directives verbatim plus the two additive ones, nonce non-empty);
- asserts all five containment facts (no run process remains, no second
  lock/db/-wal/-shm, port released, observation channel gone from the bundle,
  ollama still running);
- stops the child by pid — SIGTERM to the server pid from the shell's own
  `apunta: spawned the bundled server as pid <N>` line, then SIGKILL on that
  pid, then the child pid. Never `pkill`, never a pattern;
- binds no port and opens no listener of its own (inherits `APUNTA_PORT`).

The capture flow reuses P3.5's approved virtual-audio containment: a fabricated
fixture is played into a virtual sink whose remap source becomes the default
capture device, so the owner's physical microphone is never read; the teardown
restores the remembered default and unloads both modules on every exit path.

## Scoped static checks — actual results

Run at the repository root, Node v24.19.0. These are the only checks this phase
ran; they are static and touch no process, no window, no display, no audio.

| Check | Command | Exit | Result |
| --- | --- | --- | --- |
| Syntax | `node --check scripts/v2/tauri-e2e-smoke.test.mjs` | 0 | clean |
| Lint | `npx eslint scripts/v2/tauri-e2e-smoke.test.mjs` | 0 | no errors, no warnings |
| Format | `npx prettier --check scripts/v2/tauri-e2e-smoke.test.mjs` | 0 | "All matched files use Prettier code style!" |

Start (UTC): `2026-10-04T04:28:40Z`  End (UTC): `2026-10-04T04:28:41Z`

## Honest limits of this phase

- The harness has **not** been run against the app. V3 is gated on source
  review; no flow is claimed complete and no row is claimed PASS.
- The colour-cluster click grounds **primary (accent) actions** in screenshots.
  Controls that carry no colour (list rows, text buttons, option tiles) are
  driven by the app's own keyboard and verified by the fact each produces; if a
  fact does not materialise the flow FAILs or records NOT RUN honestly rather
  than passing on a picture.
- The Copied control's feedback is asserted from the on-screen screenshot only;
  the host clipboard is not read and no claim is made about it.
- No vacuous assertion is present: every `check` reads a real condition (an API
  fact, a measured pixel comparison, a process state), never a literal `true`.

## File hash

`scripts/v2/tauri-e2e-smoke.test.mjs` — sha256 recorded in `02-file-hashes.txt`.
