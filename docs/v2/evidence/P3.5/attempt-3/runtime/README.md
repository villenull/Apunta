# P3.5 attempt 3 — final runtime continuation, evidence

The once-only runtime rows V0–V5 of `docs/v2/cards/P3.5.md`, run in card order under the
serial build/capture/audio lease on ports 7837 and 7839, after the installed-host STEP-0
pass and with the AM-190 bundled-plugin gate between V2 and V3. Read alongside
`docs/v2/state/dispatch/P3.5-runtime.md` (the brief), `docs/v2/state/dispatch/P3.5.md` (the
regenerated dispatch, base `7158635`, attempt 3 of 3),
`docs/v2/evidence/P3.5/runtime-readiness/` and the appended section of
`docs/v2/state/returns/P3.5.md`.

Scope, authority and what was left untouched: `00-scope-and-authority.txt`.

## Row verdicts

| Row | Status | Exit | Evidence | One line |
| --- | --- | --- | --- | --- |
| V0 | **PASS** | 0 | `01-V0.txt` | pinned Node `v24.19.0`; all four tools present; sink count 0; PipeWire-only; default is the owner's USB mic; `cargo test permissions` 5/5; AppImage present |
| V1 | **PASS** | 0 | `02-V1.txt` | `dictation-30s.wav` exactly 30.000000 s and `silence-10s.wav` exactly 10.000000 s, both 16 kHz mono PCM, cached voice, no download |
| V2 | **PASS** | 0 | `03-V2.txt` | one flagged build; marker counts 1 / exactly 0 / 1; `web/dist` unflagged; trap removed both scratch trees; AppImage 185.21 MiB |
| AM-190 gate | **PASS** | 0 | `04-am190-four-dry-inspections.txt` | bundled scanner executable; appsink, autoaudiosrc, alsasrc, pulsesrc each visible through it with a fresh registry |
| V3 | **BLOCKED** | 1 | `05-V3.txt` | 21/22 assertions, then the containment read stopped: `non-numeric source-outputs column` |
| V4 | **BLOCKED** (tone) / **NOT RUN** (silence) | 1 | `06-V4.txt` | same stop at the same assertion; the cell's `&&` chain ended there, so the silence case never ran |
| AM-187 witnesses | **PASS** | — | `07-am187-witnesses-and-V5.txt` | `pactl list short sources \| grep -c apunta_p35` = 0 and the same for sinks = 0, recorded with their commands |
| V5 | **FAIL** | 1 | `07-am187-witnesses-and-V5.txt` | live residue all 0; failed closed on provenance: no attempt-3 `V4-silence` record |
| cleanup | **PASS** | — | `08-cleanup-containment-and-side-effects.txt` | default source restored, both modules unloaded, no stream, no listener, no surviving process, Ollama untouched |

## The one defect this run found, and why it is not repaired here

Both capture rows stop at the same assertion, with the same cause:

```
BLOCKED V3 microphone containment: the live source-outputs read could not be resolved, so containment is
unknown and the row stops: non-numeric source-outputs column: "8043\t8035\t-\tPipeWire\tfloat32le 2ch 48000Hz"
```

`pactl list short source-outputs` prints `-` in the sink column for a stream that has no sink, which is
exactly what `paplay --device=apunta_p35` produces. `classifySourceOutputs`
(`scripts/v2/tauri-audio.test.mjs:300-312`) requires columns 1–3 to be integers, so the first legitimate
row of the table the card mandates makes the row stop. The direction is fail-closed — the row refuses
rather than treating an unknown stream as safe — so nothing unsafe was recorded and the owner's
microphone was never read, but the capture rows cannot complete against this source.

`scripts/v2/tauri-audio.test.mjs` is not in this session's grant, and review-3 reported **SOURCE: CLEAR**
for candidate `7e16513` on adversarial probes that did not include this table shape. The defect is
reported for the coordinator, not fixed, not worked around, and not re-run.

## What this attempt did and did not prove

- **Proved, on the real AppImage and the real bundled server:** the flagged build works and is
  disposable (V2); the bundled GStreamer scanner is executable and sees all four required elements
  with fresh registries (AM-190 gate); WebKitGTK's microphone request **is** granted through the
  permission-request signal, because the app reached `recording` on the virtual device; the five
  real pointer clicks land; the marker channel delivers on the child's **stderr** through the
  `apunta: ignoring a bridge line (…)` wrapper; `/api/transcribe/preview` was POSTed with real WAV
  payloads and answered 500 (`whisper_model_missing`, as a capture-only card with no model predicts).
- **Not proved, and not claimed:** that a tone and digital silence are distinguishable by
  `levelPeak`. The tone run's `levelPeak` did read 1, and the silence run never happened, so the
  comparison this card exists for has **no** result in either direction.
- **Not claimed either:** that the app opened the device the run made default. The card is explicit
  that nothing in this repository observes which node the stream attached to; the `source-outputs`
  read narrows the window, it does not close it.
- **Deferred to S4a.2 and untouched here:** every claim about words, `transcription_empty`, whisper
  accuracy, model selection and the `whisper_model` setting. `GET /api/notes` being empty is recorded
  as a precondition, never as evidence of discrimination.

## Provenance written this attempt

Two capture records, appended by the one-writer handoff, each byte-equal to the harness's own durable
`p3.5-capture-record.json` and its `RECORD {…}` stdout line, with the matching four-field
`sandboxRuns` anchor, in creation order:

| step | runId | dateUtc | prevDefault | sinkId | srcId |
| --- | --- | --- | --- | --- | --- |
| `V3` | `2026-10-03T21-05-01-190Z-fce5ae2d` | `2026-10-03T21:05:04.288Z` | `alsa_input.usb-UGREEN_…analog-stereo` | `536870916` | `536870917` |
| `V4-tone` | `2026-10-03T21-07-53-220Z-a229eb22` | `2026-10-03T21:07:56.585Z` | `alsa_input.usb-UGREEN_…analog-stereo` | `536870916` | `536870917` |

No `V4-silence` record exists, because that mode never ran. The five attempt-1 records and their five
anchors are untouched, and V5's `attempt === 3` selection excluded them. Nothing was deleted, sorted,
deduplicated, restamped or invented. V5's FAIL on the missing third record is the card's own
fail-closed design behaving correctly.
