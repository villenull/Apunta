# M3 — AI provider layer + note drafting

**Depends on:** M2

## Goal

The AI backbone: provider interfaces with fake and Ollama implementations,
prompt assembly, schema-enforced structured output, and the typed-note →
drafted-note flow end to end (streaming). Audio and chat come later but
their interfaces are defined here.

Read `docs/research/local-ai-stack-2026-08.md` §2 and §4 before starting.

## Deliverables

1. `server/src/ai/` with the `LlmProvider` and `SttProvider` interfaces from
   PLAN §5 (define both; implement STT fake only — real whisper is M5).
   Selection in one factory: `PATIENCE_FAKE_AI=1` → fakes; otherwise Ollama
   (base URL `PATIENCE_OLLAMA_URL`, default `http://127.0.0.1:11434`) and
   model from settings (`llm_model` key; default per PLAN §2's RAM table —
   implement the RAM lookup with `sysctl -n hw.memsize` on darwin, fall back
   to the small model elsewhere).
2. **Sections contract** in `shared/`: `buildSectionsSchema(sections)` →
   zod object with one required non-empty string per section,
   `additionalProperties: false`; `sectionsToText` / bestEffort
   `textToSections` serializers matching the prototype's `Section: body`
   blank-line style. Property-based/unit tests including round-trip.
3. `OllamaProvider`:
   - `generateNote`: system prompt = format `instructions` + explicit
     restatement of the JSON schema (field names + what belongs in each) +
     one few-shot example; user message = transcript. Structured output via
     JSON schema (`format` on `/api/chat` or `response_format` json_schema
     on `/v1/chat/completions` — pick one, document why in
     `docs/decisions.md`). `temperature: 0`, `num_ctx: 16384`. Stream
     tokens; on completion, parse + zod-validate; one automatic retry with
     the validation error appended on failure, then a typed error.
   - `detectFormat` per PLAN §4 (used by M6; implement now, schema
     `{name, sections: string[]}`).
   - `refineNote`: implement the request/stream plumbing and prompt builder
     now (M4 wires the UI); schema `{reply, updatedSections | null}`.
4. `FakeLlmProvider`: deterministic and instant. `generateNote` returns the
   prototype's sample SOAP content mapped onto whatever sections the format
   defines; token stream is the text chunked word-wise with no delay.
   `refineNote` mirrors the prototype's canned logic (shorten Plan on
   /plan/i, append to Subjective on /sleep|subjective/i, question → answer
   without update). Keyed only on inputs — same input, same output.
5. Prompt assembly in `server/src/ai/prompts.ts`, snapshot-tested. Default
   format instructions for the seeded formats live in
   `server/src/ai/default-instructions.ts` (concise clinical-note guidance;
   `docs/skill-porting.md` explains how the owner's real skill will replace
   them per-format).
6. `POST /api/generate` (SSE): validates patient/format, stores the
   transcript row (`source: 'typed'` for now), streams `token` events, then
   persists the note and emits a final `note` event with it. Errors emit an
   `error` event with a user-readable message (Ollama down, model missing,
   validation failed twice).
7. Capture screen switches from M2's direct note creation to `/api/generate`
   with a streaming draft preview, then navigates to the workspace with the
   new draft selected (prototype behavior).
8. Health endpoint now real for LLM: Ollama reachable, configured model in
   `GET /api/tags`. Workspace shows a dismissible banner when health says
   the AI is unavailable ("Practice Notes can't reach the local AI — see
   Setup") — full wizard is M7.
9. `npm run smoke:live`: node script that requires real Ollama, generates a
   draft from `e2e/fixtures/transcript-sample.txt`, asserts schema-valid +
   all sections non-empty, prints the note and tokens/sec.

## Acceptance criteria

- Integration tests: /api/generate happy path (fake mode) persists
  transcript + note and streams in order; Ollama-down path returns the error
  event (simulate by pointing the provider at a dead port with fakes off —
  egress guard allows localhost).
- Unit tests: schema builder, serializers round-trip, prompt snapshots,
  fake determinism, validation-retry logic (mock a first invalid response).
- Playwright: typed capture now shows streaming text before landing on the
  workspace draft.
- `npm run smoke:live` documented in README and passing on a machine with
  Ollama (not CI).
- Baseline suite green.
