# Ollama GPU acceleration

Date: 2026-09-22  
Host: Linux x86_64, AMD Ryzen 7 9800X3D, Radeon RX 9070 XT (`gfx1201`,
16 GiB), kernel `7.2.5-3-omarchy`  
Ollama: `0.34.2` (`/home/villenull/.local/bin/ollama`)

This was a local, synthetic-only investigation. No patient data, live Apunta
instance (`:7717`), model weights, or system-wide configuration were changed.
The ModelEval process used the shared GPU for its clean four-model run; its
inference was allowed to finish before the final post-check below.

## Diagnosis

`command -v ollama` resolves to `/home/villenull/.local/bin/ollama`, and
`ollama --version` reports `0.34.2`. `pacman -Qs ollama` returned no installed
package, and `pacman -Qo /home/villenull/.local/bin/ollama` reports that no
package owns the file: this is an explicitly installed user binary, not an
installed `ollama`, `ollama-rocm`, or `ollama-vulkan` package. The local sync
database lists all three package variants at `0.33.3-1`; the current Arch
package pages list `ollama-rocm` and `ollama-vulkan` at `0.34.2-1` (build
2026-09-18). Installing either package is unnecessary because the current
binary already has the required backend and is fully offloading.

The documented `/tmp/claude-1000/ollama.log` was absent. The active server
log was `~/.local/var/log/ollama.log`. Its discovery and load lines say:

```text
inference compute ... library=ROCm compute=gfx1201
name="AMD Radeon RX 9070 XT" ... total="15.9 GiB"
load_tensors: offloaded 34/34 layers to GPU
load_tensors: ROCm0 model buffer size = 2513.56 MiB
```

The same log contains two non-blocking messages: the unsupported/irrelevant
integrated ROCm device (`gfx1036`) was dropped, and the Vulkan integrated GPU
was dropped (`OLLAMA_IGPU_ENABLE=1` would be required to opt into it). The
discrete RX 9070 XT is the selected `ROCm0` device.

Independent system probes were not installed: `rocminfo`, `vulkaninfo`, and
`/opt/rocm` are absent. This does **not** mean ROCm is absent from Ollama;
Ollama's bundled ROCm runtime detected `gfx1201` and loaded the GPU runner.
`lspci -nnk` reports `amdgpu` as the kernel driver and loaded module. The
user is in groups `villenull`, `docker`, and `wheel`, not `render` or `video`,
but the current device permissions are sufficient: `/dev/kfd` and both
`/dev/dri/renderD128` and `renderD129` are `crw-rw-rw- root:render`. The
`/dev/dri` directory itself is `drwxr-xr-x root:root`.

The primary server on `127.0.0.1:11434` and the ModelEval server on
`127.0.0.1:11435` both report version `0.34.2`. The currently used model store
is `/home/villenull/.ollama/models` (23 GiB); `/var/lib/ollama` from the older
handoff launch example is absent on this user account. The eval server had
`OLLAMA_NO_CLOUD=1`; no `OLLAMA_VULKAN`, `HSA_OVERRIDE_GFX_VERSION`, or
`OLLAMA_FLASH_ATTENTION` override was set.

## Before and after measurement

The fixed synthetic command was:

```sh
OLLAMA_HOST=127.0.0.1:11434 ollama run qwen3.5:4b-q4_K_M \
  'Reply with exactly 64 numbered words from 1 to 64, one space-separated line.' \
  --verbose
```

Qwen's reasoning mode produced a long completion despite the short request;
the generation rate is therefore a throughput measurement, not a quality
claim. The first run was the baseline. A second run performed while ModelEval
was using the shared GPU was discarded as a contention measurement (45.51
tokens/s). After ModelEval explicitly released the GPU, a short API warm-up
was followed by the identical command for the fair post-check.

| Measure | Before | Fair post-check |
|---|---:|---:|
| Total duration | 39.526 s | 37.591 s |
| Prompt eval | 622.73 tokens/s (31 tokens) | 689.30 tokens/s (31 tokens) |
| Generation | 107.11 tokens/s (4,065 tokens) | 108.29 tokens/s (4,065 tokens) |
| `ollama ps` model size | 3.6 GB | 3.1 GB |
| `ollama ps` processor | 100% GPU | 100% GPU |
| `ollama ps` context | 16,384 | 4,096 |

The context difference is from the two server request paths (the baseline
runner was already resident with the application-sized context; the post-check
CLI path loaded its default context). It does not alter the decisive result:
both observations report 100% GPU and the Ollama log reports all 34/34 layers
on ROCm. The fair post-check had a 0.413 s model load duration after the warm-up.

ModelEval's clean sequential direct probe on the second local server also
captured 100% GPU residency for larger Q4 models:

| Model | `size_vram` | Approx. VRAM |
|---|---:|---:|
| `qwen3.5:9b` | 6,014,380,276 bytes | 5.60 GiB |
| `qwen3:8b` | 7,520,177,356 bytes | 7.00 GiB |
| `qwen3:14b` | 11,827,402,505 bytes | 11.01 GiB |

These fit the 15.9 GiB discrete VRAM budget and were reported with `100%`
GPU processor residency. No claim is made here about their generation rates;
their purpose in this report is confirming full offload beyond the 4B model.

## Backend decision and settings

ROCm is the correct backend on this machine. Current Ollama's hardware
[documentation](https://docs.ollama.com/gpu) explicitly lists the RX 9070 XT
and `gfx1201` in the Linux ROCm support table, and says ROCm v7 is required.
It describes `HSA_OVERRIDE_GFX_VERSION` as an experiment for unsupported GPUs;
this GPU is directly listed and the runtime already detects it as `gfx1201`.
The same documentation describes Vulkan as an additional backend and notes
that it may need extra Linux components and VRAM capabilities. Vulkan CLI
support is not installed here, and selecting Vulkan would provide no benefit
over the already working discrete ROCm path.

Arch's current package metadata confirms separate
[`ollama-rocm`](https://archlinux.org/packages/extra/x86_64/ollama-rocm/) and
[`ollama-vulkan`](https://archlinux.org/packages/extra/x86_64/ollama-vulkan/)
variants at `0.34.2-1`. Neither was installed or benchmarked; replacing the
working user binary is not warranted.

No runtime fix was necessary or applied. The recommended server settings are:

- Keep the ROCm backend selected by default.
- Do not set `HSA_OVERRIDE_GFX_VERSION`; direct `gfx1201` support works.
- Do not set `OLLAMA_VULKAN`; Vulkan is not needed for this card here.
- Keep the Apunta application context setting at 16,384 where its existing
  prompt budget requires it; do not change it based on this throughput probe.
- Do not change `OLLAMA_FLASH_ATTENTION` or `OLLAMA_KV_CACHE_TYPE` without a
  separate quality/performance experiment; neither is needed for GPU offload.
- Keep `OLLAMA_NO_CLOUD=1` on evaluation/server launchers for the existing
  local-only boundary. It is a privacy setting, not a GPU setting.

The HANDOFF launch commands need no GPU/backend change or restart. For the
local-only privacy boundary, add `OLLAMA_NO_CLOUD=1` to both documented
launch commands when they are next edited; this does not affect GPU selection.
Ollama uses ROCm on the RX 9070 XT and fully offloads the tested 4B, 8B, 9B,
and 14B models.
