# English EOD — runtime readiness (static, read-only)

- Role: bounded readiness review for the owner's English desktop EOD target —
  real whisper transcription + Ollama English note draft/refine/save/reopen/
  export/recovery/shutdown. Not an implementation, not a card attempt, not an
  owner decision, not an acceptance run.
- Scope: `main` at `5f57347`. Reads only: `CLAUDE.md`; `docs/HANDOFF.md`;
  `docs/v2/HARD-STOPS.md`; `docs/v2/ACQUISITION.md`;
  `docs/v2/state/EOD-2026-10-03-EXECUTION-PLAN.md`;
  `docs/v2/state/EOD-2026-10-03-CRITICAL-PATH.md`;
  `docs/v2/state/EOD-2026-10-03-CRITICAL-PATH.md`;
  `docs/v2/state/reviews/P3.6-EOD-readiness.md`;
  `docs/v2/state/reviews/P3.5-runtime4-readiness.md`;
  `docs/v2/state/reviews/P3.5-impl4.md`;
  `docs/v2/state/reviews/P3.5-final-runtime-audit.md`;
  `docs/v2/state/reviews/P3.5-final-runtime-audit-qualification.md`;
  `docs/v2/state/cards/P3.4.json`; `docs/v2/state/cards/P3.5.json`;
  `docs/v2/cards/P3.5.md`; `docs/v2/cards/P3.6.md`;
  `docs/v2/evidence/P3.5/V0-host-and-build.md`;
  `docs/v2/evidence/P3.5/attempt-4/runtime/{README,03-V0,07-V3,08-V4,10-cleanup-verification}.txt`;
  `docs/v2/evidence/eod-2026-10-03/artifacts-readiness.txt`;
  `shared/src/transcribe.ts`; `server/src/ai/stt-settings.ts`;
  `server/src/ai/whisper.ts`; `installer/src/catalog.ts`;
  `scripts/v2/sandbox.mjs`.
- Writes: this file and `docs/v2/evidence/english-eod-readiness/**` only.
  Scratch under git-ignored `build/english-eod-readiness/`. No source, card,
  checkpoint, dispatch, manifest, config, contract or Expected-cell edit; no
  acceptance row run; no app, build, model, server, DB, audio, microphone,
  display, input, `pactl`, network, install or port-7717 use. No child agent,
  no question. No commit, no stage.
- Metadata-only checks this review ran (all read-only, all on declared paths):
  `stat` on `~/.local/share/apunta/models/ggml-tiny.en.bin` (absent — the
  live v1 data dir is absent on this box per `artifacts-readiness.txt`);
  `find` for `ggml-tiny.en.bin` and `models/` under `/tmp/apunta-v2/` (both
  empty — no whisper model in any sandbox run folder). No patient data, no
  credentials, no env dump, no broad home-filesystem scan.

## Verdict

**BLOCKED on one owner-only action: whisper model acquisition.** Everything
else on the English path is either already proven or ready to run once that
model is on disk. Ollama's daemon is installed and was alive during P3.5's
frozen runs, but no live inference run has yet demonstrated
`qwen3.5:4b-q4_K_M` drafting. The shortest authorized demonstration is a
sandboxed AppImage run **without** `APUNTA_FAKE_AI=1`, with the whisper model
at `$APUNTA_DATA_DIR/models/ggml-tiny.en.bin`, driven through the same
capture → transcribe → draft → refine → save → reopen → export → recovery →
shutdown sequence P3.6's V3 harness already encodes.

## 1. Whisper model — exact path, catalog, presence, acquisition

### 1.1 Expected env and path

| Fact | Value | Source |
| --- | --- | --- |
| Setting | `whisper_model` (empty → default path) | `shared/src/transcribe.ts:74-75` |
| Default path | `<data dir>/models/ggml-tiny.en.bin` | `server/src/ai/stt-settings.ts:48-53` |
| Sandbox data dir | `/tmp/apunta-v2/<runId>/` | `scripts/v2/sandbox.mjs:52` (`SANDBOX_ROOT`) |
| Sandbox model path | `/tmp/apunta-v2/<runId>/models/ggml-tiny.en.bin` | derived from the two rows above |
| Live data dir | `~/.local/share/apunta/` (absent on this box) | `docs/v2/evidence/eod-2026-10-03/artifacts-readiness.txt:24` |

### 1.2 Catalog item (the pin)

`installer/src/catalog.ts:220-234` — `SPEECH_MODEL`:

| Field | Value |
| --- | --- |
| filename | `ggml-tiny.en.bin` |
| URL | `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin` |
| SHA-1 | `c78c86eb1a8faa21b369bcd33207cc90d64ae9df` |
| SHA-256 | `921e4cf8686fdd993dcd081a5da5b6c365bfde1162e72b08d75ac75289920b1f` |
| sizeBytes | `77,704,715` |
| allowance | `huggingface.co` + redirect `us.aws.cdn.hf.co` |
| licence | MIT (OpenAI Whisper), verified |

### 1.3 Presence — confirmed absent (metadata only)

- `stat ~/.local/share/apunta/models/ggml-tiny.en.bin` → `No such file or
  directory`. The live v1 data dir itself is absent on this box
  (`artifacts-readiness.txt:24`).
- `find /tmp/apunta-v2 -maxdepth 2 -name ggml-tiny.en.bin` → no matches.
  `find /tmp/apunta-v2 -maxdepth 2 -type d -name models` → no matches.
- P3.5 attempt-4 V0 asserted `test ! -e "$APUNTA_DATA_DIR/models/ggml-tiny.en.bin"`
  and it **passed** (`docs/v2/evidence/P3.5/V0-host-and-build.md:79`).
- P3.5 attempt-4 V3 and V4-tone frozen logs show the app surfacing
  `whisper_model_missing` (`"code":"whisper_model_missing","detail":"no model
  file at the configured path (77 chars)"`) on real WAV payloads
  (`07-V3.txt:70,80`; `08-V4.txt:66,80`).

**Conclusion: the whisper model is not on disk anywhere on this machine.**
Real whisper transcription cannot be demonstrated without acquiring it.

### 1.4 Acquisition — what the allowlist says

| Rule | Text | Source |
| --- | --- | --- |
| HS-3 | Only items in `ACQUISITION.md`; never pull an Ollama tag that already exists locally; never remove or replace an Ollama model | `docs/v2/HARD-STOPS.md:15-17` |
| A07 | Whisper models, exactly the six C-STT candidates — `huggingface.co` (ggerganov/whisper.cpp), redirect `us.aws.cdn.hf.co`; "selected one only" | `docs/v2/ACQUISITION.md:19` |
| A07 card | S4a.2 (NOT STARTED, owner-parked) | `docs/v2/ACQUISITION.md:19` last column |
| Hard rule 1 exception | The installer / first-run component may download model weights under the pinned allow-list, with checksum verification | `CLAUDE.md` hard rule 1 |

The `ggml-tiny.en.bin` file is **not** one of the six C-STT candidates A07
names. It is the **installer's** pinned catalog entry (`SPEECH_MODEL`), and
the only authorized download path for it is the installer's first-run
component. S4a.2 (which owns the six-candidate C-STT benchmark) is parked
and does not cover this file. **No agent may download it.** The owner must
either run the installer's first-run download or explicitly authorize the
acquisition.

### 1.5 What P3.5 proved and did not prove

| Proved | Not proved |
| --- | --- |
| Real WebKitGTK microphone capture through a virtual source, contained, with cleanup (V3, V4-tone PASS 35/35) | Any word-level transcription — the model is missing |
| The AppImage launches, the server answers, the patient is created, the record/stop clicks work, `levelPeak` moves | Any Ollama draft, refine, or note save — no live inference run |
| `whisper_model_missing` is the designed no-model state, surfaced cleanly | Silence-mode discrimination (V4-silence was completed under AM-196 but its transcript is S4a.2's) |

## 2. Ollama readiness — frozen logs, not a live inference run

| Fact | Evidence | Source |
| --- | --- | --- |
| Ollama daemon is installed and was alive during P3.5's runs | `1123 /usr/bin/ollama serve` | `10-cleanup-verification.txt:24` |
| "ollama is still running" assertion passed in V3 and V4-tone | `PASS V3 ollama is still running`; `PASS V4-tone ollama is still running` | `07-V3.txt:90`; `08-V4.txt:89` |
| The promoted default model is `qwen3.5:4b-q4_K_M` | `DEFAULT_MODEL` in `shared/src/models.ts`; `WRITING_MODELS` entry in `installer/src/catalog.ts:311-327` | — |
| A08 rule | `gemma4:12b-it-qat` only if absent; `qwen3.5:4b-q4_K_M` never pulled if present | `docs/v2/ACQUISITION.md:20` |

**What is NOT proved:** that `qwen3.5:4b-q4_K_M` is currently loaded or that
a live draft/refine/save cycle works end-to-end. The frozen logs show the
daemon is alive; they do not show a model tag being served. The minimum
read-only check is `ollama list` (tags only, no pull) — but that is a runtime
action this review did not run.

## 3. P3.4 and P3.5 gate status

| Card | Status | What blocks it |
| --- | --- | --- |
| P3.4 | `BLOCKED` (attempt 5 of 5, exhausted) | V2(a) `typeof` invariant FAIL; V2(b)/(c) click-through NOT RUN. V3 invariant, V1 CSP unit, V2 containment assertions all PASS. Needs owner decision D1 (amend + accept-with-disclosure, or park). |
| P3.5 | `SUBMITTED` (all six criteria PASS after AM-196 silence completion) | Not yet APPROVED — `nextAllowedAction: root-decision-after-evidence-review`. The runtime lease is released. |

**Neither card is APPROVED.** P3.6's dispatch gate
(`build-dispatch.mjs:186-188`) refuses while either dependency is
unapproved. No partial dispatch exists.

## 4. P3.6 — the integration card

P3.6 is the card that drives the ten in-AppImage flows end-to-end. Its V3
row (`docs/v2/cards/P3.6.md:403`) runs:

```
env APUNTA_FAKE_AI=1 node scripts/v2/tauri-e2e-smoke.test.mjs smoke
```

That is **fake AI** — reproducible with zero AI tooling. It does **not**
demonstrate real whisper transcription or real Ollama drafting. The ten
flows are: onboarding, capture (fixture), draft, refine, publish and copy,
patient list, plan, briefing, brainstorm, settings, backup
(`P3.6.md:248-256`).

P3.6 is NOT STARTED. Its dependencies are P3.4, P3.5, P3.7 (APPROVED) and
P2.R (APPROVED). The P3.6 EOD readiness review
(`docs/v2/state/reviews/P3.6-EOD-readiness.md`) records three conditions:
C1 (P3.4+P3.5 APPROVED), C2 (Stop 8 V3-invariant pin drift — live), C3
(serial build lease — now free).

## 5. Shortest authorized fabricated-sandbox demonstration (real whisper + Ollama)

This is the concrete sequence once P3.4/P3.5 are APPROVED and the whisper
model is on disk. It reuses existing harnesses and the P3.6 pattern.

### 5.1 Preconditions (owner-only)

1. **Owner authorizes whisper model acquisition.** Either run the
   installer's first-run (the only authorized download path for
   `ggml-tiny.en.bin`) or explicitly authorize the acquisition under
   A07's rules. The model must land at
   `/tmp/apunta-v2/<runId>/models/ggml-tiny.en.bin` in the sandbox run
   folder (or the `whisper_model` setting must point at it).
2. **Verify Ollama model presence** (read-only): `ollama list` must show
   `qwen3.5:4b-q4_K_M`. If absent, A08 applies ("never pulled if present"
   cuts the other way — the owner must authorize the pull; agents never
   pull).
3. **P3.4 and P3.5 APPROVED** in `PROGRESS.json` (the P3.6 dispatch gate).

### 5.2 Concrete commands (isolated, fabricated data only)

```sh
# 1. Create the sandbox env (fresh run folder under /tmp/apunta-v2/)
export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH"
node scripts/v2/sandbox.mjs env --port 7879 > /tmp/apunta-v2-eod.env
. /tmp/apunta-v2-eod.env
#    → APUNTA_DATA_DIR=/tmp/apunta-v2/<runId>/
#    → APUNTA_PORT=7879 (never 7717, HS-1)
#    → APUNTA_NO_OPEN=1

# 2. Place the whisper model (owner-authorized acquisition already done)
mkdir -p "$APUNTA_DATA_DIR/models"
#    model file must be at $APUNTA_DATA_DIR/models/ggml-tiny.en.bin
#    (77,704,715 bytes, SHA-256 921e4cf8…20b1f)

# 3. Verify the binary precondition (A06 candidate, already built)
test -x "${APUNTA_WHISPER_WORK_DIR:-$HOME/.cache/apunta-v2/whisper-src}/whisper.cpp/build-${APUNTA_WHISPER_BACKEND:-vulkan}/bin/whisper-cli"

# 4. Verify Ollama model presence (read-only, no pull)
ollama list | grep qwen3.5:4b-q4_K_M

# 5. Launch the AppImage with REAL AI (no APUNTA_FAKE_AI=1)
#    The test-identity AppImage at:
#    src-tauri/target/release/bundle/appimage/'Apunta (test)_'*.AppImage
#    Drive the same ten flows P3.6 V3 encodes, but with real transcription
#    and real drafting. The existing harness pattern is
#    scripts/v2/tauri-e2e-smoke.test.mjs (P3.6's harness, currently new)
#    or scripts/v2/tauri-audio.test.mjs (P3.5's capture harness).
```

### 5.3 The flow sequence to demonstrate

| Step | What proves it | Existing evidence/harness |
| --- | --- | --- |
| Desktop launch | AppImage starts, ready-line handshake | P3.3 V3-V5 APPROVED |
| Fabricated patient | `POST /api/patients` John Smith in run folder | P3.5 V3 PASS |
| Real speech → text | WAV → whisper-cli → transcript (model present) | P3.5 V3 proved recording; transcription needs the model |
| Draft | Ollama `qwen3.5:4b-q4_K_M` streams the note | v1 eval reports (synthetic); needs live run |
| Refine | Refine chat with the four locks | v1 `check:refine` reports; needs live run |
| Save / reopen | PATCH persists, reload reads it back | P1 APPROVED |
| Export / Finish & copy | Clipboard read matches persisted body | v1 saved-note UI proof |
| Recovery | `/api/backup` + staged restore | P2 APPROVED |
| Shutdown | Quit ladder (shutdown → SIGTERM → SIGKILL) | P3.3 V3 APPROVED |

### 5.4 Real-model lease

One model loaded at a time. Ollama `keep_alive` must be set so the model
unloads after the run. No other build, audio capture or real-model workload
in parallel. This is the same rule ACQUISITION.md §1's four-arm comparison
and the EOD execution plan's capacity section both state.

## 6. Existing tests/harness reuse

| Harness | What it proves | Reuse for the EOD demonstration |
| --- | --- | --- |
| `scripts/v2/tauri-audio.test.mjs` (P3.5) | Real capture, tone/silence, containment | The capture + transcription half; already drives the record/stop clicks and reads `/api/transcribe` |
| `scripts/v2/tauri-e2e-smoke.test.mjs` (P3.6, new) | Ten in-AppImage flows in fake mode | The draft/refine/save/reopen/export/recovery/shutdown half; needs a real-AI mode (or a sibling harness) |
| `scripts/v2/sandbox.mjs` | Isolation, port band, data-folder guard | Every command above runs through it |
| `scripts/v2/tauri-lifecycle.test.mjs` (P3.3) | Launch/relaunch/single-instance/shutdown | P3.6 V5 asserts its fatal-mode coverage exists; do not re-run |
| `e2e/` (Playwright) | Fake-mode flows | CI only; not the real-model proof |

## 7. Likely P36 integration mechanism

P3.6's V3 harness (`tauri-e2e-smoke.test.mjs`) is the integration point.
The card already specifies a single `smoke` mode that launches the test
AppImage and drives the ten flows. The real-model demonstration needs:

1. A **real-AI mode** (or a separate harness sibling) that does **not** set
   `APUNTA_FAKE_AI=1`.
2. A **pre-flight assertion** that
   `$APUNTA_DATA_DIR/models/ggml-tiny.en.bin` exists and matches the
   pinned size (`77,704,715` bytes) — fail closed if absent, exactly as
   P3.5's V0 asserts the opposite for the capture-only path.
3. A **pre-flight assertion** that Ollama serves `qwen3.5:4b-q4_K_M`
   (read-only `ollama list` or `/api/tags` over loopback).
4. The same ten-flow sequence, with the capture step transcribing through
   the real whisper model and the draft/refine steps running on real Ollama.

This is a **P3.6 implementer's** design decision inside the card's May edit
(`scripts/v2/tauri-e2e-smoke.test.mjs` is a new file the card owns). It is
not a card edit, not a coordinator edit and not an owner amendment. The
card's B2 finding (`P3.6.md:539-550`) already records that V3's capture
path is unspecified against P3.5 and is settled by P3.5 landing.

## 8. Actual gaps and owner-only remaining actions

**Not gaps (already proven, no action needed):**

- Desktop launch / relaunch / single-instance / shutdown (P3.3 APPROVED).
- Microphone capture + containment (P3.5 V3/V4-tone PASS).
- Save/reopen/persistence (P1 APPROVED).
- Export / Finish & copy (v1 saved-note UI proof).
- Recovery / backup / staged restore (P2 APPROVED).
- Draft/refine safety locks (v1 `check:refine` reports, synthetic).
- Ollama daemon installed (frozen logs).

**Real gaps (need real-model proof or owner action):**

| # | Gap | Who clears it | Blocker |
| --- | --- | --- | --- |
| G1 | Whisper model `ggml-tiny.en.bin` not on disk | **Owner** — run installer first-run or explicitly authorize acquisition | HS-3; A07/S4a.2 parked; hard rule 1 exception is installer-only |
| G2 | `qwen3.5:4b-q4_K_M` presence in Ollama unverified | **Owner** — `ollama list` (read-only); if absent, owner authorizes the pull | A08 "never pulled if present" does not authorize a pull |
| G3 | P3.4 not APPROVED (V2(a)/(b)/(c) open) | **Owner** — decision D1 (amend + accept-with-disclosure, or park) | P3.4 attempt budget exhausted |
| G4 | P3.5 not APPROVED (all criteria PASS, `nextAllowedAction: root-decision-after-evidence-review`) | **Root** — review and approve or return | Coordinator decision |
| G5 | P3.6 never run (ten in-AppImage flows) | Root dispatch after G3+G4 | P3.6 dispatch gate |
| G6 | No live whisper→Ollama draft/refine/save/reopen/export/recovery/shutdown run | Runtime worker after G1+G2+G5 | Needs the model, the Ollama tag and the AppImage |

**Explicitly NOT gaps (do not lift, do not touch):**

- Spanish S4a.2 (whisper C-STT selection) — owner-parked.
- S3.2 / S3.3a quiet-machine holds — owner decisions.
- HS-10 owner live handover — owner-only.
- The six C-STT candidates A07 names — S4a.2's scope, not the English path.

## 9. Ready queue (what is ready to do, in order)

| # | Action | Who | Status |
| --- | --- | --- | --- |
| 1 | P3.5 evidence review → APPROVE or return | Root | **Ready now** — all six criteria PASS, lease released |
| 2 | P3.4 owner decision D1 (amend + accept-with-disclosure, or park) | **Owner** | **Ready now** — the question is prepared in the EOD plan §4 |
| 3 | Whisper model acquisition authorization | **Owner** | **Ready now** — run installer first-run or explicitly authorize |
| 4 | Ollama `qwen3.5:4b-q4_K_M` presence check (read-only `ollama list`) | **Owner** | **Ready now** |
| 5 | P3.6 dispatch (`build-dispatch.mjs P3.6 --base <commit> --port 7879`) | Root | Blocked on 1+2 |
| 6 | P3.6 V0/V3/V1/V4 (two builds, ten flows) | Runtime worker | Blocked on 5 |
| 7 | Real-model EOD demonstration (§5 above) | Runtime worker | Blocked on 3+4+6 |

## 10. Authority and hypothesis distinctions

| Claim | Authority | Source |
| --- | --- | --- |
| Whisper model is absent | **Proven** (metadata) | `stat` + P3.5 V0 assertion + frozen logs |
| Ollama daemon is alive | **Proven** (frozen logs) | `10-cleanup-verification.txt:24` |
| Ollama serves `qwen3.5:4b-q4_K_M` | **Hypothesis** (unverified) | No live inference run; needs `ollama list` |
| P3.5 capture/containment works | **Proven** (APPROVED evidence) | P3.5 V3/V4-tone PASS 35/35 |
| P3.4 V2 is a card defect, not a tree defect | **Hypothesis** (coordinator diagnosis) | EOD critical-path analysis §1 |
| P3.6 V3 in fake mode does not prove real AI | **Proven** (read from the row) | `P3.6.md:403` sets `APUNTA_FAKE_AI=1` |
| The installer is the only authorized download path for `ggml-tiny.en.bin` | **Proven** | `CLAUDE.md` hard rule 1; `ACQUISITION.md` A07/S4a.2 |
| Real whisper transcription will work once the model is present | **Hypothesis** | whisper-cli is built and executable; the model is pinned; but no live transcription has run on this box |

## 11. Minimum next verification

The smallest step that moves the needle:

1. **Owner runs `ollama list`** (read-only, no pull). If
   `qwen3.5:4b-q4_K_M` is present, G2 clears. If absent, the owner must
   authorize the pull (A08).
2. **Owner runs the installer's first-run download** (or explicitly
   authorizes the `ggml-tiny.en.bin` acquisition). The model lands at
   `~/.local/share/apunta/models/ggml-tiny.en.bin` on the live path, or at
   `$APUNTA_DATA_DIR/models/ggml-tiny.en.bin` in a sandbox run folder.
3. **Root reviews P3.5's evidence and approves or returns** (G4). This is
   a coordinator decision on evidence already on disk.
4. **Root asks the owner the D1 question** (G3) — the EOD plan §4 already
   prepares it.

Once G1+G2+G3+G4 clear, P3.6 is dispatchable and the §5 demonstration is
the runtime worker's task. No source edit, card edit, contract edit or
threshold relaxation is needed for any of the above.

## 12. Not claimed

Not an acceptance, not a card attempt, not an owner approval, not a source
review, not a runtime run, not a model download, not a live inference run.
No patient data was read. No credential, env dump or broad home scan. No
physical microphone probe. No child agent. No question. Nothing staged,
committed or pushed.
