# S2.6 — AM-051 step 1: the per-form oracle, before any string changed

The oracle landed first, against the catalogue exactly as S2.4 left it. It must fail, and only on the known defect. The union it replaced passed this same catalogue.

- cwd: repository root
- command: `npx vitest run shared/src/i18n/t.test.ts` (Node v24.19.0)
- es-MX.ts: unchanged from base `cb3f8ba`
- start: 2026-09-27T02:58:51Z
- end: 2026-09-27T02:58:51Z
- exit code: 1 (expected: non-zero)

```

 RUN  v4.1.11 <repo>

 ❯ |shared| src/i18n/t.test.ts (22 tests | 1 failed) 33ms
     × names the same placeholders in both, form by form, for every key either holds 9ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |shared| src/i18n/t.test.ts > the two catalogues > names the same placeholders in both, form by form, for every key either holds
AssertionError: expected [ …(6) ] to deeply equal []

- Expected
+ Received

- []
+ [
+   "brainstorm.contextMostRecent en text: {count}{total} but es-MX prints {count}",
+   "brainstorm.contextMostRecent en one: {count}{total} but es-MX prints {count}",
+   "brainstorm.contextMostRecent es-MX text: {count} but en prints {count}{total}",
+   "brainstorm.contextMostRecent es-MX text: kind declares {total} and the form does not print it",
+   "brainstorm.contextMostRecent es-MX one: {count} but en prints {count}{total}",
+   "brainstorm.contextMostRecent es-MX one: kind declares {total} and the form does not print it",
+ ]

 ❯ src/i18n/t.test.ts:201:41
    199|       expect((esMX as Record<string, Message | undefined>)[key], `es-M…
    200|     }
    201|     expect(perFormMismatches(en, esMX)).toEqual([]);
       |                                         ^
    202|     expect(placeholders(en['notes.count'].text)).toEqual(['count']);
    203|     expect(placeholders(en['brainstorm.empty'].text)).toEqual(['name']…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 21 passed (22)
   Start at  20:58:51
   Duration  162ms (transform 51ms, setup 0ms, import 75ms, tests 33ms, environment 0ms)

```

Result: six lines, all `brainstorm.contextMostRecent`, in its `text` and `one` forms. The `one` form is the known defect; `text` is the same key's own `text` field, which the union also hid. The self-test case (V5's permanent half) passes at this commit, because it injects its own defects into a scratch copy and does not depend on the real catalogue being clean.
