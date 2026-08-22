# M8 — redistribution & packaging feasibility research

**Researched 2026-08-22.** Scope: can the binaries Apunta depends on be legally
and practically redistributed inside a signed, notarized macOS `.dmg`? What must
M5 and M7 do *differently now* so M8 is buildable later?

This is **engineering research, not legal advice.** Licence text is quoted, not
paraphrased, so the owner (or a lawyer) can check the reasoning. Nothing here
was compiled, signed or run — this container is Linux.

## 0. How to read this document

Same evidence convention as `docs/research/macos-setup-verification.md`:

- **[P]** — read directly from a primary source I fetched (licence file, upstream
  source code, Apple's own documentation JSON). Highest confidence.
- **[S]** — from search-engine snippets of a page I could not fetch; two or more
  independent snippets had to agree.
- **[I]** — **inference.** My reasoning from [P] facts, clearly reasoned but not
  itself verified. Treat as a hypothesis to test on the Mac.
- **[U]** — **unverified.** Stated as a gap, not a fact.

### Egress limitation

This session's proxy blocked `ffmpeg.org`, `huggingface.co`,
`developer.mozilla.org`, `webaudio.github.io`, `w3.org` and `v2.tauri.app`.
Workarounds used, all *better* primary sources than the blocked pages:

- FFmpeg licence text read from **the FFmpeg repo itself** (`LICENSE.md`,
  `COPYING.LGPLv2.1`) via `raw.githubusercontent.com`.
- Apple documentation read from the **DocC JSON API**
  (`developer.apple.com/tutorials/data/documentation/...json`), which is the
  same content the JS-rendered pages display.
- Web Audio sample-rate limits read from **Chromium source**, not MDN.
- Hugging Face facts inherited from `macos-setup-verification.md` §4, which
  derived them from whisper.cpp's own shipped download script.

---

## 1. Decision summary

| # | Dependency | Verdict | One-line reason |
| --- | --- | --- | --- |
| 1 | **ffmpeg** | **REPLACE — do not ship it** | Every mainstream macOS build is GPL, an LGPL arm64 build would have to be built and maintained by us, and the whole job (record → 16 kHz mono WAV) is ~80 lines of Web Audio in the browser. |
| 2 | **ffprobe** | **REPLACE — do not ship it** | Only used for duration; duration of a WAV we generate is `bytes ÷ (rate × channels × 2)`. |
| 3 | **llama-server** (llama.cpp) | **BUNDLE** | MIT [P]; official macOS arm64 prebuilt exists and is current [P]; Metal shaders are embedded, no `.metallib` to ship [P]; `--offline` flag exists to hard-disable its network code [P]. |
| 4 | **llama.cpp dylibs** (`libllama`, `libggml*`, `libmtmd`) | **BUNDLE** (they come with #3) | macOS builds default to `BUILD_SHARED_LIBS=ON` [P] and use `@loader_path` RPATH [P] — they must sit next to `llama-server` and each needs its own signature. |
| 5 | **whisper-cli** (whisper.cpp) | **BUNDLE — but you must build it yourself** | MIT [P]. **There is no prebuilt macOS binary in the official releases** [P] — the release matrix is Ubuntu/Windows/CUDA/xcframework only. Packaging must compile it. |
| 6 | **Whisper model** `ggml-large-v3-turbo-q5_0.bin` (547 MiB) | **REQUIRE DOWNLOAD at first run** | Keeps the installer ~100 MB per the packet, and keeps weights off our distribution entirely. Underlying weights are MIT (openai/whisper `LICENSE`) [P], so bundling would also be legal — it's a size decision, not a licence one. |
| 7 | **LLM weights** (GGUF) | **REQUIRE DOWNLOAD at first run** | Same size argument, plus Gemma-class weights carry vendor terms of use we should not redistribute. **Gap: PLAN §2's tier table is Ollama tags, and llama-server needs GGUF URLs. That mapping does not exist anywhere yet.** |
| 8 | **Node runtime** | **BUNDLE the stock `node` binary** — not SEA, not Bun/Deno | `better-sqlite3` is a native addon; Node SEA's native-addon path requires writing the `.node` to a temp file and `process.dlopen()`ing it [P], which collides head-on with hardened-runtime library validation. A plain signed `node` in `Contents/MacOS/` has none of that. Costs 37 MiB compressed [P, measured]. |
| 9 | **BoringSSL** (linked into llama.cpp binaries) | **BUNDLE** (comes with #3) | `-DLLAMA_BUILD_BORINGSSL=ON` in the official release build [P]; permissive licence; must be listed in `THIRD-PARTY-LICENSES.md`. |
| 10 | **Apple Developer membership ($99/yr)** | **BUY IT** | The unsigned fallback is not completable by the target user on macOS 15+ (§8). This is the single highest-leverage $99 in the project. |

**Headline:** the ffmpeg licensing question, which the packet flags as the sharp
one, dissolves — but only if M5 stops producing WebM/Opus. That is a decision
that must be made **before M5 is written**, not after.

---

## 2. Hard rule 1 vs. the first-run model download

### 2.1 The tension, stated precisely

`CLAUDE.md` hard rule 1: *"No outbound network calls at runtime, ever — only
`127.0.0.1`/`localhost`."*

M8 deliverable 3 requires downloading ~600 MB–8 GB of model weights on first
launch, from the internet, with a progress bar. As written, the rule forbids it.

`docs/research/macos-setup-verification.md` already reasoned around this once,
for M7's setup script:

> "This is a **setup-time** download, not a runtime one, so it does not violate
> the egress rule — but keep it strictly in `scripts/`, never reachable from
> server code, and make sure the egress-guard test doesn't accidentally
> whitelist it."

That reasoning is sound and M8's first-run download is the *same act wearing a
GUI*. But the containment mechanism — "it lives in `scripts/`" — evaporates once
the download has to happen inside a shipped `.app`.

### 2.2 Recommendation: architectural separation **and** an explicit carve-out

Do both. The architecture is what actually makes it safe; the carve-out is what
stops a future agent from quietly widening it.

**Architecture.** The downloader lives in the **shell process** (the Tauri/Rust
or Electron main process that already owns the first-run window), never in the
Fastify server. Concretely:

- The Node server keeps its `fetch` egress guard exactly as PLAN §2 specifies,
  absolute, with the existing test asserting it. It gains no network capability
  in the packaged build. `APUNTA_DATA_DIR/models/` is just a directory it reads.
- The shell downloads to `models/`, verifies the checksum, then starts the
  server. The server's health check sees a file on disk and cannot tell (or
  care) how it got there.
- The bundled `llama-server` is launched with `--offline` (verified flag:
  *"Offline mode: forces use of cache, prevents network access"*, env
  `LLAMA_ARG_OFFLINE`) [P], and never with `-hf`, `-hfr`, `--hf-repo`, `-dr`,
  `--docker-repo` or `--model-url`. It ships with BoringSSL linked in [P], so
  it is *capable* of HTTPS; `--offline` is the belt to the "don't pass those
  flags" braces.
- Launch `llama-server` bound to `127.0.0.1` (already its default [P]) and add
  `--no-webui` [P] so the only HTTP surface is the API Apunta calls.

**Carve-out.** Amend hard rule 1 to say what is actually true of the shipped
product. Proposed wording, deliberately narrow:

> 1. **Privacy is the product.** The Apunta **server** makes no outbound network
>    calls, ever — its egress guard rejects any host that is not
>    `127.0.0.1`/`localhost`, and tests assert this. Never use the browser
>    SpeechRecognition / Web Speech API. No telemetry, no crash reporting, no
>    analytics, no update check, no CDN assets or external fonts at runtime.
>
>    **The one exception, and it is the only one:** *model acquisition.* The
>    installer / first-run component — never the server, never the browser tab —
>    may download model weights, provided it (a) only runs when the user
>    explicitly starts it, (b) contacts only hosts on a pinned allow-list
>    recorded in `docs/decisions.md`, (c) sends no user data, no note content,
>    no machine identifier, and no query string beyond the file path, (d)
>    verifies every downloaded file against a pinned checksum, and (e) never
>    runs again once the models are present. Anything else that wants the
>    network is forbidden, including "check for updates".

Why a carve-out rather than silence: a rule stated as absolute, that the
shipped product visibly violates, teaches the next agent that the rules are
approximate. A rule with one named, bounded exception stays enforceable — and
the enforcement (server egress guard + lint rule banning non-loopback URL
literals in `server/` and `web/`, both of which already exist per
`docs/decisions.md`) actually gets *stronger*, because the exception lives in a
different process that the guard was never protecting anyway.

Record it as a decisions.md row. Also: the About page (M7 deliverable 5) should
say this in plain language — "Apunta downloads its AI models once, when you
first set it up. After that it never uses the internet again." That is a better
privacy story than an unexplained absolute.

---

## 3. ffmpeg — the sharp question

### 3.1 What FFmpeg's licence actually says

From `LICENSE.md` in the FFmpeg repository, fetched 2026-08-22 [P]:

> Most files in FFmpeg are under the GNU Lesser General Public License version
> 2.1 or later (LGPL v2.1+). Read the file `COPYING.LGPLv2.1` for details. Some
> other files have MIT/X11/BSD-style licenses. In combination the LGPL v2.1+
> applies to FFmpeg.
>
> Some optional parts of FFmpeg are licensed under the GNU General Public
> License version 2 or later (GPL v2+). See the file `COPYING.GPLv2` for
> details. None of these parts are used by default, you have to explicitly pass
> `--enable-gpl` to configure to activate them. **In this case, FFmpeg's license
> changes to GPL v2+.**

So "FFmpeg is GPL" is false in general and true in practice: it depends entirely
on how the binary you have was configured.

### 3.2 What the ffmpeg Apunta would actually get is licensed under

M7 deliverable 1 runs `brew install ffmpeg`. Homebrew's formula (fetched
2026-08-22 from `Homebrew/homebrew-core`, `Formula/f/ffmpeg.rb`, ffmpeg
**9.0.1**) [P]:

```ruby
license "GPL-3.0-or-later"
...
--enable-version3
--enable-gpl
--enable-libx264
--enable-libx265
```

**The ffmpeg on the developer's Mac is GPL-3.0-or-later.** For M7 that is
irrelevant — the *user* installs it; we redistribute nothing. For M8 it is
fatal: putting that binary in `Apunta.app` is redistribution, and GPLv3 would
reach the whole combined work under the FSF's reading if the app were considered
a single program.

The other well-known prebuilt macOS sources are no better: evermeet.cx builds
are `--enable-gpl` and are **Intel-only — the maintainer does not plan native
Apple Silicon builds** [S]. There is no widely-trusted, maintained, prebuilt
**LGPL arm64 macOS** ffmpeg. Apunta would have to build and maintain its own.

### 3.3 If we shipped an LGPL ffmpeg anyway: the concrete obligations

Two clauses matter. Both quoted from `COPYING.LGPLv2.1` in the FFmpeg repo [P].

**We would be distributing the Library itself in executable form**, so **§4**
attaches:

> 4. You may copy and distribute the Library (or a portion or derivative of it,
> under Section 2) in object code or executable form under the terms of Sections
> 1 and 2 above provided that you accompany it with the complete corresponding
> machine-readable source code, which must be distributed under the terms of
> Sections 1 and 2 above on a medium customarily used for software interchange.
>
> If distribution of object code is made by offering access to copy from a
> designated place, then offering equivalent access to copy the source code from
> the same place satisfies the requirement to distribute the source code, even
> though third parties are not compelled to copy the source along with the
> object code.

Note what §4 does **not** contain: a "written offer valid for three years"
option. That option exists in GPLv2 §3(b) and in LGPL §6(c) for a *combined
work*, but not in LGPL §4 for the Library itself. In practice the second
paragraph is the escape hatch: publish the exact ffmpeg source tarball you built
from **as an asset in the same GitHub release as the `.dmg`**. That is
"equivalent access... from the same place" and is cheap to automate.

**§6** is the clause everyone worries about, and it is the one that does **not**
apply here:

> 6. As an exception to the Sections above, you may also combine or link a "work
> that uses the Library" with the Library to produce a work containing portions
> of the Library, and distribute that work under terms of your choice, provided
> that the terms permit modification of the work for the customer's own use and
> reverse engineering for debugging such modifications.
>
> You must give prominent notice with each copy of the work that the Library is
> used in it and that the Library and its use are covered by this License. You
> must supply a copy of this License. [...] Also, you must do one of these
> things:
>
>     a) Accompany the work with the complete corresponding machine-readable
>     source code for the Library [...] so that the user can modify the Library
>     and then relink [...]
>
>     b) Use a suitable shared library mechanism for linking with the Library.
>     [...]
>
>     c) Accompany the work with a written offer, valid for at least three
>     years, to give the same user the materials specified in Subsection 6a [...]
>
>     d) If distribution of the work is made by offering access to copy from a
>     designated place, offer equivalent access to copy the above specified
>     materials from the same place.

**Apunta never links against libav\*.** It spawns `ffmpeg` as a separate
process and talks to it through argv and the filesystem. The FSF's long-standing
position is that separate processes communicating at arm's length are separate
programs, so the Apunta server is not a "work that uses the Library" in §6's
sense and the relink obligation does not reach our code. [I] — this is the
standard reading, widely relied on, but it *is* a reading.

So the practical LGPL compliance burden, if we shipped it, is small:

1. Build ffmpeg **without** `--enable-gpl`, **without** `--enable-nonfree`, and
   **without** `--enable-version3` (that last one is needed to keep it at LGPL
   v2.1+ rather than escalating to v3 — the Homebrew formula's own comment
   confirms `--enable-version3` changes the licence [P]).
2. Ship `COPYING.LGPLv2.1` and the FFmpeg copyright notice inside the app and in
   `THIRD-PARTY-LICENSES.md`; state prominently that ffmpeg is included and is
   LGPL-licensed.
3. Publish the exact corresponding source tarball plus the `configure` line, as
   a release asset alongside the `.dmg`.
4. Ship an *unmodified* ffmpeg (if we patch it, the patched source must go in
   the tarball too).
5. Also confirm no bundled external library escalates the licence — `x264` and
   `x265` are GPL and force `--enable-gpl`; `fdk-aac` and OpenSSL are
   `--enable-nonfree` and make the binary **non-redistributable at all** [P].

That is genuinely satisfiable. The reason not to do it is not legal, it is that
**maintaining a custom LGPL arm64 ffmpeg build is a permanent job** for a solo
project — a build script, a toolchain, a source-publication step, a re-signing
step, and a security-update treadmill — in exchange for one 30-second
transcoding task.

### 3.4 What Apunta actually needs ffmpeg for — and why it doesn't

Two jobs, both tiny:

- **M5 deliverable 1:** `webm/opus (Chrome MediaRecorder) → 16 kHz mono 16-bit WAV`.
- **M5 deliverable 3:** probe duration with `ffprobe`.

Two discoveries kill both.

**Discovery 1 — whisper.cpp no longer needs 16 kHz WAV input.** The README still
says [P]:

> Note that the [whisper-cli](examples/cli) example currently runs only with
> 16-bit WAV files, so make sure to convert your input before running the tool.

But the **code disagrees with the README.** `examples/common-whisper.cpp`
(fetched 2026-08-22) [P] now decodes via **miniaudio**:

```cpp
#define MA_NO_DEVICE_IO
#define MA_NO_THREADING
#define MA_NO_ENCODING
...
#define MINIAUDIO_IMPLEMENTATION
#include "miniaudio.h"
...
decoder_config = ma_decoder_config_init(ma_format_f32, stereo ? 2 : 1, WHISPER_SAMPLE_RATE);
...
// first try miniaudio. if it fails (or skipped) - try ffmpeg
result = ma_decoder_init_file(fname.c_str(), &decoder_config, &decoder);
```

The decoder config names the **output** format (f32, mono/stereo,
`WHISPER_SAMPLE_RATE` = 16000), and miniaudio inserts a converter/resampler to
reach it [I — this is miniaudio's documented decoder semantics, but I did not
run it]. It also handles `fname == "-"` by reading the whole stream from stdin
[P]. Built-in formats are **WAV, MP3, FLAC**, plus **Ogg Vorbis** via the
`stb_vorbis.c` include [P]. The `ffmpeg_decode_audio` fallback only exists when
built with `WHISPER_COMMON_FFMPEG` [P] — which we must **not** enable, since
that would link whisper.cpp against libav\* and drag §6 back in.

What miniaudio does **not** decode: **Opus, and the WebM container** — exactly
what Chrome's MediaRecorder emits. That is the entire remaining gap.

**Discovery 2 — the browser can close that gap for free.** Chrome can be asked
for a 16 kHz audio graph directly. From Chromium source,
`third_party/blink/renderer/platform/audio/audio_utilities.cc` [P]:

```cpp
float MinAudioBufferSampleRate() {
  // crbug.com/344375
  return 3000;
}

float MaxAudioBufferSampleRate() {
  // <video> tags support sample rates up 768 kHz so audio context
  // should too.
  return 768000;
}
```

So `new AudioContext({ sampleRate: 16000 })` is valid in Chrome. (A search
snippet claiming Chrome only allows 44100–96000 [S] is stale — the source above
supersedes it.)

**The replacement, in full:**

```
getUserMedia
  → new AudioContext({ sampleRate: 16000 })     // Chrome resamples the mic for us
  → MediaStreamAudioSourceNode
  → AudioWorkletNode                            // receives Float32Array @16 kHz mono
  → accumulate Int16 chunks (clamp + ×32767)
  → on stop: prepend a 44-byte RIFF/WAVE header
  → POST the Blob to /api/transcribe
  → server writes it to a temp file, spawns whisper-cli -f <file>
```

No ffmpeg. No ffprobe. No transcoding step on the server at all. Duration is
`pcmBytes / (16000 × 1 × 2)` seconds, exact.

Belt and braces: because whisper-cli resamples internally anyway, even if the
browser hands back 48 kHz stereo on some machine, whisper still works. The
16 kHz AudioContext is an optimisation (11× smaller upload), not a correctness
requirement.

**Costs, stated honestly:**

- **Upload size.** 16 kHz mono 16-bit PCM = 32 KB/s. A 5-minute dictation is
  9.6 MB; the packet's 60-minute cap is 115 MB. Over `127.0.0.1` that is a
  non-issue for time, but it is real memory: the Int16 chunks accumulate in the
  tab. 115 MB of `ArrayBuffer` is survivable but not free. Mitigations, in
  increasing order of effort: (a) keep the 60-minute cap and accept it; (b) warn
  at 30 minutes; (c) stream the POST body with a `ReadableStream` so the tab
  holds only a rolling buffer. Recommend (a) + (b) for M5, note (c) as a
  follow-up. A therapy-session summary is typically 2–5 minutes.
- **An AudioWorklet module is a separate file.** It must be bundled by Vite as
  an asset and loaded with `audioWorklet.addModule(new URL('./pcm-worklet.js',
  import.meta.url))`. No CDN, so hard rule 1 is fine.
- **`MediaRecorder` is no longer used** for the primary path. The prototype's
  UI (pulsing dot, mm:ss timer) is unaffected — those are driven by a timer, not
  by MediaRecorder.
- **The `keep_audio` setting stores WAV, not WebM.** Larger on disk. Note it in
  the Settings copy.

**Bonus:** this is *more* portable, not less. Safari's MediaRecorder emits
MP4/AAC, which miniaudio also cannot decode; Web Audio behaves identically
across browsers. The ffmpeg path was the Chrome-specific one.

### 3.5 Alternatives considered and rejected

| Option | Why not |
| --- | --- |
| Bundle a custom LGPL arm64 ffmpeg | Legally fine (§3.3) but a permanent maintenance and toolchain burden for one 30-second job. |
| Bundle GPL ffmpeg and open-source Apunta under GPL | Would work legally, but forecloses the "possible product someday" in PLAN §1 and adds no user value. |
| `WHISPER_COMMON_FFMPEG` build of whisper.cpp | Links whisper.cpp *against* libav\*, which re-engages LGPL §6 relinking obligations on a binary we build. Strictly worse than a separate process. |
| macOS `afconvert` (built in, zero bundling) | CoreAudio cannot demux WebM. Would work only if the browser already produced WAV — at which point we don't need it either. And it is macOS-only, against hard rule 4. |
| WASM Opus/WebM decoder in the browser | Solves the same problem as Web Audio but with a dependency and a bundle-size hit, and `decodeAudioData` already does it natively. |
| Keep ffmpeg as an *optional* server path | **Do this.** See §11 — the server should use a WAV directly when it gets one, and never require ffmpeg. M7's setup script can keep installing ffmpeg for developers; the health check just must not treat it as required. |

---

## 4. llama.cpp / `llama-server`

**Licence — verified [P].** `LICENSE` at `ggml-org/llama.cpp@master`:

> MIT License
>
> Copyright (c) 2023-2026 The ggml authors

MIT: keep the copyright notice and the licence text with the distribution. No
source-offer, no relink obligation, no copyleft. Satisfied by a section in
`THIRD-PARTY-LICENSES.md` and the About page. The release tarball already
contains a copy of `LICENSE` (the workflow does `cp LICENSE ./build/bin/` before
tarring) [P] — keep it inside the app bundle's Resources.

**Prebuilt macOS arm64 binaries exist and are current — verified [P].** Latest
b-tagged release at the time of writing is **b10586, 2026-08-22 16:03 UTC**, and
its asset list includes:

```
llama-b10586-bin-macos-arm64.tar.gz   10.3 MB
llama-b10586-bin-macos-x64.tar.gz     10.6 MB
```

Note a versioning change: llama.cpp introduced semantic-version tags on
2026-08-21 (`v0.2.0`), described as the stable line "recommended for downstream
distribution", with `b[NUM]` tags remaining bleeding-edge [P]. **But `v0.2.0`
carries only `nightly-tag.txt` and source archives — no binaries** [P]. So today,
pinning means pinning a `b` tag. Re-check before M8 ships: if the `vX.Y.Z` line
starts publishing binaries, pin that instead.

**Metal: nothing extra to ship — verified [P].** The release workflow's macOS
arm64 matrix entry:

```yaml
- build: 'arm64'
  os: macos-26
  defines: "-DGGML_METAL_EMBED_LIBRARY=ON -DCMAKE_OSX_DEPLOYMENT_TARGET=13.3"
```

and `ggml/CMakeLists.txt`:

```cmake
option(GGML_METAL_EMBED_LIBRARY "ggml: embed Metal library" ${GGML_METAL})
```

`GGML_METAL_EMBED_LIBRARY` compiles `ggml-metal.metal` into a
`__DATA,__ggml_metallib` section of the binary [P]. **No `.metallib` sidecar
file, no shader directory.** If you ever build from source yourself, do not turn
this off — the non-embed branch copies loose `.metal` files next to the binary,
which then become unsigned resources you have to seal.

**Two consequences you must plan for:**

1. `-DCMAKE_OSX_DEPLOYMENT_TARGET=13.3` [P] — the bundled binaries require
   **macOS 13.3 Ventura or later**. Set `LSMinimumSystemVersion` / Tauri's
   `minimumSystemVersion` to match, or the failure mode is a dyld error at
   spawn time with no UI.
2. `BUILD_SHARED_LIBS` defaults **ON** on macOS [P]
   (`CMakeLists.txt`: `set(BUILD_SHARED_LIBS_DEFAULT ON)` for everything except
   Emscripten and MinGW), and the release build sets
   `-DCMAKE_INSTALL_RPATH='@loader_path' -DCMAKE_BUILD_WITH_INSTALL_RPATH=ON`
   [P]. So the tarball is `llama-server` **plus** `libllama.dylib`,
   `libggml.dylib`, `libggml-base.dylib`, `libggml-cpu.dylib`,
   `libggml-metal.dylib`, `libmtmd.dylib` and friends [I — inferred from the
   build config; verify by listing the tarball on the Mac], and they must land
   **in the same directory** as the executable. Every one of them is separately
   signed nested code. See §7.3.

**Structured output works — verified [P].** PLAN §5's load-bearing assumption is
schema-constrained sampling. `common/chat.cpp` implements `json_schema` →
GBNF grammar for the OpenAI-compatible `response_format` path:

```cpp
auto has_response_format = inputs.json_schema.is_object() && !inputs.json_schema.empty();
auto include_grammar     = has_response_format || (has_tools && ...);
```

So swapping Ollama → llama-server preserves the guarantee. It also *improves*
it: the MLX silent-ignore bug that `docs/decisions.md` records against Ollama
(`ollama#16563`) has no analogue here, because llama.cpp is GGUF-only and
grammar enforcement is in the sampler.

**Network posture — verified [P].** `common/common.h`: `std::string hostname =
"127.0.0.1";` and `int32_t port = 8080;`. `common/arg.cpp` provides
`--offline` ("Offline mode: forces use of cache, prevents network access", env
`LLAMA_ARG_OFFLINE`) and `--no-webui`. The release build links BoringSSL
(`-DLLAMA_BUILD_BORINGSSL=ON`) [P], so the binary *can* do HTTPS — always pass
`--offline`, never pass `-hf`/`-hfr`/`--hf-repo`/`-dr`/`--docker-repo`, and add
a smoke assertion that the spawned process has no non-loopback socket.

**Architecture note.** The `macos-x64` build is deliberately `-DGGML_METAL=OFF`
[P] — Metal is disabled on Intel because the CI runners lack a GPU. A CPU-only
x86_64 build running a 12B model is not a product. **Recommendation: ship arm64
only**, set the minimum system version, and say "Apple Silicon Mac (M1 or later),
macOS 13.3+" on the download page. PLAN §1 already targets Apple Silicon. An
Intel user double-clicking an arm64-only app gets a clear macOS error rather
than a slow, broken experience.

---

## 5. whisper.cpp / `whisper-cli`

**Licence — verified [P].** Identical MIT text to llama.cpp:

> MIT License
>
> Copyright (c) 2023-2026 The ggml authors

**There is no prebuilt macOS binary. This is the finding that costs work.**
Verified two ways [P]:

1. The latest release (**b4938 / v1.9.3, 2026-08-20**) asset list is:
   `whisper-b4938-xcframework.zip` (51.1 MB), `whisper-bin-ubuntu-arm64.tar.gz`,
   `whisper-bin-ubuntu-x64.tar.gz`, `whisper-bin-Win32.zip`,
   `whisper-bin-x64.zip`, `whisper-blas-bin-Win32.zip`,
   `whisper-blas-bin-x64.zip`, `whisper-cublas-11.8.0-bin-x64.zip`,
   `whisper-cublas-12.4.0-bin-x64.zip`, plus source archives.
2. `.github/workflows/release.yml` has jobs `determine-tag`, `ubuntu-cpu`,
   `windows`, `windows-blas`, `windows-cublas`, `ios-xcode-build`, `release`.
   The only macOS runner job produces the **xcframework** (an Apple *library*
   bundle), not the `whisper-cli` executable.

**Options, ranked:**

| Option | Assessment |
| --- | --- |
| **A. Build `whisper-cli` from source at packaging time** *(recommended)* | `cmake -B build -DCMAKE_BUILD_TYPE=Release -DWHISPER_BUILD_TESTS=OFF -DWHISPER_BUILD_SERVER=OFF -DBUILD_SHARED_LIBS=OFF -DCMAKE_OSX_DEPLOYMENT_TARGET=13.3` on the owner's Mac. Needs Xcode Command Line Tools + cmake — the owner has both, and M8's build script is a developer tool. Prefer `BUILD_SHARED_LIBS=OFF` here: a static `whisper-cli` is one Mach-O to sign instead of five. Metal shaders embed automatically [P]. |
| **B. Build it in a GitHub Actions `macos-*` job** | Reproducible, checksummable, and keeps the owner's Mac out of the loop for the binary. Costs a new CI job on a non-ubuntu runner, which the project has so far avoided (PLAN §6). Reasonable if the owner wants a hands-off build. |
| **C. Link whisper.cpp into the Tauri shell via `whisper-rs`** | Removes a spawned process and a signing target entirely. But it puts inference inside the app's main binary, changes the `SttProvider` boundary that PLAN §5 defines, and makes crashes take the whole app down. **Not recommended** — the process boundary is a feature. |
| **D. Homebrew `whisper-cpp` bottle** | Not viable: the formula builds with `WHISPER_USE_SYSTEM_GGML`, so the binary links against Homebrew's ggml dylibs at Homebrew paths. Relocating and re-signing someone else's bottle into an app bundle is fragile and defeats the "no Homebrew" premise. |

**Core ML: skip it.** From the whisper.cpp README [P], enabling Core ML requires
generating a `.mlmodelc` per model with `coremltools` (Python) plus Xcode, then
shipping or downloading that alongside the GGUF, and:

> The first run on a device is slow, since the ANE service compiles the Core ML
> model to some device-specific format.

For a large-v3-turbo model that is another several-hundred-MB artifact, another
download, another signing target, and a first-transcription stall that reads as
"the app is broken". README claims ">x3 faster" encoder inference on the ANE
[P], which is real, but Metal already runs "fully on the GPU" [P] and is free.
**Recommendation: Metal only for M8; revisit Core ML as a post-1.0 optimisation.**

### 5.1 The Whisper model file

Identity, inherited from `docs/research/macos-setup-verification.md` §4 (which
derived it from whisper.cpp's own `models/download-ggml-model.sh`) and
re-confirmed against `models/README.md` today [P]:

| Field | Value |
| --- | --- |
| Filename | `ggml-large-v3-turbo-q5_0.bin` |
| Size | **547 MiB** |
| SHA1 | `e050f7970618a659205450ad97eb95a18d69c9ee` |
| URL | `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin` |

Note the HF owner is `ggerganov`, not `ggml-org` — the GitHub org was renamed but
the model repo was not. Getting this wrong is a 404.

**Weight licensing.** The underlying Whisper weights are MIT: `openai/whisper`
`LICENSE` reads "MIT License / Copyright (c) 2022 OpenAI" [P]. The GGML
conversion is a format change, not a new work of authorship in any meaningful
sense [I]. **We could legally bundle this file.** We choose not to, purely to
keep the `.dmg` near 100 MB and to keep weights out of our distribution
entirely — which is also what M8 deliverable 4 asks for. `models/README.md`
carries no separate licence statement [P]; cite `openai/whisper`'s MIT licence in
`THIRD-PARTY-LICENSES.md`.

**Only SHA1 is published, not SHA256** [P from §4 of the existing doc]. M8's
"verified by checksum after download" must therefore use SHA1 for this file. That
is a weak hash. Recommendation: compute the SHA256 once on the owner's Mac after
verifying the SHA1, pin **our own** SHA256 in the repo, and check that from then
on. Document that the SHA256 is Apunta's, not upstream's.

---

## 6. Node runtime

Requirement: run a Fastify + `better-sqlite3` server with nothing installed.

### 6.1 The constraint everything else trips over: `better-sqlite3` is a native addon

`docs/decisions.md` pins `better-sqlite3` 13.0.3. That is a compiled `.node`
Mach-O. Every "compile the server to one file" approach has to answer for it.

Node's own SEA documentation is explicit (fetched 2026-08-22, stability
**"1.1 - Active development"**) [P]:

> **Native addons** — Can be bundled as assets but require a workaround: write
> the asset to a temporary file, load with `process.dlopen()`, clean up the temp
> file.

Under hardened runtime, `dlopen`ing a `.node` written to `/tmp` at runtime is
precisely the thing library validation exists to stop. You would need
`com.apple.security.cs.disable-library-validation`, which weakens the app's
security posture, and you would be relying on a temp-file dance that a future
macOS could tighten. **This is a self-inflicted wound; don't take it.**

### 6.2 Options compared

| Option | Bundle size (arm64) | Signing complexity | Notarization | Verdict |
| --- | --- | --- | --- | --- |
| **Stock `node` binary in `Contents/MacOS/`** | `bin/node` v24.19.0 = **121,306,800 B (115.7 MiB)** raw; **37.3 MiB gzip**, 23.9 MiB xz [P, measured] | Low: one extra Mach-O + one `.node` addon, both re-signed with our Developer ID, both same Team ID → library validation passes untouched | Clean — an ordinary nested executable | **Recommended** |
| **Node SEA** (`node --build-sea`, new in v25.5.0 [P]) | ~same 116 MiB (it *is* node with a blob injected) | High: `codesign --remove-signature` → `postject`/`--build-sea` → re-sign; plus the native-addon temp-file `dlopen` problem; plus `__filename === process.execPath` breaks path assumptions [P] | Risky: needs `disable-library-validation` for the addon | **No** — all the pain, none of the size win |
| **Bun `bun build --compile`** | ~57–60 MB for hello-world macOS arm64 [S] | Medium | Unknown for our stack | **No** — swaps the whole runtime (and `better-sqlite3` compatibility) to save ~50 MB |
| **Deno `deno compile`** | ~58 MB hello-world macOS arm64 [S] | Medium | Unknown | **No** — same objection, plus npm-compat risk with a native addon |
| **Electron shell hosting the server in its main process** | ~150 MB+ for the Electron runtime, which *includes* Node | Medium (Electron's signing story is well-trodden) | Well-trodden | Only if the shell is Electron anyway (§7.1) — then Node comes free and this row wins on size |

**Recommendation: ship the stock `node` binary**, trimmed. You need
`bin/node` and nothing else from the tarball — drop `lib/node_modules/npm`,
`corepack`, `include/`, `share/`, `CHANGELOG.md`. Put it at
`Contents/MacOS/node` (Apple's bundle table lists `Contents/MacOS/` as the
correct location for a helper tool [P] — see §7.3), bundle the server's JS with
esbuild into one file in `Contents/Resources/`, and keep `better-sqlite3`'s
`.node` as a real file that you sign.

**Size reality check.** 37.3 MiB of the ~100 MB installer budget goes to Node
before a line of Apunta ships. Add ~10 MB llama.cpp, ~5 MB whisper-cli, ~5 MB
web assets, ~10 MB Tauri/Electron shell: an arm64-only, models-excluded `.dmg`
lands somewhere around **60–90 MB with UDZO (zlib) compression** [I]. The
packet's "roughly ~100MB" is achievable, but only if models genuinely download
at first run and you do not also ship x86_64. A universal binary would roughly
double the native payload — another reason for §4's arm64-only recommendation.

**Aside worth a decisions.md row later:** Node 22+ ships `node:sqlite` in core.
If a future packet ever wanted to drop the native addon entirely, that is the
escape hatch — and it would make SEA viable. Not an M8 change; the M1 decision
stands.

---

## 7. Apple signing and notarization

### 7.1 What $99/year actually buys

Apple Developer Program membership is **99 USD per membership year** and is the
only tier that includes "Notarization & Developer ID for Mac apps"; a free Apple
Account can develop and test locally but cannot obtain a Developer ID or use the
notary service [P, developer.apple.com/support/compare-memberships].

Concretely, membership gets you:

- A **Developer ID Application** certificate (signs the `.app`, all nested
  Mach-Os, and the `.dmg`).
- A **Developer ID Installer** certificate (only needed for `.pkg` — we don't
  need one).
- Access to the **Apple notary service** via `notarytool`.
- The ability to have Gatekeeper say "Apple checked it for malicious software
  and none was detected" instead of a scare dialog.

It does **not** buy App Store review, and notarization is explicitly not review:
"Notarization of macOS software is not App Review. The Apple notary service is an
automated system that scans your software for malicious content, checks for
code-signing issues, and returns the results to you quickly." [P]

### 7.2 What notarization requires

Apple's checklist, quoted [P]:

> Apple's notary service requires you to adopt the following protections:
>
> - Enable code-signing for all of the executables you distribute, and ensure
>   that executables have valid code signatures [...]
> - Use a "Developer ID" application, kernel extension, system extension, or
>   installer certificate for your code-signing signature. (Don't use a Mac
>   Distribution, ad hoc, Apple Developer, or local development certificate.)
> - **Enable the Hardened Runtime capability for your app and command line
>   targets** [...]
> - **Include a secure timestamp with your code-signing signature.**
> - Don't include the `com.apple.security.get-task-allow` entitlement with the
>   value set to any variation of `true`.
> - Link against the macOS 10.9 or later SDK [...]
> - Ensure your processes have properly-formatted XML, ASCII-encoded
>   entitlements [...]

Note "**and command line targets**" — that is `node`, `llama-server` and
`whisper-cli`. They each need hardened runtime, not just the shell.

Also note the secure timestamp requires network access to `timestamp.apple.com`
at *build* time [P] — an offline build machine silently produces unnotarizable
artifacts, with the error "The signature does not include a secure timestamp."

### 7.3 The classic failure: spawning bundled helper binaries under hardened runtime

This is where M8 will actually break. Three separate rules combine.

**Rule 1 — entitlements do not inherit across `exec`.** From Apple's Hardened
Runtime documentation [P]:

> You add entitlements only to executables. Shared libraries, frameworks, and
> in-process plug-ins inherit the entitlements of their host executable.

Read the omission carefully: *in-process* things inherit. A **spawned child
process is a new executable with its own signature and its own entitlements.**
Signing only `Apunta.app` and assuming `llama-server` inherits from it is the
single most common way this goes wrong. `llama-server`, `whisper-cli` and `node`
must each be signed with `--options runtime` and, where needed, their own
`--entitlements` plist.

**Rule 2 — placement determines whether `codesign` even sees it as code.** Apple's
"Placing content in a bundle" [P] warns:

> If you put content in the wrong location, you may encounter hard-to-debug code
> signing and distribution problems. These problems aren't always immediately
> obvious. For example, when building a Mac app, incorrectly placed code might
> work during day-to-day development, but might cause problems during
> notarization.

and its table gives, for macOS:

| Content type | Location |
| --- | --- |
| main executable | `Contents/MacOS/` |
| resource | `Contents/Resources/` |
| framework, dynamic library | `Contents/Frameworks/` |
| help app, helper tool | `Contents/MacOS/` or `Contents/Helpers/` |

So: **`node`, `llama-server`, `whisper-cli` → `Contents/MacOS/`** (or
`Contents/Helpers/`); **`libllama.dylib` and the `libggml*.dylib` family →
`Contents/Frameworks/`**; bundled JS, the web build, licence files →
`Contents/Resources/`. Putting a Mach-O in `Resources/` is the failure mode Apple
is describing above.

There is a wrinkle here worth planning for: llama.cpp's binaries are built with
`-DCMAKE_INSTALL_RPATH='@loader_path'` [P], meaning they look for their dylibs
**next to the executable**, i.e. in `Contents/MacOS/`, not in
`Contents/Frameworks/`. Two ways out: (a) `install_name_tool -add_rpath
@executable_path/../Frameworks` on `llama-server` before signing, or (b) put
`llama-server` and its dylibs together in `Contents/Helpers/llama/`. (b) is
simpler and stays within Apple's table. Whichever you choose, **do it before
signing** — any modification after signing invalidates the signature ("The
signature of the binary is invalid.") [P].

**Rule 3 — sign inside-out, and don't use `--deep`.** Nested code must be signed
before its container, because the container's signature seals over the already-
signed nested code [S, consistent across Apple Developer Forums guidance]. A
correct order for Apunta:

```
1. libggml*.dylib, libllama.dylib, libmtmd.dylib   (each: --options runtime --timestamp)
2. llama-server, whisper-cli, node                 (each: --options runtime --timestamp [--entitlements helper.plist])
3. any nested .app / XPC service
4. Apunta.app itself                               (--options runtime --timestamp --entitlements app.plist)
5. verify: codesign -vvv --deep --strict Apunta.app
6. verify: spctl -vvv --assess --type exec Apunta.app
```

Both verification commands are Apple's own recommendations [P]:

> ```
> % codesign -vvv --deep --strict /path/to/binary/or/bundle
> ```
> Use the `vvv` option to perform a verification with elevated verbosity. You use
> the `deep` option to ensure the utility checks nested code content. The
> `strict` option increases the restrictiveness of the validation to match that
> required by notarization.

`--deep` is fine for *verifying*; using it to *sign* applies one set of options
to everything and is discouraged.

### 7.4 Which entitlements do we actually need?

Start with **none** and add only what fails. That is Apple's instruction: "Make
sure to use only the entitlements that are absolutely necessary for your app's
functionality." [P] Spawning a signed, hardened child process needs **no special
entitlement at all** — the myth that it does usually traces back to someone
shipping an unsigned helper.

Candidates, in the order you will hit them:

| Entitlement | Needed? | Reasoning |
| --- | --- | --- |
| *(none)* — just `--options runtime` on every Mach-O | **Start here** | If everything is signed with the same Team ID, library validation is satisfied and `posix_spawn` works. |
| `com.apple.security.cs.allow-jit` | **Probably, on `llama-server`** [I] | Metal shader compilation and ggml's runtime code paths can allocate executable memory. Test first; add only to the helper's plist, not the app's. |
| `com.apple.security.cs.allow-unsigned-executable-memory` | **Only if `allow-jit` is insufficient** [I] | Strictly weaker security than `allow-jit`. Do not add speculatively. |
| `com.apple.security.cs.disable-library-validation` | **Only for `node`, and only if needed** [I] | Needed if a `.node` addon ends up signed by a different identity or unsigned. If you sign `better_sqlite3.node` yourself, you should not need this. Apple's own docs say: "Don't disable library validation for executables that don't host plug-ins" [P]. |
| `com.apple.security.cs.allow-dyld-environment-variables` | No | Nothing here needs `DYLD_*`. |
| `com.apple.security.get-task-allow` | **Must be absent** | Its presence fails notarization outright: "The executable requests the com.apple.security.get-task-allow entitlement." [P] Electron/Tauri debug builds set it — make sure the release path does not. |
| Microphone (`NSMicrophoneUsageDescription`) | **Not for the app** [I] | The mic is accessed by the *browser*, which has its own TCC prompt. The app bundle never touches audio. Worth confirming on the Mac. |

**Concrete M8 acceptance step:** after the first successful build, run
`codesign -d --entitlements - Apunta.app/Contents/MacOS/llama-server` and paste
the output in the PR. A helper with zero entitlements that still spawns and runs
is the proof this section is satisfied.

### 7.5 The notarization + stapling flow

```sh
# 1. build + sign inside-out (§7.3)
# 2. zip for submission — Apple: "you can't upload the .app bundle directly"
ditto -c -k --keepParent "Apunta.app" "Apunta.zip"          # [P]

# 3. submit
xcrun notarytool submit Apunta.zip \
  --keychain-profile "notarytool-password" --wait            # [P]

# 4. staple the ticket onto the .app
xcrun stapler staple "Apunta.app"

# 5. build the .dmg from the stapled .app, sign the .dmg,
#    notarize the .dmg, staple the .dmg  (§9)
```

Credentials are stored once, out of the build script [P]:

```sh
xcrun notarytool store-credentials "notarytool-password" \
  --apple-id "<AppleID>" --team-id <DeveloperTeamID> --password <app-specific-password>
```

`altool` is dead: "the Apple notary service no longer supports `altool` from
November 1, 2023" [P]. Any tutorial mentioning `altool` is stale.

Two useful properties [P]: the notary service "generates a ticket for the
top-level file that you specify, as well as for each nested file", and typical
turnaround is "less than an hour" (in practice minutes). Build the script so a
notarization failure prints the notary **log URL**, not just "failed" — Apple's
log names the exact offending binary, and without it you are guessing.

### 7.6 What the user sees when it is right, and when it is wrong

- **Signed + notarized + stapled:** a one-time dialog on first launch saying
  macOS verified the app and *"Apple checked it for malicious software and none
  was detected"* [S]. One click. This is the experience M8 exists to deliver.
- **Signed with Developer ID but not notarized:** *"Apple could not verify
  'Apunta' is free of malware that may harm your Mac or compromise your
  privacy"* [S], with no Open button in the dialog.
- **Ad-hoc signed or unsigned:** blocked; see §8.
- **Notarized but not stapled:** works while online (Gatekeeper fetches the
  ticket), fails or stalls offline. **Always staple.** For a privacy-first app
  whose users may be offline, this is not optional.
- **Signature broken after signing** (e.g. you `install_name_tool`d a dylib, or
  a build step rewrote a file): "The signature of the binary is invalid." [P]

---

## 8. The unsigned fallback — and why it is not viable

Suppose the owner declines the $99. What must the therapist do?

**On macOS 15 Sequoia and later, the Control-click→Open trick no longer works.**
Apple, 2024-08-06 [P, developer.apple.com/news/?id=saqachfa]:

> In macOS Sequoia, users will no longer be able to Control-click to override
> Gatekeeper when opening software that isn't signed correctly or notarized.
> They'll need to visit System Settings > Privacy & Security to review security
> information for software before allowing it to run.

So the actual steps on a current Mac are:

1. Download the `.dmg`. Safari attaches `com.apple.quarantine` to it; the
   attribute propagates to the app when it is copied out.
2. Open the `.dmg`, drag `Apunta` to Applications.
3. Double-click it. A dialog appears saying macOS cannot verify the developer,
   with only **Move to Trash** and **Cancel**. There is no "Open" button.
4. Open **System Settings → Privacy & Security**, scroll down past FileVault,
   Firewall and Lockdown Mode to a paragraph that appeared only because of step
   3, and click **Open Anyway**.
5. Authenticate with Touch ID or the login password.
6. Confirm a second dialog by clicking **Open**.
7. **Then discover it still doesn't work** — because every *nested* binary is
   also quarantined and unsigned, and the first `posix_spawn` of `llama-server`
   or `node` fails silently or with a crash report. On Apple Silicon, arm64
   Mach-O binaries must carry at least an ad-hoc signature to execute at all
   [S], so an unsigned helper does not run even after the app is approved.

Step 7 is the killer. Steps 1–6 are merely humiliating; step 7 means the
fallback **does not produce a working app**, only a working *shell*.

**Verdict: a non-technical therapist cannot complete this, and should not be
asked to.** M8 deliverable 8 asks for a guide with "no jargon, no commands" —
that guide cannot be written for the unsigned path honestly.

**Least-bad unsigned path, if it must exist** (ranked):

1. **Ad-hoc sign everything** (`codesign -s - --force --deep`) at build time, so
   binaries at least *execute* on Apple Silicon. This fixes step 7 but not the
   Gatekeeper dialog.
2. **Ship a `.zip`, not a `.dmg`.** Counterintuitive, but quarantine handling for
   a folder dragged out of a zip is no worse and there is one less mount step.
3. **Document the System Settings dance with screenshots**, and be explicit that
   it is a limitation of not being a registered developer, not a sign the app is
   unsafe.
4. **Never** tell the user to run `xattr -dr com.apple.quarantine
   /Applications/Apunta.app`. It requires Terminal (violating the packet's own
   bar), and it teaches a therapist a habit that malware distributors rely on.

**Recommendation to the owner: buy the membership.** $99/year against the
alternative — a support burden on every install, a scary dialog on software that
handles PHI, and a real chance the app simply doesn't run — is not a close call.
If the answer is no, M8's scope should shrink honestly to "a developer-installable
build", and the packet's stated bar should be amended rather than quietly missed.

---

## 9. `.dmg` tooling

| Tool | Assessment |
| --- | --- |
| **`create-dmg/create-dmg`** (shell) | Recommended. "Nothing except a standard installation of macOS/OS X is required"; testing targets macOS 13+ as of 2026 [P, its README]. Supports `--codesign <signature>` ("codesign the disk image with the specified signature") and `--notarize <credentials>` ("notarize the disk image (waits and staples) with the keychain stored credentials") [P]. It also does the Applications-symlink + background-image layout that M8 deliverable 4 asks for. One shell dependency, no Node/Python. |
| **Raw `hdiutil` + `codesign` + `notarytool` + `stapler`** | Maximum control, ~40 lines, zero dependencies. Getting `hdiutil`'s arguments and the Finder window layout right is the fiddly part [S]. Fine if you don't want the fancy window. |
| **`sindresorhus/create-dmg`** (Node) | Convenient in an npm project but adds a Node toolchain dependency to the *packaging* step and less control over signing order. |
| **`appdmg`** (Node) | Older, JSON-configured; no built-in notarization. |
| **Tauri's / electron-builder's bundler** | If you pick that shell, it produces the `.dmg` for you and wires signing/notarization from config. But see the risk in §10.2 — Tauri's `externalBin` path has an open notarization bug. |

**The correct order matters and is easy to get wrong:** sign the `.app` →
notarize the `.app` → **staple the `.app`** → build the `.dmg` from the stapled
app → sign the `.dmg` → notarize the `.dmg` → staple the `.dmg`. Apple's docs
note the notary service "processes nested containers as well, like packages
inside a disk image" [P], so a single submission of the `.dmg` can cover both —
but stapling the inner `.app` separately is what makes the *installed* app work
offline. Do both.

Also: disk images must be signed with a **Developer ID Application** certificate
(not Installer, not Development) [S, consistent with Apple's "sign Mach-O files,
disk images, bundles, apps, command line tools [...] with a Developer ID
Application certificate" [P]).

---

## 10. Ranked risks to M8

### 10.1 — `whisper-cli` has no prebuilt macOS binary *(highest — certain, not speculative)*

**Verified [P].** M8 deliverable 1 says "bundle `whisper-cli`" as though you can
download it. You cannot. Packaging must compile whisper.cpp, which means the
build script needs cmake and Xcode CLT, a pinned upstream tag, and a
reproducible-output story so the shipped binary is auditable.

**Earlier-packet action:** none required of M5/M7, but M8's estimate must include
it, and the packet text should be corrected from "bundle `whisper-cli`
(whisper.cpp, MIT)" to "**build and bundle** `whisper-cli` from a pinned
whisper.cpp tag".

### 10.2 — The shell's sidecar signing path may be broken *(high)*

Tauri issue **#11992**, "MacOS - Codesigning and notarization issue when using
ExternalBin", is **open** and unresolved as of the last activity recorded on the
issue (opened 2024-12-17, still labelled `status: needs triage`) [P via the issue
page]. Reported symptom: notarization fails with "The signature of the binary is
invalid" the moment one or more sidecars are added via `externalBin`; removing
`externalBin` makes it notarize cleanly.

Apunta needs **three** sidecars plus a family of dylibs. If this bug is live, the
recommended shell's headline feature does not work for our exact use case.

**Mitigations, in order:**
1. Do not use `externalBin` at all. Place the helpers into the bundle with your
   own script *after* the shell's bundler runs, then do the whole inside-out
   signing pass yourself (§7.3) and hand the finished `.app` to
   `notarytool`. This is more code but it is code you control and can debug.
2. Verify the issue's current status at M8 implementation time — it may be fixed.
3. Treat "signs and notarizes with all four binaries present" as the **first**
   thing the owner tests on the Mac, before any UI work. If it fails, the shell
   choice is wrong and you want to know on day one.

**Earlier-packet action:** none. But M8 should sequence a signing smoke test
*first*, not last.

### 10.3 — ffmpeg cannot be redistributed as-is, and M5 is about to hardcode it *(high, and time-critical)*

The repo is at ~M1/M2 (`server/src/ai/` does not exist yet), so **M5 has not been
written**. This is the moment to change it, and the only such moment.

If M5 ships with ffmpeg on the critical path, M8 must either (a) build and
maintain a custom LGPL arm64 ffmpeg forever, (b) ship GPL ffmpeg and relicense
the app, or (c) rewrite the audio pipeline after it has tests, an e2e suite and a
health contract built around it. All three are worse than changing M5 now.

**Earlier-packet action: see §11 — this is the main deliverable of this research.**

### 10.4 — The GGUF model URLs for `llama-server` do not exist anywhere yet *(high)*

PLAN §2's tier table names **Ollama tags** (`qwen3.6:35b-a3b`,
`gemma4:12b-it-qat`, `qwen3.5:4b-q4_K_M`). `llama-server` does not consume Ollama
tags; it needs a **GGUF file path**. M8's first-run downloader therefore needs,
for each tier: a direct GGUF URL, a byte size, a checksum, a context-length
setting, and the weights' licence terms to show the user. **None of that is
recorded anywhere in the repo, and I could not fetch `huggingface.co` to derive
it** [U].

There is also a licensing wrinkle: Gemma-class weights ship under Google's Gemma
Terms of Use, not an OSI licence [U — could not fetch the terms]. We are not
redistributing them (the user downloads them), but the first-run window should
name the model, link its licence, and let the user proceed knowingly. Qwen models
are Apache-2.0 [U], which would be simpler; if the tier table is ever revisited,
licence simplicity is a legitimate tiebreaker.

**Earlier-packet action for M7:** M7 already has to verify Ollama tags on the
Mac (`macos-setup-verification.md` §2.5). While there, **also record the
equivalent GGUF repo/file/size/SHA256 for each tier** into
`docs/research/`. It is fifteen extra minutes during a verification pass that is
already happening, and it de-risks the largest unknown in M8.

### 10.5 — Bundle size vs. the ~100 MB target *(medium)*

Node alone is 37.3 MiB compressed [P, measured]. Shipping x86_64 or a universal
binary would roughly double the native payload and blow the budget.

**Action:** commit to **arm64-only** in `docs/decisions.md` now, and state the
minimum as **macOS 13.3+ on Apple Silicon** (forced by llama.cpp's
`CMAKE_OSX_DEPLOYMENT_TARGET=13.3` [P]).

### 10.6 — Hardened-runtime spawn failures *(medium, but well-understood)*

Covered in §7.3–7.4. The reason it is only medium: the fix is mechanical and the
diagnostics are good (`codesign -vvv --deep --strict`, `spctl --assess`, the
notary log). The reason it is not low: it fails *late*, after everything else
works, and the error messages are unhelpful if you don't know to look at nested
code.

**Action:** M8's build script should run `codesign -vvv --deep --strict` and
`spctl -vvv --assess --type exec` as **build steps that fail the build**, not as
manual checks.

### 10.7 — Model-download UX under hard rule 1 *(medium)*

Covered in §2. The risk is not technical, it is that an agent implements the
downloader inside the Node server "because that's where the code is", quietly
punching a hole in the egress guard that the tests were protecting.

**Action:** state in `docs/decisions.md` and in the M8 packet that the downloader
lives in the shell process and that the server's egress guard is not to be
relaxed. Keep the existing egress-guard test as-is; add a test asserting that no
model-download code is importable from `server/`.

### 10.8 — Pinning a moving target *(low)*

llama.cpp cuts multiple `b` releases **per day** (b10576→b10586 on 2026-08-22
alone [P]) and has just introduced a `vX.Y.Z` line that does not yet carry
binaries [P]. Pin one exact tag plus a SHA256 of the tarball; do not "get
latest".

### 10.9 — No auto-updater means no security-patch path *(low, accepted)*

`docs/decisions.md` already records "No auto-updater and no telemetry". A
consequence worth writing down in `INSTALL.md`: if a bundled binary needs a
security update, the user must download a new `.dmg`. The "Check for updates"
menu item that opens the releases page (M8 deliverable 5) is the whole mechanism.
That is a deliberate, correct trade for this product — just say so out loud.

---

## 11. What M5 and M7 should do differently, concretely

### M5 — the important one

**Change deliverable 1** from "Input audio file → ffmpeg (`-ar 16000 -ac 1`) to a
temp WAV → `whisper-cli`" to:

> `WhisperCppSttProvider` takes a **16 kHz mono 16-bit PCM WAV** that the client
> has already produced, writes it to a temp file, and spawns `whisper-cli -f
> <file>`. No transcoding step, no ffmpeg dependency.
>
> If the uploaded file is not already a WAV, do not transcode — reject it with a
> typed error. (`whisper-cli` will in fact accept WAV/MP3/FLAC/Ogg-Vorbis at any
> sample rate and resample internally via miniaudio, so a permissive path is
> available later if file import is ever added; it cannot handle Opus or WebM.)

**Change deliverable 4** from `MediaRecorder (webm/opus)` to:

> `getUserMedia` → `new AudioContext({ sampleRate: 16000 })` →
> `MediaStreamAudioSourceNode` → `AudioWorkletNode` that posts Float32 frames to
> the main thread → accumulate as Int16 → on stop, prepend a 44-byte RIFF/WAVE
> header and POST the Blob. The prototype's timer and pulsing dot are unchanged.
>
> Warn the user at 30 minutes and stop at 60 (unchanged), noting that WAV is
> ~32 KB/s so a 60-minute recording is ~115 MB held in the tab.

**Change deliverable 3:** duration comes from the WAV byte length, not `ffprobe`.

**Change the health contract.** `shared/src/health.ts` currently declares
`ffmpeg: z.object({ present: z.boolean() })`, and
`server/src/routes/health.ts` hardcodes `ffmpeg: { present: false }`. Either
drop the `ffmpeg` key entirely, or keep it as a purely informational field that
**does not gate `ok`**. Both PLAN §4 and M7 deliverable 2 (the setup wizard
checklist) list ffmpeg as a required item — both need updating in the same
change, or the wizard will refuse to go green on a machine that works fine.

**New unit tests this enables** (all pure, all CI-friendly, no macOS):
WAV header construction; Float32→Int16 clamping; duration-from-byte-length;
rejection of a non-WAV upload.

**E2E is unaffected:** Chromium's `--use-file-for-fake-audio-capture` feeds the
fake microphone, which Web Audio consumes exactly as MediaRecorder did.

**What this buys:** M8 ships no ffmpeg, writes no LGPL compliance machinery,
maintains no custom ffmpeg build, and has one fewer binary to sign, notarize and
place correctly in the bundle. It also removes a Chrome-specific container format
from the architecture.

### M7 — three small additions

1. **Keep installing ffmpeg via Homebrew if you like, but stop treating it as
   required.** After the M5 change it is a developer convenience, not a
   dependency. The setup wizard's checklist becomes: Ollama running / LLM model
   present / whisper binary / whisper model. If the wizard blocks on ffmpeg, a
   correctly-working machine shows red.
2. **While verifying Ollama tags on the Mac (§2.5 of the existing verification
   doc), also record the GGUF equivalents** — repo, filename, byte size,
   SHA256, and the weights' licence — for each RAM tier. Append to
   `docs/research/macos-setup-verification.md`. This is the single highest-value
   thing an earlier packet can do for M8 (risk 10.4).
3. **Compute and pin a SHA256 for `ggml-large-v3-turbo-q5_0.bin`** after
   verifying the upstream SHA1, and record it as Apunta's own checksum. M8's
   resumable downloader should not be verifying a 574 MB file with SHA1.

### PLAN / CLAUDE.md

- PLAN §2's architecture diagram has `API -- spawn --> FF --> WSP`. After the M5
  change it becomes `SPA -- 16kHz WAV --> API -- spawn --> WSP`.
- PLAN §4's `/api/health` shape drops or demotes `ffmpeg`.
- `CLAUDE.md` hard rule 1 gains the narrow model-acquisition carve-out (§2.2).
- `docs/decisions.md` gains rows for: arm64-only + macOS 13.3 minimum; ffmpeg
  replaced by browser-side WAV encoding; stock `node` binary over SEA; downloader
  lives in the shell process, not the server.

---

## 12. `THIRD-PARTY-LICENSES.md` — what must actually be in it

Minimum contents for the bundle recommended here:

| Component | Licence | Obligation |
| --- | --- | --- |
| llama.cpp (`llama-server` + `libllama`/`libggml*`/`libmtmd` dylibs) | MIT [P] | Reproduce copyright + licence text. |
| whisper.cpp (`whisper-cli`) | MIT [P] | Reproduce copyright + licence text. |
| miniaudio (vendored in whisper.cpp) | MIT-0 / public-domain dual [U — verify] | Reproduce if MIT branch chosen. |
| stb_vorbis (vendored in whisper.cpp) | MIT / public domain [U — verify] | Reproduce if MIT branch chosen. |
| BoringSSL (linked into llama.cpp release builds via `-DLLAMA_BUILD_BORINGSSL=ON` [P]) | Mixed permissive (OpenSSL/ISC/Apache-2.0 components) [U — read `LICENSE` in the pinned tree] | Reproduce all notices; check whether the Apache-2.0 parts require a `NOTICE` file. |
| Node.js (`node` binary) | MIT, plus a large bundled-dependency notice file — the tarball's `LICENSE` is **157,606 bytes** [P, measured] | Ship that file verbatim; do not hand-summarise it. |
| better-sqlite3 + SQLite | MIT + public domain [U — verify] | Reproduce. |
| Fastify, React, zod and the rest of the npm tree | mostly MIT/ISC/BSD-3 [U] | Generate mechanically (e.g. `license-checker`) rather than by hand; check for any GPL/AGPL that has crept in. |
| Whisper weights (downloaded, not shipped) | MIT (openai/whisper `LICENSE`) [P] | Attribute in About; no redistribution obligation since we don't ship them. |
| LLM weights (downloaded, not shipped) | Vendor terms — Gemma Terms of Use / Apache-2.0 depending on tier [U] | Show the model name and a link to its terms in the first-run window. |
| The shell framework (Tauri/Rust crates or Electron/Chromium) | MIT/Apache-2.0 (Tauri) or MIT + Chromium's BSD-3 + LGPL bits (Electron) | Electron's notice file is large and includes LGPL components — another point in Tauri's favour if this matters. |

Surface it in the About page as required by M8 deliverable 6, next to the
privacy statement, and generate as much of it as possible from a script so it
cannot drift.

---

## 13. What I could not verify

1. **The exact contents of `llama-b*-bin-macos-arm64.tar.gz`.** The proxy blocks
   binary downloads from GitHub releases. The dylib list in §4 is inferred from
   `BUILD_SHARED_LIBS_DEFAULT ON` + the workflow's `tar -C ./build/bin` [I].
   **Verify on the Mac:** `tar -tzf llama-*-bin-macos-arm64.tar.gz`.
2. **Whether the release binaries arrive ad-hoc signed.** ld64 ad-hoc signs arm64
   Mach-Os by default, so they should run [I], but they must be re-signed with
   Developer ID regardless. **Verify:** `codesign -dvv llama-server`.
3. **miniaudio's resampling behaviour in `whisper-cli`.** The decoder *config*
   requesting 16 kHz mono f32 is [P]; that miniaudio therefore resamples is [I].
   **Verify:** feed `whisper-cli` a 48 kHz stereo WAV and check the transcript.
   (The M5 recommendation does not depend on this — it is a safety margin.)
4. **`huggingface.co` — every model URL, size and checksum.** Blocked, same as in
   `macos-setup-verification.md`. The whisper model facts are inherited from
   whisper.cpp's own script [P]; the **GGUF LLM URLs do not exist yet at all**
   (risk 10.4).
5. **Gemma / Qwen weight licence terms.** Blocked [U].
6. **Whether `com.apple.security.cs.allow-jit` is actually required by
   `llama-server`.** Reasoned, not tested [I]. Start with no entitlements.
7. **Tauri issue #11992's status today.** Read as open [P at fetch time]; re-check
   at implementation.
8. **Whether the app bundle needs `NSMicrophoneUsageDescription`.** The mic is
   the browser's, so probably not [I]; confirm on the Mac.
9. **Exact `.dmg` size.** The 60–90 MB estimate is arithmetic on measured
   component sizes [I], not a built artifact.

---

## 14. Sources

All fetched 2026-08-22 unless noted.

**Licences (primary text)**
- FFmpeg `LICENSE.md` — https://raw.githubusercontent.com/FFmpeg/FFmpeg/master/LICENSE.md
- FFmpeg `COPYING.LGPLv2.1` (§4 and §6 quoted) — https://raw.githubusercontent.com/FFmpeg/FFmpeg/master/COPYING.LGPLv2.1
- Homebrew ffmpeg formula (v9.0.1, `license "GPL-3.0-or-later"`, `--enable-gpl --enable-version3`) — https://raw.githubusercontent.com/Homebrew/homebrew-core/master/Formula/f/ffmpeg.rb
- llama.cpp `LICENSE` (MIT) — https://raw.githubusercontent.com/ggml-org/llama.cpp/master/LICENSE
- whisper.cpp `LICENSE` (MIT) — https://raw.githubusercontent.com/ggml-org/whisper.cpp/master/LICENSE
- openai/whisper `LICENSE` (MIT) — https://raw.githubusercontent.com/openai/whisper/main/LICENSE

**Upstream source & releases**
- llama.cpp release workflow (macOS arm64 matrix, `GGML_METAL_EMBED_LIBRARY=ON`, `CMAKE_OSX_DEPLOYMENT_TARGET=13.3`, `@loader_path`, BoringSSL) — https://raw.githubusercontent.com/ggml-org/llama.cpp/master/.github/workflows/release.yml
- llama.cpp `CMakeLists.txt` (`BUILD_SHARED_LIBS_DEFAULT ON`) — https://raw.githubusercontent.com/ggml-org/llama.cpp/master/CMakeLists.txt
- ggml `CMakeLists.txt` / `ggml-metal/CMakeLists.txt` (embed default, `__ggml_metallib` section) — https://raw.githubusercontent.com/ggml-org/llama.cpp/master/ggml/CMakeLists.txt
- llama.cpp `common/common.h`, `common/arg.cpp` (default host 127.0.0.1, `--offline`, `--no-webui`) — https://raw.githubusercontent.com/ggml-org/llama.cpp/master/common/arg.cpp
- llama.cpp `common/chat.cpp` (`json_schema` → grammar) — https://raw.githubusercontent.com/ggml-org/llama.cpp/master/common/chat.cpp
- llama.cpp releases (b10586 assets, `v0.2.0` semantic-version note) — https://github.com/ggml-org/llama.cpp/releases
- whisper.cpp release b4938 assets (no macOS CLI binary) — https://github.com/ggml-org/whisper.cpp/releases/latest
- whisper.cpp release workflow (job list) — https://raw.githubusercontent.com/ggml-org/whisper.cpp/master/.github/workflows/release.yml
- whisper.cpp `examples/common-whisper.cpp` (miniaudio, `WHISPER_SAMPLE_RATE`, stdin, ffmpeg fallback) — https://raw.githubusercontent.com/ggml-org/whisper.cpp/master/examples/common-whisper.cpp
- whisper.cpp `README.md` (16-bit WAV note, Core ML instructions, Metal) — https://raw.githubusercontent.com/ggml-org/whisper.cpp/master/README.md
- whisper.cpp `models/README.md` (large-v3-turbo-q5_0, 547 MiB, SHA1) — https://raw.githubusercontent.com/ggml-org/whisper.cpp/master/models/README.md

**Apple (primary, via the DocC JSON API)**
- Hardened Runtime — https://developer.apple.com/documentation/security/hardened-runtime
- Notarizing macOS software before distribution — https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution
- Resolving common notarization issues — https://developer.apple.com/documentation/security/resolving-common-notarization-issues
- Customizing the notarization workflow (`notarytool`, `ditto`, `altool` EOL) — https://developer.apple.com/documentation/security/customizing-the-notarization-workflow
- Placing content in a bundle (the location table) — https://developer.apple.com/documentation/bundleresources/placing-content-in-a-bundle
- "Updates to runtime protection in macOS Sequoia", 2024-08-06 — https://developer.apple.com/news/?id=saqachfa
- Apple Developer Program membership comparison ($99/yr) — https://developer.apple.com/support/compare-memberships/

**Runtimes & tooling**
- Node.js Single Executable Applications (stability 1.1, `--build-sea`, native-addon caveat) — https://nodejs.org/api/single-executable-applications.html
- Node.js v24.19.0 darwin-arm64 distribution (sizes measured from the tarball) — https://nodejs.org/dist/v24.19.0/
- Chromium `audio_utilities.cc` (3000–768000 Hz) — https://raw.githubusercontent.com/chromium/chromium/main/third_party/blink/renderer/platform/audio/audio_utilities.cc
- create-dmg README (`--codesign`, `--notarize`) — https://github.com/create-dmg/create-dmg/blob/master/README.md
- Tauri issue #11992, externalBin notarization failure — https://github.com/tauri-apps/tauri/issues/11992

**Secondary [S]**
- evermeet.cx static FFmpeg builds (GPL, Intel-only) — https://evermeet.cx/ffmpeg/
- Bun single-file executables — https://bun.com/docs/bundler/executables
- Deno 1.41 smaller `deno compile` binaries — https://deno.com/blog/v1.41
- Safely open apps on your Mac — https://support.apple.com/en-us/102445
- Notarization: the hardened runtime — https://eclecticlight.co/2021/01/07/notarization-the-hardened-runtime/
- Using FFmpegKit in commercial applications (LGPL static-linking discussion) — https://github.com/arthenica/ffmpeg-kit/wiki/Using-FFmpegKit-in-Commercial-Applications
