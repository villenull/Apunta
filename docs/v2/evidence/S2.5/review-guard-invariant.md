# S2.5 — independent review: the guard-logic invariant, read hunk by hunk

The coordinator asked for this specifically. The card's rule: `ai/*guard.ts` and
`shared/src/chat.ts` may change **only the sentences** — never a branch, a count,
a logged field or a `*_NOTICE_OPENING` identity.

Four diffs, read line by line.

## 1. `server/src/ai/refine-guard.ts`

```diff
-export function guardNotice(blocked: readonly BlockedRevision[]): string {
-  const parts = blocked.map(
-    (b) => `${b.section} was kept as it was: the revision would have added "${b.phrase}", which is not in the note or your dictation.`,
-  );
-  return `${GUARD_NOTICE_OPENING} ${parts.join(' ')}`;
+export function guardNotice(blocked: readonly BlockedRevision[], locale: Locale = DEFAULT_LOCALE): string {
+  const parts = blocked.map((b) => msg(locale, 'chat.guardNotice.section', { section: b.section, phrase: b.phrase }));
+  return `${msg(locale, 'chat.guardNotice.opening')} ${parts.join(' ')}`;
 }
-export const GUARD_NOTICE_OPENING = 'Apunta blocked part of this revision.';
+export const GUARD_NOTICE_OPENING = msg('en', 'chat.guardNotice.opening');
```

- **Branch:** none. The `map` is still over `blocked`; the interpolation is
  still `parts.join(' ')`. Nothing that decides *whether* to block is touched —
  `guardRefinedSections` and the rest of the file are untouched entirely.
- **Count:** unchanged. `blocked.length` is still the caller's count and
  `routes/chat.ts:387` still does `logBlocked(request, guarded.blocked.length)`.
- **Logged field:** untouched. `logBlocked`/`logKept`/`logFenced` are not in this
  diff and their pino fields are byte-identical.
- **`*_NOTICE_OPENING` identity:** `GUARD_NOTICE_OPENING` is now
  `msg('en','chat.guardNotice.opening')` = `'Apunta blocked part of this
  revision.'` — the base string, character for character (the reviewer's
  catalogue-vs-base check in `review-english-parity.md` found it verbatim in the
  base blob). **Identity held.**

## 2. `server/src/ai/fact-guard.ts`

```diff
-export function factNotice(dropped: readonly DroppedFact[]): string {
-  const parts = dropped.map((d) => `${d.section} was kept as it was: …`);
-  return `${FACT_NOTICE_OPENING} ${parts.join(' ')} To take something out, say so and name it.`;
+export function factNotice(dropped: readonly DroppedFact[], locale: Locale = DEFAULT_LOCALE): string {
+  const parts = dropped.map((d) => msg(locale, 'chat.factNotice.section', { section: d.section, phrase: d.phrase }));
+  return [msg(locale, 'chat.factNotice.opening'), ...parts, msg(locale, 'chat.factNotice.tail')].join(' ');
 }
-export const FACT_NOTICE_OPENING = 'Apunta held back part of this revision.';
+export const FACT_NOTICE_OPENING = msg('en', 'chat.factNotice.opening');
```

The join shape is the interesting part. Base produces
`OPENING + ' ' + parts.join(' ') + ' To take something out…'`; head produces
`[opening, ...parts, tail].join(' ')`, which is `opening + ' ' + parts.join(' ')
+ ' ' + tail`. **Identical**, given the three English values, and the reviewer's
parity check confirmed all three are the base's bytes. Branch, count, log: same
verdict as above. Opening identity held.

## 3. `server/src/ai/prior-note-guard.ts`

Same shape as (2), same verdict. `PRIOR_NOTICE_OPENING`'s value is
`'Apunta kept your other notes out of this revision.'`, verbatim from the base.

## 4. `shared/src/chat.ts`

```diff
-export const PUBLISHED_REFUSAL = 'This note is published, so I won’t change it. …';
+export const PUBLISHED_REFUSAL = t('chat.publishedRefusal');
-export const FIRST_PASS_MESSAGE = "Here's a first pass based on your dictation. …";
+export const FIRST_PASS_MESSAGE = t('chat.firstPass');
```

Both are `string` exports with the same bytes (V1's `shared/src/chat.test.ts`
`toContain` assertions on both are unchanged and pass). No branch, no count, no
log. The one thing worth naming: `t()` with no locale argument returns the
English outside a test build, and the reviewer's parity check found both English
values verbatim in the base blob. Held.

## The follow-through the card did not ask for, and the reviewer checked anyway

If the openings are rendered per-locale, a Spanish note's persisted notice starts
with a **Spanish** opening, while `GUARD_NOTICE_OPENING` — the marker the thread
strip matches on — is the **English** constant. That is a new hole the card
created by moving the sentences, and the implementer closed it in
`server/src/routes/chat.ts:583-610` by listing the three openings in both
languages, read from the catalogues:

```ts
const LOCK_NOTICE_KEYS = ['chat.guardNotice.opening','chat.factNotice.opening','chat.priorNoteNotice.opening'] as const satisfies readonly MessageKey[];
const LOCK_NOTICE_OPENINGS: readonly string[] = LOCK_NOTICE_KEYS.flatMap((key) => [t(key, {}, 'en'), t(key, {}, 'es-MX')]);
```

The reviewer's own check that the catalogue really does differ per language (so
the two-language list is load-bearing, not decoration):

```
en: 'Apunta blocked part of this revision.'      es-MX: 'Apunta bloqueó una parte de esta revisión.'
en: 'Apunta held back part of this revision.'     es-MX: 'Apunta retuvo una parte de esta revisión.'
en: 'Apunta kept your other notes out of …'       es-MX: 'Apunta dejó fuera tus otras notas de …'
```

`routes/chat.test.ts`'s new case closes the loop at runtime: it drives a Spanish
refine, asserts the reply contains the **Spanish** opening and **not** the
English one, persists it, sends a second turn, and asserts
`withoutServerSentences(...)` no longer contains `'Apunta bloqueó'` — i.e. the
strip really does remove the notice the model would otherwise read back. That
case is in V1's 137 and in V3's 1325.

## One inaccuracy in a comment (not a rule, but a reviewer should say it)

`server/src/ai/refine-guard.ts:98-107` says of `GUARD_NOTICE_OPENING`:

> "It is the catalogue's English rather than a second copy, and it is the same
> string in every language on purpose: the thread may hold a notice written in
> the note's locale, and the strip has to recognise it either way."

The value is **not** the same string in every language — the es-MX catalogue
values differ, as the three lines above show. What is true is that the *strip
list* knows both languages. The mechanism is right; the sentence explaining it
is wrong, and `fact-guard.ts:594-598` and `prior-note-guard.ts:192-196` repeat
the claim. Cosmetic, but it is the kind of comment that misleads the next reader
into thinking the const is locale-invariant.

## Verdict on the invariant

**Held.** Across all four files: no branch added or removed, no count changed,
no logged field changed, and all three `*_NOTICE_OPENING` identities are the
base strings, character for character. The extra work the implementer did in
`routes/chat.ts` to keep the strip working is necessary and changes nothing about
whether a lock blocks, what is counted, or what is logged.
