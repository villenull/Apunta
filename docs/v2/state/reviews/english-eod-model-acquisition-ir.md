# Independent review — English EOD model acquisition (AM-198 / A17)

- Reviewer: fresh independent reviewer (first IR; no prior acquisition review
  existed — root's 00:01 UTC `list_agents` showed only root and the finished
  lint reviewer `a873`, both now archived; implementer `04340fea` archived).
- Target: stable commit `872bf016c0db36ad4af2408ca699eed6d3d8b65d`
  ("Record pinned English speech model acquisition"), branch `main`.
- Scope: read-only except this file and
  `docs/v2/evidence/english-eod-model-acquisition-ir/**`. No source, cache,
  author, card, config or manifest edits; nothing staged.
- Budget: one review, ~15 min.

## Verdict

**CLEAR.** The acquisition is genuine, singular, correctly guarded and
correctly receipted. The final file, its receipt, the author adapter and the
existing installer flow all check out. Three documentation/durability
observations (below) are non-blocking; none is a security, privacy or
correctness defect.

## Independently re-derived facts

| Check | Command | Result |
| --- | --- | --- |
| Size | `stat -c %s build/eod-model-cache/models/ggml-tiny.en.bin` | `77704715` — matches pin |
| SHA-256 | `sha256sum …` | `921e4cf8686fdd993dcd081a5da5b6c365bfde1162e72b08d75ac75289920b1f` — matches pin |
| SHA-1 | `sha1sum …` | `c78c86eb1a8faa21b369bcd33207cc90d64ae9df` — matches upstream |
| Mode/mtime | `stat` | `600`, `2026-10-03 17:58:40.990379934 -0600` |
| Receipt identity | `cat …/ggml-tiny.en.bin.receipt.json` | digest/size match; `dev=58 ino=12874748` match `stat`; `mtimeMs=1791071920990` → `date -d @1791071920.990` = `2026-10-03 17:58:40 -0600` |
| Ignored destination | `git check-ignore -v` | `.gitignore:55:build/` covers both cache and scratch |
| Live data untouched | destination path | under git-ignored `build/`; `~/.local/share/apunta` never touched |

## Commit integrity

`git show --name-status 872bf01` adds **only** the eight evidence files under
`docs/v2/evidence/english-eod-model-acquisition/`. No source, config,
catalogue, card, checkpoint or manifest file is in the commit. Working tree
carried only the pre-existing `eod-proof-lint-repair-ir` untracked entries
plus this review's own new files.

## Installer flow (existing, not reimplemented)

- `installer/src/run.ts:240-318` — refuses a null checksum before any socket;
  `downloadWithResume` → `verifyFile('<file>.part')` → on mismatch
  `discardDownload` + throw → `commitDownload(destination)` (rename) →
  pinned-size check → extra `hashFile` → `writeReceiptFor`. So **checksum
  before rename, receipt after verify** holds exactly as the README claims.
- `installer/src/download.ts:91-176` — `redirect: 'manual'`, ≤ `MAX_REDIRECT_HOPS`
  hand-followed, each `Location` re-checked by `assertRequestAllowed`, loop
  refused. Initial request checked before any socket (`:94`).
- `installer/src/readiness.ts:95-134` — `safeUrl` redacts any query to
  `?<redacted>`; `queryParameterNames` cuts each pair at its first `=`, never
  reading a value. `assertRequestAllowed` (`:192-254`) enforces https/443,
  no user-info, no fragment, per-artifact host list, and per-artifact query
  **names**.
- `installer/src/catalog.ts:61-63` — `huggingface.co` initial,
  `us.aws.cdn.hf.co` redirect only. `:220-234` `SPEECH_MODEL` pins
  `77_704_715` bytes and the exact SHA-256/SHA-1 above.
  `A07_ALLOWED_QUERY_KEYS` (`:121-133`) is the same ten names the run observed.

## Egress — one logical acquisition, names only

`egress-run.jsonl` (on-disk, git-ignored): 4 requests —
2× loopback `GET /api/tags`; 1× `GET https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin`
(`redirect: manual`); 1× `GET https://us.aws.cdn.hf.co/…` with the ten A07
query **names** and `queryValues:"<redacted>"`. No other host, path or method.
`run.ndjson`: only `speech_model` started/finished; `preview_model` and
`writing_model` `skipped` (the two speech entries name one file; the writing
tag was already present). `02-ollama-tags-after.txt`: `qwen3.5:4b-q4_K_M`
`modified_at` still `2026-09-26` — no pull/remove/replace.

## Synthetic guard probe (offline, injected stub — no real network)

`docs/v2/evidence/english-eod-model-acquisition-ir/guard-probe.ts` imports the
byte-identical scratch adapter, replaces `globalThis.fetch` with a recorder,
and probes refusals by "was fetch reached":

```
loopback /api/pull         -> REFUSED loopback_path_not_metadata  fetchReached=false
loopback /api/generate     -> REFUSED loopback_path_not_metadata  fetchReached=false
loopback /api/chat         -> REFUSED loopback_path_not_metadata  fetchReached=false
loopback /api/tags         -> ALLOWED                             fetchReached=true
loopback /api/show         -> ALLOWED                             fetchReached=true
loopback tags with query   -> REFUSED loopback_query_present      fetchReached=false
plain-http catalogue host  -> REFUSED scheme_not_https            fetchReached=false
allowed catalogue host     -> ALLOWED                             fetchReached=true
allowed redirect host      -> ALLOWED                             fetchReached=true
unlisted external host     -> REFUSED host_not_allowed            fetchReached=false
wrong port                 -> REFUSED port_not_allowed            fetchReached=false
user-info                  -> REFUSED user_info_present           fetchReached=false
fragment                   -> REFUSED fragment_present            fetchReached=false
total fetchReached=4
```

This independently confirms `pull`/`generate`/`chat` fail **closed before a
socket opens**, and that the redaction log records names only. Output:
`guard-probe-output.txt`; probe egress log at `/tmp/opencode/guard-probe-egress.jsonl`.

## Scoped checks

- `npx eslint docs/v2/evidence/english-eod-model-acquisition/{acquire,guarded-fetch}.ts`
  → exit 0.
- `npx prettier --check` on the same two files → exit 0, all formatted.
- Committed copies are byte-identical to the ignored scratch originals
  (`diff -q` on `acquire.ts`, `guarded-fetch.ts`, `plan.ndjson`, `run.ndjson`,
  `egress-plan.jsonl`, `egress-run.jsonl` → all identical).
- No acceptance rows touched. No test/build/e2e/inference/Ollama/7717 run.

## Observations (non-blocking, documentation/durability)

1. **README "Nothing was staged or committed"** — true of the acquisition act,
   but as committed in `872bf01` the evidence *is* committed. The sentence
   reads as a claim about the final tree and is literally false there.
2. **`egress-plan.jsonl` / `egress-run.jsonl` are git-ignored** by
   `.gitignore:26 (*.jsonl)` and are **not** in the commit, yet the README
   Files table lists them as part of the record. A fresh clone cannot
   reproduce the egress proof from the repo alone; it survives only on disk.
   The coordinator framed this as "ignored cache", so this may be intended —
   flagged only so the durability gap is explicit.
3. **The committed `acquire.ts` / `guarded-fetch.ts` are review copies**, not
   runnable in place: their `../../installer/...` imports resolve only from the
   ignored `build/eod-model-acquisition/` scratch path. README already says so.

## Files written by this review

- `docs/v2/state/reviews/english-eod-model-acquisition-ir.md` (this file)
- `docs/v2/evidence/english-eod-model-acquisition-ir/guard-probe.ts`
- `docs/v2/evidence/english-eod-model-acquisition-ir/guard-probe-output.txt`
- `/tmp/opencode/guard-probe-egress.jsonl` (outside repo)
