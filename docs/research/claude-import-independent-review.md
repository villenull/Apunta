# Claude direct import — independent review

**Reviewer:** an agent with no stake in either lane. **Date:** 2026-09-28.
**Subject:** `docs/research/claude-direct-import-feasibility.md` and its two
lanes, `docs/research/claude-import-extraction-results.md` (lane 1) and
`docs/research/claude-import-structure-results.md` (lane 2), plus the
prototypes under `scratch/claude-import-{extraction,structure}/`.

**Question asked:** can the smallest possible therapist workflow skip the
emailed Claude export, and is the completed research sound enough to take the
next step?

**Answer in one line:** the offline work is unusually honest and its reported
numbers all reproduce, but the two lanes are **not interoperable** and each has
one defect that would put the wrong words in a clinical record or would
silently truncate a patient's history — so the answer is **GO for a narrowed
synthetic live-browser trial, NO-GO for anything that claims a working direct
import, a store listing, or a proven import path.**

---

## 1. What this review did, and did not, do

**Did.** Re-ran both lanes' entire evidence under the pinned Node
**v24.19.0** (`~/.local/share/apunta-node/node-v24.19.0-linux-x64/bin`), not
the v26.8.2 both docs report. Read every source file in both trees, the shipped
importer, `shared/src/import.ts`, `shared/src/common.ts` and C-REQ. Built a
**minimal adapter** between the two lanes' formats and ran a synthetic
end-to-end — extraction → structure validation → the existing importer's dry run
— in memory, writing nothing to the repository. Ran five adversarial mutations
against lane 2's validator and two against the shipped importer. Verified all
eight code anchors both docs cite.

**Did not.** No Claude account, no live inference, no model, no GPU, no browser,
no extension build, no store publication, no dependency installed, no commit, no
push, no further agent, no real export, no browser profile, no credential, no
patient database. Port 7717 was never contacted; previews 7867/7868 were not
disturbed; no sandbox server was needed, so `docs/v2/RUN-CONFIG.md` §1 needed no
port. All scratch work lives in `/tmp/opencode/rev/`; the only file written in
the repository is this one.

**Not proven, and not claimed below:** that any of this has touched claude.ai;
that a live response has or has not carried fork links, edit times, artifacts or
pagination; that Claude can produce a valid proposal; that any Web Store review
would pass; that Anthropic's terms permit any of it (lane 1 deliberately did not
read them, and I did not either — that decision is still open and is a
precondition, not a detail).

---

## 2. Verification of the reported evidence

All commands from `/home/villenull/Projects/Apunta` under Node v24.19.0.

| # | Command | Exit | Result |
| --- | --- | --- | --- |
| 1 | `node --test scratch/claude-import-extraction/test/traversal.test.mjs scratch/claude-import-extraction/test/resilience.test.mjs scratch/claude-import-extraction/test/fidelity.test.mjs` | 0 | 59 tests, 59 pass |
| 2 | `node_modules/.bin/tsx --test scratch/claude-import-extraction/test/*.test.mjs` | 0 | 68 tests, 68 pass |
| 3 | as (2) with `TZ=UTC` / `America/Mexico_City` / `Australia/Sydney` / `America/Denver` | 0 / 0 / 0 / 0 | 68 pass each |
| 4 | `TZ=UTC npx vitest run --config scratch/claude-import-structure/vitest.config.ts` | 0 | 147 passed, 12 files |
| 5 | as (4) with `TZ=America/Denver` / `America/Mexico_City` / `Australia/Sydney` | 0 / 0 / 0 | 147 passed each |
| 6 | `npx tsc -p scratch/claude-import-structure/tsconfig.json` | 0 | clean |
| 7 | `npx eslint scratch/claude-import-structure` | 0 | clean |
| 8 | `npx eslint scratch/claude-import-extraction` | 0 | clean |
| 9 | `npx prettier --check "scratch/claude-import-extraction/**/*.{mjs,md,json}" "scratch/claude-import-structure/**/*.{ts,json}"` | 0 | all formatted |
| 10 | `npm run lint` (repo-wide, includes both lanes) | 0 | clean, `TOTAL 0` UI literals |

**Every claim I checked numerically reproduces exactly.** The extraction lane's
two file digests (`sha256:7e1e4d…` web-app, `sha256:714c5c…` compliance), 15/16
conversations, 84 messages, 21/27 requests, 2 declared artifacts with 0/2
captured. The structure lane's totals block, window `2026-06-27 … 2026-09-27`,
six patients, 12 new notes, the warnings, the blocker/reported split, and the
three alternative reference dates (`2026-08-31` → 4 patients, `2028-02-29` and
`2026-05-31` → none, with `clamped_from: 2026-02-31`). All eight `file:line`
anchors in lane 2 §5 are correct, including `DEFAULT_IMPORT_CUTOFF` at
`shared/src/import.ts:64`.

**Two notes on the reported evidence itself.**

- Lane 1 §3 records `npm run lint` (repo-wide) as exit 1, caused by a defect in
  *lane 2's* file, and says it left it alone. That is now exit 0 (row 10), which
  is consistent with lane 2 having fixed its own file. The two accounts agree.
- Neither lane is inside the repository's test surface. `vitest.config.ts`
  lists five workspace projects and `scratch/` is not one of them; `npm run
  typecheck --workspaces` skips it. Only `npm run lint` reaches them. **215 tests
  exist that no CI run and no `npm test` will ever execute** (see D12).

---

## 3. What is genuinely solid

Credit first, because most of it deserves it and the defects below are a small
part of the work.

1. **The evidence labelling is the best in this repository.** Lane 1 §1
   separates **Observed** (a document says it), **Inferred** (a falsifiable
   conclusion) and **Simulated** (shown against a synthetic account), and
   `SOURCES.md` §"What the absence of a field… does not mean" states in advance
   that a field missing from a documented schema is a gap in the *document* and
   says nothing about a live response. That is exactly the discipline this
   project keeps asking for, and it is why this review can be short on
   overclaiming: there is very little to walk back.
2. **The "no adapter change needed" claim is real and is proven the right way** —
   the unmodified shipped reader opens lane 1's file, and the capture is
   byte-identical before and after. I reproduced it. The shipped import screen
   already declares `accept=".zip,.json,…"` (`web/src/routes/Import.tsx:342`), so
   the file route is genuinely zero-change.
3. **The C-REQ claim is correct.** `originAllowed`
   (`server/src/http/request-guard.ts:100`) requires `http:` and
   `secFetchSiteAllowed` (`:118`) accepts only `same-origin`/`none`, so a page on
   `claude.ai` cannot push to Apunta. The file route really is the only one
   available without a production change. A push route would need native
   messaging, which `extension/NOTES.md` correctly identifies as requiring an
   installer-written host manifest.
4. **The failure taxonomy and the verdict gate are well built.** 23 resilience
   tests, each ending in a verdict; a non-`complete` run is never handoffable
   without a recorded acknowledgement; a corrupt checkpoint is refused rather
   than resumed. Reproduced: a signed-out inventory yields `blocked` and my
   adapter refuses the file.
5. **`session_key`/`note_key` are derived and compared, never trusted.** A
   hand-authored proposal cannot smuggle a key. This is the right design and it
   is what makes replay tractable.
6. **The re-derived branch rule is compared against production, not assumed
   equal** (`tests/production-seam.test.ts:77`). Re-derived precisely so the lane
   is not coupled to production, then asserted equal on all 11 conversations.
   That is the correct way to do it.
7. **A paraphrase sails through the injection lint, and a test says so**
   (`tests/injection.test.ts`, "is a lint, not a proof"). Recording the limit in
   the suite rather than the prose is the difference between a stated limit and a
   hidden one.

---

## 4. Prioritised defects

Severity is by risk to a clinical record or to the owner's decision, not by
effort. Every one below is reproduced; the command is in §9.

### D1 — P0 — A web capture that carries no fork links is reported **clean**, and the importer then splices the abandoned edit into the note

`normalizeWebAppConversation` (`scratch/claude-import-extraction/src/shapes.mjs:264`)
reads `parent_message_uuid` if present but **never asserts its absence**. The
compliance normalizer does assert it (`:473`, `parent_message_uuid:absent_in_this_mechanism`),
which is why that mechanism's manifest names the risk. The web fixture supplies
links, so the web manifest says nothing.

That matters because of the lane's own source. `SOURCES.md` §5, the public
exporter it cites for the web shape, lists the response as carrying `uuid`,
`name`, `created_at` and `chat_messages[]` with `sender`, `created_at`, `uuid`,
`content[]` — **and no parent link** — and its README concedes "branched
conversations … export the visible/main path only". If the live web endpoint
behaves that way, the capture is a flat visible path with no fork links.

Reproduced by stripping the links from lane 1's own output and opening it with
the unmodified shipped reader:

```
messages with a parent link in the fixture: 9 of 10
shipped importer: abandoned = 2 / 0        (with links / without)
  thread WITH links   : … c-john-a-s3-h2 c-john-a-s3-a2
  thread WITHOUT links: … c-john-a-s3-h1 c-john-a-s3-a1 c-john-a-s3-h2 c-john-a-s3-a2
  the abandoned reply is in the thread when links are absent: true
manifest gap codes from the fixture run: artifact_content_not_captured, non_text_content_not_captured
does anything flag "this mechanism did not carry fork links" for web-app? false
```

The abandoned reply is in the note, and the report now says `abandoned: 0` —
which reads as *nothing was lost*. This is the one failure the whole manifest
exists to prevent, and the gate is open on the mechanism the design depends on.

**Fix (one line, in the walker's favour).** Apply the same predicate
`liveThread` uses — "no message names a parent that is also present in the
conversation" — inside the web normalizer, and push the same drift marker. A
capture that cannot prove it carried forks then says so, and the verdict
becomes `complete_with_gaps` with a named gap. This also makes the NEXT trial's
answer to the most important open question usable (§10).

### D2 — P0 — The injection lint refuses ordinary clinical notes: any note containing "no risk" is rejected as a `safety_override` span

`src/injection.ts:97` and `:101`:

```js
/\b(?:no\s+risk|…)\b/     and     /\b(?:riesgo\s*[:=]\s*ninguno|sin\s+riesgo|…)\b/
```

Reproduced against `lintInjection`:

```
["safety_override::No risk"]    <- Risk: No risk indicators reported tonight.
["safety_override::no risk"]    <- Risk: no risk to self or others identified.
["safety_override::No risk"]    <- Assessment: No risk of harm; denies SI.
["safety_override::Riesgo: ninguno"] <- Riesgo: ninguno reported tonight.
["safety_override::sin riesgo"]  <- Plan: continue to monitor risk; sin riesgo hoy.
[]                               <- Subjective: Sleep six hours; intrusive thoughts daily for a fortnight.
```

On lane 1's realistic capture this is not theoretical: my hand-authored
proposal over `c-john-a` — a verbatim quote of Claude's own clinical note — is
rejected with `injected_span`, and the whole proposal fails. "No risk
indicators" is about as common a line in a therapy note as any, in either
language, and this app's own heading list (`COMMON_NOTE_HEADINGS`) contains
`Risk`, `Safety` and `MSE`.

The lane's negative set (`tests/injection.test.ts:62`) includes *"Risk: denies
risk of harm to self or others; no plan stated."* — which does not contain the
triggering substring — and the corpus note texts avoid it too. **The fixture was
written to avoid the false positive rather than to find it.** That is the
definition of a self-fulfilling test, and it is the most likely single defect to
reach production.

A second mismatch compounds it: the same file comments that "false positives
cost a decision rather than data" (`:80`), but `injected_span` is emitted at
**error** severity (`src/validate.ts`), so a false positive is a hard failure
with no override. Whatever the lint's ultimate fate, the severity should not be
error for a heuristic.

### D3 — P0 — A cross-patient merge validates cleanly. The identity guarantees are structural, not semantic

The preparation prompt calls a merge "the one error no later review catches", and
the test file says the same. So I built one: take the gold proposal, delete the
`maria_fernanda` identity, move her sitting onto `maria_lopez`, move her evidence
across, clear the now-dangling `same_name_as` and decision subject. Two distinct
patients, both named María, one identity.

```
MERGED OK = true
errors     []
decisions  ["date_needs_decision"]
patients 5 new_notes 12 identities 10
dry-run blockers ["unmappable:unknown_date"]
dry-run patient names ["Ana Ruiz","María López","Diego Ramos","Tomás Ibarra","Malcolm Reyes"]
sessions under the merged identity
  ['conv-maria-1/2026-06-26','conv-maria-1/2026-06-27','conv-maria-1/2026-08-01',
   'conv-maria-2/2026-08-12','conv-maria-2/2026-08-12']
```

Zero errors, zero identity decisions, both women's sittings under one patient,
and the same twelve notes written. A first attempt that left the dangling
`same_name_as` pointer was caught by `identity_key_unknown` — an artifact of my
mutation, not a semantic check.

`tests/identity.test.ts:116-131` ("one identity cannot absorb two people") tests
only merges where the absorbed person **keeps** her identity, so her evidence
ends up orphaned and `identity_evidence_outside_own_sessions` fires. The
realistic model failure is the opposite: a model reads one chat that mentions
two Marías and emits one identity. Then there is no second key to contradict
anything.

What the validator can prove is that a proposal is *internally consistent*: keys
resolve, evidence spans exist, each patient has a sitting in each conversation
where they have evidence, a relative is not promoted. What it cannot prove — and
nothing in it tries to — is that an identity corresponds to a person, or that
two identities are or are not the same person. `ambiguous_identity` fires when
the producer says "I am unsure", not when the producer is wrong. **Criterion 6's
"zero cross-patient merges" is a property of the hand-authored gold fixture, not
of the validator.** Treat it as NOT RUN for an untrusted producer.

### D4 — P1 — The eligibility window is a field the model supplies, and nothing bounds it

`context.eligibility_months` is `z.number().int().positive()` and
`context.reference_date` is any `YYYY-MM-DD`. The validator reads no clock
(deliberately, so results are reproducible), so there is nothing to compare
either against.

```
months=1200: ok=true  errors []  patients 7  new_notes 13   (was 6 / 12)
reference 2031: ok=true  errors []  patients 0  new_notes 0
```

No warning, no decision, no error in either case. A producer that widens the
owner's rolling three calendar months to a hundred years, or pushes the
reference date past every session and imports nobody, produces a **clean,
`ok: true` validation**. The owner's central rule is one unobstructed,
unauthenticated field in a document produced by an untrusted party.

**Fix is small:** bound `eligibility_months` to the protocol's value (reject
anything but 3 as `bad_context`), and require `reference_date` to be within a
short, stated interval of a **supplied by the app, not the model** capture date,
or of `captured_at`. One of the two dates must come from outside the proposal.

### D5 — P1 — "Full history after qualification" is a warning, not an error, in the case that matters

`src/validate.ts:805` makes a hole in the middle of a live thread an **error**
and a dropped tail a **warning**, "because an unrelated coda is possible". A
dropped *head* — which is exactly what truncating a patient's history looks like
— takes the same benign branch. Reproduced on lane 1's capture, dropping two of
John Smith's three sittings:

```
only the newest sitting: ok=false errors ["incomplete_capture","injected_span","identity_session_missing"]
  warnings ["uncovered_source_messages:6 live-branch messages belong to no session", …]
  history_sessions=[1]      blockers unchanged
```

Six messages of a patient's history silently reclassified as a benign coda; the
identity's `history_sessions` becomes `[1]`, indistinguishable from a
one-session patient. The warning then has **no field in the shipped
`ClaudeImportReport`**, so it is lost at the boundary — the dry run's `blockers`
did not change. `tests/eligibility.test.ts:167` asserts only the *positive* case
(gold brings all four of Ana's); nothing asserts that omitting one is an error.

**Fix:** a dropped *head* — uncovered live-branch messages before the first
covered one — should be an error, or at minimum a blocker, symmetric with the
interior case.

### D6 — P1 — The provenance line's grammar breaks when the conversation has attachments, and the shipped dedupe then suppresses the whole conversation

`proposalProvenanceLine` (`src/dry-run.ts:118-125`) emits
`…note from quoted source;${files} messages: …` — the `;` before `messages:` is
inside the interpolation, unlike the shipped `provenanceLine`
(`server/src/import/claude.ts:424`) which emits it unconditionally.

```
attachments=0
  line: [… ; note from quoted source; messages: m1 m2]
  shipped parser -> messages: ['m1','m2']  conversations: []
attachments=1
  line: [… ; note from quoted source;; 1 attached file not imported messages: m1 m2]
  shipped parser -> messages: []  conversations: ['c-john-a']
```

`importedKeys` fails to find `; messages: …]$`, falls back to "this conversation
was imported whole", and `planImport` (`:983`) then marks **every session in
that conversation** as already imported. A later run would silently never import
that patient's newest sitting or a corrected revision — the exact failure the
seam test exists to prevent. The corpus has `attachments: 0` everywhere, so
`tests/production-seam.test.ts:30` cannot see it; `c-john-a` in lane 1's fixture
has two attached messages and would trigger it on the first real capture.

**Fix:** emit `; messages: …` unconditionally, and add a seam test with
`attachments > 0`.

### D7 — P1 — The two lanes' completeness algebras are incompatible, so no adapter can be honest

Lane 1's verdict is `complete | complete_with_gaps | partial | blocked` plus a
separate `handoffable` gate and a `requires_acknowledgement` acknowledgement.
Lane 2's contract has one boolean, and `complete: false` is an **error**
(`src/validate.ts:222`). The sets do not correspond: `complete_with_gaps` is
handoffable-with-acknowledgement in lane 1 and an unconditional error in lane 2.

And `complete_with_gaps` is not an edge case. In lane 1's own fixtures, on
**both** mechanisms, a capture with no fault at all is `complete_with_gaps`:
the web path cannot fetch artifact bodies or carry an image block; the
compliance path cannot carry fork links. Any real account has attachments.
So a faithful adapter emits `complete: false`, and every realistic capture is an
error forever:

```
completeness {"complete":false,"pages_declared":4,"pages_read":4,
              "conversations_declared":15,"messages_declared":84,
              "failures":[{"stage":"conversation","code":"non_text_content_not_captured","count":2}]}
errors ['incomplete_capture', …]
```

The alternative — writing `complete: true` — is a lie, and it is the only way to
get a green run. **This is the seam problem in its sharpest form, and it is a
contract decision, not adapter work.** The minimal reconciliation: redefine lane
2's `complete` as lane 1's "every declared item was fetched" (`status !==
'partial' && status !== 'blocked'`), and keep `failures`/`gaps` as warnings,
which they already are (`capture_failure_*`). Then `complete_with_gaps` is
importable-with-acknowledgement on both sides and the two gates compose.

### D8 — P1 — `messages_declared` cannot be sourced, so `completeness_mismatch` is a tautology across the seam

`finalize` (`src/walker.mjs:577-579`) publishes `declared_conversations` and
`captured_messages` but **no declared-message total**; the per-conversation
`meta.declaredMessages` never reaches the manifest. Lane 2's
`completeness_mismatch` compares `messages_declared` against what is in the
file. Any adapter must therefore set `messages_declared = report.captured_messages`
— 84 = 84, by construction — and the check can never fire across the seam.
`conversations_declared` is honest (it is the inventory's count, 15), and it is
the one that would catch a truncated inventory.

**Fix:** publish `declared_messages` (the sum of `meta.declaredMessages`) in
the manifest. One field; it is the field that matters.

### D9 — P2 — Artifacts, and "content that exists but was not captured", cannot cross the seam at all

`CaptureMessageSchema` is a `strictObject` with exactly six fields
(`message_id, role, sent_at, text, parent_message_id, attachments`) — an adapter
**cannot** add an artifact reference even if it wanted to. Lane 1's compliance
run writes a third file, `artifacts.json`, with two captured artifact bodies.
Nothing in lane 2's contract can hold a reference, a body, or a "declared and
not captured" record.

Lane 1's manifest also carries a richer gap vocabulary than lane 2 can express:
`stage` is a closed enum of `inventory | conversation | message | schema`, so
`artifact_content_not_captured` has no stage, and gap *detail* (which block type,
which artifact version) has no field. On the compliance run lane 1 records **54
gap records**; my adapter emitted one consolidated warning and dropped the rest:

```
gaps lane 1 recorded: 54 records across schema_drift, no_fork_links_in_this_mechanism,
                       non_text_content_not_captured, artifact_content_not_captured
completeness the adapter emitted: failures: 1 record
```

Both docs call artifacts "a bonus surface, not a fidelity requirement", and for
the *shipped* importer that is true — it ignores them. Under lane 2 the claim is
not true: a conforming adapter drops them silently, which is the failure mode
the plan's "missing or unsupported content must be visible" criterion names.
Either lane 2's capture gains an `artifacts` array and a `content_not_captured`
counter, or lane 1's handoff must be carried alongside, unsummarised, to the
import screen.

### D10 — P2 — The shipped importer does not meet "complete available note history across matched conversations" — and neither lane's fixture contains the case

Lane 2's §8 says of the seam that deltas 1-4 are contract work. This is delta
zero, and neither doc states it: the shipped importer qualifies **per
conversation**, not per patient. A qualifying patient whose other chat is
entirely before the cutoff has that chat skipped as `before_cutoff` and its
history never imported. Reproduced against the unmodified shipped reader with a
patient who has two recent sittings in one chat and three sittings spanning
2024-11 to 2025-06 in another, cutoff `2026-06-27`:

```
patients planned: [ 'Test Patient Alpha (1 conv, 2 notes)' ]
notes planned: 2            (2026-09-01, 2026-09-08)
skipped: [ 'before_cutoff 2024-11-04..2025-06-18 msgs=6 sessions=3' ]
```

Three sittings, six messages, two years of history — dropped, with a skip row
that carries no patient name and no hint that it belongs to the patient being
created. The owner would see a patient with two notes and no explanation. This is
the largest single gap between the shipped path and her stated rule, it is
**silent**, and it is in the "smallest workflow" that needs no lane 2 at all.

Lane 1's fixture has `c-long` (all 2025) and `c-dana` ("across the years"), but
no patient who qualifies in one conversation and has history in another — so
neither lane tested it. Fixing it means making `planImport` group by resolved
patient first and then decide activity across the group.

### D11 — P2 — The shipped path makes a clinical decision that depends on which machine ran it

`activeSince` (`:465`) calls `instantToLocalDay`
(`shared/src/common.ts:33`), which resolves the **process** timezone. Same bytes,
same cutoff, three zones:

```
TZ=UTC                 -> skipped: [before_cutoff …, single_session 2026-06-27..2026-06-27]
TZ=Australia/Sydney    -> skipped: [before_cutoff …, single_session 2026-06-27..2026-06-27]
TZ=America/Mexico_City -> skipped: [before_cutoff …, before_cutoff 2026-06-27..2026-06-27]
```

The boundary patient's only contact is at `2026-06-27T02:00:00Z`: 27 June in UTC
and Sydney, 26 June in Mexico City. In two zones the **date test passes** and the
conversation is rejected for a different reason; in the third the date test fails.
With `MIN_SESSIONS` satisfied it would be imported in two zones and not the
third. Lane 2 is right that this is delta 3 and that production cannot express a
practice timezone today; what neither doc says is that the defect is
*demonstrable in the shipped code today*, which makes it a candidate for the
smallest-workflow fix list rather than a reason to adopt lane 2.

### D12 — P2 — 215 tests that nothing will run

`vitest.config.ts` lists five workspace projects; `scratch/` is not a workspace,
so `npm test` and `npm run typecheck` skip both lanes. Only `npm run lint`
reaches them. The extraction lane has no `tsconfig.json` and is plain `.mjs`, so
it is not typechecked at all. Both lanes' suites are one `git clean` away from
bit-rotting with no signal, and a future change to `server/src/import/claude.ts`
will not be caught by anything either lane wrote. If either lane's format is
adopted, its tests must be adopted with it.

### D13 — P2 — The two lanes' fixtures disagree about whether therapists state dates, and that decides whether lane 2 works at all

Lane 2's corpus writes the date into nearly every message: *"Session with Ana
Ruiz on 2026-09-10"*, *"La sesión con Ana Ruiz fue el 2 de julio de 2026"*. That
is what lets `session_date_basis: 'stated'` hold and six patients qualify.

Lane 1's corpus — written to look like real therapist prose — does not:
*"Session with John Smith. He reports sleeping five hours a night…"*, *"John
Smith again. Three months of the sheet…"*, *"John Smith tonight, editing what I
wrote…"*, and for the recalled old session, *"I never wrote up the session we
had in March last year"*. Not one message states a day.

Run the honest proposal over lane 1's capture — three sittings, `basis:
'unknown'`, no date evidence, which is what a truthful producer says about that
text:

```
ok false
errors   ['incomplete_capture', 'injected_span']
decisions ['date_needs_decision','date_needs_decision','date_needs_decision']
totals   {…,"patients":0,"new_notes":0,"out_of_scope":3,"decisions":3}
dry-run patients 0 notes 0
blockers ['incomplete_capture','injected_span','unmappable:unknown_date','unmappable:untouched_conversation']
```

**Zero patients.** And the alternative — a producer that claims a stated date —
is caught, correctly and by design:

```
errors ['incomplete_capture', 'unsupported_session_date @sessions[2].session_date',
        'injected_span @sessions[2].notes[0].spans']
totals {…,"patients":0,"new_notes":0}
```

So on realistic text lane 2 imports nobody, and saying otherwise is an error.
The six-patient result in §2 of the structure doc is an artifact of a corpus
authored to satisfy the criterion. **Neither the 6 nor the 0 is evidence about a
real account**, and the difference between them is an empirical question about
how this particular therapist writes — which is the first thing the live trial
should measure (§10).

### D14 — P3 — The date reader covers a narrow set of surface forms

```
"I saw John last Tuesday and we did grounding." -> []
"Session today."                               -> []
"the 2nd of July"                              -> []
"Marzo 2025"                                   -> []
"el 2 de julio de 2026"                        -> [{anchored 2026-07-02}]
"07/08/2026"                                   -> [{ambiguous}]
"on 2026-09-10"                                -> [{anchored 2026-09-10}]
```

ISO dates and long-form Spanish/English work. Relative and ordinal forms do
not, so they would be `inferred` or `unknown` — and by lane 2's own rule,
neither can qualify anybody. Compounds D13.

### D15 — P3 — The extension is a manifest with no code, and is not loadable even in developer mode

`scratch/claude-import-extraction/extension/` contains exactly two files:
`manifest.json` and `NOTES.md`. The manifest references `sw.js`, `panel.html`
and `inpage.js`; **none of the three exists.** `NOTES.md` says "a sketch, not a
build" and is right to. The consequence for planning is concrete: the NEXT
trial is not "load the prototype and point it at an account" — it is *write the
extension first*. Budget for that.

### D16 — P3 — Two smaller items

- `DEFAULT_IMPORT_CUTOFF = '2026-07-01'` (`shared/src/import.ts:64`) is a
  literal. It is a fixed string, not a window, and it drifts in one direction
  only: as time passes it stops excluding anyone.
- The compliance normalizer fabricates `account.uuid` from
  `organization_uuid` (`shapes.mjs:486`). It is mitigated by a named drift
  marker and nothing reads the field today, so it is harmless — but a future
  consumer must not treat a compliance capture's `account.uuid` as an account id.

---

## 5. The two formats, as they actually are

| | Lane 1 output | Lane 2 input (`apunta.claude.capture` v1) |
| --- | --- | --- |
| Top level | top-level **array** of conversations | `strictObject` with `capture_format`, `version`, `captured_at`, `conversations`, `completeness` |
| Conversation id | `uuid` | `conversation_id` |
| Title | `name` | `title` |
| Chat times | `created_at`, `updated_at` | `chat_created_at`, `chat_updated_at` |
| Messages | `chat_messages[]` | `messages[]` |
| Message id | `uuid` (may be `null`) | `message_id` (`min(1)`, required) |
| Role | `sender` (`human`/`assistant`) | `role` (`human`/`assistant`) — **compatible** |
| Time | `created_at`, plus `updated_at` | `sent_at` (no `updated_at` slot) |
| Text | `text`, else `content[]` text blocks joined `\n` | `text` — **same rule, compatible** |
| Fork | `parent_message_uuid` | `parent_message_id` — **compatible** |
| Attachments | array of records, 6 fields each | `attachments: number` (a count) |
| Content blocks | `content[]` kept verbatim | **no field** — dropped |
| Artifacts | refs per message + `artifacts.json` with bodies | **no field, and `strictObject` forbids one** |
| Completeness | sibling `extraction-manifest.json`: 4-state verdict, `handoffable`, `requires_acknowledgement`, `declared_conversations`, `captured_messages`, 54 gap records with detail, 3 optional `limits` | `completeness{}`: one boolean, `pages_declared`, `pages_read`, `conversations_declared`, `messages_declared`, `failures[{stage ∈ 4 values, code, count}]` |

**Verdict: incompatible, and not a naming problem.** Field-by-field the two
agree on four things (role, text rule, fork link, the meaning of an instant) and
disagree on everything about framing, completeness and loss. The two lanes were
built independently against different goals, which is the right way to explore,
and the seam is exactly where the coordinator said it would be
(`claude-import-structure-results.md` §8.1). Three things are not adapter work at
all: D7 (completeness algebra), D8 (`messages_declared` has no source), D9
(artifacts and gap detail have no destination). Those are contract decisions for
the owner.

### The minimal adapter

Roughly 60 lines, and it is enough to run the pipeline end to end. It is
**lossy in three named ways** (D7, D8, D9), which is the point of showing it.

```js
// lane 1 handoff  ->  lane 2 `apunta.claude.capture` v1
const STAGE = { list: 'inventory', detail: 'conversation', message: 'message', schema: 'schema' };

export function adapt({ conversations, manifest }, { allowGaps = false } = {}) {
  const report = manifest?.report;
  if (report === undefined) throw new Error('extraction-manifest.json carries no report');
  const handoffable =
    report.handoffable === true || (report.requires_acknowledgement === true && allowGaps === true);
  if (!handoffable) throw new Error(`capture is not handoffable: status=${report.status}`);
  if (!Array.isArray(conversations)) throw new Error('conversations.json is not a top-level array');

  const failures = [];
  for (const failure of report.failures ?? []) {
    const stage = STAGE[failure.phase];
    if (stage === undefined) {
      throw new Error(`lane 1 failure phase "${String(failure.phase)}" has no lane 2 stage`);
    }
    failures.push({ stage, code: String(failure.code), count: typeof failure.count === 'number' ? failure.count : 1 });
  }
  // gaps are per conversation and carry detail; lane 2 has a stage and a count and
  // nothing else. Artifact gaps have no lane 2 stage at all and are dropped here.
  const gapCounts = new Map();
  for (const gap of report.gaps ?? []) {
    if (gap.code === 'artifact_content_not_captured') continue;
    gapCounts.set(gap.code, (gapCounts.get(gap.code) ?? 0) + 1);
  }
  for (const [code, count] of [...gapCounts].sort()) failures.push({ stage: 'conversation', code, count });

  const out = conversations.map((conversation) => ({
    conversation_id: conversation.uuid,
    title: conversation.name,
    chat_created_at: conversation.created_at,
    chat_updated_at: conversation.updated_at,
    messages: conversation.chat_messages.map((message) => {
      if (typeof message.uuid !== 'string' || message.uuid === '') {
        throw new Error(`message without an id in ${conversation.uuid}: lane 2 cannot cite it`);
      }
      return {
        message_id: message.uuid,
        role: message.sender,
        sent_at: message.created_at,
        text: message.text,
        parent_message_id: message.parent_message_uuid,
        attachments: (message.attachments ?? []).length + (message.files ?? []).length,
      };
    }),
  }));

  return {
    capture_format: 'apunta.claude.capture',
    version: 1,
    captured_at: '2026-09-28T00:00:00.000Z',
    conversations: out,
    completeness: {
      complete: report.status === 'complete',   // the one honest value, and it is
                                                // an error for every real capture (D7)
      pages_declared: (report.inventory_pages ?? []).length,
      pages_read: (report.inventory_pages ?? []).length,
      conversations_declared: report.declared_conversations,
      messages_declared: report.captured_messages,  // echoes the capture; tautology (D8)
      failures,
    },
  };
}
```

Reproduced behaviour of the end-to-end run:

```
1. lane 1 output -> lane 2 contract
   web-app        REJECTED: Capture is not apunta.claude.capture v1: expected object, received array
   compliance-api REJECTED: Capture is not apunta.claude.capture v1: expected object, received array
2. adapted capture
   conversations 15 messages 84  adapter is deterministic: true
3. honest proposal over the adapted capture
   errors ['incomplete_capture','injected_span']  patients 0  notes 0
4. a producer that claims a stated date the text does not state
   errors ['incomplete_capture','unsupported_session_date','injected_span']  patients 0
5. the same proposal with two of three sittings removed
   warnings ['uncovered_source_messages:6 …']  blockers unchanged   (D5)
6. the shipped planImport on the same lane-1 file, no adapter at all
   patients [John Smith(list), Jane Doe(list), Jane Roe(list), Dana Doe(list)]  notes 12
   skipped [before_cutoff, not_clinical ×3, single_session ×3, no_name]
   report parses as shipped schema: true
```

Two observations from step 6. The shipped importer, on the same account, finds
**four** patients and writes **twelve** notes with **no adapter, no new contract
and no model** — so the smallest workflow exists today and is lane 1 alone. And
it finds *different* people than lane 2 would, from the same bytes, which is the
interoperability problem stated in the only terms that matter: two valid
imports, one account, four versus zero.

---

## 6. Criterion-by-criterion, re-judged

| Requirement (from the feasibility plan and the review brief) | Lane's claim | Re-judged |
| --- | --- | --- |
| **Preservation of active branches** | PASS (offline) | **DEFECTIVE for the web mechanism (D1).** Proven for a capture that carries links, which is a fixture property. The safety gate does not fire when the links are absent on the path the design depends on. |
| **Notes/artifacts** | PASS; artifacts "a bonus surface" | **Notes** faithful where spans resolve; blocked in practice by D2. **Artifacts** cannot cross the seam (D9) and are dropped by any conforming adapter. |
| **Same-name identities** | PASS, 14 tests | **NOT PROVEN for an untrusted producer (D3).** A merge validates with zero findings. The tests prove the *validator* is self-consistent, not that two identities are two people. |
| **Recently seen patient → entire history, old/gapped/multi-chat** | PASS (lane 2); not examined (lane 1) | **NOT MET by the shipped importer (D10), silently.** Enforced only as a warning by lane 2, and only in its own fixture (D5). |
| **Inclusive rolling 3 calendar months on actual session dates, not chat edits** | PASS, 17 tests | **PARTIAL.** The window arithmetic, month-end clamping and zone-aware day resolution are correct and genuinely well tested; `conv-petra-old` is a real counterexample to the chat-timestamp rule. But the window's two inputs are producer-supplied and unbounded (D4), `stated` is unavailable for common phrasing (D13, D14), and the shipped path's answer depends on the machine's timezone (D11). |
| **Partial captures fail clearly** | PASS | **HELD at both ends, and they do not compose.** Lane 1: `blocked` → my adapter refuses the file; `partial` → refused; a gapped run is only handoffable with a recorded acknowledgement. Lane 2: `complete: false` is an error. The disagreement (D7) means the composed system errors on *successful* captures. |
| **Claims not stronger than fixtures** | — | **HELD, and this is the lanes' strongest suit.** Every numeric claim reproduced. Every live claim labelled NOT RUN. The only overstatements I found are in *implication*, not in fact: §1.2's "revision fidelity is established … or whatever the web mechanism returns" (D1 shows the web mechanism is not established), and criterion 6's PASS reading as a validator property (D3). |
| **Developer-mode prototype vs store install UX** | Estimates labelled | **Correctly distinguished.** `NOTES.md:71` states plainly that a store listing is the only non-developer-mode path and that `Load unpacked` is developer mode, which the plan forbids in the therapist's workflow. With D15, the prototype is not even loadable unpacked, so there are **three** states, not two: a manifest sketch (today) → an unpacked developer-mode build (not permitted as the therapist workflow) → a store listing (not available). The ~13 clicks are **estimates**, correctly labelled, and the comparison against the export route is likewise an estimate of a route nobody re-measured. **No clicks in either document are measured.** |
| **Account coverage / live behaviour** | NOT RUN | **NOT RUN, correctly.** No live claim is proven and none is made. |

---

## 7. Self-fulfilling tests, and what deterministic validation cannot prove

Places where a green run is evidence about the fixture, not about the property:

1. **Lane 2's eligibility corpus (D13).** The corpus states a date in nearly
   every message, which is the precondition for `basis: 'stated'`, which is the
   precondition for qualifying. Lane 1's realistic corpus states none. "Six
   patients qualify" measures the corpus.
2. **Lane 2's injection negative set (D2).** The five clean samples and the
   corpus note texts all avoid "no risk" / "sin riesgo". The one false positive
   a therapy note is most likely to contain was never in the test set.
3. **Lane 2's identity tests (D3).** Every merge test preserves the absorbed
   person's identity. The direction that leaves no trace is untested.
4. **Lane 2's full-history test.** Asserts gold brings four sittings; never
   asserts that omitting one is an error (D5).
5. **Lane 2's provenance seam test.** Runs on a corpus with zero attachments,
   so the one grammar path that matters is unexercised (D6).
6. **Lane 1's mechanism fixtures.** `account.mjs` is a mock of the endpoints,
   written by the same author as the normalizers, encoding the same
   unverified assumptions. `expected.mjs` is genuinely independent of `src/` —
   its own serializer, its own digest, its counts recomputed from the truth — and
   that independence is real and worth keeping. But independence from the
   *producer* is not independence from the *assumptions*: a fixture that supplies
   `parent_message_uuid` cannot falsify "the response supplies
   `parent_message_uuid`" (D1).
7. **Lane 1's `complete` verdict is unreachable on a realistic account.** Both
   fixture mechanisms are `complete_with_gaps` on a fault-free run, so the
   strictest gate is never the one that is exercised, and the everyday path is
   the acknowledged-gaps path. The owner should know that the "unqualified
   complete-import success" the plan forbids is, in practice, replaced by a
   qualified one she has to acknowledge — and that this is where her preview
   carries the whole weight.

**Guarantees no deterministic validator can prove, which are therefore decisions
and not tests:**

- **That a person is who the conversation says they are** — stated in
  `validate.ts`'s own header, and correct. Identity is a *claim*; the validator
  can only check that the claim is well-formed, evidenced and internally
  consistent. D3 is the size of the gap.
- **That a grounded date is the right session date.** A quoted date proves the
  text says it. It does not prove the sentence is about the sitting rather than
  about a letter she received, a follow-up call, or a date the patient
  mentioned. `CHAT_DATE_TOLERANCE_DAYS` catches gross disagreement and nothing
  finer.
- **That a producer is not an adversary.** The lint is a trip-wire, not a
  containment boundary, and the lane says so. A paraphrase sails through — that
  is tested and recorded. The complete control is a preview that shows every
  date and every note beside the text it cites, which **does not exist** and is
  `NOT RUN`.
- **That a capture enumerated the account.** Nothing offline can. It needs a
  live trial, which is what §10 is for.
- **That two identities are or are not the same person.** Only she knows.

---

## 8. The smallest therapist workflow, and what it costs

**Smallest: lane 1 alone, into the existing importer.** No new format, no
schema change, no migration, no model, no Claude account, no proposal, no
validator, no adapter. The capture is a file the Settings screen already accepts,
and the unchanged reader opens it (reproduced). This is the only path that is
small today.

It does not yet meet the owner's stated rule. Gaps, in the order they would bite:

| Requirement | Status on this path | Cost to close |
| --- | --- | --- |
| Skip the emailed export | **NOT MET — prototype/offline only.** The capture *format* replaces the emailed archive and the unchanged reader opens it (reproduced), but there is no loadable extension (D15) and no live fetch has been made, so this remains **NOT RUN** end to end | build the extension (D15) + a live fetch + a store listing or a decision to use developer mode |
| Capture never silently loses a branch | **NOT MET** (D1) | one line in the web normalizer |
| Complete history for a qualifying patient | **NOT MET, silently** (D10) | group by patient before deciding activity in `planImport` |
| Rolling 3 calendar months, inclusive | **NOT MET** — a fixed `2026-07-01` literal (D16) | a reference date + a zone on `ImportOptions` |
| Session dates, not chat edits | **NOT MET** — `activeSince` uses message timestamps | the export carries no session date, so this needs lane 2 or an explicit therapist-supplied session date. **Not** satisfiable by inferring the session date from chat recency — see §10.3 |
| Deterministic across machines | **NOT MET** (D11) | a practice timezone on `ImportOptions` |
| One-sitting patients | dropped by `MIN_SESSIONS = 2` | a product decision (lane 2's delta 6), not a defect |
| A partial capture cannot look finished | **MET at the capture**; the *report* has no completeness field | a `completeness` field in the preview |

Four of those are small, local, in the shipped importer, and none of them needs
lane 2. That is the finding the coordinator most needs: **the rule the owner
stated can be met on the lane-1-only path, at a fraction of the cost of the
lane-2 path, and the two lanes' corpora disagree about whether lane 2 is
workable at all (D13).**

Lane 2's path costs, on top: a new versioned capture contract and adapter, a
schema change (`ClaudeImportReport` gains a reference date, a zone and a
completeness field), a migration, new `ImportSkipReason` members, a preview UI
that does not exist, a structuring model whose ability to produce a valid
proposal is **NOT RUN**, and a step where the producer is an untrusted party
holding a field that decides who is imported (D4). Its compensating advantage is
real and specific: it is the only one of the two that can express a session date
at all, and therefore the only one that can implement "actual session dates, not
chat edits" as the owner wrote it.

**Recommendation (not authorised in this spike — see the verdict table):**
treat the two lanes as two products, not one pipeline. D1, D10, D11 and D16 in the
lane-1-only path come first — they are small, they are in code that already
exists, and each one is a way a patient's record is currently wrong. D1 is now
assigned to the extraction agent as a scratch-prototype fix with a regression
test; the other three need a card and a decision. Decide lane 2 only after the live trial has run both dated and undated
scenarios (§10.2), because those two results decide whether lane 2 has a
subject.

---

## 9. Exact rerun commands, with exits

Under `PATH=~/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH`, from
the repository root. Every one of these is read-only.

```sh
# Lane 1, its own documented command, then all four files through the repo's tsx
node --test scratch/claude-import-extraction/test/traversal.test.mjs \
             scratch/claude-import-extraction/test/resilience.test.mjs \
             scratch/claude-import-extraction/test/fidelity.test.mjs
# exit 0 — 59 tests, 59 pass

for z in UTC America/Mexico_City Australia/Sydney America/Denver; do
  TZ=$z node_modules/.bin/tsx --test scratch/claude-import-extraction/test/*.test.mjs
done
# exit 0 ×4 — 68 pass each

# Lane 2
for z in UTC America/Denver America/Mexico_City Australia/Sydney; do
  TZ=$z npx vitest run --config scratch/claude-import-structure/vitest.config.ts
done
# exit 0 ×4 — 147 passed (12 files) each
npx tsc -p scratch/claude-import-structure/tsconfig.json   # exit 0
npx eslint scratch/claude-import-structure                   # exit 0
npx eslint scratch/claude-import-extraction                  # exit 0
npm run lint                                                 # exit 0, TOTAL 0 UI literals
```

The review's own experiments live in `/tmp/opencode/rev/` and are reproduced by
running, from the repository root:

```sh
node_modules/.bin/tsx /tmp/opencode/rev/lane1-dump.mjs    # exit 0 — writes both handoffs
node_modules/.bin/tsx /tmp/opencode/rev/e2e.mjs           # exit 0 — §1..§7, the whole e2e
node_modules/.bin/tsx /tmp/opencode/rev/e2e2.mjs          # exit 0 — D6, D5
node_modules/.bin/tsx /tmp/opencode/rev/e2e3.mjs          # exit 0 — D4, merge, date reader
node_modules/.bin/tsx /tmp/opencode/rev/e2e4.mjs          # exit 0 — D3, the clean merge
node_modules/.bin/tsx /tmp/opencode/rev/webflat.mjs       # exit 0 — D1
node_modules/.bin/tsx /tmp/opencode/rev/artifacts.mjs     # exit 0 — D8, D9
node_modules/.bin/tsx /tmp/opencode/rev/fullhistory.mjs   # exit 0 — D10, D11 (loop the TZs)
node_modules/.bin/tsx /tmp/opencode/rev/doc-numbers.mjs   # exit 0 — reproduces lane 2 §2
node_modules/.bin/tsx /tmp/opencode/rev/digest.mjs        # exit 0 — reproduces lane 1 §3
node_modules/.bin/tsx /tmp/opencode/rev/partial.mjs       # exit 0 — verdict gate, adapter refusal
```

Each script prints the finding inline; none writes into the repository, opens a
port, or contacts anything.

---

## 10. GO / NO-GO, and the minimal experiment

### Verdict

| | |
| --- | --- |
| **NEXT synthetic live-browser trial (narrowed, §10.2)** | **GO** for the offline preparation; the **live** half stays **blocked** until a synthetic account exists — there is none yet |
| D1 regression test + a loadable MV3 mock prototype (D15): research-only, scratch tree, throwaway unpacked profile | **GO** — assigned to the extraction agent |
| Any change to `server/`, `web/`, `shared/`, `installer/` | **NO-GO in this spike.** No production repair is authorised, including the D1 fix and D10/D11/D16 below: they are recommendations, not authorised work |
| Any claim that direct import works | **NO-GO** |
| Chrome Web Store publication | **NO-GO** (out of phase, and D15 means there is nothing to publish) |
| Writing any of this to a patient database | **NO-GO** (not attempted here; would need the sandbox wrapper and a card) |
| Claude-side structuring (lane 2) as a dependency | **NO-GO** until both date scenarios in §10.3 have been run |
| Fixing D1, D10, D11, D16 in the shipped importer | **RECOMMENDED, not authorised** — each is small and local, and each is a way a patient's record is currently wrong. They need a card and a decision, not this spike |

### 10.1 Why the trial is still worth running

Nothing found here changes what the trial must observe. The extraction unknowns —
pagination, the real conversation payload, whether the session rides a same-origin
request, the actual content-block types, whether an artifact endpoint exists, real
rate limits — are untouched by the defects above, and they are the only things
standing between this research and a decision. The trial is cheap, it is the only
thing that can settle them, and the protocol is already written down.

### 10.2 The minimal experiment

**One trial, one synthetic account, a fixed observation order, and two separate
date scenarios.** Preparation, in this order, and nothing else:

1. **Fix D1** in the scratch prototype, with a regression test: assert fork-link
   absence in the web normalizer, one line, so a capture that cannot prove it
   carried branches says so. Without it the trial cannot tell a mechanism that
   carries branches from one that silently does not, and observation 1 becomes
   unrecordable. Research-only — no production file is in scope for this spike.
2. **Build the three missing extension files** (D15): `sw.js`, `panel.html`,
   `inpage.js` — a loadable MV3 mock prototype, research-only, scratch tree.
   Reuse `src/sources.mjs` and `src/walker.mjs` unchanged behind the existing
   `request` seam. Load unpacked in a throwaway profile for the trial only — the
   *therapist* workflow still requires a store listing, and the trial is not that
   workflow.
3. **Plant** in the synthetic account, through the UI where the UI can do it: one
   patient with three sittings in a single long conversation; one edit on a recent
   message (forks); one image upload; one artifact; two patients sharing a first
   name in one chat; one long conversation. **Every message timestamp is
   server-assigned at send time**, so nothing old, nothing backdated and nothing
   timestamp-less can be planted by typing — see the fault-injection note in
   §10.3. The two date scenarios (§10.3) are the exception that *is* plantable,
   because they are about the *text*, not the clock.
4. **Record these observations, in this order:**

   | # | Observation | Settles | What it cannot settle |
   | --- | --- | --- | --- |
   | 1 | Does the conversation response carry `parent_message_uuid` on a fork? | D1; revision fidelity on the web path; lane 1's §5.2 | nothing about a mechanism that returns a pre-selected branch — the manifest gap is what tells the two apart, which is why D1 comes first |
   | 2 | Does the inventory response carry any pagination affordance — a `has_more`, a cursor, a total, a count — and does one unparameterised request return the whole account? | Whether the walk needs a second page *for this account size* | **Nothing beyond this account's size.** See the pagination note below. |
   | 3 | Does a message carry a per-message `updated_at`? | Edit-time preservation; the same risk as #1 | — |
   | 4 | What content-block types appear, and where do artifacts sit? | D9; whether artifact bodies are reachable at all | — |
   | 5 | Does the signed-in session ride the request from a MAIN-world content script? | Lane 1 §5.4 — the permission question the design was built to avoid depending on | — |
   | 6 | What are the real limits — requests per page, latency, any 429? | Lane 1 §5.5; the `pageSize`/`maxListPages` defaults | — |
   | 7 | Does a Blob download from the page's world survive MV3 CSP? | Whether the file route works once store-published | — |
   | 8 | Do the unmodified shipped reader and the adapted pipeline agree on the patient and note counts for this account? | The interoperability question, on real bytes rather than two fixtures | **D10's specific case.** A chat whose material is *old* needs old server timestamps, which cannot be planted through a UI — so D10 stays an **offline reproduction**, not a live observation. |

   **Pagination, stated precisely.** A single account of the size planted here can
   only establish what happened *at that size*. "The response came back whole and
   carried no `has_more`" is a fact about one request against one small account —
   it is **not** evidence that the endpoint has no pagination, and lane 1's
   `SOURCES.md` already says why: a published client that sends no parameter may
   have been written against a small account. A threshold, if one exists, is not
   reachable from a synthetic account this size. So the trial records what it saw
   and the walk's three behaviours (no paging, window paging, cursor paging) stay
   live options; it does not close lane 1 §5.1. Closing it needs an account at or
   past the suspected threshold, which is **NOT RUN** and out of this phase.
5. **Then:** run the capture through the unmodified shipped reader and through
   the adapted pipeline, and compare the patient and note counts.

### 10.3 The two date scenarios, and what they are for

**Correcting an earlier draft of this review.** A first version proposed making
the trial measure "what fraction of sessions state a date in the message text"
and using the answer to decide whether lane 2 is worth building. That was wrong
and is withdrawn. Every message in a synthetic account is written by us, so the
fraction is **our own design choice** and carries no information about how this
therapist writes. It cannot estimate real date prevalence, and a decision to
adopt or drop semantic structuring cannot rest on it.

What replaces it is two **separate scenario tests**, each with a fixed expected
outcome, run against the same account, neither of which is a prevalence measure:

| Scenario | Planted text | Expected outcome, stated in advance | What it establishes |
| --- | --- | --- | --- |
| **A — explicitly dated** | sittings introduced with an explicit day, e.g. *"La sesión con Ana Ruiz fue el 2 de julio de 2026"* / *"Session with X on 2026-09-10"* | Lane 2's `stated` basis holds; the patient qualifies; eligibility tracks **session** dates, not `chat_updated_at` | That the rule is *implementable* when the text cooperates. A scenario passing proves the pipeline works on this input shape and nothing about how often that shape occurs. |
| **B — undated** | the same sittings written as *"Session with X. He reports…"*, *"X tonight"*, *"I never wrote up the session we had in March last year"* | `basis: inferred`/`unknown`; **the patient does not qualify**; the sitting becomes a decision, not a silent exclusion; no note is written from it | That the rule **fails safe** on text that does not cooperate — the property that matters if scenario B turns out to be the common case. |

**The stop rule, restated as a decision rule on the two scenarios, not on a
measurement.** Neither outcome authorises weakening the owner's rule.

- If **A passes and B fails safe** (as it does offline today, D13): the rule is
  sound and lane 2 is implementable, but its usability on this practice's actual
  prose is **unknown and stays unknown** until a non-synthetic source of evidence
  exists. That decision belongs to the owner with the risk stated, not to a trial
  over text we wrote.
- If **A fails**, lane 2's `stated` basis is not implementable as designed and the
  format needs changing before anything else.
- **In neither case** does session-date eligibility fall back to chat recency by
  inference. The owner's rule is session dates; the shipped importer's
  chat-timestamp rule (D10, D11) is a **known, named defect** to be fixed, not a
  fallback to be adopted. If session dates prove unobtainable in practice, the
  honest outcome is that the import reports what it does not know — the "recorded,
  not asserted" labelling the shipped importer already uses — and asks her, not
  that it guesses a date from when she happened to write the message up.

**Fault injection, not live creation.** Some of the properties this review
reproduced cannot be planted through a UI at all, because the server assigns the
clock: a **backdated server timestamp**, a **message with no timestamp**, and a
**message landing on an exact window boundary** (D10's old history, D11's 02:00Z
case). Promising to create those in a live account would be promising something
the product may not permit, and a send timed to land on a boundary is not a
fixture. They are **offline fault-injection cases** in lane 1's synthetic account
and already pass (the `messages_with_no_timestamp` and non-date-timestamp cases in
`fixtures/truth.mjs`; the manifest holds instants byte-for-byte and the importer's
tolerance is exercised instead). They are re-run there, not in the browser. The
trial's job for timestamps is only the **shape** question — what the payload
actually carries and whether a missing or odd value survives normalisation — not
the creation of impossible history.

**Still a precondition, unchanged by this review:** whether reading a signed-in
session through undocumented endpoints is permitted. Lane 1 did not read the
terms and neither did I. That decision belongs to the owner and it is not a
detail; nothing in this document should be read as suggesting the question has
been answered.

### 10.4 What the trial still will not prove

Even a clean run against a synthetic account establishes nothing about: whether
one account's shape generalises to a five-hundred-conversation account
(lane 1 §5.6); **whether the inventory paginates at or past the size one small
account can reach** (§10.2, the pagination note); whether the Compliance API's
shape is stable (§5.7); whether a Web Store review passes (§5.9); whether a model
can produce a valid proposal (lane 2 §7, `NOT RUN`); **how often a real
therapist states a session date in the text** (§10.3 — not answerable from
material we wrote); and whether a preview is sufficient containment for a
deterministic validator's limits (§7). None of these is a reason not to run the
trial. All of them are reasons the trial's output is a *measurement*, and the
next decision after it is still a decision, not a conclusion.
