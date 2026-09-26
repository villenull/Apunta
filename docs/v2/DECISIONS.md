# Decisions (v2 plan, version 2)

Status labels: **OWNER** (the owner's proxy decided, 2026-09-25),
**ENGINEERING** (decided by the plan editor to remove ambiguity; the owner
may overturn it through a plan amendment), **OWNER-ONLY ACTION** (no agent
may do it).

Agents do not change any entry. A contradiction between a card and this file
blocks the card (COORDINATOR.md §6).

## Product decisions

| ID | Decision | Status |
| --- | --- | --- |
| D1 | All v2 work on one branch, `feature/v2`, merged into `main` by the owner. CLAUDE.md gets a temporary branch exception. | OWNER |
| D2 | Work runs on the Linux PC with real Ollama and whisper.cpp, and may download exactly what `ACQUISITION.md` lists. | OWNER |
| D3 | The main repository will become public; its GitHub Releases host installers and `latest.json`. The owner flips visibility and decides any history rewrite. | OWNER |
| D4 | Linux fully working; Mac and Windows configured but unverified. | OWNER |
| D5 | One **Language** setting (English / Español) for the interface and the defaults for **new** work. | OWNER, qualified by D11 |
| D6 | Mexican Spanish, `es-MX`. | OWNER |
| D7 | Spanish speech model chosen by benchmark (contract C-STT). English keeps `ggml-tiny.en.bin`. | OWNER |
| D8 | Default Spanish note format: the owner's seven-section note in Spanish, adapted from es-MX research. | OWNER |
| D9 | Spanish spoken corrections seeded from research, marked provisional. | OWNER |
| D10 | Wordmark and A mark: `#1f6f63` in light mode, `#ffffff` in dark mode, independent of accent. | OWNER |
| D11 | **Existing notes and formats keep their language.** Changing Language never translates or relabels existing content. The Language control is disabled while any recording, transcription, draft, refine, plan, briefing, brainstorm reply or save is in flight, with a visible reason. | OWNER |
| D12 | **All of Spanish mode is held until every Spanish check passes** (contract C-ES-GATE), including the owner's clinical review. Until then, Español is hidden in release builds and available only with the development switch `APUNTA_DEV_SPANISH=1`. | OWNER |
| D13 | **The owner reviews Spanish notes for clinical meaning.** Model review is never clinical sign-off. | OWNER |
| D14 | **Meta Muse (Muse Code on the Linux PC) coordinates, implements and reviews.** Independent reviews use a separate sub-session when Muse Code supports it; otherwise the coordinator stops and asks the owner to open a fresh session. | OWNER |
| A1 | The coordinator runs autonomously within `HARD-STOPS.md` and this file. | OWNER |
| A2 | The writing model stays `qwen3.5:4b-q4_K_M` for new installs in both languages (contract C-MODEL). Gemma 4 (`gemma4:12b-it-qat`) is measured for Spanish for information only; any change of default is an owner decision. | OWNER |
| A3 | English stays the default language. | OWNER |
| A4 | The A mark sits centred above the home greeting, about 48 px tall. | OWNER |
| A5 | Every bug fix starts with a test that fails for the reported reason. | OWNER |

## Engineering decisions

| ID | Decision | Status |
| --- | --- | --- |
| E1 | **Node 24.19.0** everywhere: `.nvmrc`, CI, `engines`, native addon builds, bundled runtime. It matches `scripts/package-mac.sh` and satisfies the lockfile's engine ranges. | ENGINEERING |
| E2 | **Tauri 2.11.1 or later** (first release with the fix for GHSA-7gmj-67g7-phm9), `tauri-plugin-updater` 2.10.1 or later, CLI on the same minor as the crate. Exact versions recorded at acquisition; lockfiles committed. | ENGINEERING |
| E3 | **The web page calls no Tauri commands.** No capabilities are granted to any webview origin, `withGlobalTauri` is off. The shell and the Node server talk over the server process's stdin/stdout (contract C-BRIDGE). | ENGINEERING |
| E4 | **Linux release channel: AppImage only.** Updates run without root. `.deb` is not built in v2. | ENGINEERING |
| E5 | **Production port 7717, no fallback.** If 7717 is taken, the app shows an error screen and stops. The web app keeps state in `localStorage` (`App.tsx`, `NoteView.tsx`), so a changing origin would silently lose it. Test builds use the sandbox port range. | ENGINEERING |
| E6 | **Section roles via an alias map** (contract C-LANG §5). Stored section strings are not rewritten. | ENGINEERING |
| E7 | **Rust shell spawns the sidecar with `std::process`**, not the shell plugin. Crates: `tauri`, `tauri-build`, `tauri-plugin-updater`, `tauri-plugin-single-instance`. | ENGINEERING |
| E8 | **Migrations become all-or-nothing per release**: every pending migration runs inside one outer transaction, after a verified safety snapshot (contract C-UPD). | ENGINEERING |
| E9 | **Licence policy L-POLICY v1** in `ACQUISITION.md` §3 is the single rule for every dependency, tool, model, voice and data file. | ENGINEERING |
| E10 | **Test app identity** `app.apunta.desktop.test` for every test build, so a test app can never focus or signal the production app. Production identity `app.apunta.desktop`. | ENGINEERING |
| E11 | **The v1 to v2 handover on the owner's PC is owner-only**: the owner stops the v1 service before the first production v2 launch on the live data folder. Agents never do it (HS-10). | ENGINEERING |

## Owner-only actions (collected for the final report)

Back up the production update key; create GitHub secrets; review and merge
`feature/v2`; decide on history cleanup; flip repository visibility; stop the
v1 service before the first production v2 launch; write the Spanish clinical
verdict (`docs/v2/owner/es-clinical-review.md`); enable Spanish in release
builds after C-ES-GATE passes; enable GitHub private vulnerability reporting
if `SECURITY.md` is to point to it.
