# Implementation review: S4a.1 Synthetic Spanish audio

Role: **IMPLEMENTATION REVIEWER.** Attempt 2 of 3, a separate session. Base
`810dbb4`, head `5ccb9eb`, branch `feature/v2`. Node **v24.19.0** exported first
on every row (`$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin`,
verified: `command -v node` → that path, `node -v` → `v24.19.0`). Piper 1.8.0
and `es_MX-ald-medium` were re-used as found and nothing was re-fetched. Nothing
was fixed, pulled, merged, rebased, reset, staged or committed; the working tree
was left exactly as found. I started from the diff and the evidence, then
re-measured every row myself.

## Step 1 — HEAD, and the base the dispatch names

- **HEAD is `5ccb9eb`** (`5ccb9ebf66fb987cb0c31fe8630cf4867a5b8c36`) on
  `feature/v2`, and it is the S4a.1 attempt-2 commit ("S4a.1 attempt 2:
  deterministic synthesis, corpus reproducible (card S4a.1)"). ✅
- **The base `810dbb4` is not the head's parent.** `git log 810dbb4..5ccb9eb` is
  15 commits, and 14 of them are other cards (S2.4 attempt 2, P3.1, P4.1, P4.2,
  P5.1 card text and checkpoints, the `web/` i18n extraction, the S4a.1
  attempt-2 checkpoint `f3cff8b`, the coordinator's own state commit
  `8057679`). So `git diff 810dbb4..5ccb9eb` is 127 paths and almost none of them
  are this card's. The S4a.1-attributable change is exactly commit `5ccb9eb`,
  and I reviewed that (finding 1).
- **The working tree is not clean**, as in every review in this series: 3 modified
  dispatch files, 2 modified `server/src` files, and ~21 untracked
  `docs/v2/**`, `scripts/v2/`, `server/src/platform/` paths from parallel
  agents. **Not one of them is an S4a.1 path**, and I left all of it alone per
  `CLAUDE.md`'s rule on background agents. `git log 810dbb4..5ccb9eb --
  scripts/v2/generate-es-audio.mjs scripts/v2/check-es-audio.mjs
  e2e/fixtures/audio-es docs/v2/evidence/S4a.1 docs/v2/state/returns/S4a.1.md`
  names only `5ccb9eb` plus the two coordinator commits, so no other writer
  touched what I reviewed.

## Environment and isolation (recorded because every row depends on it)

```
node        v24.19.0   ~/.local/share/apunta-node/node-v24.19.0-linux-x64/bin/node  (A01 tarball, first on PATH)
npm         11.17.0
ffmpeg      n9.0.1     /usr/bin/ffmpeg                        (ACQUISITION §2, used as found)
piper       1.8.0      ~/.local/share/apunta-piper/venv/bin/piper  (A09, reused)
voice       es_MX-ald-medium  63,201,294 bytes
            sha256 019b3803293c93e34a206dd2e53a3889209a514e786fd7144f7b70196c579b63  (A10, reused)
```

I confirmed the voice checksum myself before running anything; it matches the
`reference.json` under review. No network was used, no server, database or app
was started, port 7717 was never contacted, and nothing outside a sandbox run
folder was written. Sandbox run folders, both from
`node scripts/v2/sandbox.mjs env --port 7807`, output written to
`$(dirname "$APUNTA_DATA_DIR")/audio-es*`:

| Row | Sandbox run id | Window (UTC) |
| --- | --- | --- |
| V1 | `2026-09-26T16-16-10-942Z-583b2842` | 16:16:10 → 16:23:18 |
| V2, V3 | `2026-09-26T16-24-29-868Z-74a779d8` | 16:24:29 → 16:27:58 |

One earlier invocation, `2026-09-26T16-12-27-477Z-1b87c015`, is **void**: my own
shell killed the job mid-run when its command timed out, and it left an orphaned
staging folder in its run folder. It is not evidence and I did not use it. Every
number below comes from the two run folders in the table.

## Results

| ID | Status | Exit code | Evidence path | Finding |
| --- | --- | --- | --- | --- |
| V1 | **PASS** | 0 | `<sandbox>/2026-09-26T16-16-10-942Z-583b2842` (`audio-es-a`, `audio-es-b`, `A.sha`, `B.sha`) | 295 WAVs per run, `diff` exit 0 writing **zero bytes**. Attempt 1's criterion now holds |
| V2 | **PASS** | 0 | `<sandbox>/2026-09-26T16-24-29-868Z-74a779d8/audio-es` | generate 0, check 0; 295 clips 16 kHz mono 16-bit, `reference.json` shape and coverage both ways |
| V3 | **PASS** | 1 and 1 | same run folder, `audio-es-copy-one-missing` (deleted after) | each non-zero, the missing file named, no partial output directory |
| V4 | **PASS** | 0 | `/tmp/opencode/s4a1/v4-lint.log`, `v4-typecheck.log` | `npm run lint && npm run typecheck` exit 0 — **on the third invocation**; see finding 6 |

| Check | Status |
| --- | --- |
| Changed paths within scope | **PASS** |
| Diff matches fixed decisions and contracts | **PASS** |
| Hard stops respected | **PASS** |

### V1 — two run directories, per-file `sha256sum` diff

Run exactly as the card's table has it, from the repository root, with
`PIPER_BIN`/`PIPER_MODEL` exported (the paths the evidence records; the card's
command text does not set them, as with the English precedent).

```
node scripts/v2/sandbox.mjs env --port 7807 > … && . …
A=$(dirname "$APUNTA_DATA_DIR")/audio-es-a
B=$(dirname "$APUNTA_DATA_DIR")/audio-es-b
node scripts/v2/generate-es-audio.mjs --out "$A"    # exit 0
node scripts/v2/generate-es-audio.mjs --out "$B"    # exit 0
diff <(cd "$A" && sha256sum *.wav | sort) <(cd "$B" && sha256sum *.wav | sort)
```

`diff` exit **0**, zero bytes of output. 295 `.wav` per directory (296 entries
each, the 296th being `reference.json`), 295 lines in each hash list. Both
generators printed the pinned line, verbatim:

```
determinism: noise_scale 0  noise_w 0  OMP_NUM_THREADS=1; this piper CLI exposes no --num_threads flag
clips:       295 (190 Piper calls, 190 resamples)
noise arm:   95 clips, achieved SNR 19.992..20.010 dB, 645 clipped samples
```

`piper --help` on this build lists `--noise_scale`/`--noise_w` and **no**
`--num_threads`, so the card's "if the CLI exposes it" branch is the environment
variable alone and `synthesis.threadSetting` says exactly that. I confirmed the
usage text myself.

Three independent corroborations, none of them required by the row:

1. **A third run agrees with both.** The V2 row's corpus, generated later in a
   *different* run folder, is byte-identical to V1's run A — 295 hashes, `diff`
   exit 0. Three runs, one corpus.
2. **My corpus is the implementer's corpus.** The first and last entries of my
   hash list are `0031c8c0… clinical-doses-08.clean.wav` and
   `ff8903fe… clinical-numbers-07.clean.wav`, which are the same two entries
   `docs/v2/evidence/S4a.1/verification-attempt-2.log` lines 105–109 records,
   and my `reference.json` is byte-identical to the committed
   `docs/v2/evidence/S4a.1/reference.json`
   (`aaaa64f29cdf844fd3c8e02a068278fe1cdc640d5c1176b5856a8bb14987284f` in all
   three places). So the transcription into evidence is faithful, and the
   reproducibility claim reproduces across sessions.
3. **The mechanism, isolated.** Two renders of one sentence at
   `--noise_scale 0 --noise_w 0` are byte-identical **with and without**
   `OMP_NUM_THREADS=1` (all four `8059d239…`, the same hash attempt 1 recorded
   at `determinism.md:85`); two renders at Piper's own defaults differ
   (`5f63bd3d…` vs `cc940d17…`). The pinned noise values are what make the
   corpus reproducible here; the thread variable is not load-bearing on this
   machine. See finding 4 — this is the return's Unresolved item 1, and it is
   accurate.

Nothing in the pipeline post-processes audio to force a hash: the WAVs are
Piper's output through `ffmpeg`, and the `noise` arm is the `clean` arm of the
same run plus seeded noise.

### V2 — format, `reference.json` shape, coverage

```
node scripts/v2/generate-es-audio.mjs --out "$(dirname "$APUNTA_DATA_DIR")/audio-es"   # exit 0
node scripts/v2/check-es-audio.mjs --audio "$(dirname "$APUNTA_DATA_DIR")/audio-es"    # exit 0
```

The checker's own table: `tuning 99/99`, `heldout 66/66`, `clinical 120/120`,
`silence 5/5`, `tone 5/5`, `total 295/295`; `variants: clean 105, noise 95,
fast 95`; `categories: 17 distinct` (11 trap types + 4 clinical classes +
silence + tone); `noise arm: 95 clips, RMS 0.03..0.05 dB`. It reads every
file's `fmt ` chunk, matches all 55 dictations back to
`e2e/fixtures/eval-es/**` text included, and asserts coverage both ways.

I did not take the checker's word for the format: `ffprobe` over **all 295**
clips reports `pcm_s16le,16000,1,16` for every one, **0 non-conforming**.

`reference.json` carries the new `synthesis` object exactly as the card pins it,
with the four pinned keys under the pinned names:

```json
"synthesis": {
  "noise_scale": 0,
  "noise_w": 0,
  "threads": 1,
  "threadSetting": "OMP_NUM_THREADS=1; this piper CLI exposes no --num_threads flag",
  "length_scale": 0.8695652173913044,
  "seed": 20260926, "noiseColour": "white", "noiseSnrDb": 20, "fastRate": 1.15,
  "sourceSampleRate": 22050, "sampleRate": 16000, "channels": 1,
  "bitsPerSample": 16, "resampler": "ffmpeg version n9.0.1 …"
}
```

The superset beyond the four keys is what the card's Variants bullet separately
requires ("the RNG seed, the noise colour, the `length_scale` and the Piper
version into `reference.json`"), so it is a minimum, not a closed set.
`length_scale` is the exact double `1/1.15`, which is the double the Piper call
receives; the rename from `lengthScale` is a rename in a record and changes no
audio. `voices[]` holds the one voice with its sha256 and byte count.

### V3 — the two negatives

Case 1, a copy in the sandbox run folder with one `.noise.wav` removed:

```
FAIL clinical-negation-07.noise.wav: listed in reference.json but missing from the output directory
FAIL 119 clinical clips, expected 120
FAIL 294 clips on disk, expected 295
check-es-audio: 3 problem(s)                                        exit 1
```

Case 2, separately: `PIPER_MODEL=/nonexistent.onnx node scripts/v2/generate-es-audio.mjs
--out <fresh-dir>` → `generate-es-audio: PIPER_MODEL does not exist:
/nonexistent.onnx`, **exit 1**, and `ls -a` of the run folder afterwards shows no
`audio-es-fresh` and no staging folder: the generator validates before it creates
anything and stages beside the target. Both halves of the row hold. Nothing in
the shipped tree was touched to demonstrate either failure.

### V4 — `npm run lint && npm run typecheck`

`npm run typecheck` exit 0 on the first invocation. `npm run lint` **failed on
the first two invocations and passed on the third**; the full account is
finding 6. The passing run (16:34:23Z, and the combined
`npm run lint && npm run typecheck` at 16:34:39Z, exit 0) covers eslint,
prettier, `check-no-external-urls`, `collect-licenses --check` (111 shipped
packages) and `check-ui-strings` (`TOTAL 0`).

## Step 2 — every changed path is inside the card's "May edit" list

Commit `5ccb9eb` changes exactly seven paths:

| Path | Card's boundary |
| --- | --- |
| `scripts/v2/generate-es-audio.mjs` | **May edit** ✅ |
| `scripts/v2/check-es-audio.mjs` | **May edit** ✅ |
| `e2e/fixtures/audio-es/README.md` | **May edit** ✅ |
| `docs/v2/evidence/S4a.1/{README,determinism}.md`, `reference.json` | the card's Output-location bullet: sandbox outputs "transcribed into `docs/v2/evidence/S4a.1/`" ✅ |
| `docs/v2/state/returns/S4a.1.md` | the dispatch's return file ✅ |

No `prototype/`, no `server/`, `web/`, `shared/`, no fixture `.txt`, no
checkpoint, no dispatch, no card text. The `verification-attempt-2.log` the
return also lists is **not** in the commit: `.gitignore:41` ignores `*.log`
(finding 3).

## Step 4 — the diff against the card's fixed decisions and contract excerpts

| Fixed decision | Met | Evidence |
| --- | --- | --- |
| One voice for the whole corpus, `es_MX-ald-medium` per §5.4 | ✅ | `VOICE` is a constant; `voices[]` has one entry; every speech clip's `voice` is the same; 19 `synthesis`-free lines of stdout agree across three runs |
| 16,000 Hz mono 16-bit PCM via `ffmpeg`; the 10 non-speech clips written directly at 16 kHz | ✅ | `ffprobe` on all 295; `writeNonSpeech` at `SAMPLE_RATE`; resampler version recorded |
| Variants: clean, 20 dB SNR white noise seeded per clip, `length_scale` 1/1.15 | ✅ | 105/95/95; seed, colour, SNR and `length_scale` in `synthesis`; achieved 19.992–20.010 dB |
| Deterministic synthesis: `noise_scale 0`, `noise_w 0`, `OMP_NUM_THREADS=1`, `--num_threads 1` if exposed; both values and the thread setting in `synthesis` | ✅ | passed on **every** call, not only the `fast` ones; `piper 1.8.0` exposes no such flag, so the env var carries it and the record says so |
| `reference.json` shape: 5 top-level keys, `synthesis`, `voices`, `clips` with the six fields, `source`/`category` values from the pinned sets, `voice: "none"` and `text: ""` for the 10 non-speech clips | ✅ | V2 exit 0; the checker enforces every one of these, including that the 10 non-speech clips exist in the `clean` variant only |
| 40 clinical sentences as a literal array, 10 per class, drug names from the glossary, person names only from `NAMES.md`, additional to the 55 dictations | ✅ | `CLINICAL_SENTENCES`, four classes × 10; I checked all eleven drug names and the units against `docs/research/es-mx-clinical-glossary.json`; the four names (César Xicará Pantoja, Bárbara Arredondo Higareda, Doroteo Xicará Quezada, Anaías Godoy Ruiz) are all in `e2e/fixtures/eval-es/NAMES.md` |
| `PIPER_BIN` / `PIPER_MODEL`, both outside the repository; version, URL, size, SHA-256, licence in the return's Acquisitions | ✅ | `validate()` refuses a model or an `--out` inside the repo; `acquisitions.md` (unchanged by this attempt) holds the licence evidence; the return's Acquisitions section is correctly "None" and says why |
| Output to `$(dirname "$APUNTA_DATA_DIR")/audio-es`, never directly under `/tmp/apunta-v2`; run id in the checkpoint | partial | output location ✅ and the generator refuses `/tmp/apunta-v2` directly; the run id is **not** in the checkpoint (finding 5) |
| Nothing touches `server/`, `shared/`, `web/` or a runtime path | ✅ | `grep -rn "generate-es-audio\|check-es-audio" server web shared installer` → nothing; the only imports are `node:child_process`, `node:crypto`, `node:fs`, `node:path`, `node:url` |

On C-STT@1: this card builds the benchmark, it does not select a model, and it
adds no candidate, threshold or scoring rule. Nothing in the diff touches the
contract's qualifying thresholds.

## Step 5 — hard stops

| Stop | Finding |
| --- | --- |
| HS-1 live data | Nothing live was opened; no 7717 contact; no recover/smoke script. All output in sandbox run folders |
| HS-2 isolation | `sandbox.mjs env --port 7807` for both rows that name it; no server, database or app launched |
| HS-3 downloads | None. Piper and the voice re-used as found; I verified the voice's sha256 rather than trusting the record. Nothing was installed or pulled |
| HS-4 git | Read-only: no pull, merge, rebase, reset, force-push, commit or `git add`. The only file I wrote is this review |
| HS-5 secrets | None. No key, token or password anywhere |
| HS-6 network at runtime | No URL added by the commit (`git show 5ccb9eb -- scripts e2e \| grep -E "https?://"` → nothing); the two scripts import Node builtins only and `spawnSync` a local `piper` and `ffmpeg`; nothing in `server/`, `web/` or `shared/` imports them |
| HS-7 safety instruments | No threshold, guard, scorer or `CONTRACTS.md` value changed. The checker was **strengthened** (four new failures on `noise_scale`, `noise_w`, `threads`, `threadSetting`), which is the safe direction |
| HS-8 fabricated data | 55 fixture dictations, 40 invented sentences, four names all from `NAMES.md`. No real text |
| HS-9 protected paths | Only the three May-edit paths plus evidence and the return; `prototype/` untouched |
| HS-10 owner-only | Nothing enabled, published, released or inspected on the live instance |

**Audio is not in the repository.** `git ls-files | grep -iE "\.wav$|\.onnx$"` →
one file, `e2e/fixtures/audio/dictation-10s.wav`, committed in `c9435af` in
August, long before this plan, and not in `810dbb4..5ccb9eb`.
`e2e/fixtures/audio-es/` contains exactly one file, `README.md`. The generator
refuses an `--out` inside the repo and refuses one directly under
`/tmp/apunta-v2`, so neither accident is possible.

**Evidence hygiene.** No `/tmp/apunta-v2` path, no `/home/…` path, no username
and no hostname in `docs/v2/evidence/S4a.1/**` or the return. The only
sandbox-derived strings committed are four run ids in the return, which the
card's Output-location bullet asks to be recorded; they carry no host or path.
`generate-es-audio.mjs` mentions `/tmp/apunta-v2` (the refusal constant) and
`/home/you/…` (a usage placeholder) — neither is a real path.

## Numbered findings for the implementer

None of these blocks the card; each is recorded so the coordinator and a later
card have it.

1. **The dispatch's base is 15 commits behind the head it pairs with**
   (`docs/v2/state/dispatch/S4a.1-review.md:6`, generated by
   `tools/build-dispatch.mjs`). `810dbb4` is the *previous* S4a.1 commit; head
   `5ccb9eb`'s parent is `e9cfffa`, and the 14 commits between are other cards.
   A reviewer who runs `git diff 810dbb4..5ccb9eb` reads 127 paths and mostly
   other people's work. This is coordinator bookkeeping, not a card defect: the
   S4a.1 change is unambiguous (commit `5ccb9eb`, seven paths) and it is what I
   reviewed. What would make it pass: have the generator derive the base as the
   head's parent, or state the card's own commit range.
2. **The return says the final commit was "NOT RECORDED — left uncommitted, as
   instructed"** (`docs/v2/state/returns/S4a.1.md:5`) while the reviewed head
   `5ccb9eb` *is* the S4a.1 commit, containing exactly the paths the return
   lists. The content matches the return; only the bookkeeping line is stale.
   What would make it pass: name the commit in the return once it exists.
3. **The evidence path named for V1–V4 is not in the repository.**
   `docs/v2/state/returns/S4a.1.md:98-101` points every criterion at
   `docs/v2/evidence/S4a.1/verification-attempt-2.log`, and `.gitignore:41`
   ignores `*.log`, so that file is untracked and a reviewer on a fresh clone
   cannot read it. What *is* committed (`README.md`, `determinism.md`,
   `reference.json`) carries the substance, and my run reproduced
   `reference.json` byte for byte. What would make it pass: cite a committed
   file in the criteria table, or un-ignore `docs/v2/evidence/**/*.log`.
4. **Byte-identity rests on the two noise flags alone on this machine, not on
   `OMP_NUM_THREADS=1`.** Measured: at `--noise_scale 0 --noise_w 0`, two
   renders are identical with and without the variable (all four `8059d239…`),
   while Piper's defaults give two different files. The card pins both settings
   and both are applied and recorded, so V1 is satisfied as written and the
   return's Unresolved item 1 is honest. The consequence for a later card: a
   machine whose onnxruntime parallelises differently is untested, and the
   reproducibility claim is explicitly scoped to one machine, one Piper build
   and this voice — which `reference.json` records and both documents state.
   Nothing to fix; do not let anyone generalise the claim further than that.
5. **The run id is still not in the checkpoint**, so the card's
   Output-location bullet is half-met. `docs/v2/state/cards/S4a.1.json` (not in
   May edit, and correctly left alone by the implementer) still has
   `criteria: {}`, `sandboxRuns: []`, `changedFiles: []`. Coordinator action:
   `2026-09-26T15-48-47-652Z-d7afeb16` (the implementer's), plus a review's
   `2026-09-26T16-16-10-942Z-583b2842` and
   `2026-09-26T16-24-29-868Z-74a779d8`; and `V1 PASS`, `V2 PASS`, `V3 PASS`,
   `V4 PASS` in `criteria`, with the three May-edit paths in `changedFiles`.
6. **V4 needed a third invocation, for a file that is not this card's.** The
   first two `npm run lint` runs (16:29:29Z, 16:31:26Z) exited 1 on
   `scripts/v2/second-start.mjs` — an **untracked** file another session created
   at 16:29, not in `git ls-files`, not in `810dbb4..5ccb9eb`, and not an S4a.1
   path. The third (16:34:23Z), after that agent formatted its own file, exited
   0, as did the combined command at 16:34:39Z. Scoped to this card,
   `npx eslint scripts/v2/{generate,check}-es-audio.mjs` and
   `npx prettier --check` over all seven changed paths both exit 0. Recorded in
   full rather than quietly re-run; no foreign file was touched, per
   `CLAUDE.md`.
7. **`check-es-audio.mjs:557` is unguarded where `:508` is guarded.** Removing a
   `.clean.wav` from a copy exits 1 and names the file, but as an uncaught
   `ENOENT` stack trace from the noise arm's read of its own counterpart,
   instead of the three clean `FAIL` lines a missing `.noise.wav` produces. The
   criterion is met either way (I ran both), so this is diagnostics, not
   correctness. What would make it pass: wrap that `readWavHeader` in the same
   `try`/`catch` + `fail` the format read uses.
8. **`PIPER_BIN` as `python3 -m piper` is advertised but cannot work.**
   `generate-es-audio.mjs:606` and `:335` both pass the whole `PIPER_BIN` string
   to `spawnSync` as one command, so the two-word form would fail even though
   `validate()` splits on spaces to check the path. Inherited verbatim from the
   English precedent (`scripts/synthetic-acceptance/generate-audio.mjs:30`), so
   it is consistency rather than a regression, and it is inert today because the
   console script is what is installed. What would make it pass: split
   `PIPER_BIN` on whitespace into command + prefix argv, or narrow the
   docstring to the console-script form.

## Verdict

**PASS.** V1, V2, V3 and V4 each pass as written at head `5ccb9eb` with Node
24.19.0 first on PATH, on a fresh sandbox run folder of my own, and all three
checks (scope, fixed decisions, hard stops) pass. Findings 1, 2, 3, 5 and 6 are
bookkeeping or another agent's file; 4, 7 and 8 are observations a later card
may want, none of which changes a verdict. What S4a.2 may now rely on, and the
boundary it must not cross: on this machine, with Piper 1.8.0 and
`es_MX-ald-medium`, regenerating the corpus gives the same 295 bytes — I
confirmed that across three runs and two run folders — so a clip may be
hash-compared and a regenerated clip assumed to be the measured one. A different
Piper version or a different voice is a different corpus, and the WAVs an
acceptance run scored are still the ones to keep.
