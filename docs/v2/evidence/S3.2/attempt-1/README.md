# S3.2 — evidence directory `attempt-1`

**This directory holds no V4 report. V4 did not run.** The eight pipeline
invocations were never started, so there is nothing here for FD10 to read and no
`## 9. English pipeline baseline` section was appended to `docs/v2/BASELINE.md`.

Under FD10 an incomplete set of the eight reports is **inadmissible**, and a set
assembled from two directories is `BLOCKED`, owner. Zero reports from one
directory is the same failure at an earlier point, so nothing was measured and
nothing was recorded. `docs/v2/BASELINE.md` §1–§8 are unchanged and §9 does not
exist.

## Why

The dispatch for this attempt states: *"Do not run the long V4 set while anything
else is using the machine."* The box was under sustained load from processes that
are not this card's — a `java` process at 267% CPU, an `npm exec wrangler` dev
server, a `python` process, and a `qemu-system-x86` guest. Load average 5.65 on
8 cores at the moment the precondition was checked.

V4 is the card's only real-model measurement. FD10 forms `min(C,M)` and
`max(C,M)` from four invocations per corpus and compares the integers against
`BASELINE.md` §5's recorded ranges; contention on this hardware inflates latency
enough to push generations into the runner's timeout paths, and a timed-out run
is recorded as `call_failed` (FD5) — a real change in the measured numbers that
would read as a regression. `BASELINE.md` §8 already records that these ranges
describe *this* CPU, this GPU and this digest. A contended run is not a weaker
baseline; it is not a baseline.

HS-7 forbids relaxing a gate to make a row pass, and the card's own stop
conditions make no allowance for a measurement taken on a machine in use. The
row is therefore reported `BLOCKED`, owner.

## What *was* verified, and passed

Every V4 precondition the card names, checked before the decision:

| Precondition | Result |
| --- | --- |
| `qwen3.5:4b-q4_K_M` present locally | present; **no pull attempted** (HS-3, A08) |
| Its digest | `2a654d98e6fba55d452b7043684e9b57a947e393bbffa62485a7aac05ee4eefd`, **identical** to the digest `BASELINE.md:30` and the card records |
| `node --version` under the pinned `PATH` | `v24.19.0` — inside `engines: ">=24.19.0 <25"` |
| `npm run build` produces `server/dist/index.js` | produced; `sandbox.mjs:263` would not otherwise start |
| Port 7840 | free, and inside C-ISO@1 rule 2's 7800–7889; never 7717 |
| `docs/v2/evidence/S3.2/attempt-1/` | created before any invocation, as the card requires |
| Git | `git log -1` is `770012a`, the current head; base commit `fa4a9f3` is its ancestor |

## What the pipeline runner was proved to do, with no model call

Three model-free checks under `scripts/v2/sandbox.mjs run --port 7840`. Each
exits 2 at a different pre-flight refusal, writes nothing, and loads nothing —
they are evidence that the runner is real, **not** evidence of any measurement.

1. **`APUNTA_CHECK_URL` unset** → exit 2,
   `--mode pipeline refused: APUNTA_CHECK_URL is unset. --mode pipeline measures
   a server; run it through scripts/v2/sandbox.mjs run, which sets it
   (C-ISO@1 rule 6).` Nothing written.
2. **`ollama.tag` disagrees with `--models`** → exit 2,
   `/api/health reports ollama.tag="qwen3.5:4b-q4_K_M" but --models names
   "wrong-model:tag". In pipeline mode --models is a label for the server's own
   resolved model, not a control (FD4 step 6).`
   This one starts the server under the sandbox on 7840, satisfies the C-ISO@1
   rule 5 ownership check on `testRunId`, reads `/api/health`, and refuses —
   before a patient, a format, a fixture or a model call.
3. **an `--out` path that already exists** → exit 2, the path printed, and the
   existing file **byte-identical afterwards** (sha256
   `d422f7ac8a4d6ea543fc71997ae983b64d5a268aa204ae92d400bdf09898dba8` before and
   after). That is FD5's refuse-to-overwrite, proven end to end and proven to
   happen before the first fixture.

The three checks are hermetic apart from the loopback server the sandbox starts:
no database outside `/tmp/apunta-v2/`, no patient content, no outbound network.

## What the next attempt must do

Run the card's eight commands **unchanged**, from the repository root, in the
order given, one at a time, with the machine otherwise idle. `attempt-1/` stays
where it is and is not reused for reports; the coordinator supplies the next
evidence index. Nothing in this directory blocks that.

If the eight reports land, `docs/v2/BASELINE.md` gains its `## 9. English
pipeline baseline` section, and FD10's verdict is computed per corpus and per
metric against §5's recorded ranges. Until then §9 does not exist and no verdict
is claimed.
