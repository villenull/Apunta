# P3.4 — V0, the re-bundle

- Working directory: repository root
- Start: 2026-10-02T23:06:09Z
- End: 2026-10-02T23:07:29Z (80 s)
- Exit code: **0**
- Status: **PASS**

## Why the row ran at all

V0's condition is Rule B and nothing else: run it when a path in Rule B's set
changed, and only then. Three predicates were checked before running it, and one
of them was **not** empty.

| Predicate | Result |
| --- | --- |
| `git diff --name-only e46bad4…HEAD -- <Rule B set>` | empty |
| `git status --porcelain -- <Rule B set>` | empty |
| checkpoint `changedFiles` naming a Rule B path | none |

Those three alone would have said "not required". The AppImage that was in the
tree nevertheless **could not** have carried this card's channel, and that is a
measurement, not an opinion:

| Measurement (before V0) | Value |
| --- | --- |
| `src-tauri/src/main.rs` mtime — a Rule B path, changed by P3.8 (AM-180) | 2026-10-02 14:48:10 -0600 |
| AppImage mtime | 2026-10-02 16:50:00 -0600 (so *fresh*, and V2's freshness walk would have passed) |
| shipped AppDir web bundles containing `p3.4-observe` | **0 of 16** |
| shipped AppDir web bundles containing `VITE_APUNTA_TEST_IDENTITY` | 0 of 16 |
| `build/linux-resources/web/dist` | absent — removed by V0's own `trap` on the previous attempt |

So the binary was fresh and *unflagged*: P3.8's build needed only its own curl
marker, not this card's hook. Launching it would have made V2's (a), (b), (c),
(d)'s handler half and (e) `NOT RUN` for a reason that has nothing to do with
the shell's forwarding — which is precisely the trap the card's Rule B bullet
exists to close, in its other direction. **This is the first observation a
reviewer should press on**: the card's three "run V0 only if" predicates are all
satisfied while the shipped bundle cannot carry the channel, because none of
them looks at what the producer last put in `build/linux-resources/`. Recorded
as an observation; the card was not edited.

## Exact command

Run verbatim from the card's V0 cell, producer included, in one shell so the
`trap` covers every path:

```
export PATH="$HOME/.cargo/bin:$PATH" && export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" && export APUNTA_WHISPER_WORK_DIR="$HOME/.cache/apunta-v2/whisper-src" && node --version && P34_FLAGGED="$PWD/build/p3.4-web" && trap 'rm -rf "$P34_FLAGGED" build/linux-resources/web/dist' EXIT INT TERM HUP && test -x "${APUNTA_WHISPER_WORK_DIR:-/tmp/apunta-v2/whisper-src}/whisper.cpp/build-${APUNTA_WHISPER_BACKEND:-vulkan}/bin/whisper-cli" && mkdir -p build/p3.4-web && VITE_APUNTA_TEST_IDENTITY=1 npm --prefix web run build -- --outDir ../build/p3.4-web/dist --emptyOutDir && node -e "…" build/p3.4-web/dist && bash scripts/v2/package-linux-resources.sh && node -e "…" web/dist && rm -rf build/linux-resources/web/dist && cp -R build/p3.4-web/dist build/linux-resources/web/dist && node -e "…" build/linux-resources/web/dist && npm run tauri:build:test
```

(The three `node -e` predicates are the card's own, unabridged, in the card's own
order.)

## Excerpt — the three counts, each printing its own label

```
v24.19.0
marker bundles in build/p3.4-web/dist: 1
== Building whisper-cli (A06)
copied whisper-cli and 15 shared libraries into bin/ (RUNPATH $ORIGIN:)
manifest lists 4804 files
output: /home/villenull/Projects/Apunta/build/linux-resources
files:  4804
marker bundles in web/dist: 0
marker bundles in build/linux-resources/web/dist: 16

> apunta@0.0.0 tauri:build:test
> tauri build --features test-identity --config src-tauri/tauri.test.conf.json
    Finished `release` profile [optimized] target(s) in 28.10s
    Bundling Apunta (test)_0.0.0_amd64.AppImage (…/src-tauri/target/release/bundle/appimage/Apunta (test)_0.0.0_amd64.AppImage)
    Finished 1 bundle at:
        …/Apunta (test)_0.0.0_amd64.AppImage (169.30 MiB)
```

| Assertion | Required | Observed |
| --- | --- | --- |
| `node --version` | exactly `v24.19.0` | `v24.19.0` |
| marker bundles in `build/p3.4-web/dist/assets/*.js` | ≥ 1 | **1** |
| marker bundles in `web/dist/assets/*.js`, **after** the producer | **exactly 0** | **0** |
| bundles in `build/linux-resources/web/dist/assets/*.js` | ≥ 1 | **16** |
| AppImage under `src-tauri/target/release/bundle/appimage/` | exists | one file, 169.30 MiB, mtime 2026-10-02 17:07:29 -0600 |

The third count is **16**, not 1, and that is the card's own command rather than
a discrepancy: its third `node -e` filters only on `.endsWith('.js')` and carries
no `.includes('p3.4-observe')` predicate, so it counts every JS bundle. The
assertion is "≥ 1" and it holds. Recorded so a future revision does not read the
16 as a second marker.

## The `trap` fired, and both scratch trees are gone

```
$ ls -d build/p3.4-web build/linux-resources/web/dist
ls: cannot access 'build/p3.4-web': No such file or directory
ls: cannot access 'build/linux-resources/web/dist': No such file or directory
```

`web/dist` is the producer's own unflagged copy and was left unflagged on every
path, as the card requires. `build/linux-resources/` itself was **not** deleted
by this attempt — the producer rewrites it, and everything in it except
`web/dist` is present and current.

## Independent confirmation that the channel is now in the shipped bytes

| Check | Value |
| --- | --- |
| shipped AppDir web JS bundles | 16 |
| of those, containing `p3.4-observe` | **1** (`index-DXrud9Kw.js`) |
| of those, containing `VITE_APUNTA_TEST_IDENTITY` | **0** — the gate is resolved at web build time and cannot survive into the binary |
| CSP present in the shipped `server/server.mjs` | yes (`default-src 'self'` found) |
| AppImage newer than every path in Rule B's set | yes — `find` over all of Rule B's set returns nothing newer |

## Acquisitions

**None as a new item.** The row's first assertion
(`test -x "$APUNTA_WHISPER_WORK_DIR/whisper.cpp/build-vulkan/bin/whisper-cli"`)
passed against the tree S0 built on 2026-10-02, so nothing was cloned and no
model was pulled.

**One network request was nevertheless made, and it is recorded rather than
ruled away.** `scripts/v2/package-linux-resources.sh:206` calls
`scripts/build-whisper-candidate.sh` unconditionally, and that script has **no**
"candidate already executable → skip" guard — its only guards are `uname`, the
backend name, `JOBS`, the required tools, `hipcc` and `glslc`, after which
`:77` runs `git -C "$SRC" fetch --depth 1 origin 371b5a75…` on every single run.
So the fetch happened: one `git fetch` of the **already-pinned** A06 revision to
`github.com`, then a CMake reconfigure and an incremental `whisper-cli` build.

This corrects a claim made in the coordinator's ruling before V0 was run, that
the producer "skips the fetch entirely" when the candidate is executable. The
card's own S0 bullet says the same thing, and both are wrong about the code: the
**S0 step** is skipped, and the **producer** is not. `package-linux-resources.sh:201-204`
states the card's actual position correctly — the re-run "is a redundant fetch
and a rebuild — not a second acquisition" — and that is the position this record
takes. It is not a new acquisition under HS-3 (the item is already in
`ACQUISITION.md`, already pinned, already verified and already recorded in
`docs/v2/evidence/P3.4/acquisition-A06.md`), and no other host, query key, model,
toolchain or revision was touched.

**A reviewer should press on this**: the card's S0 text asserts a network-free
producer run when the candidate is executable, and the code does the opposite.
The assertion it justifies — "V0's first assertion exists to guarantee no
network" — is true in substance and wrong in mechanism.