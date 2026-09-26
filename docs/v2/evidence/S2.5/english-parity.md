# S2.5 — English parity against the base commit

Not one of the card's four rows. It is the check behind **fixed decision 6** —
"every English value this card writes is the string the server sends today,
character for character" — and it is here because no row above can see it: V1's
`chat.test.ts` and `settings.test.ts` oracles pin four sentences, and the other
115 would have been taken on trust.

- **Working directory:** repository root (`<repo>`)
- **Command:**

  ```sh
  export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" && node /tmp/opencode/s25-parity.mjs "$PWD"
  ```
- **Exit code:** 0
- **Base compared against:** `7bf379a`
- **Node:** `v24.19.0`

The script lives at `/tmp/opencode/s25-parity.mjs`, outside the checkout, because
`docs/**/*.mjs` is linted by `eslint .` and would fail the repo lint for reasons
unrelated to the check. It is disposable; the result is what matters and is
recorded here.

## What it does

For every sentence this card moved into the catalogues, it takes the entry's
template out of `en` — `text`, and every form of a `plural` map — turns each
`{placeholder}` into "whatever was interpolated there", and searches
`git show 7bf379a:<file>` for that pattern, where `<file>` is the file the
sentence was written in. A key whose English is not what the wire carried cannot
match, so it is reported. Rendering the key in English as well proves it resolves
at all.

## Result

```
BY HAND  errors.conflict.format_in_use  (server/src/routes/formats.ts)
  base:     `This format is used by ${String(noteCount)} note${noteCount === 1 ? '' : 's'} and cannot be deleted.`
  renders:  This format is used by 1 note and cannot be deleted.
  renders:  This format is used by 3 notes and cannot be deleted.

checked 119 sentences against 7bf379a
pattern mismatches: 0
verified by hand:   1
```

**119 sentences, 0 pattern mismatches, 1 verified by hand** with the base line
quoted so the exception is checkable rather than asserted.

## The one exception, and the one real difference

`errors.conflict.format_in_use` is the only entry the pattern check cannot
decide. The base held a ternary inside a template literal, so no single literal
string in `formats.ts` is either catalogue form:

```ts
`This format is used by ${String(noteCount)} note${noteCount === 1 ? '' : 's'} and cannot be deleted.`
```

The words are the same — count 1 renders `… 1 note and cannot be deleted.` and
count 3 `… 3 notes and cannot be deleted.`, which is exactly what the ternary
produced — and the check prints both renderings next to the base line so a reader
can see it rather than take it.

The one real behavioural difference is that a count of **1,000 and above is now
grouped**: `Intl.NumberFormat('en').format(1000)` is `1,000`, where the base's
`String(noteCount)` was `1000`. That follows from S2.2's fixed decision 4, which
makes a `number` parameter go through `Intl`, and from this card's own key being
a `plural` entry, which requires a `kind: 'number'` to select on. A note format
used by a thousand notes is not a state this app reaches; the same trade is
recorded in `notes.count` in `en.ts`, which made the same move in S2.2.

The four other entries whose parameter is a `number` are unchanged in practice,
because the values they are given are all far below 1,000:
`errors.bad_request.import_patient_limit` gets `MAX_IMPORT_PATIENTS` (200),
`errors.bad_request.dictation_too_long` gets `MAX_DICTATION_SECONDS / 60` (3),
`errors.bad_request.format_detect_too_many_files` gets the route's own file
ceiling (3), and `status.rewriting_sections` / `status.reading_note` get a
section count and a note index out of at most a few dozen — the base wrote
`String(n)` of exactly those.

## Sample data

The only person named anywhere in this card is the prototype's `John Smith`
(`server/src/http/locale.test.ts`, `server/src/routes/chat.test.ts` — HS-8). No
real patient text, no real name, no hostname, no username and no key appears in
any fixture, test or document this card added.
