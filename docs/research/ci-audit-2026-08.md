# Apunta CI audit — `.github/workflows/ci.yml`

Static audit, 2026-08-22. Repo: `villenull/Apunta` (the local clone is still named
`Patience`; the remote was renamed). Single branch
`claude/local-browser-app-planning-0likfi`, which is also the default branch.

---

## 0. The premise of this audit is wrong, and that changes the answer

**CI has run 12 times.** It is not unexecuted, and it is currently green.

| run | commit | result | duration |
| --- | --- | --- | --- |
| 12 | Add the icon set and the workspace column components | **success** | 107 s |
| 11 | Rename the project to Apunta | success | 104 s |
| 10, 9, 8, 7, 6 | M1 work | success | 87–95 s |
| 5 | Correct the model plan / eval corpus | **failure** | 43 s |
| 4 | Serve the non-AI API | **failure** | 42 s |
| 3, 2, 1 | M8 packet, e2e webServer fix, M0 snapshot | success | 60–74 s |

The two red runs were real test failures, not infrastructure: `shared/src/health.test.ts`
asserted a `HealthResponse` stub that predated the schema gaining `db`, so
`HealthResponseSchema.parse(stub)` threw `ZodError: path ["db"] expected object,
received undefined`. Fixed in the following commit. CI did its job.

Both `README.md:56-57` ("CI has **never actually run** on GitHub Actions") and the
brief for this audit are stale. That line should go — see finding W7.

Because the workflow has real run logs, most of the speculative risk list can be
settled with measurements instead of predictions. Measured step timings from the
last green run (run 12, job 97085299032, runner image **ubuntu-24.04 / noble**,
Node **22.23.2** from the tool cache):

| step | wall time | note |
| --- | --- | --- |
| `actions/checkout@v5` | 2 s | |
| `actions/setup-node@v5` | 2 s | `.nvmrc` → Node 22.23.2, npm cache restored |
| `npm ci` | **16 s** | `added 299 packages, and audited 304 packages in 16s`; no native compile, no `npm warn` |
| `npm run lint` | 4 s | eslint + `prettier --check .` both clean |
| `npm run typecheck` | 11 s | |
| `npm test` | 11 s | 16 test files, all passed |
| `npm run build` | 6 s | `vite build` itself: 232 ms |
| Playwright cache lookup | 0 s | **miss** |
| `npx playwright install --with-deps chromium` | **27 s** | apt deps + 184 MB Chrome + 115 MB headless shell + ffmpeg |
| `npm run e2e` | 9.5 s | webServer rebuild 6.2 s, 6 tests passed in 8.5 s |
| post: save Playwright cache | 5 s | **282 MB** uploaded |

**Count of "will fail" findings: 0.** Nothing in the current configuration is
statically guaranteed to break the next run. What follows are two dated time bombs,
seven weaknesses, and a list of the risks in the brief that turned out to be
non-issues (with the evidence that settles each one).

---

## MAY FAIL

### M1. `actions/cache@v4` and `actions/upload-artifact@v4` still declare the Node 20 runtime

**File:** `.github/workflows/ci.yml:45`, `.github/workflows/ci.yml:58`
**Evidence:** every run already prints this, three times per job, and once as a job
annotation:

```
##[warning]Node.js 20 is deprecated. The following actions target Node.js 20 but are
being forced to run on Node.js 24: actions/cache@v4, actions/upload-artifact@v4.
```

**Why it breaks:** GitHub is running these two actions on Node 24 through a
compatibility shim it has announced it will remove (the Node 20 runner runtime
deprecation, changelog 2025-09-19; the ecosystem note is that actions must declare
Node 24 from June 2026). While the shim holds, the steps work. When it is withdrawn,
both steps fail to start — and one of them is the *only* thing that saves the
Playwright report on a red run. `actions/cache` v5+ and `actions/upload-artifact` v6+
declare `node24`; current majors are `cache@v6` and `upload-artifact@v7`.

```diff
--- a/.github/workflows/ci.yml
+++ b/.github/workflows/ci.yml
@@ -43,7 +43,7 @@ jobs:
       - name: Cache Playwright browsers
         id: playwright-cache
-        uses: actions/cache@v4
+        uses: actions/cache@v6
         with:
           path: ~/.cache/ms-playwright
@@ -55,7 +55,7 @@ jobs:
       - name: Upload Playwright report
         if: ${{ !cancelled() }}
-        uses: actions/upload-artifact@v4
+        uses: actions/upload-artifact@v7
         with:
           name: playwright-report
```

`upload-artifact@v7` keeps zipping by default (`archive: true`), so the artifact this
workflow produces is unchanged. `checkout@v5` and `setup-node@v5` are already node24
and are not in the warning.

### M2. `runs-on: ubuntu-latest` + `playwright install --with-deps` + a cache key that cannot tell one Ubuntu from another

**File:** `.github/workflows/ci.yml:18` (and the key at `:48`)
**Why it breaks:** today `ubuntu-latest` is Ubuntu 24.04 — confirmed by the apt lines
in run 12 (`noble/universe`, `libgbm1 ... 24.04.2`). GitHub has Ubuntu 26.04 images in
public preview and migrates the `-latest` label over a 1–2 month window without asking.
`playwright install --with-deps` is the step that cares: it maps the *exact* Ubuntu
release to a package list, and Playwright's own tracker still carries an open request
for 26.04 (`microsoft/playwright#40117`), with `install-deps` on 26.04 reported to say
"your OS is not officially supported by Playwright". The pinned Playwright here is
1.62.1, frozen by the lockfile, so it will not learn about 26.04 on its own.

Second half of the same problem: the browser cache key uses `${{ runner.os }}`, which
is the string `Linux` on both 24.04 and 26.04 — so mid-migration a cache saved on one
image is restored onto the other, `playwright install` sees the browser directory
already populated and skips the download, and the only thing that would have fixed the
missing system libraries is the `--with-deps` apt step that just failed.

```diff
--- a/.github/workflows/ci.yml
+++ b/.github/workflows/ci.yml
@@ -16,7 +16,10 @@ jobs:
 jobs:
   verify:
-    runs-on: ubuntu-latest
+    # Pinned deliberately: `ubuntu-latest` rolls to the next LTS image on GitHub's
+    # schedule, and `playwright install --with-deps` only knows the apt package list
+    # for the Ubuntu releases its own version supports (1.62.1 predates 26.04).
+    runs-on: ubuntu-24.04
     timeout-minutes: 20
```

Bump the pin deliberately, together with a Playwright bump, when 26.04 is supported.

---

## WEAKNESSES

### W1. The Playwright browser cache is keyed on the whole lockfile, so any dependency change re-downloads ~300 MB

**File:** `.github/workflows/ci.yml:48`
**Evidence:** run 12 added `react-router` to `web/package.json`, which changed
`package-lock.json`, which changed the key — the log shows
`Cache not found for input keys: playwright-Linux-db4939…` followed by a fresh 184 MB
Chrome + 115 MB headless shell + ffmpeg download and a **282 MB** cache upload in the
post step. The browsers depend only on the Playwright version, which changed in none of
those commits. Every future dependency bump pays the same 30 s and pushes another
282 MB entry into a repo cache capped at 10 GB, evicting (among other things) the npm
cache that shares the same lockfile hash.

```diff
--- a/.github/workflows/ci.yml
+++ b/.github/workflows/ci.yml
@@ -42,12 +42,19 @@ jobs:
 
+      - name: Resolve the Playwright version
+        id: playwright-version
+        run: |
+          version=$(node -p "require('@playwright/test/package.json').version")
+          echo "version=$version" >> "$GITHUB_OUTPUT"
+
       - name: Cache Playwright browsers
         id: playwright-cache
-        uses: actions/cache@v4
+        uses: actions/cache@v6
         with:
           path: ~/.cache/ms-playwright
-          key: playwright-${{ runner.os }}-${{ hashFiles('package-lock.json') }}
+          # Browsers track the Playwright version, not the rest of the lockfile.
+          # The image is in the key because a browser build is per-distro.
+          key: playwright-ubuntu-24.04-${{ steps.playwright-version.outputs.version }}
```

Leave `restore-keys` off on purpose: a partial restore of the wrong browser build is
exactly the failure mode M2 describes. Keep the unconditional `playwright install`
step — on a hit it is a no-op that still fixes up system deps.

### W2. Nothing enforces the green check

The repository has one branch, it is the default branch, and
`protected: false` (checked via the API). `verify` is not a required status check, so a
red commit lands exactly like a green one; CI is advisory. This is a repository
setting, not a diff: enable branch protection (or a ruleset) on
`claude/local-browser-app-planning-0likfi` requiring the `verify` check. Given the
project's "one branch, no PRs" rule, at minimum require it for the `push` event's
check to be visible before the next packet builds on top.

### W3. `cancel-in-progress: true` on a repo where every commit lands on one branch

**File:** `.github/workflows/ci.yml:8-10`
Because `group` is `ci-${{ github.ref }}` and every packet pushes to the same ref, two
pushes a minute apart mean the first commit's run is cancelled and **never verified** —
its result is "cancelled", not "passed". On a repo with review gates that is fine; here,
where a commit's only verification is this workflow, it silently erodes the record. The
agents in this project push several commits in a row (runs 6→8 are 3 minutes apart).

```diff
--- a/.github/workflows/ci.yml
+++ b/.github/workflows/ci.yml
@@ -6,7 +6,10 @@ on:
 
 concurrency:
   group: ci-${{ github.ref }}
-  cancel-in-progress: true
+  # Every packet lands on one shared branch, so cancelling an in-flight push run
+  # would leave that commit with no CI result at all. Only PR updates supersede
+  # their predecessor.
+  cancel-in-progress: ${{ github.event_name == 'pull_request' }}
```

Related, minor: `push: branches: ['**']` and `pull_request` both fire, so any same-repo
PR would run the suite twice. Harmless while the project opens no PRs.

### W4. `typescript` is a caret range while the decision log says it is pinned

**File:** `package.json:40`
`docs/decisions.md:16` records: "Pin TypeScript 6.0.3, not the newer 7.0.2 —
`typescript-eslint` 8.67 declares `typescript >=4.8.4 <6.1.0`". The manifest says
`"typescript": "^6.0.3"`, which permits 6.1, 6.2, … 6.x. CI itself is safe: `npm ci`
installs exactly what the lock says (6.0.3, confirmed in the lockfile), so **nothing in
CI can float past the bound** — this answers risk 6 in the brief. The hole is on the
developer side: any `npm install <anything>` or `npm update` can resolve TypeScript to
6.1+, which npm will then flag as a peer conflict against typescript-eslint, and the
first symptom is `npm run lint` breaking locally with an ERESOLVE or a silently
different parser.

```diff
--- a/package.json
+++ b/package.json
@@ -37,7 +37,7 @@
-    "typescript": "^6.0.3",
+    "typescript": "6.0.3",
```

An exact pin makes the manifest say what the decision log already says. Re-run
`npm install` once to refresh the lock's spec string (that touches the lockfile only).

### W5. `@types/node` is v26 while CI and production run Node 22

**Files:** `server/package.json:23`, `e2e/package.json:12`
CI resolves `.nvmrc` to Node **22.23.2**; `engines` says `>=22`; the types describe
Node 26's API surface. This is the "CI green while the app is broken" shape the brief
asks about: a Node 26-only API typechecks clean here and throws at runtime on the
therapist's Node 22 machine. Nothing in the code hits that today (the server uses
`node:fs`, `node:os`, `node:path`, `NodeJS.ProcessEnv` only), so this is prevention.

```diff
--- a/server/package.json
+++ b/server/package.json
@@ -20,7 +20,7 @@
   "devDependencies": {
     "@types/better-sqlite3": "^9.6.0",
-    "@types/node": "^26.2.0",
+    "@types/node": "^22",
     "tsx": "^4.23.12"
```

Same change in `e2e/package.json:12`. Run `npm run typecheck` after — if it
newly fails, that failure *is* the bug this pin exists to catch.

### W6. Two silent-skip holes in the test/typecheck plumbing

**Files:** `package.json:24`, `vitest.config.ts:6`

- `npm run typecheck --workspaces --if-present` — `--if-present` means a workspace that
  loses (or misspells) its `typecheck` script is skipped with a zero exit. All four have
  it today; nothing would tell you when one stops.
- `vitest.config.ts` lists `projects: ['shared', 'server', 'web']` by hand. A fifth
  workspace's unit tests would never run and nothing would say so.

```diff
--- a/package.json
+++ b/package.json
-    "typecheck": "npm run build:shared && npm run typecheck --workspaces --if-present",
+    "typecheck": "npm run build:shared && npm run typecheck --workspaces",
```

```diff
--- a/vitest.config.ts
+++ b/vitest.config.ts
-    projects: ['shared', 'server', 'web'],
+    // Every workspace that has a vitest/vite config is a project; a new workspace
+    // must not be able to join the repo with its tests silently unrun.
+    projects: ['shared', 'server', 'web', 'e2e/../*/vitest.config.ts'],
```

The glob form is a suggestion — if it fights the `e2e` workspace (Playwright, no vitest
config), keep the explicit list and instead add a check that the list covers
`package.json:workspaces`. The `--if-present` removal is the one that matters.

### W7. Missing hygiene in the workflow, and one stale doc line

**File:** `.github/workflows/ci.yml:1-14`, `README.md:56-57`

- No `permissions:` block, so the job gets whatever the repo default is (often
  read/write on older repos). This workflow needs `contents: read`.
- No `workflow_dispatch`, so the suite cannot be run on demand from the Actions tab
  without pushing a commit. (Re-running an existing run works; running the current
  branch fresh does not.)
- `TZ` is unpinned. `web/src/lib/format.test.ts:31-41` asserts `'Aug 8, 2026'` /
  `'Today'` from `Intl.DateTimeFormat` and `Date#getDate`, which read the ambient zone.
  GitHub-hosted runners are UTC so it passes; the same suite fails on any runner at
  UTC+6 or east (`2026-08-22T09:00Z` is the 23rd in Tokyo, so "Today" becomes
  "Aug 22, 2026"). One line of insurance, and it keeps a future self-hosted or
  containerized runner honest.

```diff
--- a/.github/workflows/ci.yml
+++ b/.github/workflows/ci.yml
@@ -3,6 +3,10 @@ on:
 on:
   push:
     branches: ['**']
   pull_request:
+  workflow_dispatch:
+
+permissions:
+  contents: read
 
 concurrency:
@@ -12,6 +16,9 @@ env:
 env:
   # Everything in CI runs against the deterministic fake AI providers.
   APUNTA_FAKE_AI: '1'
+  # Date rendering (web/src/lib/format.ts) reads the ambient zone; pin it so the
+  # suite asserts the same thing on every runner, hosted or not.
+  TZ: UTC
```

```diff
--- a/README.md
+++ b/README.md
-Two environment notes worth carrying over: CI has **never actually run** on
-GitHub Actions, so watch the first run; and in a sandbox that pre-installs
+One environment note worth carrying over: in a sandbox that pre-installs
 Chromium, Playwright needs `PLAYWRIGHT_CHROMIUM_EXECUTABLE` pointed at it
 (on a normal machine, leave it unset).
```

### W8. Nits, listed once and not argued for

- `Upload Playwright report` runs with `!cancelled()`, so a 198 KB report is uploaded
  on every green run too. `if: failure()` halves the noise; keeping it is also
  defensible (a green report still shows which tests needed a retry).
- `retries: 2` in CI (`e2e/playwright.config.ts:26`) means a flaky e2e test reports
  green with no signal in the job's conclusion. The `list` reporter does print
  `flaky` counts — worth reading rather than only the check mark.
- `timeout-minutes: 20` against a measured 107 s run is generous. Fine as insurance.

---

## NON-ISSUES — checked, no action needed

Each of these was on the brief's risk list or is a plausible first-run failure. They
are settled, with the evidence.

1. **`better-sqlite3` needs a C++ toolchain on CI.** No. 13.0.3 ships its own binaries:
   the published tarball contains `prebuilds/{linux,linuxmusl,darwin,win32}-{x64,arm64}.node`
   (8 files, verified in `node_modules/better-sqlite3/prebuilds/`), `"gypfile": false`,
   **no `install` script** (the lockfile entry has no `hasInstallScript`), and
   `lib/binding.js` picks the file by `process.platform`/`arch` with a musl check via
   `process.report.getReport().header.glibcVersionRuntime`. No `prebuild-install`, no
   `node-gyp`, no `python3`/`make`/`g++` needed. Confirmed empirically: `npm ci` in run
   12 installed 299 packages in **16 seconds** with no compiler output. `engines:
   node >=22` is satisfied by the runner's 22.23.2.
2. **Playwright must install browsers on a clean runner; the config assumes a
   pre-installed Chromium.** No. `e2e/playwright.config.ts:20,32` only sets
   `launchOptions.executablePath` when `PLAYWRIGHT_CHROMIUM_EXECUTABLE` is set —
   unset, the spread contributes nothing and Playwright uses its own download. That
   env var appears nowhere in the workflow. Run 12 downloaded Chrome for Testing
   151.0.7922.34 and the headless shell and ran 6/6 green. Also checked the trap that
   would have broken this: `devices['Desktop Chrome']` in playwright-core 1.62.1
   carries `defaultBrowserType: "chromium"` and **no `channel`**, so
   `playwright install chromium` is the right install and no branded Google Chrome is
   required.
3. **Build ordering — does every job build `shared/` first?** Yes, and the decision
   (`docs/decisions.md:18`) is honored at the script level rather than the workflow
   level: `typecheck`, `test`, `build`, `dev` and `seed` each begin with
   `npm run build:shared`. `lint` does not, and does not need to (no type-aware rules;
   `**/dist/**` is ignored by both eslint and prettier). The workflow needs no
   ordering fix, which is why `Lint` running before `Typecheck` is safe.
4. **`APUNTA_FAKE_AI=1` everywhere it matters.** Workflow-level `env:` applies to every
   step (visible on each step's `env:` echo in the log), and
   `playwright.config.ts:45-49` sets it again for the server child process, which
   merges over the inherited environment. The e2e server logged `"fakeAi":true`. No AI
   code paths exist yet (M3/M5), so this is currently a promise the workflow already
   keeps.
5. **Cache correctness / stale artifacts.** `setup-node`'s `cache: npm` caches `~/.npm`
   (the download cache), never `node_modules` — a stale-dependency restore is not
   possible. No `dist/` directory is cached anywhere, so a stale `shared/dist` cannot
   be served across a dependency change. The only key worth fixing is the Playwright
   one (W1), and it errs toward *missing*, not toward stale.
6. **`npm ci` failing on a lockfile out of sync with the manifests.** Checked
   programmatically: every dependency and devDependency in the root and all four
   workspace `package.json` files matches the corresponding `packages[""]` entry in
   `package-lock.json` (lockfileVersion 3, 353 entries), and every spec is satisfied by
   the resolved version. Workspace links are present for all four packages.
7. **The e2e webServer's 60 s timeout has to cover a full build.** It does, and it is
   not close: measured 6.2 s in CI (`npm run build` at 20:01:17.46 → "Server listening"
   at 20:01:23.62 — shared tsc ~1 s, server tsc ~4.3 s, `vite build` 217 ms), with the
   health probe answering 600 ms later. 90% headroom. I expected this to be the top
   finding before reading the logs; it is not a finding at all.
8. **A test glob that matches nothing / a suite that silently does nothing.** All three
   vitest projects have matching test files (16 files, 115 tests reported), and vitest
   fails on an empty project by default. Playwright exits non-zero when no tests match.
9. **Unit tests depending on build output that CI has not produced yet.** `npm test`
   runs before `npm run build`, so `web/dist` does not exist during the unit suite —
   `server/src/app.ts:51` guards static registration behind `existsSync`, and no unit
   test asserts SPA-shell behavior. Safe by construction, not by luck.
10. **Ambient `APUNTA_FAKE_AI=1` leaking into a test that asserts the default.**
    `server/src/config.test.ts:17` calls `loadConfig({})` with an explicit empty env,
    so the workflow-level variable cannot flip `expect(config.fakeAi).toBe(false)`.
11. **`prettier --check .` tripping on files nobody formatted.** It passes in CI (4 s,
    green). Spot-checked the shape too: no tabs anywhere, no missing final newlines, and
    every line over 110 columns is an unbreakable template literal or a JSON string.
12. **`npx playwright` resolving to a download.** `@playwright/test` hoists to the root
    `node_modules/.bin/playwright`, so `npx` finds the pinned 1.62.1 CLI. Confirmed in
    the log.

---

## What to run first, and what to watch

There is no "first run" to trigger — the next push runs it. Concretely:

1. **Before pushing:** the working tree currently holds another agent's uncommitted M2
   work (`web/src/components/`, `web/src/routes/`). CI verifies commits, not your
   working tree, so the next run's meaning depends entirely on what that agent commits.
   Do not stage it for them (CLAUDE.md).
2. **Apply M1 and M2 first if you touch this file at all.** They are four line edits,
   they cannot change what the workflow *does* today, and they are the two items with a
   deadline that is not yours to set.
3. **Watch three lines in the next run's log:**
   - `Cache not found for input keys: playwright-…` — expected today; after W1 it should
     read `Cache restored from key: playwright-ubuntu-24.04-1.62.1` on the second run,
     and the run should drop by ~30 s.
   - `##[warning]Node.js 20 is deprecated. The following actions target Node.js 20…` —
     should disappear entirely after M1. If it is still there, a version bump was missed.
   - The apt lines under `Install Playwright Chromium` — if they ever say anything other
     than `noble`, the image migration (M2) has started and Playwright is the thing that
     will notice first.
4. **The number to keep an eye on** is the total run time: 107 s today. A jump into the
   minutes without a corresponding change in the repo means a cache stopped hitting.
5. **The check that does not exist yet:** nothing marks `verify` as required (W2). Until
   that is a repository setting, a red run blocks nothing.

---

### Sources for the upstream facts used above

- [actions/runner-images](https://github.com/actions/runner-images) — `ubuntu-latest` maps to 24.04 today; 26.04 in preview; `-latest` migrations take 1–2 months.
- [GitHub Actions: Upcoming image migrations (2026-05-14)](https://github.blog/changelog/2026-05-14-github-actions-upcoming-image-migrations/) — 2026 image migration plan.
- [actions/cache releases](https://github.com/actions/cache/releases) — v5 moved to the node24 runtime; v6 is current.
- [actions/upload-artifact releases](https://github.com/actions/upload-artifact/releases) — v6 moved to the node24 runtime; v7 is current and still zips by default.
- [Deprecation of Node 20 on GitHub Actions runners (2025-09-19)](https://github.blog/changelog/2025-09-19-deprecation-of-node-20-on-github-actions-runners/) — the warning emitted by every run of this workflow.
- [microsoft/playwright#40117](https://github.com/microsoft/playwright/issues/40117) — Ubuntu 26.04 support request; `install-deps` reports the OS as unsupported.
- Run 12 job log (`villenull/Apunta`, run 32595362983, job 97085299032) — every measurement in this document.
