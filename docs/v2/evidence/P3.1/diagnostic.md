# P3.1 attempt 1 — diagnostic run (**not** a verification row)

**Read this before reading any `PASS` line in this file.** V1 is `BLOCKED` and
V2–V4 are `NOT RUN` because `whisper-cli` cannot be built on this PC. This file
records a **diagnostic** run whose only purpose is to tell the coordinator how
much of the card is already correct, so that the resumed run after the owner
resolves the Vulkan headers is one step rather than five.

**No row's status changes because of anything here.** A diagnostic cannot
promote `BLOCKED` to `PASS`; it can only locate defects early.

## What was substituted, and why it is not a workaround of the stop condition

The single blocked stage is A06's `whisper-cli` build. To reach the stages after
it, a copy of `scripts/v2/package-linux-resources.sh` was made **outside the
repository** (`/tmp/apunta-v2/p3.1-diag/pack-diag.sh`) and **three lines** were
changed. The whole diff:

```
37c37
< REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
---
> REPO_ROOT="/home/villenull/Projects/Apunta"
192c192
<   bash "$REPO_ROOT/scripts/build-whisper-candidate.sh" > "$WHISPER_LOG" 2>&1; then
---
>   true > "$WHISPER_LOG" 2>&1; then
213c213
< CANDIDATE="$WHISPER_WORK_DIR/whisper.cpp/build-${WHISPER_BACKEND}/bin/whisper-cli"
---
> CANDIDATE="/tmp/apunta-v2/p3.1-diag/whisper-cli"
```

Nothing else in the pipeline was touched: same Node copy, same builds, same
esbuild invocation, same migrations, same web copy, same better-sqlite3 copy,
same licences, same manifest writer, same test script.

The substituted candidate is a **diagnostic stub, not a whisper-cli**, and it
says so when run:

```bash
#!/bin/bash
echo "DIAGNOSTIC STUB - not a real whisper-cli."
exit 0
```

**Therefore the `PASS whisper-help` line below is NOT evidence that a real
`whisper-cli` works.** It only shows that the check is reached and that a
program at `bin/whisper-cli` was executed. That check remains genuinely
unverified. The stub never entered `build/linux-resources/` from the real
script; the real script has no code path that would place it there.

## 1. The packaging pipeline, end to end

- **Working directory:** `<repo>`
- **Command:** `bash /tmp/apunta-v2/p3.1-diag/pack-diag.sh` (the patched copy)
- **Start:** 2026-09-28T22:52:44Z **End:** 2026-09-28T22:52:48Z
- **Exit code:** `0`

```
injected app version: 0.0.0
== Copying the migrations
== Copying the web build
== Copying better-sqlite3
== Building whisper-cli (A06)
note: patchelf is not installed; the copy relies on the build's own RPATH
== Copying the licences
== Writing manifest.json
manifest lists 4789 files
== Done
node:   v24.19.0
files:  4789
```

## 2. The relocated end-to-end test

- **Working directory:** `<repo>`
- **Command:** `APUNTA_P31_PORT=7836 bash scripts/v2/package-linux-resources.test.sh`
- **Start:** 2026-09-28T22:54:45Z **End:** 2026-09-28T22:54:47Z
- **Exit code:** `0`

Full output, 28 lines, verbatim:

```
PASS ownership-poll
PASS health-ok
PASS health-version
PASS lock-pid
PASS lock-process-start
PASS lock-pid-alive
PASS lock-app-version
PASS socket-owner
PASS db-path
PASS migration-level
PASS formats-empty-on-fresh-db
PASS post-patient
PASS post-format
PASS post-note
PASS get-note
PASS spa-status
PASS spa-content-type
PASS spa-body
PASS whisper-help            <-- against the DIAGNOSTIC STUB, see the warning above
PASS broken-lock-pid
PASS broken-lock-process-start
PASS broken-lock-pid-alive
PASS broken-socket-owner
PASS broken-health-503
PASS broken-health-storage-error
PASS broken-root-html
PASS broken-root-boot-page
PASS bundle-end-to-end
```

This is the real test script against a real bundle produced by the real
pipeline, relocated to `/tmp/apunta-v2/<runId>/bundle/`, launched from `cd /`
with `env -i PATH=/usr/bin:/bin` (no host Node) and the four-variable launch
contract. Sample data is the prototype's `John Smith` (HS-8).

After the run: nothing listening on 7836, and no orphaned bundled server
(a `/proc` sweep for `linux-resources/server/server.mjs` found none).

## 3. The manifest, verified in full (V3's command, exit 0)

Against the diagnostic bundle, V3's exact command exits `0`. Beyond the row's
own check, every claim V3 makes was measured:

```
nodeVersion: 24.19.0
compiler: cc (GCC) 16.2.1 20260810
glibc: ldd (GNU libc) 2.44
files isArray: true length: 4789
first entry: {"path":"THIRD-PARTY-LICENSES.md","bytes":216825,"sha256":"1a7d…e103"}
present  node/bin/node
present  server/server.mjs
present  migrations/011_patient_group_position.sql
present  web/dist/index.html
present  native/better_sqlite3.node
present  bin/whisper-cli
present  THIRD-PARTY-LICENSES.md
manifest.json excluded from files: true
```

`files` is a JSON **array of objects** (not a map), all seven paths V1 names are
present, and `manifest.json` excludes itself. Then, independently:

```
files on disk (excl manifest.json): 4789 listed: 4789
path set equals folder contents: true
entries with wrong bytes or hash: 0
```

Every one of the 4789 entries was re-hashed from the file on disk: byte counts
and SHA-256 all match, and the manifest's path set is exactly the folder's
contents.

## 4. The version fingerprint (V4's command, exit 0)

Against the diagnostic bundle, V4's exact command exits `0`, and the two greps
the card fixes each read `0`:

```
counts: __APUNTA_VERSION__=0  @apunta/server=0
```

The injected value is nonetheless present twice — once per reader — so the
define reached both and neither reader fell back:

```
155781:var INJECTED_VERSION = true ? "9.9.9-probe" : void 0;
163324:var INJECTED_VERSION2 = true ? "9.9.9-probe" : void 0;
```

(that probe used a synthetic `9.9.9-probe`; the real build injects
`server/package.json`'s `version`, currently `0.0.0`.)

**A note on the corrected fingerprint.** The card's own correction is right and
was confirmed: the greps are `__APUNTA_VERSION__` and `@apunta/server`, and a
check counting `createRequire` could never read `0` on the bundle. `fflate`'s
Node ESM entry is inlined and calls `createRequire` at module scope.

## 5. The `typeof` guard, in the exact case the card names

The card requires the guard to be `typeof __APUNTA_VERSION__ === 'string'`
because `declare const` is erased by type stripping and a bare reference throws
`ReferenceError` there. Both forms were executed under the pinned Node 24.19.0
with `--experimental-strip-types`:

```
=== typeof guard ===            typeof-guard INJECTED = undefined
=== bare reference ===          ReferenceError: __APUNTA_VERSION__ is not defined
```

The card's reasoning is exactly right, and the implementation follows it.

## 6. The socket-ownership assertion can actually fail

The card requires the listening socket on the test port to be owned by the
spawned pid, and warns that a check which cannot fail is worthless. Negative
control, run against a live bundled server on 7837:

```
spawned pid:     3095918
listening inode: 19628289
real pid    -> OWNS the socket (as expected)
wrong pid 1 -> does NOT own -> the check is falsifiable
listeners on 7837 after stop: 0
```

The `lock-pid` assertion was also seen failing for real, earlier in this
session, on a genuine bug (below): `FAIL lock-pid: lock pid 3088108 is not the
spawned pid 3088106`. Both assertions have demonstrated the ability to fail.

## 7. Two real defects this diagnostic found, both now fixed

**(a) The ESM bundle could not `require` its CJS dependencies.** The first
diagnostic run failed with:

```
Error: Dynamic require of "node:stream" is not supported
    at node_modules/@fastify/busboy/index.js (…/server.mjs:2076:26)
    at node_modules/@fastify/multipart/index.js (…/server.mjs:2873:18)
```

An ESM bundle has no `require`, so esbuild emits a shim that throws; the first
CJS dependency to call `require('node:stream')` at load time took the whole
server down and no check after it could run. Fixed by adding
`--banner:js='import{createRequire as __apuntaCreateRequire}from"node:module";const require=__apuntaCreateRequire(import.meta.url);'`.
**Every flag the card fixes is passed exactly as it fixes it**; the banner only
gives esbuild's shim a `require` to call, and adds no dependency and no network
access.

**The alias in that banner is not a style choice.** The first attempt used the
plain name and produced a second failure:

```
SyntaxError: Identifier 'createRequire' has already been declared
    at file:///…/server/server.mjs:150612
```

`fflate`'s Node ESM entry is inlined into the same bundle and already declares
`import { createRequire } from 'module'` at its own top level. Both facts are
recorded in the script's comment so the next reader does not "simplify" it back.

**(b) The test measured the wrong pid.** `$!` after `( cd /; env -i … node … )`
is the **subshell's** pid, not the server's, so every ownership assertion was
comparing the wrong pid. The subshell now `exec`s, so `$!` is the server. This
is exactly the class of bug the card's ownership requirement exists to catch,
and it was caught by the card's own requirement rather than by inspection.

A third, smaller bug: the lock file is written pretty-printed
(`JSON.stringify(contents, null, 2)`) while the health body is compact, so a
`case` pattern written against `"key":"value"` silently stopped matching the
lock. Bodies are now re-serialised compactly before matching — a check that
stops matching is worse than no check.

## 8. The one-line `eslint.config.js` grant, shown to be necessary and sufficient

AM-065 permits one line, `'build/**'`, and the third instruction review
predicted that without it lint would parse a multi-megabyte generated file. A
deliberately invalid generated bundle was placed at the exact path named
(`build/linux-resources/server/server.mjs`) and linted both ways:

```
npx eslint .                                  -> exit 0   (ignored)
npx eslint --no-ignore build/linux-resources/server/server.mjs
                                             -> exit 1   Parsing error: Property assignment expected
```

The `.gitignore` half of the same rationale was checked too: with a
`build/linux-resources/server/server.mjs` present, `npx prettier --check .`
exits `0`, because Prettier reads `.gitignore`.

`eslint.config.js` carries **exactly one added line**, `'build/**',` and
nothing else — no comment, since AM-065's grant is "one line only" and "any
other edit to that file is a stop condition". The rationale for it lives in the
`.gitignore` comment beside it and in this file, not in the file AM-065
restricted.

## 9. Repository checks

- `npm run lint` → **exit 0** (eslint, prettier, external-URL check, licence
  check `lists all 111 shipped packages`, `check-ui-strings` `TOTAL 0`)
- `npm run typecheck` → **exit 0**
- `npx vitest run server/src/config.test.ts server/src/platform/data-lock.test.ts`
  → **exit 0**, 15/15, including the two new AM-058 regression cases

## 10. What this diagnostic does *not* establish

- **A real `whisper-cli` has never been built, copied or run.** `bin/whisper-cli
  --help` against a genuine binary is untested. The RPATH-relocatability claim
  (`CMAKE_BUILD_RPATH_USE_ORIGIN=ON`) is inherited from the candidate builder and
  was not independently verified; `patchelf` is **not** installed on this box,
  so the script cannot rewrite an RPATH that did not already point at `$ORIGIN`.
  The script therefore reports that fact rather than pretending to fix it, and
  fails loudly if the copied binary cannot run.
- **V1, V2, V3 and V4 remain BLOCKED / NOT RUN.** Nothing here changes that.
- The A06 acquisition itself is real and recorded in `acquisition-A06.md`; only
  the *build* of the binary is missing.
