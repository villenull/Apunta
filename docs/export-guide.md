# Getting all notes onto a MacBook Pro

This guide is safe to use only after confirming where the notes currently
live. It does not sign in to an account, read a cloud service, or send notes
anywhere.

## First: confirm the source

Ask the owner one question before choosing a path: **Are the notes in Apunta,
Claude, or Halaxy?** Also confirm whether “all notes” means only finished notes
or also drafts, transcripts, conversations, treatment plans, and archived
clients.

Do not continue with an external account until the owner confirms that the
export is authorized and may be handled on this Mac. In particular, do not
import a Claude account export just because it is available: confidentiality
and account permission still need an explicit answer.

## Export from Apunta (local Mac)

Use this path only when the notes are already in Apunta on this Mac.

1. Open Apunta and choose **Settings → Backup**. Settings is a modal over the
   workspace; there is no `/settings` page.
2. Leave the destination alone for a local copy, or use **Change backup
   location** to choose an **encrypted external disk** if the archive must
   survive a lost Mac. Do not choose Desktop, Documents, iCloud Drive,
   Dropbox, Google Drive, or OneDrive. The field opens prefilled with the saved
   folder, so cancelling and reopening puts the saved one back.
3. **A new backup is not encrypted in the app and takes no passphrase.** Since
   2026-10-05 the passphrase field is gone: a secret typed into a settings
   field gets lost, and a lost passphrase is a backup nobody can open. Use an
   encrypted disk the OS unlocks instead. An archive encrypted before this
   change still restores — Apunta asks for its passphrase in the restore
   dialog.
4. Choose **Back up now** and confirm when asked, then wait for the success
   message saying the archive was checked and is intact. Do not close Apunta
   while it is working.
5. Open the folder shown on the Backup page. The file is named like
   `apunta-backup-2026-10-05.zip`. Keep the whole zip; do not rename files
   inside it.
6. To read the notes, make a copy of the zip and extract that copy in Finder.
   Open `RESTORE.txt` first. The readable notes are in `notes`, one folder per
   client and one `.txt` file per note. Archived clients are included. Open a
   `.txt` file in TextEdit or Word.
7. If plans are present, they are in `plans`, one text document per treatment
   plan version. `data.json` and `apunta.db` are complete machine/restore
   copies; do not edit them.
8. Keep the original zip until a note count and a few note contents have been
   checked. Once a year, test a copy through Apunta’s **Settings → Backup →
   Restore**: it names the archive it is about to bring back and asks you to
   confirm before it writes anything. A backup that has never been restored is
   only a guess.

The Apunta archive is a local backup/readable export, not a direct upload to
Halaxy or another records system. It includes Apunta’s drafts, transcripts,
refine conversations, notes, and plans so that Apunta can be recovered; it
does not claim to be the authoritative clinical-record export.

### If the archive is encrypted

Finder can show `RESTORE.txt`, but the notes are inside the encrypted payload.
Use **Settings → Backup → Restore**, type the saved passphrase in the restore
dialog, and follow what `RESTORE.txt` says next; or ask a technically trusted
person to follow the `decrypt.mjs` instructions inside `RESTORE.txt`. The file
itself says `Settings > Backup > Restore`. Do not email the zip and passphrase
together.

## Export from Claude or Halaxy (source confirmation required)

This is a separate workflow. Do not use the Apunta instructions above to
pretend that an external account has been exported.

- **Claude:** the current Apunta screen can read a Claude data export locally,
  but it is an import/review flow, not an unattended “all clients” downloader.
  Claude’s export must be obtained by the authorized account holder. Apunta
  shows proposals first, asks which recurring names are patients, and imports
  only accepted human-authored turns as drafts. It does not infer patient
  identity or silently import assistant replies.
- **Halaxy:** no Halaxy account access, connector, or source-specific export
  procedure is implemented or verified here. Confirm the owner’s authorized
  Halaxy export method, file format, date range, and whether attachments,
  signed plans, archived clients, and audit history are required before any
  package or script is designed.

Until that source answer is recorded, do not run a downloader, request account
credentials, or modify Mac setup scripts. A future source-specific guide must
name the exact export menu and file type, state what is and is not included,
and provide a local-only handling and deletion plan.

## What was checked in Apunta

- The existing backup creates one zip containing the SQLite restore copy,
  `notes/`, optional `plans/`, `data.json`, `manifest.json`, and
  `RESTORE.txt`.
- `notes/` iterates active **and archived** clients, and note text is preserved
  in plain text suitable for TextEdit.
- Backups are written atomically and the database copy is integrity-checked;
  the existing synthetic suite also checks restore, encryption, stale WAL/SHM
  handling, and destination warnings.
- A bug was fixed in the readable export: same-client notes with the same date
  and title could previously share a zip path and silently overwrite one
  another. The later file now receives a UUID disambiguator, and a synthetic
  regression test proves both note bodies survive.

## MacBook Pro limitation

This audit ran in the local test environment with fabricated data only. The
Mac Swift wrapper, Finder extraction behavior, and standalone decrypt script
have not been verified on the wife’s MacBook Pro. Before real notes are used,
run the project’s Mac manual-verification checklist and confirm FileVault and
the backup destination are appropriate.
