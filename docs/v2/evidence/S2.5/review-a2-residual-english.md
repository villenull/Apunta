# S2.5 implementation review, attempt 2 — the residual-English sweep

**This is the crux the coordinator asked for a judgement on.** It is the
reviewer's own sweep, category by category, over the whole of `server/src`, not
a check of the implementer's list. The conclusion: the shortfall is **exactly
four sentences, all in `ai/refine-request.ts`**, and it is **not wider**. Three
of the four are demonstrated below with output the reviewer generated, not with
a reading of the code.

Method: for each of the seven kinds the card's objective enumerates, find every
site that can put a sentence in front of a person, and check what it renders
from. Where a claim in the card or the return was load-bearing, the reviewer
tested the claim rather than the code.

## The seven kinds, swept

### 1. API error bodies — **clean**

75 call sites of `badRequest` / `notFound` / `conflict` / `languageUnavailable`
across the fourteen route files plus `http/validate.ts`. Every one now takes a
**catalogue key**, not a literal:

```
routes/transcribe.ts:112   throw badRequest('errors.bad_request.wav_unreadable');
routes/formats-detect.ts:180  throw badRequest('errors.bad_request.format_detect_file_too_large');
routes/notes.ts:109       throw conflict('errors.conflict.note_published');
routes/backup.ts:178      throw notFound('errors.not_found.backup_file', { file });
http/validate.ts:14       throw badRequest('errors.bad_request.body_invalid', {}, result.error.issues);
```

A search for these four helpers called with a **string or template literal**
returns nothing outside tests. This is the card's 79-site table and it is
finished. The three `validate.ts` sentences are keyed; the handler's own bodies
are keyed except the one documented pass-through (attempt-1 NOTE 7, below);
`app.ts:150` renders `msg(storedLanguage(db), 'errors.not_found.route')`.

### 2. The twenty AI-failure SSE `error` events — **clean**

`ai/errors.ts` is a key table (`MESSAGE_KEYS`) plus the banner, and the banner
is now interpolated in the request's language:

```ts
export const UNREACHABLE_MESSAGE = msg('en', 'ai.unreachable_banner');        // :70
…
return msg(locale, MESSAGE_KEYS[code], { banner: msg(locale, 'ai.unreachable_banner') });  // :120
```

Attempt 1's finding 1 is fixed exactly as that review asked, and the English
constant is kept for the log line and the base-import sites, which is what the
review asked for too. `ai.unreachable_banner`'s es-MX value is no longer dead
code.

### 3. Refine-lock sentences — **clean**

The three guards and `shared/src/chat.ts` all render from keys, and each
`*_NOTICE_OPENING` is still `msg('en', <its own key>)` — the strip in
`chat.ts:588-618` lists the keys in **both** languages and the four constants
alongside them. `chat.retractionNotice.opening` is now in that list, so a
Spanish retraction notice is stripped from the model's history the same way an
English one is. The strip's mechanics are unchanged: a prefix regex, no branch,
no count.

### 4. SSE `status` and `progress` — **clean**

Every `status()` / `progress` message in `ollama.ts`, `fake.ts` and
`whisper.ts` is a `msg(locale, …)` call, including the two transcription twins
at `whisper.ts:482,516` and `fake.ts:541`. A search for `message: '` or
`message: "` with a capital letter across `server/src/ai/` returns **nothing**.

### 5. Import sentences — **clean where it is keyed; one module verified inert**

`import/claude.ts` throws `ImportFormatError` carrying a key, and
`routes/import.ts:219` renders it with `badRequest(error.key, error.params)`.
The five Halaxy `warnings` are `msg(locale, …)` in the parser.

`import/zip.ts` holds ten raw English `ZipFormatError` messages
(`'not a zip file'`, `` `entry "${name}" is damaged` ``, …). The card says
this module "needs nothing" and gives a reason. **The reviewer tested the
reason** rather than accepting it:

```
$ grep -rn "readZip" server/src/ e2e/
server/src/import/claude.ts:13:  import { readZip, ZipFormatError } from './zip.js';
server/src/import/claude.ts:100:  entries = readZip(upload);
server/src/import/zip.test.ts:…   (tests only)
```

Exactly one non-test caller, and its `catch` at `:102-104` replaces **every**
`ZipFormatError` with a keyed sentence. So none of those ten English strings can
reach the wire. The claim holds. (A `ZipFormatError` thrown later, by
`entry.read()`, is not an `ImportFormatError`, so `import.ts` re-throws it and it
becomes the catalogued `errors.internal_error` 500 — a localised generic
sentence, not English. Also verified.)

### 6. Persisted server-written strings — **clean**

- `chat.ts` `persistReply` and the three notices write in the note's locale.
- `routes/draft.ts:255-261` now composes the opening as
  `` `${firstPass}\n\n${retractionNotice(retractions, format.locale)}` `` — both
  halves in `format.locale`. **Attempt 1's finding 4, the one where the card had
  made itself worse, is genuinely fixed**: the Spanish-opening-glued-to-English-
  notice row no longer exists.
- `backup/index.ts` writes `{ code, params, at }`; `GET /api/backup` renders it
  per request and shows a legacy ` — ` row byte for byte. Both witnessed by
  runtime cases (V1 (d)).

### 7. Boot-error page — **clean**

`boot-error.ts` renders English first, then `<p lang="es-MX">`, under
`<html lang="en">`, and both JSON bodies carry the **English** sentence, per
fixed decision 4. The parameters come from `BootErrorOptions.key`/`.params`
rather than an interpolated literal, which is the shape change `index.ts:57-58`
was pinned for.

## The one thing that is **not** clean

### `ai/refine-request.ts` — four sentences, and I can show three of them

The card's stop condition is explicit: *a user-visible server sentence in a file
this card does not own is a `BLOCKED` return.* This file **is** owned — but only
at the eight line numbers AM-045 enumerated. The module returns more sentences
than that. Four of them still do.

The complete inventory of string literals in the file, extracted mechanically,
shows that these four producers and nothing else generate on-screen English:

```
'cleared'  'shortened'  'expanded'  'rewrote'                      ← changeSentence verbs
`${verb} the ${name} section`                                        ← changeSentence
`added "${addition}"`                                                 ← changeSentence
`I ${parts.join(' and ')}.`                                           ← changeSentence
`${names.slice(0, -1).join(', ')} and ${names[…]}`                   ← listSections
'The note already said what you asked for.'                          ← :496
'The requested edit produced no changes.'                            ← :497
```

Every other literal in the file is an enum value, a stopword list, a regex, a
section name, or a catalogue key. **The implementer's report of four is
therefore both accurate and complete** — it is not under-counting, and the
shortfall is not wider than those four.

#### (i) `changeSentence` — the diff sentence, `:547-565`

The first paragraph of **every successful refine reply**, and the first thing
she reads. Entirely English. Observed, on a Spanish note, setting `es-MX`:

```
I rewrote the Location section and expanded the Discussion section.

Apunta dejó Location como estaba: tu mensaje solo preguntaba por Discussion.

Apunta no pudo acortar la sección de Discussion: la revisión no salió más corta.
```

The first line is `changeSentence`; the rest is the card's own work, correct.
(Note the section names `Location` and `Discussion` staying English inside the
Spanish sentences is **correct** — C-LANG@1 rule 5 and the card's Must-not-edit:
stored section names are never translated. The defect is the sentence frame
around them.)

#### (ii) `:496` — and the reply beside it is Spanish, which makes it worse

`The note already said what you asked for.` is the `verdict.reason` on the
`unchanged` outcome. Observed:

```
outcome = unchanged
reason  = "The note already said what you asked for."     ← English
reply   = "Apunta no cambió la nota: ya decía lo que pediste."   ← Spanish
```

One verdict, two sentences, two languages. `reason` becomes `outcome_reason`
(`chat.ts:466,473`) and is printed by `web/src/components/RefineColumn.tsx:94`.
So the card renders the **same event**'s banner in English and its body in
Spanish. That is a worse artefact than either alone.

#### (iii) `:497` — `The requested edit produced no changes.`

The other bare fallback, the `else` of the same ternary. The reviewer could not
construct an input that reaches it: every route to a non-`unchanged` outcome
with an empty `reasons` array is also a route that puts something in `reasons`.
It reads as a **defensive** fallback. It is still raw English in a user-visible
field and should be keyed in the same pass, but it is the least reachable of the
four and I do not weight it as an independent user-visible failure.

#### (iv) `:329` — `listSections`, and this one is a *function word*

`listSections` joins section names with `', '` and `' and '` and feeds the
result to `{scope}` in `chat.scopeHold.outOfScope`. Observed, with two targets:

```
"Apunta dejó Location como estaba: tu mensaje solo preguntaba por Discussion and Risk review."
```

A Spanish sentence with an English `and` in the middle. This is not cosmetic
and it is not a "stored text" exemption: `and` is a function word the **server
owns**, and the es-MX sentence needs `y`. The module's own retraction code gets
this right — `chat.retractionNotice.list` is a key precisely because "Spanish
joins the last item with `y`" (the comment at `retractions.ts:273-274` says so).
The same reasoning was applied there and missed here.

## Conclusion on the crux

| Question the coordinator asked | The reviewer's answer |
| --- | --- |
| Is the card's objective met now? | **No.** |
| Is the shortfall exactly those four sentences? | **Yes** — verified by exhaustive literal extraction, and three of the four demonstrated at runtime. |
| Is it wider? | **No.** Every other one of the seven kinds is clean, and the two remaining sources of unkeyed English (`extract/types.ts`, `backup/archive.ts`, `backup/restore.ts` via `rawHttpError`) were adjudicated and dispositioned by the card itself before the owner approved AM-045. |
| Is any residual English on screen blocking? | **Yes.** The card's first stop condition fires on English sentences that reach a person, and (i) is the first line of the most common refine outcome. |

**The root cause is named correctly by the coordinator and it is worth stating
plainly: AM-045 enumerated line numbers where it should have named what the
module returns.** Line numbers are not a stable handle — the file's own line
numbers moved *because of this card's own edits* — and they do not scale to a
module's output. `changeSentence` is one sentence emitted from six literals
across nine lines; no line list would ever have contained it. Attempt 1's
review enumerated eight sentences and missed four; attempt 2 fixed the eight and
found four more; a line list would keep producing that outcome.
