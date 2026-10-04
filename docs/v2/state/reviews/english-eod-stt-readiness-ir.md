# Independent review — English EOD real-STT (`744afe3`) and spoken-STT (`363c67f`)

- Reviewer: fresh independent reviewer (`ee832f2c`), no `/vill`, no worktrees,
  no subagents.
- Targets: stable commits `744afe3` (tone / speechless fixture,
  `docs/v2/evidence/english-eod-real-stt/`) and `363c67f` (P3.5 spoken fixture,
  `docs/v2/evidence/english-eod-spoken-stt/`), both read-only.
- Scope: exclusive new state only — this file,
  `docs/v2/evidence/english-eod-stt-readiness-ir/**`, ignored `build/eod-stt-ir/`.
  No author/source/cache/fixture/card/config/staging edits. No inference,
  network, app/build/server/DB/audio-device/pactl/model-download/7717. Neither
  once-only STT invocation was re-run. The running probe-final-IR worker's
  `build/eod-model-probe-final-ir/**` was neither read nor written.
- Budget: one ~10 min bounded audit.

## Verdict

**DEFECT** — for one documentation factual overstatement in the spoken report
(§4.2). The evidence itself is genuine: every hash re-derives, the provider is
the shipped one with production defaults, and the tone→spoken delta is exactly
as claimed. The tone report's already-known false "cached dictation absent"
claim is corrected additively (§4.1); the old report is retained unchanged.
Everything else checks out; non-defect limits are listed in §5.

## 1. Re-derived facts (independent)

| Check | Result |
| --- | --- |
| Tone input `e2e/fixtures/audio/dictation-10s.wav` | `d487a393…d5820f`, 320044 B — matches |
| Spoken input `/tmp/apunta-v2/…-2b44c153/audio-en/dictation-30s.wav` | `79719c56…d5d0a5f`, 960044 B — **exists**, matches report and frozen `P3.5/attempt-4/runtime/04-V1.txt:9` |
| Model `build/eod-model-cache/models/ggml-tiny.en.bin` | `921e4cf8…920b1f`, 77704715 B — matches report and receipt |
| Binary `build/linux-resources/bin/whisper-cli` | `3a9f516d…804de`, 1064648 B — matches |
| Provider import | `WhisperCppSttProvider` from `server/src/ai/whisper.ts`; ctor gets only `resolveBinary`/`resolveModel`/`log` — no `spawnImpl`/`threads`/`timeoutMs`/`resolveLanguage` |
| Default args | `buildWhisperArgs` order, `sttPrompt([])=STT_LEAD_IN`, `whisperThreads(false)=availableParallelism()=8` (`nproc` 8), `DEFAULT_STT_LANGUAGE='en'` (`shared/src/transcribe.ts:124`); no `--duration`/`--audio-ctx`/greedy — both `03-derived-command.json` reproduced by hand |
| Timeouts | `timeoutFor(10)=180000`, `timeoutFor(30)=300000` (`whisper.ts:575-578`) — match |
| Event contract | `SttEvent` at `server/src/ai/types.ts:271`; completion push `whisper.ts:515-516`; tone 1 progress, spoken 2 (0.99, 1) — match both streams |
| Elapsed split | wrapper 3 s (`run-start` 00:19:11Z / `run-end` 00:19:14Z) vs provider `elapsedMs=318` measured after hashing+`describe` — the report's distinction is accurate |
| Copy fidelity | committed scripts and `02-run-output.txt` byte-identical to ignored scratch (`diff -q` silent, all six); tone→spoken diff = `WAV` constant + 3 comment lines |
| Scoped gates | `prettier --check` 0, `eslint --no-ignore` 0, `node --check` OK on all four committed scripts |
| Anchors | `John Smith` present/correct; both negations survive; `sertraline fifty milligrams daily` → `"Certraline-50" Miladram's Daily`, `milligrams` absent — as recorded |
| Thresholds / language | no score/WER/accuracy/faithfulness threshold in either dir; English-only, no Spanish/card acceptance |

## 2. Commit integrity

`git show --name-status` for `744afe3` and `363c67f` adds **only** the seven
evidence files in each directory. No source, config, card, checkpoint or
manifest is in either commit.

## 3. Boundary

No tracked file was modified by this audit. `git status` shows only the new
untracked review/evidence directories and the ignored scratch. HEAD moved
`363c67f → c3283ff` during the review (another worker's state-tracking commit),
which touches neither target directory.

## 4. Findings

### 4.1 DEFECT (tone, retained + qualified) — "P3.5 cached dictation does not exist"

`english-eod-real-stt/04-anchor-verification.md` §1 asserts the P3.5 cached
synthetic dictation "does not exist" and "There is no P3.5 cached audio of any
kind", based on `find . -name '*.wav'` — a **cwd-scoped** search that cannot see
`/tmp`. The file exists at the recorded path with the frozen hash (§1). This is
a cwd-limited false negative. Per instruction the old report is **retained
unchanged**; the additive qualification is this review and the spoken evidence,
which used that exact file. No tone-only re-run is required.

### 4.2 DEFECT (spoken) — unsupported hash-guard claim in README §5

`english-eod-spoken-stt/README.md` §5: *"Ground truth read first, input hash
verified before the call. Had the file been missing or its digest differed from
the frozen P3.5 `79719c56…`, the run would have stopped rather than substituted
anything."*

The harness (`real-stt.ts`) has **no digest comparison**. It reads the WAV,
emits the computed `sha256`, and proceeds; a mismatch would not stop the run.
The `sha256sum` in §6 is a printed pre-flight read, not a guard, and no wrapper
script implements one. The "missing file" half is true (`readFileSync` throws);
the "digest differed → stopped" half is not implemented. The input did in fact
match, so the run's validity is unaffected — but the sentence overstates what
the code does and should be corrected to a provenance statement.

### 4.3 Observation (spoken) — "nothing outside the spoken sentence appears"

`04-fidelity-verification.md` §3 says "Nothing outside the spoken sentence
appears — no additional name, date, dose, symptom, intervention or
assessment." The substantive claim (no *new clinical content*) is observed from
the comparison. The literal phrasing is broader than observed: `Miladram's`,
`Certraline` and capitalised `Daily` are not literally in the spoken sentence —
they are garbled renderings of it. Read it as "no new clinical facts", which
holds. No threshold, no clinical judgement, no Spanish acceptance is claimed.

## 5. Limits (not defects)

1. **Host engine only, not bundled runtime.** Both runs used host Node
   `v26.8.2`; production pins Node `v24.19.0` (`.nvmrc`, `package.json`
   engines, P3.5 V0/V1). The provider logic is shipped source, but this is
   **host-engine readiness, not a proof of the bundled/pinned runtime**. The
   evidence records `v26.8.2` honestly; it must not be read as the production
   runtime. No re-run is required by this audit.
2. **Committed scripts are not runnable in place.** `../../server/src/ai/whisper.js`
   resolves from the ignored `build/eod-*/` scratch but not from
   `docs/v2/evidence/english-eod-*/` (resolves to absent `docs/v2/server/…`).
   Reproduction requires the scratch path; the READMEs say "review copy" but do
   not state this. Documented here rather than by adding a runtime file.
3. **HEAD label off by one (spoken).** README says HEAD `e7889bc`; at the
   recorded run start (00:19:11Z) HEAD was `6e582cb` (00:19:03Z). Cosmetic.
4. **Line cites.** Tone §4 cites `whisper.ts:515` for the completion push
   (`516` is the push, `515` the `if`); spoken cites `:516`. Cosmetic.
5. **Raw `/tmp` path in committed evidence.** The spoken evidence (and the
   frozen `P3.5/attempt-4/runtime/04-V1.txt` it cites) carries a raw
   `/tmp/apunta-v2/…` path; the P3.5 card asks P3.5 evidence to sanitise run
   folders to `<sandbox>`. Pre-existing in the frozen file; noted, out of scope.

## 6. Files written by this review

- `docs/v2/state/reviews/english-eod-stt-readiness-ir.md` (this file)
- `docs/v2/evidence/english-eod-stt-readiness-ir/README.md`
- `docs/v2/evidence/english-eod-stt-readiness-ir/hashes.txt`
- `docs/v2/evidence/english-eod-stt-readiness-ir/scoped-gates.txt`
- `docs/v2/evidence/english-eod-stt-readiness-ir/diffs-and-paths.txt`
- ignored scratch: `build/eod-stt-ir/{hashes,scoped-gates,diffs-and-paths}.txt`
