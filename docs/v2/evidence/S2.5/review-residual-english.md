# S2.5 — independent review: what English is still on screen at `bafdcff`

The card's objective: *"Every server-produced sentence a person reads is
rendered from a catalogue key in the language of the request that produced it."*
This file is the reviewer's own sweep for the sentences that are not, so the
verdict does not rest on the implementer's list.

## What is done

The 79 call sites the card's table names were re-derived by the reviewer from
the base tree:

```
$ git grep -ohE '\b(badRequest|notFound|conflict|languageUnavailable)\(' 2a2f3f9 -- 'server/src/routes/*.ts' 'server/src/http/validate.ts' | wc -l
79
$ git grep -ohE '\b(badRequest|notFound|conflict|languageUnavailable)\(' bafdcff -- 'server/src/routes/*.ts' 'server/src/http/validate.ts' | wc -l
76
```

79 → 76, and the three-site difference is accounted for exactly: the three
`error.message` forwarders (`routes/backup.ts` ×2, `routes/formats-detect.ts` ×1)
became `rawHttpError(...)`. **No call site was deleted or merged away.** At head,
the only non-key argument left in the family is `routes/import.ts:219`
(`badRequest(error.key, error.params)`, a key read off the error) and the
definitions themselves.

## What is not done, and whether a person reads it

Ordered by how visible it is.

### 1. `server/src/routes/chat.ts:451` — inside May edit, unreported

```ts
reason: 'The note became published before the edit could be applied.',
```

`verdict.reason` becomes `outcome_reason` (`chat.ts:465,472`), and
`web/src/components/RefineColumn.tsx:249` prints it verbatim:

```tsx
{outcome.reason === null ? null : ` — ${outcome.reason}`}
```

`routes/chat.ts` **is** in May edit and this card already rewrote the sentence
two lines above it (`reply: msg(locale, 'chat.publishedRefusal')`). It is a
user-visible server sentence, in a file the card owns, left English, and not in
the return's five unresolved items. See finding 4.

### 2. `server/src/ai/retractions.ts:254` and `:257-269` — outside May edit, unreported

```ts
export const RETRACTION_NOTICE_OPENING = 'Apunta applied the corrections you made as you spoke';
// …
`left out “${item.withdrawn}”`  /  `left out “${item.withdrawn}” in favour of “${item.replacement}”`
return `${RETRACTION_NOTICE_OPENING}, before drafting: ${list}.`;
```

Confirmed real, and worse than a bare gap: `routes/draft.ts:251-260` is a line
this card **rewrote**, and it now glues a Spanish first-pass opening to this
still-English notice in the same persisted chat row. Observed from the head
tree (the retracted text is invented for this check, HS-8):

```
Este es un primer borrador basado en tu dictado. Dime qué cambiar …

Apunta applied the corrections you made as you spoke, before drafting: left out
"she said six hours" in favour of "four hours".
```

`ai/retractions.ts` is not in May edit and "the retractions" is named in the
card's Must-not-edit list, so the implementer was right not to edit it — but the
card's fixed decision 5 puts persisted server-written strings in scope
("rendered **at write time** in the target note's locale"), and this is one.
See finding 5.

### 3. `server/src/ai/refine-request.ts` — outside May edit, reported

Eight sentences, and **all** of them are read on screen:

- `UNCHANGED_NOTICE` (`:549`), `ALREADY_THERE_NOTICE` (`:552`),
  `QUESTION_LEFT_ALONE` (`:555`) — persisted into the note's chat thread by
  `finishWithReply`/`persistReply` and shown as assistant turns.
- the five reasons at `:297`, `:309`, `:354`, `:373`, `:385` — returned by
  `assessRefine`/`checkRequests` as `verdict.reason`, i.e. the same
  `outcome_reason` `RefineColumn.tsx:249` prints.

Observed:

```
Apunta did not change the note: the revision came back with no edits.
```

The visible consequence the return describes is real: a turn on a Spanish note
carries a Spanish lock notice and an English verdict sentence together. The
return also states these are a `BLOCKED` return under the card's first stop
condition, which is the correct reading of "a user-visible server sentence in a
file this card does not own". See finding 6.

### 4. `server/src/routes/licenses.ts:35` — outside May edit, reported

```ts
return reply.code(404).send({
  error: 'not_found',
  message: 'The licence file was not found in this build of Apunta.',
  path: '/api/licenses',
});
```

Confirmed: a `reply.send`, not a `notFound()` call, so the card's 79-site table
genuinely does not reach it, and `routes/licenses.ts` is in none of the card's
lists. One line, one key. Correctly reported as BLOCKED.

### 5. `ExtractError` / `BackupError` / `RestoreError` — outside May edit, reported

The claim is that these carry a *category* but no slug, and that two or three
sentences share each category. The reviewer checked the construction sites
rather than taking the claim:

```
server/src/extract/pdf.ts:47   new ExtractError('corrupt_pdf', "Apunta couldn't open that PDF — it may be damaged.")
server/src/extract/pdf.ts:52   new ExtractError('corrupt_pdf', "Apunta could open that PDF but couldn't read the text out of it.")
server/src/backup/archive.ts:141  'destination_unwritable'
server/src/backup/archive.ts:434  `too many backups already written to ${directory} today`, 'destination_unwritable'
```

Both claims hold: `corrupt_pdf` and `destination_unwritable` each back two
different sentences. Keying them from the route is impossible, and picking one
would change the English the wire carries today, which fixed decision 6
forbids. The `rawHttpError` forward at `routes/formats-detect.ts:176`,
`routes/backup.ts:92` and `routes/backup.ts:124-125` preserves the English
exactly and is honestly documented in `http/errors.ts:109-129`. Correct.

### 6. `server/src/import/halaxy/parser.ts` `warnings` — reported

Five English sentences at `:71,73,76,79,93`, reaching the browser in
`HalaxyPreviewPatient.warnings` (`routes/halaxy.ts:36-39` spreads `parsed`
into the response, and `parsed.warnings` comes straight from the parser). The
sibling `rejected[].reason` **was** localized, via
`rejectionMessage(error, locale)`, so the same response object carries a
localized rejection and an English warning. Confirmed as reported.

### 7. `server/src/import/zip.ts` — reported, and the claim checks out

Eight `ZipFormatError` messages (`:42,49,62,78,90,96,103,106`). The reviewer
checked that none reaches the browser: `readZip` has exactly one non-test caller,
`server/src/import/claude.ts:100`, and its `catch` at `:102` replaces every
`ZipFormatError` with a keyed sentence. An error from a later `entry.read()`
is not caught there, but it is not a `400` either — it falls through
`routes/import.ts`'s `instanceof ImportFormatError` check to the generic 500,
which is now `errors.internal_error`. So the claim is right: developer
diagnostics, not user-visible.

### 8. `server/src/http/errors.ts:288` — inside May edit, unreported

```ts
const statusCode = error.statusCode ?? 500;
if (statusCode >= 400 && statusCode < 500) {
  return reply.code(statusCode).send(body('bad_request', error.message));
}
```

The card's Read section lists `http/errors.ts:130` (this line at the base) as
one of the handler's "three more English bodies of its own", and May edit
licenses "`registerErrorHandler`'s own three bodies". It was left as a
framework-message passthrough. That is the *right* call on the merits — it is
Fastify's parser text, not Apunta copy, and there is no key for it — but it is
still an English sentence in a 400 body, inside a licensed file, and the card
either had a key for it or a reason it did not. It was not reported. See
finding 7.

## The tally

| # | Site | In May edit? | Reported? | Reaches the browser? |
| --- | --- | --- | --- | --- |
| 1 | `routes/chat.ts:451` | yes | **no** | yes (`outcome_reason`) |
| 2 | `ai/retractions.ts:254,257-269` | no | **no** | yes (persisted chat row) |
| 3 | `ai/refine-request.ts` ×8 | no | yes | yes (thread + `outcome_reason`) |
| 4 | `routes/licenses.ts:35` | no | yes | yes |
| 5 | `ExtractError`/`BackupError`/`RestoreError` | no | yes | yes |
| 6 | `import/halaxy/parser.ts` warnings ×5 | licensed for `ImportFormatError` only | yes | yes |
| 7 | `import/zip.ts` ×8 | no | yes | **no** |
| 8 | `http/errors.ts:288` | yes | **no** | yes |

Six of the eight groups put English on a Spanish install's screen.
