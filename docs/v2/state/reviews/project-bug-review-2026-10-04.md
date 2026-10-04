# Apunta bug review — 2026-10-04 (Claude Opus 5.5, read-only review of `main` @ eba45ee)

Not yet in any HANDOFF/NEXT-SESSION entry, as far as I could see. Ordered by severity.
Each item: where, what breaks, how I'd fix it, the test that should land with it.

## 1. HIGH — Restore deletes the live DB's WAL, so the safety copy loses committed data (REPRODUCED)

- Where: `server/src/backup/restore.ts` `applyPendingRestore` (~L202-214) and `rollbackAppliedRestore`.
- Bug: the DB runs in WAL mode (`db/index.ts:48`). On boot with a pending restore, the live `apunta.db` is renamed
  to `apunta.db.before-restore-*` and its `-wal`/`-shm` are **deleted**. After any unclean exit (crash, kill,
  power loss, force-quit — `onClose` never ran, so no checkpoint), the last transactions live only in the WAL.
  They're lost from the "safety copy", and `rollbackAppliedRestore` would then put the truncated copy back.
- Repro (done): child process opens WAL db, `wal_autocheckpoint=0`, creates table + 5 rows, `process.exit(0)`
  without close → stage any pending db → `applyPendingRestore` → open safety copy: `no such table: t`.
- Fix: before the rename, if `${live}-wal` exists, open `live` with better-sqlite3 (pass `nativeBinding` —
  `applyPendingRestore` needs a new optional param, threaded from `config.sqliteBinding` in `index.ts` and
  `db/safety.ts`), run `PRAGMA wal_checkpoint(TRUNCATE)`, close. Safe because the data-folder lock is already
  held. If the checkpoint fails, **rename** the sidecars to `${safetyCopy}-wal` / `${safetyCopy}-shm` (SQLite
  derives the WAL name from the db filename, so it replays on open) instead of deleting. `rollbackAppliedRestore`
  must move those sidecars back with the copy. Keep deleting stray sidecars only *after* the live file has been
  folded or moved.
- Test: `restore.test.ts`, spawn a child that writes in WAL mode and exits uncleanly, then apply, then assert the
  safety copy has every row. Also a rollback case.

## 2. MEDIUM — Both importers write notes with locale `en` whatever the format's language (breaks C-LANG@1 rule 3)

- Where: `server/src/routes/import.ts` ~L88 and `server/src/routes/halaxy.ts` ~L85. Both call `createNote`
  without `locale`, so `db/notes.ts` falls back to `DEFAULT_LOCALE` ('en').
- Effect: with an es-MX format, imported notes are tagged English, so refine replies and lock notices on them
  come back in English (`chat.ts` reads `note.locale`). The Halaxy fallback title `Imported session, ${date}` is also hard-coded English.
- Fix: pass `locale: format.locale` in both places (as `routes/notes.ts` and `draft.ts` do). Render the Halaxy
  fallback title from an i18n key in `format.locale`, adding the key to `en.ts` and `es-MX.ts`.
- Test: import into a DB whose first format is es-MX → `note.locale === 'es-MX'`.

## 3. MEDIUM — Local `npm test` is red: 21 failures (3 files) on this PC's Node v26.8.2

- `package.json` engines `>=24.19.0 <25`, `.nvmrc` 24.19.0, but the machine runs Node 26.8.2. On Node ≥25 the
  built-in `globalThis.localStorage` (undefined without `--localstorage-file`) shadows jsdom's, so
  `window.localStorage.clear()` throws in `SidebarViewMenu.test.tsx`, `lib/appearance.test.ts`, and
  `routes/Workspace.test.tsx` (collapsed-sidebar persistence). CI is green only because it uses `.nvmrc`.
  "lint+typecheck+test green locally" in the definition of done is currently unmet on this machine.
- Fix: (a) add `engine-strict=true` to `.npmrc` so the mismatch fails loudly, and run gates under the pinned Node
  (fnm/mise). And/or (b) harden the web vitest project: in a setup file, install a Map-backed Storage on `window`
  when `window.localStorage` is undefined. Avoid adding the `--no-experimental-webstorage` flag unconditionally,
  because Node 24 rejects unknown flags. (c) Check which Node the live instance and AppImage server actually run;
  if it's 26, production is outside the engines range too.

## 4. MEDIUM-LOW — Bad `existingPatientIds` in Claude import is a 500, not a 400

- Where: `server/src/import/claude.ts:946` throws a plain `Error('The selected import patient is not an active
  patient.')`, reached from both `/api/import/claude/preview` and `/run` (inside the transaction).
- Effect: if a patient is archived or deleted between preview and run (or another tab does it), the user gets a
  generic internal error with untranslated text.
- Fix: throw `ImportFormatError` with a new i18n key (both catalogues), and map it in `planFor`'s callers to
  `badRequest` the way `openExport` errors already are. Test both routes.

## 5. LOW-MEDIUM — A refine rewrite can silently overwrite a hand edit (no revision check)

- Where: `server/src/db/notes.ts:106` `updateDraftNoteContent` (`WHERE id AND status='draft'` only), used by
  `routes/chat.ts` ~L181 (move fast path) and ~L447. The rewrite is computed from the note read at request start;
  the model runs for seconds.
- Effect: an edit committed meanwhile is overwritten without a conflict. That edit could come from a second
  window or tab, or from a late keepalive flush. The same window is protected because `RefineColumn` awaits
  `onFlushPendingEdit` and the editor is read-only while refining. The server is the only place that can enforce
  this across windows.
- Fix: add `expectedRevision` → `... AND revision = @revision`. On zero changes, re-read the note: if it's
  published, keep the current refusal. Otherwise reply with a new "the note changed while Apunta was working;
  nothing was applied" message (i18n key in both locales). Send `note-updated` with the current note and
  `outcome: 'withheld'`.
- Test: in `chat.test.ts`, PATCH the note while a fake refine stream is held open → content keeps the PATCH.

## 6. LOW — `persistDraft` is not transactional

- Where: `server/src/routes/draft.ts` `persistDraft` (~L219): note, transcripts, and the opening chat message are
  separate writes.
- Effect: a failure midway (disk full, a patient deleted concurrently) leaves a note without its transcript. The
  transcript is the source the refine boilerplate lock checks against, so legitimate content then gets held back.
- Fix: wrap the body in `db.transaction(...)()`. Test with a throwing `createChatMessage` → no note row remains.

## 7. LOW (privacy) — Kept audio is never deleted; crash-orphaned uploads accumulate

- Where: `audioDir` (`config.ts`), `routes/transcribe.ts`, `DELETE /api/notes/:id`, `DELETE /api/patients/:id`.
- Effect: with `keep_audio=true` (default false, but the setting is writable via the settings API), deleting a
  note or patient cascades the rows and leaves `audio/<uuid>.wav` session recordings on disk. A process killed
  mid-upload or mid-transcription also leaves WAVs that nothing ever removes.
- Fix: in the delete routes, collect `transcripts.audio_filename` before the delete and `rm` the files after it
  succeeds. At boot, sweep `audioDir` for `.wav` files no transcript references that are older than an hour.
  Tests for both.

## 8. LOW — `Recorder.stop()` can hang forever

- Where: `web/src/lib/recorder.ts` `stop()` awaits the worklet's `'flushed'` ack with no timeout.
- Effect: if the worklet or context has died (`processorerror`, context closed or interrupted after device
  loss), the promise never settles and the recording UI is stuck with the audio still in memory.
- Fix: race the ack against roughly a 1 s timeout, then build the WAV from what is buffered. Add a unit test with
  a node that never answers.

## 9. LOW — `resolveArchivePath` isn't OS-portable (hard rule 4)

- Where: `server/src/routes/backup.ts` `resolveArchivePath`: `file.split('/').pop()`. A Windows absolute path
  never yields the filename, so a valid restore is rejected. Use `basename(file)`.

Verified OK while reviewing: egress guard (redirects blocked), request guard (Host/Origin/Sec-Fetch-Site), CSP,
note PATCH/publish optimistic locking, transcribe temp-file cleanup, Claude/Halaxy import transactions,
`npm run typecheck` (green).
