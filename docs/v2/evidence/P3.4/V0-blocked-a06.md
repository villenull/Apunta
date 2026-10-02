> **Superseded by attempt 3.** This file records attempt 2's outcome and is
> kept as history. Step S0 has since acquired A06 and **V0 passed**; see
> [`V0-rebundle.md`](V0-rebundle.md) and
> [`acquisition-A06.md`](acquisition-A06.md). The record below is attempt
> 2's and describes a condition that no longer holds.

# V0 — the re-bundle: `BLOCKED`

**Status: BLOCKED** (A06, the missing whisper source tree). The row was run
verbatim and stopped at its **first** command, the `whisper-cli` precondition —
before any build output was written.

- Working directory: the repository root.
- Command: the row's command exactly as the card gives it (the
  `export`s, the `trap`, the `test -x` precondition, the flagged web build, the
  three marker counts, the producer, and `npm run tauri:build:test` last).
- Exit code: **1**.
- Start / end time: 2026-10-02T18:18:17Z / 2026-10-02T18:18:17Z.
- Sandbox: none. V0 drives no sandbox; it is a build row.

## Verbatim excerpt

```
v24.19.0
```

and then the row stopped, with exit code **1**. The failing link is

```sh
test -x "${APUNTA_WHISPER_WORK_DIR:-/tmp/apunta-v2/whisper-src}/whisper.cpp/build-${APUNTA_WHISPER_BACKEND:-vulkan}/bin/whisper-cli"
```

Both variables are unset in this session, so the candidate the row asserts is
`<sandbox>/whisper-src/whisper.cpp/build-vulkan/bin/whisper-cli`, and it does
not exist:

```
$ test -x /tmp/apunta-v2/whisper-src/whisper.cpp/build-vulkan/bin/whisper-cli; echo $?
1
$ ls -l /tmp/apunta-v2/whisper-src
ls: cannot access '/tmp/apunta-v2/whisper-src': No such file or directory
```

The whole tree is gone, not just the built binary:

```
$ find / -xdev -type d -name "whisper.cpp" 2>/dev/null | head
(no output)
$ find / -type d -name "build-vulkan" 2>/dev/null | head
(no output)
```

What **does** exist is the *output* the producer copied at 00:01 —
`build/linux-resources/bin/whisper-cli` and its shared libraries — which is
exactly the directory Rule B names as **never an input, only an output**. It
cannot serve as the candidate: the row asserts the candidate
`scripts/build-whisper-candidate.sh` would reuse, and the producer then re-runs
that builder, which starts with a `git fetch` of the pinned A06 revision from
`github.com`.

## Why this is BLOCKED and not something worked around

The card states the consequence of a missing candidate in as many words:

> The `whisper-cli` precondition is asserted, not assumed: the producer builds it
> if it is missing, and a missing candidate would turn this row into a source
> fetch (HS-3). So the row first asserts the candidate is already there, and a
> missing one is `BLOCKED` naming A06 and the missing toolchain — **never** a
> fetch, never a skipped producer, and never a release build with no whisper
> binary in it.

So: **A06**, the whisper.cpp source tree at the revision pinned in
`scripts/build-whisper-candidate.sh` (`371b5a7561823ab2bb32142d2751e35e7534727b`,
host `github.com` / redirect `codeload.github.com`), is not present on this
machine, and acquiring it is not this session's to do (HS-3; A06's card is P3.1).
Running the producer anyway would have fetched it, which is precisely what the
precondition exists to prevent.

**Three remedies were available and all three were refused**, and refusing them
is the whole content of this row:

1. **Run the producer and let it fetch.** HS-3, and the row's own wording.
2. **Run `npm run tauri:build:test` on its own.** It cannot help: Rule B is
   explicit that `tauri.conf.json` declares no `beforeBuildCommand`, so `tauri
   build` copies whatever `build/linux-resources/` already holds. That folder's
   `server/server.mjs` is from 00:01 and its `web/dist` no longer exists at all.
   A build without the producer produces an AppImage just as stale.
3. **Copy the already-built `build/linux-resources/bin/whisper-cli` into a
   fabricated `whisper.cpp/build-vulkan/bin/`** so the precondition passes. That
   is manufacturing a build tree to satisfy an asserted precondition, which is a
   guard satisfied by a lie. Not done.

## What this costs, precisely

V2 launches the AppImage V0 produces. With V0 blocked, V2 launched the AppImage
built at 07:06Z, whose bundled server predates `server/src/http/csp.ts` and whose
bundled web bundle has no observation hook in it. Both of V2's freshness
assertions fired, (d)'s header half failed, and (a), (b), (c), (d)'s handler half
and (e) were `NOT RUN` — see `V2-appimage-security.md`. That is the same
outcome attempt 1 recorded, reached for a different and, this time, external
cause: attempt 1's card defect was the trigger, this one's is a missing A06
source tree.

## What a reviewer should press on

- Whether the coordinator wants A06 re-acquired (a coordinator decision under
  HS-3), or the producer given a documented reuse path for an already-built
  candidate. Either is a change to a file outside this card's May edit.
- `build/linux-resources/web/dist` **does not exist** right now — that is the
  state P3.3 left, not a consequence of this row: the row aborted before
  `mkdir -p build/p3.4-web`, its `trap` never had anything to remove, and the
  `git status` afterwards names only the two source files this card edited. Any
  release build must run `bash scripts/v2/package-linux-resources.sh` in front of
  `npm run tauri:build`, which the card already states.