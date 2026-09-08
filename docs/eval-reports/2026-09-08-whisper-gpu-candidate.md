# Whisper ROCm candidate benchmark

Date: 2026-09-08
Host: Linux x86_64, AMD Ryzen 7 9800X3D (8 online CPUs), Radeon RX 9070 XT
(`gfx1201`), 30 GiB RAM
Toolchain: whisper.cpp v1.9.3 source, immutable commit
`371b5a7561823ab2bb32142d2751e35e7534727b` (tag `v1.9.3`), CMake 4.4.2,
ROCm/HIP 7.2.53211-9999, glslc 1.4.357.0

This is a local, sequential benchmark. No patient data, identifiers, private
recordings, model downloads, package installs, driver changes, or system-wide
configuration changes were made. The installed CPU binary and both pinned
weights were left untouched.

## Candidate and security boundary

The source was cloned only from `https://github.com/ggml-org/whisper.cpp.git`,
then detached at the recorded commit above. Upstream v1.9.3 documents
`-DGGML_HIP=1 -DAMDGPU_TARGETS="gfx1201"` for this GPU and requires HIP/ROCm
6.1 or newer; local CMake found HIP, hipBLAS, and rocBLAS. The private build
used `GGML_HIP=ON`, `AMDGPU_TARGETS=gfx1201`, `GGML_NATIVE=OFF`,
`WHISPER_BUILD_TESTS=OFF`, `WHISPER_BUILD_SERVER=OFF`, `WHISPER_CURL=OFF`,
`WHISPER_SDL2=OFF`, and two build jobs. No optional source or model download
path was enabled.

The reproducible development entry point is
[`scripts/build-whisper-candidate.sh`](../../scripts/build-whisper-candidate.sh).
It verifies the canonical remote and immutable commit, bounds jobs to 1–4,
supports explicit Linux `hip`, `vulkan`, or `cpu` backend selection, and
refuses to run on macOS so the existing Metal packaging path remains in place.

Artifacts from this run remain in the private development directory:

```text
source:    /tmp/apunta-whisper-src.ukWsLx/whisper.cpp
candidate: /tmp/apunta-whisper-src.ukWsLx/whisper.cpp/build-hip/bin/whisper-cli
sha256:    dcdb67eed88552babc2cc7ecdbde3167e3ac1e02315166824884123159ab20e0
```

The unchanged live CPU binary is
`/home/huyke/.local/share/apunta/bin/whisper-cli`, SHA-256
`990a2d5ca4bae0b031b29a836aa0ee2dea1aec15a538a25e557c84a9240b5573`.
The candidate reports `AMD Radeon RX 9070 XT, gfx1201` and uses `ROCm0` when
invoked with `--device 0`; the old binary reports `CPU`.

## Inputs and parity

The only speech input was whisper.cpp's checked-in public 11-second JFK sample,
`/tmp/apunta-whisper-src.ukWsLx/whisper.cpp/samples/jfk.wav` (16 kHz, mono,
16-bit PCM, SHA-256
`59dfb9a4acb36fe2a2affc14bacbee2920ff435cb13cc314a08c13f66ba7860e`). The
expected text is the checked-in public reference
`tests/parakeet-expected-jfk-output.txt` from the same source tree. The
repository's `e2e/fixtures/audio/dictation-10s.wav` is silent tone, so it was
not used for a speech-quality claim.

Both binaries used the same model files, English mode, lead-in prompt,
timestamps, and thread counts. Preview used `ggml-small.bin`, four threads,
`--audio-ctx 704`, beam 1, best-of 1, and no fallback. Final used
`ggml-large-v3-turbo-q5_0.bin`, eight threads, full audio context, and the
normal beam/fallback path. Model SHA-256 values:

```text
ggml-small.bin                  1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b
ggml-large-v3-turbo-q5_0.bin    394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2
```

Each cell is a first process invocation (`cold`) followed by an immediate
second invocation (`warm`). This is process/model-cache cold/warm, not a claim
that kernel or filesystem caches can be flushed safely while Ollama is running.

## Before/after results

Wall time is end-to-end process time; Whisper's internal total is included for
cross-checking. RSS is the peak sampled `/proc` resident set. VRAM is the peak
RX 9070 XT `mem_info_vram_used`; Ollama remained resident and was not stopped.
Temperature is the peak of the GPU hwmon temperature sensors during each
cell. The small baseline VRAM changes are resident-Ollama/driver noise.

| Pass | CPU old cold | ROCm candidate cold | CPU old warm | ROCm candidate warm |
|---|---:|---:|---:|---:|
| Preview wall | 701 ms | 378 ms | 722 ms | 377 ms |
| Preview Whisper total | 690 ms | 303 ms | 699 ms | 301 ms |
| Preview peak RSS | 636,432 KiB | 330,124 KiB | 634,984 KiB | 330,188 KiB |
| Preview VRAM delta | +2 MiB | +981 MiB | 0 MiB | +981 MiB |
| Preview peak GPU busy | 8% | 100% | 22% | 100% |
| Preview peak temp | 46 C | 48 C | 48 C | 49 C |
| Final wall | 4,988 ms | 451 ms | 5,140 ms | 449 ms |
| Final Whisper total | 4,979 ms | 365 ms | 5,109 ms | 368 ms |
| Final peak RSS | 822,108 KiB | 377,644 KiB | 822,504 KiB | 377,632 KiB |
| Final VRAM delta | 0 MiB | +1,164 MiB | +46 MiB | +1,162 MiB |
| Final peak GPU busy | 37% | 100% | 29% | 100% |
| Final peak temp | 50 C | 52 C | 48 C | 52 C |

Mean wall time improved from 712 ms to 378 ms for preview (1.88x faster) and
from 5,064 ms to 450 ms for final (11.25x faster). The candidate stayed well
below the 16 GiB discrete-VRAM budget, adding about 1.0 GiB for preview and
1.2 GiB for final above the resident Ollama allocation; no sustained thermal or
RAM pressure was observed.

## Quality, cancellation, and coexistence

All eight runs returned the same public reference sentence after timestamp
stripping. Normalized WER was 0 for every run. The available critical-token
check passed `not` (negation), `what`, `for`, and `country`; the 11-second
fixture contains no clinical terminology and no numeric token, so this cannot
establish medication, dose, number, or clinical-negation quality.

The candidate loaded both pinned weights successfully and honored the same CLI
arguments. A bounded cancellation check ran the final command under
`timeout --signal=TERM --kill-after=2s 0.2s`; it returned 124 and no
`whisper-cli` process remained. Preview and final were run sequentially with
the resident Ollama process; no overlap was attempted.

## Decision and approval request

This is a significant, stable Linux ROCm win, especially for the authoritative
final pass, with identical output on the authorized speech fixture. The
candidate is not installed, copied over the live binary, or wired into the
running app. Please approve a separate staged validation and explicit live
binary replacement only after app-level smoke/cancellation checks and a
rollback copy are agreed; no Mac performance claim is made, and the existing
Metal path must remain unchanged.
