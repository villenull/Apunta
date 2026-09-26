# S2.5 — independent review, row V4

- Working directory: repository root (`~`)
- HEAD: `bafdcff`
- Command, exactly as the row writes it:

```sh
export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" && node --version && cp shared/src/i18n/es-MX.ts /tmp/apunta-v2-s2.5-es-MX.orig.ts && sed -i "s/text: 'El español no está disponible/text: '{detail} El español no está disponible/" shared/src/i18n/es-MX.ts && npx vitest run shared/src/i18n/t.test.ts; code=$?; cp /tmp/apunta-v2-s2.5-es-MX.orig.ts shared/src/i18n/es-MX.ts; test $code -ne 0 && git diff --quiet -- shared/src/i18n/es-MX.ts
```

- Start: 2026-09-26T19:38:37Z
- End: 2026-09-26T19:38:38Z
- Row exit code: **0**
- Perturbed run's own exit code: **1** (non-zero, as the row requires)

## `node --version`

```
v24.19.0
```

## The perturbed line

`shared/src/i18n/es-MX.ts`, `errors.language_unavailable`:

```diff
-    text: 'El español no está disponible en esta versión de Apunta. …
+    text: '{detail} El español no está disponible en esta versión de Apunta. …
```

The key the card's decision 2 keeps, with a real es-MX translation, so the only
thing wrong with it is the injected `{detail}`.

## The perturbed run's output, in full

```
 ❯ |shared| src/i18n/t.test.ts (21 tests | 1 failed) 22ms
     × names the same placeholders in both, for every key either holds 4ms

⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯

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

 Test Files  1 failed (1)
      Tests  1 failed | 20 passed (21)
   Duration  152ms

PERTURBED_RUN_EXIT=1
```

- It failed for the **right reason**: the per-key placeholder-parity case, on
  `errors.language_unavailable in es-MX`, at `t.test.ts:123`. Not a collect
  error, not a missing file, not an unrelated red case.
- 1 failed / 20 passed. The other 20 cases in the file, including the plural
  floor at `t.test.ts:142`, were unaffected.

## The restore, and the empty diff that follows

The file was restored from the copy taken before the `sed`, then the row's last
step ran:

```
ROW_EXIT=0
```

which is the exit of `test $code -ne 0 && git diff --quiet -- shared/src/i18n/es-MX.ts`
— i.e. the perturbed run was non-zero **and** `git diff --quiet` on
`shared/src/i18n/es-MX.ts` was empty. The reviewer confirmed independently
afterwards:

```
$ git status --porcelain
$ git diff --stat
```

both empty. The working tree carries no residue from this row, and
`shared/src/i18n/t.test.ts` was not edited (it is absent from
`git diff 2a2f3f9..bafdcff`).

## Why this row still matters after V1 and V2 are green

`t()` falls back to **English** outside a test build by design (S2.2's FD7), so
a half-finished catalogue — a key in `en` with the English shipped as its
`es-MX`, or a placeholder dropped from one side — puts English on screen and
leaves every other row green. This row is the only one that can see it, and it
sees it.

## Verdict

**PASS**, row exit 0, perturbed run exit 1 for the stated reason, tree restored.
