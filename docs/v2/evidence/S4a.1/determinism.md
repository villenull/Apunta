# V1 fails, and why: Piper 1.8.0 is not byte-deterministic

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
