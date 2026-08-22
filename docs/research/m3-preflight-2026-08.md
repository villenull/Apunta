# M3 pre-flight research — AI providers

**Written 2026-08-22.** Re-verification of `docs/research/local-ai-stack-2026-08.md`
and `docs/research/macos-setup-verification.md` §2 for the M3 agent. Nothing in
`/home/user/Patience` was modified.

## 0. Evidence levels and egress

Same tagging convention as `macos-setup-verification.md`:

- **[P]** — read from a primary page I fetched today.
- **[S]** — from search-engine snippets of a primary page I could not fetch;
  two or more independent snippets had to agree.
- **[U]** — **unverified.** A gap, not a fact.
- **[C]** — carried over from the existing research docs, not re-checked today.

**Egress this session:** `github.com` and `raw.githubusercontent.com` are
reachable (better than the previous spike). **`ollama.com`, `docs.ollama.com`,
`registry.ollama.ai`, `huggingface.co` and `zod.dev` are still blocked.** So:

- Every Ollama **issue/PR state** below is **[P]** — I read the GitHub pages today.
- Ollama's **own API docs** are **[P]** — the same `.mdx` files are mirrored in
  `ollama/ollama/docs/` on raw.githubusercontent.
- Every **model tag string and size** is still **[S]**. Unchanged from the
  previous spike's limitation. §2.5 of `macos-setup-verification.md` is still
  the thing to run on the real Mac.
- **zod behaviour is [P]** — read from the installed `node_modules/zod@4.4.3`
  source, which beats the docs site anyway.

---

## 1. Model picker table

### 1.1 The three tiers — status today

| Tier | Literal tag | Size | Quant | Ctx | Status today |
| --- | --- | --- | --- | --- | --- |
| ≥ 36GB | `qwen3.6:35b-a3b` | 24 GB | Q4_K_M | 256K | Tag still live **[S]**. ⚠️ see §1.4 — open `think`/`format` regression |
| 16–35GB (**default**) | `gemma4:12b-it-qat` | 7.2 GB | Q4_0 (Google QAT) | 256K | Tag still live, "published 2 months ago", text+image **[S]** |
| < 16GB | `qwen3.5:4b-q4_K_M` | 3.4 GB | Q4_K_M | 256K | Tag still live, digest `2a654d98e6fb`, "5 months ago" **[S]** |

**No tag has moved, been renamed, or disappeared.** All three still resolve.
Sizes and context windows match what `macos-setup-verification.md` §2.1
recorded. **Keep the PLAN §2 table exactly as it is.**

Sources (search snippets of blocked pages, today):
`https://ollama.com/library/gemma4:12b-it-qat`,
`https://ollama.com/library/qwen3.6:35b-a3b`,
`https://ollama.com/library/qwen3.5:4b-q4_K_M`.

### 1.2 `gemma4:latest` — re-confirmed, still a trap

`gemma4:latest` is **9.6 GB, 128K context, and is `gemma4:e4b`** — not 12B.
Re-confirmed today from independent snippets **[S]**
(`https://ollama.com/library/gemma4/tags`, `https://ollama.com/library/gemma4:e4b`).

PLAN §2's warning stands verbatim. **Pin explicit tags; never `:latest`,
never a bare family name.**

⚠️ Snippet quality on the neighbouring tags is poor and self-contradictory —
one search returned "gemma4:e2b is 7.2 GB", another "gemma4:e2b-it-qat is
4.3 GB". Do not encode any neighbouring-tag size as fact. Only the three tier
tags and the `latest`→`e4b` fact are cross-checked.

### 1.3 The MLX rejection list — **still required, and the regex is too narrow**

**ollama#16563 is STILL OPEN.** Verified today **[P]**
<https://github.com/ollama/ollama/issues/16563> — "Structured outputs appear to
be ignored for MLX models", opened 2026-06-06, assignee @dhiltgen, state
**Open**, no closing PR. The decision in `docs/decisions.md` that rests on it
**does not need revisiting**.

**PR #17929 (`mlxrunner: add structured output support`) was opened 2026-08-21
and is still OPEN / unmerged** as of today **[P]**
<https://github.com/ollama/ollama/pull/17929>. It is ~1 day old. Its own
description confirms the bug in the maintainers' words: the MLX engine
"accepted the API's `format` field but did not enforce it", so "requests asking
for JSON or a JSON Schema got unconstrained text". Two further facts from that
PR worth knowing:

- The fix uses **xgrammar** logit masking, and when the grammar library is
  unavailable, structured requests will **fail with an explicit error** rather
  than silently return invalid output. Good design; not merged yet.
- Constrained MLX decoding **disables speculative decoding**: measured
  ~32 tok/s constrained vs ~65 tok/s unconstrained on `qwen3.8:27b-mlx`. So
  even after the fix lands, MLX's speed advantage largely evaporates for our
  workload. **The performance argument for ever switching to MLX is weaker
  than the research doc implies.**

🔴 **New finding — the `/-(mlx|nvfp4)\b/` regex in the M3 packet is not
sufficient on its own.** The Ollama library now also ships `-mxfp8`, `-bf16`
and other safetensors/MLX-flavoured tags (e.g. `qwen3.6:35b-a3b-coding-mxfp8`,
`qwen3.8:27b-mlx`), and at least one secondary source states that "newer models
tagged nvfp4, bf16 use Apple's MLX framework directly" **[S]**. A name-based
denylist will always lag the naming.

**Recommended, strictly better check:** engine selection is driven by the
**weight format**, not the tag name — Ollama auto-detects GGUF → llama.cpp
(grammar-constrained sampling works) and safetensors/MLX → MLX runner **[S]**
(this closes gap #2 in `macos-setup-verification.md` §9 at snippet level).
And `GET /api/tags` already reports it **[P]**:

```json
{"models":[{"name":"gemma4:12b-it-qat","size":7200000000,
  "details":{"format":"gguf","family":"gemma4",
             "parameter_size":"11.9B","quantization_level":"Q4_0"}}]}
```

So the model picker should:

1. reject `/-(mlx|nvfp4|mxfp8|bf16)\b/` on the **name** (cheap, pre-pull), **and**
2. after the model is present, assert `details.format === 'gguf'` from
   `/api/tags` (authoritative, naming-independent) and refuse otherwise, **and**
3. still never trust `format` alone — always `JSON.parse` + zod re-validate.

Check 2 is new and I recommend adding it to the packet. **[U]**: I could not
confirm what `details.format` reads for an MLX model (`"safetensors"`? `"mlx"`?)
— so implement it as an **allowlist of `"gguf"`**, not a denylist of anything.

### 1.4 🔴 New since the previous research: the large tier has an open regression

**ollama#17871** — "qwen3.6 with `think: false` + `format` returns reasoning
serialized as JSON (`{"thought": ...}`) — regression 0.31.2 → 0.32.x".
Opened **2026-08-19**, state **Open**, labelled bug. Verified today **[P]**
<https://github.com/ollama/ollama/issues/17871>.

- Bisected: **0.31.2 correct on all 14 test documents; 0.32.14 deterministically
  wrong on 3 of 14.** Reporter used temperature 0, seed 42, `num_ctx` 32768.
- Failure shapes quoted in the issue: `{"thought": "The user has provided…"}`,
  `{"thought_process": [...]}`, and "truncated versions of the requested schema
  with missing fields".
- The reporter attributes it to the **Qwen renderer changes in 0.32.13–0.32.14**,
  which are the releases that added **Qwen 3.8** support **[P]**
  (<https://github.com/ollama/ollama/releases>).
- No maintainer response yet.

**Why this matters:** the current stable Ollama is **v0.32.15 (2026-08-19)**
**[P]**, i.e. the regression is in the version a user installs today, and
`qwen3.6:35b-a3b` is our ≥36GB tier model. The 2024 MacBook Pro in question
almost certainly lands on the `gemma4:12b-it-qat` default tier (M4 Max 36/48GB
configs are the only ones that reach the large tier), so **blast radius is
limited — but the M3 agent must not assume the large tier is as safe as the
default tier.** Put a `smoke:live` case on it and document the fallback
(omit `think` entirely on qwen3.6, eat the latency).

Also confirmed today **[P]**: Ollama **v0.33.0 (2026-08-21)** exists and is
still flagged **pre-release**. Do not install it.

### 1.5 New model families that appeared since the previous research (FYI, not a change)

- **`qwen3.8:27b`** — published mid-August 2026, 18 GB Q4_K_M, 256K ctx, 12
  variants including `-mlx` **[S]**. Landed in Ollama 0.32.12–0.32.14.
- `glm-4.7-flash` (19 GB, 198K), Nemotron 3.5 Lightning, Meta Muse Glimmer 30B **[S]**.
- **No Gemma 5.** Gemma 4 (April 2026) is still Google's current open family **[S]**.

**Recommendation: do not touch the tier table for these.** `qwen3.8:27b` is one
week old, is implicated (via its renderer work) in the #17871 regression, and at
18 GB does not fit the 16GB tier anyway. Note it in `docs/decisions.md` as
"considered and deferred to M7's eval harness" so a later agent doesn't
re-litigate it.

---

## 2. Exact request shape for a structured drafting call

### 2.1 Endpoint decision — **unchanged, and now better supported**

Use **`POST http://127.0.0.1:11434/api/chat`**. Verified today:

- **ollama#15288** (`/v1/chat/completions` returns empty `content` with all text
  in `reasoning`, no `think` support on the OpenAI endpoint) — opened
  2026-04-03, **CLOSED** **[P]** <https://github.com/ollama/ollama/issues/15288>.
  The documented workaround was exactly what we do: native `/api/chat` with
  `"think": false`.
- **ollama#15260** (`think=false` breaks `format` on gemma4) — opened
  2026-04-03, **CLOSED**, closed by **PR #15678 (merged 2026-04-21)** and #15392
  **[P]** <https://github.com/ollama/ollama/issues/15260>,
  <https://github.com/ollama/ollama/pull/15678>.
- **ollama#14645** — the same bug for the **qwen3.5 series**, opened 2026-03-05,
  **CLOSED** via **PR #15901** **[P]**
  <https://github.com/ollama/ollama/issues/14645>.

⚠️ **Read PR #15678's description carefully:** the fix "gates the format deferral
on the request's thinking setting: if thinking is disabled, the format is
applied from the first token instead" — but the implementation "was **scoped
specifically to gemma4** after reviewer feedback about model-specific behavior
variations" **[P]**. So this is a **per-model-family fix, not a general one**.
That is precisely why #17871 (qwen3.6) is a live regression while gemma4 is
fine. Do not generalise "it's fixed" across families.

🔵 **New reason to prefer `/api/chat` that the decisions.md row does not yet
record:** **ollama#17544**, opened 2026-08-03, **Open** **[P]**
<https://github.com/ollama/ollama/issues/17544> — "`/api/generate` silently
ignores think when format is set; `/api/chat` does not". Root cause per the
issue: `ChatHandler` implements the deferral of grammar application until
thinking finishes; `GenerateHandler` has no equivalent and passes `format`
straight through. **`/api/chat` is the only endpoint with thinking-aware format
handling.** This strengthens the existing decision — worth appending to the
"Why" column when M3 touches `docs/decisions.md`.

### 2.2 The request body (copy-pasteable)

Streaming is **NDJSON** (`application/x-ndjson`), not SSE, one JSON object per
line **[S]**/**[P]** (api.md shows the per-chunk objects).

```jsonc
POST http://127.0.0.1:11434/api/chat
Content-Type: application/json

{
  "model": "gemma4:12b-it-qat",
  "stream": true,
  "think": false,
  "keep_alive": "30m",

  "format": {
    "type": "object",
    "properties": {
      "Subjective": { "type": "string", "minLength": 1 },
      "Objective":  { "type": "string", "minLength": 1 },
      "Assessment": { "type": "string", "minLength": 1 },
      "Plan":       { "type": "string", "minLength": 1 }
    },
    "required": ["Subjective", "Objective", "Assessment", "Plan"],
    "additionalProperties": false
  },

  "options": {
    "temperature": 0,
    "num_ctx": 16384,
    "num_predict": 3072,
    "seed": 0,
    "repeat_penalty": 1.0
  },

  "messages": [
    { "role": "system", "content": "<format.instructions>\n\n<schema restatement>" },
    { "role": "user",   "content": "<transcript>\n\n<tail reminder of the key list>" }
  ]
}
```

Parameter-by-parameter, with why:

| Field | Value | Justification |
| --- | --- | --- |
| `format` | JSON-schema object | `/api/chat` accepts `"json"` or a JSON schema object **[P]** (`docs/capabilities/structured-outputs.mdx`). Ollama compiles it to a llama.cpp GBNF grammar. |
| `stream` | `true` | Defaults to `true` anyway **[P]**; be explicit. Response is NDJSON. |
| `think` | `false` | Suppresses the reasoning pass. **Gate this** — see §3-K: a non-thinking model returns HTTP 400 for a top-level `think`. |
| `keep_alive` | `"30m"` | Default is `5m` **[P]**. A therapist writing three notes an hour would pay the cold-load cost every time. Make it a setting. |
| `options.temperature` | `0` | Ollama's own structured-outputs doc: "Lower the temperature (e.g., set it to `0`) for more deterministic completions" **[P]**. |
| `options.num_ctx` | `16384` | **Mandatory.** See §3-E. |
| `options.num_predict` | `3072` | Default is `-1` (unbounded) **[S]**. A hard ceiling is the only thing that bounds the #15502 repetition loop (§3-G) — without it a degenerate generation runs until the context fills. |
| `options.seed` | `0` | Reproducibility for `smoke:live` and the M7 eval harness. |
| `options.repeat_penalty` | `1.0` | Ollama **changed the default `repeat_penalty` in v0.32.10** **[P]** (release notes). A repetition penalty over constrained JSON penalises the structural tokens (`"`, `:`, `,`) and the repeated section-name tokens. Neutralise it. ⚠️ judgement call — #15502 reports penalties 1.0/1.15/1.5 all failed identically, so this is hygiene, not a fix. |

**Message roles.** Ollama accepts `system` / `user` / `assistant` / `tool`
**[P]**. Put `instructions` + schema restatement in **`system`**, transcript in
**`user`**. But see the truncation trick in §5.

**Do NOT put `think` inside `options`.** A third-party issue claims
`options: {think: "low"}` works universally; that is **[U]** and contradicts
Ollama's own documented top-level `think` parameter **[P]**. Use the documented
top-level field and handle the 400 (§3-K).

### 2.3 Response shapes to parse

Streaming chunk (one per line):

```json
{"model":"gemma4:12b-it-qat","created_at":"…","message":{"role":"assistant","content":"{\"Sub"},"done":false}
```

Final chunk:

```json
{"model":"gemma4:12b-it-qat","created_at":"…",
 "message":{"role":"assistant","content":""},
 "done":true,"done_reason":"stop",
 "total_duration":4883583458,"load_duration":1334875,
 "prompt_eval_count":26,"prompt_eval_duration":342546000,
 "eval_count":282,"eval_duration":4535599000}
```

**[P]** `docs/api.md`. With `think` enabled the reasoning arrives in
`message.thinking` (chat endpoint) while `message.content` holds the answer
**[P]** (`docs/capabilities/thinking.mdx`).

Fields M3 must keep from the final chunk: `done_reason`, `prompt_eval_count`,
`eval_count`, `total_duration`, `eval_duration` (the last two give the
tokens/sec the packet asks `smoke:live` to print:
`eval_count / (eval_duration / 1e9)`).

### 2.4 What structured output does to the streaming UX — read this before writing deliverable #7

🔴 **With `format` set, the token stream is raw JSON, not prose.** The first
tokens on the wire are `{`, `"Sub`, `jective`, `":`, `"`. The M3 packet's
deliverable 7 ("streaming draft preview") and the Playwright criterion
("typed capture now shows streaming text before landing on the workspace
draft") cannot just render `content` verbatim — the therapist would watch
escaped JSON scroll past.

Three options for the M3 agent, in my order of preference:

1. **Incremental partial-JSON extraction in the provider.** Accumulate the raw
   buffer; on each chunk, run a tiny tolerant scanner that finds
   `"<SectionName>"\s*:\s*"` and emits the decoded string content up to the last
   complete escape. Emit SSE `token` events carrying `{section, text}` rather
   than opaque text. The UI then renders a live `Section: body` preview. This is
   ~60 lines and unit-testable with a table of truncated buffers.
2. **Emit `token` events with the raw JSON but have the web client render only
   the decoded prefix.** Same work, wrong layer — the parsing belongs in
   `server/src/ai/`, where the fake provider can mirror it.
3. **Don't stream the draft; stream a status.** Simplest, but it loses the
   prototype's feel and contradicts the packet.

Whichever is chosen, `FakeLlmProvider` must emit the **same event shape**, or
the Playwright test proves nothing about the real path. I'd add a line to
`docs/decisions.md` for this.

---

## 3. Failure modes and the detection check for each

This is the section the app's reliability guarantee rests on. Each row is a
real, sourced failure, not a hypothetical.

### A. Structured output silently not enforced (MLX engine) — ollama#16563, **OPEN**

**What it looks like:** HTTP 200, `done_reason: "stop"`, and `message.content`
is *prose or fenced markdown*, not JSON. The #17013 reporter's words: the
response "begins with markdown formatting and invented JSON keys, violating
`additionalProperties: false`", and "there is **no signal** to fall back or
post-validate" **[C, P in prior doc]**.

**Detection:**
1. Pre-flight, at model selection: name regex `/-(mlx|nvfp4|mxfp8|bf16)\b/` →
   refuse with an explanation.
2. Pre-flight, at first use: `GET /api/tags` → `details.format === 'gguf'`
   allowlist. Refuse otherwise. (**[U]** on the exact non-GGUF string — hence
   allowlist.)
3. Post-hoc, every call: strip a leading ```` ```json ```` fence if present,
   `JSON.parse`, then zod. A fence in the output is itself proof the grammar
   was not applied — **log that distinctly**, because it tells the user
   "your model is not enforcing the schema" rather than "the model wrote a bad
   note".

### B. Grammar bypassed, valid JSON with the wrong keys — ollama#17871, **OPEN**, qwen3.6, current stable

**What it looks like:** HTTP 200, parseable JSON, but the object is
`{"thought": "The user has provided a large text excerpt…"}` or
`{"thought_process": [...]}`, or a "truncated version of the requested schema
with missing fields" **[P]**.

**Detection:** zod on a **`strictObject`** catches both shapes — unknown key
`thought` fails, and a missing required section fails. The concrete check to
write:

```ts
const parsed = schema.safeParse(json);
if (!parsed.success) {
  const got = Object.keys(json ?? {});
  const want = format.sections;
  // exact-set comparison gives a far better error message than zod's
  //   "Unrecognized key: thought" for a user who is not a programmer.
}
```

Surface it as *"the AI returned something that wasn't a note"*, not as a stack
trace. And note the diagnostic value: **if `additionalProperties:false` was in
the `format` payload and an extra key still came back, the grammar was not
applied.** That distinction should drive the retry choice (§3-M).

### C. `think:false` drops the format constraint — ollama#15260 / #14645, CLOSED but family-scoped

**What it looks like:** plain prose, indistinguishable from A at the wire level.
Occurs only when `think:false` is sent. Fixed for gemma4 (#15678) and qwen3.5
(#15901); **not generally**, and #17871 is the same shape re-appearing on
qwen3.6.

**Detection:** identical to A. **Distinguisher and remedy:** on the retry,
**omit `think` entirely** and re-issue. If attempt-2-without-`think` produces
valid JSON where attempt-1-with-`think:false` produced prose, you have hit this
bug — log it with the model name so `smoke:live` output is actionable.

### D. Empty `content`, everything stranded in reasoning — ollama#15288 (CLOSED, `/v1`), ollama#15428 (gemma4:26b, closed "needs more info")

**What it looks like:** #15428's exact numbers **[P]**: `"content": ""`,
`"done_reason": "stop"`, `eval_count` 49, against `prompt_eval_count` 1423 —
i.e. the model consumed a big prompt and emitted almost nothing. Triggered on
gemma4:26b MoE by **system prompts over ~500 characters**; worked under ~200.
gemma4:31b and e4b were unaffected; **12b was never tested** in the issue.

⚠️ **Our system prompt is ~4–5K tokens** (the note-instructions files are
6.7–7.9 KB each). We are far past that threshold. The default tier is a
different model to the one that failed, but this is exactly the shape to watch.

**Detection (three cheap assertions on the final frame):**
```ts
if (accumulated.trim() === '')                 -> 'empty_response'
if (accumulated.trim() === '' && thinking)     -> 'reasoning_only'
if (final.eval_count < 20)                     -> 'truncated_or_empty'
```
`eval_count < 20` is a good tripwire: a real note is hundreds of tokens.

### E. Truncated `num_ctx` — silent, and it eats the *instructions*, not the transcript

**Ollama's documented default context is VRAM-dependent** **[P]**
(`docs/context-length.mdx`, verbatim): *"Ollama defaults to the following
context lengths based on VRAM: < 24 GiB VRAM: 4k context, 24-48 GiB VRAM: 32k
context, >= 48 GiB VRAM: 256k context"*. On a 16GB Mac, Metal's ~75% cap puts
usable VRAM near 12 GiB → **4K default**. Our system prompt alone exceeds that.
This corrects PLAN §2's phrasing (the *reason* changed, the *advice* did not) —
`macos-setup-verification.md` §7.7 already flagged it and is right.

**What truncation looks like:** HTTP 200, normal `done_reason`, a fluent answer.
Nothing in the response says anything was dropped. **The truncation keeps the
tail and discards the head** **[S]** — so the *system prompt with the
anti-fabrication rules and the schema restatement is the first thing to go*,
while the transcript survives. That is the worst possible ordering for this
app: the model keeps the patient material and loses the instruction not to
invent.

**ollama#14259** ("Chat history and embedding truncation happens silently with
no user-visible indication"), opened 2026-02-14, is **Open** **[P]**
<https://github.com/ollama/ollama/issues/14259>, and the proposed fix is
explicitly **logging-only, no API field**. So there will be no server-side
signal. Client-side detection is the only option.

**Detection:**
```ts
const NUM_CTX = 16384;
// 1. before sending: refuse rather than truncate
const approxTokens = Math.ceil((system.length + user.length) / 3.5);
if (approxTokens > NUM_CTX * 0.75) -> typed error 'transcript_too_long'
// 2. after: the tripwire
if (final.prompt_eval_count >= NUM_CTX - 16) -> typed error 'context_overflow'
```
A `prompt_eval_count` sitting flush against `num_ctx` is the canonical
truncation fingerprint **[S]**. Log `prompt_eval_count` on every call regardless
— it is free and it is the only observability you get.

**Memory note:** Homebrew's `ollama` service sets `OLLAMA_KV_CACHE_TYPE=q8_0`
**[C, P in prior doc]**, which roughly halves KV-cache cost and is what makes
16K affordable on a 16GB Mac. Don't undo it. Ollama's own docs suggest ≥64000
tokens for large-context work **[P]** — resist; the memory cost is linear and
16K comfortably holds an hour of dictation.

### F. Output truncation (JSON cut off mid-string)

**What it looks like:** `done_reason: "length"` **[S]** and/or a `JSON.parse`
failure on an unterminated object. Caused by `num_predict` or by the context
filling.

**Detection:** check `done_reason` **explicitly before parsing** — it gives a
far better error than a `SyntaxError`:
```ts
if (final.done_reason === 'length') -> 'output_truncated'
```

### G. Repetition loop under grammar-constrained free-text — ollama#15502, **OPEN**

🔴 **This is the failure mode that most precisely matches our schema.**
<https://github.com/ollama/ollama/issues/15502> **[P]**, opened 2026-04-11,
state **Open**, no maintainer response. Title: *"gemma4:31b repetition loop
during constrained JSON generation with free-text string fields"*.

Three conditions must hold simultaneously — and **all three hold for us**:
constrained JSON via `format`; a schema containing **free-text string fields**
(multi-sentence descriptions); grammar-rule constraint. Failure rate **60–100%
across 39 trials**. Output quoted in the issue:
`"amber own own own own own own…"` repeated 300+ times until the token budget
ran out, leaving the JSON unterminated.

Scope: **gemma4:31b (dense) affected; gemma4:26b (MoE) and gemma3:27b not
affected; gemma4:12b never tested.** Ollama 0.20.5 (old). `repeat_penalty` at
1.0 / 1.15 / 1.5 made **no difference** — same seeds failed identically.

**The one encouraging cross-reference:** the issue says disabling thinking
"eliminates repetition but breaks format constraint entirely (#15260)". #15260
is now **fixed for gemma4** (PR #15678, merged 2026-04-21). So on current
Ollama, **`think:false` + `format` on gemma4 may be both correct *and* the
mitigation for #15502**. That is a hypothesis, not a fact — **[U]** — and it is
the single highest-value thing for `smoke:live` to prove.

**Detection:** you cannot rely on the JSON parse alone (a loop that gets closed
by the grammar produces *valid* JSON full of garbage). Add a cheap heuristic
over each section body before persisting:
```ts
// same token 8+ times consecutively, or one token > 30% of the body
function looksDegenerate(body: string): boolean
```
Combined with `done_reason === 'length'`, this catches both the terminated and
unterminated variants. Treat it as a validation failure and take the retry path.

**Do NOT add `maxLength` to the schema to bound it.** A grammar-level
`maxLength` forces the model to close the JSON at the cap, converting an
obviously-broken output into a *valid-looking* one. Bound with `num_predict`
(where it surfaces as `done_reason: "length"`) instead.

### H. Model not pulled

**What it looks like:** **HTTP 404**, body `{"error": "model '<name>' not found"}`
— read verbatim from `server/routes.go` today **[P]**
(`gin.H{"error": "model '%s' not found"}`, `http.StatusNotFound`). Note the
older, widely-quoted suffix *"try pulling it first"* is **not** in the current
source; match on the status code and `/not found/`, never on the full string.

**Detection:** pre-flight via `GET /api/tags` (health already does this per
PLAN §4 — `ollama.modelPresent`); at call time, map 404 → user-facing
*"Apunta's AI model isn't installed yet — run the setup script"*.

### I. Ollama not running

**What it looks like:** `fetch` rejects. Under Node 22/undici the error is
`TypeError: fetch failed` with `cause.code === 'ECONNREFUSED'` — the message
itself is useless to a user.

**Detection:** catch, inspect `err.cause?.code` for
`ECONNREFUSED` / `ECONNRESET` / `UND_ERR_CONNECT_TIMEOUT`, map to
*"Apunta can't reach the local AI — see Setup"* (the exact banner copy in M3
deliverable #8). This is also the path the packet's acceptance criterion
exercises by pointing the provider at a dead localhost port.

### J. Out of memory / model won't load

**What it looks like:** the chat handler surfaces the llm layer's error as
**HTTP 500** with `gin.H{"error": "…"}` **[P]** — `routes.go` handles runtime
OOM generically via `expireRunnersForRuntimeOOM()` and the human-readable text
comes from the llm layer, so **the exact string is [U]**. The widely reported
form is *"model requires more system memory (X GiB) than is available (Y GiB)"*
**[S]**. On Apple Silicon this is the 24GB-model-on-a-32GB-Mac case that moved
the tier boundary to 36GB.

**Detection:** 500 + `/memory|allocat|out of memory|OOM/i` on the error text →
typed `insufficient_memory` error whose message names the configured model and
suggests the next tier down. **Also cover the non-error variant:** a model that
is loading (or thrashing) simply produces *no bytes* for a long time. Use a
**separate first-byte timeout (~120s) from the overall timeout**, and emit an
SSE `status` event ("loading model…") so the UI does not look frozen.
`load_duration` in the final frame tells you afterwards whether you paid a cold
load.

### K. `think` sent to a model that doesn't support thinking

**What it looks like:** **HTTP 400**, `{"error": "\"<model>\" does not support
thinking"}` — read from `routes.go` today **[P]**
(`gin.H{"error": "%q does not support thinking"}`, `http.StatusBadRequest`).
Confirmed independently by several downstream integrations hitting it **[S]**.
Sibling errors in the same handler: `%q does not support chat`,
`%q does not support generate`.

This will bite the moment a user overrides `llm_model` in Settings with a
non-thinking GGUF.

**Detection / avoidance:** `POST /api/show` returns a **`capabilities` array**
**[P]** (`docs/api.md`), whose values include `"completion"`, `"vision"`,
`"tools"` and `"thinking"` **[S]** (added by ollama PR #10066). Probe it once
per model, cache it, and only send top-level `think` when `"thinking"` is
present. Belt and braces: on a 400 matching `/does not support thinking/`,
retry once with `think` omitted.

### L. Cold-load latency (not a bug, but it will be reported as one)

First token after a cold start is tens of seconds on a 7.2 GB model; Ollama
sends nothing until the model is resident. `keep_alive: "30m"` and an optional
warm-up call at server boot both help. `load_duration` distinguishes it from a
hang after the fact.

### M. Suggested retry ladder (satisfies the packet's "one automatic retry")

```
1. think:false + format            → parse + zod
2. on failure: same call + an extra user turn carrying the validation error
                                   → parse + zod          [the packet's retry]
3. on failure AND the diagnosis is C/B (grammar looks unapplied):
   omit `think` entirely, format kept
                                   → parse + zod          [documented workaround]
4. typed error, surfaced as an SSE `error` event
```
Step 3 is a deviation from the packet's "one automatic retry, then a typed
error" — it is cheap and it is the documented workaround for two separate live
bugs. If the M3 agent adopts it, log it in `docs/decisions.md`; if not, at least
put it behind `smoke:live` so the owner can diagnose by hand.

---

## 4. Proposed zod schema + the JSON schema that goes in `format`

The repo is on **zod 4.4.3** **[P]** (`node_modules/zod/package.json`;
`shared/src/common.ts` already uses `z.uuid()` / `z.iso.datetime()`, both v4
idioms). That matters: v4 has `z.toJSONSchema`.

### 4.1 Sections schema (`shared/`, per packet deliverable 2)

```ts
import { z } from 'zod';

/** A section body is never empty: the instructions define the fallback
 *  sentence "Not addressed in this dictation." for an unaddressed section,
 *  so a required non-empty string is the correct constraint. */
export const MAX_SECTION_CHARS = 20_000;

export function buildSectionsSchema(sections: readonly string[]) {
  const shape: Record<string, z.ZodString> = {};
  for (const name of sections) {
    shape[name] = z.string().min(1).max(MAX_SECTION_CHARS);
  }
  return z.strictObject(shape);   // strict → additionalProperties:false
}
export type Sections = Record<string, string>;
```

Two deliberate choices:

- **`z.strictObject`, not `z.object`.** From the installed zod source **[P]**
  (`zod/v4/core/json-schema-processors.js`, `objectProcessor`):
  `strictObject` (catchall `never`) always emits `additionalProperties: false`;
  a plain `z.object` emits it **only when `io === "output"`**. `io` defaults to
  `"output"` so a plain object happens to work today — but the guarantee is
  incidental. Make it explicit.
- **No `.trim()` inside the schema.** In zod v4 `.trim()` is an overwrite/
  transform-flavoured check; keeping the validation schema transform-free keeps
  the zod→JSON-Schema mapping boring. Trim in the serializer instead.

### 4.2 The JSON schema for `format` — **build it by hand**

```ts
export function sectionsJsonSchema(sections: readonly string[]) {
  return {
    type: 'object',
    properties: Object.fromEntries(
      sections.map((name) => [name, { type: 'string', minLength: 1 }]),
    ),
    required: [...sections],
    additionalProperties: false,
  } as const;
}
```

**Why hand-built rather than `z.toJSONSchema(buildSectionsSchema(sections))`:**

1. `z.toJSONSchema` injects a **`$schema` key** — confirmed in the installed
   source **[P]** (`to-json-schema.js` sets
   `result.$schema = "https://json-schema.org/draft/2020-12/schema"` by
   default). llama.cpp's converter would silently skip it, but it is noise in a
   payload we want to be able to eyeball.
2. llama.cpp's converter **"skips unsupported features silently"** and has
   **broken nested `$ref`s** — verbatim from
   <https://raw.githubusercontent.com/ggml-org/llama.cpp/master/grammars/README.md>
   **[P]**. `toJSONSchema` will emit `$defs`/`$ref` for any reused sub-schema
   (`reused: 'inline'` avoids it, but that is a footgun waiting for the next
   agent).
3. The hand-built object is six lines and is exactly what we want to appear in
   a snapshot test.

**Keep both and assert they agree**, so drift is caught:

```ts
it('hand-built JSON schema matches the zod-derived one', () => {
  const { $schema, ...derived } = z.toJSONSchema(buildSectionsSchema(S));
  expect(derived).toEqual(sectionsJsonSchema(S));
});
```

**Keyword support**, verified today against llama.cpp's grammar README **[P]**:
`type`, `properties`, `required`, `additionalProperties`, `minLength`,
`maxLength`, `pattern` (must be `^…$`-anchored), `enum`, `const`, `anyOf`,
`oneOf`, `items`, `minItems`/`maxItems`, `$ref`/`$defs` (top-level only) are
supported. Silently ignored: `uniqueItems`, `contains`, `not`,
`if`/`then`/`else`, `patternProperties`, `$anchor`. `prefixItems` is broken.
Also note llama.cpp **defaults to no additional properties anyway** — "The JSON
schemas spec states objects accept additional properties by default. Since this
is slow and seems prone to hallucinations, we default to no additional
properties." So `additionalProperties: false` is belt-and-braces on the
llama.cpp path and, more importantly, is what our own zod check enforces.

### 4.3 `refineNote` schema (PLAN §5)

```ts
export function buildRefineSchema(sections: readonly string[]) {
  return z.strictObject({
    reply: z.string().min(1).max(10_000),
    updatedSections: buildSectionsSchema(sections).nullable(),
  });
}
```

JSON schema — inline the null branch rather than letting zod emit a `$ref`:

```jsonc
{
  "type": "object",
  "properties": {
    "reply": { "type": "string", "minLength": 1 },
    "updatedSections": {
      "anyOf": [
        { "type": "object", "properties": { /* …sections… */ },
          "required": [ /* …sections… */ ], "additionalProperties": false },
        { "type": "null" }
      ]
    }
  },
  "required": ["reply", "updatedSections"],
  "additionalProperties": false
}
```

⚠️ `updatedSections` must be in `required` **and** nullable, not optional — a
grammar cannot express "may be absent" as cleanly as "must be present, may be
null", and it removes an ambiguity the server would otherwise have to guess at.
The published-lock stays server-side per PLAN §5 regardless of what comes back.

### 4.4 `detectFormat` schema (M6, implemented now)

```ts
export const DetectedFormatSchema = z.strictObject({
  name: z.string().min(1).max(120),
  sections: z.array(z.string().min(1).max(120)).min(1).max(40),
});
```
JSON schema mirrors it with `minItems: 1`, `maxItems: 40`. Then re-validate the
result through the existing `SectionsSchema` in `shared/src/note-format.ts`,
which additionally enforces **case-insensitive uniqueness** — a duplicate
section name would collapse two JSON keys into one and silently lose a section.

### 4.5 🔴 The schema is invisible to the model

`format` constrains *sampling*; it is **never shown to the model**. Ollama's own
structured-outputs doc says so in the imperative **[P]**: *"It is ideal to also
pass the JSON schema as a string in the prompt to ground the model's response."*
PLAN §2 and §5 already require this. Concretely, the restatement must carry
what the schema cannot:

- the **exact key strings**, in order (emit them via `JSON.stringify(name)` so a
  section name containing a quote or a colon survives);
- that **every key is required** and that an unaddressed section takes the
  fixed fallback sentence rather than an empty string;
- that values are **plain prose** — no markdown, no bullets, no repetition of
  the section name inside the body (the style rules in
  `docs/note-instructions/` already say this; the restatement should not
  contradict them);
- that **no other key may appear**.

Without it, a grammar-constrained model produces structurally valid JSON whose
*content* is misfiled — the failure the schema cannot see.

---

## 5. Prompt assembly sketch

```
┌─ system ────────────────────────────────────────────────────────────┐
│ 1. format.instructions                                              │
│      — verbatim from note_formats.instructions, or the default from │
│        server/src/ai/default-instructions.ts (ported from           │
│        docs/note-instructions/*.md).                                │
│      — these files already open with the role framing               │
│        ("You are drafting a clinical progress note for a licensed   │
│        therapist…"), so prompts.ts must NOT prepend another one.    │
│                                                                     │
│ 2. "## Output format"  (generated from the section list)            │
│      Return one JSON object and nothing else. It must have exactly  │
│      these keys, in this order:                                     │
│        "Subjective", "Objective", "Assessment", "Plan"              │
│      Every key is required. Each value is that section's body as    │
│      plain prose. Do not add any other key. Do not use markdown.    │
│      Do not repeat the section name inside its value.               │
│      If a section has no material, its value is exactly:            │
│        "Not addressed in this dictation."                           │
└─────────────────────────────────────────────────────────────────────┘
┌─ user ──────────────────────────────────────────────────────────────┐
│ 3. "Dictation:\n\n" + transcript                                    │
│ 4. one-line tail reminder:                                          │
│      Reply with a single JSON object with exactly the keys          │
│      "Subjective", "Objective", "Assessment", "Plan".               │
└─────────────────────────────────────────────────────────────────────┘
```

**Why the reminder is duplicated at the tail (4).** Ollama truncates from the
**head** when the prompt exceeds `num_ctx` (§3-E). The system prompt is the
head. A short restatement at the very end of the user message is the only part
of the contract guaranteed to survive a truncation event. It costs ~30 tokens.

**Few-shot examples — a conflict with the packet, decide deliberately.** M3
deliverable 3 says the system prompt should include "one few-shot example". But
`docs/note-instructions/progress-note-instructions.md` and
`intake-note-instructions.md` **already contain two dictation→JSON example pairs
each**, and `rationale.md` §"What I expect to matter most" ranks those two pairs
as the **single highest-impact element** of the instructions, with the second
pair deliberately demonstrating the empty-section fallback. Appending another
example in `prompts.ts` would (a) duplicate, (b) blow the ~4–5K-token budget the
research doc warns small models drift past, and (c) risk contradicting the
authored examples.

**Recommendation:** `prompts.ts` contributes the **schema restatement only**;
few-shot examples are the *format's* responsibility and live in `instructions`.
For a user-authored format with no examples, the grammar plus the restatement
carries the structure. Log this as a deviation in `docs/decisions.md`.

**Refine prompt** reuses (1) + a refine-specific (2) describing
`{reply, updatedSections}`, plus the current note text and the chat history.
`rationale.md` explicitly anticipates this: the same per-format instructions are
sent, "the faithfulness and section-content rules carry over unchanged", and the
chat behaviour (answering without editing, the published-lock) is
"server and prompt-builder policy, not format policy".

**Snapshot tests** (packet deliverable 5) should cover: default progress
format; default intake format; a custom 7-section format; a format with an empty
`instructions` string (falls back to default); and a section name containing a
quote or a colon.

**Serializers.** `sectionsToText` → `${name}: ${body}` joined by `\n\n`,
matching `server/src/seed.ts`'s `PROGRESS_NOTE_AUG_8` exactly. `textToSections`
must anchor on **known section names at the start of a line** — a body can
legitimately contain "Plan: continue weekly", so a naive `/^(\w+):/` split will
shred notes. Round-trip property test: `textToSections(sectionsToText(s)) === s`
for any sections object whose bodies contain no leading-line section name.

---

## 6. Open questions and risks, ranked

1. 🔴 **Is `gemma4:12b-it-qat` subject to the #15502 constrained-JSON repetition
   loop?** It is the default on the target Mac, our schema hits all three
   trigger conditions (constrained JSON + free-text string fields + grammar),
   and the issue never tested 12B. If it reproduces, M3's core flow produces
   garbage 60–100% of the time on the owner's machine. **First thing
   `smoke:live` should prove**, with a long realistic dictation, not a toy
   prompt. The plausible mitigation (`think:false`, now fixed for gemma4 by
   #15678) needs to be verified, not assumed.
2. 🔴 **Does `format` actually constrain sampling on the real Mac?** Everything
   in PLAN §5 rests on it and the MLX engine is the *default* flavour on Apple
   Silicon. Run `macos-setup-verification.md` §2.5's one-liner against the
   installed model before anything else, and add the `details.format === 'gguf'`
   assertion (§1.3) as a permanent guard.
3. 🟠 **Streaming a JSON-constrained response to a human-readable preview**
   (§2.4). This is a real design decision inside deliverable #7 that the packet
   does not acknowledge, and it must be mirrored in `FakeLlmProvider` or the
   Playwright criterion tests nothing.
4. 🟠 **The large tier is on an open regression (#17871) in current stable
   Ollama.** Low blast radius (target Mac probably lands on the 12B default) but
   it must not be discovered by the owner. Cover it in `smoke:live`; document
   "omit `think` on qwen3.6" as the fallback.
5. 🟠 **A ~5K-token system prompt on a 4K-default context.** `num_ctx: 16384`
   fixes it, but the failure when someone forgets is silent and drops precisely
   the anti-fabrication rules (§3-E). The `prompt_eval_count` tripwire is
   non-negotiable.
6. 🟡 **Capability probing for `think`.** Sending top-level `think` to a
   non-thinking model is a hard 400 (§3-K). Trivial to handle, easy to forget,
   and it fires the first time a user overrides `llm_model`.
7. 🟡 **Few-shot duplication** (§5) — a genuine conflict between the packet text
   and the authored instruction files. Needs a decision and a
   `docs/decisions.md` row, not a silent choice.
8. 🟡 **`details.format` value for MLX models is [U]** — implement as a
   `'gguf'` allowlist, and have the live smoke script print the value so the
   gap closes on first run.
9. 🟢 **Ollama's OOM error string is [U]** (§3-J). Match on status 500 + a
   permissive regex, and capture the raw text in the log so M7 can tighten it.
10. 🟢 **`qwen3.8:27b` exists and is one week old.** Deliberately out of scope
    for M3; record it as deferred so M7's eval harness can consider it.

---

## 7. What changed since the previous research, in one place

| Claim in existing docs | Status today |
| --- | --- |
| ollama#16563 (MLX ignores `format`) open | ✅ **still open**, PR #17929 opened 2026-08-21, unmerged. Decision stands. |
| ollama#15288 (`/v1` empty content) closed | ✅ still closed |
| ollama#15260 (`think:false` breaks `format`) closed via #15678/#15392 | ✅ closed — but the fix was **scoped to gemma4 only** |
| Prefer `/api/chat` over `/v1/chat/completions` | ✅ still right, **and now also over `/api/generate`** (#17544, open) |
| Three tier tags valid | ✅ all three still resolve, same sizes |
| `gemma4:latest` → E4B, not 12B | ✅ re-confirmed (9.6 GB, 128K) |
| Ollama stable 0.32.15, 0.33.0 pre-release | ✅ unchanged (0.32.15 is 2026-08-19) |
| "Ollama's 4096 default silently truncates" | ⚠️ default is **VRAM-dependent** (4k under 24 GiB); advice unchanged, reason corrected — matches §7.7 of the setup-verification doc |
| Reject `/-(mlx\|nvfp4)\b/` | ⚠️ **insufficient alone** — add `mxfp8`/`bf16` and, better, a `details.format === 'gguf'` allowlist |
| GGUF tags route to llama.cpp (was **[U]**) | ⬆️ upgraded to **[S]** — Ollama auto-detects format; GGUF → llama.cpp, safetensors/MLX → MLX runner |
| — | 🆕 **#17871**: qwen3.6 + `think:false` + `format` regression in 0.32.x, **open** |
| — | 🆕 **#15502**: constrained-JSON repetition loop with free-text fields, **open** — matches our schema shape exactly |
| — | 🆕 **#14259**: silent truncation will stay silent (logging-only fix), **open** |
| — | 🆕 `qwen3.8:27b` (mid-Aug 2026), `glm-4.7-flash`, Muse Glimmer, Nemotron 3.5 in the library. No Gemma 5. |

---

## 8. Sources

Fetched and read today (2026-08-22) — **[P]**:

- <https://github.com/ollama/ollama/issues/16563> — MLX ignores `format`. Open.
- <https://github.com/ollama/ollama/pull/17929> — `mlxrunner: add structured output support`. Open, 2026-08-21.
- <https://github.com/ollama/ollama/issues/17871> — qwen3.6 `think:false`+`format` regression. Open, 2026-08-19.
- <https://github.com/ollama/ollama/issues/17544> — `/api/generate` ignores think when format set. Open, 2026-08-03.
- <https://github.com/ollama/ollama/issues/15502> — constrained-JSON repetition loop. Open, 2026-04-11.
- <https://github.com/ollama/ollama/issues/15576> — gemma4 26b/31b structured output. Open, 2026-04-14.
- <https://github.com/ollama/ollama/issues/15428> — gemma4:26b empty response on long system prompts. Closed, 2026-04-08.
- <https://github.com/ollama/ollama/issues/15288> — `/v1` empty content. Closed, 2026-04-03.
- <https://github.com/ollama/ollama/issues/15260> — `think=false` breaks `format` on gemma4. Closed, 2026-04-03.
- <https://github.com/ollama/ollama/pull/15678> — the #15260 fix, merged 2026-04-21, gemma4-scoped.
- <https://github.com/ollama/ollama/issues/14645> — same bug on qwen3.5. Closed via PR #15901, 2026-03-05.
- <https://github.com/ollama/ollama/issues/14259> — silent truncation, logging-only fix. Open, 2026-02-14.
- <https://github.com/ollama/ollama/releases> — v0.32.15 (2026-08-19, latest), v0.33.0 (2026-08-21, pre-release), v0.32.10 repeat_penalty default change, v0.32.12–14 Qwen3.8 support.
- <https://raw.githubusercontent.com/ollama/ollama/main/docs/api.md> — `/api/chat`, `/api/show` (`capabilities`), `/api/tags` (`details.format`), `/api/version`, response shapes.
- <https://raw.githubusercontent.com/ollama/ollama/main/docs/capabilities/structured-outputs.mdx> — `format` schema example; "pass the JSON schema as a string in the prompt".
- <https://raw.githubusercontent.com/ollama/ollama/main/docs/capabilities/thinking.mdx> — `think` boolean/levels, `message.thinking`.
- <https://raw.githubusercontent.com/ollama/ollama/main/docs/context-length.mdx> — VRAM-dependent default context.
- <https://raw.githubusercontent.com/ollama/ollama/main/server/routes.go> — error strings and status codes.
- <https://raw.githubusercontent.com/ggml-org/llama.cpp/master/grammars/README.md> — supported/ignored JSON-Schema keywords; "unsupported features are skipped silently".
- `node_modules/zod@4.4.3` — `core/to-json-schema.d.ts` (options, `$schema` emission), `core/json-schema-processors.js` (`objectProcessor` / `additionalProperties`).

Search snippets of pages blocked by the egress proxy — **[S]**:

- `https://ollama.com/library/gemma4:12b-it-qat`, `…/gemma4/tags`, `…/gemma4:e4b`
- `https://ollama.com/library/qwen3.6:35b-a3b`, `https://ollama.com/library/qwen3.5:4b-q4_K_M`
- Ollama engine selection (GGUF → llama.cpp, safetensors/MLX → MLX runner)
- `prompt_eval_count` as the truncation fingerprint; truncation keeps the tail
- `done_reason: "length"`; `num_predict` default `-1`
- `/api/show` `capabilities` values including `"thinking"` (ollama PR #10066)
- Qwen 3.8 / glm-4.7-flash / Muse Glimmer library entries

Read from the repo (read-only): `docs/PLAN.md`, `docs/agents/M3-ai-providers.md`,
`docs/decisions.md`, `docs/research/local-ai-stack-2026-08.md`,
`docs/research/macos-setup-verification.md`, `docs/note-instructions/*.md`,
`shared/src/*.ts`, `server/src/seed.ts`.
