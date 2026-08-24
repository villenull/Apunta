# M8 — Double-clickable macOS installer

**Depends on:** M7

## Goal

Turn Apunta from "a repo a developer runs" into "an app a therapist
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

## Correction: the runtime swap is not this packet

This packet was written asserting that the app "already talks to an
OpenAI-compatible API", so swapping Ollama for `llama-server` would be
repackaging. **That is false**, and it is worth knowing where it came from:
`docs/decisions.md` row 26 says the app "only ever speaks the OpenAI-compatible
API, so the runtime is swappable", while row 22 — four rows above it — records
the opposite as a deliberate M3 decision. The packet inherited the wrong half.

What the app actually speaks is Ollama's native API: `/api/chat`, `/api/tags`
and `/api/show`. `/v1/chat/completions` was rejected on evidence (it stranded
the answer in `reasoning` on the targeted models, ollama#15288), and
`/api/generate` too (`ChatHandler` is the only endpoint with thinking-aware
`format` handling, ollama#17544, open).

So a `llama-server` swap is **a provider rewrite the size of M3**, not a
packaging choice: SSE instead of NDJSON, different stats, errors, health and
model-naming, `num_ctx` becomes a launch flag, and the retry ladder's third
rung has no analogue. Doing it inside M8 would also make the therapist the
sole user of an untested provider, since the packet keeps Ollama for
developers.

**It belongs in its own packet, replacing the Ollama provider rather than
adding a second one** — see `docs/research/m8-shell-and-runtime-2026-08.md`.
The research makes a genuinely strong case for doing it eventually: unlike
Ollama, `llama-server` returns a typed HTTP 400 `exceed_context_size_error`
with `n_prompt_tokens`/`n_ctx` instead of silently truncating the prompt from
the head, and that single silent failure is what five separate design
compromises in this codebase exist to work around. But not here.

**M8 bundles whatever the app speaks when M8 runs.**

One thing that must survive any future migration: llama.cpp's server documents
a `response_format` shape its own parser reads as an empty schema — no grammar,
HTTP 200, unconstrained prose. Apunta re-validates every model response against
its zod schema regardless of what the runtime claims to enforce. That
discipline is what makes both runtimes safe. Do not remove it.

## Read before you start

`docs/research/m8-shell-and-runtime-2026-08.md` — the research behind every
correction above, with its findings tagged `[verified]` / `[single]` /
`[inferred]` and a list of what it could not reach. Treat `[inferred]` items as
things to confirm on the Mac, not as settled fact.

## Deliverables

### 1. Zero external dependencies in the shipped app

The packaged app must not require Homebrew, Node, Ollama, or anything else
preinstalled. Bundle inside the app:

- **The LLM runtime the app actually speaks when M8 runs.** Today that is
  **Ollama**, not `llama-server` — see *Correction: the runtime swap is not
  this packet* below. Bundle whichever one the provider talks to at the time;
  do not port the provider here.
- **`whisper-cli`** (whisper.cpp, MIT) for transcription. Build it **without**
  `WHISPER_COMMON_FFMPEG` so the ffmpeg dependency cannot creep back in
  through the build flags.
- **The Node runtime as a bundled stock binary** — *not* Node SEA. SEA is
  still stability 1.1, native addons need a temp-file `process.dlopen()`, and
  `__filename === process.execPath` breaks path assumptions. `better-sqlite3`
  is a native module and it is where this fails.

ffmpeg is **not** bundled. Nothing in the app has invoked it since M5: the
browser records 16 kHz mono WAV and `whisper-cli` decodes through miniaudio.
There is a test named `never mentions ffmpeg`. The LGPL obligation this packet
was written to satisfy has been deleted rather than met.

All binaries must be arm64 (Apple Silicon) at minimum. State plainly whether
you are also shipping x86_64 or a universal binary, and why.

### 2. App shell

A native macOS app bundle, `Apunta.app`, that owns the server
lifecycle and opens the UI in the user's default browser. The UI stays a
browser tab — do not turn this into a webview app.

A **menu-bar (status item) app** is the intended shape: the icon shows
running state, and its menu offers Open Apunta, Stop, and Quit.

**Recommended shape: a plain Swift/AppKit status-item app** — neither Tauri nor
Electron. `swiftc` ships in the Command Line Tools the build already needs to
compile `whisper-cli`, nothing in AppKit phones home, and single-instance is
free for a bundled `.app`. Tauri is the fallback (a Rust toolchain is a real
tax on a TypeScript codebase, and tauri#11992 is still open after 20 months);
Electron is the wrong shape for a status item that opens a browser tab.

This is only viable because **the first-run logic moves out of the shell** —
see deliverable 3. What is left for the shell is a status item, one child
process, a progress window and `open`. If you deviate, record the choice with
reasoning in `docs/decisions.md` and justify it against bundle size, toolchain
cost, and maintenance burden.

**The shell spawns exactly one child: `node`.** The server owns the model
processes. That collapses the no-orphans requirement below to a single kill
rather than process-tree bookkeeping — do not let the shell spawn model
binaries directly.

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

**Write the logic in TypeScript, run by the bundled `node`; the native window
is a thin view over it.** Disk-space math, RAM tier selection, checksum
verification and download-resume bookkeeping all belong there. This is not a
style preference: the acceptance criteria below require that logic to be
unit-tested without macOS, and neither Swift nor Rust runs in this project's
Linux CI. Logic written in the shell language is logic that cannot be tested
until it reaches her Mac.

Reuse `modelForMemory()` from `server/src/ai/model-picker.ts` rather than
reimplementing the tier table — M7's setup script picks the model from that
same table, and two implementations will drift.

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
- **Code signing and notarization are deferred** (owner decision, 2026-08-24).
  He will walk her through the first install himself, so the unsigned path is
  acceptable for now and the Apple Developer Program membership ($99/year) is
  a later decision. Still build the signing and notarization steps into the
  script, driven by environment variables, so they run when credentials exist
  and are skipped with a clear warning when they do not.

  Two things the deferral does **not** excuse:

  - **Ad-hoc sign every bundled Mach-O at build time** (`codesign -s -`), even
    unsigned-for-distribution. On Apple Silicon an unsigned arm64 helper may
    refuse to execute at all, so `node`, the LLM runtime and `whisper-cli` can
    fail at spawn *after* Gatekeeper has been cleared — the app opens and does
    nothing, which is the worst failure shape available. It costs nothing and
    is the correct first step of the signed flow later.
  - **Right-click → Open no longer works.** Apple removed that bypass in macOS
    Sequoia; the path is now System Settings → Privacy & Security → Open
    Anyway. `INSTALL.md` must describe what she will actually see. **Verify
    this on her Mac before it ships in user-facing copy** — wrong instructions
    here dead-end exactly the person this packet exists for.

### 5. No auto-update, no telemetry

Hard rule 1 has no exception for updaters. The app must not phone home to
check for versions, and must not report usage. If you offer an update path at
all, it is a user-initiated "Check for updates" menu item that opens the
releases page in a browser — never a background request. Do not enable your
shell framework's built-in updater.

### 6. Licenses and attribution

Shipping other people's binaries carries obligations. Produce
`THIRD-PARTY-LICENSES.md` covering every bundled binary and library. The
ffmpeg/LGPL question this section was written for is **gone** — nothing bundles
ffmpeg any more. What replaces it (research §6.1), all easy to miss:

- **BoringSSL's mixed notices** inside the Node binary.
- **Node's own dependency licence file** (~157 KB) reproduced verbatim.
- **miniaudio and stb_vorbis**, which now matter *more* than before: they are
  what decodes audio inside `whisper-cli` since ffmpeg left.

Model weights stay at arm's length because they are downloaded on first run
and never redistributed — but that reasoning holds only under three
conditions: name and link the model's licence **before** downloading it, pin
the download host allow-list, and never mirror weights ourselves.

If a bundled component's license cannot be cleanly satisfied, report that
rather than shipping it; do not treat this as a formality.

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

Requires the owner's Mac (ship as a manual checklist in `docs/INSTALL.md` or a
sibling doc — this project has one branch and no PRs, so there is no PR
description to put it in):

- `npm run package:mac` produces a `.dmg`.
- On a Mac that has never had Homebrew, Node, or Ollama: install from the
  `.dmg`, complete first-run setup, record a note, and get a draft — without
  ever opening Terminal.
- Quit and relaunch: the app reuses the downloaded models and starts fast.
- Kill the app mid-download, relaunch, and confirm the download resumes.
- Uninstall per the documented steps leaves nothing behind.
