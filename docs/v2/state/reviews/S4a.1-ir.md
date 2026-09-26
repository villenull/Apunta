# Instruction review: S4a.1 Synthetic Spanish audio

Role: **INSTRUCTION REVIEW ONLY.** Base commit: `d6ae500`, verified: `git log -1`
= `d6ae500865da92b9b62c6daf408d4151b3fb4bf3` ("Amend S4a.1 card text per IR
round 1 (AM-024, blanket-authorised)") on branch `feature/v2`; no pull, merge,
rebase or reset performed. **Round 2 of 2** (final).

Inputs: dispatch file `docs/v2/state/dispatch/S4a.1-ir.md` (amended card text,
HS-v1 hard stops, C-STT@1 excerpt, run configuration, ACQUISITION/L-POLICY@1
inlined) and its implementation twin `docs/v2/state/dispatch/S4a.1.md`; the card
of record `docs/v2/cards/S4a.1.md`; `docs/v2/state/cards/S4a.1.json`
(checkpoint); `docs/v2/state/PROGRESS.json` (read-only, per AM-021); the card's
Read artifacts — `docs/research/es-mx-speech.md` (§§5.1–5.4, voices, sample
rates, L-POLICY row 4 verdict), `e2e/fixtures/eval-es/**` (55 dictations, 11
trap types, 33 tuning + 22 heldout, `NAMES.md`), `docs/research/es-mx-clinical-glossary.json`
(parses), `scripts/synthetic-acceptance/generate-audio.mjs` and
`e2e/fixtures/audio/README.md` (the English precedent now named in Read);
`scripts/v2/sandbox.mjs` (`env` subcommand, `SANDBOX_ROOT`, `printEnv`);
`scripts/v2/check-es-fixtures.mjs` (S3.1's house-style checker);
`docs/v2/cards/S4a.2.md` (the consumer); `docs/v2/state/AMENDMENTS.md` for
AM-014, AM-017, AM-021, AM-024. Read-only checks only: no implementation
command was run, no server, database or app was touched, port 7717 was never
contacted, no decision was changed, and no file was edited except this one.

The card of record and both dispatch copies carry a **byte-identical card
body** (the only difference is two trailing blank lines and the `---`
separator in the dispatches), so there is no second text to reconcile.

**HEAD drift observed (not caused by this session).** When the review started
HEAD was the required `d6ae500`; while it ran, a parallel coordinator session
committed `c8b656b` ("Amend P0.5 test-isolation line per IR round 1 (AM-025)"),
moving HEAD to `c8b656b`. That commit touches only P0.5 card/dispatch/review
files and `AMENDMENTS.md`; no S4a.1 card, dispatch, Read artifact or checkpoint
changed, so this review's basis is unaffected. No pull, merge, rebase or reset
was performed here, and this review committed nothing.

Coordinator-supplied decisions applied:

- **AM-024** — owner blanket authorisation to apply this review's own
  card-text corrections and re-run IR once. Applied to all nine round-1
  corrections (IR-01-A, IR-03-A…F, IR-04-A, IR-04-B, IR-05-A, IR-07-A); the
  ledger below closes each one.
- **AM-021 / AM-023** — `docs/v2/state/PROGRESS.json` is a read-only IR input.
- **AM-017** — the return file and `docs/v2/evidence/<id>/` are required
  outputs, not May-edit violations.
- **AM-014** — markdown prettier rows are non-binding. S4a.1 is level L1 and
  names no prettier row, so nothing here turns on it.

## Round-1 defect ledger (all nine closed)

| Round-1 ID | Asked for | Where it now lives | Closed |
| --- | --- | --- | --- |
| IR-01-A | a home for `reference.json` and the voice checksums; one authoritative output location | "May edit": the three repository files only; "Generated audio is **never committed** (L-POLICY row 4); `reference.json` and the voice checksums are sandbox outputs transcribed into `docs/v2/evidence/S4a.1/`, not repository files." "Must not edit" adds "Never write generated audio into the repository." | yes |
| IR-03-A | a named resampler; silence/tone generated at 16 kHz directly | "Sample rate": 22,050 → **16,000 Hz mono 16-bit PCM via `ffmpeg`**, silence and tone clips generated directly at 16,000 Hz | yes |
| IR-03-B | the exact `length_scale` for 1.15× faster; noise colour; the seed; per-clip SNR | "Variants per dictation": white noise, 20 dB SNR, seeded, per clip; `length_scale` `1/1.15 ≈ 0.8696`; the seed constant, noise colour, `length_scale` and Piper version written into `reference.json` | yes |
| IR-03-C | the `reference.json` schema, `file` relativity, `category` domain, checksums named | "**`reference.json` shape**" pins the literal skeleton, `variant` as `clean\|noise\|fast`, `category` as one of the four classes, and the checksums as `voices[].sha256` | yes (one residual, IR-03-G below) |
| IR-03-D | the voice count and the voice→clip mapping | "Voices: one voice for the whole corpus — `es_MX`-ald-medium, per `es-mx-speech.md` §5.4"; other voices optional extras only if a later card asks; count and per-clip mapping recorded in `reference.json` | yes |
| IR-03-E | where the 40 sentences live, their split, their variants, drug/name sourcing | a literal array in `scripts/v2/generate-es-audio.mjs` (no new data file), 10 per class, drugs from the glossary, person names only from `NAMES.md`, additional to the 55, in neither split, same three variants | yes |
| IR-03-F | the Piper invocation contract; the voice file's location | "Piper invocation contract": `PIPER_BIN` / `PIPER_MODEL`, "exactly as the English precedent does", both outside the repository; version, URL, size, SHA-256 and licence recorded under A09/A10; the precedent added to Read | yes |
| IR-04-A | the determinism contract; two `--out` directories | V1 now generates into `audio-es-a` and `audio-es-b` and diffs per-file `sha256sum`; the generator records seed, noise colour, `length_scale` and Piper version; a Stop condition covers non-determinism ("report it (do not post-process the audio to force a hash)") | yes |
| IR-04-B | a negative row and stop conditions | V3 (two negative cases) and a "Stop conditions" section | yes |
| IR-05-A | a real command for V2 | V2 is now `node scripts/v2/check-es-audio.mjs --audio "$(dirname "$APUNTA_DATA_DIR")/audio-es"`, and the checker is in May edit marked "(new)" | yes |
| IR-07-A | `<sandbox>` defined; run id recorded | "Output location (sandbox)": `sandbox.mjs env --port 7807`, source the printed exports, write to `$(dirname "$APUNTA_DATA_DIR")/audio-es`, never directly under `/tmp/apunta-v2`, run id into the checkpoint's `sandboxRuns` | yes |

## Verdicts

| ID | Question | Answer | Reference |
| --- | --- | --- | --- |
| IR-01 | Is the objective one bounded behaviour with exact read and write scope? | CLEAR | One sentence of objective, one behaviour (a reproducible generator plus its checker). Read is exact and every artifact exists: `es-mx-speech.md`, `e2e/fixtures/eval-es/**`, the glossary JSON, and now the English precedent and its README — the last two added by AM-024, which closes round 1's IR-06 observation as a side effect. Write scope is now exact and single-valued: three new files, of which the only possible repository content is `e2e/fixtures/audio-es/README.md`; `reference.json` and the voice checksums are sandbox outputs that live in the evidence folder (a required output under AM-017 and RUN-CONFIG §4). The two-output-location ambiguity is gone, and "Never write generated audio into the repository" forecloses the round-1 trap in which a worker read the old WAV entry as permission to commit ~10 MB. A repo-wide grep confirms no other file, script, test or Playwright config expects a committed `audio-es/` path, so the sandbox-only corpus breaks nothing downstream |
| IR-02 | Does every prerequisite artifact exist and is it `APPROVED` in `state/PROGRESS.json`? | CLEAR | `PROGRESS.json` (read-only, per AM-021) reads `"S3.1": "APPROVED"` and `"S1.R": "APPROVED"` — the card's two declared dependencies; also relevant and approved: `S1.3` (the voice list `es-mx-speech.md` §5.4 builds on), `P0.3` (`sandbox.mjs` exists, so C-ISO tooling is available), `P0.1`, `C0.1`. All four Read artifacts exist and match what the card promises of them: the 55 Spanish dictations (33 tuning + 22 heldout, 11 trap types, `NAMES.md` with the 110 invented people) and the glossary. Piper is still absent from this PC (`command -v piper` empty), which is not a missing prerequisite — A09 assigns that acquisition to this card, ACQUISITION §2 covers the already-present branch, and the new Stop conditions say exactly what to report if it cannot be obtained. `ffmpeg`, `sha256sum` and `diff` are all present at the paths the commands use. The owner's separate `e2e/fixtures/eval-owner-es/` corpus is correctly still not read |
| IR-03 | Are the chosen behaviour, data shape, errors and legacy rules explicit? | DEFECT | Round 1's six gaps (IR-03-A…F) are all closed and the behaviour is now fully specified: one voice, the resampler, the three variant parameters, the sentence source, the Piper contract, the output location. One residual remains, in the data shape: the pinned schema's `category` domain cannot hold the clip population the same card mandates, and `source` has no domain at all. See IR-03-G |
| IR-04 | Are the happy path and at least one failure outcome testable without guessing? | CLEAR | Happy path: V1 (two independent run directories, per-file SHA-256), V2 (16 kHz mono 16-bit, `reference.json` shape and coverage), V4 (lint + typecheck). Failure outcomes: V3 gives two named negatives with their expected behaviour spelled out — non-zero exit, the missing file named, and no partial output directory left behind (which also forces the generator to be all-or-nothing) — plus a Stop conditions section for the two out-of-band failures (A09/A10 unobtainable → `BLOCKED` with the licence text; Piper non-deterministic → report, never post-process to force a hash). The round-1 determinism hole is closed by construction: the recorded seed constant, noise colour, `length_scale` and Piper version make V1's precondition inspectable, and the non-deterministic branch now has a defined response instead of inviting a hash-forcing fix. The version is pinned by A09's selection rule at acquisition rather than in the card, which is correct — ACQUISITION forbids a worker substituting a version — and it must be recorded in `reference.json` and in the return file |
| IR-05 | Does every command name its working directory and exist in `package.json` or the repo, or is it marked as created by a named earlier card? | CLEAR | The table header names cwd repo root for all four rows. Every program in them either exists (`node`; `scripts/v2/sandbox.mjs` from P0.3, APPROVED; `npm run lint` and `npm run typecheck` at `package.json:23,25`; `ffmpeg`/`sha256sum`/`diff` on PATH) or is marked "(new)" in May edit (`scripts/v2/generate-es-audio.mjs`, `scripts/v2/check-es-audio.mjs`). The CLI surface the commands imply is unambiguous: `--out <dir>` for the generator, `--audio <dir>` for the checker — the same long-flag style as S3.1's `check-es-fixtures.mjs --root <dir>`, and deliberately different from the English precedent's positional output path, which the card's own commands override |
| IR-06 | Are tools to be created clearly distinguished from tools that already exist? | CLEAR | Every artefact the card creates is marked "(new)": both `scripts/v2/*.mjs` scripts (neither exists today) and `e2e/fixtures/audio-es/README.md` (the directory does not exist). Nothing existing is claimed as new, and nothing existing is claimed for editing — the English precedent is named in Read, not May edit, so its conventions are inherited rather than rewritten. Round 1's non-blocking observation (the precedent was absent from Read) is closed |
| IR-07 | Can every test, restart and cleanup stay inside the sandbox (C-ISO)? | CLEAR | No server, database or app is launched, so HS-2's `sandbox.mjs run` requirement is not triggered; nothing contacts 7717; nothing restarts; Piper and `ffmpeg` are dev-only subprocesses. `<sandbox>` is now defined by mechanism rather than by token: `sandbox.mjs env --port 7807` prints `export` lines (`sandbox.mjs:296–307`, verified in `printEnv`), the worker sources them, and `$(dirname "$APUNTA_DATA_DIR")/audio-es` resolves to a sibling of `data/` **inside** the run folder. The card also forbids the one path that would have caused real damage — writing directly under `/tmp/apunta-v2`, whose top-level listing `sandbox.mjs` treats as its own namespace and reports as `leaked` (`:390`, `:479`) — and requires the run id in the checkpoint's `sandboxRuns`, so the run folder is discoverable by the next session. V1's two output directories sit in the same run folder; `/tmp/s4a1.env` is an env file outside the root, matching RUN-CONFIG §3's own `/tmp/apunta-v2-e2e.env` pattern |
| IR-08 | Is every relevant hard stop preserved, with a concrete stop response? | CLEAR | HS-1…HS-10 are quoted in full with one concrete response each, and nothing in the amended card crosses one. HS-3 is the load-bearing one and both branches are answered: **A09** (Piper, `pypi.org`/`files.pythonhosted.org`, "only if not already installed", not shipped) and **A10** (`es_MX` voices from `huggingface.co`/rhasspy/piper-voices, not shipped) are permitted as development-only objects under L-POLICY's "any OSI licence, including GPL (Piper)" row, and the pinned voice is `es_MX-ald-medium` — the one `es-mx-speech.md` §5.2 records with an Unlicense dataset, avoiding `ald-x_low`'s "no dataset licence stated". L-POLICY row 4 is honoured by construction: `es-mx-speech.md:148–154` is unambiguous that no voice's model card permits redistributing generated audio, so "never committed" is the only compliant action, and the Stop conditions add the `BLOCKED`-with-licence-text response if a voice or its licence text is unobtainable. HS-8 is satisfiable (NAMES.md exists); HS-9's stop response is no longer reachable by the card's own required outputs; HS-5, HS-6, HS-7 and HS-10 are inert for a card that writes two dev scripts and one README, and the last Fixed-decision bullet says so explicitly |
| IR-09 | Can a fresh session resume from the checkpoint without repeating side effects? | CLEAR | `docs/v2/state/cards/S4a.1.json` records `baseCommit: "d6ae500"` (matches the dispatch), `attempt: 1`, `status: "IN PROGRESS"`, `sideEffectsDone: []`, `changedFiles: []`, `sandboxRuns: []`, V1/V2 `NOT RUN`, and a `lastCompletedStep` that names this round. The only cross-session side effects are the A09/A10 installs, which the manifest makes idempotent ("only if not already installed") and the return file's Acquisitions section makes readable — the card requires version, URL, size, SHA-256 and licence to be written there, so a resumed session reads back exactly what it must not re-fetch or re-pin. Because nothing may be committed, there is no stale corpus in the repository for a later session to trust: the audio is regenerated per run folder, which is also what lets S4a.2 point `--audio <sandbox>/audio-es` at its own run (`docs/v2/cards/S4a.2.md:41`) — the determinism contract is what makes that safe, and it is now pinned. The new `sandboxRuns` requirement means a resumed session can find the previous run folder instead of creating a second corpus it cannot compare against |
| IR-10 | Is the required evidence obtainable, or honestly marked missing? | CLEAR | Under AM-017 the return file and `docs/v2/evidence/S4a.1/` are required outputs, so the evidence folder is not a May-edit violation. The fields are specified (cwd, exact command, exit code, start and end time, excerpt; failures in full up to 200 lines) with sanitisation rules (`<sandbox>`, `~`, no hostnames, usernames, keys or real names) — which matter here because the evidence must quote sandbox paths and a home-directory voice path. The two artefacts round 1 could not place now have a defined home and a defined destination: `reference.json` (sanitisable, since `file` is relative to the output directory) and the voice checksums, both "transcribed into `docs/v2/evidence/S4a.1/`". Acquisition evidence is obtainable and mandatory (ACQUISITION §1 plus the return template's Acquisitions section). All four V-rows are now real, repeatable commands, so every criterion's evidence is re-runnable by a later reviewer rather than a pasted one-liner. Status words are defined for every case, including `NOT RUN` and `BLOCKED` |

## Defect

### IR-03-G — the pinned `reference.json` schema cannot represent the clip population the card itself mandates

- **ID and location:** IR-03; "Fixed decisions", the `reference.json` shape
  bullet (`docs/v2/cards/S4a.1.md:48–52` in the card of record; the same text at
  `docs/v2/state/dispatch/S4a.1-ir.md:99–102`), against the 40-sentence bullet
  (`:103–109`) and V2 (`:127`).
- **The text that conflicts, or exactly what is missing:** the shape is
  `{"version":1,"piper":"<version>","voices":[{"name","sha256","bytes"}],"clips":[{"file","text","voice","variant","source","category"}]}`,
  and the card says "`category` is one of the four sentence classes below" —
  drugs, doses with decimals and units, negated and inserted-negation risk
  statements, numbers as words. V2 then requires that `reference.json`
  "matches its shape and **covers every clip**", so every clip in the output
  directory needs a `category` from those four. But the four classes only
  describe the 40 extra sentences. The 55 corpus dictations are eleven trap
  types (`e2e/fixtures/eval-es/*/*/`: clean-control, dose-and-number,
  english-loanword, experiencer, invented-negation, lost-negation,
  past-vs-current-risk, section-never-covered, spoken-correction, uncertainty,
  unclear-speech) and seven of them — clean-control, english-loanword,
  experiencer, section-never-covered, spoken-correction, uncertainty,
  unclear-speech, 35 fixtures — fit none of the four classes; and the 5 silence
  plus 5 tone clips are not speech at all, so they have no `text` and no
  `voice` either, while the shape requires both keys. That is roughly 115 of
  the corpus with no legal value for a required field. Separately, **`source`
  has no stated domain at all**, and it is the only field that could carry a
  clip's provenance — which split, which trap type, whether the text came from
  the corpus or from the 40-extra literal array.
- **One concrete failure scenario:** the worker hits V2 and has to pick a
  resolution on their own, because each of the available moves deviates from a
  pinned decision: omit `category` (breaks "matches its shape"), write `null`
  or `""` (same), or extend the enum to the trap types (contradicts "one of the
  four sentence classes"). Suppose they extend it to the trap type — a
  defensible reading, and the one a careful worker reaches for — then the
  checker they wrote in the same session passes, V2 is green, and the evidence
  reads "shape matches". A reviewer cannot tell from the evidence that a pinned
  decision was widened, because the checker and the corpus came from one
  session. Worse for the consumer: with `source` reduced to a free-text guess,
  S4a.2 cannot attribute a clinical-term exact rate to the tuning or held-out
  split — the split S3.1 built deliberately and re-derives in
  `check-es-fixtures.mjs` — and cannot report the 40-extra denominator
  separately from the 55, so the two populations silently merge into one rate
  that C-STT@1's thresholds then rest on. The failure is invisible at review
  time and only surfaces as an uninterpretable number in the selection report.
- **One specific correction or named prerequisite:** two added clauses to the
  same Fixed-decision bullet, keeping the rest of the shape as pinned —
  (a) define `source` as the provenance string, e.g.
  `source` is `eval-es:<tuning|heldout>:<trap-type>:<fixture-id>` for the 55
  corpus dictations, `clinical-term` for the 40 extra sentences, and
  `synthetic` for the 5 silence and 5 tone clips; and (b) widen `category` to
  cover the whole population, e.g. `category` is one of the four clinical-term
  classes for the 40 extra sentences, the matching trap type for a corpus
  dictation that falls in one of them, and `null` for a dictation that falls in
  none and for the silence and tone clips — with the checker asserting exactly
  that. Then have V2 read "matches its shape, every clip's `source` parses and
  every `category` is one of the allowed values for its `source`" instead of
  the bare "matches its shape". The sibling card already pins its own JSON
  shape this precisely (`docs/v2/cards/S4a.2.md:44`), so this is house style,
  not new scope. If the coordinator prefers not to widen the enum, the
  alternative one-line fix is to make `source` the required provenance field
  and `category` optional-for-none, stated as such in the same bullet.

## Notes not counted against the ten IDs

- **`ffmpeg` resampler flags are not pinned.** The card fixes the tool, the
  target rate, channel count and bit depth, and the version goes in the
  Acquisitions record; the exact filter chain (`-ar 16000 -ac 1` with the
  default `swr` resampler versus `soxr`) is left to the script. It cannot change
  any criterion's outcome — V1 compares the same script against itself, and V2
  checks rate/channels/depth — and the command is in the script and in the
  evidence, so a reviewer can see it. Noted for the record, not a defect.
- **The seed's numeric value is not in the card**, only the requirement that
  the generator writes "the RNG seed constant" into `reference.json`. That is
  sufficient for V1 (one constant, same script, two runs) and the value is
  recorded, so no guessing is required. The wording "white noise, seeded, per
  clip" reads as a seed derived per clip from the constant, which is
  deterministic; a per-clip clock or `randomBytes` seed would be caught by V1
  itself, and the non-determinism Stop condition covers the report.
- **V1 uses process substitution** (`diff <(…) <(…)`), the one non-POSIX
  element in the plan's command set; it needs bash, which is the shell the
  agents and this plan already assume (`&&`, `$(…)`, `. file`). A `sh`-proof
  form is `sha256sum … > f` twice then `diff f g`. Not counted; worth knowing
  if the plan ever has to run under `dash`.
- **V3's two path arguments are placeholders** (`<copy-with-one-wav-removed>`,
  `<fresh-dir>`) rather than `$(dirname "$APUNTA_DATA_DIR")`-bound paths as in
  V1/V2. This is the same phrasing S3.1's V3 uses (AM-019), and the row's own
  constraint — a copy outside the shipped tree — is what keeps it out of a
  May-edit violation. The one reading to avoid is putting the copy under
  `/tmp/apunta-v2` directly rather than in the run folder; the Fixed-decision
  bullet already forbids that path.
- **`npm run lint` runs `prettier --check .` over the whole repository**, and
  the working tree currently carries an unrelated, uncommitted `web/` UI
  redesign (13 modified files plus two new components, acknowledged in the
  checkpoint's `lastCompletedStep`). If that work is not prettier-clean, V4 can
  fail for reasons outside this card. The implement session must stage explicit
  paths only (HS-4) and must not commit any of it; this review committed
  nothing and edited only this file.
- **The A09/A10 answer, unchanged from round 1:** acquiring Piper and the
  `es_MX` voices is permissible (both name S4a.1, both are not shipped, Piper
  is covered by L-POLICY's dev-only-tools row), and for **any** committed audio
  the answer is no, because no voice's model card permits redistribution of
  generated audio (`es-mx-speech.md:148–154`). The amended card now says that
  in "May edit" instead of leaving it as a condition attached to an unused WAV
  entry, which removes the trap rather than documenting it.
- **AM-014 needed no application:** level L1, no markdown prettier row named.

Summary: **not CLEAR on IR-03** (one defect, IR-03-G: the pinned
`reference.json` schema has no legal `category` for ~115 of the card's own
clips, and `source` has no stated domain). CLEAR on IR-01, IR-02, IR-04, IR-05,
IR-06, IR-07, IR-08, IR-09, IR-10. All nine round-1 defects are closed by the
AM-024 amendments; the one correction proposed here is inside the card's own
Fixed-decision bullet and Verification row, and changes no contract, threshold,
dependency, acquisition item, hard stop or licence decision.
