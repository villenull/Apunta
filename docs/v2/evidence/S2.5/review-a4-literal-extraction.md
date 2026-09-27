# S2.5 review, attempt 4 — my own literal extraction over `ai/refine-request.ts`

- Working directory: repository root. Node `v24.19.0`.
- Method: TypeScript's own parser (`ts.createSourceFile`, `ScriptTarget.ESNext`),
  a full `ts.forEachChild` walk, collecting `StringLiteral`,
  `NoSubstitutionTemplateLiteral`, `TemplateHead`/`Middle`/`Tail`,
  `RegularExpressionLiteral`, and every import/export module specifier.
  I did not read attempt 3's extraction and did not use it.

Script: `/tmp/opencode/s25/literals.mts` (temp, outside the checkout).

## Head

```
string/template literals: 98
regular expressions:      8
module specifiers:        3
module specifiers: @apunta/shared, ../http/locale.js, ./fact-guard.js
```

The same script over `2dd09d2`'s copy of the file:

```
string/template literals: 97
regular expressions:      8
module specifiers:        3
```

**The delta is exactly one literal**, and it is the separator this attempt
introduced. The regex count and the specifier list are unchanged.

## Every literal in the file that contains a space — the display-string candidate set

Head, 14 of 98:

```
  61: "a an the and or but if of to in on at by for with from as is are was were be been being "
  62: "he she they it his her their them him this that these those there here then than so "
  63: "not no do does did has have had will would can could should may might about into over "
  64: "up down out off again very also just more most some any all each both same such own "
  65: "my your our its we you i"
  66: " "
  71: "Risk review"
 193: " "
 199: " "
 242: " "
 337: ", "
 504: " "
 608: " and "      <-- the one this attempt adds
 612: ", "
```

Same list at `2dd09d2`, 13 of 97, identical but for the absence of `:608`.

I read each one:

- **`:61-65` `STOPWORDS`** (built at `:59`) — a `Set` used at exactly two places,
  `:215` and `:233`, both `if (!STOPWORDS.has(word))`. A stopword *fails* the
  test and is therefore excluded from `lostWords` / `gainedWords`. Actively kept
  out of every string that leaves those functions, not merely "not displayed".
- **`:71` `'Risk review'`** — the key of `SECTION_ALIASES` at `:70`. Its only use
  is `:108`, where it (and its alias `'risk'`) becomes a *regex candidate* for
  matching her message; the value pushed into the result is the caller's own
  `name` at `:112`. A stored section name, never rendered — and C-LANG@1 rule 5
  and the card's Must-not-edit list both forbid translating one, so a catalogue
  entry here would be the defect.
- **`:66, :193, :199, :242, :504` a single space** — join/split separators in
  tokenising helpers.
- **`:337, :612` `", "`** — the comma `listSections` and the non-default branch
  pre-join their parts with. Punctuation, in code, exactly as the house comment
  says it should be.
- **`:608` `" and "`** — the only new one. The default locale's separator, on
  the default-locale branch only, unreachable from a non-default locale. Its
  purpose is to reproduce the wire's own bytes, and `review-a4-derive-part-counts.md`
  shows it does at 1–5 parts and across 18 whole-module cases.

## The regexes, all eight

```
  75: /\b(?:add|added|include|insert|mention|note that|noting that|put in|write that|record that|document|documenting)\b/i
  77: /\b(?:short(?:er|en|ening)?|condense|condensed|trim|tighten|concise|brief(?:er)?|less wordy|less verbose|summari[sz]e)\b/i
  78: /\b(?:move|moved|shift|relocate|transfer|cut and paste)\b/i
  80: /\b(?:(?:whole|entire|full)\s+(?:the\s+)?note|every\s+section|all\s+(?:the\s+)?sections|whole\s+thing)\b/i
  83: /"([^"\n]{3,})"|“([^”\n]{3,})”/g
 110: /[.*+?^${}()|[\]\\]/g
 180: /\b(?:mg|mcg|µg|ml|units?|iu)\b/i
 193: /[^a-z0-9]+/g
```

Unchanged in count and content from `2dd09d2`. `:110` escapes a section name for
the `:108` regex; the rest match her message or tokenise content. None can
render.

## Verdict

**No English sentence is left in this module, and I re-derived that rather than
inheriting it.** The residue is one stopword list, one stored section name used
only as a matching alias, five single-space separators, two commas, and — new in
this attempt and deliberate — the four characters `' and '` on the branch whose
job is to reproduce what the wire already sent.

This is also where attempt 3's claim needed adjusting rather than repeating:
"zero English literals" was true then and is **not** true now. The module holds
exactly one, at `:608`, and the honest statement is that it is a separator
reproducing persisted bytes, not a sentence.
