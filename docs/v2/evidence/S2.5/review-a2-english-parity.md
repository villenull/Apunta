# S2.5 implementation review, attempt 2 — English parity and the catalogue, derived

The implementer's return claims "22 of the 23 new keys are present verbatim at
the base commit" and "23 of 23 have an es-MX value that is not the English
bytes". Both were re-derived by the reviewer from the catalogues and the base
commit, and the second was checked key by key rather than counted.

## The 23 keys attempt 2 added, extracted from the diff

```
chat.alreadyThereNotice              errors.bad_request.halaxy_bare_date_heading
chat.publishedMidEdit                errors.bad_request.halaxy_close_date_labels
chat.questionLeftAlone               errors.bad_request.halaxy_date_like_line
chat.request.addition                errors.bad_request.halaxy_empty_session
chat.request.clearing                errors.bad_request.halaxy_text_before_first_session
chat.request.couldNot                errors.not_found.licenses_file
chat.request.leftAlone
chat.request.shorteningNote
chat.request.shorteningSection
chat.retractionNotice.dropped
chat.retractionNotice.list
chat.retractionNotice.opening
chat.retractionNotice.replaced
chat.retractionNotice.sentence
chat.scopeHold.additionOnly
chat.scopeHold.outOfScope
chat.unchangedNotice
```

## Fixed decision 7 — no English shipped as Spanish, and no placeholder drift

Parsed every key's `text` out of both catalogues and compared:

```
keys=23  es-differs-from-en=23  es-equals-en=0  missingEn=0  missingEs=0
```

**23 of 23** have a Spanish value that is not the English bytes, and **no key's
placeholder set differs**. The claim is confirmed independently, and it is the
claim that matters most, because `Message.text` is a `string` and a wrong
placeholder is *not* a `tsc` error — V4 is the row that sees it, and it fired.

The catalogues' **key sets** were also compared directly, independently of
`tsc`:

```
en keys 718   es keys 718
in en not es: []
in es not en: []
```

Symmetric, 718 each. The `en.ts`/`es-MX.ts` line-count asymmetry in the diff
(134 added vs 83) is comment volume, not keys: non-comment added lines are 81
and 80.

## Fixed decision 6 — English unchanged, re-derived

Twelve of the 23 English values appear **verbatim** in the base-commit text of
the five files the sentences came from. The other eleven are composed at base
from fragments or interpolation, so a literal search cannot find them. Each was
traced by hand to its base construction:

| Key | Base construction | Verdict |
| --- | --- | --- |
| `chat.request.shorteningNote` | `` `Apunta could not shorten ${subject}: …` `` with `subject = 'the note'` (base `refine-request.ts:349,354`) | byte-identical once rendered |
| `chat.request.shorteningSection` | same, with `` subject = `the ${section} section` `` (base `:349,354`) | byte-identical once rendered |
| `chat.request.clearing` | base `:373` | byte-identical |
| `chat.request.addition` | base `:385` | byte-identical |
| `chat.scopeHold.outOfScope` | base `:297` | byte-identical |
| `chat.scopeHold.additionOnly` | base `:309` | byte-identical |
| `chat.retractionNotice.dropped` | base `retractions.ts:260` | byte-identical |
| `chat.retractionNotice.replaced` | base `retractions.ts:262` | byte-identical |
| `chat.retractionNotice.list` | base `` `${…join('; ')}; and ${last}` `` (base `:266`) | byte-identical; the new code keeps the `'; '` join for 3+ and keys only the last-item conjunction |
| `chat.retractionNotice.sentence` | base `:267` | byte-identical |
| `errors.bad_request.halaxy_empty_session` | base `parser.ts:93` | byte-identical |

The return's one flagged exception — `chat.request.shorteningNote`, "whose base
was a rendered line" — is accurate, and its sibling
`chat.request.shorteningSection` pins the shared half. **The reviewer finds no
English in this attempt that the base did not already put on screen.** That is
fixed decision 6 honoured, and it is why V1's 122 pre-existing cases, the named
oracles included, still pass untouched.

## The two prefix keys, and why they are not sentences

`chat.request.leftAlone` (`'Apunta left'`) and `chat.request.couldNot`
(`'Apunta could not'`) are **prefixes**, not sentences. They exist so
`chat.ts:604-610`'s strip can recognise the start of a server sentence in either
language, which is the mechanism attempt 1's finding 9 was about. Correct as
built, and correct in both catalogues — but worth naming, because a reader
scanning `en.ts` for sentences will find two fragments that would be wrong as
translations if ever rendered whole.

## Nothing else moved in the catalogues

The only additions to `en.ts` and `es-MX.ts` in this attempt are the 23 keys
and their comments. No existing value was edited: the diff is 134 and 83 added
lines and **0 removed** lines in both files (`--numstat` reports `134 0` and
`83 0`). S2.2's nine seed keys, including `errors.language_unavailable`, are
untouched — which is what V4 perturbs and what fixed decision 2 requires.
