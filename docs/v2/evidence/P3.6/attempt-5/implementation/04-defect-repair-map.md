# P3.6 attempt 5 — D1 and D2 against the code that now answers them

Authority: **AM-207**, which bounds this attempt to D1 and D2 of
`docs/v2/state/reviews/P3.6-impl4-source.md` and to nothing else. F1–F5 and
every D1–D6 / R1–R7 repair from the earlier reviews are untouched.

## D1 — HIGH — a settings label that renders unconditionally

### What was wrong

`flowSettings` confirmed the settings modal with
`UI_LABELS.settingsPane.text` = `settings.draftingModel` = `Drafting model`,
whose `h2` is at `web/src/routes/Settings.tsx:357`. That `h2` is inside
`LlmProfileSettings`, which

```
Settings.tsx:309  if (settings.state.status === 'loading') return <p …>;
Settings.tsx:311  if (settings.state.status === 'error')   return <p …>;
Settings.tsx:326  if (available.length < 2) return null;
```

and `available` is `llm_available_profiles`, which the server fills from
`LLM_PROFILES` — one entry, `quick`
(`server/src/ai/profiles.ts:17-19`, `:186`, `:188`, `:214`). So the component
returns `null` and the heading is never on screen, on a healthy run, in fake and
real mode alike. Every helper test that "proved" the label counted lines
containing `t('settings.draftingModel')`; none of them could see a `return null`,
which is why the defect survived four attempts.

### The label chosen

**`doc.settings` = `Settings`**, the modal's own nav title,
`web/src/routes/Settings.tsx:168`
(`<h2 className="settings-nav-title">{t('doc.settings')}</h2>`; the key is
defined at `shared/src/i18n/en.ts:1288`).

Chosen because it is inside the modal's `<nav>`, which is rendered by
`SettingsModalPanel` **outside** `SettingsSections` — so neither the
open-section gate (`Settings.tsx:210`, `show.includes('appearance')`) nor
anything a section renders can decide whether it appears, and no component on the
path has an early return at all except `Workspace`'s two whole-app guards.

### Uniqueness on the screen the flow reads

| Other `Settings` on screen? | Verdict |
| --- | --- |
| The rail menu's entry, `common.settings` at `web/src/components/PatientsColumn.tsx:438` | **Gone.** It is inside `{open && (` (`:428`), and its `onClick` is `choose(onOpenSettings)`, whose `choose` calls `setOpen(false)` **before** the action (`:403-408`, `:435`). The flow opens the menu, clicks it, and the menu is closed before the modal is up. |
| The `Dialog`'s own `title={t('common.settings')}` (`Workspace.tsx:804`) | **Not on screen.** Passed with `showTitle={false}` (`Workspace.tsx:806`), so `Dialog.tsx:152-156` renders no heading and the string becomes `aria-label` (`Dialog.tsx:148`). |
| `Appearance` — the alternative the review named | **Twice.** The nav label (`Settings.tsx:85`, rendered at `:169`) and the section heading (`:455`) are both up at once, so grounding on it refuses a healthy screen. |
| `common.settings` elsewhere | Other routes only: `About.tsx:42`, `Setup.tsx:122`, `Import.tsx:155/215`, `HalaxyImport.tsx:110/170`, `OnboardingFormat.tsx:109`. None is mounted over the workspace. |
| How many keys carry the string at all | Two, `common.settings` (`en.ts:1223`) and `doc.settings` (`en.ts:1288`) — asserted by the helper tests. |

### The render path, hop by hop (this is the proof; line counting is not)

`UI_LABELS.settingsPane.renderPath` carries this table in the harness, and the
helper tests assert every row against the tree — the declared gate must still be
present at that `file:line`, and each hop must carry a reason.

| # | file:line | the gate | why it cannot stop the label |
| --- | --- | --- | --- |
| 1 | `web/src/components/PatientsColumn.tsx:405` | `setOpen(false)` | the rail menu closes itself before the action runs, so its `Settings` is off screen by the time the modal is up |
| 2 | `web/src/routes/Workspace.tsx:608` | `{sidebarCollapsed && (` | the rail is what the flow drives (Tab to the rail's mission control, then Return); the expanded sidebar's `MissionControl` carries the same menu and the same `choose`, so either state reaches the same lines 403-408 |
| 3 | `web/src/routes/Workspace.tsx:615` | `onOpenSettings={() => {` | the rail's callback is the only writer of `settingsOpen`, and it writes `true` |
| 4 | `web/src/routes/Workspace.tsx:755` | `{settingsOpen && (` | the one condition on the whole modal, and it is true **because of the click this flow drives** |
| 5 | `web/src/routes/Workspace.tsx:756` | `<Suspense fallback={null}>` | `SettingsModalPanel` is lazily imported (`Workspace.tsx:58-60`), so this is a real suspense boundary: absent while the chunk loads, present after. The flow waits for the label, not for a delay |
| 6 | `web/src/routes/Workspace.tsx:800` | `function SettingsModal(` | its own body is a single unconditional return (`:802-813`) with no `if` in it |
| 7 | `web/src/routes/Workspace.tsx:806` | `showTitle={false}` | this is what keeps the Dialog's own `Settings` title off screen, so the nav title is the only visible one |
| 8 | `web/src/components/Dialog.tsx:152` | `{showTitle && (` | the only conditional between the Dialog root and its children, and it gates the *other* title; `{children}` at `:157` is unconditional |
| 9 | `web/src/components/Dialog.tsx:157` | `{children}` | unconditional, and `open` defaults to `true` (`:38`) with no `open={false}` passed |
| 10 | `web/src/routes/Settings.tsx:161` | `export function SettingsModalPanel(` | its own body has **no `if` and no early return at all** (`:161-198`): one return at `:165`, and the label is inside it |
| 11 | `web/src/routes/Settings.tsx:167` | `<nav className="settings-nav"` | the label is inside the nav, which is outside `SettingsSections`, so no section gate reaches it |

### Every statement at each hop body's own indent (`bodyGates`)

Only a statement at a component body's **own** indentation can decide whether the
label renders; a nested one lives inside a callback and cannot. The helper test
recomputes that set from the tree and compares it for **equality** with the
declared one, so a guard added later fails the test rather than passing quietly.

| component | gates between it and the label | classification |
| --- | --- | --- |
| `Workspace.tsx:73` `export function Workspace(` | `:173`, `:177` | bookkeeping (ref bookkeeping; no `return` within three lines, asserted) |
| | `:514` `if (serverUnavailable) {` | **guard** — returns a whole-app error screen (`:516-523`). If it fired, no flow could be driven at all: the window would carry "Apunta cannot reach the server" and none of the eleven screens would exist |
| | `:528` `if (formats.state.status === 'ready' && formats.state.data.length === 0) {` | **guard** — redirects the whole app to onboarding (`:530`). The workspace is only reached once a note format exists, and this flow runs nine flows after the onboarding flow created one |
| | `:531` `return (` | the component's own render return, which contains the modal |
| `Workspace.tsx:800` `function SettingsModal(` | `:802` `return (` | render return only |
| `Dialog.tsx:29` `export function Dialog({` | `:128` `return (` | render return only; the two `return () => {` at `:77` and `:124` are `useEffect` cleanups and cannot gate a render |
| `Settings.tsx:161` `export function SettingsModalPanel(` | `:165` `return (` | render return only |

Two further assertions close the door on the old label's failure mode: the label
is inside `<nav> … </nav>` (`Settings.tsx:167` … `:184`), and **both**
`AppearanceSettings` (`Settings.tsx:416`, guards at `:422` and `:423`) and
`LlmProfileSettings` (`:303`, guard at `:326`) are rendered after that nav
closes — so neither of their early returns is on the path. The tests assert the
old label's unreachability directly, including that `server/src/ai/profiles.ts`
promotes exactly one profile.

### The helper test's weakness, fixed

`UI_LABELS.settingsPane.renderPath` and `.bodyGates` are declared in the harness
next to the label, and five tests read them back against the source. None of them
is a count of lines carrying `t('key')`: each hop's declared gate must still be
present at that exact line, each hop body must have exactly the declared set of
own-indent statements, each `guard` must really `return` and must carry a reason,
each `bookkeeping` statement must not, and the label must sit inside the `<nav>`
with every section gate outside it. A label's proof is its render **condition**,
which is what D1 was about.

## D2 — MEDIUM — an ownership check that can fail

### What was wrong

`ownershipContainment` computed `appeared = after.filter((name) => !baseline
.includes(name))` and took `secondOwned = appeared ∩ ownershipFiles()`, while
`ownershipBaselineProof` asserts all four C-OWN@1 names are **already in the
baseline**. A name in the baseline can never appear in `appeared`, so
`secondOwned` was `[]` by construction and the check
`smoke no second lock, database, -wal or -shm` could never fail. And a second
server cannot present itself as a *new filename* in that folder anyway: it either
fails to take the lock or writes the same four names.

### The mechanism, both halves

**1. Identity (device + inode), recorded in the baseline and compared at the
end.** `ownershipIdentitySnapshot` reads each of the four with
`fs.statSync(path, { bigint: true })` — bigint so a 64-bit inode is never rounded
— and keeps `dev`, `ino` and `size` as decimal strings.
`ownershipIdentityDiff` then reports `replaced` (an asserted file present at both
ends with a different `dev`/`ino`), `appearedOwned`, `lost`, `released` and
`volatileChanged`, and the check
`smoke the C-OWN@1 files are still the ones this run created (device+inode)` is
asserted on it. **This is what can fail**: a replaced file is a different inode.

**2. The lock holder.** `readLockHolder` parses `apunta.lock` in C-OWN@1 rule 2's
own shape — `{ pid, processStart, appVersion, protocol: 1, nonce }`, written by
`acquireDataFolderLock` in `server/src/platform/data-lock.ts`. Its `pid` is
`process.pid` of the **server** process, and the shell spawns that server
directly (`src-tauri/src/main.rs:399`, `Command::new(&config.node_bin)`, no shell
in between) and prints the child it spawned (`main.rs:222`,
`apunta: spawned the bundled server as pid <N>`), so the harness's server pid and
the lock's pid are one number. `lockHolderCheck` requires, at the baseline and
again at the end of the flows: the holder is this run's server pid; the holder is
still readable; the pid has not changed; and the **nonce** has not changed — a
different nonce is C-OWN@1 rule 3's stale-branch takeover, which renames a fresh
lock over the old one. Two new checks carry it:
`smoke the data folder is locked by this run's own server pid` and
`smoke the data folder is still locked by this run's server pid at the end of the
flows`.

### The two decisions that needed care

**`-wal` and `-shm`: recorded, never asserted on.** SQLite creates and deletes
both around a checkpoint and on close, so a new inode for either is the database
working, not a second owner. Asserting their identity would have been a
false-positive path — F7's defect in a new place — so `VOLATILE_OWNED` marks
them, the diff records them in `volatileChanged` and in the check's message, and
`ok` ignores them. `apunta.db` is asserted, and it does not move.

**`apunta.lock` gone at the end is not a failure.** C-OWN@1 rule 5 has the lock
removed on a clean shutdown, and the identity check runs *after* the pid-scoped
stop, so "released" is a legitimate end state and is reported as such. What is a
failure is a **different file** at that name — a different inode, or a holder
that is not this run's server. The "still this run's pid" question is therefore
asked **before** the stop, while the server is alive and still holding it, which
is also the only moment it can be asked at all.

### What was kept exactly as it was

- The existing name-set check `smoke no second lock, database, -wal or -shm` is
  **byte-identical** — same name, same assertion. It is not the proof and its doc
  comment now says so (`secondOwned` is empty by construction; a second owner
  would have to *replace* a file, which a name set cannot see). Nothing was
  removed, renamed or relaxed.
- `otherNew` — the backup flow's own `backups/` and any other non-ownership name
  — is still reported and still **not** a failure.
- `vanished` is still over the **whole** baseline, unchanged.

### Falsifiability, demonstrated rather than asserted

`helper-tests.mjs` runs the new mechanism against real files in throwaway folders
under `os.tmpdir()` — no AppImage, no server, no lock protocol, nothing bound:

| case | expected | asserted |
| --- | --- | --- |
| unchanged baseline + a new `backups/` with a file in it | **pass** | `ownershipIdentityDiff(...).ok === true`; `otherNew === ['backups']`; `secondOwned === []` |
| `apunta.db` removed and rewritten (new inode) | **fail** | `ok === false`, one entry in `replaced` naming both `(dev, ino)` pairs |
| `apunta.lock` replaced (rule 3's rename takeover) | **fail** | `ok === false`, `replaced[0]` names `apunta.lock` |
| `-wal` and `-shm` deleted and recreated (a SQLite checkpoint) | **pass** | `ok === true`, both in `volatileChanged`, `replaced` empty |
| `apunta.lock` gone (clean release) | **pass** | `released === ['apunta.lock']`, message says `released on shutdown` |
| `apunta.db` gone | **fail** | `lost === ['apunta.db']` |
| lock holder is another pid | **fail** | `held by pid 9999` |
| same pid, new nonce | **fail** | `taken over mid-run` |
| lock unreadable / not JSON / non-integer pid / absent | `null`, never "fine" | asserted |
| no server pid to compare against | **fail**, named | `never printed the bundled server pid` |

A **mutation check** was run to prove these tests are not vacuous: with
`ownershipIdentityDiff`'s `ok` forced to `true` and `lockHolderCheck`'s nonce
comparison disabled, exactly three of the new tests fail
(`a replaced C-OWN file FAILS`, `a vanished database FAILS`,
`the lock holder must be this run's server pid`) and the suite exits 1. With the
mutations reverted, 53/53 pass and the suite exits 0. The mutated file was
restored immediately and the final hash in `03-file-hashes.txt` is of the
restored file.

## One pin corrected, and why it is not a repair

`UI_LABELS.onboardingPane.i18nLine` moved from 2168 to 2170. A parallel lane
(S6.1 / AM-203) added `spelling.loadFailed` to `shared/src/i18n/en.ts`
uncommitted, two lines above the key, which shifted it. The assertion the F1 test
makes is unchanged — the key must be defined at that exact line and rendered once
in `AddPatient.tsx` — and a further move still fails that test loudly. No other
pin moved, and no other label was touched.

## Not run, by instruction

No V0, V1, V2, V3, V4 or V5; no build, producer, AppImage launch, Tauri, cargo,
display, `xdotool`, audio device, inference, model, network, or port 7879;
no `git add`, commit or push. This is a **CODE/UNIT candidate** and claims no row
and no flow. Whether OCR reads `Settings` on a live modal, whether the keyboard
path lands, whether the lock really carries the shell's printed pid at runtime and
whether each click hits its intended cluster remain **UNKNOWN** until V3 runs —
which is a native run this attempt is not permitted to do.