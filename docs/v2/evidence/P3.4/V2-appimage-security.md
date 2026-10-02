# V2 — the AppImage, bridge security in the shipped binary

**Status: FAIL** (exit code 1). Of sixteen assertions: **10 `PASS`, 1 `FAIL`,
5 `NOT RUN`**. The harness counts a `NOT RUN` as not-a-failure, so it prints
`15/16 assertions passed, 5 NOT RUN`; the `FAIL` is what sets the exit code. The `FAIL` and the five `NOT RUN` are both real results, and
neither was turned into a pass.

- Working directory: the repository root (re-executed by the harness itself under
  `xvfb-run -a -s '-screen 0 1400x1000x24'`, so the app and `xdotool` share one
  display).
- Command, exactly as the card gives it:

  ```sh
  export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" && node --version && node scripts/v2/sandbox.mjs env --port 7835 > /tmp/apunta-v2-p3.4-v2.env && . /tmp/apunta-v2-p3.4-v2.env && node scripts/v2/tauri-security.test.mjs security
  ```

- `node --version` printed exactly `v24.19.0`.
- Exit code: **1**.
- Start / end time: 2026-10-02T17:04:50Z / 2026-10-02T17:05:04Z.
- Sandbox run id: `2026-10-02T17-04-50-478Z-b3da639b`, in `<sandbox>/`.

## Verbatim output

```
v24.19.0
  display: the inherited X display :99
PASS V2 appimage: src-tauri/target/release/bundle/appimage/Apunta (test)_0.0.0_amd64.AppImage
PASS V2 the AppImage is newer than every src-tauri source file
PASS V2 7836 is free before the launch
PASS V2 the app's own window is up
PASS V2 the server answers with this run id
FAIL (d) header: the SPA fallback HTML carries rule 6's six directives: GET /patients answered 200 with content-type "text/html; charset=utf-8" and a CSP of ""
NOT RUN (a) window.__TAURI__ and window.__TAURI_INTERNALS__ are undefined: …
NOT RUN (b) navigation to https://example.invalid/ is refused: …
NOT RUN (c) window.open is cancelled: …
NOT RUN (d) handler: the injected note renders inert, and __APUNTA_CSP_PROBE__ is undefined: …
NOT RUN (e) an inline style attribute is applied in the shipped binary: …
  the fixture note was created over HTTP (format, patient and note all 201) and was NOT opened, because opening it and reading the page both need the channel
  --- the app's stderr ---
  apunta: spawned the bundled server as pid 332497
  MESA-EGL: warning: DRI3 error: Could not get DRI3 device
  MESA-EGL: warning: Ensure your X server supports DRI3 to get accelerated rendering
  apunta: the server is ready ({"type":"ready","port":7835,"nonce":"<nonce>","version":"0.0.0","protocol":1}), version 0.0.0
  apunta: the main window is open on http://127.0.0.1:7835
  stopped the shell (pid 332456) with SIGTERM
PASS containment no server process from the run survives
PASS containment no second lock, database, -wal or -shm
PASS containment the sandbox port is free afterwards
PASS containment 7836 — the inspector — is free afterwards
PASS containment ollama is still running

15/16 assertions passed, 5 NOT RUN
```

## (d) header half — FAIL, and the cause is not in this card's code

`GET http://127.0.0.1:7835/patients` answered **200** with
`content-type: text/html; charset=utf-8` and **no** `content-security-policy`
header at all. The SPA fallback exists and is HTML, so the assertion reached the
right response; the header simply is not there.

It is not there because **the launched binary does not contain this card's
server.** The AppImage bundles `linux-resources/`, which
`scripts/v2/package-linux-resources.sh` produced at **00:01** under P3.1:

```
$ grep -c "content-security-policy" build/linux-resources/server/server.mjs
0
```

The same CSP is present in the freshly built `server/dist/*.js` this attempt
produced, and V1 asserts it in-process on both servers. The source change is
correct; the binary predates it.

**The only row that rebuilds that bundle is V0**, and V0's condition — which looks
at `src-tauri/` paths only — records `NOT RUN` here. See `V0-not-run.md` for the
full argument and the recommendation. This assertion is exactly the one the card
says "fails on an unmodified tree", so it is doing its job; it is only
unfortunate that this attempt's *tree* changed in a place V0 does not watch.

No attempt was made to work around this: the assertion was not relaxed, and V0
was not run uninvited, because re-bundling rewrites `build/linux-resources/**` and
`server/dist/**`, neither of which is in this card's May edit list (HS-9).

## (a), (b), (c), (d) handler half, (e) — NOT RUN together, one cause

```
the WebKitGTK inspector on 127.0.0.1:7836 could not be read: no reply to the
target-list message. It is bound and accepting connections in this run, so this is
the protocol, not a missing listener.
```

The card's stop condition applies verbatim: these four are recorded `NOT RUN`
**together**, with this cause, and **none of them is `PASS`**. In particular a
`NOT RUN` (a) means the card's central rule-4 claim is unproven, and the card says
that blocks approval until the coordinator decides. V3's greps and a grep of the
bundled web bundle for `__TAURI_INTERNALS__` are weaker readings and are a
**report**, never a substitute; neither was substituted here, and no `src-tauri/`
edit was made to open the inspector.

What was still decidable and was decided:

- **The fixture note is real and reachable.** `POST /api/formats`
  (`{"name": "Progress note", "sections": ["Subjective", "Plan"]}`) → 201,
  `POST /api/patients` (`John Smith`) → 201, `POST /api/notes` with the content
  out of `e2e/fixtures/csp/injection-probe.md` → 201. That order is not optional:
  a sandbox data dir has no `note_formats` row and `POST /api/notes` 404s on an
  unknown `format_id`. Creating them is **not** the handler half — nothing was
  rendered and nothing was read, which is why the case is `NOT RUN` and not a
  pass on the strength of three 201s.
- **The inspector port was bounded.** 7836 asserted free before the launch and
  free again after the app was stopped, so the channel cannot have outlived the
  row and the harness cannot have attached to another process's inspector.

## Reading the framing off the bundled library, as S3 requires

S3 says the harness must read the protocol's framing off the WebKitGTK build the
AppImage bundles "rather than guessed". Done, in two stages.

**Stage one — the library, not the source tree.** In
`src-tauri/target/release/bundle/appimage/Apunta (test).AppDir/usr/lib/libwebkit2gtk-4.1.so.0`:

- `WEBKIT_INSPECTOR_SERVER` is present as a string, beside
  `WEBKIT_INSPECTOR_HTTP_SERVER` (deliberately unused, per S3).
- `WEBKIT_INSPECTOR_SERVER` is **not** an exported symbol: `nm -D` lists nothing
  matching it, and the library is stripped (`nm: no symbols`). It is read
  internally.
- The protocol is a **GVariant**, not bare JSON lines: the binary references
  `WTF::SocketConnection::sendMessage(const WTF::CString&, GVariant*)`,
  `g_variant_new_bytestring`, `g_variant_get_bytestring`,
  `Inspector::RemoteInspector::Client`, and `Inspector::BackendDispatcher::dispatch(const WTF::String&)`.
- The protocol's own key names are present as `method`, `params` and `targets`.

**Stage two — on the wire, against the shipped AppImage.** Sandbox run
`2026-10-02T16-46-12-867Z-cb13d02b`, four probe passes, each launching the real
AppImage with `WEBKIT_INSPECTOR_SERVER=127.0.0.1:7836` in the child environment
only and stopping it by pid. Measured:

1. WebKit **is** the listener: `ss -ltnp` while the app ran reported
   `LISTEN 127.0.0.1:7836` owned by the app's `apunta` process. So the socket is
   bound, on loopback, and accepting.
2. An **unframed** message (`{"method":"list"}` with `\n`, `\0`, `\r\n` or no
   terminator, and with the method names `list`, `ListTargets`, `targets`,
   `getTargets`) closes the connection in **0–1 ms**, every time.
3. A **length-prefixed** message (`uint32` little-endian length, then the JSON) or
   the **GVariant `((ay))`** serialisation (a 4-byte offsets word for the outer
   tuple, a 4-byte one for the inner, then the bytes) is **buffered, not
   discarded**: the connection stays open and is closed only by the harness.
   17 candidate framings and method names were tried this way, including
   `connect`, `evaluate` and `cancel` with full parameter objects.
4. **No candidate produced a single reply byte**, in 6 s waits. The target list
   never arrived, so the channel cannot be used.

The harness therefore encodes exactly what was measured — the `((ay))` framing,
`method`/`params`/`targets` keys, a `{"method":"list"}` target-list request — and
reports `NOT RUN` when no reply arrives. It never treats silence as success, and
it never falls back to a guess that would produce a plausible-looking result.

## Containment, all five asserted, none weakened

| Assertion | Result |
| --- | --- |
| no process from the run remains | PASS — the shell went on `SIGTERM`, and no bundled server on this data folder survived (15 s poll) |
| no second `apunta.lock`, `apunta.db`, `-wal` or `-shm` | PASS — baseline taken **before** the launch; nothing beyond the four C-OWN@1 names appeared, and the lock names no live pid |
| port 7835 free afterwards | PASS |
| **port 7836 free afterwards** | PASS — the in-page channel is gone and cannot outlive the row |
| `ollama` still running | PASS — read from outside the run |

## Freshness

`PASS V2 the AppImage is newer than every src-tauri source file`. The walk covers
`src-tauri/src/**`, `src-tauri/ui/**`, `src-tauri/capabilities/**` (absent), both
configs, `build.rs`, `Cargo.toml`, `Cargo.lock` and `src-tauri/icons/**`, and
**nothing** under `src-tauri/target/` or `src-tauri/gen/`. Excluding those two is
mandatory, not cosmetic: `gen/schemas` is rewritten by `tauri-build` on every
build-script run and `target/` by every build, so including either fails this row
on a pristine tree.

The primary predicate — `git diff --name-only 52b9ce0...HEAD -- src-tauri/` — is
empty for this attempt, and the mtime walk is the fallback that also catches
uncommitted edits.

## What the coordinator needs to decide

1. **V0's condition.** Add `server/src/**` (or the bundled server) to it, or
   authorise V0 for this card regardless. Until then V2(d)'s header half cannot
   pass on any attempt.
2. **(a) is unproven and blocks approval.** Either accept a config-level reading
   as a weaker report — the card forbids substituting it — or have the framing
   worked out further, or accept V2 as unproven on this host. This implementer
   tried sixteen framings and thirteen method names and got no reply; the protocol
   appears not to be reachable from an unauthenticated plain TCP client on this
   WebKitGTK 2.52.6 build.
EOF
echo written; ls