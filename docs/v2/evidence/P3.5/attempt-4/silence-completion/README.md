# P3.5 — AM-196 silence completion, and the one read-only V5 re-evaluation

The bounded owner exception **AM-196** carried out on 2026-10-03 on `main` at
`4060909`: the never-started `V4-silence` arm executed **once** under
`P3.5-SILENCE-COMPLETION-PROPOSAL.md` §4, its one genuine capture record and
anchor appended, then `V5` run **once**, read-only. Nothing was retried or
repaired; no capture, tone, `V0`–`V3` or build row was repeated; no rebuild, no
source, card, contract, Expected, schema or threshold edit; no attempt 5, no
counter reset, no `7717`, no live database, no Ollama. The card was **not**
approved — the root decides after reading this folder.

Owned by this pass alone: this folder, the checkpoint
`docs/v2/state/cards/P3.5.json`, and the appended return in
`docs/v2/state/returns/P3.5.md`. Scratch is git-ignored
`build/p35-silence-completion4/` (`.gitignore:55 build/`).

## What actually ran

| What | When (UTC) | Exit | Result |
| --- | --- | --- | --- |
| preflight (lease, port, harness hash, AppImage, fixtures) | 23:21:09 | 0 | clean |
| §4 command, once, byte-equal to the proposal's fenced block | 23:21:30 → 23:21:51 | **0** | **35/35 assertions** |
| checkpoint append: one capture object + one anchor | 23:22 | — | 9 → 10 each; attempt 4: 2 → 3 |
| `V5`, once, read-only | 23:22:51 | **0** | `V5 bad=0` |
| cleanup verification from outside | 23:22:09, 23:23:34 | 0 | clean |

### Provenance created — one record, one anchor

| Step | attempt | runId | dateUtc | prevDefault | sinkId | srcId |
| --- | --- | --- | --- | --- | --- | --- |
| `V4-silence` | 4 | `2026-10-03T23-21-30-917Z-a17f4bbf` | `2026-10-03T23:21:34.001Z` | `alsa_input.usb-UGREEN_Camera_2K_UGREEN_Camera_2K_SN0001-02.analog-stereo` | 536870916 | 536870917 |

Byte-equal, field for field, to that run's own
`/tmp/apunta-v2/2026-10-03T23-21-30-917Z-a17f4bbf/p3.5-capture-record.json` and
to its `RECORD {…}` stdout line (`03-record-and-provenance.txt`). Nothing was
derived later, invented or back-filled.

## Why the isolation worked, witnessed rather than argued

Attempt 4's `V4` cell aborted with exit 2 at 22:40:18 because the tone env
file, sourced earlier in the same `&&` chain, left `APUNTA_DATA_DIR` exported,
and `resolveSandboxDataDir` computes the platform default from `process.env`
(`scripts/v2/sandbox.mjs:177-201`, `shared/src/platform-paths.ts:30-31`). The
refusal wrote **0 bytes**.

This run, with the seven `env -u` names and one arm per subshell:

```
-rw-r--r-- 1 villenull villenull 292 /tmp/apunta-v2-p3.5-v4-silence.env   (was 0 bytes)
export APUNTA_DATA_DIR='/tmp/apunta-v2/2026-10-03T23-21-30-917Z-a17f4bbf/data'
export APUNTA_PORT='7839'
export APUNTA_NO_OPEN='1'
export APUNTA_TEST_RUN_ID='2026-10-03T23-21-30-917Z-a17f4bbf'
export APUNTA_V2='1'
export APUNTA_CHECK_URL='http://127.0.0.1:7839'
export APUNTA_E2E_PORT='7839'
```

Exactly the seven names `printEnv` writes (`sandbox.mjs:299-310`), read from the
source rather than from prose (`01-command-verification.txt`). The run folder
for **7839** was created — the port attempt 4 never bound — and the guard was
**not** slackened: it still refuses the real default folder, as the 49/49
independent review proved on the same function.

## The silence assertions, which are this card's own

All 35 passed (`02-silence-run.txt`):

- `levelPeak` **stayed 0** for the whole recording — the discriminating claim,
  and the one attempt 4 could make in neither direction.
- The phase reached `recording` and the marker moved through `starting`; the
  record-timer advanced past 10 s; the window was at scale 1.
- The app POSTed the WAV to `/api/transcribe` and surfaced
  `whisper_model_missing` on the captured stderr — this card's designed
  no-model state, not a defect.
- **Containment held**: a capture stream on `apunta_p35_mic`
  (`8949 8928 8947 PipeWire float32le 1ch 48000Hz`) and **none** on
  `alsa_input.usb-UGREEN`. The real microphone was never the capture device.
- **No physical microphone was captured.** The only audio played was the
  synthetic fixture already on disk, `audio-en/silence-10s.wav`,
  sha256 `eeae5c4c…0f78`, the V1 artefact, fed to the null sink.
- Teardown: nothing of the run still listening, no surviving server process,
  original default source restored, both of this run's modules unloaded, the
  unrelated dummy and `ollama` still alive.

## `V5`, read-only, once

Its command was parsed fresh from `docs/v2/cards/P3.5.md` through
`plan-lib.mjs`'s `parseCells` (3 cells), unescaped from its backticks, and is
byte-identical to the attempt-4 readiness witness at 8452 bytes. `bash -n`
exit 0 **before** execution; no Markdown escape survived. Exit 0, `bad=0`:

```
V5 ignoring 7 PREV_DEFAULT record(s) from earlier attempts; earlier history is kept, not deleted,
  and is excluded by the attempt 4 selection
V5 attempt 4: baseline records tied to the sandboxRuns entries for V3, V4-tone and V4-silence
V5 recorded PREV_DEFAULT: alsa_input.usb-UGREEN_…;  V5 current default source: alsa_input.usb-UGREEN_…
V5 lines in pactl list short sources holding an exact task name: 0
V5 lines in pactl list short sinks   holding an exact task name: 0
V5 loaded module-null-sink     modules holding an exact task name: 0
V5 loaded module-remap-source modules holding an exact task name: 0
```

Read-only is **verified, not asserted**: the checkpoint sha256 is identical
before and after the row, `527a3a70aeb2d343092bc682921d395463492288f31e465866f354c3da69a207`
(`10-v5-run.txt`). The row appended nothing. The AM-187 literal witnesses ran
alongside with their commands and their exits recorded rather than suppressed:
`pactl list short sources | grep -c -e apunta_p35` → `0`, exit `1`;
same for `sinks` (`11-am187-witnesses.txt`).

## What was preserved, and how that was checked

The checkpoint diff was taken at every step. The provenance append's **entire**
diff is two additions and nothing else (`05-checkpoint-before-append.json` →
`07-checkpoint-after-append.json`; the same pair is `09-checkpoint-before-v5.json`
→ the live file for the append stage). The final additive update's diff touches
only `criteria.V4`, `criteria.V5` and four scalars — `status`,
`lastCompletedStep`, `nextAllowedAction`, `updatedUtc`
(`12-…` → `14-checkpoint-after-final-update.json`).

Retained untouched: the **five attempt-1 and two attempt-3** records and their
**seven** anchors; `priorAttempt1Criteria`, `priorAttempt3Criteria`; all five
cleanup/acquisition strings; and **`priorAttempt4IncompleteCriteria`, still
holding `V4 BLOCKED` and `V5 FAIL` exactly as attempt 4 recorded them.** The
current `criteria` describe the completion result and do not hide that prior
failure; both readings are on the record side by side.

One disclosure, because it was my error and it touched preserved bytes: my
first append serialized the file with `ensure_ascii=False`, which unescaped six
pre-existing `\u2014` sequences in two untouched `resumeInstruction` strings.
That write was discarded, the checkpoint restored from its untouched snapshot,
and the **same single append** redone with `ensure_ascii=True`. The committed
diff shows no escape change (`\u2014` count 2 before and after). Nothing was
appended twice; the guard assertion in the append script proves no
`V4-silence` record or anchor existed before either write.

## Cleanup, verified from outside every row

`15-cleanup-verification-final.txt` at 23:23:34Z: no AppImage child, no
harness, no `Xvfb`, no `paplay`, no sandbox server survives; **7839 and 7837
free**; default source back to `alsa_input.usb-UGREEN_…`; 0 streams on the real
microphone and 0 on the virtual source; 0 exact-token lines in sources, sinks
and modules; 0 loaded `module-null-sink` / `module-remap-source` modules;
`build/p3.5-web` and `build/linux-resources/web/dist` gone and `web/dist`
unflagged in every file; the AppImage unchanged at 194 202 104 bytes, mtime
22:39:34Z, the artefact attempt-4 `V2` left; the harness still
`85fbb13d…924c14`; `ollama serve` pid 1123, untouched; 7717 never contacted and
never listening; the live data folder never opened.

**The exclusive app/audio/Pulse/7839 lease is released.** Nothing of this pass
holds a sink, a module, a stream, a port or a process.

## Two things the root should know

1. **Another agent is mid-build in the same tree.** `docs/v2/tools/build-dispatch.mjs`,
   its test, `scripts/v2/tauri-security.test.mjs`,
   `docs/v2/evidence/P3.4/attempt-5/implementation/ported-model.test.mjs` and a
   new `docs/v2/evidence/P3.4/attempt-6/` appeared **during** this pass (the tree
   was clean at 23:21:09). None is mine; all were left untouched and nothing of
   theirs was staged or committed. A `build-dispatch.mjs P3.4 --print` probe
   (pid 2885304, no port bound, no app, no audio) was the one process my loose
   `grep` surfaced, and it was a false positive on the repo path.
2. **Not established, and still deferred.** Every word-level claim. The silence
   run's `GET /api/notes` precondition was `-1` before and after — vacuous with
   no model on disk, and recorded as such, not as evidence. `transcription_empty`
   and the silence UI string remain **S4a.2's**.

## Files

| File | What |
| --- | --- |
| `00-preflight.txt` | Lease, ports, harness hash, AppImage, fixture hashes, host residue, `git status` — all checked before anything ran, with one correction appended (my AppImage glob was one directory short). |
| `01-command-verification.txt` | The §4 command, `bash -n` exit 0, byte-equality with the proposal's fenced block, and the seven names read from `printEnv`. |
| `02-silence-run.txt` | The single execution, raw, with pid, start/end stamps and exit code. |
| `03-record-and-provenance.txt` | The run folder, the durable `p3.5-capture-record.json`, the `RECORD` line, and their field-by-field equality. |
| `04-cleanup-verification.txt` | First cleanup pass, from outside the rows. |
| `05-…` / `07-checkpoint-*.json` | The checkpoint either side of the provenance append; their diff is the whole proof of preservation. |
| `06-append-output.txt` | Counts, the appended record and anchor, and the `ensure_ascii` disclosure. |
| `08-v5-verification.txt` | `V5`'s cell parsed, unescaped, compared to the readiness witness, `bash -n`. |
| `09-checkpoint-before-v5.json` | The checkpoint as `V5` found it. |
| `10-v5-run.txt` | The single `V5` execution, with the checkpoint hash either side. |
| `11-am187-witnesses.txt` | The two literal `grep -c` witnesses and their exits. |
| `12-…` / `14-checkpoint-*.json` | The checkpoint either side of the additive criteria update. |
| `13-final-update-output.txt` | What changed, and the in-process assertion that the prior snapshot survived. |
| `15-cleanup-verification-final.txt` | Final cleanup, with the process-class correction. |
| `completion-command.sh`, `V5.command.txt`, `V5.expected.txt` | The exact bodies that were `bash -n`'d and executed. |