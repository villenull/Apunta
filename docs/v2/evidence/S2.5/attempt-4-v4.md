# S2.5 attempt 4 — V4 (the perturbation that must fail)

- Working directory: repository root (`<sandbox>/Apunta`)
- Node: `v24.19.0`, exported first as the row writes
- Start: 2026-09-26T18:36:34-06:00 · End: 2026-09-26T18:36:34-06:00
- Card commit under test: **`bc7528e`** — the code is committed before this row
  runs, which is what lets the row's last step (`git diff --quiet` on
  `es-MX.ts`) mean "no perturbation leftover" rather than "the card's own
  uncommitted keys". This is the ordering constraint the attempt-3 review
  recorded and ruled a NOTE.

## Command

```
export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" && node --version && cp shared/src/i18n/es-MX.ts /tmp/apunta-v2-s2.5-es-MX.orig.ts && sed -i "s/text: 'El español no está disponible/text: '{detail} El español no está disponible/" shared/src/i18n/es-MX.ts && npx vitest run shared/src/i18n/t.test.ts; code=$?; cp /tmp/apunta-v2-s2.5-es-MX.orig.ts shared/src/i18n/es-MX.ts; test $code -ne 0 && git diff --quiet -- shared/src/i18n/es-MX.ts
```

## Exit codes

| Step | Exit | Expected |
| --- | --- | --- |
| `node --version` | 0 (`v24.19.0`) | — |
| perturbed `npx vitest run shared/src/i18n/t.test.ts` | **1** | non-zero ✅ |
| `git diff --quiet -- shared/src/i18n/es-MX.ts` | 0 | empty diff ✅ |
| **row** | **0** | 0 ✅ |

## Output (excerpt)

```
⎯⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯⎯

 FAIL  shared/src/i18n/t.test.ts > every key has the same placeholders in both catalogues
AssertionError: errors.language_unavailable in es-MX: expected [ 'detail' ] to deeply equal []

 Test Files  1 failed (1)
      Tests  1 failed | 20 passed (21)
```

The perturbed line, in `shared/src/i18n/es-MX.ts`:

```
-    text: 'El español no está disponible',
+    text: '{detail} El español no está disponible',
```

The failure names the key fixed decision 2 keeps, and the only thing wrong with
it is the injected `{detail}` — its `es-MX` value is a real translation.

## Restore

`cp /tmp/apunta-v2-s2.5-es-MX.orig.ts shared/src/i18n/es-MX.ts` in the same row;
`git diff --quiet -- shared/src/i18n/es-MX.ts` then exits 0, so the file is
byte-identical to `bc7528e`. The temp copy is outside the checkout and
disposable.

`shared/src/i18n/t.test.ts` is read-only and was not edited to make this row
pass. The only `shared/` file this attempt changed at all is `en.ts`, and only
a comment on `chat.list.last` — no key, no text, no placeholder moved, so the
row's subject is untouched by the card.

## Working tree after the row

```
 M web/src/components/PatientRenameField.tsx
 M web/src/components/icons.tsx
 M web/src/styles/app.css
```

Three `web/` files, a separate owner-run agent's in-flight work. Not mine, not
touched, not staged, and not in `bc7528e` (which contains exactly
`server/src/ai/refine-request.ts`, `server/src/ai/refine-request.test.ts` and
`shared/src/i18n/en.ts`).
