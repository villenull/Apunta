# S2.5 attempt 3 — the four sentences, keyed, and the proof that none is left

This is the evidence for the review's finding 1, which was the only blocking
finding. It is not a card row; it is the derivation behind the change in commit
`ccb3dc2`.

## 1. The scope was re-encoded, so the unit of work is "what the module
   returns", not a list of lines

AM-045 licensed eight sentences by line number. AM-046 replaced that with
"every sentence this module returns to the browser", which is the right
instrument: `changeSentence` is one sentence assembled from six literals across
nine lines, so no enumeration of lines could ever have contained it. The work
below was done by reading the module and finding every literal it can return,
which is what that wording asks for.

## 2. Every string literal in the module, mechanically

Extracted with TypeScript's own scanner, so a regex full of quote characters
cannot desynchronise a hand-rolled lexer and a comment cannot be mistaken for
code. (A first attempt with a hand-written lexer reported
`'Zoloft'`, `"sertraline"` and `"add that she's on sertraline 20 mg"` as
literals; they are lines 142–149 of a docstring, and the regex on line 83
containing `"([^"\n]{3,})"` is what broke it. TypeScript's scanner is the
reason the list below is trustworthy.)

```
$ npx tsx <literal extractor> server/src/ai/refine-request.ts
100 literals total (8 regex)
```

**Every literal that is a catalogue key — 18 sites, 17 distinct keys:**

```
 303  chat.scopeHold.outOfScope
 315  chat.scopeHold.additionOnly
 336  chat.list.last
 383  chat.request.shorteningNote
 384  chat.request.shorteningSection
 401  chat.request.clearing
 413  chat.request.addition
 506  chat.verdict.alreadySaid
 507  chat.verdict.noChanges
 582  chat.change.cleared
 584  chat.change.shortened
 586  chat.change.expanded
 587  chat.change.rewrote
 590  chat.change.addition
 595  chat.list.last
 599  chat.change.summary
 610  chat.unchangedNotice
 615  chat.alreadyThereNotice
 620  chat.questionLeftAlone
```

**Every string literal with a multi-letter word that is NOT one of those keys:**

```
   1  "@apunta/shared"
   3  "../http/locale.js"
   4  "./fact-guard.js"
  61  "a an the and or but if of to in on at by for with from as is are was were be been being "
  62  "he she they it his her their them him this that these those there here then than so "
  63  "not no do does did has have had will would can could should may might about into over "
  64  "up down out off again very also just more most some any all each both same such own "
  65  "my your our its we you i"
  71  "Risk review"
```

That is the whole residue, and none of it is a sentence the browser reads:

- the first three are import specifiers;
- lines 61–65 are `STOPWORDS`, a vocabulary of common English words used to
  decide **which words count as content** when a diff is measured. It decides
  `lostWords`/`gainedWords`, never a sentence, and it is not displayed;
- line 71 is `SECTION_ALIASES`' one entry: `'Risk review'` is **stored clinical
  text** — a section name from her own format, matched against her message — and
  C-LANG@1 rule 5 says stored strings are never translated. It is a lookup key,
  not an output.

Everything else in the file is a regex, a `RequestCheck.kind` /
`RefineOutcome` discriminant, a word separator (`', '`, `'\n\n'`, `' '`), an
empty string, or a template that carries only stored text and her own words as
parameters (`med:<generic>`, `${addition.kind}:${addition.token}`).

## 3. The four producers the review named, and what each returned before

| Producer | Before | Key(s) now |
| --- | --- | --- |
| `changeSentence` — the four verbs, the addition, the conjunction and the frame, six literals in one sentence | `I rewrote the Location section and expanded the Discussion section.` | `chat.change.rewrote` / `.expanded` / `.shortened` / `.cleared`, `chat.change.addition`, `chat.list.last`, `chat.change.summary` |
| `assessRefine`'s `unchanged` fallback → `outcome_reason` | `The note already said what you asked for.` | `chat.verdict.alreadySaid` |
| `assessRefine`'s defensive fallback → `outcome_reason` | `The requested edit produced no changes.` | `chat.verdict.noChanges` |
| `listSections`'s conjunction, in the `{scope}` of a scope hold | `… asked about Discussion and Risk review.` | `chat.list.last` |

Nine keys for four producers, and the count is not padding: `changeSentence` is
one sentence assembled from six literals, and the frame is a key for the same
reason the verb is — `I` does not open a Spanish sentence, so keeping `I` and
localising the verb would have produced `I acorté la sección de Discussion.`
`chat.list.last` is one key for two callers (the scope a hold names and the
diff sentence's parts) because it is one conjunction.

## 4. Runtime, in both languages, on the same input

One script, the note the owner's 2026-09-23 pass refined (the prototype's
`John Smith` practice, synthetic section names), the setting at `es-MX` and the
note's locale `es-MX`:

```
--- es-MX reply ---
Cambié lo siguiente: acorté la sección de Location y amplié la sección de Discussion.

Apunta dejó Location como estaba: tu mensaje solo preguntaba por Discussion.

Apunta no pudo acortar la sección de Discussion: la revisión no salió más corta.

--- en reply (FD6 oracle, the same input at locale en) ---
I shortened the Location section and expanded the Discussion section.

Apunta left Location as it was: your message asked about Discussion only.

Apunta could not shorten the Discussion section: the revision came back no shorter.
```

The English is character for character what the wire has always carried (FD6),
which `routes/chat.test.ts:1467` also pins independently:
`I expanded the Discussion section and added "sertraline".` — the two-part case,
verb key plus addition key joined by the conjunction key.

The other three, Spanish:

```
--- es-MX scope list (three sections) ---
Apunta dejó Risk review como estaba: tu mensaje solo preguntaba por Location, Discussion y Intervention.

--- es-MX reason, the already-said fallback, beside a Spanish reply in the same turn ---
La nota ya decía lo que pediste.
Apunta no cambió la nota: ya decía lo que pediste.

--- es-MX reason, the no-changes fallback ---
La edición que pediste no produjo cambios.
```

## 5. The catalogues

727 keys in `en.ts`, 727 in `es-MX.ts`, symmetric (718 before this attempt, +9).
All nine new keys checked entry by entry:

| Key | `en` | `es-MX` | placeholders equal | es-MX is not the English bytes |
| --- | --- | --- | --- | --- |
| `chat.change.cleared` | `cleared the {section} section` | `vacié la sección de {section}` | yes | yes |
| `chat.change.shortened` | `shortened the {section} section` | `acorté la sección de {section}` | yes | yes |
| `chat.change.expanded` | `expanded the {section} section` | `amplié la sección de {section}` | yes | yes |
| `chat.change.rewrote` | `rewrote the {section} section` | `reescribí la sección de {section}` | yes | yes |
| `chat.change.addition` | `added "{label}"` | `agregué "{label}"` | yes | yes |
| `chat.change.summary` | `I {changes}.` | `Cambié lo siguiente: {changes}.` | yes | yes |
| `chat.list.last` | `{first} and {last}` | `{first} y {last}` | yes | yes |
| `chat.verdict.alreadySaid` | `The note already said what you asked for.` | `La nota ya decía lo que pediste.` | none | yes |
| `chat.verdict.noChanges` | `The requested edit produced no changes.` | `La edición que pediste no produjo cambios.` | none | yes |

No English is shipped as Spanish (fixed decision 7), and every placeholder is
declared in the entry's `kind` map, so `{section}` and `{label}` are passed as
stored text and never translated.

## 6. The cases, by name

`npx vitest run --reporter=verbose server/src/ai/refine-request.test.ts` —
31 passed, 0 skipped (this file is not in V1's filter; see `v1.md`).

```
 ✓ the server’s own sentences in Spanish > holds a section her request did not name, in the note’s language
 ✓ the server’s own sentences in Spanish > holds an addition-only request to adding, in the note’s language
 ✓ the server’s own sentences in Spanish > names the subject of an unmet shortening in Spanish, whole note and section
 ✓ the server’s own sentences in Spanish > names an unmet removal and an unmet addition in Spanish
 ✓ the server’s own sentences in Spanish > joins a Spanish reply out of the same pieces, with the diff sentence in Spanish too
 ✓ the server’s own sentences in Spanish > names a scope of two sections with y, not with an English and
 ✓ the server’s own sentences in Spanish > reports a change in the note’s language, addition and conjunction included
 ✓ the server’s own sentences in Spanish > clears, shortens, expands and rewrites a section in the note’s language
 ✓ the server’s own sentences in Spanish > gives the two verdict fallbacks in the note’s language, beside the English they replace
 ✓ the server’s own sentences in Spanish > says nothing changed, in Spanish, in the whole reply
```

The retitled case is the review's finding 2, and it is now stronger than it
was, not weaker: it asserts the Spanish diff sentence is **present** and that
`section`, ` and ` and `I ` are absent from the whole reply, where before it
asserted only that two English phrases were absent.

## 7. What was deliberately not done

Findings 3–6 of the review are NOTEs and named follow-ups, and this attempt
touches none of them:

- `server/src/test/providers.ts:65-77` — untouched. It is a `server/src/test/`
  helper, not a `*.test.ts` beside a file this card owns, so HS-9 forbids the
  fix here. Named follow-up in the return file.
- `server/src/extract/types.ts`, `server/src/backup/archive.ts`,
  `server/src/backup/restore.ts` and the `rawHttpError` forwarding — untouched,
  as the review accepted.
- `routes/licenses.ts`'s dropped `path` field — untouched; the review ruled it
  acceptable.
- `web/**` — untouched.
