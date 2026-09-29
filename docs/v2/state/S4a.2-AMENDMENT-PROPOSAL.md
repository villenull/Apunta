# S4a.2 bounded amendment proposal — for owner approval

**Status: A PROPOSAL. Nothing here is applied.** The instruction review
`docs/v2/state/reviews/S4a.2-ir.md` returned DEFECT on nine of its ten checks
(IR-01, IR-02, IR-03, IR-04, IR-05, IR-07, IR-08, IR-09, IR-10; only IR-06 is
CLEAR). Every defect is an *input* the contract assumes and the card never
supplies. This proposal supplies the inputs. It changes **no candidate, no
threshold, no metric and no contract rule**, and it adds no host.

## The same thing in plain English

1. The Spanish test audio S4a.2 has to measure was generated once, in a
   temporary folder, and that folder is gone — so this proposal says exactly
   how to make it again, and proves it is the same audio by a checksum.
2. The 2.3 GB of speech models and that audio will no longer live in a
   temporary folder that a reboot deletes; they go in one persistent,
   git-ignored folder inside the project, and a written note records what is
   already done so nothing is ever downloaded or measured twice.
3. The six candidate models have no size or fingerprint pinned in the project
   yet, so this proposal says who pins them, from which already-downloaded
   file, and before what is measured — a fingerprint you compute from the same
   bytes you are testing is not a check.
4. Six of the pass/fail measures are named but not defined, so two people could
   "pass" or "fail" the same model; this proposal writes the exact wording of
   each rule, plus the one Spanish sentence whisper is primed with, which is
   the only line here that is a clinical-copy judgement and needs your approval.
5. Two of the six measures are about speed, so this proposal forbids measuring
   while you are using the app, makes every command run inside the project's
   own isolated test folder, and requires a re-measure to start from scratch
   rather than be half-remembered.

## Proposed changes

### 1. Name how the S4a.1 audio is regenerated, and what proves it is the same audio (IR-01, IR-02)

S4a.1 is `APPROVED` in `docs/v2/state/PROGRESS.json`, but its 295 clips are a
sandbox-only artefact and are never committed (L-POLICY row 4: no voice's model
card permits redistributing generated audio — `docs/research/es-mx-speech.md`
§5.4). Its run folder
`2026-09-26T15-48-47-652Z-d7afeb16` (`docs/v2/state/cards/S4a.1.json`,
`sandboxRuns`) lived under `/tmp/apunta-v2`, which does not exist on this
machine. `e2e/fixtures/audio-es/` holds one README and nothing else. The card's
Read entry "the audio from S4a.1" is therefore a description, not a path.

**The Read section gains the regeneration instruction, verbatim from
`e2e/fixtures/audio-es/README.md` § "Regenerating it", which is the file S4a.1
wrote for exactly this purpose:**

```sh
PIPER_BIN=~/.local/share/apunta-piper/venv/bin/piper \
PIPER_MODEL=~/.local/share/apunta-piper/voices/es_MX-ald-medium.onnx \
node scripts/v2/generate-es-audio.mjs --out <dir> \
  && node scripts/v2/check-es-audio.mjs --audio <dir>
```

The card names `scripts/v2/generate-es-audio.mjs`,
`scripts/v2/check-es-audio.mjs` and `e2e/fixtures/audio-es/README.md` as the way
to (re)create the corpus, and states that the benchmark reads **`reference.json`
from the regenerated corpus** for each clip's `file`, `text`, `variant`,
`source` and `category` — never from the evidence copy, which is a record, not
an input.

**Determinism is claimed with evidence that exists, and only within the scope
the evidence supports.** AM-038 and `docs/v2/evidence/S4a.1/determinism.md`
("Attempt 2: the repair") establish that with `--noise_scale 0 --noise_w 0` and
`OMP_NUM_THREADS=1`, two generator runs are byte-identical, 295 of 295, across
two separate run directories, **on one machine with piper-tts 1.8.0 and the voice
`es_MX-ald-medium`** (voice SHA-256
`019b3803293c93e34a206dd2e53a3889209a514e786fd7144f7b70196c579b63`, 63,201,294
bytes). The per-clip hash lists that would prove byte-identity across sessions
were raw logs and were not committed, so the card does **not** claim a
cross-session per-clip comparison. It claims the one that is checkable:

- **The regeneration is accepted only if the regenerated `reference.json` is
  byte-identical to `docs/v2/evidence/S4a.1/reference.json`.** That committed
  file is 275,244 bytes, SHA-256
  `aaaa64f29cdf844fd3c8e02a068278fe1cdc640d5c1176b5856a8bb14987284f`, and it
  carries the Piper version, the `synthesis` constants, the voice name, hash and
  byte count, and all 295 clips. A mismatch is a stop (§8 below), not a rerun
  with different flags.
- `check-es-audio.mjs` must exit 0 on the regenerated corpus, which already
  fails if `noise_scale`, `noise_w` or `threads` is not the pinned value.
- V1 prints `sha256sum reference.json` and the per-class population counts
  (99 tuning / 66 heldout / 120 clinical / 5 silence / 5 tone) next to the
  numbers, so a drift is visible in the evidence without being hunted for.
- The voice is re-hashed at generation time by the generator itself and compared
  against the value in `reference.json` and in the evidence file, so a different
  voice on this machine is refused rather than silently benchmarked.

**A worker may not hand-regenerate.** Using `generate-es-audio.mjs` with
different Piper flags, a different voice, or a hand-written sentence list is not
regeneration; it is a different corpus, and the card says so in one line.

### 2. A persistent, git-ignored cache inside the project, not `/tmp` (IR-07, IR-09)

`<sandbox>/models` and `<sandbox>/audio-es` are used three times in the card
and defined nowhere, and `sandbox.mjs` reserves `/tmp/apunta-v2` as its own
namespace. The side effects here are the largest in the plan — ~2.3 GB of
weights (base 148 MB, base-q5_1 ~60 MB, small 488 MB, small-q5_1 ~190 MB,
large-v3-turbo-q5_0 ~574 MB, large-v3-turbo-q8_0 ~874 MB) plus ~400 MB of audio
and 3 h 41 m of audio per candidate — and they would all land in `/tmp`, which
is how S4a.1's corpus was lost.

**One location, named in the card:**

```
.cache/v2-stt/
  audio-es/     295 WAVs + reference.json
  models/       the six candidates + <file>.receipt.json
  runs/         per-candidate transcripts and timing records
```

`.cache/v2-stt/` is inside the repository, git-ignored, and never committed —
which is exactly what L-POLICY row 4 requires (not committed is the compliant
state), and it is *not* inside the shipped tree: no `server/`, `web/` or
`shared/` file reads it, and `installer/src/download.ts` is never imported by
`server/`, `web/` or `shared/`.

**May edit gains `.gitignore` for exactly one line**, `/.cache/v2-stt/`,
mirroring the existing `build/` entry and its stated reason (prettier reads
`.gitignore`, which keeps `prettier --check .` off the cache). The card's
Fixed decisions state the boundary in the words S4a.1 used: nothing is written
directly under `/tmp/apunta-v2`, nothing is written inside the live data folder,
and a path the generator refuses (an `--out` inside the repository) is not
bypassed.

**The corpus is produced in a sandbox run folder and then placed in the cache,
in one step, with no code change to an approved card.** `generate-es-audio.mjs`
refuses an `--out` inside the repository, and that refusal is a safety property
in a file another card owns, so this proposal does **not** propose widening it.
Instead V0 runs the generator into `$(dirname "$APUNTA_DATA_DIR")/audio-es` (the
S4a.1 location, mode 700 run folder), checks it, and copies the tree —
`*.wav` and `reference.json`, nothing else — into `.cache/v2-stt/audio-es/`,
which is verified by `sha256sum` equality with the source before the copy is
believed. A reviewer can see that no safety refusal was weakened, and the copy
is byte-preserving by construction.

**A disk pre-flight is mandatory and recorded:** `df -P .` must show at least
4 GiB free before V0 (2.3 GB of models + 0.4 GB of audio + transcripts, with
margin). Below that, V0 is `BLOCKED` with the `df` output. `installer/src/disk.ts`
is the product's own guard and is not in this path, so the card carries its own.

### 3. Pinned size and SHA-256 for each of the six candidates, from a named source, before any measurement (IR-02, IR-10; AM-052 finding 3)

The contract's result is "`SELECTED <file>` with pinned size and SHA-256", and
C-ACQ@1 rule 5 turns on the size and the digest. **The six candidates are not
catalogue entries** (`installer/src/catalog.ts:66-77`), so today no `url`, no
`sizeBytes`, no `sha1` and no `sha256` exists for any of them in the repository.
AM-052 records this as *"a card defect, not an implementer error"* for P4.1 and
carries it forward unclosed; S4a.2's Fixed decision 1 inherits it verbatim.

**The publisher's checksum source is named, and it is already on this machine,
so obtaining it costs nothing and touches no network:** the pinned whisper.cpp
source tree that P3.1 already cloned to build `whisper-cli` —
`APUNTA_WHISPER_WORK_DIR` (default `/tmp/apunta-v2/whisper-src`), revision
`371b5a7561823ab2bb32142d2751e35e7534727b` as pinned in
`scripts/build-whisper-candidate.sh` — whose `models/download-ggml-model.sh`
carries the publisher's SHA-1 per model and whose `models/README.md` carries
the sizes. This is the source `installer/src/catalog.ts:152-153` already records
as the only thing upstream publishes, and reading a file inside a source tree
that A06 already authorised and already fetched is **not** a new acquisition: no
new host, no new ACQUISITION row, no egress of any kind, and nothing is added
to hard rule 1.

**The pin itself is a separate, earlier step that produces no measurement.**
S4a.2's May edit gains `installer/src/catalog.ts` and
`installer/src/catalog.test.ts`, for exactly this and nothing else:

- a new `C_STT_CANDIDATES: readonly SpeechModelEntry[]` holding **the same six
  filenames, in the same order, as C-STT@1, A07 and P4.1 Fixed decision 8
  already name** — `ggml-base.bin`, `ggml-base-q5_1.bin`, `ggml-small.bin`,
  `ggml-small-q5_1.bin`, `ggml-large-v3-turbo-q5_0.bin`,
  `ggml-large-v3-turbo-q8_0.bin`. **The candidate list does not change.**
- each entry's `url` composed by the same expression the two existing speech
  entries use (`https://huggingface.co/ggerganov/whisper.cpp/resolve/main/<file>`),
  its `allowance` set to the `C_STT_CANDIDATE_ALLOWANCE` object that already
  exists at `installer/src/catalog.ts:74-77` for precisely this purpose, and its
  `allowedQueryKeys` set to `A07_ALLOWED_QUERY_KEYS` (the ten names AM-042
  observed, which A07's manifest cell enumerates). **No new host, no new query
  name, no wildcard.**
- each entry's `sha1` transcribed from `models/download-ggml-model.sh` in the
  pinned source tree, with the file and revision recorded in the evidence;
  `sizeBytes` from `models/README.md` where it is published, and the byte count
  the download actually reported where the README does not quote one — with the
  source of each number named per entry;
- each entry's `sha256` computed **once**, after that entry's `sha1` matched,
  and pinned there — exactly the provenance `SPEECH_MODEL.sha256` already
  records ("Apunta's own SHA-256, computed after the SHA-1 above matched, and
  pinned here afterwards"). The download runs through the hardened
  `downloadWithResume` from `installer/src/download.ts` (P4.1) under
  `C_STT_CANDIDATE_ALLOWANCE`, which is hard rule 1's one carve-out: an
  explicit, user-initiated, checksum-verified model fetch, never the server and
  never the browser tab. **A hand-rolled `fetch` anywhere in this card is
  HS-7's "loosen a guard" and is a stop, not a workaround** — `installer/dist/`
  being absent is a build problem, answered in §4 and §8.
- a test in `installer/src/catalog.test.ts` asserting: the six filenames, in
  order; that each is `C_STT_CANDIDATE_ALLOWANCE` with
  `A07_ALLOWED_QUERY_KEYS`; that no `sha256` is `null`; and that every entry's
  `url` host is inside `ALLOWED_DOWNLOAD_HOSTS`. It is an existing
  catalogue-derived offline fixture, which is the P4.1 precedent, and it makes
  no network request.

**Why this is a separate step and not part of the measurement:** a pin computed
from the same bytes the benchmark then verifies is not an independent pin, and
that is precisely the distinction C-ACQ@1 rule 5 exists to preserve. The pins
above are fixed and committed **before any `whisper-cli` run happens**, and the
six candidates are then *benchmarked against pins that already existed*. The
card's rows are ordered so this is structurally true: V0 (pins) is a row that
can only write the catalogue and the evidence, and V1 (measurement) reads the
committed catalogue. If the six `sha256` values cannot be obtained — whisper.cpp
does not publish SHA-256 for any of the six, so they can only ever come from
this project's own hash of a file whose SHA-1 matched — that is recorded per
entry as `publisherSha1Source` and `sha256Source: "apunta-computed after sha1
match"`, in the receipt and in the evidence table, so a later reader can tell
"verified against upstream" from "hashed what arrived". **That provenance is
mandatory, per entry, in the table and in `STT-SELECTION.json`.**

**A second mismatch on the same artefact after a repair is stop condition 5**,
carried verbatim from P4.1: re-downloading cannot fix a wrong pin.

**Who does it.** This is the review's own suggested correction — "naming a card
that adds the six entries to the catalogue" — and it is why the widening above is
in S4a.2 rather than in a new card: P4.1 is `APPROVED` with its scope closed
and its attempt budget spent (AM-064), and a coordinator edit to
`installer/src/` would be an unscoped code change. One card, one row, one
owner-approved May-edit widening.

### 4. Where `whisper-cli` comes from (IR-05)

The card never names the program every criterion measures. Production resolves
it from the `whisper_binary` setting, default `whisper-cli` on `PATH`
(`shared/src/transcribe.ts:64-65`), and it is not on `PATH` on this machine.

- **Default path, named in the card:** `build/linux-resources/bin/whisper-cli`,
  the A06 artefact P3.1 built from the pinned revision and
  `scripts/v2/package-linux-resources.sh` copied in. `build/` is git-ignored
  (`.gitignore`, the last entry).
- **Override:** `--whisper <path>`, and `WHISPER_CLI` as the environment
  equivalent. Both are recorded in the evidence with the path sanitised to
  `<sandbox>`/`<build>`.
- **Shared libraries need nothing.** The packaged binary resolves them through
  `RUNPATH $ORIGIN` and the SONAME symlink chain is copied beside it
  (`scripts/v2/package-linux-resources.sh:263-297`), so no `LD_LIBRARY_PATH` is
  set and none should be invented.
- **Pre-flight, before any measurement:** `--whisper <path> --help` must exit 0,
  and the build identity is recorded — the binary's own version line, the
  pinned source revision `371b5a7…`, and the presence of `libwhisper.so.1.9.3`
  beside it. A different build than the English precedent
  (`docs/eval-reports/2026-09-20-tiny-en-clinical-vocabulary.md`, "whisper.cpp
  `whisper-cli` 1.9.3-dev, CPU build") is recorded, not forbidden; the number
  only means something next to the build that produced it.
- **The binary is a read, not an edit.** Nothing in this card rebuilds
  whisper.cpp, and re-running `scripts/build-whisper-candidate.sh` is not part
  of any row (A06 reuses its existing clone, so it would be a redundant fetch).

### 5. The Spanish lead-in prompt — **needs owner approval** (IR-03)

C-STT@1 requires "the Spanish lead-in prompt" and the repository does not have
one: `STT_LEAD_IN` is `"Okay, notes from today's session."`
(`server/src/ai/whisper.ts:286`) and the vocabulary sentence is English too
(`:298`). The only card pointing at a source, S4b.1, points at
`docs/research/es-mx-speech.md`, which contains no occurrence of "prompt" at
all. This card may not create the string in production code (May edit is three
files, "Must not edit: Production code"), and it may not invent one at run time
that S4b.1 will not later ship — two different Spanish sentences would make the
measurement a measurement of nothing.

**Proposed text, one sentence, mirroring the English one's properties exactly** —
punctuation and capitalisation present, no clinical term, no name, no content,
so it biases whisper's *style* and nothing else:

```
Bueno, notas de la sesión de hoy.
```

It is passed to every `whisper-cli` invocation as `--prompt`, rendered by
`sttPrompt([])`'s rule: the lead-in alone, with no vocabulary sentence, because
C-STT@1 does not authorise a Spanish vocabulary bias and the English precedent's
vocabulary arm was a separate, separately-reported experiment.

**Two consequences the card must carry, both small:**

- `docs/research/es-mx-speech.md` gains one line recording this sentence as the
  Spanish lead-in, so S4b.1's existing Fixed decision ("taken from
  `docs/research/es-mx-speech.md`, punctuated, no clinical vocabulary") becomes
  true rather than dangling. This is a documentation edit, not production code,
  and it is listed in the May-edit widening below.
- The benchmark reports the exact `--prompt` string it used, byte for byte, in
  the table and in `STT-SELECTION.json`'s evidence, so S4b.1's wiring is
  verifiable against what was measured.

**This is the one line in the proposal that is a judgement about the owner's
clinical Spanish, and it is marked for her approval rather than assumed.** If
she prefers different words, the sentence is changed here before V0 and nowhere
else; it is never chosen after results are seen.

### 6. Definitions for the six qualifying measures (IR-03, IR-04, IR-10)

C-STT@1 names six measures and no thresholds change. What is missing is the
operational definition of each — and the review's failure scenario is exact:
"two implementers, same corpus, same models, different readings… one passes the
95% and 100% bars and the other does not, so the same six files qualify
differently, and V3 cannot adjudicate." Everything below is pinned **before any
run**, which is what the contract's "no other candidate, threshold or benchmark
may be added after seeing results" requires.

**Shared normalisation (N1–N6), applied to every reference and every
hypothesis, in this order, as a literal function in `stt-benchmark.mjs`:**

1. **N1** Unicode NFC.
2. **N2** Strip whisper's furniture exactly as `parseTranscript` does
   (`server/src/ai/whisper.ts:312-320`): a leading `[hh:mm:ss.ss --> …]`
   timestamp prefix, and any whole line that is a bracketed or parenthesised
   non-speech annotation (`[BLANK_AUDIO]`, `(music)`, `[ Silence ]`).
3. **N3** Lowercase (`String.prototype.toLowerCase` on the NFC form). Accents
   are **kept** — Spanish orthography makes them load-bearing, and stripping
   them would merge words the corpus treats as distinct.
4. **N4** Delete every character in Unicode general category `P*` (punctuation)
   and `S*` (symbols), replacing each with a space. This is what removes
   `¿`, `¡`, `,`, `.`, `-` and the like without merging the words around them.
5. **N5** Split on runs of whitespace; drop empty tokens.
6. **N6** Number normalisation, from a **finite literal table in the script**,
   listed in the card: the Spanish number words the corpus uses map to digits
   (`cero`→`0`, `uno`→`1`, …, `veintidós`→`22`, `ochenta y dos`→`82`,
   `ciento …`), `coma`→`.` so `cero coma cinco`→`0.5` and `seis y media`→`6.5`,
   and `millón`/`millones`/`mil` are **not** expanded (no clip needs it, and a
   partial expander is worse than none). Any token not in the table is left
   alone. The table is data in the script, not code, so a reviewer reads it.

**The six measures:**

| # | C-STT@1 wording | Pinned definition |
| --- | --- | --- |
| 1 | negations retained 100% | **Inventory** (literal array in the script, listed in the card): `no`, `nunca`, `jamás`, `ningún`, `ninguna`, `ninguno`, `nadie`, `nada`, `tampoco`. **`sin` is deliberately excluded** and the reason is written in the script: it is a preposition, and "sin falta", "sin metformina" and "sin drama" are not negations — including it would make the insertion measure count ordinary Spanish. **Population**, derived from `reference.json` and never hand-counted: clips whose `category` is `negation` or `lost-negation` **and** whose N5 reference tokens contain ≥1 inventory term. That is the corpus's own negation design — the 5-of-10 `negation` split S4a.1 documented and the `lost-negation` trap dictations — and it is **30 clips** (5 sentences + 5 dictations, × 3 variants); V1 prints the derived count and fails if it is not 30. **Score**, per clip: every inventory term present in the reference is present as a whole token in the N5 hypothesis. **Retained** = clips scoring 1. **Rate** = retained ÷ 30, and 100% means 30 of 30. Reported beside it, **not qualifying**: the same rate over all 177 clips in the corpus whose reference contains a negator (measured from the committed `reference.json`; V1 prints the figure). |
| 2 | inserted negations 0 | **Population: all 295 clips**, including the 5 silence and 5 tone clips — a note invented from a tone is a fabrication and the corpus contains those clips precisely so it can be caught. **An insertion** is a clip whose N5 hypothesis contains ≥1 inventory term and whose N5 reference contains none. **Count** = such clips, summed. Threshold is 0. Per-clip detail (file, the term, the transcript line) goes in the evidence, because one inserted negation is a finding, not a number. |
| 3 | numbers and doses exact ≥ 95% | **Population, structural, no regex:** clips whose `category` is `doses`, `numbers` or `dose-and-number` — that is 10 + 10 + 5 tuning + 2 held-out = **27 base texts × 3 variants = 81 clips**. A hand-written number-word pattern is exactly the ambiguity this row exists to remove: one ad-hoc pattern tested against the committed `reference.json` matches 255 of 295 clips, because `pastilla`, `dosis`, `veces` and `horas` are in almost every dictation. V1 prints the derived count and fails if it is not 81. **Score**, per clip: after N6, the **multiset** of purely numeric tokens (matching `^-?\d+(\.\d+)?$`) in the hypothesis equals the multiset in the reference — order-insensitive, multiplicity-sensitive, so a dropped repeat is a miss and a swapped dose is a miss. **Exact** = clips scoring 1. **Rate** = exact ÷ 81, and 95% is stated as the integer **77 of 81** (`ceil(0.95 × 81)`), written into the table so no implementation can disagree about the rounding. |
| 4 | preview real-time factor p95 ≤ 0.5 | **Sample set:** the **`clean` variant of the 285 speech clips** (the 10 non-speech clips are excluded: production's preview never receives a buffer of pure silence or a tone — its commit logic only ever cuts at a speech pause). **Chunking, as production does it:** each clip is cut into windows of **5.000 s** (`PREVIEW_INTERVAL_MS`, `shared/src/transcribe.ts:201`) measured from the clip start, plus one trailing partial window; a window shorter than 1.0 s is dropped and the count is recorded. **One `whisper-cli` invocation per window**, arguments: `-m <model> -f <window> --print-progress --threads <⌊cores/2⌋> --language es --prompt <Spanish lead-in> --beam-size 1 --best-of 1 --no-fallback --audio-ctx <fitted>` — greedy and half the cores, exactly `server/src/ai/whisper.ts:438-444`. **`--audio-ctx` is the fitted value**, re-implemented in the script from the four pinned constants at `server/src/ai/whisper.ts:133-162` (`50` per second, `3` s margin, floor `384`, ceiling `1500`, rounded up to a multiple of `64`) and frozen by three asserted vectors: `f(1) = 384`, `f(5) = 448`, `f(30) = 1500`. **RTF** = wall-clock seconds of the invocation ÷ the window's audio duration. **p95** = nearest-rank on the ascending list of per-invocation RTFs, 1-based index `ceil(0.95 × n)`. n is printed. |
| 5 | final transcription RTF p95 ≤ 1.0 on this PC | **Sample set: all 295 clips**, one invocation each, uncropped — the whole benchmark, because any smaller set is a choice made by the implementer. **Arguments as the note path builds them** (`server/src/ai/whisper.ts:120-128`): `-m <model> -f <clip> --print-progress --threads <cores> --language es --prompt <Spanish lead-in>`, **timestamps kept** (no `--no-timestamps`), whisper's default beam search and fallback, **no `--audio-ctx`** — the note's transcript never goes through a fitted context. **RTF** and **p95** as in row 4. The environment block (§7) is what makes this number mean anything. |
| 6 | peak memory ≤ 2 GiB | **Method: `/usr/bin/time -v`, "Maximum resident set size",** wrapped around **each final-arm invocation**, converted to bytes (`kB × 1024`). whisper.cpp reports no memory figure of its own, so this is the measurement. The candidate's figure is the **maximum over all of its final-arm invocations** — the 30-second padded encoder window is the worst case, and the preview arm's fitted context is strictly smaller, which is why measuring the final arm is sufficient and is stated as the reason. **If `/usr/bin/time` is absent, the measurement is `NOT MEASURED`, the candidate is recorded with `memory: unavailable` and does not qualify** — the same shape as the card's existing "record it as unavailable" stop, because a criterion that was not measured cannot be passed. Free RAM at the start of the run is recorded beside it. |

**Two reported metrics, neither of which qualifies anything:**

- **Word error rate** (C-STT@1 requires it "for every candidate"): Levenshtein
  distance over N5 token sequences, summed over the corpus as
  `Σ edits ÷ Σ reference tokens`, plus the same figure per `variant` and per
  `source` (`tuning` / `heldout` / `clinical` / `silence` / `tone`), and per
  candidate. Normalisation is N1–N6 above and nothing else. The English
  precedent's rule — "normalized for number words and casing"
  (`docs/eval-reports/2026-09-20-tiny-en-clinical-vocabulary.md`, § Method) —
  is the rule N6 generalises; the card says so rather than leaving the precedent
  to be re-read.
- **Clinical-term exact rate** — the **pick** metric. **Population: the 40
  `clinical` sentences × 3 variants = 120 clips.** A clip's expected terms are
  the `docs/research/es-mx-clinical-glossary.json` entries in categories
  `medication` and `unit`, plus the person names in
  `e2e/fixtures/eval-es/NAMES.md`, whose `es_mx` form matches the clip's
  reference text as a whole-token sequence after N1–N5. **Exact** = a
  whole-token-sequence match in the hypothesis. **Rate** = exact term instances
  ÷ total term instances. The derived inventory is printed with a per-class
  count, and V1 fails if fewer than 30 term instances are found across the 40
  sentences — a matcher that silently matches nothing must not pass. **The
  55-dictation term rate is reported beside it** and does **not** feed the pick:
  S4a.1's card says `source`/`category` is what lets S4a.2 report the two
  separately, and the pick rule consumes exactly one number, so the card names
  which one.

**The pick rule is unchanged and is applied mechanically:** among candidates
meeting all six, the highest clinical-term exact rate; if two are within 2
points, the smaller file. Nothing is added to it.

**Cost, stated plainly so the owner approves it with open eyes:** the final arm
is 3 h 41 m of audio per candidate and the preview arm ~24 min of windowed
audio, across six candidates — thousands of `whisper-cli` invocations and
several hours of wall clock on a quiet machine. That is why §10 is not
optional.

### 7. What `preview` and `evidence` mean in `STT-SELECTION.json` (IR-03)

The card's Fixed decision 3 says `"preview": same shape or null` without saying
of what or by what rule. Resolved inside the allowance the card already has, so
no contract change:

```json
{
  "result": "SELECTED" | "NO QUALIFYING CANDIDATE",
  "file":    "<candidate filename>" | null,
  "size":    <pinned sizeBytes, integer> | null,
  "sha256":  "<64 hex chars>" | null,
  "preview": { "file", "size", "sha256" } | null,
  "evidence": { …as below… }
}
```

- **`preview` is the same `{file, size, sha256}` object as `file`, and is `null`
  if and only if `result` is `NO QUALIFYING CANDIDATE`.** Reason, which the
  card records: C-STT@1's Pick rule selects **exactly one file**; production
  today points `whisper_preview_model` at the same file as the note model
  (`shared/src/transcribe.ts:78-93`); and S4b.1's V2 expects "the single-file
  download". A second, smaller preview model would be a **second selection the
  contract does not authorise**. If the owner ever wants one, that is a
  contract amendment with its own criterion, and it is not this card's.
- **`evidence` is one object with these keys, all values repo-relative or
  sanitised — never an absolute path, never `<sandbox>` spelled out:**

  | Key | Contents |
  | --- | --- |
  | `report` | `docs/eval-reports/<date>-es-mx-whisper-benchmark.md` |
  | `table` | `docs/v2/evidence/S4a.2/table.md` — the per-candidate table, RUN-CONFIG §4 |
  | `corpus` | `{ referenceJsonSha256, clips: 295, piper, voiceName, voiceSha256, variants, generatedUtc }` |
  | `whisper` | `{ path, versionLine, sourceRevision, library }` |
  | `machine` | `{ cores, threadsFinal, threadsPreview, backend, loadavg1Before, loadavg1After, freeMemBytes, diskFreeBytes, quiet: true }` |
  | `candidates` | one entry per candidate: `{ file, sizeBytes, sha256, sha1, publisherSha1Source, sha256Source, receipt, state, qualifies, failedCriteria[], metrics: { …the six with their raw numerators and denominators… } }` |

**The table's minimum column set is fixed by the card**, so V3 can recompute the
selection from it and the report is comparable with the English precedent:
per candidate — the six qualifying criteria each with its **raw numerator and
denominator**, word error rate (total and per variant), clinical-term exact rate
(40-sentence and 55-dictation), RTF p95 for both arms with their sample counts,
peak memory with its method, the publisher SHA-1 and its source, the SHA-256 and
its source, the receipt path, `qualifies`, and `failedCriteria` — plus one
environment block per run, not per candidate.

### 8. Every L3 command through `sandbox.mjs`, with a dispatch port (IR-05, IR-07)

The card is L3. RUN-CONFIG §2's L3 row is "the card's listed commands, all
through `sandbox.mjs`", and the dispatch says "No sandbox port assigned".

- **Port: 7812**, inside the 7800–7889 sandbox range (RUN-CONFIG §1) and not
  assigned to any other card's dispatch. 7717 is never contacted and never bound.
- **Form: `env`, not `run`, and the card says why in its own text.** Nothing
  here starts an Apunta server, opens a database or launches the app, which is
  the AM-025 precedent for a bare row. `sandbox.mjs env --port 7812` is still
  the mechanism that creates the run folder, so it is what makes `<sandbox>`
  resolvable and the run id recordable — the defect IR-07 is about. Each row is:

  ```sh
  node scripts/v2/sandbox.mjs env --port 7812 > .cache/v2-stt/s4a2.env \
    && . .cache/v2-stt/s4a2.env \
    && <the row's command, using "$(dirname "$APUNTA_DATA_DIR")" where a path is needed>
  ```

  The `env` file is written **inside the cache**, not to `/tmp`, for the reason
  in §2. Nothing is ever written directly under `/tmp/apunta-v2`.
- **The builds are part of V1, not decoration** — the P4.1 V4 lesson, stated in
  P4.1's own bold words: the benchmark reuses P4.1's hardened downloader, which
  a plain `node scripts/v2/*.mjs` can only reach as `installer/dist/`, and
  `installer/dist/` is git-ignored and absent on a clean checkout. So V1 begins:

  ```sh
  npm run build:shared && npm run build --workspace @apunta/installer
  ```

  **If `installer/dist/` is absent when a row runs, that row is `BLOCKED`.** It is
  never a reason to add an exemption, to hand-roll a `fetch`, or to edit
  `installer/` or `package.json` outside May edit (HS-7, HS-9).
- **New row V4: `npm run lint`** (which covers `eslint .`, `prettier --check .`
  and the licence check). A new `.mjs` under `scripts/` and a new `.gitignore`
  line are both inside those globs, and the card currently has no row that would
  notice either.
- **The verification table becomes:**

  | ID | Command (cwd: repo root) | Expected |
  | --- | --- | --- |
  | V0 | the pin row of §3, preceded by the two builds, then the catalogue test | exit 0; `installer/src/catalog.test.ts` lists the six entries; the six `sha256` values and their sources are committed **before any measurement**; nothing else changed |
  | V1 | `env --port 7812`; the disk pre-flight; V0's corpus regeneration from §1 into the cache (one `generate-es-audio.mjs` run, one `check-es-audio.mjs`, `reference.json` byte-identity against the evidence copy, the copy into `.cache/v2-stt/audio-es`, `sha256sum` equality); then the benchmark: `node scripts/v2/stt-benchmark.mjs --audio .cache/v2-stt/audio-es --models .cache/v2-stt/models --whisper build/linux-resources/bin/whisper-cli --out docs/v2/evidence/S4a.2/table.md` | exit 0; the per-candidate table with the columns of §7, every numerator and denominator present, the environment block present, and the run ids in the return file |
  | V2 | `node -e "const s=require('./docs/v2/state/STT-SELECTION.json');process.exit(['SELECTED','NO QUALIFYING CANDIDATE'].includes(s.result)?0:1)"` | exit 0 (unchanged) |
  | V3 | reviewer recomputes the selection from the table using C-STT@1 and §6 | same result. **V3 is the reviewer's row**, and the card says so: RUN-CONFIG §4's status words are `NOT RUN`/`PASS`/`FAIL`/`BLOCKED`, so a row no one in the implementation session can pass is recorded `NOT RUN` in the return file, never quietly `PASS` |
  | V4 | `npm run lint && npm run typecheck` | exit 0 |
  | V5 | **the negative arm** — see below | exit non-zero, and `NO QUALIFYING CANDIDATE` is written |

### 9. A quiet-machine stop rule (IR-08)

Two of the six criteria are wall-clock thresholds measured "on this PC", and
the contract's only sanctioned outcome is irreversible. The owner's own handoff
already names the hazard: "it measures speed and accuracy, so it needs a quiet
machine and must never run while the owner is testing live"
(`docs/v2/state/NEXT-SESSION.md`). This is the plan's existing shape for that —
ACQUISITION §1's four-arm rule 3, "no arm runs while the owner is testing on the
machine or a live instance is in use" — applied to one card:

1. **No run starts while the owner is testing.** The owner states in the return
   file, in one line, that the live instance is not in use and nothing else of
   hers is running. A worker cannot verify this and does not try; asking is
   cheaper than a contaminated number.
2. **The machine state is recorded with the numbers** and travels with the
   evidence: `nproc`, the load average 1-minute value sampled immediately before
   the first invocation and immediately after the last, the thread counts used
   (all cores for the final arm, `⌊cores/2⌋` for the preview), the backend, and
   free memory. `loadavg1` before the run must be **≤ 0.5**, and it is sampled
   from `/proc/loadavg` — a local read, not a contact with 7717.
3. **Mid-run contamination check.** The run samples the 1-minute load average
   every 60 s. **Three consecutive samples above 2.0 end the run**, and the
   partial table is written and preserved.
4. **The response is `BLOCKED`, with the table, not a selection.** A run whose
   recorded machine state does not meet the bar above — before or during — is
   reported `BLOCKED` with its numbers, its environment block and its load
   samples, and `STT-SELECTION.json` is **not** written. It is re-run when the
   machine is quiet, from the checkpoint (§10), not re-interpreted.
5. **Nothing is added to fix a bad number.** No benchmark, no metric and no
   threshold may be added, removed or re-weighted after results are seen
   (C-STT@1, HS-7). A `NO QUALIFYING CANDIDATE` is a real result and Spanish
   stays held (C-ES-GATE@1); it is never converted into a `SELECTED` by
   re-measuring until a number appears.

### 10. The checkpoint, so no download and no run is ever repeated (IR-09)

`docs/v2/state/cards/S4a.2.json` does not exist yet, which is normal for a card
that has not started. The defect is not the file's absence but that the card
requires nothing to be written into it, while its side effects are the largest
in the plan. This is S4a.1's own instrument — its card required the run id in
`sandboxRuns`, which is exactly what would have saved the corpus — plus P4.1's
receipt shape, which is already the right record for a model file.

**The card requires the implementation session to emit the exact checkpoint JSON
in its return file**, for the coordinator to transcribe (S4a.1's checkpoint is
coordinator-owned, `docs/v2/state/returns/S4a.1.md:182-187`; the card does not
claim the file as May edit):

```json
{
  "card": "S4a.2", "attempt": <n>, "status": "IN PROGRESS",
  "sandboxRuns": ["<every run id>"],
  "cacheDir": ".cache/v2-stt",
  "corpus": { "referenceJsonSha256": "aaaa64f2…", "clips": 295, "voiceSha256": "019b3803…", "generatedUtc": "…" },
  "candidates": [
    { "file": "ggml-base.bin", "sizeBytes": 0, "sha256": "…", "sha1": "…",
      "receipt": ".cache/v2-stt/models/ggml-base.bin.receipt.json",
      "state": "fetched and verified" }
  ],
  "lastCompletedArm": "final:ggml-small-q5_1.bin"
}
```

with `state` ∈ `not fetched` | `fetched and verified` | `benchmarked`, and the
rule, in the card's own words:

- **A file with a matching receipt is not re-fetched.** C-ACQ@1 rule 5 already
  says a fresh matching hash establishes readiness without a receipt and that a
  receipt is written only after verification; the card adds only the
  consequence: *the receipt is the record, and a file with a matching receipt is
  not downloaded again.*
- **A candidate already marked `benchmarked` is not re-benchmarked** when the
  recorded machine state (§9) is the same. If the machine state differs, that
  candidate's arm is re-run and the return says so explicitly. Arms carried over
  from an earlier session are printed from `docs/v2/evidence/S4a.2/table.md` and
  marked as carried, never re-measured silently and never silently reused.
- **A partially-downloaded candidate is resumed, not restarted** — that is
  `downloadWithResume`'s existing behaviour and the card only says not to delete
  the `.part`.
- **The cache is never wiped to "start clean".** A stale corpus or a stale model
  is replaced by deleting that one directory and saying so in the return file.

### 11. The negative arm, so `NO QUALIFYING CANDIDATE` is a tested outcome (IR-04)

One failure outcome is already well defined — a candidate that cannot be
downloaded within the approved hosts is recorded unavailable, does not qualify,
and is not substituted for. The other terminal result, the one the whole
Spanish chain waits on, has no row, no fixture and no defined way to be produced
deliberately.

**V5 is that row, and it is cheap, offline and fabricates nothing:**

```sh
node scripts/v2/stt-benchmark.mjs --audio .cache/v2-stt/audio-es \
  --models .cache/v2-stt/models --whisper build/linux-resources/bin/whisper-cli \
  --inject-metrics <docs/v2/evidence/S4a.2/fixtures/none-qualify.json> \
  --out <a temporary table outside the repo>
```

- `--inject-metrics` is a **new flag on the card's own new script** and takes a
  file of per-candidate metric sets in the table's own shape. The fixture is one
  candidate that misses one bar by one unit (e.g. negations retained 29 of 30)
  and one that passes all six.
- **The flag's meaning is fixed by the card and bounded in the same sentence:**
  it replaces the measured metric block only, it prints `INJECTED` on the table's
  header, it may write a `STT-SELECTION.json` **only** when `--out` is outside
  the repository, and it may never write to `docs/v2/state/STT-SELECTION.json`,
  `docs/eval-reports/` or `docs/v2/evidence/`. So the real selection cannot be
  produced by a fixture, and a reviewer can tell an injected table from a
  measured one at a glance.
- **Expected:** exit non-zero; `NO QUALIFYING CANDIDATE` written; the passing
  candidate named as the qualifier in the table but not selected, because the
  pick is the *script's* and the injected metrics still go through the same
  filter and the same pick rule. The fixture is fabricated numbers about
  fabricated audio (HS-8) and contains no real text.
- This also fixes the artefact's shape by the card rather than by discovery, and
  gives V3 something to recompute on both arms.

### 12. Two small clarifications the review raised outside its ten IDs

- **`docs/v2/evidence/S4a.2/` is not in May edit** and does not need to be: per
  AM-017 a required output is not a May-edit violation, exactly as for S4a.1.
  The card says so in one line so a worker does not stop to ask.
- **The ten non-speech clips** (5 silence, 5 tone, `text: ""`) count toward the
  insertion measure (row 2) and toward nothing else; they are reported
  separately in the table. That is the same family of gap as the denominators
  above, closed in the same clause.

## May-edit widening this proposal requires (for `COORDINATOR.md` §6)

| Path | For |
| --- | --- |
| `installer/src/catalog.ts` | `C_STT_CANDIDATES`: the six entries, their allowance, query keys, `sha1`, `sizeBytes`, `sha256`. Nothing else in the file changes. |
| `installer/src/catalog.test.ts` | the offline assertions listed in §3. |
| `.gitignore` | one line, `/.cache/v2-stt/`. |
| `docs/research/es-mx-speech.md` | one line recording the Spanish lead-in sentence, so S4b.1's existing decision resolves. |

`docs/v2/evidence/S4a.2/`, `.cache/v2-stt/**` and
`docs/v2/state/cards/S4a.2.json` are **not** May edit: the first is a required
output (AM-017), the second is git-ignored and generated, the third is
coordinator-owned. The three files the card already lists stay exactly as they
are, and `server/`, `web/`, `shared/`, `prototype/` and every contract file stay
untouched.

## Preserved constraints

**The candidate list is unchanged** — the same six filenames, in the same
order, as C-STT@1, A07 and P4.1's Fixed decision 8. Nothing is added, removed,
substituted or re-ordered.

**No threshold moves.** negations retained 100%; inserted negations 0; numbers
and doses exact at least 95%; preview RTF p95 at most 0.5; final RTF p95 at most
1.0; peak memory at most 2 GiB; the 2-point tie and smaller-file tiebreak. Every
number in this proposal that looks like a new number is a **denominator, a
sample set or a measurement method** — the thing C-STT@1 assumed and the card
never supplied — and each is fixed here, before any run, precisely so the
thresholds themselves are never touched afterwards.

**No contract, acceptance row or hard stop is relaxed.** HS-1 through HS-10 hold
as written. Hard rule 1 holds: the only network action this card can cause is the
six model downloads through the hardened path under `C_STT_CANDIDATE_ALLOWANCE`
(`huggingface.co`, redirect host `us.aws.cdn.hf.co`, the ten AM-042 query names),
**no new host is proposed**, the server's egress guard is untouched, and nothing
in `server/`, `web/` or `shared/` imports the downloader. The publisher's
checksum list is read from a source tree already fetched under A06 — a local
file read, not an acquisition. L-POLICY row 4 holds: generated audio is not
committed, only git-ignored. HS-8 holds: every fixture is fabricated and the
only names are those in `e2e/fixtures/eval-es/NAMES.md`. HS-7 holds: no scorer,
guard, lock, test or threshold is loosened anywhere in this proposal.

**Cost and time, so the owner approves it with open eyes:** ~2.3 GB of
downloads, ~400 MB and 3 h 41 m of regenerated audio, thousands of
`whisper-cli` invocations across six candidates, and several hours of wall clock
on a machine that is otherwise idle. The card stops for a quiet machine and
records every number with the state of the machine that produced it.

## Why approval is required

`COORDINATOR.md` §6 reserves contracts, May-edit lists and acceptance rows to the
owner, and three of this proposal's items need that authority: the four-path
May-edit widening in §3 and §5, the two added verification rows (V0's pin step
and V5's negative arm) and the new `--inject-metrics` / `--whisper` flags on the
card's own new script. The rest — naming the regeneration command, the cache
location, the metric definitions, the artefact fields, the sandbox port, the
stop rule and the checkpoint shape — is the coordinator's to write into the card
under AM-024's standing authorisation to apply a reviewer's stated corrections.

**Two items need the owner's judgement rather than a signature:**

1. **The Spanish lead-in sentence** in §5. It is the text that will bias every
   Spanish transcription her dictation produces, it is clinical-adjacent copy,
   and it must be fixed before the measurement, never after.
2. **The negation denominator** in §6, row 1. The card's own 30-clip
   negation-critical population is the corpus's designed trap set, and it is the
   reading this proposal recommends; the stricter alternative is all 177 clips
   whose reference contains a negator, which is also well defined and is
   reported. Both are defensible, the difference is whether a dropped
   function-word "no" in an ordinary dictation can disqualify a model, and it
   must be chosen once — because after results exist, no benchmark may be added
   or re-weighted, and `NO QUALIFYING CANDIDATE` is a result the release gate
   treats as final.

On approval: the coordinator applies this as one amendment row in
`docs/v2/state/AMENDMENTS.md`, rebuilds the S4a.2 dispatch at the amended base
with port 7812, and re-runs the instruction review before implementation. Nothing
in this file is a card edit, and no file other than this one has been touched.
