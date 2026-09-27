# MODEL-STUDY — acquisition evidence (worker: acquisition)

Scope: **download and import only**, for the arms named in
`docs/research/local-model-study-plan-2026-09-27.md` §"Model matrix and
acquisition". Sole repo output is this file. All weights and manifests live
under the study scratch root
`/home/villenull/.cache/apunta-model-study/2026-09-27` (real disk; `/tmp` is
tmpfs and too small). **No inference, no warmup, no serving, no unload, no
eval, no GPU lease, no service or production-setting change, no code edit, no
commit or staging.** These are research candidates, not catalog changes.

Acquisition date: **2026-09-27 (UTC)**. All timestamps below are UTC.

---

## 1. Environment

| Item | Value |
| --- | --- |
| `ollama --version` | `ollama version is 0.33.3` (exit 0) |
| Daemon | `/usr/bin/ollama serve` pid 301080, listening `127.0.0.1:11434` only |
| App port 7717 | **not listening**; never contacted |
| Host kernel | `Linux 7.2.5-3-omarchy` |
| Filesystem for scratch | `/dev/mapper/root` 952 G total; 855 G free after acquisition |
| Scratch usage | `gguf/` 9.7 G, `manifests/` 136 K |
| GPU tooling | `nvidia-smi`: **command not found**. No GPU/VRAM fact is recorded here because none was measured. |

The existing daemon was used for metadata, import and registry pull only. No
service was started, stopped, reconfigured or reloaded.

## 2. Candidate status — requested vs. completed

The matrix asks for six arms (A–F) served by **five distinct model
artifacts** (A and B deliberately share one). At session start **1 of those 5
(the 4B baseline) was already available locally**; the other 4 were acquired
in this session. No candidate failed, so no arm is reported as unavailable.

| Arm | Model | Requested | State before | Completed here | Outcome |
| --- | --- | --- | --- | --- | --- |
| A | `qwen3.5:4b-q4_K_M` think=false | reuse | present, digest `2a654d98e6fb…` | no (reused as-is) | available, untouched |
| B | same digest as A, think=true | reuse | same artifact | no (deliberate-mode adapter is the execution worker's job) | available, untouched |
| C | Qwen3.5 9B text-only Q4_K_M | download | absent | yes | `apunta-study-qwen35-9b-q4` |
| D | Qwen3.5 9B text-only Q3_K_M | download | absent | yes | `apunta-study-qwen35-9b-q3` |
| E | Gemma4 12B official quantized | pull | absent | yes | `gemma4:12b` |
| F | TranslateGemma 4B | pull | absent | yes | `translategemma:4b` |

Optional diagnostic C-thinking was **not** acquired: the plan gates it on C
materially improving quality, which cannot be known before inference. It stays
open for the execution worker.

## 3. Baseline (A/B) — reused, never re-acquired

No pull, no create, no delete, no tag rebind was issued against this model.
Recorded read-only to prove it is the same artifact the plan named:

- `ollama list` → `qwen3.5:4b-q4_K_M  2a654d98e6fb  3.4 GB`
- local manifest file sha256 = `2a654d98e6fba55d452b7043684e9b57a947e393bbffa62485a7aac05ee4eefd`
  (prefix matches the `2a654d98e6fb…` digest in the authorization)
- layers: model `sha256:81fb60c7daa80fc1123380b98970b320ae233409f0f71a72ed7b9b0d62f40490`
  (3 389 971 840 B), license `sha256:7339fa418c9ad3e8e12e74ad0fd26a9cc4be8703f9c110728a992b193be85cb2`
  (11 355 B), params `sha256:9371364b27a52acac9d87f88bd93c9db1174d8d6ec57f6888925cdc1788871ff` (65 B)
- `ollama show` → architecture `qwen35`, 4.7 B params, context 262 144,
  embedding 2560, quantization Q4_K_M, license Apache-2.0
- `ollama show --template` → 13 bytes, i.e. **no explicit template layer** on
  the registry build. Recorded because it contrasts with C/D (§5) and matters
  for any like-for-like prompt comparison.

## 4. C and D — Qwen3.5 9B text-only GGUFs from the quantizer's HF repo

### 4.1 Immutable source revision

The repository-level siblings listing returned file names only, with **no LFS
metadata** (no oid, no size), so the expected per-file SHA256 and byte size
were taken from the **pinned-revision tree** endpoint, not from that listing.

| Item | Value |
| --- | --- |
| Repo | `unsloth/Qwen3.5-9B-GGUF` |
| Pinned revision (commit sha) | `3885219b6810b007914f3a7950a8d1b469d598a5` |
| Repo `lastModified` | `2026-03-02T14:08:36.000Z` |
| Gated / private | `false` / `false` |
| Repo license tag | `license:apache-2.0` |
| Base model | `Qwen/Qwen3.5-9B` |
| Tree metadata call | `GET https://huggingface.co/api/models/unsloth/Qwen3.5-9B-GGUF/tree/3885219b6810b007914f3a7950a8d1b469d598a5?recursive=1` (http 200, 8 234 B) |

Every download URL embeds that commit sha, so the bytes are pinned to an
immutable revision rather than to `main`.

### 4.2 Expected vs. actual, per file

Text-only selection: the main weight file is the text model; `mmproj-*.gguf`
are vision projectors and were deliberately **not** downloaded (plan: no
downloads beyond the named matrix; C/D are specified text-only).

| | C — `Qwen3.5-9B-Q4_K_M.gguf` | D — `Qwen3.5-9B-Q3_K_M.gguf` |
| --- | --- | --- |
| Published LFS SHA256 (expected) | `03b74727a860a56338e042c4420bb3f04b2fec5734175f4cb9fa853daf52b7e8` | `8fed90306e4f019e2bf35f3766470b7bc59ea1a9dae00f5ceb20b43cb5514393` |
| Published size (expected, bytes) | `5680522464` | `4673643744` |
| **Actual SHA256 after streaming** | `03b74727a860a56338e042c4420bb3f04b2fec5734175f4cb9fa853daf52b7e8` — **match** | `8fed90306e4f019e2bf35f3766470b7bc59ea1a9dae00f5ceb20b43cb5514393` — **match** |
| **Actual size (bytes)** | `5680522464` — **match** | `4673643744` — **match** |
| GGUF container | magic `GGUF`, version 3, 427 tensors, 46 KV | magic `GGUF`, version 3, 427 tensors, 46 KV |
| `general.file_type` | 15 (Q4_K_M) | 12 (Q3_K_M) |
| License in GGUF metadata | `apache-2.0` → `https://huggingface.co/Qwen/Qwen3.5-9B/blob/main/LICENSE` | same |
| Local path | `gguf/Qwen3.5-9B-Q4_K_M.gguf` | `gguf/Qwen3.5-9B-Q3_K_M.gguf` |
| Download window | 18:32:15Z → 18:34:25Z | 18:34:39Z → 18:38:57Z |

Both digests were recomputed from the file on disk **after** the stream closed.
No checksum was ever substituted, adjusted or assumed; had either mismatched,
the candidate would have been reported failed and dropped.

### 4.3 Commands and exit codes

Fetcher: `fetch.sh` (scratch root). It streams to disk, then re-hashes the
finished file; it strips query strings from anything it logs.

```
./fetch.sh \
  "https://huggingface.co/unsloth/Qwen3.5-9B-GGUF/resolve/3885219b6810b007914f3a7950a8d1b469d598a5/Qwen3.5-9B-Q4_K_M.gguf" \
  "gguf/Qwen3.5-9B-Q4_K_M.gguf" \
  03b74727a860a56338e042c4420bb3f04b2fec5734175f4cb9fa853daf52b7e8 5680522464
→ curl_exit=0, FETCH_EXIT=0, size_match=yes, sha256_match=yes

./fetch.sh \
  "https://huggingface.co/unsloth/Qwen3.5-9B-GGUF/resolve/3885219b6810b007914f3a7950a8d1b469d598a5/Qwen3.5-9B-Q3_K_M.gguf" \
  "gguf/Qwen3.5-9B-Q3_K_M.gguf" \
  8fed90306e4f019e2bf35f3766470b7bc59ea1a9dae00f5ceb20b43cb5514393 4673643744
→ curl_exit=0, FETCH_EXIT=0, size_match=yes, sha256_match=yes
```

Downloads were **serial** (C completed before D began). No retry was needed,
so the single permitted retry was not used for either candidate.

## 5. C/D import into Ollama — new `apunta-study-*` tags only

Pre-flight proved both target names were free, so no existing tag was
overwritten: `ollama show apunta-study-qwen35-9b-q4` → absent;
`apunta-study-qwen35-9b-q3` → absent.

Modelfiles (scratch root) pin the study context and deliberately declare **no**
`TEMPLATE`, so Ollama must keep the template embedded in the GGUF:

```
FROM /home/villenull/.cache/apunta-model-study/2026-09-27/gguf/Qwen3.5-9B-Q4_K_M.gguf
PARAMETER num_ctx 16384
```

```
ollama create apunta-study-qwen35-9b-q4 -f Modelfile.q4   → exit 0
ollama create apunta-study-qwen35-9b-q3 -f Modelfile.q3   → exit 0
```

Resulting tags (nothing else in the library was touched):

| Tag | `ollama list` id | local manifest sha256 | params layer |
| --- | --- | --- | --- |
| `apunta-study-qwen35-9b-q4:latest` | `b5bed9c2bf10` | `b5bed9c2bf10ad88927ed2856d62f2b9f8e8e16c769e3ece6c16af7c279435ac` | `sha256:58e1b82a…` (18 B, `num_ctx 16384`) |
| `apunta-study-qwen35-9b-q3:latest` | `f1c58a78df15` | `f1c58a78df155bf4fd415564c32eb45267b4d0699bc9eb7294e73ea6d64930c5` | same `sha256:58e1b82a…` |

`ollama show -v` reports, for both: architecture `qwen35`, 9.0 B parameters,
8 953 803 264 exact parameter count, context 262 144, embedding 4096,
`general.basename Qwen3.5-9B`, `general.size_label 9B`, `general.license
apache-2.0` with the Qwen LICENSE link, `general.quantized_by Unsloth`,
quantization Q4_K_M (q4) / Q3_K_M (q3), capabilities `completion`, `tools`,
`thinking`. No `vision` capability is claimed, consistent with a text-only
import that carried no projector.

### 5.1 Native template and tokenizer preserved (checked via `show`, not inferred)

| Check | Result |
| --- | --- |
| `ollama show --template apunta-study-qwen35-9b-q4` | 7 816 bytes, sha256 `7f0e529032c25183bcd66c7f238da2d377f43be754a94e2725a58c4e16d2ed67` |
| `ollama show --template apunta-study-qwen35-9b-q3` | 7 816 bytes, sha256 `7f0e529032c25183bcd66c7f238da2d377f43be754a94e2725a58c4e16d2ed67` — **identical to q4** |
| Template content | the native Qwen3.5 chat template carried in the GGUF (`image_count`/`video_count` namespaces, `render_content` macro, `<\|vision_start\|>`/`<\|image_pad\|>`/`<\|vision_end\|>` handling, thinking-aware) — not a built-in Ollama default |
| Contrast: 4B baseline template | 13 bytes, sha256 `b507b9c2f6ca642bffcd06665ea7c91f235fd32daeefdf875a0f938db05fb315` (no explicit template layer) |
| Tokenizer read back by Ollama | `tokenizer.ggml.model gpt2`, `tokenizer.ggml.pre qwen35`, 248 320 tokens, 247 587 merges, `eos_token_id 248046`, `padding_token_id 248055` — matches the upstream GGUF metadata |

The q4 and q3 templates being byte-identical, and both matching the GGUF's own
`tokenizer.chat_template` KV, is the evidence that the native template was
preserved. **No quality conclusion is drawn here** — only that template and
tokenizer arrived intact.

## 6. Ollama import transformation — a distinct artifact, *not* corruption

`ollama create` does not serve the upstream file byte-for-byte. It stores the
imported GGUF twice under two different content addresses, and the manifest
references the second one. Both digests are recorded so they are never
conflated:

| | Upstream-verified copy | Ollama layer referenced by the manifest |
| --- | --- | --- |
| C (q4) blob | `sha256:03b74727a860a56338e042c4420bb3f04b2fec5734175f4cb9fa853daf52b7e8`, 5 680 522 464 B | `sha256:9d14965c27990200bb206d62d08b7f229a0d89ef185e314a213676e41beeae07`, 5 680 522 464 B |
| D (q3) blob | `sha256:8fed90306e4f019e2bf35f3766470b7bc59ea1a9dae00f5ceb20b43cb5514393`, 4 673 643 744 B | `sha256:0112c40f57608202255fcefcb8bfc81e23bae6a7ff7672088bbb3f88e9d2b737`, 4 673 643 744 B |

Integrity of each was re-established independently, and the difference was
then **localized and explained rather than labelled corruption**:

1. Each blob was re-hashed on disk. Both upstream-addressed blobs hash to their
   published LFS digests exactly; both Ollama layers hash to their own names
   exactly. Neither file is damaged.
2. `cmp -s` between each upstream blob and its Ollama layer returned status
   **1** (different) for both q4 and q3. (Read-only comparison, no per-byte
   enumeration.)
3. GGUF header comparison shows the two files are structurally identical:
   version 3, **427 tensors**, **46 KV entries**, and the KV block ends at the
   **same offset 10 943 081** in both.
4. Parsing all 46 KV entries in both files yields the **same key set with the
   same values** (`general.*`, `qwen35.*`, `tokenizer.ggml.*`,
   `tokenizer.chat_template`, `quantize.imatrix.*` all identical). The only
   structural change is **key ordering**: Ollama relocates
   `general.quantization_version` and `general.file_type` to the end of the KV
   block.
5. Hashing everything from offset 10 943 081 to EOF — i.e. the tensor
   descriptors and all quantized weights — is **identical**:
   - q4: `21a131a2d465ffa5fd67c5d01710b3448ae25c7304e61c319306defd25e14133` in both files
   - q3: `72093bd7acd86af41bb8129077087a5ebf1e2b97d9ca2e0ef73e8cdd42e5f5da` in both files

**Conclusion:** every difference introduced by `ollama create` lies inside the
metadata KV block and is a re-ordering of two same-width entries. The weight
bytes are byte-identical, and the metadata is semantically identical. This is
an expected import transformation, **not** evidence of corruption, and it is
not a quality finding.

## 7. E — Gemma4 12B, official quantized package

Tag availability was verified against the Ollama registry before pulling, and
the tag identity was checked rather than assumed.

| Item | Value |
| --- | --- |
| Tag pulled | `gemma4:12b` |
| Registry call | `GET https://registry.ollama.ai/v2/library/gemma4/manifests/12b`, `Accept: application/vnd.docker.distribution.manifest.v2+json` → **http 200** |
| Tag identity check | `gemma4:12b` and `gemma4:12b-it-q4_K_M` return the **same** model layer `sha256:1278394b693672ac2799eadc9a83fd98259a6a88a40acfb1dcaa6c6fc895a606`, so the default tag **is** the official Q4_K_M package. `gemma4:12b` is the current official quantized package; no substitute was chosen. |
| Quantization | Q4_K_M (confirmed by `ollama show`, not by filename) |
| Local manifest sha256 | `4eb23ef187e2c5462566d6a1d3bbbc2f1346d0b4327cbb66d58fffbcc9b2b05c` (`ollama list` id `4eb23ef187e2`) |
| Layers | model `sha256:1278394b…` 7 381 382 048 B · projector `sha256:675ad6e6…` 175 115 584 B · license `sha256:0d542e0c…` 10 174 B · params `sha256:56380ca2…` 42 B · total 7 556 507 848 B |
| Config blob | `sha256:c805f5b265d8e695c44f4065dfc368206cd8026447604925fef8db57ee32ee23` (548 B) → `architecture amd64`, `model_type 11.9B` |
| License | **Apache License 2.0** (license layer fetched and hashed: `0d542e0c…`, 10 174 B, first line "Apache License / Version 2.0") |
| `ollama show` | architecture `gemma4`, 11.9 B params, context 262 144, embedding 3840, Q4_K_M, **requires 0.30.5** (satisfied by 0.33.3), capabilities `completion`, `vision`, `audio`, `tools`, `thinking`, clip projector 52.38 M |
| Command | `ollama pull gemma4:12b` → **exit 0**, 18:41:17Z → 18:42:37Z, client reported "verifying sha256 digest … success" |
| Independent re-verification | local blob re-hashed: `1278394b693672ac2799eadc9a83fd98259a6a88a40acfb1dcaa6c6fc895a606`, size 7 381 382 048 B — equals the registry digest |
| Pre-pull state | tag **absent**; no existing tag overwritten |

## 8. F — TranslateGemma 4B

| Item | Value |
| --- | --- |
| Tag pulled | `translategemma:4b` |
| Availability search | `https://ollama.com/search?q=translategemma` → `/library/translategemma`; `https://ollama.com/library/translategemma/tags` lists 4b, 4b-it-bf16, 4b-it-q4_K_M, 4b-it-q8_0, 12b*, 27b*, latest |
| Registry call | `GET https://registry.ollama.ai/v2/library/translategemma/manifests/4b` → **http 200** |
| Tag identity check | `translategemma:4b`, `translategemma:4b-it-q4_K_M` and `translategemma:latest` return **identical layer sets** (same model digest `sha256:bdbf939b…`), so `:4b` is itself the official Q4_K_M 4B package. Nothing was substituted. |
| Local manifest sha256 | `c49d986b0764f5881c476eb21435bb62b7abc62347aab3d4a6071e811be510a1` (`ollama list` id `c49d986b0764`) |
| Layers | model `sha256:bdbf939b402e2f88fbe3e918beb777813009335756b4c17be7fe008dfe4815d4` 3 298 866 368 B · template `sha256:e0a42594d802e5d31cdc786deb4823edb8adff66094d49de8fffe976d753e348` 358 B · license `sha256:3e2c24001f9ef57bf7ec959a3658fbb49cdad113cdf394c264da9d16f9bdd132` 8 431 B · params `sha256:339e884a40f6708bc761d367f0c08e448d5bb6f16b3961c340e44e0e4835a004` 61 B · total 3 298 875 218 B |
| Config blob | `sha256:37490ee3c3a4ed4437a014611f3f9e9a7bc1d9934db250edaf2f929cd4f1f5b5` (489 B) → `architecture amd64`, `model_type 4.3B` |
| License | **Gemma Terms of Use**, last modified 2024-02-21 (license layer hashed `3e2c2400…`, 8 431 B) — **not** Apache-2.0. This is a licence asymmetry with E and the 4B baseline and must be surfaced in any promotion discussion. |
| `ollama show` | architecture `gemma3`, 4.3 B params, context 131 072, embedding 2560, Q4_K_M, capabilities `completion`, `vision`, params `stop "<end_ofturn>"`, `top_k 64`, `top_p 0.95` |
| Command | `ollama pull translategemma:4b` → **exit 0**, 18:42:39Z → 18:43:15Z, "verifying sha256 digest … success" |
| Independent re-verification | local blob re-hashed: `bdbf939b402e2f88fbe3e918beb777813009335756b4c17be7fe008dfe4815d4`, size 3 298 866 368 B — equals the registry digest |
| Pre-pull state | tag **absent**; no existing tag overwritten |

E and F were pulled **serially** (E completed before F began).

## 9. Network surface, and what was deliberately not sent

Hosts contacted, in order: `huggingface.co` (API + resolve), then the CDN
redirect target, then `registry.ollama.ai`, then its blob redirect target.
`127.0.0.1:11434` for local daemon operations.

| Purpose | Host contacted | Redirect domains observed |
| --- | --- | --- |
| HF repo + pinned tree metadata | `huggingface.co` | none |
| C, D weight streams | `huggingface.co/…/resolve/<revision>/…` | `huggingface.co` → **`us.aws.cdn.hf.co`** (`/xet-bridge-us/…`), one 302 then 200 |
| Registry manifests, configs, license blobs (read-only) | `registry.ollama.ai` | `registry.ollama.ai` → **`dd20bb891979d25aebc8bec07b2b3bbc.r2.cloudflarestorage.com`** (307, path `…/blobs/sha256/…/data`) |
| Registry pulls E, F | `registry.ollama.ai` (driven by the `ollama` client) | as above |

- **No signed query strings, credentials or tokens are recorded in this report
  or in any scratch artifact.** CDN redirect URLs are logged with query strings
  stripped; the one fetch log that captured a signed URL was redacted in place
  and verified to contain no `Expires=` or `Signature=` afterwards.
- No user content, note text, patient material, machine identifier or
  telemetry left the machine. Requests carried only repo paths and blob
  digests.
- This acquisition is the only network activity of the session. No runtime
  egress was added, and no code was changed, so the production egress guard is
  untouched.

## 10. No-inference attestation

- `ollama ps` → empty table before, during and after: **no model was ever
  loaded**, so no warmup, no generate, no benchmark, no VRAM/RSS measurement.
- The only `ollama` subcommands used were `list`, `show`, `create`, `pull`,
  `--version` — all metadata or transfer operations.
- No model was unloaded or force-unloaded; no unrelated process was touched.
- `scratch-root/gpu-study.lock` was **not** taken: no GPU lease is needed for
  download-only work. The execution worker must acquire it before any warmup.
- No service was started/stopped/reconfigured. Port 7717 was never contacted
  and is not listening. (Port 5173 belongs to the owner's already-running Vite
  dev server and was left untouched.)

## 11. Notes and caveats handed to the execution worker

1. **C/D carry `num_ctx 16384` baked into their params layer** (set at import so
   the study context is explicit). E and F keep registry defaults, so the
   runner **must pass `num_ctx 16384` explicitly** on every arm for the
   comparison to be like-for-like. Record the effective setting per request.
2. **C/D were created from GGUFs, so they have no Ollama license layer**;
   `ollama show --license` is empty for them. The licence
   (`apache-2.0`, Qwen's Apache-2.0) lives in the GGUF metadata and is recorded
   in §4.2/§5. Do not read an empty `--license` as "unlicensed".
3. **B needs the scratch-only thinking adapter.** A is unchanged; the adapter
   is the execution worker's deliverable, and nothing in this session changed
   the 4B tag or its settings.
4. **C-thinking remains ungated-open** (§2). Acquire separately and never
   overwrite `apunta-study-qwen35-9b-q4` if the plan's condition is met.
5. **E is a comparator, not an 8 GB M2 promise** (plan §matrix). Its 7.56 GB
   pull plus projector is recorded here; Mac fit stays a NOT RUN gate.
6. **F's licence is Gemma Terms of Use, not Apache-2.0** — a promotion-relevant
   asymmetry to carry into the decision table.
7. **F's translation-pivot protocol is untouched by this session**: no prompt,
   chunking or scoring work was done. Its 131 072 context and `<end_ofturn>`
   stop token are recorded facts the chunking design must respect.
8. `gguf/*.gguf` (9.7 G) is kept in scratch for reproducibility and re-verification.
   The Ollama store additionally retains both the upstream-verified blobs and
   the derived layers (§6), so C/D occupy roughly double their nominal size.
   Disk is not a constraint (855 G free); delete nothing without the
   coordinator's say-so.

## 12. Completion statement

- Requested model artifacts: **5** — the 4B baseline (arms A and B), 9B Q4_K_M
  (C), 9B Q3_K_M (D), Gemma4 12B (E), TranslateGemma 4B (F).
  Already available at session start: **1** (the 4B baseline, reused untouched).
  Acquired in this session: **4 new tags** (2 GGUF imports + 2 registry pulls).
- Failed candidates: **none**. No retry was consumed; the single permitted
  retry remains available per candidate.
- No checksum was fabricated, no unrelated substitute was chosen, and no
  quality claim is made anywhere in this document.
- This file is the **only** repository output of this worker and is
  **deliberately left uncommitted and unstaged**, as instructed. The working
  tree also carries unrelated in-flight changes from the UI agent's lane; those
  were not touched, staged or committed.


## Coordinator verification and interpretation

Re-ran sha256sum on both source GGUFs: exit 0, exact matches to section 4.2.
Re-ran ollama list: exit 0, all five tags and manifest prefixes match the
report, including unchanged baseline 2a654d98e6fb. Read the complete report;
acquisition accepted as availability evidence, not inference compatibility or
quality acceptance. Archived acquisition worker after processing its handoff.

Interpretation corrections: optional C-thinking is a mode of the already
acquired C weights, not an additional acquisition requirement. TranslateGemma
runtime-reported context capacity is not proof of translation quality across
that context; executor must retain the conservative documented translation
input limit and frozen chunking protocol. An empty ollama ps snapshot alone
cannot prove that no inference ever occurred; no-inference is worker attestation
plus reported command history, not continuous observation.
