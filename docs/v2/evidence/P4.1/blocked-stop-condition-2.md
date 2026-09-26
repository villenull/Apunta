# P4.1 — evidence: the redirect probe, and the stop it caused

- **Working directory:** repository root (`/home/villenull/Projects/Apunta`)
- **Branch:** `feature/v2`, HEAD `aaebc4d` (the dispatch's base, verified before
  anything else ran)
- **Node:** `v24.19.0`, exported first exactly as the card's rows write it
- **Status:** BLOCKED at Step 2, **stop condition 2**
- **Times:** 2026-09-26T16:05:44Z → 2026-09-26T16:07:32Z

`docs/v2/evidence/P4.1/redirects.md` is the observation itself and was written
by the script. This file is the record of what was run, what it cost, and why
the card stops there.

## Egress accounting — two executions, both disclosed

The card's Egress section grants this card's own probe: **seven `HEAD`
requests**, `redirect: 'manual'`, no follows, no bodies, no credentials, no
custom header, and no host outside the catalogue's own pinned URL. It also says
the grant "covers the step 1 probe and the V2 re-run and nothing else, and it
is spent when V2 completes".

| Execution | When (UTC) | Requests | Result | Why it happened |
| --- | --- | --- | --- | --- |
| 1 | 16:05:49Z | 7 `HEAD` | exit 0 | Step 1's probe, as written |
| 2 | 16:06:55Z | 7 `HEAD` | exit 0 | Step 1's probe, re-run to replace a defective evidence file |

**Execution 1 produced a defective file and execution 2 replaced it.** The
script had a rendering bug — the "Observed `Location` hosts" table printed
`undefined` where the artifact filenames belong, because it read
`observation.filename` off the wrong object — and the per-artifact SHA-256 line
read `not computed — not acquired — HEAD only, no bytes`. Both were defects in
the script, not in the observation: all seven per-artifact sections were
correct, and the host, the status and the query verdict were identical in both
runs. The file on disk is execution 2's, and it is the one a reviewer should
read. V2's re-run against the finished catalogue **never happened** — the card
stopped before there was a finished catalogue — so the grant's two authorised
executions were step 1's probe and its replacement.

No request outside the seven pinned URLs was made at any point. No `GET`. No
body read. No redirect followed. No retry. The V2 build step
(`npm run build --workspace @apunta/installer`) is local compilation and
contacts nothing.

## The commands

### `node scripts/v2/probe-redirects.mjs` (exit 0, twice)

```
$ export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH"
$ node scripts/v2/probe-redirects.mjs
HEAD https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin
HEAD https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin
HEAD https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base-q5_1.bin
HEAD https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin
HEAD https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small-q5_1.bin
HEAD https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin
HEAD https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q8_0.bin

wrote 7 artifacts to docs/v2/evidence/P4.1/redirects.md
redirect hosts observed: us.aws.cdn.hf.co
transport failures: 0
```

The seven URLs are the catalogue's own: the one pinned speech URL, recorded
under both entry names because `catalog.test.ts` pins `SPEECH_MODEL` and
`PREVIEW_SPEECH_MODEL` equal, plus the six C-STT candidate paths built by
substituting each filename into that URL's path. Seven requests, seven
artifacts.

### The observation, in one line

**All seven artifacts answer `302` and send the client to `us.aws.cdn.hf.co` —
which passes A07's domain rule — and every one of those seven `Location`s
carries a query string.**

| Artifact | Status | `Location` host | Domain rule | Query |
| --- | --- | --- | --- | --- |
| `ggml-tiny.en.bin` | 302 | `us.aws.cdn.hf.co` | passes | **present** |
| `ggml-base.bin` | 302 | `us.aws.cdn.hf.co` | passes | **present** |
| `ggml-base-q5_1.bin` | 302 | `us.aws.cdn.hf.co` | passes | **present** |
| `ggml-small.bin` | 302 | `us.aws.cdn.hf.co` | passes | **present** |
| `ggml-small-q5_1.bin` | 302 | `us.aws.cdn.hf.co` | passes | **present** |
| `ggml-large-v3-turbo-q5_0.bin` | 302 | `us.aws.cdn.hf.co` | passes | **present** |
| `ggml-large-v3-turbo-q8_0.bin` | 302 | `us.aws.cdn.hf.co` | passes | **present** |

`us.aws.cdn.hf.co` ends in `hf.co` on a dot boundary, so it is inside the
Hugging Face domain tree and **stop condition 1 does not fire**. No
`Location` was unattributable: each is the one returned by that artifact's own
request. No `Location` was `http:`, carried user-info, a port other than 443 or
a fragment — the only rule-1 refusal triggered is `query_not_allowed`, on all
seven. So **stop condition 2 fires, and it fires on every artifact, not on one
edge case.**

Both executions agree exactly — same host, same statuses, same query verdict —
so the card's "record both runs and say which one the admitted hosts came from"
clause has nothing to decide. Had the card reached Step 4, the admitted host
would have come from this observation.

The query string itself is written `<redacted>` in `redirects.md` and is not
pasted here either. The card requires that, and stop condition 2 repeats it.
What can be said without pasting it: the path is
`/xet-bridge-us/<repo-hash>/<file-hash>` and the query is present on every
response, which is the shape of a short-lived signed CDN URL rather than of a
plain file path. **The plan editor will need the key names to fill an
allowed-query-keys column, and one `HEAD` against the pinned URL is enough to
read them** — a request this card's grant does not cover, and which the card
correctly did not make.

## The stop

**Stop condition 2, verbatim:** "A `Location` that is `http:`, carries user-info,
a port other than 443, a fragment, or any query string. Record the exact
`Location`, report `BLOCKED`, and name the plan-editor action… Never add a
query-key exception to the catalogue to make a case pass — rule 1 is the
coordinator's to change (HS-7), and a query string is where a download URL
turns into a message."

Nothing was admitted. `catalog.ts` is untouched: no allowance object, no change
to `ALLOWED_DOWNLOAD_HOSTS`, no `sizeBytes`, no query exception of any kind.
Steps 3 and 4 were not started.

### Why the rest of the card was not implemented anyway

Not for lack of time, and this is the part the coordinator should check the
reasoning on:

1. **Step 3's case 2 cannot be written honestly.** "Approved redirect: two fetch
   calls, the pinned URL then the admitted CDN URL" can only be written against
   a `Location` *without* a query, because that is the only shape the guard
   permits. The real vendor never answers that way. A synthetic query-less
   redirect test would pass while the product could not make the request, and it
   would read as evidence that the feature works.
2. **V1 cannot pass without the 23 cases**, and the card is explicit that a run
   reporting the base's 12 files and 130 tests is `FAIL`, not `PASS`. So a
   partial implementation has no green row to show for it.
3. **Implementing rule 1 as written would break a download that works today.**
   `download.ts:98-102` currently issues `redirect: 'follow'`, so today's
   first-run setup follows this exact 302 to the CDN and the file arrives.
   Rule 3 replaces that with `redirect: 'manual'` plus a guard that refuses any
   query — so shipping the guard without the manifest change turns a working
   speech-model download into one that fails at the first hop, on a real
   machine, with a failure no test in this card would have caught. That is a
   regression to hand a reviewer inside a card whose own V1 is red.
4. **The rest of the card is independent of this decision** — the receipt, the
   `sizeBytes` pin, the readiness verdict and the Ollama digest read are all
   untouched by the query question. They are simply not reachable as a *green*
   card, and the card is one unit with one verification table. They are listed
   as unstarted work in the return file so a re-dispatch can pick them up
   without re-deriving them.

## Files this session added

- `scripts/v2/probe-redirects.mjs` (**new**, May edit) — the probe
- `docs/v2/evidence/P4.1/redirects.md` (**new**) — written by the probe
- `docs/v2/evidence/P4.1/v1.md`, `v2.md`, `v3.md` (**new**) — the three rows
- `docs/v2/evidence/P4.1/blocked-stop-condition-2.md` (**new**) — this file
- `docs/v2/state/returns/P4.1.md` (**new**) — the return

No May-edit path in `installer/` was touched: `catalog.ts`, `download.ts`,
`run.ts`, `resume.ts`, `ollama.ts` and every test file are byte-identical to
`aaebc4d`, and `installer/src/readiness.ts` and `readiness.test.ts` do not
exist. Nothing was committed or staged.
