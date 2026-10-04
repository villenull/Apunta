# Independent frozen-evidence audit — English EOD real-STT and spoken-STT

Date: 2026-10-04 · branch `main` · audited commits: tone `744afe3`, spoken
`363c67f` (both stable and unchanged; HEAD moved under this review only for
unrelated state tracking, `c3283ff`). This audit ran **no inference**, spawned
no `whisper-cli`, opened no audio device, no server, no database, no network and
no port 7717. It re-hashes, re-derives by reading shipped source, and re-runs
only the scoped `prettier`/`eslint`/`node --check` gates on the proof scripts.

Targets, read-only:

- `docs/v2/evidence/english-eod-real-stt/` (tone / speechless fixture)
- `docs/v2/evidence/english-eod-spoken-stt/` (P3.5 spoken fixture)

Scratch for this audit: git-ignored `build/eod-stt-ir/`. Nothing was staged or
committed. The mutable paths owned by the running probe-final-IR worker
(`build/eod-model-probe-final-ir/**`) were neither read nor written.

## 1. Inputs and artifacts — re-hashed independently

`hashes.txt` (captured here) reproduces every digest the two reports state:

| Role | Path | SHA-256 | Bytes | Report match |
| --- | --- | --- | --- | --- |
| tone input | `e2e/fixtures/audio/dictation-10s.wav` | `d487a393…d5820f` | 320044 | yes |
| spoken input | `/tmp/apunta-v2/2026-10-03T22-37-12-589Z-2b44c153/audio-en/dictation-30s.wav` | `79719c56…d5d0a5f` | 960044 | yes |
| model | `build/eod-model-cache/models/ggml-tiny.en.bin` | `921e4cf8…920b1f` | 77704715 | yes (and receipt) |
| binary | `build/linux-resources/bin/whisper-cli` | `3a9f516d…804de` | 1064648 | yes |

The spoken file still exists at the recorded path and hashes exactly to the
frozen P3.5 pin (`docs/v2/evidence/P3.5/attempt-4/runtime/04-V1.txt:9`). The
model digest also equals `ggml-tiny.en.bin.receipt.json`. This is the ground
truth the tone report said was absent (§4 below).

## 2. Shipped provider and default arguments — re-derived from source

Read from `server/src/ai/whisper.ts` and `shared/src/transcribe.ts`:

- `real-stt.ts` imports `WhisperCppSttProvider` from `server/src/ai/whisper.ts`
  and constructs it with **only** `resolveBinary`, `resolveModel` and `log`.
  No `spawnImpl`, no `threads`, no `timeoutMs`, no `resolveLanguage`. The
  provider therefore uses production `node:child_process` and the default
  thread/timeout/language policy.
- `buildWhisperArgs` (`whisper.ts:94-130`) emits
  `--model … --file … --print-progress [--prompt …] [--threads …] … [--language …]`.
  With `prompt=sttPrompt([])` (`= STT_LEAD_IN`, `whisper.ts:286-292`),
  `threads=whisperThreads(false)=availableParallelism()` (`:569-572`),
  `language=DEFAULT_STT_LANGUAGE='en'` (`shared/src/transcribe.ts:124`) and no
  `durationMs`/`audioContext`/`greedy`, the two `03-derived-command.json` files
  are exactly reproduced by hand.
- `nproc` is 8, so `availableParallelism()` = 8, matching `--threads 8`.
- `timeoutFor(10)=120000+10×6×1000=180000`; `timeoutFor(30)=300000`
  (`whisper.ts:575-578`). Both match the reports.
- `detectTrailingSilenceDurationMs` (`whisper.ts:188-267`) returning `null`
  for both inputs is what omits `--duration`; the reports say so and the
  derived JSON agrees (`trailingSilenceDurationMs: null`).

## 3. Event contract and elapsed-time split

`SttEvent` is at `server/src/ai/types.ts:271`. The provider pushes the final
`fraction:1` progress frame at `whisper.ts:515-516` and the `transcript` last
(`:524`), matching both event streams. Tone: one `progress` (fraction 1) then
one `transcript`. Spoken: `progress 0.99`, `progress 1`, then `transcript`.

The spoken report's "318 ms (process span 3 s)" is accurate and the two numbers
are distinct quantities: `run-start.txt` = `00:19:11Z`, `run-end.txt` =
`00:19:14Z` (3 s wall, tsx startup included), while the harness sets `started`
**after** hashing and `describe()` and reports `elapsedMs = 318` for the
`transcribe()` iteration only.

## 4. The tone report's "cached dictation does not exist" — false

`english-eod-real-stt/04-anchor-verification.md` §1 states the P3.5 cached
synthetic dictation "does not exist" and "There is no P3.5 cached audio of any
kind", on the strength of `find . -name '*.wav'` — a **cwd-scoped** search that
cannot see `/tmp`. The file exists at the recorded path with the frozen hash
(§1 above). The claim is a cwd-limited false negative, not a property of the
tree. The tone report is retained unchanged; the qualification is this audit and
the spoken evidence, which used that exact file. No tone-only re-run is needed.

## 5. Scoped gates (only the proof scripts)

`scoped-gates.txt`: `prettier --check` exit 0; `eslint --no-ignore` exit 0;
`node --check` OK on all four committed scripts. These are the scoped gates the
reports claim. No global `npm run lint`, no `npm test`, no V4 acceptance row,
no e2e, no build was run by this audit.

## 6. Copy fidelity and a reproduction limitation

`diffs-and-paths.txt`: the committed scripts and `02-run-output.txt` are
byte-identical to the ignored scratch originals (`diff -q` silent on all six).
The tone→spoken diff is exactly the `WAV` constant plus three comment lines in
`real-stt.ts`, as the spoken README says.

**Reproduction limitation.** The committed copies are review copies, not
runnable in place: `import … from '../../server/src/ai/whisper.js'` resolves
from `build/eod-*/` (repo root) but from `docs/v2/evidence/english-eod-*/` it
resolves to `docs/v2/server/…`, which does not exist. Running them requires the
ignored `build/eod-*` scratch path. The READMEs call them "review copies" but do
not state this in-place resolution failure. No new runtime file was added to
paper over it.

## 7. Transcript anchors, thresholds, language

- **Name** `John Smith`: present once, correct spelling (`04-fidelity` §2).
- **Negated risk**: both negations survive verbatim; recorded twice (the loop).
- **Medication**: `sertraline fifty milligrams daily` → `"Certraline-50"
  Miladram's Daily`; `milligrams` absent. Reported as observed, no threshold.
- **No quality claim**: both directories explicitly disclaim accuracy/WER/
  confidence/faithfulness and any pass threshold; none is defined or applied.
- **No clinical judgement**: spoken `04` §4 and README Limits say so.
- **No Spanish acceptance**: spoken `04` §4 is English-only; no card accepted.
- **Tone fixture**: `e2e/fixtures/audio/README.md` states plainly "there is no
  speech in it", matching the tone report's not-applicable anchor verdict.

## 8. Files

| File | What |
| --- | --- |
| `hashes.txt` | re-hash of the four inputs/artifacts, sizes, host node, HEAD |
| `scoped-gates.txt` | prettier/eslint/node --check on the four proof scripts |
| `diffs-and-paths.txt` | scratch↔committed byte-equality and import-resolution check |

Raw copies of these three also sit in the git-ignored `build/eod-stt-ir/`.
