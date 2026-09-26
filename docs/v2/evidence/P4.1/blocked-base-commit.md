# P4.1 — evidence: not run, blocked at the base-commit check

- **Working directory:** repository root (`/home/villenull/Projects/Apunta`)
- **Node:** `v24.19.0` at the path the card's rows export, npm 11.17.0
- **Branch:** `feature/v2`
- **Status:** BLOCKED — no verification row was run
- **Start / end:** first command between 2026-09-26T15:59Z and 16:00Z (its own
  clock reading was not captured; the first reading taken is `16:00:34Z` and the
  last is `16:01:05Z`). Every command below is a read-only `git`, `ls`, `find`
  or `node --version` invocation; nothing else ran.

No `npm` script ran, no test ran, no build ran, no server was started, no
database was opened, no port was taken and **no network request of any kind was
made**. The card's `port 7826` is unused and unbound. Nothing under
`installer/src/`, `shared/`, `server/`, `web/` or `scripts/` was read for
implementation or written.

## The stop

The dispatch's line 9 and the session instructions both say: verify HEAD is the
base commit, do not pull/merge/rebase/reset, and **if HEAD differs, stop and
report**. It differs — and it differs by **two** commits, the second of which
touches code.

| What | Value |
| --- | --- |
| Base commit named by the dispatch I was given | `ba63695` |
| HEAD when this session's first command ran | `3088ed4` |
| HEAD when this file was written (1 min later) | `aaebc4d` |
| Commits in `ba63695..HEAD` | 2 |
| `ba63695` relative to HEAD | an ancestor (fast-forward, no divergence) |

**HEAD moved during the session.** The first `git log -1` returned `3088ed4`; a
`git rev-parse --short HEAD` run 30 seconds later returned `aaebc4d`. The
branch is being committed to while an implementation card is dispatched against
a pinned base, so the base this card was given cannot hold still for the length
of the card.

### `git log -1 --format='%H%n%s%n%ci'` (exit 0)

```
3088ed48e403baf65410fda197f20503dd9ceebb
Add P4.1 checkpoint
2026-09-26 09:59:37 -0600
```

### `git log --oneline ba63695..HEAD` (exit 0, at 16:00:55Z)

```
aaebc4d S2.4 attempt 2: restore English text, extend Import test
3088ed4 Add P4.1 checkpoint
```

### `git merge-base --is-ancestor ba63695 HEAD` (exit 0)

Empty output, exit 0: the base is an ancestor of HEAD. Nothing diverged — a
commit landed **on top of** the base after this dispatch was generated. Fast
forward, so a re-dispatch at the current HEAD is cheap; nothing needs merging.

## What the two extra commits contain

### `git show --stat 3088ed4` (exit 0)

```
3088ed4 Add P4.1 checkpoint
 docs/v2/state/cards/P4.1.json | 1 +
 1 file changed, 1 insertion(+)
```

One file: `docs/v2/state/cards/P4.1.json`, the coordinator-owned checkpoint for
**this very card**, created one line after the dispatch named the base. It is
not code, it is not in May edit, and the card says this card reads it and never
writes it. Its contents at HEAD:

```json
{ "card":"P4.1","planVersion":2,"contracts":[],"baseCommit":"ba63695","attempt":1,"status":"IN PROGRESS","lastCompletedStep":"card repaired twice; IR CLEAR all ten (round 3); implementer dispatched","nextAllowedAction":"check implementation return","sideEffectsDone":[],"changedFiles":[],"criteria":{},"sandboxRuns":[],"updatedUtc":"2026-09-26T16:30:00Z" }
```

The checkpoint still records `baseCommit: ba63695`, i.e. the base has moved
without the record of it moving.

### `git show --stat aaebc4d` (exit 0)

```
aaebc4da78ca4c0c904d0d223ce12da70d46a1df S2.4 attempt 2: restore English text, extend Import test
 docs/v2/evidence/S2.4/v1.md             |  79 ++++++--
 docs/v2/evidence/S2.4/v2.md             |  67 ++++-
 docs/v2/evidence/S2.4/v3.md             |  63 +++++
 docs/v2/evidence/S2.4/v4.md             |  85 +++++-
 docs/v2/evidence/S2.4/v5.md             |  33 ++++
 docs/v2/state/returns/S2.4.md           | 204 ++++++++++++++++++++++-------
 shared/src/i18n/en.ts                   |  18 +++
 shared/src/i18n/es-MX.ts                |   9 ++
 web/src/components/NotesColumn.tsx      |   2 +-
 web/src/components/PatientDirectory.tsx|   2 +-
 web/src/routes/Import.test.tsx          |  20 ++++
 web/src/routes/Import.tsx               |   2 +-
 12 files changed, 522 insertions(+), 62 deletions(-)
```

This one **is** code, and it is in `shared/` and `web/` — the two trees V1
compiles (`npm run build:shared`) and V3 checks (`npm run typecheck`,
`npm run lint`) and the two trees the root `vitest.config.ts` projects cover
(`web/src/routes/Import.test.tsx` is in it). Recorded as a fact, **not** as a
judgement that proceeding would be wrong: that call is the coordinator's, and a
card must not authorise its own base. The point of recording it is that a red
V1 or V3 on a re-dispatch would have this commit in its history as the first
suspect, not this card's diff.

## Four bases are on record for this card, and the dispatch's is uncommitted

| Source | Base recorded |
| --- | --- |
| `docs/v2/state/cards/P4.1.json` (`baseCommit`, committed at HEAD) | `ba63695` |
| `docs/v2/state/dispatch/P4.1.md` **as committed at HEAD** | `f3cff8b` |
| `docs/v2/state/dispatch/P4.1.md` **in the working tree** (my copy) | `ba63695` |
| actual HEAD at session start / at report | `3088ed4` / `aaebc4d` |

### This card's dispatch is not a base-only edit — unlike P4.2's

`git diff --stat -- docs/v2/state/dispatch/P4.1.md`: **309 lines committed, 673
in the working tree.** The committed version is the pre-repair card; the
working-tree version is the card as it stands after IR round 2 and round 3 —
the ten Fixed decisions, the card's own `## Egress (this card only)` section,
the 23-case test table, the V1 collection tripwire and the six stop conditions
all exist only in the working-tree copy. They are not in `git`, and they are not
in `docs/v2/cards/P4.1.md`'s dispatch as last committed.

**So the re-dispatch must regenerate the dispatch from `docs/v2/cards/P4.1.md`
and must not be done by committing or reverting the dispatch file.** Reverting
it would silently downgrade the card to the version IR rejected. The generator
that produced the working-tree copy is `docs/v2/tools/build-dispatch.mjs` (the
header names it without the `docs/v2/` prefix, which is why a root-level `tools/`
search misses it — `tools/` at the root holds only `model-lab`).

## Node

### `node --version` under the card's own export (exit 0)

```
v24.19.0
```

`$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin` exists and is
first on `PATH` for that check; npm is 11.17.0. Recorded so the coordinator
knows this is a base mismatch and not an environment one. The box default
(`v26.8.2` via the mise shim) was never used for anything, because nothing ran.

## Working tree at the stop

### `git status --porcelain | wc -l` (exit 0, at 16:01:05Z)

```
43
```

43 entries, all belonging to other cards and in-flight agents (S2.4 evidence and
returns, the P3.x/P4.x/P5.x dispatch and review files, `installer/src/cli.ts`
and `cli.test.ts`, `scripts/v2/sandbox.mjs` and the two es-audio scripts, the
`server/src/backup/*` and `server/src/config.ts` work, `shared/src/errors.ts`
and `shared/src/index.ts`, plus untracked `shared/src/platform-paths.ts` and
`server/src/db/snapshot.ts` from other cards). Left exactly as found. **None
was staged; `git add` was never run.**

### `git status --porcelain -- <P4.1 May-edit paths>` (exit 0)

Empty. Every path this card may edit is clean:

```
installer/src/{catalog,download,run,resume,ollama}{,.*}.ts
installer/src/readiness.ts, installer/src/readiness.test.ts
scripts/v2/probe-redirects.mjs
```

Worth recording for the re-dispatch: P4.2's agent has `installer/src/cli.ts`
and `installer/src/cli.test.ts` in flight and this card's May edit does not
overlap it, so a re-dispatch should not collide on a file. V1 and V3 are
whole-repository rows and can still be reddened by that in-flight work, which
is stop condition 6, not this card's to fix (HS-9).

## Egress: the grant is unspent

The card's `## Egress (this card only)` section authorises seven `HEAD`
requests to the pinned A07 URLs. **None was made.** No `fetch`, no `curl`, no
`HEAD`, no DNS lookup, no socket. `scripts/v2/probe-redirects.mjs` was not
written, `installer/dist/` was not built, and `docs/v2/evidence/P4.1/redirects.md`
does not exist. A re-dispatch therefore needs no new egress approval and no
fresh grant: the original one is unspent and covers step 1's probe and V2's
re-run.

## Two things the coordinator should decide before re-dispatching

1. **The base has to stop moving, or the card cannot hold it.** Either freeze
   commits to `feature/v2` for the duration of P4.1, or re-dispatch against
   whatever HEAD is at the moment the implementer starts and accept that V1/V3
   results are only as stable as the branch. This is the second card to stop
   on this; `docs/v2/state/returns/P4.2.md` records the first, and the
   coordinator's response to that one was to re-dispatch P4.2 at the moved base
   — which is the fix, applied to a branch that is still moving.
2. **Stop condition 4's ruling, asked for now rather than assumed later.** The
   card's stop condition 4 turns on whether RUN-CONFIG §4's "never include
   hostnames" bar covers **public vendor CDN names** as well as machine, user
   and container identifiers. The card's Egress section argues the host is the
   artefact's content and should be written as observed, and points at
   `docs/v2/evidence/P1.5/licence-evidence.md` as the precedent. This card
   "asks for that ruling in its return file rather than assuming it, so the gap
   cannot become a self-inflicted block". Raising it now means the answer is in
   hand **before** the probe writes `redirects.md`, so the evidence file is
   written correctly the first time instead of being redacted after the fact.
   If the ruling is the wider reading, the hosts move to the return file and
   `redirects.md` carries `<host-1>`, `<host-2>` in hop order.

## What this session changed

Exactly two paths, both required outputs of the card rather than May-edit
violations (AM-017):

- `docs/v2/evidence/P4.1/blocked-base-commit.md` — this file
- `docs/v2/state/returns/P4.1.md`

Nothing was committed or staged. No branch was created, no history rewritten,
no file outside the card's allowed set edited, no May-edit path touched.
