# P3.4 — evidence, attempt 4

Bridge security: no IPC, locked navigation, CSP. Attempt 4 of 3, under AM-138's
exception. Base commit `e46bad4`. **Nothing is committed**; the coordinator
commits.

## Row table

| Row | Status | Exit | Evidence | One line |
| --- | --- | --- | --- | --- |
| S0 | **PASS** (inherited, skipped) | — | `acquisition-A06.md` | candidate already executable, so nothing was acquired |
| V0 | **PASS** | 0 | `V0-rebundle.md` | the re-bundle, producer included; counts 1 / exactly 0 / 16 |
| V1 | **PASS** | 0 | `V1-csp-unit.md` | 12 collected, 12 passed, 0 skipped |
| V2 | **FAIL** | 1 | `V2-appimage-security.md` | 13 PASS, 2 FAIL, 2 NOT RUN; all five containment PASS |
| V3 | **PASS** | 0 | `V3-config-greps.md` | 4 forbidden words, 0 matches, no `capabilities/` |
| V4 | **PASS** | 0 | `V4-lint-typecheck-tests.md` | 2235 tests, lint, typecheck, fmt, clippy, 55 cargo tests |

## The three things to read

1. **`V2-appimage-security.md` — the CSP claim is PROVEN.** The header is
   observed on a real `text/html` response over the app's own origin, carrying
   all six of rule 6 verbatim plus `style-src 'self' 'nonce-<n>'` and
   `style-src-attr 'unsafe-inline'`, with **no extra source in any of the six**.
   The nonce is per response — three runs, three different nonces. And (e) passes:
   `styleAttr` and `styleComputed` agree, so a style attribute really does apply
   in the shipped binary. **Forwarding works**: the marker reaches the AppImage
   child's stderr, each line carrying the pre-existing prefix
   `apunta: ignoring a bridge line (Unreadable):`.

2. **`V0-rebundle.md` — V0 was required although all three of the card's
   predicates were empty.** The AppImage in the tree was *fresh* and
   *unflagged* at the same time: newer than every Rule B input, yet carrying
   `p3.4-observe` in **0 of 16** shipped web bundles. V2's freshness walk would
   have passed and the five page assertions would have been `NOT RUN` for a
   reason unrelated to the shell. Recorded as a card observation.

3. **`V2-appimage-security.md`, "The two answers" — a harness defect nobody had
   found.** The observation readers polled a **frozen snapshot** of the child's
   stderr, so every fact published after the first read was invisible. Repaired
   in the one file in May edit, with no assertion, predicate, pass condition or
   timeout changed. That is what turned "the channel carries nothing" into a
   decidable row.

## What is still open, and it is a coordinator decision

- **(a) FAILS** with the observed value `tauri="undefined"`,
  `tauriInternals="object"`. Tauri v2 injects `__TAURI_INTERNALS__` into every
  webview and `withGlobalTauri: false` governs `__TAURI__` alone, so (a) as
  written asks for something the stack does not provide. Recorded as a FAIL; not
  reinterpreted, and V3's greps were **not** substituted for it.
- **(b) and (c) are NOT RUN**, behind a synthetic click that does not land. The
  rectangle is published and correct; the card's `xdotool` mechanism does not
  change the page within 30 s. The onboarding cause was found and fixed; the
  remaining cause is not established.

Nothing was weakened to reach any result (HS-7): no count lowered, no assertion
relaxed, no threshold moved, `web/dist` left unflagged on every path, and the
AppImage stopped by pid on every run.