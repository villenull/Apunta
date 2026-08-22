# macOS setup verification — Apunta

**Verified 2026-08-22.** Scope: everything `scripts/setup-macos.sh` (M7) and the
Ollama/whisper providers (M3, M5) need to name literally — package names, model
tags, filenames, URLs, flags.

## 0. How to read this document

Every factual claim below is tagged with its evidence level:

- **[P]** — read directly from a primary source file/page I fetched. Highest confidence.
- **[S]** — from search-engine snippets of a primary page I could **not** fetch
  (see egress note). Two or more independent snippets had to agree.
- **[U]** — **unverified.** Stated as a gap, not a fact. Do not encode as truth.

### Egress limitation (important, read this)

This session's network proxy **blocked** `formulae.brew.sh`, `ollama.com`,
`docs.ollama.com`, `registry.ollama.ai`, and `huggingface.co`. That means:

- Homebrew facts were verified by reading the **formula Ruby source** in
  `Homebrew/homebrew-core` via `raw.githubusercontent.com` — a *better* source
  than formulae.brew.sh, so no loss there.
- whisper.cpp facts were verified from the **upstream repo** files. Also primary.
- **Ollama model tag pages could not be fetched.** Every tag string and size in
  §2 is **[S]**. They are cross-checked across independent searches and are
  almost certainly right, but the implementing agent should run the one-line
  verification in §2.5 on the real Mac before shipping.

---

## 1. Ollama on macOS

### 1.1 Versions

| Thing | Version | Date | Evidence |
| --- | --- | --- | --- |
| Ollama latest **stable** | `v0.32.15` | 2026-08-19 | [P] <https://github.com/ollama/ollama/releases> |
| Ollama latest **pre-release** | `v0.33.0` | 2026-08-21 | [P] same |
| Homebrew formula `ollama` | `0.32.15` | in sync with upstream | [P] <https://raw.githubusercontent.com/Homebrew/homebrew-core/master/Formula/o/ollama.rb> |
| Homebrew cask `ollama-app` | `0.32.15` | GUI app | [P] <https://raw.githubusercontent.com/Homebrew/homebrew-cask/master/Casks/o/ollama-app.rb> |

Do **not** install `v0.33.0` — it is flagged pre-release.

### 1.2 Install method — use the Homebrew **formula**, not the cask

```sh
brew install ollama
```

The formula is the right choice for this project, verified from its source [P]:

- It is **CLI + server only** (`bin/ollama` symlinked from `libexec/ollama`,
  plus `libexec/lib/ollama/llama-server`). No GUI, no onboarding wizard, no
  login prompt — matches "zero accounts".
- It carries a real launchd **`service do` block** (see §1.3), so it can run
  headless in the background. The cask cannot be driven by `brew services`.
- On Apple Silicon it is built `-tags=mlx` against the `mlx-c` formula and
  installs `libexec/lib/ollama/mlx_metal_v3/libmlxc.dylib`. **This matters —
  see §2.4, the MLX structured-output trap.**
- `conflicts_with cask: "ollama-app"` [P] — the formula and the GUI app cannot
  coexist. **The setup script must detect an existing `Ollama.app` install and
  bail with a clear message rather than fighting Homebrew.** Suggested probe:
  `[ -d /Applications/Ollama.app ]`.

The alternative official method, from the upstream README [P]
(<https://raw.githubusercontent.com/ollama/ollama/main/README.md>), verbatim
under the macOS heading:

```shell
curl -fsSL https://ollama.com/install.sh | sh
```

> or [download manually](https://ollama.com/download/Ollama.dmg)

Both of those land the **desktop app**, which conflicts with the formula and
adds a GUI/onboarding surface we don't want. **[U]** I did not read
`install.sh` itself (ollama.com is blocked), so I cannot confirm what it does
on macOS specifically. Recommendation: setup script uses Homebrew only, and
prints the dmg link as a manual fallback.

### 1.3 Running it as a background service

The formula's service block, verbatim [P]:

```ruby
service do
  run [opt_bin/"ollama", "serve"]
  keep_alive true
  working_dir var
  log_path var/"log/ollama.log"
  error_log_path var/"log/ollama.log"
  environment_variables OLLAMA_FLASH_ATTENTION: "1",
                        OLLAMA_KV_CACHE_TYPE:   "q8_0"
end
```

So:

```sh
brew services start ollama      # start now + at login
brew services info ollama       # status
brew services restart ollama    # after changing env
```

Log file: `$(brew --prefix)/var/log/ollama.log`.

Two consequences the implementing agent must know:

1. **`OLLAMA_KV_CACHE_TYPE=q8_0` is set for you.** Good news — it roughly halves
   KV-cache memory, which is what makes a 16K `num_ctx` affordable on a 16GB
   Mac. Do not undo it.
2. **`OLLAMA_FLASH_ATTENTION=1` is set for you.** A Gemma 4 flash-attention hang
   on Apple Silicon was reported and is now **closed** (issue #15368, fixed via
   PR #15378) [P] <https://github.com/ollama/ollama/issues/15368>. Symptom was:
   Gemma 4 **31B dense** freezing indefinitely on prompts over ~500 tokens;
   12B was not named as affected. Treat as fixed, but make
   `OLLAMA_FLASH_ATTENTION=0` a documented escape hatch in the troubleshooting
   docs, and put a >500-token prompt in `npm run smoke:live`.

### 1.4 Checking it is running

Three probes, in increasing usefulness:

```sh
# 1. Is the daemon up at all? The formula's own test asserts exactly this. [P]
curl -fsS http://127.0.0.1:11434/            # -> "Ollama is running"

# 2. Which version is serving?
curl -fsS http://127.0.0.1:11434/api/version # -> {"version":"0.32.15"}

# 3. Is the model we need present? (this is what GET /api/health should call)
curl -fsS http://127.0.0.1:11434/api/tags    # -> {"models":[{"name":"gemma4:12b-it-qat",...}]}
```

Probe 1 is the only one I verified against a primary source: the ollama formula's
`test do` block does `assert_match "Ollama is running", shell_output("curl -s localhost:#{port}")`
[P]. Probes 2 and 3 are long-standing Ollama endpoints; **[U]** I could not
re-confirm their response shape on 0.32.x because `docs.ollama.com` is blocked.
`/api/tags` in particular should be spot-checked before `GET /api/health`
depends on its exact JSON shape.

Note the app's own egress guard allows `127.0.0.1` — use `127.0.0.1`, not
`localhost`, consistently, so the guard's allowlist stays a single literal.

---

## 2. Ollama model tags

**All of §2.1–2.3 is [S].** `ollama.com` was blocked; these come from search
snippets of the official library pages, cross-checked across separate queries.
Run §2.5 before shipping.

### 2.1 The three tiers — literal tag strings

| Plan tier | **Literal tag to `ollama pull`** | Size on disk | Quant | Context | Evidence |
| --- | --- | --- | --- | --- | --- |
| Large (≥36GB RAM) | `qwen3.6:35b-a3b` | **24 GB** | Q4_K_M | 256K | [S] <https://ollama.com/library/qwen3.6:35b-a3b> |
| Default (16–35GB) | `gemma4:12b-it-qat` | **7.2 GB** | Q4_0 (Google QAT) | 256K | [S] <https://ollama.com/library/gemma4:12b-it-qat> |
| Small (<16GB) | `qwen3.5:4b-q4_K_M` | **3.4 GB** | Q4_K_M | 256K | [S] <https://ollama.com/library/qwen3.5:4b-q4_K_M> |

All three named model families **do exist in the official Ollama library**.
Nothing in the plan's table is a phantom model. But two of the three tag
*descriptions* in PLAN §2 are wrong — see §7.

Command form:

```sh
ollama pull gemma4:12b-it-qat
```

### 2.2 Neighbouring tags worth knowing

| Tag | Size | Note | Evidence |
| --- | --- | --- | --- |
| `gemma4:12b` | 7.6 GB | plain 12B, non-QAT default | [S] |
| `gemma4:12b-it-q4_K_M` | ~7.6 GB | non-QAT Q4_K_M | [S] |
| `gemma4:12b-it-q8_0` | — | 8-bit | [S] |
| `gemma4:12b-mlx` | 7.7 GB | **MLX — do not use, see §2.4** | [S] |
| `gemma4:latest` | 9.6 GB | points at `e4b`, 128K ctx — **not** 12B | [S] |
| `qwen3.6:35b-a3b-q4_K_M` | ~24 GB | explicit-quant alias of the bare tag | [S] |
| `qwen3.6:35b-a3b-mtp-q4_K_M` | 23 GB | multi-token-prediction build | [S] |
| `qwen3.6:35b-a3b-q8_0` | 39 GB | too big for any MBP tier here | [S] |
| `qwen3.6:35b-mlx`, `qwen3.6:35b-a3b-mlx-bf16` | — / 72 GB | **MLX — do not use** | [S] |
| `qwen3.5:4b` | 3.4 GB | bare tag; **[U]** whether it is byte-identical to `-q4_K_M` | [S] |
| `qwen3.5:4b-mlx` | — | **MLX — do not use** | [S] |

**Pin the explicit tag, never `:latest`.** `gemma4:latest` resolves to the
**E4B** model at 128K context, not 12B [S] — a setup script that pulls
`gemma4` would silently install the wrong tier.

### 2.3 QAT is the right choice for the 12B tier

`gemma4:12b-it-qat` is 7.2 GB at Q4_0 with 11.9B params [S]. Google ships
official quantization-aware-training checkpoints for the whole Gemma 4 family,
so the `-qat` build keeps near-BF16 quality at a 4-bit footprint [S]. It is
also ~0.4 GB *smaller* than the plain `gemma4:12b`. Keep the plan's choice.

Caveat: Gemma 4 12B is **multimodal** (text + image in) [S]. Irrelevant to us,
but it means the pull includes a vision projector layer — that is where the
7.0 GB model + projector = 7.2 GB total comes from. Don't be surprised by the
two-blob manifest.

### 2.4 ⚠️ The MLX trap — this is the single most important finding

**Do not pull any `-mlx`, `-nvfp4`, or `-mlx-bf16` tag for this app.**

Ollama's MLX engine **silently ignores the `format` parameter** — i.e. JSON-schema
structured output is not enforced at all, with no error and no warning.

- **[P]** <https://github.com/ollama/ollama/issues/16563> — "Structured outputs
  appear to be ignored for MLX models". Opened 2026-06-06. **STILL OPEN.**
  Assigned to a maintainer (@dhiltgen); PR #17929 references it but is not
  merged/confirmed. Reproduced across Qwen 3.5 *and* Gemma 4 MLX variants.
- **[P]** <https://github.com/ollama/ollama/issues/17013> — closed as duplicate
  of #16563, opened 2026-07-02 against Ollama 0.31.1 on Apple Silicon.
  Reproduces on `gemma4:e4b-mlx` and `qwen3.6:35b-mlx`; the GGUF sibling
  `gemma4:e4b` with the identical schema works correctly. Reporter's words:
  the response "begins with markdown formatting and invented JSON keys,
  violating `additionalProperties: false`", and "there is no signal to fall
  back or post-validate."

This is a direct hit on the M3 design. The whole reliability argument in
PLAN §5 and the research doc rests on schema-constrained sampling. On an MLX
tag that constraint evaporates and the failure is *silent* — the app would
just start producing garbage notes on the exact machine class we target.

**Mitigations for M3 (do all three):**

1. **Only GGUF tags.** The three tags in §2.1 are all GGUF and run on the
   llama.cpp engine, where grammar-constrained sampling works. Ollama picks the
   engine from the weight format, so a GGUF tag stays on llama.cpp — **[U]**,
   strongly implied by the issues above (GGUF sibling works) but I could not
   confirm on a primary doc page.
2. **Reject MLX tags at the boundary.** Have the settings/model-picker refuse
   any model name matching `/-(mlx|nvfp4)\b/` with an explicit explanation,
   rather than letting a user paste one in.
3. **Never trust `format` alone.** Always `JSON.parse` + re-validate the
   response against the zod schema server-side and surface a real error on
   failure. The plan already restates the schema in the prompt (good), but it
   should also treat schema violation as an expected error path, not an
   assertion.

The performance cost is real — MLX is roughly 10–25% faster than llama.cpp
Metal on most models, more on small ones [S] — but correctness wins here.

### 2.5 Verify before shipping (run on the real Mac)

```sh
for t in gemma4:12b-it-qat qwen3.6:35b-a3b qwen3.5:4b-q4_K_M; do
  printf '%-28s ' "$t"
  # HEAD the manifest; 200 = tag exists
  curl -fsS -o /dev/null -w '%{http_code}\n' "https://ollama.com/library/${t%%:*}/tags" \
    || echo UNREACHABLE
done
ollama pull gemma4:12b-it-qat && ollama list   # authoritative: size + digest
```

Then the real proof, which also covers §2.4:

```sh
curl -s http://127.0.0.1:11434/api/chat -d '{
  "model":"gemma4:12b-it-qat","stream":false,
  "options":{"temperature":0,"num_ctx":16384},
  "format":{"type":"object","properties":{"Subjective":{"type":"string"}},
            "required":["Subjective"],"additionalProperties":false},
  "messages":[{"role":"user","content":"Reply with JSON having key Subjective."}]
}' | jq -r .message.content | jq .
```

If that does not come back as strict JSON, structured output is not being
enforced and M3's core assumption is broken on that model.

### 2.6 Thinking mode — a known interaction bug, now closed, still worth a test

Gemma 4 and Qwen 3.x are reasoning models with thinking on by default [S].
Two bugs in this exact area were filed 2026-04-03 against Ollama **0.20.0** and
are both now **closed** with fix PRs — but they are precisely the shape of
failure M3 would hit, so smoke-test them:

- **[P]** <https://github.com/ollama/ollama/issues/15260> — "`think=false`
  breaks `format` (structured output) for `gemma4`". Root cause quoted in the
  issue: "Ollama appears to defer format probability masking until it sees the
  end-of-thinking token. When `think=false` is set, the thinking tags are
  closed in the template and the model never outputs the end-of-thinking token,
  so the masking is **never applied**." Closed via PRs #15678 / #15392.
  Historical workaround was to omit `think` entirely and eat the latency.
- **[P]** <https://github.com/ollama/ollama/issues/15288> — "Gemma 4:
  `/v1/chat/completions` returns empty content with all text in reasoning
  field". On the OpenAI-compatible endpoint, `choices[0].message.content` came
  back empty with everything in `reasoning`; the native `/api/chat` with
  `"think": false` worked. Closed.

**Recommendation for M3:** use the **native `/api/chat`** endpoint with
`format` + `think:false`, not `/v1/chat/completions`. PLAN §2's diagram label
`"OpenAI-compatible /v1 + /api/chat(format)"` should be narrowed — see §7.
Keep the provider's base URL configurable so `llama-server` still works, but
the primary path should be `/api/chat`.

---

## 3. whisper.cpp

### 3.1 Formula and versions

```sh
brew install whisper-cpp
```

| Thing | Version | Evidence |
| --- | --- | --- |
| Homebrew formula `whisper-cpp` | **1.9.2** | [P] <https://raw.githubusercontent.com/Homebrew/homebrew-core/master/Formula/w/whisper-cpp.rb> |
| whisper.cpp upstream latest | **v1.9.3**, 2026-08-20T11:42Z | [P] <https://github.com/ggml-org/whisper.cpp/releases.atom> |
| (prev upstream) v1.9.2 | 2026-08-04 | [P] same |

The formula is **one patch release behind** upstream, released two days ago —
normal Homebrew bump lag. Don't chase it; pin nothing, just require `>= 1.9`.

Note the research doc says "whisper.cpp v1.8.4" — that is stale, see §7.

### 3.2 The binary name — confirmed `whisper-cli`

**The CLI is `whisper-cli`.** The old `main` binary was renamed with a
`whisper-` prefix (`main` → `whisper-cli`, `server` → `whisper-server`) in
upstream PR #2648, Dec 2024 [S]
<https://github.com/ggml-org/whisper.cpp/discussions/2780>.

Primary confirmation from the formula's own test block [P]:

```ruby
output = shell_output("#{bin}/whisper-cli --model #{model} #{pkgshare}/jfk.wav 2>&1")
```

So after `brew install whisper-cpp` the binary is at
`$(brew --prefix)/bin/whisper-cli` — typically
`/opt/homebrew/bin/whisper-cli` on Apple Silicon.

**PLAN §2 already says `whisper-cli`. That is correct — no change needed.**

Other binaries: **[S]** a formulae.brew.sh listing shows `whisper-bench`,
`whisper-command`, `whisper-stream`, `vad-speech-segments` and `whisper-cpp`
alongside it. Treat that list as unreliable — the same listing claims
`whisper-server` is installed, but the current formula explicitly sets
`-DWHISPER_BUILD_SERVER=OFF` [P], so **there is no `whisper-server`**. If any
future packet wants an HTTP whisper server, it would need a source build.
The app only needs `whisper-cli`, so this doesn't block anything.

### 3.3 Metal acceleration — yes, via the `ggml` formula

The whisper-cpp formula does `depends_on "ggml"` and builds with
`-DWHISPER_USE_SYSTEM_GGML=ON` [P] (the formula literally comments "reject all
PRs that try to bundle ggml"). The `ggml` formula is at **v0.21.0** and, on
Apple Silicon, does *not* pass `-DGGML_METAL=OFF` — that flag is applied only
under `if OS.mac? && Hardware::CPU.intel?` — so **Metal is on by default for
arm64 macOS** [P]
<https://raw.githubusercontent.com/Homebrew/homebrew-core/master/Formula/g/ggml.rb>.
Backends are dynamically loaded (`-DGGML_BACKEND_DL=ON`,
`-DGGML_BACKEND_DIR=libexec`).

`GET /api/health`'s `whisper.binaryPresent` check should therefore be
`which whisper-cli`, and the live smoke test should confirm Metal is actually
picked up (whisper-cli prints its backend on startup).

### 3.4 Relevant `whisper-cli` flags

From the upstream CLI README [P]
<https://raw.githubusercontent.com/ggml-org/whisper.cpp/master/examples/cli/README.md>:

| Flag | Meaning | Why we care |
| --- | --- | --- |
| `-m FNAME, --model FNAME` | model file | required |
| `-f FNAME, --file FNAME` | input audio | required |
| `--prompt PROMPT` | **initial decoding prompt** | **this is the vocabulary-biasing hook PLAN §2 calls `initial_prompt`** |
| `-l LANG, --language LANG` | language / auto | pass `en` to skip detection |
| `-t N, --threads N` | compute threads | |
| `-oj, --output-json` / `-ojf` | JSON output | easiest machine-readable parse |
| `-of FNAME, --output-file FNAME` | output path | |
| `-pp, --print-progress` | progress lines | feeds the SSE progress events |
| `-ng, --no-gpu` | disable GPU | fake/CI escape hatch |
| `-bs N, --beam-size N` | beam search | quality knob |
| `-tp, --temperature N` | temperature | set 0 for determinism |

**The flag is spelled `--prompt`, not `--initial-prompt`.** Worth noting
because PLAN §2 uses the Python/OpenAI name `initial_prompt`. Whisper's prompt
budget is ~224 tokens — the plan already knows this.

Suggested invocation for the M5 arg builder:

```sh
whisper-cli \
  -m "$MODEL_PATH" \
  -f "$WAV_PATH" \
  -l en \
  -t "$(sysctl -n hw.perflevel0.physicalcpu)" \
  -tp 0 \
  -pp \
  -oj -of "$OUT_BASE"
```

---

## 4. The whisper model file

### 4.1 Exact identity

| Field | Value | Evidence |
| --- | --- | --- |
| Model key | `large-v3-turbo-q5_0` | [P] `models/download-ggml-model.sh` model list |
| **Filename** | **`ggml-large-v3-turbo-q5_0.bin`** | [P] script builds `ggml-<model>.bin` |
| **Download URL** | **`https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin`** | [P] script: `src="https://huggingface.co/ggerganov/whisper.cpp"`, `pfx="resolve/main/ggml"`, URL `$src/$pfx-"$model".bin` |
| **Size** | **547 MiB** (≈ 574 MB decimal) | [P] `models/README.md` table |
| **SHA1** | **`e050f7970618a659205450ad97eb95a18d69c9ee`** | [P] `models/README.md` table |

PLAN §2's "~574MB" is **correct** (547 MiB = 573.7 MB). Nice.

Note the HF repo is `ggerganov/whisper.cpp`, **not** `ggml-org/whisper.cpp` —
the GitHub org was renamed to `ggml-org` but the model repo on Hugging Face
kept the `ggerganov` owner. Getting this wrong is a 404. [P] — this is the
literal `src` variable in the upstream download script as of today.

**[U]** I could not fetch `huggingface.co` (blocked), so I did not confirm the
URL returns 200 or the exact byte count. The URL is constructed from
whisper.cpp's own shipped script, which is the strongest available evidence.
**No SHA256 is published** — only the SHA1 above. Verify with
`shasum -a 1 ggml-large-v3-turbo-q5_0.bin`, not `shasum -a 256`.

### 4.2 Should we use the download script instead of curl?

**No — use curl.** Reasoning, all [P] from the formula source:

`models/download-ggml-model.sh` exists upstream and is the idiomatic way to
fetch models *from a source checkout*. But the Homebrew formula's `install`
step installs only:

```ruby
pkgshare.install "models/for-tests-ggml-tiny.bin", "samples/jfk.wav"
```

It does **not** install `download-ggml-model.sh`. A Homebrew-based setup has no
copy of that script on disk, so the script is simply unavailable. The formula's
own `caveats` acknowledge this and point users at the HF repo:

> whisper-cpp requires GGML model files to work. These are not downloaded by default.
> To obtain model files (.bin), visit one of these locations:
>
>   https://huggingface.co/ggerganov/whisper.cpp/tree/main
>   https://ggml.ggerganov.com/

So `scripts/setup-macos.sh` should do a plain, verified curl:

```sh
MODEL_DIR="$HOME/Library/Application Support/Apunta/models"
MODEL_FILE="$MODEL_DIR/ggml-large-v3-turbo-q5_0.bin"
MODEL_URL="https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin"
MODEL_SHA1="e050f7970618a659205450ad97eb95a18d69c9ee"

mkdir -p "$MODEL_DIR"
if [ ! -f "$MODEL_FILE" ] || [ "$(shasum -a 1 "$MODEL_FILE" | cut -d' ' -f1)" != "$MODEL_SHA1" ]; then
  curl -fL --retry 3 --progress-bar -o "$MODEL_FILE.part" "$MODEL_URL"
  actual="$(shasum -a 1 "$MODEL_FILE.part" | cut -d' ' -f1)"
  [ "$actual" = "$MODEL_SHA1" ] || { echo "checksum mismatch: $actual"; rm -f "$MODEL_FILE.part"; exit 1; }
  mv "$MODEL_FILE.part" "$MODEL_FILE"
fi
```

`-L` is required — HF `resolve/main/` redirects to a CDN. Download it to the
app's data dir (PLAN §3) rather than into the Homebrew cellar, which `brew
upgrade` would blow away.

This is a **setup-time** download, not a runtime one, so it does not violate the
egress rule — but keep it strictly in `scripts/`, never reachable from server
code, and make sure the egress-guard test doesn't accidentally whitelist it.

---

## 5. ffmpeg

### 5.1 Formula

```sh
brew install ffmpeg
```

Formula name is exactly `ffmpeg`, currently version **9.0.1** [P]
<https://raw.githubusercontent.com/Homebrew/homebrew-core/master/Formula/f/ffmpeg.rb>
(`url "https://ffmpeg.org/releases/ffmpeg-9.0.1.tar.xz"`).

### 5.2 Why it is required at all

whisper.cpp's README states it plainly [P]
(<https://raw.githubusercontent.com/ggml-org/whisper.cpp/master/README.md>):

> "Note that the whisper-cli example currently runs only with 16-bit WAV files,
> so make sure to convert your input before running the tool."

and gives the canonical conversion:

```bash
ffmpeg -i input.mp3 -ar 16000 -ac 1 -c:a pcm_s16le output.wav
```

whisper.cpp does have an optional built-in ffmpeg decode path
(`WHISPER_FFMPEG`), but the Homebrew formula does not enable it [P] — its
cmake args are `BUILD_SHARED_LIBS`, `CMAKE_INSTALL_RPATH`, `WHISPER_SDL2`,
`WHISPER_BUILD_EXAMPLES`, `WHISPER_BUILD_TESTS=OFF`, `WHISPER_BUILD_SERVER=OFF`,
`WHISPER_USE_SYSTEM_GGML`. So the external `ffmpeg` conversion step in PLAN §2
is genuinely required, not optional.

### 5.3 Exact flags for MediaRecorder webm/opus → whisper WAV

Browser `MediaRecorder` on Chrome produces `audio/webm;codecs=opus` (Safari
produces `audio/mp4` AAC). The command below is codec- and container-agnostic
by design — it re-decodes whatever arrives:

```sh
ffmpeg -hide_banner -loglevel error -nostdin -y \
  -i "$IN"           \
  -vn                \
  -map_metadata -1   \
  -ac 1              \
  -ar 16000          \
  -c:a pcm_s16le     \
  -f wav             \
  "$OUT"
```

Flag-by-flag, for the M5 arg builder's unit test:

| Flag | Why |
| --- | --- |
| `-hide_banner -loglevel error` | keep the child-process stderr usable for real errors |
| `-nostdin` | ffmpeg spawned from Node must never try to read the TTY — without this it can consume stdin and hang |
| `-y` | overwrite the temp WAV without prompting |
| `-vn` | drop any video/album-art stream; MediaRecorder blobs occasionally carry one |
| `-map_metadata -1` | **privacy: strip all container metadata.** Fits the "privacy is the product" rule |
| `-ac 1` | mono — whisper.cpp requirement |
| `-ar 16000` | 16 kHz — whisper.cpp requirement |
| `-c:a pcm_s16le` | 16-bit signed little-endian PCM — the "16-bit WAV" the README demands |
| `-f wav` | force the muxer; do not infer from the output extension |

Write `$OUT` to a real temp **file**, not a pipe — the WAV muxer needs to seek
back to patch the RIFF header, and a non-seekable pipe yields a file with a
bogus length that whisper-cli may reject.

**[U]** MediaRecorder webm sometimes has an unseekable/duration-less header
when a recording is cut short. I did not test this. If the M5 e2e run produces
"Invalid data found when processing input", the usual fix is to prepend
`-fflags +genpts` (and, rarely, `-err_detect ignore_err`). Add that only if the
symptom actually appears — don't cargo-cult it in.

---

## 6. RAM detection

```sh
sysctl -n hw.memsize
```

Returns **total physical RAM in bytes**, as a bare decimal integer, e.g.
`17179869184` (16 GiB) or `38654705664` (36 GiB) [S]. The `-n` suppresses the
`hw.memsize:` key prefix.

Do **not** use `hw.physmem` — it is a 32-bit value that saturates at 4 GB and
is wrong on every modern Mac [S].

Tier selection, in shell:

```sh
ram_bytes="$(sysctl -n hw.memsize)"
ram_gib=$(( ram_bytes / 1073741824 ))

if   [ "$ram_gib" -ge 36 ]; then model="qwen3.6:35b-a3b"
elif [ "$ram_gib" -ge 16 ]; then model="gemma4:12b-it-qat"
else                             model="qwen3.5:4b-q4_K_M"
fi
```

Integer division by `1073741824` is exact for every Apple config (all are whole
GiB), so no rounding fudge is needed.

### Why the top boundary moved from 32 GB to 36 GB

PLAN §2 puts the 35B-A3B model at "≥ 32GB, ~20GB resident". Two problems:

1. **The tag is 24 GB on disk** [S], not ~20 GB. The plan's number appears to
   come from the research doc's MLX-4bit estimate, not the GGUF Q4_K_M reality.
2. **Metal caps usable GPU memory at roughly 75% of unified RAM.** macOS exposes
   `recommendedMaxWorkingSetSize`, and llama.cpp/Ollama treat it as a hard
   ceiling [S] (<https://github.com/ivanopcode/devnote-override-macos-metal-vram-cap>,
   <https://github.com/ollama/ollama/pull/2354>). On a 32 GB Mac that is ~24 GB
   — exactly the model size, with **zero** headroom for a 16K KV cache, macOS,
   and a Chrome tab. Expect either partial CPU offload (very slow) or an
   allocation failure.

A 32 GB machine is the worst case: big enough to tempt the picker, too small to
actually run it. Moving the boundary to **36 GB** (the next real Apple config
[S] <https://support.apple.com/en-us/121553>) leaves ~27 GB of Metal budget for
a 24 GB model — workable. 32 GB machines then land on the 12B tier, which is
the honest answer.

If someone with 32 GB insists, the documented escape hatch is
`sudo sysctl iogpu.wired_limit_mb=<N>` to raise the ceiling [S] — but that needs
root, doesn't persist across reboot, and starves macOS. Put it in
troubleshooting docs, never in the setup script.

**2024 MacBook Pro configs** [S] (<https://support.apple.com/en-us/121552>,
<https://support.apple.com/en-us/121553>, <https://support.apple.com/en-us/121554>):
M4 base 16/24/32 GB; M4 Pro 24/48 GB; M4 Max 36/48/64/128 GB. So on the actual
target machine the `< 16 GB` tier is **unreachable** — the 2024 MBP floor is
16 GB. Keep `qwen3.5:4b-q4_K_M` anyway as the portability/low-end fallback the
provider interface needs, but don't spend polish on it.

---

## 7. Corrections to PLAN §2

Ordered by how much damage the current text would do.

### 7.1 🔴 "Qwen3.6-35B-A3B (**4-bit MLX**)" — remove "MLX", change the tag

**Current:** `| ≥ 32GB | Qwen3.6-35B-A3B (4-bit MLX) | best quality, ~20GB resident |`

**Problem:** MLX is the one variant that **silently breaks structured outputs**
(§2.4, ollama/ollama#16563, **open**). Following this row literally would make
an agent pull `qwen3.6:35b-mlx` and quietly destroy the JSON-schema guarantee
the entire M3 design rests on. The size is also wrong (24 GB, not ~20 GB) and
the RAM threshold is unusable (§6).

**Replace with:**

```
| ≥ 36GB | `qwen3.6:35b-a3b` (GGUF Q4_K_M) | ~24GB on disk; needs ≥36GB — Metal caps GPU RAM at ~75% |
```

Plus a standing rule in §2: **no `-mlx` / `-nvfp4` tags anywhere in this
project until ollama/ollama#16563 closes.**

### 7.2 🔴 Narrow the API path: prefer `/api/chat`, not `/v1/chat/completions`

**Current:** the mermaid edge reads
`API -- "OpenAI-compatible /v1 + /api/chat(format)" --> OLL`, and §2's bullet
says the OpenAI `response_format: {type:"json_schema"}` is an equivalent path.

**Problem:** for exactly the reasoning models we picked, the `/v1` endpoint has
a documented history of returning empty `content` with all text in `reasoning`,
and no way to disable thinking (ollama/ollama#15288, closed but recent) [P].
`/api/chat` accepted `think:false` and worked. Also #15260 [P] showed
`think:false` + `format` interacting badly on Gemma 4.

**Replace with:** make `/api/chat` the primary path; keep the OpenAI shape only
as the documented adapter for pointing at `llama-server`. Add an M3 acceptance
criterion: a `smoke:live` case asserting non-empty `content` **and** a
schema-valid parse with `think:false` set, on the default model.

### 7.3 🟡 `< 16GB` tier is dead weight on the target machine

The 2024 MacBook Pro starts at 16 GB [S]. Keep the row for portability, but
label it as such so a packet doesn't spend effort tuning a tier that will never
fire on the owner's Mac. Tag confirmed correct: `qwen3.5:4b-q4_K_M`, 3.4 GB.

### 7.4 🟡 "Verify exact Ollama tags at implementation time (`ollama search`)"

There is **no `ollama search` subcommand** to verify against — model discovery
is via the website or `ollama pull`. **[U]** I could not enumerate the current
CLI subcommands (ollama.com and docs.ollama.com both blocked), so I cannot say
with certainty it doesn't exist in 0.32.x. Safer instruction: "verify with
`ollama pull <tag> && ollama list`". Replace the parenthetical.

### 7.5 🟡 Tag strings should be literal in the table

The table names *families* ("Gemma 4 12B QAT Q4"). Every one of them has a
`:latest` that resolves somewhere unhelpful — `gemma4:latest` is **E4B at
128K**, not 12B [S]. Put the literal pull strings in the table so no agent has
to guess:

```
| RAM | Ollama tag | Size | Notes |
| --- | --- | --- | --- |
| ≥ 36GB   | `qwen3.6:35b-a3b`    | 24GB  | GGUF Q4_K_M, 256K ctx. Never the -mlx variant. |
| 16–35GB  | `gemma4:12b-it-qat`  | 7.2GB | Google QAT Q4_0, 256K ctx. **Default.** |
| < 16GB   | `qwen3.5:4b-q4_K_M`  | 3.4GB | Fallback; unreachable on a 2024 MBP. |
```

### 7.6 🟡 `initial_prompt` is spelled `--prompt` on the CLI

PLAN §2 says "Always pass an `initial_prompt`". The whisper.cpp CLI flag is
`--prompt` [P] (§3.4). Keep `initial_prompt` as the internal field name if you
like, but the arg builder emits `--prompt`, and the unit test should assert
that literal.

### 7.7 🟢 "Ollama's 4096 default silently truncates" is now only half true

Recent Ollama picks a default context from available VRAM — roughly 4K under
24 GiB, 32K from 24–48 GiB, 256K above [S] — and the env var is now
`OLLAMA_CONTEXT_LENGTH` (older `OLLAMA_NUM_CTX` may still work) [S]. The
**advice is still right** (always send an explicit `num_ctx` ≥ 16384); the
*reason* given is outdated. Softening it to "Ollama's default context is
VRAM-dependent and can be as low as 4096 — always send `num_ctx` explicitly"
prevents a future agent from "fixing" a claim that no longer matches the docs.

### 7.8 🟢 Free wins the plan doesn't currently claim

`brew services start ollama` sets **`OLLAMA_KV_CACHE_TYPE=q8_0`** for you [P].
That roughly halves KV-cache memory and is a large part of why a 16K context is
affordable on a 16 GB Mac. Worth stating in §2 so nobody removes it.

### 7.9 🟢 Research doc staleness (`docs/research/local-ai-stack-2026-08.md`)

- "whisper.cpp **v1.8.4** Q5_0" → upstream is **v1.9.3** (2026-08-20), Homebrew
  ships **1.9.2** [P]. Size and quant claims still hold.
- "Ollama **v0.32.x**" → correct, currently **0.32.15** [P]. Nicely accurate.
- The research doc's MLX enthusiasm ("Gemma 4 ~50 → ~95 tok/s") is real but
  should carry the §2.4 caveat, since it is what led to the "4-bit MLX" line in
  the plan.

---

## 8. Setup script skeleton

Ordering and idempotency notes for `scripts/setup-macos.sh`:

```sh
#!/usr/bin/env bash
set -euo pipefail

# 0. preflight
command -v brew >/dev/null || { echo "Homebrew required: https://brew.sh"; exit 1; }
[ -d /Applications/Ollama.app ] && {
  echo "Ollama.app is installed; it conflicts with the 'ollama' formula."
  echo "Quit and remove it, or run Ollama.app yourself and re-run with --skip-ollama."
  exit 1; }

# 1. packages
brew install ollama whisper-cpp ffmpeg     # idempotent; already-installed is a no-op

# 2. daemon
brew services start ollama
for i in $(seq 1 30); do
  curl -fsS http://127.0.0.1:11434/ >/dev/null 2>&1 && break
  sleep 1
done
curl -fsS http://127.0.0.1:11434/ | grep -q "Ollama is running" \
  || { echo "Ollama did not start; see $(brew --prefix)/var/log/ollama.log"; exit 1; }

# 3. tier + LLM   (see §6)
# 4. whisper model (see §4.2)
# 5. write chosen model into settings, then re-run GET /api/health and print it
```

Design notes:

- **Make it re-runnable.** `brew install` on an installed formula exits 0;
  `ollama pull` on a present model is a fast no-op; the whisper download is
  guarded by the SHA1 check.
- **Print the plan before doing it.** A 24 GB pull on a laptop tether deserves
  a confirmation prompt. Offer `--model <tag>` to override the tier pick and
  `--yes` for CI/non-interactive.
- **End by calling `GET /api/health`** and rendering it — that endpoint already
  reports `ollama.modelPresent`, `whisper.binaryPresent/modelPresent`, and
  `ffmpeg.present` (PLAN §4), so the script's success criterion and the app's
  first-run wizard agree by construction.
- **Nothing here belongs in server code** — `scripts/` is the only place
  allowed to assume macOS/Homebrew (CLAUDE.md rule 4).

---

## 9. Unverified — gaps an implementer must close

Listed plainly rather than guessed:

1. **Every Ollama tag string and size in §2 is [S]**, from search snippets, not
   from `ollama.com` itself (blocked). Confirm with §2.5 on the real Mac.
2. **Whether GGUF tags are guaranteed to route to the llama.cpp engine** (and
   therefore keep grammar-constrained sampling) on an MLX-enabled 0.32 build.
   Strongly implied by #17013's GGUF-works/MLX-fails contrast, not confirmed
   from docs. **This is the highest-value thing to test first** — if it is
   false, §2.4's mitigation #1 is not enough and #3 becomes load-bearing.
3. **Whether ollama/ollama#16563 is fixed in 0.32.15.** It is still open; PR
   #17929 is unmerged as far as I could see.
4. **`/api/version` and `/api/tags` response shapes on 0.32.x** — docs blocked.
5. **The HF model URL returning 200 / exact byte size** — huggingface.co
   blocked. URL is taken from whisper.cpp's own download script; SHA1 is
   published, SHA256 is not.
6. **Whether `qwen3.5:4b` and `qwen3.5:4b-q4_K_M` are the same blob.** Both
   report 3.4 GB. Use the explicit tag.
7. **What `https://ollama.com/install.sh` does on macOS.** Not read. Setup
   script should use Homebrew regardless.
8. **Whether whisper-cpp's bottle installs binaries beyond `whisper-cli`.**
   The formula source proves `whisper-server` is **not** built; the rest of the
   list is [S] and irrelevant to us.
9. **ffmpeg handling of truncated MediaRecorder webm headers** (§5.3).

Per the standing constraint on this spike, nothing in `/home/user/Apunta` was
read-modified — this document is the only artifact.
