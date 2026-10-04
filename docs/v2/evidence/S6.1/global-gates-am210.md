# S6.1 — the global gates re-run under AM-210

Not card rows: the coordinator asked for the full `npm test` and the full `npm
run e2e` alongside the card's own L1 and browser rows. The previous reading is
in `global-gates.md` (`npm test` 1 failed; `npm run e2e` 1 failed). This file
records the re-run after AM-210's two test edits.

## `npm run e2e` (through `scripts/v2/sandbox.mjs env --port 7884`)

- Sandbox run folder: `<sandbox>/2026-10-04T21-24-03-454Z-e26a0c42/`
- Pinned Node `v24.19.0`; `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium`
- Started 2026-10-04T21:24:03Z · Ended 2026-10-04T21:24:55Z
- Exit code: **0**
- **114 passed, 0 failed, 6 skipped (51.6s).**

```
  6 skipped
  114 passed (51.6s)
```

The single previous failure is gone:

```
  ✓   16 [chromium] › tests/chat-dictation.spec.ts:20:3 › dictating into the chat › puts what whisper heard into the composer, and leaves sending to her (3.0s)
  ✓   80 [es-MX]    › tests/chat-dictation.spec.ts:20:3 › dictating into the chat › puts what whisper heard into the composer, and leaves sending to her (2.7s)
```

### What changed since the FAIL reading

`global-gates.md` recorded `[es-MX] › chat-dictation.spec.ts` failing with
`common.continue [text]: "Continue" (es-MX: "Continuar")` on the "the refine
chat while dictating" screen: the `es-MX` project created its note with the
English fixture content, and the now-Spanish dictionary split `Continue` into a
text node of its own that coincided with the English catalogue value. AM-210
widened May edit to `e2e/tests/chat-dictation.spec.ts`; the spec now branches on
`appLocale` and the `es-MX` project gets Spanish synthetic note text and Spanish
format sections, while the English project's text is byte-identical. The
`es-MX` `checkScreen` assertion now passes with the Spanish note.

The rest of the previous run's positives still hold, and now with 114 green:
`spelling.spec.ts` (English non-regression, byte-identical) passes in
`chromium`; `spelling-es.spec.ts`'s five cases and `spelling-assets.spec.ts`'s
one pass in `es-MX`; `spelling-assets.spec.ts` passes in both projects.

## `TZ=UTC npm test`

Not re-run as a separate row here: AM-210's only unit-level change is the
`web/src/App.test.tsx` assertion, whose full `web` project is covered by V5's
`npx vitest run --project web` above (751 passed, 0 failed). The previous
`npm test` failure was that same case, so it is resolved by the same edit.

## Side effect of the full e2e run

`e2e/tests/brand.spec.ts:157` rewrote the four committed
`docs/v2/evidence/P2.2/screenshots/*.png` again. Under AM-210 and the
continuation's instruction they were restored with
`git checkout -- docs/v2/evidence/P2.2/screenshots/` (exit 0); the directory is
clean. Recorded in `V7-scope-am210.md` part 3.
