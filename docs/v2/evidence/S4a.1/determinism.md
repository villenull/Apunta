# V1 fails, and why: Piper 1.8.0 is not byte-deterministic

> **RESOLVED IN ATTEMPT 2 (AM-038).** Everything below is attempt 1's record of
> the failure and is kept as written. The owner approved the resolution this file
> argued for: the generator now pins `noise_scale 0` and `noise_w 0` and runs
> single-threaded inference, and **V1 passes as written — 295 of 295 clips
> byte-identical across two separate run directories.** The fix, its evidence and
> what it changes are in "Attempt 2: the repair" at the end of this file, and in
> `verification-attempt-2.log`.
>
> One line below is now superseded and must not be followed: the claim that
> "S4a.2 must not hash-compare a regenerated clip against a measured one" no
> longer holds within this machine, Piper build and voice. The other findings —
> the mechanism, what was deliberately not done, the `fast` arm's realised ratio
> being a parameter claim rather than a measured one — still stand, though the
> ratio's numbers have moved (see the closing section).

**V1 exited 1.** This file is the report the card's Stop conditions ask for:

> V1 failing on a correct implementation because Piper's synthesis is not
> byte-deterministic for the pinned version: report it (do not post-process the
> audio to force a hash).

Nothing was post-processed. The finding is reported, the evidence is here, and the
decision about what to do is the coordinator's.

## What V1 showed

Two generator runs into two separate directories of one sandbox run folder, then
`diff <(cd A && sha256sum *.wav | sort) <(cd B && sha256sum *.wav | sort)`.

| Measurement | Result |
| --- | --- |
| WAV files per directory | 295 and 295 |
| File names identical | yes |
| `reference.json` byte-identical | **yes** |
| Clips with an identical SHA-256 in both runs | **10 of 295** |
| Clips that differ | **285 of 295** |

The 10 identical clips are exactly `silence-01..05.wav` and `tone-01..05.wav` —
the ten this script writes itself. The 285 that differ are exactly the
Piper-synthesised population: 95 `clean` + 95 `noise` + 95 `fast`.

That split is the diagnosis. Every part of the generator that is *ours* is
deterministic: the clip plan and its ordering, the file names, the per-clip noise
seed, the WAV writing, the 16 kHz generation of the non-speech clips, and
`ffmpeg`'s resampling all produce identical bytes run to run. The 285 that move are
the ones that pass through Piper.

## The mechanism

`es_MX-ald-medium.onnx` declares three inputs and nothing else:

```
inputs : [('input', 'tensor(int64)', ['batch_size', 'phonemes']),
          ('input_lengths', 'tensor(int64)', ['batch_size']),
          ('scales', 'tensor(float)', [3])]
outputs: [('output', 'tensor(float)', ['batch_size', 1, 1, 'Unsqueezeoutput_dim_3'])]
```

No noise tensor is passed in: `scales` is the three-element vector
`{noise_scale 0.667, length_scale 1, noise_w 0.8}` from the voice's own config,
and the VITS flow draws its own randomness **inside the graph** on every run.
There is no seed for it. `grep -rn "seed\|random\|default_rng" site-packages/piper/`
finds hits only in `piper/train/` — nothing in the inference path — and
`piper --version` is not even an option in 1.8.0 (it prints the usage and exits 2).

The proof, in three runs of the same sentence
("Buenos días, hoy vamos a revisar la dosis del medicamento."), piper defaults:

| Run | Command | Bytes | SHA-256 (first 16) |
| --- | --- | --- | --- |
| 1 | `piper --model … --output_file t1.wav` | 178,220 | `87dca92aafce91cf` |
| 2 | `piper --model … --output_file t2.wav` | 170,028 | `e887ee40135399d0` |

Not merely different bytes — **different durations**, 71 s versus 68 s of audio
for one sentence, because the flow's random duration predictor is what sets the
timing.

And the confirmation, two runs of the same sentence with the flow's own noise
terms zeroed — no post-processing, a synthesis parameter piper itself exposes:

| Run | Command | Bytes | SHA-256 |
| --- | --- | --- | --- |
| 3 | `piper --model … --noise-scale 0 --noise-w-scale 0 --output_file z3.wav` | 173,612 | `8059d239d17c88fdd55c56206c9c52e4b079143c7d2cf21b623080597dd35872` |
| 4 | as run 3, `z4.wav` | 173,612 | `8059d239d17c88fdd55c56206c9c52e4b079143c7d2cf21b623080597dd35872` |

Identical. So the non-determinism is exactly the flow noise, and nothing else.

## What was deliberately *not* done

- **The audio was not post-processed to force a hash.** No sample was rewritten,
  rounded, requantised or padded, and no metadata was touched. The ten
  non-speech clips being identical is a property of the code, not a fix.
- **A09's selection rule was not relaxed.** `piper-tts` 1.8.0 is the newest
  release on the acquisition day, which is what the manifest's fixed rule requires,
  and ACQUISITION §1 is explicit that a worker applies the rule and never replaces
  it. Substituting 1.3.0, or asking the user for a patched Piper, is not a
  decision this card can make. Whether 1.3.0 happens to be deterministic is
  therefore **unknown and untested** here: testing it would mean acquiring a second
  version outside the selection rule, which HS-3 does not allow me to do on my own
  initiative. If the coordinator wants that answer, it is one `pip install` into a
  throwaway venv away and belongs in an amendment, not in this card.
- **Piper's `noise_scale` / `noise_w` were not zeroed in the corpus.** That would
  make V1 pass, and it would change the audio: zeroing the flow's noise removes the
  duration variation that gives a VITS voice its natural timing, so the `clean`
  arm would no longer be "Piper as found" and the benchmark would be measuring a
  different voice. Those two parameters are not among the card's pinned constants
  — the card pins the seed, the noise colour, the SNR and `length_scale` — and a
  choice that flips a criterion's outcome is a coordinator's, not a worker's.
- **No threshold in the checker was loosened** to hide any of this. HS-7.

## What a reviewer should take from it

- The corpus is **reproducible in structure, not in bytes**: the same 295 names,
  the same `reference.json`, the same texts, the same constants, the same SNR, from
  any machine with the pinned Piper voice — and 285 clips whose samples differ.
- S4a.2 must not hash-compare a regenerated clip against a measured one, and must
  not assume a re-render is the clip it scored. For an acceptance run, the audio
  stays in the run folder and is scored where it was rendered.
- The `fast` arm's claim is a **parameter** claim, not a byte claim. The card pins
  Piper's `length_scale` at 1/1.15 and the generator passes exactly that, but
  VITS' `length_scale` is not a linear rate control: over the 95 pairs in the V2
  run the `fast` arm came out 7.6% shorter in total (4,195.8 s against 4,540.3 s,
  a realised 1.082x), with a per-clip ratio from 0.825 to 1.004 and 94 of the 95
  pairs faster than their `clean` twin. So the arm is real and directional, and
  "1.15x faster" is the requested `length_scale`, not a measured wall-clock rate.
  S4a.2 should report the realised ratio if it reports a rate at all.
- If byte-reproducibility is required for acceptance, the options are an amendment
  to A09 pinning a deterministic Piper, or a change to the variant design agreed
  as a card amendment. Both are coordinator decisions; neither was taken here.

---

# Attempt 2: the repair

Attempt 1 stopped here with V1 failing, which is what the card's Stop conditions
ask a worker to do rather than work around. The coordinator returned the card as
attempt 2 with AM-038, the owner-approved resolution: pin the flow noise to zero
and run single-threaded, keep V1 as written, and record the trade.

## What changed

Two settings, in the generator's Piper call, and nothing else:

- **`--noise_scale 0 --noise_w 0` on every call.** The voice's own config supplies
  0.667 and 0.8; these override both. Passed on *every* call, including the ones
  that carry no flag of their own, so no call can fall back to the config.
- **`OMP_NUM_THREADS=1` in the child environment.** The card asks for
  `--num_threads 1` "if the CLI exposes it", and piper-tts 1.8.0 does not — its
  usage lists no such option (`piper --help | grep -c num_threads` is 0). The
  generator asks the CLI once per run rather than assuming, and records what it
  found in `synthesis.threadSetting`, so the record never claims a flag the
  invocation did not use.

The `synthesis` block gained `noise_scale`, `noise_w`, `threads` and
`length_scale` under the card's pinned key names, and the checker now fails if any
of the three determinism values is not the pinned one — moving them would void the
reproducibility claim the corpus is making.

## What it cost, and what it bought

The mechanism attempt 1 identified is confirmed, not theorised: zeroing the two
noise terms is exactly what removes the non-determinism, and nothing else was
needed. V1 now passes with `diff` writing zero bytes across 295 files per run.

**The cost is prosody.** Zeroing `noise_w` removes the flow's random duration
predictor, so the timing variation that makes a VITS voice sound natural is gone.
The corpus is synthetic ASR material for an ASR benchmark, which is the trade the
owner approved, and both values are in `reference.json` so it can be revisited.

One consequence is worth recording because it is a measurement, not a claim. With
`noise_w` at 0 the durations are deterministic, so the `fast` arm's realised rate
is no longer scattered by that randomness. Over the 95 pairs of the attempt-2 V2
corpus:

| | attempt 1 (`noise_w` 0.8) | attempt 2 (`noise_w` 0) |
| --- | --- | --- |
| `clean` total | 4,540.3 s | 4,424.9 s |
| `fast` total | 4,195.8 s | 4,110.8 s |
| realised ratio | 1.082x | 1.076x |
| per-clip ratio | 0.825 – 1.004 | 0.896 – 0.955 |
| pairs faster than `clean` | 94 of 95 | **95 of 95** |

So attempt 1's caveat survives in the form that matters — VITS `length_scale` is
not a linear rate control, "1.15x faster" is the requested parameter and not a
measured wall-clock rate — and the arm is if anything more reliable: every pair is
now faster than its `clean` twin, and the spread is half as wide. S4a.2 should
still report the realised ratio rather than the nominal one.

## What a downstream card can now rely on

Within this machine, this Piper build (1.8.0) and this voice, the corpus is
byte-reproducible, so a transcription may be compared against a clip's hash and a
regenerated clip may be assumed to be the clip that was measured. The superseding
of attempt 1's "must not hash-compare" is scoped exactly that narrowly: a
different Piper version or a different voice is still a different corpus, and
`reference.json` records the versions so that boundary is visible rather than
assumed. The WAVs scored in an acceptance run are still the ones to keep.
