# S2.5 review, attempt 4 — the comments, the return file, the two deviations, the follow-ups

- Working directory: repository root. Node `v24.19.0`.
- Head `bea4b40`.

## The comment above `changeSentence` — does it now say only what the tests prove?

Attempt 3's problem was a comment that asserted *"The English is unchanged,
character for character: this is the sentence the wire has always carried"*
inside the function whose three-part branch made that false. The head's
comment (`refine-request.ts:560-582`) claims, in order:

| Claim | Verdict |
| --- | --- |
| "The sentence has been persisted into the note's thread at write time since before this card (FD5)" | **True.** `git show 77767c2:server/src/routes/chat.ts` — `replyText = verdict.reply;` … `const assistantMessage = persistReply(db, note.id, replyText);` |
| "its English bytes are the bytes earlier turns are stored with: three changes have always read `a and b and c`" | **True.** `77767c2`'s `changeSentence` ends `I ${parts.join(' and ')}.`, and I measured base vs head at 1–5 parts. |
| "`chat.list.last` would render that as `a, b and c`" | **True.** That module **executed** from a temp copy of `2dd09d2` produces exactly that. |
| "the default locale joins with `and` and nothing else" | **True**, and structural: `parts.join(' and ')` has no length branch. |
| "That awkwardness is the guarantee, not an oversight" | A statement of intent, not a claim about bytes. Fine. |
| "better English is S2.7's and S2.8's to write" | Consistent with FD6. |
| "`refine-request.test.ts` pins one, two, three and four parts against `parts.join(' and ')`" | **True, and it does not overclaim.** Four counts, not five. I read the four cases: each compares against `wire([...])` = `` `I ${parts.join(' and ')}.` `` and against a written literal. The fifth part count is not pinned and the comment does not say it is. |

The blanket "character for character" claim is **gone**, replaced by a claim
about the separator that is narrower and true. The comment now says what is
guaranteed, and what it declines to say is what is not. **Ruling: correct.**

## The other two comments the return file names

**`listSections` (`:327-333`).** Was: "(`chat.list.last`, shared with the diff
sentence's parts)". Now: "(`chat.list.last`, which `changeSentence` also reaches
for **outside the default locale**)". True — the two call sites are `:336` and
`:611`, and `changeSentence`'s use of the key is inside the non-default arm. The
rest of the comment ("two sections read \"A and B\", three read \"A, B and C\"",
"the comma … is punctuation and stays") is accurate in both locales.

**`shared/src/i18n/en.ts` on `chat.list.last` (`:801-810`).** Was: "Two callers,
one string: the scope a hold names … and the diff sentence's parts", with an
unqualified claim about the pre-separator comma. Now it records the exception
and points at `changeSentence`. Two things I checked rather than believed:

- **"Two callers" is accurate.** `listSections` is called once, at `:286`, and
  its result becomes `scopeLabel`, which is `chat.scopeHold.outOfScope`'s
  `{scope}` at `:303`. So the list reaches the screen through the scope hold's
  sentence, and through `changeSentence` outside the default locale. Two.
- **"The separator before that is a comma" is accurate for both callers.** Both
  pre-join with `', '`.

**Comment only.** The `en.ts` diff, filtered to non-comment lines, is empty
(`review-a4-scope-and-hard-stops.md`). No key, no text, no placeholder moved.

## The return file, claim by claim

`docs/v2/state/returns/S2.5.md`. I treated every checkable statement as a claim
to falsify.

| Claim | Verdict |
| --- | --- |
| The defect was "`a, b and c` where the wire has always carried `a and b and c`" | **True**, and I re-derived both sides (§ part counts). |
| The branch is `locale === DEFAULT_LOCALE ? parts.join(' and ') : …` | **True**, `:607-614`. |
| "The default locale joins with `' and '` and nothing else, at every part count" | **True**, and I checked the fifth count nobody asserted. |
| "`chat.list.last` keeps its two callers" | **True**, two call sites. |
| "No key was added, removed or reworded" | **True**, the non-comment part of the `en.ts` diff is empty. |
| The English table, counts 1–4 | **True**, all four, byte for byte, and count 5 too. |
| "the same new test file run against attempt 3's `ccb3dc2` module fails, on the three-part case" | **True, and stronger than stated**: I ran it against `2dd09d2` (the attempt-3 code as it stood at this card's base) and it fails on **three *and* four**, passing one, two and the Spanish case. |
| "Three comments claimed more than the tests proved, and all three now say what is actually guaranteed" | **True**, checked above. |
| "The file's diff is 106 insertions, 0 deletions; the 31 pre-existing cases are unedited" | **True** (31 → 36 `it(` blocks). |
| "V3 collects the file (1344 vs 1344 + 5)" | **True**: I counted 1349. |
| "**737 keys each**, symmetric" | **Stale, and harmless.** The head has **740 in each**, symmetric, 0 keys on one side only, 0 placeholder mismatches. The three extra keys came from `e01c67e`, the other agent's commit inside this range — this attempt added none. The *property* the sentence claims still holds at the new number. NOTE, not a finding. |
| "Five new cases … **each asserted twice** — once built by `wire(parts)` … and once as a fully written string literal" | **Imprecise.** True of the four English cases. The fifth — the Spanish one — is asserted four times and never against `wire()`, which would be meaningless for it. The very next sentence says "a fifth case pins the Spanish at all four counts", so the reader is not misled, but the word "each" is wrong. NOTE, not a finding: it is a sentence in a return file, not in the code, and nothing turns on it. |

No statement in the return file asserts that the English is byte-identical
*without* naming the oracle it compared against, and the two places where a
weaker claim would have been convenient — the five-part count and the
per-category placeholder set — are not claimed at all.

## The two disclosed deviations — still NOTEs

1. **V1's fixed filter does not name `ai/refine-request.test.ts`.** Unchanged,
   correctly not widened (HS-7), correctly disclosed twice. A deviation that
   changes what the card checks would be a FAIL; this one does not, and it is
   weaker than it was at attempt 3: **this attempt added no catalogue key**, so
   the placeholder-parity witness V1 exists for has nothing new to cover, and
   the five new cases are pure additions witnessed by V3 (92 / 1349) and by my
   own verbose run (36 passed, names listed). **NOTE.**
2. **V4 ran after the code commit.** Unchanged, and it is the only ordering that
   makes the row's last step mean "no perturbation leftover" rather than "the
   card's own uncommitted keys" — I confirmed the restore and
   `git diff --quiet` = 0 myself. **NOTE.**

Neither is a FAIL. Both are the same two notes attempt 3 ruled on, carried
forward by the same reasoning, and the coordinator's framing of them is right.

## The two named follow-ups, re-checked at the head

### 1. `server/src/test/providers.ts` — still open, still one argument wide

`RecordingLlmProvider`'s three streaming methods, `:68`, `:73`, `:78`:

```ts
  refineNote(request: RefineNoteRequest): AsyncIterable<LlmEvent> {
    this.refines.push(request);
    return this.inner.refineNote(request);
  }
```

`FakeLlmProvider`'s signatures are
`refineNote(request, locale: Locale = DEFAULT_LOCALE)` (`ai/fake.ts:301`), and
`msg(locale, 'status.thinking')` at `:307` is what the SSE frame carries. The
wrapper drops the second argument, so **the default `'en'` is what a test
renders**, and a Spanish SSE test written against this helper would assert
English and pass. It is a `server/src/test/` helper, not a `*.test.ts` beside a
file this card owns, so **HS-9 forbids the fix here** and the implementer was
right to leave it and report it. Three lines, not one — the review said "one
line" per method.

**Urgency: unchanged, and still the higher of the two.** Nothing this attempt
did makes it better or worse. It remains the mechanism by which the *next*
Spanish streaming test proves nothing: it is silent, it is a green row, and it
would be written by S2.6 or later. It should be the first line of the next card
that touches a `server/src/test/` helper.

### 2. `ExtractError` / `BackupError` / `RestoreError` need a `key`

Unchanged, and re-verified rather than repeated:
`server/src/extract/types.ts:36-44` still carries `reason: ExtractFailure` and a
`message: string`, and the routes still forward the English verbatim —
`routes/formats-detect.ts:176` (`rawHttpError(400, 'bad_request', error.message)`),
`routes/backup.ts:92`, `:124` and `:125`. The deferral is still correct:
`corrupt_pdf` and `destination_unwritable` each back two different sentences, so
the category cannot identify the sentence, and choosing one would move the
English the wire carries, which FD6 forbids. It needs a **private** `key` field
on the error classes, rendered at the route — compatible with FD1 (no wire
shape change) and FD6 (the wire's English does not move).

**Urgency: unchanged, and still second.** It is the last known
server-produced English reaching a person on a Spanish install, which makes it
the more *visible* of the two; but it is visible, which is what keeps it from
being the more dangerous one. The first follow-up defeats a test silently; this
one shows a therapist an English sentence. Both need a card that plans them;
neither should wait for S2.6 to start being reachable, because that is exactly
when a test like the first one gets written.

Neither follow-up is a gate on S2.5, and I weight neither against it.

## 3. Two real Spanish defects I found while looking, in keys this card does not own

Not findings against S2.5 — reported because they are real Spanish errors in
shipped catalogue values, and because the mechanism that hides them is the same
one that hid the three-part English form for three attempts.

Both are the "most recent" brainstorm banner, rendered **in the browser** at
`web/src/components/BrainstormView.tsx:255-264`:

```ts
  return count === 1
    ? t('brainstorm.contextMostRecentOne', { count: total })
    : t('brainstorm.contextMostRecent', { count, total });
```

Rendered at runtime, through `t()`:

```
count=1 total=1  key=brainstorm.contextMostRecentOne
   es-MX: "Usando la más reciente de 1 notas"
   en   : "Using the most recent of 1 notes"
count=1 total=3  key=brainstorm.contextMostRecent
   es-MX: "Usando la más reciente de 1 notas"
   en   : "Using the 1 most recent of 3 notes"
count=2 total=3  key=brainstorm.contextMostRecent
   es-MX: "Usando las 2 notas más recientes de 3"     <- correct
```

**"de 1 notas"** is an agreement error — Spanish requires "de 1 nota" — and it
appears on **both** keys: `contextMostRecentOne` (`:1273-1276`, no `plural` map,
so its only form is wrong) and `contextMostRecent`'s `one` form
(`:1277-1285`), which additionally drops `{total}` where the English keeps it:

```ts
  'brainstorm.contextMostRecent': {
    text: 'Usando la más reciente de {count} notas',
    plural: {
      one: 'Usando la más reciente de {count} notas',          // <- wrong
      many: 'Usando las {count} notas más recientes de {total}', // <- right
      other: 'Usando las {count} notas más recientes de {total}',
    },
    kind: { count: 'number', total: 'number' },
  },
```

I checked the four sibling keys in the same family at the same counts:
`contextNone` ("Aún no hay notas"), `contextAll` ("Pensando con 1 nota"),
`contextNoneOf` ("No cabe ninguna de las 3 notas") and `contextSome` ("Usando 1
de 3 notas", where the noun correctly agrees with `total`) are all right. The
defect is confined to the two "most recent" singular forms.

Why no row catches it: `t.test.ts`'s oracle
(`shared/src/i18n/t.test.ts:57-66`) takes the **union** of `text` and every
plural form, so `es-MX`'s set is `{count, total}` and `en`'s is `{count,
total}` and the two compare equal. The defect lives in the *per-category*
placeholder sets and in the Spanish noun's agreement, and the union erases the
first while no oracle at all watches the second. That is the same shape as
attempt 3's finding: a property that holds under the oracle while one branch of
it is wrong.

**Out of scope, and not a gate, on three independent grounds.** Both keys were
added by **`d79a1fe`, card S2.4** (`git log -S'brainstorm.contextMostRecent' --
shared/src/i18n/en.ts` returns `d79a1fe` and nothing since). Neither is one of
"this card's sentences", and the card may touch `es-MX.ts` only for "every key
this card's sentences need, and **only those**" (HS-9). And S2.5 neither
introduced them nor touched them — `es-MX.ts` is byte-identical between `2dd09d2`
and the head, and V1's `t.test.ts` passes on both. Finally, the render site is
`web/src/**`, which is in Must-not-edit and is S2.6's territory.

Severity, stated honestly: this is **latent**, not live. `PUT /api/settings`
rejects `es-MX` with `language_unavailable` unless `APUNTA_DEV_SPANISH=1`, so no
released build can show it today. It becomes visible the moment Spanish is
enabled, which is the Spanish AI milestone this card's approval releases — so
S2.6 should fix the two forms (`'Usando la más reciente de 1 nota'`, and
`one: 'Usando la más reciente de {total} notas'` to keep the placeholder set
per-category equal to the English), and whoever owns `t.test.ts` next should
consider a per-category placeholder comparison beside the union.
