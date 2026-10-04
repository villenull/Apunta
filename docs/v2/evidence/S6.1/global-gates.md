# S6.1 — the global gates (requested by the coordinator)

Not card rows: the coordinator asked for the full `npm test` and the full `npm
run e2e` alongside the card's own L1 and browser rows. Both were run from the
repository root with the pinned Node, and both are recorded here with what failed
and why.

## `TZ=UTC npm test` — every vitest project

- Exit code: **1**
- **2307 passed, 1 failed, 167 files.**

The single failure is `web/src/App.test.tsx > adding a patient and a typed note >
keeps the summary and explains itself when the local AI is not running`, analysed
in `V5-types-units.md`: D4.4's per-surface alert now exists on the capture page
in jsdom, so `findByRole('alert')` returns it before the capture error. The fix
is one line in a file outside May edit.

Everything else is green, including the whole `server` project, every `shared`
project, and all four time zones' worth of date handling in the suite's own
tests.

## `npm run e2e` (through `scripts/v2/sandbox.mjs env --port 7884`)

- Sandbox run folder: `<sandbox>/2026-10-04T20-47-33-106Z-dc6bc762/`
- Exit code: **1**
- **113 passed, 1 failed, 6 skipped.**

The single failure:

```
  1) [es-MX] › tests/chat-dictation.spec.ts:20:3 › dictating into the chat › puts what whisper heard into the composer, and leaves sending to her

    Error: English catalogue text on the Spanish the refine chat while dictating screen

    - Array []
    + Array [
    +   "common.continue [text]: \"Continue\" (es-MX: \"Continuar\")",
    + ]
```

### Why, proven by a control

The cause is this card's intended behaviour, not a flake. It was established by
running that one spec twice, once with this card's `web/src` and `shared/src`
changes stashed and once with them restored:

| Run | Sandbox run folder | Result |
| --- | --- | --- |
| this card's `web/src` + `shared/src` **stashed** | `<sandbox>/2026-10-04T20-49-08-331Z-96bc5ea3/` | **exit 0** — `puts what whisper heard into the composer, and leaves sending to her` passes |
| restored | `<sandbox>/2026-10-04T20-49-43-265Z-2b72280c/` | **exit 1** — the same leak |

Mechanism: `chat-dictation.spec.ts:38` creates its note with the **English**
fixture content `Subjective: Patient reports improved sleep.\n\nPlan: Continue
weekly sessions.`, and the note body is on screen behind the chat dialog. The
note body's spell backdrop renders the text as runs split at each misspelling
(`spelledRuns`, `web/src/components/SpellMarks.tsx`), and
`e2e/support/no-english.ts` reads every visible text node. Before this card, the
`es-MX` project loaded the **English** dictionary (the defect D3 fixes), so
nothing was marked and `Continue` stayed inside a longer run of text. With the
Mexican Spanish dictionary loaded — the whole point of the card — the English
words of an English note are marked, the backdrop splits at them, and `Continue`
becomes a text node of its own, which coincides exactly with the English
catalogue value `common.continue`.

The guard's own documentation already names this class of limitation ("two keys
run together into one text node", and English that is not in the catalogue); what
it does not yet name is the converse — one node split *apart* by the backdrop —
so the honest fixes are both outside this card's May-edit list:

- `e2e/tests/chat-dictation.spec.ts`: give that note Spanish content in the
  `es-MX` project (as `spelling-es.spec.ts` does), or
- `e2e/support/no-english.ts`: add `common.continue` to `ALLOWED` with a reason
  naming the note backdrop, which `no-english.ts` documents as the only way to
  silence a coincidental match.

Neither was made: `e2e/support/` is on the card's *Must not edit* list and
`chat-dictation.spec.ts` is not on *May edit*.

### What the full run does prove, and it is the important part

- `spelling.spec.ts` (the English non-regression guarantee, byte-identical)
  **passes in the `chromium` project**.
- `spelling-es.spec.ts`'s five cases and `spelling-assets.spec.ts`'s one **pass
  in the `es-MX` project** as part of the full run, not only when run alone.
- `spelling-assets.spec.ts` **passes in both projects**, which is what makes V3
  and V6 the same case read two ways.
- The `es-MX` project's other 61 cases pass, including every `checkScreen`
  assertion except the one above.

## Side effect of the full e2e run, recorded here and in `V7-scope.md`

`e2e/tests/brand.spec.ts:157` writes its four screenshots into the committed
directory `docs/v2/evidence/P2.2/screenshots/`, so this run rewrote all four
(dark/light × default/accent). They were **not** restored: Stop 9 forbids
restoring a tracked path, and `docs/decisions.md` (2026-09-22) forbids silently
discarding a change. That is the whole of V7's part 3.
