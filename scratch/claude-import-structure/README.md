# Claude direct import — lane 2: structure

Research spike, 2026-09-27. Bounded by `docs/research/claude-direct-import-feasibility.md`
(work lane 2). This directory is the **only** thing this lane writes besides
`docs/research/claude-import-structure-results.md`. Nothing here is production
code, nothing here is imported by `server/`, `web/` or `shared/`, and nothing here
is committed.

## What this lane owns

A **direct** import path replaces "the owner exports a zip" with "a small browser
extension captures the conversations". That moves the hard question from
*extraction* (lane 1) to *structure*: something — in the intended design, Claude
reading the captured conversations — turns raw chat into patient records, and
that something is a language model writing clinical prose.

This lane therefore builds the three artefacts a structuring step needs, and the
deterministic tests that say whether they are safe:

1. `src/capture.ts` — the input contract. The shape lane 1's extraction must
   produce for this lane to be testable at all (the seam is stated in the
   results doc and is **not** verified here).
2. `src/proposal.ts` — a **versioned** import proposal format. Every note in it
   is a set of *references into the capture* (message id + quoted span), never a
   generated body, plus a session date with its evidence. The text is recomputed
   from the source; a proposal that paraphrases is rejected, not imported.
   `src/keys.ts` derives the session and note keys, always, so a replay is
   byte-identical and a proposal cannot name its own key.
3. `prompts/claude-preparation-prompt.md` — the preparation prompt the owner
   would paste, and the version id and digest the proposal records so a proposal
   can always be traced to the instructions that produced it.
4. `src/validate.ts` — the deterministic validator: source-reference integrity,
   original-text preservation, rolling three-calendar-month **inclusive**
   eligibility computed from **session dates** (never chat dates), same-name
   ambiguity, unknown dates, revised notes, and embedded instructions in chat
   text. `src/dates.ts` holds the calendar arithmetic (month-end clamping, IANA
   zone day resolution, bilingual date reading) and `src/injection.ts` the lint
   that keeps quoted text from reading as a brief.
5. `src/dry-run.ts` — a proposal mapped onto Apunta's *existing* import contract
   (`ClaudeImportReportSchema` in `shared/src/import.ts`) **without writing
   anything**, plus the deduplication and undo plan. This is what produces the
   integration delta in the results doc. `tests/production-seam.test.ts` is the
   one place this lane reads production source: it checks that the provenance line
   this lane writes is one the shipped `importedKeys` can read, and that this
   lane's re-derived branch rule equals the shipped `liveThread`.

## The two claims this lane refuses to make

- **No Claude was run.** No model inference, no account, no cloud, no tokens.
  Every proposal in `fixtures/proposals/` is **hand-authored**. A hand-authored
  proposal passing validation says the *format and the validator* work. It says
  nothing whatsoever about whether Claude can produce a valid proposal, and the
  results doc reports Claude semantic performance as **NOT RUN**.
- **No live-site anything.** No browser, no Claude account, no exporter source
  executed against a signed-in session, no real export, no port 7717, no preview
  on 7867/7868, no server started at all. Every test here is pure functions over
  synthetic JSON.

## Data

`fixtures/capture/corpus.json` is **synthetic and independently authored**: twelve
fabricated conversations, in English and Spanish, with fictional people
(`E2E-*`-free names invented for this spike: Ana Ruiz, María López, Diego Ramos,
Tomás Ibarra, Petra Vogel, and two unrelated personal chats). No text from the
prototype's sample practice, no real patient material, no real export shape beyond
what `docs/agents/M11-claude-import.md` records as *inferred*.

`fixtures/expected/corpus.json` is the label file: the eligibility, identity
mapping, coverage and decision counts a reader should get from the corpus,
written down **before** the validator was run, so the tests compare against an
independent expectation rather than against the implementation's own output.

## Running it

Isolated on purpose: its own vitest config, no workspace project, no new
dependency, and not part of `npm test`.

```sh
cd /home/villenull/Projects/Apunta
npx vitest run --config scratch/claude-import-structure/vitest.config.ts
TZ=UTC npx vitest run --config scratch/claude-import-structure/vitest.config.ts
TZ=America/Mexico_City npx vitest run --config scratch/claude-import-structure/vitest.config.ts
TZ=Australia/Sydney npx vitest run --config scratch/claude-import-structure/vitest.config.ts
TZ=America/Denver npx vitest run --config scratch/claude-import-structure/vitest.config.ts
```

All four zones must give identical results: every date decision in this lane uses
an IANA zone passed in the proposal's `context.timezone`, never the machine's.

The typecheck, which `npm run typecheck` does not reach because this is not a
workspace:

```sh
npx tsc -p scratch/claude-import-structure/tsconfig.json
```

Results, criterion by criterion, with the evidence and the outstanding NOT RUN
items: `docs/research/claude-import-structure-results.md`.

## Adversarial proposals

There is no `fixtures/proposals/adversarial.json`. The bad proposals are built
by editing the gold one, one defect at a time, in the test that names the defect
(`tests/source-integrity.test.ts`, `tests/preservation.test.ts`,
`tests/identity.test.ts`, `tests/injection.test.ts`, `tests/keys-revisions.test.ts`,
`tests/eligibility.test.ts`, `tests/coverage.test.ts`). A stored bad proposal
freezes one particular corruption; a mutation says exactly which single thing was
broken, so a failure names the defect instead of a diff.
