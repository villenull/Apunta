# The things only a Mac can settle

Apunta was built end to end inside a Linux container. Everything in it that
touches macOS — the setup script, the FileVault check, opening a browser, the
LaunchAgent, the installer, the app shell — has been **written and
syntax-checked but never run**. The Swift shell has never even been
*compiled*: there is no Swift toolchain off macOS, and no AppKit.

The model itself is no longer on that list: M10 ran the shipping 4B on a
live Linux machine — smoke 5/5, two full evals, and the config pack below —
see `docs/eval-reports/`. Model behaviour transfers; everything
macOS-specific still awaits the Mac.

This is the list of what that leaves open, in the order worth doing it, with
the exact command for each.

Nothing here is a bug report. It is the set of claims this project is making
that no machine has confirmed yet.

> **Not legal or compliance advice.** Where record-keeping or encryption comes
> up below it is only to explain why an engineering choice matters. What you
> are *required* to do with clinical records is a question for your board and
> your attorney.

---

## Before anything else

```sh
bash scripts/preflight-macos.sh
```

Read-only: it installs nothing, downloads nothing, and changes no setting.
It answers most of §1 below on its own and prints a short "Do these in order"
list at the end. [`docs/PREFLIGHT.md`](PREFLIGHT.md) explains every check.

Then work down this document, ticking as you go.

---

## 1. The nine claims the research could not verify

`docs/research/data-at-rest-2026-08.md` §7 lists nine facts about a Mac that
were reasoned about rather than observed — the egress policy in the container
blocked `sqlite.org`, `support.apple.com` and `eclecticlight.co`. **None of
them has reached user-facing documentation as a statement of fact.** Where the
app or the docs mention one, it is phrased as a thing to check, not a thing we
know.

| # | Question | Command | Result | Why it matters |
| --- | --- | --- | --- | --- |
| 1 | Is FileVault on? | `fdesetup status` | ☐ | The whole at-rest story. Without it, anyone who takes the laptop reads every note without knowing a password. `/api/health` reports this; **confirm the app's answer matches the command's.** |
| 2 | Is Desktop & Documents iCloud sync on? | System Settings → Apple Account → iCloud → Drive; or check whether `~/Library/Mobile Documents/com~apple~CloudDocs/Desktop` exists | ☐ | If it is, a backup saved to Desktop or Documents is uploaded to Apple. The app warns about those folders on that assumption. |
| 3 | Is "Optimize Mac Storage" on? | Same panel | ☐ | With it on, macOS can evict an unopened backup to a 0-byte placeholder, and Time Machine then backs up the placeholder. A backup that appears to exist and is empty when needed. |
| 4 | Is the Time Machine destination encrypted? | `tmutil destinationinfo` | ☐ | It cannot be changed later without erasing and re-adding the disk. If it is not encrypted, that disk is an unlocked filing cabinet holding every note. |
| 5 | Does Spotlight index `~/Library`, and does it index note text? | `mdfind -onlyin ~/Library/Application\ Support/Apunta ''` then `mdfind "kMDItemTextContent == '*<a word from a seeded sample note>*'"` | ☐ | Use `npm run seed` sample data (John Smith), never a real note. |
| 6 | Is `.md` content-indexed on this macOS? | Write `spotlight-test.md` in `~/Documents` containing `zzqqxwordtest`, wait a minute, `mdfind zzqqxwordtest`, then delete it | ☐ | Decides whether an exported note saved anywhere is full-text searchable by anyone using the Mac. The backup writes `.txt`, partly for this reason. |
| 7 | Is `/private/var/folders` excluded from Time Machine? | Inspect `.exclusions.plist` at the root of a backup | ☐ | `StdExclusions.plist` disappeared in Big Sur, so the old answer is stale. |
| 8 | What is `TMPDIR` under a LaunchAgent? | Install the agent, then `launchctl print gui/$(id -u)/com.apunta.server \| grep -i tmpdir` | ☐ | The install script sets it explicitly and the database sets `temp_store = MEMORY`, so this is belt and braces — but the assumption that it is a per-user directory is untested. |
| 9 | Is the login password strong enough for FileVault to mean anything? | Yours to judge | ☐ | FileVault's protection is exactly as strong as this password. Nobody else can answer it. |

---

## 2. The setup script

`scripts/setup-macos.sh` has never run on macOS. It is clean under `bash -n`
and `shellcheck`, its `--dry-run` is exercised by the test suite, and its
RAM-to-model table is asserted against the app's — but that is all.

**Do the dry run first.** It prints every command and executes none:

```sh
bash scripts/setup-macos.sh --dry-run
```

Read it. Then:

```sh
bash scripts/setup-macos.sh
```

| Check | ☐ | What "wrong" looks like |
| --- | --- | --- |
| It refuses to continue without Homebrew, with the brew.sh link | ☐ | It proceeds and fails later with a confusing error |
| `brew install ollama` and `brew install whisper-cpp` both succeed | ☐ | A formula was renamed since 2026-08 |
| It bails clearly if `/Applications/Ollama.app` exists | ☐ | It fights Homebrew's `conflicts_with` and loses noisily |
| `brew services start ollama` starts it, and the wait loop sees it | ☐ | 30s is not long enough on a cold start |
| The RAM tier it prints matches this Mac | ☐ | `sysctl -n hw.memsize` returned something unexpected |
| The tag it picked still exists on ollama.com | ☐ | **The three tags were never confirmed against a live registry.** `ollama pull` 404s |
| `ollama pull` completes | ☐ | — |
| `ggml-tiny.en.bin` downloads and its SHA-1 matches | ☐ | **The script has never fetched the Hugging Face URL.** A 404, or a checksum mismatch meaning the published file changed. The pin itself is real: a copy of this file on the Linux machine has the published SHA-1 `c78c86eb1a…` (2026-09-20) |
| The preview step says it is the same file, and downloads nothing | ☐ | It downloads `tiny.en` a second time. `PREVIEW_MODEL` and `WHISPER_MODEL` are the same filename, and `setup-macos.sh` short-circuits on that |
| Re-running it changes nothing and takes seconds | ☐ | Idempotency is broken somewhere |
| `npm start` then opens a working app | ☐ | — |

Then, and this is the one that matters most:

```sh
npm run smoke:live -- --runs 5
```

**The `--` is not optional** — without it npm swallows the flag and you get one
run while believing you asked for five. Five, not one, because the failure it
looks for (a repetition loop under constrained decoding) is intermittent.

| Check | ☐ |
| --- | --- |
| All five runs clean | ☐ |
| The model reports `details.format` = `gguf` | ☐ |
| No run reports the prompt filling the context window | ☐ |

---

## 3. The app on a Mac

| Check | ☐ | Notes |
| --- | --- | --- |
| `npm start` opens a browser tab by itself | ☐ | `open` on darwin, after the server is listening |
| No AI banner along the top of the tab | ☐ | Ollama reachable, writing model present, whisper present, speech model present |
| Recording a note works end to end | ☐ | The whisper half has never run either |

---

## 4. Backup (Settings → Backup)

Backup is one Settings page since 2026-10-05 (`Settings → Backup`); the
Advanced tab is gone and the folder, archives, restore-tested nudge and
retention count live on that page. **Back up now** and **Restore** each ask for
confirmation first, and cancelling changes nothing. A new backup takes **no
passphrase** — use an encrypted disk the OS unlocks; an archive encrypted
before this change is restored through the passphrase field in the restore
dialog.

The archive format is tested here — a seeded practice is backed up, restored
into a fresh data directory, and one note compared character for character.
What is **not** tested is any of it on a real practice on a real disk.

| Check | ☐ | Notes |
| --- | --- | --- |
| Settings → Backup → **Back up now** confirms, then writes a file, and says it was checked | ☐ | |
| **Change backup location** opens prefilled with the saved folder; saving applies it and cancelling restores the saved one | ☐ | |
| The archive opens in Finder and `notes/` is readable in TextEdit | ☐ | This is the "Apunta is gone in 2035" path |
| `plans/` holds one document per plan version | ☐ | |
| `shasum -a 256 apunta.db` matches the fingerprint in `manifest.json` | ☐ | |
| Changing the location to `~/Documents` shows the iCloud warning | ☐ | Depends on §1 items 2 and 3. The warning now says to put the archive on an encrypted disk instead |
| An archive encrypted before 2026-10-05 restores with the passphrase asked for in the restore dialog | ☑ Linux, 2026-09-01 — the Mac pass is what this row is still for | New backups are not encrypted in-app and take no passphrase |
| The standalone `decrypt.mjs` in RESTORE.txt decrypts it on **this** Mac | ☑ Linux, 2026-09-01 — copied out of a real archive by hand exactly as the file instructs, decrypted, and the resulting database matched its manifest fingerprint. The readable `notes/<patient>/<date>.txt` files were all there, which is the "Apunta is gone in 2035" path working. **Still unconfirmed on macOS**, whose `unzip` is what this row exists for. A wrong passphrase used to answer with a Node crypto stack trace and now says so in English | `node decrypt.mjs <backup>.zip "<passphrase>"` |
| The daily automatic backup happens on the first launch of a day | ☐ | Settings shows the time |

**Then do the restore by hand, once, on a spare copy.** In Apunta, Settings →
Backup → **Restore** names the archive it is about to bring back and confirms
before writing anything. On the command line, follow RESTORE.txt path 2 into a
copy of the data folder rather than the real one:

```sh
cp -R ~/Library/Application\ Support/Apunta /tmp/apunta-restore-test
APUNTA_DATA_DIR=/tmp/apunta-restore-test npm start
```

| Check | ☐ |
| --- | --- |
| The notes come back | ☐ |
| Settings → Backup records that a restore has been verified | ☐ |

A backup that has never been restored is a hypothesis.

---

## 5. The LaunchAgent

`scripts/install-launchagent.sh` has never run: there is no `launchctl` in the
container. The plist is tag-balanced and the flags are the documented ones.

```sh
bash scripts/install-launchagent.sh --dry-run   # read the plist first
bash scripts/install-launchagent.sh
```

| Check | ☐ | Notes |
| --- | --- | --- |
| `launchctl print gui/$(id -u)/com.apunta.server` shows it running | ☐ | |
| The app is up after a logout and login | ☐ | |
| No log file appears anywhere | ☐ | Output goes to `/dev/null` on purpose |
| `TMPDIR` in the agent's environment is a per-user path | ☐ | This is §1 item 8 |
| `--uninstall` removes it completely | ☐ | |

---

## 6. The eval

`npm run eval` has only ever run against the fake provider. In that mode it is
a self-test of the scorer, not a measurement — it passes when the harness
*deflects* on the canned notes.

```sh
npm run eval -- --fake --runs 1     # ~1s, proves the harness can still see a fabrication
npm run eval -- --runs 3 --out eval-report.md
```

The real run is 20 fixtures × 3 runs and will take a while.

| Check | ☐ | Notes |
| --- | --- | --- |
| The report leads with fabrication rate | ☐ | |
| "Context full" is 0 | ☐ | Anything else means Ollama truncated the prompt from the head, dropping the instructions and keeping the patient material. Those runs are failures that read as passes |
| No gating F1 or F6 hits | ☐ | Each one is named in the report with the string that tripped it |
| Read fixtures 03, 09, 10 and one of 12/18/20 by hand | ☐ | Rubric §11 lists what a script cannot check: unsupported inference in her own vocabulary, over-hedging, register, and section routing |
| Read fixture 15's output before believing its label | ☐ | The patient left early; that belongs in Objective. A model that files it under Plan fails correctly for a reason the report renders as "invented a plan" |

To compare two models:

```sh
APUNTA_EVAL_MODELS=gemma4:12b-it-qat,qwen3.5:4b-q4_K_M npm run eval
```

---

## 7. The installer — M8

**Nothing in this section has ever run.** The Swift app shell has never been
compiled: there is no Swift toolchain in the container it was written in, and
AppKit does not exist off macOS. `scripts/package-mac.sh` has never executed a
line beyond its own refusal. Everything below is therefore a first run, not a
regression check, and a surprise here is a finding rather than a bug report.

What *was* verified before it shipped, so you know where the line is: the pins
(Node 24.19.0 and `ollama-darwin.tgz` by SHA-256, read from their publishers),
the contents of the Ollama tarball, the minimum macOS version read out of the
shipped binaries' `LC_BUILD_VERSION`, every licence in
`THIRD-PARTY-LICENSES.md`, and all of the first-run *logic* — disk arithmetic,
model tier, checksum, download resume — which has 114 unit tests.

### 7.1 Build it

```sh
npm run package:mac -- --dry-run    # read the plan first
npm run package:mac
```

| Check | ☐ | What "wrong" looks like |
| --- | --- | --- |
| The dry run prints ten steps and builds nothing | ☐ | — |
| `swiftc` is present without installing Xcode | ☐ | The "no new toolchain" claim was wrong and the shell needs a rethink. `xcode-select --install` then `swiftc --version` |
| The Swift shell compiles | ☐ | **Most likely thing on this page to fail.** ~700 lines of AppKit that no compiler has ever seen |
| `whisper.cpp` compiles from the pinned tag | ☐ | cmake missing, or the tag moved |
| The build never mentions ffmpeg | ☐ | `WHISPER_COMMON_FFMPEG` crept back in |
| `codesign --verify --deep --strict` passes | ☐ | Something is unsigned or was modified after signing |
| `dist-mac/Apunta.dmg` exists | ☐ | — |
| **Write down the .dmg's size** | ☐ | Estimated at 170–200 MB, against the packet's "roughly ~100 MB" guideline. The estimate is arithmetic on measured component sizes, not a built artifact |

Then, out of curiosity rather than necessity:

```sh
npm run package:mac -- --drop-mlx
```

| Check | ☐ | Notes |
| --- | --- | --- |
| It still starts, and still drafts a note | ☐ | Apunta never uses MLX-format models — Ollama's MLX engine ignores the JSON schema. If dropping the runners is safe it saves ~380 MB uncompressed and this becomes the default |

### 7.2 Install it the way she will

Ideally on a Mac that has never had Homebrew, Node or Ollama.

| Check | ☐ | Notes |
| --- | --- | --- |
| The `.dmg` opens and shows Apunta beside an Applications shortcut | ☐ | |
| **The Gatekeeper dialog says what `docs/INSTALL.md` §2 says it says** | ☐ | The single most important row here. Wrong instructions dead-end exactly the person this packet exists for. Photograph each screen and correct the doc from the photos |
| System Settings → Privacy & Security → **Open Anyway** is present and works | ☐ | If Control-click → Open is somehow still available on her macOS, say so — the docs assume it is gone |
| The menu-bar icon appears | ☐ | An accessory app has no Dock icon on purpose |
| **Every helper actually spawns** | ☐ | The ad-hoc-signing failure mode is "the app opens and does nothing". If the first-run window never appears, this is why |
| macOS never asks for microphone permission in Apunta's name | ☐ | The mic is the browser's. If it asks, `Info.plist` needs `NSMicrophoneUsageDescription` with an honest sentence |

### 7.3 First run

| Check | ☐ | Notes |
| --- | --- | --- |
| The window names the model it chose and the memory it read | ☐ | Check the number against this Mac |
| It names the publisher and links their terms **before** downloading | ☐ | This is what keeps the weights at arm's length |
| The disk figure matches what Finder says is free | ☐ | Decimal GB on both sides |
| The progress bar moves, and the time remaining is roughly right | ☐ | |
| It finishes and opens the browser by itself | ☐ | |
| It lists **two** downloads: the speech model and the writing model | ☐ | `ggml-tiny.en.bin`, ~75 MB, and the tier's Ollama tag. The step "The model that shows your words as you speak" is still listed, and must show as **not needed** — the preview runs on the same `tiny.en` file the note does, so it is downloaded once under the speech step (2026-09-20; never run on a Mac) |
| The disk figure counts the whisper file once, not twice | ☐ | `installer/src/plan.ts` drops the preview step from `requiredBytes` when the two filenames match. ~75 MB of whisper, not ~150 MB |
| After first run, dictation shows words within a couple of seconds | ☐ | `tiny.en` is the smallest whisper, so the first words should be quick — but no per-model preview latency has been measured on a Mac, and there is no larger model to compare against any more. `/api/health` does not report which model ran; the server log line `transcription finished` names it |
| **Record a note and get a draft, without ever opening Terminal** | ☐ | The whole packet, in one row |

### 7.4 The failure paths

Each of these has a sentence written for it. Confirm the sentence appears and
that **Try again** works.

| Check | ☐ | How to cause it |
| --- | --- | --- |
| Not enough disk | ☐ | Fill the disk, or temporarily point `APUNTA_DATA_DIR` at a small volume |
| Network lost mid-download | ☐ | Turn off wi-fi during the speech-model download |
| **Killed mid-download, then relaunched — it resumes** | ☐ | Force Quit during the download. Acceptance criterion |
| Cancelled by pressing Stop | ☐ | Nothing lost; the next run continues |
| A corrupted download | ☐ | Truncate the `.part` file in `models/` by hand. It should refuse, delete it, and start clean |
| A tag that no longer exists | ☐ | Only if `ollama pull` 404s. The message says retrying will not help, which is true |

### 7.5 Quit, relaunch, and no orphans

| Check | ☐ | Notes |
| --- | --- | --- |
| Quit from the menu bar, then `pgrep -fl 'ollama|whisper-cli|Apunta'` prints nothing | ☐ | The one behaviour most likely to be quietly wrong |
| Relaunch: it reuses the models and starts in seconds | ☐ | No second download |
| Double-clicking Apunta while it is running re-opens the tab rather than starting a second copy | ☐ | |
| If port 7717 is taken, it picks another and opens that | ☐ | Start a dev server first, then the app |

### 7.6 The privacy claim, on the real artifact

| Check | ☐ | Command |
| --- | --- | --- |
| The running app talks to nothing but loopback | ☐ | With Apunta open and idle: `lsof -nP -i -a -p $(pgrep -f 'Apunta.app/Contents/MacOS/Apunta')` |
| The AI runtime talks to nothing but loopback once the models are down | ☐ | Same, for `pgrep -f Contents/Helpers/ollama` |
| No log file anywhere in the data folder | ☐ | `find "$HOME/Library/Application Support/Apunta" -name '*.log'` |

### 7.7 Uninstall

```sh
bash scripts/uninstall-macos.sh --dry-run
bash scripts/uninstall-macos.sh
```

| Check | ☐ | Notes |
| --- | --- | --- |
| The app, the models and the LaunchAgent are gone | ☐ | |
| The notes folder is still there | ☐ | The default must never delete notes |
| `--everything` asks twice before deleting notes | ☐ | |
| Nothing is left behind afterwards | ☐ | `ls ~/Library/LaunchAgents`, `ls "$HOME/Library/Application Support"` |

---

## 8. Two things to record while you are there

Both are still open, and both are cheap to capture once the Mac is in front of
you (`docs/research/m8-bundling-2026-08.md` §11).

| Item | ☐ |
| --- | --- |
| For each RAM tier's model: the real download size, so `installer/src/catalog.ts`'s `approxBytes` stops being a guess. `ollama pull` prints it | ☑ small tier only (M10, 2026-08-26): 3,389,983,735 bytes from the registry manifest, pinned. The 12B and 35B still await a machine that pulls them |
| A SHA-256 for `ggml-tiny.en.bin`, computed after the published SHA-1 matches, then pinned in `installer/src/catalog.ts` as `sha256`. M8's downloader should not verify a model file with SHA-1 alone — whisper.cpp publishes SHA-1 only | ☑ done 2026-09-20 on Linux, on a real 77,704,715-byte download: whisper.cpp's published SHA-1 `c78c86eb1a8faa21b369bcd33207cc90d64ae9df` matched, and Apunta's own SHA-256 `921e4cf8686fdd993dcd081a5da5b6c365bfde1162e72b08d75ac75289920b1f` was computed from it and is pinned for both the note and the preview entry, asserted by a test. (The superseded turbo model's `394221709c…` was pinned the same way in M10.) Still to do on the Mac: confirm the downloader's own verification passes end to end there |
| Whether the three model tags still exist in Ollama's library, and what licence each one's page actually names. `THIRD-PARTY-LICENSES.md` says these are unread | ☑ tags: all three exist (registry manifests, 2026-08-26). Licence: read for the small tier only (Apache-2.0, via `ollama show --license`); Gemma terms and the 35B's blob still unread |
| SQLite's public-domain statement, from `sqlite.org/copyright.html` — the one quotation in the licence file without a same-session source | ☑ read live in M10; the quote was missing a sentence and is now corrected in `THIRD-PARTY-LICENSES.md` |

---

## 9. The config pack, and how it was made (M10, 2026-08-27)

The zip her Mac restores on first run. Built on the partner's Linux machine
against the production server (`server/dist`), in fake-AI mode — creating a
format and a backup never touches a model. Every step below was executed,
and the restore was then verified for real: the same zip staged through
`POST /api/backup/restore` on a second fresh data dir came back with the
format, its instructions, and the model setting intact.

The recipe, repeatable on any machine with the repo:

1. `npm run build`, then start the server against an empty data dir:
   `APUNTA_DATA_DIR=/tmp/apunta-pack APUNTA_FAKE_AI=1 node server/dist/index.js`
   and open `http://127.0.0.1:7717`.
2. The first-run screen is the format onboarding. **My standard progress
   note** is first and already selected; press **Continue**. That creates
   `Progress note` with her seven sections in order (`Location, Client
   presentation, Risk review, Discussion, Intervention, Out of session
   actions, Note for next session`) and her drafting instructions
   (`docs/note-instructions/owner-progress-instructions.md`, bundled in the
   app since 2026-09-22). Before that date this step was **Describe it
   myself** plus pasting the instructions by hand.
3. The next screen asks for a patient. **Do not add one** — the pack must
   carry zero patients. Open **Settings** (a modal over the workspace, not a
   route) instead; the `/settings` route is gone.
4. Check it: Settings → Note formats → **Edit** shows the format name as the
   heading itself and the seven sections below it, with a **Saved** marker
   beside the back arrow once the server holds them. There is no Save button
   and **no Instructions panel any more** (2026-10-05): the instructions stay
   stored on the format and are still written onto it by first run, starting
   "You are drafting a clinical note for a licensed therapist". Nothing to
   paste. (The instructions replace the built-in defaults entirely; they carry
   their own anti-fabrication core.) Confirm them with
   `GET /api/formats` rather than on screen.
5. Pin the model. There is no Settings field for it, deliberately, so:
   `curl -X PUT 127.0.0.1:7717/api/settings -H "content-type: application/json"
   -d '{"llm_model":"qwen3.5:4b-q4_K_M"}'`
6. The optional `stt_vocabulary` setting remains supported by the API for
   existing deployments, but this pack intentionally leaves it unset. The
   removed Settings → Recording editor is not being restored, and no owner
   vocabulary-list step is pending.
7. Settings → Backup → **Back up now**, and confirm when asked. The zip appears
   in `<data dir>/backups/apunta-backup-<date>.zip`; its `manifest.json` must
   say `"patients": 0` and `"note_formats": 1`. If you back up more than
   once, the app records `last_backup_*` bookkeeping settings; empty them
   (`PUT /api/settings` with `""` values, which the app reads as "never")
   and re-cut so the pack does not carry another machine's paths.

The pack produced this way (manifest db sha256 `2b7c9249…`, 2026-08-27,
instruction revision 3 — the measured 40.0% configuration) is at
`~/Apunta-config-pack/apunta-config-pack.zip` on the partner's machine. On her Mac: Settings → Backup → **Restore**, pick that
file, confirm, then quit and reopen. `whisper_binary` is deliberately not in
the pack — each machine sets its own; the bundled app needs none.

| Check | ☐ | Notes |
| --- | --- | --- |
| Pack restores on the Mac with format + instructions + model pin intact | ☐ | Verified Linux→Linux in M10; the Mac pass is what this row is for |
| No vocabulary-list step is pending; the existing API setting remains available | — | Deliberately excluded from this pack by the owner decision |

---

## What to do with a failure

Write it down here rather than fixing it in passing. Several of these checks
are the first evidence anyone has had about the corresponding claim, and a
surprising result is worth more as a recorded finding than as a silent patch —
that is how the ffmpeg dependency and the MLX structured-output trap were both
caught.
