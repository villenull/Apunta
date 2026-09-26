# S2.5 — attempt 3, reviewer's own literal extraction of `ai/refine-request.ts`

Written by the attempt-3 **reviewer**, with a method of my own, because the
coordinator asked me not to take the implementer's "none left" claim on trust.
The implementer's extraction is in `attempt-3-no-english-left.md`; mine is
below and reaches the same verdict by a different route, with a different raw
count.

- File: `server/src/ai/refine-request.ts`, 621 lines, at `c5a62c8`
- Method: the TypeScript compiler API, walking every node of a `ts.createSourceFile`
  AST and collecting `StringLiteral`, `NoSubstitutionTemplateLiteral`,
  `TemplateHead`/`Middle`/`Tail`, `RegularExpressionLiteral`, and every
  `ImportDeclaration`/`ExportDeclaration` module specifier. Keys were then matched
  against `msg(locale, '…')` call sites.

## Raw counts (mine)

| Kind | Count |
| --- | --- |
| string literals | **90** |
| regular-expression literals | **8** |
| template pieces (head/middle/tail) | 3 |
| import specifiers | 3 |

The implementer reported "100 literals, 8 regexes". The regex count matches
exactly; the literal count differs by ten, which is a counting convention (I
count each concatenated fragment once and do not count module specifiers as
literals). **The substantive finding is the same, and the residue below is what
I checked.**

## 1. Import specifiers — 3, none displayable

```
1  "@apunta/shared"
3  "../http/locale.js"
4  "./fact-guard.js"
```

## 2. The eight regexes — no sentence in any of them

```
75  ADDITION      add|added|include|insert|mention|note that|noting that|put in|write that|record that|document|documenting
77  SHORTENING    short(er|en|ening)?|condense|condensed|trim|tighten|concise|brief(er)?|less wordy|less verbose|summari[sz]e
78  MOVE          move|moved|shift|relocate|transfer|cut and paste
80  WHOLE_NOTE    (whole|entire|full) (the )?note|every section|all (the )?sections|whole thing
83  QUOTED        "([^"\n]{3,})"|“([^”\n]{3,})”
110 escape        /[.*+?^${}()|[\]\\]/g      (inside a template, for SECTION_ALIASES matching)
180 DOSE_UNIT     mg|mcg|µg|ml|units?|iu
193 normalise     /[^a-z0-9]+/g
```

Every one is a matcher or a splitter. None is rendered.

## 3. `STOPWORDS` (`:59-67`) — **genuinely never displayed**

Five concatenated string literals, 130 English words. I read **both** use sites:

- `:215` `if (!STOPWORDS.has(word)) lost.push(word);` — inside `lostWords`
- `:232` `if (!STOPWORDS.has(word)) gained.push(word);` — inside `gainedWords`

Membership test only. The words that *fail* the test are what leaves the
function, and every consumer of `lostWords`/`gainedWords` either compares them or
discards them: `:298` `lost.some((word) => gained.has(word))`, `:296`/`:310`
`lost.length > 0`, `:287-289` a `Set` of gained words. A stopword is *excluded*
from every displayed string; it is never a candidate for one. **The implementer's
claim holds, and I checked it at the use sites rather than by counting.**

The one adjacent thing worth naming, because it looks like the same defect and
is not: `lostPhrase` (`:238-243`) returns `all.slice(at, at+5).join(' ')`, where
`all = words(before)` — the note's **own** words, which may incidentally include
a stopword. That text is passed as `{phrase}` into
`chat.scopeHold.additionOnly` (`:315-318`). It is stored clinical text rendered as
a parameter, which C-LANG@1 rule 5 exempts and the card's own Must-not-edit list
names ("Stored clinical text … section names … never translated"). It is also
pre-existing, keyed since attempt 1, and untouched here. Not a finding.

## 4. `'Risk review'` and `'risk'` (`:70-72`) — **genuinely a stored section name, and genuinely never displayed**

```ts
const SECTION_ALIASES: Readonly<Record<string, readonly string[]>> = {
  'Risk review': ['risk'],
};
```

Two independent reasons this is right, and I checked both:

- **It is stored text.** `Risk review` is a column heading in the owner's own
  note format — a stored section name. C-LANG@1 rule 5 and the card's
  Must-not-edit list both say a section name is never translated. Putting it in
  a catalogue would be the defect, not the fix.
- **It is never displayed.** `:107-113`: `candidates = [name, ...aliases]` is
  used only to build a matcher, and `:112` pushes `name` — the caller-supplied
  section name from `format.sections` — never the alias and never this literal.
  The literal exists to let her type "risk" and have it resolve to the stored
  heading.

## 5. Everything else with a letter in it

Internal discriminators and machine values, none of which is rendered:
`medication` / `fact` / `phrase` (`:88`, `:162`, `:170`, `:174`, `:184`, `:185`),
`removal` / `shortening` / `addition` (`:343`, `:373`, `:397`, `:409`, `:480`,
`:535`), and the five `RefineOutcome` values (`:425`, `:486`, `:488`, `:490`,
`:492`, `:493`, `:501`, `:505`, `:551`). `outcome` reaches the wire as a
**machine field** beside `outcome_reason` (`routes/chat.ts:465-473`); the
sentence beside it is the keyed `reason`. Punctuation-only residue: `?` (`:48`),
`, ` (`:337`, `:596`), `\n` / `\n\n` (`:364`, `:369`, `:550`), and the
`${addition.kind}:${addition.token}` de-duplication key (`:156`).

## 6. Every render site is a `msg(locale, key, …)`

Fifteen keyed call sites, and no others:

```
303 chat.scopeHold.outOfScope        383 chat.request.shorteningNote
315 chat.scopeHold.additionOnly      384 chat.request.shorteningSection
336 chat.list.last                   401 chat.request.clearing
506 chat.verdict.alreadySaid         413 chat.request.addition
507 chat.verdict.noChanges           590 chat.change.addition
595 chat.list.last                   599 chat.change.summary
610 chat.unchangedNotice            615 chat.alreadyThereNotice
620 chat.questionLeftAlone
```

plus the four verbs at `:582-587`, held in a variable and passed at `:588`. That
is **sixteen** render sites, all keyed, all locale-parameterised.

**Verdict: no English sentence literal survives in this module. The "none left"
claim is true.** It is the *Spanish* claim I do not accept without qualification
— see `review-a3-fd6-english.md` for the one place this attempt moved the
English it was told not to move.

## 7. The paths the coordinator asked about specifically

- **An error thrown from a callee.** This module's only callee outside the
  shared package and `http/locale.js` is `ai/fact-guard.js`, and it is used for
  exactly three pure tokenizers: `removalRequested(message): boolean`,
  `factTokens(text): Map<string,string>`, `medicationTokens(text): Map<string,string>`
  (`fact-guard.ts:149`, `:168`, `:413`). None of the three can throw, none
  returns a message, and none of their results is rendered as prose — they become
  `RequiredAddition.token` / `.label`, and `.label` is her own words out of her
  own message, passed as `{label}`.
- **A fallback branch.** Every one I found returns either a key or the empty
  string: `changeSentence`'s `parts.length === 0 → ''` (`:591`),
  `listSections`'s `names.length <= 1 → names[0] ?? ''` (`:335`),
  `replyFor`'s `parts.length === 0` fall-through to `unchangedNotice` /
  `alreadyThereNotice` (`:550-554`, keyed), `checkRequests`' three
  `satisfied ? '' : msg(…)` (`:381`, `:400`, `:412`), and `assessRefine`'s
  `reasons.length > 0 ? reasons.join(' ') : …` (`:503-507`) where the reasons
  are themselves keyed. No unkeyed branch.
- **A default parameter.** `locale: Locale = DEFAULT_LOCALE` appears on five
  exported functions and `DEFAULT_LOCALE` is `'en'`
  (`shared/src/i18n/locales.ts:22`). **I traced every production caller**, and
  every one passes a locale explicitly: `routes/chat.ts:113`
  (`const locale: Locale = note.locale` — the note's, FD3's refine rule), then
  `:358` `enforceRefineScope(…, locale)`, `:422` `assessRefine({…}, locale)`,
  `:437` `questionLeftAlone(locale)`. `checkRequests` has exactly one caller,
  `assessRefine:466`, which forwards the locale. `changedSections` takes no
  locale and returns no text. **The English default is unreachable from a
  route.** It remains a live footgun for the next caller — the same class as the
  `server/src/test/providers.ts` follow-up — and I record it as such in the
  review, not as a defect here.
- **`msg` → `t`'s English fallback** (S2.2 FD7) is unreachable for these nine
  keys: `satisfies Record<MessageKey, Message>` is a `tsc` error for a missing
  key (V2, exit 0) and `t.test.ts`'s parity case runs in V1 (9/142, exit 0).
