# P3.1 — implementation review evidence, attempt 1, review pass

Reviewer: independent implementation reviewer. Nothing in this file was written
by the implementer. Working directory for every command: repository root.
Paths are sanitised per RUN-CONFIG §4 (`<sandbox>` for `/tmp/apunta-v2`, `~` for
the home folder).

## 0. State the review started from

| Fact | Value |
| --- | --- |
| Dispatch head under review | `c4a364f` |
| Actual `HEAD` at review time | `e705953` |
| Working tree | clean (`git status --porcelain` empty) |
| `c4a364f` is an ancestor of `HEAD` | yes |
| Commits between them | `9107639`, `e96d6c0`, `63b20fc`, `e705953` — all docs/state for other cards (S2.6, P4.5), plus `shared/src/i18n/es-MX.ts`, `shared/src/i18n/es-MX.ts` test and `web/src/components/LanguageDialog.test.tsx` |

The dispatch's review step 1 says to stop if `HEAD` is neither the base nor the
head commit. It is neither, because the coordinator committed two other cards
after issuing the dispatch. The work under review is intact and reachable, so
the review proceeded against the tree at `HEAD`, which contains `c4a364f` as an
ancestor. No file the review assessed differs between `c4a364f` and `HEAD`.

**Recorded for the coordinator, not scored against the implementer:** the
implementer committed and pushed its own work as `c4a364f`. That is a protocol
breach (HS-4 and the dispatch's "do not pull, merge, rebase or reset" framing,
which assume the coordinator owns commits) and the return's own "Final commit:
NOT RECORDED" line is therefore false. It is noted once and not developed.

## 1. Environment, independently observed

| Tool | Value | How it was established |
| --- | --- | --- |
| pinned `node` | `v24.19.0` | `~/.local/share/apunta-node/node-v24.19.0-linux-x64/bin/node` |
| box default `node` | `v26.8.2` | mise shim at `~/.local/share/mise/installs/node/26.8.2/bin/node` — matches the card's claim |
| `node` on `PATH=/usr/bin:/bin` | **absent** | `command -v node` under that `PATH` returns nothing; `/usr/bin/node` and `/bin/node` do not exist. The card's "no host Node on `PATH`" claim holds. |
| `cmake` | 4.4.3 | `/usr/bin/cmake` |
| `glslc` | 2026.3 | present |
| `hipcc` | absent | expected; `vulkan` is the pinned backend |
| `patchelf` | absent | confirmed, and no longer needed |
| `cc` | `cc (GCC) 16.2.1 20260810` | recorded in the manifest as `compiler` |
| `ldd` | `ldd (GNU libc) 2.44` | recorded in the manifest as `glibc` |
| `curl`, `ss`, `awk`, `readlink` | present | the test script's dependencies |
| A06 clone | `371b5a7561823ab2bb32142d2751e35e7534727b` | `git rev-parse HEAD` equals the pin |
| `/tmp` free before V1 | 8.6 GB of 16 GB | enough for a cold build; the implementer's disk-quota failure did not recur |

## 2. V1 — packaging script (COLD whisper build)

```sh
export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" \
  && node --version && bash scripts/v2/package-linux-resources.sh
```

- cwd: repository root
- start `2026-09-29T18:28:36Z`, end `2026-09-29T18:31:19Z` (**2 min 43 s**)
- **`node --version` printed `v24.19.0`**
- **exit code: `0`**

`build-vulkan/` was deleted first, so this is a genuine cold build and not a
warm-tree pass. The cold-build claim was re-tested from scratch rather than
taken from the implementer's record.

### 2a. The cold build really happened

V1's own stdout contains **no** whisper build output (see finding 3), so the
build was verified from the build log the script leaves behind:

```
14:-- The C compiler identification is GNU 16.2.1
41:-- Found Vulkan: /usr/lib/libvulkan.so (found version "1.4.357") found components: glslc glslangValidator
53:-- Configuring done (1.0s)
55:-- Build files have been written to: <sandbox>/whisper-src/whisper.cpp/build-vulkan
96:[100%] Linking CXX executable vulkan-shaders-gen
441:[100%] Linking CXX executable ../../bin/whisper-cli

shader translation units compiled: 139
```

A full reconfigure and 139 ggml-vulkan translation units compiled from nothing.

### 2b. Cold reproducibility, independently confirmed

```
3a9f516ded6dc6f619e96570ac326922c5718e5e6bca03a735e5d07bd60804de  bin/whisper-cli   (1064648 bytes)
```

Byte-identical to the SHA-256 recorded in
`docs/v2/evidence/P3.1/acquisition-A06-completed.md:28` and reproduced again by
this review's independent cold build. **The implementer's cold-reproducibility
claim is true.**

### 2c. `node/` is the A01 tree, not a download

```
copied ~/.local/share/apunta-node/node-v24.19.0-linux-x64 -> build/linux-resources/node (v24.19.0)
tarball sha256 recorded by P0.1: f625d97cd707df4ff96254916fbc5ff014f09c09effe5a1e0ca8f6d41a8789d4
```

The recorded hash matches the dispatch's Fixed decisions verbatim. No A01
download occurred. The copied `bin/node` reports `v24.19.0`.

### 2d. `better-sqlite3` copied, never built

`prebuilds/linux-x64.node` present in the repository, copied to
`native/better_sqlite3.node`. `npm rebuild` and `deps/download.sh` were not run
by this review and, per the script's own text, are refused.

### 2e. V1's required manifest paths, on the reviewer's own bundle

```
present node/bin/node                              (125989464 bytes, sha256 bc17c508ffee…)
present server/server.mjs                          (  7156299 bytes, sha256 f9c87a39ec74…)
present web/dist/index.html                        (     1265 bytes, sha256 da154efa6b92…)
present native/better_sqlite3.node                 (  2226168 bytes, sha256 6fd4292c6c5f…)
present bin/whisper-cli                            (  1064648 bytes, sha256 3a9f516ded6d…)
present THIRD-PARTY-LICENSES.md                    (  216825 bytes, sha256 1a7d5ab23c0c…)
present migrations/011_patient_group_position.sql  (      868 bytes, sha256 03c2b04bd003…)
```

All seven present, `nodeVersion` `24.19.0`, `files` a 4804-entry array.
The highest-numbered migration is `011_patient_group_position.sql` (11 `.sql`
files in total). Every one of these hashes is identical to the implementer's
bundle, which is further evidence the build is deterministic.

**V1: PASS, exit code 0.**

## 3. V2 — relocated end-to-end test

```sh
export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" \
  && APUNTA_P31_PORT=7845 bash scripts/v2/package-linux-resources.test.sh
```

- cwd: repository root
- start `2026-09-29T18:32:01Z`, end `2026-09-29T18:32:03Z`
- **exit code: `0`**; **28 `PASS`, 0 `FAIL`**

The review dispatch allocates **7845**, so the port was set through the script's
own `APUNTA_P31_PORT` hook (see finding 5 — the row as written does not use it).
7845 was verified free before the run and free after it.

```
PASS ownership-poll          PASS lock-pid              PASS spa-status
PASS health-ok               PASS lock-process-start    PASS spa-content-type
PASS health-version          PASS lock-pid-alive        PASS spa-body
PASS lock-app-version        PASS socket-owner          PASS whisper-help
PASS db-path                 PASS migration-level       PASS broken-lock-pid
PASS formats-empty-on-fresh-db  PASS post-patient       PASS broken-lock-process-start
PASS post-format             PASS post-note             PASS broken-lock-pid-alive
PASS get-note                PASS broken-socket-owner   PASS broken-health-503
PASS broken-health-storage-error  PASS broken-root-html
PASS broken-root-boot-page   PASS bundle-end-to-end
```

Same 28 names, same order, as the implementer's record.

### 3a. Isolation conditions, each independently confirmed

| Card requirement | Independent check |
| --- | --- |
| bundled Node runs the wrapper | `<folder>/node/bin/node <abs-repo>/scripts/v2/sandbox.mjs env --port 7845`; `env` mode, never `run` |
| whole folder relocated | run folder `<sandbox>/2026-09-29T18-32-01-224Z-c6862c4d/bundle/linux-resources` |
| `cd /` before launch | `cd / \|\| exit 1` in the launch subshell |
| no host Node on `PATH` | `/usr/bin:/bin` contains no `node` (measured in §1) |
| `env -i`, no inherited variables | launch is `exec env -i PATH=… HOME=… APUNTA_…` |
| four launch-contract overrides set | `APUNTA_SQLITE_BINDING`, `APUNTA_LICENSES_FILE`, `APUNTA_WEB_DIST`, `APUNTA_WHISPER_BIN`, all pointing into the folder |
| ownership poll precedes the first assertion | `ownership-poll` is the first `PASS` printed |
| both ownership halves | lock (`lock-pid`, `lock-process-start`, `lock-pid-alive`, `lock-app-version`) **and** listening socket (`socket-owner`, matched against `/proc/<pid>/fd`) |
| nothing left listening | `7845 free` measured after the run |
| only the script's own PIDs signalled | `kill -TERM`/`kill -KILL` by pid; `pkill` appears nowhere in either script |

### 3b. The negative case is genuinely asserted — claim 2, checked

The coordinator flagged that a row exercising only the happy path proves less
than it appears to. It does not here, and the discrimination is real rather than
incidental:

- The bundle **still contains a loadable addon** at
  `node_modules/better-sqlite3/prebuilds/linux-x64.node` (2226168 bytes,
  verified present). So a bundle missing only `native/better_sqlite3.node` is
  not trivially unloadable.
- `APUNTA_SQLITE_BINDING` is authoritative, not advisory:
  `server/src/db/index.ts:44-46` is
  `options.nativeBinding === undefined ? new BetterSqlite3(file) : new BetterSqlite3(file, { nativeBinding })`.
  With the override set, better-sqlite3 is given the path explicitly and does
  **not** fall back to `prebuilds/`.
- Therefore the `503 storage_error` observed after the rename is caused by the
  rename and by nothing else. A healthy server would have answered `200 ok:true`
  and `broken-health-503` would have failed. The assertion discriminates.
- The boot-error path is the only producer of that response, and the process
  stayed alive with the port bound (`broken-lock-pid-alive`,
  `broken-socket-owner` both passed), which is the
  `server/src/index.ts` behaviour the card describes.

**V2: PASS, exit code 0.** One caveat that does not change the row's status is
recorded as finding 1.

## 4. V4 — bundle fingerprint

```sh
export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" \
  && node -e "const s=require('fs').readFileSync('build/linux-resources/server/server.mjs','utf8');process.exit((s.includes('__APUNTA_VERSION__')||s.includes('@apunta/server'))?1:0)"
```

- cwd: repository root, `2026-09-29T18:32:19Z`
- **exit code: `0`**

| Token | Count |
| --- | --- |
| `__APUNTA_VERSION__` | **0** |
| `@apunta/server` | **0** |

The same counts were measured on the implementer's own bundle before it was
overwritten: 0 and 0. `createRequire` occurs 13 times, as AM-058 predicts it
must, and that is correctly not part of the check.

### 4a. The AM-058 source shape, and a stronger proof than V4 requires

Source guard, both readers, never a bare reference:

```
server/src/config.ts:32                 typeof __APUNTA_VERSION__ === 'string' ? __APUNTA_VERSION__ : undefined;
server/src/platform/data-lock.ts:65     typeof __APUNTA_VERSION__ === 'string' ? __APUNTA_VERSION__ : undefined;
```

The only other occurrences in either file are inside explanatory comments
(`config.ts:16`, `data-lock.ts:55`). Both retain their lazy relative
`require('../package.json')` / `require('../../package.json')` fallbacks.

esbuild folded the define, so the **defined** path is provably the one that
executes — read out of the reviewer's own bundle:

```js
// server/dist/config.js
var require3 = createRequire2(import.meta.url);
var INJECTED_VERSION = true ? "0.0.0" : void 0;
function readPackageVersion() {
  if (INJECTED_VERSION !== void 0)
    return INJECTED_VERSION;
  const pkg = require3("../package.json");
  return pkg.version;
}
```

`typeof` was constant-folded to `true`, so the fallback is unreachable. And the
fallback *would* throw if it ever ran: **there is no `package.json` at the
bundle root** (`ls build/linux-resources/package.json` → no such file). That
gives a falsifiable proof the value assertion alone cannot: had the fallback
been taken, `GET /api/health` could not have returned `200` with a version at
all. The dispatch anticipated the fallback's *textual* survival; this confirms it
is also unreachable in practice.

All 5 occurrences of the string `package.json` in the bundle were inspected:

| # | context | verdict |
| --- | --- | --- |
| 1, 2 | `node_modules/thread-stream/package.json` | third-party metadata |
| 3 | `require3("../package.json")` in `config.ts`'s unreachable fallback | expected survivor, as AM-058 states |
| 4 | `import.meta.resolve("pdfjs-dist/package.json")` | third-party metadata |
| 5 | `require4("../../package.json")` in `data-lock.ts`'s unreachable fallback | expected survivor |

None is the application's own `@apunta/server` metadata. The implementer's
judgement that "unrelated dependency metadata strings are not a failure" is
correct. This review also confirms the `createRequire` counter would have been a
broken fingerprint, as AM-058's correction says.

**V4: PASS, exit code 0.**

## 5. V3 — manifest

```sh
export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" \
  && node -e "const m=require('./build/linux-resources/manifest.json');process.exit(m.files.length>0?0:1)"
```

- cwd: repository root, `2026-09-29T18:32:19Z`
- **exit code: `0`**

Exactly the four fixed top-level keys, in order:
`nodeVersion` `"24.19.0"`, `compiler` `"cc (GCC) 16.2.1 20260810"`,
`glibc` `"ldd (GNU libc) 2.44"`, `files` a 4804-element array.

### 5a. Deeper verification, run from scratch against the reviewer's own bundle

```
on disk (non-dir): 4805  listed: 4804
extra (listed, not on disk): 0
forgotten (on disk, not listed): 0
manifest lists itself: false
malformed entries: 0
byte mismatches (lstat semantics): 0
sha256 mismatches (lstat semantics): 0
empty directories in the bundle: 0
```

Every entry has exactly the keys `bytes,path,sha256`, an integer `bytes` and a
64-hex `sha256`. The path set equals every non-directory file in the folder
except `manifest.json` itself, as Fixed decisions require. A manifest shaped
`{"files": {"…": "…"}}` would have evaluated `undefined > 0` and exited 1, so
the shape is the one the card fixes.

### 5b. Claim 1 — "no integrity is lost, every target is also listed" — checked

The implementer changed symlink recording from follow-the-link to `lstat`
semantics. The bundle holds **13** symlinks, exactly as claimed. Each was
resolved and its target looked up in the manifest:

```
bin/libggml-base.so   -> libggml-base.so.0            listed (symlink chain -> …so.0.20.2)  realpath listed: yes
bin/libggml-base.so.0 -> libggml-base.so.0.20.2       listed (regular, 952528, 38151b3be171…)   realpath listed: yes
bin/libggml-cpu.so    -> libggml-cpu.so.0             listed (symlink chain)                   realpath listed: yes
bin/libggml-cpu.so.0  -> libggml-cpu.so.0.20.2        listed (regular, 1052944, 462b75ae65f7…)  realpath listed: yes
bin/libggml-vulkan.so -> libggml-vulkan.so.0          listed (symlink chain)                   realpath listed: yes
bin/libggml-vulkan.so.0 -> libggml-vulkan.so.0.20.2   listed (regular, 55818488, e31de9e2db3d…) realpath listed: yes
bin/libggml.so        -> libggml.so.0                 listed (symlink chain)                   realpath listed: yes
bin/libggml.so.0      -> libggml.so.0.20.2            listed (regular, 55208, 196962cefa2b…)    realpath listed: yes
bin/libwhisper.so     -> libwhisper.so.1              listed (symlink chain)                   realpath listed: yes
bin/libwhisper.so.1   -> libwhisper.so.1.9.3          listed (regular, 638496, adcf7ef5e0a4…)   realpath listed: yes
node/bin/corepack     -> ../lib/node_modules/corepack/dist/corepack.js            listed (regular, 174)    realpath listed: yes
node/bin/npm          -> ../lib/node_modules/npm/bin/npm-cli.js                  listed (regular, 54)     realpath listed: yes
node/bin/npx          -> ../lib/node_modules/npm/bin/npx-cli.js                  listed (regular, 2921)   realpath listed: yes

symlinks whose direct target is NOT in the manifest: 0
dangling: 0   escaping the folder: 0
```

**The second half of the claim is true, not merely asserted.** All 13 links
resolve to a target that is itself a listed entry, and in every case the
*ultimate* realpath is a listed regular file carrying a content hash. A
substituted or corrupted library would therefore still be caught: swapping
`libwhisper.so.1.9.3` changes the hash on a listed regular-file entry. Nothing
integral is lost by `lstat` semantics.

**What the claim omits is a usability gap, not an integrity gap** — recorded as
finding 4:

```
symlinks in bundle: 13
  of which a follow-the-link verifier disagrees on bytes: 13
  of which a follow-the-link verifier disagrees on hash : 13
```

A verifier doing the obvious thing — `sha256(readFileSync(path))` — disagrees
with the manifest on 13 of 4804 entries. The manifest is verifiable, but only by
a verifier that already knows to `lstat` and already knows what the hash of a
symlink entry means. Nothing in `manifest.json`, and nothing in the repository,
records that convention for whoever verifies the bundle next.

**V3: PASS, exit code 0.**

## 6. Claim 3 — the host-dependency question

The bundle deliberately does **not** carry `libvulkan.so.1`, so it needs a host
Vulkan driver. The return does state this (Deviation 3, and Unresolved item 2),
so the coordinator's concern that it might be glossed as a clean V1 is **not**
realised — but the deployment consequence it lists is incomplete. Measured
directly on the reviewer's bundle:

```
$ readelf -d bin/whisper-cli | grep -E 'NEEDED|RUNPATH'
 (NEEDED)   libwhisper.so.1      (bundled)
 (NEEDED)   libggml.so.0         (bundled)
 (NEEDED)   libggml-cpu.so.0     (bundled)
 (NEEDED)   libggml-vulkan.so.0  (bundled)
 (NEEDED)   libggml-base.so.0    (bundled)
 (NEEDED)   libstdc++.so.6       /usr/lib/libstdc++.so.6   HOST
 (NEEDED)   libm.so.6            /usr/lib/libm.so.6        HOST
 (NEEDED)   libgcc_s.so.1        /usr/lib/libgcc_s.so.1    HOST
 (NEEDED)   libc.so.6            /usr/lib/libc.so.6        HOST
 (RUNPATH)  $ORIGIN:

libgomp.so.1    => /usr/lib/libgomp.so.1    HOST  (transitive)
libvulkan.so.1  => /usr/lib/libvulkan.so.1  HOST  (transitive, via libggml-vulkan.so.0.20.2)
```

`RUNPATH` is exactly `$ORIGIN:` with no `../lib` component, which confirms the
implementer's Deviation 2 empirically: the earlier `lib/` layout really would
have produced a binary that could not start, and `bin/` is the correct fix.
`ldd` reports **0** unresolved libraries on this host, and
`bin/whisper-cli --help` exits 0 from the relocated bundle.

So the bundle's real host requirements are: a Vulkan driver, **plus** host
`libstdc++`, `libgomp`, `libgcc_s`, `libm`, `libc` and the dynamic loader, at a
**glibc floor of 2.44** (recorded in the manifest as a string that nothing
checks). The return names the Vulkan driver as *the* deployment consequence.
Finding 5 records the gap. It belongs in the install guide as the coordinator
believes, with more in it than the return says.

## 7. Falsification test — V2's SPA check against a truncated `web/dist`

The card's Step 3 requires the SPA check so that "an empty or **truncated** copy
of `web/dist` must fail here rather than in a person's browser". That intent was
tested, not assumed. A second copy of the bundle was made inside the review's own
run folder, `web/dist/assets/` and `web/dist/fonts/` were deleted, and the
bundled server was started on 7845 under the same launch contract.

```
truncated: index.html still present; assets dir: No such file or directory

GET /                                        -> 200        (V2 requires 200)      PASSES
GET / body bytes                             -> 1265       (V2 requires > 200)    PASSES
content-type                                 -> text/html; charset=utf-8           PASSES
GET /assets/index-D7iOgJVA.js  (the script index.html itself loads) -> 200  content-type: text/html
GET /favicon.svg                                               -> 200  content-type: text/html
GET /fonts/inter-latin-400-normal.woff2                        -> 200  content-type: text/html
```

All three V2 SPA checks pass on a bundle with **no JavaScript and no fonts at
all**. And the failure is not even visible at the HTTP layer: a request for a
missing `.js` asset is answered **`200 OK` with `text/html`** — the SPA
fallback — not `404`.

Control, same request against a complete `web/dist`:

```
GET /assets/index-D7iOgJVA.js -> 200  content-type: application/javascript; charset=utf-8
body 169523 bytes, starts: const __vite__mapDeps=(i,m)=>…
```

So a real bundle and a truncated one are **indistinguishable to V2**, and the
distinguishing signal is a JavaScript parse error in a browser console. This is
finding 1.

## 8. Repository gates

Run because findings 4 and 6 depend on them, and because the card's own
rationale for its `.gitignore` and `eslint.config.js` lines is that they keep the
generated bundle out of these gates. `build/` was present throughout, 272 MB /
4809 files.

| Command | Exit code | Note |
| --- | --- | --- |
| `npm run lint` | **0** | ran **with** the 272 MB `build/` folder present; `prettier --check .` reported "All matched files use Prettier code style!"; `check-no-external-urls.mjs` passed; `collect-licenses.mjs --check` reported 111 shipped packages |
| `npm run typecheck` | **0** | runs `build:shared` first, so no stale-`shared/dist` risk |
| `npx vitest run server/src/config.test.ts server/src/platform/data-lock.test.ts` | **0** | 2 files, **15/15**, run after `build:shared` |

Each ignore mechanism was confirmed to do the work claimed for it:

```
$ npx eslint build/linux-resources/server/server.mjs
  0:0  warning  File ignored because of a matching ignore pattern.   -> eslint.config.js 'build/**' works
$ npx prettier --check build/linux-resources/server/server.mjs
All matched files use Prettier code style!                            -> .gitignore 'build/' works
```

`eslint.config.js` received **exactly one** line, `'build/**'`, inside the
existing `ignores` block, with no rule, `files` or `languageOptions` change —
exactly the AM-065 grant, no more.

## 9. Hard stops

| Hard stop | Result | Evidence |
| --- | --- | --- |
| HS-1 live data | **respected** | port 7717 never contacted; `smoke-live.mjs` and `recover-current-linux.mjs` never run; no live data folder opened. Every server this review started used a `<sandbox>` run folder at 7845. |
| HS-2 isolation | **respected** | every launched server went through `scripts/v2/sandbox.mjs env --port 7845`; the two extra falsification launches reused the run folder the wrapper had already created. |
| HS-3 downloads | **respected** | nothing installed. Two network events observed, both to `github.com` at the A06-pinned revision and both mandated by the card's own build path — see finding 2. `~/.npm/_logs/` shows **no** entry between 18:28Z and 18:31Z, so `npx --yes esbuild` resolved the local hoisted binary (`node_modules/.bin/esbuild` → esbuild 0.28.2) and contacted no registry, as the A06 record claims. No Ollama tag pulled, removed or replaced. |
| HS-4 git | **respected by this review** | no `commit`, `push`, `add`, `pull`, `rebase`, `reset` or `checkout`. All review output left uncommitted for the coordinator. (The implementer breached this; §0.) |
| HS-5 secrets | **respected** | no key, password or token created, printed or committed; `grep` over the whole card diff for `password\|secret\|token\|PRIVATE KEY\|api_key` → no hits. |
| HS-6 runtime network | **respected** | `grep` over the card's `server/src`, `web/src`, `shared/src` changes for `fetch(\|http.request\|https.\|net.connect\|dns.` → **no hits**. `config.ts` and `data-lock.ts` changed only their version reads. |
| HS-7 safety instruments | **respected** | no threshold, scorer, guard or contract touched. `docs/v2/CONTRACTS.md` untouched. |
| HS-8 fabricated data only | **respected** | the only patient-shaped data is `"name":"John Smith"` (`package-linux-resources.test.sh:388`), the prototype's sample person. A format named "Progress note" and a note titled "Bundle check". No real patient text anywhere. |
| HS-9 protected paths | **respected** | `prototype/` untouched. Changed paths for `85c3fd2..c4a364f` are exactly 5, all inside May edit — see §10. |

### Changed-path scope

```
A  docs/v2/evidence/P3.1/acquisition-A06-completed.md     in May edit (docs/v2/evidence/P3.1/)
A  docs/v2/evidence/P3.1/attempt1-verification.md         in May edit
M  docs/v2/state/returns/P3.1.md                         the card's own return file
M  scripts/v2/package-linux-resources.sh                 in May edit
M  scripts/v2/package-linux-resources.test.sh            in May edit
```

All five are inside the card's May edit list. Nothing outside it.

**One scope observation the coordinator should have:** the AM-058 work that
Fixed decisions make part of this card — `server/src/config.ts`,
`server/src/platform/data-lock.ts`, their two test files, `.gitignore` and
`eslint.config.js` — landed in commit `0796716`, which is **already an ancestor
of the dispatch base `85c3fd2`**. The review diff `85c3fd2..c4a364f` therefore
does not contain it, and a reviewer working only from that diff would review
less than the card delivered. This review inspected those changes directly
(§8 and the bundle in §4a) rather than assuming them covered.

## 10. Findings, with the measurement behind each

1. **V2 cannot detect a truncated `web/dist`** — `scripts/v2/package-linux-resources.test.sh:432-448`.
   §7. All three SPA checks pass with `assets/` and `fonts/` deleted, and the
   server answers `200 text/html` for the missing script, so the truncation is
   invisible at the HTTP layer too. The card's stated intent is not met.
2. **The build is not hermetic; the A06 fetch is unconditional and repeats.**
   `scripts/build-whisper-candidate.sh:77`. §2a. Observed `FETCH_HEAD` mtime
   18:28:44Z during this review's V1, and
   `From https://github.com/ggml-org/whisper.cpp … -> FETCH_HEAD` in the build
   log. The A06 record calls it one request "this session"; it is one per V1 run.
3. **V1's own log contains no evidence that whisper was built.**
   `scripts/v2/package-linux-resources.sh:205-215`. §2a. All A06 output goes to
   a `mktemp` file that is `rm -f`'d only inside the *failure* branch, so on
   success it is orphaned in `/tmp` and never shown. 38 such files have
   accumulated; the newest two are my run's and the implementer's cold run's.
4. **The manifest's symlink convention is undocumented.** §5b. 13 of 4804
   entries are unverifiable by the obvious method. Integrity is intact; the
   convention is not recorded anywhere.
5. **The deployment-consequence list is incomplete.** §6. Vulkan is named; the
   glibc 2.44 floor and host `libstdc++`/`libgomp`/`libgcc_s` are not.
6. **`.gitignore` adds repo-wide `build/`, not `build/linux-resources/`.**
   §11. Zero tracked files shadowed today; a latent footgun.
7. **The test script's port is hard-coded to 7834.** §12. Running V2 literally
   binds a port this card was not allocated.
8. **`whisper-cli --help` never exercises the Vulkan ICD.** §6. A bundle with a
   broken `libggml-vulkan.so` would pass. The card fixed this check.

## 11. Detail for findings 6 and 7

### 6. `build/` in `.gitignore`

```
$ git ls-files | grep -cE '(^|/)build/'          -> 0        (nothing tracked is shadowed today)
$ git check-ignore -q build/linux-resources/manifest.json  -> IGNORED   (intended)
$ git check-ignore -q server/build/z                       -> IGNORED   (not intended)
$ git check-ignore -q docs/build/y                         -> IGNORED   (not intended)
$ git check-ignore -q src-tauri/target/build/x             -> IGNORED   (not intended)
```

`.gitignore:50`. The dispatch's May edit says "`build/` is added to
`.gitignore`", so the implementer wrote exactly what the card fixed. The
consequence is that any future `*/build/` directory is silently untracked. No
data is lost today and `git add -A` is banned by convention, so the risk is
latent. Recorded so the coordinator can decide whether to narrow the pattern.

### 7. Port default

`scripts/v2/package-linux-resources.test.sh:22-23` and `:28`:

```
# dispatch (7834); it is never the live instance's 7717.
PORT="${APUNTA_P31_PORT:-7834}"
```

This review's dispatch allocates **7845** and its Step 1 says "`<p>` is `--port`
from the dispatch". Run exactly as the V2 row is written, with no
`APUNTA_P31_PORT`, the script would have bound **7834** — a port belonging to the
implementer's dispatch, not this one. This review therefore set
`APUNTA_P31_PORT=7845` and got 7845, which is why the run above is on 7845. The
script does validate the port range through `sandbox.mjs`, so no contract is
breached, and `7834` was free. But the port is a per-dispatch value hard-coded
into a committed script, so two concurrent card sessions that both ran the row
literally would collide on it.

## 12. What was NOT re-run, and why

| Not run | Reason |
| --- | --- |
| `npm run e2e` (Playwright) | Not a row of this card, and it rewrites four committed PNGs in `docs/v2/evidence/P2.2/screenshots/`. Deliberately avoided. The reviewer's working tree is clean, so it did **not** dirty them. |
| `npm test` (the full suite) | The card's L1 gate names two files, which were run. The full suite is the L2 parent gate. |
| `npm run eval`, `npm run check:format`, `npm run check:refine` | Out of scope; `check:format`/`check:refine` need a live model. |
| `npm run build` (standalone) | V1 runs `npm run build:shared && npm run build` internally (`package-linux-resources.sh:104`), so the build inputs were exercised. |
| `npm run package:mac` | Out of scope; `scripts/package-mac.sh` is Must-not-edit. |
| Real-model STT through `whisper-cli` | No model file, and A07 is S4a.2's. `--help` is the card's fixed check. |

## 13. Sandbox state left behind by this review

- Run folder `<sandbox>/2026-09-29T18-32-01-224Z-c6862c4d` (V2), plus two
  extra data dirs and one truncated-bundle copy used for §7. No server from this
  review is running; 7845 is free.
- `build/linux-resources/` was rebuilt by this review's V1 (cold) and is
  complete. It is gitignored; nothing under it was or should be committed.
- `/tmp/apunta-v2/whisper-src/whisper.cpp/build-vulkan/` was **deleted and
  rebuilt** by this review, deliberately, to make V1 a genuine cold build. The
  A06 **source clone was not re-cloned**; the builder reused it, which is the
  card's own instruction.
- One orphaned build log `/tmp/tmp.D8eAT9bvF0` (31,473 bytes), the leak
  described in finding 3, is this review's own. Left in place.
- **Four sandbox servers belonging to other sessions are still running** and
  were deliberately **not** touched: pids on ports 7861 and 7807 (started
  2026-09-26 and 2026-09-27) and two started 18:31Z during this review's V1.
  The implementer's incident stopped five similar orphans; these four remain
  and the coordinator may want them reaped by pid. `pkill` was not used.
