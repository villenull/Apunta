# English EOD — one real drafting pass through the shipped server

Date: 2026-10-03 · branch `main` · HEAD at the time: `868302c`

**One real `POST /api/generate` against a fresh sandbox server, fake AI off,
`llm_model` written through `PUT /api/settings`, model `qwen3.5:4b-q4_K_M`
resolved from that setting. Exit 0: a `note` event with a note id, the record
readable back from `GET /api/notes/:id` with non-empty bodies, and one refine
turn that persisted.**

This proves **writing-provider availability on the English backend**, nothing
else. See [What this does not establish](#what-this-does-not-establish).

---

## 1. Result

```
run id                        2026-10-04T00-32-31-811Z-7a5534b2
sandbox port                  7847   (bind-checked free before the run, released after)
server                        server/src/index.ts under tsx (source, no global build)
node                          v24.19.0 (pinned, ~/.local/share/apunta-node)
health.fakeAi                 false
health.ollama                 reachable: true
                              tag qwen3.5:4b-q4_K_M, source "promoted", present: true
settings PUT                  llm_model "qwen3.5:4b-q4_K_M", language "en" -> 200
                              llm_effective_profile "quick", llm_available_profiles ["quick"]
                              spanish_available false
POST /api/generate            200, 5 875 ms, stages connecting -> drafting -> saving
                              25 token events, 1 `note` event, 0 `error` events
draft stats (server log)      model qwen3.5:4b-q4_K_M, promptTokens 3569, outputTokens 100,
                              tokensPerSecond 90.9, loadMs 3340, doneReason "stop", attempts 1
GET /api/notes/:id            200, status "draft", locale "en", 343 content bytes,
                              byte-identical to the note carried in the `note` event
POST /api/notes/:id/chat      200, 1 831 ms, outcome "applied", outcome_reason null,
                              reply "I shortened the Discussion section." (35 chars)
GET /api/notes/:id (again)    200, 316 content bytes, changed by the refine: true
thread after the refine       3 rows: assistant first pass, user message, assistant reply
```

Nothing else was configured. No model was pulled, downloaded or installed; no
Ollama restart; no `pkill`; nothing pattern-killed.

## 2. Model selection

The promoted tag and the setting agreed, so the effective model is the promoted
default and `health.ollama.source` reads `promoted`. `PUT /api/settings` with
`{"llm_model": "qwen3.5:4b-q4_K_M", "language": "en"}` returned 200 and the read
back the stored value — the only supported selection route was used, and
`language: "en"` was written explicitly rather than inferred (it is also this
build's default). `spanish_available: false` in the same response: this build
does not offer Spanish and none was asked for.

## 3. Source material

`typed_notes` only — a **clearly typed** input, no `transcript` field, no STT
output and no "correction" of any. The text is P3.5's fabricated dictation,
verbatim from `docs/v2/cards/P3.5.md`:

> Progress note for John Smith. He reports no self-harm thoughts this month and
> denies any intent to harm anyone. He continues the sertraline fifty
> milligrams daily and slept better this week. We reviewed sleep hygiene and set
> a follow-up in four weeks.

John Smith is HS-8's sample person; no other name appears anywhere in the run.

## 4. The generated note, verbatim

`GET /api/notes/01a10454-e6e6-700e-aa49-1fec455f756d` after the draft, exactly
as stored (`\n` shown as line breaks):

```
Location:

Client presentation:

Risk review: John Smith reports no self-harm thoughts this month and denies any intent to harm anyone.

Discussion: He continues the sertraline fifty milligrams daily and slept better this week.

Intervention:

Out of session actions:

Note for next session: Follow-up in four weeks.
```

The server's own `empty_sections` on the `note` event was
`["Location", "Client presentation", "Intervention", "Out of session actions"]`.
Literally: the model wrote the three bodies it produced **under their own
headings repeated inside the body text**, so the content string carries
`Risk review: …`, `Discussion: …` and `Note for next session: …` inline while
the format's own seven headings serialise with four empty bodies. This is
reported as an observation of the output, not scored: the packet measures
completion, and no threshold is invented here.

After the refine the same record is 316 bytes and the `Discussion` body has lost
its final sentence ("We reviewed sleep hygiene."):

```
Client presentation:

Risk review: John Smith reports no self-harm thoughts this month and denies any intent to harm anyone.

Discussion: He continues the sertraline fifty milligrams daily and slept better this week.

Intervention:

Out of session actions:

Note for next session: Follow-up in four weeks.
```

`outcome: "applied"`, `outcome_reason: null`, and the persisted assistant reply
is the server's own sentence: *"I shortened the Discussion section."*

Medication and risk, reported literally because the packet asks for it and
because nothing here is a clinical judgement:

- **Medication:** the input named sertraline fifty milligrams daily. The note
  carries `the sertraline fifty milligrams daily` — same drug, same dose, no
  unit added, no second medication, no invented drug.
- **Risk:** the input's negation survived in form —
  `no self-harm thoughts this month and denies any intent to harm anyone`. No
  positive risk assertion, no SI content, and no risk statement was dropped.

That is a description of what the strings say. Whether the routing of those
sentences into the right sections is clinically acceptable is **not** claimed,
and no benchmark, rubric or threshold was applied.

## 5. Events, in order

`/api/generate`: `status connecting`, `status drafting`, 25 × `token`,
`status saving`, `note`. Stream ended after `note`; no `error` event.

`/api/notes/:id/chat`: `message` (the persisted user turn),
`status connecting` + 4 × `status drafting`, `note-updated`, `token`,
`message` (the persisted assistant reply). Ended after `message`; no `error`
event.

## 6. Reproduction

```bash
export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH"
node --version                                        # v24.19.0
node scripts/v2/sandbox.mjs env --port 7847 > build/eod-real-drafting/env.sh
. build/eod-real-drafting/env.sh
node_modules/.bin/tsx server/src/index.ts > build/eod-real-drafting/server.log 2>&1 &
node docs/v2/evidence/english-eod-real-drafting/real-drafting.mjs
```

`sandbox.mjs env` is the approved isolation guard: it refuses port 7717, refuses
a data folder equal to or inside the platform default, bind-checks the port
before creating the run folder, and mints the `testRunId` the harness then
requires from `/api/health` before it sends anything. `APUNTA_FAKE_AI` was unset
in the environment and the harness refuses to run if it is set at all; the
server also reported `fakeAi: false` independently.

Raw, unedited output is in git-ignored `build/eod-real-drafting/`: `run-output.txt`
(the harness's JSONL plus both SSE bodies verbatim), `02-server.log`,
`03-persisted-note.json`, `04-thread.json`, `05-health-after.json`. The sandbox
run folder `/tmp/apunta-v2/2026-10-04T00-32-31-811Z-7a5534b2` was kept, not
removed.

One correction was made to the harness **after** the run and is recorded here
rather than hidden: the committed `real-drafting.mjs` labels its own line-split
of the stored note as `advisorySections*` and names the server's
`empty_sections` as the authority, because the two disagree on this output for
the reason given in §4. The run's raw `content`, both SSE bodies and every HTTP
status are unaffected — only summary key names changed — so the run was not
repeated. The `section_text*` lines in `run-output.txt` are the harness's own
split and are advisory for the same reason; §4 quotes the stored record itself.


## 7. Containment

- Live instance: never contacted. Port 7717 had no listener before the run and
  has none after; no request was sent to it.
- `APUNTA_DATA_DIR` was the sandbox run folder, 212 KB, one SQLite file at
  migration level 11. The live data directory was never opened.
- Whisper: `health.whisper.binaryPresent: false`, `modelPresent: false`. This is
  a typed-input pass, so no whisper path was configured and no weights were
  copied or written. Nothing was read from any model cache.
- The only Ollama use was inference through the server's own provider. Ollama
  stayed pid 1123 on `127.0.0.1:11434` before and after, `/api/tags` answered 200
  after, and the tag list is unchanged. No restart, no stop, no `pkill`.
- The server started here was stopped by its own pid (`3068350`, plus the child
  `tsx` process `3068364`). Port 7847 was verified released afterwards.

## 8. What this does not establish

- **Not** UI, window or card acceptance. No browser, no AppImage, no clicks, no
  visual assertion. P36's own UI/card work is untouched by this.
- **Not** a clinical-quality measurement, a faithfulness score, or a routing
  verdict. No rubric and no threshold; §4 reports strings, not grades.
- **Not** the Spanish benchmark, and no benchmark hold was touched.
- **Not** a dependency release. Nothing was installed, pulled or unlocked.
- **Not** clipboard, export, recovery or the rest of the capture workflow. Those
  were never exercised here and remain P36's to observe.
- **One** drafting pass and **one** refine turn. There was no retry and no second
  model; had the provider failed, the harness would have stopped and reported the
  failure rather than falling back.
