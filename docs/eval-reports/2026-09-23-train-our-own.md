# Training or adapting our own model on her notes — 2026-09-23

**Bottom line, up front.** Training is possible, cheap, and now proven on this
machine: a LoRA for the shipped 4B trains on the RX 9070 XT, merges, converts to
GGUF and runs in the lab's own Ollama, and the whole pipeline is built and
exercised end to end on synthetic data with zero patient text anywhere near it.
What the prototype does *not* establish is that it helps — its job was to build
the instrument and price the exercise, and §2 reports what it measured. The
cheaper lever is retrieval (her own accepted notes as in-context examples at
draft time), which needs no new artifact and no new consent. Preference tuning
needs a signal the app does not record yet. Full fine-tuning is infeasible on
this card and pointless at this data scale. The consent text she would be
agreeing to is in §5.

## 1. What the options actually cost

| | (a) Retrieval of her own notes | (b) LoRA on (input → note) pairs | (c) Preference tuning (DPO) from her edits | (d) Continued training / full fine-tune |
| --- | --- | --- | --- | --- |
| **What it changes** | The prompt: her own past notes go in as in-context examples | The weights: a small adapter learns the mapping she already makes | The weights: learns which of two drafts she would keep | The weights, wholesale |
| **Effort** | Low — the fitting, the block and the leak guard already exist for refine and Brainstorm; the drafting path needs them wired in | Medium — built and priced in this report; a consented run is then one script | High — no (draft, edited) pair is recorded today, so the app must change first, then a DPO trainer | Very high |
| **Data needed** | Her notes, already in the database. Nothing new | 200–500 pairs to shift style and format; 1–2k to be confident. Her export holds 508 conversations | Thousands of preference pairs to beat overfitting on a 4B; she has not used the app yet, so today the count is zero | Billions of tokens. Her notes are ~10⁵ |
| **Expected gain** | Style, register and format habits — the material the eval's human criteria (F5, C3, H3, T5) are about. Not faithfulness | The rules that are currently *prompt sentences*: blank sections, "None.", the retraction, the risk review, not-gathered material. Measured in §2 | Her taste, directly: the most aligned option in principle, and the least predictable | None at this scale |
| **Risk** | Sentence-level bleed from an old note into a new one. Already has detectors (`prior-note-guard.ts`; `check:format`'s example-leak rule) | An adapter can regress fidelity as easily as improve it, and it distils the teacher's habits — including any invention — along with its format. The filter in §4 exists for that | Reward hacking: shorter or longer notes, hedged prose. Harder to audit than a supervised adapter | Wasted months |
| **Runtime cost** | Prefill only: ~1 s per 3k extra tokens on the GPU (3,144 tok/s, measured 2026-09-22), and the prefix cache makes a repeated background nearly free | None: the adapter merges into the same 4B at the same Q4_K_M, the same 3.4 GB, the same decode rate | None, same as (b) | None, but you cannot ship it |

### (a) Retrieval — most of it is already built

`server/src/ai/prior-notes.ts` already does the hard part: `fitNotesNewestFirst`
takes a patient's notes newest-first and returns the whole notes that fit a
token budget, ending the run at the first note that does not (so the model never
reads history with a hole in it), and `priorNoteBlock` renders them. Two callers
use it today: the refine chat (the patient's other notes, fenced READ-ONLY, at
most 4,096 estimated tokens) and Brainstorm (all of a patient's notes, a
13,824-token budget).

**The drafting path does not use it.** `buildGeneratePrompt` sends the
instructions, the output-format block, the clinical-knowledge guide, the source
and the conditional reminders — no prior notes at all. So the cheapest version
of "learn from her own notes" is not training at all: it is giving the drafting
model the same in-context examples the refine chat already gets, fitted by the
same function and held back by the same lock. That is a prompt change, it needs
no consent beyond the notes she already keeps, and it is reversible in one
commit.

The risk is the one the 2026-09-22 second pass found in the instruction files:
examples are the highest-impact part of a prompt, and they leak. A retrieved
note is a *stronger* example than a synthetic one, because it is real.
`prior-note-guard.ts` already holds back a revised section that gains a fact or
a five-word run found only in another note, and the drafting path would need the
same check plus `check:format`'s example-leak detector run on the result.

## 2. The synthetic prototype: what was built, and where it stopped

**Built and verified.**

* **A synthetic corpus generator** (`tools/model-lab/synth/generate.ts`): 400
  pairs across her seven-section format (231), SOAP (131) and intake (38), from
  structured scenarios. Each note is rendered *from the same facts as its
  dictation*, so every target is faithful by construction; the dictation and the
  note deliberately share facts but not wording. The traps the eval scores are
  represented on purpose — 18 retractions, 45 restated-figure traps, 136 risk
  reviews, plus not-gathered topics, flagged asides, declined options and the
  "None." convention.
* **Production's own prompt builder assembles every example**
  (`synth/build-dataset.ts` calls `buildGeneratePrompt`), so the system and user
  turns are byte-identical to what the app sends — decontaminated instructions,
  output-format block, clinical-knowledge guide, the conditional reminders, the
  tail reminder, and `enable_thinking=False` to match the `think: false` the
  provider sends.
* **The corpus passes its own acceptance check** (`synth/check-dataset.ts`):
  **400 pairs, 0 dropped** by the pair filter, 0 ungrounded Discussion
  headings, 0 malformed targets, and every fact pool's `say`/`note` lists the
  same length. The generator is checked, not trusted.
* **The consented pipeline runs end to end on a synthetic export**
  (`synth/make-synthetic-export.ts` builds a Claude-export-shaped file from the
  same generator; `pipeline/build-pairs.ts` reads it through the M11 importer):
  **8 conversations → 32 sessions → 32 pairs kept, 30 train / 2 held out, 0
  dropped, mean input 541 chars, mean target 539 chars**, printed as numbers
  only. That is the rehearsal for the consented run, and it passes.
* **The loss arithmetic is verified without a GPU**
  (`tests/test_batching.py`): a batch must equal the mean of its examples, a
  perfectly predicted target must cost the stub's softmax floor, a shifted
  target must cost 5.35, and a left-padded example must keep its own labels.
  All pass. The training loss is computed by hand (see §3), so this is the check
  that it is the *right* hand-computation.

**Then it stopped, on this card.** The forward pass is fine and the training
step is not:

| What was run | Result |
| --- | --- |
| Base model, one real example, forward only, `no_grad` | **finite**: 3,315 tokens, embeddings and logits contain no non-finite value, cross-entropy **0.807** on a real target |
| Same, 220-token prefix | finite, loss 4.056 |
| `torch_chunk_gated_delta_rule` alone, synthetic inputs | finite in both **float32 and bfloat16** |
| Training, batch 1, **no padding**, batch-2/3 variants too | **loss NaN from the first step**, on every configuration tried |
| …with the triangular solve upcast to float32 (`--numerics solve`) | still NaN |
| …with the whole delta rule upcast to float32 (`--numerics rule`) | still NaN |
| …with padding removed (batch 1, so no mask and no pad token) | still NaN |
| Batched training, batch 4, left-padded, one sibling's model resident | `torch.OutOfMemoryError` at `optimizer.step()`: *0 bytes free* of 15.92 GiB, 8.51 GiB held by PyTorch and the rest by another process |

So the fault is in the **backward** path of the hybrid model's linear attention,
not in padding, not in the LM head, not in the loss (which the stub test pins),
and not in the dtype of the triangular solve. The forward of the same tensors is
finite; the first backward is not. Everything that makes it a *reproducible*
blocker rather than a guess is in the table above: four independent
configurations, all NaN, and one forward-only run that is clean.

Two things make this fixable, and neither was reachable inside this session's
GPU budget:

1. **`flash-linear-attention`** — transformers prints the warning itself:
   `chunk_gated_delta_rule` is falling back to its reference PyTorch
   implementation. The reference path is what is being differentiated. A Triton
   kernel path (or `causal_conv1d` for the convolution) is the intended one, and
   on ROCm Triton is already installed as a PyTorch dependency.
2. **Localising the NaN** — `torch.autograd.set_detect_anomaly(True)` with
   gradient checkpointing *off* would name the first op that produces it. That
   is one short run, and it should be the first thing the next session does.

**A cheaper route that sidesteps the whole question:** train the adapter on a
**non-hybrid** base of the same size. Qwen3.5's hybrid attention is what is
failing here; a plain transformer base (Qwen3-4B, or the 4B's own text-only
sibling if one exists) trains on this card with the same script and no
workaround, and the *pipeline* — dataset, filter, split, merge, GGUF import,
eval — is identical. That would answer "does training help at all" without
waiting on a kernel fix, and it is the run I would do next.

**What was priced, regardless.** Batch-1 training costs **13.5 s per example**
at a 3.6k-token sequence (24 examples in 324.5 s, the first probe), peak
**11.1 GB** of VRAM; the batched attempt reached **9.6 s per step** at batch 1
with the fp32 delta rule and **11.5 GB** peak at batch 2. The card is not the
limit — the reference linear-attention loop is: ~1,340 sequential kernel
launches per forward. A 400-pair, two-epoch run is therefore roughly
**2.5 hours** as the code stands, and **under 20 minutes** if the fused kernels
are installed, which is the second reason to install them.

**So: is the gain known? No — and this report will not pretend it is.** What is
known is that the exercise is cheap (minutes of GPU once the kernels are fused),
local, reversible, and that its data path and its safety filter both work.

## 3. Tooling on this hardware (RX 9070 XT, gfx1201, 16 GB, ROCm)

**What trains on this card today.** The machine has no system ROCm at all —
`/opt/rocm` and `rocminfo` are absent, as `docs/eval-reports/2026-09-22-gpu-acceleration.md`
already recorded; Ollama bundles its own runtime. That rules out the tooling
that expects a system ROCm install and points at the rest:

| Option | Verdict on this machine |
| --- | --- |
| **PyTorch ROCm wheels + `peft`** | **Used.** `torch 2.13.0+rocm7.1` from the ROCm wheel index is self-contained: it bundles the ROCm runtime, and `torch.cuda.is_available()` is true with `gcnArchName gfx1201`, capability `(12, 0)`, 15.9 GiB. bf16 matmul verified on the card before any training. |
| **Unsloth** | Would very likely work: it now supports RDNA4/gfx1201 on Linux with a ROCm ≥ 6.4 floor and publishes `rocm7.x` wheel tags. Not used here, because the base model is a *hybrid* architecture (three linear-attention layers per full-attention layer) whose fused kernels are exactly what Unsloth replaces, and a silent fallback would have been harder to see than to avoid. Worth trying next, for speed. |
| **Axolotl** | Supported on ROCm ≥ 6.2, but its AMD path assumes a system ROCm (which this machine does not have) and its ROCm fork is aimed at MI250/MI300. Not installed. |
| **torchtune** | Documented on ROCm 6.3+ and tested by AMD on MI300X. Consumer RDNA4 is outside what its docs claim, and it wants a system ROCm. Not installed. |
| **llama.cpp `convert_hf_to_gguf.py` + `llama-finetune`** | **Out, on evidence.** `convert_hf_to_gguf.py` at HEAD (2026-09-23) has *zero* mentions of the `qwen3_5` architecture, so it cannot convert this model at all; and its `finetune` example is a plain trainer without fused kernels. The GGUF route is therefore Ollama's own converter, which is also what made the shipped model. |

**What the installed environment is.**

- Python 3.12.14 (via `uv`): the system interpreter is 3.14, which no ROCm
  wheel supports yet.
- `torch 2.13.0+rocm7.1`, `transformers 5.17.0` (which does register
  `Qwen3_5ForConditionalGeneration`), `peft`, `accelerate`, `datasets`,
  `safetensors`.
- The venv lives at `~/.local/share/apunta/model-lab/venv`, with
  `tools/model-lab/.venv` a symlink to it. `/tmp` on this machine is a 16 GB
  tmpfs with a user quota, and the first install attempt died on it
  (`Disk quota exceeded`, os error 122) — venvs, weights and caches must live on
  `/home`, which is where the lab directory already is.
- Weights, adapters, merged models and datasets live under
  `~/.local/share/apunta/model-lab/` and are gitignored.

**Problems this hardware caused, and what was done about them.**

1. **The standard training loss OOMs.** Passing `labels` to the model asks for
   a logits tensor over every position: ~3.7k positions × a 151k vocabulary is
   a 3 GB allocation on a 16 GB card, and the first run died on it
   (`torch.OutOfMemoryError: Tried to allocate 3.07 GiB`, 13.23 GiB already
   allocated). Fixed by projecting the LM head over the answer tokens only
   (`logits_to_keep`), which is all the loss needs because the prompt is masked.
2. **Batch-1 training wastes the card.** Qwen3.5's linear-attention fallback in
   transformers runs a sequential Python loop over 64-token chunks — roughly 56
   iterations per linear layer, ~1,340 kernel launches per forward at a
   3.6k-token sequence. That is latency-bound, not compute-bound: the GPU reads
   ~50–64% busy while a single example takes **13.5 s**. Fixed by batching
   length-sorted examples (batch 4), which the measurements in §2 price.
3. **Nothing else broke.** No `HSA_OVERRIDE_GFX_VERSION`, no flash-attention
   override, no kernel compile failures: the ROCm wheel, the hybrid model, bf16
   and `peft`'s `all-linear` target all work on `gfx1201` as installed.

## 4. The real-data pipeline, designed for consent

The pipeline exists, is committed under `tools/model-lab/`, and runs with the
agent blind to content. Its stages, and the guarantee each one carries:

1. **`pipeline/build-pairs.ts`** reads the export through the M11 importer's own
   parsing (`openExport` → `liveThread` → `splitSessions` → `sessionBody`). A
   pair is (her messages in one session → Claude's **last** reply in that
   session): what she gave, and the note she kept. The prompt is assembled by
   production's own `buildGeneratePrompt` against her Progress-note sections, so
   the adapter learns the mapping the app actually asks for.
2. **The filter is `pipeline/grounding.ts`**, which is the eval scorer's checks
   applied to a pair rather than to a fixture: a novel diagnosis, risk or
   medication term (F7's lexicon, with the scorer's own abbreviation expansion),
   a gating conclusion marker (F6 core, with the scorer's exemption for a marker
   she used herself), or a figure the input never carried. A pair that fails is
   dropped and counted by reason. This is the answer to "would fine-tuning teach
   Claude's habits, including its inventions": the ones that invent are removed
   before training, and the count of what was removed is reported.
3. **The split** is deterministic (a hash of the prompt, 15% held out), so two
   runs agree and the held-out set is never trained on.
4. **Training** is `train_lora.py`, unchanged from the synthetic path.
5. **`merge_adapter.py`** merges the adapter into the base at bf16 and
   **`import-ollama.sh`** builds a Q4_K_M GGUF with the production model's own
   renderer, parser and parameters, so a difference in the eval is a difference
   in weights.
6. **`pipeline/evaluate-heldout.ts`** generates the note for every held-out pair
   and judges it with the same filter. **It prints metrics only** — counts,
   rates, reasons. No note, no source, no name, no excerpt reaches stdout.
7. **`pipeline/run-consented.sh`** chains all of it.

**Where the data lives.** Datasets (mode 0600), adapters and merged weights are
written only under `~/.local/share/apunta/model-lab/`, which is outside the
repository and inside the same home data directory as the database. Nothing is
committed, nothing is uploaded, and the export path itself is refused if it
resolves inside the repository.

**What is enforced in code, not in a comment.**

- `pipeline/guards.ts` refuses to run without `--i-have-consent`, refuses an
  input inside the repository, and refuses an output anywhere but the lab
  directory.
- `pipeline/guards.test.ts` proves it: it runs the real script with no flag and
  asserts a non-zero exit, the flag named in the message, and no file written;
  then with the flag and an in-repo output path, and asserts the same. Those two
  cases are the whole point — a guard in a function nobody calls is not a guard.
- The synthetic prototype needs none of this, and the guards are not on its path.

## 5. What she would be agreeing to

The consent text, in plain language, for `docs/decisions.md`. It is written to
be read by the therapist, not by an engineer.

> **Training a model on my own past notes**
>
> I understand that:
>
> 1. My past notes and my messages from the Claude export would be read by a
>    program on this computer, and only on this computer, to make training
>    examples out of them. Nothing is sent anywhere. There is no internet
>    connection in this step, and no one else — including the person who set it
>    up — has to read the text.
> 2. The examples are (what I wrote about a session → the note that came out of
>    it). Notes that state something my own words did not contain are dropped
>    before training, and I will be told how many were dropped and why, as
>    numbers.
> 3. The result is a small add-on file (an "adapter") for the existing local
>    model, stored in this computer's data folder with the same protection as my
>    database. It is not uploaded, not committed to the project's code, and not
>    shared.
> 4. The add-on is a *candidate*, not a change: the app keeps using the current
>    model until it is measured better on the project's own test notes, and I can
>    say no to it at any point.
> 5. I can have the add-on and the training examples deleted at any time, and
>    nothing in the app depends on them.
> 6. What is measured and reported back to me is numbers only: how often the
>    model added something my notes did not say, how many notes came back in the
>    right sections, how long training took. No note text is quoted in any
>    report.
> 7. This is a one-time decision for one run. A later run would need me to agree
>    again.
>
> Agreed: ______________________  Date: __________

The corresponding switch on the machine is `--i-have-consent`, and it is the
only thing that unlocks step 1.

## 6. Recommendation

1. **Do (a) retrieval first.** It is the cheapest option by an order of
   magnitude, it needs no consent she has not already given, it reuses
   `fitNotesNewestFirst` and `priorNoteBlock` unchanged, and the failure mode it
   can introduce (sentence bleed from an old note) already has two detectors in
   the repo. The drafting path is the one caller that does not use the patient's
   own notes yet, and that is a gap worth closing before anything is trained.
2. **Fix the two kernel problems, then finish the training measurement.**
   Install `flash-linear-attention` (and `causal_conv1d`), re-run the same
   `train_lora.py` on the same 400 synthetic pairs, and read the loss curve: if
   the first backward is finite, the run is under 20 minutes and the eval arms
   are another 20. If the NaN survives the fused kernels, run
   `torch.autograd.set_detect_anomaly(True)` with checkpointing off to name the
   op, and in parallel train the same adapter on a **non-hybrid** base — the
   pipeline is base-agnostic, and that comparison answers the actual question.
3. **Do not ask her to consent yet.** The consent text in §5 is ready, and the
   pipeline behind it is built, gated and rehearsed. But the synthetic
   prototype's effect on the metrics is *unmeasured* because the training step
   does not yet run on this card, and asking a therapist to hand over her notes
   for an unmeasured gain would be the wrong order. The trigger for asking is
   the first synthetic LoRA that completes a run and moves — or plainly does not
   move — the eval's numbers.
4. **If and when it does run, the run is one command and the answer is one
   number**: `pipeline/run-consented.sh --export <path> --i-have-consent`, then
   the held-out metrics, then a candidate adapter judged by the same gate as any
   other candidate. Anything that does not pass the gate is discarded; nothing
   in the app changes until it does.
5. **Do (c) later, and only after the app records it.** Preference tuning needs
   (draft, edited) pairs. The app does not keep the model's draft beside the
   note she saved, so the data for DPO does not exist yet. Recording it is a
   small change to the save path and a much better investment than trying to
   reconstruct preferences from note versions.
6. **Never (d).** A full fine-tune of a 4.7B needs the weights, the gradients
   and two AdamW moments — around 75 GB in bf16 with fp32 optimizer state, on a
   16 GB card — and continued pretraining needs a corpus three to five orders of
   magnitude larger than her notes. It is not a budget question; the data does
   not exist.

## Appendix: what was run

*Commands, seeds and artifact paths.*

Everything ran on the lab's own Ollama (`127.0.0.1:11437`,
`OLLAMA_NO_CLOUD=1`, `OLLAMA_KEEP_ALIVE=20s`, shared model store) and under
`flock /tmp/apunta-gpu.lock`, with `gpu-free.sh` before every hold and an
explicit `keep_alive: 0` unload before releasing it. The live app (`:7717`), the
live Ollama (`:11434`) and the live data directory were never touched; no
patient data of any kind was read, and the only export the pipeline ever saw was
the synthetic one it generated itself.

```sh
# the corpus
npx tsx tools/model-lab/synth/build-dataset.ts \
  --out ~/.local/share/apunta/model-lab/datasets/synth-400.jsonl --count 400 --seed 20260923
npx tsx tools/model-lab/synth/check-dataset.ts --data .../synth-400.jsonl      # 0 dropped

# the loss arithmetic, without a GPU
tools/model-lab/.venv/bin/python tools/model-lab/tests/test_batching.py

# the consented path, rehearsed on a synthetic export
npx tsx tools/model-lab/synth/make-synthetic-export.ts \
  --out /tmp/synth-export/conversations.json --conversations 8 --sessions 4 --seed 5
npx tsx tools/model-lab/pipeline/build-pairs.ts --i-have-consent \
  --export /tmp/synth-export --out ~/.local/share/apunta/model-lab/datasets/realpath-proof.jsonl

# where the training stopped
flock /tmp/apunta-gpu.lock bash -c 'tools/model-lab/gpu-free.sh 900 && \
  tools/model-lab/.venv/bin/python tools/model-lab/train_lora.py \
  --data .../synth-400.jsonl --out .../adapters/synth-lora \
  --epochs 1 --batch-size 1 --grad-accum 1 --max-steps 30 --numerics rule'

# the gates
npx vitest run --project model-lab     # 8 tests, including two that run the real script
```

Artifacts (all outside the repository, none committed): the corpus, the probe
adapters, `metrics.json` for each run, and the synthetic export, under
`~/.local/share/apunta/model-lab/`. The venv lives there too, with
`tools/model-lab/.venv` a symlink to it — `/tmp` is a 16 GB tmpfs on this
machine and the first install died on its quota.

**Environment as measured.** `torch 2.13.0+rocm7.1`, `transformers 5.17.0`,
`peft`, `accelerate`, `datasets`, Python 3.12.14, on `AMD Radeon Graphics`
(`gcnArchName gfx1201`), capability `(12, 0)`, 15.9 GiB. No system ROCm is
installed and none is needed: the wheel carries its own.
