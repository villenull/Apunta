# Instruction review: S4a.1 Synthetic Spanish audio

Role: **INSTRUCTION REVIEW ONLY.** Base commit: `b4de6b4`, verified: `git log -1`
= `b4de6b4a9ac136db98e99460566306c980ce2dd1` ("Amend S4a.1 reference.json schema
domains per IR round 2 (AM-026)") on branch `feature/v2`; no pull, merge, rebase
or reset performed. **Round 3 of 3** (final).

Inputs: dispatch file `docs/v2/state/dispatch/S4a.1-ir.md` (amended card text,
HS-v1 hard stops, C-STT@1 excerpt, run configuration, ACQUISITION/L-POLICY@1
inlined) and its implementation twin `docs/v2/state/dispatch/S4a.1.md`; the card
of record `docs/v2/cards/S4a.1.md`; `docs/v2/state/cards/S4a.1.json`
(checkpoint); `docs/v2/state/PROGRESS.json` (read-only, per AM-023); the card's
Read artifacts — `docs/research/es-mx-speech.md` (§§5.1–5.4),
`e2e/fixtures/eval-es/**` (55 dictations, 11 trap types, 33 tuning + 22 heldout,
`NAMES.md`), `docs/research/es-mx-clinical-glossary.json` (parses),
`scripts/synthetic-acceptance/generate-audio.mjs` and
`e2e/fixtures/audio/README.md` (the English precedent); `scripts/v2/sandbox.mjs`;
`docs/v2/cards/S4a.2.md` (the consumer); `docs/v2/state/AMENDMENTS.md` for
AM-014, AM-017, AM-023, AM-024, AM-026. Read-only checks only: no implementation
command was run, no server, database or app was touched, port 7717 was never
contacted, no decision was changed, and no file was edited except this one.

The card of record and both dispatch copies carry a **byte-identical card
body** (the only differences are the mode/port header lines and the trailing
`---` separator), so there is no second text to reconcile. `git show b4de6b4`
confirms AM-026 touched only the card's `reference.json` shape bullet, the
amendment ledger, the checkpoint, both dispatches and this file — nothing any
other verdict rests on.

**Working tree.** The tree carries an unrelated, uncommitted `web/` redesign
(13 modified files), which is a background agent's in-flight work. Per
`CLAUDE.md` it was left strictly alone: nothing of it was staged, committed or
reverted, and this review committed nothing. See the note on `npm run lint`
below.

Coordinator-supplied decisions applied:

- **AM-026** — the amendment under review this round: expand the pinned
  `reference.json` schema's `source`/`category` domains so every clip is
  representable.
- **AM-024** — owner blanket authorisation to apply a review's own card-text
  corrections and re-run IR once; applied by the coordinator to round 1's nine
  corrections and again to round 2's IR-03-G.
- **AM-023** — `docs/v2/state/PROGRESS.json` is a read-only IR input.
- **AM-017** — the return file and `docs/v2/evidence/<id>/` are required
  outputs, not May-edit violations.

## IR-03-G: closed

Round 2's sole non-CLEAR asked for two things: a `source` domain, and a
`category` that can hold every clip the same card mandates. AM-026 supplies
both, and the amended text is consistent with the corpus on disk. The clip
population the card mandates, and the value each population now has:

| Population | Clips | `source` | `category` | `voice` | `text` | `variant` |
| --- | --- | --- | --- | --- | --- | --- |
| tuning dictations (33 × 3) | 99 | `tuning` | its trap type (11) | `es_MX-ald-medium` | fixture text | `clean`/`noise`/`fast` |
| held-out dictations (22 × 3) | 66 | `heldout` | its trap type (11) | `es_MX-ald-medium` | fixture text | `clean`/`noise`/`fast` |
| clinical sentences (40 × 3) | 120 | `clinical` | `drugs`/`doses`/`negation`/`numbers` | `es_MX-ald-medium` | sentence | `clean`/`noise`/`fast` |
| silence clips (5 × 1) | 5 | `silence` | `silence` | `"none"` | `""` | `clean` |
| tone clips (5 × 1) | 5 | `tone` | `tone` | `"none"` | `""` | `clean` |
| **total** | **295** | 5 values | all populated | — | — | — |

Every one of the 295 clips now has a legal value in all six fields, so V2's
"covers every clip" is satisfiable from the pinned text alone. Specifically,
checked against the fixtures rather than taken on trust:

- **The eleven trap types are exactly the eleven listed.** All eleven
  directories exist under *both* `e2e/fixtures/eval-es/tuning/` and
  `.../heldout/`, with the same names the card enumerates: `clean-control`,
  `dose-and-number`, `english-loanword`, `experiencer`, `invented-negation`,
  `lost-negation`, `past-vs-current-risk`, `section-never-covered`,
  `spoken-correction`, `uncertainty`, `unclear-speech`. Because every trap type
  is present in both splits, the `category` domain is complete for
  `source: tuning` and for `source: heldout` alike.
- **The 55/33/22 arithmetic the card and the schema both rely on is right.**
  3 `.txt` dictations per trap in tuning (11 × 3 = 33) and 2 per trap in heldout
  (11 × 2 = 22), 55 total, matching `e2e/fixtures/eval-es/README.md` and the
  directory counts; the extra file in each split is `expectations.json`, not a
  dictation. So the ~115 clips round 2 could not represent (35 dictations in the
  seven trap types that fit none of the four clinical classes, × 3 variants,
  plus the 10 non-speech clips) each now have a legal `category`.
- **`source` is derivable without guessing.** A clip's split is its fixture's
  own path (`tuning/` or `heldout/`); the clinical sentences are the literal
  array the card names; the 5 + 5 non-speech clips are the ones the Sample-rate
  bullet generates directly at 16,000 Hz. The card's own claim that the
  `source`/`category` pair "lets S4a.2 report the 55-dictation rate and the
  40-sentence rate separately and attribute them to the right split" holds: the
  two populations are disjoint by `source`, and each carries its own `category`
  vocabulary.
- **The non-speech clips are fully covered**, not merely excused: `voice` is
  `"none"`, `text` is `""`, and `category` is `silence` or `tone` "respectively",
  which is a complete rule rather than a special case.
- **No pinned decision was widened to get here.** The three clinical classes
  beyond `drugs`/`doses`/`negation`/`numbers` were not added; the amendment
  filled two previously-empty domains and gave the 10 non-speech clips a
  sentinel voice and empty text. The four-class clinical vocabulary AM-026 says
  it preserves is the same four the 40-sentence bullet already pinned.

IR-03-G is therefore closed. One narrower wording conflict remains in the same
bullet, introduced by the same amendment; see IR-03-H.

## Verdicts

| ID | Question | Answer | Reference |
| --- | --- | --- | --- |
| IR-01 | Is the objective one bounded behaviour with exact read and write scope? | CLEAR | One sentence of objective, one behaviour (a reproducible generator plus its checker). Every Read artifact exists: `es-mx-speech.md` (with §§5.1–5.4), `e2e/fixtures/eval-es/**`, the glossary (parses as a 9-key array), and the English precedent `scripts/synthetic-acceptance/generate-audio.mjs` + `e2e/fixtures/audio/README.md`. Write scope is exact and single-valued: three new files, of which the only possible repository content is `e2e/fixtures/audio-es/README.md`; all three targets are confirmed still absent. `reference.json` and the voice checksums are sandbox outputs transcribed into `docs/v2/evidence/S4a.1/`, and "Must not edit" adds "Never write generated audio into the repository", so the two-output-location ambiguity and the "commit ~10 MB of WAVs" trap both stay foreclosed |
| IR-02 | Does every prerequisite artifact exist and is it `APPROVED` in `state/PROGRESS.json`? | CLEAR | `PROGRESS.json` (read-only, per AM-023) reads `S3.1: APPROVED` and `S1.R: APPROVED` — the card's two declared dependencies — and also `P0.1`, `P0.3` (so `sandbox.mjs` exists), `S1.3` (the voice list §5.4 builds on) and `C0.1` as APPROVED. All Read artifacts exist and match what the card promises: 55 Spanish dictations in 11 trap types across 33 tuning / 22 heldout, `NAMES.md` present, the glossary parseable. Piper is still absent from this PC (`command -v piper` empty), which is not a missing prerequisite: A09 assigns that acquisition to this card, ACQUISITION §2 covers the already-present branch, and the Stop conditions say exactly what to report if it cannot be obtained. `ffmpeg`, `sha256sum`, `diff` and `node` are all present at the paths the commands use. The owner's own `eval-owner-es/` corpus is correctly still unread |
| IR-03 | Are the chosen behaviour, data shape, errors and legacy rules explicit? | DEFECT | The behaviour is fully specified (one voice, the resampler, the three variant parameters, the sentence source, the Piper contract, the output location) and round 2's IR-03-G is closed: `source` has a five-value domain and `category` now covers all 295 clips, verified clip-by-clip against the fixtures above. One residual remains, narrower and newly introduced by AM-026: the parenthetical "(`clean` only for the non-speech clips)" reads, in its most natural English sense, as forbidding `clean` on speech clips, which two other pinned bullets in the same card require. See IR-03-H |
| IR-04 | Are the happy path and at least one failure outcome testable without guessing? | CLEAR | Happy path: V1 (two independent run directories, per-file SHA-256 diff), V2 (16 kHz mono 16-bit, `reference.json` shape and coverage), V4 (lint + typecheck). Failure outcomes: V3 gives two named negatives with their expected behaviour spelled out — non-zero exit, the missing file named, no partial output directory left behind (which also forces the generator to be all-or-nothing) — plus Stop conditions for the two out-of-band failures (A09/A10 unobtainable → `BLOCKED` with the licence text; Piper non-deterministic → report it, never post-process the audio to force a hash). The determinism hole is closed by construction: the recorded seed constant, noise colour, `length_scale` and Piper version make V1's precondition inspectable, and the non-deterministic branch has a defined response. The Piper version is pinned by A09's selection rule at acquisition rather than in the card, which is correct — ACQUISITION forbids a worker substituting a version — and it must be recorded in `reference.json` and in the return file. IR-03-H is deliberately **not** counted here: both readings of the `variant` clause yield a self-consistent corpus that V1 and V2 accept, so this is a specification-consistency problem, not a testability one |
| IR-05 | Does every command name its working directory and exist in `package.json` or the repo, or is it marked as created by a named earlier card? | CLEAR | The table header names cwd repo root for all four rows. Every program in them either exists — `node`; `scripts/v2/sandbox.mjs` (P0.3, APPROVED, confirmed present); `npm run lint` = `eslint . && prettier --check . && …` and `npm run typecheck` in `package.json`; `ffmpeg`, `sha256sum`, `diff` on PATH — or is marked "(new)" in May edit (`scripts/v2/generate-es-audio.mjs`, `scripts/v2/check-es-audio.mjs`, both confirmed absent). The implied CLI surface is unambiguous and consistent: `--out <dir>` for the generator, `--audio <dir>` for the checker, the same long-flag style as S3.1's `check-es-fixtures.mjs --root <dir>` and deliberately different from the English precedent's positional path, which the card's own commands override |
| IR-06 | Are tools to be created clearly distinguished from tools that already exist? | CLEAR | Every artefact the card creates is marked "(new)": both `scripts/v2/*.mjs` scripts and `e2e/fixtures/audio-es/README.md` (the directory does not exist). Nothing existing is claimed as new, and nothing existing is claimed for editing — the English precedent is named in Read, not May edit, so its conventions are inherited rather than rewritten. Confirmed against the tree: all three targets absent, `sandbox.mjs` and the precedent present |
| IR-07 | Can every test, restart and cleanup stay inside the sandbox (C-ISO)? | CLEAR | No server, database or app is launched, so HS-2's `sandbox.mjs run` requirement is not triggered; nothing contacts 7717; nothing restarts; Piper and `ffmpeg` are dev-only subprocesses and the last Fixed-decision bullet says they are never shipped. `<sandbox>` is defined by mechanism, not by token: `sandbox.mjs env --port 7807` prints `export` lines, the worker sources them, and `$(dirname "$APUNTA_DATA_DIR")/audio-es` resolves to a sibling of `data/` **inside** the run folder. The card also forbids the one path that would do real damage — writing directly under `/tmp/apunta-v2`, which `sandbox.mjs` treats as its own namespace and reports as `leaked` — and requires the run id in the checkpoint's `sandboxRuns`, so the run folder is discoverable by the next session. V1's two output directories sit in the same run folder; `/tmp/s4a1.env` is an env file outside the root, matching RUN-CONFIG §3's own `/tmp/apunta-v2-e2e.env` pattern |
| IR-08 | Is every relevant hard stop preserved, with a concrete stop response? | CLEAR | HS-1…HS-10 are quoted in full with one concrete response each, and nothing in the amended card crosses one. HS-3 is the load-bearing one and both branches are answered: **A09** (Piper from `pypi.org`/`files.pythonhosted.org`, "only if not already installed", not shipped) and **A10** (`es_MX` voices from `huggingface.co`, not shipped) are development-only objects permitted by L-POLICY's "any OSI licence, including GPL (Piper)" row, and the pinned voice `es_MX-ald-medium` is the one `es-mx-speech.md` §5.2 records at 22,050 Hz with an Unlicense dataset — the card's "every voice is 22,050 Hz" claim is confirmed against that table — avoiding `ald/x_low`'s "no dataset licence stated". §5.2 also confirms these three are *all* the `es_MX` voices, so A10's `es_ES` fallback correctly does not trigger. L-POLICY row 4 is honoured by construction: §5.4 records that none of the five model cards checked states any position on redistributing generated audio, so "never committed" is the only compliant action, and the Stop conditions add the `BLOCKED`-with-licence-text response if a voice or its licence text is unobtainable. HS-8 is satisfiable (`NAMES.md` exists); HS-9's stop response is unreachable given the card's own required outputs; HS-5, HS-6, HS-7 and HS-10 are inert for a card that writes two dev scripts and one README, and the final Fixed-decision bullet says so |
| IR-09 | Can a fresh session resume from the checkpoint without repeating side effects? | CLEAR | `docs/v2/state/cards/S4a.1.json` records `baseCommit: "b4de6b4"` (matches the dispatch), `attempt: 1`, `status: "IN PROGRESS"`, `sideEffectsDone: []`, `changedFiles: []`, `sandboxRuns: []`, V1/V2 `NOT RUN`, and a `lastCompletedStep` that names this round and the AM-026 base. The only cross-session side effects are the A09/A10 installs, which the manifest makes idempotent ("only if not already installed") and the return file's Acquisitions section makes readable — version, URL, size, SHA-256 and licence are required there, so a resumed session reads back exactly what it must not re-fetch or re-pin. Because nothing may be committed there is no stale corpus in the repository for a later session to trust: audio is regenerated per run folder, which is what lets S4a.2 point `--audio <sandbox>/audio-es` at its own run, and the now-pinned determinism contract is what makes that safe. The `sandboxRuns` requirement means a resumed session finds the previous run folder instead of silently creating a second corpus it cannot compare against |
| IR-10 | Is the required evidence obtainable, or honestly marked missing? | CLEAR | Under AM-017 the return file and `docs/v2/evidence/S4a.1/` are required outputs, so the evidence folder is not a May-edit violation. The fields are specified (cwd, exact command, exit code, start and end time, excerpt; failures in full up to 200 lines) with sanitisation rules (`<sandbox>`, `~`, no hostnames, usernames, keys or real names) — which matter here because the evidence must quote sandbox paths and a home-directory voice path. Both artefacts round 1 could not place now have a defined home and destination: `reference.json` (sanitisable, since `file` is relative to the output directory) and the voice checksums, both "transcribed into `docs/v2/evidence/S4a.1/`". Acquisition evidence is obtainable and mandatory (ACQUISITION §1 plus the return template's Acquisitions section). All four V-rows are real, repeatable commands, so every criterion's evidence is re-runnable by a later reviewer rather than pasted; the amended schema also makes the transcribed `reference.json` self-describing enough for a reviewer to re-derive the 99/66/120/5/5 population split. Status words are defined for every case, including `NOT RUN` and `BLOCKED` |

## Defect

### IR-03-H — the new `variant` parenthetical contradicts two other pinned bullets

- **ID and location:** IR-03; "Fixed decisions", the `reference.json` shape
  bullet, the `variant` clause (`docs/v2/cards/S4a.1.md:52`; the same text at
  `docs/v2/state/dispatch/S4a.1-ir.md:103`), against the "Variants per
  dictation" bullet (`docs/v2/cards/S4a.1.md:44–47`; dispatch `:95–98`) and the
  40-sentence bullet's last sentence (card `:73`; dispatch `:124`).
- **The text that conflicts, or exactly what is missing:** the shape bullet now
  reads "`variant` is `clean|noise|fast` (**`clean` only for the non-speech
  clips**)". "`X` only for `Y`" idiomatically means *X applies only in the case
  of Y*, so on its natural reading this clause **forbids `clean` on every speech
  clip** — the 165 dictation clips and the 120 clinical-sentence clips. Two
  other bullets in the same card require exactly that:
  - "**Variants per dictation:** clean; room noise at 20 dB SNR …; speech rate
    1.15× faster" lists `clean` first, as one of three variants per dictation;
  - the 40-sentence bullet says the sentences "get **the same three
    variants**", i.e. `clean`, `noise` and `fast`.

  So the card simultaneously mandates and forbids `clean` on the 285 speech
  clips. The parenthetical is new in AM-026 — the pre-amendment text was the
  bare "`variant` is `clean|noise|fast`" — and it was evidently written to
  record the other fact, that the 10 non-speech clips take `clean` and have no
  noise or fast variant. That is a different statement, and it is the one the
  rest of the card is consistent with; as written, the clause says it with
  subject and object the wrong way round. The shape's other four fields are
  unambiguous by contrast, because each names its exception explicitly ("or
  `"none"` **for** the 10 non-speech clips", "or `""` **for** the 10 non-speech
  clips").
- **One concrete failure scenario:** the worker writes the generator and the
  checker in one session, so the checker encodes whichever reading they chose
  and V2 goes green either way — the evidence then reads "shape matches" and a
  reviewer cannot tell which corpus was produced. Suppose they take the clause
  at face value: the generator emits no `clean` variant for any speech clip, so
  the corpus is 190 speech clips (95 dictations + 95 sentences at
  `noise`/`fast`) plus 10 non-speech, i.e. **200 clips instead of the 295** the
  rest of the card mandates, and the corpus silently loses its clean control
  arm — the arm against which the noise and fast variants are the whole point of
  having them. Nothing downstream reports the loss: S4a.2 runs C-STT@1 against
  whatever `--audio` directory it is handed, so "negations retained 100%" and
  "numbers and doses exact at least 95%" would be decided on degraded audio
  only, and a candidate that merely handles noise well could be selected ahead
  of one that is accurate on clean read speech. The converse mistake is equally
  silent: a checker that asserts `clean ⇒ non-speech` rejects the clean
  dictation clips the Variants bullet requires, and the worker is left choosing
  which pinned bullet to violate.
- **One specific correction or named prerequisite:** reverse the clause so its
  subject is the non-speech clips — change `(`clean` only for the non-speech
  clips)` to **`(the 10 non-speech clips are `clean` only)`** (or, equivalently,
  add "the 10 non-speech clips take `clean` and no other variant" to the
  Sample-rate bullet and drop the parenthetical). One clause, inside the bullet
  AM-026 already touched, changing no contract, threshold, dependency,
  acquisition item, hard stop, licence decision or acceptance intent — squarely
  inside the AM-024/AM-026 authorisation. No other edit is needed for IR-03.

## Notes not counted against the ten IDs

- **Negated vs inserted-negation inside the `negation` class.** The 40-sentence
  bullet's four classes are "drugs, doses with decimals and units, negated and
  inserted-negation risk statements, numbers as words", and AM-026 maps that to
  four `category` values — so the negation class holds 10 sentences covering
  two distinct phenomena, with the internal split (5+5, or any other division)
  left to the worker. C-STT@1 does measure the two separately ("negations
  retained 100%; inserted negations 0"), so this was weighed as a defect and
  is not: both are computable from `category: negation` plus the `text` the
  schema already records per clip — "retained" is a negation present in the
  transcript as in the reference, "inserted" is a negation in the transcript
  that the reference does not contain. The corpus side needs no such inference,
  since `invented-negation` and `lost-negation` are already distinct trap
  types. Worth the coordinator's awareness, not a defect.
- **`voices[]` cross-check is not mandated.** The card gives a clip's `voice` as
  the voice name or `"none"`, and `voices[]` entries `name`/`sha256`/`bytes`,
  but does not require every clip's `voice` to appear in `voices[].name` (and
  `"none"` has no checksum to record). A checker asserting that cross-reference
  is therefore not required, and none should be inferred. Not a defect; the
  field is defined, the cross-check is simply not part of the contract.
- **`ffmpeg` resampler flags are not pinned.** The card fixes the tool, the
  target rate, channel count and bit depth, and the version goes in the
  Acquisitions record; the filter chain (`-ar 16000 -ac 1` with the default `swr`
  resampler versus `soxr`) is left to the script. It cannot change any
  criterion's outcome — V1 compares the script against itself and V2 checks
  rate/channels/depth — and the command appears in the script and the evidence.
- **The seed's numeric value is not in the card**, only the requirement that the
  generator write "the RNG seed constant" into `reference.json`. That suffices
  for V1 (one constant, same script, two runs) and the value is recorded, so no
  guessing is required. "White noise, seeded, per clip" reads as a seed derived
  per clip from the constant, which is deterministic; a per-clip clock or
  `randomBytes` seed would be caught by V1, and the non-determinism Stop
  condition covers the report.
- **V1 uses process substitution** (`diff <(…) <(…)`), the one non-POSIX
  element in the plan's command set; it needs bash, which this plan already
  assumes (`&&`, `$(…)`, `. file`). A `sh`-proof form is `sha256sum … > f`
  twice then `diff f g`. Worth knowing only if the plan must run under `dash`.
- **V3's two path arguments are placeholders** (`<copy-with-one-wav-removed>`,
  `<fresh-dir>`) rather than `$(dirname "$APUNTA_DATA_DIR")`-bound paths as in
  V1/V2 — the same phrasing S3.1's V3 uses (AM-019). The row's own constraint, a
  copy outside the shipped tree, is what keeps it out of a May-edit violation;
  the one reading to avoid is a copy directly under `/tmp/apunta-v2` rather than
  in the run folder, which the Fixed-decision bullet already forbids.
- **`npm run lint` runs `prettier --check .` over the whole repository**, and
  the tree still carries the unrelated uncommitted `web/` redesign. If that work
  is not prettier-clean, V4 can fail for reasons outside this card. The
  implement session must stage explicit paths only (HS-4) and must not commit
  any of it; this review committed nothing and edited only this file.
- **The A09/A10 answer, unchanged from rounds 1 and 2:** acquiring Piper and the
  `es_MX` voices is permissible (both name S4a.1, both are not shipped, Piper is
  covered by L-POLICY's dev-only-tools row), and for **any** committed audio the
  answer is no, because no voice's model card permits redistributing generated
  audio (`es-mx-speech.md` §5.4).
- **AM-014 needed no application:** level L1, no markdown prettier row named.

Summary: **not CLEAR on IR-03** — one defect, IR-03-H: AM-026's parenthetical
"(`clean` only for the non-speech clips)" reads as forbidding `clean` on the
285 speech clips, which the "Variants per dictation" bullet and the 40
sentences' "same three variants" both require; a one-clause reversal closes it.
Round 2's IR-03-G **is** closed — `source` now has a five-value domain and
`category` covers all 295 clips, verified against the eleven trap directories
and the 33/22/40/5+5 population split. CLEAR on IR-01, IR-02, IR-04, IR-05,
IR-06, IR-07, IR-08, IR-09, IR-10, all nine of which rest on text AM-026 did not
touch and on facts re-verified against the tree at `b4de6b4`.
