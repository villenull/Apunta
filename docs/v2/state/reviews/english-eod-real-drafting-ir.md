# English EOD real drafting — independent frozen-evidence audit

**Verdict: CLEAR.** No factual defect. Every claim in
`docs/v2/evidence/english-eod-real-drafting/README.md` that was checked
reproduces from the raw SSE wire bytes in `build/eod-real-drafting/run-output.txt`.
No quality PASS is invented; the run proves writing-provider availability only.

- Audit of commit `1efd5da` ("Verify offline probe fidelity and record real
  English drafting"), the latest commit carrying the English EOD real-drafting
  pass. Same workspace/`main`; no worktrees, no workers, no `/vill`.
- Scope: verify the README's factual claims against the **raw SSE before/after**,
  not the harness's rendered own-split. No rerun, no inference, no server, no
  build, no network, no :7717, no live DB. Read-only.
- Evidence frozen to `docs/v2/evidence/english-eod-real-drafting-ir/` (new,
  git-ignored `build/eod-real-drafting-ir` not used). Nothing staged or committed;
  no author/source/card/config/manifest edit.

## What was verified, from the raw SSE

| README claim | Raw-SSE result | Verdict |
| --- | --- | --- |
| Draft is 343 bytes | `Buffer.byteLength(before)` = 343 | correct |
| After refine the record is 316 bytes | `Buffer.byteLength(after)` = 316 | correct |
| Refine lost the final sentence "We reviewed sleep hygiene." | before `true`, after `false` | correct |
| `empty_sections` = `["Location","Client presentation","Intervention","Out of session actions"]` | identical on `note` and `note-updated` | correct |
| Model wrote the three bodies under their own headings repeated inline, so the format's seven headings serialise with four empty bodies | content carries `Risk review: …`, `Discussion: …`, `Note for next session: …` inline; the four listed headings have empty bodies | correct |

The two contents, verbatim from the wire:

```
BEFORE (343 B)  Discussion: He continues the sertraline fifty milligrams daily and slept better this week. We reviewed sleep hygiene.
AFTER  (316 B)  Discussion: He continues the sertraline fifty milligrams daily and slept better this week.
```

The only difference is the removed sentence. The headings-inside-body reading is
the server's own `empty_sections` (four empty) plus the three inline-heading
bodies; the harness's `section_text*` split is advisory and agrees.

## The `03-persisted-note.json` observation

The file has `content` and no `sections` property. That is the correct schema:
a note stores its body as a single `content` string; `sections` belong to the
format, not the note. Not a defect. Its content is the **after-refine** record
(revision 1, `updated_at` 00:33:57.265Z) and correctly lacks the sleep-hygiene
sentence — consistent with the raw `note-updated` event.

## The omitted input intervention

The input said "We reviewed sleep hygiene and set a follow-up in four weeks."
The **draft** captured both: sleep hygiene in `Discussion`, the follow-up in
`Note for next session`. The **refine** then dropped the sleep-hygiene sentence
(its own reply: "I shortened the Discussion section."). So the intervention was
not omitted from the draft — it was removed by the one refine turn. The README
reports this literally and explicitly invents no threshold and no quality
verdict. This is a real single-pass model behaviour on an availability-only
proof, not an evidence defect, and nothing here normalises it into a PASS.

## Run identity (from the frozen raw evidence)

- run id `2026-10-04T00-32-31-811Z-7a5534b2`, port 7847, `fakeAi:false`,
  `testRunId` matched (C-ISO ownership).
- model `qwen3.5:4b-q4_K_M`, `source:"promoted"`, present; settings PUT 200
  (`llm_model`, `language:"en"`), `spanish_available:false`.
- generate: 200, 5875 ms, stages connecting→drafting→saving, 25 token events,
  1 `note`, 0 `error`. refine: 200, 1831 ms, `outcome:"applied"`,
  `outcome_reason:null`, 0 `error`.
- noteId `01a10454-e6e6-700e-aa49-1fec455f756d` persisted; GET 200 before and
  after; thread 3 rows (assistant, user, assistant).
- model stats: draft 3569/100 tok, 90.9 t/s, loadMs 3340, stop, attempts 1;
  refine 4019/143 tok, 97.7 t/s, loadMs 1, stop, attempts 1.

## Callback

CLEAR. No factual defect, so no text correction is required. The README's
before/after, byte-count, empty-sections and headings-inside-body claims all
reproduce from the raw SSE. The proof remains what it claims to be: one real
English drafting pass plus one refine, writing-provider availability only — not
UI/card acceptance, not a clinical-quality or routing verdict, not a Spanish
result. Artifacts are untracked and uncommitted, awaiting the coordinator:

- `docs/v2/state/reviews/english-eod-real-drafting-ir.md`
- `docs/v2/evidence/english-eod-real-drafting-ir/` — `01-raw-sse-generate.txt`,
  `02-raw-sse-refine.txt`, `03-model-stats.txt`, `04-fabricated-input.txt`,
  `05-content-before-after.txt`
