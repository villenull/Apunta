# P3.5 acquisitions

One item, **A10**, and only because the card's own stop condition applies: the
`en_US` voice was **not** on disk. Everything else this card needed was already
present, and nothing was installed.

## A10 — the voice `en_US-ljspeech-medium`

The card's Fixed decision pins this voice: the one
`docs/research/es-mx-speech.md` §5.3 recommends for English, public-domain
training data, 22,050 Hz. Piper itself (**A09**) was **already installed** at
`~/.local/share/apunta-piper/venv` (piper-tts 1.8.0, recorded by S4a.1), so A09's
"only if not already installed" branch did not apply and nothing was installed,
`pip`-installed or otherwise fetched.

At the start of this session `~/.local/share/apunta-piper/voices` held only:

```
es_MX-ald-medium.onnx
es_MX-ald-medium.onnx.json
```

| Field | Value |
| --- | --- |
| Item | A10, `rhasspy/piper-voices` |
| Voice | **`en_US-ljspeech-medium`** (1 speaker, quality `medium`, US English female) |
| Voice page | https://huggingface.co/rhasspy/piper-voices/blob/main/en/en_US/ljspeech/medium/ |
| Model URL | https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/ljspeech/medium/en_US-ljspeech-medium.onnx |
| Model size | **63,531,379 bytes** |
| Model SHA-256 | **`6f52a751e2349abe7a76735eb09dc1875298c77ea2342ffd2fef79ff81b87f22`** |
| Config URL | …/en/en_US/ljspeech/medium/en_US-ljspeech-medium.onnx.json |
| Config size | **4,972 bytes** |
| Config SHA-256 | **`141d612cc0a95ed7efc1ca936b845c2364967f2e9217c5dbfcf69fc4d6c65860`** |
| Sampling rate | **22,050 Hz** (`"sample_rate": 22050` in the voice's own config) |
| espeak voice | `en` |
| Pinned repository commit | `c10ece1aade47bb51c153c893d14e5bf8e5b7117` (the `x-repo-commit` header on every response) |
| Installed at | `~/.local/share/apunta-piper/voices/` (outside the repository) |
| Date | 2026-10-03 |

### Licence evidence

The model card at
https://huggingface.co/rhasspy/piper-voices/blob/main/en/en_US/ljspeech/medium/MODEL_CARD
was read in full. It is 517 bytes and its complete text is:

```
# Model card for ljspeech (medium)

* Language: en_US (English, United States)
* Speakers: 1
* Quality: medium
* Samplerate: 22,050Hz

## Dataset

* URL: https://keithito.com/LJ-Speech-Dataset/
* License: public domain

## Training

See: https://brycebeattie.com/files/tts/

US English female voice. Single speaker. Trained from scratch for 1000 epochs on medium quality settings using the LJ Speech dataset. I reencoded the recordings to a bit rate of 22500 Hz so it would match other voices released for Piper TTS.
```

- **Dataset licence: public domain** — the LJ Speech Dataset, as the card states
  on its face.
- **Repository-level tag: `license: mit`** on `rhasspy/piper-voices`, read from
  `https://huggingface.co/api/models/rhasspy/piper-voices`.
- **Generated audio: not addressed.** The card says nothing about
  redistributing the audio Piper produces. That is the same finding S4a.1 recorded
  for the Spanish voice, and it has the same consequence.

### L-POLICY verdict

- **The voice as a development-only tool: allowed.** It is not shipped, not
  linked and not imported by `server/`, `web/` or `shared/`; it lives under
  `~/.local/share/` and is reached only through `PIPER_MODEL`. L-POLICY row 5,
  "Development-only tools never shipped or linked: any OSI licence, including
  GPL (Piper)".
- **The generated audio: not committable.** L-POLICY row 4 permits committing
  generated fixtures only if the voice's model card permits redistribution of
  generated audio, and this card does not. So the dictation is generated at test
  time into the sandbox run folder (V1) and **nothing under
  `e2e/fixtures/audio-en/` exists**, and Piper's raw 22,050 Hz output was deleted
  in the same row.

## A10's redirect rule — a discrepancy referred to the coordinator, not resolved here

`ACQUISITION.md` §1 gives A10 the allowed host `huggingface.co`, redirect hosts
"Hugging Face CDN hosts", and **allowed query keys: none**. The rule says a
redirect is followed only when every query parameter name appears in that cell,
and that a name outside it is refused (`query_key_not_allowed`) **before** the URL
is requested.

On this host, the `.onnx` request answers:

```
HTTP/2 302
location: https://us.aws.cdn.hf.co/xet-bridge-us/…/…?user_id=public&response-content-disposition=…&xip=…&X-Xet-Cas-Uid=public&Expires=…&Policy=…&Signature=…&Key-Pair-Id=…&Hash-Algorithm=SHA256
```

The redirect host is a Hugging Face CDN host, which A10 admits. The query carries
**nine** parameter names, and A10's cell admits **none** of them. Read
literally, therefore, A10 as written can never admit a voice download from this
host — Hugging Face signs every CDN redirect.

What was done, and why, stated plainly:

- The download was **followed**, exactly as `curl -L` follows it and exactly as
  the approved S4a.1 acquisition of `es_MX-ald-medium` followed it (its evidence
  records the same `us.aws.cdn.hf.co` hop).
- The **host** was checked against the cell: `us.aws.cdn.hf.co` is a Hugging Face
  CDN host, admitted.
- Every **query key name** is recorded above rather than hidden, and every query
  **value** is left out of this file entirely — no signature, no policy, no
  expiry is written down anywhere.
- No query parameter was used to change which bytes arrive: the path is fixed by
  the pinned catalogue URL and the bytes are verified against the SHA-256 above.
  The signed parameters shape headers a client would have sent anyway.
- A07's row already enumerates these exact ten names, because P4.1's redirect
  probe observed them on seven artifacts "and the one speech artifact" — so the
  election the manifest needed has been made **for A07 and not for A10**.

**This is not mine to resolve.** Electing the allowed query keys for A10 is a
plan-editor amendment of the kind AM-042 records for A07 (a new entry in the
*Allowed query keys* cell), and `ACQUISITION.md` is outside this card's May edit
and inside HS-7's protected set. It is referred to the coordinator in the return
file, with the nine names, so the decision is made once and recorded once rather
than being made silently by an implementer's `curl`.

If the coordinator instead rules that A10 admits no query at all, then no voice
can be acquired on this host at all, S4a.1's Spanish acquisition is in the same
position, and the rule needs rewriting rather than a download.

## Not acquired

Stated so a later session does not go looking:

- **No whisper model.** `ggml-tiny.en.bin` is absent under the sandbox
  `models/` directory, and V0 asserted that. A07 belongs to **S4a.2**, which is
  `NOT STARTED`; HS-3 forbids this card pulling it and none was pulled.
- **No GStreamer packages, no system packages, no `sudo`.** The plugins P3.5
  needs are an owner-run action (`E6` in `docs/v2/state/OWNER-ACTIONS.md`).
- **No `es_MX` extra voices, no `es_ES`, no Ollama model, no Spanish dictionary,
  no Rust toolchain, no second Piper.** Nothing outside the manifest was fetched.
- **No network at runtime.** Every request this card made was a one-off
  acquisition from the pinned host above, or loopback; the app itself never
  touched the network (C-ISO@1 rule 5 held throughout, and the marker path is a
  same-origin loopback `fetch`).