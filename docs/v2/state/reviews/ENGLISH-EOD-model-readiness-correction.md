# English EOD — model-readiness correction (bounded, read-only)

- Role: bounded corrective follow-up to
  `docs/v2/state/reviews/ENGLISH-EOD-runtime-readiness.md`. Not an
  implementation, not a card attempt, not an acceptance run, not an owner
  decision.
- Scope: `main` at `c6ae03d`. The previous report's scope `5f57347` is an
  ancestor.
- Reads: `CLAUDE.md`; `docs/v2/HARD-STOPS.md`; `docs/v2/ACQUISITION.md`;
  `docs/v2/CONTRACTS.md` (C-ACQ@1, C-STT@1, C-LANG@1); `docs/decisions.md`;
  `docs/v2/DECISIONS.md`; `docs/v2/state/AMENDMENTS.md`;
  `docs/v2/state/PROGRESS.json`; `docs/v2/state/cards/{P3.4,P3.5,P3.6}.json`;
  `docs/v2/cards/P3.6.md`; `docs/v2/state/reviews/P3.6-EOD-readiness.md`;
  `docs/v2/state/EOD-2026-10-03-EXECUTION-PLAN.md`;
  `docs/v2/evidence/P3.6/dispatch-preparation/*`;
  `shared/src/{models,effective-model,transcribe,platform-paths}.ts`;
  `server/src/config.ts`; `server/src/ai/stt-settings.ts`;
  `installer/src/{catalog,cli,plan,run,download,readiness,ollama,disk}.ts`;
  `installer/package.json`; `scripts/v2/sandbox.mjs`.
- Writes: this file and `docs/v2/evidence/english-eod-model-readiness/**` only.
  Scratch under git-ignored `build/english-eod-model/` (created, empty). The
  old `docs/v2/state/reviews/ENGLISH-EOD-runtime-readiness.md` and
  `docs/v2/evidence/english-eod-readiness/**` are left untouched as historical
  record.
- One routine read-only metadata check was run, and it is explicitly permitted:
  `ollama list` (tags only, no prompt, no inference, no pull/remove/reload, no
  patient data). No app, build, model inference, audio, microphone, display,
  DB, port 7717, install or external-network use. No download. No child agent,
  no question. No commit, no stage. The tag read did not touch the exclusive
  native build/audio lease held by `c88d6043`.

## Verdict

**One owner-only action remains, and it is now exact: run the existing
installer's first run for the single English pinned `ggml-tiny.en.bin`, to a
non-live path.** The Ollama half is already satisfied — `qwen3.5:4b-q4_K_M` is
present on this host. The previous report's other blockers are stale: P3.5 is
APPROVED (AM-197), P3.4 is mid-attempt-6 (AM-195) with its ACL assertion already
passed (AM-188), and the Stop 8 pin is CLEAR. What the previous report got
wrong is corrected in §1, the live facts are in §2–§5, and the exact command and
decision text for root review are in §6.

## 1. Corrections to the previous report

| # | Previous report said | Correct now | Authority |
| --- | --- | --- | --- |
| C1 | P3.4 needs owner decision D1 (amend + accept-with-disclosure) | Stale. P3.4 is `IN PROGRESS` attempt 6; the ACL assertion passed at attempt 5; AM-188 approved the package and AM-195 approved one attempt 6. No amend/accept-disclosure pending | `P3.4.json`; AMENDMENTS.md:415,429 |
| C2 | P3.5 `SUBMITTED`, not APPROVED | APPROVED under AM-197; final review CLEAR 41/41 | `P3.5.json`; AMENDMENTS.md:433 |
| C3 | P3.6 C2 "Stop 8 V3-invariant pin drift — live" | CLEAR: P3.6's May-edit quote is byte-identical (modulo GFM `\|`) to P3.4's current V3 cell and runs to `matches: 0`, exit 0 | `dispatch-preparation/03-…txt` |
| C4 | P3.6 V3 harness `tauri-e2e-smoke.test.mjs` exists / "already encodes" the ten flows | It does **not** exist; it is a new file in P3.6's May edit, and V3 runs `APUNTA_FAKE_AI=1`. No artifact encodes the real whisper/Ollama workflow | `ls`; `P3.6.md:125,301,403` |
| C5 | Sandbox model path `/tmp/apunta-v2/<runId>/models/ggml-tiny.en.bin` | Exact path is `/tmp/apunta-v2/<runId>/data/models/ggml-tiny.en.bin` | `sandbox.mjs:120-155,299-310` |
| C6 | Whisper model "not on disk anywhere on this machine" | Only "absent at the declared paths checked"; no broad scan was done | `evidence/…/02-…txt` |
| C7 | Promoted default is `DEFAULT_MODEL` | It is `PROMOTED_DEFAULT_MODEL = 'qwen3.5:4b-q4_K_M'`; `DEFAULT_MODEL` is `gemma4:12b-it-qat` | `models.ts:29,43` |
| C8 | G2: `qwen3.5:4b-q4_K_M` presence unverified; owner must run `ollama list` | Verified present by this review's read-only `ollama list`. No owner action, no pull | `evidence/…/01-…txt` |

The previous report's whisper-pin facts were correct: `SPEECH_MODEL` at
`catalog.ts:220-234` pins `ggml-tiny.en.bin`, size `77,704,715`, SHA-256
`921e4cf8686fdd993dcd081a5da5b6c365bfde1162e72b08d75ac75289920b1f`, hosts
`huggingface.co` + redirect `us.aws.cdn.hf.co`.

## 2. Actual Ollama tags and the Ollama half (live, read-only)

`ollama list` (exit 0) shows: `apunta-study-fable-therapy-9b-q4:latest`,
`translategemma:4b`, `gemma4:12b`, `apunta-study-qwen35-9b-q3:latest`,
`apunta-study-qwen35-9b-q4:latest`, and **`qwen3.5:4b-q4_K_M`
(`2a654d98e6fb`, 3.4 GB, 7 days ago)**.

`qwen3.5:4b-q4_K_M` is the promoted default (`models.ts:43`,
`effective-model.ts:68`). It is present, so **no Ollama acquisition is needed**
and A08's "never pull a tag that already exists" is not triggered. `gemma4:12b`
is present but A08 names `gemma4:12b-it-qat`, a different tag; not needed.

## 3. Whisper model presence, bounded

The model is absent at the declared paths checked: the live default
`/home/villenull/.local/share/apunta/models/ggml-tiny.en.bin` (the live data dir
itself is absent) and everywhere under `/tmp/apunta-v2/` (including the correct
`*/data/models/` path). This is **not** a claim about the whole machine; no
broad home scan was performed. Full detail: `evidence/…/02-…txt`.

## 4. Exact paths (derived from source)

| Context | `APUNTA_DATA_DIR` | Model path |
| --- | --- | --- |
| Live default | `/home/villenull/.local/share/apunta` (`$XDG_DATA_HOME/apunta`) | `<dataDir>/models/ggml-tiny.en.bin` |
| Sandbox | `/tmp/apunta-v2/<runId>/data` | `/tmp/apunta-v2/<runId>/data/models/ggml-tiny.en.bin` |

`modelsDir = join(dataDir, 'models')` (`server/src/config.ts:187`,
`installer/src/cli.ts:106-116`); the server resolves the file from the
`whisper_model` setting or `join(modelsDir, 'ggml-tiny.en.bin')`
(`stt-settings.ts:48-53`). The installer writes the same destination
(`run.ts:59-61`).

## 5. The existing installer path and its controls

- Invocation: `npm run setup --workspace @apunta/installer -- run [--data-dir
  PATH] [--ollama-url URL] [--model TAG]` (`cli.ts:41-86`;
  `installer/package.json` `"setup": "tsx src/main.ts"`). `plan` changes
  nothing; `run` downloads. It opens no database and starts no server.
- Controls: HTTPS/443, no user-info/fragment; per-artifact host allow-list with
  a separate redirect allow-list; manual redirects, ≤5 hops, loop refused;
  query **names only** (the ten A07 names; values never read or logged);
  mandatory checksum verification before rename; size must equal `77,704,715`;
  readiness probes never write; receipt only after verification; explicit user
  start only; no re-run once ready. Full detail: `evidence/…/03-…txt`.
- **Exactly one file** is downloaded (the preview names the same file, so the
  `preview_model` step is not needed and the bytes are counted once).
- **No Ollama pull** while `qwen3.5:4b-q4_K_M` is present: `probeState` marks
  the writing model present via `/api/tags` and `runSetup` skips that step.
- The server's egress guard is not relaxed; a test asserts nothing in
  `server/`, `web/` or `shared/` imports the installer.

## 6. Exact minimal owner action (for root review before the owner is asked)

### 6.1 The decision text

> Authorise exactly one English acquisition: the existing installer's first run
> for the single pinned `ggml-tiny.en.bin` (77,704,715 bytes, SHA-256
> `921e4cf868…20b1f`), started explicitly by the owner, into a project-ignored
> model cache or an authorised sandbox path — never the live data folder.
> Checksum verification is mandatory. The allowed hosts are `huggingface.co`
> and its observed redirect `us.aws.cdn.hf.co`; the only query parameters are
> the ten A07 names (values never read). No Spanish benchmark is unparked, no
> S4a.2 work is authorised, and no A07 candidate is touched. No Ollama model is
> pulled, removed or replaced.

This is required by HS-3: no `ACQUISITION.md` row names `ggml-tiny.en.bin`
(A07 covers only the six Spanish C-STT candidates), so no agent may run it;
hard rule 1's installer carve-out plus hard rule 1(a) makes it an owner action.

### 6.2 The exact command (owner runs; **not run by this review**)

Recommended — an authorised sandbox run folder, so the model lands where the
server's default path already points:

```sh
cd /home/villenull/Projects/Apunta
export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH"
node scripts/v2/sandbox.mjs env --port 7879 > /tmp/apunta-eod-model.env
. /tmp/apunta-eod-model.env            # APUNTA_DATA_DIR=/tmp/apunta-v2/<runId>/data
npm run setup --workspace @apunta/installer -- run \
  --data-dir "$APUNTA_DATA_DIR" \
  --ollama-url http://127.0.0.1:11434 \
  --model qwen3.5:4b-q4_K_M
```

Expected: the `speech_model` step downloads and verifies
`$APUNTA_DATA_DIR/models/ggml-tiny.en.bin` and writes its receipt; the
`preview_model` and `writing_model` steps are `skipped`; the run ends with a
`done` event. Nothing touches `~/.local/share/apunta` and no Ollama tag is
pulled.

Alternative — a persistent, git-ignored cache (`build/` is in `.gitignore`);
the sandbox server would then be pointed at it via the `whisper_model` setting
or a copy into the run folder:

```sh
npm run setup --workspace @apunta/installer -- run \
  --data-dir "$PWD/build/eod-model-cache" \
  --ollama-url http://127.0.0.1:11434 \
  --model qwen3.5:4b-q4_K_M
```

Verification after either command:

```sh
stat -c '%s' "$APUNTA_DATA_DIR/models/ggml-tiny.en.bin"   # 77704715
sha256sum "$APUNTA_DATA_DIR/models/ggml-tiny.en.bin"      # 921e4cf8…20b1f
```

### 6.3 What root should check before asking the owner

1. The command overrides `--data-dir` off the live default (it does).
2. `--model qwen3.5:4b-q4_K_M` names the tag that is present, so no pull can
   happen (it does).
3. The command is the installer only, not the server and not the browser (it
   is).
4. The decision text names one file, one pin, one host pair, no Spanish work
   (it does).

## 7. Ready queue (updated)

| # | Action | Who | State |
| --- | --- | --- | --- |
| 1 | P3.5 approval | Root | **Done** — APPROVED AM-197 |
| 2 | P3.4 D1 amend/accept-disclosure | Owner | **Not needed** — AM-188/AM-195 resolved it |
| 3 | Stop 8 re-pin | Coordinator | **Done** — CLEAR |
| 4 | Ollama `qwen3.5:4b-q4_K_M` presence | — | **Done** — present (this review) |
| 5 | English `ggml-tiny.en.bin` acquisition | **Owner** | **Ready** — command in §6, for root review first |
| 6 | P3.4 attempt-6 V0–V4 once | Runtime worker | Active under AM-195 |
| 7 | P3.6 dispatch | Root | Blocked on P3.4 APPROVED |
| 8 | Real whisper + real Ollama EOD run | Runtime worker | Blocked on 5 + 7; no harness exists yet |

## 8. Not claimed

Not an acceptance, not a card attempt, not an owner approval, not a source
review, not a runtime run, not a download, not an inference run. No patient
data was read; the only external read was `ollama list` tag metadata. The
whisper-model absence is bounded to the declared paths checked. The P3.6
harness's real-workflow capability is not claimed. Nothing was staged,
committed or pushed; the previous report and its evidence are untouched.
