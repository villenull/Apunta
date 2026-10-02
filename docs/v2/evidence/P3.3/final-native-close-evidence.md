# P3.3 attempt 2 — final native-close evidence, reproduced twice

Independent verification pass (this document is the evidence;
`docs/v2/state/reviews/P3.3-evidence-final.md` is the report). **Verification
only.** No application file, harness, card, contract, threshold, guard or
committed state was edited; nothing was committed. Scratch is entirely inside
the git-ignored `build/p33-final/`.

- Source under test: **`d35c4b6`** (unchanged). HEAD `4e64d05` is
  `docs/v2/**` documentation only — `git diff d35c4b6..4e64d05 --name-only`
  touches no `src-tauri/`, `server/`, `shared/`, `scripts/` or threshold.
- Binary under test: the **already-rebuilt** test AppImage from V2, not rebuilt
  here, `sha256 f3e6c2d0…8ac64f`, 177,515,000 B.
- Runtime lease: this session only. Port **7831** through
  `scripts/v2/sandbox.mjs env --port 7831` with the test identity, one fresh
  sandbox folder per run. **7717 never contacted** (free before and after). No
  live data, no Claude export, no Halaxy PDF, no forbidden script. Nothing
  downloaded or installed; no build; no delegate.

## Files owned by this evidence

| File | What it is | sha256 |
| --- | --- | --- |
| `final-native-close-send-delete.py` | the close sender (verification-only, ships nowhere, imported by nothing) | `f7a91878c205…b448` |
| `final-native-close-run.sh` | the bounded one-launch runner with the isolation preflight | `49d2baa0cffd…9c617` |
| this file | the record | — |

## The helper, and why it is not the previous one

The previous review's sender (`build/p33-review2/wm-delete2.py`, read before
reuse) **does not read `WM_PROTOCOLS` at all** — it interns the atoms and sends
unconditionally, and its own output line `WM_DELETE_WINDOW atom = 233;
advertised = True` came from a different script in the same directory. So the
advertisement was not asserted by the thing that sent the message.

`final-native-close-send-delete.py` is my own, and it refuses to send anything
the window has not advertised. Through `libX11.so.6` only, and with every atom
**interned by name** (ICCCM atoms are not predefined — hard-coded 33/39 produced
the previous review's false negative):

1. reads `_NET_WM_NAME` (falling back to `WM_NAME`) and requires the **exact**
   string `Apunta`;
2. reads `_NET_WM_PID` and requires it to equal the pid this run launched;
3. reads `WM_PROTOCOLS` and requires `WM_DELETE_WINDOW` among the atoms —
   otherwise exit 5 without sending;
4. only then sends `ClientMessage{type=33, message_type=WM_PROTOCOLS,
   format=32, data.l[0]=WM_DELETE_WINDOW, data.l[1]=CurrentTime}`,
   `propagate=False`, empty event mask, and calls `XSync` before exiting.

No forged event beyond the ICCCM message a real window manager sends, no test
hook, no application code path invoked directly, and no `xdotool`.

## Isolation preflight — asserted before every launch

`final-native-close-run.sh` refuses to launch anything unless **all** of these
hold, and repeats the first four after the launch by reading
`/proc/<pid>/environ` of the process it started (proof, not intention):

| Assertion | Result on all three runs |
| --- | --- |
| `WAYLAND_DISPLAY` absent from the environment | yes (0 occurrences in the child's own environ) |
| `GDK_BACKEND=x11` | yes (read back from the child's environ) |
| `XDG_BACKEND=x11` | yes (read back from the child's environ) |
| `DISPLAY` is **my own** `Xvfb :71` (socket present, a live Xvfb process serving `:71`, and `:0` refused outright) | yes — `DISPLAY=:71`, 1 occurrence |
| sandbox environment: port 7831, `APUNTA_DATA_DIR`, `APUNTA_TEST_RUN_ID`, never 7717 | yes |

The runner has **no owner-display fallback**: a failed preflight exits 1 before
anything starts. Window geometry was 1330×950 at 36,26 on a 1400×1000
display — inside the private Xvfb, never the owner's 3440×1440 session.

## The three runs

Exact command, repeated with a fresh sandbox each time (only the tag and the
sandbox folder differ):

```
export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH"
Xvfb :71 -screen 0 1400x1000x24 -nolisten tcp &
eval "$(node scripts/v2/sandbox.mjs env --port 7831)"
bash docs/v2/evidence/P3.3/final-native-close-run.sh \
  "$PWD/src-tauri/target/release/bundle/appimage/Apunta (test)_0.0.0_amd64.AppImage" \
  <tag> 71 "$PWD/build/p33-final"
```

| | run 1 | run 2 | run 3 |
| --- | --- | --- | --- |
| tag / started | `fnc-run1`, 2026-10-02T07:50Z | `fnc-run2`, 07:51Z | `fnc-run3`, 07:51Z |
| runner exit | **0** | **0** | **0** |
| helper exit | 0 | 0 | 0 |
| window name / `_NET_WM_PID` | `Apunta` / own shell pid | same | same |
| `WM_DELETE_WINDOW` advertised (read by the sender) | yes (atom 233) | yes | yes |
| `XSendEvent` | 1 | 1 | 1 |
| **shell exited on its own** | **yes, 202 ms** | **yes, 202 ms** | **yes, 202 ms** |
| signal sent by the runner | none | none | none |
| inside the card's 10 s `SHUTDOWN_GRACE_MS` | yes | yes | yes |
| port 7831 free afterwards | yes | yes | yes |
| server processes of this run afterwards | 0 | 0 | 0 |
| `apunta.lock` | absent | absent | absent |
| unrelated dummy alive | yes | yes | yes |
| Ollama `/api/version` before → after | 200 → 200 | 200 → 200 | 200 → 200 |
| AppImage FUSE mounts left | 0 | 0 | 0 |
| app's own log line | `the window close is closing the app; starting the quit ladder` | same | same |

Counts exactly as recorded: **3 runs, 3 helper sends, 3 acted-on cooperative
closes, 0 not-acted-on, 0 runner escalations, 0 retries, 0 timeouts.** No
timeout was tuned and no attempt was retried; the three runs are the whole
record.

Each run also captured the real rendered home screen
(`build/p33-final/<tag>.home.png`, 701 distinct colours) and the served document
at the window origin (1265 bytes, the app root). I read the pixels myself in run
1: the teal **Apunta** wordmark, the two-step progress rail with step 1 filled,
"Add your note format", the subtitle, and the four option cards with
"My standard progress note" carrying the teal **Recommended** chip. A real
rendered application page, no splash, no error page, no private data (a fresh
synthetic sandbox folder with no patients). The three PNGs are byte-identical
(`0596a86b…1e6071`), which is also a determinism check.

Raw records, all under `build/p33-final/` (git-ignored):

| Artifact | sha256 |
| --- | --- |
| `fnc-run1.log` | `cc9947b2…aa72d2` |
| `fnc-run2.log` | `84404f13…7c09ad` |
| `fnc-run3.log` | `16739d19…05ab2f5` |
| `fnc-run1/2/3.send.log` | `9407d17e…d91f5c8` · `d9339e73…49b5e5` · `5ac2de95…f5fd` |
| `fnc-run1/2/3.app.log` | `b439bde6…98a3e` · `164aa2fe…41eb003` · `14b7982e…462833` |
| `fnc-run1/2/3.home.png` | `0596a86b…1e6071` (all three identical) |

## Scoped correction of the previous pass's counts

`review2-native-close.md` cannot be reconciled with the raw records it left
behind, so its counts are corrected here rather than repeated. Read-only from
`build/p33-review2/`:

| Raw record | Display | Was anything delivered? | Outcome |
| --- | --- | --- | --- |
| `nc.log` | inherited session | no — GTK init failed, `SIGABRT` | — |
| `persist.log` | **owner's, 3440×1440** | no — ended by a termination signal | — |
| `nd.log`, `nc2.log` | `:99` | no — no window ever appeared | — |
| `nc3.log`, `nc4.log`, `nc5.log` | `:99` | no — the helper crashed (`NameError`, two `ArgumentError`s) | — |
| `nc6.log` | `:99` | no — the helper refused to send (`advertised = False`, the atom-constant bug) | — |
| `nc7.log`, `nc8.log` | `:99` | **yes** (`XFlush` helper, `XSendEvent` → 1) | not acted on within 20 s |
| `nc9.log` | `:96` | **yes** (`XFlush` helper) | not acted on within 20 s |
| `persist2.log` | isolated 1400×1000 | yes | acted on (close ladder logged) |
| `r1.log`, `r2.log` | not recorded | yes | acted on (close ladder logged) |
| `nc10.log` | `:96` | yes (`XSync` helper) | acted on, ~300 ms |

What the records support, exactly:

- **7 deliveries** reached a live Apunta window: `nc7`, `nc8`, `nc9` (not acted
  on) and `persist2`, `r1`, `r2`, `nc10` (acted on). **5 launches sent nothing
  at all** (`nc.log`, `nd.log`, `nc2`–`nc6`).
- Of the deliveries, the three acted-on ones are the three whose app log
  contains the close line; `r1` and `r2` record **no display and no helper
  invocation**, so attributing them to a particular `send_event` value or to
  `XSync` is **not supported** by the records.
- `XFlush` before exit: **0 of 3** acted on. `XSync` before exit: **1 of 1**
  (mine are now 3 of 3). The "six deliveries, three acted on … with `XSync` it
  was 3/3" sentence in the previous report is therefore **not** what its own
  table or its own raw files show: the table lists 8 rows that mix in five
  non-deliveries, and the "3/3" has one supporting record, not three.
- **Cause of the variance remains unknown.** `XSync` versus `XFlush` is
  consistent with the data but not established by it, and I did not chase it.
  What is established by this pass: with a sender that refuses to send to a
  window which does not advertise the protocol, and that syncs before exiting,
  the close was delivered and acted on **every time (3/3)**, with no retry and
  no timeout change.

`review2-native-close.md` and `review2-rows.md` are left **verbatim**; this is a
scoped correction, not a rewrite.

## Narrowing the old "impossible on this host" claim

The previous wording — `CloseRequested` "cannot be reached from outside on this
host" — is true of the **route that was used** and false of the host:
`xdotool windowquit` sends `_NET_CLOSE_WINDOW` to the **root** window, which
needs a window manager to route it, and this display has none (the harness's own
`window-close` mode still records `NOT RUN` for exactly that reason, which is
correct). An ICCCM `WM_DELETE_WINDOW` sent straight to the window does not need
a window manager, and reaches the app. No conclusion of this pass depends on the
generalised sentence.

## The historical isolation incident, recorded as a failure

`review2-closures-and-scope.md` says its containment was clean and, in the same
document, that **two** of that reviewer's early manual launches inherited
`WAYLAND_DISPLAY`/`XDG_BACKEND=wayland` from the desktop session and briefly put
an Apunta window on the owner's compositor. Those two statements cannot both
stand as written. Recorded truthfully:

- it is a **real historical failure of isolation** in that reviewer's scratch,
  not a clean history; the report's containment paragraph is corrected here;
- the raw records support **one** such launch with evidence, not two:
  `build/p33-review2/persist.log` reports the window opening on a **3440×1440**
  display — the owner's session geometry — while every isolated run in that
  directory reports 1400×1000. The second launch has **no surviving record**, so
  its count is **unknown**;
- there is **no evidence that live data was accessed**: the data folders
  involved are `/tmp/apunta-v2/…` sandbox folders, the ports were 7831, and
  7717 was never contacted (free before and after in that pass's records and in
  mine);
- whether owner **focus** was taken by those windows is **unknown**, and I do not
  assert otherwise;
- **this pass repeats none of it.** Every launch above passed the preflight, and
  the child's own `/proc/<pid>/environ` is recorded with `WAYLAND_DISPLAY`
  absent.

## Containment of this pass

- Ports 7831 free before and after every run; **7717 never contacted** and free.
- No Apunta process, no bundled server process and no AppImage FUSE mount left;
  my `Xvfb :71` stopped; no lock file in any sandbox folder this pass created
  (the one lock present under `/tmp/apunta-v2` predates this session).
- Ollama `/api/version` 200 before and after each run; no model pulled, touched
  or listed; `APUNTA_ALLOW_FOCUS_TEST` never set; no host setting changed; no
  focus permission asked for.
- Signals: only to pids this pass started. One diagnostic detour (below) left an
  orphan of my own which I found and killed; it is disclosed rather than hidden.
- `git status`: only the two new evidence files and the report. No commit.

## Honest limitations

1. **Three runs of one route.** The direct ICCCM send is now shown reliable for
   this sender (3/3), not proven reliable in general; the previous pass's
   variance is unexplained and I did not explain it.
2. **No window manager**, by design. This says nothing about behaviour under a
   real desktop compositor, which is the owner's environment.
3. **The evidence does not amend any card row.** It is supplemental.
4. **A diagnostic detour cost time and left a residue I had to clean:**
   my very first attempt failed inside the helper (a bug in my own atom lookup)
   and the runner's cleanup did not yet exist, so that attempt's `SIGKILL` of
   the AppImage wrapper left the real binary inside the mount alive and
   un-logged; two later launches then exited silently because of it. I found it
   (`ps` showed an `apunta` process with no wrapper), killed only my own pid,
   confirmed the display was empty, added a process-group cleanup trap to the
   runner and re-ran from a clean state. The three recorded runs are all after
   that fix; the failed attempts are excluded from the counts above and are
   named here rather than quietly dropped.
5. Screenshots are of a **synthetic** sandbox folder. No private data, no owner
   screen, nothing from a live instance.