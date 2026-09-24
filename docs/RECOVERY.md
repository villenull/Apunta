# Recreate the current Apunta reference setup

## New PC: what to tell your agent

Copy-paste this to a fresh agent on the rebuilt PC:

```
Recreate Apunta from https://github.com/villenull/Apunta.git (branch main):
git clone --branch main https://github.com/villenull/Apunta.git, then read
CLAUDE.md, docs/RECOVERY.md and docs/HANDOFF.md, and follow docs/RECOVERY.md
end to end. I explicitly authorize model acquisition limited to the pinned
installer catalog (installer/src/catalog.ts) — this is the single CLAUDE.md
hard-rule-1 network exception, so do not stall on it; the server and browser
tab stay offline-only (127.0.0.1/localhost). Install Node 22+, Ollama 0.34.2
with AMD ROCm (RX 9070 XT, gfx1201) bound to 127.0.0.1 with OLLAMA_NO_CLOUD=1,
and whisper.cpp 1.9.3-dev; npm ci and build; acquire qwen3.5:4b-q4_K_M and
ggml-tiny.en.bin via the installer (plan, then run after my approval);
apply-config into ~/.local/share/apunta; run the live instance from a plain
clone ~/apunta-live via scripts/deploy-live-linux.sh <revision> (backs up via
POST /api/backup, fetches and detached-checkouts the revision in
~/apunta-live, runs offline npm ci plus build, then restarts 127.0.0.1:7717
with a health wait; it refuses while whisper-cli is transcribing and needs a
listening live process, so the very first boot is a manual start from
~/apunta-live) serving 127.0.0.1:7717. Verify with
node scripts/recover-current-linux.mjs verify, curl /api/health,
npm run smoke:live and npm run check:format (check:format hangs drafts on
the first patient; delete the "format check —" drafts afterwards). A
differing Ollama/whisper executable SHA-256 after a clean reinstall of the
same version is expected: report it and carry on. A differing Ollama model
ID or weights blob, or a differing ggml-tiny.en.bin checksum, is a stop.
Done means the Progress note (Location, Client presentation, Risk review,
Discussion, Intervention, Out of session actions, Note for next session) is
the default, its instructions SHA-256 is 23135cae…52347392 (byte-identical
to docs/note-instructions/owner-progress-instructions.md), and a typed
John Smith note drafts through the real model at http://127.0.0.1:7717.
```

**Dry run, 2026-09-24:** a fresh clone of `main` at `d4eeacd` from GitHub
ran `npm ci --offline`, `npm run build`, `apply-config` and `verify` (exit 0)
into an empty `/tmp` data directory; the server it started served both
formats with the Progress note instructions hash above and drafted a John
Smith note through the real `qwen3.5:4b-q4_K_M`. Runtimes and models came
from this machine; the download path and a clean OS were not exercised.

## About this document

This is the fresh-machine entry point for an agent told **“recreate Apunta.”**
It rebuilds the application and its sanitized behavior-affecting configuration
from Git. It does not restore patients, notes, transcripts, recordings, chat,
backups, a real vocabulary, secrets, or the confidential Claude export.

Start by reading, in order:

1. `CLAUDE.md`
2. this file
3. `docs/HANDOFF.md`
4. `docs/research/local-ai-efficiency-2026-09-22.md` only when beginning the
   later model-efficiency experiments

The machine-readable source is `config/recovery/current-linux.json`. The
recovery verifier and configuration writer is
`scripts/recover-current-linux.mjs`.

## What is pinned

The manifest separates observed state from defaults and assumptions. Its
current reference captures:

- authoritative branch `main` and the npm lockfile hash;
- Node 22 minimum, observed Node/npm versions, and lockfile version;
- effective writing model `qwen3.5:4b-q4_K_M`, Ollama model ID, underlying
  weights-blob SHA-256 and byte count;
- Ollama 0.34.2 and the observed Linux executable SHA-256;
- the app's 16,384-token context, 3,072-token full-output ceiling, 30-minute
  keep-alive, deterministic first-attempt decoding and prompt budget;
- whisper.cpp 1.9.3-dev and the observed Linux executable SHA-256;
- the single `ggml-tiny.en.bin` used for preview and final transcription,
  with SHA-1, SHA-256 and exact byte count;
- the two note formats and a sanitized snapshot of the exact progress-note
  instructions stored in the current reference database;
- the absence of behavior-changing settings such as a vocabulary, custom
  whisper path or keep-audio override.

The current Linux database does **not** contain an `llm_model` row. Linux
therefore selects the small tier by the code's portable fallback. Recovery
writes the same tag explicitly so another OS or RAM size cannot silently
select another tier.

The live progress instructions are the owner's revised 2026-09-24 text (Q4
fuller-sentence Intervention wording); the snapshot at
`docs/note-instructions/current-linux-progress-instructions.md` is
byte-identical to `docs/note-instructions/owner-progress-instructions.md`,
and the live database was updated to that exact text on 2026-09-24 (hash
verified by `verify`). The snapshot must
remain byte-for-byte equal to the live format text; the manifest records its
SHA-256 so recovery cannot silently drift from the live format.

## Privacy boundary

The recovery script reads only these database fields:

- counts from `patients` and `notes`, solely to refuse mutation of a populated
  database;
- the allow-listed behavior setting keys named in the manifest;
- `name`, `sections`, `instructions`, and `source` from `note_formats`.

It never selects patient names, note bodies, transcript text, chat text,
recordings, vocabulary values, backup paths, or export content. `apply-config`
refuses any database containing a patient or note.

## Not in Git — carry these yourself

- Real client database (`~/.local/share/apunta/apunta.db`, plus audio and
  backups): intentionally never restored; recovery builds a clean database.
- Her Halaxy PDFs, which she uploads herself through Import from Halaxy: keep
  your own copy off the PC; agents never open them. The importer accepts
  text-based Halaxy PDFs; synthetic coverage is
  `e2e/fixtures/halaxy/john-smith.pdf`.
- Not needed: the three public clinical reference guides (Interventions
  Cheat Sheet, MSE examples, Presentation/MSE) are in Git under
  `docs/reference/` with their SHA-256 hashes.
- The Claude export: agents never open it; only the shape-only probe may run
  against the real file.
- `~/APUNTA-MORNING.md` and `~/Apunta-config-pack/`: morning runbook and
  config pack, outside Git.
- Preserved test audio under `~/.local/share/apunta-test-evidence/`
  (synthetic, optional): keep it only if you want the spoken-acceptance
  evidence; nothing in Git needs it.

## Fresh Linux recovery

### 1. Clone and install the pinned application dependencies

```sh
git clone --branch main https://github.com/villenull/Apunta.git
cd Apunta
node --version                 # must be 22 or newer
npm ci
npm run build
```

`npm ci` consumes `package-lock.json`; do not replace it with a newly resolved
lockfile. `node scripts/recover-current-linux.mjs verify` later checks the
committed lockfile hash.

### 2. Install the local runtimes

Install Ollama 0.34.2 and whisper.cpp 1.9.3-dev for the machine's operating
system. Keep Ollama bound to `127.0.0.1:11434`; never enable cloud routing,
telemetry or prompt logging. Put `ollama` and `whisper-cli` on `PATH`.

Git does not redistribute either executable. Their observed Linux SHA-256
values identify the exact binaries used here, but a clean reinstall of the
same named version can differ by distributor, build flags or unavailable
historical artifacts. A checksum mismatch is a real reproducibility gap to
resolve, not permission to edit the manifest until it passes.

The reference whisper binary linked the CPU backend. A compatible GPU build
may work, and Ollama may select AMD GPU, CPU, or a mixed placement, but the
backend changes latency and memory and can change floating-point output. Never
claim identical speed or byte-identical generation across backends.

### 3. Preview model acquisition without changing anything

Choose a fresh data directory and start Ollama locally. Then run the existing
installer in plan mode:

```sh
export APUNTA_RECOVERY_DIR=/tmp/apunta-recovery
npm run setup --workspace @apunta/installer -- plan \
  --data-dir "$APUNTA_RECOVERY_DIR" \
  --ollama-url http://127.0.0.1:11434 \
  --model qwen3.5:4b-q4_K_M
```

The plan is read-only. Review it before authorizing downloads.

### 4. Explicitly authorize model acquisition

Only after the user explicitly approves the downloads, run:

```sh
npm run setup --workspace @apunta/installer -- run \
  --data-dir "$APUNTA_RECOVERY_DIR" \
  --ollama-url http://127.0.0.1:11434 \
  --model qwen3.5:4b-q4_K_M
```

This reuses the existing installer. It permits only the hosts in
`installer/src/catalog.ts`, sends no patient data, and verifies the speech file
against its pinned checksums. The running server remains offline-only.

Ollama acquisition is tag-based. The installer verifies model presence but not
the registry manifest digest. Immediately run the verifier below: it checks the
observed Ollama model ID and underlying weight-blob digest. If either differs,
stop. Do not call the machine an exact reconstruction and do not switch to a
nearby model.

### 5. Apply only the sanitized current configuration

```sh
node scripts/recover-current-linux.mjs apply-config \
  --data-dir "$APUNTA_RECOVERY_DIR"
```

This creates/migrates a fresh database through the built server's existing
migration code, writes only the two note formats and explicitly pins
`llm_model` to the effective writing-model tag (`qwen3.5:4b-q4_K_M`) so
another OS or RAM size cannot silently select another tier. It never copies
the live database. It refuses a directory whose database already contains
patients or notes.

### 6. Verify before launching

```sh
node scripts/recover-current-linux.mjs verify \
  --data-dir "$APUNTA_RECOVERY_DIR"
APUNTA_DATA_DIR="$APUNTA_RECOVERY_DIR" APUNTA_NO_OPEN=1 npm start
curl -fsS http://127.0.0.1:7717/api/health
npm run smoke:live -- --model qwen3.5:4b-q4_K_M --runs 5
```

Expected health facts: fake AI off; database migration level 7; Ollama
reachable with `qwen3.5:4b-q4_K_M` present; `whisper-cli` and
`models/ggml-tiny.en.bin` present. `smoke:live` is a schema/provider smoke, not
clinical acceptance. Stop the temporary server before starting another Apunta
instance.

Then run the repository gate before treating the checkout as ready:

```sh
npm run build:shared && npm run typecheck && npm run lint && npm test && npm run build && npm run e2e
```

## Offline and no-download verification

On the existing reference machine, this command is entirely read-only and
performs no inference:

```sh
node scripts/recover-current-linux.mjs verify \
  --data-dir "$HOME/.local/share/apunta"
```

To exercise configuration creation without network access, use a fresh
`/tmp` directory, run `apply-config`, and inspect the resulting configuration.
The speech file may be copied from the already verified local model solely for
an isolated test. Do not copy the live database. The verifier still checks the
installed runtime binaries and Ollama model read-only.

## What a clean OS and network must still prove

This repository cannot prove without actually resetting a machine and using an
approved network window that:

- historical Ollama 0.34.2 and the exact observed Linux runtime binaries remain
  obtainable;
- the mutable Ollama tag still resolves to model ID `2a654d98e6fb` and weights
  blob `81fb60c7…f40490`;
- the three allow-listed hosts remain available and serve the pinned artifacts;
- the AMD backend selected on a clean Linux installation matches this machine;
- clean-OS service management, permissions and browser integration behave the
  same.

A Mac remains a separate unverified target. Follow
`docs/MANUAL-VERIFICATION.md`; do not transplant Linux executable hashes or
backend claims onto Apple Silicon. The model tag, speech checksum, application
configuration and note instructions remain the intended behavior baseline,
but Metal performance and the complete macOS setup/package flow are still
pending.

## After recovery readiness

Continue with `docs/HANDOFF.md` "Next session" in its stated order. The
2026-09-22 acceptance and comparison round it records is done: the retraction
review, the Discussion-subtopic review, the four-model comparison, the
Thorough-model gate (closed NONE, keep `qwen3.5:4b-q4_K_M`), and the model
second pass are complete with `check:format` at 0 flags; do not reopen them
without a new owner-facing failure. Physical-microphone acceptance remains
waived/unrun and speech fidelity remains the open gap. Existing green
automated gates are evidence for the committed code, not substitutes for
owner, clean-device or target-Mac acceptance.
