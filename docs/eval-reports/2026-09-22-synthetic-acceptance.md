# Synthetic end-to-end acceptance — 2026-09-22

## Scope and privacy boundary

This is a Linux-only, disposable acceptance run. No live patient UI, live
SQLite database, live recording, export, vocabulary, or live port 7717 was
opened. The real-model instance used port **7790** with
`APUNTA_DATA_DIR=/tmp/apunta-synth-db`; its copied Ollama service used
`127.0.0.1:11436` and a copied control blob. A separate fake-AI recorder
transition run used port **7792** and `/tmp/apunta-synth-fake-db`.

Inference was local only. The runtime was stopped/released to ModelCompare
before its four-arm comparison. Mac hardware and a physical microphone were not
tested; this report makes no such pass claim.

## Reproduction identities

- Revision at run: fresh integrator production build with the current
  CaptureUX surface. The bounded final-build browser run below supersedes the
  earlier looped capture evidence; it still records a real 4B retraction
  failure.
- Writing model: `qwen3.5:4b-q4_K_M`, Ollama model digest
  `2a654d98e6fba55d452b7043684e9b57a947e393bbffa62485a7aac05ee4eefd`, copied
  weight blob SHA-256
  `81fb60c7daa80fc1123380b98970b320ae233409f0f71a72ed7b9b0d62f40490`.
- Ollama: local `0.34.2`, isolated `OLLAMA_MODELS=/tmp/apunta-ollama-synth`.
- Speech binary: `/home/villenull/.local/bin/whisper-cli`, SHA-256
  `39963aa8395951e0be54862ec614a87acf11ccb04d7ffec52c90c5a65d96dbfb`.
- Speech model: `ggml-tiny.en.bin`, SHA-256
  `921e4cf8686fdd993dcd081a5da5b6c365bfde1162e72b08d75ac75289920b1f`.
- Synthetic TTS: isolated Piper `v1.2.0` Linux amd64 archive SHA-256
  `467c17935d2a22dcce9dc9e08ba07485e29be813097e7cf08c5627aa09d32e42`;
  voice `en_US-lessac-medium.onnx` SHA-256
  `5efe09e69902187827af646e1a6e9d269dee769f9877d17b16b1b46eeaaf019f`;
  voice JSON SHA-256
  `efe19c417bed055f2d69908248c6ba650fa135bc868b0e6abb3da181dab690a0`.
  These remain outside Git under `/tmp/apunta-piper`.
- Generated WAV: 19.21 seconds, 847,240 bytes, SHA-256
  `91322c3ac3747661a91915f760c779612c971aff36300e3e2475e6543c36a7ef`.
  The source script and cases are checked in at
  `e2e/fixtures/synthetic-acceptance/`; regenerate with
  `scripts/synthetic-acceptance/generate-audio.mjs` and the two `PIPER_*`
  environment variables shown in that script.

The read-aloud script intentionally contains pauses, `um`/`hmm`, a repeated
word, a correction (`four hours`, then `six hours, not four`), a safety
negation, a number, and a future action. Whisper's standalone transcript was:

> Um, the client said the sleep was better this week, but, um, she woke at four
> hours actually scratch that, six hours, not four. Home she denied suicidal
> thoughts and she plans to call on Tuesday. She repeated that the morning
> meeting was cancelled, cancelled before correcting herself. The afternoon
> meeting was cancelled.

## Browser microphone path

Chromium was launched with
`--use-fake-device-for-media-stream`, `--use-fake-ui-for-media-stream`, and
`--use-file-for-fake-audio-capture=/tmp/apunta-synthetic-dictation-padded.wav`.
The padded input is the 18.71-second Piper speech followed by 3 seconds of
exact PCM zero (21.71 seconds total; 957,524 bytes; SHA-256
`d9dc14f6995a8a7f6eff4eb01b48717d8db452c3f017926a86305cef7a72ae4f`),
generated with `PIPER_PAD_SECONDS=3` by
`scripts/synthetic-acceptance/generate-audio.mjs`. The browser must stop at
20.5 seconds, before the 21.71-second file reaches EOF; the zero tail prevents
Chromium's fake device from looping the speech before the stop. This is the
one-shot strategy for the corrected rerun; the first run used the unpadded file
and was left recording too long, as noted below.
The page therefore opened a real `getUserMedia` stream; Apunta's actual
`MediaRecorder`, WAV encoder, multipart upload, preview requests, final
transcription, and draft route ran. This was not an uploaded-WAV shortcut.

### Real 4B recording and refine-microphone outcomes

| Case | Action and observed result | Outcome |
|---|---|---|
| Sentence once → preview → stop/final replacement | Initial real capture on 7790 showed growing preview and a single final Discussion block; this was useful transport evidence but the clip was accidentally looped to 76 seconds and is superseded by the bounded final-build run below. | **Transport pass; quality superseded** |
| Spoken repetition | The source deliberately says `cancelled, cancelled`; standalone Whisper and the final draft retained the repeated source phrase before the correction. The model's final prose did not duplicate the whole preview. | **Pass, with normal prose normalization** |
| Start → stop → start | On the fake-AI disposable instance, two successive New note recordings each reached a persisted draft; the second start opened a fresh recorder after the first stop. No recorder remained stuck. | **Pass (transport/state path; fake AI)** |
| Cancel → start | Opening refine-chat dictation and closing the chat removed the recording panel and left the note/chat unchanged. A subsequent start remained available. | **Pass (transport/state path; fake AI)** |
| Delayed stale preview | A request-interception trial delayed the first preview response while later preview cursors advanced. The final note remained a single non-duplicated draft and was not overwritten by the delayed response. The fake provider's canned preview itself repeated its canned sentence while slices accumulated; that is expected fixture behavior, not a final-note duplication. | **Pass for stale-final protection; preview text is approximate** |
| Refine-chat microphone | On real 4B, the shared chat microphone opened the same recording panel, previewed speech, stopped, and placed the returned transcript into the composer without sending it. The composer value contained the correction and safety sentence; the thread remained at its initial assistant message. | **Pass** |
| Real 4B recording and retraction | The initial looped run preserved six hours/safety/Tues/afternoon in broad prose but rendered “six hours instead of four”; the bounded final-build run below is the authoritative result and failed the strict retraction gate. | **See bounded run** |

The real recording log measured Whisper final transcription at 1,574 ms for the
76-second browser clip (the browser was left recording while the acceptance
surface was inspected; the source WAV loops in Chromium). Preview slices were
roughly 70–120 ms each in the server log. These are this Linux disposable
instance's timings, not Mac or physical-microphone claims.
### Corrected bounded final-build run

After the integrator's fresh production build, a temporary Playwright runner
used Chromium's fake-file capture with the padded WAV and stopped from inside
the browser after **20,509 ms**, before the 21.71-second file could loop. The
server received a 20.22-second, 16-kHz recording; the stored transcript was
323 characters and contained one copy of the speech, proving the bounded
capture (no loop). Full raw transcript:

> The client said the sleep was better this week, but, um, she woke at four
> hours actually scratched that. Six hours, not four. Home, she denied suicidal
> thoughts, and she plans to call on Tuesday. She repeated that the morning
> meeting was cancelled, cancelled, before correcting herself. The afternoon
> meeting was cancelled.

The actual persisted 4B note was inspected from the disposable SQLite row:

> Discussion: Dana reported that her sleep was better this week, though she
> corrected herself from six hours to four hours; she denied suicidal thoughts
> and plans to call on Tuesday. She noted that the morning meeting was
> cancelled, then added that the afternoon meeting was also cancelled.

This run proves the real final-build browser/Whisper path and one-shot capture,
but exposes a **real retraction/number failure**: the model reversed the
correction and retained the withdrawn morning-meeting wording. It is a blocker
for grounded retraction acceptance, not a pass. Final local timings were
Whisper 619 ms, Ollama generation 2,300 ms end-to-end (model load 1 ms warm),
and one attempt with `doneReason=stop`.
### Retraction attribution

The audio/transcript boundary is clear: Whisper produced `four hours actually
scratched that. Six hours, not four`, so the six-to-four reversal was **not**
introduced by Whisper. The raw transcript row retained the full marker and
both numbers. The current narrow marker recognizer matches the spoken phrase
`scratch that`, not this inflected transcript token `scratched that`; therefore
`hasRetraction` did not trigger, no extraction call ran, and no persisted
`AppliedRetraction` quote or retraction notice appeared in the disposable chat
row. The first observed reversal occurs in the 4B note sentence, which says
“corrected herself from six hours to four hours”; the note also carries the
withdrawn morning-meeting wording. This is a genuine model/retraction-path
failure to keep open, not a reason to alter the fixture, marker list or
comparison prompt.
ModelCompare then replayed this exact final Whisper transcript through all four
authorized writing models in `scripts/model-comparison/results/critical-app-matrix.jsonl`
(raw SSE retained, runtime aliases recorded). All four failed the strict
critical retraction gate, but the failures differ: the 4B reversed six to
four and retained the morning wording; the 2B preserved the six-hour number
but dropped the safety denial and Tuesday action while retaining the morning
wording; Bonsai 8B and Bonsai 4B retained old/retracted content and invented
additional planning. Do not treat this as proof of one common prompt-path
cause or as a candidate-specific adoption win.


## Drafting and grounded Discussion/refine cases

ModelCompare completed a frozen current-control matrix with the recovery
owner-progress instructions. Raw records are in
`scripts/model-comparison/results/discussion-matrix.jsonl`; its strict rescore
is recorded in the same artifact. The result is **3 pass / 1 fail**:

- `single-topic-prose`: pass; one plain Discussion block and no label.
- `two-topics-labels`: **fail**; the full raw Discussion was one prose block
  with zero label lines, so it does not satisfy the required two lowercase
  source-grounded labels.
- `withdrawn-topic-not-label`: pass; the withdrawn topic did not appear.
- `sentence-conservation`: pass; six hours and the forward breathing-exercise
  action remained.

The earlier direct two-topic call was made against a manually created format
with **empty instructions** and omitted the sleep topic; that is configuration
misuse, not passing acceptance evidence. The earlier browser recording used
that same empty-instruction format and still produced a complete
corrected/safety-grounded note through the route's default-instruction fallback,
but it is not evidence that the explicit label requirement passed.

The browser outcomes are machine-readable in
`scripts/synthetic-acceptance/browser-results.json`; strict retraction and
two-topic label gates are deliberately marked `partial`/`pending` rather than
silently omitted. This acceptance's focused real-model matrix did not exercise
refine-chat label-only/header or raw-transcript cases; the separate
four-model app checks now record guarded label preservation, no header edit,
and a neutral no-resurrection pass in
`scripts/model-comparison/results/neutral-refine-probe.json`. Existing
automated regression coverage is separate evidence: the repository's
clinical-knowledge and chat suites cover normalization, retraction grounding,
question-vs-edit behavior, fact locks, and stale preview guards with fake
providers. They do not replace this report's real Whisper/browser exercise or
real 4B model review.

## Whisper silence follow-up

SilenceFix's focused 44-test suite and real local trials are recorded in
`docs/eval-reports/2026-09-22-whisper-silence.md`. The production change trims
only an exact-digital-zero tail (>=800 ms, retaining 300 ms), rejects all-zero
input before spawning Whisper, and preserves nonzero quiet speech. Piper
`Thank you.` remained present with full-file and bounded-duration runs,
longer synthetic speech was unchanged, and the checked-in tone fixture still
produced repeated `Oh` because it is nonzero through the end. The fix therefore
does not claim to solve arbitrary non-silent noise hallucinations.

## Limitations and handoff

This is synthetic speech, fake-device capture, one Linux host, one tiny English
speech model, and one real 4B writing model. It does not establish accuracy for
a therapist's voice, room noise, accents, a physical microphone, Mac, or any
clinical population. No complex-vocabulary experiment was run; historical
vocabulary evidence remains in the September 20 report and was not changed.
ModelCompare received the exclusive local inference window after Whisper and
acceptance calls ended. The report and machine-readable four-arm artifacts are
owned by that worker. The bounded fresh-build run is complete; no additional
browser smoke is pending for this report. The real 4B retraction failure and
the two-topic label failure remain explicit blockers.
