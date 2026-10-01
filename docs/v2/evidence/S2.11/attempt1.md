# S2.11 — evidence

Attempt 1 of 3. Base commit `87b08466794301295dda2c907852b88d15777b73`. Sandbox
port `7820` (es-MX on `7821`), V7's CI shape on `7822` (es-MX on `7823`). Live
port `7717` was never contacted; no live data folder, export or Halaxy PDF was
read (HS-1).

Every path below is sanitised: the sandbox run folder is `<sandbox>`, the home
folder is `~`. Raw logs stayed in `<sandbox>/logs` and are not committed.

Sandbox run ids used: **one**,
`2026-10-01T03-53-46-363Z-0e3819e8` (`<sandbox>/logs/v5-populate.log`,
`v5-amplified.log`, `v6-run-1.log` … `v6-run-5.log`). It was created by V5's own
first command, `node scripts/v2/sandbox.mjs env --port 7820`, and sourced
unchanged by V6 — no second `env` was created anywhere in the card.

Effective model: `space-bunny-free` (`opencode-go/space-bunny-free`), default
effort and default variant, no override.

---

## 1. V3 — the negative control, before any edit

cwd: repository root. Node: pinned v24.19.0. Wall clock: 21:51:44Z–21:52:04Z.

```
export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" &&
cp web/src/App.tsx /tmp/apunta-v2-s2.11-App.tsx.bak &&
sha256sum web/src/App.tsx > /tmp/apunta-v2-s2.11-app-tsx.sha256 &&
git show 87b08466794301295dda2c907852b88d15777b73:web/src/App.tsx > web/src/App.tsx &&
( npm run build:shared && npx vitest run web/src/App.primaryWindow.test.tsx ); rc=$?;
cp /tmp/apunta-v2-s2.11-App.tsx.bak web/src/App.tsx && rm -f /tmp/apunta-v2-s2.11-App.tsx.bak &&
sha256sum -c /tmp/apunta-v2-s2.11-app-tsx.sha256 && test $rc -ne 0
```

The command was run verbatim except that stdout+stderr were redirected to a
scratch file (`/tmp`, outside the checkout) instead of the terminal, and the
inner run's exit code was echoed afterwards for the record. Both exit codes the
row names:

| | value |
| --- | --- |
| inner `npm run build:shared && npx vitest run` | **1** |
| the row itself, ending in `test $rc -ne 0` | **0** — the row's pass |
| `sha256sum -c` in the same command | `web/src/App.tsx: OK` |

Result: **2 failed | 3 passed (5)**. (a) and (b) fail at the base commit, (c),
(d) and (e) pass — exactly the shape the row's Expected cell demands. Stop
condition 1 does not fire.

### The two failing assertions, verbatim

The receipt of the diagnosis (Fixed decision 1):

```
 ❯ |web| src/App.primaryWindow.test.tsx (5 tests | 2 failed) 165ms
     × (a) leaves the app out of `inert` while the window is still acquiring, with the prompt still up 39ms
     × (b) leaves the caret where she put it when the grant lands 38ms
```

Case (b)'s logged `document.activeElement`, which is the steal the case pins:

```
stderr | src/App.primaryWindow.test.tsx > the primary-window gate on a cold /patients/new > (b) leaves the caret where she put it when the grant lands
S2.11 case (b): document.activeElement after the post-release frame is #apunta-content
```

Case (a):

```
FAIL  |web| src/App.primaryWindow.test.tsx > the primary-window gate on a cold /patients/new > (a) leaves the app out of `inert` while the window is still acquiring, with the prompt still up
AssertionError: expected true not to be true // Object.is equality
 ❯ src/App.primaryWindow.test.tsx:221:32
    219|     expect(pending[0]?.ifAvailable).toBe(true);
    220|     // The gate is the subject here, so the flag is asserted directly.
    221|     expect(contentInert()).not.toBe(true);
       |                                ^
```

Case (b):

```
FAIL  |web| src/App.primaryWindow.test.tsx > the primary-window gate on a cold /patients/new > (b) leaves the caret where she put it when the grant lands
AssertionError: expected <div id="apunta-content" …(2)>…(2)</div> to be <input id="patient-name" …(5)></input> // Object.is equality

- Expected
+ Received

+ <div
+   class="route-transition"
```

(plus the full `<div class="route-transition">` / `<input id="patient-name">`
element dumps, ~700 lines in the raw log).

The restore is proven in the same command by `sha256sum -c`, and the working
tree was re-verified after it: `git diff --stat -- web/src/App.tsx` reported
`1 file changed, 11 insertions(+), 4 deletions(-)` again — the fixed version.

---

## 2. The change — two places in `web/src/App.tsx`, and nothing else

`git diff -- web/src/App.tsx`, complete:

```diff
@@ -59,7 +59,12 @@ function AppRoutes(): React.JSX.Element {
   const location = useLocation();
   const { state } = useSettingsContext();
   const primary = usePrimaryWindow();
-  const blocked = primary.phase !== 'primary';
+  // `inert` is for a window known to be blocked, not for one still finding
+  // out: a window in 'acquiring' has not been found to be a second one, and
+  // the handling of the grant already tells the two apart. The blocker's own
+  // fullscreen cover — and its Tab trap — hold pointer and keyboard
+  // throughout that one interval either way.
+  const blocked = primary.phase === 'secondary' || primary.phase === 'unsupported';
   const contentRef = useRef<HTMLDivElement>(null);

@@ -245,7 +250,6 @@ function usePrimaryWindow(): PrimaryWindow {
     /** The window can be edited from here on. Never called before the grant. */
     const becomePrimary = (release: () => void): void => {
-      const wasBlocked = phase !== 'primary';
       // Only a handoff from blocked needs a refresh: the first window to win
       // on initial load already renders from a fresh loader mount.
       const needsRefresh = phase === 'secondary';
@@ -265,8 +269,11 @@ function usePrimaryWindow(): PrimaryWindow {
       if (needsRefresh && !cancelled) {
         window.dispatchEvent(new Event('apunta:became-primary'));
       }
-      // A takeover lands the keyboard back in the app it just unlocked.
-      if (wasBlocked) {
+      // A takeover lands the keyboard back in the app it just unlocked. Not
+      // on the first grant, though: that one arrives while she may already be
+      // typing into a field, and moving the caret there would take the rest of
+      // the word away from her.
+      if (needsRefresh) {
         window.requestAnimationFrame(() => {
           if (cancelled) return;
           document.getElementById('apunta-content')?.focus({ preventScroll: true });
```

**Why this shape** (Fixed decision 2). Both edits narrow an existing reaction;
neither adds one. The gate keeps `inert` for exactly the two phases the
comment at `App.tsx:74-79` describes — `'secondary'` and `'unsupported'` — and
drops it for `'acquiring'`, which has not been found to be a second window. The
caret keeps its rAF and its target for a **handoff**, and stops firing it on the
first grant, where it yanked the caret out of a field she was typing into. The
discriminator is the file's own `needsRefresh` local at `:251`, **not** a fresh
`phase === 'secondary'` test: `applyPhase('primary')` at `:261` assigns the
hook's closure `phase` before the guard, so a literal re-test there is always
false and the rAF would never be scheduled at all. Deleting `wasBlocked`
(`:248`) is inside May edit's stated `:247-275` region and is required — an
unused local is an ESLint error (`eslint.config.js:101-104`), so V1's lint would
otherwise be red.

**The residual the narrowing admits**, in the coordinator's own record: for the
one `'acquiring'` interval, the app behind the blocker is in the tab order and
in the accessibility tree. The covering prompt is still on screen for that whole
interval — `position: fixed; inset: 0; z-index: 100`
(`web/src/styles/app.css:2520-2523`) with its own Tab trap and Escape handling
(`App.tsx:511-534`) — so nothing behind it becomes reachable by pointer or by
keyboard in the sense that matters. What changes is that a browser's own
sequential focus navigation and screen-reader tree no longer exclude it during
the window in which it is about to become the app she is allowed to use.

---

## 3. The new file, `web/src/App.primaryWindow.test.tsx` — five cases

Colocated vitest + `@testing-library/react`, the shape of `web/src/App.test.tsx`
(`createMemoryRouter` over the real `<App />`, `installFakeApi`, the same
`afterEach` teardown plus its own restore list). It installs its **own**
deferred Web Locks shim and its **own** queued `requestAnimationFrame` stub, both
**after** `installFakeApi(...)`, because `installFakeApi` calls
`installFakeWebLocks()` first and `Object.defineProperty`s `navigator.locks`
(`web/src/test/fakeApi.ts:486-489`) — a shim defined before it is silently
overwritten and the phase is `'primary'` before any assertion runs. No shared
helper was touched: `fakeApi.ts` is byte-identical to the base.

The lock string is the app's own, `PRIMARY_LOCK_NAME = 'apunta-primary-v1'`
(`App.tsx:162`), not a guess; a foreign holder is modelled by answering the
`ifAvailable` probe with `null`, which is what the real API answers a second
window and what `fakeApi.ts` answers while its own holder is held.

| Case | What it proves | Base | Fixed |
| --- | --- | --- | --- |
| **(a)** the gate, cold | `#apunta-content` is **not** `inert` while the phase is `'acquiring'`, and `data-testid="primary-blocker"` is still on screen showing "Opening Apunta…" — so the case is about the gate, not about removing the prompt | **FAIL** | PASS |
| **(b)** the caret, cold — the user's loss, pinned to the **late** cold load | one frame flushed after the mount (so `PrimaryBlocker`'s own frame at `App.tsx:505` has run), the caret placed in the name field and the name typed **while the phase is still `'acquiring'` and before the grant**, then the grant released and **one more frame flushed** before anything is asserted. Then `document.activeElement` **is** `#patient-name` and the value is still `Teh` | **FAIL** | PASS |
| **(c)** the handoff keeps its focus move | a foreign holder under `apunta-primary-v1` answers the probe `null` → `'secondary'`; the takeover button is clicked, the exclusive request is granted, **one frame of the file's own stub is drained**, and then the caret **is** `#apunta-content`. This is the case that fails if the fix is done by deleting the rAF | PASS | PASS |
| **(d)** a re-render storm | a name typed on `/patients/new`, then eight state updates driven through the workspace's search field behind it (the shape `usePatientRecency.ts:63` drives its six-at-a-time fan-out with): the field still holds `Teh`, its spell-layer backdrop still draws `Teh`, and the caret is still in it. **Passes at the base too** — the standing guard on the objective's property, not a reproduction, and reported as such | PASS | PASS |
| **(e)** the gate, blocked | with the same foreign holder, `content.inert === true` while `'secondary'`, and still `true` once the takeover is under way (`pending === true`, the decline button replaced, `App.tsx:566-579`); then, and only then, the gate opens again after the takeover lands. This is what stops the narrowing becoming "never `inert`", and it is the unit-level statement of the guarantee `e2e/tests/save-integrity.spec.ts:80`/`:87` asserts e2e-side | PASS | PASS |

The three placements in (b) are the case's specification, not a convenience: an
assertion taken inside the releasing `act()` reads the field on the base tree
too, `test $rc -ne 0` is then false and V3 goes red on a correct diagnosis. Both
existing pins are kept and were re-verified unchanged:
`web/src/App.test.tsx`'s `stays blocked with an explanation and inert app
content` (`'unsupported'` → `inert === true`) passes in both zones, and
`e2e/tests/save-integrity.spec.ts:25` / `:154` pass in the populating run and in
all five V6 runs.

---

## 4. V1 — lint, typecheck, and the change set from two commands

```
export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" &&
npm run lint && npm run typecheck &&
printf '%s\n' '--- tracked vs base ---' &&
git diff --name-only 87b08466794301295dda2c907852b88d15777b73 &&
printf '%s\n' '--- status ---' && git status --porcelain
```

Exit **0**. `eslint .` clean, `prettier --check .` "All matched files use
Prettier code style!", `check-no-external-urls`, `collect-licenses --check`
("THIRD-PARTY-LICENSES.md lists all 111 shipped packages", TOTAL 0),
`check-ui-strings` clean; `npm run typecheck` green in all five workspaces
(`shared`, `server`, `installer`, `web`, `e2e`).

```
--- tracked vs base ---
web/src/App.tsx
--- status ---
 M web/src/App.tsx
?? docs/v2/state/dispatch/S2.11-orca.json
?? docs/v2/state/dispatch/S2.11.md
?? web/src/App.primaryWindow.test.tsx
```

**Re-run after the two required outputs existed** (Step 6), so the scope check is
read against the finished change set rather than a half-written one. Identical
result, exit **0**:

```
--- tracked vs base ---
web/src/App.tsx
--- status ---
 M web/src/App.tsx
?? docs/v2/evidence/S2.11/
?? docs/v2/state/dispatch/S2.11-orca.json
?? docs/v2/state/dispatch/S2.11.md
?? docs/v2/state/returns/S2.11.md
?? web/src/App.primaryWindow.test.tsx
```

The two May-edit paths, plus this card's two required outputs, which are
AM-017-excluded rather than absent at this point. The two
`docs/v2/state/dispatch/**` entries are the coordinator's own untracked files
(`S2.11.md` was already untracked when this session started) and are named here
so a clean run is not misread as a third path. `web/src/App.test.tsx`,
`web/src/routes/AddPatient.tsx`, `e2e/**`, `server/**`, `shared/**` and
`src-tauri/**` are absent from both halves.

**One addition to the row, for the record:** `prettier --check .` initially
failed on the new test file alone (`[warn] web/src/App.primaryWindow.test.tsx`)
on the first V1 attempt, because the file is new and prettier had not yet seen
it. `npx prettier --write web/src/App.primaryWindow.test.tsx` fixed formatting
only, inside May edit, and V1 then exited 0. No formatting rule, threshold or
config was changed, and the second V1 run above is the recorded one.

`prettier --check` covers **zero** Markdown files here (`.prettierignore` holds
`*.md` and `docs/v2/state/`), so no Markdown prettier result is offered as
evidence. `node docs/v2/tools/check-plan.mjs` was **not** run: this card edits no
plan document (`PROGRESS.json`, `DEPENDENCIES.md` and every plan file were
coordinator-authored, and HS-9 forbids this card touching them).

---

## 5. V2 — the new file on the fixed tree

```
export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" &&
npm run build:shared && npx vitest run web/src/App.primaryWindow.test.tsx
```

Exit **0**, `Tests 5 passed (5)`, one file. With `--reporter=verbose` so the five
names are in the output:

```
S2.11 case (b): document.activeElement after the post-release frame is #patient-name
 ✓ |web| src/App.primaryWindow.test.tsx > the primary-window gate on a cold /patients/new > (a) leaves the app out of `inert` while the window is still acquiring, with the prompt still up 42ms
 ✓ |web| src/App.primaryWindow.test.tsx > the primary-window gate on a cold /patients/new > (b) leaves the caret where she put it when the grant lands 28ms
 ✓ |web| src/App.primaryWindow.test.tsx > the primary-window gate on a cold /patients/new > (c) still lands the keyboard in the app after a takeover 25ms
 ✓ |web| src/App.primaryWindow.test.tsx > the primary-window gate on a cold /patients/new > (d) keeps a typed name and its spell layer through a burst of re-renders behind the window 44ms
 ✓ |web| src/App.primaryWindow.test.tsx > the primary-window gate on a cold /patients/new > (e) keeps a known-blocked window `inert`, including while a takeover is under way 24ms
```

Case (b)'s logged `document.activeElement` is `#patient-name` on the fixed tree
and `#apunta-content` on the base tree — the same line of the same case, and the
difference between the two runs is decision 2 and nothing else. Case (d) passes
here and is reported as the standing guard it is.

---

## 6. V4 — the whole unit and integration suite, two zones

```
export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" &&
TZ=UTC npm test && TZ=Australia/Sydney npm test
```

| Zone | Exit | Test files | Tests |
| --- | --- | --- | --- |
| `TZ=UTC` | **0** | 158 passed (158) | **2127 passed (2127)**, 0 skipped |
| `TZ=Australia/Sydney` | **0** | 158 passed (158) | **2127 passed (2127)**, 0 skipped |

The new file's five cases are inside both totals (158 files, up from 157).
`web/src/App.test.tsx`'s `stays blocked with an explanation and inert app
content` (`'unsupported'` → `inert === true`, `:1515-1516`) was re-verified
green under **both** zones with
`npx vitest run web/src/App.test.tsx -t "inert app content" --reporter=verbose`
(`Tests 1 passed | 77 skipped (78)` in each) — the constraint decision 2 must
keep, with no assertion in that file moved.

Both rows ran on the pinned Node v24.19.0, not the host default, as decision 6
requires.

---

## 7. V5 — one sandbox, populated first, then amplified

cwd: repository root, once. Port `7820`; the es-MX server took `7821` and
`<sandbox>/data-es-MX` on its own. The command was run verbatim from the card,
with each `>` redirect landing in `<sandbox>/logs` as prescribed and no `| tee`
anywhere, so `$?` is the run's own exit code.

| Invocation | Exit | Result |
| --- | --- | --- |
| `npm run e2e` (populating run) — `rc_pop` | **0** | **108 passed, 6 skipped** (52.5 s) |
| `( cd e2e && npx playwright test --project=chromium --repeat-each=3 --workers=4 spelling.spec.ts )` — `rc_amp` | **0** | **3 passed** (7.0 s) |

```
  ✓  2 [chromium] › tests/spelling.spec.ts:14:1 › marks a typo in the note body and corrects it from the menu (2.2s)
  ✓  1 [chromium] › tests/spelling.spec.ts:14:1 › marks a typo in the note body and corrects it from the menu (2.3s)
  ✓  3 [chromium] › tests/spelling.spec.ts:14:1 › marks a typo in the note body and corrects it from the menu (2.3s)
```

- `the page logged console errors` lines in the amplified log: **0**.
- `e2e/tests/spelling.spec.ts` is **unmodified**:
  `git diff --name-only 87b08466794301295dda2c907852b88d15777b73 -- e2e/` is
  empty. Neither is any other file under `e2e/`.
- The e2e half of case (e): `save-integrity.spec.ts:25` (`a primary handoff
  flushes the pending edit and blocks the old window`) and `:154` (`a failed
  flush keeps the old primary and leaves takeover blocked`) are green in the
  populating run in **both** projects (chromium 37/38, es-MX 94/95). Their two
  `contentInertScript() === true` assertions (`:80`, `:87`) therefore still read
  a settled `'secondary'`, and case (e) is what makes that a guarantee rather
  than a margin.
- Nothing listening on `7820`/`7821` afterwards; `7717` was never contacted.
- `npx playwright install` was not run (HS-3): Playwright's browsers are not in
  `docs/v2/ACQUISITION.md`. This box used the config's own documented escape
  hatch `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium` on every Playwright
  command, as an addition to the card's command.

Stop condition 2 was therefore not reached: no failing `spelling.spec.ts` run
occurred on the fixed tree, so there were no two values (`#apunta-content`'s
`inert` and whether `document.activeElement` is `#patient-name`) to record at
the moment the field reads `""`.

---

## 8. V6 — five consecutive default-worker runs, one env

```
export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" &&
. /tmp/apunta-v2-s2.11-e2e.env && RUN_LOGS="$(dirname "$APUNTA_DATA_DIR")/logs" &&
for i in 1 2 3 4 5; do PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run e2e > "$RUN_LOGS/v6-run-$i.log" 2>&1; rc=$?; echo "run $i exit=$rc"; git checkout -- docs/v2/evidence/P2.2/screenshots/; done
```

Default workers from `e2e/playwright.config.ts` (`Running 114 tests using 4
workers`), `retries: 0`, **no serial flag, no retry, no skip, no timeout change
and no config edit**. The env file is the one V5 created and populated;
`APUNTA_DATA_DIR` resolved to the same `<sandbox>/data` V5 populated. The
screenshot restore is inside the loop, once per iteration.

| Run | Window (UTC) | Exit | Passed | Skipped | `the page logged console errors` | Recency 404s (`/api/patients/*/notes`) |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 03:54:58 → 03:55:50 | **0** | 108 | 6 | 0 | 0 |
| 2 | 03:55:50 → 03:56:44 | **0** | 108 | 6 | 0 | 0 |
| 3 | 03:56:44 → 03:57:36 | **0** | 108 | 6 | 0 | 0 |
| 4 | 03:57:36 → 03:58:29 | **0** | 108 | 6 | 0 | 0 |
| 5 | 03:58:29 → 03:59:22 | **0** | 108 | 6 | 0 | 0 |

**Five of five exit 0.** Passed and skipped are identical across all five runs
and unchanged from S2.10's figure of 108 passed / 6 skipped — this card adds no
e2e test, so any drift would have been a finding with a named test, and there
was none. The six skipped are the same structural six: five
`language-control.spec.ts` cases in the `chromium` project (`:104`, `:154`,
`:203`, `:268`, `:385`) and `language-control.spec.ts:80` in `es-MX-language`.
Nothing moved into `skipped`.

Recency-404 counts, recorded as numbers (AM-094's class, counted not fixed):
**0 in every one of the five runs**. The 404s the logs do contain (4–6 per run)
are note fetches, including the deliberate `/api/notes/does-not-exist` the
import specs make; none is a `/api/patients/<id>/notes` 404. No console error
of any class appeared in any run, so `consoleErrors` was neither widened nor
narrowed — AM-094's one admitted class was not needed at all.

The no-English guard ran in all five runs and was **not** vacuous:
`expectNoEnglishUi` fails on a zero string count
(`e2e/support/no-english.ts:226-230`), and every es-MX test passed.

---

## 9. V7 — the CI shape, a shape check and never the evidence

```
export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" &&
( cd e2e && env -u APUNTA_DATA_DIR -u APUNTA_V2 -u APUNTA_TEST_RUN_ID -u APUNTA_PORT -u APUNTA_CHECK_URL CI=1 APUNTA_E2E_PORT=7822 PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npx playwright test brand.spec.ts settings-appearance.spec.ts workspace.spec.ts spelling.spec.ts ) > /tmp/apunta-v2-s2.11-ci.log 2>&1; rc=$?; echo "v7 exit=$rc"; git checkout -- docs/v2/evidence/P2.2/screenshots/
```

Playwright's own exit code, **0** (recorded by capturing `rc` immediately after
the subshell, because the row ends in `git checkout` and would otherwise report
0 whatever happened — IR §4 note 9; this is observability, not a deviation).
Counts: **43 passed, 1 skipped**, 53.2 s. The config's CI shape applied as
configured: `workers: 1`, `retries: 2` (`e2e/playwright.config.ts:85-89`), and
`:88` was not edited. `APUNTA_DATA_DIR` was unset, so the data folders were the
config's fresh `mkdtemp` under `os.tmpdir()` and no live path was reachable; the
es-MX server was on `7823`.

`spelling.spec.ts` is green in that shape too, in both projects
(`tests/spelling.spec.ts:14` at `8 [chromium]` and `33 [es-MX]`) — the app fix
does not need the sandbox. `the page logged console errors` lines in the log: 0.
The appearance lock fell back under `os.tmpdir()` keyed by `7822`
(`appearance-lock: held 8ms by pid …` through the run) and **no stale lock was
left behind**: `/tmp/apunta-e2e-appearance-7822.lock` does not exist afterwards.

**This row's exit 0 is a shape check and is not quoted as V6's evidence.**

---

## 10. V8 — the P2.2 screenshots

```
git status --porcelain docs/v2/evidence/P2.2/screenshots/ &&
git diff --stat -- docs/v2/evidence/P2.2/screenshots/
```

**Empty output, exit 0.** The four PNGs are byte-identical to the base after
V5's two invocations, V6's five runs and V7's run: each of those three rows
ends in `git checkout -- docs/v2/evidence/P2.2/screenshots/`, and nothing after
them touched the tree. The bytes are preserved and the screenshots are not
committed. Stop condition 5 did not fire.

---

## 11. Stale comments this card makes untrue — findings, not edits

Both files are on the card's Must-not-edit list and neither was opened for
writing. Reported with their lines, for the coordinator and the owner.

1. **`web/src/App.test.tsx:816-819`** (inside `puts the caret in the name, not
   on the × that comes first in the panel`, `:812-834`):
   > "One frame first. When the app mounts, `usePrimaryWindow` parks focus on
   > the route wrapper as the window wins the primary lock, and it does that in
   > the *next* frame — so a click landing inside that frame races it. In the
   > app she cannot click that fast; a test can, so the frame is waited out here
   > rather than the race being papered over in the component."

   The first sentence is now false on a cold load: the window no longer parks
   focus on the route wrapper when it *first* wins the lock, only after a
   takeover. The test still passes, and it passes for a different reason — the
   frame it waits out is now `PrimaryBlocker`'s own, which case (b) now pins
   deliberately rather than papering over. The last clause — "a click in the
   sidebar, so a client-side navigation rather than a cold load of
   `/patients/new`" — is still accurate and is the sentence that named the
   untested path.

2. **`web/src/routes/AddPatient.tsx:39-42`**:
   > "Loading /patients/new cold is the one case that does not: `usePrimaryWindow`
   > parks focus on the route wrapper when the window first wins the primary
   > lock, and it does that in the frame after this one. Left as it is rather
   > than papered over with a second focus call — the caret is in the name by
   > the time she can see the window, which is a frame later than this."

   Both halves are now untrue in the same way: on a cold load the app no longer
   moves the caret at all, so the clause the comment offers as a reason not to
   add a focus call no longer holds. `AddPatient.tsx` changes in nothing
   (Fixed decision 5), and the refusal to persist the name across a reload stays
   refused on privacy grounds — see the return file's unresolved item.

---

## 12. Acquisitions

none. Nothing was downloaded (HS-3): no Ollama tag was pulled, no model removed
or replaced, `npx playwright install` was not run. Toolchain used as found: Node
**v24.19.0** from `~/.local/share/apunta-node/node-v24.19.0-linux-x64/bin`
(pinned, as decision 6 requires) and `/usr/bin/chromium` via
`PLAYWRIGHT_CHROMIUM_EXECUTABLE`.