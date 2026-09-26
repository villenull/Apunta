# Hard stops (HS-v1)

These apply to every session, every role, every card. If a step would cross
one, stop the step, write what was needed in your return file with status
`BLOCKED`, and do nothing else for that step.

- **HS-1 Live data.** Never open, list, read, copy, back up, restore or
  query the live Apunta data folder, its backups, the owner's Claude export
  or Halaxy PDFs. Never contact port **7717**. Never run
  `scripts/recover-current-linux.mjs` or `scripts/smoke-live.mjs`.
- **HS-2 Isolation.** Every command that starts an Apunta server, opens a
  database or launches the app runs through `scripts/v2/sandbox.mjs` once
  card P0.3 is APPROVED. Before that, only non-launching edits and unit
  tests that use in-memory or temporary databases created by the test.
- **HS-3 Downloads.** Only items in `docs/v2/ACQUISITION.md`, by the rules
  there. Never pull an Ollama tag that already exists locally. Never
  remove or replace an Ollama model.
- **HS-4 Git.** Work only on `feature/v2`, starting from the base commit the
  coordinator gave you. Never merge into `main`, pull, rebase, reset,
  force-push, rewrite history, or change repository visibility. Stage
  explicit paths only.
- **HS-5 Secrets.** Never create, print, copy or commit a production
  signing key or password. Test keys live only inside a sandbox run folder.
- **HS-6 Network at runtime.** No new network access from `server/`, `web/`
  or `shared/`. The only runtime exceptions are model acquisition (existing)
  and the update check in the Tauri shell (contract C-UPD).
- **HS-7 Safety instruments.** Never loosen a scorer, guard, lock, test or
  threshold to make a result pass. Never change a threshold in
  `docs/v2/CONTRACTS.md`.
- **HS-8 Fabricated data only.** Fixtures, audio, screenshots and examples
  are fabricated. English uses the prototype's sample people; Spanish uses
  only names in `e2e/fixtures/eval-es/NAMES.md`.
- **HS-9 Protected paths.** Never edit `prototype/`. Never edit files outside
  your card's "May edit" list.
- **HS-10 Owner-only actions.** Never enable Spanish in release builds, write
  the owner's clinical verdict, publish a release, create GitHub secrets, or
  stop or inspect the live v1 instance.
