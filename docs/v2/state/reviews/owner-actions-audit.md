# Audit — `state/OWNER-ACTIONS.md`

Audit of the owner-action queue at `c17bc8a`, read-only. Scope: every entry in
`docs/v2/state/OWNER-ACTIONS.md`, and every owner gate that exists only as prose
elsewhere under `docs/v2/`.

**How every `docs/v2/` path in this audit was read.** A S3.2 implementer holds the
build lease and another worker is repairing `docs/v2/cards/P3.6.md`, so the
working tree is not a trustworthy view of `docs/v2/`. Every state file, card,
checkpoint, amendment row, dispatch and log line cited below was read with
`git show HEAD:<path>` (or `git grep … HEAD`) against `c17bc8a`, never from the
working tree. Nothing was edited, and no build, test, eval, cargo, tauri or
launching command was run. The one file this audit writes is itself.

**Headline.** All **five** entries in the file are **satisfied**, and **none** is
outstanding. The file has no live items at all — it is a closed queue that still
reads as an open one. Two of the five are wrong in a way that sends the owner
back to a finished install (§2), and one resolution is filed against the wrong
card (§1.2). Meanwhile **four** real owner gates wait in prose, in
`NEXT-SESSION.md`, `AMENDMENTS.md` and two amendment proposals, with no row in
this file at all (§3).

---

## 1. Per-entry verdicts

Five entries, in file order. "Card waiting?" asks whether the named card is still
blocked by the thing the entry asks for.

### 1.0 Summary

| # | Date | Card | Entry asks for | Still outstanding? | Card still waiting? | Filed correctly? |
| --- | --- | --- | --- | --- | --- | --- |
| E1 | 2026-09-26 | P0.4 | Ollama + `qwen3.5:4b-q4_K_M`, **plus** a nested `systemctl enable --now ollama` sub-action | No — install done; **the nested sub-action is also done and is still phrased as open** | No (`P0.4: APPROVED`) | Yes for the install; **no** for the sub-action |
| E2 | 2026-09-26 | P3.1 | `pkexec pacman -S --needed cmake` | No | No (`P3.1: APPROVED`) | **No — its resolution is filed under E4** |
| E3 | 2026-09-28 | P3.1 | `pkexec pacman -S --needed vulkan-headers` | No | No (`P3.1: APPROVED`) | **No — no resolution line at all, and it still asserts `P3.1 (BLOCKED)`** |
| E4 | 2026-09-26 | P4.1 | A07 `allowed-query-keys` column, or mark unavailable | No (AM-042, option (a)) | No (`P4.1: APPROVED`) | Its own resolution yes; **it also carries E2's resolution** |
| E5 | 2026-09-29 | P3.3 | A03 packages + Xvfb/xdotool harness, via `pkexec` | No (resolved 2026-10-02) | No (`P3.3: APPROVED`) | Yes — the only fully correct entry |

### 1.1 E1 — 2026-09-26 | P0.4 | Ollama and the model tag — **satisfied, with one open-sounding sub-action that is finished**

Proved by **AM-020** (`state/AMENDMENTS.md:25`), the owner-authorised HS-3
exception that permits installing Ollama at all, plus the recorded versions in the
file's own RESOLVED line and in `ORCHESTRATION-LOG.md:52`: `ollama 0.33.3-1` +
`ollama-rocm` + `hipblas`, `/opt/rocm` present, `qwen3.5:4b-q4_K_M` at digest
`2a654d98e6fb`, 3.4 GB, 100 % GPU on the RX 9070 XT. `PROGRESS.json` at HEAD has
`P0.4: APPROVED`, so nothing waits.

**The defect.** The RESOLVED line ends "Remaining owner action for persistence:
`sudo systemctl enable --now ollama` (service is installed but disabled; daemon
currently runs as a manual `ollama serve`, PID 294100 …)". That sub-action was
**completed the same day**, at `ORCHESTRATION-LOG.md:53` (2026-09-26T07:25:46Z):
the owner ran `systemctl enable`, the service failed while the manual serve held
11434, a drop-in was added to run it as `villenull` with
`HOME`/`OLLAMA_MODELS=/home/villenull/.ollama/models`, and the state was
confirmed **enabled + active, model listed**. The PID, the log path and the
"disabled" state in the queue are all three stale.

**Verdict: this entry asks the owner for something already done.** It is the most
damaging kind of error in this file and it is the one instance of it (see §5). The
nested sub-action has no date, no owner-facing close, and — structurally — no
way to be closed, because it lives inside a `→ **RESOLVED**` line, which every
reader is entitled to read as "nothing left here".

`state/reviews/state-reconciliation-audit.md:59` and `:92` already found this same
item. It is still open at `c17bc8a`.

### 1.2 E2 — 2026-09-26 | P3.1 | `cmake` — **satisfied; its resolution is filed under the wrong entry**

Proved by recorded versions, not by an amendment row: the RESOLVED bullet states
cmake **4.4.3** at `/usr/bin/cmake` and `glslc` **2026.3**, coordinator
re-verified all three by command on 2026-09-28. `P3.1.md`'s Stop condition
carries the same correction (independent review F2, superseded D5) and says the
old "tool absent" assertion "was not true … An implementer reading the old text
would have filed `BLOCKED` for a tool that is installed, on the card's own
instruction." `PROGRESS.json` has `P3.1: APPROVED`, with `docs/v2/state/cards/P3.1.json`
carrying `status: APPROVED` and V1/V2/V3/V4 all `PASS`. The entry also names a
fact that later turned out to matter: `hipcc` is genuinely absent, which is why
the `vulkan` backend was chosen instead.

**Where the resolution belongs: under E2, this entry.** It does not. The cmake
resolution is the **third** `→ **RESOLVED**` bullet appended to the **P4.1** entry
(E4), after P4.1's own A07 resolution — i.e. a cmake install is recorded under a
plan-editor decision. Two consequences, both observed in practice: a reader who
opens E2 sees an unresolved install, and a reader who reconciles E4 sees two
resolutions where one belongs to a different card. The bullet even explains its
own displacement ("P3.1's stop condition that asserted cmake was absent … has
been corrected") while sitting under P4.1, which is the strongest evidence the
displacement was accidental rather than deliberate.

**Also note: no `AMENDMENTS.md` row authorises the cmake install.** The precedents
for an owner-run `pkexec` package install exist — AM-020 (Ollama) and AM-081
(P3.3's A03 `pkexec`, cited in E5) — but cmake and the Vulkan headers (E3) were
run by the owner with no row. The install itself is well evidenced; what is
missing is the authorisation record that says the HS-3 exception was granted for
it. That is the same class of gap as E3's.

### 1.3 E3 — 2026-09-28 | P3.1 | Vulkan SDK headers — **satisfied; this is the entry that looks live and is not**

Proved by version evidence in the card's own evidence tree and by the card's
status:

- `docs/v2/evidence/P3.1/attempt1-verification.md:20` — `vulkan.h`, **1.4.357.0**,
  package `vulkan-headers 1:1.4.357.0-1` (owner, this session).
- `docs/v2/evidence/P3.1/acquisition-A06-completed.md:83` — `vulkan-headers
  1:1.4.357.0-1` **and** `spirv-headers 1:1.4.357.0-1`, both recorded.
- `docs/v2/state/returns/P3.1.md:23` — the blocker "is resolved"; it turned out to
  be **two** missing packages, not one, because the two are separate members of
  Arch's `vulkan-devel` group.
- `ORCHESTRATION-LOG.md:585` (2026-09-29) — P3.1 attempt 1 resumed with "the
  Vulkan headers are now present".
- `PROGRESS.json`: `P3.1: APPROVED`; `state/cards/P3.1.json`: `APPROVED`, four
  `PASS` criteria, `updatedUtc` 2026-09-29.

**The two defects, and they are the ones this audit was asked about.**

1. **The entry is still outstanding-looking.** There is **no** `→ **RESOLVED**`
   line anywhere under it. Its last field reads "`P3.1` (**BLOCKED**), and
   through P3.3-P3.6, P3.R, P5.4, P5.R, P6.1-P6.R, P7b.1, P7b.2 and the Q1
   series." **P3.1 is APPROVED**, and of that downstream list only P3.4 has ever
   been BLOCKED — and for a different reason (three attempts spent, AM-138), not
   for these headers. A fresh session reading this file would reasonably conclude
   that the entire P3/P5/P6/Q1 tail is waiting on a `pkexec` that was run three
   days after the entry was written.
2. **The claim behind the entry is itself stale in a way that cost work.** The
   entry names `vulkan-headers` alone. The real requirement was **two** packages,
   and `spirv-headers` is not named. `P3.1.md`'s current text does *not* repeat
   the claim (the Stop condition now names `hipcc` as the absent tool), so the
   stale assertion survives in exactly one place: this entry.

**Verdict: satisfied, and it is asking for work already done** — like E1, though
E1 is the sharper case because E1's task is a one-line systemctl and E3's is a
`pkexec` install that a reader has no signal has already happened.

### 1.4 E4 — 2026-09-26 | P4.1 | the A07 redirect query-string decision — **satisfied; correctly resolved, but hosting a foreign resolution**

Proved by **AM-042** (`AMENDMENTS.md:46`), which is the owner-approved resolution:
option (a) plus the one probe needed to make it actionable. The probe observed one
hop-1 host, `us.aws.cdn.hf.co`, for all seven artifacts, with ten enumerated query
key names; `ACQUISITION.md` §1 row **A07** now carries that host and exactly those
names (`Expires`, `Hash-Algorithm`, `Key-Pair-Id`, `Policy`, `Signature`,
`X-Xet-Cas-Uid`, `response-content-disposition`, `response-content-type`,
`user_id`, `xip`), and P4.1's card text, tests and stop condition follow.
`PROGRESS.json` has `P4.1: APPROVED`. S4a.2, P4.3 and P4.4 were named as waiting;
S4a.2 is now separately owner-parked (§3.4), and P4.3/P4.4 are `NOT STARTED` with
no recorded block on this.

**Verdict: satisfied.** The entry's own resolution is correct and well evidenced.
Its only fault is structural: it also carries E2's cmake resolution as a third
bullet (§1.2).

### 1.5 E5 — 2026-09-29 | P3.3 | A03 packages and the display harness — **satisfied; the one exemplary entry**

Proved by **AM-081** (`AMENDMENTS.md:104`), the owner authorisation that cited
this entry and let the coordinator run the `pkexec` commands, and by recorded
versions after the owner's 2026-10-02 retry-now: both commands exited 0 under
`timeout 180s pkexec pacman -S --needed --noconfirm`, and the installed packages
were independently queried — `webkit2gtk-4.1 2.52.6-1`, `xdo 0.5.7-3`,
`libayatana-appindicator 0.6.0-2`, `xorg-server-xvfb 21.1.24-1`,
`xdotool 4.20260303.1-1`; `pkg-config --modversion webkit2gtk-4.1` → `2.52.6`;
`command -v Xvfb xvfb-run xdotool` → all three `/usr/bin/` paths.
`PROGRESS.json` has `P3.3: APPROVED`. The entry was carried through two timed-out
attempts (exit 124, per `NEXT-SESSION.md:167`) before the owner's retry, which is
why its resolution is dated 2026-10-02 against a 2026-09-29 entry.

The resolution also correctly rules out a **non**-action: "Rust/cargo remain
absent; A02 is the card's already-authorized agent-run step, not another owner
package action." That is the right call and worth keeping as a pattern.

Two caveats for whoever reconciles this file:

- `ACQUISITION.md` §1 row **A03** still reads "Ubuntu archive via `apt`", while
  this machine is Arch and every recorded command is `pkexec pacman`. The entry
  names the Arch equivalents, which is correct, but the ACQUISITION row and the
  queue disagree about the package manager. Not an owner action; a stale row.
- E5's "Verify with …" commands are the only verification steps in the file that
  were actually recorded as run. E2 and E3's verification steps were also run, but
  their outcomes live in evidence files, not in the queue.

---

## 2. Is any entry asking for work already done?

**Yes — two of five, and one of them is exactly the failure this file must not
have.** Stated explicitly, as asked, entry by entry:

| Entry | Installs / decisions it asks for | Verdict |
| --- | --- | --- |
| E1 P0.4 | install Ollama + pull the model tag | **Done** (AM-020; versions recorded). Its nested `systemctl enable --now ollama` sub-action: **done** (`ORCHESTRATION-LOG.md:53`), still phrased as outstanding → **asks for work already done** |
| E2 P3.1 | `pkexec pacman -S --needed cmake` | **Done** (cmake 4.4.3, `glslc` 2026.3, card stop condition corrected, `P3.1: APPROVED`) — but no resolution line under its own entry, so it reads as open |
| E3 P3.1 | `pkexec pacman -S --needed vulkan-headers` | **Done** (1:1.4.357.0-1, plus `spirv-headers`; `P3.1: APPROVED`) → **asks for work already done**, and additionally asserts a BLOCKED status that does not exist |
| E4 P4.1 | A07 `allowed-query-keys` election | **Done** (AM-042, option (a); the column is in `ACQUISITION.md` §1 A07) |
| E5 P3.3 | two `pkexec pacman` batches | **Done** 2026-10-02, five package versions recorded |

So: **no entry asks for a work item that was never authorised to exist**, and no
entry is genuinely outstanding. The failure mode is the reverse of what the queue
is for — it is a queue that has stopped saying "done", and it does so worst
exactly where a `pkexec` prompt means the owner is one password away from
repeating themselves.

**One more instance, outside this file.** `NEXT-SESSION.md:6` says S3.2's "one
open owner item is **U-1**", and `:8` lists "S3.2 U-1 scope" under "Owner gates
outstanding". U-1 was **resolved by the owner on 2026-10-02** under **AM-137**
(option (a), a documented limitation; no May-edit widening; `score.ts` untouched),
and `BLOCKED.md:23` says so correctly. `NEXT-SESSION.md`'s top block is anchored
"As of `9ada83d`", which predates AM-137 — that explains the staleness but does
not excuse it, because that block is the one a fresh session is told to read
first. `state/cards/S3.2.json` also still carries a `U-1 OPEN` flag next to a
`U-1 resolved by the owner under AM-137` flag, so the checkpoint contradicts
itself. Neither is a defect *in* `OWNER-ACTIONS.md`; both are the same defect seen
from another file, and they are the reason §4's general rule matters.

---

## 3. Owner gates missing from the queue

Four gates exist only as prose. Each is given below in **the file's own format** —
`date | card | exact steps | why it is needed | cards waiting on it` — so it can be
appended verbatim. None of these is filed today.

### 3.1 S6.1 — the licence election and its two companions

Source: `state/S6.1-AMENDMENT-PROPOSAL-v2.md` §11, which is explicit that this
package "must not be applied … until the owner package in §11 is answered", and
whose §0 item 5 states the point plainly: "Adding the Spanish word list is the one
thing this project has ever been allowed to ship under a copyleft licence, and the
owner has never said so in writing." `PROGRESS.json` has `S6.1: BLOCKED`.
`L-POLICY@1` (`ACQUISITION.md:97`) pre-approves *the case*, not the *election*, and
`S1.5 §6` says outright that only the owner can make MPL-1.1 the project's
recorded position.

Proposed rows, one per §11 item, because they are three decisions with different
consequences and a single "please answer §11" row is what a fresh session will
skip:

```
2026-10-02 | S6.1 | Licence election (RECOMMENDED: (a)). Answer §11 item 1 of `docs/v2/state/S6.1-AMENDMENT-PROPOSAL-v2.md` by recording MPL-1.1, data only, at `2.0.0`, in `docs/decisions.md` as the one appended row `L-POLICY@1` requires. Exact SPDX string `(GPL-3.0 OR LGPL-3.0 OR MPL-1.1)`; the elected arm is `MPL-1.1`, NOT "MPL-1.1-or-later". Alternatives: (b) a different arm of the triple, which needs its own `ACQUISITION.md` §3 amendment; (c) do not elect — a perfectly good outcome, in which S6.1 stops BLOCKED, V0–V4 and V8 are NOT RUN, and nothing ships and nothing breaks. Say which of (a)/(b)/(c); the coordinator files the row. | The only copyleft this project may ever ship is the Spanish word list, and `L-POLICY@1` requires the ELECTION to be stated by the owner — it authorises an agent to proceed, not to elect. `rg "MPL-1\.1|dictionary-es-mx" docs/decisions.md` returns nothing today, which is exactly why the card's Stop 1 fires. S1.5 §4 found no Mexican dictionary under a plainly permissive licence, so (a) is the only route to a Spanish speller. | S6.1 (BLOCKED, Stop 1), and through it the whole es-MX spelling surface and S6.R.
2026-10-02 | S6.1 | The four fields of the Exhibit A notice template (RECOMMENDED: (a)). Answer §11 item 2 of the same proposal: adopt the upstream Initial Developer attribution and record the two unevidenced fields — the "Portions created by …" copyright line and the "Contributor(s)" line — as `[unknown]` with the next steps §8.4 names. Alternatives: (b) resolve both fields first (a separately authorised research step, or an upstream maintainer statement); (c) decline, in which case the notice is not written at all and V4 is BLOCKED rather than passed. The proposal offers no option that ships a blank field. | The hand-written notice ships inside the app (`config.ts:198` → `routes/licenses.ts` → `web/src/routes/Licenses.tsx`, copied by `package-mac.sh:370` and `package-linux-resources.sh:301`), so an incomplete notice is a shipped artefact, and naming a person in a shipped notice is the owner's call, not a string to be supplied. | S6.1 (blocks the notice and V4 only; the card's other rows depend on item 1).
2026-10-02 | S6.1 | The May-edit widening, bundled, as ONE amendment row (RECOMMENDED: approve). Authorise the widening of `docs/v2/cards/S6.1.md`'s "May edit" from its five entries to the seventeen of §2.1 of the proposal, together with the two `e2e/playwright.config.ts` `testIgnore` conditions of §6 — and nothing else. | `COORDINATOR.md` §6 forbids the coordinator from changing any "May edit" list. Fifteen additional paths (the NFC tokenizer, the per-locale speller and lists, the new message keys, the two new e2e specs, the licence-map rows) are outside the card's current grant, so without this row the card cannot implement its own objective. | S6.1 (BLOCKED).
```

Note on item 3: it is an owner action of exactly the same kind as E5's `pkexec`
grants (AM-081) — a widening the coordinator may not take alone.

### 3.2 P5.3 — the protocol direction, and the contract clause that goes with it

Source: `state/P5.3-AMENDMENT-PROPOSAL-v2.md` Part A, which reduces the review's
five owner questions to three grouped choices, each carrying one recommendation
that keeps every existing gate. `PROGRESS.json` has `P5.3: BLOCKED`. The file is
a **proposal for the next free amendment number, AM-108 is taken** — AM-107 is the
last row at HEAD and AM-108 is now P3.4's, so the number the proposal names is
stale and the coordinator must log whatever is next free.

```
2026-10-02 | P5.3 | Protocol direction, Choice 1 — the client channel and who may start a quiesce (RECOMMENDED: A1 long-poll + report, and A2 option (iii)). Read "Part A — Three grouped owner choices" of `docs/v2/state/P5.3-AMENDMENT-PROPOSAL-v2.md`. Answer A1 (transport: long-poll + report, not SSE, not polling — SSE would need a new `shared/` event name beside `web/src/api/sse.ts`, and `EventSource` is a pattern this app does not use) and A2 (authorization of `POST /api/app/quiesce`): (iii) ungated in browser mode with maintenance released when the last window unregisters — RECOMMENDED; or (i) ungated, maintenance left on until restart; or (ii) gated on shell mode, which BLOCKs four of the card's rows because `grep -rn APUNTA_SHELL` matches no source file and P3.3 owns the predicate's creation. | A2 is a CONTRACT question: C-BRIDGE@1 rule 3 makes update endpoints shell-only, and `/api/app/quiesce` is a new app-level route with the opposite policy. Choosing without recording it leaves the route and the contract readable as contradicting each other later. The recommendation bounds the (i) hazard without moving a boundary to make a test pass. | P5.3 (BLOCKED), and through it P5.4 (the quiesce/close path) and P5.R.
2026-10-02 | P5.3 | The C-BRIDGE@1 rule 3 clause that A2 requires, whatever A2's answer. Authorise one added clause to C-BRIDGE@1 rule 3 and the mirror clause to C-UPD@1's Quiescence paragraph, recording that `/api/app/quiesce*` is a server-mode route rather than an updater endpoint, and what releases maintenance in each mode. It is to be logged as ONE amendment row with the P5.3 amendment, under the next free number. | This is a CONTRACT amendment and is reserved to the owner; the proposal states in terms that it is not the proposal's to make. C-REQ@1's request guard is NOT relaxed either way and the shell-only status of the updater routes is untouched — only this clause is added. | P5.3 (BLOCKED), P5.4, C-BRIDGE@1, C-UPD@1.
2026-10-02 | P5.3 | Protocol direction, Choices 2 and 3 (RECOMMENDED: the package as proposed). Answer "Choice 2 — what a non-empty registry does at entry, and where the unsaved-text guard lives" and "Choice 3 — the write boundary: which writes are registry jobs" of the same file. Each carries its own options and its own recommendation; nothing in either is settled by a repository fact. | Both are behaviour questions no repository fact answers: whether a non-empty registry refuses immediately or waits out the 30-second drain, where the unsaved-note-text guard lives given `NoteView.tsx`'s 400 ms debounce and best-effort `pagehide` flush, and which unassigned writes become registry jobs (`JOB_KINDS` is a closed vocabulary). The proposal proves the 30-second bound in V1 through an injected clock, in milliseconds, precisely so this choice does not depend on a timing. | P5.3 (BLOCKED), P5.4, P5.R.
```

The A2 clause is worth flagging to the owner as a **contract** change rather than a
protocol preference: `CONTRACTS.md` is in every card's Must-not-edit, so if the
A2 answer is (iii) and the clause is not added, P5.3 cannot be implemented at all.

### 3.3 S3.2 U-1 — resolved; the missing item is the *closure*, not a row

The gate existed from the v3 proposal's Part 0e through AM-113's adoption (both
recorded as owner decisions of **2026-10-02**) to **AM-137**, which resolved it as
option (a). `BLOCKED.md:23` and `S3.2.json`'s first flag both say so.

**Correction to the framing this audit was briefed with.** The record does not
support "eight days". Every step of U-1's life — the v3 repair that raised it
(AM-111), the adoption that carried it forward (AM-113), and its resolution
(AM-137) — is recorded on **2026-10-02**. U-1 was not an eight-day silence; it was
a same-day sequence whose *record* was written in three files that do not agree
with each other, two of which (`NEXT-SESSION.md:6`, `:8`; `S3.2.json`'s
`U-1 OPEN` flag) still say it is open. The lesson is sharper for being compressed
into hours rather than days: see §4.

What U-1's queue row *would* have looked like, in the file's format, filed on the
day it was first raised (2026-10-02, at AM-113):

```
2026-10-02 | S3.2 | Scope decision needed on the NFC normalisation guarantee (RECOMMENDED: (a), a documented limitation). Part 0e item **U-1** of `docs/v2/state/S3.2-AMENDMENT-PROPOSAL-v3.md`: the card's NFC guarantee is stated for **normalised note text** — `server/src/eval/lexicons/es-MX.txt` and every note the card itself authors — and NOT for model output, because normalising a note happens inside `scoreNote` (`server/src/eval/score.ts`) and May edit does not license editing it. Choose (a) name it a known limitation, with `score.ts` untouched and no May-edit widening, or (b) widen May edit to normalise in `score.ts`, which needs its own owner-approved AM row. A decomposed (NFD) model note is the case in question. | FD2c's boundary does not match a decomposed `dejó` and does match the precomposed form (measured in the proposal, finding m-2), so the guarantee's scope decides whether the card's own contract surface is honest. V1's NFC test is required under either option and runs unconditionally. Whichever is chosen, an implementer must not widen the guarantee and must report rather than choose if the scope reads ambiguously. | S3.2 (BLOCKED while open), and its own implementation dispatch.
```

**Why that row was worth having, even though the answer took hours.** Three
independent readers would otherwise have had to find U-1: it is one item in
Part 0e of a 1 900-line proposal; it is one sentence in AM-113's tail; and it is
one flag among seven in a checkpoint. The row above makes the gate *findable*
(`grep -i "owner" state/OWNER-ACTIONS.md`), *dated*, and *closable* — and closing
it is exactly what still has not happened everywhere else, which is why
`NEXT-SESSION.md` and `S3.2.json` still call it open. A gate with a row gets a
closure line; a gate without one gets a stale flag.

### 3.4 S4a.2 — owner-parked, and nothing says a person is holding it

`BLOCKED.md:24` states the problem in one line: "**S4a.2** is owner-parked while
being dependency-clear, so a tool reading only `PROGRESS.json` would treat it as
dispatchable. The plan has **no vocabulary word for 'parked by the owner'** — that
gap is put to the owner." `PROGRESS.json` has `S4a.2: NOT STARTED`; its
dependencies `S4a.1` and `P4.1` are both `APPROVED`; its own amendment was
approved in full on 2026-09-29 (AM-082). `ORCHESTRATION-LOG.md:1829` and
`NEXT-SESSION.md:217` record the owner's words: parked, "I'll tell you when".

```
2026-10-02 | S4a.2 | Nothing to do — this row exists so a person is recorded as holding it. S4a.2 is parked BY THE OWNER ("I'll tell you when", 2026-09-29) even though it is dependency-clear: `S4a.1` and `P4.1` are both APPROVED and AM-082 approved its amendment in full. The one action is the owner's own unblocking word; until then S4a.2 is NOT STARTED and must not be dispatched. | `PROGRESS.json` says `NOT STARTED` and there is no status word for "parked by the owner", so every automated dispatchability check — `DEPENDENCIES.md` order plus `PROGRESS.json` — selects S4a.2 as the next runnable card. Nothing in the structured state files records that a person, not a dependency, is the reason. | S4a.2 (and S4a.R, which depends on it).
```

This is the one proposed row that asks for no work at all, and that is the point:
its value is that it converts an absence into a record. It also asks the owner a
real question — whether to add a `PARKED` vocabulary word to the plan — which
`BLOCKED.md:24` already flags as needing an owner answer.

### 3.5 Anything else open?

Checked and **not** filed as owner actions, with reasons:

- **`hipcc` absent.** Genuinely absent, deliberately: P3.1's fixed decisions choose
  the `vulkan` backend because `hipcc` is missing, and the card now builds and is
  APPROVED. Not an owner action unless someone wants the `hip` backend.
- **Rust/cargo absent.** `ACQUISITION.md` A02 is an agent-run step; E5's
  resolution says so explicitly. Correctly not an owner action.
- **The Playwright browser-build mismatch** (`chromium_headless_shell-1234` vs
  installed 1243, `ORCHESTRATION-LOG.md` P3.1 section) is bypassed by
  `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium`, a RUN-CONFIG escape hatch
  already in the repo. Environment fact, not an owner gate.
- **A03's `apt`-vs-`pacman` mismatch** (§1.5). A stale `ACQUISITION.md` row, not
  an owner action.
- **`BLOCKED.md`'s 14 rows naming APPROVED cards** — already the subject of
  `state/reviews/state-reconciliation-audit.md`, and `NEXT-SESSION.md` warns not to
  trust that file. Not duplicated here.
- **P3.4 at 3/3 BLOCKED** (AM-138) and **P3.5 CLEAR but held** (AM-141). Both are
  recorded coordinator state with resolutions, not owner gates. P3.5's hold is
  "not before P3.4's hook exists" — a dependency the owner did not set, so it is
  the coordinator's queue, not a person.

---

## 4. S3.2's U-1 as a worked example, and the general rule it argues for

**The general rule: every gate that only a person can open gets a row in
`OWNER-ACTIONS.md` on the day it is raised, and a closure line on the day it is
answered — the same row, never a new one.**

U-1 is the proof, and it is worth being precise about why, because the usual
defence of a prose-only gate is "it is in the amendment row, that is enough". It
is not enough, for four reasons visible in this file alone:

1. **A gate buried in a 1 900-line proposal is not findable.** U-1 was one item in
   Part 0e of `S3.2-AMENDMENT-PROPOSAL-v3.md`, one clause in AM-113's tail, and
   one flag among seven in `S3.2.json`. Three files, three shapes, no index. The
   row in §3.3 puts it behind one `grep`.
2. **A gate recorded in an `AMENDMENTS.md` row is recorded as prose, and prose
   cannot be marked done.** AM-113 carries U-1 as "deliberately left open"; there
   is no field to flip. So the resolution had to become *another* row (AM-137),
   and the original "open" text is still in the file — which is why the flag in
   `S3.2.json` and the sentence in `NEXT-SESSION.md` still say U-1 is open, hours
   after it was answered. A status column would have made that impossible.
3. **A gate with no row has no closure discipline, so it decays.** Every one of the
   five entries in this file is closed; not one is marked closed at the point it
   was closed. E1's nested sub-action cannot be closed at all. The queue's
   closure rate is 0 % not because the owner is slow but because the format has no
   way to record a closure.
4. **It makes the cost of the error visible and bounded.** Under the rule, U-1's
   row would have been opened 2026-10-02 and closed 2026-10-02, in one file, with
   two lines. Instead it survives in three files, and a reader of `NEXT-SESSION.md`
   would conclude S3.2 is waiting on the owner when it has been dispatched
   (AM-139, attempt 1, `IN PROGRESS`).

**The rule is one sentence and it is cheap:** *if a coordinator cannot close it,
a person must open it, so it belongs in the queue on the day it is raised — and
the queue is the only file whose entire purpose is to be complete.*

---

## 5. Format proposal

**Propose a table with an explicit `Status` column** for the index, and keep the
prose entry body. Concretely: replace the undifferentiated run of pipe-separated
prose lines with a summary table carrying `ID | Date | Card | Action (one line) |
Status | Resolved (date + evidence) | Waiting on`, where `Status` is one of
`OUTSTANDING` / `DONE` / `WITHDRAWN`, followed by the existing five-field prose
entry for each row — one block per ID, in the file's own format, unchanged. The
table is what a fresh session reads; the prose is what it executes.

**What must stay prose, and why.** The *steps* field cannot be a table cell. A
row like `` `pkexec pacman -S --needed webkit2gtk-4.1 xdo libayatana-appindicator` ``
has to survive being read aloud at a graphical prompt, copied character-exact,
and pasted into a terminal — inline code in a wide table cell wraps mid-argument
and drops `--needed`. The same is true of E5's "if a build later fails on a
missing `.pc`, report the exact `pkg-config` error rather than installing more",
E2's and E3's `pkexec` invocations with their distinct verification commands, and
the "why" fields, which are two to five sentences of evidence an auditor needs to
read in full. So: **table for state, prose for instructions** — the table's
`Action` cell gets a short imperative label, never the command.

**What must be hand-maintained either way.** The `Status` values, the
`Resolved` date and its evidence pointer, and the `Waiting on` list. None is
derivable, because none is a fact about a card: a decision's *existence* is in
`AMENDMENTS.md`, but whether the owner has *answered* it, and on what date, and
under which evidence file, exist only in a human-readable row. The moment
`Resolved` is hand-written it can be wrong, and it *is* wrong today five times
out of five.

**What can be derived from `PROGRESS.json`, and what cannot.** Derivable, with
no hand-maintenance: (a) **whether the named card is still waiting** — the
`Waiting on` column's card statuses are `PROGRESS.json` card keys, so
`P3.1: APPROVED` is enough to contradict "P3.1 (BLOCKED)" mechanically, which is
exactly the E3 error; (b) **which cards are eligible to be waiting at all** — the
downstream tail of E3 can be checked against `PROGRESS.json` rather than trusted;
(c) a **staleness alarm** — any row whose card is `APPROVED` and whose `Status` is
`OUTSTANDING` is flagged automatically. Not derivable: **whether the action itself
was done.** `PROGRESS.json` is about cards, not about the owner's machine; nothing
in it says `cmake 4.4.3` is at `/usr/bin/cmake`, that
`vulkan-headers 1:1.4.357.0-1` is installed, that `systemctl enable` ran, or that
the A07 election was made. That is why `Status` is a hand-written field with a
hand-written `Resolved` date **and a named evidence file** — the evidence pointer
is what makes the hand-maintained field checkable, and its absence is why E1's
sub-action became unclosable.

**One further change, and it is the one that would have caught every error above.**
Split a nested sub-action out of its parent's `RESOLVED` line into its own row.
E1 is the worked example: `sudo systemctl enable --now ollama` was a real owner
task, it was done, and it lives inside a `→ **RESOLVED**` paragraph where no
reader will look for outstanding work and no rule can close it. If every distinct
owner action is exactly one row, then "how many owner actions are outstanding" is
a count, and the file's first line can say `Outstanding: 2 of 9`.

---

## 6. What this audit did not do

No file under `docs/v2/` was edited; every path was read with `git show HEAD:<path>`
at `c17bc8a` while S3.2 holds the build lease and `cards/P3.6.md` is under repair.
No build, test, eval, cargo, tauri or launching command was run. No package was
queried to re-verify a version — the versions above are quoted from
`AMENDMENTS.md`, `ORCHESTRATION-LOG.md`, `docs/v2/evidence/P3.1/` and the entry's
own resolution lines, and each citation is given so a reader can re-check it. This
file is the only output.