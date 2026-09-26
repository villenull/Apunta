# S4a.1 acquisitions

Two items, both `docs/v2/ACQUISITION.md` A09 and A10, both named by this card,
both development-only and **not shipped**. Applied rules, verbatim: A09 is
"`piper-tts`, newest release on acquisition day, only if not already installed",
from `pypi.org` / `files.pythonhosted.org`, redirect hosts none; A10 is "Piper
voices" from `huggingface.co` (`rhasspy/piper-voices`), redirect hosts Hugging Face
CDN hosts.

**Piper was not installed on this machine before this session**
(`command -v piper` empty; the S1.3 research records the same absence), so A09's
"only if not already installed" branch was the applicable one and the install ran.

**Neither object is shipped, linked or imported by `server/`, `web/` or
`shared/`.** Both live under `~/.local/share/apunta-piper/`, outside the
repository, and are reached only through `PIPER_BIN` and `PIPER_MODEL`. This is
permitted by L-POLICY row 5, "development-only tools never shipped or linked:
any OSI licence, including GPL (Piper)".

## A09 — Piper TTS

| Field | Value |
| --- | --- |
| Item | A09, `piper-tts` |
| Version | **1.8.0** (newest on 2026-09-26; uploaded to PyPI 2026-09-04T16:47Z) |
| Project URL | https://pypi.org/project/piper-tts/ |
| Package URL | https://files.pythonhosted.org/packages/…/`piper_tts-1.8.0-cp39-abi3-manylinux_2_17_x86_64.manylinux_2_28_x86_64.whl` |
| Wheel size | 34,131,442 bytes |
| Wheel SHA-256 | `25b4d3f31ff70c8fa7151908e00aaa5650cbdf16bca8fcf21299f3941b89a7d3` |
| Integrity | PyPI's own per-file digest, from `https://pypi.org/pypi/piper-tts/json`; the install reported `Successfully installed … piper-tts-1.8.0` |
| Upstream | https://github.com/OHF-Voice/piper1-gpl (as `Home-page` in the wheel metadata) |
| Installed at | `~/.local/share/apunta-piper/venv` (a user venv, `python3 -m venv`, **no sudo, no system package**) |
| Interpreter | CPython 3.14.7 (system), abi3 `cp39` wheel, `requires_python >=3.9` |
| Transitive deps | `onnxruntime` 1.30.0, `numpy` 2.5.3, `protobuf` 7.36.2, `flatbuffers` 25.12.19, `pathvalidate` 3.3.1, `packaging` 26.3 |

### Licence evidence

- Wheel metadata field `License: GPL-3.0-or-later`.
- The **full GPL v3 text ships inside the wheel** at
  `site-packages/piper_tts-1.8.0.dist-info/licenses/COPYING` — 35,148 bytes,
  SHA-256 `CuBIWlvTemPmNgNZZBfk6w5lMzT6bH-TLKOg6F1K8ic` (from the dist-info
  `RECORD`), beginning "GNU GENERAL PUBLIC LICENSE / Version 3, 29 June 2007".
- One bundled third-party component is separately licensed: `g2pW` (Chinese
  polyphone conversion) ships `LICENSE.g2pW-Apache-2.0`, Apache-2.0. Recorded for
  completeness; it is dev-only and unshipped like the rest.
- L-POLICY verdict: allowed, under the development-only-tools row. **No licence
  obstacle, and none for the corpus either** — the licence question that decides
  whether audio may be *committed* is the voice's model card, below, and it
  answers no.

## A10 — the voice `es_MX-ald-medium`

One voice for the whole corpus, as the card's first Fixed decision pins it
(`es-mx-speech.md` §5.4). A10 allows all `es_MX` voices, at most 3; the card's
Fixed decision narrows that to exactly one, and `es_ES` was **not** needed —
`es_MX` exists, so the fallback does not trigger.

| Field | Value |
| --- | --- |
| Item | A10, `rhasspy/piper-voices` |
| Voice | **`es_MX-ald-medium`** (1 speaker, quality `medium`) |
| Voice URL | https://huggingface.co/rhasspy/piper-voices/blob/main/es/es_MX/ald/medium/ |
| Model URL | https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_MX/ald/medium/es_MX-ald-medium.onnx |
| Model size | **63,201,294 bytes** |
| Model SHA-256 | **`019b3803293c93e34a206dd2e53a3889209a514e786fd7144f7b70196c579b63`** |
| Config URL | …/es/es_MX/ald/medium/es_MX-ald-medium.onnx.json |
| Config size | 4,878 bytes |
| Config SHA-256 | `5a71498158e04afc8099bfd019c7e87c68eb9d042505a2b1a87e5c1ac2b1a61d` |
| Redirect host actually used | `us.aws.cdn.hf.co` (a Hugging Face CDN host, as A10 allows); the `.onnx.json` resolved on `huggingface.co` itself |
| Sampling rate | **22,050 Hz**, from the model card and from the voice's own `audio.sample_rate` |
| espeak voice | `es-419` (Latin American Spanish) |
| Installed at | `~/.local/share/apunta-piper/voices/` (outside the repository) |
| Recorded in | `reference.json` `voices[0]` = `{name, sha256, bytes}` — the pinned three keys |

The `sha256` above is the one in every `reference.json` this card produced, and it
is the value the reviewer should compare against.

### Licence evidence, and the answer that is *not* permissive

The model card at
https://huggingface.co/rhasspy/piper-voices/blob/main/es/es_MX/ald/medium/MODEL_CARD
was read in full. It is 320 bytes and its complete text is:

```
# Model card for ald (medium)

* Language: es_MX (Spanish, Mexico)
* Speakers: 1
* Quality: medium
* Samplerate: 22,050Hz

## Dataset

* URL: https://huggingface.co/datasets/rmcpantoja/Ald_Mexican_Spanish_speech_dataset
* License: http://unlicense.org

## Training

Finetuned from Spanish davefx voice (medium quality).
```

- **Dataset licence: the Unlicense** (`http://unlicense.org`, a public-domain
  dedication), for `rmcpantoja/Ald_Mexican_Spanish_speech_dataset`. This is why
  the card's Fixed decision chose `ald` over `claude` (apache-2.0) and over
  `ald/x_low` (whose card states **no** dataset licence).
- **Repository-level tag: `license: mit`** on `rhasspy/piper-voices` (from
  `https://huggingface.co/api/models/rhasspy/piper-voices`).
- **Generated audio: `[not found]`.** The card says nothing about redistributing
  the audio Piper produces, which is what `es-mx-speech.md` §5.4 concluded after
  reading all five candidate cards. The MIT repo tag covers the repository's own
  files and the Unlicense covers the training recordings; neither is permission
  from the voice's model card.

**Consequence, and it is the reason nothing in `e2e/fixtures/audio-es/` but a
README is committed:** L-POLICY row 4 permits committing generated fixtures *only
if the voice's model card permits redistribution of generated audio*. It does not,
so the audio is generated at test time into the sandbox and never committed.
`docs/research/es-mx-speech.md` §7.4 and §7.2 note that relaxing this is a
question for a Mexican lawyer, not a decision this card or its implementer could
take.

## Not acquired

Stated so a later session does not go looking: no `en_US` voice (P3.5's A10 row),
no `es_MX` extra voices, no `es_ES` voice, no Ollama model, no whisper.cpp model or
build, no Spanish dictionary, no Rust toolchain. HS-3 permits nothing outside the
manifest, and none of it was needed.
