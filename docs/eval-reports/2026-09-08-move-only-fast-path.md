# Deterministic move-only refine fast path

Date: 2026-09-08

## Scope

The chat route now has a deliberately narrow, deterministic shortcut for a
single post-draft move. It never invokes the LLM and edits only a draft through
the existing conditional `UPDATE`; published notes, races that publish before
the write, disconnected streams, and every rejected request retain the normal
route behavior.

Supported syntax is:

```text
Move "exact text" from Source to Target
```

Straight or typographic quotes are accepted. `the` and `section` may surround
the explicitly named source and target, for example `Move “exact text” from
the Subjective section to the Plan section.` The phrase must be non-empty,
have no leading or trailing whitespace, match exactly once in the named source
(case-sensitive, with word boundaries), and not already occur in the target.
Source and target must be different, unique valid format sections present in
the current note. The move preserves the quoted phrase verbatim and leaves
other section content untouched apart from the necessary source removal and
target separator.

Anything outside that grammar falls back to the existing LLM path: questions,
negations, unknown or duplicate spans, same-section/no-op moves, multiple
instructions, clinical or tone requests, unsupported review questions, and
ambiguous section structure. The shortcut does not answer questions or
perform clinical review. Existing boilerplate and dropped-fact guards still
run before the fast-path write; if either rejects the proposed move, the
request falls through to the existing provider path.

## Quality coverage

The bounded targeted run covered 56 synthetic parser/route cases plus the
existing chat route suite (90 tests total in the combined run). Cases include
prompt-injection and multi-intent suffixes, unknown and duplicate sections,
duplicate source/target spans, no-op and already-present phrases, exact case
and word-boundary checks, numbers, dates, risk negation, clinical/tone review,
questions, published locking, atomic draft-only writes, guard invocation, and
the cancellation checks around the SSE write.

The fast path keeps the UI contract in this order: user message, busy/status,
committed `note-updated`, then the token and persisted assistant message. The
existing client awaits the note update callback before releasing the assistant
completion.

## Shape-only timing

Measured locally on synthetic text only; no note or user content was logged.
Times are wall-clock microseconds from `performance.now()`, after module
startup, using Node 26.7.0 in the repository workspace.

| Path | Samples | p50 | p95 |
| --- | ---: | ---: | ---: |
| Pure exact-operation parser/apply | 1,000 | 2.18 µs | 6.80 µs |
| Fast-path route via Fastify inject + SQLite | 100 | 1,082.8 µs | 1,545.5 µs |

These are absolute synthetic measurements, not a comparison with LLM latency,
and they include no Whisper or GPU work. The GPU Whisper agent owns load
benchmarks.

## Verification command

```text
npm exec vitest run --config server/vitest.config.ts \
  server/src/routes/chat.test.ts \
  server/src/routes/refine-fast-path.test.ts \
  server/src/routes/refine-fast-path.route.test.ts
```

