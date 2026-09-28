# Fable-Therapy-9B exploratory extension

Owner explicitly requested testing Verdugie/Fable-Therapy-9B on 2026-09-28,
with autonomous execution and high-level reporting. This adds candidate G to
the existing authorized local model study; it does not change production.

## Frozen comparison

- Target the exact requested repository, not a successor model. Acquire its
  Q4_K_M artifact, recording immutable revision, actual bytes, published digest,
  verified local hash, license and embedded chat template. No remote code.
- Use a new study-only model tag and the existing scratch root and GPU lease.
  Never replace a production model or launch concurrent inference.
- Primary comparator is the existing A (Qwen3.5 4B non-thinking) outputs;
  existing C (base Qwen3.5 9B Q4) is a secondary specialization comparison.
- Preserve existing corpus, prompts, gold, schemas and scoring thresholds.
  Run the 32 bilingual Track2 cases three times (96 case-runs), plus the
  frozen English Track1 regression and owner fixtures three times (72).
- Fable is advertised as a reasoning fine-tune: primary G uses thinking enabled
  and the existing reasoning allowance of 8192 output tokens, context 16384,
  temperature 0 and the existing seed/retry policy. Record extra compute rather
  than claiming equal-budget comparison with A. Do not increase the budget on
  heldout failures or silently disable thinking to salvage outputs.
- Compatibility checks use development cases only. Verify template, thinking
  separation and structured output on actual request/response traces before
  heldout generation. If the runtime cannot represent the declared behavior,
  record a compatibility failure; do not tune prompts or silently substitute
  another model. Any native-template adaptation must be frozen and documented
  before heldout outputs, with message content equivalence checked for Track2.
- Limit new harness implementation to two repair passes; retain every failure
  and original output. Existing 300-second request and 6-hour stage caps apply.
  No other candidates, quants or diagnostic arms without a separate decision.

## Comparison clarification before G compatibility smoke

The independent protocol reviewer found model-dependent spoken-retraction
preprocessing on Track1 fixture 04. The frozen provider calls the candidate
to propose corrections and then cuts the transcript before constructing the
writer prompt. The coordinator confirmed this path in the snapshot source.
Therefore Track1 is an end-to-end production-pipeline comparison, not an
identical-writer-input comparison. Preserve this behavior and all prior outputs;
do not retrofit fixed corrections or silently drop the fixture. Record original
input, correction calls/responses, applied edits and final writer-message hashes,
including preprocessing cost in total resource accounting. Assess outputs
against the original source facts, not just the transformed prompt.

Track2 remains the primary controlled comparison, conditional on actual
message-content and format hash equivalence and absence of model-dependent
preprocessing. Verify that condition before G heldout generation. Include a
development spoken-correction case in trace-coverage checks. Failure of a
comparison assumption must be reported, not repaired by tuning heldout inputs.
This clarification changes the claims and accounting, not prompts, gold or
decision thresholds. If any G heldout output predates it, record that explicitly.

## Independent assessment

The executor owns acquisition, traces and descriptive results only, under
scratch and docs/v2/evidence/MODEL-STUDY/fable-execution.md. A separate protocol
reviewer audits the existing study and this extension, including scorer limits,
retry accounting and deviations. A fresh blind context must assess factual
faithfulness and style; it receives source facts, frozen rubric and anonymous
outputs, never model identities or the sealed map. Preserve existing aliases;
any G aliases must be separately sealed without exposing earlier mappings.

Use the original decision rule: no observed critical-error or failure regression
and at least 60% of non-tied factual-equivalent preferences with wins exceeding
losses by four in each language. Report uncertainty and sample size. Model-only
judgments are exploratory, not clinical certification. Mac feasibility remains
NOT RUN until measured on the target machine.

Report to the owner whether G earns further consideration, what it gains or
loses against A/C, and the meaningful speed/memory tradeoff. No raw operational
updates unless a decision or owner-only blocker is required. No polling or
heartbeat. Existing synthetic-only, no live data/7717, isolated snapshot and
normal evidence-preservation constraints continue to apply.

## Corrective authorization following independent audit (2026-09-28)

The protocol audit in `docs/v2/state/reviews/MODEL-STUDY-fable-review.md`
invalidates every purported G Track1 result: captured requests used the 4B
baseline because the adapter silently defaulted after a model-flag mismatch.
Withdraw all associated Fable failure, quality, timing and budget-sensitivity
claims. Preserve original artifacts byte-identical and add STATUS records;
do not relabel, rename or overwrite them. Track2 G model identity was verified,
but its refine inputs share the separate assembly defect below. Schema validity
alone is not evidence of clinical quality.

The coordinator authorizes these bounded, study-only corrections:

- Serialize the refine input note using `JSON.stringify(input.note)` and verify
  the review's P1–P7 assertions, including development hashes, round-trip value
  and key order, unchanged non-refine prompts and a buggy-input negative control.
- Remove silent model defaults. Reject missing, unknown or duplicate model
  arguments before network access, and assert intended model identity on every
  outgoing request, including preprocessing and retries. Check response identity
  and digest where available. Exercise negative flag cases offline.
- Obtain independent acceptance of the staged patch before any new inference.
  Then generate only the real G Track1 72 case-runs and the affected Track2
  refine 156 case-runs: A/B/C/D/E/G each 24, plus F's 12. Existing B resume
  duplicates are not additional cases. Use new output directories, the same
  frozen options and time caps, and the single GPU lease. No additional tuning,
  production edits, corpus/gold changes or prompt-template text changes.

This is an explicit coordinator exception to the original two-repair cap, not
a reset or a claim of compliance with that cap. The independent accounting is
eight itemised code repairs and at least ten actual before these three authorized
corrections; six execution re-execution events are a separate category. Keep the
cumulative accounting in the audit and deviations record. A further contract
defect stops generation for a handoff rather than silently extending this scope.

Continue the independent review of the valid 72 non-refine samples. Preserve
actual output length; do not normalize or truncate notes to improve blinding.
Disclose the length/configuration inference limitation and the four genuine
identical-output pairs. There are 48 candidate-versus-baseline pairs across
24 cases and two challengers; identical outputs are ties within that denominator,
not removed samples. Apply preference thresholds separately per challenger and
language, excluding ties only as required by the original rule. The final
non-tied denominator must follow actual judgments, not a pooled arm count.

### Release after repair-stage review

The §9 review narrows immediate release to the 144 refine case-runs for
A/B/C/D/E/G, conditional on local model metadata/digest verification and recorded
loopback base URL. F's 12 remain held: its runner cannot filter the authorized
cases and lacks an identity guard for its two-model pipeline. No F repair or
full-arm execution is authorized by this release.

G Track1's 72 runs have code acceptance but remain held for command-only review:
the review's printed recipe still uses the rejected plural flag, omits the
per-fixture selector, and omits the explicit G adapter environment variable.
The executor must provide a corrected exact recipe, independently accepted
before generation. This is command correction, not permission for more harness
changes. Verify actual locally available digest metadata rather than assuming
`/api/show` returns a digest.

Accept the documented limitation that outgoing model identity is fail-closed
but generation-response identity is not checked; metadata-response mismatch
logging is not fail-closed. Record the adapter's missing egress guard honestly
alongside its verified loopback destination. Reconciled corrective accounting
is 15 against the original cap of two, including two defects inside the repair
work; no cap reset or original-protocol compliance is claimed.

### G Track1 command release

The independent command review in §9.8 supersedes the faulty §9.5 recipe.
G Track1's 72 case-runs are now released using that exact adapter, singular
model flag, explicit expected-model environment and per-fixture selection.
Before generation, verify the full GGUF hash against the acquisition manifest
and capture actual local runtime metadata without inventing absent fields.
Verify the first invocation's scores, adapter path, request identities and
identity ledger before continuing, then repeat those checks after each
invocation. Identity mismatches or missing evidence stop the batch. Preserve
all originals, use fresh output directories and the single GPU lease, and retain
the frozen budgets. This release does not change F's hold or authorize new code.
