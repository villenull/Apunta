# tiny.en on clinical vocabulary: first real transcripts

Date: 2026-09-20
Host: `<host>`, Linux x86_64, 8 online CPUs, Radeon RX 9070 XT (Navi 48)
Stack: whisper.cpp `whisper-cli` 1.9.3-dev, CPU build, at
`~/.local/bin/whisper-cli`; Ollama 0.34.2 on ROCm;
`ggml-tiny.en.bin` SHA-256
`921e4cf8686fdd993dcd081a5da5b6c365bfde1162e72b08d75ac75289920b1f` (matches
the pin in `installer/src/catalog.ts`)

**Finding: `tiny.en` — the model that now serves both the live preview and the
note's transcript — got 1 of 7 medication and clinical terms right on the
configuration that is live today.** Ordinary prose, numbers, doses and the
risk negation "denies suicidal ideation" came through on sample 1 at every
model size tried; the failure is specific to drug names and clinical jargon.
The errors are fluent, not garbled: "buspirone fifteen milligrams" came back
as _"Thus, Byron 15 milligrams"_, which reads as a finished sentence. A
six-term vocabulary hint halved the word-error rate and tripled exact drug
recall (1/7 → 3/7), and still missed every term it was not given.

The owner has decided to keep `tiny.en` anyway: his wife is a psychotherapist,
not a prescriber, and medication names are rare in her notes. That decision
and its residual risk are recorded in `docs/decisions.md` (2026-09-20). This
report is the evidence it rests on. No behaviour changed.

These are the first transcripts this project has produced with `tiny.en`. The
2026-09-20 switch to it was pinned and tested in fake mode only.

## Method

Two scripts were written for the purpose. Their content is invented (a made-up
medication review), with no patient text, per CLAUDE.md rule 2. Piper TTS
(`en_US-lessac-medium`) synthesized them to 16 kHz mono PCM WAV: sample 1 is
34.7 s, sample 2 is 22 s.

`whisper-cli` was invoked the way `server/src/ai/whisper.ts` builds the
note-transcript call:

```text
whisper-cli --model <model> --file <wav> --print-progress --threads 8 --language en --prompt <p>
```

`<p>` was rendered as `sttPrompt()` renders it: `STT_LEAD_IN` ("Okay, notes
from today's session.") alone when there is no vocabulary, or followed by
`buildVocabularyPrompt()`'s sentence ("Clinical terms that may come up: …")
when there is. The vocabulary arms used six terms: sertraline, quetiapine,
lamotrigine, aripiprazole, buspirone, lorazepam. `akathisia` was deliberately
**not** among them. The no-prompt arm omitted `--prompt` entirely.

This is the note path: eight threads, full audio context, whisper's default
beam search and fallback. The live preview (greedy, fitted `--audio-ctx`,
half the cores) was not measured separately. It runs on the same file.

Scoring: word-error rate against the spoken script, normalized for number
words ("one hundred" = "100") and casing. "Terms exact" counts the seven
medication and clinical terms in sample 1 (sertraline, quetiapine,
lamotrigine, aripiprazole, akathisia, buspirone, lorazepam) transcribed
correctly, ignoring case.

## Sample 1

Ground truth, as spoken:

> This is a fictional medication review for a made up case. The patient
> continues sertraline one hundred milligrams daily and reports improved mood
> over the past three weeks. We cross tapered quetiapine to fifty milligrams at
> night for sleep, and lamotrigine remains at two hundred milligrams daily with
> no rash. They previously trialled aripiprazole five milligrams but stopped it
> because of akathisia. Buspirone fifteen milligrams twice daily was added for
> residual anxiety, and lorazepam one milligram is reserved for panic, used no
> more than twice weekly. Denies suicidal ideation. Follow up in four weeks.

**Arm A — `tiny.en`, lead-in prompt only.** This is today's live behaviour:
no vocabulary list exists yet, so the prompt is the lead-in sentence alone.

> This is a fictional medication review for a made-up case. The patient
> continues Sertraline 100 milligrams daily and reports improved mood over the
> past three weeks. We cross tapered quasheabying to 50 milligrams at night for
> sleep, and Lamotrigian remains at 200 milligrams daily with no rash. They
> previously trialled a Arabipra's all five milligrams, but stopped it because
> of a kafizha. Thus, Byron 15 milligrams twice daily was added for residual
> anxiety, and Laurie's bam, one milligram is reserved for panic, used no more
> than twice weekly, denies suicidal ideation, follow up in four weeks.

**Arm B — `tiny.en`, lead-in + six-term vocabulary.** Excerpt as recorded:

> ...We cross tapered queciapine to 50 milligrams at night for sleep, and
> lamotrigine remains at 200 milligrams daily with no rash. They previously
> trialled aripiprazole 5 milligrams but stopped it because of acaphysia.
> Buspirin 15 milligrams twice daily was added for residual anxiety, and
> lorry's time. One milligram is reserved for panic...

**Arm C — `tiny.en`, no `--prompt`.** Excerpt as recorded:

> ...We cross tapered quasheyapine ... and Lamotrigian remains ... They
> previously trialled arapeppers all five milligrams, but stopped it because of
> Acrophysia. Thus, Byron 15 milligrams ... and Laurie's bam. One milligram is
> reserved for panic.

The `base.en` and `small.en` sample-1 transcripts were scored but not kept
verbatim; only their scores are below.

| Arm                               |   WER | Terms exact | Missed                                                                 |
| --------------------------------- | ----: | ----------: | ---------------------------------------------------------------------- |
| tiny.en lead-in only (live today) | 14.1% |       1 / 7 | quetiapine, lamotrigine, aripiprazole, akathisia, buspirone, lorazepam |
| tiny.en no prompt                 | 10.9% |       1 / 7 | same six                                                               |
| tiny.en + vocabulary              |  6.5% |       3 / 7 | quetiapine, akathisia, buspirone, lorazepam                            |
| base.en + vocabulary              | 12.0% |       3 / 7 | quetiapine, akathisia, buspirone, lorazepam                            |
| small.en + vocabulary             |  5.4% |       5 / 7 | quetiapine, akathisia                                                  |

## Sample 2

Its ground truth was not recorded with the measurement, so it is not scored.
The `small.en` transcript is the control.

**`tiny.en`, lead-in only (live today):**

> Invented case notes, second example, Laurie Spam was tapered off completely
> last month. She started bus fire and after the Arapeprazole trial failed.
> Quasheabine is helping her sleep. We are holding Lammitridge and steady while
> Certraline goes up to 150. No acothegious since the switch. She denies any
> thoughts of self-harmant has a safety plan in place.

**`small.en` + vocabulary (control):**

> Invented case notes. Second example, lorazepam was tapered off completely
> last month. She started buspirone after the aripiprazole trial failed.
> Quetiapine is helping her sleep. We are holding lamotrigine steady while
> sertraline goes up to 150. No akathisias since the switch. She denies any
> thoughts of self-harm and has a safety plan in place.

On the live configuration, every drug name in sample 2 is wrong, sertraline
included, though it was right in sample 1.

## What the data says

- **The damage is concentrated in drug names and jargon.** On sample 1 the
  prose, the doses (100, 50, 200, 5, 15, 1 mg), the frequencies and "denies
  suicidal ideation" survived in every arm at every size.
- **The errors are fluent.** "Thus, Byron", "Laurie's bam", "bus fire",
  "Laurie Spam" are English words in plausible places. Nothing in the pipeline
  flags them: the drafting model gets them as the transcript and turns them
  into prose, and the refine locks only protect what is already in the draft.
  A garbled token would at least look wrong. These do not.
- **The vocabulary hint is the cheapest lever measured.** Against the live
  configuration it more than halved WER (14.1% → 6.5%) and tripled exact term
  recall (1/7 → 3/7). It needs no new model and no download. It is one setting,
  `stt_vocabulary`.
- **The hint only covers the terms it is given.** `akathisia` was never
  prompted, and on sample 1 it came back wrong in every arm at every size
  ("a kafizha", "acaphysia", "Acrophysia"). Terms she does not think to list
  stay wrong.
- **Even prompted terms can miss on `tiny.en`:** quetiapine, buspirone and
  lorazepam were in the hint and still came back as "queciapine", "Buspirin"
  and "lorry's time".
- **A bigger model helps, but only at `small.en`.** `small.en` + vocabulary
  reached 5/7 and 5.4%. `base.en` + vocabulary scored worse on WER than
  `tiny.en` + vocabulary (12.0% vs 6.5%) with the same 3/7. On one sample that
  ordering is noise, not a finding.

## Speed

Speed was **not** the deciding factor, and the difference would not decide it
on this machine. `tiny.en` transcribed sample 1's 34.7 s in 0.82–1.52 s (23–42x
real time). `small.en` took ~4.0 s (~8x real time). Both are far inside what
the note path needs. The Mac target is untimed for both.

## The rest of the live stack, first measured here

This is the first live-stack measurement on this install:

- Ollama on ROCm, RX 9070 XT: **106 tok/s warm on GPU vs 13.4 tok/s on CPU**,
  with all 34 layers in VRAM.
- Drafting model `qwen3.5:4b-q4_K_M`, digest `2a654d98e6fb`. That is the same
  digest as the M10 baseline (`docs/research/m3-preflight-2026-08.md`,
  `docs/eval-reports/2026-09-08-inference-efficiency.md`), so the eval numbers
  still describe this model.
- Schema enforcement was checked adversarially and held.
- `npm run smoke:live` passed.
- whisper is the CPU build. The ROCm whisper candidate described in
  `docs/eval-reports/2026-09-08-whisper-gpu-candidate.md` and HANDOFF is not
  on this install. Its path (`/home/huyke/...`) does not exist here.

## Caveats

This is a **floor, not an estimate**. There were two samples, one synthetic
voice (Piper's `lessac-medium`), one speaker, clean studio-quality audio, no
accent, no room noise, no crosstalk, no hesitation or self-correction. Real
dictation into a laptop microphone will do worse. A 1/7 drug-name hit rate on
clean TTS audio should be expected to fall on her voice, not rise.

Further limits:

- Only sample 1 was scored. Sample 2's ground truth was not kept.
- The `base.en` and `small.en` sample-1 transcripts were not kept verbatim.
- Seven terms on one sample is too few for a rate. "1 in 7" describes this
  sample, not a population.
- The preview path (greedy, fitted context) was not measured on its own.
- WER normalization covered number words and casing only.

## Revert path

If her real notes turn out to carry drug names often enough to matter, the
switch back is small and code-only. Three things change together:

1. `WHISPER_MODEL_FILENAME` in `shared/src/transcribe.ts` →
   e.g. `ggml-small.en.bin`. Leave `WHISPER_PREVIEW_MODEL_FILENAME` on `tiny.en`
   if the preview should stay small; then the installer fetches two files again.
2. `SPEECH_MODEL` in `installer/src/catalog.ts`: the new URL, whisper.cpp's
   published SHA-1 for the file, and Apunta's own SHA-256 computed after the
   SHA-1 matches, as for `tiny.en` (see `installer/src/checksum.ts`).
3. The same filename and SHA-1 in `scripts/setup-macos.sh` and
   `scripts/preflight-macos.sh`, plus the byte count in HANDOFF and
   `docs/MANUAL-VERIFICATION.md` §7.3.

No `small.en` hash is pinned anywhere in the repo today, so step 2 includes a
real download and verification.
