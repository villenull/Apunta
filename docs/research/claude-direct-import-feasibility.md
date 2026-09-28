# Claude direct import: bounded feasibility test

## Objective and scope

Test whether a therapist can avoid requesting a Claude export by using a
small browser extension, then optionally ask Claude to structure the captured
material. This is a research spike, not a shipping integration. The owner
authorized a plan and delegated tests. Existing production import behavior
and UI remain unchanged.

Select patients with an actual session within the previous three calendar
months (inclusive cutoff, explicit reference date and timezone). For each
qualifying patient, include their complete available note history across
matched conversations, regardless of note age or gaps. Chat update timestamps
alone cannot establish eligibility. Uncertain dates or identities require a
decision; do not silently merge people or silently exclude uncertainty.

## Work lanes

1. Extraction researcher: inspect public exporter source and browser docs;
   build an isolated extraction prototype and synthetic transport tests.
   Own only `scratch/claude-import-extraction/` and
   `docs/research/claude-import-extraction-results.md`.
2. Structure researcher: build synthetic labeled examples, a versioned import
   proposal format, preparation instructions for Claude, and deterministic
   validation tests. Own only `scratch/claude-import-structure/` and
   `docs/research/claude-import-structure-results.md`.
3. Coordinator: compare evidence against the criteria below and dispatch a
   fresh independent review after both handoffs. Real Claude browser and
   subscription trials remain explicitly NOT RUN until an isolated synthetic
   account/session is available; fixture success is not live-site proof.

## Tests and acceptance criteria

- Complete capture: inventory all synthetic conversation pages, then fetch
  every declared message/artifact page. Preserve IDs, timestamps, revisions,
  active branches and exact note text. Compare against independently authored
  expected counts and hashes. Missing or unsupported content must be visible.
- Resilience: pagination, long histories, empty pages, duplicates, interrupted
  runs, expired login, rate limits, changed response schema and partial failures.
  Failures must never produce an unqualified complete-import success.
- Identity and dates: English and Spanish examples; same first name for two
  patients; relatives mentioned in notes; multiple chats for one patient;
  a recent chat discussing an old session; old histories with multi-year gaps;
  exact cutoff and month-end boundaries; ambiguous dates; unrelated chats;
  one-session patients. Zero cross-patient merges in the labeled fixture set.
- Fidelity: prefer original message/span references to generated note bodies.
  Separate existing notes from newly generated drafts. Validate references,
  chronology and coverage, flag uncertain note versions, and reject invented
  source IDs or unsupported session dates. Conversation text is untrusted data,
  including embedded instructions that attempt to redirect the importer.
- Import handoff: demonstrate a proposal dry run without writing to the app;
  identify existing duplicate/undo mechanisms and required adapter changes.
  Replaying a proposal must have deterministic IDs and a testable dedupe plan.
- UX: document install, permission, sign-in, local pairing, preparation and
  confirmation steps separately. Report observed clicks only for an executed
  browser flow; otherwise report estimates. No cookie copying, terminal use,
  developer mode or extension pinning in the proposed therapist workflow.
- Claude assistance: distinguish a prompt/schema test from actual Claude
  account execution. Measure completeness and usage if an authorized synthetic
  trial becomes available; no claims that chat search enumerates all history.

## Boundaries and evidence

Read RUN-CONFIG and relevant import contracts first. Synthetic material only;
do not open any real export, browser profile, credential store, or patient DB.
Never contact port 7717 or disturb previews 7867/7868. No account creation,
store publication, dependency installation, cloud API billing or model
inference in this phase. Public documentation/source reads are allowed. Do
not run downloaded exporter code against a signed-in session. No GPU work.
Browser/app servers, if needed, must use the repository sandbox wrapper and
an available permitted port; report a constraint rather than bypassing it.

Keep prototypes isolated and dependency-free where possible. Agents do not
commit, push, modify production source, or spawn further agents. Preserve
other workers' files. Record exact commands, exit codes, fixture counts and
limitations. Each lane makes one implementation pass and at most one targeted
repair pass, then hands off PASS/FAIL/NOT RUN per criterion. No heartbeat or
status polling: completion and permission notifications drive coordination.

## Decision

Recommend proceeding only if offline extraction and validation are sound and
the remaining live-site assumptions are explicit. Shipping requires a real
synthetic-account browser trial proving account coverage, appropriate browser
permissions and local transfer, plus independent review. If the necessary
account/session is unavailable, deliver the tested prototype and exact test
procedure; do not present the account-wide workflow as proven.

## External-access finding, 2026-09-28

Coordinator read Anthropic's current Consumer Terms (page effective October 8,
2025), https://www.anthropic.com/legal/consumer-terms, section 3 items 4 and 7.
They restrict harvesting and automated access except through an API key or
explicit permission. The personal-account internal-endpoint extension has no
documented permission established by this study. This is a product/distribution
risk requiring clarification before promising or deploying the integration,
not evidence that the offline prototype is technically impossible. Research
remains synthetic/offline; a live personal-account trial also lacks an isolated
synthetic account. No outreach or account creation has been performed. Preserve
the prototype and finish its already-dispatched bounded progress/comment fixes;
do not treat user ownership of content as proof of provider permission.
