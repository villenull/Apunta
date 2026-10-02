# S3.2 — verification rows, implementation attempt 1

All commands run from the repository root `/home/villenull/Projects/Apunta`.
Sandbox run folders appear as `<sandbox>`; the home folder as `~`. No patient
content, no hostname, no credential appears in this file or in any artefact it
names. Times are UTC.

## V1 — `npm run build:shared && npx vitest run server/src/eval`

- Working directory: `/home/villenull/Projects/Apunta`
- Command: `npm run build:shared && npx vitest run server/src/eval`
- Node: `v24.19.0` (pinned `PATH`)
- Exit code: **0**
- Start: 2026-10-02T20:14:12Z · End: 2026-10-02T20:14:13Z
- Excerpt:

```
 Test Files  4 passed (4)
      Tests  114 passed (114)
```

What the 114 tests cover, by the card's own enumeration:

| Card requirement | Where |
| --- | --- |
| One test per C-EVAL@1 rule 4 critical class, flagged without importing a guard | `pipeline.test.ts` "rule 4 — one control per critical trap class, per locale"; 7 per locale, all `flagged` |
| No scoring module reaches `server/src/ai/`; `score.ts`/`lexicon.ts` reach none at all; the driver is exempt and the test says why | `pipeline.test.ts` "rule 9 — independence from the production guards" |
| `loadCorpus('e2e/fixtures/eval-es/tuning')` returns 33 fixtures keyed `<trap-type>/<name>.txt`, and a sidecar-less nested transcript raises `CorpusError` | `pipeline.test.ts` "FD3" (FD3) |
| The two Spanish tuning `expectations.json` files are unchanged at the base commit's hash | `pipeline.test.ts` "FD6 — the two Spanish tuning sidecars" |
| Identical corpus percentages **and** byte-identical `sensitivity(models)` with and without the controls directory | `pipeline.test.ts` "FD6 — a control is in no denominator" |
| Provider mode with no `--locale` and with `--locale en` produce identical corpus report blocks | `pipeline.test.ts` "FD1" |
| A lexicon line with an unknown category is a load-time error naming file and line | `lexicon-locale.test.ts` "a half-empty lexicon cannot load" |
| Pipeline mode never publishes a note | `pipeline.test.ts` "FD4 step 4" (comments stripped, endpoint inventory listed) |
| **N-1** the mechanism is derivable; a token with no key, a key with no token, a key naming a lexicon the locale lacks, and a key on a corpus sidecar are each a `CorpusError`; `--blind-lexicon negation` expands to `(?!)` | `controls.test.ts` "FD2b" |
| **N-2** the `degenerate` control loads and is scored; `markerFreeSource` is the measured value; a control whose source *does* carry marker vocabulary is still refused by `assertFixture` | `controls.test.ts` "N-2" |
| **N-3** all 217 alternatives matchable and not substring-matchable, `mié` and `dejó` asserted, per-term substring negatives, the English `\b` construction unchanged on all 239 | `lexicon-locale.test.ts` "N-3" and "the loader is locale-scoped" |
| **N-5** `--mode pipeline` with an existing `--out` exits 2 and leaves the file byte-identical; `--mode provider` still overwrites | `pipeline.test.ts` "FD5" (both, as real CLI subprocesses) |
| **N-5** the legacy path is untouched; no corpus sidecar contains `lexicon` or `{{` (zero in all four); the `en` controls sidecar carries neither | `controls.test.ts` "FD2b", "B-2" |
| **B-1** token in the negator's slot, no doubled negator, no bare negator in `mustNotContain`; the es-MX lost-negation fact is satisfiable | `controls.test.ts` "FD2b" |
| **B-3** blinding substitutes, never empties; the file is read as authored | `controls.test.ts` "FD2b" |
| Locale terms reach **all three** `scoreNote` call sites | `pipeline.test.ts` "the locale-scoped terms reach all three scoreNote call sites" |

## V2 — `npm run eval -- --fake --runs 1 --locale es-MX --corpus e2e/fixtures/eval-es/tuning`

- Working directory: `/home/villenull/Projects/Apunta`
- Command: `npm run eval -- --fake --runs 1 --locale es-MX --corpus e2e/fixtures/eval-es/tuning`
- Exit code: **1** — see "Why V2 exits 1" below. Every substantive expectation holds.
- Start: 2026-10-02T20:05:34Z · End: 2026-10-02T20:05:36Z
- Excerpt:

```
Run 2026-10-02T20:05:35.938Z · 33 fixtures · fake x1 · 0.1s
- positive: 7 flagged of 7
- clean: 1 passed of 1
- empty: 1 failed of 1
- degenerate: 1 failed of 1
| `clean/01-sesion-limpia.txt`            | clean      | pass    | pass    | — |
| `degenerate/01-plantilla-repetida.txt` | degenerate | fail    | fail    | F6 unsupported conclusion |
| `empty/01-nota-vacia.txt`              | empty      | fail    | fail    | S4 every section blank |
| `positive/01-negacion-perdida.txt`     | positive   | flagged | flagged | missed mustCapture |
| `positive/02-negacion-inventada.txt`   | positive   | flagged | flagged | F1 banned string |
| `positive/03-dosis-incorrecta.txt`     | positive   | flagged | flagged | F1 banned string |
| `positive/04-experiencer-equivocado.txt`| positive  | flagged | flagged | F1 banned string |
| `positive/05-riesgo-pasado-como-actual.txt`|positive| flagged | flagged | F1 banned string |
| `positive/06-contenido-retirado-conservado.txt`|positive| flagged| flagged| F1 banned string |
| `positive/07-contenido-inventado-seccion-no-cubierta.txt`|positive|flagged|flagged| F1 banned string |
```

33 fixtures loaded (not 0), 10 es-MX controls loaded, the four-line table printed
with its own denominators separately from the corpus denominators, and all ten
behaving exactly as FD6's predicates state with each named mechanism beside its
line.

### Why V2 exits 1

The CLI's fake branch (`cli.ts:270-286`, unchanged by this card) exits 0 only when
`sensitivity(models).deflects`, i.e. when the fake harness produced **banned
strings, gating conclusions and filled blanks while leaving some fixtures clean**.
On this corpus it produced none of the first three:

```
Harness sensitivity: 0 runs with a banned string, 0 with a gating unsupported
conclusion, 0 filled blanks, 33 clean runs.
The harness did not deflect on the canned notes.
```

**This is a property of the base commit, not of this card.** Established by
running the identical command from a pristine `git archive fa4a9f3` tree:

```
BASE exit: 1
Harness sensitivity: 0 runs with a banned string, 0 with a gating unsupported
conclusion, 0 filled blanks, 33 clean runs.
```

Byte for byte the same figures. `server/src/ai/fake.ts`, `score.ts` and
`patterns.ts` are untouched by this card (`git diff --stat fa4a9f3 --` over those
paths is empty), and the default `--locale en` path now passes `lexicon:` with
exactly the terms `scoreNote`'s no-argument fallback would have loaded.

The mechanism is `fakeSectionsFor` (`server/src/ai/fake.ts:216-231`): it fills
**only the first section** with `condense(source)` — at most 240 characters,
cut at a sentence end — and leaves every other section empty. The Spanish tuning
corpus's `mustNotContain` entries (`niega(?:ndo)?`, `no refiere`, `sin antecedentes
de`, …) all occur after that cut in every transcript, and the first section is
never a `blank`-expected one, so no blank can be filled either. The English
corpora deflect because their canned `CANNED` notes carry the vocabulary the
English traps look for.

`server/src/ai/fake.ts` is **Must-not-edit** for this card, and the deflect gate
is a safety instrument: relaxing it, or widening what counts as a deflection, to
turn this row green is exactly what HS-7 forbids. The row is therefore reported
**FAIL** on its exit code with this cause, and the coordinator's call.

## V3 — `npm run eval -- --fake --runs 1 --locale es-MX --corpus e2e/fixtures/eval-es/tuning --blind-lexicon negation`

- Working directory: `/home/villenull/Projects/Apunta`
- Command: `npm run eval -- --fake --runs 1 --locale es-MX --corpus e2e/fixtures/eval-es/tuning --blind-lexicon negation`
- Exit code: **3**
- Start: 2026-10-02T20:07:24Z · End: 2026-10-02T20:07:25Z
- Excerpt — the report header, the missed control, and the stderr message:

```
> **negation lexicon blinded (negative control).** Every `{{lexicon}}` token in
> this run expanded to `(?!)` instead of the vocabulary. The lexicon file was read
> and validated exactly as authored and was never emptied. Numbers below are
> **not** a measurement.

| `positive/01-negacion-perdida.txt`   | positive | flagged | flagged | missed mustCapture |
| `positive/02-negacion-inventada.txt` | positive | flagged | pass    | F1 banned string **(missed)** |

MISSED CONTROL — this run is inadmissible (C-EVAL@1 §3: an instrument that misses a
control is broken; nothing it scores counts). Nothing above is a measurement.
  positive/02-negacion-inventada.txt (positive): control
  positive/02-negacion-inventada.txt (positive) expected to be flagged through
  "F1 banned string" but observed neither that gating entry nor an uncaptured
  mustCapture fact; gating was [empty], captured 0/0
```

Every element FD8 and V3 name is present: exit **3**, not `2` and not the generic
harness message; the control named is the **es-MX** one whose every
`mustNotContain` entry carries `{{lexicon}}` in the negator's slot; its class and
its un-observed mechanism (`F1 banned string`) are printed;
`positive/01-negacion-perdida.txt` **stayed flagged**, which per FD8 is the
expected result and not a missed control; and the blinded lexicon could not have
tripped FD2b's validation rule (4), because that rule is evaluated once at load on
the file as authored. The `en` pair carries neither key nor token and was
unaffected.

## V4 — BLOCKED, owner

See `attempt-1/README.md`, which holds the full record. No report was written and
`docs/v2/BASELINE.md` was not touched (§1–§8 unchanged, §9 does not exist).

Every V4 precondition passed: the tag `qwen3.5:4b-q4_K_M` is present locally and
**no pull was attempted** (HS-3, A08); its digest is
`2a654d98e6fba55d452b7043684e9b57a947e393bbffa62485a7aac05ee4eefd`, identical to
`BASELINE.md:30` and to the card; `node --version` is `v24.19.0`; `npm run build`
produced `server/dist/index.js`; port 7840 is free and inside 7800–7889; the
attempt directory was created before any invocation.

The eight invocations were not started. The dispatch states: *"Do not run the long
V4 set while anything else is using the machine."* The box was under sustained
load from processes that are not this card's — a `java` process at 267% CPU, an
`npm exec wrangler` dev server, a `python` process and a `qemu-system-x86` guest;
load average 5.65 on 8 cores at the moment the precondition was checked. FD10
forms a min/max from four invocations per corpus and compares the integers
against §5's recorded ranges; contention on this hardware pushes generations into
the runner's timeout paths, and a timed-out run is recorded as `call_failed`
(FD5) — a real change in the measured numbers that would read as a regression.

### The pipeline runner was proved to work, with no model call

Three model-free checks under `scripts/v2/sandbox.mjs run --port 7840`, each
exiting 2 at a different pre-flight refusal and writing nothing. Evidence of a
runner that is real; **not** evidence of any measurement.

| # | Pre-flight exercised | Exit | Message (abridged) |
| --- | --- | --- | --- |
| A | `APUNTA_CHECK_URL` unset (FD4 step 0) | 2 | `APUNTA_CHECK_URL is unset. --mode pipeline measures a server; run it through scripts/v2/sandbox.mjs run, which sets it (C-ISO@1 rule 6).` |
| B | `/api/health` + `testRunId` + `ollama.tag` vs `--models` (FD4 steps 0 and 6) | 2 | `/api/health reports ollama.tag="qwen3.5:4b-q4_K_M" but --models names "wrong-model:tag". In pipeline mode --models is a label for the server's own resolved model, not a control (FD4 step 6).` |
| C | an `--out` path that already exists (FD5) | 2 | `--out …/attempt-1/SPENT.md already exists. A pipeline report is never silently replaced: a re-attempt writes attempt-<n+1>/ and leaves this one byte for byte where it is (FD5, C-ISO@1 N-5).` |

- Working directory: `/home/villenull/Projects/Apunta`
- Exact commands, in order:

```sh
export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH"
export APUNTA_DEV_SPANISH=1
node scripts/v2/sandbox.mjs run --port 7840 -- env -u APUNTA_CHECK_URL npx tsx server/src/eval/cli.ts --mode pipeline --models qwen3.5:4b-q4_K_M --corpus e2e/fixtures/eval-owner --runs 1 --fixture 01 --out docs/v2/evidence/S3.2/attempt-1/PLUMBING-NOT-A-REPORT.md
node scripts/v2/sandbox.mjs run --port 7840 -- npx tsx server/src/eval/cli.ts --mode pipeline --models wrong-model:tag --corpus e2e/fixtures/eval-owner --runs 1 --fixture 01 --out docs/v2/evidence/S3.2/attempt-1/PLUMBING-NOT-A-REPORT.md
printf 'A REPORT ALREADY ON DISK\n' > docs/v2/evidence/S3.2/attempt-1/SPENT.md
node scripts/v2/sandbox.mjs run --port 7840 -- npx tsx server/src/eval/cli.ts --mode pipeline --models qwen3.5:4b-q4_K_M --corpus e2e/fixtures/eval --runs 1 --fixture 01 --out docs/v2/evidence/S3.2/attempt-1/SPENT.md
```

- Start 2026-10-02T20:12:53Z, End 2026-10-02T20:13:02Z (checks B and C; check A
  began 2026-10-02T20:12:44Z)
- Sandbox run folders: `<sandbox>/2026-10-02T20-12-53-535Z-8177016a` and
  `<sandbox>/2026-10-02T20-13-01-*`, both on `127.0.0.1:7840`, data under
  `<sandbox>/<runId>/data`. No database outside `/tmp/apunta-v2/` was opened; the
  live data folder and port 7717 were never contacted.
- Check C's invariant, measured: `SPENT.md` sha256
  `d422f7ac8a4d6ea543fc71997ae983b64d5a268aa204ae92d400bdf09898dba8` **before and
  after** the refusal — byte-identical, and the refusal happened before the first
  fixture. `SPENT.md` was removed afterwards so the attempt directory holds no
  file that could be mistaken for a report.

## V5 — `npm run lint && npm run typecheck`

- Working directory: `/home/villenull/Projects/Apunta`
- Command: `npm run lint && npm run typecheck`
- Exit code: **0** (lint 0, typecheck 0)
- Start: 2026-10-02T20:14:36Z · End: 2026-10-02T20:14:52Z
- Excerpt:

```
All matched files use Prettier code style!
THIRD-PARTY-LICENSES.md lists all 111 shipped packages.
TOTAL 0
```

No dependency was added, so `THIRD-PARTY-LICENSES.md` is unchanged.

## V6 — `node docs/v2/tools/check-plan.mjs --no-write`

- Working directory: `/home/villenull/Projects/Apunta`
- Command: `node docs/v2/tools/check-plan.mjs --no-write`
- Exit code: **0**
- Start: 2026-10-02T20:14:19Z · End: 2026-10-02T20:14:19Z
- Excerpt:

```
Plan consistent: 70 cards, 12 parent reviews, 14 contracts, R01-R20 covered, no cycles.
```

## Not a card row, recorded because it must not have regressed

`npm run eval -- --fake --runs 1` — the mandated default CI self-check — exits
**0**, with the harness deflecting and all ten `en` controls holding:

```
Harness sensitivity: 12 runs with a banned string, 9 with a gating unsupported
conclusion, 12 filled blanks, 6 clean runs.
The harness deflects. A clean real run from it would mean something.
- positive: 7 flagged of 7 · clean: 1 passed of 1 · empty: 1 failed of 1 ·
  degenerate: 1 failed of 1
```

## FD9 and FD10 are byte-identical to the adopted amendment

Extracted and hashed at the start of the session and again at the end, from
`docs/v2/cards/S3.2.md`, from this card's embed in
`docs/v2/state/dispatch/S3.2.md`, and from
`docs/v2/state/S3.2-AMENDMENT-PROPOSAL-v3.md`:

| Block | sha256 | Length |
| --- | --- | --- |
| FD9 | `3e87aeb5f2e99c648ba4599e739e6ec43a8ebcfd89c47a8a895b9db1706e1d28` | 1112 → 1109 trimmed |
| FD10 | `c1a8f4558c97e211bb8a50361d7377af67c403b4ca008e9482eefbe45b46f852` | 3295 |

All three agree. The only byte difference anywhere is the amendment's own
document scaffolding immediately after the FD10 block (a closing ``` fence and its
`## C6. Verification` heading), which is not part of the gate's text. Neither
block was edited at any point in this attempt, and no threshold in
`docs/v2/CONTRACTS.md` was touched.
