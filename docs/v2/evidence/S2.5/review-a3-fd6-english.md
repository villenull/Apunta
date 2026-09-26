# S2.5 — attempt 3, reviewer: the English the wire carries, base versus head

The finding. Reproduced by running the **base** module and the **head** module
on the same input, in one session, so the comparison is output and not reading.

## What was compared

- **Base:** `server/src/ai/refine-request.ts` as of `77767c2` (the parent of
  attempt 3's code commit `ccb3dc2`), extracted with `git show` to this review's
  scratch directory with its three import specifiers rewritten to absolute paths.
  Nothing in the checkout was touched.
- **Head:** the same module at `c5a62c8`, imported in place.
- Same driver for both: `assessRefine` over a synthetic two-section note
  (prototype-style content, HS-8), `locale = 'en'`.

## The base's three lines, verbatim

```ts
    parts.push(`${verb} the ${name} section`);
  for (const addition of additions) parts.push(`added "${addition}"`);
  return parts.length === 0 ? '' : `I ${parts.join(' and ')}.`;
```

The head's three lines, verbatim:

```ts
    parts.push(msg(locale, verb, { section: name }));
  for (const addition of additions) parts.push(msg(locale, 'chat.change.addition', { label: addition }));
  if (parts.length === 0) return '';
  const changes =
    parts.length === 1
      ? (parts[0] as string)
      : msg(locale, 'chat.list.last', {
          first: parts.slice(0, -1).join(', '),
          last: parts[parts.length - 1] as string,
        });
  return msg(locale, 'chat.change.summary', { changes });
```

The verb and the addition are byte-identical. The **join** is not: base joins
*every* part with `' and '`; the head joins all but the last with `', '` and
leaves one `' and '` for the last.

## Output, base first

```
######## BASE (77767c2) ########
--- 3 changed sections, EN ---
"I shortened the Location section and expanded the Discussion section and expanded the Intervention section."
--- 2 sections + addition, EN ---
"I shortened the Location section and shortened the Discussion section and added \"sertraline\"."
--- 2 sections + addition, ES-MX ---
"I shortened the Location section and shortened the Discussion section and added \"sertraline\"."
```

## Output, head

```
######## HEAD ########
--- 3 changed sections, EN ---
"I shortened the Location section, expanded the Discussion section and expanded the Intervention section."
--- 2 sections + addition, EN ---
"I shortened the Location section, shortened the Discussion section and added \"sertraline\"."
--- 2 sections + addition, ES-MX ---
"Cambié lo siguiente: acorté la sección de Location, acorté la sección de Discussion y agregué \"sertraline\"."
```

## The delta, precisely

| Parts in the diff sentence | Base English | Head English | Same? |
| --- | --- | --- | --- |
| 1 | `I rewrote the Location section.` | identical | yes |
| 2 | `I expanded the Discussion section and added "sertraline".` | identical | yes |
| **3 or more** | `I a and b and c.` | **`I a, b and c.`** | **no** |

**One comma, in one branch.** The head's Spanish is right — `a, b y c` is how
Spanish writes a three-item list, and base's `a y b y c` would have been wrong.
That is not in dispute. What is in dispute is that the change was made here,
silently, and reported as not made.

## Why it is not a note

FD6, verbatim from the card: *"Every English value this card writes is the
string the server sends today, character for character… A key whose English is
not what the wire carries today is a stop, not a copy improvement — S2.7 and
S2.8 own the copy."* This is that case exactly: a copy improvement, made
instead of a stop.

Three things make it worse than a stray comma.

1. **The diff sentence is persisted.** FD5: the refine reply is *"rendered at
   write time in the target note's locale and stored as text"*, and *"Rows
   already stored are displayed as stored."* So a thread refined before this
   change keeps `a and b and c` forever and a thread refined after it gets
   `a, b and c`. The card has just made a permanent, visible inconsistency
   inside a single note's history, in the one surface where the bytes are the
   record.
2. **The commit message says the opposite.** `ccb3dc2`: *"English is unchanged
   character for character: `I rewrote the Location section and expanded the
   Discussion section.` renders exactly as it always has."* True of that
   two-part sentence, false of the sentence's three-part form.
3. **The code comment says the opposite, in the function.** `refine-request.ts:566-567`:
   *"The English is unchanged, character for character: this is the sentence the
   wire has always carried."* A reader who trusts that comment will not check
   the branch it is false in. The next card's author is the reader.

## Why nothing caught it, and what would

No assertion anywhere in the repository pins the three-part English.
`routes/chat.test.ts` pins the one-part form five times (`:146`, `:164`,
`:1303`, `:1492`) and the two-part form once (`:1467`); the new
`refine-request.test.ts` case pins a two-part form. All green, all correct, and
all on the other side of the branch. The new case at `refine-request.test.ts`
that *does* think about commas — *"English is unchanged, comma and all"* — is
testing `listSections`, where the comma was already there in the base, and it
pins the two-item form.

A single assertion on a three-part diff would have caught it. That is the whole
cost of the fix on the test side.

## What makes it pass

The English has to go back to `a and b and c` while the Spanish becomes
`a, b y c`. Those cannot come out of one join, so the shape has to carry the
count or the separator has to move inside the key. The cheapest correct
version, entirely inside the licence this card already holds:

```ts
  const changes =
    parts.length === 1
      ? (parts[0] as string)
      : msg(locale, 'chat.list.last', {
          first: parts.slice(0, -1).join(locale === DEFAULT_LOCALE ? ' and ' : ', '),
          last: parts[parts.length - 1] as string,
        });
```

— or, cleaner and locale-free, a second key for the English shape. Either way it
is a two-line change in a function this card already owns, plus one assertion.
It needs no amendment, no owner and no new plumbing. The coordinator may
therefore record it as a follow-up card rather than spending an attempt that
does not exist.

## The narrower, better fix, if the coordinator prefers

Keep the comma for Spanish, keep `and` for English, and pin both:

```ts
expect(three.parts).toBe('I shortened the Location section and expanded the Discussion section and expanded the Intervention section.');
```

That is the FD6-conformant English. `a, b and c` is better English and belongs to
S2.7 or S2.8, which is precisely what FD6 says.
