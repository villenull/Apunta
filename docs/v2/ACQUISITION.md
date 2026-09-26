# Acquisition manifest and licence policy (v2 plan)

Nothing outside this file may be downloaded, installed or pulled (HS-3).
When an item is acquired, the acquiring card records in its evidence: exact
version or revision, URL, size, SHA-256 (or the package manager's integrity
string), licence evidence, and date. The **selection rule** in each row is
fixed; a worker applies it, never replaces it.

## 1. Items

| ID | Item and selection rule | Source (allowed hosts) | Redirect hosts | Shipped? | Card |
| --- | --- | --- | --- | --- | --- |
| A01 | Node.js **24.19.0** linux-x64 tarball, verified against the release's `SHASUMS256.txt` | `nodejs.org` | none | yes (bundled runtime) and dev | P0.1, P3.1 |
| A02 | Rust stable toolchain via `rustup`, only if `cargo` is missing | `static.rust-lang.org`, `sh.rustup.rs` | none | no | P3.3 |
| A03 | Tauri Linux system packages, from the current official Tauri prerequisites page, and GStreamer plugins only if P3.5's failing test proves them needed | Ubuntu archive via `apt` | n/a | no (system) | P3.3, P3.5 |
| A04 | `@tauri-apps/cli`, same minor as the `tauri` crate | npm registry | n/a | no | P3.3 |
| A05 | Crates `tauri` (≥ 2.11.1, newest 2.x patch on acquisition day), `tauri-build` (matching), `tauri-plugin-updater` (≥ 2.10.1, newest 2.x), `tauri-plugin-single-instance` (newest 2.x), and their transitive dependencies | crates.io | n/a | yes | P3.3, P5.4 |
| A06 | whisper.cpp source at the revision already pinned in `scripts/build-whisper-candidate.sh`, to build `whisper-cli` | `github.com` (ggml-org/whisper.cpp) | `codeload.github.com` | yes (binary) | P3.1 |
| A07 | Whisper models, exactly the six C-STT candidates | `huggingface.co` (ggerganov/whisper.cpp) | recorded by P4.1's redirect probe; only Hugging Face CDN hosts | selected one only | S4a.2 |
| A08 | Ollama `gemma4:12b-it-qat`, **only if absent**; `qwen3.5:4b-q4_K_M` is never pulled if present | Ollama registry via the local daemon | daemon-controlled | no | S5.6 |
| A09 | Piper TTS (`piper-tts`, newest release on acquisition day), only if not already installed | `pypi.org`, `files.pythonhosted.org` | none | **no** (dev only, GPL-3.0) | P3.5, S4a.1 |
| A10 | Piper voices: one `en_US` voice for the English spoken fixture; `es_MX` voices (all listed on acquisition day, at most 3); `es_ES` only if no `es_MX` voice exists | `huggingface.co` (rhasspy/piper-voices) | Hugging Face CDN hosts | no | P3.5, S4a.1 |
| A11 | The Spanish Hunspell dictionary S1.5 recommends | npm registry | n/a | yes, if L-POLICY allows | S6.1 |
| A12 | `tauri-apps/tauri-action`, referenced by an immutable commit SHA in the release workflow (not downloaded locally) | `github.com` | n/a | no | P6.2 |

**Owner-run items.** `apt` needs `sudo`. The coordinator writes the exact
command to `docs/v2/state/OWNER-ACTIONS.md`, stops the dependent cards, and
waits; the owner runs it. Agents never enter a password.

**Ollama.** Before any pull, run `ollama list`; if the tag exists, do not pull.
Record the digest with `ollama show <tag>`. Real-model runs set Ollama's
`keep_alive` so evaluation models unload after use, and run only one model
at a time, to avoid starving the live instance.

## 2. Development tools already present

Anything already installed on the PC (git, Python, Piper if present,
whisper-cli, Ollama) may be used as found. Record its version in evidence.

## 3. L-POLICY@1 Licences

One rule, applied per object reviewed (a tool, a library, a model file, a
voice, a dictionary, generated audio are separate objects).

| Object | Allowed |
| --- | --- |
| Code or data **shipped** in the app or installer | MIT, BSD, Apache-2.0, ISC, Zlib, 0BSD, Unicode, OFL-1.1 (fonts), CC0, CC-BY-4.0 (data, with attribution) |
| The one pre-approved exception | Spanish dictionary **data** under an MPL option of a multi-licence, shipped unmodified in its own files, election and obligations stated in `THIRD-PARTY-LICENSES.md` and `docs/decisions.md` |
| Development-only tools never shipped or linked | any OSI licence, including GPL (Piper) |
| Generated fixtures committed to the repo | only if the voice's model card permits redistribution of generated audio; otherwise generate at test time into the sandbox and never commit |
| Models downloaded by the user at setup | per the publisher's licence, shown in setup, recorded in the catalogue |
| System libraries bundled into an AppImage (for example WebKitGTK, LGPL) | allowed for **test builds**; **public distribution requires owner review** (listed in the final report) |

Anything else: do not add it; the card reports `BLOCKED` with the licence
text found. A dependency's MIT wrapper does not change its data's licence.
