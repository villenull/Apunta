# Independent second-wave release review

Date: 2026-09-08

## Scope and limitations

This review covered the deterministic move-only refine path, the staged Linux
ROCm `whisper-cli` candidate, and a rebuilt detached app. No private audio,
patient text, cloud TTS, package install, driver change, or system-wide config
change was used. The only speech fixture was whisper.cpp's checked-in public
JFK WAV: 11 seconds, 16 kHz mono, 16-bit PCM; no local synthetic speech
generator was available, and this fixture contains no clinical terminology or
numeric token. Therefore these results do not establish clinical equivalence,
medication/number/correction quality, or a global speedup claim.

## Fast-path safety review

The original word-boundary-only match would accept a dangerous substring such
as moving `suicidal` out of `not suicidal`, or detaching a clause from its
subject. The fast path now requires the quoted text to be a complete standalone
sentence (or the complete section body when there is no sentence punctuation),
and otherwise falls back to the existing model path. Regression coverage
includes negation, qualifier, clause, standalone-sentence, exact-span, and
event-order cases. The focused parser/route run passed 60 tests; the full unit
suite passed 1,173 tests.

## Candidate and dependencies

Source: whisper.cpp immutable commit
`371b5a7561823ab2bb32142d2751e35e7534727b` (v1.9.3), HIP target `gfx1201`.
The builder now passes `CMAKE_BUILD_RPATH_USE_ORIGIN=ON`. The durable install
is:

```text
/home/huyke/.local/share/apunta/bin/whisper-rocm-371b5a7561823ab2-hip/whisper-cli
```

Installed candidate SHA-256:

```text
edb46abf800e5b93d0c1dc1410299d25b33705c7b2e79513fe65a4ca62174e3f
```

The copied `libwhisper`, `libggml`, `libggml-cpu`, `libggml-hip`, and
`libggml-base` libraries sit beside the executable. `ldd` resolves these local
copies and system libraries under `/opt/rocm/lib`; there are no missing
dependencies. ELF dynamic tags contain `$ORIGIN:/opt/rocm/lib` and no `/tmp`
RPATH/RUNPATH. The original CPU binary was preserved at:

```text
/home/huyke/.local/share/apunta/bin/whisper-cli
```

Its SHA-256 remains
`990a2d5ca4bae0b031b29a836aa0ee2dea1aec15a538a25e557c84a9240b5573`.
Both binaries accept the app's `--model`, `--file`, `--print-progress`,
`--prompt`, `--threads`, `--audio-ctx`, `--language`, beam, and fallback
arguments; `--help` probes succeeded.

## Sequential parity runs

The same pinned weights/options were used, with no overlapping sustained load.
Three preview and three final invocations ran per binary. End-to-end wall
ranges (milliseconds) were:

| Pass | CPU original | ROCm candidate |
| --- | ---: | ---: |
| Preview, 3 runs | 700–709 | 357–443 |
| Final, 3 runs | 4,827–5,523 | 424–456 |

All 12 normalized outputs matched the checked-in JFK expected sentence (WER 0
on this fixture). The candidate's prior benchmark measured peak RSS at about
330 MiB preview and 378 MiB final, with approximately +981 MiB and +1,164 MiB
VRAM respectively above resident Ollama; those are fixture-specific measurements.

Cancellation: candidate final under `timeout --signal=TERM --kill-after=2s
0.2s` returned 124 and left no `whisper-cli` process.

## Staging and live deployment

On temporary data and port `17717`, with fake AI off, health reported Ollama
reachable/model present and candidate Whisper binary/model present. Real
candidate Whisper preview and dictation both returned 11 seconds of output;
real candidate Whisper→Ollama drafting produced a schema-valid note. Staging
SQLite contained one synthetic patient, format, note, transcript and chat row;
integrity was `ok`, and the temporary server was stopped.

Before live switch, a backup was created as
`apunta-backup-2026-09-08-2.zip` (55,966 bytes; 3 patients, 29 notes, 29
transcripts, 37 chat messages, 1 format, 8 settings). The temporary rows from
the live `check:refine`/`check:format` run were removed by exact row identity;
the resulting live counts remain 3 patients, 1 format, 29 notes, 29
transcripts, 37 chat messages, and `pragma integrity_check` is `ok`.

The final detached app is PID `798205` at `http://127.0.0.1:7717`, fake AI off,
Ollama reachable/model present, candidate Whisper binary/model present,
migration level 3, and the root asset responds HTTP 200. A live public-fixture
preview completed in 380 ms, with no lingering Whisper child. The live
`whisper_binary` setting now points to the candidate. Roll back atomically with:

```sh
curl -fsS -X PUT http://127.0.0.1:7717/api/settings \
  -H 'content-type: application/json' \
  --data '{"whisper_binary":"/home/huyke/.local/share/apunta/bin/whisper-cli"}'
```

Then restart the detached server only when no recording is active. This keeps
the original binary, database, audio, models, and settings data intact.

## Repository gates

Passed after the final source changes:

```text
npm test                         1,173 tests passed
npm run typecheck               passed
npm run lint                    passed (111 shipped packages licensed)
npm run build                   passed
npm run e2e                     38 Playwright tests passed on rerun
npm run eval -- --fake --runs 1 harness deflected
npm run check:refine            0 problems across 8 scenarios
npm run check:format            1 known cadence flag across 6 fixtures
```

The worktree commit contains the safety fix, relocatable builder setting, and
handoff updates. The mandated release branch/remote push and GitHub CI URL
remain coordinator-owned; no remote SHA or CI result is claimed here.
