# Apunta — data at rest and backup design

**Status:** research + design proposal. Nothing here is implemented.
**Date:** 2026-08-22
**Trigger:** `docs/feedback/2026-08-22-owner-answers.md` answers 3 + 10 — the note is
pasted into another records system *and* Apunta keeps its own copy forever. This
laptop is now a second complete copy of every clinical record, and it is the copy
with no institutional backup, no IT department and no retention policy behind it.

> **This is engineering research, not legal or compliance advice.** HIPAA, state
> record-retention law and her licensing board's rules are questions for her
> attorney and her professional body. Where those regimes are mentioned below it
> is only to explain *why an engineering choice matters*, never to tell her what
> she is required to do.

### How claims here were verified

This session's egress policy blocks direct fetches of `sqlite.org`,
`support.apple.com` and `eclecticlight.co` (403 from the proxy), so primary pages
could not be read end-to-end. Every factual claim is tagged:

| Tag | Meaning |
| --- | --- |
| **[L]** | Verified locally — I ran it or read it in this repo / `node_modules` |
| **[W]** | Verified through web-search summaries of the cited primary page, not a direct read of it |
| **[I]** | Inference or reasoning, explicitly not verified |

Anything tagged **[I]** that matters is listed in §7 with the exact command to
settle it on the actual Mac. Do not ship a doc claim to the owner on **[I]** alone.

---

## 1. Recommendation table

| Decision | Call for v1 | Why, in one line | What would change it |
| --- | --- | --- | --- |
| **At-rest encryption of the live database (SQLCipher)** | **Stay deferred** — but rewrite the deferral, it is currently justified for the wrong reason | With no login, the key must sit on the same disk as the data, protected by the same login password FileVault already uses — so on this machine it buys ~nothing over FileVault while adding an unrecoverable-loss failure mode to a dataset with no institutional backup | She wants an app passcode; a second person uses the Mac; the data dir moves to a sync folder or external volume; the app gains a "carry it to another machine" mode. **Passcode and SQLCipher must be adopted together or not at all** — see §4 |
| **FileVault** | **Promote from assumption to a checked precondition.** First-run and Settings read `fdesetup status`; if off, say so in plain language and refuse to call the app "private" | It is the whole at-rest story and it is *not* implied by Apple silicon — without it the volume key is protected only by the hardware UID, i.e. by nothing she knows | Nothing. This is the highest value-per-line-of-code item in the whole document |
| **File permissions** | Create the data dir `0700`, `chmod 0600` the db, `-wal`, `-shm`, `audio/` | Node/SQLite defaults give `0755`/`0644` **[L]**; harmless while the dir is inside `~/Library` (mode 700), wrong the moment `APUNTA_DATA_DIR` points somewhere shared | Nothing — do it |
| **Backup format** | One zip containing (a) `apunta.db` produced by `VACUUM INTO`, (b) plain-text notes per patient, (c) `data.json`, (d) `manifest.json`, (e) `RESTORE.txt` | The `.db` is the restore path; the text files are the "app is gone in 2031" path; you need both and M7 currently plans only the second | Nothing. Note this *changes* M7 deliverable 4, which does not currently include the db |
| **Backup cadence** | Automatic, once per day, on first launch of the day; plus a manual "Back up now"; keep 14 daily + 12 monthly, prune the rest | She writes in one end-of-day batch (answer 2), so a daily snapshot loses at most one batch, and the pruning ladder gives her "I deleted that three weeks ago" | She starts writing throughout the day |
| **Backup destination** | Default `<dataDir>/backups/`; offer "Choose a folder…"; **warn loudly** for `~/Documents`, `~/Desktop`, `~/Library/Mobile Documents`, `~/Library/CloudStorage`, `~/Dropbox`, `~/Google Drive`, `~/OneDrive` | The data dir is inside the FileVault boundary and is picked up by Time Machine; `~/Documents` and `~/Desktop` are the two folders iCloud syncs by default, and iCloud can evict a backup to a 0-byte placeholder **[W]** | She gets an encrypted external drive — then that becomes the recommended target |
| **Backup encryption** | Backups **inside** the data dir: none (FileVault covers them). Backups **leaving** the machine: encrypted, and prefer *an encrypted APFS volume* over encrypting the zip in-app | The container is the part she can actually operate and that macOS will remember the key for; bespoke passphrase crypto adds a way to lose the archive permanently | She needs to hand a single file to someone — then add optional AES-256-GCM zip encryption with the passphrase in her password manager and `RESTORE.txt` left readable outside the blob |
| **Deletion behaviour** | `PRAGMA secure_delete = ON`, `PRAGMA journal_size_limit`, never run bare `VACUUM`, and **say in the UI that deleting does not reach her backups** | Cheap hygiene that is honest about its limits; the UI copy is the part that actually matters, because APFS snapshots and Time Machine keep deleted notes long after the app forgets them | Nothing, though see §2 on why `secure_delete` is hygiene and not a security control |
| **Retention affordances** | Keep-everything stays the default. Add a Settings panel that *shows* what "everything" now is (oldest note, note count, patient count, db size), an opt-in "flag notes older than N years for review", and never an auto-delete | Her call, and overriding it would be wrong — but a number on screen turns a default into a decision she revisits | Nothing. Auto-deletion of clinical records must never be a default, in either direction |
| **Logs** | Fastify's logger must never receive note text; a LaunchAgent must not redirect stdout to a permanent file; `OLLAMA_DEBUG` must never be set by our scripts or app | `OLLAMA_DEBUG=1` is documented to put prompts and responses into `~/.ollama/logs/server.log` **[W]**, and prompts contain her patients' words | Nothing — these are one-line guards |

---

## 2. Where the data actually is, on a real Mac

### 2.1 The files

From `server/src/config.ts` and `server/src/db/index.ts` **[L]**:

| Path | What it is |
| --- | --- |
| `~/Library/Application Support/Apunta/` | data dir (`APUNTA_DATA_DIR` overrides) |
| `~/Library/Application Support/Apunta/apunta.db` | every patient, note, transcript and refine-chat message |
| `…/apunta.db-wal` | write-ahead log — **contains recently written note text not yet in the main file** |
| `…/apunta.db-shm` | WAL shared-memory index; regenerable, carries no durable content |
| `…/audio/<uuid>.<ext>` | M5 recordings; deleted after transcription unless `keep_audio` is on |
| `…/models/ggml-large-v3-turbo-q5_0.bin` | ~574MB, no PHI |
| `…/backups/` | proposed by this document, does not exist yet |

The database is opened with `journal_mode = WAL`, `foreign_keys = ON`,
`busy_timeout = 5000` **[L]**. Bundled SQLite is **3.53.4**, via
`better-sqlite3` 13.0.3, prebuilt for `darwin-arm64` **[L]**.

### 2.2 Permissions — a real (small) finding

I created a database with this repo's exact `better-sqlite3` build under the
default umask (022) **[L]**:

```
dir mode 755
apunta.db      644
apunta.db-wal  644
apunta.db-shm  644
```

`mkdirSync(…, {recursive:true})` gives `0755` and SQLite creates the file `0644`.
On a stock Mac this is *currently* harmless: `~/Library` is `0700`, so no other
local user can traverse into it. It stops being harmless the moment
`APUNTA_DATA_DIR` points at an external drive, `/Users/Shared`, or a second
account's readable path — and `APUNTA_DATA_DIR` is a documented, supported knob.

**Fix:** `mkdirSync(dataDir, {recursive:true, mode:0o700})` plus an explicit
`chmodSync(0o600)` on the db and its sidecars after open, and the same for
`audio/`. Three lines, no downside.

### 2.3 Temp files — the surprising one

SQLite's temp-file directory is resolved as `PRAGMA temp_store_directory`, then
`SQLITE_TMPDIR`, then `TMPDIR`, then `/var/tmp`, then `/usr/tmp`, then `/tmp`
**[W]** ([sqlite.org/tempfiles.html](https://sqlite.org/tempfiles.html),
[lang_vacuum](https://system.data.sqlite.org/home/doc/8e13c43294410407/Doc/Extra/Core/lang_vacuum.html)).
The rollback journal and super-journal always go to disk next to the database
regardless of `temp_store`; the *other* temp files — materialised subqueries,
transient indices, and **the temporary database used by `VACUUM`** — follow that
resolution chain **[W]**.

That last one is the finding: a bare **`VACUUM` writes a complete copy of the
database into the temp directory**, and needs roughly twice the database size in
free space to do it **[W]**. On macOS `TMPDIR` is normally the per-user
`/var/folders/…/T/` directory, which is on the same FileVault-protected volume —
so this is not a catastrophe. But it is a full second plaintext copy of every
clinical note, in a directory nothing in this project manages, with a lifetime
nobody controls, and if `TMPDIR` is ever unset (a LaunchAgent, a packaged app
shell, a cron-ish context) the chain falls through to `/var/tmp` or `/tmp`, which
are world-traversable.

Current pragmas are all defaults **[L]**: `temp_store=0`, `auto_vacuum=0`,
`secure_delete=0`, `synchronous=1` (NORMAL, set by better-sqlite3's build).

**Fix:** set `PRAGMA temp_store = MEMORY` at open (the working set here is
kilobytes — this costs nothing), and if a VACUUM is ever needed use
`VACUUM INTO '<dataDir>/…'` and rename, never bare `VACUUM`.

### 2.4 Logs — the second place note text can land

`server/src/app.ts` does `Fastify({ logger: options.logger ?? true })` **[L]** →
pino to stdout. Fastify's default request logging records method/URL/status, not
bodies, and Apunta's URLs carry UUIDs rather than content **[I]** — but any error
whose message or serialised payload includes note text would be logged verbatim.

Two amplifiers:

- **M7 deliverable 3's LaunchAgent.** A LaunchAgent with `StandardOutPath` /
  `StandardErrorPath` turns that stdout into a permanent file. If it lands in
  `~/Library/Logs`, that path *is* excluded from Time Machine **[W]** but is
  plainly readable by the same user, forever.
- **M8's app shell.** Tauri/Electron shells routinely capture child-process
  stdout to a log file.

- **Ollama.** By default it does not log prompt content, but `OLLAMA_DEBUG=1` is
  documented to add prompts and responses to `server.log` **[W]**
  ([ollama/ollama#10950](https://github.com/ollama/ollama/issues/10950),
  [troubleshooting](https://docs.ollama.com/troubleshooting)). A troubleshooting
  doc that tells her to "set OLLAMA_DEBUG=1 and send us the log" would be a
  direct PHI leak. Never write that sentence.

**Fix:** a redacting serialiser on the Fastify logger (M3 already owes this for
prompts — extend it to error paths); LaunchAgent stdout to `/dev/null` or to a
size-capped file inside the data dir; a lint rule or test asserting no source or
script sets `OLLAMA_DEBUG`.

### 2.5 iCloud Drive

`~/Library/Application Support` is **not** synced by iCloud under any stock
configuration. iCloud Drive syncs the `iCloud Drive` folder, plus `~/Desktop` and
`~/Documents` if "Desktop & Documents Folders" is on; other folders are not
synced **[W]** ([Apple: Add your Desktop and Documents files to iCloud
Drive](https://support.apple.com/en-us/109344)).

So the live database is safe. **The export is not.** The natural place a person
saves an export is Desktop or Documents — which are exactly the two folders the
feature syncs. Two consequences:

1. **The note text leaves the machine.** A zip of clinical records uploads to
   Apple. This does not violate hard rule 1 (the app made no network call — the
   OS did, on her behalf) but it defeats the promise the app makes on screen.
2. **The backup can silently become a 0-byte stub.** With "Optimize Mac Storage"
   on, macOS evicts infrequently-used files to placeholders — and, in Bombich's
   phrasing, *"a backup of a placeholder is still a placeholder"* **[W]**
   ([Bombich, 2026](https://bombich.com/blog/2026/07/28/local-backups-of-cloud-storage),
   [Eclectic Light](https://eclecticlight.co/2024/03/11/icloud-drive-in-sonoma-optimise-mac-storage-or-not/)).
   A backup she never opens is precisely the file macOS will evict first, and a
   Time Machine run then dutifully backs up the stub.

This is the single most surprising thing in this document, and it is the reason
the backup destination decision is not cosmetic.

**Also:** never let the *data dir* be a synced folder. SQLite over a
sync-daemon-managed directory is a corruption risk. `APUNTA_DATA_DIR` should be
rejected, not merely warned about, if it resolves under `~/Library/Mobile
Documents`, `~/Library/CloudStorage`, `~/Dropbox`, `~/Google Drive` or
`~/OneDrive`.

### 2.6 Spotlight

`~/Library` **is indexed** by Spotlight, but the results are filtered out of the
default Spotlight window; `mdfind` and tools that query the index directly still
see them **[W]** ([Eclectic Light: Why can't Spotlight find files in Library
folders?](https://eclecticlight.co/2024/11/26/why-cant-spotlight-find-files-in-library-folders/)).

What that means concretely:

- **Note *content* is almost certainly not in the Spotlight index.** Content
  indexing requires an importer for the file's UTI; `apunta.db` has none, so what
  gets indexed is filename and filesystem metadata, not `kMDItemTextContent`
  **[W]/[I]**. The database is opaque to Spotlight.
- **A markdown or text export is a different story.** `.txt` has an importer.
  Markdown historically has none — `net.daringfireball.markdown` needed a
  third-party importer **[W]**
  ([BrettTerpstra](https://brettterpstra.com/2011/10/18/fixing-spotlight-indexing-of-markdown-content/),
  [MarkdownSpotlightIndexer](https://github.com/gordon8214/MarkdownSpotlightIndexer))
  — but whether current macOS maps `.md` to `public.plain-text` is **[I]**, and
  many people install exactly such an importer (Obsidian users, for one).
  **Assume loose `.md` note files in an indexed folder are content-searchable.**
- **A `.zip` is not content-indexed** — archive members are not indexed **[I]**.
  This is a quiet argument for the zip container: the export is naturally opaque
  where loose files would not be.

Exclusion levers, for completeness: `.metadata_never_index` **no longer works
reliably at folder level** in recent macOS (it is still honoured at the root of
external volumes and disk images); what does work is a `.noindex` filename
suffix, a leading dot, `mdutil -i off` per volume, or the Spotlight Privacy list
**[W]** ([Eclectic Light: Spotlight search can be blocked by extended
attributes](https://eclecticlight.co/2025/06/16/spotlight-search-can-be-blocked-by-extended-attributes/)).

**Recommendation:** do not fight Spotlight over the database — there is nothing
there to find. Do keep exports in a container (zip), and if a `backups/` folder
of loose files ever exists, name it `backups.noindex`.

*Caveat:* macOS 26 Tahoe (current release is 26.6.2, Aug 2026 **[W]**) shipped a
substantially reworked Spotlight. Whether the `~/Library` filtering behaviour
survived unchanged is **[I]** — §7 has the command to check on her machine.

### 2.7 Time Machine

- `~/Library/Application Support` is **backed up**. Time Machine's standard
  exclusions cover system files, caches and logs — `~/Library/Caches`,
  `~/Library/Logs`, `/private/var/log`, `/private/var/vm`, `/private/var/tmp`,
  Trash — and *not* Application Support **[W]** ([Apple: Back up your Mac with
  Time Machine](https://support.apple.com/en-us/104984),
  [pondini](https://tommyang.github.io/pondini.org/TM/11.html)).
- **Hourly local snapshots** are kept on the internal disk for up to 24 hours,
  on APFS, whenever Back Up Automatically is on **[W]** ([Apple: About Time
  Machine local snapshots](https://support.apple.com/en-us/102154)).
- **The backup is taken from an APFS snapshot of the source volume**, made at the
  start of each backup **[W]** ([Eclectic
  Light](https://eclecticlight.co/2021/03/17/time-machine-to-apfs-backing-up/)).

That last point answers the "is a WAL-mode SQLite file safe to restore from a
Time Machine snapshot taken mid-write?" question, and the answer is better than
people expect:

> **Yes — for a modern APFS Time Machine setup, the restored set is
> crash-consistent, and SQLite is designed for exactly that.** An APFS snapshot
> is an atomic point-in-time view of the whole volume, so `apunta.db`,
> `apunta.db-wal` and `apunta.db-shm` are captured at the same instant rather
> than copied one at a time while a writer moves between them. What you get back
> is indistinguishable from the state after a power cut, which is the case
> SQLite's WAL recovery exists to handle: on next open it replays the WAL. **[W]
> for the snapshot mechanics, [I] for the SQLite conclusion drawn from them.**

Three caveats that must be in the restore instructions:

1. **Restore the `-wal` file with the database, or restore neither.** A `.db`
   restored without its `-wal` silently loses the most recent transactions —
   plausibly the whole evening batch. Restoring a *stale* `-wal` next to a
   *newer* `.db` is worse: SQLite will refuse or misbehave. Rule: restore both,
   or restore the `.db` alone *and delete any `-wal`/`-shm` sitting beside it*.
2. **`-shm` is disposable.** It is regenerated on open. Never worry about it,
   and never restore it alone.
3. **Pre-Big Sur / HFS+ destinations are not snapshot-based** and back up files
   individually **[W]**. Not a concern on a 2024 MacBook Pro, but if she is
   restoring from an old inherited backup, the WAL/db pair may be torn.

**Time Machine's own encryption is a separate switch from FileVault.** Apple's
own wording: if you back up to an external disk and don't encrypt it, anyone who
gains possession of the disk can read it **[W]**. And **the encryption choice can
only be made when the backup destination is first set up** **[W]** — there is no
"encrypt it later" for an existing backup. That makes this a one-shot decision
she may already have got wrong, and it is worth checking rather than assuming.

---

## 3. What deletion actually does

### 3.1 Inside the database

`PRAGMA secure_delete` is **off** by default and off in this build — there is no
`SQLITE_SECURE_DELETE` in `better-sqlite3`'s `defines.gypi`, and a live query
returns `0` **[L]**. With it off, deleted content is marked unused, not
overwritten; the bytes stay in the file until something else reuses those pages
**[W]** ([sqlite.org/pragma.html](https://sqlite.org/pragma.html)).

So today: **delete a note in Apunta and its text is still in `apunta.db`.**
Recoverable with a hex editor and no special skill. The same is true of a whole
patient's cascade-deleted history.

Two caveats that matter and that people usually miss:

- **In WAL mode, `secure_delete=ON` does not zero the old content in the main
  database file until a checkpoint occurs, and the old content can survive in the
  `-wal` file even after that, until the WAL is truncated** **[W]**. So enabling
  the pragma alone does not do what the name suggests. Pair it with
  `PRAGMA journal_size_limit` (e.g. 4 MiB) so checkpoints actually truncate the
  WAL rather than leaving it at high-water mark.
- **`secure_delete` only scrubs ordinary tables. Virtual-table shadow tables are
  not covered** **[W]**. This build has FTS3/4/5 compiled in **[L]**; nothing
  uses them today, but if a future packet adds full-text search over notes, the
  FTS shadow tables become a second, unscrubbed copy of every note. Worth a note
  in `docs/decisions.md` before someone reaches for FTS5.

`VACUUM` would rebuild the file without the freed pages — but costs the temp-copy
problem in §2.3, and see below for why it does not achieve what it looks like it
achieves.

### 3.2 Why none of this is a security control

Overwriting a byte in a file does not overwrite the flash cell that held it.
APFS is copy-on-write and SSDs wear-level, so a logical overwrite generally lands
somewhere else and leaves the original block intact until the controller
recycles it. Apple's own position on this is unambiguous: **Secure Empty Trash
was removed in OS X El Capitan as CVE-2015-5901, because Apple could not
guarantee secure deletion on flash storage** **[W]**
([Macworld](https://www.macworld.com/article/226835/how-to-replace-secure-empty-trash-in-os-x-el-capitan.html),
[Intego](https://www.intego.com/mac-security-blog/how-to-securely-empty-trash-in-os-x-el-capitan/)).

The mechanism Apple substituted is the right one and it is what she should use:
**cryptographic erase.** "Erase All Content and Settings" on Apple silicon
destroys the volume keys in the Secure Enclave rather than overwriting blocks —
fast, complete, and NIST-recognised **[W]** ([Apple: Erase your Mac and reset it
to factory settings](https://support.apple.com/en-us/102664),
[Jamf](https://www.jamf.com/blog/howto-erase-all-content-and-settings-macos-redeployment/)).

### 3.3 Where deleted notes actually persist

Ranked by how long they last:

| Location | Lifetime after she clicks Delete |
| --- | --- |
| Freed pages in `apunta.db` | Until overwritten by new data, or a `VACUUM` — indefinite in practice |
| `apunta.db-wal` | Until the next checkpoint, then until the WAL is truncated |
| APFS local snapshots (Time Machine hourly) | Up to 24 hours **[W]** |
| Time Machine backup drive | Until that backup is thinned or the drive is erased — **years** |
| Our own `backups/*.zip` | Until pruned by the retention ladder in §5 |
| The other records system | Forever — that is the authoritative copy and not ours |

### 3.4 The recommendation, and the honest framing

Do this:

```
PRAGMA secure_delete = ON;
PRAGMA journal_size_limit = 4194304;
PRAGMA temp_store = MEMORY;
```

The database is small and write volume is a handful of notes an evening, so the
cost is unmeasurable. Do it because leaving deleted clinical text lying in a file
is sloppy, not because it protects anyone: **against an attacker who has the
file, `secure_delete` is worth nothing that FileVault was not already worth, and
against an attacker who does not have the file it is worth nothing at all.**

The part that actually matters is the UI copy. The delete confirmation should
say something like:

> Deleting removes this from Apunta. Copies in your Time Machine backups and in
> your other records system are not affected.

That sentence is worth more than every pragma in this section, because the
failure mode here is not forensic recovery — it is her believing something is
gone when it is not.

---

## 4. The threat model, and does SQLCipher still belong in the deferred list

### 4.1 The situation, precisely

One person. One 2024 MacBook Pro, Apple silicon, macOS 26 Tahoe **[W]**. No IT
support, no MDM, no helpdesk, no second admin. Real clinical records for real
people, in the US. No login on the app by design. The authoritative record lives
elsewhere; this is the complete shadow copy. If this laptop is destroyed and the
backup is bad, she loses her drafting history, her transcripts, her refine-chat
record and the corpus that M6's style profile is derived from — not the legal
record, but a great deal she cannot reconstruct.

### 4.2 What FileVault is and is not

This is the load-bearing fact and it is widely misunderstood:

> On a Mac with Apple silicon the volume is **always** encrypted. But if FileVault
> was never turned on, **the volume encryption key is protected only by the
> hardware UID in the Secure Enclave**. With FileVault on, it is protected by the
> combination of the user's password *and* the hardware UID **[W]** ([Apple:
> Volume encryption with FileVault in
> macOS](https://support.apple.com/guide/security/volume-encryption-with-filevault-sec4c6dc1b6e/web)).

Read that plainly: **without FileVault, the data is protected by the machine, not
by anything she knows.** It defeats desoldering the SSD. It does not defeat
anyone who can get macOS on that machine to run.

And on recent Apple silicon Macs there may be no FileVault prompt in Setup
Assistant at all **[W]** — because the disk is "already encrypted", which is true
and misleading in exactly the way that matters. **We cannot assume it is on.**

Second limit: FileVault protects data at rest. Once the volume is unlocked the
key is in RAM and stays there through sleep **[W]**. In practice, on Apple
silicon with soldered RAM and no DMA path, the attack that matters is not a cold
boot — it is that **a running, logged-in Mac is an unlocked Mac**, and the only
thing between a person in the room and the entire note history is the screen
lock.

### 4.3 Scenario by scenario

| Scenario | Is FileVault the answer? | Where it stops |
| --- | --- | --- |
| **Laptop stolen, powered off** | **Yes, completely.** Also the scenario where HHS's encryption safe-harbour framing is most likely to apply **[W]** | Nowhere. This is the case FileVault was built for |
| **Laptop stolen while asleep in a bag** | **Partly.** The key is in RAM but the screen is locked | Fails if "require password immediately after sleep" is off, if auto-login is on, or if the login password is weak. All three are settings, not code |
| **Laptop stolen while open and logged in** | **No.** Nothing in the OS helps | The app is one click away in a browser tab. Only an app-level lock or a short screen-lock timeout helps here |
| **Family member on the household Mac** | **No, not at all.** Same user account, machine already unlocked | The real fix is a *separate macOS user account* for the practice — which also makes the §2.2 permission fix load-bearing. An app passcode is the softer, weaker version |
| **Laptop handed to a repair shop** | **Partly** — until she gives them the password, which repairs routinely require | Correct sequence: back up → verify the backup → Erase All Content and Settings → hand it over → restore. Whether handing PHI to a shop needs a business-associate agreement is a question for her, not us |
| **Laptop resold or traded in** | **Yes, via cryptographic erase**, not via deleting files | Erase All Content and Settings destroys the keys **[W]**. Dragging the Apunta folder to the Trash does not |
| **Backup drive lost or stolen** | **No — FileVault does not extend to external volumes.** Time Machine encryption is a separate switch, settable only at first setup **[W]** | This is the most under-defended path in the whole model: one small object, easy to lose, holding the complete record set, possibly in the clear |
| **Ransomware** | **No.** Encryption at rest does not stop a process running as her | An always-connected Time Machine drive gets encrypted alongside the Mac. Needs at least one copy that is offline or rotated |
| **Subpoena / discovery** | Not a technical question | The engineering consequence: because she keeps everything, this machine holds *more* than the records system — drafts, transcripts, refine-chat turns, and audio if `keep_audio` is ever switched on. Design implication in §6.4 |

### 4.4 SQLCipher: the case for adopting it now

1. It protects the copies that leave the FileVault boundary — an unencrypted
   Time Machine drive, a zip on a USB stick, a disk image handed to a technician.
   Those are real and §4.3 shows they are the weak edge.
2. It is a *second* independent control. If FileVault is off — and §4.2 shows it
   quietly might be — SQLCipher would be the only thing standing.
3. The design already allows it (PLAN §8 says so), and retrofitting encryption to
   a database that already holds years of records is more painful than starting
   with it.
4. The package exists and is maintained: `better-sqlite3-multiple-ciphers` tracks
   `better-sqlite3` closely (13.0.3 as of days ago) and publishes prebuilds
   including darwin-arm64 **[W]**
   ([npm](https://www.npmjs.com/package/better-sqlite3-multiple-ciphers),
   [GitHub](https://github.com/m4heshd/better-sqlite3-multiple-ciphers)). The
   API cost is roughly `db.pragma("key='…'")` after open.

### 4.5 SQLCipher: the case against, which I find stronger

**The key problem is not solvable while the app has no password, and it is not a
detail — it is the whole thing.**

With no login, the key must come from one of:

- **A file in the data dir.** The key sits next to the ciphertext. This is
  encryption as decoration: anyone who can read `apunta.db` can read `key.txt`.
  It would let us write "encrypted at rest" on the About page, which is worse
  than useless — it is a false statement to a user whose whole reason for
  choosing this app is that it tells the truth about privacy.
- **The macOS Keychain.** Better, and genuinely not nothing: the login keychain
  is protected by her login password, so a stolen *backup drive* containing both
  the database and the keychain file still requires that password. But on the
  live, logged-in machine the keychain is already unlocked, so against every
  scenario in §4.3 that FileVault does not cover, SQLCipher-with-Keychain does
  not cover them either. And it brings its own friction: keychain ACLs are bound
  to the accessing binary, and the first access prompts **[W]**
  ([ScriptingOSX](https://scriptingosx.com/2021/04/get-password-from-keychain-in-shell-scripts/)).
  A Node process whose path or signature changes between versions will re-prompt
  — a dialog she has no context for, guarding a key she never chose.
- **A passphrase she types.** This is the only version that is real. And it is
  exactly the passcode PLAN §8 defers alongside it.

That last line is the argument. **`docs/PLAN.md` §8 bundles "passcode + at-rest
encryption (SQLCipher)" into one deferred item, and that bundling turns out to be
correct engineering, not sloppiness.** A passcode without SQLCipher is a UI gate
over a plaintext file — bypassable by opening the file. SQLCipher without a
passcode is a lock with its key taped to it. They are the same feature.

Then the costs:

- **M8.** The packet already fights `whisper-cli` (no prebuilt macOS binary,
  must be compiled from a pinned tag — see `docs/decisions.md`) and Node SEA
  bundling. Swapping the best-supported SQLite binding in the Node ecosystem for
  a single-maintainer fork adds a native `.node` addon that must be selected,
  bundled, signed and notarized under the hardened runtime. This is not
  insurmountable; it is a real tax on the packet with the least slack.
- **Irreversible loss.** This is the one that decides it. A solo practitioner
  with no IT support and no institutional backup, holding the only copy of years
  of drafting history, on a key stored in a Keychain item that a migration
  assistant, a disk swap, or a "reset password" flow can orphan. **A lost key
  means the records are gone.** Against a threat that FileVault already covers
  for the live machine, that trade is bad. The most likely harm from adopting
  SQLCipher in v1 is not "an attacker gets in" — it is "she can't get in."
- **False coverage.** SQLCipher encrypts `apunta.db`. It does not encrypt the
  export zip, the audio scratch files, the logs, or the WAL of any other future
  store. Shipping it invites everyone — us included — to stop thinking.

### 4.6 Recommendation

**Keep SQLCipher deferred for v1. Rewrite the deferral so it is deferred for the
right reason, and spend the encryption budget where it actually buys something.**

The current PLAN §8 line, and the reassurance in the owner-answers doc that "the
laptop's own disk encryption is the current answer", both quietly assume
FileVault is on. §4.2 shows that assumption is not safe. Proposed replacement
text for PLAN §8:

> - **Passcode + at-rest encryption (SQLCipher) — deferred, and deliberately
>   bundled.** With no login there is no secret to derive a key from, so
>   SQLCipher alone would store its key beside the data; a passcode alone would
>   be a UI gate over a plaintext file. They are one feature and arrive together
>   or not at all. v1's at-rest story is FileVault, which the app now **verifies
>   rather than assumes** (Settings + first-run read `fdesetup status`), plus
>   encryption of every backup that leaves the machine. Revisit when: a second
>   person uses the Mac, the data dir moves off the internal volume, or the owner
>   asks for the app to lock.

What to build instead, in v1, at a fraction of the cost:

1. **Check FileVault and say so.** `fdesetup status`, surfaced in `/api/health`,
   shown on the setup wizard and the About/privacy page. If it is off, the page
   must not claim the data is protected — it must say plainly what is not
   protected and link Apple's instructions. This is the single highest-value item
   in this document.
2. **Tighten permissions** (§2.2) and **pin the temp dir** (§2.3).
3. **Encrypt what leaves** (§5).
4. **Check the Time Machine destination is encrypted** and tell her if it is not
   — remembering she cannot change it later without starting a new backup **[W]**.

### 4.7 What would flip the recommendation

- She asks for the app to lock, or for a passcode. → Build both, passphrase-
  derived key, with a written-down recovery key, and an explicit "if you lose
  both, the data is gone" acknowledgement at setup.
- A second person uses the Mac under the same account, or a supervisee/assistant
  appears. → First recommend a separate macOS account (cheaper and stronger);
  if that is refused, build the passcode+SQLCipher pair.
- The data dir moves to an external or shared volume. → Adopt, or block the move.
- Apunta ever gains a "take it to another machine" or portable/sync mode. →
  Adopt, non-negotiable.
- FileVault turns out to be off and she will not turn it on. → Adopt, and treat
  the recovery-key ceremony as part of the feature rather than a footnote.

---

## 5. The backup design

### 5.1 What Apunta's backup is actually for

Since the records system holds the authoritative copy, the backup is **not** the
clinical record of last resort. It is for three narrower things, and naming them
sharpens every other decision:

1. **The material that exists nowhere else.** Rough notes, transcripts, the
   refine-chat history, note formats, the corpus M6's style profile is derived
   from. None of that is pasted anywhere. If the laptop dies it is simply gone.
2. **Recovering from *her own* app.** A bad migration, a corrupt file, a
   mis-click that deletes a patient. This is the most likely restore in practice
   and it wants a *recent* backup, not a complete one.
3. **A readable second copy of the note text** for the case where the paste into
   the other system failed, truncated, or went to the wrong chart, and she needs
   to see what she actually wrote.

It is explicitly **not** for: being the legal record; long-term archival she has
no use for; or migrating to a hypothetical future product.

That triage is why the daily-plus-ladder cadence in §5.3 is right and why an
ever-growing pile of exports would be wrong.

### 5.2 What a good backup produces

One zip, `apunta-backup-YYYY-MM-DD.zip`, containing:

```
apunta.db                 ← VACUUM INTO copy. The restore path.
notes/
  John Smith/2026-08-22 Progress note.txt
  …                       ← plain text, exactly the clipboard format:
                            section name, newline, body, blank line between
data.json                 ← full relational dump: patients, notes, transcripts,
                            chat_messages, note_formats, settings
manifest.json             ← app version, schema migration level, generated_at,
                            counts per table, sha256 of apunta.db,
                            integrity_check result
RESTORE.txt               ← plain language, no jargon. See §5.5
```

Design notes, each with a reason:

- **`VACUUM INTO`, not a file copy and not `data.json` alone.** `VACUUM INTO`
  produces "a consistent snapshot of the original database" transactionally
  **[W]** ([lang_vacuum](https://system.data.sqlite.org/home/doc/8e13c43294410407/Doc/Extra/Core/lang_vacuum.html)),
  which means it is correct to run while the app is live and it needs no
  checkpoint dance. Available since SQLite 3.27; this build is 3.53.4 **[L]**. It
  also writes a *fresh, compacted* file — so the freed-page residue from §3.1
  does not travel into the archive. `better-sqlite3` also exposes
  `db.backup(destinationFile, options)` **[L]** (the online backup API, safe
  against a live writer **[W]**); either is correct, `VACUUM INTO` is one
  statement and compacts, so prefer it.
- **Verify before declaring success.** Run `PRAGMA integrity_check` on the copy,
  record the result and a sha256 in the manifest, and fail the backup loudly if
  it is not `ok`. A backup nobody validated is a rumour.
- **Plain text, not markdown, for the note files.** The clipboard format is
  already plain text by owner decision (answer 3 / `docs/decisions.md`) — reuse
  it, and get the Spotlight-opacity and "readable in TextEdit in 2035" benefits
  for free. `.md` in this project means asterisks she never asked for.
- **`data.json` earns its place** as the format that survives a schema change:
  if a future migration makes the old `.db` unloadable, JSON is still parseable.
- **The manifest's `migration_level` is the restore safety check.** Refuse to
  restore an archive whose schema level is *higher* than the running app's, and
  say why.
- This **changes M7 deliverable 4**, which currently specifies "a zip of all
  notes as markdown + a `data.json` dump" — no `.db`, no manifest, no restore
  instructions, and markdown where plain text is now the house format. As
  written it produces something you can read but cannot restore.

### 5.3 Cadence

- **Automatic, once per day, on first server start of the day.** She writes in a
  single end-of-day batch (answer 2), so a daily snapshot loses at most one
  batch, and doing it at launch rather than at quit means it happens even if she
  just closes the lid.
- **Manual "Back up now"** in Settings, with the last-backup time and result
  shown next to it. If the last backup is older than 7 days, say so in colour.
- **Prune: keep 14 daily + 12 monthly.** Roughly 26 archives. Retention of
  *backups* is a different question from retention of *records* (§6) — the ladder
  bounds disk use while still answering "I deleted something three weeks ago".
- Size is a non-issue: text-only clinical notes for a solo practice are single-
  digit MB even after years **[I]**, and the zip compresses text well.

### 5.4 Destination

| Destination | Verdict |
| --- | --- |
| `<dataDir>/backups/` | **Default.** Inside FileVault, inside Time Machine's coverage, no user decision required. Covers scenario 2 of §5.1 (recovering from the app) which is the common case |
| An encrypted external APFS volume | **The recommended second copy.** Covers laptop loss, which the default does not |
| An encrypted Time Machine drive | Effectively a third copy, and free once the drive is encrypted |
| `~/Documents`, `~/Desktop` | **Warn hard.** The two folders iCloud syncs by default; the export uploads to Apple and can be evicted to a 0-byte placeholder **[W]** (§2.5) |
| Any iCloud/Dropbox/Drive/OneDrive path | **Warn hard**, same reasons |
| The same physical disk only | Not a backup. Say so in the UI |

A default inside the data dir sounds circular — it is on the same disk as the
thing it backs up. It is not circular, because the failure it defends against
most often is *logical* (a bad delete, a bad migration), not physical, and
because Time Machine promotes it to an off-machine copy for free. But the UI must
be honest that it is not enough on its own, and the "Choose a folder…" affordance
must be a visible next step rather than buried.

### 5.5 Encryption of the backup

**Prefer the container to the file.** For anything leaving the machine, point the
backup at an encrypted APFS volume or an encrypted disk image rather than
encrypting the zip in-app:

- macOS handles the key and can remember it in her Keychain, so day to day there
  is nothing to type and nothing to lose.
- The key material lives on the Mac, not on the drive, so the stolen-drive
  scenario is covered.
- Restoring is Finder. No tool, no command, no version of our code required.
- Nothing bespoke for us to get wrong.

**In-app passphrase encryption is the fallback**, for the case where the
destination cannot be encrypted — handing a single file to someone, or a shared
drive. If built: AES-256-GCM via Node's built-in `crypto` with an scrypt KDF (no
new dependency), and **not** zip's own encryption (ZipCrypto is broken; AES-zip
needs a library). Two rules:

1. **`RESTORE.txt` stays outside the encrypted blob.** Instructions locked inside
   the thing you cannot open are not instructions.
2. **Say the quiet part at the prompt:** "If you lose this passphrase, this
   backup cannot be recovered by anyone, including us. Save it in your password
   manager now." An unopenable backup in 2031 is a worse outcome than an
   unencrypted one in a drawer, and she should get to weigh that.

### 5.6 Restore — three paths, because the third one is the real test

**Path A — in the app.** Settings → Restore from backup → pick a zip. The app
validates the manifest and sha256, refuses if `migration_level` exceeds its own,
**copies the current database aside first** (`apunta.db.before-restore-<ts>`),
swaps in the restored file, deletes any stale `-wal`/`-shm`, and restarts.
Never restore in place without the safety copy — a restore is exactly when
someone discovers they picked the wrong archive.

**Path B — by hand, app installed.** In `RESTORE.txt`, verbatim:

```
1. Quit Apunta.
2. In Finder: Go > Go to Folder…  and paste:
   ~/Library/Application Support/Apunta
3. Move apunta.db, apunta.db-wal and apunta.db-shm to your Desktop.
   (Keep them until you are sure the restore worked.)
4. Copy apunta.db out of this backup into that folder.
   Do NOT copy any -wal or -shm file from the backup.
5. Open Apunta. Your notes should be as of <date in manifest>.
```

Step 4's parenthetical is the one that prevents real damage (§2.7).

**Path C — the app is gone and only the file remains.** This is the case that
decides whether the format was chosen well, and it is why the archive carries
plain text: `notes/` opens in TextEdit, Word, anything, forever, with no software
and no instructions. `data.json` opens in any editor and in every programming
language. This path needs no tooling from us and that is the point.

**And the part everyone skips: prove it.** A backup that has never been restored
is a hypothesis.

- **M7 must ship an integration test** that generates a backup from seeded data,
  restores it into a temp `APUNTA_DATA_DIR`, and asserts patient/note/transcript
  counts and one note's exact text round-trip. This is the acceptance criterion
  that matters more than "the zip contains expected files".
- **The app should record `last_verified_restore`** and, if it is empty or older
  than a year, show a quiet line in Settings suggesting she try Path B once with
  a spare copy. Once. Not a nag.

---

## 6. Retention

### 6.1 Her call stands

She keeps everything. That is a clinician's decision about clinical records and
it is not ours to override, second-guess, or quietly undermine with a default
that deletes things. **Nothing proposed here deletes a note automatically, ever.**

### 6.2 The problem worth solving

The risk is not that keeping everything is wrong. It is that "keep everything"
was answered once, in August 2026, about a database with maybe a dozen notes in
it, and will still be in force in 2033 governing several thousand — without her
ever having been shown what it grew into. A default nobody revisits stops being a
choice.

### 6.3 What the app should offer

1. **Make the corpus visible.** A Settings panel showing: oldest note date,
   number of patients (active / archived), number of notes, database file size,
   number of stored transcripts, and whether any audio is retained. Numbers on a
   screen, no prompting, no judgement. This is the whole intervention and it is
   about fifteen lines of SQL.
2. **An annual, dismissible review nudge**, off unless she opts in: "You have
   1,847 notes going back to 2026. Review anything?" Opens the review list. Never
   deletes.
3. **An opt-in review flag, not a policy engine.** "Flag notes older than N
   years" produces a *list she can act on*. Nothing in Apunta should ever delete
   a clinical record on a timer — the periods are legal and vary, and getting one
   wrong in the deleting direction is unrecoverable in a way that keeping too
   much is not.
4. **Per-patient purge that tells the truth.** A "delete everything for this
   patient" path that names what goes (notes, transcripts, chat history — the
   schema cascades correctly, verified in `001_init.sql` **[L]**) and says what
   it cannot reach: Time Machine, prior backup zips, and the other records
   system.
5. **Fix the misleading Settings copy.** M7 deliverable 4 currently plans to
   show the db path with "your backup is this file". The owner-answers doc
   already flags this as wrong. It should read closer to: *"Apunta is where you
   draft. Your record lives in [her system]. This file is your drafting history —
   back it up."*
6. **Keep `keep_audio` defaulting to false.** Retaining recordings of sessions
   creates a category of data with a different sensitivity and a different
   discovery profile from text. The M5 default is right; do not let a
   troubleshooting workflow quietly flip it.

### 6.4 The part that is not ours to answer

Clinical-record retention periods are set by **state law and by her licensing
board or professional body**, and they vary substantially by jurisdiction. As one
illustration of the shape of it and not as guidance: APA's Record Keeping
Guidelines suggest seven years after the last adult contact, while state
requirements differ and control where they exist **[W]** ([APA Record Keeping
Guidelines](https://www.apa.org/practice/guidelines/record-keeping),
[APA Services](https://www.apaservices.org/practice/business/legal/professional/records)).

The engineering-relevant points, and nothing further:

- **The right answer for her is a question for her board and her attorney**, not
  for this app and not for us.
- **The obligation may run in both directions** — deleting too early can be a
  problem as surely as keeping too long. That is the strongest reason the app
  must never auto-delete.
- **This machine holds more than the records system does.** Drafts, rough
  transcripts, and the refine-chat conversation are artefacts the authoritative
  record never receives. Whether that material is itself part of "the record" is
  a professional question she may want to ask, and the honest engineering
  contribution is: make it visible (§6.3.1), make it deletable (§6.3.4), and do
  not create more of it than the app needs.

---

## 7. Open items — check these on the actual Mac

Each is **[I]**, each is cheap, and each would be embarrassing to get wrong in
user-facing documentation.

| # | Question | Command / check |
| --- | --- | --- |
| 1 | Is FileVault actually on? | `fdesetup status` |
| 2 | Is Desktop & Documents iCloud sync on? | System Settings → Apple Account → iCloud → Drive; or check `~/Library/Mobile Documents/com~apple~CloudDocs/Desktop` exists |
| 3 | Is "Optimize Mac Storage" on? | Same panel |
| 4 | Is the Time Machine destination encrypted? | `tmutil destinationinfo` — remember it cannot be changed later without a fresh backup **[W]** |
| 5 | Does Spotlight in Tahoe still index `~/Library`, and does it index note text? | `mdfind -onlyin ~/Library/Application\ Support/Apunta ''` then `mdfind "kMDItemTextContent == '*<a distinctive word from a test note>*'"` — use seeded sample data (John Smith), never a real note |
| 6 | Is `.md` content-indexed on current macOS? | Write a test `.md` with a nonsense token in `~/Documents`, wait, `mdfind <token>` |
| 7 | Is `/private/var/folders` excluded from Time Machine? | Inspect `.exclusions.plist` at the root of a backup (`StdExclusions.plist` disappeared in Big Sur **[W]**) |
| 8 | What is `TMPDIR` under a LaunchAgent and under the M8 app shell? | Log `process.env.TMPDIR` at boot in each context — §2.3 assumes it is per-user and it may not be |
| 9 | Does the login password meet the bar FileVault's protection depends on? | Hers to answer. Worth one sentence in `docs/INSTALL.md` |

---

## 8. Ranked list of what could actually harm her

Ranked by expected harm — probability × severity — not by how interesting the
attack is.

**1. The backup does not exist, or exists and cannot be restored.**
Most likely thing on this list by a wide margin, and the only one where the
damage is certain rather than conditional. Includes the iCloud-placeholder trap
(§2.5), the untested-restore trap, and the "the export was markdown so there was
nothing to restore" trap that M7's current spec would produce.
→ §5 in full: `VACUUM INTO` + integrity check + manifest, daily automatic
backups with a visible last-run time, a restore path in the app, `RESTORE.txt`
for when there is no app, and an M7 integration test that actually restores.

**2. FileVault is off, and everyone assumed it was on.**
Silent, plausible (recent Apple silicon Setup Assistant may not prompt **[W]**),
and it turns scenario 3 from "fine" into "total loss of confidentiality". The
project currently *assumes* this in PLAN §8 and in the owner-answers doc.
→ `fdesetup status` in `/api/health`, on the setup wizard and on the About page,
with plain-language remediation and no privacy claim while it is off.

**3. Someone reads the notes on the unlocked, logged-in Mac.**
Highest probability of any confidentiality scenario. A shared household, a
partner, a curious teenager, a visitor, a screen left open in a shared room.
FileVault contributes exactly nothing.
→ A separate macOS user account for the practice is the real answer, and belongs
in `docs/INSTALL.md`. Short screen-lock timeout, require password immediately
after sleep, no auto-login. An app passcode is the weaker fallback, and if it is
ever built it must arrive with SQLCipher (§4.5).

**4. The backup drive is lost, stolen, or was never encrypted.**
One small object holding the complete record set, easy to lose, outside the
FileVault boundary, and the encryption decision can only be made when the
destination is first configured **[W]**.
→ Check `tmutil destinationinfo` and tell her the result. Recommend an encrypted
APFS volume for Apunta's own "Choose a folder…" backups. Never write an
unencrypted archive to an external volume without saying so on screen.

**5. Repair, trade-in or resale leaks the disk.**
Routine, scheduled, and usually handled badly because deleting files feels
sufficient.
→ Documented sequence: back up → verify the backup → Erase All Content and
Settings (cryptographic erase **[W]**) → hand it over → restore. In
`docs/INSTALL.md` under "Getting your Mac repaired or replaced", written for
someone who has never opened Terminal.

**6. Ransomware takes the Mac and the attached backup drive together.**
Lower probability on macOS for a single non-server user, but the impact is total
and the classic mistake — a permanently attached Time Machine drive — is exactly
what a solo user does.
→ At least one rotated or offline copy. The `backups/` default explicitly does
not defend against this and the UI should not imply it does.

**7. Deleted notes persist and she believes they are gone.**
Not an attack; a false belief, which is how privacy tools usually fail. Freed
pages, the WAL, 24-hour APFS snapshots, and Time Machine backups all outlive the
delete (§3.3).
→ `secure_delete=ON`, `journal_size_limit`, and above all the honest sentence in
the delete confirmation.

**8. Note text escapes into logs.**
Quiet, cumulative, and invisible until someone reads a log file. A LaunchAgent
redirecting stdout to a permanent file, an error that serialises note content, or
a troubleshooting doc that says "set `OLLAMA_DEBUG=1`" **[W]**.
→ Redacting serialiser, no permanent stdout file, and a test asserting nothing
in the repo sets `OLLAMA_DEBUG`.

**9. A second plaintext copy in a temp directory.**
A bare `VACUUM` writes the whole database into `TMPDIR` — or into `/var/tmp` or
`/tmp` if the chain falls through **[W]**.
→ `temp_store = MEMORY`, and `VACUUM INTO` inside the data dir if compaction is
ever needed. Costs nothing, and prevents a copy nobody would ever think to look
for.

**10. `APUNTA_DATA_DIR` pointed somewhere synced or shared.**
Low probability (it is a developer knob) but it converts a well-behaved local
database into a cloud-uploaded, corruption-prone, world-readable one in a single
environment variable — and combines with the `0644`/`0755` defaults (§2.2).
→ Reject sync paths at boot with a clear error; `0700`/`0600` everywhere.

---

## 9. Concrete changes this implies

Not a work packet — the shape of one, for whoever picks it up.

**`docs/PLAN.md` §8** — replace the passcode/SQLCipher line with §4.6's text.
Deferred stays deferred; the reason changes from "the laptop's disk encryption is
the answer" to "the laptop's disk encryption is the answer *and we now verify it
rather than assume it*, and passcode+SQLCipher are one feature with a named
trigger list."

**`server/src/db/index.ts`** — add `temp_store = MEMORY`, `secure_delete = ON`,
`journal_size_limit`. Three pragmas, with a comment explaining that
`secure_delete` is hygiene and not a security boundary.

**`server/src/config.ts`** — `ensureDataDir` creates `0700`; reject an
`APUNTA_DATA_DIR` resolving under a known sync root; `chmod 0600` the db and
sidecars after open.

**`server/src/routes/health.ts`** — add `fileVault: { enabled }` on darwin via
`fdesetup status` (guarded, non-fatal, portable-by-omission elsewhere, and the
result must be cached — do not shell out per request).

**M7 deliverable 4** — rewrite. Backup ≠ export. The archive gains `apunta.db`
(via `VACUUM INTO` + `integrity_check`), `manifest.json` and `RESTORE.txt`; the
note files become plain text rather than markdown; daily automatic backups with
pruning; a Restore path in Settings; and an integration test that *restores* and
compares, not merely one that inspects zip entries.

**M7 deliverable 2 (setup wizard) and 5 (About/privacy page)** — FileVault state,
Time Machine destination encryption, and the iCloud-folder warning belong here.
"You're fully local — nothing leaves this Mac" must not appear while FileVault is
off or while the backup destination is inside an iCloud folder, because in those
states it is not true.

**M8 deliverable 7 (uninstall)** — must mention Erase All Content and Settings
for the resale/repair case, and must say plainly that deleting the data directory
does not remove copies in Time Machine.

**`docs/INSTALL.md` (M8 deliverable 8)** — add, in non-technical language:
turning on FileVault; a separate user account for the practice; encrypting the
Time Machine drive at first setup (and that it cannot be changed later); where
backups go and why not Documents; and what to do before a repair.

---

## Sources

macOS — Apple:
- [Back up your Mac with Time Machine](https://support.apple.com/en-us/104984)
- [About Time Machine local snapshots](https://support.apple.com/en-us/102154)
- [Volume encryption with FileVault in macOS (Platform Security)](https://support.apple.com/guide/security/volume-encryption-with-filevault-sec4c6dc1b6e/web)
- [Intro to FileVault (Deployment)](https://support.apple.com/guide/deployment/intro-to-filevault-dep82064ec40/web)
- [Add your Desktop and Documents files to iCloud Drive](https://support.apple.com/en-us/109344)
- [Erase your Mac and reset it to factory settings](https://support.apple.com/en-us/102664)
- [Exclude files from a Time Machine backup](https://support.apple.com/en-sa/guide/mac-help/exclude-files-from-a-time-machine-backup-mh15622/14.0/mac)

macOS — independent:
- [Eclectic Light: Time Machine to APFS — backing up](https://eclecticlight.co/2021/03/17/time-machine-to-apfs-backing-up/)
- [Eclectic Light: Time Machine and snapshots](https://eclecticlight.co/2020/07/29/time-machine-and-snapshots/)
- [Eclectic Light: What doesn't Time Machine back up?](https://eclecticlight.co/2021/09/08/what-doesnt-time-machine-back-up-2/)
- [Eclectic Light: Why can't Spotlight find files in Library folders?](https://eclecticlight.co/2024/11/26/why-cant-spotlight-find-files-in-library-folders/)
- [Eclectic Light: Spotlight search can be blocked by extended attributes](https://eclecticlight.co/2025/06/16/spotlight-search-can-be-blocked-by-extended-attributes/)
- [Eclectic Light: iCloud Drive — Optimise Mac Storage or not?](https://eclecticlight.co/2024/03/11/icloud-drive-in-sonoma-optimise-mac-storage-or-not/)
- [Bombich: Back up iCloud Drive and Dropbox locally on a Mac (2026)](https://bombich.com/blog/2026/07/28/local-backups-of-cloud-storage)
- [Pondini: Time Machine FAQ 11 — what to exclude](https://tommyang.github.io/pondini.org/TM/11.html)
- [Macworld: How to replace Secure Empty Trash in OS X El Capitan](https://www.macworld.com/article/226835/how-to-replace-secure-empty-trash-in-os-x-el-capitan.html) (CVE-2015-5901)
- [Intego: How to securely empty trash in OS X El Capitan](https://www.intego.com/mac-security-blog/how-to-securely-empty-trash-in-os-x-el-capitan/)
- [Jamf: Erase all content and settings on macOS](https://www.jamf.com/blog/howto-erase-all-content-and-settings-macos-redeployment/)
- [ScriptingOSX: Get password from Keychain in shell scripts](https://scriptingosx.com/2021/04/get-password-from-keychain-in-shell-scripts/)
- [Wikipedia: macOS Tahoe](https://en.wikipedia.org/wiki/MacOS_Tahoe) / [MacRumors: Apple releases macOS Tahoe 26.6](https://www.macrumors.com/2026/07/27/apple-releases-macos-tahoe-26-6/)
- [BrettTerpstra: Fixing Spotlight indexing of Markdown content](https://brettterpstra.com/2011/10/18/fixing-spotlight-indexing-of-markdown-content/) / [MarkdownSpotlightIndexer](https://github.com/gordon8214/MarkdownSpotlightIndexer)

SQLite:
- [PRAGMA statements (secure_delete)](https://sqlite.org/pragma.html)
- [Temporary files used by SQLite](https://sqlite.org/tempfiles.html)
- [VACUUM / VACUUM INTO](https://system.data.sqlite.org/home/doc/8e13c43294410407/Doc/Extra/Core/lang_vacuum.html)
- [Anton Zhiyanov: Secure delete in SQLite](https://antonz.org/sqlite-secure-delete/)
- [SQLite forum: hot backup of a WAL database](https://sqlite.org/forum/forumpost/2ea989bbe9)
- [better-sqlite3-multiple-ciphers (npm)](https://www.npmjs.com/package/better-sqlite3-multiple-ciphers) / [GitHub](https://github.com/m4heshd/better-sqlite3-multiple-ciphers)

Ollama:
- [Ollama troubleshooting / logs](https://docs.ollama.com/troubleshooting)
- [ollama#10950 — OLLAMA_DEBUG=1 and prompts in logs](https://github.com/ollama/ollama/issues/10950)

Regulatory context (cited to show these questions exist and belong to her, not as advice):
- [HHS guidance on rendering PHI unusable, unreadable or indecipherable / NIST SP 800-111 — as summarised by HIPAA Journal](https://www.hipaajournal.com/hipaa-encryption-requirements/)
- [APA Record Keeping Guidelines](https://www.apa.org/practice/guidelines/record-keeping)
- [APA Services: A matter of law — patient record keeping](https://www.apaservices.org/practice/business/legal/professional/records)

Repo (read-only, this session): `docs/PLAN.md` §3/§8,
`docs/feedback/2026-08-22-owner-answers.md`, `docs/decisions.md`,
`docs/agents/M5-audio.md`, `docs/agents/M7-packaging.md`,
`docs/agents/M8-installer.md`, `server/src/config.ts`, `server/src/app.ts`,
`server/src/db/index.ts`, `server/migrations/001_init.sql`,
`node_modules/better-sqlite3/deps/defines.gypi`,
`node_modules/@types/better-sqlite3/index.d.ts`.
