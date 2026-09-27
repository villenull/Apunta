# Instruction review: MODEL-STUDY (local model study plan, 2026-09-27) — pass 3, amended plan

**INSTRUCTION REVIEW ONLY, report-only; I did not edit the plan.** HEAD `e026072b`; the plan
amendment is uncommitted (`git diff --stat` = 1 file, +44/−2). No build, download, inference, app,
database, port-7717 or scratch activity; no heldout Spanish or real data read; the dirty UI/app
files untouched. No scored generation has run, so nothing here gates one that exists.

**Verdict: the amendment lands A2–A4 and B1–B3 as written; three residual defects remain, none of
which blocks acquisition.** A1 stays an execution check (plan:60 already mandates the digest).
Per your instruction I add no release requirement: the new thresholds are accepted as preregistered
exploratory criteria with their own INCONCLUSIVE branch, which is the right shape for this study.

| Item | First-pass finding | Status in amended text |
| --- | --- | --- |
| A1 digest before download | execution check, not an amendment | still owed by the acquisition worker, not by the plan |
| A2 thinking adapter | patch surface unnamed | **resolved** — hash original/copy/patch, isolate B, never count a `think`-dropping fallback as success |
| A3 provider retries | unreported retry | **resolved** — ladder retained, `LlmStats.attempts` and mode changes recorded, first-attempt vs eventual split, no equal-compute claim |
| A4 scratch paths and copy fallback | wording only | **resolved** — reflink attempt with fallback, commands/exit codes/byte counts/links recorded, absolute paths, nothing large under `/tmp` |
| B1 independent bilingual gold review | one gate missing | **resolved in substance** — separate corpus author, reviewer distinct from author and executor, pre-freeze, unresolved judgments stay unresolved; one recording gap, R2 |
| B2 preregistered criteria, memory honesty | needed numbers and honest memory wording | **resolved** — per-language critical-error rules, failure rates in denominators, blinded preference rule, exploratory framing, INCONCLUSIVE branch; rough 2 GiB reserve with unknown overhead explicitly unproven. Two residuals, R1 and R3 |
| B3 bounded contamination | reruns must be bounded | **resolved** — invalid timing windows, outputs and traces retained, one diagnostic rerun, absent telemetry ≠ absence of contention; minimum telemetry undefined, R1 |

## R1 — the contamination rule has no minimum telemetry, and this box has no GPU telemetry
The amendment requires model residency plus "available GPU/process telemetry" and then says missing
telemetry means contamination could not be excluded. On this machine `which nvidia-smi rocm-smi`
exits 2 (neither present), so read literally the rule would mark every arm's timing unprovable and
void the whole timing track on a technicality. **Correction (one clause):** name the minimum set
this host can actually produce — `ollama ps` before and after each arm (it exposes residency, SIZE,
CONTEXT and the `PROCESSOR` column, i.e. GPU vs CPU offload), the load average, and any GPU-process
listing if one appears — and state that an arm with none of that minimum is reported
**telemetry-limited, timings NOT MEASURED** rather than universally void, while its outputs and
factual scores stay usable. The existing "cannot be excluded, not proven absence" wording then
applies to the minimum, not to an absent tool.

## R2 — the bilingual pre-freeze sign-off is required but not recorded
The amendment makes the review a gate; the independent reviewer (plan:31) still cannot verify the
gate happened from artifacts. **Correction (one line):** require the sign-off to be written to
`docs/v2/evidence/MODEL-STUDY/` before freeze — reviewer role, the gold hash reviewed, the date, and
the explicit list of unresolved judgments — so the freeze hashes and that record are checkable
together. This is the same artifact discipline plan:35 already applies to hashes, not a new gate.

## R3 — the preregistered preference rule does not name its comparator
"at least 60% preference among non-tied factual-equivalent pairs and wins exceeding losses by at
least four pairs in EACH language" is unpreregistered in one respect: pairs against whom. **Correction
(one clause):** state the comparator — baseline A for C, D, E (and B judged on its own arm result,
plan:194), and for F the direct-A Spanish arm — so the pairing is fixed before outputs exist. With 16
cases × 3 runs per language, also state the maximum attainable pair count per language so a four-pair
margin is visibly achievable or not; the amendment's own "report sample size and uncertainty" covers
the rest.

## Retained as correct, no change sought
- No English scorer on Spanish (plan:99–104, restated at plan:122): the shipped scorer carries no
  language gate, so the prohibition is the right mitigation; Spanish results stay adjudicated
  critical-error counts with style separate.
- Pure-model path with no database or app launch: `server/src/eval/*` imports no db module, the eval
  CLI installs the egress guard before Ollama (`cli.ts:19`), and `--models`/`--runs` (default 3)/
  `--ollama-url` exist with `NUM_CTX = 16_384` (`ollama.ts:87`) matching plan:84, so Track 1 needs no
  code change and the harness can stay out of the app entirely.
- Frozen production prompt builders exist for all four scenario families (`prompts.ts:162` draft,
  `:331` refine, `:687` plan goals, `:757` compose brief), so per-language format parity needs no
  new prompts and no per-model prompt tuning.
- The 8 GB M2 gate stays separately marked NOT RUN with unmeasured overhead left unknown, and the
  rough screen is explicitly non-decisive in both directions — the honest form of the Mac statement.
- Failed arms stay failed, no production promotion, no worker commits, UI writer lane exclusive.
- A remains installed and needs no pull: `qwen3.5:4b-q4_K_M` (3.4 GB) is also
  `PROMOTED_DEFAULT_MODEL` (`shared/src/models.ts:43`); Node 24.19.0 pinned in `.nvmrc` and present
  in mise; `eval-es/NAMES.md` exists (184 lines) for plan:112.

## Evidence (read-only; command → result, exit code)
`git diff --stat docs/research/local-model-study-plan-2026-09-27.md` → 1 file, +44/−2, 0 ·
`git rev-parse HEAD` → `e026072b…`, 0 · `which nvidia-smi rocm-smi` → not found, 2 ·
`nvidia-smi -L` → command not found, 0 · `ollama ps` → header only, no resident model, 0 ·
`ollama --version` → 0.33.3, 0 · `ollama list` → `qwen3.5:4b-q4_K_M` 3.4 GB, 0 · `node -v` 26.8.2 vs
`.nvmrc` 24.19.0, 0 · `df -h /tmp` → 8.0 G free on tmpfs, 0 · `nproc` → 8, 0 · `git status
--porcelain` → 26 M + 11 ??, all UI/app plus this untracked report, 0.
