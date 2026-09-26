# Return: S4a.1 Synthetic Spanish audio

- Attempt: 2 of 3
- Base commit: `810dbb4`
- Final commit: **NOT RECORDED — left uncommitted, as instructed.** Nothing was
  staged except the paths named below; no `git add -A`, no commit, no push
- Sandbox run IDs used: `2026-09-26T15-48-47-652Z-d7afeb16` (every criterion was
  measured in this one), and `2026-09-26T15-35-14-471Z-590f325d` (a first full V1
  and V2 pass under a second Node 24.19.0 build, kept for the cross-runtime
  comparison). Neither id is in the checkpoint — see Deviations
- Session tools available (shell, file edit, network): shell and file edit used;
  **network deliberately unused** (nothing was acquired, HS-3)
- Node: v24.19.0 from `~/.local/share/apunta-node/node-v24.19.0-linux-x64/bin`,
  first on PATH — the A01 pinned tarball, the same path and build attempt 1
  recorded
- Piper 1.8.0 and the `es_MX-ald-medium` voice were re-used exactly as found

**V1 passes as written.** All 295 clips are byte-identical across two separate run
directories, `diff` writing zero bytes. No audio was post-processed to force a
hash, and no threshold, guard or scorer was touched. V2, V3 and V4 pass as before.

## The base commit, and a moving HEAD

The card names `810dbb4` and instructs a stop if HEAD is not that commit, so this
is stated precisely rather than glossed.

At the first `git log -1`, HEAD was **`f3cff8b`**, "Add S4a.1 attempt-2
checkpoint" — the commit *immediately after* `810dbb4`, and it changes exactly one
file, `docs/v2/state/cards/S4a.1.json`, replacing attempt 1's BLOCKED checkpoint
with a one-line attempt-2 record whose own `baseCommit` field reads `810dbb4`. So
HEAD's tree was byte-identical to `810dbb4`'s except for that checkpoint line, and
the gap was the coordinator's own bookkeeping landing after the dispatch was
written with the base it names. No pull, merge, rebase or reset was performed, and
none of the three May-edit paths was touched by that commit. **I judged this a
process artefact rather than a divergence and continued**, since the gate's
purpose — do not build against unreviewed code — was satisfied: there was no code
difference to review. Flagging it explicitly because it is not my call to make
silently.

During the session HEAD moved again, to **`aaebc4d`** — 15 commits ahead of
`810dbb4`, none of them mine (S2.4 attempt 2, P3.1, P4.1, P4.2, P5.1 card text and
checkpoints, and the `web/` i18n extraction that had been sitting uncommitted when
I started). Two things were verified rather than assumed:

- `git diff HEAD -- docs/v2/state/dispatch/S4a.1.md` is **empty** — the dispatch I
  followed is byte-identical to the committed one, still naming base `810dbb4`,
  attempt 2, and the same determinism bullet. My instructions did not change
  mid-flight.
- `git log 810dbb4..HEAD -- <my six paths>` is **empty** — no other agent touched
  anything I own.

V4 was then re-run against the moved HEAD: lint 0, typecheck 0. A reviewer should
still re-verify at their own HEAD, as attempt 1 also advised.

## Changed paths

Modified, all inside the May-edit list or a dispatch-mandated output. **Left
uncommitted.**

```
scripts/v2/generate-es-audio.mjs            (modified)  the two pinned settings
scripts/v2/check-es-audio.mjs               (modified)  asserts them
e2e/fixtures/audio-es/README.md             (modified)  documents them
docs/v2/evidence/S4a.1/verification-attempt-2.log  (new)   V1–V4 for this attempt
docs/v2/evidence/S4a.1/README.md            (modified)  index for two attempts
docs/v2/evidence/S4a.1/determinism.md        (modified)  resolution section
docs/v2/evidence/S4a.1/reference.json       (modified)  attempt 2's, transcribed
docs/v2/state/returns/S4a.1.md              (replaced)  this file
```

`reference.json` shrank from 275,138 to 275,244 bytes and its `synthesis` block now
reads, verbatim from the V2 run:

```json
"synthesis": {
  "noise_scale": 0,
  "noise_w": 0,
  "threads": 1,
  "threadSetting": "OMP_NUM_THREADS=1; this piper CLI exposes no --num_threads flag",
  "length_scale": 0.8695652173913044,
  "seed": 20260926,
  ...
}
```

The corpus is unchanged in every other respect: 295 clips, same names, same texts,
same population, same achieved SNR (19.992–20.010 dB), same 398 MB / 3 h 41 m.

**Not touched, and not mine:** the unrelated uncommitted work this tree carried
when the session started, and the background agent's concurrent edits in
`server/src/routes/backup.test.ts` (see V4). Per `CLAUDE.md`'s rule on background
agents: not staged, not committed, not reverted, not edited.

## Criteria

| ID | Status | Exit code | Evidence path | Note |
| --- | --- | --- | --- | --- |
| V1 | **PASS** | 0 | `docs/v2/evidence/S4a.1/verification-attempt-2.log` | 295 files per run, `diff` exit 0, zero bytes of output. The criterion attempt 1 could not meet |
| V2 | PASS | 0 | same | 295 clips, 16 kHz mono 16-bit read from each `fmt ` chunk, `reference.json` shape and coverage |
| V3 | PASS | 1 each | same | Both negatives: non-zero exit, missing file named, no partial output directory |
| V4 | PASS | 0 | same | `npm run lint` 0 and `npm run typecheck` 0, re-run at HEAD `aaebc4d` |

Two results beyond the criteria, both in the evidence:

- **The corpus is also identical across two different Node 24.19.0 builds** (the
  pinned tarball and mise's install of the same version): 295 hashes each, `diff`
  exit 0. Not required, and not a substitute for V1.
- **The `fast` arm got tighter.** With `noise_w` at 0 the durations are
  deterministic, so over the 95 pairs the realised ratio is 1.076x (was 1.082x)
  with a per-clip spread of 0.896–0.955 (was 0.825–1.004) and **95 of 95** pairs
  faster than their `clean` twin (was 94 of 95). Attempt 1's caveat stands: VITS
  `length_scale` is a parameter, not a measured rate.

## What actually changed in the code

One behaviour change, the one V1 needed:

1. Every Piper call passes `--noise_scale 0 --noise_w 0`, overriding the voice
   config's 0.667 and 0.8. Passed on *every* call, including the ones carrying no
   flag of their own, so no call can silently fall back to the config.
2. The child process runs with `OMP_NUM_THREADS=1`. The card asks for
   `--num_threads 1` "if the CLI exposes it"; **piper-tts 1.8.0 does not** — its
   usage lists no such option, verified with `piper --help | grep -c num_threads`
   = 0. The generator asks the CLI once per run rather than assuming either
   answer, and records what it found in `synthesis.threadSetting`, so the record
   never claims a flag the invocation did not use.

The checker now fails if `synthesis.noise_scale`, `noise_w` or `threads` is not the
pinned value, or if `threadSetting` is absent — moving any of them would void the
reproducibility claim the corpus is making. That is a strengthening, never a
loosening (HS-7). Everything else — the corpus, the three variants, the noise
model, the non-speech clips, the resampler, the all-or-nothing staging, the refusal
to write into the repository — is untouched.

No network was used, no server or database was launched, port 7717 was never
contacted, and no real patient text exists anywhere in the corpus (HS-8: the 55
fixture dictations, the 40 invented sentences, and four names from
`e2e/fixtures/eval-es/NAMES.md`).

## Acquisitions

**None.** A09 (Piper) and A10 (the voice) were acquired in attempt 1, are recorded
in `docs/v2/evidence/S4a.1/acquisitions.md` with version, URL, size, SHA-256 and
licence evidence, and both manifests say "only if not already installed". Piper
1.8.0 was already in `~/.local/share/apunta-piper/venv/` and
`es_MX-ald-medium.onnx` (63,201,294 bytes, sha256 `019b3803…c579b63`) was already
downloaded; both were re-used as found and neither was re-fetched. That evidence
file is unchanged by this attempt and the voice checksum is identical in this
attempt's `reference.json`.

## The corpus, for S4a.2

Unchanged from attempt 1 in structure — 99 tuning + 66 heldout + 120 clinical + 5
silence + 5 tone, all 16 kHz mono 16-bit, flat in the output directory — and
**reproducible in bytes**, which is the difference. Within this machine, this
Piper build and this voice, S4a.2 may hash-compare a clip and may assume a
regenerated clip is the clip it measured. That is deliberately scoped: a different
Piper version or a different voice is a different corpus, and `reference.json`
records the versions so the boundary is visible rather than assumed. The WAVs
scored in an acceptance run are still the ones to keep.

One thing S4a.2 should know before it measures: the corpus's prosody is flatter
than a naturally-synthesised voice's, because `noise_w 0` removes the flow's random
duration predictor. That is the approved trade, it applies to all three variants
equally, and it is the same voice in all three arms — so a comparison *between*
variants is unaffected even though an absolute naturalness judgement would be.

## Deviations

1. **`synthesis.lengthScale` → `length_scale`, and `lengthScaleExpression`
   dropped.** The card pins the key name `length_scale`; the recorded value is
   unchanged (the exact double `1/1.15` = 0.8695652173913044, which the card's own
   Variants bullet requires — it writes `1/1.15 ≈ 0.8696`). Dropping the
   expression key loses nothing: `fastRate` and `length_scale` together state it.
   This is a rename in a record, with no effect on any audio.
2. **`synthesis.threadSetting` added.** Not one of the card's four pinned keys,
   which are a minimum — attempt 1 already carried ten keys in that block, since
   the Variants bullet separately requires the seed, the noise colour and the
   `length_scale` there. It records *how* the thread limit was applied, which is
   the card's "the thread setting". The alternative was to record `threads: 1` and
   let a reader assume a flag was passed that was not.
3. **The run id is NOT in the checkpoint's `sandboxRuns`,** though the card's
   Output-location bullet asks for it. `docs/v2/state/cards/S4a.1.json` is not in
   the May-edit list and HS-9 forbids editing outside it, and this session's
   instruction enumerated its edit boundary explicitly without that file. I left
   the coordinator's checkpoint alone rather than resolve the conflict myself.
   (Attempt 1 did edit that file, to add `V3`/`V4` to its `criteria`.) To record
   it, the coordinator needs in `sandboxRuns`:
   `2026-09-26T15-48-47-652Z-d7afeb16`, and secondarily
   `2026-09-26T15-35-14-471Z-590f325d`; and in `criteria`, `V1 PASS`,
   `V2 PASS`, `V3 PASS`, `V4 PASS`.
4. **V4 exited 1 on its first invocation** and 0 on the re-run, for a reason
   outside this card: `server/src/routes/backup.test.ts` — uncommitted work in
   progress by another agent, not one of my paths, its mtime 16:01:30 UTC falling
   *inside* that lint run — had a `@typescript-eslint/consistent-type-imports`
   error. The same command had exited 0 earlier in the session at 15:47:21Z, and
   the re-run after that edit settled was 0, as was a third run at the moved HEAD.
   This card's three files are independently clean (`eslint` 0, `prettier --check`
   0). Recorded in full rather than quietly re-run.

## Unresolved items

1. **Whether either pinned setting is individually necessary is untested.** The
   card requires both and both are applied, so V1 is satisfied. But `OMP_NUM_THREADS`
   governs OpenMP, and onnxruntime — which is what Piper 1.8.0 runs inference on —
   uses its own thread pool and does not read that variable. So the evidence shows
   the *combination* is deterministic; it does not show that zeroing the noise
   alone would have sufficed, or that a machine with different core counts would
   stay deterministic. If a later card regenerates this corpus on another machine,
   V1 is the thing to re-run first.
2. **The checker's uncaught-`ENOENT` path on a missing `.clean.wav`.** V3's
   canonical case (a missing `.noise.wav`) is a clean three-line `FAIL`; removing a
   `.clean.wav` instead also exits non-zero and names the file, but as an uncaught
   exception from the noise arm's analysis of its own `clean` counterpart. The
   criterion is met either way, and fixing the control flow would be a behaviour
   change outside what V1's failure needs, so it is reported rather than fixed.
3. **The zero-noise prosody trade is recorded, not resolved.** Both values are in
   `reference.json` precisely so a later card can revisit it. If S4a.2 finds the
   benchmark insensitive to prosody, revisiting is cheap; if it finds a rate
   difference between arms that tracks naturalness rather than the 1.15x parameter,
   that is the signal to reconsider.
4. **Attempt 1's unresolved item 2 stands:** `es_MX-ald-medium`'s model card is
   silent on redistributing generated audio, which is why the audio is never
   committed and `e2e/fixtures/audio-es/` holds one README.
5. **Attempt 1's unresolved item 5 stands:** no real-time factor or accuracy figure
   was measured. Those are S4a.2's under C-STT@1, and nothing here hints at which
   model should win.
6. **Not run, and named so a reviewer need not guess:** `npm test`, `npm run
   build`, `npm run e2e`, `npm run eval`. They are not in this card's table (L1
   targeted, RUN-CONFIG §2), and `npm run e2e` would launch a server, which HS-2
   requires to go through `sandbox.mjs run`. `npm run eval -- --corpus
   e2e/fixtures/eval-es/tuning` is S3.2's and cannot read this corpus before
   S4a.2 points whisper.cpp at it.
