# S2.6 resume baseline — 2026-09-27

Coordinator independently reran the last worker's three converted flow specs.
This is diagnostic evidence, not approval of S2.6.

- Code head: `e9e8c8b` (application code unchanged from `ce24912`).
- Working directory: repository root.
- Runtime: pinned Node 24.19.0, selected explicitly in PATH.
- Isolation: `node scripts/v2/sandbox.mjs env --port 7820`; exports sourced
  into the test process. English and Spanish servers used 7820 and 7821.
- Command: `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run e2e -- --workers=2 tests/halaxy-import.spec.ts tests/import.spec.ts tests/plan.spec.ts`.
- Exit code: **1**.
- Result: **8 passed, 1 skipped, 1 failed**, reported duration 12.7 seconds.
- First/last server events: 2026-09-27T06:44:35.994Z / 06:44:45.632Z.
  These are log event bounds, not exact shell start/end timestamps.
- Raw output retained at `/tmp/apunta-s26-audit.log`; not committed because
  server logs include machine identifiers.

The failing row is the es-MX treatment-plan flow at `plan.spec.ts:142`:

```text
English catalogue text on the Spanish the treatment plan in force screen
chat.change.summary [text]: "I authored and reviewed this treatment plan.
Attested in Apunta — sign the copy in your records system."
(es-MX: "Cambié lo siguiente: {changes}.")
```

The matcher's catalogue attribution is coincidental, but the displayed English
is real. `server/src/routes/plans.ts` writes the English `ATTESTATION_TEXT`
constant from `shared/src/plan.ts` at activation. The instruction reviewer
received this result to assess scope and immutability requirements. No check
was suppressed and no application code was changed by the coordinator.
