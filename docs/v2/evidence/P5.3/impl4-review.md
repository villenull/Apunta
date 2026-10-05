# P5.3 fourth implementation review — evidence

Raw record for `docs/v2/state/reviews/P5.3-impl4.md`. Pinned Node
`v24.19.0` (`export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH"`,
`node --version` printed `v24.19.0` in every command). Every sandbox row ran in
its own subshell on a fresh `sandbox.mjs` run folder; nothing contacted 7717 or
the live data folder. No network. No source edits, no commits, no pushes.

## V1 — unit / integration

```
$ node --version && npm run build:shared && \
  npx vitest run server/src/maintenance.test.ts server/src/jobs \
    server/src/routes/app-quiesce.test.ts web/src/lib/maintenance.test.ts --reporter=verbose
v24.19.0
 Test Files  4 passed (4)
      Tests  109 passed (109)
   Duration  1.43s
exit 0
```

Every case the card's V1 names is present by name, including the flush-step save
exemption, the stale/foreign report 409, the `no_response` disconnect, the
retained-record supersede, the ten route sites and the browser-side reporter
lifecycle.

## V5 — full unit suite, lint, typecheck

```
$ node --version && npm test && npm run lint && npm run typecheck
v24.19.0
 Test Files  171 passed (171)
      Tests  2424 passed (2424)
   Duration  11.57s
> apunta@0.0.0 lint
Checking formatting...
All matched files use Prettier code style!
THIRD-PARTY-LICENSES.md lists all 112 shipped packages.
TOTAL 0
> @apunta/web@0.0.0 typecheck  (clean)
> @apunta/e2e@0.0.0 typecheck  (clean)
exit 0
```

## V2, V3, V4, V6, V7, V9 — isolated quiescence project

Each row was the card's literal command (`sandbox.mjs env --port <p>` → source
env → `npx playwright test --project=quiescence quiescence.spec.ts --grep "<Vn>"`)
in its own subshell.

```
V3 EXIT 0   1 passed (7.0s)      port 7855
V4 EXIT 0   1 passed (5.7s)      port 7866
V6 EXIT 0   2 passed (8.3s)      port 7875
V7 EXIT 0   1 passed (6.5s)      port 7853
V9 EXIT 0   4 passed (11.4s)     port 7871
V2 EXIT 0   1 passed (9.6s)      port 7853
```

## V8 — whole suite (card command) — **FAIL, exit 1**

```
$ node --version && node scripts/v2/sandbox.mjs env --port 7853 > /tmp/apunta-v2-p5.3-v8.env \
  && . /tmp/apunta-v2-p5.3-v8.env && ( cd e2e && \
     PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npx playwright test )
  1) [quiescence] › tests/quiescence.spec.ts:447:3 › C-UPD@1 quiescence › the flush exemption:
     unsaved text reaches the disk and the quiesce settles ok:true

    Error: maintenance is released when the last window unregisters
    expect(received).toBe(expected)
    Expected: false   Received: true
    Timeout 15000ms exceeded while waiting on the predicate
      > 498 |       .toBe(false);
            at e2e/tests/quiescence.spec.ts:498:8

  1 failed
    [quiescence] › tests/quiescence.spec.ts:447:3 › the flush exemption …
  6 skipped
  7 did not run
  117 passed (1.1m)
exit 1
```

The failing row's server-log tail (quiescence server, pid 63229, port 7855):

```
142790  GET  /api/app/quiesce/wait?tab=e2e-quiescence-flush&doc=a53aec3b-…  (held, req-ca)
142786  PATCH /api/notes/…?quiesce=…&tab=e2e-quiescence-flush&doc=a53aec3b-…  -> 200
142786  POST /api/app/quiesce/report?tab=e2e-quiescence-flush&doc=a53aec3b-… -> 200
143028  req-ca -> 200 (responseTime 237ms)        <-- the quiesce's finally released it `expired`
143057  POST /api/app/quiesce/close?tab=e2e-quiescence-flush&doc=a53aec3b-… -> 204  <-- beacon, banked
143071… the row's release poll: GET /api/app/quiesce/status repeatedly for 15s
        (no further GET …/wait from that tab was ever logged)
```

So the held wait had already been released `expired`, no re-armed wait was
registered before the beacon/`page.close()`, the server never observed a socket
close, and the banked clean claim was never spent; `releaseIfUnheld` is reached
only from `disconnect()` / `closeWindow` release paths.

**Isolation re-check (diagnosis only):**

```
$ for i in 1 2 3; do (sandbox --port 7853; npx playwright test --project=quiescence \
    quiescence.spec.ts --grep "flush exemption"); done
flush run 1 EXIT 0   1 passed (5.5s)
flush run 2 EXIT 0   1 passed (5.5s)
flush run 3 EXIT 0   1 passed (5.5s)
```

## Finding 1 — reproduction against the shipped controller

Scripts were written under `/tmp` only; no repository file was created or
modified. Run as `npx tsx /tmp/<name>.mts`.

`/tmp/p53-repro.mts` — retained duplicate:

```ts
import { createMaintenance } from '/home/villenull/Projects/Apunta/server/src/maintenance.ts';

let time = 1000;
const m = createMaintenance({
  now: () => time,
  sleep: async () => { await new Promise((r) => setTimeout(r, 1)); },
  shellMode: false,
});

// A and B are two documents in ONE tab slot (Duplicate Tab copies sessionStorage).
const A = m.registerWindow('T', 'docA');
const aWait = m.holdFor(A);
const B = m.registerWindow('T', 'docB');
const bWait = m.holdFor(B);
console.log('registered records (expect 2):', m.status().windows);      // 2

m.disconnect(B);                                                        // B crashes dirty
console.log('after B dirty disconnect, live windows (expect 1):', m.status().windows); // 1

const running = m.quiesce();
const askedA = (await aWait) as { request: string; quiesceId: string };
const outcome = m.report({ quiesceId: askedA.quiesceId, tabId: 'T', doc: 'docA', ok: true, blockers: [] });
console.log('A report outcome:', outcome);                             // accepted
console.log('QUIESCE RESULT:', JSON.stringify(await running));
```

```
registered records (expect 2): 2
after B dirty disconnect, live windows (expect 1): 1
A asked: flush
A report outcome: accepted
QUIESCE RESULT: {"quiesceId":"01a10cb1-bc3d-7039-9d0a-e4a6c6a7deb3","ok":true,"blockers":[]}
FAIL-OPEN: settled ok:true over the crashed duplicate B with an unpersisted obligation
```

`/tmp/p53-repro2.mts` — live duplicate registering mid-quiesce:

```ts
const A = m.registerWindow('T', 'docA');
const aWait1 = m.holdFor(A);
const running = m.quiesce();
const asked = (await aWait1) as { request: string; quiesceId: string };
console.log('A report:', m.report({ quiesceId: asked.quiesceId, tabId: 'T', doc: 'docA', ok: true, blockers: [] }));
void m.holdFor(A);                       // A re-arms
const B = m.registerWindow('T', 'docB'); // duplicate arrives mid-quiesce
void m.holdFor(B);                       // B is never asked
console.log('B is a live, registered window:', m.status().windows, 'live');
console.log('QUIESCE RESULT:', JSON.stringify(await running));
```

```
A asked: flush
A report: accepted
B is a live, registered window: 2 live
QUIESCE RESULT: {"quiesceId":"01a10cb2-0e26-7017-9cda-2eecd43089e2","ok":true,"blockers":[]}
FAIL-OPEN: settled ok:true while a live duplicate window B was never asked
```

Root cause line references in `server/src/maintenance.ts`:
`windowKey` `:578-580`; `answered.has(windowKey(record))` in `holdFor` `:668`
and `windowPhase` `:426`; `answered.add(windowKey(record))` in `report` `:798`.
`expected`/`reported` are keyed by `record.id` and are correct.

## Finding 3 — Spanish typo

```
$ grep -n "no_response" shared/src/i18n/es-MX.ts
156:  'errors.quiesce.no_response': {
157:    text: 'Una ventana se cerró sin avisar, … Reinicia Apunta para_solver esto.',

$ grep -rn "quiesce.no_response" --include=*.ts --include=*.tsx web server shared | grep -v i18n/ | grep -v .test.
(no output — the key is currently unreferenced, as AM-216 records)
```

## Finding 4 — FD1 sentence

```
$ grep -n "non-\`{quiesceId}\`" docs/v2/cards/P5.3.md
192:      non-`{quiesceId}` value the channel sends**; the report body stays exactly

$ git diff HEAD -- docs/v2/CONTRACTS.md
+**One write is exempt while maintenance is on:** … (the AM-213 flush exemption only;
+ no sentence names the `doc` nonce)
```

## P2.2 screenshot restore (the only tracked change made by this review)

The whole-suite run rewrote four tracked historical P2.2 screenshots. They were
restored to HEAD with `git checkout`, and nothing else was reverted:

```
$ git status --porcelain | grep -i '\.png$'
 M docs/v2/evidence/P2.2/screenshots/dark-accent-7c3aed.png
 M docs/v2/evidence/P2.2/screenshots/dark-default-accent.png
 M docs/v2/evidence/P2.2/screenshots/light-accent-7c3aed.png
 M docs/v2/evidence/P2.2/screenshots/light-default-accent.png

$ git checkout -- docs/v2/evidence/P2.2/screenshots/{dark-accent-7c3aed,dark-default-accent,light-accent-7c3aed,light-default-accent}.png
screenshots restored to HEAD
```

## Files this review touched

- `docs/v2/state/reviews/P5.3-impl4.md` (new)
- `docs/v2/evidence/P5.3/impl4-review.md` (new, this file)
- `docs/v2/evidence/P2.2/screenshots/*.png` — restored to HEAD (no net change)

No commit, no push, no `git add`.
