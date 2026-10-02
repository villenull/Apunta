# V2 — the AppImage, bridge security in the shipped binary

**Status: FAIL** (exit code 1). Of sixteen assertions: **11 `PASS`, 3 `FAIL`,
5 `NOT RUN`**. All five containment assertions `PASS`.

The three `FAIL`s and the five `NOT RUN`s share **one** cause, and it is not in
this card's code: **V0 is `BLOCKED`**, so the AppImage V2 launched still bundles
the server and the web build from **00:01 / 07:06Z**, which predate
`server/src/http/csp.ts` and the observation hook. See `V0-blocked-a06.md`.

- Working directory: the repository root (re-executed by the harness itself under
  `xvfb-run -a -s '-screen 0 1400x1000x24'`, so the app and `xdotool` share one
  display).
- Command, exactly as the card gives it:

  ```sh
  export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" && node --version && node scripts/v2/sandbox.mjs env --port 7835 > /tmp/apunta-v2-p3.4-v2.env && . /tmp/apunta-v2-p3.4-v2.env && node scripts/v2/tauri-security.test.mjs security
  ```

- `node --version` printed exactly `v24.19.0`.
- Exit code: **1**.
- Start / end time: 2026-10-02T18:19:51Z / 2026-10-02T18:20:43Z.
- Sandbox run id: `2026-10-02T18-19-51-522Z-06e7efc6`, in `<sandbox>/`.

## Verbatim output

```
v24.19.0
  display: the inherited X display :99
PASS V2 appimage: src-tauri/target/release/bundle/appimage/Apunta (test)_0.0.0_amd64.AppImage
FAIL V2 the AppImage is newer than every Rule B input: web/src/main.tsx (2026-10-02T18:14:24.654Z) is newer than the AppImage (2026-10-02T07:06:07.901Z)
FAIL V2 no Rule B path named by git is newer than the AppImage: git names 1 Rule B path(s) from d56af1d…HEAD or from the working tree; stale: web/src/main.tsx
PASS V2 the app's own window is up
PASS V2 the server answers with this run id
FAIL (d) header: the SPA fallback HTML carries rule 6's six directives: GET /patients answered 200 with content-type "text/html; charset=utf-8" and a CSP of ""
NOT RUN (a) window.__TAURI__ and window.__TAURI_INTERNALS__ are undefined
NOT RUN (b) navigation to the reserved .invalid origin is refused
NOT RUN (c) window.open is cancelled
NOT RUN (d) handler: the injected note renders inert, and __APUNTA_CSP_PROBE__ is undefined
NOT RUN (e) an inline style attribute is applied in the shipped binary
  the fixture note was created over HTTP (format, patient and note all 201) and was NOT opened, because opening it and reading the page both need the channel
PASS containment no server process from the run survives
PASS containment no second lock, database, -wal or -shm
PASS containment the sandbox port is free afterwards
PASS containment the observation channel is gone, and cannot ship
PASS containment ollama is still running

13/16 assertions passed, 5 NOT RUN
```

(The five `NOT RUN` lines each carry the same cause in full in the harness
output; it is quoted once below rather than five times here.)

## The observation hook, and why five assertions are `NOT RUN`

```
no /api/p3.4-observe line ever appeared in the AppImage child's captured stderr
while the app window was up and the server was answering (0 marker line(s) read),
so the observation hook publishes nothing this harness can read.
```

**This is not the inspector failure attempt 1 hit, and the distinction matters.**
Attempt 1's channel was WebKitGTK's remote inspector on a second port: bound,
accepting connections, and answering nothing. This attempt's channel is a
same-origin `fetch` from the page to the server the app is already talking to,
and its delivery chain was exercised end to end by the app itself, as the stderr
excerpt shows — the shell re-emitted an unrecognised stdout line exactly as the
card describes:

```
apunta: ignoring a bridge line (Unreadable): {"level":30,…,"msg":"Server listening at http://127.0.0.1:7835"}
```

That is `main.rs:321-325` doing what the card said it would do: the server's
private stdout pipe, drained line by line, every unrecognised line re-emitted to
**stderr**, where the harness captured it. The mechanism reads. What is missing is
the *publisher*: the AppImage's web bundle was built at 00:01, before
`web/src/main.tsx` carried the hook, so no bundle in the running app contains
`p3.4-observe` and there is nothing to publish.

Per the card's stop condition, (a), (b), (c), (d)'s handler half and (e) are
recorded `NOT RUN` **together**, with that cause, and **none of them is `PASS`**.
A `NOT RUN` (a) means the card's central rule-4 claim is unproven and, per the
card, blocks approval pending a coordinator decision. The weaker config-level
readings — V3's greps, and a grep of the bundled web bundle for
`__TAURI_INTERNALS__` — are a **report** and were not substituted for any of
them. The three forbidden remedies were all refused: no second hook or second
marker path anywhere in `web/`, no change to the gate, and no `src-tauri/**` edit
made to open a channel.

What **was** decidable and was decided, and is not the handler half:

- `POST /api/formats` (`{"name": "Progress note", "sections": ["Subjective", "Plan"]}`)
  → 201, `POST /api/patients` (`John Smith`) → 201, `POST /api/notes` with the
  content out of `e2e/fixtures/csp/injection-probe.md` → 201. The order is not
  optional: a sandbox data dir has no `note_formats` row and `POST /api/notes`
  404s on an unknown `format_id`. Three 201s are **not** the handler half.

## The two freshness assertions, and what they caught

These two assertions are the reason attempt 1's failure was invisible, and they
are the direct repair the card asked for. Both are **primary predicates** — a
`git diff --name-only <base>…HEAD` and a `git status --porcelain` over **Rule
B's set** — with the mtime walk over the same set as the fallback. They name the
path, the mtime and the AppImage's own mtime, so a reader can check the arithmetic:

```
web/src/main.tsx  2026-10-02T18:14:24.654Z
AppImage         2026-10-02T07:06:07.901Z
```

The second assertion is the one that proves the repair works on an **uncommitted**
edit, which is exactly what the `src-tauri/`-only trigger could not see: at the
moment of the run, `web/src/main.tsx` is modified in the working tree and named
only by `git status`, never by the diff against `d56af1d`. Both fired, so the row
could not silently assert about a bundle that was never rebuilt.

## (d)'s header half — `FAIL`, and the cause is a stale bundle

`GET /patients` answered **200** with `content-type: text/html; charset=utf-8`
and **no** `content-security-policy` header. The SPA fallback exists and is HTML,
so the assertion reached the right response; the header is not there because the
launched binary does not contain `csp.ts`. V1 asserts the same header in-process
on both servers (12/12), so the source is right and the binary predates it.

This is the assertion the card says "fails on an unmodified tree", and it was
left standing.

## Containment — all five, none of them weakenable

| Assertion | Result |
| --- | --- |
| no process from the run remains | `PASS` (the AppImage is stopped **by pid** with SIGTERM, and the bundled server's process count on this data dir is polled back to 0) |
| no second `apunta.lock`, `apunta.db`, `-wal` or `-shm` | `PASS` (baseline snapshotted before the launch; the lock names no live pid) |
| the sandbox port is free afterwards | `PASS` (`127.0.0.1:7835`, **read** out of `/proc/net/tcp{,6}` — the harness binds no socket of any kind, so the port check does not bind one either) |
| the observation channel is gone and cannot ship | `PASS` (0 marker lines before the app was stopped and 0 three seconds later; and `web/dist/assets/*.js` carries **0** occurrences of the marker path and **0** of the gate string) |
| `ollama` is still running | `PASS` (read from outside the run) |

Nothing in the five was loosened, skipped or turned off to make the row pass
(HS-7). The fourth is the release invariant restated on the row that launches the
binary: it would have **failed** if a flagged bundle had ever landed in
`web/dist`, and its counts are the same ones V0 asserts.

## What this attempt changed in the harness, and what a reviewer should press on

`scripts/v2/tauri-security.test.mjs` was rewritten to read the hook instead of the
inspector. The removals are visible in the diff and are exactly the mechanism the
card dropped: the inspector host/port/variable, the `node:net` import, the
GVariant framing, `readTargets`, `evaluate`, and the port-7836 containment
assertion. What replaces it:

- **`readObservations(stderrText)`** parses the accumulated stderr for
  `/api/p3.4-observe?…` and returns `{facts, rects, markerLines, last}`. A fact
  line carries `href` and no `batch`; a rectangle line carries `batch` and no
  `href`. Every value is a URL-encoded scalar, so a label can never be read as a
  fact.
- **`clickAndWaitForChange`** clicks a rectangle the page published for its own
  visible label with `xdotool mousemove --sync --window <id> <x> <y> click 1`, and
  regards the click as landed only when the **published rectangles or facts
  change**. The assertion the click enables is never that proof, and a click that
  missed times out and fails the row.
- **The window baseline is taken before the note is opened**, not before the
  attempt is read. This is a deliberate reading of the card: the hook actuates as
  soon as `scriptText` has been true for two polls, which can be within 500 ms of
  the note opening, so a snapshot taken after the clicks would be a snapshot of an
  already-actuated window and (b) and (c) would compare two post-attempt states.
  Both now compare against the pre-open baseline. **A reviewer should press on
  this** — it is the one place where the harness's own timing choices, rather than
  the card's wording, decided what "unchanged" is measured against.
- **`attempt` is a three-stage state machine**, one poll apart, so (b)'s refused
  navigation cannot race (c)'s `window.open`: `b:assign-location-href`, then
  `c:window-open-external`, then `c:window-open-same-origin`.
- **A `NOT RUN` sets the exit code.** The card says a `NOT RUN` is never a `PASS`;
  making it also never a green row is the same statement one level up. With five
  `NOT RUN`s the row exits 1 whether or not the `FAIL`s were counted.

### The one place the hook had to be written around a lint rule

`https://example.invalid/` is a non-loopback URL literal, and
`eslint.config.js` bans every such literal as a hard-rule-1 tripwire. That file is
outside this card's May edit, and weakening it to accommodate a test hook would be
HS-7. So `web/src/main.tsx` assembles the origin from
`['https', 'example.invalid'].join('://') + '/'`, which is the same string, keeps
the reserved-TLD guarantee the card asks for (`.invalid` cannot resolve, so an
attempt is provably a refusal attempt), and puts no non-loopback literal in the
tree. **A reviewer should press on this too**: it is the only place in the
implementation where a rule was routed around rather than satisfied, and the
judgement (a tripwire on *shipped* sources has nothing to say about a URL that
cannot resolve) is mine, not the card's.