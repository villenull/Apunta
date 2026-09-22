# Discussion subtopics and label formatting — 2026-09-22

## Scope

This is a synthetic-only follow-up to the two Discussion findings in the
2026-09-22 integrated acceptance. No live database, patient note, export, or
live port was opened. The existing real-model artifact remains
`scripts/model-comparison/results/discussion-matrix.jsonl`; its two-topic case
returned one prose block with zero labels, while the single-topic and
withdrawn-topic cases passed.

## Reproductions and root causes

Two synthetic cases preserve the findings as regression tests:

- A two-topic Discussion returned as one prose block remains byte-for-byte
  prose (`outcome: none`). The server cannot safely infer topic boundaries from
  unlabeled prose without inventing a split. This is model behavior, not a
  grounding/stripping bug. The clinical guidance now states the conditional
  requirement more explicitly: when the model decides there are genuinely
  distinct topics, it must emit at least two label-only lines; one topic still
  must have no label. The existing real-model result therefore remains a
  quality limitation and a human live-note check, not a claim of an automatic
  fix.

- Small models sometimes put prose on the same line as a plain label, such as
  `sleep: She slept better.`. The server previously recognized only standalone
  plain labels (or decorated Markdown/bold forms), so this output bypassed
  normalization and did not match the owner's format. Plain lowercase inline
  labels are now recognized and rendered as a short lowercase `label:` line
  followed by prose. An ordinary sentence such as `John reports: sleep is
  better.` remains untouched.

The server still grounds every content word in current-session source, rejects
reserved and generic/unsupported labels, removes lone labels, and preserves
all prose when labels are removed. Inflectional duplicate labels (for example,
`sleep:` and `sleeping:`) are treated as one topic and stripped rather than
presenting a false two-topic split.

## Evidence

Focused tests passed after the change:

```
npx vitest run server/src/ai/clinical-knowledge/discussion-subheadings.test.ts --pool=threads --maxWorkers=1
# 1 file, 27 tests passed

npx vitest run server/src/ai/clinical-knowledge/integration.test.ts server/src/routes/generate.test.ts server/src/routes/chat.test.ts --pool=threads --maxWorkers=1
# 3 files, 66 tests passed
```

The new parser tests cover the two-topic unlabeled reproduction, inline label
normalization, ordinary-colon sentence conservation, unsupported and lone
inline-label removal without prose loss, and inflectional duplicate rejection.
The integration test covers the strengthened conditional prompt guidance.
No real-model rerun was needed: the parser reproduction is deterministic, and
the existing disposable real-model artifact is sufficient evidence that the
zero-label two-topic result is upstream model behavior.
