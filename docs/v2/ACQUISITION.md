# Acquisition manifest and licence policy (v2 plan)

Nothing outside this file may be downloaded, installed or pulled (HS-3).
When an item is acquired, the acquiring card records in its evidence: exact
version or revision, URL, size, SHA-256 (or the package manager's integrity
string), licence evidence, and date. The **selection rule** in each row is
fixed; a worker applies it, never replaces it.

## 1. Items

| ID | Item and selection rule | Source (allowed hosts) | Redirect hosts | Allowed query keys | Shipped? | Card |
| --- | --- | --- | --- | --- | --- | --- |
| A01 | Node.js **24.19.0** linux-x64 tarball, verified against the release's `SHASUMS256.txt` | `nodejs.org` | none | none| yes (bundled runtime) and dev | P0.1, P3.1 |
| A02 | Rust stable toolchain via `rustup`, only if `cargo` is missing | `static.rust-lang.org`, `sh.rustup.rs` | none | none| no | P3.3 |
| A03 | Tauri Linux system packages, from the current official Tauri prerequisites page, and GStreamer plugins only if P3.5's failing test proves them needed | Ubuntu archive via `apt`; on this Arch host only, official Arch repositories via `pacman` for `gst-plugins-base`, `gst-plugins-good` (P3.5 failing-test trigger) and `patchelf` (AM-190) | n/a | none| no (system) | P3.3, P3.5 |
| A04 | `@tauri-apps/cli`, same minor as the `tauri` crate | npm registry | n/a | none| no | P3.3 |
| A05 | Crates `tauri` (≥ 2.11.1, newest 2.x patch on acquisition day), `tauri-build` (matching), `tauri-plugin-updater` (≥ 2.10.1, newest 2.x), `tauri-plugin-single-instance` (newest 2.x), and their transitive dependencies. AM-225 additionally permits declaring the already-locked/cached `reqwest` **0.13.5** directly, solely for strict native-updater redirect-host policy; no new package acquisition | crates.io | n/a | none| yes | P3.3, P5.4 |
| A06 | whisper.cpp source at the revision already pinned in `scripts/build-whisper-candidate.sh`, to build `whisper-cli` | `github.com` (ggml-org/whisper.cpp) | `codeload.github.com` | none| yes (binary) | P3.1 |
| A07 | Whisper models, exactly the six C-STT candidates | `huggingface.co` (ggerganov/whisper.cpp) | `us.aws.cdn.hf.co` (observed for all six by P4.1's redirect probe, 2026-09-26; no other host) | `Expires`, `Hash-Algorithm`, `Key-Pair-Id`, `Policy`, `Signature`, `X-Xet-Cas-Uid`, `response-content-disposition`, `response-content-type`, `user_id`, `xip`| selected one only | S4a.2 |
| A08 | Ollama `gemma4:12b-it-qat`, **only if absent**; `qwen3.5:4b-q4_K_M` is never pulled if present | Ollama registry via the local daemon | daemon-controlled | none| no | S5.6 |
| A09 | Piper TTS (`piper-tts`, newest release on acquisition day), only if not already installed | `pypi.org`, `files.pythonhosted.org` | none | none| **no** (dev only, GPL-3.0) | P3.5, S4a.1 |
| A10 | Piper voices: one `en_US` voice for the English spoken fixture; `es_MX` voices (all listed on acquisition day, at most 3); `es_ES` only if no `es_MX` voice exists | `huggingface.co` (rhasspy/piper-voices) | Hugging Face CDN hosts; query admission only on `us.aws.cdn.hf.co` (AM-191) | `user_id`, `response-content-disposition`, `xip`, `X-Xet-Cas-Uid`, `Expires`, `Policy`, `Signature`, `Key-Pair-Id`, `Hash-Algorithm` (on `us.aws.cdn.hf.co` only) | no | P3.5, S4a.1 |
| A11 | The Spanish Hunspell dictionary S1.5 recommends | npm registry | n/a | none| yes, if L-POLICY allows | S6.1 |
| A12 | `tauri-apps/tauri-action`, referenced by an immutable commit SHA in the release workflow (not downloaded locally) | `github.com` | n/a | none| no | P6.2 |
| A13 | Ollama `qwen3.5:2b-q4_K_M`, **only if absent** — the small sibling in the owner's authorised four-arm local-model comparison | Ollama registry via the local daemon | daemon-controlled | none | no | none (measurement only) |
| A14 | `prism-ml/Bonsai-8B-gguf`, the single file `Bonsai-8B-Q1_0.gguf` and nothing else in the repository | `huggingface.co` (prism-ml/Bonsai-8B-gguf) | Hugging Face CDN hosts, on A07's terms | A07's | no | none (measurement only) |
| A15 | `prism-ml/Bonsai-4B-gguf`, the single file `Bonsai-4B-Q1_0.gguf` and nothing else in the repository | `huggingface.co` (prism-ml/Bonsai-4B-gguf) | Hugging Face CDN hosts, on A07's terms | A07's | no | none (measurement only) |
| A16 | `Fraunces[SOFT,WONK,opsz,wght].ttf` from `github.com/google/fonts` at `ofl/fraunces`, SHA-256 `177ff6c0f14e5550a3c624247cd1189611d4eb65d000b14944c63d967958abbb`, plus its OFL 1.1 text. **Committed to the repo** beside Kalam's, used only to generate the wordmark and A outlines | `github.com` (one fetch, then never again) | `raw.githubusercontent.com` | none | no — outlines only, no font file in the bundle | P2.1 (owner amendment 2026-09-27) |
| A17 | English `ggml-tiny.en.bin` only, existing installer catalog pin 77,704,715 bytes / SHA-256 `921e4cf8686fdd993dcd081a5da5b6c365bfde1162e72b08d75ac75289920b1f`; one owner-started installer acquisition into ignored `build/eod-model-cache`, mandatory checksum verification | `huggingface.co` (ggerganov/whisper.cpp) | `us.aws.cdn.hf.co` only | A07's ten enumerated names, values redacted | no public-distribution grant | English EOD, AM-198; no Spanish benchmark unpark or Ollama pull |
| A18 | Node.js **24.19.0** darwin-arm64 tarball `node-v24.19.0-darwin-arm64.tar.gz`, SHA-256 `8294b7aa9b03997481c06babf1e8b270c859358f27da57a11509afe537ac381d` from the release's `SHASUMS256.txt`; downloaded by the person at the Mac, once, and extracted to `~/.local/share/apunta-node/` — no script downloads it | `nodejs.org` | none | none | yes (bundled runtime, macOS) | P6.1 (owner approved 2026-10-08) |
| A19 | Ollama **0.33.3** macOS tarball `ollama-darwin.tgz` (159,236,337 bytes), SHA-256 `342db03df80bb9db84ff64246031bd5f70c09b59ff52fa5cc9aaae3476cc4a9d` from the release's `sha256sum.txt`; the version every eval ran on. Downloaded by the person at the Mac, once, to `~/.local/share/apunta-ollama/ollama-darwin-v0.33.3.tgz`; `scripts/v2/package-macos-resources.sh` verifies the checksum before unpacking it — no script downloads it | `github.com` (ollama/ollama releases) | `release-assets.githubusercontent.com` | none | yes (bundled runtime, macOS) | first-run setup (owner approved 2026-10-08) |

**Redirect admission (rule 1).** A redirect is followed only when its `Location`
resolves to `https:`, port 443, no user-info, no fragment, a host the row's
*Redirect hosts* cell admits, and a query whose every parameter name appears in
that row's *Allowed query keys* cell. A parameter name outside the cell is
refused (`query_key_not_allowed`) before the URL is requested. `none` means the
row admits no query at all, so any query is `query_not_allowed` — that is the
default and it is unchanged. No row admits a query by wildcard, a prefix or a
blanket permission, and the cell is the complete list: adding a name is a
plan-editor amendment (AM-042).

**Why A07's names are safe to enumerate.** The ten names are the AWS
CloudFront signed-URL parameter set plus Hugging Face's Xet and
`response-content-*` parameters, observed on 2026-09-26 across all six C-STT
artifacts and the one speech artifact, each answering `302` to
`us.aws.cdn.hf.co` (`docs/v2/evidence/P4.1/redirects.md`). They cannot change
*which* bytes arrive: the path is fixed by the pinned catalogue URL and the
bytes are verified against the pinned `sha256`, and the committed name is the
entry's own `sizeBytes` path, so the two `response-content-*` parameters can
only shape headers a client would have sent anyway. The card's own worry — "a
query string is where a download URL turns into a message" — is about
*outbound* data, and none of these names carries any: the probe records the
**names** only and writes every value as `<redacted>`, so a signature is never
in the repository, the evidence or any log.

**The four-arm comparison (A13, A14, A15).** Added 2026-09-26 on the owner's
approval, for one measurement round and nothing else. The arms are
`qwen3.5:4b-q4_K_M` as the control (A08; already present, and A08's "never pulled
if present" still holds), plus A13, A14 and A15. Three rules bind the round and
are not negotiable per run:

1. **No candidate becomes a default.** A07's "selected one only" and A08's tag
   are unchanged. The round measures; it does not promote.
2. **The licence of A14 and A15 is unknown to the coordinator and must be found
   before either is pulled.** These are models downloaded by the user at setup,
   so L-POLICY@1's row for that applies: per the publisher's licence, shown and
   recorded. Prism's licence for these repositories is not asserted here because
   it was not verified — anyone pulling them records the licence text and the
   URL it came from, or reports `BLOCKED`. Guessing it is exactly the failure
   this manifest exists to prevent.
3. **The GPU is not shared.** One model loaded at a time, `keep_alive` set so
   each unloads after its arm, and no arm runs while the owner is testing on the
   machine or a live instance is in use. A four-arm run is long and real.

**Fraunces (A16) follows Kalam, not a build-time download.** Both source TTFs live in `docs/v2/assets/` with their OFL texts, and `build-brand-fraunces.py` reads the local file and touches no network — regenerating the wordmark in six years must not depend on a `/tmp` file or a download working. A16 permits exactly that one fetch, to obtain the file committed beside it. Fraunces is a **variable** font; the committed cut is the variable one, and the generator pins `wght 500`, `opsz 14`, `SOFT 0`, `WONK 0`, because a static instance could not set optical size and an unpinned variable font would not reproduce. The TTF is never bundled: the app ships outlines only.

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
