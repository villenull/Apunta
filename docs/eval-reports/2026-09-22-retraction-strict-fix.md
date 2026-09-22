# Strict retraction fix — 2026-09-22

## Finding

The bounded Linux acceptance run exposed a strict retraction failure with a
synthetic transcript captured through Chromium, Whisper and the local writing
model. The raw transcript was:

> The client said sleep was better this week, but, um, she woke at four hours
> actually scratched that. Six hours, not four. Home, she denied suicidal
> thoughts, and she plans to call on Tuesday. She repeated that the morning
> meeting was cancelled, cancelled, before correcting herself. The afternoon
> meeting was cancelled.

The existing recognizer matched `scratch that` but not Whisper's transcript
spelling `scratched that`. Consequently `hasRetraction` returned false, no
extraction call ran, no `AppliedRetraction` or notice was persisted, and the
writing model received the uncleaned transcript. The model then reversed the
correction and retained withdrawn meeting wording. The original browser and
model-comparison artifacts remain unchanged in
`scripts/model-comparison/results/critical-app-matrix.jsonl` and
`scripts/synthetic-acceptance/browser-results.json`; the full attribution is
in `docs/eval-reports/2026-09-22-synthetic-acceptance.md`.

## Reproduction and fix

`server/src/ai/retractions.test.ts` now keeps a synthetic regression fixture
with `woke at four hours actually scratched that. Six hours, not four.` and a
verbatim correction quote. Before the fix, the focused test failed because
`hasRetraction` was false (`15 passed, 1 failed`).

The fix keeps `RETRACTION_MARKER_SOURCE` unchanged. Marker discovery now uses
one shared matcher for both `hasRetraction` and application, and recognizes
Whisper's exact `scratched that` inflection as an ASR spelling of the existing
`scratch that` marker. It does not add a new semantic marker or relax quote
validation: the withdrawn text must still occur verbatim in the transcript,
end within the existing gap, and only the quoted span plus marker is cut.

For the fixture, the applied result is:

```text
The client said sleep was better, but she actually. Six hours, not four. Home she denied suicidal thoughts.
```

The existing character-conservation, verbatim-quote, distance, nearest-quote,
marker-group, and non-marker tests remain in the same focused suite.

## Verification

Command:

```text
npx vitest run server/src/ai/retractions.test.ts
```

Result after the fix: **1 test file passed, 16 tests passed**. No real patient
text, export, live instance, or persistent user data was accessed.
