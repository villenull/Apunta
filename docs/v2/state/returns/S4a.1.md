# Return: S4a.1 Synthetic Spanish audio

- Attempt: 1 of 3
- Base commit: `f790709` — **verified with `git log -1` before the first edit**
  (`f7907097d5e7f8b8e1e3eecf3ff37c69a5aa706e`, "Clarify S4a.1 variant clause per IR
  round 3 (AM-027)"), on `feature/v2`. No pull, merge, rebase or reset was
  performed at any point in this session.
- Final commit: **NOT RECORDED — left uncommitted, as instructed.** Nothing was
  staged; `git diff --cached` is empty.
- Sandbox run IDs used: `2026-09-26T07-56-35-573Z-d8c6425b` (a first generator
  run, superseded and deleted — it found a naming defect in the ten non-speech
  clips), `2026-09-26T08-02-09-673Z-3bb2745c` (V1), `2026-09-26T08-10-30-297Z-b6b732eb`
  (V2), `2026-09-26T08-15-43-980Z-cdb778bf` (V3). All on port 7807, all recorded
  in the checkpoint's `sandboxRuns`.
- Session tools available (shell, file edit, network): shell, file edit and
  network all used. Network use is bounded by HS-3: `pypi.org` /
  `files.pythonhosted.org` for A09 and `huggingface.co` (redirecting to the CDN
  host `us.aws.cdn.hf.co`) for A10. Nothing else was fetched.
- Node: v24.19.0 from
  `$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin`, first on PATH for
  every command in this session.

**Headline: the card is implemented and V2, V3, V4 pass. V1 fails, and it fails
for the reason the card's Stop conditions name: `piper-tts` 1.8.0 does not
synthesise byte-deterministically. Reported below, in the evidence, and not worked
around.**

## The one thing to decide

V1 expects identical SHA-256 per file across two run directories. It gets 10
identical clips out of 295 — the five silence and the five tone clips this script
writes itself — and 285 that differ, which is exactly the whole Piper population.
`reference.json` and all 295 file names are identical. The cause is inside
`es_MX-ald-medium.onnx`, which takes no noise tensor and draws its own randomness
per run, and piper exposes no seed for it; with `--noise-scale 0 --noise-w-scale 0`
the same sentence **is** byte-identical run to run, which is the proof.

`docs/v2/evidence/S4a.1/determinism.md` has the experiments, and it also sets out
the three things I deliberately did **not** do: post-process the audio to force a
hash (the card forbids it), relax A09's "newest release on acquisition day" rule
(ACQUISITION §1 says a worker applies the rule and never replaces it), or zero
Piper's `noise_scale`/`noise_w` in the corpus — which *would* make V1 pass, and
would change the voice, because zeroing the flow's noise removes the duration
variation that gives a VITS voice its natural timing. That is a change to what
"clean" means, and it is not an implementer's to make.

**The question for you:** does acceptance need byte-reproducible audio? If it does,
the options are an amendment pinning a deterministic Piper (possibly a version
other than 1.8.0, which would need A09's row changed) or an amendment to the
variant design. Either way it is an amendment, and until one exists S4a.2 should
score the audio in the run folder where it was rendered and must not hash-compare
a regenerated clip against a measured one.

## Changed paths

`git diff --name-only f790709..HEAD` is **empty** and `git status --porcelain` for
my paths shows only `??`, because nothing was committed and nothing was staged.
The complete set of paths this session created:

```
scripts/v2/generate-es-audio.mjs       (new)  the generator, 295 clips
scripts/v2/check-es-audio.mjs          (new)  the corpus checker
e2e/fixtures/audio-es/README.md        (new)  the corpus documentation
docs/v2/evidence/S4a.1/README.md       (new)  what the evidence folder holds
docs/v2/evidence/S4a.1/verification.log(new)  V1-V4, commands, exits, times, excerpts
docs/v2/evidence/S4a.1/acquisitions.md (new)  A09/A10: version, URL, size, SHA-256, licence
docs/v2/evidence/S4a.1/determinism.md   (new)  the V1 failure, isolated
docs/v2/evidence/S4a.1/reference.json  (new)  the V2 run's reference.json, verbatim
docs/v2/state/returns/S4a.1.md         (new)  this file
docs/v2/state/cards/S4a.1.json         (edited) status, criteria, sandboxRuns, side effects
```

**No generated audio is in the repository, and none can be.** The generator refuses
an `--out` inside the repo, and L-POLICY row 4 forbids committing it anyway: no
voice's model card permits redistributing generated audio
(`docs/research/es-mx-speech.md` §5.4). The 407 MB of WAVs stay in the sandbox run
folders.

**Not touched:** `web/`, `prototype/`, `server/`, `shared/`, every other card's
files. `web/` had another agent's out-of-band UI work in flight for most of this
session; two of its files failed `prettier --check` and I did not format them
(see V4). No `web/` file was read, staged, committed or modified by this session.

**Not committed, deliberately.** The dispatch's hard stop HS-4 and the return
template both say so, and the uncommitted tree is what the instruction-review and
implementation-review passes need. **None of this card's paths is staged.** The
index does hold five staged modifications — `docs/v2/evidence/P0.5/{V1,V2,V3,findings}.md`
and `docs/v2/state/returns/P0.5.md` — which belong to another agent's P0.5 work and
were already staged when this session's last check ran; I did not stage them, did
not commit them and did not touch them.

### A note on HEAD moving

HEAD was `f790709` when I started, as verified. While this session ran, the
coordinator and another agent committed four times on `feature/v2` — `3fe5351`,
`99437f6`, `b4514c0` (P0.4/P0.5 state) and, later, `b366be1` and `7918381` (the
AM-028 UI baseline and its AM-030 Prettier fix) — so HEAD is now `7918381`. **I did
not pull, merge, rebase, reset or commit, and none of those five commits is
mine.** I checked that nothing I read or wrote moved under me:

```
$ git diff --stat f790709..HEAD -- docs/v2/state/dispatch/S4a.1.md \
    docs/v2/state/cards/S4a.1.json e2e/fixtures/eval-es \
    docs/research/es-mx-clinical-glossary.json docs/research/es-mx-speech.md \
    scripts/v2/sandbox.mjs scripts/v2/check-es-fixtures.mjs \
    scripts/synthetic-acceptance/generate-audio.mjs e2e/fixtures/audio/README.md
 docs/v2/state/cards/S4a.1.json  |  4 ++--
 docs/v2/state/dispatch/S4a.1.md | 11 ++++++-----
```

The only two paths that moved are the coordinator's own bookkeeping in the
dispatch header and the checkpoint's own fields. The card's Objective, Read, May
edit, Fixed decisions, Verification and Stop conditions are byte-identical to what
I implemented against. All three of my files are new and depend on nothing the
coordinator committed. A reviewer should still re-verify at whatever HEAD they
review from.

## Criteria

| ID | Status | Exit code | Evidence path | Note |
| --- | --- | --- | --- | --- |
| V1 | **FAIL** | 1 | `docs/v2/evidence/S4a.1/verification.log`, `determinism.md` | 10 of 295 clips identical; the 285 that differ are exactly the Piper population; `reference.json` and all 295 names identical |
| V2 | **PASS** | 0 | `docs/v2/evidence/S4a.1/verification.log` | 295/295 clips, 99/66/120/5/5 population, stderr empty |
| V3 | **PASS** | 1 and 1 | `docs/v2/evidence/S4a.1/verification.log` | Both negatives name the missing file; no output directory left behind |
| V4 | **PASS** | 0 | `docs/v2/evidence/S4a.1/verification.log` | Exit 0 — but see the three runs recorded there |

### V1 — FAIL, and why it is not a defect in the implementation

`sha256sum *.wav` over two independent run directories. The ten non-speech clips
and `reference.json` are byte-identical. The 285 Piper-synthesised clips are not,
for the mechanism isolated in `determinism.md`: `es_MX-ald-medium.onnx` takes
`input`, `input_lengths` and `scales` and nothing else, so the VITS flow's duration
and width randomness is drawn inside the graph on every run, and piper 1.8.0 has no
seed for it (`grep` finds `seed`/`random` in `piper/train/` only, and `piper
--version` is not an option — it prints usage and exits 2). Two runs of one
sentence differ in duration too, 178,220 against 170,028 bytes. Two runs of the
same sentence with `--noise-scale 0 --noise-w-scale 0` are identical.

This is the card's Stop condition, quoted: *"V1 failing on a correct
implementation because Piper's synthesis is not byte-deterministic for the pinned
version: report it (do not post-process the audio to force a hash)."* That is what
this is. V1 is recorded FAIL, not PASS, because a criterion that did not hold did
not hold.

### V2 — PASS

`node scripts/v2/generate-es-audio.mjs --out <sandbox>/audio-es` then
`node scripts/v2/check-es-audio.mjs --audio <sandbox>/audio-es`, exit 0, stderr
empty. The checker is not a tautology: it walks each file's RIFF chunks (it does
not assume the `data` chunk is at offset 36 — ffmpeg only writes it there because
of the `bitexact` flags the generator passes) and asserts PCM, 1 channel, 16,000 Hz,
16-bit, a non-empty data chunk of whole samples and no trailing bytes; it asserts
the pinned `reference.json` shape and the pinned `synthesis` constants; it asserts
all six fields of all 295 clips with a `source`-specific `category` domain and a
per-source file-name pattern; it checks coverage in both directions and that the
directory holds nothing else; it re-derives the 99/66/120/5/5 population; it
matches the 55 dictations back to `e2e/fixtures/eval-es/` by name **and** by
whitespace-collapsed text; and it checks the non-speech arm's content, so a silence
clip with a sample in it, or a silent tone clip, fails.

The SNR figure is exact and it is the generator's, not the checker's: the `noise`
arm is the `clean` arm of the same run plus the noise, so the generator can
difference the pair it holds. Achieved **19.995..20.008 dB** against 20 dB
specified, across 95 clips. The checker can only compare each noise clip's RMS with
its clean counterpart (±3 dB band; observed 0.04..0.05 dB) because the two arms are
independent Piper runs — and the log says so rather than implying it measured the
SNR.

### V3 — PASS

Both negatives, both outside the shipped tree, in a sandbox run folder:

1. A copy of the V2 corpus with `clinical-negation-07.noise.wav` removed → exit 1,
   `FAIL clinical-negation-07.noise.wav: listed in reference.json but missing from
   the output directory`, plus the two population counts it disturbs.
2. `PIPER_MODEL=/nonexistent.onnx node scripts/v2/generate-es-audio.mjs --out
   <fresh-dir>` → exit 1, `generate-es-audio: PIPER_MODEL does not exist:
   /nonexistent.onnx`, and **no directory of that name exists afterwards**. The
   generator validates the binary, the model, the output path and the corpus before
   it creates anything, then stages and renames; so both a refusal and a crash
   leave the target path absent.

### V4 — PASS, and the honest version of how it got there

`npm run lint && npm run typecheck` exits 0. It did not, on the first two attempts,
and the log keeps all three runs. The first attempt also flagged my two new
scripts, which I reformatted with `npx prettier --write` on explicit paths. The
second flagged only `web/src/components/BrandWordmark.tsx` and
`web/src/routes/Settings.tsx` — another agent's out-of-band UI baseline, outside
this card's May-edit list, which I did not touch. The third passed because that
agent committed `7918381` ("Fix Prettier debt in AM-028 UI baseline (AM-030)")
while I was writing evidence. Because `npm run lint` is an `&&` chain, its last
two stages never ran under the failing attempts; both were run explicitly and
both exit 0 (`check-no-external-urls.mjs`, `collect-licenses.mjs --check`).
`npm run typecheck` exited 0 on all three runs.

**Not run, and named so nobody has to guess:** `npm test`, `npm run build`,
`npm run e2e`, `npm run eval`. None is in this card's table — it is an L1 targeted
card whose four rows are V1–V4 — `npm run e2e` launches a server and so would need
`sandbox.mjs run` rather than a bare command, and `npm run eval -- --corpus
e2e/fixtures/eval-es/tuning` is S3.2's and has nothing to read this corpus until
S4a.2 points whisper.cpp at it.

## Acquisitions

Two items, both named by this card, both development-only and **not shipped**,
both outside the repository at `~/.local/share/apunta-piper/`. Full evidence with
checksums, URLs and licence text: `docs/v2/evidence/S4a.1/acquisitions.md`.

| ID | Item | Version | Size | SHA-256 | Licence evidence |
| --- | --- | --- | --- | --- | --- |
| A09 | `piper-tts` wheel for manylinux_2_17/2_28 x86_64, from `files.pythonhosted.org` | **1.8.0** (newest on 2026-09-26) | 34,131,442 bytes | `25b4d3f31ff70c8fa7151908e00aaa5650cbdf16bca8fcf21299f3941b89a7d3` | metadata `License: GPL-3.0-or-later`; full GPL v3 text ships in the wheel (`dist-info/licenses/COPYING`, 35,148 bytes, `CuBIWlvTemPmNgNZZBfk6w5lMzT6bH-TLKOg6F1K8ic`); bundled g2pW under Apache-2.0. Dev-only, unshipped — L-POLICY's development-only row allows any OSI licence including GPL |
| A10 | `rhasspy/piper-voices` → `es/es_MX/ald/medium/es_MX-ald-medium.onnx` | 22,050 Hz, medium, 1 speaker | 63,201,294 bytes | `019b3803293c93e34a206dd2e53a3889209a514e786fd7144f7b70196c579b63` | model card read in full: training dataset `rmcpantoja/Ald_Mexican_Spanish_speech_dataset` under the **Unlicense**; repo tag `license: mit`; **silent on redistributing generated audio** |
| A10 | `es_MX-ald-medium.onnx.json` (voice config) | — | 4,878 bytes | `5a71498158e04afc8099bfd019c7e87c68eb9d042505a2b1a87e5c1ac2b1a61d` | as above |

- A09's rule is "newest release on acquisition day, only if not already
  installed". Piper was **not** installed (`command -v piper` empty), so the
  install ran; `python3 -m venv`, no sudo, no system package. The chosen voice's
  SHA-256 is the one in every `reference.json` this card produced.
- The Hugging Face download redirected to `us.aws.cdn.hf.co`, a CDN host A10
  allows; the `.onnx.json` resolved on `huggingface.co` itself.
- **`es_ES` was not needed.** A10 allows it only if no `es_MX` voice exists; two
  `es_MX` speakers exist and the card's Fixed decision pinned exactly one,
  `es_MX-ald-medium`. `ald/x_low` was not used because its card states no dataset
  licence; `es_MX-claude` because apache-2.0 is a weaker position than the
  Unlicense here.
- **The licence question that answers "no".** L-POLICY row 4 allows committing
  generated fixtures only if the voice's model card permits redistributing
  generated audio. `es_MX-ald-medium`'s does not, and neither does any of the other
  four cards read for §5.4. The repo's MIT tag covers the repository's files and
  the Unlicense covers the training recordings; neither is card permission. So the
  audio is generated into the sandbox and never committed — and the note in
  `es-mx-speech.md` §7 that relaxing this is a question for a Mexican lawyer
  stands unaddressed by this card.
- **Not acquired:** no `en_US` voice (P3.5's row), no extra `es_MX`, no `es_ES`, no
  Ollama model, no whisper.cpp model or build, no dictionary, no Rust toolchain.

## The corpus, for S4a.2

295 clips, 16,000 Hz mono 16-bit PCM, flat in the output directory (so V1's
`sha256sum *.wav` glob is not vacuous), 3 h 41 m, 407 MB, 13,324 words in the
`clean` arm. `reference.json` from the V2 run is at
`docs/v2/evidence/S4a.1/reference.json`.

| Population | Clips | `source` | `category` |
| --- | --- | --- | --- |
| `eval-es/tuning/`, 33 dictations × 3 | 99 | `tuning` | the trap type (11) |
| `eval-es/heldout/`, 22 dictations × 3 | 66 | `heldout` | the trap type (11) |
| 40 clinical sentences × 3 | 120 | `clinical` | `drugs`/`doses`/`negation`/`numbers` |
| 5 silence + 5 tone, `clean` only | 10 | `silence`/`tone` | `silence`/`tone` |

Regenerate with the two commands in `e2e/fixtures/audio-es/README.md`. Point
`--audio` at `<sandbox-run>/audio-es` from your own run.

Three things in the corpus that S4a.2 should know rather than rediscover:

1. **`negation` has an internal 5 + 5 split, in file order.** `clinical-negation-01..05`
   carry an explicit negation the transcript must retain; `06..10` state the risk
   affirmatively, so a negation in the transcript that is absent from `text` is an
   insertion. C-STT@1's "negations retained 100%" and "inserted negations 0" are
   both computable from `category` plus `text`; this ordering just makes the split
   readable without inferring it.
2. **`fast` is a `length_scale`, not a measured 1.15x.** The card pins
   `length_scale` 1/1.15 and the generator passes exactly that, but VITS'
   `length_scale` is not linear: the realised total is 4,195.8 s against the clean
   arm's 4,540.3 s, i.e. 1.082x, with a per-clip ratio from 0.825 to 1.004 and 94
   of 95 pairs faster than their clean twin. Report the realised ratio if you
   report a rate.
3. **The clips are not byte-stable.** See V1.

## Deviations

One, and it is additive rather than a change of behaviour.

**`reference.json` carries a fifth top-level key, `synthesis`.** The card pins the
file's shape as `{"version":1,"piper":…,"voices":[…],"clips":[…]}`, and separately
requires the generator to write "the RNG seed constant, the noise colour, the
`length_scale` and the Piper version" into it. Those two requirements cannot both
hold in four keys: the seed, the noise colour and the `length_scale` have nowhere
else to go, and dropping them would fail a pinned decision (HS-7). So `synthesis`
was **added alongside** the four pinned keys, none of which was removed, renamed
or changed: `version` is still `1`, `piper` still the Piper version (which satisfies
the fourth of the four required values), `voices[]` still exactly
`{name, sha256, bytes}`, and `clips[]` still exactly the six pinned fields in the
pinned order. `synthesis` holds `seed`, `noiseColour`, `noiseSnrDb`,
`noisePowerReference`, `fastRate`, `lengthScale`, `lengthScaleExpression`,
`sourceSampleRate`, `sampleRate`, `channels`, `bitsPerSample` and the ffmpeg
version line. Both scripts treat all five as required, so a corpus without it
fails. If the coordinator prefers the four-key shape exactly, the alternative is to
fold the four required values into each `voices[]` entry, which would change a
pinned shape instead — that seemed worse.

Choices the card left open, all recorded in the two scripts and in the evidence:

- `ffmpeg` resampler flags: `-ar 16000 -ac 1 -c:a pcm_s16le -map_metadata -1
  -fflags +bitexact -flags:a +bitexact`. The `bitexact` pair matters — without it
  ffmpeg writes a 26-byte `LIST`/INFO chunk before `data`, so the header is not the
  canonical 44 bytes and the encoder's identity leaks into a sample. The card
  fixed the tool, the rate, the channels and the depth, which is what the review
  said a worker may decide; ffmpeg cannot change any criterion's outcome.
- The noise's power reference. 20 dB SNR is measured against the clip's
  **speech-active region** — the first through the last sample at or above
  −40 dBFS of the clip's peak — rather than the whole file, because Piper pads a
  dictation with digital silence and whole-file RMS would put the noise
  correspondingly further under than the spec says. One threshold constant, stated
  in `reference.json` as `noisePowerReference`, and the noise is added across the
  whole clip.
- Noise PRNG: a 32-bit xorshift written out in the script, seeded per clip from
  the constant mixed with an FNV-1a hash of the clip id, using only integer
  arithmetic, `+ - * /` and `Math.sqrt` (which ECMA-262 requires to be correctly
  rounded). No library PRNG and no implementation-approximated libm call, because
  the property V1 is about is that the same script on the same machine emits the
  same bytes. The white noise is uniform in [−1, 1), scaled so its *measured* mean
  square is the target, not assumed to be.
- The noise arm is the `clean` arm plus the noise rather than a third synthesis:
  the two arms of a dictation then differ only by the noise, and a third of the
  Piper work is saved. It saves 190 Piper calls per run instead of 285.
- Non-speech content: 5 silence clips of 1–5 s of digital silence; 5 tone clips of
  1–5 s at 220/330/440/550/660 Hz, amplitude 0.25, with 20 ms raised-cosine fades
  so a tone clip has no click transient to transcribe. The card fixed the count
  (5 and 5) and the rate, not the content.
- Four of the ten `drugs` sentences name a patient, from
  `e2e/fixtures/eval-es/NAMES.md`; the other six do not. No new name was invented
  and no other corpus was read.

## Unresolved items

1. **V1, and the determinism question behind it** — the open decision described at
   the top. Until the coordinator rules, the corpus is reproducible in structure
   and not in bytes.
2. **`es_MX-ald-medium`'s model card is silent on generated audio.** Not a defect
   in this card — it is the finding that forces "never commit", and it is why
   `e2e/fixtures/audio-es/` holds one README. `es-mx-speech.md` §7.2 and §7.4
   leave the underlying legal question open for a Mexican lawyer; nothing here
   touches it.
3. **A stale checkpoint row in the coordinator's own file.** `S4a.1.json` listed
   only `V1` and `V2` under `criteria`; I added `V3` and `V4` so the checkpoint
   agrees with the card's four-row table.
4. **HEAD moved five times under this session** (coordinator and another agent,
   none of it mine). Nothing I read or wrote changed, and the diff is in this
   return file, but a reviewer should re-verify at their own HEAD.
5. **Not measured, and outside this card:** the real-time factor and accuracy
   figures. Those are S4a.2's, against real whisper.cpp models under C-STT@1, and
   nothing here should be read as a hint about which model wins.
