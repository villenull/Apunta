# S2.5 — independent review: ruling on the five recorded deviations

The implementer recorded five deviations in
`docs/v2/state/returns/S2.5.md:109-146`. The test the card sets is: *is it a
line, or is it a rule? A deviation that changes what the card checks is a FAIL,
not a note.* Each is re-derived here from the diff, not from the return's own
characterisation.

---

## 1. `server/src/index.ts:57-59`, not `:57-58` — **a line**

The card licenses two lines because `storageBootMessage`'s return shape changes.
`storageBootFailure` returns `{ key, params, message }`, so:

```diff
-    const message = storageBootMessage(error, config.dataDir, config.dbFile);
-    const app = await serveBootError(config, { dataDir: config.dataDir, message });
-    app.log.error({ err: error, dataDir: config.dataDir, db: config.dbFile }, message);
+    const failure = storageBootFailure(error, config.dataDir, config.dbFile);
+    const app = await serveBootError(config, {
+      dataDir: config.dataDir,
+      key: failure.key,
+      params: failure.params,
+    });
+    app.log.error({ err: error, dataDir: config.dataDir, db: config.dbFile }, failure.message);
```

Three lines, one of them a variable rename. The third exists because
`app.log.error(…, message)` needs a finished string, and `storageBootFailure`
deliberately returns the English one so that line stays English. The reviewer
confirmed the log cannot go Spanish: `failure.message` is always
`msg('en', …)` (`http/errors.ts:208-225`), never the renderer's locale. **A
line.** Correctly declared.

## 2. `http/request-guard.test.ts` and `test/real-socket-guard.test.ts` — **a line, but a formal scope breach**

```diff
 const BOOT_OPTIONS = {
   dataDir: '/tmp/apunta-guard-boot',
-  message: 'Apunta cannot write because the disk is full.',
+  key: 'errors.storage_error.disk_full',
+  params: { dir: '/tmp/apunta-guard-boot' },
 } as const;
```

and

```diff
-    { dataDir, message: 'Apunta cannot write because the disk is full.' },
+    { dataDir, key: 'errors.storage_error.disk_full', params: { dir: dataDir } },
```

`BootErrorOptions` lost its `message`, so both suites are `tsc` errors otherwise.
The reviewer read both files in full at head: **no assertion changed, no
expectation loosened, no case removed** — only the options object. Two files
outside May edit (HS-9) touched for a shape change the card mandates, and the
implementer declared it rather than hiding it, which is the right behaviour.

On the merits: a line. On the letter: HS-9 says "never edit files outside your
card's May edit list", and the card's own stop conditions make an unbuildable
tree a `BLOCKED` return. **The coordinator's May edit should have named these
two files**; the implementer chose the lesser of two evils and said so. Accepted,
with the amendment owed to the card.

## 3. `server/src/ai/types.ts` gained `TranscribeOptions` — **a line**

```ts
export interface TranscribeOptions {
  readonly locale?: Locale;
}
export interface WhisperOptions extends TranscribeOptions { …20 provider-owned fields… }
```

The card licenses `types.ts:274` (the `transcribe` signature) and
`whisper.ts:46` (`WhisperOptions`); the interface is the declaration that
signature needs, and `ai/whisper.ts:46` explicitly extends it. The reviewer
checked the card's three prohibitions on this file: **no `LlmEvent` variant
added or removed, no method added, removed or reordered**, and the two
non-streaming call sites (`ollama.ts:561-566`) pass `DEFAULT_LOCALE` explicitly
so a caller that *does* forward ladder events cannot forget. **A line.**

## 4. `routes/chat.ts`'s `SERVER_SENTENCES` two-language lock openings — **a line on the merits; a line-pin crossing in the letter. Needs the coordinator's sign-off, not mine.**

This is the one that required real judgement, so here is the reasoning in
full.

The card line-pins `routes/chat.ts` to two things: "the fast-path reply at
`:184` and `finishWithReply`/`persistReply` at `:610-623`". The change lands at
`chat.ts:583-610`. So it is outside the pin.

What it does:

```ts
const LOCK_NOTICE_KEYS = ['chat.guardNotice.opening','chat.factNotice.opening','chat.priorNoteNotice.opening'] as const satisfies readonly MessageKey[];
const LOCK_NOTICE_OPENINGS: readonly string[] = LOCK_NOTICE_KEYS.flatMap((key) => [t(key, {}, 'en'), t(key, {}, 'es-MX')]);
const SERVER_SENTENCES = [ GUARD_NOTICE_OPENING, FACT_NOTICE_OPENING, PRIOR_NOTE_NOTICE_OPENING, RETRACTION_NOTICE_OPENING, UNCHANGED_NOTICE, ALREADY_THERE_NOTICE, QUESTION_LEFT_ALONE, 'Apunta could not', ...LOCK_NOTICE_OPENINGS ]…
```

Why it is *necessary*: the card moved the three lock notices into the
catalogues, so a Spanish note's persisted notice now begins with a **Spanish**
opening, while `GUARD_NOTICE_OPENING` — the strip's marker — is the **English**
constant. Without this, `withoutServerSentences` would stop matching, the notice
would go back into the model's history, and the model would read its own lock
notice back to it. The reviewer's own catalogue dump shows the openings really
do differ per language, so the addition is load-bearing, not defensive
decoration.

Why it is *safe* against the card's actual stop conditions — a change to guard
**logic**, "a branch, a count, a threshold, a logged field, or anything that
decides whether to block": it adds no branch, changes no count, changes no
threshold, changes no logged field, and decides nothing about whether a lock
blocks. It changes only what the *prompt builder* strips, which is the same
thing it stripped before the card, for the same notices.

**Ruling: on the merits a line; in the letter a line-pin crossing, which the
card reserves to the coordinator** ("widening them is this coordinator's call,
not the implementer's"). The right response under the card was a `BLOCKED`
return naming `chat.ts:583-610` and the reason, and the coordinator would then
have licensed it in a minute. It was done and declared instead. That is a
process deviation, not a defect, and the work itself is correct and
runtime-witnessed (`routes/chat.test.ts`'s new case asserts the Spanish notice
comes back, persists, and is gone from the next turn's history). I record it as
**accepted, with the coordinator's explicit sign-off required** — and it is the
one item here I would not sign off on the implementer's authority alone.

## 5. Optional locale parameter on the three `LlmProvider` streaming methods — **a line, with a real cost**

```diff
-  generateNote(request: GenerateNoteRequest): AsyncIterable<LlmEvent>;
+  generateNote(request: GenerateNoteRequest, locale?: Locale): AsyncIterable<LlmEvent>;
```

The card's rule for this file is that "no method is added, removed or reordered,
and no variant is added or removed". None of those happened; a parameter was
added. **A line.**

The cost is real and the return file's account of it is inaccurate. It claims
"all four production call sites (`routes/draft.ts`, `routes/chat.ts`,
`routes/brainstorm.ts` and the three that share `streamDraft`) pass one
explicitly". The reviewer's own grep of non-test callers:

```
server/src/eval/run.ts:160        provider.generateNote({ … })          ← no locale
server/src/routes/brainstorm.ts:168 discussPatient({ … }, locale)
server/src/routes/chat.ts:235      refineNote({ … }, locale)
server/src/routes/draft.ts:98      generateNote({ … }, locale)
server/src/test/providers.ts:65    generateNote(request)                 ← no locale, dropped
server/src/test/providers.ts:70    refineNote(request)                   ← no locale, dropped
server/src/test/providers.ts:75    discussPatient(request)               ← no locale, dropped
```

So there are **three** provider call sites in routes, not four, and two other
callers rely on the English default:

- `server/src/eval/run.ts:160` — the eval harness. Its frames go to a report, not
  to a person in the app, so no user-visible sentence is wrong; but `npm run
  eval` is a quality instrument, and a locale-sensitive harness that silently
  measures the English path is a small trap.
- `server/src/test/providers.ts:65-77` — `RecordingLlmProvider` wraps
  `FakeLlmProvider` and **drops the second argument**. Any future test that
  wraps the fake in `recordingProviders()` and asserts a Spanish SSE frame will
  get English and will not know why. (`routes/chat.test.ts`'s new Spanish case
  dodges this by using the default harness, which is why it passes — the
  reviewer checked.) `server/src/test/providers.ts` is not a `.test.ts` and so is
  not in May edit.

A required parameter would have caught both at compile time. That is the
stricter choice the implementer named and declined. **A line, accepted, with
finding 8 naming the two silent drops.**

---

## Summary

| # | Deviation | Ruling |
| --- | --- | --- |
| 1 | `index.ts` three lines | line |
| 2 | two test files outside May edit | line; May edit owed to the card |
| 3 | `TranscribeOptions` | line |
| 4 | `SERVER_SENTENCES` two languages | line on the merits; **line-pin crossing — coordinator sign-off required** |
| 5 | optional locale parameter | line; two silent-English callers named in finding 8 |

**None of the five changes a threshold, a scorer, a guard, a branch, a count or
a logged field. None is a FAIL on the card's own test.** One of them (#4) is a
line-pin the card reserves to the coordinator and should have been raised as a
`BLOCKED` return instead of done and declared.
