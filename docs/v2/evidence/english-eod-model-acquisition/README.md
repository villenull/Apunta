# English EOD — one owner-authorised speech-model acquisition (AM-198 / A17)

- Date: 2026-10-03 (UTC timestamps in `03-environment-and-commands.txt`).
- Authorisation: owner explicit approval, recorded as **AM-198** in
  `docs/v2/state/AMENDMENTS.md`; the manifest row is **A17** in
  `docs/v2/ACQUISITION.md`. The bounded readiness review that produced the
  command is `docs/v2/state/reviews/ENGLISH-EOD-model-readiness-correction.md`
  §6.2 (its persistent-cache alternative, which is the one used here).
- Result: **one** file acquired, verified, receipted. Exit 0. No other
  acquisition of any kind happened.

## What was acquired

| Field | Value |
| --- | --- |
| Item | `ggml-tiny.en.bin` (English-only whisper `tiny.en`), **only** |
| Destination | `build/eod-model-cache/models/ggml-tiny.en.bin` (git-ignored) |
| Declared initial URL (from the catalogue, `installer/src/catalog.ts:222`) | `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin` — no query of Apunta's own |
| Redirect observed | one `302` to `us.aws.cdn.hf.co` (the only redirect host A17 admits) |
| Query parameter **names** observed on that `Location` | the ten A07 names: `response-content-disposition`, `response-content-type`, `xip`, `X-Xet-Cas-Uid`, `user_id`, `Expires`, `Policy`, `Signature`, `Key-Pair-Id`, `Hash-Algorithm` — **values never read, never logged** |
| Size | 77,704,715 bytes (catalogue pin 77,704,715) |
| SHA-256 | `921e4cf8686fdd993dcd081a5da5b6c365bfde1162e72b08d75ac75289920b1f` — matches the pin |
| SHA-1 | `c78c86eb1a8faa21b369bcd33207cc90d64ae9df` — matches upstream's published digest |
| Licence | MIT (OpenAI Whisper), `catalog.ts:229-233`, `verified: true`, terms at `https://huggingface.co/ggerganov/whisper.cpp`. L-POLICY@1's row "models downloaded by the user at setup" applies; the file is **not** shipped and no public-distribution grant is claimed |
| Verifier | the installer's own, before the rename: `verifyFile` on `<file>.part`, then `commitDownload`, then the pinned-size check, then a receipt (`installer/src/run.ts:244-318`) |

Independent read-only confirmation after the run: `01-verification.txt`.

## How it was run

The **existing** installer's exported API, not a copy of it:

- `parseArgs` + `environmentFor` (`installer/src/cli.ts`) with
  `['run', '--data-dir', build/eod-model-cache, '--ollama-url',
  http://127.0.0.1:11434, '--model', 'qwen3.5:4b-q4_K_M']` — the command of the
  readiness review §6.2, second alternative;
- `runSetup` (`installer/src/run.ts`) unmodified, which brought its own plan,
  disk check, host/redirect/query/size/hash controls, commit and receipt;
- `fetchImpl` supplied by an **adapter** (`guarded-fetch.ts`, copied here) whose
  only job is to bound what may leave the process. No acquisition, checksum or
  commit logic was reimplemented; `curl` was not used to fetch anything.

Driver: `acquire.ts` (copied here). Scratch: git-ignored
`build/eod-model-acquisition/`. Node: pinned **v24.19.0**. Commands and base
commit: `03-environment-and-commands.txt`.

A `plan` sub-invocation ran first (`plan.ndjson`, `egress-plan.jsonl`). It
changes nothing, downloads nothing, and confirmed the shape before the single
acquisition was spent: `speech_model` needed, `preview_model` **not** needed
(the two entries name the same file), `writing_model` **not** needed (the tag is
already in the runtime's store).

## Guards that held

| Guard | Where | Observed |
| --- | --- | --- |
| Only loopback `/api/tags` and `/api/show` reachable | adapter | 2 `/api/tags` reads per invocation, nothing else |
| `/api/pull`, `/api/generate`, `/api/chat` fail closed before a socket opens | adapter | never requested; `writing_model` step `skipped` |
| No Ollama pull, remove or replace | HS-3, AM-198 | `writing_model` `skipped`; tag list identical afterwards, `qwen3.5:4b-q4_K_M` `modified_at` still 2026-09-26 (`02-ollama-tags-after.txt`) |
| https, port 443, no user-info, no fragment | `readiness.ts` + adapter | one https/443 request pair |
| Per-artifact host allow-list, separate redirect allow-list | `catalog.ts`, `readiness.ts` | `huggingface.co` initial; `us.aws.cdn.hf.co` redirect only |
| Manual redirects, ≤5 hops, loop refused | `download.ts` | `redirect: 'manual'`, 1 hop |
| Query **names** only; values never read | `readiness.ts`, adapter | ten A07 names recorded, values `<redacted>` |
| Pinned size enforced | `run.ts:303` | 77,704,715 exactly |
| Mandatory checksum before rename; receipt only after | `run.ts:282-318` | `verifying` step emitted, then receipt |
| Live data folder untouched | HS-1 | destination is under git-ignored `build/`; `~/.local/share/apunta` never opened |

## Files

| File | What it is |
| --- | --- |
| `01-verification.txt` | post-run `stat`, `sha256sum`, `sha1sum`, receipt |
| `02-ollama-tags-after.txt` | read-only `/api/tags` after the run |
| `03-environment-and-commands.txt` | Node pin, tsx path, base commit, UTC time, ignore rules, exact commands |
| `plan.ndjson`, `egress-plan.jsonl` | the no-op plan pass and its egress log |
| `run.ndjson`, `egress-run.jsonl` | the acquisition pass and its egress log (4 requests: 2 loopback tags, 1 catalogue GET, 1 admitted CDN GET) |
| `acquire.ts`, `guarded-fetch.ts` | copies of the ignored scratch driver and adapter, for review |

## Not claimed, not done

No source, config, catalogue, card, checkpoint or manifest file was edited. No
test, build, lint, typecheck or e2e run. No app, server, database, sandbox
launch, microphone, display, `pactl`, model inference or system install; port
7717 never contacted. No Spanish benchmark unparked, no S4a.2 work, no A07
candidate touched, no other model acquired. The downloader was **not** re-run to
prove anything: the verdict rests on reading the final file and its receipt.
Nothing was staged or committed.

The file exists only at `build/eod-model-cache/models/ggml-tiny.en.bin`. A
sandbox or EOD run still needs it at the path its `APUNTA_DATA_DIR` resolves
(`<dataDir>/models/ggml-tiny.en.bin`) or pointed at it by the `whisper_model`
setting — that wiring is not part of this acquisition.
