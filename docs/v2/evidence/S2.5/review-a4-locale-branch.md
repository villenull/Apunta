# S2.5 review, attempt 4 — the locale branch, `DEFAULT_LOCALE`, and the other caller

- Working directory: repository root. Node `v24.19.0`. Read-only checks plus one
  runtime driver; no server, no database, no port (HS-1, HS-2).
- Head `bea4b40`.

## Can `DEFAULT_LOCALE` ever be something other than `'en'`?

The branch under review is `refine-request.ts:607`:

```ts
    locale === DEFAULT_LOCALE
      ? parts.join(' and ')
      : parts.length === 1
        ? (parts[0] as string)
        : msg(locale, 'chat.list.last', { … });
```

Three facts, each read from the source rather than assumed:

1. **The constant is a hardcoded literal in a read-only file.**
   `shared/src/i18n/locales.ts:22` — `export const DEFAULT_LOCALE: Locale = 'en';`
   No environment variable, no setting, no derivation. It is a literal in a file
   the card's Must-not-edit list names.
2. **The type admits exactly one other value.**
   `shared/src/i18n/locales.ts:14-16` — `LOCALES = ['en', 'es-MX']`,
   `LocaleSchema = z.enum(LOCALES)`, `type Locale = 'en' | 'es-MX'`. So
   `locale === DEFAULT_LOCALE` is *equivalent to* "the locale is English", not
   a proxy for it that a third locale could drift away from.
3. **The invariant is pinned by a test inside V1's own filter.**
   `shared/src/i18n/locales.test.ts:36` — `expect(DEFAULT_LOCALE).toBe('en')`.
   `shared/src/i18n` is in V1's filter, and it is in V3's, so if the constant
   ever moved, the English wire's byte-identity would break *and* two rows would
   go red.

**So: no, the default path cannot be reached while rendering Spanish, and the
Spanish path cannot be reached while rendering English.** The only failure mode
the constant invites — someone changing `DEFAULT_LOCALE` to make Spanish the
default, which would then send `a, b and c` on the *English* wire — is caught by
`locales.test.ts`, and would in any case be a C-LANG@1 rule 1 change ("Setting
`language` ∈ `en` | `es-MX`, default `en`") and a D11 change, not a
refactor.

**Confirmed at runtime, not only by reading.** The head driven in `es-MX` at
every part count, all comma-and-`y`:

```
[1] "Cambié lo siguiente: acorté la sección de Client presentation."
[2] "Cambié lo siguiente: acorté la sección de Client presentation y acorté la sección de Discussion."
[3] "Cambié lo siguiente: acorté la sección de Client presentation, acorté la sección de Discussion y acorté la sección de Intervention."
[4] "Cambié lo siguiente: …Client presentation, … Discussion, … Intervention y … Out of session actions."
[5] "Cambié lo siguiente: …Client presentation, … Discussion, … Intervention, … Out of session actions y … Note for next session."
```

## Where the locale comes from, and can the default *parameter* be reached

`assessRefine(input, locale = DEFAULT_LOCALE)` (`:465`) and four other exports
default to `DEFAULT_LOCALE`. There is **one** production caller of
`assessRefine` in the whole server (`rg 'assessRefine\(' server/src --glob
'!*.test.ts'` → `routes/chat.ts:422`), and it passes the value explicitly:
`routes/chat.ts:113` is `const locale: Locale = note.locale;` — the refine
exception of C-LANG@1 rule 4, read once and threaded down. Attempt 3's finding
2 stands unchanged: the default parameter is unreachable from a route, and stays
a NOTE for the next caller rather than a defect.

## The other caller of `chat.list.last`

`rg -n 'chat\.list\.last'` over the repository, excluding `docs/`, returns two
call sites in production code and one comment:

```
server/src/ai/refine-request.ts:336   listSections()          — unchanged
server/src/ai/refine-request.ts:611   changeSentence()        — the new branch
```

`listSections` is byte-identical between `2dd09d2` and the head:

```ts
 function listSections(names: readonly string[], locale: Locale): string {
   if (names.length <= 1) return names[0] ?? '';
   return msg(locale, 'chat.list.last', {
     first: names.slice(0, -1).join(', '),
     last: names[names.length - 1] as string,
   });
 }
```

**Its English is unmoved, and I checked why rather than taking it.** At
`77767c2` `listSections` was
`` `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` ``, and the
key's English is `'{first} and {last}'` with `first` pre-joined by `', '` — the
same string. Its single use is `scopeLabel` at `:286`, which becomes
`chat.scopeHold.outOfScope`'s `{scope}` at `:303`. So the `en.ts` comment's
"two callers" is accurate: the list inside the scope hold's sentence, and the
diff sentence's parts outside the default locale.

Its own docstring, unchanged in substance and accurate in every locale: two
sections read `"A and B"` / `"A y B"`, three read `"A, B and C"` / `"A, B y C"`.
The comma is in the code, the conjunction word is in the catalogue, which is the
house convention.

## The non-default path reads as Spanish

Checked at all five counts, above. `a, b y c` is how Spanish writes a three-item
list, and the base's `a y b y c` — what a naive `join` would give — was wrong.
The Spanish is a real translation, not the English bytes: every `chat.change.*`
and `chat.list.last` value read out of the built `shared/dist` at runtime is a
genuine `es-MX` string (`acorté la sección de {section}`, `agregué "{label}"`,
`Cambié lo siguiente: {changes}.`, `{first} y {last}`), and the four
Spanish assertions in the new test pin all four counts so the fix cannot be
"make English right by making every language the same".

## One thing this branch does that the house convention does not elsewhere

For the default locale the conjunction now lives in **code** (`' and '` at
`:608`), not in the catalogue, where the comma already does. That inverts the
convention `listSections` follows, and it is deliberate and documented: the
alternative (`chat.list.last`) renders `a, b and c`, and FD6 forbids the tidier
English. A one-word key would have kept the convention and produced the same
bytes; nobody needed it, and the comment at `:566-581` explains the trade rather
than hiding it. **NOTE, not a finding** — no user-visible English is produced
that the wire did not already produce, and the one literal is a separator, not a
sentence.
