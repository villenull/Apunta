# Owner actions

Each entry: date, card, exact steps, why it is needed, cards waiting on it.

(none yet)
## Index — every distinct owner action, with its real status

Regenerated 2026-10-02 from `reviews/owner-actions-audit.md`. **Two of the five entries below were asking for work that
was already done**, and one of them still asserted a card was `BLOCKED` when it had been `APPROVED` for days. Each distinct
action is its own row here so the outstanding count is countable; the prose entries underneath are unchanged and remain
prose, because a `pkexec pacman -S --needed …` line has to stay copy-paste exact.

| # | Card | Action | Status | Evidence |
| --- | --- | --- | --- | --- |
| E1 | P0.4 | Provide Ollama + `qwen3.5:4b-q4_K_M` | **DONE** 2026-09-26 | AM-020; versions recorded |
| E1b | P0.4 | `systemctl enable --now ollama` for persistence | **DONE** | `ORCHESTRATION-LOG.md` |
| E2 | P3.1 | Install `cmake` + a C/C++ toolchain | **DONE** 2026-09-26 | cmake 4.4.3, glslc 2026.3; coordinator re-verified |
| E3 | P3.1 | Install the Vulkan SDK headers | **DONE** 2026-09-26 | `vulkan-headers 1:1.4.357.0-1` + `spirv-headers`; `evidence/P3.1/attempt1-verification.md:20`. Two packages were needed, not one |
| E4 | P4.1 | A07 redirect query-key election | **DONE** 2026-09-26 | AM-042 option (a); the column is live in `ACQUISITION.md` §1 |
| E5 | P3.3 | Tauri Linux prerequisites (A03) + Xvfb/xdotool | **DONE** 2026-10-02 | AM-081; five package versions recorded below |
| G1 | S6.1 | Elect the dictionary licence (MPL-1.1, data only, at 2.0.0 — recommended) | **OUTSTANDING** | `S6.1-AMENDMENT-PROPOSAL-v2.md` §11 item 1 |
| G2 | S6.1 | Upstream Initial Developer attribution; record two unevidenced Exhibit A fields as `[unknown]` | **OUTSTANDING** | §11 item 2; `S6.1-NOTICE-PROVENANCE.md` |
| G3 | S6.1 | Approve the bundled May-edit widening | **OUTSTANDING** | §11 item 3 |
| G4 | P5.3 | Quiesce transport (A1) and the authorisation of `POST /api/app/quiesce` against C-BRIDGE@1 rule 3 (A2) — **includes a contract amendment only the owner can make**, plus its C-UPD@1 mirror | **OUTSTANDING** | `P5.3-AMENDMENT-PROPOSAL-v2.md` Part A, Choice 1 |
| G5 | P5.3 | What a non-empty registry does at entry, and where the unsaved-text guard lives | **OUTSTANDING** | Part A, Choice 2 |
| G6 | P5.3 | The write boundary: which writes are registry jobs | **OUTSTANDING** | Part A, Choice 3 |
| E6 | P3.5 | Install the GStreamer capture plugins WebKitGTK needs: `pkexec pacman -S --needed gst-plugins-base gst-plugins-good` (the graphical polkit prompt asks for your password; agents cannot sudo and may not install anything — HS-3). A03 names the Ubuntu archive via `apt`, which is not this host's package manager; the coordinator has to reconcile the manifest row before the next dispatch. Verify with `gst-inspect-1.0 autoaudiosrc`, `gst-inspect-1.0 alsasrc` and `gst-inspect-1.0 appsink` all naming an element. | P3.5's capture row reached the app's record button and WebKitGTK then said `GStreamer element appsink not found. Please install it.` and `Audio capture was requested but no device was found amongst 0 devices`. Only `gst-plugin-pipewire` is installed; `autoaudiosrc`, `alsasrc` and `pulsesrc` are all absent, so no frames can reach `getUserMedia`. | P3.5 (V3, V4, and through V5 its capture baseline), and through them P3.R |
| G7 | S4a.2 | **Nothing is being asked — the card is parked by the owner** and `PROGRESS.json` reads `NOT STARTED` while being dependency-clear, so nothing in the status files records that a person is holding it | **PARKED BY OWNER** | `NEXT-SESSION.md`; S4a.2 is not in `DEPENDENCIES.md`'s released set |

**No entry in this file may be closed without a checkable evidence pointer**, and the evidence pointer must be written at
the moment of resolution — that is the discipline whose absence let E1 and E3 drift. Whether an action happened is **not**
derivable from any generated file, so the hand-written status above is the only record of it; `Waiting on` and staleness
*are* derivable from `PROGRESS.json`, and where the two disagree, `PROGRESS.json` is right about the card and this file is
stale about the action.


2026-09-26 | P0.4 | Provide Ollama with the `qwen3.5:4b-q4_K_M` tag on the machine that runs this card (install Ollama and/or make the model available out-of-band; agents may neither install Ollama — not in ACQUISITION.md, HS-3 — nor pull the model if absent — card fixed decisions). Verify with `ollama list` showing `qwen3.5:4b-q4_K_M` and `curl -fsS http://127.0.0.1:11434/api/tags`. | This machine has no `ollama` binary and nothing listens on 127.0.0.1:11434 (coordinator independently confirmed), so the 8 real-model baseline invocations cannot start. | P0.4 (BLOCKED), and through it P0.R.
  → **RESOLVED 2026-09-26** (owner-authorised HS-3 exception): owner installed `ollama` 0.33.3-1 + `ollama-rocm` + `hipblas` (`/opt/rocm` present); a subagent started the daemon and pulled `qwen3.5:4b-q4_K_M` (digest 2a654d98e6fb, 3.4 GB, 100% GPU on the RX 9070 XT). **DONE 2026-09-26** (recorded in `ORCHESTRATION-LOG.md`): `sudo systemctl enable --now ollama` (service is installed but disabled; daemon currently runs as a manual `ollama serve`, PID 294100, log `/tmp/ollama-serve.log`; stop the manual one first if the service errors).
2026-09-26 | P3.1 | Install `cmake` (and ensure a C/C++ toolchain) so `scripts/build-whisper-candidate.sh` can build `whisper-cli` from the pinned source (A06). `cmake` is absent on this PC, so the build exits 2; `hipcc` is also absent (ROCm/hipblas is installed, but the HIP compiler is not). Run e.g. `pkexec pacman -S --needed cmake` (the graphical polkit prompt asks for your password; agents cannot sudo). Verify with `command -v cmake`. | P3.1's whisper build cannot run without cmake; no ACQUISITION row covers it (HS-3), so only you may install it. | P3.1 (and any card that builds whisper) — recommend a BLOCKED/stop if cmake is missing.
2026-09-26 | P4.1 | Plan-editor decision needed: the A07 redirect targets on the Hugging Face CDN carry query strings (signed URLs), which the card's rule 1 forbids. Decide either (a) add an `allowed-query-keys` column to `ACQUISITION.md` §1 for A07's redirect hosts (the exact key names are in `docs/v2/evidence/P4.1/redirects.md`; one `HEAD` per artifact reads them), or (b) mark the artifact unavailable. Agents may not change this rule (HS-7). | It blocks P4.1 and, through it, the Spanish speech acquisition/catalogue chain (S4a.2, P4.3, P4.4). | P4.1 (unblocked 2026-09-26 by AM-042), S4a.2, P4.3
  → **RESOLVED 2026-09-26** (AM-042, owner-approved, option (a) with probe): the owner authorised the probe and chose the allowed-query-keys column. The probe was re-run and observed one hop-1 host, `us.aws.cdn.hf.co`, for all seven artifacts, with the same ten query key names; `ACQUISITION.md` §1 now carries the host and the enumerated names, and P4.1's card text, tests and stop condition follow. P4.1 re-dispatches as attempt 2.
  → **RESOLVED 2026-09-26** (owner ran `pkexec pacman -S --needed cmake`): cmake 4.4.3 is at `/usr/bin/cmake` and `glslc` 2026.3 is present, so the `vulkan` backend is buildable and `hipcc` remains the one genuinely absent tool. Coordinator re-verified all three by command on 2026-09-28. P3.1's stop condition that asserted cmake was absent on this PC has been corrected; the earlier `P3.1.json` `lastCompletedStep` was the only record of this and has since been overwritten, which is why the stale claim survived.
2026-09-28 | P3.1 | Install the **Vulkan SDK headers**: `pkexec pacman -S --needed vulkan-headers` (the graphical polkit prompt asks for your password; agents cannot sudo and may not install anything — HS-3). Verify with `ls /usr/include/vulkan/vulkan.h`. | P3.1's whisper build uses the `vulkan` backend because `hipcc` is absent. `cmake` 4.4.3 and `glslc` 2026.3 are present, but `glslc` alone is not enough: the backend also needs the SDK headers, and `find_package(Vulkan)` fails on `Vulkan_INCLUDE_DIR` alone. The implementer confirmed this four ways — cmake's own error, a filesystem search, `ldconfig` showing the loader present with headers absent, and a minimal `find_package(Vulkan REQUIRED)` probe reproducing it. No `ACQUISITION.md` row covers it, so only you may install it. | P3.1 (BLOCKED), and through P3.3-P3.6, P3.R, P5.4, P5.R, P6.1-P6.R, P7b.1, P7b.2 and the Q1 series.
2026-09-29 | P3.3 | Install the Tauri Linux build prerequisites (A03) and two test-harness tools, through the graphical polkit prompt (never sudo, no password written anywhere): `pkexec pacman -S --needed webkit2gtk-4.1 xdo libayatana-appindicator` and `pkexec pacman -S --needed xorg-server-xvfb xdotool`. These are the Arch names for Tauri's `libwebkit2gtk-4.1-dev`, `libxdo-dev` and `libayatana-appindicator3-dev`; `--needed` installs nothing already present. Verify with `pkg-config --modversion webkit2gtk-4.1` and `command -v Xvfb xvfb-run xdotool`; if a build later fails on a missing `.pc`, report the exact `pkg-config` error rather than installing more. The owner authorised the coordinator to run these `pkexec` commands (AM-081), after P3.3's instruction re-review. | WebKitGTK is needed to build the AppImage, and A03 is owner-run (ACQUISITION §1); V3–V5 also need a headless display. | P3.3 (V0, V2–V5), and through it P3.4–P3.6, P3.R, P5.4, P5.R, P6.1–P6.R.


→ **RESOLVED 2026-10-02 — P3.3 A03 and display harness prerequisites.** Owner
selected retry-now and approved the graphical prompt. Coordinator ran the two
previously approved package commands with `timeout 180s pkexec pacman -S --needed
--noconfirm`; both exited 0. Installed and independently queried:
`webkit2gtk-4.1 2.52.6-1`, `xdo 0.5.7-3`, `libayatana-appindicator 0.6.0-2`,
`xorg-server-xvfb 21.1.24-1`, `xdotool 4.20260303.1-1`.
`pkg-config --modversion webkit2gtk-4.1` returned `2.52.6`; `command -v Xvfb
xvfb-run xdotool` returned all three `/usr/bin/` paths (exit 0). Rust/cargo remain
absent; A02 is the card's already-authorized agent-run step, not another owner
package action. No other manually selected system packages installed.

2026-10-03 | P3.5 | Install the GStreamer plugins WebKitGTK needs to open a microphone: `pkexec pacman -S --needed gst-plugins-base gst-plugins-good`, through the graphical polkit prompt (never `sudo`, no password written anywhere — HS-10). `--needed` installs nothing already present. Verify with `gst-inspect-1.0 appsink`, `gst-inspect-1.0 autoaudiosrc` and `gst-inspect-1.0 alsasrc` each naming an element, and re-run `pactl get-default-source` afterwards to confirm the default capture source is still the USB microphone. | The A03 row in `ACQUISITION.md` admits "Ubuntu archive via `apt`" for GStreamer plugins, and this host is Arch/Omarchy with `pacman`; the plugin itself is proven needed by P3.5's failing capture, which is A03's own trigger, but the host is not one the row names. A manifest reconciliation (AM-042 class) is the coordinator's, not this session's. Evidence: `docs/v2/evidence/P3.5/V3-capture-spoken.md`. | P3.5 (V3, V4 and V5's capture baseline), and through them P3.R.

2026-10-03T04:17:41.275105+00:00 | P3.4 | Independently CLEAR package in P3.4-REPAIR-PROPOSAL-v5.md, IR7 report: owner decisions outstanding for (1) protected assertion/measurement package and (2) exactly one attempt 5 with narrowly keyed generator/tool-test grant. Both asked asynchronously; no decision inferred. Optional A06 cleanup parked. | COORDINATOR §4 budgets and §6 protected assertions/scope. | P3.4, P3.6, P3.R.

2026-10-03 | P3.5 | Environment proposal candidate408e1bb independently CLEAR (IR3). Two async owner decisions OUTSTANDING: grouped capture environment package (base/test media config, supported scanner setup, A03 narrow Arch packages gst-plugins-base/gst-plugins-good/patchelf, pkexec with graphical authentication, V0 PipeWire/default-source clarification); separate exact nine A10 query names on us.aws.cdn.hf.co for future admission only. No retroactive grant, no redownload, no public-distribution approval, no attempt4. | COORDINATOR §6 acquisition/scope/assertion boundary. Earlier E6 two-package instruction superseded by this reviewed package and is not executable authority; installing plugins alone does not fix bundle masking. | P3.5, P3.6, P3.R.
