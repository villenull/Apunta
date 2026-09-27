# S2.5 attempt 4 — the part-count pins, and how each was proved

Card commit **`bc7528e`**. Working directory: repository root (`<sandbox>/Apunta`).
Node `v24.19.0`. No server, no socket, no database: in-process vitest only.

## The defect being corrected

`server/src/ai/refine-request.ts`'s `changeSentence` built the first paragraph
of every successful refine reply. Attempt 3 routed the parts through
`chat.list.last`, whose English is `{first} and {last}` with `first`
pre-joined by `", "`. That is byte-identical for **one** and **two** parts and
wrong from **three** on: `a, b and c` where the wire has always carried
`a and b and c`.

The pre-card expression, at the attempt-3 base `77767c2`
(`git show 77767c2:server/src/ai/refine-request.ts`, line 564):

```ts
  return parts.length === 0 ? '' : `I ${parts.join(' and ')}.`;
```

## The fix

One branch in `changeSentence`: the **default locale** joins with
`parts.join(' and ')` — the wire's expression, restored; **every other locale**
keeps `chat.list.last`, which is what makes `a, b y c` read as Spanish. No key
added, none removed, no text changed; `chat.list.last` is untouched and still
has its second caller in `listSections`.

## The exact English the code now produces, and the proof for each count

Each expectation below is asserted **twice** in
`server/src/ai/refine-request.test.ts`: once built by
`wire(parts) = \`I ${parts.join(' and ')}.\`` — the wire's own expression, with
the parts spelled out — and once as a fully written string literal, so the
bytes are visible in the file and not merely derived.

| Parts | English produced | Proof |
| --- | --- | --- |
| 1 | `I shortened the Client presentation section.` | `toBe(wire([...]))` + `toBe('I shortened the Client presentation section.')`. No separator exists for one part, so this case cannot fail on a separator change — it is here to pin that the frame and the single part are still the whole sentence. |
| 2 | `I shortened the Client presentation section and shortened the Discussion section.` | `toBe(wire([a, b]))` + the literal. Identical under either join, which is why the old suite passed. |
| 3 | `I shortened the Client presentation section and shortened the Discussion section and shortened the Intervention section.` | `toBe(wire([a, b, c]))` + the literal + `expect(...).not.toContain(',')`. **The case that was missing.** |
| 4 | `I shortened the Client presentation section and shortened the Discussion section and shortened the Intervention section and shortened the Out of session actions section.` | `toBe(wire([a, b, c, d]))` + the literal + `not.toContain(',')`. |

A fifth case pins the non-default locale at all four counts, so the fix cannot
be "make English right by making every language the same":
`Cambié lo siguiente: acorté la sección de Client presentation, acorté la
sección de Discussion y acorté la sección de Intervention.` and so on.

## Three independent demonstrations

### 1. The assertions pass at `bc7528e`

```
$ npx vitest run server/src/ai/refine-request.test.ts --reporter=verbose
 Test Files  1 passed (1)
      Tests  36 passed (36)
```

31 of those are pre-existing and unedited; the file's diff in `bc7528e` is
**106 insertions, 0 deletions**.

### 2. The assertions bite — the attempt-3 code fails them

The three- and four-part cases were re-pointed at attempt 3's `ccb3dc2` module
and the new test file was run against it, with no other change:

```
PARTS=3
  base: "I shortened the Client presentation section, shortened the Discussion section and shortened the Intervention section."
AssertionError: expected 'I shortened the Client presentation s…' to be 'I shortened the Client presentation s…'
 Test Files  1 failed (1)
```

So the pin is not vacuous: reinstating attempt 3's `changeSentence` fails it.

### 3. Runtime diff against the pre-card module, for all four counts

The reviewer's own method, repeated here. `77767c2`'s `refine-request.ts` and
`bc7528e`'s were run **in one session on the same input** and their replies
compared:

```
PARTS=1
  base: "I shortened the Client presentation section."
  head: "I shortened the Client presentation section."
PARTS=2
  base: "I shortened the Client presentation section and shortened the Discussion section."
  head: "I shortened the Client presentation section and shortened the Discussion section."
PARTS=3
  base: "I shortened the Client presentation section and shortened the Discussion section and shortened the Intervention section."
  head: "I shortened the Client presentation section and shortened the Discussion section and shortened the Intervention section."
PARTS=4
  base: "I shortened the Client presentation section and shortened the Discussion section and shortened the Intervention section and shortened the Out of session actions section."
  head: "I shortened the Client presentation section and shortened the Discussion section and shortened the Intervention section and shortened the Out of session actions section."

 Test Files  1 passed (1)
      Tests  1 passed (1)
```

Byte-identical at every count, including the two the old suite already covered
and the two it did not. Both probe files were temporary, lived in
`server/src/ai/` only for the run so their relative imports resolved, and were
**deleted**; they were never staged and are not in `bc7528e`. The only file
they read is `refine-request.ts` at a given commit — no patient data, no live
data folder, no network (HS-1, HS-8; the sample note is the prototype's
`John Smith` practice).

## Documentation corrected, and it now claims only what the tests prove

- `refine-request.ts`, `changeSentence`'s docstring: the claim *"The English is
  unchanged, character for character: this is the sentence the wire has always
  carried"* was **false in the branch it covered** and is gone. What it says now
  is what is actually guaranteed and why: the default locale's separator is the
  wire's, it is deliberately not a key, `a and b and c` is what already-stored
  replies are stored with (FD5 renders at write time and a stored row is
  displayed as stored), the awkwardness is the guarantee, better English is
  S2.7's and S2.8's, and the four part counts are pinned in
  `refine-request.test.ts`.
- `refine-request.ts`, `listSections`' docstring: said the list key is "shared
  with the diff sentence's parts" unconditionally. Now says it is reached by
  `changeSentence` **outside the default locale**.
- `shared/src/i18n/en.ts`, `chat.list.last`'s comment: said the pre-separator is
  a comma with no exception. Now records the default-locale exception and why,
  and points at `changeSentence`. **Comment only** — no key, no text, no
  placeholder touched, so the two catalogues are exactly as the review measured
  them (737 each, symmetric).
