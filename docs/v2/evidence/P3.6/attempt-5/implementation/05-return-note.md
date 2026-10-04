# Return note — P3.6 attempt 5 (CODE/UNIT), D1 and D2

Append-only: written once, at the end of this attempt, and not rewritten by a
later session. A later attempt appends its own note rather than editing this one.

## Status

Both defects AM-207 bounds this attempt to are repaired in
`scripts/v2/tauri-e2e-smoke.test.mjs` and each is proved by synthetic helper
tests plus read-only reads of the app's own source. **No row was run**, so the
card's rows (V0–V5) are untouched and V3 remains unproven. Nothing outside this
card's two paths changed, and nothing was staged, committed or pushed.

## Files changed

- `scripts/v2/tauri-e2e-smoke.test.mjs` — 3174 → 3628 lines, sha256
  `1b1e151b87c96e26fd5bc866392bbeff7ba3f9a8f568b1df50f97faed2339b24`.
- `docs/v2/evidence/P3.6/attempt-5/implementation/**` — this directory:
  `00-readme.md`, `01-scoped-checks.txt`, `02-helper-tests.txt`,
  `03-file-hashes.txt`, `04-defect-repair-map.md`, `helper-tests.mjs`,
  `05-return-note.md`.

Not touched: the frozen V0 evidence, `src-tauri/target/**`, the test AppImage,
`docs/v2/cards/P3.6.md`, `docs/v2/state/**`, every attempt-1..4 history, and every
`server/**`, `shared/**` and `web/**` file — other workers have those in flight
(S6.1/AM-203 among them) and this attempt left them alone.

## D1 — the settings label renders unconditionally

The modal is confirmed by **`doc.settings` = `Settings`**, its own nav title at
`web/src/routes/Settings.tsx:168` (key defined at `shared/src/i18n/en.ts:1288`),
replacing `settings.draftingModel` (`Settings.tsx:357`) which lives in
`LlmProfileSettings` — a component that returns `null` at `Settings.tsx:326`
whenever fewer than two LLM profiles are published, and the server publishes
exactly one (`quick`, `server/src/ai/profiles.ts:17-19`, `:186`, `:214`).

It renders unconditionally because it is inside the modal's `<nav>`, rendered by
`SettingsModalPanel` outside `SettingsSections`, so no section gate and no
section's early return can decide it. The full render path is declared in
`UI_LABELS.settingsPane.renderPath` (11 hops: `PatientsColumn.tsx:405`,
`Workspace.tsx:608/615/755/756/800/806`, `Dialog.tsx:152/157`,
`Settings.tsx:161/167`), each with the reason it cannot stop the label, and
`UI_LABELS.settingsPane.bodyGates` declares every statement at each hop body's
**own** indent that could gate it: `Workspace`'s two bookkeeping statements and
its two whole-app guards (`:514` server-unreachable, `:528` no-note-format
redirect), and nothing at all in `SettingsModal`, `Dialog` or
`SettingsModalPanel` but their own render return. The helper tests compare both
sets for **equality** against the tree, so a gate added later fails a check.

It is unique in the state the flow drives: the rail menu's `Settings`
(`PatientsColumn.tsx:438`, inside `{open && (` at `:428`) is closed by its own
`choose` (`:403-408`) before the modal opens, and the `Dialog`'s
`title={t('common.settings')}` is passed with `showTitle={false}`
(`Workspace.tsx:806`), so it is an `aria-label` (`Dialog.tsx:148`) and never on
screen. `Appearance` was no use: it is on the modal twice (nav label `:85`
rendered at `:169`, section heading `:455`).

The old proof style — counting lines that render `t('key')` — is gone for this
label: five tests now assert the render *condition*.

## D2 — the ownership containment can fail

Two mechanisms, both recorded in the baseline and asserted at the end:

1. **Identity.** `ownershipIdentitySnapshot` reads each of the four C-OWN@1 files
   with `fs.statSync(path, { bigint: true })` (bigint so a 64-bit inode is never
   rounded) and keeps `dev`, `ino`, `size`; `ownershipIdentityDiff` fails on
   `replaced` (an asserted file with a different `dev`/`ino` at the end),
   `appearedOwned`, and `lost` (an asserted file gone, other than the lock).
2. **The lock holder.** `readLockHolder` parses `apunta.lock` in C-OWN@1 rule 2's
   own shape (`{ pid, processStart, appVersion, protocol, nonce }`), and
   `lockHolderCheck` requires it to be this run's server pid — the shell spawns
   the server directly (`src-tauri/src/main.rs:399`) and prints that same pid
   (`main.rs:222`), and the lock's `pid` is that process's `process.pid`
   (`server/src/platform/data-lock.ts`) — with the baseline's nonce unchanged. It
   is checked at the baseline and again at the end of the flows, while the server
   still holds it.

Two decisions taken carefully, both documented in
`04-defect-repair-map.md`:

- **`-wal` and `-shm` are recorded, never asserted on.** SQLite creates and
  deletes both around a checkpoint and on close, so a new inode there is the
  database working; asserting it would be a false-positive path.
- **`apunta.lock` absent at the end is not a failure** — C-OWN@1 rule 5's clean
  release, reported as `released`. A *different* file at that name, or a holder
  that is not this run's server, is.

Kept exactly as before: the name-set check `smoke no second lock, database, -wal
or -shm` is byte-identical (same name, same assertion) and its doc comment now
says plainly that it is not the proof, because `secondOwned` is empty by
construction; `otherNew` — the backup flow's own `backups/` among it — is still
reported and still not a failure; `vanished` is still over the whole baseline.
**No check was renamed, removed or weakened.**

Falsifiability is demonstrated, not asserted: the helper tests run the mechanism
against real files in throwaway folders and show it failing on a replaced
`apunta.db`, a replaced `apunta.lock`, a vanished database, a foreign lock pid and
a new nonce, and passing on an unchanged baseline with a new `backups/`, on a
SQLite-style WAL recreation and on a clean lock release. A mutation check
(neutering `ownershipIdentityDiff`'s `ok` and `lockHolderCheck`'s nonce
comparison) fails exactly three of those tests and exits 1; with the mutation
reverted, 53/53 pass and exit 0.

## One pin corrected

`UI_LABELS.onboardingPane.i18nLine` 2168 → 2170, because a parallel lane
(S6.1 / AM-203) added two lines to `shared/src/i18n/en.ts` above that key. The F1
assertion is unchanged and a further move still fails loudly. No other pin moved
and no other label was touched.

## Verification run (pinned Node v24.19.0)

| command | exit |
| --- | --- |
| `node --check scripts/v2/tauri-e2e-smoke.test.mjs` | 0 |
| `npx eslint scripts/v2/tauri-e2e-smoke.test.mjs` | 0 |
| `npx prettier --check scripts/v2/tauri-e2e-smoke.test.mjs` | 0 |
| `node --check …/helper-tests.mjs` | 0 |
| `node …/helper-tests.mjs` | 0 (53/53) |

## Unresolved, and what the next step is

Whether OCR reads `Settings` on a live modal, whether the keyboard path lands,
whether the lock really carries the shell's printed pid at runtime, and whether
each click hits its intended cluster are **UNKNOWN** — only a native V3 settles
them, and this attempt may not run one. AM-207's order therefore stands
unchanged: an independent source review of this candidate must be CLEAR, and only
then V0 once (the frozen AppImage is stale under Rule B — 40 in-flight Rule B
changes in this tree), and only then native V3.