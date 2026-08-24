# M8 — app shell, LLM runtime, and what the packet gets wrong

**Researched 2026-08-24.** Companion to `docs/research/m8-bundling-2026-08.md`,
which answered *"can we legally and practically ship these binaries?"* This one
answers *"are they the right binaries, and what should the shell be?"*

Nothing in the working tree was modified except this file. Nothing was
compiled, signed or run — this container is Linux, and another agent is
mid-build on M7 in the same checkout.

## 0. How to read this document

Evidence tags, per the convention in this directory:

- **[verified]** — I read the primary source myself in this session: repository
  source code, a licence file, an upstream issue page, official API docs.
- **[single]** — one source only, or search-engine consensus over a page I
  could not fetch. Treat as probably-true, worth one command to confirm.
- **[inferred]** — my reasoning from [verified] facts. Not itself confirmed.
  Every one of these names the command that would settle it.

Where I carry a fact from `m8-bundling-2026-08.md` without re-checking it, I say
so and tag it **[single]** — that document read it, I did not.

### Egress limitations this session

Reachable: `raw.githubusercontent.com` (curl), `github.com` issue and release
pages (fetch tool), `nodejs.org`, `developer.apple.com`'s DocC JSON API.

**Blocked:** `v2.tauri.app`, `www.electronjs.org`, `ai.google.dev`,
`api.github.com`, `huggingface.co`. Workarounds used, all of which are better
primary sources than the blocked pages:

- Tauri facts from the `tauri-apps/plugins-workspace` repository, not the docs
  site.
- Electron facts from `electron/electron/docs/` in the repository, which is the
  source the docs site renders.
- llama.cpp facts from `ggml-org/llama.cpp` source at `master`, not from the
  wiki.

**Not reachable, and it matters:** GitHub *release asset sizes* (the API is
403 and the releases page's asset list does not render for the fetch tool). So
every download-size figure below for Electron and Ollama is tagged
`[inferred]` with the command to measure it. `huggingface.co` is blocked again,
so the GGUF model URL gap from `m8-bundling` §10.4 is **still open**.

---

## 1. Decision summary

| # | Question | Verdict |
| --- | --- | --- |
| 1 | Can `llama-server` replace Ollama here? | **Technically yes, and it is arguably the better runtime — but M8's stated premise for it is false, and the work is a provider rewrite the size of M3, not a packaging detail. Take it out of M8 and give it its own packet.** |
| 2 | Tauri v2 or Electron for the shell? | **Neither. A plain Swift/AppKit status-item app, with all first-run *logic* in TypeScript run by the bundled `node`. Tauri is the fallback; Electron is the wrong shape.** |
| 3 | Is ffmpeg gone? | **Gone, confirmed in code. Deliverable 1's ffmpeg bullet and deliverable 6's LGPL paragraph should both be deleted, not satisfied.** |
| 4 | Node SEA or a bundled Node binary? | **Bundled stock `node`. SEA is still "active development" and its native-addon path is a temp-file `dlopen`, which is the one thing `better-sqlite3` cannot survive cleanly.** |
| 5 | Licensing / signing | **Licences: real work, listed in §6.1. Weights-at-arm's-length reasoning holds, with one condition. Signing: $99/yr, deferred — but the unsigned path is worse than the packet assumes and needs a build-time fix (§6.3).** |

---

## 2. Question 1 — can `llama-server` actually replace Ollama?

### 2.1 The packet's premise is false

M8 deliverable 1 justifies swapping the runtime with:

> The app already talks to an OpenAI-compatible API and PLAN §2 requires
> llama.cpp to work, so this validates that portability rather than
> contradicting it.

It does not. **[verified]** — read from
`server/src/ai/ollama.ts` in this checkout today. Every LLM call in the app
goes to one of three **Ollama-native** endpoints:

| Endpoint | Where | What it does |
| --- | --- | --- |
| `POST /api/chat` | `postChat`, l.582 | every draft, refine, detect, summarise, suggest, compose |
| `GET /api/tags` | `describe`, l.178 | health, model-presence, and the GGUF weights guard |
| `POST /api/show` | `supportsThinking`, l.212 | whether to send the top-level `think` field |

The file's own header comment says the OpenAI endpoint was **rejected on
purpose**, twice over:

> `/api/chat` and not `/v1/chat/completions` (the OpenAI endpoint strands the
> answer in `reasoning` for the models we target, ollama#15288) and not
> `/api/generate` either — `ChatHandler` is the only handler that defers
> grammar application until thinking finishes, so it is the only endpoint with
> thinking-aware `format` handling (ollama#17544, open).

`docs/decisions.md` rows 22 and 73 record the same decision. **Three other
places in the repo still carry the false premise and should be corrected when
someone acts on this**, all of them written before M3 was implemented:

- `docs/decisions.md` row 9 — *"Ollama default runtime, llama.cpp-compatible
  via OpenAI-style API"*
- `docs/decisions.md` row 26 — *"the app only ever speaks the OpenAI-compatible
  API, so the runtime is swappable"*
- `PLAN.md` §2 — *"llama.cpp `llama-server` must also work by pointing the base
  URL at it (same API shape)"*, and the architecture diagram's
  `API -- "OpenAI-compatible /v1 + /api/chat(format)" --> OLL`

Rows 22 and 73 already supersede rows 9 and 26 on the facts; nobody went back
and struck the old text. That is how the premise survived into M8.

**Consequence:** swapping to `llama-server` is not a configuration change. It
is a second `LlmProvider` implementation with its own request shape, its own
streaming format, its own error taxonomy, its own health probe, its own model
naming scheme, and its own retry ladder. §2.6 itemises it.

### 2.2 Schema-constrained structured output on `llama-server`

This is the load-bearing assumption of PLAN §5, so it gets the most scrutiny.

**It works, and the mechanism is better than Ollama's. [verified]**

`common/chat.cpp` at `master` builds, per model family, a PEG parser that
covers the *whole* generation — the reasoning block **and** the schema — and
then compiles the grammar from that same parser. From
`common_chat_params_init_gemma4`, which is the handler our default model
(`gemma4:12b-it-qat`) would hit:

```cpp
auto has_response_format = !inputs.json_schema.is_null() && inputs.json_schema.is_object();
auto include_grammar     = has_response_format || (has_tools && ...);
auto extract_reasoning   = inputs.reasoning_format != COMMON_REASONING_FORMAT_NONE;
...
if (has_response_format) {
    auto response_format = p.literal("```json") <<
        p.content(p.schema(p.json(), "response-format-schema", inputs.json_schema)) <<
        p.literal("```");
    return start + p.optional(thought) + response_format;
}
...
if (include_grammar) {
    data.grammar = build_grammar([&](const common_grammar_builder & builder) {
        ...
        parser.build_grammar(builder, data.grammar_lazy);
    });
}
```

Read what that says: the accepted language is *optional thought channel,
then a fenced JSON document matching our schema.* The thinking block is part of
the grammar rather than something the grammar has to be held back from
clobbering. Ollama's `#15260` / `#17544` / `#17871` family of bugs — all of
which exist because grammar application and thinking are two systems that have
to be sequenced by hand, per model family — **has no direct analogue here.**
That is a genuine architectural advantage, not a marketing claim.

**Four sharp edges that a naive port will hit.**

**(a) The documented `response_format` shape in the server README is wrong, and
getting it wrong fails silently. [verified]** The README says:

> The `response_format` parameter supports … schema-constrained JSON (e.g.
> `{"type": "json_object", "schema": {…}}` or `{"type": "json_schema", "schema":
> {…}}`)

But `tools/server/server-common.cpp` l.1162 actually parses:

```cpp
if (response_type == "json_object") {
    if (response_format.contains("schema") || json_schema.empty()) {
        json_schema = json_value(response_format, "schema", json::object());
    }
} else if (response_type == "json_schema") {
    auto schema_wrapper = json_value(response_format, "json_schema", json::object());
    json_schema = json_value(schema_wrapper, "schema", json::object());
}
```

With `{"type": "json_schema", "schema": {…}}` — the README's own second example
— `schema_wrapper` is `{}`, `json_schema` becomes `{}`, and every
`has_response_format` test in `chat.cpp` is `is_object() && !empty()`, which
`{}` fails. **The request is accepted, no grammar is built, and the server
returns HTTP 200 with unconstrained prose.** No error, no warning to the
client.

The two shapes that actually work are OpenAI's nested form
(`{"type":"json_schema","json_schema":{"schema":{…}}}`) and — simplest, least
ambiguous — llama.cpp's own **top-level `json_schema` body field**, which is
read before `response_format` is looked at at all. Use the top-level field.

**(b) There is a second, unrelated silent fail-open. [verified]**
llama.cpp issue **#19051**, *"llama-server fails open when JSON schema grammar
parsing fails"*, opened 2026-01-23, **closed as not planned**. If schema→GBNF
conversion succeeds but the resulting grammar does not parse, the server logs
`llama_grammar_init_impl: failed to parse grammar` and **continues generating
unconstrained**, returning HTTP 200. The reporter's own summary: *"Silent loss
of structured-output guarantees; unsafe for production without external
validation."*

This is the exact shape of `ollama#16563`, which is why `ollama.ts` never
trusts `format` and re-validates every response against the zod schema. **That
defence transfers unchanged and is the reason this is survivable.** Do not let
anyone remove it during a port on the grounds that "llama.cpp enforces the
grammar properly."

**(c) Two model families put the JSON inside a code fence *by grammar*.
[verified]** Both `common_chat_params_init_gemma4` and
`common_chat_params_init_ministral_3` wrap the schema in
`p.literal("```json") << … << p.literal("```")`. Only the inner part is marked
`p.content(...)`, so the parsed `message.content` should be bare JSON with the
fences stripped by the PEG parser **[inferred — I read the grammar
construction, not the result assembly]**.

Apunta currently treats a fence as *proof the grammar was never applied*:

```ts
if (fenced) {
  this.log('model returned a fenced response despite format', { model });
}
```

On llama-server that diagnostic inverts: a fence is expected output that
happens to be stripped upstream, and its *absence* proves nothing. **Settle it
with:** run one `/v1/chat/completions` against gemma4 with a top-level
`json_schema` and print `choices[0].message.content` raw.

**(d) Thinking is controlled by different knobs, and one of them is a server
flag. [verified]** `ollama.ts` sends a per-request top-level `think: false`,
gated on `/api/show` reporting the `thinking` capability, because sending it to
a model without that capability is a hard HTTP 400. On llama-server the
equivalents are:

| Ollama | llama-server |
| --- | --- |
| `think: false` (request body) | `chat_template_kwargs: {"enable_thinking": false}`, or `reasoning_effort: "none"`, or server-wide `--reasoning-budget 0` / `-rea off` |
| `/api/show` → `capabilities` includes `thinking` | `GET /props` → `chat_template_caps` (`common/jinja/caps.h`: `supports_reasoning_effort`, `supports_preserve_reasoning`, …) |
| `format` (request body) | top-level `json_schema` (request body) |
| `options.num_ctx` (**request body**) | `-c` / `--ctx-size` (**server startup flag**) |

That last row is a real structural difference. `NUM_CTX = 16_384` stops being
something the provider sends per call and becomes something the *launcher*
sets; `assertFits` then has to read the real value back from `/props` rather
than assume it. Get that wrong and the 75% prompt budget is enforced against a
number nobody configured.

Also worth flagging: llama.cpp's `repeat_penalty` default is **1.1**
[verified, server README], not 1.0. `docs/decisions.md` row 75 and `ollama.ts`
both set it explicitly to 1.0 because a repetition penalty over constrained
JSON penalises the structural tokens and the repeated section names. That
explicit `1.0` must be carried across, not dropped as "the default anyway."
And `cache_prompt` defaults to **true**, which the README says "can cause
nondeterministic results" — so `smoke:live` and M7's eval harness want
`cache_prompt: false` to keep temperature-0 + fixed-seed reproducibility.

### 2.3 What replaces the `details.format === "gguf"` guard?

**Nothing needs to. The guard becomes unnecessary rather than missing.
[verified]**

The guard exists for one reason, recorded in `model-picker.ts` and
`decisions.md` row 72: Ollama routes GGUF weights to llama.cpp (where `format`
becomes a grammar-constrained sampler) and safetensors/MLX weights to its MLX
runner, **which silently ignores `format`** (`ollama#16563`, open). Two
runtimes behind one API, and only one of them honours the contract.

`llama-server` has exactly one loader. `src/llama-model-loader.cpp` obtains
model metadata through `gguf_init_from_file` and throws
`"failed to load model from %s"` when that returns null [verified]. There is no
MLX path, no safetensors path, no second engine to be silently routed to. A
non-GGUF file is a hard load failure at server startup, visible in the process
exit, not a silent quality regression at draft time.

So on llama-server:

- `assertGgufWeights` and `LlmDescription.weightsFormat` **delete**.
- `assertSupportedModelName`'s `-(mlx|nvfp4|mxfp8|bf16)` regex **deletes** —
  those are Ollama tag flavours and have no meaning as GGUF filenames.
- What replaces them is a *presence* check, not a *format* check: `GET /models`
  (router mode) reports each model's `id`, `path` and `status`, and `GET /props`
  reports `model_path` [verified, server README]. That is the `/api/tags`
  analogue for health.

This is a real simplification and one of the honest arguments for the swap.

### 2.4 Is the repetition loop (ollama#15502) upstream in llama.cpp?

**Partly, and the honest answer is that switching runtimes does not buy an
escape.** Three findings:

**The Ollama issue does not attribute itself upstream. [verified]** I re-read
`ollama/ollama#15502` today: still **open**, opened 2026-04-11, no maintainer
response. The reporter explicitly rules out one known llama.cpp bug (*"This is
NOT the `<unused>` token / GEMV buffer overlap bug"*, zero `<unused>` tokens in
39 trials) and points at constrained decoding generally: *"the grammar
constraint limits token choices at each step, and inside a JSON string value
any valid string content (including word repetition) is allowed."*

**llama.cpp has its own grammar-decoding loop bugs. [verified]** Issue
**#21375**, *"Infinite repetition loop in llama-server with peg-gemma4 parser
during tool calls"*, opened 2026-04-03, **closed as not planned**. The trigger
there is tool calls rather than `response_format`, and the described mechanism
is the server re-parsing the whole partial output on every token — so it is not
the *same* bug. But it is the same model family, the same PEG grammar
machinery, and the same "closed, not planned" disposition. A search of
llama.cpp's tracker for repetition under `json_schema` turns up no equivalent
of #15502 with `response_format` **[single — I searched, I cannot prove
absence]**.

**The mechanism is not runtime-specific. [inferred]** Constrained decoding over
a free-text string field removes the model's escape hatch: inside a JSON
string, EOS is not a legal token, and every repetition of a word is. Any
implementation that enforces a JSON grammar has this property. `repeat_penalty`
cannot save you, which is why #15502 reports 1.0 / 1.15 / 1.5 failing
identically and why row 75 forbids `maxLength` in the schema (a grammar-level
cap converts an obvious loop into a valid-looking note).

**Conclusion:** `degenerate.ts` — the token-repetition heuristic and the
degenerate-output retry rung — is **not Ollama scaffolding. It is a permanent
part of this app** and must survive any runtime change. Do not let a migration
packet delete it as "an Ollama workaround."

### 2.5 The one thing llama-server is unambiguously better at

**It refuses an over-long prompt instead of silently truncating it.
[verified]**

`tools/server/server-context.cpp` l.3091:

```cpp
if (slot.task->n_tokens() >= slot.n_ctx) {
    send_error(slot,
               string_format("request (%d tokens) exceeds the available context size (%d "
                             "tokens), try increasing it",
                             slot.task->n_tokens(), slot.n_ctx),
               ERROR_TYPE_EXCEED_CONTEXT_SIZE);
    slot.release();
    return;
}
```

`ERROR_TYPE_EXCEED_CONTEXT_SIZE` maps to **HTTP 400**, type string
`"exceed_context_size_error"`, and — uniquely among the error types — the body
carries `n_prompt_tokens` and `n_ctx` [verified,
`server-common.cpp` l.51, `server-task.cpp` l.1503]. Context shift, the
mechanism that *would* discard the head, is **off by default**
(`--context-shift, --no-context-shift … default: disabled`) [verified].
Non-streaming responses additionally carry a `truncated` boolean [verified].

Compare what this project has had to build around Ollama's head-truncation:

| `docs/decisions.md` row | What it exists for |
| --- | --- |
| 80 | prompt's user message repeats the key list at the tail, because the head is what gets dropped |
| 81 | detect truncation twice — refuse at 75% of `num_ctx`, then check `prompt_eval_count` flush against `num_ctx` |
| 101 | M9 summarises each note in a separate call because several notes in one prompt would drop the instructions |
| 112 | chat history capped at 10 turns for the same reason |
| 142 | detection input capped at 20,000 chars and cut at the **tail** |

Five separate design compromises, all downstream of one silent failure that
`ollama#14259` is open about and whose proposed fix is logging-only. On
llama-server that failure is a typed HTTP 400 with the numbers in the body.

Given that M7 deliverable 6 makes **fabrication rate the gating quality
metric**, and given that head-truncation's signature failure is *"the
instructions are gone, the patient material is still there, the answer is
fluent"* — this is not a small point. **On the merits, and setting packaging
aside entirely, `llama-server` is the better runtime for this application.**

Two smaller wins in the same direction: router mode
(`llama-server --models-dir …`, routing on the request's `model` field, with
`--sleep-idle-seconds` as the `keep_alive` analogue) maps cleanly onto
Apunta's read-the-setting-per-call model resolution [verified, server README];
and `--offline` plus `--no-webui` plus a default bind of `127.0.0.1` give a
tighter network posture than Ollama's [verified today at `master`, and carried
from `m8-bundling` §4].

### 2.6 What a `LlamaServerProvider` actually costs

Not hours — what has to be built and tested. Against
`server/src/ai/ollama.ts` (884 lines) and `ollama.test.ts` (556 lines):

| # | Work item | Notes |
| --- | --- | --- |
| 1 | Request builder | top-level `json_schema`; `max_tokens`; explicit `repeat_penalty: 1.0`; `cache_prompt: false`; `seed`; `temperature: 0`. `num_ctx` moves to a launch flag. |
| 2 | **Streaming rewrite** | Ollama is NDJSON, one object per line. llama-server is **SSE** with OpenAI deltas and a `[DONE]` sentinel [verified]. `streamChat`'s reader loop and the producer/consumer wrapper are rewritten; `JsonStringStreamDecoder` itself is reusable unchanged. |
| 3 | Stats mapping | `timings.prompt_n` + `timings.cache_n` → `promptTokens`; `timings.predicted_n` → `outputTokens`; `predicted_ms` (ms, not ns) → `evalNanos`. **No `load_duration` equivalent** — the model is loaded at server start or by the router, so the cold-load status event needs a different trigger. |
| 4 | Error taxonomy | `finish_reason: "length"` → `output_truncated` [verified]. HTTP 400 `exceed_context_size_error` → `context_overflow`, replacing the `prompt_eval_count` heuristic (keep the heuristic as a belt). `model_missing`, `insufficient_memory`, `ollama_unreachable` all re-derive from different signals. |
| 5 | Thinking control | `/api/show` + `think` → `/props`.`chat_template_caps` + `chat_template_kwargs`. **The retry ladder's third rung has no analogue** — "re-ask with `think` omitted" is a workaround for Ollama-specific bugs. Redesign or drop it, and re-justify the ladder in `decisions.md`. |
| 6 | Health / describe | `/api/tags` → `/models` + `/props`; `weightsFormat` deleted; `HealthResponseSchema.ollama` renamed, which is a **breaking API-shape change** touching `shared/`, the M7 setup wizard, and its e2e test. |
| 7 | Model identity | Settings' `llm_model` holds Ollama tags today. It would hold GGUF ids/filenames. Needs a migration, a Settings UI change, and a rewrite of `model-picker.ts`'s tier table and of PLAN §2's table. |
| 8 | **The model table itself** | Per tier: GGUF repo, filename, byte size, SHA256, context length, and the weights' licence text to show the user. **None of this exists anywhere in the repo, and `huggingface.co` is blocked from this container** — same gap `m8-bundling` §10.4 flagged, still open. |
| 9 | Process supervision | Ollama is a service the user runs. `llama-server` is a process *we* must start, supervise, restart and kill. New code with no current analogue. |
| 10 | Tests | Mirror ~556 lines of provider tests against a different wire format; rewrite `scripts/smoke-live.mjs`; rewrite M7's `npm run eval` and its `APUNTA_EVAL_MODELS` comparison. |
| 11 | **Re-run the quality eval** | Different runtime, different quantisation, different chat template, possibly different model files. The eval corpus in `e2e/fixtures/eval/` exists precisely so this can be answered with evidence rather than assumed. |

Item 11 is the one people skip. Items 2, 6 and 8 are each larger than they
look.

**And the sting in the tail.** The packet says *"Ollama stays the documented
choice for developer setup."* Combined with deliverable 1, that means:

> the developer runs and tests the Ollama provider every day; the therapist is
> the only person who ever runs the llama-server provider.

Two production LLM providers, in the part of the app PLAN §5 identifies as
load-bearing, with the untested one shipping to the only user who cannot debug
it. That is the strongest single argument against doing this inside M8.

### 2.7 Recommendation

**Rewrite M8 deliverable 1. Do not do the runtime swap inside M8.**

Concretely, in priority order:

1. **Delete the "OpenAI-compatible" justification** from the packet and from
   `decisions.md` rows 9 and 26 and PLAN §2. It is false and it is the only
   thing making the swap look cheap.

2. **Give the swap its own packet** — call it M8a — that *replaces* the Ollama
   provider rather than adding a second one: llama-server in development, in
   CI's live smoke, in `npm run eval`, and in the shipped app, with
   `OllamaProvider` deleted when it lands. One provider, one tested path. Its
   acceptance criterion is the eval harness showing no fabrication-rate
   regression against the current baseline. The five truncation compromises in
   §2.5 can then be revisited, which is most of the packet's payoff.

3. **M8 bundles whatever the app actually talks to when M8 runs.** If M8a has
   landed, that is `llama-server`. If it has not, M8 must ship the Ollama CLI
   binary (MIT, so redistributable) and start `ollama serve` as a child
   process — **size unmeasured, and it is the deciding factor**
   `[inferred]`; settle it on the Mac with
   `curl -sIL <ollama darwin asset> | grep -i content-length`, or
   `du -sh $(dirname $(which ollama))/ollama` on an existing install. If the
   Ollama binary blows the ~100 MB installer budget, M8a stops being optional
   and becomes M8's blocker — which is worth knowing *before* M8 starts, not
   halfway through.

4. **Whatever ships, keep `degenerate.ts` and keep re-validating every response
   against zod.** Both defences are runtime-independent (§2.2b, §2.4).

The option I am explicitly *not* recommending is the packet as written: bundle
llama-server, keep Ollama for developers, ship two providers. It is the most
expensive option and the only one that ships an untested path to the user.

---

## 3. Question 2 — the app shell

### 3.1 First, shrink the job

The shell as the packet describes it does six things: status item with state;
Open/Stop/Quit menu; start the server and open the browser; pick a free port;
enforce one instance; and run a first-run window with disk check, tiered model
choice, resumable checksummed download, and real failure handling.

Item six is 80% of the work — and it is the only part that needs a UI toolkit.
**Move its logic, not its pixels, into TypeScript:**

> A `setup` entry point, bundled like the server and run by the same bundled
> `node`, performs the disk-space check, the RAM tier decision, the resumable
> download, and the checksum verification, and reports progress on stdout as
> NDJSON. The shell renders that stream.

Three things fall out of this, and they are what make the shell choice easy:

- **The packet's own acceptance criterion is otherwise unsatisfiable.** It
  requires *"disk-space math, tier selection from RAM, checksum verification,
  download resume bookkeeping … unit-tested without needing macOS."* That
  logic in Rust or Swift cannot run in this project's Linux CI. In TypeScript
  it lands in the existing Vitest suite with no new toolchain. **The packet
  silently constrains the shell language, and nobody has noticed.**
- Hard rule 1's containment gets *stronger*, not weaker: the downloader is a
  separate short-lived process from the Fastify server, with its own code path,
  and `m8-bundling` §2.2's carve-out applies to it verbatim.
- The shell shrinks to: a status item, one child process, a progress window,
  and `open`. That is a few hundred lines in any language.

Second structural move, for the same reason:

> **The shell spawns exactly one child — `node`. The server owns
> `llama-server` and `whisper-cli`, as it already owns `whisper-cli` today.**

The packet's hardest behavioural requirement is *"quitting stops the server and
any model processes cleanly — no orphans."* A two-level tree where each level
owns its own children collapses that to one kill, and the server already has
child-process code (`server/src/ai/whisper.ts`). A flat tree where the shell
owns three unrelated processes is where orphans come from.

### 3.2 The candidates

Judged on what the packet actually asks for.

| | **Swift / AppKit** | **Tauri v2** | **Electron** | **Shell script in an `.app`** |
| --- | --- | --- | --- | --- |
| Runtime payload | **~0** — links system frameworks | ~5–10 MB (system WKWebView) | Whole Chromium; the single largest thing in the bundle `[inferred]` | 0 |
| New toolchain | **None.** `swiftc` ships in Xcode Command Line Tools `[single]`, which the build already needs to compile `whisper-cli` (`m8-bundling` §5) | **Rust.** A whole second toolchain, in a TypeScript project, maintained by one person | None | None |
| Status item | `NSStatusItem`, first-class | `tauri::tray`, supported | `Tray`, supported | **No** |
| First-run window | `NSWindow` / SwiftUI | webview | webview | **No** |
| Single instance | **Free** (§3.4) | `tauri-plugin-single-instance` [verified] | needs `app.requestSingleInstanceLock()` | Free |
| Child-process control | `Process`, `posix_spawn`, kqueue `NOTE_EXIT` | Rust `std::process` / `tauri-plugin-shell` | Node `child_process` | `exec` |
| Signing surface (later) | Fewest nested Mach-Os | **`externalBin` notarization bug open 20 months** (§3.5) | Well-trodden, many nested binaries | Trivial |
| Phone-home to disable | **Nothing exists** | Updater is an opt-in crate [verified] | `autoUpdater` + `crashReporter`, both opt-in [verified] | Nothing |
| `better-sqlite3` | Untouched — the server runs under stock `node` | Untouched | **Must be rebuilt for Electron's ABI** | Untouched |
| CI on Linux | Cannot build | Cannot build a macOS app | Can package (not sign) | n/a |

Notes on the ones that lose:

**Electron** is the wrong shape here, and not for the reason people usually
give. The size objection is real but softer than it looks — Electron bundles
Node, so it would *replace* the 37 MiB-compressed stock `node` binary rather
than add to it. The decisive objections are: (a) the app is a status item and
one progress window, so a full Chromium is being shipped to draw a progress
bar the user's *actual* browser could draw; (b) `better-sqlite3` would need
rebuilding against Electron's ABI, and `decisions.md` row 136 shows this
project already declining a dependency specifically to avoid fighting native
addons; (c) Electron's security-release cadence is a standing maintenance
obligation for a solo maintainer, and hard rule 1 forbids the auto-updater that
makes that cadence tolerable. **One Electron myth worth killing**: Chromium's
hunspell dictionary download does *not* apply — *"On macOS, the OS spellchecker
is used and therefore we do not download any dictionary files. This API is a
no-op on macOS."* [verified, `electron/electron/docs/api/session.md`]. Do not
reject Electron for that reason; reject it for the three above.

**A shell script in an `.app`** cannot draw a status item or a progress bar, so
it fails deliverables 2 and 3 outright. It is worth naming only to record why:
if the first-run UI ever moves fully into the browser tab and the "Quit" affordance
with it, this option comes back, and it would be the smallest thing that could
possibly work. That is a legitimate future simplification, not an M8 one.

**Tauri v2** is a reasonable second choice and genuinely small. Two costs. The
Rust toolchain is a real, permanent tax on a solo TypeScript maintainer — and
with the §3.1 restructuring, Rust buys *nothing* that Swift does not, because
the interesting logic is no longer in the shell. And `tauri-apps/tauri#11992`,
*"MacOS - Codesigning and notarization issue when using ExternalBin"*, is
**still open**, opened 2024-12-17, no workaround in the thread [verified
today]. Apunta needs three sidecars plus llama.cpp's dylib family. Signing is
deferred, so this is not blocking *now* — it is exactly the kind of thing that
surfaces the week the owner buys the $99 membership.

### 3.3 Recommendation

**A plain Swift/AppKit status-item app**, with the first-run logic in
TypeScript per §3.1, and a two-level process tree per §3.1.

The reasoning that should go in `docs/decisions.md`:

- The shell's job, correctly scoped, is a status item, one child process, a
  progress window and `open`. Every framework here is heavier than the job.
- Swift adds **no new toolchain**: the packaging step already needs Xcode
  Command Line Tools to build `whisper-cli`, and `swiftc` is in that package
  [single]. Rust would be a second toolchain; Electron would be a second
  runtime.
- The packet's "unit-tested without macOS" criterion is satisfied by putting
  the logic in TypeScript, which is what makes a non-TypeScript shell
  acceptable at all.
- Nothing in AppKit phones home, so §3.5's gating requirement is satisfied by
  construction rather than by configuration.

**Honest costs, stated plainly:** the owner would own ~300 lines of a language
he does not write; the shell cannot be built or linted in this repo's Linux CI
(neither can Tauri, and Electron only unsigned); and there is no cross-platform
story if Apunta ever targets Windows — at which point the shell is rewritten,
which for 300 lines is acceptable. If the owner rejects Swift outright, **take
Tauri v2, not Electron**, and budget for #11992 when signing lands.

### 3.4 Single instance

**Free for a plain `.app` [single].** Double-clicking an already-running
bundled application does not launch a second copy; LaunchServices activates the
existing instance and delivers
`applicationShouldHandleReopen:hasVisibleWindows:` to its delegate — which is
exactly the hook for "focus the existing one" and, for a status-item app with
no windows, for "re-open the browser tab."

One correction to a common misreading: `LSMultipleInstancesProhibited` is *not*
what provides this. Apple's own definition is *"A Boolean value indicating
whether more than one **user** can launch the app simultaneously"* [verified,
Apple DocC] — it is about fast user switching, not about a second instance in
your own session. Do not add it and assume it did the job.

Tauri and Electron both need an explicit mechanism (a plugin and
`requestSingleInstanceLock()` respectively), because their processes can be
launched by paths other than Finder.

### 3.5 Gating requirement — no outbound request, and how it is guaranteed

For the recommended choice, **Swift/AppKit**, the answer is short: there is no
framework updater, no crash reporter, no telemetry, and no bundled web engine.
`NSStatusItem`, `NSWindow`, `Process` and `NSWorkspace.open` do not make
network requests. Nothing needs disabling because nothing is there. The one
network call in the whole product is the model download in §3.1's `setup`
entry point, which is TypeScript we wrote, pointed at a pinned allow-list.

Because the packet asks specifically about the frameworks' updaters, for the
record:

- **Tauri v2's updater is a separate opt-in crate.** `tauri-plugin-updater`
  must be added to `Cargo.toml` *and* registered with
  `app.handle().plugin(tauri_plugin_updater::Builder::new().build())` before
  any code exists to make a request [verified,
  `tauri-apps/plugins-workspace/v2/plugins/updater/README.md`]. Omitting it is
  a compile-time guarantee, not a config flag — the strongest possible form of
  "disabled."
- **Electron's `autoUpdater` is in core but inert by default.** It requires
  `setFeedURL()` and an explicit `checkForUpdates()`; on macOS it is
  Squirrel.Mac and *"your application must be signed for automatic updates on
  macOS"* [verified, `docs/api/auto-updater.md`]. **`crashReporter` is
  opt-in**: nothing is collected or uploaded until `crashReporter.start({
  submitURL })` is called [verified, `docs/api/crash-reporter.md`].
  Chromium underneath is the part that would need auditing, and the macOS
  spellchecker note above removes the one commonly-cited default.

Whichever shell ships, three checks belong in the packet as build steps rather
than as prose:

1. Extend `scripts/check-no-external-urls.mjs` (`decisions.md` row 88) over the
   shell's sources and over the packaged app's `Contents/Resources`.
2. Assert the allow-list: the *only* non-loopback host literal anywhere in the
   product is the model-download host, and it lives in the `setup` entry point.
3. On the Mac, once, with the app running and idle:
   `lsof -nP -i -a -p $(pgrep -f Apunta)` — expect loopback only. Same for the
   spawned `llama-server` (`m8-bundling` §2.2 already asks for this).

---

## 4. Question 3 — ffmpeg is gone entirely

**Confirmed. The obligation disappears; it does not need satisfying.
[verified, from this checkout today.]**

M5 landed the browser-side capture path. `docs/decisions.md` row 148 records
it: *"M5 ships no ffmpeg and no ffprobe: the browser records 16 kHz mono WAV
and `whisper-cli` reads it directly."* The code agrees, everywhere it could
disagree:

- `shared/src/health.ts` — *"There is no `ffmpeg` key … ffmpeg is not a
  dependency of the running app at all."* `shared/src/health.test.ts` asserts
  it: `expect(Object.keys(HealthResponseSchema.shape)).not.toContain('ffmpeg')`.
- `server/src/routes/health.ts` — *"There is no ffmpeg check any more, because
  there is no ffmpeg."*
- `server/src/ai/whisper.ts` — *"No ffmpeg, and no transcode."* And
  `whisper.test.ts` has a test literally named `never mentions ffmpeg`, which
  asserts the spawn arguments do not contain the string.
- `server/src/routes/transcribe.ts`, `server/src/routes/draft.ts` — duration
  comes from the WAV header; *"no `ffprobe` anywhere in this app."*
- `shared/src/wav.ts` — the ~150 lines that replaced it.

A repo-wide grep for `ffmpeg` / `ffprobe` outside `docs/` and `dist/` returns
**only comments explaining the absence**, plus one line in
`scripts/preflight-macos.sh` that reports ffmpeg *"(not required — reported for
information only)"*.

**Therefore:**

- M8 deliverable 1's third bullet — *"`ffmpeg` for audio conversion — use an
  LGPL build and check what its license obliges you to ship"* — **delete it.**
  Do not ship an ffmpeg. There is nothing to convert.
- M8 deliverable 6's *"verify what the ffmpeg build you chose requires — LGPL
  builds have conditions around linking and source availability that must
  actually be satisfied, not waved at"* — **delete it.** With no ffmpeg in the
  bundle there is no LGPL §4 source-offer, no §6 relinking clause, no
  written-offer machinery, and no custom arm64 build to maintain forever. This
  is the single largest simplification available to the packet.
- One thing must **not** be deleted: `whisper-cli` must keep being built
  *without* `WHISPER_COMMON_FFMPEG`. That flag adds an ffmpeg decode fallback
  and links whisper.cpp against libav\*, which re-engages every obligation
  above on a binary we compile ourselves (`m8-bundling` §3.4, §3.5). Make it an
  explicit, commented `-D…=OFF` in the build script so nobody turns it on for
  "better format support."

---

## 5. Question 4 — Node runtime

**Bundle the stock `node` binary. Not SEA.** This re-confirms
`m8-bundling` §6 against Node's current documentation, which I fetched today.

Node's own SEA page is still **"Stability: 1.1 — Active development"**
[verified], and on the point that decides it:

> **Native addons** can be bundled as assets into the single-executable
> application by specifying them in the `assets` field … The addon can then be
> loaded in the injected main script by writing the asset to a temporary file
> and loading it with `process.dlopen()`.

`better-sqlite3` (pinned at 13.0.3, `decisions.md` row 29) is a compiled
`.node` Mach-O. The SEA path therefore requires, at runtime, writing an
executable to a temp directory and `dlopen`ing it — which is precisely what
macOS library validation exists to prevent. Making it work means adding
`com.apple.security.cs.disable-library-validation`, against Apple's own
guidance, to buy nothing: SEA produces a binary that *is* Node with a blob
injected, so there is no size win either. Two further papercuts from the same
page: `__filename` and `module.filename` equal `process.execPath` inside the
injected script (path assumptions break), and the flow requires
`codesign --remove-signature` → inject → re-sign.

**The bundled-binary path instead:**

- `bin/node` only — drop `lib/node_modules/npm`, `corepack`, `include/`,
  `share/`. ~37 MiB compressed [single, measured by `m8-bundling` §6.2, not
  re-measured here].
- Place it at `Contents/MacOS/node`; bundle the server with esbuild into one
  file in `Contents/Resources/`; keep `better_sqlite3.node` as a real file.
- When signing eventually happens, `node` and the `.node` are two more ordinary
  nested Mach-Os signed with the same identity — library validation is
  satisfied without any entitlement.
- The same `node` runs the §3.1 `setup` entry point, so the runtime is paid for
  once.

**Alternative worth one line, not more:** Node 22+ ships `node:sqlite` in core,
which would remove the native addon and make SEA viable. That is a
`decisions.md` row for some future packet, not an M8 change — swapping the
database layer during an installer packet is exactly the scope creep hard rule
5 exists to stop.

---

## 6. Question 5 — licences, weights, signing

Per the coordinator's scope update: signing is **deferred**, so §6.3 is short.
Licences are not deferred and are at full depth.

### 6.1 What `THIRD-PARTY-LICENSES.md` must actually cover

Given the bundle recommended by this document — no ffmpeg, arm64-only, stock
`node`, a Swift shell, and *either* `llama-server` *or* the Ollama CLI
depending on §2.7 — the file must cover:

| Component | Licence | What the file must contain |
| --- | --- | --- |
| **llama.cpp** — `llama-server` plus its `libllama` / `libggml*` / `libmtmd` dylibs | MIT [single — read by `m8-bundling` §4; I re-read the same `LICENSE` path today only to confirm it is still MIT] | Copyright line + full MIT text. The release tarball already ships `LICENSE`; keep it in `Contents/Resources/`. |
| **BoringSSL**, linked into llama.cpp release builds (`-DLLAMA_BUILD_BORINGSSL=ON`) | Mixed permissive — OpenSSL / ISC / Apache-2.0 components | Reproduce all notices. **Check whether the Apache-2.0 parts require a `NOTICE` file**; that is a real obligation, not boilerplate. [inferred — not read] |
| **whisper.cpp** — `whisper-cli` | MIT [single] | Copyright + full text. |
| **miniaudio** and **stb_vorbis**, vendored inside whisper.cpp | MIT-0 / public-domain dual [inferred — not read] | Read the headers in the pinned tree and reproduce whichever branch applies. These are now *load-bearing* — they are what replaced ffmpeg. |
| **Node.js** — the `node` binary | MIT, plus a very large bundled-dependency notice file (~157 KB) [single] | Ship the tarball's `LICENSE` **verbatim**. Do not hand-summarise it. |
| **better-sqlite3 + SQLite** | MIT + public domain [inferred] | Reproduce. |
| **The npm tree** — Fastify, React, zod, unpdf, … | mostly MIT/ISC/BSD-3 [inferred] | **Generate mechanically** (`license-checker` or equivalent) as a build step, so it cannot drift. Fail the build on any GPL/AGPL that appears. |
| **Ollama CLI**, *only if* §2.7 step 3 applies | MIT [inferred — not read this session] | Read `ollama/ollama/LICENSE` before shipping it. |
| The shell | Swift/AppKit: **nothing** — system frameworks, no third-party code. (Tauri: MIT/Apache-2.0 crates. Electron: MIT + Chromium BSD-3 + LGPL components.) | A real point in the Swift column: it adds **zero** rows to this table. |

Two process notes. Surface the file in the About page next to the privacy
statement (deliverable 6 already asks for this). And generate as much of it as
a script can, because a hand-maintained licence file in a project that pins
exact upstream tags will be wrong within two releases.

### 6.2 Do model weights create an obligation?

**The packet's reasoning holds, with one condition.**

The design — *"models download on first run rather than being bundled, which
also keeps model licensing at arm's length since we never redistribute
weights"* — is correct as far as it goes. Copyright and model-licence
obligations attach to **distribution**. We distribute an installer containing
our code and MIT/permissive binaries; the user's machine fetches the weights
from the vendor's own host, under whatever terms that host presents. We are not
in that chain [inferred — this is engineering reasoning about the structure of
the transaction, not legal advice, and `ai.google.dev` was blocked so I could
not read the Gemma Terms of Use text].

The condition: **arm's length only holds if the app does not disclaim the
terms.** Three things keep it honest, and all three belong in the packet:

1. The first-run window **names the model it is about to download and links its
   licence**, before downloading. The user is the one accepting the terms, so
   the user has to be able to see them.
2. The download hosts are a **pinned allow-list** recorded in
   `docs/decisions.md` (`m8-bundling` §2.2 already proposes exactly this), and
   the URL carries no query string beyond the file path.
3. Nothing about the weights is cached, mirrored, or re-served by us — no
   "mirror for reliability" convenience, ever. That single step converts
   arm's-length into redistribution.

Note also `m8-bundling` §5.1: the whisper weights are MIT (openai/whisper), so
that file *could* legally be bundled. It is downloaded for size reasons alone.
Worth saying out loud in the packet so a future reader does not think there was
a licence barrier there.

### 6.3 Signing — brief, since it is deferred

- **Cost: 99 USD per year**, Apple Developer Program. It is the only tier that
  includes Developer ID and access to the notary service; a free Apple Account
  cannot obtain either [single — read by `m8-bundling` §7.1 from Apple's
  membership comparison page, not re-fetched today].
- **What breaks without it, in order of severity:**
  1. **Nested binaries may not run at all.** On Apple Silicon, arm64 Mach-O
     binaries require at least an ad-hoc signature to execute [single,
     `m8-bundling` §8]. An unsigned `node`, `llama-server` or `whisper-cli`
     inside the bundle can fail at `posix_spawn` *after* the user has already
     got past Gatekeeper — the failure looks like "the app opened and then did
     nothing." **This one has a build-time fix that costs nothing and should be
     in M8 regardless: ad-hoc sign every Mach-O (`codesign -s - --force`) as a
     packaging step.** Do it now; it is also the correct first step of the
     signed flow later.
  2. **The right-click → Open workaround the owner is counting on no longer
     exists.** Apple, 2024-08-06: *"In macOS Sequoia, users will no longer be
     able to Control-click to override Gatekeeper … They'll need to visit
     System Settings > Privacy & Security to review security information for
     software before allowing it to run."* [single, `m8-bundling` §8, quoting
     Apple's developer news]. On a current Mac the real path is: double-click →
     a dialog offering only **Move to Trash** and **Cancel** → System Settings →
     Privacy & Security → scroll to a paragraph that appeared because of the
     failed launch → **Open Anyway** → authenticate → confirm again. The owner
     sitting beside her the first time makes this fine. `docs/INSTALL.md` must
     still describe *that* path, with screenshots, and must not describe
     right-click → Open, which will simply not work.
  3. **No stapled notarization ticket**, so nothing works better offline later.
     Irrelevant while unsigned.
- **What does not break:** the app itself, once running. Unsigned is a
  distribution problem, not a runtime one — provided (1) is handled.

The coordinator's framing is right and worth restating in the packet: because
he is present only for the *first* install, the unsigned dialog makes the
first-run experience **more** important, not less. Every failure path in
deliverable 3 — network loss, corrupt file, full disk, cancelled download —
must still recover in the UI six months from now with nobody sitting next to
her.

---

## 7. What M8's packet gets wrong, and what it should say

This is the actionable list. Line references are to
`docs/agents/M8-installer.md` as it stands today.

### Deliverable 1 — "Zero external dependencies in the shipped app"

1. **`llama-server` bullet — the justification is false.**
   Currently: *"The app already talks to an OpenAI-compatible API … so this
   validates that portability."* The app talks to Ollama's native `/api/chat`,
   `/api/tags` and `/api/show`, and rejected the OpenAI endpoint deliberately
   (§2.1). Replace the bullet with: *"Bundle the LLM runtime the app actually
   speaks to. Swapping Ollama for `llama-server` is a full provider rewrite
   (`docs/research/m8-shell-and-runtime-2026-08.md` §2.6) and belongs in its
   own packet, not here."*

2. **`ffmpeg` bullet — delete it entirely.** Nothing in the app invokes ffmpeg
   or ffprobe; M5 shipped browser-side WAV and `whisper-cli` decodes via
   miniaudio (§4). Add in its place a one-line constraint: *"`whisper-cli` must
   be built without `WHISPER_COMMON_FFMPEG`."*

3. **`whisper-cli` bullet — "bundle" is not possible.** whisper.cpp publishes
   no prebuilt macOS binary; packaging must compile it from a pinned tag
   (`decisions.md` row 47, `m8-bundling` §5). The packet text still reads as
   though it can be downloaded.

4. **Drop the Node SEA option.** *"The Node runtime, or a single compiled
   server binary (Node SEA)"* should become *"the stock `node` binary"*, with
   the reason (§5): SEA is stability 1.1 and its native-addon path collides
   with `better-sqlite3` and library validation.

5. **Stop asking; commit.** *"State plainly whether you are also shipping
   x86_64 or a universal binary"* — the answer is already forced: llama.cpp's
   macOS x64 build is `-DGGML_METAL=OFF`, and its arm64 build sets
   `CMAKE_OSX_DEPLOYMENT_TARGET=13.3` [single, `m8-bundling` §4]. The packet
   should say **arm64 only, macOS 13.3+**, and set `LSMinimumSystemVersion` to
   match.

### Deliverable 2 — "App shell"

6. **Change the framework recommendation.** *"Tauri v2 is the recommended
   starting point … Electron is the fallback"* → recommend a **Swift/AppKit
   status-item app**, with Tauri as fallback and Electron rejected (§3.2–3.3).
   Add the reason that decides it: with the first-run *logic* in TypeScript
   (§3.1), the shell does too little to justify either framework, and Swift
   needs no toolchain the build does not already have.

7. **Specify the process tree.** Add: *"The shell spawns exactly one child —
   `node`. The server owns `llama-server` and `whisper-cli`, as it already owns
   `whisper-cli`. Quit sends SIGTERM to the shell's single child and the server
   tears down its own children."* This is the only requirement in the packet
   with a real orphan risk, and it is currently left to the implementer.

8. **Single instance is free.** Add: *"For a plain `.app`, LaunchServices
   already activates the running instance; implement
   `applicationShouldHandleReopen:` to re-open the browser tab. Do not add
   `LSMultipleInstancesProhibited` — that key is about multiple users, not
   multiple instances"* (§3.4).

### Deliverable 3 — "First-run setup window"

9. **Say where the logic lives.** The packet requires (in its own acceptance
   criteria) that disk math, tier selection, checksum verification and resume
   bookkeeping be unit-tested **without macOS**. That is impossible if they are
   written in the shell's language. Add: *"This logic lives in TypeScript, runs
   under the bundled `node`, and reports progress to the shell as NDJSON on
   stdout. The shell renders; it does not compute."* (§3.1.)

10. **Name the missing input.** *"Picks the model tier from the machine's
    RAM"* presumes a table that does not exist for anything but Ollama tags.
    Add: *"Per tier, this packet needs a GGUF repo, filename, byte size,
    SHA256, context length and the weights' licence link. None of it exists in
    the repo yet (`m8-bundling` §10.4, still open). Record it before
    implementation starts."*

11. **Pin the checksum honestly.** Upstream publishes only SHA1 for
    `ggml-large-v3-turbo-q5_0.bin` [single, `m8-bundling` §5.1]. Add:
    *"Verify SHA1 once on the Mac, then pin **our own** SHA256 and check that
    thereafter; document that the SHA256 is Apunta's, not upstream's."*

### Deliverable 4 — "Distribution artifact"

12. **Reflect the deferred signing decision, and correct the fallback.** The
    packet already documents both paths, which is right. Two corrections:
    *"the right-click→Open workaround"* **does not work on macOS 15+** and must
    be replaced by the System Settings → Privacy & Security → Open Anyway
    sequence (§6.3). And add a build step that is required *even unsigned*:
    **ad-hoc sign every bundled Mach-O**, or the nested helpers may not execute
    on Apple Silicon at all.

13. **The ~100 MB target is conditional.** It holds only for arm64-only, models
    downloaded, and a shell without a bundled browser engine. Say so, so nobody
    later "just uses Electron" and quietly triples the download.

### Deliverable 5 — "No auto-update, no telemetry"

14. Correct as written. Make it checkable rather than aspirational: add the
    three verification steps in §3.5 (extend `check-no-external-urls.mjs` over
    the shell sources and the packaged `Contents/Resources`; assert the
    download host allow-list; `lsof` the running app on the Mac). Note that for
    a Swift shell there is no updater to disable — the requirement is satisfied
    by construction.

### Deliverable 6 — "Licenses and attribution"

15. **Delete the ffmpeg paragraph.** *"verify what the ffmpeg build you chose
    requires — LGPL builds have conditions … that must actually be satisfied,
    not waved at"* — there is no ffmpeg build (§4). This is the packet's
    single largest simplification and it should be visible in the text, not
    inferred.

16. **Replace it with the real list** (§6.1), including the three items easy to
    forget: BoringSSL's mixed notices, Node's ~157 KB bundled-dependency
    licence file shipped verbatim, and miniaudio/stb_vorbis inside whisper.cpp
    — which now matter *more* than before, because they are what replaced
    ffmpeg.

17. **Add the three conditions that keep the weights at arm's length** (§6.2):
    name the model and link its licence before downloading, pin the host
    allow-list in `decisions.md`, and never mirror or re-serve weights. The
    packet's reasoning is sound but currently unconditional, and one
    well-meaning "mirror for reliability" would undo it.

### Acceptance criteria

18. Add the criterion the packet implies but does not state: **no orphan
    processes** — after Quit, `pgrep -f 'llama-server|whisper-cli|Apunta'`
    returns nothing. It is the behaviour most likely to be quietly wrong and
    the packet asks for it in prose only.

### Elsewhere in the repo (not the packet, but same correction)

19. `docs/decisions.md` rows 9 and 26 and `PLAN.md` §2 all still assert the
    OpenAI-compatible-portability premise that rows 22 and 73 superseded and
    that `ollama.ts` contradicts. Whoever acts on this list should strike them
    in the same change, or the premise will resurface a third time.

---

## 8. What I could not verify

Each with what it would take to settle it.

1. **Electron's and Ollama's macOS download sizes.** GitHub's release-asset
   API is 403 from this container and the releases page's asset list does not
   render for the fetch tool. This matters for §2.7 step 3: if the Ollama CLI
   is too large to bundle, the llama-server migration stops being optional.
   **Settle:** `curl -sIL <asset-url> | grep -i content-length` on the Mac, or
   `du -sh` on an existing install.
2. **Whether `swiftc` ships in Xcode Command Line Tools.** [single] — search
   consensus plus Apple developer-forum threads; I could not fetch a first-party
   statement. This is load-bearing for §3.3's "no new toolchain" claim.
   **Settle:** `xcode-select --install`, then `swiftc --version` on a Mac
   without full Xcode.
3. **Whether llama-server's PEG parser strips the ```json fences from
   `message.content`.** [inferred] from reading the grammar construction, not
   the result assembly. **Settle:** one `/v1/chat/completions` call to gemma4
   with a top-level `json_schema`, printing `choices[0].message.content` raw.
4. **Whether llama.cpp has an exact analogue of `ollama#15502`** — degeneration
   inside a free-text string field under `response_format`. I searched and
   found only the tool-call variant (#21375). Absence of a report is not
   absence of a bug. **Settle:** `npm run eval` against llama-server on the
   existing corpus, N=3, watching the degeneracy detector's hit rate.
5. **GGUF model URLs, sizes, checksums and weight licence terms.**
   `huggingface.co` and `ai.google.dev` are both blocked from this container,
   exactly as in the two prior research passes. Unchanged gap.
6. **Ollama's `LICENSE`.** Assumed MIT, not read this session. Read it before
   bundling anything of theirs.
7. **miniaudio / stb_vorbis / BoringSSL / better-sqlite3 licence texts.** Named
   in §6.1 from prior work and general knowledge, not read. They must be read
   before `THIRD-PARTY-LICENSES.md` is written, not while it is being written.
8. **Tauri #11992's behaviour today.** I confirmed the issue is still open with
   no workaround in the thread; I did not test whether current Tauri actually
   still fails, because signing is deferred and this container cannot build a
   macOS app.
9. **Everything about how any of this behaves on a Mac.** No build, no signing,
   no run. Same standing limitation as every other research document here.

---

## 9. Sources

Fetched 2026-08-24 unless noted.

**This repository (read directly, today)**
- `server/src/ai/ollama.ts`, `model-picker.ts`, `types.ts`, `index.ts`,
  `whisper.ts`
- `server/src/routes/health.ts`, `transcribe.ts`, `draft.ts`
- `shared/src/health.ts`, `health.test.ts`, `wav.ts`
- `docs/decisions.md`, `docs/PLAN.md`, `docs/agents/M8-installer.md`,
  `docs/agents/M7-packaging.md`
- `docs/research/m8-bundling-2026-08.md`, `m3-preflight-2026-08.md`,
  `local-ai-stack-2026-08.md`

**llama.cpp (`ggml-org/llama.cpp@master`, via raw.githubusercontent.com)**
- `tools/server/README.md` — `json_schema`, `response_format`, `--offline`,
  `--no-webui`, `--host` default, `--context-shift` default, router mode,
  `--sleep-idle-seconds`, `--reasoning-budget`, `chat_template_kwargs`,
  `timings` / `usage`, SSE streaming, `repeat_penalty` default 1.1,
  `cache_prompt` default true
- `common/chat.cpp` — `common_chat_params_init_gemma4`,
  `common_chat_params_init_ministral_3`, `has_response_format`,
  `parser.build_grammar(...)`, the fenced-JSON grammar
- `common/jinja/caps.h` — `chat_template_caps` fields
- `tools/server/server-common.cpp` — `response_format` parsing (l.1162),
  `ERROR_TYPE_EXCEED_CONTEXT_SIZE` → HTTP 400 (l.51)
- `tools/server/server-context.cpp` — the context-exceeded refusal (l.3091),
  `send_error` (l.1925)
- `tools/server/server-task.cpp` / `server-task.h` — `finish_reason`,
  `n_prompt_tokens` / `n_ctx` in the error body
- `src/llama-model-loader.cpp` — `gguf_init_from_file`, GGUF-only loading
- Releases index — current tag **b10603**, 2026-08-23

**Issue trackers (github.com, via the fetch tool)**
- `ollama/ollama#15502` — open, 2026-04-11, repetition loop under constrained
  JSON
- `ggml-org/llama.cpp#19051` — closed as not planned, 2026-01-23, silent
  fail-open on grammar parse failure
- `ggml-org/llama.cpp#21375` — closed as not planned, 2026-04-03, repetition
  loop with the peg-gemma4 parser during tool calls
- `tauri-apps/tauri#11992` — **open**, 2024-12-17, `externalBin` codesigning /
  notarization failure

**Frameworks**
- `tauri-apps/plugins-workspace` — `v2/plugins/updater/README.md`,
  `v2/plugins/single-instance/README.md`
- `electron/electron` — `docs/api/auto-updater.md`, `docs/api/crash-reporter.md`,
  `docs/api/session.md` (the macOS spellchecker no-op)

**Runtimes and platform**
- `nodejs.org/api/single-executable-applications.html` — stability 1.1, native
  addons, `__filename`, platform support
- `developer.apple.com` DocC JSON —
  `bundleresources/information-property-list/lsmultipleinstancesprohibited`
- Search-engine consensus (tagged [single] in the text) — `swiftc` in Command
  Line Tools; LaunchServices activating a running instance on re-launch
