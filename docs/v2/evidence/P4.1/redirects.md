# P4.1 — redirect probe, one `HEAD` per pinned artifact

Written by `scripts/v2/probe-redirects.mjs`, which read every URL out of the built catalogue
(`installer/dist/catalog.js`) and held no URL literal of its own. This file is the run.

## The run

- **Date (UTC):** 2026-09-26T18:58:22.075Z
- **Node:** v26.8.2
- **Requests:** 7 — one `HEAD` each, `redirect: 'manual'`
- **Hops followed:** 0 in total — no `Location` was ever requested
- **Bytes acquired:** none. No response body was read, nothing was downloaded, no model was pulled, no Ollama daemon was contacted.
- **Credentials:** none. No cookie jar, no `Authorization`, no query of its own, no fragment, no custom header. Whatever `User-Agent` Node sends was left alone.
- **Host names below are the artefact's content**, recorded as observed, the way
  `docs/v2/evidence/P1.5/licence-evidence.md` records a public vendor URL.

## Observed `Location` hosts

| host | artifacts that returned it | A07 domain rule |
| --- | --- | --- |
| `us.aws.cdn.hf.co` | `ggml-tiny.en.bin`, `ggml-base.bin`, `ggml-base-q5_1.bin`, `ggml-small.bin`, `ggml-small-q5_1.bin`, `ggml-large-v3-turbo-q5_0.bin`, `ggml-large-v3-turbo-q8_0.bin` | passes |

## Per artifact

### `ggml-tiny.en.bin`

- **Catalogue entries:** `SPEECH_MODEL` and `PREVIEW_SPEECH_MODEL`
- **Attribution:** The two catalogue entries name literally the same file (`catalog.test.ts` pins them equal), so this is **one** request recorded under both entry names.
- **Method:** `HEAD`, `redirect: 'manual'` — the `Location` is read and never requested
- **Request URL:** `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin`
- **Response status:** `302`
- **Hops followed:** 0 — a `HEAD` is the whole of this probe and no `Location` was requested
- **Date (UTC):** 2026-09-26T18:58:22.075Z
- **`Location` observed (would be hop 1; never requested):**

  - host: `us.aws.cdn.hf.co`
  - scheme: `https:`
  - port: absent (the scheme's default, 443)
  - query: present — `<redacted>`, never pasted
  - query key names (values never read): `Expires`, `Hash-Algorithm`, `Key-Pair-Id`, `Policy`, `Signature`, `X-Xet-Cas-Uid`, `response-content-disposition`, `response-content-type`, `user_id`, `xip`
  - user-info: absent
  - fragment: absent
  - attributable to this artifact alone: yes — this is the `Location` this artifact's own request returned
  - A07's domain rule (`huggingface.co` or `hf.co` on a dot boundary): **passes**
  - rule 1 refusals triggered: `query_not_allowed`
  - exact `Location`, query redacted: `https://us.aws.cdn.hf.co/xet-bridge-us/641ab5d15d107c5c5f346372/0d686a2a6a22b02da2ef3101d4c86e68461363a623c58f27f81b1b2d36b42317?<redacted>`
- **Acquisition (`docs/v2/ACQUISITION.md` §1 fields):**

  - exact version/revision: not acquired — HEAD only, no bytes
  - URL: `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin`
  - size: not acquired — HEAD only, no bytes
  - SHA-256: not computed — HEAD only, no bytes
  - licence evidence: MIT (OpenAI Whisper) — https://huggingface.co/ggerganov/whisper.cpp (`verified: true`); Read from the catalogue entry itself.
  - date: 2026-09-26T18:58:22.075Z

### `ggml-base.bin`

- **Catalogue entries:** _no catalogue entry yet — S4a.2 chooses one of the six_
- **Attribution:** A C-STT candidate. Its URL is the pinned speech URL with this filename substituted into the path, so it is the same host and the same repository as the pinned entry.
- **Method:** `HEAD`, `redirect: 'manual'` — the `Location` is read and never requested
- **Request URL:** `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin`
- **Response status:** `302`
- **Hops followed:** 0 — a `HEAD` is the whole of this probe and no `Location` was requested
- **Date (UTC):** 2026-09-26T18:58:22.075Z
- **`Location` observed (would be hop 1; never requested):**

  - host: `us.aws.cdn.hf.co`
  - scheme: `https:`
  - port: absent (the scheme's default, 443)
  - query: present — `<redacted>`, never pasted
  - query key names (values never read): `Expires`, `Hash-Algorithm`, `Key-Pair-Id`, `Policy`, `Signature`, `X-Xet-Cas-Uid`, `response-content-disposition`, `response-content-type`, `user_id`, `xip`
  - user-info: absent
  - fragment: absent
  - attributable to this artifact alone: yes — this is the `Location` this artifact's own request returned
  - A07's domain rule (`huggingface.co` or `hf.co` on a dot boundary): **passes**
  - rule 1 refusals triggered: `query_not_allowed`
  - exact `Location`, query redacted: `https://us.aws.cdn.hf.co/xet-bridge-us/641ab5d15d107c5c5f346372/2f62d18b50c3f3feafbf990eec23a93d319660b1efbdd3fff55e52b7cde2e374?<redacted>`
- **Acquisition (`docs/v2/ACQUISITION.md` §1 fields):**

  - exact version/revision: not acquired — HEAD only, no bytes
  - URL: `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin`
  - size: not acquired — HEAD only, no bytes
  - SHA-256: not computed — HEAD only, no bytes
  - licence evidence: MIT (OpenAI Whisper) — https://huggingface.co/ggerganov/whisper.cpp (`verified: true`); Inherited from the pinned entry: same publisher and same repository, not a separate read of this artifact’s terms.
  - date: 2026-09-26T18:58:22.075Z

### `ggml-base-q5_1.bin`

- **Catalogue entries:** _no catalogue entry yet — S4a.2 chooses one of the six_
- **Attribution:** A C-STT candidate. Its URL is the pinned speech URL with this filename substituted into the path, so it is the same host and the same repository as the pinned entry.
- **Method:** `HEAD`, `redirect: 'manual'` — the `Location` is read and never requested
- **Request URL:** `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base-q5_1.bin`
- **Response status:** `302`
- **Hops followed:** 0 — a `HEAD` is the whole of this probe and no `Location` was requested
- **Date (UTC):** 2026-09-26T18:58:22.075Z
- **`Location` observed (would be hop 1; never requested):**

  - host: `us.aws.cdn.hf.co`
  - scheme: `https:`
  - port: absent (the scheme's default, 443)
  - query: present — `<redacted>`, never pasted
  - query key names (values never read): `Expires`, `Hash-Algorithm`, `Key-Pair-Id`, `Policy`, `Signature`, `X-Xet-Cas-Uid`, `response-content-disposition`, `response-content-type`, `user_id`, `xip`
  - user-info: absent
  - fragment: absent
  - attributable to this artifact alone: yes — this is the `Location` this artifact's own request returned
  - A07's domain rule (`huggingface.co` or `hf.co` on a dot boundary): **passes**
  - rule 1 refusals triggered: `query_not_allowed`
  - exact `Location`, query redacted: `https://us.aws.cdn.hf.co/xet-bridge-us/641ab5d15d107c5c5f346372/1472da3b8dde27b952b515a60bbea06532be2639bcecc5a6c9dd248bed11865d?<redacted>`
- **Acquisition (`docs/v2/ACQUISITION.md` §1 fields):**

  - exact version/revision: not acquired — HEAD only, no bytes
  - URL: `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base-q5_1.bin`
  - size: not acquired — HEAD only, no bytes
  - SHA-256: not computed — HEAD only, no bytes
  - licence evidence: MIT (OpenAI Whisper) — https://huggingface.co/ggerganov/whisper.cpp (`verified: true`); Inherited from the pinned entry: same publisher and same repository, not a separate read of this artifact’s terms.
  - date: 2026-09-26T18:58:22.075Z

### `ggml-small.bin`

- **Catalogue entries:** _no catalogue entry yet — S4a.2 chooses one of the six_
- **Attribution:** A C-STT candidate. Its URL is the pinned speech URL with this filename substituted into the path, so it is the same host and the same repository as the pinned entry.
- **Method:** `HEAD`, `redirect: 'manual'` — the `Location` is read and never requested
- **Request URL:** `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin`
- **Response status:** `302`
- **Hops followed:** 0 — a `HEAD` is the whole of this probe and no `Location` was requested
- **Date (UTC):** 2026-09-26T18:58:22.075Z
- **`Location` observed (would be hop 1; never requested):**

  - host: `us.aws.cdn.hf.co`
  - scheme: `https:`
  - port: absent (the scheme's default, 443)
  - query: present — `<redacted>`, never pasted
  - query key names (values never read): `Expires`, `Hash-Algorithm`, `Key-Pair-Id`, `Policy`, `Signature`, `X-Xet-Cas-Uid`, `response-content-disposition`, `response-content-type`, `user_id`, `xip`
  - user-info: absent
  - fragment: absent
  - attributable to this artifact alone: yes — this is the `Location` this artifact's own request returned
  - A07's domain rule (`huggingface.co` or `hf.co` on a dot boundary): **passes**
  - rule 1 refusals triggered: `query_not_allowed`
  - exact `Location`, query redacted: `https://us.aws.cdn.hf.co/xet-bridge-us/641ab5d15d107c5c5f346372/edd29d67e70b000132af65205b99bb774b77abc13d10103e14f80ce2242913e1?<redacted>`
- **Acquisition (`docs/v2/ACQUISITION.md` §1 fields):**

  - exact version/revision: not acquired — HEAD only, no bytes
  - URL: `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin`
  - size: not acquired — HEAD only, no bytes
  - SHA-256: not computed — HEAD only, no bytes
  - licence evidence: MIT (OpenAI Whisper) — https://huggingface.co/ggerganov/whisper.cpp (`verified: true`); Inherited from the pinned entry: same publisher and same repository, not a separate read of this artifact’s terms.
  - date: 2026-09-26T18:58:22.075Z

### `ggml-small-q5_1.bin`

- **Catalogue entries:** _no catalogue entry yet — S4a.2 chooses one of the six_
- **Attribution:** A C-STT candidate. Its URL is the pinned speech URL with this filename substituted into the path, so it is the same host and the same repository as the pinned entry.
- **Method:** `HEAD`, `redirect: 'manual'` — the `Location` is read and never requested
- **Request URL:** `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small-q5_1.bin`
- **Response status:** `302`
- **Hops followed:** 0 — a `HEAD` is the whole of this probe and no `Location` was requested
- **Date (UTC):** 2026-09-26T18:58:22.075Z
- **`Location` observed (would be hop 1; never requested):**

  - host: `us.aws.cdn.hf.co`
  - scheme: `https:`
  - port: absent (the scheme's default, 443)
  - query: present — `<redacted>`, never pasted
  - query key names (values never read): `Expires`, `Hash-Algorithm`, `Key-Pair-Id`, `Policy`, `Signature`, `X-Xet-Cas-Uid`, `response-content-disposition`, `response-content-type`, `user_id`, `xip`
  - user-info: absent
  - fragment: absent
  - attributable to this artifact alone: yes — this is the `Location` this artifact's own request returned
  - A07's domain rule (`huggingface.co` or `hf.co` on a dot boundary): **passes**
  - rule 1 refusals triggered: `query_not_allowed`
  - exact `Location`, query redacted: `https://us.aws.cdn.hf.co/xet-bridge-us/641ab5d15d107c5c5f346372/f4a8c6ba84184c3af18f9f63ca9f777e27d39858c1435d27b8b9239092c16c15?<redacted>`
- **Acquisition (`docs/v2/ACQUISITION.md` §1 fields):**

  - exact version/revision: not acquired — HEAD only, no bytes
  - URL: `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small-q5_1.bin`
  - size: not acquired — HEAD only, no bytes
  - SHA-256: not computed — HEAD only, no bytes
  - licence evidence: MIT (OpenAI Whisper) — https://huggingface.co/ggerganov/whisper.cpp (`verified: true`); Inherited from the pinned entry: same publisher and same repository, not a separate read of this artifact’s terms.
  - date: 2026-09-26T18:58:22.075Z

### `ggml-large-v3-turbo-q5_0.bin`

- **Catalogue entries:** _no catalogue entry yet — S4a.2 chooses one of the six_
- **Attribution:** A C-STT candidate. Its URL is the pinned speech URL with this filename substituted into the path, so it is the same host and the same repository as the pinned entry.
- **Method:** `HEAD`, `redirect: 'manual'` — the `Location` is read and never requested
- **Request URL:** `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin`
- **Response status:** `302`
- **Hops followed:** 0 — a `HEAD` is the whole of this probe and no `Location` was requested
- **Date (UTC):** 2026-09-26T18:58:22.075Z
- **`Location` observed (would be hop 1; never requested):**

  - host: `us.aws.cdn.hf.co`
  - scheme: `https:`
  - port: absent (the scheme's default, 443)
  - query: present — `<redacted>`, never pasted
  - query key names (values never read): `Expires`, `Hash-Algorithm`, `Key-Pair-Id`, `Policy`, `Signature`, `X-Xet-Cas-Uid`, `response-content-disposition`, `response-content-type`, `user_id`, `xip`
  - user-info: absent
  - fragment: absent
  - attributable to this artifact alone: yes — this is the `Location` this artifact's own request returned
  - A07's domain rule (`huggingface.co` or `hf.co` on a dot boundary): **passes**
  - rule 1 refusals triggered: `query_not_allowed`
  - exact `Location`, query redacted: `https://us.aws.cdn.hf.co/xet-bridge-us/641ab5d15d107c5c5f346372/9c7b9c6bf60cf555f34fe7d81e8643764ff03d2f60b6fa550f5630be52eef830?<redacted>`
- **Acquisition (`docs/v2/ACQUISITION.md` §1 fields):**

  - exact version/revision: not acquired — HEAD only, no bytes
  - URL: `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin`
  - size: not acquired — HEAD only, no bytes
  - SHA-256: not computed — HEAD only, no bytes
  - licence evidence: MIT (OpenAI Whisper) — https://huggingface.co/ggerganov/whisper.cpp (`verified: true`); Inherited from the pinned entry: same publisher and same repository, not a separate read of this artifact’s terms.
  - date: 2026-09-26T18:58:22.075Z

### `ggml-large-v3-turbo-q8_0.bin`

- **Catalogue entries:** _no catalogue entry yet — S4a.2 chooses one of the six_
- **Attribution:** A C-STT candidate. Its URL is the pinned speech URL with this filename substituted into the path, so it is the same host and the same repository as the pinned entry.
- **Method:** `HEAD`, `redirect: 'manual'` — the `Location` is read and never requested
- **Request URL:** `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q8_0.bin`
- **Response status:** `302`
- **Hops followed:** 0 — a `HEAD` is the whole of this probe and no `Location` was requested
- **Date (UTC):** 2026-09-26T18:58:22.075Z
- **`Location` observed (would be hop 1; never requested):**

  - host: `us.aws.cdn.hf.co`
  - scheme: `https:`
  - port: absent (the scheme's default, 443)
  - query: present — `<redacted>`, never pasted
  - query key names (values never read): `Expires`, `Hash-Algorithm`, `Key-Pair-Id`, `Policy`, `Signature`, `X-Xet-Cas-Uid`, `response-content-disposition`, `response-content-type`, `user_id`, `xip`
  - user-info: absent
  - fragment: absent
  - attributable to this artifact alone: yes — this is the `Location` this artifact's own request returned
  - A07's domain rule (`huggingface.co` or `hf.co` on a dot boundary): **passes**
  - rule 1 refusals triggered: `query_not_allowed`
  - exact `Location`, query redacted: `https://us.aws.cdn.hf.co/xet-bridge-us/641ab5d15d107c5c5f346372/971539eabfa951d62cc5e06672e676da1e5e8768115056362fe6301b664b4ea4?<redacted>`
- **Acquisition (`docs/v2/ACQUISITION.md` §1 fields):**

  - exact version/revision: not acquired — HEAD only, no bytes
  - URL: `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q8_0.bin`
  - size: not acquired — HEAD only, no bytes
  - SHA-256: not computed — HEAD only, no bytes
  - licence evidence: MIT (OpenAI Whisper) — https://huggingface.co/ggerganov/whisper.cpp (`verified: true`); Inherited from the pinned entry: same publisher and same repository, not a separate read of this artifact’s terms.
  - date: 2026-09-26T18:58:22.075Z

## What a reader may conclude

- The redirect host set is exactly the table above, and it is a candidate list only:
  `docs/v2/ACQUISITION.md` A07's redirect cell is a placeholder this card fills by
  observation, and the coordinator replaces that cell through the plan editor before
  S4a.2 is unblocked. Until it is, nothing observed here is claimed approved.
- No size and no SHA-256 appear in this file because none was computed. A `HEAD` returns
  headers, not bytes; §1's fields are recorded as such rather than left blank.

