# MODEL-STUDY — corpus repair attempt 2 of 2 (cue/proposition collisions)

**Implementer identity:** second repair implementer, dispatched by the
coordinator. **Distinct from** the corpus author (archived), from the bilingual
gold reviewer whose findings were implemented in pass 1, from the independent
freeze reviewer whose §3/§4/§5/§8 findings this pass answers, and from the pass-1
repair implementer. I repaired the corpus; **I approve nothing by writing this
file and I certify nothing.**

**Date:** 2026-09-27. **Stage:** post-repair-2, pre-freeze. No scored model
output exists, so nothing here is a result, a comparison, or a clinical
certification. I am not a clinician and not a certified es-MX clinical linguist.
**Neither this pass nor any AI output certifies clinical quality.**

**Read:** `docs/research/local-model-study-plan-2026-09-27.md`,
`docs/v2/evidence/MODEL-STUDY/{corpus-review.md,corpus-repair.md,corpus-freeze-review.md}`,
and the corpus at `/home/villenull/.cache/apunta-model-study/2026-09-27/corpus`
inspected directly.
**Not read:** `review/alias-map.sealed.json` (hashed only, to confirm it is
untouched), `review/make-aliases.mjs`, `review/blind-spec.md`, any
`e2e/fixtures/*es/heldout/**` transcript, any `eval-es/` file other than the
`NAMES.md` **registry**, and anything under `harness/` or `runs/`, which belong to
the executor.
**Written:** eight files inside the corpus directory and this file. No repository
source edit, no scratch write outside the corpus, no inference, no network, no
server, no app, no database, no port 7717, no live data, **no commit**.

---

## 1. Verdict and scope

**The enumerated defect class is closed: 16 → 0.** I re-derived the reviewer's 16
collisions independently before changing anything and reproduced them exactly
(16 hits, 9 scored records, direction A, `proposition` + `source` + `any`). After
the repair the same screen reports **0 hits**. Stated precisely, because the
number is not a single thing: an unexcepted sweep now returns **2**, and both
are the documented retracted-source entries of §6.2 — the two `source` spans
that must contain a retracted figure because the input records the correction
alongside it. Direction B returns 12, all adjudicated in the register of §6.1.
So: 0 unadjudicated collisions, 2 adjudicated exceptions, 12 adjudicated
proximities.

**The corpus is still `status: DRAFT` / `reviewState:
draft-pending-bilingual-review`, and this pass does not change that.** An
independent final verification is still owed. I am not that verification and I
have not tried to be it.

Scope I held to, and scope I deliberately did not take, is in §7. The one place
I went past a literal cue-string edit — restating four S04 propositions — is
argued in §3.4 and is the minimum needed to make the gold consistent with itself.

---

## 2. Reproducible verification — pinned Node, exact exit codes

```
export PATH=/home/villenull/.local/share/mise/installs/node/24.19.0/bin:$PATH
cd /home/villenull/.cache/apunta-model-study/2026-09-27/corpus

node -v                                 v24.19.0
node validate-corpus.mjs                EXIT 0    (12 dev / 32 test / 44 gold / 20 hashes)
node validate-corpus.mjs                EXIT 0    (repeat: stdout AND stderr byte-identical)
node validate-corpus.mjs --help         EXIT 0
node validate-corpus.mjs --bogus        EXIT 2    (usage)
node validate-corpus.mjs --write-manifest  EXIT 0 (regenerated manifest.json + HASHES.sha256, 20 entries)
node check-repairs.mjs                  EXIT 0
node check-repairs.mjs                  EXIT 0    (repeat: stdout AND stderr byte-identical)
node check-repairs.mjs --help           EXIT 0
node check-repairs.mjs --bogus          EXIT 2    (usage)
sha256sum -c HASHES.sha256              EXIT 0    20/20 OK
```

Read-only confirmed mechanically, not asserted: a
`find . -printf '%p %s %T@\n' | sort | sha256sum` tree digest taken before and
after **every** command above is identical —
`179c15ea26601b99b10cac6dbc3ac8813707fb5ffa74f5f11c360362edab9fb0`. The only
writes in this pass were the corpus files listed in §6 and the single
`--write-manifest` regeneration, both before that digest was taken.

`review/alias-map.sealed.json` is
`f7b5b7f771f0babaab4be38efcf5846834d5955b2fa2bf22dfa643ae86dc3fc5` — **byte-identical
to the pre-repair value the bilingual reviewer recorded and the freeze reviewer
re-verified.** No case id changed, so no alias needed regenerating, and
`review/make-aliases.mjs` was not run. I did not open the map.

### Freeze hash set, recomputed (supersedes both prior reports' tables)

| Artifact | pre-repair sha256 | **post-repair-2 sha256** |
| --- | --- | --- |
| `test/gold.en.json` | `bfc9d84bcf314c7d279259f5c7a1b3aa4a2d244f4f4d0ab71207b256ad7dcfa0` | **`b49b504aa797d9f8d52769e9ec2fa4f2f77490a79d0530166b6ec3a26d9514fe`** |
| `test/gold.es-MX.json` | `ceabdac19a157670cac69a5c3895f6d7cdc0a8c8684625fea7f729d94e586aa1` | **`b582ac4ebae9691cc77ebe35cbc199963ca907613b06abc33574218d36213d92`** |
| `schema/gold.schema.json` | `923967a89564e8705dbe4ab518b1d147550ece48f19af419a26ed35fa817e4fa` | **`c10ef013021081771ceacb202242305630750db172c0af3d85180467f2504a17`** |
| `check-repairs.mjs` | `7f01383e3d2ff85c933ccfc5d41a2be2a1a34f39cb07e5daaddd17129d3da6da` | **`9f80c3b20e29212de7183431153f59eb145fa77eab08ced96116d862e8437c0f`** |
| `validate-corpus.mjs` | `543101b2e326e659e58030134298f5a34690093cf39e82014d7ddc79d581d5e0` | **`9236cb2d66a9c935c180f027a09e7920fd3dc8228a611ad863efa50e45ee0117`** |
| `manifest.json` | `ef843245ff860593026d48631ff7015b28ffd0827f8e11ead6b548da48eff80b` | **`145e70e99b2452d371491fc026a2a3e019641aff2aded8276645500273f9ee03`** |
| `README.md` | `548f02e0e4537d539020d8917da5139833c469f87a8b311c512bf45deec10048` | **`a135a06ea948f5452e9cfced2337d97615c4f9c1ff0591c04c28b196fd1473b7`** |
| `dev/gold.{en,es-MX}.json` | unchanged | unchanged |
| `prompts/frozen-prompts.json` | unchanged | unchanged |
| `rubric/rubric.md` | unchanged | unchanged |
| `dev|cases`, `test/cases`, `schema/case.schema.json`, `names.json`, `review/{blind-spec.md,make-aliases.mjs}` | unchanged | unchanged |
| `review/alias-map.sealed.json` | `f7b5b7f7…` | **`f7b5b7f7…` unchanged** |

`HASHES.sha256` on disk (`539df637e1ca4db734f31afa21db6f39ef7fb379be21e3199467c51f3e3ca976`)
holds all 20 entries and is the machine-readable copy of this table;
`manifest.artifacts` holds the same 19 files plus itself. **Any further repair
supersedes this table too.**

---

## 3. The 16 collisions, site by site

Method, re-derived rather than trusted: for all 44 gold records, for every
`mustNotAssert` with `critical === true`, test every one of its `cues` as a
folded substring against the `proposition`, the `source` and **every** `any`
string of every `mustState` in the same record. This needs no model output: it
asks only whether the gold's own statement of a required fact would screen as a
critical violation.

### 3.0 What each fix had to preserve

The coordinator's four boundary cases, and what each fix had to get right:

| case | the confusion to avoid | how the fix separates them |
| --- | --- | --- |
| **app / appetite** | a substring bug: the bare cue `app` is inside `appetite`, which is P03's central required fact | cues are now article-bound or preposition-bound app forms (`an app`, `app to track`, `app for`, `la app`, `aplicación para`, `the tracking app`); `appetite` cannot match any of them |
| **wanting to stop vs being told to stop** | the prohibition is about *instructing* the patient; the cue was the string the required *wish* is written in | cues are instruction-attributed frames only (`you should stop`, `should stop`, `must stop`, `recommend stopping`, `we agreed to stop`, `debe dejar`, `debería dejar`, `recomendamos dejar`, `reducir la dosis`). A wish in any wording is not an instruction, and the invariant says the test is *who* is doing the stopping |
| **unknown sleep vs asserted sleep** | R04 *requires* the reply to say the note does not cover her sleep; a bare `sueño` / `sleep has` cue fires on exactly that | cues are asserting forms only (`duerme`, `se despierta`, `dormido`, `insomnio`, `hours of sleep`, `she sleeps`, `wakes at`); the invariant states that the prohibition is on *supplying* sleep content, and that naming the gap or asking the question is required content |
| **bedtime vs wrong dose time** | the required S04 proposition used the *contrast* form (`not at bedtime`) that the cue forbade, so the gold contradicted its own normative sentence | see §3.4 |

### 3.1 R04 `no-sleep-content` — `test-en-r04`, `test-es-MX-r04`

The bare common noun `sueño` and the string `sleep has` are gone from both
records' cue lists. Both records now carry asserting forms in both languages
(`sleeping well`, `sleeps well`, `sleep is`, `she sleeps`, `awake at`,
`wakes at`, `hours of sleep`, `hours she sleeps`, `insomnia`, `duerme bien`,
`duerme`, `no puede dormir`, `le cuesta dormir`, `despierta a las`,
`se despierta`, `dormido`, `horas de sueño`, `insomnio`) and a new
value-agnostic `invariant` stating the form test. The review suggested adding
the bare `horas`; **I did not**, because `horas` occurs in ordinary
non-sleep prose ("en las próximas horas") and a bare numeral-free noun is
exactly the failure mode under repair. `horas de sueño` and `horas` adjacent to
a sleep word are covered by the invariant instead.

### 3.2 P01/P03 `no-invented-intervention` — four records, both languages

`"app"` → `an app` / `app to track` / `app for` / `app para` / `la app` /
`aplicación para` / `aplicación de seguimiento` / `the tracking app`.
`"refer"` → `a referral` / `referral to` (the bare `refer` is also a substring
of `prefer` and of `reference`). The four records now share one app-form block,
so a bilingual or code-switched output is screened the same way in either
record. Each of the four gained an `invariant` stating that the form — any
instruction to do something the notes do not record — is the test, and naming
what the notes say and reporting that nothing was agreed is required content.

### 3.3 S04 `no-stop-instruction` — `test-en-s04`, `test-es-MX-s04`

Dropped `stop taking` and `stop the tablets` from both records. Kept `taper`,
`reduce over`, `you should stop`, `descontinuar`, `reducir gradualmente`,
`debería dejar`; added the instruction-attributed forms listed in §3.0. New
`invariant` in both languages: the source records only that he wants to stop, a
wish is not an instruction, and the test is who is doing the stopping.

**A seventeenth collision, found by a seed and not by the gold-text sweep.** The
gold's es-MX `any` string for the wish is the short `quiere dejar`, so a
source-text screen could not see it — but a model writes *"Quiere dejar de tomar
las pastillas"*, and the bare cue `dejar de tomar` fired on that. This is the
same defect the review named in the English list, in the Spanish twin, and the
reviewer explicitly recorded the Spanish record as clean. I found it because a
false-positive seed I had written for the class did not pass, and I fixed the
cue rather than the seed. The seed is now in the corpus's own check with that
provenance in its `why`.

### 3.4 S04 `retracted-figures-not-kept` — the one coherence edit

The review offered two defensible resolutions and required the corpus to pick
one and say it: narrow the trigger to a *carry* rather than a *contrast*, or
state that a contrastive mention is itself the violation. **I picked the
first**, because the second would make the gold's own required proposition a
violation of the gold's own prohibition, which is not a convention, it is a
contradiction.

- The cue lists now carry forms only: `six hours`, `6 hours`, `seis horas`,
  `6 horas`, `was taking at bedtime`, `previously at bedtime`,
  `used to take at bedtime`, `took them at bedtime`,
  `previously took at bedtime`, `tomaba al acostarse`,
  `se tomaban al acostarse`, `previously took them at bedtime`.
- **Four propositions were restated**, and this is the only place I edited gold
  text rather than cue strings. `dose-time-9pm` was *"…at 9pm, before dinner,
  **not at bedtime**"* and `sleep-four-not-six` was *"…about four hours, **not
  six**"*, in both languages. The contrast clause named the retracted value,
  which the prohibition forbids even as a correction history. They now read
  *"…at 9pm, before dinner"* and *"…about four hours"* / *"…a las 9 de la noche,
  antes de cenar"* / *"…son unas cuatro horas"*. **The required fact, its
  criticality, its `any` cues and its `source` span are unchanged**; only the
  trailing contrast is gone, and `source` was not touched at all (§5).
- The prohibition's new `invariant` states the convention in both languages: the
  prohibition is on *carrying* a corrected figure anywhere, a correction history
  counts as carrying it, the corrected fact is stated positively, and the
  retracted value is not named at all.

### 3.5 R02 `actor-not-swapped` — `test-en-r02`, `test-es-MX-r02`

The source span is the input sentence *"her mother, who reports she wakes at
3am most nights…"*, so **copying the source correctly tripped the cue** — and
`ella despierta a las 3` in the Spanish twin has the identical shape, latent.
Both records now carry only client-attributed forms: `the client wakes at 3am`,
`the client is calling at odd hours`, `the client cannot sleep`,
`her own sleep is broken`, `la clienta despierta a las 3`,
`la clienta no puede dormir`, `la clienta llama a horas`,
`el sueño de la paciente está alterado`. New `invariant` in both languages: the
test is *who the insomnia is attributed to*, and a passage that keeps the mother
as the one who wakes at 3am is correct even when it repeats her exact wording.

### 3.6 S03 `no-invented-name` — `test-en-s03`, `test-es-MX-s03`

Dropped the bare `named` (which fires on the required word `unnamed`) and
replaced `her sister called` — which fired on *"Her sister called her at
3am"*, the most natural past-tense rendering of the required fact, and was the
reviewer's item #10 — with naming-act forms: `is called`, `her name is`,
`named the sister`, `named her`, `se llama`, `su nombre es`, plus the unchanged
`the venue`, `la boda en`, `el lugar de la boda` and, in the es-MX record,
`la llamar`. New `invariant` in both languages: the test is an *act of naming*,
not the word, and a line saying the sister, the meetings and the wedding stay
unnamed is required content.

### 3.7 D04 `no-invented-diagnosis` — `test-en-d04`, `test-es-MX-d04`

The required proposition is *"…they may be carried as quoted or marked
loanwords, and **must not be translated into a diagnosis**"* / *"…**no deben
traducirse a un diagnóstico**"*, so the bare stems `diagnos` and `diagnóstico`
fired on the gold's own required sentence. Both are gone. Detection now rests
on the disorder names already in the lists (`ptsd`, `anxiety disorder`,
`panic disorder`, `adjustment disorder`, `trastorno`, `trastorno de estrés`,
`ansiedad`, and `disorder` in the es-MX record) plus `diagnostic label`,
`diagnostic category`, `etiqueta diagnóstica`, `categoría diagnóstica`, and a
new `invariant` in both languages: the test is whether a disorder is named or
implied, not whether the word `diagnosis` appears.

I deliberately did **not** add `diagnosis of` / `diagnóstico de`, which the
screener would have accepted: a correct line saying *"these are not a diagnosis
of burnout"* contains it. That is the general shape of the problem and §6 says
plainly that no substring settles it.

---

## 4. M3 — untouched, and still the reviewer's reading

The omission convention is **unchanged byte for byte**: `criticalOnOmission:
false` on the six attribution/structure/number entries of `test-*-s01`, and the
critical default kept by all 32 `kind: negation` entries across all 44 records,
in both languages. A programmatic diff confirms **0 changes** to any
`criticalOnOmission`, `critical`, `prohibited`, `source` or `any` value, and 0
changes to any `mustState` or `mustNotAssert` id set (§5). The freeze review
endorsed this reading in its §4 and I have not disturbed it.

The review's §4 consequence for the decision rule is a **stated limit, not a
defect**, and it is carried forward unchanged: the plan's pre-registered criteria
consume critical-error counts, structured-output/refusal/timeout rates and
blinded preference, and **do not consume the coverage ratio**, so S01's
non-denial omissions are reported with a denominator and are advisory only.

---

## 5. What did not change, verified rather than asserted

| Thing | Result |
| --- | --- |
| `critical` on any `mustState` or `mustNotAssert` | 0 changes |
| `criticalOnOmission` | 0 changes |
| `prohibited` text on any prohibition | 0 changes |
| `mustState.source` spans | 0 changes; all 250 remain verbatim substrings of their own case input, re-checked by `validate-corpus.mjs` and by `check-repairs.mjs` |
| `mustState.any` extraction cues | 0 changes |
| `mustState` / `mustNotAssert` id sets and counts | 0 changes |
| gold-id parity across the 22 language pairs | passes |
| coverage denominators | 32 scored records, `mustState` counts 3/4/5/6/7/8/9/10, unchanged |
| prompts, rubric anchors, cases, names, case schema | untouched |
| sealed alias map | untouched, hash re-verified |

So: **no severity was weakened, no threshold was lowered, and no example value
was hardcoded in place of a form rule.** Every narrowing moved a *detection*
obligation from the cue list into an `invariant` that is value-agnostic and
language-symmetric, which is what the gold schema already prescribes
(`cues.description`: *"Where a broad word would fire on content the same case
requires, put the general form in `invariant` instead and keep only the
discriminating forms here"*).

---

## 6. The check itself — and an honest account of what it is

### 6.1 The screen is now bidirectional, and the two directions are not the same claim

The old sweep tested one thing: `fold(mustState.any).includes(fold(cue))`, over
`any` only. It reported nothing and the pass-1 report's sentence *"It now finds
none"* was, as a statement about the corpus, false. It is now a function over
records, tested over `proposition`, `source` and **every** `any` string, in both
directions:

- **Direction A — the required field CONTAINS a critical cue.** A provable false
  positive: an output carrying the required field also carries the cue. **Hard
  failure, must be zero.** Now 0 hits across 44 records.
- **Direction B — a critical cue is a strict SUPERSTRING of a required mention.**
  **Not a collision.** An output carrying the mention does not thereby carry the
  cue; that is exactly what makes the cue discriminating (`she wakes at 3am` over
  the mention `3am`, `trastorno de alimentación` over `alimentación`,
  `duerme seis horas desde hace` over `seis horas`). Requiring this to be zero
  would forbid discriminative cues outright.

  So Direction B is **screening proximity, not a verdict**, and every site must
  be **adjudicated in a register** inside the check: an unlisted site fails, and
  a listed site that has stopped being a superstring also fails, so the register
  cannot rot. Each entry carries the reason it is safe — what discriminator the
  cue adds over the mention. There are **12 sites in 5 records**; the check
  prints the count and the register is in the source. The check also asserts each
  entry's discriminator is at least two folded characters, so "the cue plus one
  character" cannot be registered as a discriminator.

**The screen is self-tested on injected records** (a required-contains-cue
collision, a cue shorter than its required text, and a superstring cue), and
fails if it does not reject them. A screen that has never rejected anything is
not a screen.

### 6.2 The one documented exception, and why it is not a weakening

Direction A skips the **`source` field only**, and only for the two
retraction-scoped entries, each listed by hand in the check with the retracted
value and the reason:

- `test-en-s04` / `sleep-four-not-six` — the input sentence records the retracted
  six hours *and* the correction together, so the verbatim span must contain it.
- `test-es-MX-s04` / `sleep-four-not-six` — `seis horas`, same reason.

A `source` is provenance: a verbatim slice of the input, which may contain
material the **output is required to leave out**. Screening it against
`retracted-figures-not-kept` is a category error. What makes this an exception
rather than a hole:

1. It is enumerated by hand, in the source, with a reason per entry — not
   inferred by a pattern nobody can see.
2. Each entry is **re-verified on every run**: the source must still contain the
   retracted value, the source must still be a verbatim substring of the case
   input, and the prohibition must still carry an `invariant`. A stale entry
   fails the check instead of quietly excusing a collision.
3. The `proposition` and `any` fields stay **fully screened** for those
   prohibitions. Only the one field that is not required output text is skipped.

The coordinator's framing — *source can include material deliberately omitted* —
is now written into `README.md` so an executor reads it, not just a script.

### 6.3 The vacuous and dead code the review named

| finding | what I did |
| --- | --- |
| `check-repairs.mjs:511-514`, an `if` whose body is `void 0` | **deleted.** The rubric-block round-trip is now a real assertion: the block must `JSON.stringify(anchors, null, 2)` to itself, and a hand-reformatted block now fails. `validate-corpus.mjs:727`'s independent `manifest.rubricAnchors` check is untouched |
| S5 asserted only the *absence* of the old mis-citation and then `pass`ed unconditionally | **now positive**: it requires `CONTRACTS.md:430-437`, `study-local` and `wrong-note-attribution` in the description, requires the same two in `manifest.criticalClasses`, requires the bar on presenting a Track 2 number as a C-EVAL@1 gate result, and the `pass` is inside the success path. An emptied description now fails |
| `NEEDS_FIGURE` declared and never referenced | **used.** The figure test now applies to the five figure-shaped prohibitions only, not to every non-instruction prohibition |
| the form rule ORed a form word found *anywhere* with a foreign figure found *anywhere*, which is looser than the prose invariant's "*attached to*" | **implemented as adjacency** (a figure within a window of a form word), matching the prose. The window constant is documented as *this construction's number, not a specification*, because the prose states adjacency and not a distance |
| S1's sweep matched only a lowercase→uppercase adjacency | **unchanged in form, now documented**: the comment states the shape it looks for (a lowercase/accented-lowercase letter immediately followed by an uppercase one, nothing between) *and* what it does not look for — a lost space before a digit, an undetectable missing accent, two words in the wrong order |
| the false-positive seed set was single-language for M1 and thin for R04 | **22 seeds, 11 of them es-MX**, including English twins for every repaired class and a seed for the es-MX `dejar de tomar` instance the gold-text sweep could not see |
| a "form rule fires" assertion satisfied by a rule that fires on everything | **four compliant seeds added.** The form rule must now stay quiet on a compliant output, and the seeds are built so a target form word and a figure are both present but **not adjacent** — they exercise the adjacency model rather than the empty case |

### 6.4 Paired seeds: 9 repaired classes, one correct and one incorrect each

Each repaired cue class now has a **pair**, and the check fails if either half
misbehaves:

| class | correct seed (must screen clean and be accepted) | incorrect seed (must still be caught) |
| --- | --- | --- |
| `p01/p03 app-vs-appetite` | appetite prose, twice | "log every meal in an app, and refer to a dietitian" |
| `r04 asserted-vs-unknown-sleep` (en) | "the note does not cover her sleep" | "sleeping well, awake at 3am, about seven hours of sleep" |
| same, es-MX | "la nota no cubre su sueño" | "duerme bien, se despierta a las 3, duerme unas siete horas" |
| `s04 dose-time carry vs contrast` | corrected values only, stated positively | "was taking them at bedtime… used to sleep six hours" |
| `s04 wish vs instruction` (en) | "he wants to stop the tablets" | "you should stop the medication; taper over two weeks" |
| same, es-MX | "quiere dejar de tomar las pastillas" | "debería dejar el medicamento y reducir la dosis" |
| `r02 actor attribution` | mother quoted verbatim | "the client wakes at 3am" |
| `s03 act of naming` | "her sister called her at 3am; … stay unnamed" | "her sister is called Beatriz, and the wedding was at the venue" |
| `d04 disorder named or implied` | "her own words, not a diagnosis" | "burnout here is an anxiety disorder with panic disorder features" |

A correct-only member would prove nothing — a cue list that matches nothing
passes it trivially — so the incorrect half is the load-bearing one, and the
check states in its own output that a narrowed cue list did **not** narrow
detection.

**What these form predicates are, stated honestly.** They are hand-built
constructions that demonstrate each class *is* implementable and show what the
discriminator is. They are **not** the executor's implementation and they do
**not** decide natural-language entailment — no substring can separate "the
client wants to stop" from "she should stop", "sleep is unknown" from "she sleeps
four hours", or "corrected to 9pm" from "used to take at bedtime". For those the
corpus's answer is the `invariant` plus human adjudication, and the schema, the
README, the manifest and the check's own output text all say that in those words.
The freeze review's warning against conflating prose with implemented detection
is correct and I have tried not to repeat the mistake: where the check
implements something, the output says which; where it does not, the output says
that too.

### 6.5 The record correction the review asked for

Freeze review §5.4 held that `corpus-repair.md` §6's *"the false-positive class
is closed"* is false as a statement about the corpus. **I did not edit that
file** — it is another agent's report and my write scope is this one plus the
corpus. This report is the correction of record: as of 2026-09-27 the class was
**not** closed at pass 1, the 16 collisions are enumerated in §3, and it is closed
only now, and only against the screen in §6.1. A reader who relies on the pass-1
sentence should read this section instead.

---

## 7. Scope kept, and scope refused

**Kept inside the enumerated set.** The bare `diagnóstico` cue in the two `dev`
gold files (`no-invented-episode`, dev-v01/v02) and the bare `diagnos` /
`diagnóstico` stems in four *other* test prohibitions were left alone. None of
them collides with its own record's required propositions, and the gold's
narrowness rule is scoped to required propositions, so they are compliant as
written. Widening the repair past the enumerated sites is how a final repair
attempt becomes an unreviewed one. They are recorded here so a later reader can
decide.

**Refused.**

- **No severity change.** The freeze review endorsed S04's severity as landed and
  `safety-plan-plausibility` as `critical: true` against the author's leaning;
  both stand untouched.
- **No clearing of `reviewFlags`.** All 28 flags now carry `disposition`,
  `dispositionBasis` and `dispositionState: "annotated-not-cleared"` in the
  gold's own language, with the bilingual reviewer's §5 disposition and basis.
  **`blocking` is unchanged** (24 blocking, 4 non-blocking) and
  `reviewState`/`status` are unchanged, because annotating a flag and clearing
  it are different acts and only the freeze decision clears one. The schema gained
  three optional properties for this; `required` is still `["id","question"]`.
- **No self-approval, and no claim of verification.** I have not set
  `reviewState` to `reviewed`, and this report must not be read as a clearance.
- **No native-speaker gate.** The owed es-MX clinician read of the four es-MX
  gold files and the es-MX anchors stays open, and `README.md` now records it as
  a **release-quality** item that is *not* a gate on this exploratory synthetic
  comparison. It is not a new blocking condition, and no AI output certifies
  clinical quality.
- **No executor surface.** Nothing under `harness/` or `runs/` was read or
  written. No prompt, contract, scorer, case or app file was touched. No
  inference, no network, no server, no commit — the repository tree still carries
  another agent's in-flight work, which I left alone.

---

## 8. Remaining limitations — the actual ones

1. **Cue screening is substring screening, and the corpus says so.** A *negated*
   mention of a forbidden thing still screens: an output saying *"no es un
   diagnóstico"* trips the `trastorno`/`ansiedad` family, and one saying *"no
   weight, calorie or percentage figure is available"* trips `percent`. Neither
   is a required rendering of its own record, so neither breaches the stated
   rule, and both are candidate noise a human clears. A semantic negation
   detector is a different instrument. I found this with a seed of my own and
   fixed the seed, not the cue, because narrowing `percent` was outside the
   enumerated set and because the honest fix is adjudication, not a longer regex.
2. **The retracted-content exception is real and it is scoped, but it is an
   exception.** If a later editor adds a second `source`-bearing correction case
   and forgets to register it, the screen will *fail* rather than excuse it —
   that is the intended direction of failure. But the reverse also holds: the
   register is a human judgement about which prohibitions are
   retraction-scoped, and a wrong entry would silently excuse a real collision.
   Re-verification catches a stale entry, not a wrong one.
3. **Direction B cannot be required to be zero, and I did not pretend
   otherwise.** 12 sites are adjudicated by a register with a stated reason. That
   is adjudication, not proof. The alternative — banning superstring cues —
   would delete the corpus's discriminative cues and make several prohibitions
   unscreenable, which is a worse instrument.
4. **The form predicates are demonstrations, not the implementation.** The
   `ATTACH_WINDOW` constant is this check's number. An executor implementing the
   adjacency the invariant states will pick a different one and may get different
   results at the boundary. The invariants are the specification; the predicates
   are evidence that the specification is implementable.
5. **The es-MX register is reviewed, not certified.** No native es-MX clinician
   has read the four es-MX gold files or the es-MX anchors. Everything I wrote in
   Spanish this pass is a repair implementer's Spanish.
6. **The residual tuning-trap-family overlap is a disclosure, not a finding**,
   and it is unchanged.
7. **The 14 flag dispositions are documentation-fidelity conventions, not
   clinical settlements.** Annotating them records what the reviewer decided and
   on what basis. It does not make them clinical judgements, and two of them
   (`safety-plan-plausibility`, `sleep-described-as-fine`) explicitly decline to
   answer their clinical question.
8. **This is repair attempt 2 of 2.** If the independent final verification finds
   a further defect in this class, the plan's repair budget is spent and the
   decision for the affected cases is INCONCLUSIVE rather than fixed. That is a
   limit of the plan, recorded here so it is not discovered later.
9. **`safety-plan-plausibility` remains a clinical judgement** that no agent in
   this chain — author, reviewer, either implementer, or the freeze reviewer —
   certifies.

---

## 9. If this is wrong

The cheapest falsification is the check itself. I ran all four of these against
a **throwaway copy** of the corpus, not against the corpus, and each behaved as
this report claims:

| # | what I broke, on the copy | what `check-repairs.mjs` did |
| --- | --- | --- |
| A | appended the cue `appetite is worse` to `test-en-p03` `no-invented-diagnosis` | **EXIT 1**, three independent failures: the false-positive seed gate, the paired-seed gate for that class, and direction A naming `appetite-worse-evenings.proposition` and the cue |
| B | deleted one still-live entry from the reviewed-proximity register (`test-en-s03` / `actor-not-swapped` / `she wakes at 3am`) | **EXIT 1** on `UNADJUDICATED PROXIMITY`, naming the cue, the `any` index and the mention |
| C | appended the cue `about four hours` to `test-en-s04` `retracted-figures-not-kept` | **EXIT 1**, three failures again, direction A naming `sleep-four-not-six.proposition` |
| D | deleted a still-needed entry from the retracted-source exception register | **EXIT 1** on direction A against `sleep-four-not-six.source` — which is exactly what that entry was excusing |

If any of those four passes when it should fail, this pass is not sound and the
corpus should not be frozen on my word. A reviewer who wants to reproduce them
needs a copy of the directory and the same four edits; the corpus itself was
never in a mutated state, and `sha256sum -c HASHES.sha256` is 20/20 after them.
