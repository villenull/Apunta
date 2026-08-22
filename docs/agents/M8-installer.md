# M8 — Double-clickable macOS installer

**Depends on:** M7

## Goal

Turn Practice Notes from "a repo a developer runs" into "an app a therapist
installs herself." The target user has never opened Terminal, does not have
Homebrew, and will not clone a git repository. She downloads one file, drags
it to Applications, opens it, and follows a progress bar.

After M7 the app works on a developer's Mac via `scripts/setup-macos.sh`.
M8 removes every step of that which requires a terminal.

## The bar to clear

A person who cannot use a command line must be able to go from a downloaded
file to a drafted note without help, and without ever seeing a shell, a
package manager, or a git command. If any failure mode dead-ends at "open
Terminal and run…", the packet is not done — it must recover in the UI or
explain itself in plain language.

## Critical constraint: you cannot verify this here

This container is Linux. You **cannot** build, sign, notarize, or run a macOS
app bundle in it. Do not pretend otherwise, and do not mark acceptance
criteria passed on the basis of code that has never executed.

Your job is to produce the build tooling, the app shell, the first-run
experience, and the documentation, verified as far as static checks allow
(lint, typecheck, unit tests of any pure logic, a dry-run of the build script
that stops before the macOS-only steps). Final acceptance is a **manual run
on the owner's Mac**, and the packet ships with a checklist for that run. Say
clearly in your report which criteria are verified and which await the Mac.

## Deliverables

### 1. Zero external dependencies in the shipped app

The packaged app must not require Homebrew, Node, Ollama, or anything else
preinstalled. Bundle inside the app:

- **`llama-server`** (llama.cpp, MIT) as the LLM runtime instead of Ollama.
  The app already talks to an OpenAI-compatible API and PLAN §2 requires
  llama.cpp to work, so this validates that portability rather than
  contradicting it. Ollama stays the documented choice for developer setup.
- **`whisper-cli`** (whisper.cpp, MIT) for transcription.
- **`ffmpeg`** for audio conversion — use an LGPL build and check what its
  license obliges you to ship (see deliverable 6).
- **The Node runtime**, or a single compiled server binary (Node SEA), so
  the server runs with nothing installed.

All binaries must be arm64 (Apple Silicon) at minimum. State plainly whether
you are also shipping x86_64 or a universal binary, and why.

### 2. App shell

A native macOS app bundle, `Practice Notes.app`, that owns the server
lifecycle and opens the UI in the user's default browser. The UI stays a
browser tab — do not turn this into a webview app.

A **menu-bar (status item) app** is the intended shape: the icon shows
running state, and its menu offers Open Practice Notes, Stop, and Quit.

Choose the shell technology yourself and record the choice with reasoning in
`docs/decisions.md`. Tauri v2 is the recommended starting point (small
bundles, first-class signing/notarization tooling, tray support); Electron is
the fallback if staying entirely in TypeScript matters more than download
size. Whichever you pick, justify it against bundle size, toolchain cost, and
maintenance burden.

Behavior:

- Launching the app starts the server on 127.0.0.1 and opens the browser.
- Quitting stops the server and any model processes cleanly — no orphans.
- If the port is occupied, pick the next free one and open that.
- Only one instance runs at a time; launching again focuses the existing one.

### 3. First-run setup window

On first launch — and whenever something required is missing — show a native
window that:

1. Checks free disk space **before** downloading anything and refuses
   politely with a specific number if there is not enough.
2. Downloads the LLM and speech models with a real progress bar (percent,
   size, time remaining), resumable across quit/relaunch, verified by
   checksum after download.
3. Picks the model tier from the machine's RAM, and says in plain language
   which model it chose and why.
4. On success, launches straight into the app.

Failure handling is the point of this deliverable. Network loss mid-download,
a corrupted file, a full disk, and a download the user cancels must all
produce a plain-language explanation and a working Retry — never a stack
trace, never an instruction to use Terminal.

### 4. Distribution artifact

- A `.dmg` with the app and an Applications shortcut, built by a repeatable
  script (`npm run package:mac` or equivalent) that runs on a Mac.
- The installer itself stays small (roughly ~100MB): models download on
  first run rather than being bundled, which also keeps model licensing at
  arm's length since we never redistribute weights.
- **Code signing and notarization**: unsigned apps are blocked by Gatekeeper
  with a scary dialog, which defeats this packet's entire purpose. Signing
  requires an Apple Developer Program membership ($99/year) that the owner
  must decide on. Build the signing and notarization steps into the script,
  driven by environment variables, so they run when credentials exist and are
  skipped with a clear warning when they do not. Document both paths,
  including the right-click→Open workaround for the unsigned case and why it
  is a poor substitute.

### 5. No auto-update, no telemetry

Hard rule 1 has no exception for updaters. The app must not phone home to
check for versions, and must not report usage. If you offer an update path at
all, it is a user-initiated "Check for updates" menu item that opens the
releases page in a browser — never a background request. Do not enable your
shell framework's built-in updater.

### 6. Licenses and attribution

Shipping other people's binaries carries obligations. Produce
`THIRD-PARTY-LICENSES.md` covering every bundled binary and library, and
verify what the ffmpeg build you chose requires — LGPL builds have conditions
around linking and source availability that must actually be satisfied, not
waved at. If a bundled component's license cannot be cleanly satisfied,
report that rather than shipping it; do not treat this as a formality.

Surface the licenses in the app's About page alongside the existing privacy
statement.

### 7. Uninstall

A documented, complete removal: the app, the models, the data directory, and
any LaunchAgent from M7. Explain what deleting the data directory destroys
(all patients and notes) and how to back it up first. Prefer a menu item that
reveals the data folder in Finder over instructions describing a path.

### 8. Non-technical install guide

`docs/INSTALL.md`, written for someone who has never used a terminal: what to
download, what each screen will look like, roughly how long the download
takes, what to do if macOS warns about an unidentified developer, and how to
tell it is working. No jargon, no commands. This is documentation for the end
user, not for a developer.

## Acceptance criteria

Verifiable here:

- Build tooling, app shell source, and first-run logic are committed; lint,
  typecheck and the existing test suite stay green.
- Pure logic — disk-space math, tier selection from RAM, checksum
  verification, download resume bookkeeping — is unit-tested without needing
  macOS.
- `THIRD-PARTY-LICENSES.md` and `docs/INSTALL.md` exist and are complete.
- The packaging script fails loudly and clearly when run on a non-Mac rather
  than producing a broken artifact.

Requires the owner's Mac (ship as a manual checklist in the PR description):

- `npm run package:mac` produces a `.dmg`.
- On a Mac that has never had Homebrew, Node, or Ollama: install from the
  `.dmg`, complete first-run setup, record a note, and get a draft — without
  ever opening Terminal.
- Quit and relaunch: the app reuses the downloaded models and starts fast.
- Kill the app mid-download, relaunch, and confirm the download resumes.
- Uninstall per the documented steps leaves nothing behind.
