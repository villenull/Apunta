# Owner UI batch integration — 2026-09-27

Base: `36217cf`. The UI owner supplied 12 application/test files, then repaired
two additional e2e selectors. No server logic, database schema, threshold,
clinical guard, or acquisition permission changed. All work used fabricated
data. The owner-facing agent remains available for tomorrow:
`f0bd1c61-253b-46ce-b59b-080334f6cb07`.

## Changes

- Default teal `#2a9d8f` and automatic dark primary-button labels (AM-055).
- Add patient opens a dialog over the workspace, with a close glyph and no lede.
- Sidebar collapse/expand animates; reduced-motion preferences disable it.
- Collapsed rail swaps its A and panel glyph correctly on hover/focus.
- Direct drag-resizing remains immediate instead of inheriting the collapse
  transition. The independent review found this regression; the author repaired
  it and the coordinator verified a real drag in Chromium.

## Verification

All commands used Node 24.19.0, explicitly selected in PATH. Working directory
was the repository root unless noted. Raw logs under `/tmp` are not committed.

| Coordinator check | Exit / result |
| --- | --- |
| `npm run lint` | 0 |
| `npm run typecheck` | 0 |
| `npm run build` | 0 |
| `npm test` | 0; 150 files, 1,967 tests |
| `npx vitest run --project shared --project web` | 0; 62 files, 601 tests |
| Final CSS: `npm run build --workspace @apunta/web` | 0 |
| Chromium modal, in-app Name focus, teal/foreground, rail hover, collapse, reduced motion, animations disabled | 0 |
| Chromium real drag after R1 repair | 0; width 344px with transition 0s during drag; 0.24s/0.18s restored after release; collapse still hides the column |
| Final targeted Chromium e2e | 0; all 23 passed (31.8s), including unchanged spelling test |

Independent reviewer: `state/reviews/UI-BATCH-impl.md`. Its own reruns:
four targeted files / 100 tests, typecheck and lint all exit 0. Reviewer R1 is
closed by the verified drag rule above; the reviewer was archived after its
result was processed. The earlier UI-TEAL instruction report is historical;
the owner superseded per-tweak instruction approval with finished-batch review.

Final e2e command, cwd `e2e/`, after sourcing sandbox env on port 7832:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npx playwright test --project=chromium --workers=1 tests/workspace.spec.ts tests/formats.spec.ts tests/spelling.spec.ts tests/brand.spec.ts
```

## Failures and repairs preserved

The first npm-wrapper command swallowed `--project`/`--workers` and expanded
into unrelated Spanish work; it was stopped and is not acceptance evidence.
Subsequent runs invoked Playwright directly from `e2e/`, with sandbox exports
from `scripts/v2/sandbox.mjs env`, on dedicated ports in the permitted range.

A properly scoped first run exited 1: 17 passed, 3 failed, 3 not run. Two
failures were ambiguous Add patient selectors after the close button appeared;
`exact: true` retains the real submission checks. The other was a stale
accent-invariance assertion contradicting the owner's approved accent-following
branding. It now checks that different accents paint different marks, retaining
the per-state exact RGB assertions. No threshold or guard was relaxed.

The next run exited 1: 22 passed and the spelling test failed once at the cold
`/patients/new` step. Its snapshot showed an empty Name field despite the fill
operation. The same unchanged test passed in isolation (exit 0). This is an
intermittent observation, not a claimed fix. The cold-load primary-window focus
behavior predates this batch; the reviewer checked its unchanged implementation.

The brand spec overwrites four historical P2.2 screenshots. Generated images
were preserved under `/tmp/apunta-ui-brand-evidence/`, and the tracked P2.2
images restored to their pre-run bytes rather than rewriting old evidence.

## Remaining limits

Cold-loading `/patients/new` can park initial focus on the route wrapper;
in-app opening focuses Name correctly. The favicon still carries the historical
fixed teal. Full Spanish acceptance remains blocked separately under S2.6.
No unread/custom-groups/sort-menu implementation is included in this batch.

Preview: <http://127.0.0.1:7811/>, isolated fake data, final built web assets.
