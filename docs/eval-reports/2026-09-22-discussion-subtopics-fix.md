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
  grounding/stripping bug. A temporary prompt sentence explicitly requiring
  two label-only lines was measured against the prior prompt on the real
  `qwen3.5:4b-q4_K_M`; neither run produced labels for the synthetic two-topic
  request. The sentence was removed because it did not improve that gate and
  its extra prompt token was not justified by the check. The existing
  real-model result therefore remains a quality limitation and a human
  live-note check, not an automatic-fix claim.

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

## Real-model A/B check

Both runs used disposable ports (`7794` with the temporary sentence and
`7795` without it), disposable seeded databases, and the local
`qwen3.5:4b-q4_K_M`. `npm run check:format` reported **0 flags across 6
fixtures** in each run. The single-topic fixtures stayed one prose block with
no over-splitting in both runs. A direct synthetic two-topic draft also
returned one prose block with **zero labels** in the with-sentence run; the
same check-format corpus has no dedicated two-topic case, so this direct
request was used for that gate. The no-sentence check-format run likewise
produced no labels in its multi-fact Discussion. One retraction fixture's
optional group sentence differed between runs, consistent with model
sampling; it did not change the 0-flag result and is not attributed to the
prompt sentence.

## Focused evidence

Focused tests passed after the parser change:

```
npx vitest run server/src/ai/clinical-knowledge/discussion-subheadings.test.ts --pool=threads --maxWorkers=1
# 1 file, 27 tests passed

npx vitest run server/src/ai/clinical-knowledge/integration.test.ts server/src/routes/generate.test.ts server/src/routes/chat.test.ts --pool=threads --maxWorkers=1
# 3 files, 66 tests passed

npx vitest run server/src/ai/clinical-knowledge/discussion-subheadings.test.ts server/src/ai/clinical-knowledge/integration.test.ts server/src/ai/prompts.test.ts server/src/routes/generate.test.ts server/src/routes/chat.test.ts --pool=threads --maxWorkers=1
# 5 files, 144 tests passed
```

The new parser tests cover the two-topic unlabeled reproduction, inline label
normalization, ordinary-colon sentence conservation, unsupported and lone
inline-label removal without prose loss, and inflectional duplicate rejection.
No additional real-model rerun is needed: the parser reproduction is
deterministic, and the disposable A/B check above is sufficient evidence that
the zero-label two-topic result is upstream model behavior.
