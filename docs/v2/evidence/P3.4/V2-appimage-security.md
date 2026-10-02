# P3.4 — V2, the AppImage security row

- Working directory: repository root
- Start: 2026-10-02T23:38:00Z
- End: 2026-10-02T23:39:41Z (101 s)
- Exit code: **1**
- Status: **FAIL** — 13 PASS, 2 FAIL, 2 NOT RUN
- Sandbox run: `<sandbox>/2026-10-02T23-38-00-485Z-b72ab858` (data dir
  `<sandbox>/2026-10-02T23-38-00-485Z-b72ab858/data`), pinned port **7835**
- No patient content, no note body and no transcript appears in this file.

Three earlier V2 runs on the same AppImage preceded this recorded one, at
`<sandbox>/2026-10-02T23-09-25-372Z-7099e32b`, `…23-11-43-686Z-078bd8cc`,
`…23-14-44-140Z-b6a7bbc6` and `…23-18-12-989Z-74194898`. All four used port 7835
and every one stopped the AppImage **by pid**. The last run is the one recorded
below because it ran on the final bytes of the harness; the first of the four is
where the channel defect below was found.

## Exact command

```
export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" && node --version && node scripts/v2/sandbox.mjs env --port 7835 > /tmp/apunta-v2-p3.4-v2.env && . /tmp/apunta-v2-p3.4-v2.env && node scripts/v2/tauri-security.test.mjs security
```

`node --version` printed `v24.19.0`. `sandbox.mjs env` was used, never
`sandbox.mjs run`.

## The two answers this row exists to produce

### 1. Did the marker arrive on the AppImage child's stderr, and with what prefix?

**Yes.** Every forwarded line carries the pre-existing rule-2 prefix, unchanged:

```
apunta: ignoring a bridge line (Unreadable): {"level":30,"time":…,"req":{"method":"GET","url":"/api/p3.4-observe?href=http%3A%2F%2F127.0.0.1%3A7835%2F&title=Patients+%C2%B7+Apunta&tauri=undefined&tauriInternals=object&probe=undefined&scriptText=false&styleAttr=color-scheme%3A+dark%3B+--accent%3A+%232a9d8f%3B&styleComputed=dark&attempt=", …}
```

The prefix is **not** a defect and the harness never needed to accommodate it:
`readObservations` matches `MARKER_PATH` anywhere in a line, so the prefix was
already transparent to it. **P3.8's forwarding works** — exactly one `ready`, one
`show_main`, and marker lines after them.

**The channel did not work in attempt 3 for a different reason, and this attempt
found it.** `waitForFact`, `lastFactWhere`, `rectForLabel`, `rectSignature` and
`clickAndWaitForChange` all took the child's stderr as a **string**, and every
call site passed `run.output.stderr` — evaluated **once**, at the call. A poll
loop over an immutable snapshot can only ever re-find what was already in the
buffer at the moment it was taken, so every fact the page published *after* the
first read was invisible. The signature of that defect is what attempt 3
recorded and this attempt reproduced exactly: a run whose channel worked
reporting *"no `/api/p3.4-observe` line ever appeared … (**6 marker line(s)
read**)"* — the count read from the live buffer at failure time, contradicting
the sentence beside it.

Repaired in `scripts/v2/tauri-security.test.mjs` (in May edit) by making the
readers resolve their source through one `stderrAt()` and passing
`() => run.output.stderr` at the seven polling call sites. **No assertion, no
predicate, no pass condition and no timeout was changed** — the repair makes the
polls poll. This is the opposite of HS-7: it makes the instrument able to fail,
where before it could only ever time out.

### 2. Was the CSP header observed on a real HTML response, and with which directives?

**Yes — over the app's own origin, on the SPA fallback the webview actually
renders.** The harness now prints the header **as it is really sent**, on a pass
as well as on a failure, because `check()` only surfaces its detail on a failure
and this row's whole claim is about the directives that are really there:

```
  observed GET /patients: status 200, content-type "text/html; charset=utf-8", content-security-policy "default-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; style-src 'self' 'nonce-ouLbmpdWNqMRvokcFczXnQ=='; style-src-attr 'unsafe-inline'"
```

| Directive | Required by | Observed |
| --- | --- | --- |
| `default-src 'self'` | rule 6 | present, verbatim |
| `script-src 'self'` | rule 6 | present, verbatim |
| `connect-src 'self'` | rule 6 | present, verbatim |
| `object-src 'none'` | rule 6 | present, verbatim |
| `base-uri 'none'` | rule 6 | present, verbatim |
| `frame-ancestors 'none'` | rule 6 | present, verbatim |
| `style-src 'self' 'nonce-<n>'` | card's nonce decision | present, verbatim |
| `style-src-attr 'unsafe-inline'` | AM-114 | present, verbatim |
| any extra source in any of the six | none permitted without a failing test | **none** |

Nothing is dropped, replaced or weakened, and **no source was added to any of
rule 6's six**. `'unsafe-inline'` appears in `style-src-attr` and nowhere else.

**The nonce is genuinely per response, not a fixed string.** Three separate V2
runs produced three different nonces from the same binary:

| Run | nonce |
| --- | --- |
| `23-14-44` | `nonce-m1w6feOg1MgDKn+fZdNHYw==` |
| `23-18-12` | `nonce-w2p4mqpVPsb9UvJ3JAHzLA==` |
| `23-38-00` | `nonce-ouLbmpdWNqMRvokcFczXnQ==` |

## Full result

| # | Assertion | Status |
| --- | --- | --- |
| 1 | V2 appimage: `<sandbox>`…/Apunta (test)_0.0.0_amd64.AppImage | **PASS** |
| 2 | the AppImage is newer than every Rule B input | **PASS** |
| 3 | no Rule B path named by git is newer than the AppImage | **PASS** |
| 4 | the app's own window is up | **PASS** |
| 5 | the server answers with this run id | **PASS** |
| 6 | (d) header: the SPA fallback HTML carries rule 6's six directives | **PASS** |
| 7 | (d) handler: the fixture note is created over HTTP | **PASS** |
| 8 | (a) `__TAURI__` and `__TAURI_INTERNALS__` are undefined | **FAIL** |
| 9 | (d) handler: the "John Smith" row was clicked and landed | **FAIL** |
| 10 | (e) an inline style attribute is applied in the shipped binary | **PASS** |
| 11 | (b) navigation to the reserved `.invalid` origin is refused | **NOT RUN** |
| 12 | (c) `window.open` is cancelled | **NOT RUN** |
| 13 | containment: no server process from the run survives | **PASS** |
| 14 | containment: no second lock, database, `-wal` or `-shm` | **PASS** |
| 15 | containment: the sandbox port is free afterwards | **PASS** |
| 16 | containment: the observation channel is gone and cannot ship | **PASS** |
| 17 | containment: `ollama` is still running | **PASS** |

13 PASS, 2 FAIL, 2 NOT RUN. Exit 1, which is the harness's deliberate behaviour:
a `NOT RUN` is not a green row, and nothing here was relaxed to change that.

### (e) PASSED — the runtime half, in the shipped binary

The page published `styleAttr=color-scheme: dark; --accent: #2a9d8f; …` and
`styleComputed=dark`. The declared property resolves to a real computed value
rather than `auto` or empty, so **a style attribute on app HTML actually applies
under the header this card emits**. That is `style-src-attr 'unsafe-inline'`
proved effective rather than a header string nobody checked, and it is what
rules out the silent regression the card describes: no absolutely-positioned
overlay is being blocked.

### (a) FAILED — with the observed value, not a relaxed row

```
FAIL (a) window.__TAURI__ and window.__TAURI_INTERNALS__ are undefined: the page reported tauri="undefined" and tauriInternals="object"
```

`window.__TAURI__` is `undefined` — `withGlobalTauri: false` holds.
`window.__TAURI_INTERNALS__` is an **object**. Recorded as a `FAIL` with the
observed value; not adjusted, not reinterpreted, not weakened.

This is very likely a **card defect rather than a tree defect**, and the reason
is worth a reviewer's attention: Tauri v2 initialises its IPC bridge in every
webview, so `__TAURI_INTERNALS__` is injected regardless of configuration, and
`withGlobalTauri: false` governs `__TAURI__` alone. C-BRIDGE@1 rule 4 forbids IPC
*reachable from web content*, and `"capabilities": []` (asserted by V3) is what
makes it unreachable; the presence of the internals object is not itself a rule-4
breach. The card's (a) as written demands something the stack does not provide.
Deciding that is a coordinator call, not an implementer's — and per the card it
is not mine to substitute a config-level reading for.

### (d)'s handler half, (b) and (c) — the click that does not land

```
FAIL (d) handler: the "John Smith" row was clicked and landed: the click on "John Smith" at 99,284 changed neither the published rectangles nor the published facts within 30000ms, so it did not land
```

The rectangle **exists and is correct** — the hook published a rect labelled
`John Smith` at 99,284 — and the harness clicked it at its centre with the
card's own `xdotool mousemove --sync --window <id> <x> <y> click 1`. Nothing in
the page changed within 30 s. Per the card, a click that does not land **fails**
the row; it does not pass quietly.

One real cause was found and fixed on the way: in attempt 3 the app was still on
its **onboarding** screen at `…/onboarding/format`, where no patient row exists,
so there was nothing to click at all. A fresh sandbox data folder has no note
format, so the app's first paint lands on onboarding. The harness now creates the
fixture note **before** the observation gate and issues one `ctrl+r` to the app
window, so the page renders the workspace (`href=…/`, `title=Patients · Apunta`,
rects for `Write a note`, `New patient`, `John Smith`, `Recents`, `Pinned`,
`View all`). That is a real fix and it is why the click is now attempted at a
label that exists. The three HTTP calls are the card's own order and its own
precedent; only **when** they are made changed, and no pass condition changed.

A second hypothesis — no input focus, because `xvfb-run -a` starts a bare X
server with **no window manager** — was tested by adding
`xdotool windowfocus --sync` before the click. It changed nothing, so it was
**reverted** rather than left in as an unexplained change. The cause of the
un-landed click is therefore **not established**, and (b) and (c) are `NOT RUN`
behind it rather than `PASS`: the hook actuates (b) and (c) only once
`scriptText` has read true on two consecutive polls, which needs the note open.

**The click failing is the row's own guard firing.** It is not to be worked
around by widening the 30 s timeout, by accepting the assertion the click
enables as the proof it landed, or by clicking until something changes.

## Containment — all five, none weakened

| Assertion | Result |
| --- | --- |
| no process from the run remains | PASS — shell stopped **by pid** with SIGTERM, never `pkill` |
| no second `apunta.lock`, `apunta.db`, `-wal` or `-shm` in the run folder | PASS |
| port 7835 free afterwards | PASS |
| channel gone when the row ends and impossible in a shipped bundle | PASS — no new marker line on the second read after the stop, and **0** occurrences of `p3.4-observe` and of `VITE_APUNTA_TEST_IDENTITY` in `web/dist/assets/*.js` |
| `ollama` still running | PASS |

The live data folder was never opened, never listed and never queried; port 7717
was never contacted; no fixture is anything but synthetic (HS-8).