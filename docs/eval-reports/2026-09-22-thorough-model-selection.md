# Thorough model selection — 2026-09-22

This is Linux-only, synthetic-only evidence from the RX 9070 XT workstation. No
patient database, export, recording, cloud evaluator, or remote-inference model
was used. The result is **NONE**: no slightly heavier local model passed the
owner's promotion gate, so Thorough must not ship and Quick remains the only
profile.

## Decision

**Do not select a Thorough model.** The current `qwen3.5:4b-q4_K_M` control had
35.0% fabrication flags (7/20) and 70% safety-fact coverage (14/20). Every
candidate was worse on fabrication, or worse on safety, or both:

| Model | Fabrication rate (read first) | Safety facts | Mean draft wall time | Direct refine latency | Gate |
| --- | ---: | ---: | ---: | ---: | --- |
| `qwen3.5:4b-q4_K_M` control | **35.0% (7/20)** | **70.0% (14/20)** | **2.3 s** | **3.47 s** | control |
| `qwen3.5:9b` | **45.0% (9/20)** | **65.0% (13/20)** | **3.1 s** | **6.61 s** | reject: worse fabrication and safety |
| `qwen3:8b` | **50.0% (10/20)** | **70.0% (14/20)** | **2.9 s** | **4.51 s** | reject: worse fabrication |
| `qwen3:14b` | **50.0% (10/20)** | **65.0% (13/20)** | **4.7 s** | **6.45 s** | reject: worse fabrication and safety |

The three candidate rows are one run over all 20 fixtures. A real run exits
with status 1 when the rubric finds a gating failure; the markdown report is
still the measured result. The control's 35.0% is a fresh same-campaign run,
not the earlier 18/60 comparison denominator. Draft wall time is the eval's
mean end-to-end wall clock. Direct refine latency is one identical synthetic
"make the Discussion more concise without changing facts" request, measured
through Ollama's chat endpoint with the production prompt shape; it is a
comparability indicator, not a quality score. The 14B refine measurement
reported 11.42 GB of 12.18 GB in VRAM (the remainder was CPU-resident), so its
refine number is additionally conservative rather than a full-offload claim.

The candidate draft times were 1.35x, 1.26x, and 2.04x the control for 9B, 8B,
and 14B respectively. The 14B therefore also crosses the owner's approximate
2x latency warning, while failing quality gates independently.

## Candidate shortlist and local acquisition

The earlier four-model comparison already rejected qwen2 and Bonsai 4B/8B Q1_0;
none was pulled again. The new shortlist was:

- `qwen3.5:9b` — same Qwen 3.5 family as the tuned control, Q4_K_M, 9.7B.
- `qwen3:8b` — Q4_K_M, 8.2B, an older-generation cross-family point.
- `qwen3:14b` — Q4_K_M, 14.8B, the upper point that still fits this GPU.

The normal local Ollama tags were verified with successful `ollama pull` and
`ollama show` calls, not cloud variants. Metadata reported `format=gguf` and
`quantization=Q4_K_M` for every row. Library references checked were
[`qwen3.5`](https://ollama.com/library/qwen3.5) and
[`qwen3`](https://ollama.com/library/qwen3); the exact candidate tags were also
accepted by the local Ollama registry, pulled, and shown before measurement.
No `:cloud`, `-cloud`, z.ai, or other remote-inference tag was used.

The final inventory was checked with `ollama list`: only
`qwen3.5:4b-q4_K_M` remains. The three rejected candidates were removed with:

```text
ollama rm qwen3.5:9b qwen3:8b qwen3:14b
```

## Measurement conditions and GPU evidence

Every model used the same `npm run eval` harness and the same defaults: 20
fixtures, one run per fixture, temperature 0, seed 0 on the first attempt,
`think:false` for thinking-capable Qwen models, `num_ctx=16384`, and
`num_predict=3072`. The candidates were measured in the same campaign and
configuration as the control. To prevent a previously resident model from
stealing VRAM, the disposable Ollama service was restarted between arms; this
is isolation, not a change to the prompt or decoder.

The eval endpoint was a disposable Ollama at `127.0.0.1:11435`, with the
shared local model store and `OLLAMA_NO_CLOUD=1`. The live 11434 model was
unloaded before the clean campaign (`ollama ps` then showed no rows). Ollama
0.34.2 used bundled ROCm on ROCm0, the RX 9070 XT `gfx1201`; the 4B control had
34/34 layers offloaded and the GPU probe recorded about 15.9 GiB VRAM. The
candidate `/api/ps` rows during clean inference showed full model residency:

| Model | `size` | `size_vram` | Interpretation |
| --- | ---: | ---: | --- |
| `qwen3.5:4b-q4_K_M` | 3,627,171,183 | 3,627,171,183 | 100% of model in VRAM |
| `qwen3.5:9b` | 5,905,317,886 | 5,905,317,886 | 100% of model in VRAM |
| `qwen3:8b` | 7,520,177,356 | 7,520,177,356 | 100% of model in VRAM |
| `qwen3:14b` | 11,827,402,505 | 11,827,402,505 | 100% in the clean draft arm |

The separate refine probe later showed the 14B's resident VRAM at
11,422,002,052 of 12,181,401,761 bytes; that partial split is why its refine
latency is not used to claim a full-offload production speed. The clean draft
arm's 14B row above is the draft measurement used in the gate.

## Quality findings

The control's failed fixtures were:

- `05` and `06`: F7 novel diagnosis/risk terms.
- `09`, `10`, and `16`: F1 banned or unsupported source phrases.
- `15`: F7 novel diagnosis/risk term.
- `17`: F6 unsupported conclusion.

The 9B failed the control's `09`, `10`, `15`, and `16` cases and added:

- `03`: copied/treated the source's fire-alarm/four-minute detail as a banned
  phrase in the wrong place (a source-detail routing/fidelity failure).
- `07`: introduced “movie” (a concrete unsupported detail).
- `08`: novel diagnosis/risk content (a real clinical fabrication).
- `14`: introduced “insomnia” (a clinical interpretation not supplied).
- `19`: introduced a compulsive-content fragment (a clinical fabrication).

It also avoided some control failures, but the net result was still 9/20 and
its safety denominator fell from 14/20 to 13/20. The 8B added `03`, `07`, `12`,
`18`, and the F6 cases in `12`/`17`, reaching 10/20; these included concrete
unsupported details (“movie”, “elevator”, “stairs”) and unsupported clinical
conclusions. The 14B added `06`, `07`, `08`, `14`, and `18` to overlapping
control failures, reaching 10/20; its failures included novel clinical terms
and unsupported “indicating” conclusions. These are rubric categories, not
claims about real patients.

## Discussion labels

The same direct two-topic drafting prompt was sent to all four local models
with the production generate system/user prompt construction, `think:false`,
temperature 0 and seed 0:

> Fictional client talked about sleep, waking early most days this week.
> Separately, she described an argument with her partner about chores.

| Model | Two-topic output | Lowercase topic labels? |
| --- | --- | --- |
| 4B control | One prose block preserving both topics | **No** |
| 9B | One prose block preserving both topics | **No** |
| Qwen 3 8B | One prose block, but changed the name to “Dana” | **No**; also a fidelity warning |
| Qwen 3 14B | One prose block, but changed the name to “Fictional” | **No**; also a fidelity warning |

No candidate improved the known two-topic label limitation. The earlier
`check:format` run on the control remained 0 flags across six synthetic format
fixtures; single-topic fixtures did not over-split. The candidate format probe
was intentionally not treated as a gate because the profile-selection work was
being integrated concurrently and the quality gate already rejected all three.

## Reproduction artifacts and conclusion

The per-arm reports were captured as `/tmp/eval-4b.md`, `/tmp/eval-9b.md`,
`/tmp/eval-qwen3-8b.md`, and `/tmp/eval-qwen3-14b.md` during this session. The
exact campaign command was:

```text
NODE_OPTIONS=--import=/tmp/apunta-eval-redirect.mjs npm run eval -- --runs 1 --models MODEL --out /tmp/eval-MODEL.md
```

The redirect only routed the eval's fixed loopback default from 11434 to the
disposable 11435 service; it did not alter prompts, decoding, or model
selection. The baseline and every candidate were then verified to be present
on the same local ROCm stack. No candidate satisfies fabrication <= control
and safety >= control, so the exact Thorough selection is **NONE**. Keep the
4B installed and do not expose a Thorough option.
