# Orchestration log

One entry per coordinator step, newest last:
`<UTC time> | <card> | <step> | <result> | <commit or evidence path>`

(no entries yet)
2026-09-26T01:00:31Z | C0.1 | coordinator setup | APPROVED | 69f8cda (plan commit) — V1 branch feature/v2 PASS, V2 check-plan PASS, V3 HARNESS.md PASS, V4 npm run lint PASS (after npm install; no node_modules present)
2026-09-26T01:09:06Z | P0.1 | IR round 1 | 9x CLEAR, IR-02 UNKNOWN | docs/v2/state/reviews/P0.1-ir.md — dispatch lacked C0.1 approval evidence; AM-001 logged, re-review run once
2026-09-26T01:09:06Z | P0.1 | IR round 2 | CLEAR all ten | docs/v2/state/reviews/P0.1-ir.md
2026-09-26T01:09:06Z | P0.1 | implement attempt 1 | SUBMITTED, committed 67e4866 | .nvmrc 24.19.0, engines >=24.19.0 <25, README mention; A01 user-local Node 24.19.0 SHA-verified; V1-V4 PASS, lockfile unchanged
2026-09-26T01:09:06Z | P0.1 | impl review | all PASS | docs/v2/state/reviews/P0.1-impl.md — V4 re-ran 1541/1541; one App.test.tsx no-motion flake on first review run, informational only. Card APPROVED.
2026-09-26T01:09:06Z | P0.2 | IR | CLEAR all ten (first round, AM-002 attached PROGRESS.json) | docs/v2/state/reviews/P0.2-ir.md
2026-09-26T01:09:06Z | P0.2 | implement attempt 1 | SUBMITTED, committed 6e59c60 | patch applied, planImport zone pin, zone.test.ts; card files 39/39 all zones; V2 FAIL Sydney (6 out-of-scope failures, finding filed)
2026-09-26T01:09:06Z | P0.2 | impl review attempt 1 | FAIL solely V2-Sydney | docs/v2/state/reviews/P0.2-impl.md — reproduced exactly; cause in test code (directly verified for 1 of 6); pre-dates card; no change requested in this card
2026-09-26T01:09:06Z | P0.2 | implement attempt 2 | SUBMITTED, committed 650821b (evidence only, zero code changes) | all 6 failures directly verified as test-code causes; V2 still FAIL
2026-09-26T01:09:06Z | P0.2 | impl review attempt 2 | FAIL solely V2-Sydney | second independent confirmation
2026-09-26T01:09:06Z | P0.2 | implement attempt 3 | SUBMITTED, committed 6515b66 (evidence only) | failure set byte-identical across all attempts; no in-scope fix exists
2026-09-26T01:32:51Z | P0.2 | impl review attempt 3 | FAIL solely V2-Sydney | third independent confirmation. Attempt budget 3/3 exhausted, no approved split in card: card BLOCKED, see BLOCKED.md. App.test.tsx delete-patient flake now seen 4x across sessions (informational, out of scope).
2026-09-26T01:48:21Z | P0.3 | IR | CLEAR all ten (first round, AM-003) | docs/v2/state/reviews/P0.3-ir.md
2026-09-26T01:48:21Z | P0.3 | implement attempt 1 | SUBMITTED, committed 0360932 | sandbox.mjs + selftest (6/6 refusals pre-DB), playwright/check-script guards, health testRunId; one orphan-server incident disclosed and fixed same-session; V1-V5 PASS
2026-09-26T01:48:21Z | P0.3 | impl review | all PASS | docs/v2/state/reviews/P0.3-impl.md. Card APPROVED. From here all launching commands run through scripts/v2/sandbox.mjs (HS-2).
2026-09-26T01:51:35Z | P0.4 | IR | CLEAR all ten (first round, AM-004) | docs/v2/state/reviews/P0.4-ir.md
2026-09-26T01:51:35Z | P0.4 | measurement attempt 1 | BLOCKED (environment) | No Ollama on this machine (worker return + coordinator `which`/`curl` confirmation). Card stop condition "model tag missing" → BLOCKED, owner action filed in OWNER-ACTIONS.md; attempt budget intact. Card BLOCKED, see BLOCKED.md.
2026-09-26T02:03:21Z | S1.1 | IR round 1 | 9x CLEAR, IR-03 DEFECT | Q4 mispointed SOAP/intake source at note-format.ts; AM-006 corrected to seed.ts:44/BY_SECTIONS (read-only), committed 7b1358d, dispatch rebuilt
2026-09-26T02:03:21Z | S1.1 | IR round 2 | CLEAR all ten | docs/v2/state/reviews/S1.1-ir.md
2026-09-26T02:03:21Z | S1.1 | research attempt 1 | SUBMITTED, committed cbc0f96 | es-mx-clinical-documentation.md + 182-line addendum; V1 PASS, V2 for review; lawyer/owner questions handed forward, none guessed
2026-09-26T02:03:21Z | S1.1 | research review | all PASS, no findings | docs/v2/state/reviews/S1.1-impl.md. Card APPROVED.
2026-09-26T02:18:21Z | S1.2 | IR round 1 | 8x CLEAR, IR-05 + IR-09 UNKNOWN | inputs lacked package.json/checkpoint evidence; AM-008 supplied both facts, re-review run once
2026-09-26T02:18:21Z | S1.2 | IR round 2 | CLEAR all ten | docs/v2/state/reviews/S1.2-ir.md
2026-09-26T02:18:21Z | S1.2 | research attempt 1 | SUBMITTED, committed 9cbdefd | 399-entry glossary (6 unmapped with reasons); V1/V2 PASS, V3 for review
2026-09-26T02:18:21Z | S1.2 | research review | all PASS, 1 non-blocking advisory | docs/v2/state/reviews/S1.2-impl.md — advisory: add [not found] labels to the 6 UNMAPPED entries if a future machine label-coverage check needs it. Card APPROVED.
2026-09-26T02:28:19Z | S1.3 | IR round 1 | 9x CLEAR, IR-05 UNKNOWN | inputs lacked package.json evidence; AM-010 supplied prettier@base fact, re-review run once
2026-09-26T02:28:19Z | S1.3 | IR round 2 | CLEAR all ten | docs/v2/state/reviews/S1.3-ir.md
2026-09-26T02:28:19Z | S1.3 | research attempt 1 | SUBMITTED, committed 9413108 | es-mx-speech.md (ranked D9 markers, fillers, whisper evidence, Piper voices + redistribution silence); V1 PASS, V2 for review
2026-09-26T02:28:19Z | S1.3 | research review | all PASS, zero findings | docs/v2/state/reviews/S1.3-impl.md — reviewer independently fetched 3 voice cards + Vocova benchmark, all match. Card APPROVED.
2026-09-26T03:0x | S1.4 | implement a2 | RETURN REJECTED (scope) | eslint.config.js edited (outside May-edit, reverted) and a lintable .cjs committed under docs/; counts as attempt 2; research edits kept; dispatch rebuilt for attempt 3
2026-09-26T03:0x | S1.4 | implement a3 | SUBMITTED, committed 085d892 | coverage 195→218 entries, URLs, evidence wording; no script under docs/, config untouched; review r2 dispatched
2026-09-26T03:0x | S1.5 | IR round 1 | 8x CLEAR, IR-04 + IR-10 | IR-04: markdown prettier check vacuous; IR-10: evidence dir vs May-edit tension
2026-09-26T03:0x | P7a.1 | IR round 1 | 7x CLEAR, IR-03 + IR-05 + IR-08 | IR-05: same vacuous markdown check; IR-03: no home-path placeholder; IR-08: git log -p --all to stdout vs HS-5
2026-09-26T03:0x | ALL-L0 | owner decision | markdown prettier rows NON-BINDING (AM-014) | owner also authorised AM-015 (format S1.2 JSON to restore npm run lint) and AM-016 (P7a.1 safe secret handling). S1.5/P7a.1 IR re-runs next.
2026-09-26T03:0x | S1.5 | IR round 2 | CLEAR all ten | AM-014 + AM-017; AM-017 logs the evidence/return standing interpretation
2026-09-26T03:0x | P7a.1 | IR round 2 | CLEAR all ten | AM-016 closed IR-03/IR-08; AM-014 closed IR-05
2026-09-26T05:26:34Z | S1.4 | review attempt 3 | all PASS | docs/v2/state/reviews/S1.4-impl.md — 6 non-blocking findings (link rot in a citation, one verb, one file:line, wording drift, vacuous V2, delta-check note). Card APPROVED.
2026-09-26T05:26:34Z | S1.5 | research attempt 1 | SUBMITTED, committed f71e16f | es-mx-spellcheck.md — dictionary-es-mx@2.0.0 FITS via MPL-1.1 election; review dispatched
2026-09-26T05:26:34Z | P7a.1 | research | in flight (space-bunny-free)
2026-09-26T05:34:32Z | S1.5 | research review | all PASS, 7 non-blocking findings | docs/v2/state/reviews/S1.5-impl.md — MPL-1.1 election verified verbatim. Card APPROVED.
2026-09-26T05:40:01Z | P7a.1 | research attempt 1 | SUBMITTED, committed 1a81d91 | PUBLIC-REPO-AUDIT.md — no secret/patient content in tree or history; exposure is owner name/mailbox metadata + home/host/Tailscale strings; UNLICENSED is the gating decision
2026-09-26T05:40:01Z | P7a.1 | research review | all PASS (3 cosmetic notes) | docs/v2/state/reviews/P7a.1-impl.md. Card APPROVED.
2026-09-26T05:40:01Z | S1.R | parent review | in flight (space-bunny-free)
2026-09-26T05:44:00Z | S1.R | parent review | all PASS (10 non-blocking findings) | docs/v2/state/reviews/S1.R-impl.md — milestone S1 complete. Findings 1-3 (S1.4 false coverage claim, S1.3 quantisation claim S4a leans on, S1.4 cross-ref) recorded for bundling before S2/S4a treat files as final.
2026-09-26T06:50:22Z | (side) | owner preview | UP at http://127.0.0.1:7810 | seeded fake-AI sandbox run 2026-09-26T06-50-22-007Z-18d8f9fc; wrapper PID 276383; stop `kill -TERM -- -276383 -276392`. Side finding (P0.3 bug): `resolveSandboxDataDir` compares against `platformDataDir()`, which itself returns `APUNTA_DATA_DIR`, so any explicit override is refused as "equal to the platform default" (sandbox.mjs:62-64 vs :186); not fixed (P0.3 APPROVED, needs a card). Also the wrapper installs no SIGTERM handler, so killing only the wrapper PID orphans the detached server.
2026-09-26T07:xx | (side) | Ollama setup | DONE (owner-authorised, AM-020) | Owner installed ollama 0.33.3 + ollama-rocm + hipblas; subagent started daemon and pulled `qwen3.5:4b-q4_K_M` (digest 2a654d98e6fb, 3.4 GB, 100% GPU ROCm on RX 9070 XT). P0.4 unblocked (NOT STARTED); service still disabled — owner action `sudo systemctl enable --now ollama` for boot persistence. Deliberately not running P0.4's eval while the owner previews (plan: no long real eval during live testing).
2026-09-26T07:25:46Z | (side) | Ollama persistence | DONE | Owner ran systemctl enable; service initially failed (manual serve held 11434), then a drop-in made it run as villenull with HOME/OLLAMA_MODELS=/home/villenull/.ollama/models. Confirmed: enabled+active, model listed, `done_reason: stop` at 100% GPU.
2026-09-26T07:25:46Z | S3.1 | IR round 1 | 7x CLEAR, IR-01/03/04 DEFECT | card text; owner-authorised AM-019 applied (546d513)
2026-09-26T07:25:46Z | S3.1 | IR round 2 | CLEAR all ten |
2026-09-26T07:25:46Z | S3.1 | implement attempt 1 | SUBMITTED, committed d6506ff | 110 Spanish dictations, 11 trap types, 4 gold sidecars, NAMES.md (110), checker with --root; 40.0% heldout per corpus; V1/V2/V3 PASS
2026-09-26T07:25:46Z | S3.1 | impl review | all PASS (6 non-blocking doc findings) | docs/v2/state/reviews/S3.1-impl.md. Card APPROVED.
2026-09-26T07:55:00Z | P0.5 | IR round 2 | CLEAR all ten | docs/v2/state/reviews/P0.5-ir.md; implementer HELD: the out-of-band UI preview has uncommitted edits to web/src/lib/format.test.ts (one of P0.5's four files), so P0.5 must run after the preview is reverted.
2026-09-26T07:55:00Z | S4a.1 | IR round 2 | 9x CLEAR, IR-03-G (schema domains) | AM-026 applied; IR r3 running.
2026-09-26T07:55:00Z | (side) | UI Claude-match iteration | in flight | space-bunny-free; adds tokens, left-tab settings modal, proportions, compact row menu.
2026-09-26T08:15:00Z | P0.4 | measurement attempt 1 | SUBMITTED | 8/8 invocations done on qwen3.5:4b-q4_K_M (GPU); V1 fabrication 20.0% (4/20), safety 85%; V2 fabrication 0% (0/4), safety 100%; BASELINE.md + evidence + return written. V1 exits 1 by design (the eval's gating signal) — card V1/V2 expectation amended (AM-029), no threshold changed.
2026-09-26T08:15:00Z | (side) | UI baseline | passed coordinator smell test; committed b366be1 (AM-028) | reviewed via real Chromium screenshots across main, row menu, View-all, settings, mission control.
2026-09-26T08:15:00Z | P0.5 | implement | in flight after UI revert/unblock | space-bunny-free.
2026-09-26T08:15:00Z | S4a.1 | implement | in flight | space-bunny-free.
2026-09-26T08:25:00Z | P0.5 | implement attempt 1 | SUBMITTED, V1/V2/V3 all PASS | per-describe TZ pins on the four files; 1557 tests × 4 zones; round-2 reruns at 7918381. Process note: P0.5's worker had staged its files, so the coordinator's explicit-path commit 7918381 swept P0.5's four test files + evidence in together with the AM-030 Prettier fix — mixed commit boundary, content correct; review will use base b4514c0 and treat the two web files as AM-030.
2026-09-26T08:25:00Z | P0.4 | impl review | in flight (793ace42) | reviewer told to re-derive all rates, not re-run all 8.
2026-09-26T08:25:00Z | ALL | repo lint | GREEN | AM-030 fixed the formatting debt from the UI baseline; `npm run lint` exits 0.
2026-09-26T07:xx | (side) | pw-prompt mechanism | FOUND + VERIFIED | The greyed, centered password prompt is **Omarchy's quickshell polkit agent** (`/usr/share/omarchy/shell/plugins/polkit/PolkitAgent.qml`), triggered by polkit, not terminal `sudo`. `pkexec /usr/bin/mkdir -p /tmp/...` → exit 0, dir root-owned; bare `sudo` in an agent shell cannot prompt (no TTY / no askpass). For future owner-authorised privileged ops, agents use `pkexec <cmd>` (wrap with a timeout; must inherit the active session env: XDG_SESSION_ID, DBUS_SESSION_BUS_ADDRESS/XDG_RUNTIME_DIR, WAYLAND_DISPLAY; must not run under a systemd unit or another session).

## Overnight digest (2026-09-26, coordinator, owner asleep)
- Milestones complete: C0.1, P0 (+P0.R), S1 (+S1.R), P7a.1, P1 (+P1.R), S3.1, S1.1-S1.5.
- Blocked (owner decision): P0.2 (resolved via AM-022/P0.5), S4a.1 (Piper non-determinism; see BLOCKED.md).
- Out-of-band: owner-approved Claude-style UI baseline committed (AM-028, b366be1) after coordinator review via Chromium screenshots; System theme added; AM-030/032 fixed its lint/e2e fallout.
- Ollama installed + enabled (AM-020); qwen3.5:4b-q4_K_M on GPU; P0.4 English provider baseline recorded (fabrication 20%/0%, safety 85%/100%).
- P1: shared settings mutation (P1.1), theme-radio coverage (P1.2 rewritten coverage-only after AM-028 shipped it), request guard (P1.3), effective-model policy (P1.4, 2 attempts), licence/docs (P1.5, +AM-034/035). P1.R all PASS.
- Next: P2 brand (P2.1/P2.2 likely mostly shipped by AM-028 -> reconcile then verify), then S2 language, P3 shell, S3/S4/S5 Spanish, P4-P6, P7b, Q1.

## Recovery log (2026-09-26, 14:00Z → 18:55Z, coordinator)

The block above ended at 08:25Z. The session that followed it ran a parallel
P3/P4/P5 wave and then died of provider errors ("Insufficient account funds",
HTTP 402, then "Model not found: opencode-go/space-bunny-free") at ~16:54Z
without recording anything. This block reconstructs that window from the commit
record, the returns and the review files. Git commit times are CST (UTC-6);
the timestamps below are true UTC, as the rest of this log is.

### Parallel wave: S2.3, S2.4 (language) · P3.1, P3.2, P4.1, P4.2, P5.1 (shell/paths/backup)

- 2026-09-26T14:00Z | TOOL | AM-037 applied | `build-dispatch.mjs` substituted every literal `<p>`, corrupting S2.3's V5 probe cell; now substitutes only `--port <p>` (e9b096b)
- 2026-09-26T14:35Z | S2.3 | implement a1 | SUBMITTED (316d816); S2.3 APPROVED 14:41Z (71b4ba2)
- 2026-09-26T14:52Z | S2.4 | IR r1 DEFECT → card-text repair (0fadc54), r2 (1fe2438) | IR CLEAR 15:06Z (dac687b)
- 2026-09-26T15:30Z | P5.1 · 15:45Z P4.2 · 15:45Z P3.1 · 15:47Z P4.1 | IR r1 each DEFECT → card-text repair under AM-024 (32c42e1, b9287a2, 1f7600e, 368fbe9) | all four CLEAR by 15:59Z
- 2026-09-26T15:32Z | S4a.1 | AM-038 (owner-approved) pinned `noise_scale 0`/`noise_w 0` + `OMP_NUM_THREADS=1` (810dbb4) | attempt 2 committed 5ccb9eb; V1 then passed 295/295 byte-identical; **card APPROVED 16:37Z** (b1fd1dc) — resolves the BLOCKED entry in BLOCKED.md
- 2026-09-26T16:00Z | S2.4 | impl a2 (aaebc4d) | review a2 found V1/V4 FAIL purely from a coordinator staging omission; **AM-040** committed the missing allowlist; card APPROVED 16:12Z (589294c)
- 2026-09-26T16:04Z | P4.2 | impl a1 (3e2e4e7) | **AM-041** committed the left-untracked `platform-paths.test.ts`; APPROVED 16:29Z (26b4350)
- 2026-09-26T16:11Z | P5.1 | impl a1 (e9cfffa) | APPROVED 16:19Z (1610d5c)
- 2026-09-26T16:10Z | P3.2 | IR r1 DEFECT → card-text repair (0a00898) | IR CLEAR 16:19Z (dbe3579); impl a1 (48e8778); impl review all PASS; **APPROVED 16:43Z** (465499e)
- 2026-09-26T15:54Z · 15:58Z | P4.1 | IR r2 (0d3ce0f) and r3 note (ba63695) | **card BLOCKED** (194d0b8): every pinned A07 artifact answers `302` with a **query string** in `Location`, which ACQUISITION rule 1 refuses. Owner/plan-editor decision filed in OWNER-ACTIONS.md line 9. Untracked `scripts/v2/probe-redirects.mjs` is P4.1's probe and belongs to the blocked card — deliberately not committed
- 2026-09-26T15:45Z | (coordinator) | 8057679 | recorded the parallel P3/P4/P5 dispatch wave and filed the owner `cmake` action (OWNER-ACTIONS.md line 8) after P3.1's IR confirmed `cmake` absent

### S2.5 (last card before the chain needs cmake)

- 2026-09-26T16:26Z | S2.5 | IR r1 DEFECT → repair (b9b651b) | 16:42Z r2 DEFECT → repair (7e1e4b6) | 16:48Z r3 repair (7bf379a)
- 2026-09-26T16:53Z | S2.5 | **IR r4 all ten CLEAR** at base `7bf379a` (`docs/v2/state/reviews/S2.5-ir.md`). Note 2: the implementation dispatch was still the stale `b9b651b` artifact and had to be regenerated. Attempt budget untouched (no implementation run yet)

### Handover to the next coordinator (18:52Z)

- Cards APPROVED since the overnight digest: **S2.3, S2.4, S4a.1, P3.2, P4.2, P5.1**. `P4.1` BLOCKED (owner). `P3.1` IR CLEAR but its stop condition is live: `cmake` is absent, so the whisper build cannot run.
- Ready to run, in DEPENDENCIES order: **S2.5** (IR clear), **P5.2** (deps P5.1 + P3.2 both APPROVED, IR not yet run). Nothing else has all dependencies APPROVED.
- The `-ir.md` review files for P1.1–P1.5, P2.1, P2.2, P3.1, S2.1, S2.2, S2.3 and S2.5, and the `P3.1-ir.md`/`P3.2*.md`/`S2.5*.md`/`P5.2-ir.md` dispatch files, are **untracked**. Precedent is mixed (S2.3-ir.md and S2.4-ir.md are tracked). They are regenerated artifacts, not sources of truth; `docs/v2/cards/*.md` is.
- `docs/v2/state/dispatch/P3.1-ir.md`, `P4.2.md` and `P5.1.md` are tracked and carry uncommitted modifications from the rebuilds that preceded those cards' runs.

## Second session (2026-09-26, 18:46Z →)

Resumed after the previous coordinator died of provider errors. Reconstructed
its window (see the recovery block above), archived its two strays, and carried
on. All subagents run `opencode-go/space-bunny-free`: the account that returned
`402 Insufficient account funds` at 16:50Z is the Zen endpoint, and the free Go
tier is what the rest of the plan has been running on.

- 2026-09-26T19:00Z | P3.1 | **stop condition cleared** | owner ran `pkexec pacman -S --needed cmake` (polkit prompt, exit 0); cmake 4.4.3 at `/usr/bin/cmake`, `glslc` present for the `vulkan` backend the card pins, `make` for cmake's default generator. P3.1 back to NOT STARTED, checkpoint written, implementation dispatch to be rebuilt at the then-current head
- 2026-09-26T19:05Z | P4.1 | probe re-run under owner authorisation | 7/7 artifacts, one hop-1 host `us.aws.cdn.hf.co`, the **same ten query key names** on every one: `Expires`, `Hash-Algorithm`, `Key-Pair-Id`, `Policy`, `Signature`, `X-Xet-Cas-Uid`, `response-content-disposition`, `response-content-type`, `user_id`, `xip`. The probe now records key **names**; every value is still `<redacted>`, so the signature never reaches the tree
- 2026-09-26T19:10Z | P4.1 | **AM-042, owner-approved (option (a) with probe)** | `ACQUISITION.md` §1 gains an *Allowed query keys* column; A07's redirect cell is the single observed host; A07 enumerates the ten names, every other row is `none` (the pre-existing behaviour). A new paragraph states admission tests the parameter **name** against that cell, no wildcard or blanket permission, and an off-list name is `query_key_not_allowed`, refused before the URL is requested. Card text: refusal list, test rows 8/8a/8b, stop condition 2. P4.1 → attempt 2, budget 2 of 3 left
- 2026-09-26T19:14Z | P5.2 | IR r1 DEFECT on IR-03/04/05/06 | **AM-043** applies all four verbatim plus the reviewer's two non-blocking clauses; re-run once (r2 dispatched at `88be917`)
- 2026-09-26T19:12Z | S2.5 | implement a1 in flight | base `7bf379a`, port 7832

**Serialization note.** Only one writer at a time. S2.5 owns `server/src/**`,
`shared/src/**` and `web/src/**`; P4.1's and P3.1's files are disjoint from that,
but their verification rows are whole-repo (`npm test`, `npm run lint`, `npm run
typecheck`) or rebuild `shared/dist`, so running them beside S2.5 would race its
build output and could turn a green row red for a reason that has nothing to do
with either card. P4.1 attempt 2 and P3.1 attempt 1 are therefore held until
S2.5's implementer commits and is reviewed. Read-only lanes (instruction
reviews) still run in parallel.

- 2026-09-26T19:12Z | P5.2 | IR r2 DEFECT on IR-04 only, 9 CLEAR | **AM-044** applies the clock seam (`now?: Date`, matching `CreateBackupOptions`/`StageRestoreOptions`) plus the reviewer's two non-blocking clauses; r3 dispatched at `5c71ecf`
- 2026-09-26T19:10Z | (side) | UI preview rebuilt on :7810 | the 06:50 preview was serving a **10:39 web bundle on a 06:50 server** — a mismatched pair: the API had no `locale` and reported `migrationLevel 7` while the repo is at `008_locale.sql`. Stopped it (`kill -TERM` on the process group, then the PID: the wrapper installs no SIGTERM handler, as logged at 06:50) and started a coherent one — `sandbox.mjs env` for the run dir, `APUNTA_FAKE_AI=1 npm run seed` **before** the server, then the server on that dir. Seeded 2 formats / 3 patients / 4 notes; level 8; fake AI. **Seeding after the server starts is no longer possible**: P3.2's data-folder ownership (APPROVED `48e8778`) makes the second writer `SQLITE_BUSY`, which is that card working as designed, not a defect. The new order is env → seed → serve

- 2026-09-26T19:20Z | P5.2 | **IR r3 all ten CLEAR** at `5c71ecf`; reviewer states the card is implementable as it stands and requests no correction (`docs/v2/state/reviews/P5.2-ir.md`). Checkpoint written
- 2026-09-26T19:22Z | P5.2, P4.1, P3.1 | **all three HELD for the writer lock, and the reason is a real file overlap** | P5.2's May edit is `server/src/index.ts` "(ordering)" and S2.5's is `server/src/index.ts:57-58` "those two lines only". Two implementers in one tree would collide in that file, before the whole-repo V2 rows (`npm test`, lint, typecheck) ever ran. P4.1 and P3.1 do not share a source file with S2.5, but both gate on whole-repo rows or a `shared/dist` rebuild, so a tree S2.5 is mid-edit can redden a green row for reasons belonging to neither card. All three dispatch the moment S2.5's implementer commits and its review closes
- 2026-09-26T19:38Z | S2.5 | impl review a1 → **FAIL** at `bafdcff`, base `2a2f3f9` | all four rows PASS on re-run (V1 137, V3 1325, V2 clean, V4 red-then-restored) but the objective is unmet. 3 blocking findings in the card's own May edit (English `UNREACHABLE_MESSAGE` injected into every locale at `ai/errors.ts:108`; locale-dependent `storage.message` written to a pino line at `http/errors.ts:269`, which Must-not-edit forbids; untranslated `chat.ts:451` reason) and 3 groups outside it (8 on-screen `refine-request.ts` sentences; `retractions.ts:254`, which the card made *worse* — `draft.ts:251-260` persists a Spanish opening glued to its English notice; `licenses.ts:35`). `retractions.ts:254` was a real **unreported** gap. The reviewer's own re-derivations: 121 of 122 catalogue keys byte-identical to the base, the exception being the base's own `Intl` plural ternary; guard invariant held hunk by hunk; 4 test lines removed, none an assertion
- 2026-09-26T19:44Z | S2.5 | **AM-045, owner-approved May-edit widening** | seven paths, sentences only, on the reviewer's line references. Three paths deliberately excluded: `extract/types.ts`, `backup/archive.ts`, `backup/restore.ts` would need a `key` field, and `corrupt_pdf`/`destination_unwritable` each back two different sentences today, so keying from the route would change the English the wire carries (fixed decision 6 forbids). That is a follow-on card. Attempt 2 dispatched at `fdec649`, port 7834; **1 attempt remains after it**
- 2026-09-26T20:05Z | S2.5 | impl a2 SUBMITTED at `1a6540a`, base `bf7415f` | 22 files, all inside AM-045; V1-V4 all PASS (142 / clean / 1340 / red-then-restored). Coordinator verified the pino split and confirmed the implementer's report of **four further on-screen sentences** in `ai/refine-request.ts` (`:329`, `:496`, `:497`, `:564`) that AM-045's line list misses. Root cause is the same one that failed attempt 1: a line-number enumeration is an incomplete proxy for what a module returns. Review a2 dispatched and told this is the **last attempt**, so its verdict must separate "fixable in the current May edit" from "needs the owner again", and should recommend a follow-up card over spending the last attempt on scope
- 2026-09-26T20:20Z | (side) | UI: Patients column heading recoloured | owner supplied the exact hex `#2596be`. Added as a token (`--patients-title`, `web/src/styles/tokens.css:193,344`) because `tokens.css` states a colour is defined in one place and no component spells one out, and `app.css` had 854 `var()` uses and zero raw hexes. `.directory-title` (`app.css:4087`) now reads `var(--patients-title)`. Deliberately **not** derived from `--accent` (a server setting she changes in Settings) nor from `--brand-mark` (goes white in dark mode). Fixed in both themes on her instruction. Contrast recorded in the token comment and the commit: 3.40:1 on white, down from 15.21:1, 4.47:1 on dark; at 22px/500 the heading is under the 24px large-text threshold, so AA wants 4.5:1. Her call with the figures in front of her. Preview rebuilt and serving it (`index-B_vHQAGJ.css`)
- 2026-09-26T20:55Z | S2.5 | impl review a2 → **FAIL** at `1a6540a`, base `bf7415f` | all four rows PASS (142 / clean / 1340 / red-then-restored) and every hard stop respected, but four English sentences survive in `ai/refine-request.ts` (`:329`, `:496-497`, `:564`). The review's own separation, which decided the next step: *"Fixable inside the current May edit: nothing — the file is already licensed. Needs the owner again: nothing. The owner approved the scope; only the encoding is wrong, and that's yours to fix."* Diagnosis: **line numbers cannot describe a module's output** — `changeSentence` is one sentence from six literals across nine lines, so no enumeration contains it. Attempt 1 enumerated 8 and missed 4; attempt 2 fixed 8 and found 4. A failed instrument used twice, not bad luck
- 2026-09-26T21:05Z | S2.5 | **AM-046** re-encodes the entry to "every sentence this module returns to the browser" — the phrasing AM-045 already used for `halaxy/parser.ts`, which the review confirmed complete. Same paths, same sentence class, re-encoded; applied under AM-024 on the review's own ruling that no owner decision is required. **Attempt 3 of 3 dispatched** at `3421a91`, port 7836, with the instruction to read the module rather than hunt the four lines, and to key a fifth if one exists
- 2026-09-26T20:59Z | (side) | named follow-ups recorded, owner to decide if they become cards | (1) `server/src/test/providers.ts` is not a `*.test.ts` beside an owned file, so HS-9 forbids editing it, and it will silently English a future Spanish SSE test; (2) `ExtractError`/`BackupError`/`RestoreError` still need a `key` field, and it cannot be added from the route because `corrupt_pdf` and `destination_unwritable` each back two different sentences today
- 2026-09-26T20:40Z | (side) | dark base surfaces set to `#111111` / `#151515` | `--sidebar-bg` and `--app-bg` in the dark block; light mode untouched. Text contrast improves (primary 15.72:1, muted 5.09:1) and the `#2596be` Patients heading reaches 5.38:1, clearing AA — its 3.40:1 problem existed only on the light background. **Deliberately not re-stepped:** the ramp's upper tokens keep their old values and now sit further out (`--menu-bg` was equal to `--app-bg` by design and is now +17; hover +4 → +21; divider +20 → +37; sidebar/main separation 21 → 4). Left for the owner's UI agent, with the measurements in the token comment at `tokens.css:319-325`
- 2026-09-26T20:59Z | (process) | **a second writer is now live in `web/`** — an owner-spawned agent for the owner's UI changes. Split agreed: it owns `web/**`, S2.5 owns `server/**` + `shared/**`, `docs/v2/**` is the coordinator's, `prototype/` is neither. The shared risks are named in the log and in both prompts: repo-wide `npm test`/lint/typecheck, the `web/dist` + `shared/dist` build outputs, and the single preview server on 7810. Neither side runs a repo-wide gate or a build without telling the other
- 2026-09-26T21:12Z | S2.5 | impl a3 SUBMITTED at `13e50c8` (code `ccb3dc2`) | **Attempt 3 of 3.** All four rows PASS plus a repo-wide `npm test` (143 files / 1841 tests), lint and typecheck. Nine catalogue keys for the four `refine-request.ts` producers — `chat.change.{cleared,shortened,expanded,rewrote,addition,summary}`, `chat.list.last` (shared by two callers), `chat.verdict.{alreadySaid,noChanges}`. "None left" argued by extraction with TypeScript's own scanner (100 literals, 8 regexes; the residue is import specifiers, the `STOPWORDS` vocabulary, and `'Risk review'`, a stored section name rule 5 forbids translating), not by reading its own diff; a hand-rolled lexer first misreported docstrings, so the compiler's scanner is the instrument. Coordinator verified scope: **4 files**, all licensed, no oracle/`web/`/`prototype/` touched, catalogues symmetric at 727 with all nine keys in both. Final review dispatched, told explicitly that a PASS closes the card and a FAIL kills it
- 2026-09-26T21:14Z | (side) | ten catalogue keys landed (`6e77654`) | S2.5's commit freed the catalogues. `patients.{star,unstar,starred,recents,renameAction,renameShort,renameTitle,restore,delete}` and `setup.backingUpTail`, both sides, 727 → 737, still symmetric. `build:shared` 0, `tsc --noEmit` 0, i18n 27/27. Three shapes follow the house: the `*Short` bare-word split (`patients.newShort`/`patients.new`), `{name}` on titles like `workspace.deleteTitle`, and a new `patients.restore` rather than reusing `backup.restore`
- 2026-09-26T21:18Z | (side) | accent default → claude clay, one commit (`f792a5c`) | Owner decided in the UI agent's session (AM-047): claude.ai's values except her `#111111`/`#151515`. `DEFAULT_ACCENT_COLOR` and `--accent` (`:root` only — the dark block never redefined it) to `#d97757`, with **four** assertions in `App.test.tsx`, not the one first reported: the picker's initial value, the stored setting after reset, and `--accent` on the document element both after reset and after leaving the screen. `brand.spec.ts`'s `DEFAULT_ACCENT` and the comment claiming the default is byte-identical to the light brand mark. Left alone on purpose: `--brand-mark`, `BrandMark.test.tsx`, the favicon, the README badge colour, `isAccentColor`'s validator cases and `accent.test.ts`'s arbitrary input — brand or arbitrary inputs, not the default. Derived tokens follow via `color-mix`. Verified 84/84 on the four affected suites; the e2e spec is typechecked but **not executed** (needs the sandbox and a built app; S2.6 owns e2e)
- 2026-09-26T21:20Z | (side) | **open question for the owner** | The UI agent's colour question listed "a plain Patients heading" among the claude.ai values inside an option titled "Keep owner's dark bases". The owner picked that option — plausibly for the dark surfaces, which is what the title is about — and the plain heading rode along, silently undoing the `#2596be` she gave the coordinator directly and twice in her own words. `--patients-title` is currently `var(--text-primary)` pending her answer. Nothing pins it; either reading is a one-line token change
- 2026-09-26T21:30Z | (side) | **checker tightened, AM-047/AM-048 recorded, pushed** | The UI agent closed its loop at `3db8526` and reported all five formerly-exempt strings catalogue-driven. Verified rather than believed: a scratch copy with `isSplitSentence()` defeated read **TOTAL 0** over `web/src`, where before the same probe read `TOTAL 5`. Exemption **removed**, not narrowed (a narrowed exemption is the same hole with a length limit); the escape a fragment needs is two keys, which `setup.backingUpLead` + `setup.backingUpTail` already are. Web project **367/367** under the repo's own Node v24.19.0, confirming the agent's 3 failures were the P0.5-documented v26 `localStorage` artefact and not a regression. AM-047 records the out-of-band UI work with its provenance in the shape of AM-028; AM-048 records the tightening. Both pushed. UI agent archived — zero strays
- 2026-09-26T21:30Z | (side) | **three owner questions open from the UI agent's report** | (1) the `#2596be` Patients heading vs plain text colour — asked of the owner by both agents; the token is `var(--text-primary)` pending her answer and nothing pins it. (2) The note header still fills with the accent colour, per her earlier request, so it is now clay orange; claude.ai has no coloured bar there. (3) Icons for the notes-column buttons (Brainstorm, Treatment plan and the rest) were read as "row-menu icons" and not done — if she meant those buttons they are outstanding. The settings **route** conversion is deferred by design, not by oversight: `web/src/routes/Settings.tsx` is in S2.6's May edit
- 2026-09-26T21:50Z | S2.5 | impl review a3 → **FAIL**, and the card is **BLOCKED** at budget 3/3 | All four rows PASS at both `22fd351` and `c5a62c8` (the tip moved mid-review; reported, re-run, reproduced). The reviewer **confirmed** attempt 3's claim by its own AST walk: 90 literals, 8 regexes, 3 template pieces, 3 imports, every residue accounted for at its use site, **sixteen render sites all `msg(locale, key, …)`** — "the 'none left' claim is true". Both disclosed deviations ruled NOTEs. **But it found the mirror:** `changeSentence` now joins through `chat.list.last` (`{first} and {last}`, `first` pre-joined by `, `), which is byte-identical to the wire for **two** changes and `a, b and c` against the wire's `a and b and c` for **three or more**. FD6 calls that a stop. Persisted under FD5, untested (only the two-part form is pinned), and the comment, return and commit all claim character-for-character equality. Recorded BLOCKED in `PROGRESS.json`, `BLOCKED.md` and the checkpoint with the three options; **the owner decides**, and the coordinator recommends one corrective attempt over a follow-up card
- 2026-09-26T21:52Z | (process) | S2.5's four-day tail, for the record | Three attempts, two owner-authorised amendments, ~30 subagents. The card's own lesson, twice over: **a line-number enumeration cannot describe a module's output** (AM-046), and **four green verification rows did not catch a changed English string, because nothing pinned the three-part case** — the rows test what the card tells them to test, and the card's own FD6 oracle list never included this sentence's long form
- 2026-09-26T21:58Z | P4.1 | **unblocked and dispatched as attempt 2** | AM-042 answered P4.1's blocker two hours earlier — the owner chose the allowed-query-keys column, the probe returned one host and ten names for all seven artifacts, and the card's May edit, tests and stop condition were amended. **The coordinator amended the card and then left the status BLOCKED**, so nothing ran on it and the Spanish speech chain sat waiting behind a question that was already settled. Found by the owner asking what was next. Attempt 2 at `104501d`, port 7838, no fresh instruction review (AM-038 precedent: an owner-authorised amendment is the review that matters, and this card had three already)
- 2026-09-26T21:57Z | (process) | **three strays, not zero** | The owner asked whether the UI agent had been archived. It had not: an earlier `archive_agent` call returned `success: true` and **did not stick**, and two more were left — the S2.5 attempt-3 implementer and the crashed coordinator from the 2026-09-25 session. All three archived and re-verified by listing rather than by trusting the return value. The UI agent was `claude-opus-5-5`; it had committed `c5a62c8` and `3db8526`, both pushed
- 2026-09-26T21:54Z | (side) | **:7810 preview was stale and is now current** | The owner asked for a link and the honest answer was that the sandbox preview was serving a bundle built at 14:21, before any UI work, with zero occurrences of the clay accent — the same stale-preview failure as earlier in the session, caught this time by the owner. Rebuilt and restarted: `npm run build` exit 0, fake AI, migration level 8, seeded (John Smith / Maria Ruiz / Ana Torres), and the served CSS verified over HTTP to carry `#d97757`. The agent's Vite server on :5173 is also up but is the agent's and no longer vouched for
- 2026-09-26T22:15Z | P4.1 | **coordinator error, disclosed and corrected** | Attempt 2's implementer emitted a truncated turn (`Now the tests. First \`readiness.test.ts\`:`) and the coordinator read it as a dead agent — the same error made earlier in the session with a different agent. It reverted `installer/` to HEAD, deleted the two new files, and committed a checkpoint declaring attempt 2 **spent** and attempt 3 next. The agent was never dead: it resumed and was mid-flow on `download.test.ts` when the revert landed under it. Disclosed to it in full, with `docs/v2/evidence/P4.1/attempt2-partial.patch` named as the recovery path (it holds `readiness.ts` 562 lines and `readiness.test.ts` 465 lines whole, captured before deletion), and told plainly that **attempt 2 is not spent and has one attempt after it**. The agent's first act on waking was to stop and inspect rather than plough on, which is the right instinct. Checkpoint corrected: attempt 2, IN PROGRESS. **Lesson, recorded because it has now happened twice: a `finished` notification is not a death, and a truncated last message is not evidence of one — check `get_agent_status` before touching the tree.**
- 2026-09-27T00:50Z | S2.5 | **impl a4 SUBMITTED, four rows PASS** (`bc7528e` code, `bea4b40` return) | The AM-049 corrective attempt. Three files: `refine-request.ts`, its test, `en.ts`. The join is `locale === DEFAULT_LOCALE ? parts.join(' and ') : (one part ? parts[0] : msg('chat.list.last', …))` — default-locale English byte-identical to the wire at every part count, other locales keeping the catalogue list that makes a Spanish sentence read naturally. **Four new assertions, one per part count, each compared against a `wire([...])` helper rather than a hardcoded string**, with `not.toContain(',')` on the three- and four-part cases — so the exact gap that hid attempt 3's regression is now pinned. Catalogues symmetric at 740/740; all five oracles untouched. Final review dispatched with the wire's English to be derived independently at `2dd09d2`, a fifth-part check nobody has asserted, and a request to rule on whether `DEFAULT_LOCALE` can be reached while rendering Spanish
- 2026-09-27T00:45Z | (side) | UI agent's browser pass found **four real bugs** invisible to every gate | Rename-in-place put the caret at the end instead of selecting the name (10..10, now 0..10); a colour rule painted the spell-check backdrop as well as the input so the name looked bold; rows below jumped 1px when the field opened; the pin glyph was ~10px across against Claude's 16. Fixed in `98b1870`, four files, `web/src/**` only, index checked empty immediately before staging. `check-ui-strings` TOTAL 0, web 373/373, `web/dist` rebuilt. **This is the argument for insisting on a browser check**: none of the four is reachable by `TOTAL 0`, by 373 passing tests, or by a clean typecheck. Agent also verified long-name truncation at 288px, the Pinned/Older split with one patient pinned, and both themes across the note page, notes column, Settings and the refine chat, and found no unreadable pair
- 2026-09-27T00:47Z | ACQUISITION | **AM-050: A13, A14, A15 added** on the owner's approval | `qwen3.5:2b-q4_K_M`, and `Bonsai-8B-Q1_0.gguf` / `Bonsai-4B-Q1_0.gguf` limited to one named file each. A14/A15 reference A07's redirect hosts and allowed query keys rather than restating them, so AM-042's enumerate-by-name admission applies unchanged. Three rules written into the manifest rather than a briefing: no candidate becomes a default; the GPU is not shared (one model, `keep_alive`, nothing while the owner tests); and **the Bonsai licence is recorded as unknown to the coordinator**, to be found with its URL before either is pulled or reported `BLOCKED`, because L-POLICY@1 requires the publisher's licence for models fetched at setup and it will not be asserted unverified. Nothing is now waiting on an owner decision
- 2026-09-27T00:40Z | (process) | P4.1's review deliberately **held** | Its rows are repo-wide (`npm run lint`, `npm run typecheck`) and the UI agent was mid-edit in `web/src/**`. A half-written file there would have reddened rows belonging to another card — the AM-028 → AM-030/AM-032 pattern. It dispatches now that `web/` is quiet
- 2026-09-27T00:55Z | (process) | **coordinator overclaimed, and the index problem has now happened four times** | Two corrections. **First:** the coordinator told the owner "P4.1's review is dispatched now". It was not — only `state/dispatch/P4.1-review.md` was built and committed (`197dfa5`); no reviewer agent was ever created. It also should not run yet, because the UI agent is mid-edit in `web/src/**` and P4.1's rows are repo-wide with `prettier --check` over the stylesheets, so a half-written CSS file would redden a row belonging to another card. **Second:** the attempt-4 implementer reported that the coordinator's `23e36ca` swept its tip-rerun evidence and return re-run paragraph into the log commit, because the coordinator's commit ran while the implementer's paths sat in the index. That is the **fourth** time a staged change from another agent has been absorbed into a coordinator commit tonight — `AM-030`, `AM-041`, `16d87ee`, and now this — and the first three were mine, so this is not a one-off. The check that was skipped is the one *after* `git add`: the coordinator verifies the index is empty, then adds, then commits, without confirming the index still holds only its own paths. From here: add, then re-read `git diff --cached --name-only`, and unstage anything not explicitly named, before every commit. Recorded because the pattern is the failure mode, not the four incidents.
- 2026-09-27T01:00Z | P4.1 | **impl review a2 dispatched** on base `104501d` head `463215b` | Held all evening for a condition that finally held: `web/src/**` clean, the UI agent idle, tree clean at `6eff28f`. Its rows are repo-wide with `prettier --check` over the stylesheets, so every earlier moment would have risked a red row belonging to another card. The brief puts the weight on the security question rather than the row count: prove no query **value** is ever read, logged, recorded or compared anywhere in the installer (a signature reaching a log is the failure AM-042 exists to prevent, and no row would catch it); prove the admission test is set membership on the **name** with no prefix, wildcard, case-folding or normalisation that would admit an off-list name; prove it runs *before* the request, so an off-list name means zero fetch calls. Also told to judge attempt 2 as **new** work against the amended card rather than a repair — attempt 1 stopped on a stop condition, and attempt 2 exists because the owner amended the plan, not because the work improved
- 2026-09-27T00:58Z | (side) | UI agent idle, two owner questions open | Committed `6eff28f` (settings backdrop to black — `rgb(0 0 0/0.5)` dark, `0.3` light; Claude's modal surfaces at `1024×800` with a `#151515` nav, `#1a1a19` content, `#383838` active row and a `#262625`/`#3c3c3b` segmented control; dark "New patient" pill in light mode). Coordinator verified: stylesheets only, web 373/373, and the modal **bounds** rather than locks (`max-width: calc(100vw - 2 * var(--space-24))`) so it cannot overflow a small window. Agent is blocked on the owner for a screenshot of Claude's sort menu open, and has asked the owner the same two blue-dot questions independently. Nothing in flight from it
- 2026-09-27T01:20Z | S2.5 | **APPROVED** — 33 cards green, **zero blocked** | The attempt-4 review passed, and it earned the verdict: it executed `77767c2` rather than reading the card's claim, confirmed byte-identity at 1/2/3/4 and **five** parts (five asserted nowhere), and ran an 18-case whole-module differential over `outcome|reason|reply` with **0 byte-differences**. It demonstrated the pin **bites** by running the head's own test file against the pre-fix code — failing on three and four, passing one, two and Spanish. It also **corrected a false premise of mine**: I told it `2dd09d2` was the pre-defect code, and it checked, found attempt 3 already inside that range, and said so instead of proceeding on my assumption. Locale branch unreachable in the wrong language (`DEFAULT_LOCALE` is a hardcoded `'en'` in read-only `locales.ts`, and `locales.test.ts` — inside V1's own filter — asserts it). `chat.list.last` keeps exactly two callers. Releases **S2.6 → S2.R → S3.2 → S3.3 → S3.R → S5.1 through S2.7/S5.7**, the entire Spanish AI chain
- 2026-09-27T01:18Z | AM-051 | **a weak oracle, found by accident, and the same shape twice** | The review surfaced out of scope: two `es-MX` values from **S2.4** render "de 1 notas" for a single note, and one plural form omits `{total}` while its siblings carry it and `kind` declares it. Coordinator confirmed both. The mechanism is the finding: `t.test.ts:57-66` **unions** `{name}` tokens across `text` and every plural form into one Set and compares the union, so a **per-category** mismatch cannot fail. That is the identical blind spot that hid S2.5's three-part English for three attempts — an oracle weaker than the property it checks. Fix belongs in S2.6: compare per form, and correct the two values. Latent only because Spanish is held
- 2026-09-27T01:20Z | S2.6 | now **dispatchable** (deps S2.4, S2.5 both APPROVED) and deliberately **HELD** | Its May edit is `web/src/routes/Settings.tsx`, `web/src/lib/i18n.tsx`, the job-triggering components and `e2e/**` — precisely where the owner-run UI agent is working, and it has three more owner decisions in flight (Fraunces wordmark, teal-in-both-themes, teal default accent). Dispatching now would put two writers in the same files. It goes when the UI agent is idle and the accent lands in its single coordinated commit
- 2026-09-27T01:40Z | UI | **`2f066c8` landed, and its commit message overstates it — recorded, not rewritten** | The agent's last UI commit, `web/src/styles/app.css` only, **7 lines**: `.directory-row:has(.patient-entry-actions.is-open) { z-index: 5; }`. A real bug the browser found and no gate could: the ⋮'s box is centred with a `transform`, which **establishes a stacking context**, so the menu's z-index is trapped inside its row and the *next* row's date ("Aug 4") painted straight through the open menu. Verified with `elementFromPoint` on the covered date. **Its message describes the whole View-all change — Select, the separators, Pin P, Rename R, Archive D — and none of that is in this commit; it is all in `0142b10`.** The message was written before the agent saw `0142b10` existed. It has not amended, because HS-4 forbids rewriting history, which is correct: **the truthful record is `0142b10` + `2f066c8` read together, and this line is that record.** Anyone auditing "when did View all get its menu" should read both, not `2f066c8`'s prose
- 2026-09-27T01:42Z | UI | the two open items in `0142b10` are now **closed by the agent's own browser pass** | That commit's message listed what was unverified when I landed it on the agent's behalf: no visual check on `:7861`, and whether the narrower sidebar row still reads correctly with a menu laid out for View all. Both answered: row geometry **unchanged** on hover (top 201.6, height 52, name x 391, width 940, before and after), and the sidebar menu still reads Pin P / Rename R / Archive D with the horizontal ⋯. Suite 382/382 under Node 24.19. **So the geometry worry I flagged never materialised** — the agent had overlaid the ellipsis with `position: absolute` rather than swapping it for the date, as the diff already showed
- 2026-09-27T01:43Z | (process) | the UI agent is **done**, and it corrected itself on the record | It is blocked on the owner for one screenshot (Claude's sort menu, open) and has nothing else queued; it will ask before touching `web/src` again if the screenshot arrives. It also **retracted its own claim** that the picker's contrast warning had shipped — it had read the *key* landing in `199e6c6` as the feature, which is exactly the misreading I corrected it on, and it will now describe that warning to the owner as scheduled rather than done. **Both halves of that were my error to make the same way once**: a key in the catalogue looks like a delivered feature, and I only caught it because the agent repeated it back. Worth writing down: a translation key is a *sentence*, not a *screen*
- 2026-09-27T01:45Z | S2.6 | **card amended, then dispatched — attempt 1** | It was held on the owner-run UI agent being live in `web/`, and that condition finally holds: the agent has no queued work. But it was **not dispatched straight off the card**, because two amendments assign it work in `shared/` and the card's May-edit list did not include those paths. Folded in first, as P4.1's AM-042 was: **AM-051** (the unioning `{name}` oracle at `t.test.ts:57-66`, which hid a defect for three attempts, plus the two "de 1 notas" `es-MX` values it hid) and **AM-053** (the picker's low-contrast warning, key already present, behaviour not). Three verification rows added, and **V5 is the one that matters**: run the per-form oracle against a deliberately wrong value and require it to **fail**, because a green run of a stricter test proves nothing on its own. The order inside AM-051 is also a requirement — oracle first, strings second — and it is checkable, because fixing the strings first would let the still-unioning oracle report green and the hole would ship inside the very commit meant to close it
- 2026-09-27T03:10Z | S2.6 | **attempt 1 BLOCKED, and the block was correct** | AM-051 and AM-053 both landed and verified; V1–V3 could not be built at all. Coordinator verified all three causes by grep rather than accepting them: `language_change_blocked` genuinely absent from `ApiErrorCodeSchema` (`shared/src/errors.ts:4-24`, so the server's error class admits nothing else and the 409 was unreachable); no catalogue entry for the row, and `en.ts` unwritable while `check-ui-strings` rejects literal UI text, so there was **no route to the strings at all**; and `data-i18n` at **0 marks in 41 files across 715 `t()` sites**, with `expectNoEnglishUi` at 0 in `e2e/`. Unblocked by AM-054 — three paths widened, the copy written up front, and the `data-i18n` decision replaced rather than merely permitted
- 2026-09-27T03:12Z | S2.6 | **AM-051's order was followed, and V5 is the proof** | `cc71e31` adds **only** the per-form check in `t.test.ts` and was **committed failing on purpose** — six lines, all in `brainstorm.contextMostRecent`. `d509986` then corrects the strings. The evidence file is the part worth keeping: the injected defect replaces `{total}` with `{count}` in one form, which **leaves the entry's union of tokens unchanged**, so the old union test run against the same catalogue **passed 21/21** while the new per-form check exited 1 naming the key. That is a controlled demonstration, not an assertion that a test failed once. It also found a **third** defect my V6 row had not anticipated: the same key's `text` field was missing `{total}` too, invisible because `text` never renders on a plural key — and the card says *every* form, so it was fixed. A self-test that keeps the proof permanently is now in `t.test.ts`
- 2026-09-27T03:14Z | S2.6 | **AM-053 caught a bug, and the bug was in my own fixed decision** | The warning's surface list in AM-053 read `--app-bg` and the **dark** sidebar. The brand mark is painted in the **sidebar**, and the light sidebar is `--sidebar-bg: #f5f4ed`, not `#faf9f5` — so the list was wrong in precisely the place the logo sits, and a pale accent would have sat under 3:1 there while the warning stayed silent. The agent reported it **having followed the card**, which is the correct behaviour and the reason the card text is worth having. Corrected in AM-054 to all four surfaces, with the instruction to read the values off `tokens.css` rather than trust the sentence. **A fixed decision is not automatically right because the coordinator wrote it.** Two of these three rows in the card now carry corrections, and the third (`data-i18n`) was simply untrue
- 2026-09-27T03:16Z | (finding) | **per-form placeholder parity cannot see grammar — and one string proves it** | `halaxy.undoneNotesKept` at `en.ts:2655-2661` / `es-MX.ts:2436-2442` renders, at a count of 1, English "**1 note you had finalized were kept**" — singular subject, plural verb, no relative — and Spanish "**Se conservaron 1 notas**". Both are wrong, both are user-visible, and **AM-051's per-form oracle passes them**, because every form carries exactly the tokens its `kind` declares. The oracle checks *placeholder parity*; these are *agreement* defects. That is a real limit of V6, not a defect in it, and it is the second time this session that a check proved narrower than the property it was standing in for (the first was S2.5's three-part English). **Not fixed by this card**: `es-MX.ts` is writable under AM-051 but `en.ts` only for `settings.language*`, and copy that wrong in English as well as Spanish belongs to whoever owns that surface, not to a card fixing a plural oracle. Recorded open
- 2026-09-27T04:05Z | S2.6 | **the `data-i18n` replacement held: 0 marks, and the reason is worth recording** | Attempt 2 built V1–V3 with `data-i18n` in **0 files** — AM-054's replacement (match visible text against the English catalogue, report the key) rather than AM-051's original 715 hand-placed marks. The green is not the point; the shape is. A per-render-site attribute would have been a second source of truth that rots the first time someone adds a screen, and the card would have been "done" with a hole in it that no gate could see
- 2026-09-27T04:10Z | S2.6 | **the agent reported MY copy as false, twice in two days** | `settings.languageBusy` read "Applies when the current task finishes", but the control is **disabled** while work runs — nothing is held, nothing is applied later, so the sentence was untrue from the moment it was written. It **stopped and asked** rather than picking a key, on a detail with **no visible symptom and no test that could assert it**: whether a key is rendered is not something a suite can check. Resolved by deleting the key (`78784f0`) rather than leaving it unrendered — the same call as `patients.newShort` hours earlier, and sharper here, because an unrendered key that reads as approved copy is a trap for whoever wires it next. The disabled control and the 409 now share `settings.languageChangeBlocked`, true in both positions; a 409 is not the place to give advice. Its own recommendation was to keep the dead key, and it was **overruled** — consistency beat tidiness
- 2026-09-27T04:15Z | S2.6 | **session limit again; 178 lines landed on the agent's behalf** | Hit the limit (resets 1:50am) mid-conversion of three more specs. Same judgment as the UI agent's View-all work, and the same precondition: verify before landing, because the hazard is capturing a broken intermediate. e2e tsc 0, web 390/390, shared 199/199, `TOTAL 0`, prettier clean. **Not verified: the three specs have not been executed** — e2e needs the sandbox and a built app, so that is stated in the commit rather than glossed. The substantive half is in `no-english.ts`: the matcher now widens a `{name}` per its `kind`, so a `number` becomes a number instead of anything. **A looser wildcard manufactures false positives, and a check that cries wolf gets muted rather than fixed** — tightening the matcher is what makes a green V1 mean anything
- 2026-09-27T04:18Z | (process) | **two agents, one cause, and the fix is the reviewer's habit** | Both the UI agent and the S2.6 agent have now caught something the coordinator wrote — `#f5f4ed` for `#faf9f5`, and a sentence that was never true. Neither was found by a test, a review row, or a type check. Both were found by an agent **reading the instruction and checking it against reality**, and both were reported rather than quietly worked around. That is the argument for writing fixed decisions down in prose a reader must interpret, rather than only in code a test already pins: **a fixed decision is not right because the coordinator wrote it**, and the cheapest guard on that is an agent with standing to say so
- 2026-09-27T04:40Z | (owner) | **D15: the Claude-like UI is v2's UI, and the check was for conflicts, not for a switch** | The owner's call, recorded as a decision. The tempting reading was "flip something" — but there is nothing to flip: the agent's work has been on `feature/v2` since `c5a62c8`, `prototype/` has been reference-only, and `AM-028` already called itself a **baseline**. So the real work was finding what still assumed the old UI. **Checked rather than assumed, and the check is the finding:** no un-started card mentions Star, Recents, the sidebar, the rail, the collapse, `288px` or either former accent. A first pass appeared to find ten cards with hits, and every one was a false positive — "s**tar**t" for Star, "**rename** a file" for rename, "**accents**" in the Spanish spellcheck sense for accent. **The ten-card result was the substring test lying, not the plan.** And every remaining `prototype/` reference is fixture data (`John Smith`, HS-8) or a do-not-touch path; no card uses it as a design source. So nothing had to be rewritten — the plan was already compatible, and the D15 row exists to say so in a form a card's implementer will actually read
- 2026-09-27T04:42Z | (finding) | **P2.1 is APPROVED, closed, and its brand block is now a trap** | Its fixed decisions pin `--brand-mark: #1f6f63` light and `#ffffff` dark, assert the mark "never follows `--accent`", and give both viewBoxes as `2903 × 1012` and `562 × 754`. **All superseded** — D10 amended twice, the default accent now `#218677`, and the marks are Fraunces outlines at `1419 × 1440` and `7044 × 1946` with the home screen showing the wordmark. Anyone reading P2.1 for brand guidance would now restore the old teal and an accent-invariant mark. Annotated **SUPERSEDED** above the block, with the three reasons. **The block itself is not edited**, and that is the judgement: an approved card is the record of what was true when it was approved, and rewriting it would destroy the only honest account of the change. The card's own scope said a change to `--accent` was "a finding to report, not a licence to change it" — this note is that report
- 2026-09-27T04:45Z | (process) | **`CLAUDE.md` said "the UI may intentionally drift" — which understated it, and was an invitation to restore prototype values** | D15 is now recorded there too, with the operational half: a prototype value is not a default, and reintroducing one is a regression rather than fidelity. "May intentionally drift" is true but soft; read cold by a future agent, it reads as *drift* — a thing that happened and might be corrected. It was not drift. It was the owner's design, chosen deliberately, and the prototype is the thing that was left behind

- 2026-09-27T06:35Z | takeover audit | Reviewed and archived all three idle Paseo agents (S2.6, UI, previous coordinator); all archive calls succeeded. Clean code at ce24912, no lost changes recovered. Build exit 0; shared/web/installer 795 tests passed, exit 0. Fresh fake-data preview on 7811 verified in Chromium with teal #218677. S2.6 remains incomplete; P4.1 review conditions and stale checkpoint remain open. Full recovery context and next priorities: state/NEXT-SESSION.md. No card approved or attempt counter changed.

- 2026-09-27 | owner continuation | Owner authorised continuing the recommended v2 work with Space Bunny Free subagents and supplied four Claude sort-menu screenshots. Model discovered as opencode/opencode-go/space-bunny-free; no configured profiles. Dispatched separate docs-only instruction reviews for S2.6 attempt-2 resumption, UI-SORT scope, and P4.1 carried findings, with disjoint report files. All implementation remains serialized; workers leave changes uncommitted; independent reviews use fresh agents. Unsupported unread/custom grouping semantics are an owner decision, not an inferred data model. Screenshots remain outside Git.

- 2026-09-27 | UI-SORT owner scope | Owner explicitly chose to add unread tracking and custom groups, not omit unsupported options. Instruction reviewer received the expanded scope before implementation. Proposed semantics communicated: unread follows new/updated patient notes since last opened; named manually managed patient groups; State means Active/Archived. Review must specify persistence/migration and acceptance before coding; group deletion must never delete patients.

- 2026-09-27 | direct UI ownership | At owner request created Space Bunny Free agent f0bd1c61-253b-46ce-b59b-080334f6cb07, titled "Apunta UI owner — direct owner instructions". Direct owner instructions establish its UI decisions; coordinator handles independent review, verification and integration. UI implementation lane reserved for it; initial instruction is orient then wait for owner. It leaves all changes uncommitted. This intentionally retained owner-facing agent is exempt from disposable-reviewer cleanup while owner uses it. UI-SORT reviewer will supply advisory scope/data-safety report. S2.6 implementation waits for a released writer lock.

- 2026-09-27 | reviewed IR returns / AM-055 | Archived completed S2.6, UI-SORT and P4.1 instruction reviewers after examining their reports. S2.6/P4.1 explicitly BLOCKED pending scope/contract decisions; no attempt counter increment for resuming inherited work. P4.1 size corroboration found in historical download records; reject its reviewer proposal to bypass size on digest match. Probe defect includes a string-versus-array crash before report write. P4.1 amendment proposed for owner approval. Direct UI owner reserved five-file teal batch #2a9d8f; AM-055 records the decision/tradeoff; separate UI-TEAL IR running.

- 2026-09-27 | owner simplifies UI workflow | Owner rejected repeated coordinator approval for individual visual tweaks. Dedicated UI agent now iterates directly with owner in isolated fake-data sandbox, with exclusive code-writer lane; no per-tweak IR hold. Coordinator reviews/tests/integrates one finished owner-submitted batch with an independent reviewer. UI-TEAL instruction session archived/superseded, not an acceptance. UI code remains uncommitted until handoff. Privacy/live-instance isolation and guard thresholds remain hard boundaries; data semantics are agreed directly with owner and recorded.

- 2026-09-27 | UI batch integration / AM-056 | Owner requested collecting the finished UI and explicitly keeping its agent for tomorrow. Frozen handoff: 12 files, plus two e2e selector repairs. Independent review found drag lag from the new width transition; author repaired cascade specificity and coordinator verified real drag transition 0s, normal collapse restored after release. Full tests 1,967/1,967; lint/typecheck/build exit 0; final targeted Chromium 23/23, exit 0. Preserve prior intermittent spelling failure in integration evidence (isolated rerun and final batch passed without changing that test). Historical P2.2 screenshots restored after test side effects. Independent reviewer archived; owner-facing UI agent retained idle. No S2.6/P4.1 approval implied.

- 2026-09-27 | parallel readiness preparation | Owner authorised no-regret parallel subagents while continuing direct UI work. Started Space Bunny Free reviewers 597095bd-48ae-43c1-b2ec-df716357400b (P3.1 Linux packaging) and 88dd0fbb-1d75-4cd6-b436-93ebaec07435 (P5.2 startup migration), based on c1d897f. Read-only source/tool checks; exclusive outputs state/reviews/P3.1-readiness-2026-09-27.md and state/reviews/P5.2-readiness-2026-09-27.md. No builds, tests, launches, downloads or source edits; UI retains code-writer lane. Existing CLEAR reviews receive bounded drift checks, not new implementation attempts. Results pending; no status/acceptance change.

- 2026-09-27 | P3.1 readiness processed | Verified source-relative createRequire package.json calls in config.ts and platform/data-lock.ts. Coordinator in-memory esbuild probe (Node 24.19.0, bundle/platform=node/format=esm/target=node24/write=false) preserved the relative runtime require, exit 0; no app build, launch, database or output files. Planned single-file layout therefore needs metadata resolution addressed before implementation; no scope amendment authorised or applied. Stale dispatch must be regenerated, port availability rechecked then. Accepted readiness finding, not card acceptance; reviewer 597095bd archived. P5.2 report remains in-flight correction and is excluded from this commit.

- 2026-09-27 | P5.2 readiness processed | Rejected initial unsupported rollback-loss claim; reviewer corrected it after coordinator independently checked index.ts ordering and restore.ts no-op path. Accepted corrected readiness report, no implementation acceptance or attempt increment. P5.2 ready after UI writer release; checkpoint stale S2.5 hold replaced. Read-only snapshot/schema premises remain implementation-test obligations. Reviewer 88dd0fbb archived; direct UI agents untouched. Both parallel preparation tasks complete; P3.1 metadata/layout issue remains open.

- 2026-09-27 | direct UI owner group batch | Owner-facing agent announced authorised patient-menu geometry and persistent groups batch. Confirmed semantics: named groups, at most one nullable group per patient, creation inside Move to group submenu, sidebar headings, ungrouped placement unchanged. Supersedes advisory many-to-many proposal. Rename placement remains pending direct owner response; creation-time ordering is stated reversible default, not ratified owner decision. Coordinator requested separate menu-style/group integration commits with work left uncommitted, migration preservation/FK/API/UI evidence at handoff. Current app base c1d897f, docs HEAD db0828e communicated. Existing uncommitted accent/brand/style files observed and left untouched; final batch scope reconciled at handoff. P5.2 implementation remains held for UI writer. No new approval round or application edits by coordinator.

- 2026-09-27 | autonomous independent continuation | Owner instructed continued progress except owner-only hard blockers. Started Space Bunny Free bounded proposal workers 3d39d4cf-bdc8-40ae-ae0a-2f4178b2077a (P3.1 metadata repair, sole output state/P3.1-METADATA-PROPOSAL.md) and 33edaa34-06da-4cb1-a930-359cc313cecf (S2.6 forward-only attestation, sole output state/S2.6-ATTESTATION-PROPOSAL.md). UI code/schema writer remains exclusive; proposals cannot amend active rules. Coordinator rechecked P4.1 malformed queryKeys/render crash, raw diagnostic and unconditional query rejection against source, exit 0; existing concrete amendment remains necessary. Sent owner the bounded P4.1 approval request under COORDINATOR section 6 while independent preparation proceeds. No code or in-flight worker file staged.

- 2026-09-27 | AM-057 applied | Owner explicitly approved bounded P4.1 amendment. Updated card scope, offline V4, receipt contract and P4.3 catalogue assertion. Preserved all exact size/digest and network allowances. Attempt counter remains 2 until repair starts; fresh IR queued after current proposal workers free a slot, implementation awaits UI writer release. No application files touched.

- 2026-09-27 | attestation proposal reviewed / P4.1 IR dispatched | Coordinator confirmed activation writes ATTESTATION_TEXT and already imports locale helpers. Corrected proposal false attribution of coordinator docs commits to UI owner and overstatement of HS-10 as implementation prohibition; clinical release verdict remains owner-only. Scope/wording proposal pending. Proposal worker 33edaa34 archived. Started independent Space Bunny Free P4.1 attempt-3 instruction review against AM-057; report-only, no source/build/network interference with UI.

- 2026-09-27 | packaging proposal processed | Independently verified proposed build-time version injection on an in-memory esbuild fixture (exit 0, write=false, no app build). Corrected report overclaims: plugin impossibility, UI commit attribution, blanket package.json string ban and proposed ownership-poll exemption. Source fix remains recommended scoped amendment, pending owner approval. Reviewer 3d39d4cf archived. Full copied-bundle runtime proof still required; no code edited or acceptance granted.

- 2026-09-27 | AM-058 / AM-059 applied | Owner separately approved bounded packaging and forward-only attestation proposals. Active cards/contracts updated; only documentation staged. Preserve size/hash/isolation/release gates and historical attestations. Packaging fresh IR next; attestation fresh IR queued pending capacity. No implementation attempt advanced; UI remains exclusive writer.

- 2026-09-27 | P4.1 IR processed / two approved-scope IRs running | Archived reviewer 964b6158 after inspecting report. Corrected stale reference/new-file context and recorded prior seven-HEAD side effect from V2 evidence. Rejected supposed unsatisfiable V1: 12/130 is the explicit failure tripwire, not required output; no new count floor invented. Catalogue fixtures already satisfy lint, now explicit. Re-review queued, no implementation accepted. Started P3.1 AM-058 reviewer 8c4ccce7 and S2.6 AM-059 reviewer cd5166bb with disjoint reports and no source/build/network work.

- 2026-09-27 | S2.6 AM-059 IR accepted after correction | Initial reviewer return rejected for writing historical S2.6-ir.md outside sole assigned output; one correction attempt used. Reviewer restored historical report from HEAD; coordinator git diff --exit-code returned 0. Corrected assigned report all ten CLEAR. Rejected unsupported missing-bilingual-command and clinical-signoff-as-card-blocker claims; RUN-CONFIG section3 and e2e projects already provide commands. Reviewer cd5166bb archived. Implementation attempt2 unchanged; review correction counted separately, no feature implementation performed. S2.6 ready after UI writer release.

- 2026-09-27 | owner model research | Owner retains fast Qwen3.5 4B default and requests smarter optional local model on 2022 MacBook Pro, preferred app/model footprint under20GB; asks direct bilingual vs translation cascade. Researched official model/size/memory/translation sources and current think:false writing path. Recommendation/evaluation plan in docs/research/local-bilingual-model-options-2026-09-27.md; candidates unbenchmarked on8GB M2, no download/model switch/contract change.

- 2026-09-27 | P4.1 final readiness review processed | Reviewed 0f6c93a6 report; IR02-10 CLEAR, IR01 stale guard-reference only. Independently located current guard readiness.ts:191 and corrected all three historical references under AM-061, no behavioral changes. Review retains its original verdict; coordinator closes D5 with explicit diff/evidence. Agent archived; final implementation remains held for UI writer release.

- 2026-09-27 | owner-authorized model study | Owner explicitly requested coordinator-authored testing plan and delegated execution, authorising needed model downloads on PC with sequential GPU/RAM use. Authored docs/research/local-model-study-plan-2026-09-27.md: installed4B fast/thinking, text-only9B Q4/Q3, Gemma12B comparator and translation challenger, separate shipped-English vs experimental bilingual tracks, frozen synthetic supplementary corpus, no protected Spanish heldout tuning, one GPU runner/lease, independent review, no Mac-fit claim. UI live tree isolated; real-disk scratch root because /tmp is tmpfs. No model default or production acquisition changes.

- 2026-09-27 | model study launched | Instruction reviewer d11f38c6 and acquisition-only worker f044198c running. Owner-authorized scratch directory access allowed for downloader. Denied reviewer unnecessary out-of-scope write probe; coordinator supplied successful snapshot evidence. Exported committed05d9b10 to real-disk scratch/snapshot and copied283MB dependency tree with cp -a --reflink=auto; verified @apunta workspace links resolve only inside snapshot, exit0. ollama list contains only installed4B; ollama ps empty before study. No inference yet; GPU runner starts after instruction review.


### 2026-09-27 — permission watch and study review follow-through

Owner requested proactive permission monitoring after missed events. Approved
acquisition worker registry-manifest access persistently for the specific library
directory; heartbeat fb0718a5 checks permissions/completion every two minutes
for up to 12 hours, to be removed when delegated monitoring is unnecessary.
Direct snapshots showed pendingPermissions even when requiresAttention=false;
use pendingPermissions as evidence. Latest check: UI, acquisition and instruction
review workers active, no pending permissions. Retain UI owner per instruction.

Processed initial MODEL-STUDY IR; assigned one bounded correction to distinguish
existing adapter/acquisition provisions from actual missing measurement details.
Coordinator amended research plan before any scored generation: independent
bilingual gold review, frozen factual/style decision rules, retry disclosure,
absolute scratch paths, contamination handling, copy provenance and honest Mac
memory uncertainty. No production or UI files changed. Reviewed own plan diff;
git diff --check exit 0. Acquisition final evidence still being written; no
acquisition acceptance or model quality result claimed.


### 2026-09-27 — model acquisition processed; corpus work dispatched

Acquisition report read in full. Coordinator sha256sum verified C/D against
expected digests (exit 0); ollama list confirms five tags/baseline identity
(exit 0). Preserved caveats in report; no inference or quality pass claimed.
Archived acquisition agent f044198c and instruction reviewer d11f38c6 after
processing outputs. Reviewer residuals closed by explicit minimum telemetry,
pre-freeze review artifact and existing baseline pairing plus maximum16 pairs;
report retained as submitted, not rewritten to claim a CLEAR it did not give.

Spawned Space Bunny Free corpus author f8ddc7a6, limited to scratch corpus/
and corpus-author.md, no inference. Separate bilingual gold review follows.
No profiles configured. UI owner remains active and retained.


### 2026-09-27 — corpus draft validated; review and serial runner dispatched

Coordinator reran corpus validator using pinned Node: exit0. Found incorrect
snapshot-base prose; recorded correction in receipt, no semantic acceptance.
Archived author f8ddc7a6. Dispatched separate bilingual reviewer15965cb4 to
review all paired inputs/gold and resolve research conventions without inventing
owner gates. Corpus remains draft until review/repairs/freeze.

Dispatched sole execution worker for frozen shipped English Track1 and harness
preflight under exclusive GPU lock; Track2 scored generation explicitly held
until reviewed gold freeze. Independent corpus review uses no inference.
UI retains live source lane; study operates in committed scratch snapshot.


### 2026-09-27 — bilingual review processed, corpus repairs assigned

Read independent corpus-review findings, checked gold schema/critical fields
against scratch. Draft is NOT READY to freeze: quotation direction, excerpt
index definition, omission severity and protected-name separation need repair;
additional language/cue/structural checks accompany same batch. No scored
Track2 generation authorized. Fresh repair worker assigned corpus-only scope
and repair report; original author/reviewer evidence preserved. Reviewer
15965cb4 archived immediately after processing. Fresh blind style-review context
will be used, avoiding reviewer exposure to alias generation rule. English
Track1 executor notified to continue independently under exclusive GPU lease.


### 2026-09-27 — corpus repair1 verified mechanically, final review dispatched

Coordinator reran validate-corpus.mjs and check-repairs.mjs on pinned Node:
both exit0,44 gold records/20 hashes,10 correct-content seeds,7 value-agnostic
seeds and14 structural invariant checks. Read repair report; omission-severity
deviation explicitly reserved for independent judgment. Corpus remains draft.
Archived repair implementer ee21d4ff after processing, dispatched fresh
independent corpus freeze reviewer. No scored Track2 approval yet; English
executor and UI owner continue in their existing lanes.


### 2026-09-27 — final corpus screening repair dispatched

Independent freeze review886a3e10 reports one residual defect class: critical
cue collisions with required content. Coordinator inspected check-repairs sweep
(only mustState.any, one direction) and confirmed incomplete coverage. M3
omission-severity deviation accepted by independent reviewer. Archived reviewer
after processing; dispatched final repair2/2 limited to corpus and repair2 report.
Cues remain screening candidates, not automatic verdicts; factual requirements
and thresholds unchanged. Track2 freeze remains withheld pending verification.


### 2026-09-27 — UI batch handoff and independent integration review

UI author reports lint/typecheck/build0,2052 unit tests across four timezones,
serial full e2e86passed4skipped12failed(all es-MX), Chromium nofailures. These
are author claims pending coordinator reruns/evidence review, not acceptance.
Requested freeze/writer release, exact logs/paths/process ownership and remaining
directives; UI agent retained. Independent reviewer7ee8af9c assigned source/API/
migration/navigation/test review, report-only path UI-BATCH2-review.md. Current
diff43tracked paths plus13new application paths and unrelated P3 report; no
source staged or committed. S2.6 attestation repair already owner-authorized
AM059, to proceed in correct lane after handoff; no new owner question needed.


### 2026-09-27 — UI frozen, browser failure count corrected from evidence

UI owner confirmed writer lock released, no further writes, no owned running
processes, retained for owner. Coordinator read /tmp/e2e-final.log tail:16 es-MX
failures,4skipped,86passed; this supersedes earlier12failures claim. Full command
uses sandbox port7887 and system Chromium, serial workers. No clean-base
comparison exists; do not label failures pre-existing. Independent reviewer
7ee8af9c received exact log and correction incl workspace.spec.ts41 omitted in
author prose list. git diff --check rerun exit0. Simple workbench and Import
relocation complete per handoff; Continue a draft currently opens general patient
list, not an indexed draft. Production source integration remains unaccepted.


### 2026-09-27 — UI integration defects verified and assigned

Processed independent UI-BATCH2-review.md; coordinator directly inspected
Workspace mount-only archived flag, sidebarView dropped created-sort storage
and portal menu focus path, corroborating F1/F2/F3. Archived reviewer7ee8af9c.
UI owner granted bounded repair1/2 for F1–F5, relevant viewport/accessibility
checks and meaningful F6 foreground-policy regression; request existing direct
owner decision evidence for ledger reconciliation, not repeat approval.
S2.6 remains separate, awaiting writer release. Browser16-failure classification
remains static evidence, not a clean-base counterfactual. No app source accepted
or committed yet; source writer is again UI owner exclusively.


### 2026-09-27 — corpus repair budget spent; final acceptance review

Coordinator reran pinned validator/check-repairs after repair2:both exit0.
Read report; cue screening now0unadjudicated collisions,2retracted-source
exceptions,12proximities; all are screening not automatic factual verdicts.
Archived implementer aa0073eb immediately after processing. Fresh final
acceptance reviewer assigned bounded verification, no further repair loop.
Actual unresolved defects mean affected comparisons INCONCLUSIVE; unavoidable
regex limitations with independent adjudication do not create a new owner gate.
Track2 remains held pending final freeze record.


### 2026-09-27 — bilingual corpus frozen for exploratory execution

Final independent review READY FOR EXPLORATORY FREEZE. Coordinator read report,
reran sha256sum -c:exit0,20/20. External corpus-freeze.json records exact hashes
and limited acceptance without editing corpus content/status/schema. Historical
flags retain their annotations; clinical adequacy unresolved, no release claim.
Reviewer reports throwaway falsification copies despite report-only write scope;
this scope deviation is recorded, not endorsed, and results are accepted based
on unchanged corpus hashes/coordinator checks and substantive independent review.
Reviewer archived; sole serial executor authorized Track2 following Track1,
with unchanged GPU lease, prompts/gold and independent adjudication requirements.


### 2026-09-27 — owner away authorization and resumed S2.6 preparation

Verified remote feature/v2 equals58247c8 and preview7867 health/page. Owner
authorizes continued verified commits/pushes while away about24h; replaced
heartbeat with4ce8f0b5 for36h. UI writer released and retained. Refreshed
NEXT-SESSION/current checkpoint and generated S2.6 post-UI IR dispatch at
58247c8; distinct reviewer d7923020 checks actual drift, priorAM059 remains
authorized. No source edits by coordinator, no new owner gate.


### 2026-09-27 — UI repair review accepted; Spanish implementation resumed

Processed UI-BATCH2-rereview.md: independent review recommends integration,
with 82 focused tests and 2075 UTC tests, lint and typecheck exiting 0.
Coordinator previously reran the 82 focused tests and verified pushed UI commit
58247c8 and the synthetic preview at http://127.0.0.1:7867/.
The full browser gate still has 16 Spanish failures; identical before/after
failure lists do not establish clean-base causation. S2.6 now owns the scoped
locale assertions and approved forward-only attestation repair. Stale sidebar
comments and remaining minor menu observations are nonblocking follow-ups.
White foreground/disabled opacity are implementation choices supporting the
owner's label request, not a separately stated global contrast-policy decision.
Archived completed reviewer a7c2f04e; retained UI owner f0bd1c61 as instructed.

Post-UI S2.6 instruction drift was reconciled in AM-062 without changing guards.
Implementer c521fdc6 holds the sole source writer lane at base 812da7c, with
ports 7831/7832 and prior V4–V7 evidence preserved. Coordinator plan/checkpoint
edits remain uncommitted until the worker releases the lane, keeping its base
stable. Model executor 490ebfe8 continues serially in study scratch. The bounded
heartbeat check found no pending permissions on either active worker.


### 2026-09-27 — S2.6 implementation returned with explicit V1 failure

Worker c521fdc6 released source lane; processed return and archived worker.
Coordinator read production/catalogue diff and reran plans.test.ts + t.test.ts
on pinned Node: 55 passed, exit 0. Full V1 remains FAIL (one open-language-dialog
endonym match); supplementary Spanish project success is not a replacement gate.
Independent reviewer 643131f0 now checks implementation, evidence, and exact
contract-compatible treatment of the endonym failure and reported oracle gaps.
No translation or guard change approved merely to evade an English match.
The author's claim that CPU/browser work cannot affect model timing is not
accepted: overlap remains subject to study contamination telemetry criteria.
Source stays uncommitted pending independent review. Model runner continues.


### 2026-09-27 — independent AM-059 acceptance with evidence corrections

Reviewer 643131f0 independently accepted attestation semantics and 55 tests,
lint and typecheck (all exit 0), but V1 remains FAIL. Archived reviewer after
processing. Assigned corrective implementer 7c562ffd only the false opacity
comments and return/evidence corrections; no assertions, catalogue or guards
may change. Its source lane is limited to language-control.spec.ts comments.
The English-name key's existing component semantics support an exact endonym
repair, but current S2.6 May-edit does not license that key or its component
test. This remains a separately scoped follow-up; card is not approved.
No model timing claim follows merely from absence of inference in the UI tests.


### 2026-09-27 — reviewed partial S2.6 integration

Verified corrective return: false opacity mechanism withdrawn, forbidden allowlist alternative removed, timing claim limited to no own inference. Assertions retained. Archived corrective worker 7c562ffd. Integrating independently accepted AM059 plus locale-aware browser assertions as partial work; S2.6 remains BLOCKED with V1 FAIL, not approved. Source and evidence are frozen; model scratch remains active and excluded.


### 2026-09-27 — final P4.1 attempt dispatched

S2.6 partial work pushed through d0b8292; independent acquisition task proceeds. Regenerated P4.1 attempt3 dispatch at d0b8292 after AM061 correction. Worker owns source lane for bounded AM057 repairs and unchanged V1-V4. Prior egress is recorded, no unbounded repeat authorization. Model executor continues serially; no pending permissions.


### 2026-09-27 — P4.1 repair returned for independent review

Coordinator read probe diff and reran offline V4: 14/14, exit0. Author reports V1-V4 green and second bounded seven-HEAD V2 draw, recorded distinctly from prior egress. Archived author ca6bbda3; independent reviewer ffcf4528 owns report-only lane. Reviewer must verify stub/import ordering and hostname evidence policy without repeating network requests. No acceptance yet; model executor continues.


### 2026-09-27 — P4.1 partial repair preserved, remaining defect blocked

Independent reviewer ffcf4528 reran V1/V3/V4 green and inspected V2; archived after processing. Coordinator reproduced queryKeyNames on fabricated malformed percent name throwing URIError (offline assertion exit0). This violates the intended diagnostic robustness despite green enumerated tests; P4.1 not approved. Attempt3 return is absent; original attempt2 return preserved rather than misattributed. Budget3/3 spent, additional repair requires owner/plan-editor action. Public vendor CDN names are accepted as acquisition evidence under the card explicit narrow privacy interpretation; no local hostname disclosure authorized. Preserving verified partial repair, no installer/guard changes.


### 2026-09-27 — P5.2 implementation underway

Partial P4.1 repair pushed88ef838; card remains blocked on exhausted-budget diagnostic defect. Prior P5.2 IR/readiness clear, regenerated attempt1 dispatch at88ef838 with sandbox port7835 and assigned sole source writer. Model evaluation continues independently.


### 2026-09-27 — P5.2 returned, independent review underway

Coordinator read safety and transaction diff and reran database suite on Node24: 7files64tests exit0. Author reports full2093tests/lint/typecheck green and synthetic wrapper boot checks; not yet accepted. Archived author b779edbe after processing; independent reviewer assigned report-only lane for snapshot/rollback/retention and guard semantics. No source writer active during review. Model study continues; CPU test intervals remain potential timing contamination.


### 2026-09-27 — P5.2 approved

Independent review APPROVE, V1/V2 rerun exit0 (64db/2093fulltests, lint/typecheck). Coordinator previously reran64database tests and read safety/transaction wiring. Exactly five source files in scope. Archived reviewer0b85702b. Nonblocking raw retention error for damaged safety directory and inaccurate rename comment recorded in review, no guard change. Reviewer interpreted b779edbe as a git object; it was the author agent ID, base88ef838 was correct. Hash freeze verification still valid. P5.2 APPROVED; source integration follows.


### 2026-09-28 — orchestrator handover, strays cleared, model-study evidence committed

New coordinator session took over after the previous one exhausted its budget. No source lane activity: the Opus UI owner's in-flight batch remains uncommitted in the working tree and was left untouched. Pending permissions at handover: none.

Archived after processing their handoffs: independent protocol/result auditor 81df21f (lane complete, both review files final), blind bilingual quality reviewer de4b8cb9 (wrote `docs/v2/evidence/MODEL-STUDY/blind-quality-review.md` over 24 cases / 72 samples, verdict exploratory and model-only), the pre-v2 UI strays 02edb6b0 and the prior orchestrator 86720f2. Children of the archived orchestrator were verified still active after archiving, so no running writer was interrupted.

Committed the previously untracked model-study and Claude-import evidence (execution, results, fable-execution, blind quality review, both independent audits, the Fable addendum, the import feasibility/prototype reports and the two `scratch/` prototype trees). The blind review's headline numbers: gold coverage 341/498, 26/72 samples complete, 13/72 with a demonstrated critical invention; three instrument defects recorded for any future round. The Fable addendum records the cumulative repair-pass count (15 against a cap of 2) and the arm-G identity defect; no comparative statement about Fable is publishable yet.

Model executor 490ebfe continues the released G Track1 batch (72 case-runs) and the six-arm refine rerun (144 case-runs), each invocation gated on model identity before the next.

### 2026-09-28 — two owner decisions drafted, two refuted verdicts corrected

Docs lane 08f72a08 drafted `state/S2.6-CATALOGUE-AMENDMENT-PROPOSAL.md` (PROPOSED AM-063) and `state/P4.1-FOURTH-ATTEMPT-PROPOSAL.md` (PROPOSED AM-064); no tests, builds, network or git writes were run in that lane, and it is archived after processing.

Coordinator verification before putting either to the owner: `installer/src/readiness.ts:116-134` already wraps `decodeURIComponent` in try/catch and fails closed, so P4.1's defect is confined to the probe's `queryKeyNames` (`scripts/v2/probe-redirects.mjs:196`) and its evidence record, not to the shipped downloader guard. `LanguageDialog.tsx:105,109` print both lines unconditionally, `es-MX.ts:1231` holds `'Inglés (Estados Unidos)'` against `en.ts:1676`'s `'English (United States)'`, and no test pins the differing value. Both load-bearing claims hold.

Corrected two coordinator-owned verdicts that the V1 failure refutes: `reviews/S2.6-postUI-ir.md:8` ("clean by construction, not by suppression") and `reviews/UI-BATCH2-review.md:519-527` (the dialog suppresses the duplicate line at `LanguageDialog.tsx:95`). Both relied on a drop rule removed by the owner's 2026-09-27 change in `14076b8`. Annotations appended; the reviews' other content stands. `state/BLOCKED.md`'s P4.1 row now records the narrowed consequence.

Added proposal §8: the card's "Do not remove the Settings row" line now contradicts the owner's UI-BACKLOG #9, so the reconciliation is put to the owner in the same decision rather than left as drift. No card, contract, acceptance row, threshold, guard or ALLOWED entry changed; nothing implemented.

### 2026-09-28 — S2.6 AM-063 instruction review CLEAR; implementation held on the UI lane

Second-pass reviewer c358d470 returned CLEAR (0 blocking, 0 major, 11 minor) and independently confirmed the first pass's blocking finding resolved **in the card text**: at 8cb3ecf the Settings row and `openSettingsModal` are still present, the card now says so, assigns the removal and retarget to the UI owner, and makes an unlanded commit produce a not-run V1. Both prior verdicts that called the dialog clean by construction were already annotated as refuted.

Two post-CLEAR edits closed what the reviewer found, both strengthening and neither widening scope: a **fifth** named route by which V1 could report green with the dialog never opened (`use.appLocale` on the es-MX Playwright projects turns `checkScreen` into a no-op, and no vitest row can see it), and the **reversed-direction trap** — `en.ts` is writable under AM-054/AM-059, and editing it instead of `es-MX.ts` would green both V15 and V1 while leaving the defect on screen, so the card now names the direction as non-interchangeable and V16 as the only row that catches it. V17 was added as the negative control for V15, with commands and required exit codes, replacing prose that had neither. No post-CLEAR edit loosened a check, so no third review was opened.

Implementation remains **held**, not blocked on a decision: the UI owner has 35 files uncommitted including `shared/src/i18n/es-MX.ts`, one of the two AM-063 paths. Coordinator is not committing or editing another agent's in-flight work. P4.1's second-pass review is still running; P4.1's files are disjoint from the UI lane and can be implemented as soon as it clears.

### 2026-09-28 — P4.1 attempt 4 implemented, coordinator-verified, independent review dispatched

Author d11a89c7 returned attempt 4 against base c3433ac. Coordinator read the probe diff (+22/−1: one new `decodeQueryName` helper and one changed call site, nothing else) and confirmed scope is exactly four non-UI paths, with no `installer/`, `eslint.config.js`, `ACQUISITION.md` or dependency change and no network request.

Independent reruns, coordinator's own exit codes: V1 exit 0 (13 files / 206 tests, `readiness.test.ts` collected, so the 12/130 tripwire is cleared rather than silently unreproduced); lint exit 0; V4 exit 0 (18/18). **The negative control was rerun by me, not accepted from the author:** reverting the single call site gives exit 1 with 3 of 18 failing and `URIError` present, the file's SHA-256 is identical before and after restoration, and V4 returns to 18/18. V4 is therefore not vacuous. V2 was not run by the author or by me; the existing `redirects.md` is unmodified.

Two of my own card errors were caught by review before dispatch and are corrected: the refusal array has two entries, not three (the host is the `domainRule` boolean, and there is no `host_not_allowed` verdict), and the "every fixture is derived" claim became false with the new loopback literal, so correcting the test file's header comment is now part of the attempt. Both would have produced a test asserting against code that does not exist.

Committed b2c3287 and pushed. **P4.1 is not approved on this evidence** — an independent implementation review is dispatched against c3433ac..b2c3287 and must re-run V1, V3 and V4 and inspect V2. Open and carried: DEF-2 untouched, the `redactQuery` fragment/path/user-info gap as a named follow-up for its own card, and RUN-CONFIG §4's hostname-bar ruling awaiting a coordinator decision.

### 2026-09-28 — P4.1 attempt 4 independently APPROVED

Reviewer 05e1a210 returned APPROVE with no blocking finding, re-running every row from the committed state via `git archive` into a self-contained scratch tree rather than from the dirty shared tree. V1 exit 0 (13 files / 206 tests), V3 exit 0, V4 exit 0 (18/18), V2 correctly NOT RUN. The negative control was performed independently and **can** fail — exit 1, 3 of 18 failing, `URIError` at the decode — with scratch, `git show` and working-tree digests all equal and `git status --porcelain scripts/` empty afterwards. Three claims were verified by execution rather than by reading the assertion: the two-refusal plus `domainRule: false` shape, that V3 remains a real check (proved by making a vendor literal fail the rule in scratch), and zero crashes across 18 crafted inputs.

**P4.1 is APPROVED.** Attempt budget is 4 of 4 and there is no fifth: any further change is a new card.

Two findings were against evidence text rather than code, and both were mine: the diff line counts were taken from counting a hunk instead of from `git diff --numstat` (`+22/-1` and `+105/-6`, not `+23/-1` and `+112/-7`), and a `defusals` typo. Both corrected.

One method finding is kept deliberately: **V3 cannot be re-run in the shared tree** while another agent's work is uncommitted, because symlinking the repository's `node_modules` makes `@apunta/shared` resolve to the stale dirty `shared/dist` and typecheck then fails on committed files. A self-contained scratch tree is the only trustworthy way to run that row right now, and the next reviewer should not chase a failure that is not the card's.

Carried forward, neither blocking: DEF-2, and the `redactQuery` family of gaps — user-info, fragment, path, and a query name that decodes to a backtick or newline being written raw into the evidence markdown. All need their own card and the owner's authorisation; none is load-bearing for this attempt. The RUN-CONFIG §4 hostname-bar ruling remains open for the coordinator.

### 2026-09-28 — coordinator rulings: evidence hostname bar, and P3.1's D1/D2 applied

**Ruling on RUN-CONFIG §4's hostname bar** (raised by the P4.1 attempt-4 return and left open for the coordinator; recorded here rather than by editing `RUN-CONFIG.md`, because contract wording is the owner's under COORDINATOR §6). §4 requires evidence to be sanitized — sandbox paths to `<sandbox>`, home to `~`, and "never include hostnames, usernames, keys, tokens or real names". Read in context, the prohibition is on **this machine's identity**, which is what the surrounding substitutions exist to protect. A vendor CDN host already recorded in `ACQUISITION.md` §1 is acquisition evidence rather than a disclosure: it is public, already committed, and the pinned hosts are the card's subject matter. So recording an observed redirect host in `docs/v2/evidence/P4.1/redirects.md` is **permitted**; recording `os.hostname()`, a login name or a home path is not, and remains a FAIL. P4.1's evidence already depends on this reading and is approved on it. If the owner reads §4 more strictly, the fix is a redaction column in the evidence writer, not a change to what the probe observed.

**P3.1 instruction-review findings D1 and D2 applied** (`b4977bc`), both strictly inside AM-058's existing scope — no file added to May edit, no threshold, guard or contract touched.

- **D1:** the version-elimination check could not fail. The value assertion cannot discriminate, because `server/package.json` is `0.0.0` and both readers fall back to that same literal; and an esbuild that inlines the read as an object literal travels with the bundle, taking the path strings with it, so a path grep passes while the metadata still ships. The card now requires a source-shape guard (`typeof __APUNTA_VERSION__ === 'string'`, never a bare reference, because `declare const` is erased by type stripping) and a two-token bundle fingerprint — `createRequire` occurs in exactly two files repo-wide and `"@apunta/server"` in zero files under `server/src` or `shared/src`, while being that package.json's `name`. A non-zero count is FAIL.
- **D2:** the broken-copy ownership proof demanded a `testRunId` the card cannot add, because the boot-error app hard-codes its health response and `boot-error.ts` is outside May edit. Resolved with a stronger proof and no waiver: ownership is established from the data-folder lock the process itself writes — pid, and `processStart` equal to field 22 of `/proc/<pid>/stat` for that same live pid, read **while the process is alive** since a clean release unlinks it. That compares a kernel identity rather than an environment echo, and the lock cannot have been written by a foreign process because the folder is the wrapper's own `0700` run directory. The missing-SQLite assertions are kept and this is added to them.

**D3 remains open and is the owner's**, because it adds a file to May edit: `eslint.config.js` needs one line, `'build/**'` in the existing `ignores` block, or `npm run lint` will lint the multi-megabyte generated bundle at `build/linux-resources/server/server.mjs`, which no ignore covers and which the card cannot exclude. Generated output only; no rule or threshold changes.

### 2026-09-28 — P3.1 corrections logged as AM-066 and both dispatches rebuilt

Second-pass reviewer 180ae17e returned DEFECT with a **blocking delivery failure that was mine**: the attempt-1 corrections had been applied to `docs/v2/cards/P3.1.md` only. Both dispatch files still carried all three original defects verbatim — the unpassable `createRequire` fingerprint, the false "cmake is absent on this PC", the false "checkpoint does not exist" — and no amendment had been logged, which COORDINATOR §3.3 forbids in as many words. A reviewer reading the dispatch, which is what an implementer reads, would have got the defective instructions. The reviewer also noted the correction was missing the V4 row and all six fixes.

Now logged as AM-066 with the provenance stated, and both dispatches rebuilt at `eed1211`. The false tool claim was additionally reworded so the correction note does not restate it in the present tense — a mechanical check and a hurried reader can both mistake a correction for the card's position, and the first rebuild still tripped exactly that.

Also closed in this pass, from the same review: the ownership residual now requires the listening socket on the test port to be owned by the spawned pid, since the lock proves our process holds the data folder but not that our process is the HTTP responder; the greps' claim is scoped to what they actually prove (metadata not inlined, not the read textually absent, with the surviving unobservable case named); the side-effect harm is bounded by the clone-reuse fact; and line cites stale through three review rounds are refreshed.

The reviewer disagreed with the bar on one point and said so explicitly: the surviving-read case is a false *pass* on unreachable code, never a false *fail* on correct work, so it is not blocking. That judgement is recorded rather than overridden.

### 2026-09-28 — P3.1 attempt 1 returned BLOCKED on a real missing package; partial work committed

Author 3654285d returned `BLOCKED`, correctly. `cmake` 4.4.3 and `glslc` 2026.3 are present and `hipcc` is absent exactly as AM-066 F2 states, but **`glslc` alone does not make the `vulkan` backend buildable** — the SDK headers are needed as well, and `find_package(Vulkan)` fails on `Vulkan_INCLUDE_DIR` alone. Coordinator verified the absence directly: no `/usr/include/vulkan/vulkan.h`, and `ldconfig` shows the loader present with headers absent. The author checked the tool before reporting, did not install anything (HS-3), and did not substitute the `cpu` backend to get a green row — which is the card's own instruction. This is the stop condition working, and it is a **new owner action**: `vulkan-headers`, filed in `OWNER-ACTIONS.md`.

The blocking work is real and verified, so it is **committed rather than left in a working tree**: two new scripts, `.gitignore` gaining `build/`, `eslint.config.js` gaining exactly one line (`'build/**'`, confirmed as a single-line diff — the author removed its own explanatory comment to stay inside AM-065), and the AM-058 version resolution in the two readers. Coordinator read that diff and re-ran the checks independently: lint exit 0, the two version test files 15/15. The `typeof` guard and the preserved lazy fallback are both present and correct.

**Two things deliberately not accepted as results.** V3 and V4 are `NOT RUN`: the implementer's diagnostic run (28/28, relocated, bundled Node, no host Node) is not a card row, and it used a self-identifying stub for `whisper-cli`, so `whisper-cli --help` is unverified. V1 and V2 are `BLOCKED` at exit 1. The card is not closeable on this evidence and is not recorded as such.

**One coordinator decision, disclosed:** the implementer added `--banner:js` to the esbuild invocation, which the card does not list, and asked for a decision rather than slipping it in — the right behaviour. Without it the bundle dies at load with a dynamic-`require` error from esbuild's CommonJS shim, so the card's own objective is unreachable without it. That is a build flag inside a script this card creates, not a contract or file-scope change, so it is within the coordinator's authority to add. Recorded as AM-067 with the reasoning, rather than left as an undisclosed deviation.

**Flagged, not actioned:** `scripts/package-mac.sh` builds a bundle of the same shape with the same flags and no banner, so it likely carries the identical latent defect. It is P6.1's file and outside this card; recorded as a follow-up there.

### 2026-09-28 — model study: corrected Fable results land; executor closed; tree cleaned for the UI lane

The serial executor (490ebfe) closed and archived itself, leaving 157 lines of uncommitted results in `docs/v2/evidence/MODEL-STUDY/fable-execution.md`. Those are now committed together with the nine outstanding review files, which clears the working tree of everything but the new UI agent's own work.

**The corrected arm-G measurement, with model identity verified on every model-bearing request and a gate run after each of the 24 invocations before the next: 24 of 24 invocations passed, 0 contract failures.** The headline the owner was given earlier and retracted is now replaced by a real one.

| Metric (eval, 60 case-runs each) | Fable 9B (G) | 4B baseline (A) | 9B Q4 base (C) |
| --- | --- | --- | --- |
| fabrication rate | 15.0% (9/60) | 15.0% (9/60) | 25.0% (15/60) |
| gated runs | 18/60 | 9/60 | 15/60 |
| **no note produced at all** | **9/60** | **0/60** | 0/60 |
| owner-format fabrication | 0.0% (0/12) | 0.0% (0/12) | 0.0% (0/12) |

Runtime and output: Fable 9.3 s median per run against the 4B's 2.1 s, 701 output tokens against 189, and 24 of 75 requests ended on the length ceiling rather than `stop`. On the corrected refine set Fable was 24/24 while the 4B-with-thinking arm managed 9/24.

**What this does and does not support.** It removes Fable's earlier disqualification, which was an artefact of the 4B running by mistake. It does **not** make Fable the default: it matches the 4B on the automated fabrication cue, is 4.4× slower, returns nothing at all in one run in six, and truncates a third of its answers. The cue metric is phrase-based rather than adjudicated, and the blind quality review already measured its limits (68.5% gold coverage, demonstrated cue false positives), so "same fabrication rate" is a weak signal in both directions. **Qwen 3.5 4B remains the recommended default**, now on measured rather than assumed grounds.

**The retraction step is a real caveat, recorded not buried:** the 1 388 → 3 811 transcript expansion previously attributed to Fable was the *baseline's*. Real Fable expands to 1 749 characters and proposed 3 corrections where the 4B proposed 11. Writer-message equivalence across arms is therefore not claimed, because that preprocessing step is itself model-driven.

**Cumulative repair count: 15 against a cap of 2, not reset.** Thirteen were the executor's own and unprompted. The root cause it names is building against an interface it inferred instead of checking it — which is the same failure I made twice on P3.1 this session, and the honest read is that this harness punishes inference. The one control that demonstrably fired was a gate catching its own wrong path.

**Also recorded, and a genuine environment problem rather than a card defect:** the repository's Playwright expects `chromium_headless_shell-1234` and this machine has only build 1243, so `npm run e2e` cannot launch as written. The project's own RUN-CONFIG escape hatch (`PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium`) works, which is how the UI agent is driving a browser, and no card row needs changing — but any future e2e evidence that omits that export is not trustworthy.

### 2026-09-29 — branch retired; S2.6 and P3.1 in parallel; P4.5 authored

The owner fast-forwarded `feature/v2` into `main`, then directed that the branch be deleted and all work continue on `main` (AM-068: HS-4, D1, COORDINATOR and CLAUDE.md updated; the local and remote branch are deleted). The stale P4.1 BLOCKED entry in PROGRESS.json is corrected to APPROVED. P3.1's V4 row had unescaped pipes that failed check-plan; they are now escaped (AM-069). The idle earlier orchestrator agent, "Astra-Orchestrate", was archived at the owner's request.

Owner-chosen launch: S2.6 (attempt 2, port 7833) and P3.1 (attempt 1 resume, port 7834; the Vulkan headers are now present) are dispatched in parallel. Their file sets are disjoint and both are told to leave work uncommitted. S4a.2 is queued behind P3.1's whisper build so its speech timings stay clean. The owner authorized a follow-up card for P4.1's carried-forward DEF-2 and `redactQuery` gaps. It is being authored as P4.5 by a separate agent and then goes through instruction review, implementation and independent review in turn. The Atkinson font amendment is deferred by the owner.

### 2026-09-29 — S2.6 attempt 2 returned, P4.5 card authored, P3.1 already pushed

A previous orchestrator ran out of session mid-review. This entry records what
was checked, not what was merely reported.

**P3.1 — committed and pushed by its own implementer as `c4a364f`.** That is
off-protocol: COORDINATOR §7 has the coordinator stage explicit paths *after* the
return is checked and reviewed, and the brief has subagents leave work
uncommitted. The commit is already public, so it cannot be unsent; what remains
is the implementation review, which now runs against that head. All four rows
(V1, V2, V4, V3) are PASS against a **real** whisper-cli, closing the earlier
stubs, and the cold build was re-verified from a deleted tree with a
byte-identical `whisper-cli` (`3a9f516d…804de`) — reproducible, not merely
green. I re-ran the cheap gates myself rather than take the return's word:
`lint` exit 0, `typecheck` exit 0, `check-plan.mjs` exit 0, `bash -n` clean on
both packaging scripts. I did **not** re-run V1–V4: they need a full cold
whisper build, which is precisely what the implementation review is for.

Three substantive fixes, each a bundle that looked complete and was not:
whisper's shared objects now sit beside the binary (the old separate `lib/`
produced a binary whose `RUNPATH $ORIGIN:` could not resolve them, so it could
not start — and `patchelf` is no longer needed at all); the manifest records
each path as it is at that path, killing 13 byte counts a verifier could not
reproduce; and the stop-condition report reads the missing tool out of the build
log instead of asserting `vulkan.h`, which had gone stale and then named the
wrong tool. Host runtime libs stay out on purpose, `libvulkan.so.1` above all,
so the bundle needs a host Vulkan driver — a real deployment property the install
guide must state.

**S2.6 attempt 2 — returned, verified, not approvable.** The AM-063 repair is
correct and minimal: one value in `es-MX.ts`, one test pinning all four language
names byte-identical across the catalogues, one es-MX-provider dialog case, and a
stale header comment corrected. That comment claimed the repeated English line
is dropped; the production file renders both unconditionally and the case
directly beneath it already asserted the print, per the owner's 2026-09-27
change — so the comment was the defect, not the code. I re-ran `build:shared`
and both touched test files: 32/32. V15/V16/V17, this attempt's substance, pass.

V1 and V3 fail on a pre-existing `page.goBack()` defect in the UI owner's
`language-control.spec.ts`, reproduced with the catalogue reverted to base. That
file is not in May-edit and §6 forbids the coordinator widening a May-edit list,
so **no attempt number fixes it** — it needs a new card, which §6 also reserves
to the owner. Recorded in `BLOCKED.md`; S2.7, S2.8, S2.R and the Spanish chain
stay held.

**P4.5 — card authored, not yet implemented.** Two files of May-edit, a
negative-control V3 whose expected result is exit 1, and Findings `none`
(P4.1's items were internal review findings, not R-numbered external ones, so no
`TRACEABILITY.md` row moves). `check-plan.mjs` passes at 65 cards.

**Two authoring defects I corrected rather than committed (AM-071).** The P4.5
author's `AM-070` row had all of `AM-069`'s row spliced onto its tail, giving it
9 fields where its neighbours use 3 and a final column that read as a
contradictory second copy of AM-069. Separately, committed `AM-069` itself
carried two *unescaped* pipe pairs, so it also parsed as 7 fields. Both rows now
parse as written; no substance changed, and `check-plan.mjs` does not read that
file, so nothing downstream had been reading the difference.

**Also reverted:** four committed PNGs in `evidence/P2.2/screenshots/` that the
e2e line had rewritten at sizes contradicting the sizes recorded in
`evidence/P2.2/v1-e2e.md:184-187`. Noted, not fixed: even the *committed* PNGs
disagree with that record (27967 vs 28038 recorded) — a pre-existing
discrepancy inside an already-approved card's evidence.

**Not done, and deliberately:** I did not mark P3.1 or S2.6 APPROVED. Both need
a separate implementation review first, and I will not be the reviewer of a card
whose implementer I am checking in the same context.

### 2026-09-29 — three owner decisions, and one that turned out not to be needed

**AM-072, S2.6 gets a narrow May-edit line.** The owner chose the amendment over
a separate card, on the AM-063 precedent: that amendment already widened this
same card for a single key and a single test file, so the route existed. The
gloss that made it necessary is worth recording — `e2e/tests/language-control.spec.ts`
was *already* inside the card's `e2e/tests/*.spec.ts` glob, but that permission
is qualified "language-aware assertions", and a `goBack()` history step is not
one. So the file was never out of reach; the fix was simply outside what the
permission described. Licensed: that one case's navigation sequence. Fenced with
the same emphasis: the other assertion in that file is not licensed, the case
count must not fall, the assertion may not be weakened to accept `about:blank`,
and `PatientsColumn.tsx` is not licensed because the link target is right and
the test's route is what is wrong.

**P2.2's byte-count mismatch: logged, nothing fixed.** The owner chose to leave
an approved card's evidence alone. `evidence/P2.2/v1-e2e.md:184-187` records
the four colour-test PNGs at 28038/26342/24781/24743; the committed files are
27967/26226/24781/24743. Two of four disagree, in illustrative screenshots that
no gate reads. Recorded here so it is findable, and deliberately not corrected —
editing the evidence of an approved card is the thing the evidence exists to
prevent.

**"IN REVIEW" was already in the plan, spelled `SUBMITTED`.** The owner asked for
a status that tells the truth about a card that is implemented and awaiting its
independent review, rather than the `NOT STARTED` I had left in place.
`RUN-CONFIG.md` §Status words has defined `SUBMITTED` for exactly that all along,
alongside `IN PROGRESS`, `CHANGES REQUESTED` and the rest — so no fourth value
was invented and no schema changed. `COORDINATOR.md` step 8 now says which state
each word means and when to use it, because the gap was never in the vocabulary,
it was in nobody writing down that the vocabulary already covered it. P3.1 and
S2.6 are `SUBMITTED`. Dependants correctly stay held: `build-dispatch.mjs`
refuses on anything that is not `APPROVED`, which is exactly the behaviour
wanted while a review is in flight.

### 2026-09-29 — P3.1 APPROVED on an independent cold re-run; one finding carried, not closed

An implementation review by a sub-session that did not write the change: V1, V2,
V4 and V3 all exit 0, and the rows were re-run **cold** — `build-vulkan/` deleted
first, 2m43s, 139 shader TUs from nothing. The `whisper-cli` it produced is
byte-identical to the implementer's (`3a9f516d…804de`), so cold reproducibility
is now independently confirmed instead of self-reported. 8 findings, none
blocking. **36 cards APPROVED.**

The three claims I told the reviewer to press on all held under measurement, and
the second one is the strongest part of the implementation: V2's negative case
genuinely discriminates, because a loadable addon is *still present* in
`prebuilds/` and `APUNTA_SQLITE_BINDING` is authoritative, so the 503 is caused
by the rename alone rather than by a bundle that could never have loaded.

**Finding 1 is carried, not closed, and it is the one that matters.** V2 cannot
detect a truncated `web/dist` — the single thing its SPA check exists to detect.
All three checks in `test.sh:429-448` inspect only `GET /`, and the truncation is
invisible at the HTTP layer because `server/src/app.ts:155-164` answers any
unmatched non-`/api` GET with `index.html`: the missing script returns **200
text/html, not 404**. A real bundle and a bundle with no JavaScript and no fonts
at all are indistinguishable to this row. The card fixed this check, so the
implementer built what was asked; the defect is the return's implication of
coverage, and the card's green does not close it.

**The reviewer's suggested homes for it do not hold, and I checked rather than
passing it on.** It proposed carrying finding 1 to P3.5 or P6.1. But only
P3.1's own card may edit `package-linux-resources.test.sh`, and P3.5 is WebKitGTK
audio while P6.1 is Mac/Windows bundles — neither can edit that file, nor
`server/src/app.ts`. So it has no home in the current plan and needs a new card,
which §6 reserves to the owner.

**And no production change is needed, which the review over-stated.** It wrote
that the fix "also needs the static handler to stop answering 200 text/html for
unmatched asset paths". It does not: the reviewer's own positive control returns
`application/javascript` and 169523 bytes for a real asset against `text/html`
for a missing one, so a single content-type assertion on the hashed asset that
`index.html` references catches the truncation by itself. `app.ts` stays
untouched.

Two more things recorded rather than fixed, both from the review: the A06 fetch
is **unconditional**, so it repeats every run and the build is not hermetic
(the A06 record calls it "one request this session"); and `$WHISPER_LOG` is
removed only in the failure branch, so 38 logs leaked in `/tmp`.

**A dispatch defect that was mine.** The review dispatch was built with
`--head c4a364f`, then two other cards were committed before the reviewer
started, so `HEAD` was `e705953` and the dispatch's own
stop-if-HEAD-is-neither-base-nor-head precondition did not hold. The reviewer
stopped, confirmed `c4a364f` is an ancestor and that no file it assessed
differs, said so plainly, and proceeded — which is the correct handling. The
fault is mine for issuing a head-pinned dispatch and then committing on top of
it.

Sandbox servers on 7861 and 7807 remain from other sessions. Not touched by
anyone: reaping another session's state is precisely the error P3.1's own
implementer recorded in its `/tmp` incident. Port 7717 is not listening, so the
live instance is unaffected.

### 2026-09-29 — S2.6 review FAILs V1/V3, and finds the guard that passes by asserting nothing

Review verdict **FAIL**: V1 and V3 exit 1. The review re-ran the implementer's
control itself (exit 1, identical message, identical line) and then *measured*
the mechanism instead of inferring it — `history.length` stays 2 across the
`<Link to="/">` click and lands on `about:blank`, while the sibling route goes
2→3→`/settings`. Not a flake, not a race. It also found the whole-project run
cannot even exhibit the defect, because `mode: 'serial'` means
`language-control.spec.ts:385` is *skipped* rather than run at base.

V15, V16 and V17 — this attempt's substance — all PASS, V17 on both halves.

**Finding 3 is the most consequential thing in either review, and I verified it
from source rather than only from its measurements.** `expectNoEnglishUi`
(`e2e/support/no-english.ts:156-174`) has **no requirement that it read any
strings at all**: it reads 0, finds 0 leaks, and `expect(leaks).toEqual([])`
passes vacuously. It even *annotates* the count — "N strings read" — and nobody
ever asserted on it. Measured: `settings-appearance.spec.ts:52` reads 0 strings
in 3 runs of 3, while the other 32 calls read 5–99.

The chain, confirmed in code:

- `web/src/App.tsx:100` puts `.route-transition` on the per-path re-keyed
  wrapper; `web/src/styles/motion.css:52` animates it with `rise-in`, which
  starts at `opacity: 0`.
- `no-english.ts:127-129` uses `checkVisibility({ checkOpacity: true })`, so an
  element at opacity 0 counts as **hidden** and the whole subtree is skipped.
- Playwright's `toBeVisible()` — the assertion immediately before every
  `checkScreen` call — does **not** consider opacity.

So the preceding assertion passes while the guard reads nothing. This is a
different class of defect from P3.1's finding 1: that one is a test that cannot
pass; this is a guard that **can** pass and proves nothing, on the exact
property this card exists to establish. `language-control.spec.ts:441,444`
share the exposure, and those are es-MX calls.

**A tension inside the review that I am recording rather than smoothing over.**
Finding 4 counts 33 `checkScreen` calls across 14 es-MX tests, all reporting 0
English, and calls that proof the guard "demonstrably fired". Some of those
calls are the 0-**string** ones, where 0 English is vacuously true. The evidence
for the substantive part of V1 is weaker than the review states.

**Good news on scope: no new amendment is needed.** Both `e2e/support/
no-english.ts` and `e2e/support/fixtures.ts` are **already** in this card's May
edit, so requiring a non-zero read — and waiting out the transition — is in
scope for attempt 3 alongside AM-072's `goBack()` licence.

That sets up the owner's decision, asked separately: attempt 3 is the **last of
three**. Fixing only `goBack()` would let V1 go green while `checkScreen` still
asserts nothing on every screen reached by navigation — a green that proves
nothing, which is more dangerous than a red row because it retires the question.

Also recorded: the dispatch told the implementer the UI owner's retarget had not
landed, and it has — my error, and AM-072 landed mid-review, after that
dispatch was built, so the reviewer's licence to fix `goBack()` post-dated its
instructions. It did not apply it, correctly. And the review flagged one wrong
line reference in the implementer's evidence: the click is `:422`, not
`:423-425`; the mechanism and line 426 are right.

### 2026-09-29 — P3.7 filed for P3.1's finding 1; and prettier has never checked a line of this plan

**P3.7 exists**, owner-authorised, for the one thing P3.1's review said not to
let pass silently: V2 cannot detect a truncated `web/dist`, because all three SPA
checks inspect only `GET /` and `server/src/app.ts:155-164` answers a missing
asset with `200 text/html` rather than 404. `check-plan.mjs` exits 0 at 66 cards.
P3.6 and P3.R now depend on it, so the gap closes before the Linux install path
and before the milestone review.

The card is one file and one check, and it says why the tempting fix is wrong.
May edit is `scripts/v2/package-linux-resources.test.sh` alone; `server/src/app.ts`
is in **Must not edit** with the reason — the fallback is product behaviour, and
the content-type assertion catches the truncation without touching it. The card
adds: *an implementer who thinks the fallback "should" change is doing a
different card.* That is the sentence that will save the attempt.

Two design details worth keeping. The tripwire is self-verifying: V1 expects
**29** `PASS` where the base file prints 28, so a run printing 28 proves the
check is missing without anyone reading the diff. And "plausible length" is
pinned to the bundle's own `manifest.json` `bytes` for that path rather than to
a constant, so no threshold is invented and the content type remains the
discriminator. V3 is the negative control — expected exit **1** — and it damages
the bundle, restores it, and proves it byte-for-byte with `sha256sum -c` before
exiting.

The author also declined to edit `MILESTONES.md`, correctly: `plan-lib.mjs`
`parseMilestones` derives a parent review's dependencies from its child list, so
P3.R picks P3.7 up automatically. Verified in the regenerated file rather than
asserted.

**Now the part that indicts me.** `.prettierignore` contains `*.md` and
`docs/v2/state/`, so `npx prettier --file-info docs/v2/cards/P3.7.md` returns
`{"ignored": true}`. Every "All matched files use Prettier code style!" I
printed this session on a markdown file was **vacuous — zero files checked.** That
includes my own `prettier --check` on `AMENDMENTS.md`, `cards/S2.6.md`,
`ORCHESTRATION-LOG.md`, `NEXT-SESSION.md` and `BLOCKED.md`, where I reported the
check as evidence. It never was. `npm run lint`'s prettier step has never
checked a line of this plan, and that is consistent with the repo rather than a
defect: the markdown here is hand-wrapped at ~80 columns and is not
prettier-formatted. The plan's *real* gates are `check-plan.mjs` and the table
field counts, which is why the AM-070 splice mattered and a prettier pass would
never have caught it. The card author was right to say so rather than let me
rely on it.

Two line references checked rather than trusted: `build/` is at
`.gitignore:55`, so P3.1's review's `:50` was wrong and the card is right; and
AM-074 is 5 fields, consistent with the header and with AM-071..073, though the
author described it as 3 in its summary.

### 2026-09-29 — S2.6 attempt 3 implemented; two owner decisions recorded, one deliberately deferred

Attempt 3 fixed both defects. The navigation fix leaves via `new-patient`, a
route that actually pushes a history entry, so `goBack()` has somewhere real to
return from and still loads no document. The guard fix is the one that matters:
`arrivedStrings()` keeps reading while it has read nothing (5s ceiling), and
`expectNoEnglishUi` asserts a non-zero read **before** the leak assertion, naming
the screen and the count. So `0` is a failure and it says so — the message states
the thing that was true before, that "0 English" on a screen which read nothing
is not a result.

Coordinator verified the invariants rather than the summary, because each one is
a way this could have been a green meaning nothing. `checkVisibility({ checkOpacity:
true, checkVisibilityCSS: true })` is **byte-identical to base** — the diff only
*adds comments* explaining why narrowing it was refused, which is the fix AM-073
exists to prevent. `ALLOWED` still holds exactly two keys. Case count 12 before
and after, with both `test.skip` markers pre-existing and byte-identical (they
are the legitimate project-scoping skips, not a screen dropped). The non-zero
assertion lands ahead of the leak assertion, not after it.

All 33 es-MX `checkScreen` calls now read non-zero — 13 follow a route change,
`settings-appearance`'s Home among them, 0 before and 13 now — and 38 of 38 across
both es-MX projects, smallest read 5, **no screen needing an exemption**.

The implementer also ran a control nobody asked for: with the wait scratch-removed
and the assertion kept, `settings-appearance.spec.ts:52` reads 0 and **fails**, exit
1. That reproduces the previous review's measurement from the other end and settles
its reservation that the cause might not be only the transition opacity. It is the
strongest evidence in the return.

**AM-075 retires V7** on the owner's decision, satisfied by its already-recorded
evidence: the UI owner removed the accent picker, so the property V7 guarded is not
on screen and the code that implemented it went with it. **The card's verification
table is amended on the review's return, atomically with any approval, and not
before** — editing an acceptance row while an implementation review is running
risks contaminating an independent judgement, and the reviewer must stay free to
confirm for itself that the picker is gone.

**AM-076 accepts the staggered-entrance residual.** The wait stops at the first
non-zero read, which is right for the wrapper but not for staggered entrances
(`rise-in` delays to 144ms, `backwards` uses a fill mode), so a screen whose text
lived entirely inside a staggered subtree could read 0 again. The failure mode is
safe — it would fail loudly with a named count, not pass quietly — and a proper fix
needs a stability rule that is a behavioural decision neither AM-073 nor the
coordinator may make. A possible flake later is a much better thing to have than
the false green this attempt removed.

While writing those two rows I truncated `AMENDMENTS.md` to two lines: `open(p,'w')`
was evaluated before the read in the same expression, so the file was emptied before
it was read. Caught immediately by the field-count check, restored with `git
checkout --`, and rewritten. Recorded because the amendment log is a governance
record and a silently truncated one is the same class of defect as AM-070's splice,
which is why the field count is checked at all.

### 2026-09-29 — S2.6 APPROVED; 37 cards, and the Spanish chain is released

The attempt-3 review is a **PASS with no blocking and no major finding**, from a
sub-session that did not write the change. S2.6 is APPROVED and
`S2.7 → S2.8 → S2.R` release, with S3.2, S3.R, S5.1–S5.7, S6.1 and P5.3 behind
them. **AM-075's deferred amendment is now applied**: V7 is retired in the card's
verification table, its command and expected result preserved as history, having
waited for exactly the confirmation it was waiting on.

**The three-arm experiment is the thing to keep.** One variable, one screen:

| arm | exit | outcome |
| --- | --- | --- |
| base guard | **0** | `Home — 0 strings read, 0 English` — the defect, reproduced |
| head, wait removed | **1** | fails at `no-english.ts:229`, `Expected: > 0 / Received: 0` |
| head as committed | **0** | `Home — 13 strings read, 0 English` |

That is the difference between a guard that *is present* and a guard that *bites*.
Run against a scratch `e2e/` tree outside the repo, which was never edited for
the experiment. The coordinator had only the implementer's word for this before;
now the base behaviour is measured too, which is what makes the fix's value
legible rather than asserted.

The reviewer verified the forbidden fix was **not** taken rather than inheriting
my check: `checkVisibility` byte-identical to base (only its line number moved,
131→138), `ALLOWED` the same two keys with the same values, `fixtures.ts` and
`playwright.config.ts` byte-identical, and the only deletions in the whole `e2e/`
diff being four lines inside the single case AM-072 licenses.

**All 38 es-MX `checkScreen` calls are non-zero with 0 English**, read off the
reporter's own annotations rather than a summary: 33 across 11 spec files, min 5,
max 191, none 0, plus 55/55/62/13/13 in `es-MX-language`. The previous review's
finding 4 — whose evidence had been weakened by 0-string calls — is fully
repaired. The reviewer also noted seven counts differing upward from the
implementer's, all non-zero, which is the signature of a wait settling at
different moments rather than of disagreement.

One honest overstatement it caught in the card itself: V1's "every screen" is
really 33 calls over 11 of 17 spec files. Nothing reads 0, so the row's substance
holds, but its wording claims more coverage than it has. Recorded, not rewritten
— an acceptance row's wording is the owner's, and this one no longer blocks
anything.

Two residuals carried, neither fixed: **AM-076**'s staggered-entrance gap, where
the failure mode is loud rather than quiet, and a pre-existing theme flake at
`settings-appearance.spec.ts:63-64` seen once in five full runs, which the
reviewer confirmed this change cannot cause.

### 2026-09-30 — S2.11's instruction re-review: seven findings closed, two new ones, and nothing else in the plan can move

The re-review of S2.11's repaired card (`state/reviews/S2.11-ir2.md`, base
`2c59659`, after AM-102) came back with every first-round finding confirmed
closed — D1's third focus move, D2's blind scope check, and notes N1 and N3
through N6 — and `DEFECT` on two rows it had not been asked about. Case (c) is
the same class of mistake as the D1 it repaired, in the neighbouring case the
repair did not touch: it asserts on `document.activeElement` without draining a
frame, and the focus move it is asserting happens *inside* one
(`App.tsx:269-274`), so it would be red on a correct implementation. D2 is the
older, quieter one: V7 runs the screenshot spec and, unlike V5 and V6, never
restores the PNGs, so the very next row asserts something untrue. I checked
both against the code before recording them.

Neither is a judgement call about scope, behaviour or thresholds; each is one
sentence and one command clause. But COORDINATOR §3 step 3 spends its one
re-review at this point, so S2.11 is `BLOCKED` and the decision is the owner's
— the same shape as P3.3's parking (AM-084) and S2.9's second repair
(AM-089/AM-090). Worth stating plainly for whoever picks this up: S2.11 is the
**only** card in `DEPENDENCIES.md` whose dependencies are all `APPROVED`, so
until it moves the plan has nothing else to dispatch. Its implementation attempt
budget is untouched — 0 of 3 — because no implementer has ever seen this card.

### 2026-09-30 — S2.11's instruction review is finally clean; the coder is one command away

AM-103's two repairs went in exactly as authorised (`806f889`, 13 insertions and
8 deletions in one file, two hunks): case (c) gained the frame-drain discipline
that case (b) already had, and V7 gained the screenshot restore that V5 and V6
already had, with V8's expectation reworded to name three commands instead of
promising three restores. The repair agent chose the longer of the two forms the
review offered for D1 and said why, which is the right call — the shorter form
would have meant rewriting case (b). I re-indented the eleven lines it re-wrapped
to the card's own five-space continuation, since the content was right and only
the wrapping was not.

The final review (`state/reviews/S2.11-ir3.md`) is **ten `CLEAR`, no `DEFECT`,
no `UNKNOWN`**, and it says an implementer could execute the card as written
without guessing on any of the ten questions. It also checked the thing that
mattered most: narrowing the block to a genuinely second window does not weaken
the single-window guarantee, because the two assertions that carry it are gated
on the takeover and decline buttons, neither of which renders during
`'acquiring'` — so they read a settled `'secondary'` by construction, not by
timing margin. Thirteen notes are carried, none blocking; the one worth a future
card is its first, where decision 2's `phase === 'secondary'` should read
`needsRefresh`, because read literally at the guard it is always false and that
mistake is D1's shape in a new place.

S2.11 is `IN PROGRESS` with attempt 1 unspent. It remains the plan's only
dispatchable card.

## Orca continuation — S2.11 submitted, 2026-10-01

Owner approved implementation, independent review and subsequent S2.R using default effort/variant. Run `run_268ce685a92c`; implementation dispatch `ctx_14a81d9909e6` returned succeeded and was released. Confirmed model opencode-go/space-bunny-free. Scope diff checked; coordinator build:shared and App.primaryWindow/App tests exit 0, 83 passed. Implementation commit `1488c2a` records all eight author-reported PASS rows, including five full e2e runs. Independent review pending; S2.11 is SUBMITTED, not APPROVED. Review ports 7824/7825 and CI 7826/7827. Stale comments in App.test.tsx and AddPatient.tsx remain recorded findings outside May-edit. S2.R waits for approval.
