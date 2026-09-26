# S2.5 — independent review: English parity, derived not asserted

This is the reviewer's own check of the card's **fixed decision 6** ("English is
unchanged — every English value this card writes is the string the server sends
today, character for character"). The implementer's
`docs/v2/evidence/S2.5/english-parity.md` was not used as the source; the check
below was written from the base tree upward.

## Method

1. Dump the `en` catalogue at head (`bafdcff`) and keep every key whose
   namespace is one this card owns: `errors.`, `ai.`, `status.`, `progress.`,
   `chat.`, `boot.`, `backup.` — **122 keys**.
2. Build one blob of the **base** tree's `server/src` and `shared/src` sources
   (`git ls-tree`/`git show` at `2a2f3f9`, `.ts`/`.tsx`/`.mjs`/`.html`).
3. For each key, turn its English `text` into a regex — escaping everything and
   widening each `{placeholder}` to "any interpolation" — and search the base
   blob. A hit means the exact sentence, with the same placeholders in the same
   places, was already in the server at the base commit.

This needs no pairing of base sites to head sites, so it cannot be fooled by an
off-by-one in a hunk walk.

## Result

```
checked keys: 122
found verbatim in base: 121
NOT found: 1
  MISSING errors.conflict.format_in_use => This format is used by {count} note and cannot be deleted.
```

## The one exception, examined

Base, `server/src/routes/formats.ts:107-110`:

```ts
throw conflict(
  `This format is used by ${String(noteCount)} note${noteCount === 1 ? '' : 's'} and cannot be deleted.`,
);
```

Head, `shared/src/i18n/en.ts:420-427`: a `plural` entry whose `one` and `other`
forms are `… {count} note and …` and `… {count} notes and …`. The reviewer's own
substitution of the base template confirms both catalogue forms are exactly the
base's two rendered forms:

```
base template present: true
renders one:    true
renders other:  true
```

The only byte-level difference is that `1,000` now groups, because `count` is
declared `kind: { count: 'number' }` and goes through `Intl`. That is S2.2's
fixed decision 4, the same trade `notes.count` already made, and the
implementer disclosed it. It is not drift.

So: **122 of 122 sentences are word-for-word the base's; one of them also
changes number grouping, by design and by disclosure.**

## es-MX parity (fixed decision 7, "reported, not filled with the English")

Independent key-set diff, base vs head, both catalogues:

```
en keys at base: 576   at head: 695   added: 119
es-MX at base: 576     at head: 695
added key missing from es-MX: 0
```

Of the 157 `errors.`/`ai.`/`status.`/`progress.`/`chat.`/`boot.`/`backup.` keys,
the only two whose `es-MX` text is byte-identical to the English are:

```
backup.failure           | {at} — {detail}
backup.folderPlaceholder | /Volumes/Backup/Apunta
```

Neither is a sentence: the first is the frame around `{detail}`, which is the
failure's own words (a path, or a parser's complaint) and is data rather than
copy; the second is a macOS path example. **No English is shipped as Spanish.**

## The narrow exception that is a real defect

`ai.unreachable_banner` has a real, unused es-MX translation, because the one
render site injects the **English** constant instead of the key:

`server/src/ai/errors.ts:108`

```ts
return msg(locale, MESSAGE_KEYS[code], { banner: UNREACHABLE_MESSAGE });
```

and `UNREACHABLE_MESSAGE` at `:62` is `msg('en', 'ai.unreachable_banner')`.

Observed, from the head tree:

```
--- ai.ollama_unreachable, es-MX ---
Apunta can't reach the local AI — see Setup. Ollama no parece estar ejecutándose en esta computadora.
--- the banner key it should have used ---
Apunta no puede acceder a la IA local: ve a Configuración inicial
```

A Spanish-speaking owner with Ollama down reads half an English sentence inside
a Spanish one. `ai.unreachable_banner`'s es-MX value is dead code. This is
inside the card's own May edit (`server/src/ai/errors.ts` and both catalogues)
and needs no amendment — see finding 2.
