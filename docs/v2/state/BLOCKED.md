# Blocked cards

**Regenerated 2026-10-02 from `PROGRESS.json` after `reviews/blocked-md-reconciliation.md`.** The previous file was
**exactly inverted**: all 14 of its rows named cards that are `APPROVED`, while every card genuinely `BLOCKED` was absent,
so a fresh session reading it would have concluded the opposite of the truth. Those 14 rows are deleted, not archived — a
spent blocker is not evidence. Two rows that were never closed (P4.1, P3.3) asserted that P3.3 was parked and its
prerequisites uninstalled; both are false, P3.3 is APPROVED and A03 went in on 2026-10-02. One `RESOLVED` line cited
AM-038 under P4.1 when AM-038 is an S4a.1 row; P4.1's real resolution is AM-042. **Rows are generated from status, deleted
on resolve, and never carry a `→ RESOLVED` follow-up line.**

## Blocked

S3.3a | Attempt2 implementation independently reviewed with no candidate defects. V1-V5 PASS, 48 tests and 26 adversarial checks; V6/V7 NOT RUN under existing owner quiet-machine hold. V8 shared-tree sweep FAIL attributed to coordinator/other-card docs; isolated candidate interval9 paths within scope, supplementary proof only. | docs/v2/state/reviews/S3.3a-impl2.md; docs/v2/evidence/S3.3a/review-2/COORDINATOR-SCOPE.md | Await existing quiet-machine hold lifted; run V6/V7 on isolated port7841 with real model, no fake, and reconcile scope-row base/shared-tree evidence before approval. No source repair needed. Build lease released. | S3.3

P5.3 | Production BLOCKED, with two independent causes: (a) the P3.3 dependency, plus contracts and ownership that are drafted but unadopted; (b) the dirty pre-quiesce disconnect preservation/recovery gap, which must close before production safety is accepted. The bounded synthetic v3 protocol proof was accepted after independent review and a coordinator AST-equivalence check, and the checkpoint records that the proof is not the production card. | `docs/v2/state/cards/P5.3.json`; `docs/v2/state/reviews/P5.3-protocol-proof-v3.md`; `docs/v2/state/proofs/P5.3-protocol-proof-v3.mjs` | **Owner** answers the three grouped protocol choices in Part A of `docs/v2/state/P5.3-AMENDMENT-PROPOSAL-v2.md`: Choice 1 the client channel and decisively A2 the authorisation of `POST /api/app/quiesce` against C-BRIDGE@1 rule 3 (recommended (iii): ungated, maintenance released when the last window unregisters); Choice 2 what a non-empty registry does at entry and where the unsaved-text guard lives; Choice 3 the write boundary. A2 additionally needs a C-BRIDGE@1 rule 3 clause plus the C-UPD@1 mirror, which is a contract change reserved to the owner. | P5.4, P5.R
S6.1 | Production BLOCKED on a licence election no agent may make. L-POLICY@1's one pre-approved exception permits Spanish dictionary data under an MPL option **only if the election is stated**, and it does not authorise an agent to state it. Two further owner items sit behind it (Exhibit A attribution; a bundled May-edit widening). The accepted bounded assets proof explicitly authorised nothing. | `docs/v2/state/cards/S6.1.json`; `docs/v2/state/S6.1-AMENDMENT-PROPOSAL-v2.md` §11; `docs/v2/state/S6.1-NOTICE-PROVENANCE.md` | **Owner** answers the §11 package. Item 1 (blocks the card): record MPL-1.1, data only, at 2.0.0 in `docs/decisions.md` — recommended, the only route to a Mexican dictionary — or elect another arm of the tri-licence, which needs an `ACQUISITION.md` §3 amendment, or decline, in which case S6.1 stays BLOCKED and nothing breaks. Item 2 (blocks the notice): adopt the upstream Initial Developer attribution and record the two unevidenced Exhibit A fields as `[unknown]` — recommended — or decline the notice. Item 3 (blocks the card): approve one bundled May-edit widening. | S5.R, and through it S5.1-S5.7

## Held — cleared, not dispatched, not blocked on any decision

P3.4 | IN PROGRESS, attempt 6: native V2 PASS 20/20; AM-199 authorizes only decoded V3 and full V4 static completion, now running. Original V3 BLOCKED/V4 FAIL retained. | docs/v2/state/cards/P3.4.json; attempt-6 runtime and static-completion-runtime | Independent frozen evidence review and coordinator decision after completion; no native repeat or seventh attempt. | P3.6, P3.R


## Also recorded elsewhere, not here

- **S3.2** attempt 1 returned FAIL / partial implementation; status is `CHANGES REQUESTED`. AM-171 cleared repair attempt 2, undispatched pending existing owner quiet-machine hold. Counter remains 1 consumed until dispatch. U-1 and U-2 owner decisions remain settled; never pull an already-present model (HS-3/A08).
- **S4a.2** is owner-parked while being dependency-clear, so a tool reading only `PROGRESS.json` would treat it as dispatchable. The plan has **no vocabulary word for "parked by the owner"** — that gap is put to the owner rather than solved here.
