# Contracts (v2 plan)

Each contract is the single authority for its concern. Cards quote it by ID
and version (for example `C-MODEL@1`); `tools/build-dispatch.mjs` copies the
exact section into each dispatch. **Only the plan editor changes a contract**,
by publishing a new version and listing affected cards. A worker who finds a
contract wrong or impossible stops and reports it.

Every contract names its **integration owner**: the card that builds it and
the card that proves it end to end.

---

## C-ISO@1 Isolation and the sandbox wrapper

**Built by** P0.3. **Proven by** P0.3 (negative tests) and Q1.1.
**Consumers:** every card that starts a server, opens a real database, runs
e2e, runs `check:format`/`check:refine`, runs a real-model eval or launches
the app.

**Interface** (`scripts/v2/sandbox.mjs`, Node, no dependencies):

| Command | Behaviour |
| --- | --- |
| `node scripts/v2/sandbox.mjs run --port <p> -- <cmd...>` | Creates run folder, starts server, verifies ownership, runs `<cmd>` with the sandbox environment, stops only what it started, exits with `<cmd>`'s code |
| `node scripts/v2/sandbox.mjs env --port <p>` | Creates run folder only, prints `export` lines for tools that start their own server (Playwright) |
| `node scripts/v2/sandbox.mjs selftest` | Runs the negative cases below; exit 0 only if all refuse correctly |

**Rules**
1. Run folder: `/tmp/apunta-v2/<runId>/` with `data/`, `logs/`, `tmp/`,
   mode `700`. `runId` = UTC timestamp + 8 random hex characters.
   `realpath` of every path must stay under `/tmp/apunta-v2/`; a symlink that
   escapes is refused.
2. Port must be an integer 7800 to 7889 and free (checked by binding, then
   released immediately before the server binds). 7717 is always refused.
   7890 to 7899 are reserved for the updater test server (C-UPD) and refused
   here.
3. The data folder is never the platform default. The wrapper computes the
   default with `platformDataDir()` (C-PATH) **as a string only** and refuses
   if the sandbox path equals it or is inside it. It never lists or opens the
   default.
4. Server environment: `APUNTA_DATA_DIR`, `APUNTA_PORT`, `APUNTA_NO_OPEN=1`,
   `APUNTA_TEST_RUN_ID=<runId>`, `APUNTA_V2=1`. When `APUNTA_TEST_RUN_ID` is
   set, `/api/health` includes `"testRunId"`; the field never appears
   otherwise.
5. Ownership check: the wrapper polls `/api/health` for up to 30 s and
   proceeds only if `testRunId` equals its `runId`. Anything else (no
   answer, a different id, no id) is refused and the child is stopped.
6. Child command environment adds `APUNTA_CHECK_URL`, `APUNTA_E2E_PORT`,
   `APUNTA_V2=1`.
7. Cleanup kills only the process group the wrapper created. Never `pkill`,
   never the Ollama daemon.
8. When `APUNTA_V2=1`: Playwright sets `reuseExistingServer: false`;
   `scripts/check-note-format.mjs` and `scripts/check-refine.mjs` exit 2 if
   `APUNTA_CHECK_URL` is unset or points at port 7717.

**Normal example.** `sandbox.mjs run --port 7801 -- npm run check:format`
→ run folder created, server answers with the matching `testRunId`, the
check runs against `http://127.0.0.1:7801`, server stopped, exit code of the
check.

**Rejection examples** (each must be a `selftest` case, refused before any
database is opened): `--port 7717`; `--port 7890`; port in use by a dummy
listener; a dummy server on the port answering `/api/health` with 200 but no
or wrong `testRunId`; run folder symlinked outside `/tmp/apunta-v2/`;
`APUNTA_DATA_DIR` equal to the platform default string.

---

## C-PATH@1 Platform data folder

**Built by** P4.2. **Proven by** P4.2 and P6.3. **Consumers:** server config,
installer CLI, sandbox wrapper, Tauri shell, backup and restore helpers.

One pure function in `shared/src/platform-paths.ts`:
`platformDataDir(platform, env, homedir): string`.

| Input | Result |
| --- | --- |
| `env.APUNTA_DATA_DIR` non-empty | `resolve(env.APUNTA_DATA_DIR)` |
| `darwin` | `<home>/Library/Application Support/Apunta` |
| `win32`, `APPDATA` set | `<APPDATA>/Apunta` |
| `win32`, no `APPDATA` | `<home>/AppData/Roaming/Apunta` |
| other, `XDG_DATA_HOME` set | `<XDG_DATA_HOME>/apunta` |
| other | `<home>/.local/share/apunta` |

**Compatibility.** The server's current results for Linux and macOS are
unchanged. The installer's current Windows result (the Linux-style path) is
a defect, not a behaviour to keep.

**Rejection example.** None; the function never fails. Callers that must not
use the default (the sandbox) compare against it.

---

## C-MODEL@1 Effective writing model

**Built by** P1.4. **Proven by** P1.4, P4.3, Q1.1. **Consumers:** installer
plan, setup screens, server generation and preload, health and preflight,
eval CLI, check scripts.

One resolver in `shared/` (browser-safe, no installer import):
`effectiveModel({ override, installed }): { tag, source }`.

| Case | Result |
| --- | --- |
| `llm_model` setting is a non-empty tag | that tag, `source: 'override'` |
| no override | `qwen3.5:4b-q4_K_M`, `source: 'promoted'` |

- Memory size never selects the model. `modelForMemory()` may remain as an
  **informational recommendation** in setup ("this machine could also run
  X"), never as a selection, and is renamed to say so.
- Setup downloads exactly the effective model. A clean install makes its
  first inference without any further pull.
- Health and preflight report `{ tag, source, present }`.
- The eval CLI with no `--models` uses the promoted default, not the memory
  picker. Every measurement records tag **and digest** (`ollama show`).

**Normal example.** 16 GiB machine, no override → setup downloads
`qwen3.5:4b-q4_K_M`; the server uses it; eval default uses it.

**Rejection example.** Override set to a tag that is not installed → health
reports `present: false` and generation returns the existing "model not
available" error; nothing is pulled automatically.

---

## C-SETTINGS@1 Settings mutations

**Built by** P1.1. **Proven by** P1.1 and S2.6. **Consumers:** every
settings control, including Language.

- `SettingsProvider` exposes `update(patch)`. It applies the patch to the
  provider's state immediately (optimistic), then calls `putSettings`.
- Each key has a sequence number. A response for an older sequence than the
  latest request for that key is ignored (last intent wins).
- On failure: the provider restores the value from before **that** request
  for the failed keys only, and the control shows the existing error
  message style.
- No control keeps a persisted setting in local component state as its
  source of truth. Local state is allowed only for in-progress text input.
- Radio groups follow native radio keyboard behaviour: arrow keys move and
  select within the group; Tab enters at the selected option.

**Normal example.** Dark → choose Light → navigate to Home → back to
Settings **without reload** → Light selected, page light, provider value
light; after reload, still light.

**Rejection example.** Save fails → value returns to Dark, page returns to
dark, error shown; no reload claims Light.

---

## C-REQ@1 Request guard

**Built by** P1.3. **Proven by** P1.3 (injected and real-socket tests) and
P3.4. **Consumers:** the main Fastify app and the boot-error server.

One function applied as `onRequest` in **both** servers.

| Header | Allowed | Rejected |
| --- | --- | --- |
| `Host` | `127.0.0.1:<port>`, `localhost:<port>`; in dev also the Vite host | anything else, missing |
| `Origin` | absent; `http://127.0.0.1:<port>`; `http://localhost:<port>`; in dev the Vite origin | `null`, malformed, any other scheme, host or port |
| `Sec-Fetch-Site` | absent, `same-origin`, `none` | `cross-site`, `same-site` |
| Method `OPTIONS` | never answered with CORS headers | a foreign origin gets 403 |

Rejection: HTTP 403, JSON `{ "error": { "code": "forbidden_request" } }`,
logged with method, path and which rule failed, never the body.

**Normal example.** Same-origin `POST /api/notes` from the app → allowed.
**Rejection example.** `GET /api/patients` with `Host: evil.example:7717` →
403, on both servers.

---

## C-OWN@1 Data-folder ownership

**Built by** P3.2. **Proven by** P3.2 and Q1.1. **Consumers:** server
startup, Tauri shell, sandbox.

1. **Acquire before anything touches the database.** Order at startup:
   ensure folder → acquire lock → apply pending restore → pre-migration
   snapshot (C-UPD) → migrate → open for writing.
2. Lock file `<dataDir>/apunta.lock`, created with exclusive create. Content
   JSON: `{ pid, processStart, appVersion, protocol: 1, nonce }`.
3. If the file exists: if `pid` is alive **and** its start time equals
   `processStart` → refuse with exit code 75 and message code
   `data_folder_in_use`. Otherwise the lock is stale: write a new lock to a
   temporary file and atomically rename it over the old one, then re-read
   and confirm the nonce is ours; if not, refuse.
4. SQLite backstop: after migration, the database is opened with
   `locking_mode=EXCLUSIVE`, so a process that ignores the lock file (a v1
   server) cannot write concurrently.
5. Released on clean shutdown; a crash leaves a stale lock handled by rule 3.
6. The shell never attaches to a server it did not spawn (C-BRIDGE rule 1).

**Normal example.** One launch → lock acquired → normal start.
**Rejection example.** Second launch on the same synthetic folder → exit 75,
the shell shows "Apunta is already open"; the first keeps running untouched.

---

## C-BRIDGE@1 Shell and server

**Built by** P3.3 (lifecycle) and P3.4 (security). **Proven by** P3.6 and
P5.5. **Consumers:** Tauri shell, server, web update notice.

1. The shell spawns the server itself and trusts only its own child's
   stdout. The server prints exactly one JSON line when listening:
   `{"type":"ready","port":7717,"nonce":"<from env>","version":"x.y.z","protocol":1}`.
   The shell navigates only after reading this line with its own nonce. No
   health-poll trust.
2. Further messages are JSON lines. Server to shell: `ready`, `fatal{code}`,
   `update_request{action:"check"|"download"|"install"}`,
   `quiesce_result{ok, blockers[]}`. Shell to server (stdin):
   `update_status{state, version?, code?}`, `quiesce{}`, `shutdown{}`.
   Unknown message types are logged and ignored.
3. The web page talks only to the server over HTTP. Update endpoints
   (`GET /api/app/update`, `POST /api/app/update/{check,download,install}`)
   exist only when the server was started by the shell; in browser mode
   they return 404. **Quiescence is not an updater endpoint.** The
   `/api/app/quiesce*` routes are a **server-mode** route group: they exist in
   both modes and are available in browser mode, and C-REQ@1's request guard is
   unchanged for them. What differs by mode is only what releases a successful
   quiesce's maintenance state: in **shell mode** maintenance stays on through
   the snapshot and is released by the shell's next transition; in **browser
   mode** it is held while at least one window is registered and the last
   unregistration releases it, so no browser-mode state persists until restart.
4. **No Tauri IPC from web content.** No capabilities for any webview
   origin, `withGlobalTauri: false`, no custom `invoke_handler` commands.
5. Navigation: the main window may load only `http://127.0.0.1:<port>/…`.
   Any other navigation or new window is cancelled. `https:` links the app
   intends to open (none required in v2) would open in the system browser
   only if listed in the shell's allowlist; the list is empty in v2.
6. The server sends a Content-Security-Policy on every HTML response,
   including the boot-error page, with at least: `default-src 'self'`,
   `script-src 'self'`, `connect-src 'self'`, `object-src 'none'`,
   `base-uri 'none'`, `frame-ancestors 'none'`. Any extra source must be
   justified in the card's evidence by a failing test without it.
7. If the server writes `fatal` or exits before `ready`, the shell shows a
   bilingual error screen with the message code (not a spinner).

**Rejection examples.** A dummy process on the port answering `/api/health`
→ never navigated to (the shell never polls it). A page that injects
`<script>` via imported Markdown → blocked by CSP and cannot reach Tauri.

---

## C-ACQ@1 Acquisition and readiness

**Built by** P4.1. **Proven by** P4.1, P4.4, S4b.1. **Consumers:** installer,
setup screens, Spanish speech acquisition.

**Requests**
1. `https:` only; port absent or 443; no user-info; no fragment; no query
   unless the artifact's manifest entry lists allowed query keys.
2. Host must be in the artifact's `allowedHosts` (initial) or
   `allowedRedirectHosts` (redirects) in `ACQUISITION.md`.
3. `redirect: 'manual'`. Each `Location` is resolved and validated **before**
   it is requested. At most 5 hops; a repeated URL is a loop and fails.
   No custom headers are sent to any host.
4. Checksum verification stays separate and mandatory.

**Readiness**
5. A model file is ready only if it is a regular file (not a directory or
   symlink to one), its size equals the pinned size, and either a receipt
   `<file>.receipt.json` records the pinned SHA-256 with matching size,
   mtime and inode, or a fresh hash matches. A fresh matching hash also
   establishes readiness without writing a receipt. Readiness probes never
   write receipts; explicit acquisition or repair writes a receipt only after
   verification.
6. Wrong size, wrong hash, directory, stale pin or dangling `.part` →
   state `invalid` with a code; repair only after the user presses Start.
7. Ollama pulls are performed by the daemon, outside these checks. The
   installer verifies the resulting tag's digest with `ollama show` and
   reports it; it cannot enforce the daemon's network behaviour, and the
   docs say so.

**Protocol.** The existing JSON-lines protocol (`installer/src/protocol.ts`)
stays the only one. Additions are optional fields. Exactly one terminal
event per run (`done` or `failed`). Cancel sends SIGTERM to the installer's
own process group only.

**Rejection examples.** Initial URL `https://huggingface.co:8443/…` → refused
before contact. Redirect to a host not listed → refused before contact.
11-byte file at the model path → `invalid`, not ready.

---

## C-LANG@1 Language, documents and jobs

**Built by** S2.1. **Proven by** S2.6, S4b.1, S5.6. **Consumers:** web,
server routes, AI prompts, guards, speech, spell check, formats, backup.

1. Setting `language` ∈ `en` | `es-MX`, default `en`. The server exposes
   `spanishAvailable: boolean`: true only when `APUNTA_DEV_SPANISH=1` (D12).
   When false, the Language control is hidden and `es-MX` is rejected by
   `PUT /api/settings` with code `language_unavailable`.
2. Locale mapping (one table in `shared/src/i18n/locales.ts`):

   | App | UI and `Intl` | Whisper `-l` | Speech model | Dictionary | Prompts |
   | --- | --- | --- | --- | --- | --- |
   | `en` | unchanged from today | `en` | `ggml-tiny.en.bin` | current English | current |
   | `es-MX` | `es-MX` | `es` | per C-STT selection | per S1.5 | Spanish set |

3. Documents: migration adds `locale TEXT NOT NULL DEFAULT 'en'` to notes
   and to formats. **All existing rows are `en`.** New notes take the job's
   locale. Existing notes and formats are never translated or relabelled.
4. Jobs capture `{ locale, sttModel, llmModel, promptSet }` at start
   (recording, transcription, draft, refine, plan, briefing, brainstorm).
   Retries, SSE and persistence use the captured context, never the current
   setting. **Refine uses the target note's locale**, whatever the UI
   language and whatever language the request is typed in.
5. Section roles: `shared/src/section-roles.ts` maps known section names in
   both languages (case- and accent-insensitive) to role IDs (`location`,
   `presentation`, `risk`, `discussion`, `intervention`, `actions`,
   `next_session`, and the SOAP and intake roles). Guards use roles, not
   strings. Unknown sections get role `custom`. Stored strings are not
   rewritten.
6. Changing Language is blocked while any job or save is active: the web
   control is disabled with a reason; the server also returns 409
   `language_change_blocked` if it knows of an active job.
7. Spanish dictation requires the Spanish speech model to be ready (C-ACQ).
   If it is not, dictation shows "Spanish speech model not installed" with
   a download action. **Spanish audio is never sent to the English model.**
8. The Spanish standard format is created as a separate format with
   `locale: 'es-MX'`; English formats are untouched. Imported formats take
   the UI language at import time; the user can change a format's locale.
9. Backups and restores carry the `locale` columns.
10. Treatment-plan activation writes its attestation in the stored language
    captured once at activation, because activation is not a generation job.
    Existing attestations are never rewritten or translated on read. Generated
    plan documents carry the stored value verbatim; document headings are a
    separate surface (AM-059).


**Rejection example.** UI switched to Español, user refines an existing
English note with a Spanish instruction → the note stays English, the reply
explains the change in the note's language.

---

## C-SNAP@1 Consistent snapshots

**Built by** P5.1. **Proven by** P5.1 and P5.5. **Consumers:** manual and
automatic backups, pre-migration safety snapshots.

1. One primitive: SQLite online backup API (or `VACUUM INTO`) into an
   operation-unique staging folder `<dataDir>/staging/<op>-<uuid>/`, mode
   `700`, followed by `PRAGMA integrity_check` on the copy. Committed WAL
   content is included by construction.
2. Every derived representation (manifest counts, JSON dump, readable notes,
   plans) is produced **from the copy**, opened read-only, never from the
   live handle.
3. One backup at a time: a second request waits up to 60 s, then returns
   409 `backup_in_progress`. Cleanup deletes only its own staging folder.
4. Encryption and destination behaviour are unchanged from today; a snapshot
   never silently downgrades an encryption expectation.

**Rejection example.** A write lands halfway through a backup → the
archive's database, counts and exports all describe the moment of the copy.

---

## C-UPD@1 Update, quiescence and migration

**Built by** P5.2 (migration), P5.3 (quiescence), P5.4 (updater).
**Proven by** P5.5. **Consumers:** shell, server, web notice.

**Updater states** (shell-owned, reported to the server over C-BRIDGE):
`idle → checking → available → downloading → verified → quiescing →
snapshotting → installing → relaunching → health_check → done`.

| Failure at | Outcome |
| --- | --- |
| checking (offline, host down) | back to `idle`, no notice, app fully usable |
| downloading | `available`, retry later |
| signature invalid | `idle`, notice says the update was rejected; file deleted |
| quiescing (active job, failed save, edit conflict) | back to `verified`; notice says what to finish first; nothing restarted |
| snapshotting (no space, write error, integrity fail) | back to `verified`; nothing installed |
| installing | old version keeps running; notice reports failure |
| relaunch / health_check | new version starts in **recovery mode**: no writes, offers restoring the safety snapshot and reinstalling the kept previous AppImage |

**Quiescence.** The server enters maintenance mode: new jobs and writes get
503 `maintenance`; it waits up to 30 s for its registry of active jobs
(recording, transcription, draft, refine, plan, briefing, brainstorm,
imports, restore, backup, saves) to drain; the web client flushes the editor
and reports `ok` or `conflict`. Any blocker → `quiesce_result{ok:false}`.
**One write is exempt while maintenance is on:** the reporting window's own
note save, `PATCH /api/notes/:id`, during the flush step that asked for it and
only when it carries that quiesce's id and the window's identity; every other
write is still refused.
Window close uses the same check: close is deferred while a save is in
flight; an active recording asks for confirmation; unsaved text is never
discarded silently.
**Quiescence is a server-mode route, not an updater endpoint.** The
`/api/app/quiesce*` routes exist in shell mode and in browser mode alike and are
available in both, behind C-REQ@1's unchanged request guard (C-BRIDGE@1 rule 3).
In shell mode a successful quiesce leaves maintenance on through the snapshot,
released by the shell's next transition; in browser mode it is held while at
least one window is registered and the last unregistration releases it.

**Migration** (every start, not only after updates):
1. Acquire the lock (C-OWN). Apply a pending restore if any.
2. Open read-only and read the schema version. If it is **newer** than the
   code knows → refuse with `newer_schema`; never downgrade.
3. If migrations are pending: take a C-SNAP snapshot to
   `<dataDir>/safety/pre-migrate-<from>-<to>-<utc>.db`; on any failure,
   stop with `snapshot_failed` and leave the old schema intact.
4. Run all pending migrations inside **one** outer transaction. On failure:
   roll back, stop with `migration_failed`, keep the snapshot.
5. Keep the last 3 safety snapshots; delete older ones only after a
   successful migration.

**Test keys and endpoints.** Local update tests use a throwaway key created
inside the sandbox run folder and an endpoint on `127.0.0.1:7890–7899`,
compiled in only under a `test-updater` Cargo feature. A check fails the
build if a release artifact contains the test endpoint, the test public key,
or `dangerousInsecureTransportProtocol`.

**Privacy statement** (About page, INSTALL, README): the check contacts
`github.com` and the release-asset host it redirects to; it sends the
request metadata any HTTPS request carries (IP address, TLS, user agent,
and the target/architecture/version in the URL); it sends no note content,
no patient data and no app-generated identifier; it can be turned off; the
app works offline.

---

## C-EVAL@1 Evaluation and the clinical safety gate

**Built by** S3.1 and S3.2. **Proven by** S5.6 and Q1.2. **Consumers:** eval
CLI, check scripts, S5 measurement, English non-regression.

1. **Two measurements.** *Provider* (diagnostic): the current
   provider-direct path. *Pipeline* (acceptance): the note produced by the
   server's draft route in a sandbox, read back from the API after
   persistence. Acceptance decisions use pipeline results only.
2. **Split.** Spanish fixtures: `tuning/` (at least 60%) and `heldout/`
   (at least 40%), fixed by S3.1 before any prompt work. S5 implementation
   cards may read `tuning/` only. `heldout/` runs once per acceptance
   attempt, at most twice in total.
3. **Controls.** Positive controls (must be flagged), clean negatives (must
   pass), empty and degenerate outputs (must fail). An instrument that
   misses a control is broken; nothing it scores counts.
4. **Critical errors** (any one on `heldout/` fails the gate regardless of
   aggregates): lost negation, invented negation, wrong dose or number,
   wrong experiencer (patient vs someone else), past risk reported as
   current or the reverse, retracted content kept, content invented for a
   section the dictation never covered. Correctly leaving an unstated fact
   out is never penalised.
5. **Aggregates** (pipeline, `heldout/`, reported with numerators and
   denominators): owner format fabrication at most 10% and safety facts at
   least 90%; SOAP and intake fabrication at most 15% and safety facts at
   least 90%.
6. **Repeats.** 4 separate invocations per configuration; report min, max
   and per-case results. They are repeatability evidence, not independent
   samples.
7. **Identity.** Record model tag and digest, inference options, prompt set
   hash, corpus hash, git commit and hardware for every run.
8. **English non-regression.** English pipeline metrics on both English
   corpora must fall within the min–max range recorded in
   `docs/v2/BASELINE.md` (P0.4, pipeline section added by S3.2). Outside →
   fail.
9. **Independence.** Each critical trap in the fixtures has a gold
   expectation written by S3.1 without using the production guard code, and
   a test proving the scorer flags it independently of that code.

---

## C-STT@1 Spanish speech model selection

**Built by** S4a.2. **Consumers:** P4.3, S4b.1.

- **Candidates (fixed):** `ggml-base.bin`, `ggml-base-q5_1.bin`,
  `ggml-small.bin`, `ggml-small-q5_1.bin`, `ggml-large-v3-turbo-q5_0.bin`,
  `ggml-large-v3-turbo-q8_0.bin`.
- **Run exactly as production:** transcript flags as today (timestamps kept)
  with `-l es` and the Spanish lead-in prompt; preview path settings as today.
- **Qualify only if all hold** on the synthetic benchmark: negations retained
  100%; inserted negations 0; numbers and doses exact at least 95%; preview
  real-time factor p95 at most 0.5; final transcription real-time factor
  p95 at most 1.0 on this PC; peak memory at most 2 GiB.
- **Pick:** among qualifiers, the highest clinical-term exact rate; if two are
  within 2 points, the smaller file.
- **Result:** `SELECTED <file>` with pinned size and SHA-256, or
  `NO QUALIFYING CANDIDATE`. The latter keeps Spanish dictation disabled and
  therefore keeps Spanish held (C-ES-GATE). No other candidate, threshold or
  benchmark may be added after seeing results.

---

## C-ES-GATE@1 Spanish release gate

**Evaluated by** Q1.2. **Released by** the owner only (HS-10).

Spanish may be offered in release builds only when **all** of these are
`PASS` with evidence at the final commit:

| Gate | Source |
| --- | --- |
| UI complete: key parity, no untranslated UI in the Español e2e run, copy review resolved | S2.6, S2.7 |
| Instrument controls pass | S3.2 |
| Speech model `SELECTED` | S4a.2 |
| Spanish setup, later acquisition, preview and final transcription pass | S4b.1 |
| Pipeline acceptance on `heldout/`: no critical error, aggregates met | S5.6 |
| English non-regression | S5.6, Q1.1 |
| Spanish spell check passes | S6.1 |
| Owner clinical verdict `APPROVED` in `docs/v2/owner/es-clinical-review.md` | S5.7 (owner) |

Any `FAIL`, `BLOCKED` or `NOT RUN` keeps Spanish held. There is no beta
exception in this plan.
