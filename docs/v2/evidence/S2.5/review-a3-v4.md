# S2.5 — implementation review, attempt 3 — row V4

Reviewer-run.

- Working directory: repository root
- Node: `v24.19.0` (exported first, as the row writes)
- Tip at run 1: `22fd351` · Tip at run 2 (re-run after the tip moved): `c5a62c8`
- Start / end: 2026-09-26T15:11:24-06:00 → 15:11:24 (run 1);
  15:11:57 → 15:11:58 (run 2)

## Command, exactly as the row writes it

```sh
export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" && node --version && cp shared/src/i18n/es-MX.ts /tmp/apunta-v2-s2.5-es-MX.orig.ts && sed -i "s/text: 'El español no está disponible/text: '{detail} El español no está disponible/" shared/src/i18n/es-MX.ts && npx vitest run shared/src/i18n/t.test.ts; code=$?; cp /tmp/apunta-v2-s2.5-es-MX.orig.ts shared/src/i18n/es-MX.ts; test $code -ne 0 && git diff --quiet -- shared/src/i18n/es-MX.ts
```

(The temp copy went to this review's own scratch directory rather than the
row's literal `/tmp` filename, so it could not collide with the implementer's
copy of the same name. Disposal of that copy is the same either way.)

## Exit codes observed

| Step | Run 1 | Run 2 |
| --- | --- | --- |
| **row** (the whole chain) | **0** | **0** |
| perturbed `vitest run` | **1** | **1** |

## The perturbation, verbatim

```
131:    text: '{detail} El español no está disponible en esta versión de Apunta. Elige inglés o instala la edición en español.',
```

## The perturbed run's failure, verbatim

```
 FAIL  |shared| src/i18n/t.test.ts > the two catalogues > names the same placeholders in both, for every key either holds

AssertionError: errors.language_unavailable in es-MX: expected [ 'detail' ] to deeply equal []

- Expected
+ Received

- []
+ [
+   "detail",
 ]

 ❯ src/i18n/t.test.ts:123:67
```

This is the exact assertion the row names: the failure is
`errors.language_unavailable in es-MX`, the key decision 2 keeps, and the only
thing wrong with it is the injected `{detail}`. It is **not** a collect error, a
missing file, or an unrelated red case — the run got as far as executing the
parity loop and failed on the one injected placeholder.

## The restore

`cp` back from the copy, then `git diff --quiet -- shared/src/i18n/es-MX.ts`
returned 0 (that is what makes the row's exit 0), and
`git status --porcelain` afterwards is **empty** — verified after both runs, not
just the `git diff` the row asks for. `shared/src/i18n/t.test.ts` was not
touched; it is read-only for this card (HS-7).
