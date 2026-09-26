# P0.4 — environment and identity of the measurement

Recorded before the first invocation, 2026-09-26, UTC. Sanitised: the home
folder is written `~`; nothing here names a person, a patient or a host.

C-EVAL@1 §7 requires model tag and digest, inference options, prompt set hash,
corpus hash, git commit and hardware for every run. The runs are in
`invocations.md`; this file is the identity they all share.

## Git

| Field | Value |
| --- | --- |
| Commit | `f7907097d5e7f8b8e1e3eecf3ff37c69a5aa706e` |
| Subject | Clarify S4a.1 variant clause per IR round 3 (AM-027) |
| Branch | `feature/v2` |
| HEAD at start | `f790709` — equals the base commit the card named |
| Commands run | `git log -1` only. No pull, merge, rebase, reset or checkout. |
| HEAD after the runs | `3fe5355` — moved by the coordinator, not by this card (see below) |

**HEAD moved after the measurement, and it was not this card's doing.** The eight
invocations ran 07:58:33Z–08:04:30Z with HEAD at `f790709` throughout. Two
commits landed afterwards, both authored by the coordinator:

| Commit | Time | Touches |
| --- | --- | --- |
| `b366be1` "Add owner-authorised Claude-style UI baseline (out-of-band, AM-028)" | 02:06:57 −06:00 | `web/**`, `shared/src/{index,settings,settings.test}.ts`, one `docs/v2/state/AMENDMENTS.md` line |
| `3fe5355` "Record v2 state: P0.4/P0.5/S4a.1 dispatches (coordinator)" | 02:07:28 −06:00 | `docs/v2/state/**` and `docs/v2/ORCHESTRATION-LOG.md` only |

Both post-date the last invocation by more than two minutes. `git diff --name-only
f790709..HEAD -- server e2e` is **empty**: the eval harness, the prompt set, the
scorer and both corpora are byte-identical to the base commit. The four file
hashes and two corpus hashes recorded below were recomputed after those commits
landed and are unchanged. Resetting to the base commit is forbidden (HS-4), so the
tree was left where the coordinator put it and the movement is reported in the
P0.4 return file instead.

**The working tree was not clean, and was not made clean.** An unrelated
out-of-band edit was in flight (a `web/` UI preview, plus its `docs/v2/state/`
bookkeeping and a `shared/` theme/appearance change). None of it is on the eval
path: the `shared/` diff adds a `system` theme and a `ResolvedTheme` type, and
the eval reaches the model through `server/src/ai/ollama.ts` and
`server/src/eval/*`, which the commit pins. `shared/dist/` is gitignored and is
rebuilt by `npm run eval` on every invocation. No `web/` file was read, written
or staged by this card.

## Model

Pulled nothing, removed nothing, replaced nothing (HS-3). The tag was already
installed; `ollama list` was run first to confirm that.

| Field | Value |
| --- | --- |
| Tag | `qwen3.5:4b-q4_K_M` |
| Digest | `2a654d98e6fba55d452b7043684e9b57a947e393bbffa62485a7aac05ee4eefd` |
| Short id | `2a654d98e6fb` |
| Parameters | 4.7B (4,659,865,088), quantisation Q4_K_M, gguf, family `qwen35` |
| Trained context | 262,144 |
| Capabilities | completion, vision, tools, thinking |
| Licence | Apache License 2.0 |
| Requires | ollama 0.17.1+ |
| Serving ollama | 0.33.3 |
| Endpoint | `http://127.0.0.1:11434` (loopback only) |

`ollama show qwen3.5:4b-q4_K_M` — Modelfile parameter block, all four of which
the request overrides:

```
  Parameters
    top_k               20
    top_p               0.95
    presence_penalty    1.5
    temperature         1
```

## Inference options actually sent

From `server/src/ai/ollama.ts` (`streamChat`, the `/api/chat` payload). The eval
CLI constructs `OllamaProvider` with no overrides, so these are the shipped
defaults, not per-run choices:

| Option | Value |
| --- | --- |
| `temperature` | 0 |
| `num_ctx` | 16,384 (`NUM_CTX`) |
| `num_predict` | 3,072 (`NUM_PREDICT`) |
| `seed` | 0 |
| `repeat_penalty` | 1.0 (neutralises Ollama's v0.32.10 default, which penalises constrained JSON) |
| `keep_alive` | `30m` (`DRAFT_PRELOAD_KEEP_ALIVE`) |
| `format` | JSON schema for the note shape |
| Output | streamed; the eval is sequential, one generation at a time |

At temperature 0 with a fixed seed the runs are reproducible in intent. They are
not bit-identical: see the one fixture whose faithfulness score moved between
invocations, recorded in `../BASELINE.md`.

`ollama ps` during the runs:

```
NAME                 ID              SIZE      PROCESSOR    CONTEXT    UNTIL
qwen3.5:4b-q4_K_M    2a654d98e6fb    3.6 GB    100% GPU     16384      28 minutes from now
```

100% GPU offload, and the served context is the 16,384 this app asks for — not
the model's native 262,144.

## Hardware

| Field | Value |
| --- | --- |
| CPU | AMD Ryzen 7 9800X3D, 8 cores / 8 threads, 1 socket, x86_64, `AuthenticAMD` |
| RAM | 30 GiB total (32,741,576,704 bytes); 22 GiB available at measurement time |
| GPU | AMD Radeon, Navi 48 / RX 9070 series (`Sapphire Technology Limited`, subsystem `e489`), kernel driver `amdgpu` |
| GPU offload | 100% GPU, confirmed by `ollama ps` above |
| OS | Omarchy, kernel `7.2.5-3-omarchy`, x86_64 |

The card's GPU capacity is not recorded because it cannot be read reliably on
this host: `rocm-smi` is not installed, `/sys/class/drm/card0/.../mem_info_vram_total`
is the 0.5 GiB BAR aperture, and while `/sys/class/drm/card1/.../mem_info_vram_total`
does read 17,095,983,104, the node-to-device mapping was not certain enough to
assert as the capacity. A number
guessed from the PCI device string would be a fabrication, which is the one
thing this card exists to measure, so it is left out.

## Toolchain

| Field | Value |
| --- | --- |
| Node | v24.19.0, from `~/.local/share/apunta-node/node-v24.19.0-linux-x64/bin` (first on `PATH`) |
| npm | 11.17.0 |
| Eval entry point | `npm run eval` → `tsx src/eval/cli.ts` in `@apunta/server`, after `npm run build:shared` |

## Corpus and prompt-set hashes

SHA-256. The two "tree hash" values from the first draft were dropped: the
documented method did not reproduce them (review finding 3), and the per-file
`expectations.json` and transcript-concatenation hashes below reproduce exactly
and pin the same content. The four `clinical-knowledge/*.ts` hashes were added so
the prompt-set hash covers the whole prompt set (C-EVAL@1 §7).

| Artefact | SHA-256 |
| --- | --- |
| `e2e/fixtures/eval/expectations.json` | `ee9d28f26f3e9bcd2d950f87debe6d00a3535de54cdbc49fd572721428ef62f6` |
| `e2e/fixtures/eval` transcripts, concatenated | `70ca0aae615a0e70c7883f14adfb900f6bac2b6cf0c9294905f571127150126f` |
| `e2e/fixtures/eval-owner/expectations.json` | `f1e5d94536e60817aae4cbb00318908c8a92362907081720af08d493d94cb14c` |
| `e2e/fixtures/eval-owner` transcripts, concatenated | `63d1c0d2fb31c88bb883e432c17f0f22d57a9d87bebdf49829f1f3103341cbb2` |
| `server/src/ai/clinical-knowledge/integration.ts` | `46c2d1b73f1721aaf7ec01020656b9f1cd6ecad7f05452bf25d064623c8d97b5` |
| `server/src/ai/clinical-knowledge/presentation.ts` | `e0ff375ea70cbc9a9216bf62cc2484f700b2aa6ac030ac5e784611d80152ccf5` |
| `server/src/ai/clinical-knowledge/interventions.ts` | `274a286b5f4438664b67c0751ab27382d6f9f373902c806b13170a314362f678` |
| `server/src/ai/clinical-knowledge/discussion-subheadings.ts` | `f4db4f744244a9b99a2232f20058f582e7780210aa552611e15f19b8aab3786d` |
| `server/src/ai/default-instructions.ts` (the prompt set — built-in defaults, no `--instructions` override was used) | `1855cce7a774b7dd7bf75b73d79918a3c1a9549251141e99c69f3121c4d9152c` |
| `server/src/ai/prompts.ts` | `30efe2c3cb9f026e870996789642beb6e616ef01c98962eb8d0be0406e5a2a44` |
| `server/src/eval/score.ts` (the scorer) | `619eb001e7e2fdd3c2919773f0f4f6f937bedd869cd60bed334f1de42a0ff995` |
| `server/src/eval/corpus.ts` | `cd546f8cc52609d61d72afa794f18ea31810662f159799d3d0c6129e8f064cee` |

Per C-EVAL@1 §7 the prompt-set hash must cover the whole prompt set: besides
`default-instructions.ts` and `prompts.ts`, `buildGeneratePrompt` splices in
`renderClinicalKnowledgeGuide(...)` (`server/src/ai/prompts.ts:165-171`), which is
assembled from the four `clinical-knowledge/*.ts` files above (guidance version
string `2026-09-07.1`, `shared/src/clinical-guidance.ts:10`). Those four are now
hashed; a change to the local clinical vocabulary moves every rate in
`BASELINE.md` §5 and now moves a recorded hash too.

V1 is SOAP + intake (`e2e/fixtures/eval`), V2 is the owner's own format
(`e2e/fixtures/eval-owner`). They are separate corpora with separate
denominators; no number below mixes them.

## What was not touched

Port 7717 was never contacted. No Apunta server was started, no database was
opened, no sandbox run was needed (the eval CLI is a direct provider call), and
the live data folder, its backups, the owner's Claude export and the Halaxy PDFs
were never opened, listed or read. All eight invocations spoke only to
`http://127.0.0.1:11434` behind the CLI's own egress guard.
