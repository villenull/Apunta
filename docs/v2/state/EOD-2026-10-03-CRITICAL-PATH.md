# EOD 2026-10-03 — critical-path analysis (read-only)

Owner objective: "100% working Apunta on this Omarchy setup by END 2026-10-03
Mexico City (2026-10-04 05:59 UTC)". This file is analysis only. It crosses no
owner boundary and grants nothing. Effort figures are **estimates**, labelled.

Scope note: the new deadline does **not** override the explicit boundaries.
P3.4 attempt 5 is failed with **no 6**; P3.5 has exactly the one AM-194
attempt 4; S3.2 / S3.3a keep their quiet-machine holds; S4a.2 stays
owner-parked; P5.3 protocol and S6.1 licence boundaries hold; the live v1
data folder / port 7717 stay untouched. This analysis does not reopen any of
them.

Evidence: `docs/v2/evidence/eod-2026-10-03/artifacts-readiness.txt` (sanitized
paths/metadata only).

## 1. Verdict — does the core daily product already work?

**Functionally, almost certainly yes for the English path; formally, no.**
The daily workflow is shipped code (M0–M13, CI green, real-stack evidence in
`docs/HANDOFF.md`), and the Tauri desktop wrapper around it is largely
APPROVED (P3.1, P3.2, P3.3, P3.7, P3.8, P2.R). What is missing is not the
feature set but **two acceptance rows and one integration proof**:

1. **P3.4** (CSP / IPC security) is BLOCKED at an exhausted budget. Its V3
   invariant PASSes (`invoke_handler`/capabilities absent), V1 CSP unit PASSes,
   and V2's five containment assertions PASS — but V2(a) (the card asserts
   `typeof` of Tauri globals that the pinned stack injects unconditionally) and
   V2(b)/(c) (a synthetic click that does not land) FAIL / NOT RUN. The
   coordinator's own diagnosis calls (a) a likely **card defect**, not a tree
   defect.
2. **P3.5** (WebKitGTK mic containment) is IN PROGRESS at attempt 4. The
   AM-194 patch is independently **SOURCE CLEAR** and runtime **READY**; V0–V5
   are **NOT RUN**, so containment in the shipped binary is unproven.
3. **P3.6** (AppImage integration) has **never run**. Its ten in-AppImage
   flows are the only thing that would prove the whole workflow *inside the
   real desktop artefact*, and no production-identity AppImage exists on disk
   (only `Apunta (test)_0.0.0_amd64.AppImage`).

So: a launchable English desktop build is plausible today from APPROVED code
(P3.3 proves real-AppImage launch, bundled-server lifecycle, single-instance
and clean shutdown, with containment), but **"100% working" cannot be asserted
from approved evidence**, because the in-AppImage end-to-end proof (P3.6) and
the two security/mic rows are open. This is an acceptance gap, not a
known functional failure.

Not achievable: all 83 cards. Spanish (S1–S6) is gated by D12/C-ES-GATE and
the owner's clinical review; first-run setup (P4.3/P4.4) depends on the
Spanish selection (S4a.R); updates (P5.4/P5.5) depend on P5.3/P3.R; Mac/Windows
(P6) is out of scope. Do not pretend otherwise.

## 2. Observable daily-workflow map (Omarchy / Wayland)

Status = strongest **approved** evidence, not code presence.

| Stage | Shipped code | Approved evidence | Gap for "100% working" |
| --- | --- | --- | --- |
| Desktop launch (Wayland) | Tauri shell spawns bundled node server, ready-line handshake, splash, error screen | P3.3 V3–V5 PASS (real AppImage, real bundled server, containment, single-instance) | Only **test**-identity image built; no production image; Wayland-specific not asserted |
| Relaunch / single instance | `tauri-plugin-single-instance`, data-folder lock | P3.3 V5 PASS | Window-focus read NOT RUN (no WM under xvfb) |
| Sandbox fabricated patient | v1 workspace + AddPatient | M0–M13, P1, P8 APPROVED | Never driven inside the AppImage (P3.6) |
| Real local speech → text | whisper.cpp `tiny.en`, live preview + final transcript | v1 real-stack; P3.5 attempt-3 V3 BLOCKED on harness classify | P3.5 attempt-4 V0–V5 NOT RUN; `tiny.en` known to mishear ("scratch that") |
| Draft / refine | Ollama `qwen3.5:4b-q4_K_M` + four refine locks | v1 eval reports; model gate closed (keep 4B) | None new; no Mac/clean-OS claim |
| Save / reopen / persistence | P1 save integrity, migration 007, WAL | P1 APPROVED | In-AppImage not driven |
| Export / Finish & copy | v1 copy path | v1 saved-note UI proof | In-AppImage not driven |
| Backup / recovery | `/api/backup`, staged restore, storage-boot 503 | P2 APPROVED, P5.1/P5.2 APPROVED | Restore-tested UI in AppImage unproven; P5.3 protocol BLOCKED |
| Privacy / security | server CSP, IPC unreachable (no capabilities), egress guard, no runtime network | P3.4 V1/V3 PASS, V2 containment PASS; HS-1/6 | P3.4 V2(a)/(b)/(c) FAIL/NOT RUN; P3.4 not APPROVED |
| Shutdown | quit ladder (shutdown → SIGTERM → SIGKILL) | P3.3 V3 PASS | None |

## 3. Critical path to an APPROVED English desktop product

Order and dependencies (from cards + PROGRESS):

1. **P3.5 attempt-4 runtime** — the only item that is ready *now*. Source
   CLEAR, readiness READY. Needs: root regenerates the dispatch
   (`build-dispatch.mjs P3.5 --base "$(git rev-parse HEAD)" --attempt 4
   --attempt-exception AM-194 --port 7837`), delegates sole checkpoint
   writer, and launches the once-only serial runtime worker (build + V0–V5).
   Est. 0.5 h build + 1–2 h rows → P3.5 APPROVED if it passes.
2. **P3.4 closure** — needs one owner decision (§4 D1). Without it, P3.6 and
   P3.R cannot be dispatched.
3. **P3.6 AppImage integration** — depends P3.4, P3.5, P3.7 (APPROVED), P2.R
   (APPROVED). Once both clear: dispatch, two builds, ten flows. Est. 3–5 h.
4. **P3.R parent review** — L2+L3, re-runs P3.3 V3–V5, P3.4 V2, P3.5 V2–V3,
   P3.6 V3. Est. 2–3 h.

P2.R is already APPROVED, so it is not on the path. Spanish, setup and updates
are off the English critical path but the plan's "100%" needs them.

**Honest budget under 7.5 h:** P3.5 APPROVED plus P3.6 in flight is plausible.
P3.6 APPROVED plus P3.R APPROVED is **tight to unlikely**, and it assumes the
P3.4 decision lands in the first ~15 min and nothing flakes. "All 83 cards" is
not reachable and must not be claimed.

## 4. Shortest concrete owner decisions

**D1 — how to close P3.4 (the true blocker).** Options:
- **(a) [Recommended] Amend + accept-with-disclosure.** Amend the card's V2(a)
  to assert IPC *reachability* (what C-BRIDGE@1 rule 4 actually forbids) rather
  than the `typeof` of always-injected globals, and record V2(b)/(c)
  click-through as disclosed `NOT RUN`. No runtime rerun, no sixth attempt.
  Fastest route to unblock P3.6/P3.R; the coordinator already concluded (a) is
  a card defect.
- (b) Grant one bounded harness-only amendment attempt to make the synthetic
  click land, then a single V2 re-run. More faithful, more time/risk.
- (c) Park P3.4: P3.6/P3.R stay blocked; product remains test-image only.

**D2 — scope of "100% working" for this deadline.** Options:
- **(a) [Recommended] English-only desktop product**: desktop launch/relaunch,
  sandbox patient, real local speech→draft/refine, save/reopen, export,
  backup/recovery, privacy, shutdown. Explicitly defer Spanish (S*), first-run
  setup (P4.3/P4.4), updates (P5.4/P5.5), Mac/Win (P6). This is the only scope
  that can plausibly land.
- (b) Include updates (P5) — adds P5.3→P5.4→P5.5 after P3.R; not achievable.
- (c) Include Spanish — blocked by the owner gate and quiet-machine holds; not
  achievable.

**D3 — P3.5 runtime window.** AM-194 already grants the single attempt 4, and
the readiness review reports the host safe and idle (no build lease, ports
7837/7839 free, no model needed, synthetic + virtual PipeWire source). Likely
**no new decision**; confirm only if the owner wants to reserve the machine.

## 5. Minimal bounded work executable now (no new boundaries crossed)

Root only; no runtime by this analysis.

1. **Integrate the two P3.5 returns**: commit the untracked
   `P3.5-impl4.md`, `P3.5-runtime4-readiness.md`, `evidence/P3.5/attempt-4/**`;
   archive both workers.
2. **Regenerate the P3.5 attempt-4 dispatch** and delegate the sole checkpoint
   writer, then launch the once-only runtime worker. This is the single ready
   acceptance item.
3. **Prepare (do not run) the P3.4 owner question** as D1, and the scope
   question as D2, in one interview.
4. **Prepare the P3.6 dispatch** (do not generate until P3.4/P3.5 APPROVED —
   `build-dispatch.mjs` refuses while a dependency is unapproved).
5. While waiting: no other card on the English path is dependency-ready.
   Spanish, setup, updates and Mac work remain behind their gates.

## 6. Time budget (estimates)

| Window | Work | Owner |
| --- | --- | --- |
| 0:00–0:20 | Integrate P3.5 returns; regen dispatch; delegate writer; ask D1/D2 | root |
| 0:00–0:15 | Answer D1/D2 | owner |
| 0:20–2:30 | P3.5 attempt-4 runtime V0–V5 | runtime worker |
| 2:30–3:00 | Integrate P3.5 result (APPROVE if PASS) | root |
| 2:30–4:30 | P3.4 amendment + accept-with-disclosure (if D1a) | root |
| 4:30–7:00 | P3.6 dispatch + V0/V3/V1/V4/V5 (two builds, ten flows) | worker |
| 7:00–7:30 | P3.R start / status; honest end-of-day report | root |

Result likely by 05:59 UTC: **P3.5 APPROVED; P3.6 built or in flight**; P3.R
not fully APPROVED. A launchable English test/production AppImage is plausible;
a fully-approved P3.R and any Spanish/updates work are not.

## 7. What is actually missing (integration, not features)

- Production-identity AppImage never built (`Apunta_*.AppImage` absent).
- P3.6's ten in-AppImage flows never run.
- P3.4 V2 click-through unproven (card + harness defects).
- P3.5 capture containment in the shipped binary unproven (attempt 4 pending).
- `~/.local/share/apunta` absent on this box → no live v1 data here; a
  production launch would create a clean DB (or need P4.4 first-run).
- `.cache/v2-stt` absent (S4a.2 parked).

## 8. Boundaries observed by this analysis

No runtime/app/build/model/mic/audio/display/input/live `pactl`/server/DB/
network/install/system-config/port-7717 action; no personal text or DB read;
no credential/env dump; model files statted only; no download/acquisition; no
children, no questions. Writes: this file plus
`docs/v2/evidence/eod-2026-10-03/artifacts-readiness.txt` only, left unstaged
and uncommitted. No existing state/source file was edited.
