# Owner voice Test 1

Date: 2026-09-23  
Instance: fictional SANDBOX `http://127.0.0.1:7730` only  

The retained fixture is outside Git at
`~/.local/share/apunta/model-lab/voice-fixtures/test1-owner-voice.wav`; its
sidecar is next to it. No audio is included in this report or committed. The
fixture is the owner's voice reading the fictional Test 1 script. Audio
retention was enabled only on the SANDBOX before the re-recording.

## Transcript and note review

The re-recorded Test 1 row is transcript
`01a0d031-80df-7058-8e63-a1ba41b4c4bf`, note
`01a0d031-80de-70dd-95fa-8a071f7b6603`, 96.30 seconds. The final transcript
has 148 words against 147 reference words: 3 word errors, WER **3/147 =
2.04%**. The minimum alignment is:

- `sister's` → `sister` (substitution), with `is` inserted;
- `the ex` → `her ex` (substitution).

The final transcript still contains the spoken retraction (`four hours ...
scratch that six hours`). The first-pass chat message recorded the server's
retraction notice exactly:

> Apunta applied the corrections you made as you spoke, before drafting: left out “four hours a night” in favour of “six hours”.

`ref_quote` was null; the notice is the persisted evidence of one applied
retraction. The transcript used for the note and the transcript from the
post-fix replay are byte-for-byte identical. The preview-only change therefore
does not change the authoritative final-transcript path.

Checklist against the owner's expected points, with the exact persisted
wording:

| Point | Result | Exact wording / evidence |
|---|---|---|
| Corrected quantity is six hours, not four | **PASS** | `Discussion: The client came to session reporting that her sleep has been better this week, getting about six hours.` No `four hours` appears in the note. |
| Weekend aside omitted | **FAIL** | `She asked about my weekend, and we chatted for a minute, not clinically relevant.` |
| Wedding and work discussion retained (labels optional) | **PASS** | `The main topic was her sister's wedding next month; ...` followed by `We also discussed work, noting her manager has given her more responsibility and she feels good about it.` No separate labels were emitted. |
| Intervention | **PASS** | `Intervention: I used cognitive restructuring around the worry about her ex.` |
| Risk reflects denial | **FAIL** | `Risk review: None.` The spoken denial was not carried into the note. |
| Panic attacks down from 3/week to 1/week | **FAIL** | `Note for next session: Sleep improved to six hours; anxiety about seeing ex at sister's wedding remains an ongoing focus. Weekly meetings continue.` The 3→1 panic finding is absent. |
| No invented “will say if…” line | **PASS** | No such line appears. |
| Weekly cadence kept | **PASS** | `Weekly meetings continue.` |

For historical context, the earlier 70.16-second Test 1 first pass had a WER
of **1/147 = 0.68%**: Whisper substituted `Sasha` for reference `Session`
at the beginning. That explains the earlier note's `Sasha` wording; it was an
STT error in the transcript, not a drafting-only invented name. The later
96.30-second re-record says `Session with test patient` and its note contains
no `Sasha`. The first-pass row was subsequently edited during sandbox testing
and is not used as the current note checklist above.

## Sandbox diagnostics

During the owner's 96-second recording, the shape-only log showed no level-50
or higher errors and no non-completion warning. It recorded the normal
`transcription finished` diagnostic (level 40 in this logger), with 3 low-
probability fallbacks and no high-entropy fallbacks, then `retractions applied`
with `applied: 1`, a successful note draft, and HTTP 200. The earlier startup
`MODULE_NOT_FOUND` line predates the successful sandbox launch and was not part
of this recording.

## Live preview replay

`tools/model-lab/replay-voice-fixture.mjs` replayed the retained WAV against
`:7730` at the browser's schedule (first update at 0.8 seconds, then the
same 250 ms minimum gap and pause-based commits). It captured 382 full-text
updates, with mean text lag **0.125 s** and maximum **0.427 s**.

| Metric | Before | After |
|---|---:|---:|
| Preview updates | 382 | 382 |
| Updates whose already-shown text changed | 105 | 143 |
| Already-shown words later rewritten | 1,922 | 682 |
| Rewritten words / previously shown words | **4.761%** | **1.580%** |
| Repeated n-gram events | 185 | 5 |
| Mean / max text lag | 0.125 / 0.427 s | 0.125 / 0.427 s |

The before/after visual replay for the owner's real recording is:

- `/tmp/preview-replay-before.html`
- `/tmp/preview-replay-after.html`

The exact phrase the owner reported (`she came in saying her sleep has been
better this week`) appeared in five separate short hypotheses in the raw
replay, but never five copies in a single captured full-text update; the
current endpoint therefore did **not** reproduce the exact 5x visual artifact.
The before timeline did reproduce the underlying jumpiness: the rolling tail
was replaced roughly every 250 ms, and full-text comparison counted 1,922
previously shown words rewritten. The after timeline freezes words once they
are older than a four-word tentative tail and removes substantial repeated
n-gram overlap at a commit boundary; it reduced rewrites to 682 and repeated
n-gram events to 5. Deliberate pauses produced the commit cuts (approximately
10.2, 19.0, 27.5, 35.2, 41.0, 49.2, 58.2, 64.0, 70.2, 78.7, 85.7 and
91.5 seconds). The jumps occurred in the provisional tails between those
cuts, not at the cuts themselves, so they do not correlate with pauses.

Root cause: the client rendered the complete newly decoded tail on each fast
preview response. Whisper is allowed to revise a short-window hypothesis, so
already-read words moved whenever the hypothesis was resegmented. The old
client had no stable prefix inside that tail. The fix is client-only: retain a
stable prefix and expose only the last four words as tentative, while keeping
stale-response rejection and the final transcript path unchanged.

The focused regression suite (`web/src/hooks/useLiveRecording.test.ts`) passes
5 tests. The fix commits are `e67a243` and `500544e` on the isolated branch;
cherry-pick both onto `main`.

## Fixture replay tool

Run, for example:

```sh
node tools/model-lab/replay-voice-fixture.mjs \
  --fixture ~/.local/share/apunta/model-lab/voice-fixtures/test1-owner-voice.wav \
  --base http://127.0.0.1:7730 \
  --db ~/.local/share/apunta-sandbox/apunta.db \
  --out /tmp/preview-replay
```

It reads the adjacent sidecar, sends preview slices at the live cadence,
sends the complete WAV through `/api/transcribe` for drafting, reads the
resulting transcript when `--db` is supplied, and prints WER, replay metrics,
and expected-point checks. It writes the two self-contained replay HTML files
and a JSON timeline under the requested output prefix.
