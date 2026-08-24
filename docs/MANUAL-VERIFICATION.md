# The things only a Mac can settle

Apunta was built end to end inside a Linux container. Everything in it that
touches macOS — the setup script, the FileVault check, opening a browser, the
LaunchAgent, and the model itself — has been **written and syntax-checked but
never run**. This is the list of what that leaves open, in the order worth
doing it, with the exact command for each.

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
| 1 | Is FileVault on? | `fdesetup status` | ☐ | The whole at-rest story. Without it, anyone who takes the laptop reads every note without knowing a password. `/api/health` and `/setup` now report this; **confirm the app's answer matches the command's.** |
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
| The speech model downloads and its SHA-1 matches | ☐ | **The Hugging Face URL was never fetched.** A 404, or a checksum mismatch meaning the published file changed |
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
| `/setup` shows every row green | ☐ | Ollama, writing model, whisper, speech model, FileVault |
| `/setup` says "You're fully local — nothing leaves this Mac." | ☐ | It must **not** say this while FileVault is off |
| Turning FileVault off and re-checking turns that row red | ☐ | Only if you are willing to; the wording matters more than the test |
| `/about` shows the real database path | ☐ | |
| Recording a note works end to end | ☐ | The whisper half has never run either |

---

## 4. Back up and restore

The archive format is tested here — a seeded practice is backed up, restored
into a fresh data directory, and one note compared character for character.
What is **not** tested is any of it on a real practice on a real disk.

| Check | ☐ | Notes |
| --- | --- | --- |
| Settings → Back up now writes a file, and says it was checked | ☐ | |
| The archive opens in Finder and `notes/` is readable in TextEdit | ☐ | This is the "Apunta is gone in 2035" path |
| `plans/` holds one document per plan version | ☐ | |
| `shasum -a 256 apunta.db` matches the fingerprint in `manifest.json` | ☐ | |
| Choosing `~/Documents` as the destination shows the iCloud warning | ☐ | Depends on §1 items 2 and 3 |
| An encrypted backup opens with the passphrase | ☐ | |
| The standalone `decrypt.mjs` in RESTORE.txt decrypts it on **this** Mac | ☐ | Already verified in the test suite: the script is extracted from a real archive, written to a file, and run — it produces a zip whose manifest fingerprint matches. What is unconfirmed is only that macOS's `unzip` and Node behave the same way. `node decrypt.mjs <backup>.zip "<passphrase>"` |
| The daily automatic backup happens on the first launch of a day | ☐ | Settings shows the time |

**Then do the restore by hand, once, on a spare copy.** Follow RESTORE.txt
path 2, into a copy of the data folder rather than the real one:

```sh
cp -R ~/Library/Application\ Support/Apunta /tmp/apunta-restore-test
APUNTA_DATA_DIR=/tmp/apunta-restore-test npm start
```

| Check | ☐ |
| --- | --- |
| The notes come back | ☐ |
| Settings → "I have done this" records it | ☐ |

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

## 7. Two things to record while you are there

Both are for M8, and both are cheap to capture once the Mac is in front of you
(`docs/research/m8-bundling-2026-08.md` §11):

| Item | ☐ |
| --- | --- |
| For each RAM tier's model: the GGUF repo, filename, byte size, SHA-256 and weights licence. Append to `docs/research/macos-setup-verification.md` | ☐ |
| A SHA-256 for `ggml-large-v3-turbo-q5_0.bin`, computed after verifying the published SHA-1. M8's downloader should not verify a 547 MB file with SHA-1 | ☐ |

---

## What to do with a failure

Write it down here rather than fixing it in passing. Several of these checks
are the first evidence anyone has had about the corresponding claim, and a
surprising result is worth more as a recorded finding than as a silent patch —
that is how the ffmpeg dependency and the MLX structured-output trap were both
caught.
