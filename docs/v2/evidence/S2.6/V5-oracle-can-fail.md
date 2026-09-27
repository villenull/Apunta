# S2.6 — V5: the per-form oracle fails on a wrong per-form `{name}`

Run after the strings were corrected, so the only defect in the catalogue is the injected one.

- cwd: repository root
- start: 2026-09-27T02:59:30Z
- end: 2026-09-27T02:59:31Z
- scratch edit, applied to `shared/src/i18n/es-MX.ts` for the length of the run and then restored from a copy (`git diff` afterwards shows only this card's committed changes):

```diff
-      many: 'Usando {count} de {total} notas',
+      many: 'Usando {count} de {count} notas',
```

The other two forms of `brainstorm.contextSome` still print `{total}`, so the union of the entry's tokens is unchanged.

## 1. Per-form oracle: `npx vitest run shared/src/i18n/t.test.ts`

Exit code: 1 (required: non-zero)

```

 RUN  v4.1.11 <repo>

 ❯ |shared| src/i18n/t.test.ts (23 tests | 2 failed) 31ms
     × names the same placeholders in both, form by form, for every key either holds 9ms
     × fails on a wrong `{name}` in one form, which the union it replaced let through 5ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |shared| src/i18n/t.test.ts > the two catalogues > names the same placeholders in both, form by form, for every key either holds
AssertionError: expected [ …(2) ] to deeply equal []

- Expected
+ Received

- []
+ [
+   "brainstorm.contextSome es-MX many: {count} but en prints {count}{total}",
+   "brainstorm.contextSome es-MX many: kind declares {total} and the form does not print it",
+ ]

 ❯ src/i18n/t.test.ts:201:41
    199|       expect((esMX as Record<string, Message | undefined>)[key], `es-M…
    200|     }
    201|     expect(perFormMismatches(en, esMX)).toEqual([]);
       |                                         ^
    202|     expect(placeholders(en['notes.count'].text)).toEqual(['count']);
    203|     expect(placeholders(en['brainstorm.empty'].text)).toEqual(['name']…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  |shared| src/i18n/t.test.ts > the two catalogues > fails on a wrong `{name}` in one form, which the union it replaced let through
AssertionError: expected [] to deeply equal [ …(2) ]

- Expected
+ Received

- [
-   "brainstorm.contextSome es-MX many: {count} but en prints {count}{total}",
-   "brainstorm.contextSome es-MX many: kind declares {total} and the form does not print it",
- ]
+ []

 ❯ src/i18n/t.test.ts:223:67
    221|     };
    222|
    223|     expect(injected({ many: 'Usando {count} de {count} notas' })).toEq…
       |                                                                   ^
    224|       'brainstorm.contextSome es-MX many: {count} but en prints {count…
    225|       'brainstorm.contextSome es-MX many: kind declares {total} and th…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯


 Test Files  1 failed (1)
      Tests  2 failed | 21 passed (23)
   Start at  20:59:30
   Duration  164ms (transform 51ms, setup 0ms, import 75ms, tests 31ms, environment 0ms)

```

The assertion that fired is `expect(perFormMismatches(en, esMX)).toEqual([])` at `t.test.ts:201`, naming the key, the locale and the form. The self-test case fails too, and that is expected: it filters out lines the real catalogue already has, and here the real catalogue carries the very line it injects, so it adds nothing.

## 2. The union oracle it replaced, on the same scratch catalogue

`git show cb3f8ba:shared/src/i18n/t.test.ts > shared/src/i18n/t.union-scratch.test.ts && npx vitest run shared/src/i18n/t.union-scratch.test.ts` (the scratch file was deleted after the run).

Exit code: 0

```

 RUN  v4.1.11 <repo>


 Test Files  1 passed (1)
      Tests  21 passed (21)
   Start at  20:59:31
   Duration  157ms (transform 54ms, setup 0ms, import 77ms, tests 26ms, environment 0ms)

```

The union passes this exact case and the per-form oracle fails it. That difference is the evidence that the hole is closed.

## 3. The permanent half

`t.test.ts` keeps a self-test ("fails on a wrong `{name}` in one form, which the union it replaced let through") that injects the same wrong form and a dropped-`{total}` form into scratch copies, asserts the union still matches English on both, and requires the exact lines each injection adds. It is green on the clean catalogue, including at the oracle-only commit `cc71e31`.
