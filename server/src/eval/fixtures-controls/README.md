# Control fixtures — what a control is, and why it is not a corpus fixture

**A control exists to prove the scorer sees an error.** It is the instrument
checking itself, and it is the only thing in this repository that does that.

A **corpus fixture** is scored on provider or pipeline output and enters every
denominator in the report: fabrication rate, safety facts (C2), salient facts
(C1), the restraint rates, the gated-run count, the section-denominator block.
Its `NoteScore` goes into `ModelReport.scores`, which is what `sensitivity()`
flattens.

A **control** is scored on text the fixture itself injects, and it enters
**none** of those. Its `NoteScore` is never placed in `ModelReport.scores`: the
loader returns a separate `controls: readonly ControlScore[]`, the report renders
its four-line table from that array alone, and `sensitivity()` is computed from
`result.models` exactly as it always was. Seven `positive` controls in that
array would otherwise supply the banned strings and the gating conclusions that
make a blind harness "deflect", and the `clean` control would supply
`cleanFixtures` — the harness would be able to fake its own admissibility.

## Why the error is injected rather than generated

`FakeLlmProvider` cannot supply a control's error. `fakeSectionsFor` echoes the
source; it has no mechanism to drop one negator while keeping the rest of the
session, and none to introduce a negator that was not in the source. And
`server/src/ai/fake.ts` is Must-not-edit for this card. So the error is supplied
deterministically by the fixture and `scoreNote` is the **same function** in both
cases; only the provenance of the text differs. `controlNote` is bounded at 4 000
characters and must be shaped as the fixture's own sections.

## The layout

```
fixtures-controls/<locale>/
├── expectations.json          one entry per control
└── <class>/<name>.txt         the control's controlSource — the transcript
```

`<class>/<name>.txt` **is** the `controlSource`. The note lives in the sidecar's
`controlNote` and never on disk: one file per control, one sidecar per control,
no second `.txt`, no note text in the repository.

`controlSource` exists because `scoreNote` compares the note against the source
in six places — F2 quoted spans, F3 numbers, F4 medications, F7 novelty, the
novel-content-word rate and the expansion ratio. A control whose source is empty
is not a control: F7 tests each lexicon entry with
`entry.pattern.test(stemmedBody) && !entry.pattern.test(stemmedSource)`, so with
an empty source every diagnosis and risk term in the note is novel and the
`clean` control — a faithful note, and therefore exactly the note most likely to
name a diagnosis — could not pass on a correct implementation. Each
`controlSource` therefore carries the same clinical vocabulary its `controlNote`
does wherever the control is not *about* introducing it.

The loader supplies `markerFreeSource` as `collapse(controlSource).match(f6Core())
=== null` — the same expression `assertFixture` uses to verify it, so the two
cannot disagree. An `f6: "gating"` control whose source *does* contain marker
vocabulary is then correctly **refused** by the unchanged `assertFixture`, which
is what makes that requirement checkable rather than declared.

## The classes

Seven `positive` controls per locale, one per C-EVAL@1 §4 critical class, mapping
one-to-one onto the Spanish trap-type directories `lost-negation/`,
`invented-negation/`, `dose-and-number/`, `experiencer/`,
`past-vs-current-risk/`, `spoken-correction/` and `section-never-covered/`. Plus
one `clean`, one `empty` and one `degenerate`. Ten per locale, twenty in total.

Three, not two, for the last group: "empty and degenerate outputs" in C-EVAL@1
§3 are two classes, and an empty note is not the class that catches a scorer
which passes anything non-empty.

The predicates are on the control's own `NoteScore`, so no implementation can
disagree with them:

- `flagged` ⇔ `gating.length > 0` **or** `capturedFacts < totalFacts`
- `pass` ⇔ `gating.length === 0` **and** `capturedFacts === totalFacts`
- `fail` ⇔ `gating.length > 0` **and** the named `mechanism` is present in it

The second disjunct of `flagged` is there because it is a real score field and a
real state: `mustCapture` is scored where an uncaptured fact costs `c1`/`c2`
points and adds **no** `gating` entry, so a control whose whole mechanism is an
un-captured fact is detectable only through it.

**A missed control makes the run inadmissible: exit 3**, a code no other path
returns, checked before the fake-mode deflect branch. It applies to every run
that loads controls, **including the default `npm run eval -- --fake` CI
self-check**, and that is deliberate: C-EVAL@1 §3 says an instrument that misses a
control is broken and nothing it scores counts.

## `{{lexicon}}`

Exactly two sidecars — the `es-MX` `lost-negation` and `invented-negation`
controls — carry a `lexicon` key and `{{lexicon}}` tokens. The token is fixed
and does not carry the lexicon's name; the key says which vocabulary it means.
It expands, in the loader and before anything is compiled, to **exactly one
non-capturing group** of whole-token alternatives under
`server/src/eval/lexicons/es-MX.txt`.

The token goes in the **negator's own slot** and replaces the negator the
authored phrase already carries. It is never prefixed to a phrase that already
has one, which is why no phrase whose word is itself the negator — `niega`,
`jam[aá]s` — appears in any `mustNotContain` here: those are the two shapes the
card's B-1 removes, and a doubled negator matches nothing while a bare negator
matches every faithful Spanish note.

Under `--blind-lexicon negation` the token expands to `(?!)`, **not** to an
empty `(?:)`: an empty group would drop the negator requirement and keep the
rest of the phrase, so `(?:) refiere` matches a text with no negator at all — a
blind run would manufacture gating rather than remove it. The lexicon file is
read and validated exactly as authored and is never emptied.

Which controls flip under blinding is stated, not assumed: the `es-MX`
invented-negation control is **missed**, and the `lost-negation` control is
expected to stay flagged because its detection is the affirmative restatement in
`mustNotContain` (sidecar-authored, no token) plus an un-captured `mustCapture`.

## Two recorded limitations

1. **F6's marker vocabulary is English.** `patterns.ts` is not edited by this
   card, so `f6Core()` matches `consistent with`, `indicates`, `suggests` and
   nothing in Spanish. The `degenerate` control must therefore reach F6 through
   an English marker in its repeated boilerplate — in both locales, including
   `es-MX`. That is a real coverage gap in F6's Spanish reach, recorded here
   rather than papered over; it does not weaken the control, because the
   control still tests the F6 path the corpus path uses.
2. **F7 cannot gate under `--locale es-MX`.** `es-MX.txt` holds only `negation`,
   `number`, `unit` and `medication`, and `gatingNovel` keeps only
   `diagnosis`/`risk`. So the es-MX clean control's source-validity property is
   not exercised there; the `en` clean control is where it is asserted.
