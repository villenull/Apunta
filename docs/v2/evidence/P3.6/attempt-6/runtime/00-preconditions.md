# P3.6 attempt 6 — RUNTIME (BUILD) run: preconditions, V0 once, native V3 once

| Field | Value |
| --- | --- |
| Card | P3.6 Linux AppImage integration — BUILD/runtime phase only |
| Attempt | 6 (owner-approved under AM-209, bounded to the two HIGH findings of `reviews/P3.6-impl5-source.md`) |
| Authority read | `AM-207` (attempt 5), `AM-209` (attempt 6). AM-209's order verbatim: *"Fresh independent source review must be CLEAR, then V0 once, then native V3. No seventh attempt, reset or waiver."* |
| Source review | `docs/v2/state/reviews/P3.6-impl6-source.md` — **CLEAR**, 0 defects in AM-209's bound, 4 LOW observations (O-1…O-4) all outside it. Harness sha256 verified `1d4bbf88…c6c3` |
| Dispatch | `docs/v2/state/dispatch/P3.6.md`; base commit header `62abb28`; header sandbox port `7879` |
| Dispatch base commit (S1, read from the header by hand) | `62abb28` |
| HEAD at this run | `c674f0f5ec125b4d2df5dd3528404d460179986d` |
| Working directory | repository root |
| Sandbox port | **7879** — the card's pinned port. Never 7717 (HS-1). Never 7811 |
| Lease | exclusive native BUILD lease + port 7879 held by this runner for the whole run |
| Writes | `docs/v2/evidence/P3.6/attempt-6/runtime/**` and an append to `docs/v2/state/returns/P3.6-attempt6-runtime.md`. Nothing staged, committed or pushed |

## 1. Preconditions — `git status --short` over the whole tree

```
$ git status --short
(no output)
```

**The tree is clean, in full and not only over Rule B.** This is the gate AM-207
and AM-209 both depend on: the concurrent worker (P5.3) was editing `server/` and
`web/` in parallel, and at the moment of this check **nothing it touches was
dirty**, so the build was not started from a dirty tree and this run is **not
BLOCKED** on that condition.

Explicitly re-checked over the harness's own `RULE_B_PATHS`
(`scripts/v2/tauri-e2e-smoke.test.mjs:143-156`), which is the card's Rule B set
verbatim:

```
$ git status --short -- server/src shared/src server/package.json \
    server/migrations src-tauri web/src web/public web/index.html \
    web/vite.config.ts web/package.json package.json package-lock.json
(no output)
```

| Input | Result |
| --- | --- |
| HEAD sha256/sha | `c674f0f5ec125b4d2df5dd3528404d460179986d` |
| `git status --short` (whole tree) | **empty** |
| `git status --short` over `RULE_B_PATHS` | **empty** |
| Rule B inputs dirty | **none** → proceed |

## 2. Machine preconditions

| Check | Result |
| --- | --- |
| A06 whisper candidate, S0 anchor `test -x "$HOME/.cache/apunta-v2/whisper-src/whisper.cpp/build-vulkan/bin/whisper-cli"` | **holds** — executable, 1064648 bytes, mtime 2026-10-02 13:00 |
| Node, pinned `~/.local/share/apunta-node/node-v24.19.0-linux-x64/bin/node --version` | `v24.19.0` — exactly what V0/V3 require |
| Node, box default on `PATH` | `v26.8.2` — outside the root `engines`, which is why both rows export the pinned path first |
| `cargo` at `~/.cargo/bin/cargo` | `1.99.0` — present; `cargo` is absent from the bare `PATH`, which is why V0's first clause exports `~/.cargo/bin` |
| `xvfb-run` | `/usr/bin/xvfb-run` — **present**, so V3 takes the `xvfb-run -a` branch |
| `xdotool` | `/usr/bin/xdotool` — **present**; Stop 2's `NOT RUN` cause does not apply |
| `pactl` | `/usr/bin/pactl` — present |
| Port 7879 before the run | **no listener** |
| Ollama on `127.0.0.1:11434` | **LISTEN** — this is the precondition behind the source review's **O-3** (`smoke ollama is still running`, which fetches `11434/api/tags` before and after even under `APUNTA_FAKE_AI=1`). It is satisfied on this machine, so O-3 is not predicted to fail here. Recorded, not probed by this session beyond `ss`. |
| `scripts/v2/tauri-e2e-smoke.test.mjs` | present, 3638 lines, sha256 `1d4bbf88bbc3977cbc0a2c26b9f5415bcdcdb629de45ebb9b9ff53d96724c6c3` — matches the attempt-6 candidate the CLEAR review verified |

## 3. The artefact V0 was about to replace, recorded first

The frozen test AppImage from attempt 2's V0 is present and is the one the CLEAR
review recorded as **stale under `ruleBFreshness`**:

```
-rwxr-xr-x 194214392  2026-10-03 22:15  Apunta (test)_0.0.0_amd64.AppImage
sha256 e6dd3ecb13f615f01223ded8be2be9e7154b49434dcd01b4e34ae170e109f39a
```

It is the byte-for-byte artefact recorded in attempt 2's `00-readme.md`. It is
**not** evidence for this attempt: the row's identity guard cannot tell a fresh
build from a leftover because both runs produce the same derived name, so the
hash is the only separator. Both hashes are kept below.

### Why it was stale — measured, and it is not only the artefact's mtime

`ruleBFreshness` (`scripts/v2/tauri-e2e-smoke.test.mjs:2005-2031`) has two arms.
AM-207 and AM-209 authorise the V0 re-run to satisfy the **freshness** arm — "the
AppImage is newer than the newest Rule B input" — and the new mtime does satisfy
it. The **other** arm is a statement about git history, not about any build, and
a V0 re-run cannot move it:

```
$ git diff --name-only 62abb28...HEAD -- <RULE_B_PATHS>
  49 paths, e.g. package-lock.json, server/src/index.ts, server/src/db/notes.ts,
  server/src/backup/restore.ts, shared/src/index.ts, web/src/lib/recorder.ts,
  web/package.json, ...
```

`smoke Rule B freshness: the source set has not moved since the dispatch base`
requires that list to be **empty**, and it cannot be made empty by building
anything: `RULE_B_BASE` is the dispatch header's literal `62abb28`, Rule B inputs
have been committed since, and `src-tauri/**`, the card, the checkpoint and the
harness are all outside this runner's May edit. **This is recorded now, before
V3, as a known and structural FAIL the row will report — not as a defect of the
build and not as something this run may repair** (editing the harness, the card
or Rule B's base is forbidden here, and editing `server/` or `web/` to make the
tree match a stale base is HS-9 and would be a different card's work).

## 4. Command decode — byte-exact, decoded once per row

`00-v0-v3-command-decode.txt`, produced by `decode-cells.mjs` in this folder: the
verification table is found by its own header row (dispatch line 442), split on
**unescaped** pipes only, each row required to yield exactly three cells, the
Command cell's leading backtick span taken, GFM's `\|` → `|` and `\\` → `\` applied
to the interior, and the result verified with `bash -n` before any byte was used.
Neither row was retyped, reconstructed from prose, or normalised.

| Row | Dispatch line | Raw cell sha256 | Decoded length | Decoded sha256 | `bash -n` |
| --- | --- | --- | --- | --- | --- |
| V0 | 444 | `8b90593953ed6764686079d124f8e36e45b77e33ab5e1e81caeb27f1c03b3144` | 969 | `cdb77a6b26ea2ded0923fd17f85ba1a1ebae75c6ed956d29a19f46a6f54184aa` | exit 0 |
| V3 | 447 | `036d6a0b82ee65184754e41dc13ec846363d4047a88930b2feba03bff44ba814` | 907 | `26e55096ec41d7b8b13325b5c519301dcb3b1122e93fd51eb446f6915f5be322` | exit 0 |

**V0's decoded bytes are identical to attempt 2's**, which were themselves
decoded the same way:

```
$ cmp attempt-6/runtime/v0-command-decoded.sh attempt-2/build-preparation/v0-command-decoded.sh
(no output)  IDENTICAL
```

Attempt 2 recorded V0's decoded sha256 as `cdb77a6b…84aa` and the file's as
`8399eb02…ea6`; this run computes the same two values. The two dispatches differ
in their header, attempt number and prose and **not in one byte of V0's command**.
V3's cell carries its trailing prose *inside* the same cell after the closing
backtick (1498 raw bytes, 907 decoded); the codec took the backtick span and
recorded the prose remainder's presence rather than assuming it away.

## 5. How the long commands were run — the attempt-1 lesson applied

Attempt 1's V0 was destroyed by a supervisor's 120 s process-group timeout
mid-bundle (`attempt-2/build-preparation/07-attempt-1-interruption.md`): a
partial `AppDir` is not a `PASS` and no attributable exit existed. Therefore:

- each row runs under `setsid`, fully detached from this tool's process group, so
  no timeout on this session's shell can signal it;
- stdout **and** stderr go to one file under this folder, untruncated and
  unredirected away;
- the exit code is written to a sibling `.exit` file by the detached shell itself;
- this session **polls for the `.exit` file** rather than holding the process, so
  no wait of mine can kill the build.

## 6. What this run does and does not do

Runs, in this order and never concurrently: **V0 once**, then **V3 once** (native,
in the sandbox, fake AI, `xvfb-run -a` + the harness's own virtual audio), then
cleanup and the record.

Not run, by scope: **V1**, **V2**, **V4**, **V5**. No approval is claimed for
them. Nothing is committed, staged or pushed; no coordinator state file is
written; the live data dir, port 7717, the owner's 7811 preview, any real
microphone beyond what the harness's own containment asserts, and the network are
untouched.
