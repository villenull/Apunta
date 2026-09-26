# S2.5 implementation review, attempt 2 — row V4 (reviewer's own run)

Reviewer run. Not the implementer's file. This is the row that cannot be
satisfied by everything else being green, so it is recorded in full.

- Working directory: repository root
- Tree: `feature/v2`, clean before and after
- Start: 2026-09-26T20:14:51Z  End: 2026-09-26T20:14:52Z
- Node: `v24.19.0`, printed by the row

## Command, exactly as the row writes it

The row's own temp path is used verbatim; the copy was additionally kept inside
the reviewer's scratch folder so the restore did not depend on `/tmp` surviving.

```sh
export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" && node --version && cp shared/src/i18n/es-MX.ts /tmp/apunta-v2-s2.5-es-MX.orig.ts && sed -i "s/text: 'El español no está disponible/text: '{detail} El español no está disponible/" shared/src/i18n/es-MX.ts && npx vitest run shared/src/i18n/t.test.ts; code=$?; cp /tmp/apunta-v2-s2.5-es-MX.orig.ts shared/src/i18n/es-MX.ts; test $code -ne 0 && git diff --quiet -- shared/src/i18n/es-MX.ts
```

## The perturbed line, read back between the `sed` and the run

```
131:    text: '{detail} El español no está disponible en esta versión de Apunta. Elige inglés o instala la edición en español.',
```

## Exit codes observed

| Step | Exit | What it means |
| --- | --- | --- |
| `npx vitest run shared/src/i18n/t.test.ts` **with the perturbation** | **1** | the negative outcome the row exists to produce |
| the row's compound test (`test $code -ne 0 && git diff --quiet …`) | **0** | perturbation failed as required **and** the file is restored |

## The perturbed run's output, in full

```
 RUN  v4.1.11 <repo root>

 ❯ |shared| src/i18n/t.test.ts (21 tests | 1 failed) 22ms
     × names the same placeholders in both, for every key either holds 4ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |shared| src/i18n/t.test.ts > the two catalogues > names the same placeholders in both, for every key either holds
AssertionError: errors.language_unavailable in es-MX: expected [ 'detail' ] to deeply equal []

- Expected
+ Received

- []
+ [
+   "detail",
+ ]

 ❯ src/i18n/t.test.ts:123:67
    121|       const spanish = (esMX as Record<string, Message | undefined>)[ke…
    122|       expect(spanish, `es-MX has no ${key}`).toBeDefined();
    123|       expect(placeholders(spanish as Message), `${key} in es-MX`).toEq…
       |                                                                   ^
    124|     }
    125|     expect(placeholders(en['notes.count'])).toEqual(['count']);

 Test Files  1 failed (1)
      Tests  1 failed | 20 passed (21)
```

This is **exactly** the outcome the row specifies: a non-zero exit, on
`t.test.ts`'s placeholder case, naming `errors.language_unavailable in es-MX` —
the key fixed decision 2 keeps, and one whose `es-MX` value is a real
translation, so the only thing wrong with it is the injected `{detail}`.

A zero exit, or a failure for any other reason — a missing file, a collect
error, an unrelated red case — would have been a `FAIL`. Neither happened: one
case failed, it was the right one, and the other 20 passed, so this is a real
detection and not a broken run.

## The restore, and the empty diff that follows

```
--- restored ---
131:    text: 'El español no está disponible en esta versión de Apunta. Elige inglés o instala la edición en español.',
GIT_DIFF_QUIET_EXIT=0
```

`git diff --quiet -- shared/src/i18n/es-MX.ts` exits **0**, so the file is byte
for byte what it was before the row. `git status --porcelain` on that path
printed nothing.

`shared/src/i18n/t.test.ts` is read-only and was not edited to make this row
pass; the reviewer confirmed it is absent from `git diff --name-only
bf7415f..1a6540a` entirely.

## Why this row matters more than it looks

`t()` falls back to **English** outside a test build by design (S2.2's FD7). A
half-finished catalogue therefore puts English on screen while every other row
stays green — the exact failure mode this card has already produced once. This
row is the only one that can see it, and the reviewer observed it see it.

**Row V4: PASS, exit code 0 for the row (1 for the perturbed run, as required).**
