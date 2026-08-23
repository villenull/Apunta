# Apunta — checking the Mac before you trust it with anything real

Apunta was written on a Linux machine that is not your Mac. A handful of things
about *your* Mac were assumed rather than checked — where the notes end up,
whether the disk is encrypted, whether iCloud quietly copies an export to
Apple, whether the AI model is the one the app expects. This turns those
assumptions into answers.

There is one command to run. It reads; it changes nothing.

---

## Run it

Open Terminal, go to the folder holding this file and `preflight-macos.sh`
(you can type `cd ` and then drag the folder onto the Terminal window), and:

```sh
bash preflight-macos.sh
```

That is all. It takes about half a minute, prints a report, and ends with a
short list headed **"Do these in order"**.

It cannot break anything. It does not install, download, delete, or change a
single setting — everything it thinks you should change, it prints as a
suggestion for you to run yourself. You can run it as many times as you like,
before or after the app is set up, and it is worth re-running after you change
anything it flagged.

Useful extras:

```sh
bash preflight-macos.sh --checksum      # also verify the speech model file (slower)
bash preflight-macos.sh --no-color      # plain text, easier to paste into a message
bash preflight-macos.sh --help          # all the options
```

The report contains no patient information, no serial number, and no
certificate names, so it is safe to send to whoever is helping you. It does
show folder paths, which include your Mac's user name.

---

## What it looks at, and why each one matters

**Your Mac, and which model it should run.** Apunta picks a different AI model
depending on how much memory the Mac has. The script prints the memory it
actually found and the model that rule picks, so the rule can be checked
against your machine rather than assumed. It also prints how much of that
memory the graphics chip can actually use, which is the number that decides
whether the model runs fast or crawls.

**FileVault.** See the section below — this is the important one.

**Where the notes would live.** Apunta keeps everything in one folder, and a
few things about that folder matter more than they sound: whether it is inside
a folder that iCloud or Dropbox syncs (which would send the notes off the Mac
and can corrupt the database), whether other accounts on the Mac can read it,
and whether Spotlight has indexed anything inside it.

**Desktop and Documents.** These are the two folders iCloud syncs by default,
and they are exactly where a person naturally saves an export. If they are
synced, a file of clinical notes saved there is uploaded to Apple. Worse, if
"Optimize Mac Storage" is on, macOS can quietly replace a backup you never open
with an empty placeholder — and a Time Machine backup of a placeholder is still
a placeholder. The script tells you whether either is switched on, and whether
files on your Mac have already been emptied out this way.

**Time Machine.** Whether you have a backup at all, whether the backup disk is
encrypted, and whether the Apunta folder is being backed up or has been
excluded. The backup that does not exist is the most likely way this data is
lost — more likely than anything an intruder does.

**The AI.** Whether Ollama is installed and running, which models are on the
Mac, and — the fussy one — whether each model is in the format that actually
enforces the note's structure. A model in the wrong format returns something
that looks fine and quietly ignores the rules, with no error, so this is worth
knowing before rather than after.

**Speech-to-text and the toolchain.** Whether whisper.cpp, its model file,
ffmpeg and Node are present and the right versions.

---

## FileVault — worth reading slowly

FileVault is macOS's disk encryption. It is the single most valuable thing on
this list, and it is not on by default on every Mac — recent Apple laptops do
not always ask about it when you first set them up, so "it's a new Mac, it must
be encrypted" is not safe to assume. The script checks it directly and says so
plainly.

**What it protects you from.** If the Mac is lost, stolen, sent for repair, or
sold, FileVault means the disk is unreadable to whoever ends up with it. Without
it, anyone who takes the laptop can read every note, transcript and draft on it
without knowing your password — they do not need to log in, only to take the
drive out. This is the difference between a lost laptop and a disclosure.

**What it does not protect you from — and this matters just as much.** While
the Mac is switched on and you are logged in, FileVault is doing nothing at
all. The disk is unlocked. Anyone sitting at your unlocked Mac — a partner, a
teenager, a visitor, someone passing your desk — can open Apunta and read
everything, whether FileVault is on or off. FileVault is not a lock on the
notes; it is a lock on the *hardware*, for when the hardware is out of your
hands.

The everyday version of that protection is different and simpler: lock the
screen when you walk away (Control-Command-Q), require the password
immediately when the screen wakes, and do not use automatic login. If the Mac
is shared with anyone at all, a separate macOS user account just for the
practice is a bigger improvement than anything in the app.

**If the script says FileVault is off:** System Settings → Privacy & Security →
FileVault → Turn On. Save the recovery key somewhere that is not the Mac — a
password manager, or paper somewhere safe. Encrypting runs in the background
and you can keep working. Do it before entering anything real.

**If it says "deferred enablement":** it is switched on but waiting for you.
Log out and back in and it will finish.

---

## If the report flags something — what to do

Take them in the order the script prints them; it puts the things that block
other things first.

| What the report says | What to do |
| --- | --- |
| **FileVault is OFF** | System Settings → Privacy & Security → FileVault → Turn On. Keep the recovery key off the Mac. Do this before real notes go in. |
| **No Time Machine destination configured** | System Settings → General → Time Machine → Add Backup Disk. When it asks, tick **Encrypt Backup Disk** — this choice can only be made now, never later. |
| **The backup disk is NOT encrypted** | There is no way to switch encryption on for an existing backup. Remove the disk in Time Machine settings, erase it, and add it again with **Encrypt Backup Disk** ticked. Until then, treat that disk as if it were an unlocked filing cabinet. |
| **Desktop & Documents Folders sync is ON** | Not necessarily something to change — but do not save Apunta exports or backups into Desktop or Documents while it is on. Keep them in the Apunta folder, or on an encrypted external disk. |
| **Files are already evicted (dataless)** | "Optimize Mac Storage" is emptying files out from under you. Either turn it off (System Settings → your name → iCloud) or, more simply, keep backups out of the synced folders. |
| **The data directory is under iCloud / Dropbox / OneDrive** | Move it back. Apunta's database is not safe inside a folder a sync service is managing — it can be corrupted, and the notes leave the Mac. Unset `APUNTA_DATA_DIR` to return to the default. |
| **The data directory is EXCLUDED from Time Machine** | Something excluded it. Remove the exclusion in System Settings → General → Time Machine → Options, or accept that Time Machine holds no copy of your notes. |
| **Automatic login is enabled** | Turn it off: System Settings → Users & Groups → "Automatically log in as" → Off. Otherwise a restart unlocks everything without a password. |
| **Model does not report format=gguf** | That model would quietly ignore the note's structure. Remove it (`ollama rm <name>`) and use the tag the report names for your Mac. |
| **The tier model is not pulled** | Run the `ollama pull ...` line the report prints. It is a large download; do it on a connection you do not mind using. |
| **Nothing is answering at 127.0.0.1:11434** | Ollama is not running. Open the Ollama app, or run `ollama serve`, then run the check again. |
| **OLLAMA_DEBUG is set** | Turn it off. With it on, Ollama writes the full text of every prompt — which is your patients' words — into a log file that stays on disk. |
| **whisper-cli is not installed** | Only needed for recording audio; typed notes work without it. `brew install whisper-cpp` when you get to it. |
| **Permissions warning on the data folder** | Low urgency while the folder is in its normal place. The report prints the exact `chmod` line if you want to tighten it. |
| **Something says UNKNOWN** | The script could not read that setting — often because Terminal needs Full Disk Access (System Settings → Privacy & Security → Full Disk Access). Nothing is wrong; it just could not tell. |

---

## The two things a script cannot do

### 1. Actually run a note through the model

Everything automated in this project runs against a fake AI. That proves the
app's plumbing and nothing whatsoever about the model. One command puts a real
dictation through the real model and inspects what comes back:

```sh
npm run build
npm run smoke:live -- --runs 5
```

**The `--` in the middle is not optional.** Without it npm swallows the flag
and you get a single run while believing you asked for five. (The README's
shorthand, `npm run smoke:live --runs 5`, silently does one run.)

**Why five and not one.** The specific failure this is looking for is a model
falling into a repetition loop — writing `own own own own own…` for hundreds of
words — when it is asked to produce free-form clinical text inside a fixed
structure. In the bug report upstream it happened on 60–100% of attempts, which
means it is intermittent: one clean run is genuinely weak evidence, and five
runs that are all clean is the first real reason to believe the model works.
The check also catches three quieter failures — a prompt so long the model
silently dropped the instructions off the front, generation that stopped
mid-sentence at the token limit, and weights whose engine ignores the required
structure altogether.

If any run fails, the output names which failure it was. That is the moment to
stop and fix it, not to try again until it passes.

### 2. Settle whether Spotlight can read the text inside an exported note

The script checks whether a Markdown reader is installed for Spotlight, which
is a good hint, but the definitive test requires writing a file — and this
script writes nothing. If you want the answer:

1. Make a file called `spotlight-test.md` in your Documents folder containing
   one nonsense word, e.g. `zzqqxwordtest`.
2. Wait a minute.
3. In Terminal: `mdfind zzqqxwordtest`

If the file comes back, Spotlight is reading the *contents* of Markdown files —
which means exported notes saved as `.md` anywhere on the Mac are full-text
searchable by anyone using the machine. Delete the test file afterwards.

---

## Where these checks came from

Each item traces to a claim in the project's research that was explicitly marked
as unverified. The script prints the claim it is testing next to each check, so
a surprising result reads as "this is the thing that was assumed, and here is
what your Mac actually says".

| Source | What it left open |
| --- | --- |
| `docs/research/data-at-rest-2026-08.md` §7 | Nine unverified claims: FileVault, iCloud Desktop/Documents sync, Optimize Mac Storage, Time Machine destination encryption, Spotlight indexing of `~/Library`, Markdown content indexing, Time Machine exclusions, `TMPDIR` resolution, password strength |
| `docs/research/m3-preflight-2026-08.md` §1, §3 | Model tags, sizes and context lengths could not be confirmed — `ollama.com` and `registry.ollama.ai` were unreachable — and `details.format` is the only reliable signal that a model will enforce the note's structure |
| `docs/research/m8-bundling-2026-08.md` §5, §7 | whisper.cpp ships no prebuilt macOS binary; the signing and notarization prerequisites |
| `docs/PLAN.md` §2 | The RAM-to-model table, and the assumption that Metal can use about 75% of memory |
| `README.md` | `npm run smoke:live` exists and has never been run against a real model |

One item on that list the script deliberately does not touch: whether your login
password is a good one. FileVault's protection is exactly as strong as that
password, and nobody but you can judge it. If it is short, reused, or guessable
by someone who knows you, change it — that is the whole of FileVault's security
resting on it.
