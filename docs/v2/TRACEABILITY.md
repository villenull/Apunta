# Traceability: review findings R01 to R20

Source: `apunta-v2-plan-review.md` (external review, 25 September 2026).
Confidence labels are carried from that review; "verified" means the plan
editor re-checked the claim against the repository snapshot. A finding is
not implemented because its row says "accepted"; the execution status column
is filled from evidence by Q1.3.

| Finding | Disposition | Rationale and evidence | Owning cards | Contract | Tests | Prerequisite | Execution status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| R01 setup and speech dependency cycle | accepted | The earlier plan had P4 before S4 and S4 depending on P4 (plan editor's own error). New order: S3 → S4a (no setup dependency) → P4.3 consumes the selection → S4b.1 proves integration. | S4a.2, P4.3, S4b.1 | C-STT@1 | S4a.2 V1-V3; P4.3 V1; S4b.1 V1-V5 | S3.R, P4.1 | NOT RUN |
| R02 live-install exposure | accepted | Verified: Playwright reuses servers outside CI; check scripts default to 7717; recovery verify opens the live DB. | P0.3, P7b.1 | C-ISO@1 | P0.3 V1-V5; P7b.1 V2 | none | NOT RUN |
| R03 model policy disagreement | accepted | Verified in `shared/src/models.ts`, `installer/src/plan.ts`, `server/src/eval/cli.ts`. | P1.4, P0.4, P4.3 | C-MODEL@1 | P1.4 V1; P0.4 V1-V3; P4.3 V1 | P0.R | NOT RUN |
| R04 ports, identity and data ownership | accepted, modified | Modified: production uses a fixed port with no fallback (E5), because the web app keeps state in `localStorage` per origin; the shell trusts only its child's stdout (C-BRIDGE), not a health poll. | P3.2, P3.3, P0.3 | C-OWN@1, C-BRIDGE@1 | P3.2 V1-V2; P3.3 V3-V5 | P1.R | NOT RUN |
| R05 native security boundary | accepted, modified | Modified: instead of scoping Tauri commands, the web page gets **no** Tauri IPC at all (E3). A project report says Tauri ≥ 2.11.1 treats `http://127.0.0.1` pages as remote for IPC, which makes the no-IPC design the simplest safe choice. Tauri pinned ≥ 2.11.1 (GHSA-7gmj-67g7-phm9, verified). Boot-error server covered by C-REQ. | P1.3, P3.3, P3.4 | C-REQ@1, C-BRIDGE@1 | P1.3 V1-V2; P3.4 V1-V3 | P0.R | NOT RUN |
| R06 update, flush, backup, migration protocol | accepted | Verified: `openDatabase()` migrates immediately; startup applies restore before open. | P5.2, P5.3, P5.4, P5.5 | C-UPD@1 | P5.2 V1; P5.3 V2-V4; P5.5 V1-V4 | P5.1, P3.2 | NOT RUN |
| R07 language meaning for documents and jobs | accepted | Owner decided (D11): existing content keeps its language; switching blocked during work. | S2.1, S2.6, S4b.1, S5.1-S5.5 | C-LANG@1 | S2.1 V2-V4; S2.6 V2-V3; S4b.1 V4-V5; S5.4 V1 | S1.R | NOT RUN |
| R08 Spanish evaluation covers instrument and product | accepted | Verified: eval calls the provider directly; `dictation-10s.wav` is a tone. Held-out split, controls, pipeline mode added. | S3.1, S3.2, S3.3, P3.5, S5.6 | C-EVAL@1 | S3.2 V1-V4; P3.5 V2-V3; S5.6 V1-V3 | S1.R, S2.R | NOT RUN |
| R09 no cosmetic beta pass | accepted, strengthened | Owner decided (D12): all of Spanish is held until every gate passes, stricter than the review's default. Owner is the clinical reviewer (D13). | S5.6, S5.7, Q1.2 | C-ES-GATE@1 | Q1.2 V1 | S5.6 | NOT RUN |
| R10 settings cache | accepted | Verified: `SettingsProvider` loads once and only exposes `reload`. | P1.1, P1.2 | C-SETTINGS@1 | P1.1 V1-V3; P1.2 V1-V2 | P0.R | NOT RUN |
| R11 redirect validation | accepted | Verified: `redirect: 'follow'` in `installer/src/download.ts`. | P4.1 | C-ACQ@1 | P4.1 V1-V2 | P1.R | NOT RUN |
| R12 speech-model readiness | accepted | Verified: `fileIsPresent` checks `size > 0`. | P4.1 | C-ACQ@1 | P4.1 V1 | P1.R | NOT RUN |
| R13 Windows data folder | accepted | Verified: installer has no win32 branch. | P4.2, P6.1, P6.3 | C-PATH@1 | P4.2 V1 | P1.R | NOT RUN |
| R14 backup snapshot consistency | accepted | Source-backed, not reproduced; P5.1 tests first and keeps the test either way. | P5.1 | C-SNAP@1 | P5.1 V1-V2 | P1.R | NOT RUN |
| R15 runtime and native addon tuple | accepted | Verified: `.nvmrc` 22, mac packaging Node 24.19.0. Decision E1. | P0.1, P3.1, P3.6, P6.1 | none | P0.1 V1-V4; P3.1 V1-V3 | C0.1 | NOT RUN |
| R16 reuse the installer protocol | accepted | Verified: the installer already emits JSON lines with resume (plan editor's own error in the earlier P4). | P4.4 | C-ACQ@1 | P4.4 V1-V5 | P4.3 | NOT RUN |
| R17 executable download and licence policy | accepted | Single manifest (ACQUISITION.md) and L-POLICY@1. Added: AppImage-bundled LGPL system libraries need owner review before public distribution. | P1.5, S1.3, S1.5, S4a.1, S6.1 | L-POLICY@1 (in ACQUISITION.md) | S1.5 V2; S6.1 V4 | none | NOT RUN |
| R18 audit must not republish private data | accepted | Raw findings only in a restricted folder outside the repo; committed report redacted; refreshed after v2. | P7a.1, P7b.1, P7b.2 | none | P7a.1 V2-V3; P7b.1 V1; P7b.2 V1-V2 | C0.1 | NOT RUN |
| R19 release artifacts, privacy, keys | accepted | Verified: updater ≥ 2.10.0 supports AppImage, Deb, Rpm; AppImage chosen (E4). Manifest excludes unverified targets; action pinned by SHA; test keys only in the sandbox. | P5.4, P5.5, P6.2, P6.3 | C-UPD@1 | P5.4 V3-V4; P6.2 V1-V3 | P5.3 | NOT RUN |
| R20 i18n and acceptance wording | accepted | Distributed across cards; each row of the review's table maps to a card: catalogue boundaries (S2.3-S2.5), codes (S2.5), "no English" tests (S2.6), dates (S2.2), zones (P0.2), AI coverage (S5.5 V3), speech budgets (C-STT), spell-check race (S6.1), brand tests (P2.2), clinical review (S5.7), native tests (P3.5), coordination (COORDINATOR.md), iteration bounds (S5.6), report statuses (templates). | P0.2, P2.1, P2.2, S2.2-S2.8, S5.4, S5.5, S6.1 | C-LANG@1 | per card | varies | NOT RUN |

## Parts of the review not adopted as written

- **Target of 800 to 1,500 words per card.** Cards here are shorter
  (150 to 600 words) and rely on quoted contract excerpts that
  `build-dispatch.mjs` inserts, so the dispatched text is usually within
  that range.
- **Pasting source excerpts into every card.** Muse Code can read files, so
  cards name exact files and line ranges ("Known facts") instead; the
  instruction reviewer checks the facts still match (IR-03).
- **"Do not ask the owner again."** The plan editor asked the owner directly;
  D11 to D14 are the owner's answers, not provisional defaults.
