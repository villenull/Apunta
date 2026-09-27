import type { Message } from './t.js';

/**
 * The English catalogue — the shape every other decision is written against.
 *
 * English is the app as it has always been, so each entry here is what a
 * screen already shows for the same input: the card pins every key to the
 * function or line that produces it today, and `t.test.ts` asserts each one
 * against that oracle. S2.3 to S2.5 move the screens onto these keys; this
 * file is what they move onto, so a key added here is a string the app has
 * been saying all along.
 *
 * A key is `dotted.case`. Placeholders are `{name}`, and how each one renders
 * is declared in the entry's `kind` map — a name absent from it is `text`.
 * A key that takes a number gets `kind: { name: 'number' }` **and** a per-
 * category `plural` map, which is also how the number gets grouped: the
 * parameter `Intl.PluralRules` selects on is the one the map declares.
 *
 * `text` is required on every entry, including a plural one. On a plural key
 * it carries the `one` form and is never read — `t()` resolves a plural
 * category through the `plural` map alone, falling back to `other`, so
 * nothing renders `text` by accident.
 */
export const en = {
  /**
   * The product's own name, never translated. `BrandWordmark.tsx:34`'s
   * `aria-label`; S1.4 §3.4's keep-as-is list.
   */
  'brand.name': { text: 'Apunta' },

  /** The notes column's header, `NotesColumn.tsx:41`. */
  'notes.title': { text: 'Notes' },

  /**
   * "3 notes" / "1 note", the sub-line of a patient row — `format.ts:59-61`
   * (`noteCountLabel`) and `plural.ts:2-4` (`plural`), which agree.
   *
   * A count of 1,000 and above now groups, because the number is the key's
   * `number` parameter and goes through `Intl.NumberFormat`: `1,000 notes`
   * where `noteCountLabel` printed `1000 notes`. That is Fixed decision 5
   * (grouping is whatever `Intl` says) and it is the one English change this
   * catalogue makes; S2.7/S2.8 meet it as a decided change.
   */
  'notes.count': {
    text: '{count} note',
    plural: {
      one: '{count} note',
      other: '{count} notes',
    },
    kind: { count: 'number' },
  },

  /** "Today", for a note written in this session: `formatNoteDate`, `format.ts:34`. */
  'notes.today': { text: 'Today' },

  /**
   * "today" in lower case — the same fact as `notes.today`, for the second half
   * of the note header, where the sentence already says `edited`:
   * `formatEditedDate`, `format.ts:41`.
   *
   * A second key rather than a reused one because English is two different
   * strings here (`Today` and `today`) and the catalogue is the app as it has
   * always been: merging them would change what a screen says.
   */
  'note.editedToday': { text: 'today' },

  /**
   * The note header, `NoteView.tsx:626` — the first of the two sentences, with
   * a real date. `{date}` is the ISO timestamp and `t()` renders it in the
   * active locale (`Intl`, `t.ts`'s `DATE_OPTIONS`), which is what `DATE_FORMAT`
   * of `format.ts:20-24` does for English. `{name}` is the patient's name: data,
   * never translated.
   *
   * The same-day case is `note.metaToday` below, because "Today" is a word and
   * not a date, and the one-word difference is the whole of it.
   */
  'note.meta': {
    text: '{name} · created {date}',
    kind: { name: 'text', date: 'date' },
  },

  /**
   * `NoteView.tsx:625`, the same sentence for a note written today, with
   * `notes.today` passed in as `{today}`.
   */
  'note.metaToday': {
    text: '{name} · created {today}',
    kind: { name: 'text', today: 'text' },
  },

  /**
   * The second half of the header, `NoteView.tsx:630`. The leading ` · ` is
   * part of the value because it is part of what the line reads: it is the
   * separator the two halves share, and the same-day key below has to carry it
   * too. JSX puts the two renderings next to each other with nothing between
   * them, so together they read exactly as `NoteView.tsx:624-631` did.
   */
  'note.editedMeta': {
    text: ' · edited {date}',
    kind: { date: 'date' },
  },

  /** `NoteView.tsx:629`: the same half for an edit made today. */
  'note.editedMetaToday': {
    text: ' · edited {today}',
    kind: { today: 'text' },
  },

  /**
   * A calendar date, the way a plan is dated today: `formatPlanDate`,
   * `format.ts:90`. `{day}` is a `YYYY-MM-DD` string, parsed field by field
   * rather than through `new Date(iso)`, which reads a bare date as UTC
   * midnight and shows the day before west of Greenwich.
   */
  'notes.date': {
    text: '{day}',
    kind: { day: 'dateOnly' },
  },

  /**
   * An instant as the calendar date it fell on locally:
   * `formatInstantAsDate`, `format.ts:105`.
   */
  'note.updatedAt': {
    text: '{at}',
    kind: { at: 'date' },
  },

  /**
   * The stale-backup warning, `BackupCard.tsx:180` with
   * `BACKUP_STALE_DAYS`. A number, so a large value groups; the sentence is
   * otherwise the one the app shows.
   */
  'backup.stale': {
    text: 'No backup for over {days} day.',
    plural: {
      one: 'No backup for over {days} day.',
      other: 'No backup for over {days} days.',
    },
    kind: { days: 'number' },
  },

  /**
   * The brainstorm thread's empty state, `BrainstormView.tsx:175-178`, with
   * `firstName` (`format.ts:16-18`): "Think out loud about John — this
   * conversation is never written into their notes."
   */
  'brainstorm.empty': {
    text: 'Think out loud about {name} — this conversation is never written into their notes.',
    kind: { name: 'text' },
  },

  /**
   * The first `errors.` key: the message the server sends for
   * `language_unavailable` today, byte for byte
   * (`server/src/routes/settings.test.ts:149` pins the same bytes).
   *
   * Every code's key is `errors.<code>` and the codes come from the closed
   * `ApiErrorCodeSchema`; S2.5 owns the rest of the list. Naming the text in
   * the catalogue is what lets the client render a code in the language of
   * the request while the server's own logs stay English and content-free.
   */
  'errors.language_unavailable': {
    text: 'Español is not available in this build of Apunta. Choose English, or install the Spanish edition.',
  },

  /*
   * The server's own sentences — S2.5's list.
   *
   * Everything a person reads that the *server* produced: the API error bodies
   * (`{ error, message, details }`), the twenty AI failures sent as SSE
   * `error` events, the refine-lock notices, the `status` and `progress`
   * frames, the import and backup sentences, the two persisted strings and the
   * boot-error page.
   *
   * **The wire does not change.** `message` still carries a finished string;
   * `error` and `code` stay the machine-readable field a client branches on.
   * Each entry below names the `file:line` that sends those exact bytes today,
   * because "English unchanged" (C-LANG@1 rules 3 and 5) is only checkable
   * against the line it came from.
   *
   * `errors.<code>` is a code's single generic sentence; every *other*
   * sentence under a code takes a short kebab-case slug
   * (`errors.bad_request.wav_unreadable`). The namespace and the closed
   * `ApiErrorCodeSchema` are unchanged, so no code is added here — a sentence
   * that cannot be told from its code's generic one gets a slug, not a code.
   */

  /**
   * The handler's own 500, `http/errors.ts:134`. The one API code with exactly
   * one sentence, so its key is the bare code.
   */
  'errors.internal_error': { text: 'Something went wrong on the server.' },

  /**
   * The app's own 404 for an unknown route, `app.ts:150`. A framework-ish
   * string by design: it names no resource, and the SPA fallback answers
   * everything that is not under `/api`.
   */
  'errors.not_found.route': { text: 'Not Found' },

  /**
   * C-SNAP@1 rule 3's 409, from the lock's one sentence
   * (`backup/lock.ts:51`) — the only `BackupError` whose code has exactly one
   * sentence, so the route can key it without widening `BackupError`.
   */
  'errors.backup_in_progress': {
    text: 'another backup is already running. Wait for it to finish, then try again.',
  },

  /** `shared/src/note.ts`'s 409 on a note another window just wrote. */
  'errors.stale_write.note_changed': { text: 'This note changed in another window.' },

  /* --- errors.bad_request: the validation and refusal sentences --- */

  /** `http/validate.ts:14`, carried by every schema failure in `shared/`. */
  'errors.bad_request.body_invalid': { text: 'Request body is invalid' },
  /** `http/validate.ts:22`. */
  'errors.bad_request.query_invalid': { text: 'Query string is invalid' },
  /** `http/validate.ts:30`. */
  'errors.bad_request.params_invalid': { text: 'Route parameters are invalid' },

  /**
   * One sentence, two routes: `routes/import.ts:73` and `routes/halaxy.ts:51`
   * both refuse an import with no format to put the notes in. A key per
   * *sentence*, not per file.
   */
  'errors.bad_request.needs_format': {
    text: 'Create a note format before importing, so the notes have somewhere to go.',
  },

  /** `routes/backup.ts:56` — the folder is resolved, not created, on a GET. */
  'errors.bad_request.backup_path_not_absolute': {
    text: 'A backup folder must be an absolute path.',
  },
  /** `routes/backup.ts:158`. `{name}` is the filename she typed: data. */
  'errors.bad_request.backup_filename_invalid': {
    text: '{name} is not an Apunta backup filename (apunta-backup-YYYY-MM-DD.zip).',
    kind: { name: 'text' },
  },

  /** `routes/formats-detect.ts:45` — the `kind` field, read by hand. */
  'errors.bad_request.format_detect_kind': {
    text: 'Tell Apunta whether these are a blank template or completed notes.',
  },
  /** `routes/formats-detect.ts:49`. */
  'errors.bad_request.format_detect_no_file': { text: 'Choose a file to read the format from.' },
  /** `routes/formats-detect.ts:51`. */
  'errors.bad_request.format_detect_examples': {
    text: 'Upload 2 or 3 completed notes so Apunta can see what they have in common.',
  },
  /** `routes/formats-detect.ts:68` — a valid answer that is not a format. */
  'errors.bad_request.format_detect_unusable': {
    text: "Apunta read the file but couldn't make a usable format out of it. Try describing the sections yourself.",
  },
  /** `routes/formats-detect.ts:92`. */
  'errors.bad_request.format_detect_skill_file': {
    text: 'Choose a SKILL.md file, or a .zip of the skill folder.',
  },
  /** `routes/formats-detect.ts:159`, the one-file branch of it. */
  'errors.bad_request.format_detect_one_file': { text: 'Upload one file at a time.' },
  /** `routes/formats-detect.ts:159`, the many branch. */
  'errors.bad_request.format_detect_too_many_files': {
    text: 'Upload at most {max} files at once.',
    kind: { max: 'number' },
  },
  /** `routes/formats-detect.ts:179` — the 10 MB document ceiling. */
  'errors.bad_request.format_detect_file_too_large': {
    text: "That file is larger than 10 MB. If it's a scan, Apunta can't read it anyway — it does no OCR.",
  },
  /** `routes/formats-detect.ts:187`. */
  'errors.bad_request.format_detect_not_multipart': {
    text: 'Upload the file with the form on the previous screen.',
  },

  /** `routes/halaxy.ts:46` — the review-selection field. */
  'errors.bad_request.halaxy_selection_invalid': {
    text: 'The Halaxy review selection is not valid.',
  },
  /** `routes/halaxy.ts:47`. */
  'errors.bad_request.halaxy_no_patients': { text: 'Select at least one patient to import.' },
  /** `routes/halaxy.ts:75` — neither matched nor created. */
  'errors.bad_request.halaxy_patient_unmatched': {
    text: 'Choose an active matching patient or Create new before importing.',
  },
  /** `routes/halaxy.ts:114`. */
  'errors.bad_request.halaxy_not_multipart': {
    text: 'Send one or more PDFs as multipart/form-data using the files field.',
  },
  /** `routes/halaxy.ts:124`. */
  'errors.bad_request.halaxy_wrong_field': { text: 'Upload PDFs in the files field.' },
  /** `routes/halaxy.ts:128`. */
  'errors.bad_request.halaxy_not_pdf': { text: 'Halaxy exports must be PDF files.' },
  /** `routes/halaxy.ts:132`. */
  'errors.bad_request.halaxy_pdf_too_large': { text: 'A PDF is too large to read in one go.' },
  /** `routes/halaxy.ts:136`. */
  'errors.bad_request.halaxy_pdfs_too_large': {
    text: 'The selected PDFs are too large to read in one go.',
  },
  /** `routes/halaxy.ts:139`. */
  'errors.bad_request.halaxy_no_files': { text: 'Choose at least one Halaxy PDF.' },
  /** `routes/halaxy.ts:144` — the fallback when nothing more specific applies. */
  'errors.bad_request.halaxy_unreadable': {
    text: "Apunta couldn't read that PDF. Choose a text-based Halaxy export.",
  },
  /** `import/halaxy/parser.ts:43` — the header names no patient. */
  'errors.bad_request.halaxy_no_patient_header': {
    text: 'The PDF does not identify a patient in its header.',
  },
  /** `import/halaxy/parser.ts:48` — no dated heading survived the date rules. */
  'errors.bad_request.halaxy_no_dated_sessions': {
    text: 'The PDF has no unambiguous dated sessions to import.',
  },
  /** `import/halaxy/parser.ts:88` — headings, but no text under any of them. */
  'errors.bad_request.halaxy_no_session_text': {
    text: 'The PDF has dated headings but no session text.',
  },

  /**
   * The five `warnings` `import/halaxy/parser.ts` returns to the browser beside
   * the preview. They are advice rather than a 400, but they are the same
   * module's sentences on the same screen, so they sit beside its other keys
   * rather than in a namespace of their own. `{date}` is the stored session
   * date as data, not through `Intl` — the wire carries `2026-08-08` today and
   * formatting it would change the English.
   */
  'errors.bad_request.halaxy_text_before_first_session': {
    text: 'Text before the first dated session was not imported.',
  },
  'errors.bad_request.halaxy_close_date_labels': {
    text: 'Some date labels were close to other headings; check the session boundaries.',
  },
  'errors.bad_request.halaxy_bare_date_heading': {
    text: 'Some sessions had a bare date heading; check those session boundaries before importing.',
  },
  'errors.bad_request.halaxy_date_like_line': {
    text: 'A date-like line inside a session was left in that session; check the session boundaries.',
  },
  'errors.bad_request.halaxy_empty_session': {
    text: 'The session on {date} has no text.',
    kind: { date: 'text' },
  },

  /** `routes/import.ts:162`. */
  'errors.bad_request.import_not_multipart': {
    text: 'Send the export as multipart/form-data with one file.',
  },
  /** `routes/import.ts:180`. */
  'errors.bad_request.import_too_large': { text: 'That export is too large to read in one go.' },
  /** `routes/import.ts:184`. */
  'errors.bad_request.import_no_file': {
    text: 'No file arrived. Choose the export Claude sent you.',
  },
  /** `routes/import.ts:188`. */
  'errors.bad_request.import_patient_limit': {
    text: 'List at most {max} names.',
    kind: { max: 'number' },
  },
  /** `routes/import.ts:191`. */
  'errors.bad_request.import_bad_source': { text: 'The note source must be "assistant" or "human".' },
  /** `routes/import.ts:193`. */
  'errors.bad_request.import_bad_cutoff': { text: 'Use a cutoff date like 2026-07-01.' },
  /** `routes/import.ts:199`. */
  'errors.bad_request.import_bad_exclude': {
    text: 'Could not read the list of unticked patients.',
  },
  /** `routes/import.ts:212`. */
  'errors.bad_request.import_bad_existing': {
    text: 'Could not read the patient import choices.',
  },
  /** `import/claude.ts:84` — a zip that is not a Claude export. */
  'errors.bad_request.import_not_claude_export': {
    text: 'That file is not a Claude export. Expected the zip Claude sent you, or its conversations.json.',
  },
  /** `import/claude.ts:92`. */
  'errors.bad_request.import_no_conversations_json': {
    text: 'That zip has no conversations.json in it, so it is not a Claude export.',
  },
  /** `import/claude.ts:101`. `{filename}` is a name from the upload: data. */
  'errors.bad_request.import_json_unreadable': {
    text: '{filename} could not be read as JSON.',
    kind: { filename: 'text' },
  },
  /** `import/claude.ts:109`. */
  'errors.bad_request.import_no_conversations': { text: 'No conversations were found in that file.' },

  /**
   * `routes/prep.ts:137` — a cited note belongs to another patient, and this
   * one has no full stop today. Not fixed here: the copy is the owner's.
   */
  'errors.bad_request.prep_foreign_note': {
    text: 'This briefing cites a note that does not belong to this patient',
  },

  /** `routes/settings.ts:79` — a `language` that is neither `en` nor `es-MX`. */
  'errors.bad_request.settings_bad_language': { text: 'Language must be "en" or "es-MX".' },

  /** `routes/transcribe.ts:106,169` — one sentence, two upload paths. */
  'errors.bad_request.wav_unreadable': { text: 'That audio could not be read as a WAV.' },
  /** `routes/transcribe.ts:174`. */
  'errors.bad_request.dictation_too_long': {
    text: 'A dictated message can be up to {max} minutes long.',
    kind: { max: 'number' },
  },
  /** `routes/transcribe.ts:376`. */
  'errors.bad_request.transcribe_not_multipart': {
    text: 'Send the recording as multipart/form-data with one audio file.',
  },
  /** `routes/transcribe.ts:405,424` — the preview and the note's own path. */
  'errors.bad_request.transcribe_too_long': {
    text: 'That recording is too long to upload. Record it in shorter sittings.',
  },
  /** `routes/transcribe.ts:420`. */
  'errors.bad_request.transcribe_no_audio': { text: 'No audio was uploaded.' },

  /* --- errors.not_found --- */

  /** `routes/notes.ts:29,97,103,113,123` and `routes/chat.ts:532`. */
  'errors.not_found.note': { text: 'Note not found' },
  /** `routes/formats.ts:25,93`, `routes/notes.ts:52`, `routes/chat.ts:100`, … */
  'errors.not_found.note_format': { text: 'Note format not found' },
  /** `routes/patients.ts:25,59,66` and `routes/brainstorm.ts:237`. */
  'errors.not_found.patient': { text: 'Patient not found' },
  /** `routes/plans.ts:188,221,447`. */
  'errors.not_found.plan': { text: 'Plan not found' },
  /** `routes/plans.ts:89`. */
  'errors.not_found.plan_version': { text: 'No such plan version' },
  /** `routes/plans.ts:291,466`. */
  'errors.not_found.goal': { text: 'Goal not found' },
  /** `routes/import.ts:129` — an undone import, asked about twice. */
  'errors.not_found.import_undone': { text: 'That import has already been undone.' },
  /** `routes/backup.ts:163`. `{file}` is what she asked for: data. */
  'errors.not_found.backup_file': {
    text: '{file} is not a backup file in the backup folder.',
    kind: { file: 'text' },
  },
  /**
   * `routes/licenses.ts:35` — the About page's 404. A `reply.send` rather than
   * a `notFound()` call, so the route-file table does not reach it; the code on
   * the wire is still `not_found` and only the words come from here.
   */
  'errors.not_found.licenses_file': {
    text: 'The licence file was not found in this build of Apunta.',
  },

  /* --- errors.conflict --- */

  /**
   * `routes/formats.ts:107`. The count is a `number` and the entry is a
   * `plural` one, which is how `Intl` groups it (S2.2's fixed decision 4) —
   * `1 note` and `2 notes` are two forms of one sentence.
   */
  'errors.conflict.format_in_use': {
    text: 'This format is used by {count} note and cannot be deleted.',
    plural: {
      one: 'This format is used by {count} note and cannot be deleted.',
      other: 'This format is used by {count} notes and cannot be deleted.',
    },
    kind: { count: 'number' },
  },
  /** `routes/plans.ts:116`. */
  'errors.conflict.plan_draft_exists': {
    text: 'This plan already has a draft version. Activate or edit it first.',
  },
  /** `routes/plans.ts:205`. */
  'errors.conflict.plan_superseded_activate': {
    text: 'A superseded plan version cannot be reactivated.',
  },
  /** `routes/plans.ts:209`. */
  'errors.conflict.plan_already_active': { text: 'This version is already in force.' },
  /** `routes/plans.ts:459`. */
  'errors.conflict.plan_superseded_readonly': {
    text: 'This plan version has been superseded and is read-only. Start a review instead.',
  },
  /** `routes/notes.ts:110`. */
  'errors.conflict.note_published': { text: 'This note is already published.' },
  /** `routes/notes.ts:120`. */
  'errors.conflict.note_not_published': { text: 'This note is not published.' },
  /**
   * `routes/notes.ts:24-25`, used at `:85` — the prototype's own wording, kept
   * verbatim like `chat.publishedRefusal` below.
   */
  'errors.conflict.note_published_lock': {
    text: 'This note is published, so its content is locked. Unpublish it first, then edit.',
  },

  /* --- errors.storage_error: the two mapped failures and the boot page --- */

  /** `http/errors.ts:71` (ENOSPC, SQLITE_FULL). `{dir}` is the data folder. */
  'errors.storage_error.disk_full': {
    text: 'Apunta cannot write to {dir} because the disk is full. Free space and try again. Your existing data was left untouched.',
    kind: { dir: 'text' },
  },
  /** `http/errors.ts:84` (EACCES, EPERM, EROFS, SQLITE_READONLY*, CANTOPEN). */
  'errors.storage_error.read_only': {
    text: 'Apunta cannot write to {dir} because the folder is read-only or permissions do not allow access. Choose a writable folder or fix its permissions, then try again. Your existing data was left untouched.',
    kind: { dir: 'text' },
  },
  /**
   * `http/errors.ts:95` — the boot page's own sentence when nothing mapped.
   * It cannot be localised from the setting (storage is what failed), so the
   * page renders it in both languages and these two JSON bodies carry English.
   */
  'errors.storage_error.cannot_open': {
    text: 'Apunta could not open its database at {file}. Check that the folder is writable, then try again.',
    kind: { file: 'text' },
  },
  /**
   * `http/errors.ts:94` — an `Error` that is not a mapped storage failure.
   * `{detail}` is the lower layer's own English message, shown as data; the
   * frame around it is what this card localises.
   */
  'errors.storage_error.cause': {
    text: '{detail} Database: {file}.',
    kind: { detail: 'text', file: 'text' },
  },

  /*
   * The twenty AI failures, `ai/errors.ts`'s `MESSAGES`. They ride the SSE
   * `error` event as `{ code, message }`, so `code` is the branch and this
   * sentence is what she reads; `AiErrorCodeSchema` is closed and unchanged.
   */

  /** The banner inside `ai.ollama_unreachable`, and its own string today. */
  'ai.unreachable_banner': { text: "Apunta can't reach the local AI — see Setup" },
  /** `ai/errors.ts:39`. */
  'ai.ollama_unreachable': {
    text: '{banner}. Ollama does not appear to be running on this machine.',
    kind: { banner: 'text' },
  },
  /** `ai/errors.ts:43`. */
  'ai.model_missing': {
    text: "Apunta's AI model isn't installed yet — see Setup, which says how to get it.",
  },
  /** `ai/errors.ts:45`. */
  'ai.non_gguf_model': {
    text: 'The configured model is not a GGUF build, and Apunta cannot make it follow the note format reliably. Choose a GGUF model in Settings.',
  },
  /** `ai/errors.ts:47`. */
  'ai.unsupported_model_tag': {
    text: 'That model tag is an MLX/safetensors build. Apunta cannot make those follow the note format reliably — pick a GGUF tag instead.',
  },
  /** `ai/errors.ts:49`. */
  'ai.insufficient_memory': {
    text: 'This machine ran out of memory loading the AI model. Choose a smaller model in Settings and try again.',
  },
  /** `ai/errors.ts:51`. */
  'ai.input_too_long': {
    text: 'This session summary is too long for the AI to read in one go. Shorten it, or split it into two notes.',
  },
  /** `ai/errors.ts:53`. */
  'ai.context_overflow': {
    text: "The AI ran out of room and had to drop part of Apunta's instructions, so the draft was thrown away. Shorten the summary and try again.",
  },
  /** `ai/errors.ts:54`. */
  'ai.output_truncated': { text: 'The AI ran out of room mid-note. Try again, or shorten the summary.' },
  /** `ai/errors.ts:55`. */
  'ai.empty_response': { text: 'The AI returned nothing. Try again — if it keeps happening, check Setup.' },
  /** `ai/errors.ts:57`. */
  'ai.invalid_output': {
    text: "The AI returned something that wasn't a note. Try again — if it keeps happening, the model may not be following the note format.",
  },
  /** `ai/errors.ts:59`. */
  'ai.degenerate_output': {
    text: 'The AI got stuck repeating itself instead of writing the note. Try again — if it keeps happening, try a different model in Settings.',
  },
  /** `ai/errors.ts:60`. */
  'ai.timeout': {
    text: 'The AI took too long to answer. It may still be loading the model — try again in a moment.',
  },
  /** `ai/errors.ts:61`. */
  'ai.ollama_error': { text: 'The local AI reported an error. Check Setup, then try again.' },
  /** `ai/errors.ts:66`. */
  'ai.whisper_missing': {
    text: "Apunta can't find whisper on this machine, so it can't transcribe the recording. See Setup, or set the whisper path in Settings.",
  },
  /** `ai/errors.ts:68`. */
  'ai.whisper_model_missing': {
    text: "Apunta's transcription model isn't installed yet — see Setup, which says how to get it.",
  },
  /** `ai/errors.ts:70`. */
  'ai.audio_unsupported': {
    text: 'That recording is in a format Apunta cannot transcribe. Record it again from this screen.',
  },
  /** `ai/errors.ts:72`. */
  'ai.audio_decode_failed': {
    text: 'The recording could not be read — it may have been cut off mid-save. Please record it again.',
  },
  /** `ai/errors.ts:73`. */
  'ai.transcription_failed': {
    text: 'Transcribing the recording failed. Try again — if it keeps happening, check Setup.',
  },
  /** `ai/errors.ts:75`. */
  'ai.transcription_timeout': {
    text: 'Transcribing took too long and was stopped. A shorter recording will go through; a very long one may need a faster machine.',
  },
  /** `ai/errors.ts:77`. */
  'ai.transcription_empty': {
    text: 'No speech was picked up in that recording. Check that the right microphone is selected, then record again.',
  },

  /*
   * The SSE `status` and `progress` frames. A provider renders these from the
   * locale its job captured, and a route forwards the finished sentence
   * untouched — the `stage` cannot be the key, because `drafting` carries two
   * different sentences (`ai/ollama.ts` and `ai/fake.ts`).
   */

  /** `ai/ollama.ts:356,403,442`; `ai/fake.ts:303,312`; `routes/plans.ts:320`; `routes/prep.ts:61`. */
  'status.thinking': { text: 'Thinking…' },
  /** `ai/ollama.ts:364`; `ai/fake.ts:280`. */
  'status.applying_corrections': { text: 'Applying your corrections…' },
  /** `ai/ollama.ts:683` — the one retry that is not a transport retry. */
  'status.drafting_retry': { text: 'That draft came back malformed. Trying again…' },
  /** `ai/ollama.ts:934`. */
  'status.loading_model': {
    text: 'Loading the model — the first note after a restart is slower…',
  },
  /** `ai/ollama.ts:971`; `ai/fake.ts:287`. */
  'status.drafting_note': { text: 'Drafting the note…' },
  /** `routes/generate.ts:51`; `routes/transcribe.ts:261`. */
  'status.saving_draft': { text: 'Saving the draft…' },
  /** `routes/chat.ts:163` — the quoted-move fast path. */
  'status.applying_move': { text: 'Applying the move…' },
  /** `routes/chat.ts:240`; `{done}` and `{total}` are counts. */
  'status.rewriting_sections': {
    text: 'Rewriting {done} of {total} sections…',
    kind: { done: 'number', total: 'number' },
  },
  /** `routes/plans.ts:335`; `routes/prep.ts:74`. */
  'status.reading_note': {
    text: 'Reading note {index} of {total}…',
    kind: { index: 'number', total: 'number' },
  },
  /** `routes/plans.ts:349`. */
  'status.drafting_goals': { text: 'Drafting goals…' },
  /** `routes/prep.ts:87`. */
  'status.writing_briefing': { text: 'Writing the briefing…' },
  /**
   * Three twins, all in this card: `ai/whisper.ts:475` and `:508` in
   * production, `ai/fake.ts:530` in the demo path, plus the one frame
   * `routes/transcribe.ts:313` sends before the provider starts. Keying two of
   * the three would leave `APUNTA_FAKE_AI=1` bilingual and production English.
   */
  'progress.transcribing': { text: 'Transcribing…' },

  /*
   * The refine chat's server-written sentences. Each is persisted as text at
   * write time in the target note's locale (C-LANG@1 rule 4), so a row already
   * stored is shown as stored.
   */

  /**
   * `shared/src/chat.ts`'s `PUBLISHED_REFUSAL`, kept from the prototype
   * (`prototype/patients.html`, `sendChat`) word for word, curly quotes and
   * all: the copy is the owner's.
   */
  'chat.publishedRefusal': {
    text: 'This note is published, so I won’t change it. Click “Published (click to edit)” to unlock it first, then ask me again.',
  },
  /**
   * `FIRST_PASS_MESSAGE`, also kept verbatim from the prototype — "dictation"
   * included, though typed capture turned out to be the primary path.
   */
  'chat.firstPass': {
    text: "Here's a first pass based on your dictation. Tell me what to change — shorten a section, add something I missed, adjust tone — and I'll update it. Highlight any part of the note to point me right at it.",
  },
  /**
   * `routes/chat.ts:184`, the fast path's own sentence. `{source}` and
   * `{target}` are section names — stored clinical text, passed as data and
   * never translated (C-LANG@1 rule 5).
   */
  'chat.moveReply': {
    text: 'Moved the quoted text from {source} to {target}.',
    kind: { source: 'text', target: 'text' },
  },

  /**
   * The three lock notices. `…Notice.opening` is the sentence the thread is
   * stripped by (`routes/chat.ts`'s `SERVER_SENTENCES`), so it is the same
   * string in every language; `…Notice.section` is the per-block sentence, and
   * `{section}` and `{phrase}` are note content shown as data.
   */
  'chat.guardNotice.opening': { text: 'Apunta blocked part of this revision.' },
  'chat.guardNotice.section': {
    text: '{section} was kept as it was: the revision would have added "{phrase}", which is not in the note or your dictation.',
    kind: { section: 'text', phrase: 'text' },
  },
  'chat.factNotice.opening': { text: 'Apunta held back part of this revision.' },
  'chat.factNotice.section': {
    text: '{section} was kept as it was: the change would have lost "{phrase}", and nothing in your message asked to remove it.',
    kind: { section: 'text', phrase: 'text' },
  },
  'chat.factNotice.tail': { text: 'To take something out, say so and name it.' },
  'chat.priorNoteNotice.opening': { text: 'Apunta kept your other notes out of this revision.' },
  'chat.priorNoteNotice.section': {
    text: '{section} was kept as it was: the revision would have brought in "{phrase}" from another of your notes.',
    kind: { section: 'text', phrase: 'text' },
  },
  'chat.priorNoteNotice.tail': {
    text: 'To bring something over from another session, ask for it.',
  },

  /**
   * `routes/chat.ts`'s `outcome_reason` for the race the published lock names:
   * she filed the note while the model was still revising it, so the write
   * no-opped. The same field the verdict sentences below travel in, which is
   * why it is keyed here and not as an `errors.` body — it is never a status
   * code, it is the account of a turn.
   */
  'chat.publishedMidEdit': {
    text: 'The note became published before the edit could be applied.',
  },

  /*
   * The request-scope holds and the unmet-request reasons, from
   * `ai/refine-request.ts`. Both are shown twice: as a paragraph of the reply
   * and, joined, as the turn's `outcome_reason`. `{section}`, `{scope}` and
   * `{label}` are stored clinical text and her own words, passed as data and
   * never translated (C-LANG@1 rule 5).
   */

  /**
   * `ai/refine-request.ts`'s out-of-scope hold, and `chat.request.leftAlone` /
   * `chat.request.couldNot` below, are the openings `routes/chat.ts` strips a
   * persisted reply by. They are openings rather than whole sentences because a
   * hold names a section, which differs every time — so both languages'
   * openings are listed from the catalogue and the sentences below begin with
   * the opening they are declared next to.
   */
  'chat.request.leftAlone': { text: 'Apunta left' },
  'chat.request.couldNot': { text: 'Apunta could not' },
  'chat.scopeHold.outOfScope': {
    text: 'Apunta left {section} as it was: your message asked about {scope} only.',
    kind: { section: 'text', scope: 'text' },
  },
  'chat.scopeHold.additionOnly': {
    text: 'Apunta left {section} as it was: you asked only to add, and the revision would also have taken out "{phrase}".',
    kind: { section: 'text', phrase: 'text' },
  },
  /**
   * Two forms of one sentence: the whole note, or the section she named. The
   * subject used to be assembled in English from the section's name, which left
   * the Spanish sentence half English — so the subject is the key's job.
   */
  'chat.request.shorteningNote': {
    text: 'Apunta could not shorten the note: the revision came back no shorter.',
  },
  'chat.request.shorteningSection': {
    text: 'Apunta could not shorten the {section} section: the revision came back no shorter.',
    kind: { section: 'text' },
  },
  'chat.request.clearing': {
    text: 'Apunta could not clear the {section} section: the revision left it as it was.',
    kind: { section: 'text' },
  },
  'chat.request.addition': {
    text: 'Apunta could not add "{label}": the revision came back without it.',
    kind: { label: 'text' },
  },

  /**
   * The diff sentence — `ai/refine-request.ts`'s `changeSentence`, the first
   * line of *every* successful refine reply. Assembled from parts because the
   * number of parts is not known here: one section that moved, or several and
   * a medication she asked for. The verb is the key's job, not a word chosen
   * in code, which is what left this sentence English on a Spanish note.
   * `{section}` is stored clinical text and `{label}` is her own words; both
   * are passed as data and never translated (C-LANG@1 rule 5).
   */
  'chat.change.cleared': {
    text: 'cleared the {section} section',
    kind: { section: 'text' },
  },
  'chat.change.shortened': {
    text: 'shortened the {section} section',
    kind: { section: 'text' },
  },
  'chat.change.expanded': {
    text: 'expanded the {section} section',
    kind: { section: 'text' },
  },
  'chat.change.rewrote': {
    text: 'rewrote the {section} section',
    kind: { section: 'text' },
  },
  'chat.change.addition': {
    text: 'added "{label}"',
    kind: { label: 'text' },
  },
  /**
   * `I {changes}.` — the frame around the parts above. Spanish cannot keep it
   * (`I reescribí la sección…` is not a sentence), so the frame is a key even
   * though the English is a pronoun and a full stop.
   */
  'chat.change.summary': {
    text: 'I {changes}.',
    kind: { changes: 'text' },
  },

  /**
   * The conjunction that joins the last of a server-built list to the ones
   * before it. Two callers, one string: the scope a hold names
   * (`chat.scopeHold.outOfScope`'s `{scope}`) and the diff sentence's parts
   * outside the default locale — the default locale joins those with `and` and
   * nothing else, because its bytes are already stored in notes' threads
   * (`refine-request.ts`'s `changeSentence`, and the comment there). The
   * separator before that is a comma, which is punctuation and not a
   * language's, so only this one word is a key — the same reason
   * `chat.retractionNotice.list` is.
   */
  'chat.list.last': {
    text: '{first} and {last}',
    kind: { first: 'text', last: 'text' },
  },

  /**
   * `assessRefine`'s two reason fallbacks — the account of a turn in
   * `outcome_reason`, for the two shapes no check or notice explains. Distinct
   * sentences from `chat.alreadyThereNotice` and `chat.unchangedNotice` above,
   * which are whole replies rather than the reason beside them.
   */
  'chat.verdict.alreadySaid': {
    text: 'The note already said what you asked for.',
  },
  'chat.verdict.noChanges': {
    text: 'The requested edit produced no changes.',
  },

  /**
   * The three sentences that are a whole reply on a turn that changed nothing,
   * and the one a question-with-a-rewrite-attached gets appended. Like the lock
   * notices they are persisted in the note's own locale and stripped from the
   * model's history in both languages.
   */
  'chat.unchangedNotice': {
    text: 'Apunta did not change the note: the revision came back with no edits.',
  },
  'chat.alreadyThereNotice': {
    text: 'Apunta did not change the note: it already said what you asked for.',
  },
  'chat.questionLeftAlone': {
    text: 'Apunta left the note unchanged: you asked a question, not for an edit.',
  },

  /**
   * The retraction pass's notice, appended to the first-pass opening in the
   * note's chat (`ai/retractions.ts`, `routes/draft.ts`). Assembled from parts
   * because the middle is a list whose length is not known here: one dropped
   * claim, or several, and Spanish joins the last one with `y` rather than
   * `and`. `{opening}` and `{list}` carry the two halves.
   */
  'chat.retractionNotice.opening': {
    text: 'Apunta applied the corrections you made as you spoke',
  },
  'chat.retractionNotice.dropped': {
    text: 'left out “{withdrawn}”',
    kind: { withdrawn: 'text' },
  },
  'chat.retractionNotice.replaced': {
    text: 'left out “{withdrawn}” in favour of “{replacement}”',
    kind: { withdrawn: 'text', replacement: 'text' },
  },
  'chat.retractionNotice.list': {
    text: '{first}; and {last}',
    kind: { first: 'text', last: 'text' },
  },
  'chat.retractionNotice.sentence': {
    text: '{opening}, before drafting: {list}.',
    kind: { opening: 'text', list: 'text' },
  },

  /**
   * `settings.last_backup_error` as it is stored from this card on: an ISO
   * `at` plus the failure's own words. The wire field stays a string
   * (`shared/src/backup.ts:221`) rendered by `GET /api/backup` in the request's
   * language, so `BackupCard.tsx:210` and the shared schema do not change.
   */
  'backup.failure': {
    text: '{at} — {detail}',
    kind: { at: 'date', detail: 'text' },
  },

  /*
   * The boot-error page. Storage is what failed, so nothing on it can read the
   * setting: the page renders the English sentence and then the Spanish one
   * under `<html lang="en">`, and the two JSON bodies carry English.
   */

  /** `boot-error.ts:22,24` — the title and the one heading. */
  'boot.title': { text: 'Apunta could not start' },
  /** `boot-error.ts:24`, the label over the data folder. */
  'boot.dataFolder': { text: 'Data folder:' },
  /** `boot-error.ts:24` — what to do about it. */
  'boot.recovery': {
    text: 'Make sure the disk has space and this folder is available and writable, then start Apunta again. Your existing database was left untouched.',
  },

  /*
   * The shell, the home launcher, the capture panel, the note view and the
   * refine chat — S2.3's fourteen components, every visible string in them.
   *
   * Each entry names the line that carries it today, which is the only way a
   * reviewer can tell a moved sentence from a rewritten one. A key with no
   * `kind` map has `{name}` parameters only, and a name the map does not list
   * is `text`, so the map is written out in full wherever a key has parameters.
   */

  /**
   * The last name in a list, `NoteBody.tsx:173` and `NoteView.tsx:600`:
   * "Objective, Assessment and Plan". `{items}` is everything but the last
   * name, already comma-separated — punctuation a language reads the same way
   * — and the conjunction is the one word here a language has to choose.
   */
  'common.listLast': { text: '{items} and {last}', kind: { items: 'text', last: 'text' } },

  /** The confirmation dialog's other button, `ConfirmDialog.tsx:47`. */
  'common.cancel': { text: 'Cancel' },

  /** The toast's dismiss button, `Toast.tsx:44`. */
  'common.dismiss': { text: 'Dismiss' },

  /** The send arrow, `ComposerButtons.tsx:109`. */
  'common.send': { text: 'Send' },

  /** The stop square that replaces the send arrow while a reply streams, `ComposerButtons.tsx:96`. */
  'common.stop': { text: 'Stop' },

  /** Beside a failed thread load, `RefineColumn.tsx:208`. */
  'common.tryAgain': { text: 'Try again' },

  /**
   * The thinking dots' own name when a caller gives them none, `ThinkingDots.tsx:22`.
   * The visible label and the spoken description are both the caller's; this is
   * only the floor under them.
   */
  'common.working': { text: 'Working' },

  /** The refine chat's floor under the server's own status, `RefineColumn.tsx:223`. */
  'common.thinking': { text: 'Thinking' },

  /** The home screen's question, `HomeLauncher.tsx:85`. */
  'home.title': { text: 'Let’s focus on…' },

  /** The home search box's placeholder, `HomeLauncher.tsx:92`. */
  'home.searchPlaceholder': { text: 'Search patients' },

  /** Its spoken name, `HomeLauncher.tsx:93`. */
  'home.searchLabel': { text: 'Find a patient' },

  /** The results list's spoken name, `HomeLauncher.tsx:107`. */
  'home.resultsLabel': { text: 'Patients' },

  /**
   * The last row of the home results, `HomeLauncher.tsx:146`: "New: John".
   * `{name}` is what she typed, so it is data and never translated.
   */
  'home.newWith': { text: 'New: {name}', kind: { name: 'text' } },

  /**
   * The live-recording stage label, `LiveRecording.tsx:50`. The capture route
   * renders the same panel through this component, so the string is here rather
   * than passed down.
   */
  'capture.recordingSession': { text: 'Recording session' },

  /** The line under it, `LiveRecording.tsx:52`. */
  'capture.liveHint': {
    text: 'Speak naturally. You can add typed notes before or while this recording.',
  },

  /**
   * The waiting state of the provisional words, `LiveRecording.tsx:74` — twice
   * on that line, once visible and once as the dots' spoken name.
   */
  'capture.listening': { text: 'Listening for words…' },

  /**
   * What the provisional words are, `ComposerButtons.tsx:22`. The capture
   * screen's own variant of this line is S2.4's, in its own file.
   */
  'dictation.previewNote': {
    text: 'Everything so far, roughly. Your message is written from the finished recording.',
  },

  /** The dictation panel's stop control, `ComposerButtons.tsx:32`. */
  'dictation.stop': { text: 'Stop dictating' },

  /** The composer's microphone, idle, `ComposerButtons.tsx:71`. */
  'dictation.mic': { text: 'Dictate a message' },

  /** The same microphone while whisper has the clip, `ComposerButtons.tsx:87`. */
  'dictation.transcribing': { text: 'Transcribing' },

  /** The suggestion's spoken name, `InterventionApproachSuggestion.tsx:35`. */
  'approach.label': { text: 'Suggested intervention approach' },

  /** Its title, `InterventionApproachSuggestion.tsx:38`. */
  'approach.possible': { text: 'Possible approach for Intervention' },

  /**
   * The add control, `InterventionApproachSuggestion.tsx:54`. `{approach}` is
   * the label the shared matcher read out of the note — clinical text, passed
   * through as data.
   */
  'approach.add': { text: 'Add {approach} to Intervention', kind: { approach: 'text' } },

  /** The dismiss control, `InterventionApproachSuggestion.tsx:63`. */
  'approach.notNow': { text: 'Not now' },

  /** The refine sheet's name, `RefineColumn.tsx:172` and `:184`, and the launcher's, `NoteView.tsx:773`. */
  'refine.title': { text: 'Refine note' },

  /** The sheet's close button, `RefineColumn.tsx:190`, and the launcher's aria-label, `NoteView.tsx:761`. */
  'refine.closeLabel': { text: 'Close Refine note' },

  /** While the thread loads, `RefineColumn.tsx:203`. */
  'refine.loadingConversation': { text: 'Loading the conversation…' },

  /** The empty thread's hint, `RefineColumn.tsx:213`. */
  'refine.empty': { text: 'Ask a question about this note, or give feedback to refine it.' },

  /** The composer's placeholder, `RefineColumn.tsx:282`. */
  'refine.inputPlaceholder': { text: 'Ask a question or give feedback...' },

  /** The same composer's spoken name, `RefineColumn.tsx:283`. */
  'refine.inputLabel': { text: 'Ask a question or give feedback' },

  /**
   * A pre-send save failure, `RefineColumn.tsx:28`'s `SAVE_BEFORE_CHAT_ERROR`
   * and the throw at `:134` — a full sentence that reaches the screen, and the
   * one class of string the literal checker cannot see. A **UI** key, not an
   * `errors.<code>` one: the server sent no code, and that namespace is the
   * server's own list.
   *
   * `Apunta` is a keep-as-is token *inside* a sentence, so it is written out
   * verbatim in both catalogues and never allowlisted: the allowlist matches
   * whole strings only, and this one is not a whole string.
   */
  'refine.saveBeforeChat': {
    text: "Your latest edits haven't saved, so Apunta can't use them yet. Try again.",
  },

  /** The rewrite landed whole, `RefineColumn.tsx:240`. */
  'refine.outcomeApplied': { text: 'Changes applied' },

  /** It landed with something held back, `RefineColumn.tsx:242`. */
  'refine.outcomePartial': { text: 'Some changes applied' },

  /** Nothing was written, `RefineColumn.tsx:243`. */
  'refine.outcomeNone': { text: 'No changes applied' },

  /** The chip's clear control, `RefineColumn.tsx:263`. */
  'refine.clearQuoteLabel': { text: 'Clear highlighted excerpt' },

  /** The note editor's spoken name, `NoteBody.tsx:151`. */
  'note.body': { text: 'Note body' },

  /**
   * The blanks indicator, `NoteBody.tsx:133`. `{sections}` is the format's own
   * section names, joined by `common.listLast` — data, joined, not translated.
   */
  'notes.emptySections': {
    text: 'Nothing recorded in {sections} — add or leave blank.',
    kind: { sections: 'text' },
  },

  /** The save state, quiet, `NoteView.tsx:643`. */
  'note.saveSaved': { text: 'Saved' },

  /** The save state, in flight, `NoteView.tsx:638`. */
  'note.saveSaving': { text: 'Saving…' },

  /** The save state, failed, `NoteView.tsx:640`. */
  'note.saveError': { text: 'Couldn’t save' },

  /** The save state, another window got there first, `NoteView.tsx:642`. */
  'note.saveConflict': { text: 'Changed in another window' },

  /** The editor's own label while a rewrite is in flight, `NoteView.tsx:647`. */
  'note.updating': { text: 'Updating the note…' },

  /** The launcher's spoken name for the same moment, `NoteView.tsx:772`. */
  'note.updatingShort': { text: 'Updating the note' },

  /**
   * The flash after a rewrite, `NoteView.tsx:652`. `{sections}` is the list of
   * sections that moved, joined by `common.listLast`.
   */
  'note.updatedSections': { text: 'Updated {sections}', kind: { sections: 'text' } },

  /** The copy control, `NoteView.tsx:676`. */
  'note.copy': { text: 'Copy' },

  /** The same control, for a moment after it worked, `NoteView.tsx:676`. */
  'note.copied': { text: 'Copied' },

  /** What a published note's action says, `NoteView.tsx:692`. */
  'note.editAgain': { text: 'Edit again' },

  /** What a draft's action says, `NoteView.tsx:692`. */
  'note.finishAndCopy': { text: 'Finish & copy' },

  /** The delete control's title and aria-label, `NoteView.tsx:658-659`, and the dialog's button, `NoteView.tsx:798`. */
  'note.deleteLabel': { text: 'Delete note' },

  /** The delete confirmation's title, `NoteView.tsx:797`. */
  'note.deleteTitle': { text: 'Delete this note?' },

  /** Its first paragraph, `NoteView.tsx:801`. */
  'note.deleteBodyFirst': {
    text: 'The note, its transcript and the refine conversation all go. It cannot be undone here.',
  },

  /** Its second paragraph, `NoteView.tsx:802`. */
  'note.deleteBodySecond': {
    text: 'If you have already pasted this note into your records system, that copy is untouched — and so is any backup written before now.',
  },

  /** The conflict banner's sentence, `NoteView.tsx:699`. */
  'note.conflictHelp': { text: 'This note was changed in another window. Your edits are still here.' },

  /** Keep the local edit, `NoteView.tsx:702-704`. */
  'note.conflictKeepMine': { text: 'Keep mine' },

  /** The same, when the other window's note is locked, `NoteView.tsx:702-704`. */
  'note.conflictUnlockApply': { text: 'Unlock and apply my edit' },

  /** Take the other window's version, `NoteView.tsx:707`. */
  'note.conflictTakeTheirs': { text: 'Take theirs' },

  /**
   * The two messages a failed flush rejects with, `NoteView.tsx:320` and `:321`.
   * They are not noise: `handlePublishToggle` catches them and paints them in
   * the editor's error line, so they are user-visible like any other.
   */
  'note.unsavedConflict': { text: 'Unresolved conflict' },
  'note.unsavedError': { text: 'Unsaved changes could not be saved' },

  /*
   * Everything else in the web app: the twelve routes, the twenty-three
   * components S2.3 left alone, and `web/src/App.tsx`'s own twelve literals.
   *
   * Every entry names the line that carried the string at commit `dac687b`, so
   * a reviewer can tell a moved sentence from a rewritten one, and each English
   * value is that line's text character for character (Fixed decision 7). The
   * namespaces are the screens: `settings.`, `setup.`, `about.`, `licenses.`,
   * `backup.`, `plan.`, `prep.`, `import.`, `halaxy.`, `format.`, `capture.`,
   * `spelling.`, `brainstorm.`, `directory.`, `workspace.`, `app.` — plus
   * `common.` for the handful of strings more than one screen writes, `doc.`
   * for the browser tab's own name, and `count.` for a countable noun on its
   * own.
   *
   * Three shapes recur and are worth naming once.
   *
   * **A parameter that is stored data.** A version number, a status, a section
   * name, a file path, a patient name: passed verbatim, never translated
   * (Fixed decision 4, C-LANG@1 rule 5). Most are declared `text`, which is the
   * default, and the `kind` map spells them out wherever a key has parameters.
   *
   * **A date that reached `t()` raw.** `notes.date` (`dateOnly`) and
   * `note.updatedAt` (`date`) are the two the oracle `web/src/lib/format.ts`
   * was pinned to, and a `YYYY-MM-DD` string reaches one of them rather than
   * the `Aug 8, 2026` `formatPlanDate` prints (Fixed decision 3). The one
   * exception is stated at its own entry, `backup.tested`.
   *
   * **A sentence split around an inline element.** The literal checker cannot
   * see one of these, and where the element is a link, a button or a `<strong>`
   * the app needs, the two halves are two keys rather than one key with the
   * element deleted. The `about.` block is the worked example and says so at
   * each seam.
   */

  /**
   * `Loading…`, on its own: the formats list (`Settings.tsx:198`), the licences
   * (`Licenses.tsx:89`), the backup card (`BackupCard.tsx:143`), the brainstorm
   * thread (`BrainstormView.tsx:166`) and the route's own `Suspense` fallback
   * (`App.tsx:101`).
   */
  'common.loading': { text: 'Loading…' },

  /** `AiBanner.tsx:52`, `Setup.tsx:63` and `Setup.tsx:108`. */
  'common.checkAgain': { text: 'Check again' },

  /** The `/setup` link, `AiBanner.tsx:43`, `About.tsx:100`, `Settings.tsx:282`. */
  'common.setup': { text: 'Setup' },

  /** `About.tsx:55`, `Settings.tsx:531`, `Workspace.tsx:531`, and the back labels. */
  'common.settings': { text: 'Settings' },

  /** The `Screen` back label, `AddPatient.tsx:40` and `OnboardingPreview.tsx:115`. */
  'common.back': { text: 'Back' },

  /** The back label and the notes-column back control, `NotesColumn.tsx:38`. */
  'common.patients': { text: 'Patients' },

  /** The two search fields' placeholder, `PatientDirectory.tsx:80` and `PatientsColumn.tsx:114`. */
  'common.search': { text: 'Search' },

  /** The same two fields' spoken name, `PatientDirectory.tsx:81` and `PatientsColumn.tsx:116`. */
  'common.searchPatients': { text: 'Search patients' },

  /** The licence copy control, `Licenses.tsx:114`, and the setup command, `Setup.tsx:198`. */
  'common.copy': { text: 'Copy' },

  /** The same control once it has worked, `Licenses.tsx:114` and `Setup.tsx:198`. */
  'common.copied': { text: 'Copied' },

  /** An empty plan field, and the participation default, `PlanDetails.tsx:231` and `:24`. */
  'common.notRecorded': { text: 'Not recorded' },

  /** The floor under a streaming reply's own status, `BrainstormView.tsx:192`. */
  'common.thinkingBusy': { text: 'Thinking…' },

  /** The first status a drafting run shows, `Capture.tsx:230`, `PlanView.tsx:123`, `PrepView.tsx:57`. */
  'common.starting': { text: 'Starting…' },

  /** Both import screens' submit button while it runs, `Import.tsx:269`, `HalaxyImport.tsx:210`. */
  'common.importing': { text: 'Importing…' },

  /** The briefing's button while it runs, `PrepView.tsx:123`. */
  'common.reading': { text: 'Reading…' },

  /** The briefing's Keep control, `PrepView.tsx:143`. */
  'common.keep': { text: 'Keep' },

  /** The same control once the briefing is stored, `PrepView.tsx:144`. */
  'common.kept': { text: 'Kept' },

  /** The section-chip add control, `OnboardingPreview.tsx:244`. */
  'common.add': { text: 'Add' },

  /** The rename form's submit, `PatientRenameForm.tsx:44`. */
  'common.save': { text: 'Save' },

  /** The formats list, `Settings.tsx:228`, and the goal editor, `PlanGoalCard.tsx:108`. */
  'common.edit': { text: 'Edit' },

  /** The workspace's delete dialog, `Workspace.tsx:503`. */
  'common.archive': { text: 'Archive' },

  /** Both import histories, `ImportBatchList.tsx:47`. */
  'common.undo': { text: 'Undo' },

  /*
   * The browser tab's own name, `useDocumentTitle`. The hook composes
   * `${title} · Apunta` and `APP_NAME` is a keep-as-is token it owns
   * (`web/src/hooks/useDocumentTitle.ts:14`), so only the part this app
   * chooses is a key — and no patient name ever goes in it, which is why the
   * workspace says `Patients`.
   */

  /** `Settings.tsx:129` and `About.tsx:15`. */
  'doc.settings': { text: 'Settings' },
  /** `Setup.tsx:33`. */
  'doc.setup': { text: 'Setup' },
  /** `About.tsx:15`. */
  'doc.about': { text: 'About' },
  /** `Licenses.tsx:53`. */
  'doc.licences': { text: 'Licences' },
  /** `Workspace.tsx:86`. */
  'doc.patients': { text: 'Patients' },
  /** `AddPatient.tsx:11`. */
  'doc.newPatient': { text: 'New patient' },
  /** `Capture.tsx:69`. */
  'doc.newNote': { text: 'New note' },
  /** `OnboardingFormat.tsx:25` and `OnboardingPreview.tsx:26`. */
  'doc.noteFormat': { text: 'Note format' },
  /** `Import.tsx:50`. */
  'doc.importClaude': { text: 'Import from Claude' },
  /** `HalaxyImport.tsx:22`. */
  'doc.importHalaxy': { text: 'Import from Halaxy' },

  /*
   * `web/src/App.tsx` — the loading note and the whole primary-window blocker,
   * the twelve literals the `web/src/routes/*.tsx` glob could never reach.
   * Every one of them renders inside `AppRoutes`, which is inside
   * `I18nProvider` (`App.tsx:41-52`), so `useI18n()` reaches all of them.
   */

  /** `App.tsx:548`. */
  'app.primary.opening': { text: 'Opening Apunta…' },
  /** `App.tsx:551`. */
  'app.primary.checking': { text: 'Checking which window is the primary one.' },
  /** `App.tsx:557`. */
  'app.primary.unsupportedTitle': { text: 'This browser can’t keep one editing window' },
  /** `App.tsx:561`. */
  'app.primary.unsupportedBody': {
    text: 'Apunta needs the Web Locks API to make sure only one window edits at a time, and this browser doesn’t have it. This window stays blocked with no edit access — open Apunta in Chromium or Safari to continue.',
  },
  /** `App.tsx:570`. */
  'app.primary.takingOver': { text: 'Taking over…' },
  /** `App.tsx:574`. */
  'app.primary.takingOverBody': {
    text: 'The other window is saving its pending edits and stepping down. This window unlocks as soon as it does.',
  },
  /** `App.tsx:587`. */
  'app.primary.blockedTitle': { text: 'Apunta is open in another window' },
  /** `App.tsx:591`. */
  'app.primary.blockedBody': {
    text: 'Only one window can edit at a time, so this window is blocked. Should this window become primary? The other window saves its work and becomes blocked instead.',
  },
  /** `App.tsx:597`. */
  'app.primary.decline': { text: 'Not now' },
  /** `App.tsx:606`. */
  'app.primary.takeover': { text: 'Make this the primary window' },

  /*
   * The AI banner, `AiBanner.tsx`. The sentence is split by a `<Link>` and a
   * `<button>`, both of which the screen needs, so it is keyed at the element
   * boundary: what leads into the link, the link, what follows, and the button.
   * `{model}` is the stored model name, or empty when the server named none.
   */

  /** `AiBanner.tsx:35`. */
  'ai.modelMissing': { text: "Apunta can't find the AI model{model} — see", kind: { model: 'text' } },
  /** `AiBanner.tsx:36`. */
  'ai.unreachable': { text: "Apunta can't reach the local AI — see" },
  /** `AiBanner.tsx:45`, after the `Setup` link. */
  'ai.bannerTail': { text: '. Everything except drafting a new note still works.' },

  /*
   * `web/src/components/BackupCard.tsx` — the one-line card and the Advanced
   * half. Four of these are the class `check-ui-strings.mjs` cannot see
   * (Fixed decision 5): the stale warning it already had as `backup.stale`,
   * `BackupCard.tsx:158`'s relative time, `:315-318`'s retention line, and
   * `:393`'s tested-on date. `BackupCard.test.tsx` pins the last two.
   */

  /** The card's and the Advanced half's heading, `BackupCard.tsx:142` and `:225`. */
  'backup.title': { text: 'Backup' },

  /** The card's restore control and each archive's, `BackupCard.tsx:173` and `:368`. */
  'backup.restore': { text: 'Restore' },

  /** Beside a staged restore, `BackupCard.tsx:207`. */
  'backup.cancelPending': { text: 'Cancel it' },

  /** No backup has ever run, `BackupCard.tsx:157`. */
  'backup.noneYet': { text: 'No backup yet' },

  /**
   * `BackupCard.tsx:158`, with the relative time the oracle
   * `formatRelativeTime` (`format.ts:119-128`) produced: `just now`, `5
   * minutes ago`, `3 hours ago`, `yesterday`, `4 days ago`.
   *
   * The card computes that from the same ISO string through the same five keys
   * rather than through the helper, because a helper in a read-only module
   * hands `t()` an English phrase (Fixed decision 3's rule, applied to a
   * relative time rather than a date). `{when}` is that phrase, already in the
   * active locale.
   */
  'backup.lastAt': { text: 'Last backup: {when}', kind: { when: 'text' } },
  /** `format.ts:121`. */
  'backup.justNow': { text: 'just now' },
  /** `format.ts:122`. */
  'backup.minutesAgo': {
    text: '{count} minutes ago',
    plural: { one: '{count} minute ago', other: '{count} minutes ago' },
    kind: { count: 'number' },
  },
  /** `format.ts:124`. */
  'backup.hoursAgo': {
    text: '{count} hours ago',
    plural: { one: '{count} hour ago', other: '{count} hours ago' },
    kind: { count: 'number' },
  },
  /** `format.ts:126`. */
  'backup.yesterday': { text: 'yesterday' },
  /**
   * `format.ts:127`. No singular form, because the oracle has none: a one-day
   * gap is `backup.yesterday`, so this key only ever renders a count of two or
   * more and the number stays a `number` parameter.
   */
  'backup.daysAgo': { text: '{count} days ago', kind: { count: 'number' } },

  /** The card's own button while the archive is being written, `BackupCard.tsx:170`. */
  'backup.working': { text: 'Working…' },
  /** The card's own button, `BackupCard.tsx:170`. */
  'backup.now': { text: 'Back up now' },

  /** `BackupCard.tsx:185`, with the server's own failure text as data. */
  'backup.failed': { text: 'The last backup failed: {detail}', kind: { detail: 'text' } },

  /** `BackupCard.tsx:195`, before the Cancel it control. */
  'backup.restoreWaiting': { text: 'A restore is waiting: quit Apunta and open it again to finish.' },

  /** `BackupCard.tsx:203`. */
  'backup.restoreCancelled': { text: 'Restore cancelled. Nothing changed.' },

  /**
   * `BackupCard.tsx:106`, with `{pruned}` appended when the server pruned
   * older archives. `{notes}` and `{bytes}` are `String(...)` exactly as the
   * card wrote them, so a count of 1,000 is not regrouped.
   */
  'backup.done': {
    text: 'Backed up: {notes} notes, {bytes}, checked and intact.',
    kind: { notes: 'text', bytes: 'text' },
  },
  /** `BackupCard.tsx:105`, joined to `backup.done` with one space. */
  'backup.pruned': { text: '{count} older removed.', kind: { count: 'text' } },

  /** The folder row's label, `BackupCard.tsx:228`. */
  'backup.folder': { text: 'Folder' },
  /** `BackupCard.tsx:235`. */
  'backup.sameDisk': { text: 'These backups are on the same disk as your notes; a USB drive is safer.' },
  /** The folder field's label, `BackupCard.tsx:241`. */
  'backup.changeFolder': { text: 'Change folder' },
  /**
   * `BackupCard.tsx:246`. A path, so it is a keep-as-is token inside a
   * translatable value (Fixed decision 2): written out verbatim in both
   * catalogues, never allowlisted — the allowlist matches whole strings, and
   * this is a `placeholder` attribute rather than one.
   */
  'backup.folderPlaceholder': { text: '/Volumes/Backup/Apunta' },

  /** The passphrase field's label, `BackupCard.tsx:255`. */
  'backup.passphrase': { text: 'Passphrase' },
  /** `BackupCard.tsx:268`. */
  'backup.passphraseWarning': {
    text: 'Lose this passphrase and the backup cannot be opened by anyone.',
  },

  /** The Advanced half's own button, `BackupCard.tsx:283`. */
  'backup.backUp': { text: 'Back up' },

  /**
   * `BackupCard.tsx:297`, with the manifest's own day (`instantToLocalDay`, a
   * raw `YYYY-MM-DD`) and the safety copy's path. Both are stored values.
   */
  'backup.restoreReady': {
    text: 'Restore of {day} is ready. Quit Apunta and open it again to finish; your current notes are kept at {path}.',
    kind: { day: 'text', path: 'text' },
  },

  /** `BackupCard.tsx:309`. */
  'backup.noted': { text: 'Noted.' },

  /**
   * `BackupCard.tsx:315-319`: one key with four parameters, plus the
   * conditional range as a fifth. `{notes}`, `{patients}` and `{transcripts}`
   * are `String(...)` as the card wrote them — the sentence reads
   * `847 notes for 12 patients` whatever the count, and making that a plural
   * would change the English at 1.
   */
  'backup.stored': {
    text: 'Stored: {notes} notes for {patients} patients{range}, {transcripts} transcripts, {bytes}',
    kind: { notes: 'text', patients: 'text', range: 'text', transcripts: 'text', bytes: 'text' },
  },
  /**
   * `BackupCard.tsx:318`, or empty when there is no oldest note. `{day}` is
   * `instantToLocalDay`'s raw `YYYY-MM-DD`, so it is a stored value under
   * Fixed decision 4 — a `date` parameter would print the day for anyone west
   * of Greenwich, and `BackupCard.test.tsx:170` pins the raw string.
   */
  'backup.storedRange': { text: ', going back to {day}', kind: { day: 'text' } },

  /** `BackupCard.tsx:357`, after the archive's size. */
  'backup.encrypted': { text: ', encrypted' },

  /** The archives list's empty state, `BackupCard.tsx:343`. */
  'backup.noArchives': { text: 'No archives yet. Put a backup file in the folder above to restore it.' },

  /** `BackupCard.tsx:399`, before the I have done this control. */
  'backup.neverTested': { text: 'Restore never tested: open an archive and follow its RESTORE.txt.' },
  /** `BackupCard.tsx:401`. `RESTORE.txt` is a file name, kept as-is. */
  'backup.markTested': { text: 'I have done this' },

  /**
   * `BackupCard.tsx:393` — the other of the two blind spots a test pins.
   *
   * `instantToLocalDay` composes no English at all: it returns a raw
   * `YYYY-MM-DD`, which is what the screen shows today and what
   * `BackupCard.test.tsx:170` asserts. So `{day}` is a stored value and the
   * parameter is `text`, not `dateOnly`; declaring it `dateOnly` would print
   * `Aug 1, 2026` and break that test (Fixed decision 3).
   */
  'backup.tested': { text: 'Restore last tested {day}.', kind: { day: 'text' } },

  /*
   * The notes column, the patient lists, and the workspace around them.
   */

  /** `NotesColumn.tsx:56`, and the add-patient row's heading in `Capture.tsx`. */
  'notes.new': { text: 'New note' },
  /** `NotesColumn.tsx:116`. */
  'notes.loading': { text: 'Loading notes…' },
  /**
   * `NotesColumn.tsx:114`, the briefing button in the notes column. Not
   * `prep.title`: that heading reads "Before this session", and Fixed decision
   * 7 keeps each site's own English.
   */
  'notes.prepareForSession': { text: 'Prepare for session' },
  /** `NotesColumn.tsx:132` — a split sentence the checker cannot see. */
  'notes.emptyFor': { text: 'No notes yet for {name}.', kind: { name: 'text' } },
  /** `NotesColumn.tsx:141` and `Workspace.tsx:558`. */
  'notes.createFirst': { text: 'Create first note' },
  /** `Workspace.tsx:558`. */
  'notes.createNew': { text: 'Create new note' },
  /** The draft chip on a note row, `NotesColumn.tsx:160`. */
  'note.draftChip': { text: 'Draft' },

  /** `PatientsColumn.tsx:89` and `Workspace.tsx:366`. */
  'patients.showColumn': { text: 'Show patients' },
  /** `PatientsColumn.tsx:89`. */
  'patients.hideColumn': { text: 'Hide patients' },
  /** The sidebar's new-patient row, `PatientsColumn.tsx:123`. */

  /*
   * The pinned/older sidebar sections and the row menu, added with the
   * owner's out-of-band UI work (2026-09-26), in claude.ai's words. The row
   * menu's visible words. They were JSX text beside an icon, which
   * `check-ui-strings.mjs` used to exempt - AM-048 removed that exemption, so
   * these keys are now the only reason those words are on the catalogues.
   */
  /*
   * The sidebar resize edge's hover card, second line. The first line reuses
   * `patients.hideColumn`; the shortcut beside it is a literal, not a key — see
   * the note in `PatientMenu.tsx`'s `hint()`. Owner-approved 2026-09-27.
   */
  'patients.dragToResize': { text: 'Drag to resize' },
  /*
   * The accent picker's low-contrast note. It appears when the chosen colour
   * falls under 3:1 against the page surface in either theme, and she can keep
   * the colour anyway. It names the logo because `--brand-mark` resolves to the
   * accent, so a colour that is hard to see on the page takes the wordmark with
   * it. Owner-approved 2026-09-27.
   */
  'settings.language': { text: 'Language / Idioma' },
  /* Bilingual on purpose and identical in both catalogues: the row is the one control a Spanish speaker must be able to find *before* they have switched, so translating it would hide it from the people who need it. */
  'settings.languageEnglish': { text: 'English' },
  'settings.languageSpanish': { text: 'Español' },
  'settings.languageChangeBlocked': { text: 'Language cannot change while a task is running.' },
  'settings.accentLowContrast': {
    text: 'This colour may be hard to see on the page, and the Apunta logo uses it too.',
  },
  'patients.pin': { text: 'Pin' },
  'patients.unpin': { text: 'Unpin' },
  'patients.pinned': { text: 'Pinned' },
  /** The empty "Pinned" group's one row, after claude.ai's for projects. */
  'patients.pinHint': { text: 'Pin patients to keep them here' },
  'patients.recents': { text: 'Recents' },
  /** The control beside "Recents" and the two orders it offers. */
  'patients.sortList': { text: 'Sort patients' },
  'patients.sortRecent': { text: 'Recent activity' },
  'patients.sortName': { text: 'Name' },
  /** The row's accessible name; `patients.renameShort` is its visible word. */
  'patients.renameAction': { text: 'Rename {name}' },
  /** The bare word for a narrow menu row, beside `patients.renameAction`. */
  'patients.renameShort': { text: 'Rename' },
  'patients.restore': { text: 'Restore' },
  'patients.delete': { text: 'Delete' },
  /**
   * `Setup.tsx:122`'s trailing clause. The paragraph is
   * `{t('setup.backingUpLead')} <Link>…</Link> has it.`, and the link cannot
   * live in a slot: `MessageParams` is `Record<string, string | number>` and
   * `t()` returns `string`, so a React node cannot be passed through one.
   */
  'setup.backingUpTail': { text: 'has it.' },
  /** `PatientDirectory.tsx:128`. */
  'patients.new': { text: 'New patient' },
  /** `PatientDirectory.tsx:160` and `PatientsColumn.tsx:284`. */
  'patients.loading': { text: 'Loading patients…' },
  /** `PatientDirectory.tsx:143`. */
  'patients.tabActive': { text: 'Active' },
  /** `PatientDirectory.tsx:155`. */
  'patients.tabArchived': { text: 'Archived' },
  /** `PatientDirectory.tsx:125`, and the name `Workspace.tsx:302` is given. */
  'directory.select': { text: 'Select' },
  /** `PatientsColumn.tsx:198`. */
  'patients.missionControl': { text: 'Mission control' },
  /** `PatientsColumn.tsx:222`. */
  'nav.language': { text: 'Language' },
  /** `PatientsColumn.tsx:234`. */
  'nav.help': { text: 'Get help' },
  /** `PatientsColumn.tsx:306`. */
  'directory.clearSearch': { text: 'Clear search' },
  /**
   * `PatientDirectory.tsx:112`, the same toggle's `aria-label` while the search
   * field is open. Not `directory.clearSearch` ("Clear search"), which is the
   * button beside the field in `PatientsColumn`.
   */
  'directory.hideSearch': { text: 'Hide search' },
  /** `PatientsColumn.tsx:314`. */
  'patients.emptyStart': { text: 'Add your first patient to get started.' },
  /** `PatientsColumn.tsx:317`. */
  'patients.addFirst': { text: 'Add your first patient' },
  /** `PatientsColumn.tsx:322` and `PatientDirectory.tsx:170`. */
  'directory.emptyActive': { text: 'No active patients.' },
  /** `PatientDirectory.tsx:170`. */
  'directory.emptyArchived': { text: 'No archived patients.' },
  /** `PatientsColumn.tsx:304` and `PatientDirectory.tsx:173`, both split sentences. */
  'directory.noMatch': { text: 'No patients match “{query}”.', kind: { query: 'text' } },
  /** `PatientsColumn.tsx:457`. */
  'patients.viewAll': { text: 'View all' },

  /**
   * `Workspace.tsx:302` — the one place this preview says a control is not
   * built. `{what}` is the control's own label, already in the active locale,
   * because the caller passes `t(…)` rather than a string.
   */
  'preview.unavailable': { text: "{what} isn't part of this preview yet.", kind: { what: 'text' } },

  /** `Workspace.tsx:312`. */
  'workspace.serverUnreachable': { text: 'Apunta can’t reach its server' },
  /** `Workspace.tsx:313`. */
  'workspace.serverUnreachableBody': { text: 'Start Apunta again, then try this page again.' },

  /** `Workspace.tsx:490`. */
  'workspace.deleteTitle': { text: 'Delete {name}?', kind: { name: 'text' } },
  /** `Workspace.tsx:491`. */
  'workspace.deleteConfirm': { text: 'Delete {name}', kind: { name: 'text' } },
  /** `Workspace.tsx:495-496`. */
  'workspace.deleteBodyFirst': {
    text: 'This removes {name}, every note for them, the transcripts of those notes, and the refine and brainstorm conversations. It cannot be undone here.',
    kind: { name: 'text' },
  },
  /** `Workspace.tsx:499-500`. */
  'workspace.deleteBodySecond': {
    text: 'It also cannot reach copies that already exist elsewhere: a backup you have written, a Time Machine copy, or the records system you pasted the finished notes into.',
  },
  /** `Workspace.tsx:503`, before the `Archive` emphasis. */
  'workspace.deleteBodyThirdLead': { text: 'If you only want them out of the list,' },
  /** `Workspace.tsx:503`, after the `Archive` emphasis. */
  'workspace.deleteBodyThirdTail': { text: 'does that and deletes nothing.' },

  /** `Workspace.tsx:554`, the other half of `notes.emptyFor`. */
  'workspace.noNoteSelected': { text: 'No note selected for {name}', kind: { name: 'text' } },

  /*
   * `web/src/components/BrainstormView.tsx`. The empty state was seeded by
   * S2.2 as `brainstorm.empty`; the rest of the screen is here.
   */

  /** `BrainstormView.tsx:129`. */
  'brainstorm.title': { text: 'Brainstorm' },
  /** `BrainstormView.tsx:138`. */
  'brainstorm.new': { text: 'New conversation' },
  /** `BrainstormView.tsx:211`. */
  'brainstorm.placeholder': { text: 'Think out loud…' },
  /** `BrainstormView.tsx:212`, the composer's spoken name. */
  'brainstorm.messageLabel': { text: 'Brainstorm message' },
  /** `BrainstormView.tsx:219`. */
  'brainstorm.confirmTitle': { text: 'Start a new conversation?' },
  /** `BrainstormView.tsx:222-223`, a split sentence with `firstName` in it. */
  'brainstorm.confirmBody': {
    text: 'This forgets the conversation above. {name}’s notes stay exactly as they are.',
    kind: { name: 'text' },
  },
  /** `BrainstormView.tsx:226`. */
  'brainstorm.confirmConfirm': { text: 'Forget it' },

  /*
   * The context summary under the header, `BrainstormView.tsx:249-257` — a
   * module function whose five shapes are five keys, each with the count as a
   * `number` parameter so `Intl.PluralRules` picks the form.
   */

  /** `:252`. */
  'brainstorm.contextNone': { text: 'No notes yet' },
  /** `:253`, when every one of the notes is in context. */
  'brainstorm.contextAll': {
    text: 'Thinking with {count} notes',
    plural: { one: 'Thinking with {count} note', other: 'Thinking with {count} notes' },
    kind: { count: 'number' },
  },
  /** `:254`. */
  'brainstorm.contextNoneOf': { text: 'No room for any of {count} notes', kind: { count: 'number' } },
  /** `:256`, one note of the total. */
  'brainstorm.contextMostRecentOne': {
    text: 'Using the most recent of {count} notes',
    kind: { count: 'number' },
  },
  /** `:256`, more than one. */
  'brainstorm.contextMostRecent': {
    text: 'Using the {count} most recent of {total} notes',
    plural: {
      one: 'Using the {count} most recent of {total} notes',
      other: 'Using the {count} most recent of {total} notes',
    },
    kind: { count: 'number', total: 'number' },
  },
  /** `:257`. */
  'brainstorm.contextSome': {
    text: 'Using {count} of {total} notes',
    plural: {
      one: 'Using {count} of {total} notes',
      other: 'Using {count} of {total} notes',
    },
    kind: { count: 'number', total: 'number' },
  },

  /*
   * The treatment plan: `PlanView.tsx`, `PlanDetails.tsx` and
   * `PlanGoalCard.tsx`.
   *
   * Two of the keys are the shape Fixed decision 4 names. `version` and
   * `status` are stored values and go into `plan.versionMeta` verbatim; a
   * status that wanted a display name would be a key with the stored value as
   * its parameter, never a translation of it. And every date here reaches a
   * catalogue as a raw `YYYY-MM-DD` under `dateOnly`, so `t()` prints it in the
   * active locale instead of `formatPlanDate`'s `en-US` reaching the screen
   * unchanged.
   */

  /** `PlanView.tsx:98` and `PrepView.tsx:158`. */
  'plan.loading': { text: 'Loading the plan…' },
  /** `PlanView.tsx:189` and `NotesColumn.tsx:82`. */
  'plan.title': { text: 'Treatment plan' },
  /** The plan column's heading, `PrepView.tsx:157`. */
  'prep.planHeading': { text: 'The plan' },

  /**
   * `PlanView.tsx:192` and `:289`'s two forms. `{version}` and `{status}` are
   * stored values (Fixed decision 4); the two keys exist because the screen
   * already branches on whether the version has taken effect, and putting the
   * date in a `{date}` parameter of a single key would hand `t()` the
   * `en-US` string `formatPlanDate` prints.
   */
  'plan.versionMeta': {
    text: 'Version {version} · {status}',
    kind: { version: 'text', status: 'text' },
  },
  /** `PlanView.tsx:193-195`. */
  'plan.versionMetaEffective': {
    text: 'Version {version} · {status} · effective {day}',
    kind: { version: 'text', status: 'text', day: 'dateOnly' },
  },
  /** The picker that chooses which version to read, `PlanView.tsx:278`. */
  'plan.version': { text: 'Version' },
  /** `PlanView.tsx:286`. */
  'plan.current': { text: 'Current' },
  /** `PlanView.tsx:289`. */
  'plan.versionOption': {
    text: 'Version {version} — {status}',
    kind: { version: 'text', status: 'text' },
  },

  /** `PlanView.tsx:217`. */
  'plan.copy': { text: 'Copy plan' },
  /** `PlanView.tsx:233`. */
  'plan.putInForce': { text: 'Put in force' },
  /** `PlanView.tsx:251`. */
  'plan.startReview': { text: 'Start a review' },

  /** `PlanView.tsx:271`. `{gap}` is one of the three `plan.gap*` keys below. */
  'plan.reviewOverdue': {
    text: 'Plan review was due {day} — {gap}.',
    kind: { day: 'dateOnly', gap: 'text' },
  },
  /** `PlanView.tsx:272`. */
  'plan.reviewUpcoming': {
    text: 'Plan review due {day} ({gap}).',
    kind: { day: 'dateOnly', gap: 'text' },
  },
  /**
   * The day gap the oracle `formatDayGap` (`format.ts:111-116`) produced.
   * The view computes the same three shapes through these keys rather than
   * through the helper, which is a read-only module whose English would
   * otherwise reach a Spanish screen (Fixed decision 3).
   */
  'plan.gapToday': { text: 'today' },
  'plan.gapInDays': {
    text: 'in {days} days',
    plural: { one: 'in {days} day', other: 'in {days} days' },
    kind: { days: 'number' },
  },
  'plan.gapDaysAgo': {
    text: '{days} days ago',
    plural: { one: '{days} day ago', other: '{days} days ago' },
    kind: { days: 'number' },
  },

  /** `PlanView.tsx:298`. */
  'plan.superseded': {
    text: 'This version has been superseded. It is kept exactly as it was, and cannot be edited.',
  },
  /** `PlanView.tsx:304` — a split sentence the checker cannot see. */
  'plan.noneYet': { text: 'No treatment plan for {name} yet.', kind: { name: 'text' } },
  /** `PlanView.tsx:320`. */
  'plan.start': { text: 'Start a plan' },
  /** `PlanView.tsx:331` and `:408`. */
  'plan.draftGoals': { text: 'Draft goals from recent notes' },
  /** `PlanView.tsx:331` and `:408`. */
  'plan.readingNotes': { text: 'Reading your notes…' },
  /** `PlanView.tsx:348`. */
  'plan.goals': { text: 'Goals' },
  /** `PlanView.tsx:351`. */
  'plan.nothingYet': {
    text: 'Nothing in the plan yet. Suggestions below are not part of it until you accept one.',
  },
  /** `PlanView.tsx:390`. */
  'plan.addGoalMyself': { text: 'Add a goal myself' },
  /** `PlanView.tsx:398`. */
  'plan.suggestedHeading': { text: 'Suggested from your notes' },
  /** `PlanView.tsx:412`. */
  'plan.suggestionHelp': {
    text: 'Suggestions are not part of the plan. Accept, edit or discard each one.',
  },
  /** `PlanView.tsx:425`. */
  'plan.noSuggestions': { text: 'No suggestions waiting.' },
  /** `PlanView.tsx:460`, before the folded section's own summary. */
  'plan.details': { text: 'Plan details' },
  /** `PlanView.tsx:519`, when nothing is recorded. */
  'plan.detailsNone': { text: '— diagnosis, modality and frequency not recorded' },
  /** `PlanView.tsx:519`, with the recorded values as stored data. */
  'plan.detailsList': { text: '— {items}', kind: { items: 'text' } },
  /** `PlanView.tsx:477`. */
  'plan.attestation': { text: 'Attestation' },
  /** `PlanView.tsx:480`. */
  'plan.notAttested': {
    text: 'Not yet attested. Putting this version in force records the date, and copies your name and credential from Settings onto it.',
  },
  /** `PlanView.tsx:490`, with the clinician's own licence number as data. */
  'plan.licence': { text: 'Licence {licence}', kind: { licence: 'text' } },
  /** `PlanView.tsx:491`. `NPI` is a keep-as-is identifier. */
  'plan.npi': { text: 'NPI {npi}', kind: { npi: 'text' } },
  /** `PlanView.tsx:499`. */
  'plan.attestedNote': {
    text: 'Attested in Apunta — sign the copy in your records system. Apunta has no login, so a name typed here is not a signature.',
  },

  /*
   * The drafting run's lookback line, `PlanView.tsx:155-171`. The source
   * concatenates three optional sentences onto one base sentence; each is a
   * key of its own and the code joins them with the single spaces the source
   * had, so the English line is unchanged. Two of the base keys are split by
   * `oldest_note_date` being null, for the reason `plan.versionMeta` gives.
   */
  'plan.lookbackNone': {
    text: 'There are no notes for this patient yet, so there was nothing to draft from.',
  },
  'plan.lookbackRead': {
    text: 'Read {count} notes (limit {cap}).',
    plural: {
      one: 'Read {count} note (limit {cap}).',
      other: 'Read {count} notes (limit {cap}).',
    },
    kind: { count: 'number', cap: 'number' },
  },
  'plan.lookbackReadBackTo': {
    text: 'Read {count} notes, back to {day} (limit {cap}).',
    plural: {
      one: 'Read {count} note, back to {day} (limit {cap}).',
      other: 'Read {count} notes, back to {day} (limit {cap}).',
    },
    kind: { count: 'number', day: 'dateOnly', cap: 'number' },
  },
  'plan.lookbackSkipped': { text: '{count} could not be read.', kind: { count: 'text' } },
  'plan.lookbackDroppedOne': {
    text: '{count} draft goal was written and then discarded, because it could not be traced to anything in those notes. Nothing was added to the plan.',
    kind: { count: 'text' },
  },
  'plan.lookbackDroppedMany': {
    text: '{count} draft goals were written and then discarded, because they could not be traced to anything in those notes. Nothing was added to the plan.',
    kind: { count: 'text' },
  },
  'plan.lookbackThin': {
    text: 'Nothing was drafted from them: there is not much recorded in these notes yet.',
  },

  /*
   * The plan-level fields, `PlanDetails.tsx`. The four `PARTICIPATION_LABELS`
   * were a module-level `Record` of English; they are four keys now, chosen by
   * the stored enum value rather than translated from it.
   */
  'plan.diagnoses': { text: 'Diagnoses' },
  'plan.diagnosesNone': {
    text: 'None recorded. Goals are expected to trace to a diagnosis, and it is yours to enter.',
  },
  'plan.diagnosisCode': { text: 'Code' },
  'plan.diagnosisDescription': { text: 'Description' },
  'plan.diagnosisPrimary': { text: 'Primary' },
  'plan.addDiagnosis': { text: 'Add diagnosis' },
  'plan.diagnosisCodeLabel': { text: 'Diagnosis {n} code', kind: { n: 'text' } },
  'plan.diagnosisSystemLabel': { text: 'Diagnosis {n} system', kind: { n: 'text' } },
  'plan.diagnosisDescriptionLabel': { text: 'Diagnosis {n} description', kind: { n: 'text' } },
  'plan.removeDiagnosis': { text: 'Remove diagnosis {n}', kind: { n: 'text' } },
  'plan.presentingProblem': { text: 'Presenting problem' },
  'plan.strengths': { text: 'Strengths' },
  'plan.modality': { text: 'Service modality' },
  'plan.frequency': { text: 'Service frequency' },
  'plan.dischargeCriteria': { text: 'Discharge criteria' },
  'plan.reviewInterval': { text: 'Review interval' },
  'plan.reviewIntervalDays': { text: 'Review interval (days)' },
  /** `PlanDetails.tsx:51`. */
  'plan.everyDays': { text: 'Every {days} days', kind: { days: 'text' } },
  'plan.clientParticipation': { text: 'Client participation' },
  'plan.participationReviewed': { text: 'Reviewed with client' },
  'plan.participationDeclined': { text: 'Client declined to sign' },
  'plan.participationSignedElsewhere': { text: 'Signed copy in my records system' },
  'plan.participationDate': { text: 'Client participation date' },
  'plan.participationNote': { text: 'Client participation note' },
  'plan.participationNotePlaceholder': { text: 'Reason, if it could not be signed' },
  'plan.saveDetails': { text: 'Save plan details' },

  /*
   * One goal, `PlanGoalCard.tsx`. `BLANK` (`:43`) is a separator and stays a
   * separator: it renders as it is in every language, so it is not a key
   * (Fixed decision 2).
   */
  'plan.suggestedBadge': { text: 'Suggested — not in the plan yet' },
  'plan.accept': { text: 'Accept' },
  'plan.met': { text: 'Met' },
  'plan.discontinue': { text: 'Discontinue' },
  'plan.discardSuggestion': { text: 'Discard this suggestion' },
  'plan.deleteGoal': { text: 'Delete this goal' },
  'plan.carriedForward': { text: 'Carried forward from the previous version.' },
  'plan.noObjectives': { text: 'No objectives yet.' },
  /** `PlanGoalCard.tsx:171`. */
  'plan.interventions': { text: 'Interventions: {list}', kind: { list: 'text' } },
  /** `PlanGoalCard.tsx:176`. */
  'plan.draftedFrom': { text: 'Drafted from your notes:' },
  /**
   * `PlanGoalCard.tsx:161-164`, the objective's own meta line. The stored
   * `measure`, `baseline` and `target_value` are data, and the target date
   * reaches `t()` raw. Two keys because the screen already branches on
   * `target_date`; a single key would have to hand `t()` the `en-US` date
   * `formatPlanDate` prints, which is the one thing Fixed decision 3 forbids.
   */
  'plan.objectiveMeta': {
    text: 'Measure: {measure} · Baseline: {baseline} · Target: {target} · By: —',
    kind: { measure: 'text', baseline: 'text', target: 'text' },
  },
  'plan.objectiveMetaDated': {
    text: 'Measure: {measure} · Baseline: {baseline} · Target: {target} · By: {day}',
    kind: { measure: 'text', baseline: 'text', target: 'text', day: 'dateOnly' },
  },
  /** `PlanGoalCard.tsx:189`, the section a quotation came from. */
  'plan.evidenceSection': { text: ' · {section}', kind: { section: 'text' } },
  /** `PlanGoalCard.tsx:224`. */
  'plan.goalLabel': { text: 'Goal' },
  /** `PlanGoalCard.tsx:238`. */
  'plan.objectiveLabel': { text: 'Objective {n}', kind: { n: 'text' } },
  'plan.measure': { text: 'Measure' },
  'plan.baseline': { text: 'Baseline' },
  'plan.target': { text: 'Target' },
  'plan.addObjective': { text: 'Add objective' },
  /** `PlanGoalCard.tsx:310`. */
  'plan.interventionsLabel': { text: 'Interventions, one per line' },
  /** `PlanGoalCard.tsx:323`. */
  'plan.goalTargetDate': { text: 'Goal target date' },
  /** `PlanGoalCard.tsx:357`. */
  'plan.saveAndAccept': { text: 'Save and accept' },
  /** `PlanGoalCard.tsx:238`'s own field names, `aria-label` and `placeholder`. */
  'plan.objectiveMeasureLabel': { text: 'Objective {n} measure', kind: { n: 'text' } },
  'plan.objectiveBaselineLabel': { text: 'Objective {n} baseline', kind: { n: 'text' } },
  'plan.objectiveTargetLabel': { text: 'Objective {n} target', kind: { n: 'text' } },
  'plan.objectiveTargetDateLabel': { text: 'Objective {n} target date', kind: { n: 'text' } },

  /*
   * The session briefing, `PrepView.tsx`. `Review due` is one of the two blind
   * spots `PrepView.test.tsx` pins: `formatPlanDate` returned English and the
   * day now reaches `t()` as a `YYYY-MM-DD` under `dateOnly`, so `t()` prints
   * it in the active locale.
   */

  /** `PrepView.tsx:111`. */
  'prep.title': { text: 'Before this session' },
  /** `PrepView.tsx:123`. */
  'prep.again': { text: 'Prepare again' },
  /** `PrepView.tsx:160`. */
  'prep.noGoals': { text: 'No goals in the plan yet.' },
  /** `PrepView.tsx:168`, appended to an objective's own statement. */
  'prep.objectiveBy': { text: ' — by {day}', kind: { day: 'dateOnly' } },
  /** `PrepView.tsx:174` — the pinned date sentence. */
  'prep.reviewDue': { text: 'Review due {day}.', kind: { day: 'dateOnly' } },
  /** `PrepView.tsx:179`. */
  'prep.sinceHeading': { text: 'Since you last saw them' },
  /** `PrepView.tsx:188`. */
  'prep.empty': { text: 'Nothing to read yet — there are no notes for this patient.' },
  /** `PrepView.tsx:226`. */
  'prep.notSaved': { text: 'This briefing is not saved unless you keep it.' },
  /** `PrepView.tsx:228`. */
  'prep.keptFor': { text: '{count} kept for {name}.', kind: { count: 'text', name: 'text' } },

  /** `PrepView.tsx:211`. */
  'prep.lookbackNone': { text: 'Read no notes.' },
  'prep.lookbackRead': {
    text: 'Read the last {count} notes (limit {cap}).',
    plural: {
      one: 'Read the last {count} note (limit {cap}).',
      other: 'Read the last {count} notes (limit {cap}).',
    },
    kind: { count: 'number', cap: 'number' },
  },
  'prep.lookbackReadBackTo': {
    text: 'Read the last {count} notes, back to {day} (limit {cap}).',
    plural: {
      one: 'Read the last {count} note, back to {day} (limit {cap}).',
      other: 'Read the last {count} notes, back to {day} (limit {cap}).',
    },
    kind: { count: 'number', day: 'dateOnly', cap: 'number' },
  },
  /** `PrepView.tsx:220`, joined to the line above with one space. */
  'prep.lookbackSkipped': { text: '{count} could not be read.', kind: { count: 'text' } },

  /*
   * The spelling marks, `SpellingMenu.tsx`, and the two inline rename fields
   * whose `aria-label` is a template literal the checker cannot see.
   */

  /** `SpellingMenu.tsx:68`. */
  'spelling.none': { text: 'No suggestions' },
  /** `SpellingMenu.tsx:86`. */
  'spelling.ignore': { text: 'Ignore' },
  /** `SpellingMenu.tsx:89`. */
  'spelling.add': { text: 'Add to dictionary' },
  /** `SpellingMenu.tsx:63`. */
  'spelling.menuLabel': { text: 'Spelling of {word}', kind: { word: 'text' } },
  /** `PatientRenameForm.tsx:36`. */
  'patients.renameLabel': { text: 'Name for {name}', kind: { name: 'text' } },

  /** `AddPatient.tsx:52`. */
  'common.name': { text: 'Name' },
  /** `AddPatient.tsx:41` and `:93`. */
  'patients.add': { text: 'Add patient' },
  /** `AddPatient.tsx:93`. */
  'common.adding': { text: 'Adding…' },
  /** `AddPatient.tsx:42`. */
  'patients.addLede': { text: 'Just enough to organize her notes.' },
  /**
   * `AddPatient.tsx:58`. The prototype's sample patient (HS-8), which
   * S1.4 §3.5 leaves in place until `e2e/fixtures/eval-es/NAMES.md` exists:
   * the Spanish value keeps the English sample and translates only `e.g.`.
   */
  'patients.namePlaceholder': { text: 'e.g. John Smith' },
  /** `AddPatient.tsx:68`. */
  'patients.identifierLabel': { text: 'Identifier (optional)' },
  /** `AddPatient.tsx:73`. */
  'patients.identifierPlaceholder': { text: 'Internal reference, chart number, etc.' },

  /*
   * `web/src/components/InstructionsPanel.tsx` — the drafting instructions for
   * one format, and the "Import from skill file" affordance.
   */

  /** `InstructionsPanel.tsx:52` and `:61`. */
  'format.instructions': { text: 'Instructions' },
  /** `InstructionsPanel.tsx:53-55`, before the `<code>` file name. */
  'format.instructionsHelp': {
    text: 'What the local model is told about writing this format. Paste flattened skill instructions here; leave blank to use the built-in default. The recipe for flattening a Claude skill is in',
  },
  /** `InstructionsPanel.tsx:56`, after it. `docs/skill-porting.md` is a path. */
  'format.instructionsHelpTail': { text: 'in the Apunta folder.' },
  /** `InstructionsPanel.tsx:66`. */
  'format.instructionsPlaceholder': { text: 'Leave blank to use the built-in default.' },
  /** `InstructionsPanel.tsx:75`. */
  'format.tokensLarge': {
    text: '≈{tokens} tokens — small models start to drift past about {budget}.',
    kind: { tokens: 'number', budget: 'number' },
  },
  /** `InstructionsPanel.tsx:76`. */
  'format.tokensOk': { text: '≈{tokens} tokens — comfortable.', kind: { tokens: 'number' } },
  /** `InstructionsPanel.tsx:81`. */
  'format.readingSkill': { text: 'Reading the skill…' },
  /** `InstructionsPanel.tsx:81`. */
  'format.importFromSkill': { text: 'Import from skill file' },
  /**
   * `InstructionsPanel.tsx:94-96`, the sentence that sits either side of two
   * `<code>` file names. Three keys because the sentence is split by the
   * elements themselves, and §3.6's fragments are what a language has to
   * choose: `A` opens it, `, or a` joins the two file names, and the tail
   * carries the promise.
   */
  'format.skillFileLead': { text: 'A' },
  'format.skillFileAnd': { text: ', or a' },
  'format.skillFileTail': { text: 'of the skill folder. Nothing is saved until you press save.' },

  /** The import report's own list, `InstructionsPanel.tsx:103-118`. */
  'format.reportFrontmatter': { text: 'frontmatter removed' },
  'format.reportCommandBlocks': {
    text: '{count} command block dropped',
    plural: { one: '{count} command block dropped', other: '{count} command blocks dropped' },
    kind: { count: 'number' },
  },
  'format.reportToolLines': {
    text: '{count} tool line dropped',
    plural: { one: '{count} tool line dropped', other: '{count} tool lines dropped' },
    kind: { count: 'number' },
  },
  'format.reportClaudeLines': {
    text: '{count} Claude-specific line dropped',
    plural: {
      one: '{count} Claude-specific line dropped',
      other: '{count} Claude-specific lines dropped',
    },
    kind: { count: 'number' },
  },
  'format.reportEmptiedHeadings': {
    text: '{count} emptied heading dropped',
    plural: { one: '{count} emptied heading dropped', other: '{count} emptied headings dropped' },
    kind: { count: 'number' },
  },
  'format.reportNothing': { text: 'nothing needed removing' },
  /** `InstructionsPanel.tsx:120`. */
  'format.reportReadFirst': {
    text: 'Read it through before you save — these rules over-delete on some skills.',
  },
  /** `InstructionsPanel.tsx:124-125`; `{files}` is the flattener's own list. */
  'format.referencedFiles': {
    text: 'This skill refers to {files}, which Apunta cannot read. If those files hold section definitions or terminology, paste that text in yourself.',
    kind: { files: 'text' },
  },
  /** `InstructionsPanel.tsx:130-131`. */
  'format.instructionsWarning': {
    text: "This text is saved and is sent to the AI with every note you write. Check it doesn't contain real client details before you save.",
  },

  /*
   * Onboarding: `OnboardingFormat.tsx` chooses how a format is defined, and
   * `OnboardingPreview.tsx` confirms it. The three errors the first sets are
   * module-level `setError(…)` calls the literal checker cannot see, and they
   * are keys like any other (Fixed decision 1).
   */

  /** `OnboardingFormat.tsx:111`. */
  'format.addTitle': { text: 'Add your note format' },
  /** `OnboardingFormat.tsx:112`. */
  'format.addLede': { text: "Choose how to define it — we'll figure out the structure for you." },
  /** `OnboardingFormat.tsx:114`, the four options' spoken name. */
  'format.choicesLabel': { text: 'Note format choices' },
  /** `OnboardingFormat.tsx:121`. */
  'format.standardTitle': { text: 'My standard progress note' },
  /** `OnboardingFormat.tsx:122`. */
  'format.recommended': { text: 'Recommended' },
  /** `OnboardingFormat.tsx:123`, with the standard format's own section names. */
  'format.standardSubtitle': {
    text: '{sections}, with my drafting instructions',
    kind: { sections: 'text' },
  },
  /** `OnboardingFormat.tsx:132`. */
  'format.templateTitle': { text: 'Upload a blank template' },
  /** `OnboardingFormat.tsx:133`. */
  'format.templateSubtitle': { text: 'A Word doc or PDF with empty sections' },
  /** `OnboardingFormat.tsx:141`. */
  'format.examplesTitle': { text: 'Upload a few example notes' },
  /** `OnboardingFormat.tsx:142`. */
  'format.examplesSubtitle': { text: '2-3 completed notes to learn the pattern from' },
  /** `OnboardingFormat.tsx:150` and `:220`. */
  'format.manualTitle': { text: 'Describe it myself' },
  /** `OnboardingFormat.tsx:151`. */
  'format.manualSubtitle': { text: 'Type out the sections you need' },
  /** `OnboardingFormat.tsx:159`. */
  'format.dropTemplate': { text: 'Drop a .docx or .pdf template here' },
  /** `OnboardingFormat.tsx:168`. */
  'format.dropExamples': { text: 'Drop 2-3 completed notes here' },
  /** `OnboardingFormat.tsx:359`. */
  'format.dropClick': { text: 'or click to choose a file' },
  /** `OnboardingFormat.tsx:385`. */
  'format.dropMore': {
    text: 'Add one or two more — Apunta works out the sections from what the notes have in common.',
  },
  /** `OnboardingFormat.tsx:181` and `OnboardingPreview.tsx:137`. */
  'format.nameLabel': { text: 'Format name' },
  /** `OnboardingFormat.tsx:186`. */
  'format.namePlaceholder': { text: 'e.g. Progress note' },
  /** `OnboardingFormat.tsx:196` and `OnboardingPreview.tsx:149`. */
  'format.sectionsLabel': { text: 'Sections' },
  /** `OnboardingFormat.tsx:200`. */
  'format.sectionsPlaceholder': { text: 'e.g. Subjective, Objective, Assessment, Plan' },
  /** `OnboardingFormat.tsx:51` and `OnboardingPreview.tsx:91`. */
  'format.errorName': { text: 'Give the format a name.' },
  /** `OnboardingFormat.tsx:55`. */
  'format.errorSections': { text: 'List at least one section.' },
  /** `OnboardingFormat.tsx:59`, with the repeated section name as data. */
  'format.errorDuplicate': {
    text: '"{section}" is listed twice — section names have to be unique.',
    kind: { section: 'text' },
  },
  /** `OnboardingPreview.tsx:49` and `:69`. */
  'format.errorAlreadySection': { text: '"{section}" is already a section.', kind: { section: 'text' } },
  /** `OnboardingPreview.tsx:95`. */
  'format.errorNoSections': { text: 'A format needs at least one section.' },
  /** `OnboardingFormat.tsx:236` and `OnboardingPreview.tsx:294`. */
  'common.saving': { text: 'Saving…' },
  /** `OnboardingFormat.tsx:236`. */
  'format.readingFile': { text: 'Reading your file…' },
  /** `OnboardingFormat.tsx:236`. */
  'common.continue': { text: 'Continue' },
  /** `OnboardingFormat.tsx:241`. */
  'format.readingNote': {
    text: 'Reading the file and working out its sections. Nothing is saved until you say it looks right.',
  },
  /** `OnboardingFormat.tsx:254`. */
  'format.restoreLead': {
    text: 'Already have an Apunta backup, or a settings file someone prepared for you?',
  },
  /** `OnboardingFormat.tsx:256`. */
  'format.restoreLink': { text: 'Restore it instead' },

  /** `OnboardingPreview.tsx:121`, when a format is being edited. */
  'format.editTitle': { text: 'Edit note format' },
  /** `OnboardingPreview.tsx:121`, when one has just been detected. */
  'format.foundTitle': { text: "Here's what we found" },
  /** `OnboardingPreview.tsx:124`. */
  'format.editLede': { text: 'Rename it or change its sections, then save.' },
  /** `OnboardingPreview.tsx:125`. */
  'format.foundLede': { text: "Check this matches your work's format before saving." },
  /** `OnboardingPreview.tsx:130`. */
  'format.truncatedNote': {
    text: 'That file was long, so Apunta read the first part of it. Check nothing is missing below.',
  },
  /** `OnboardingPreview.tsx:149`, when the sections were detected. */
  'format.sectionsDetected': { text: 'Sections detected' },
  /** `OnboardingPreview.tsx:157`. */
  'format.renameLabel': { text: 'New name for {section}', kind: { section: 'text' } },
  /** `OnboardingPreview.tsx:176`. */
  'format.renameAction': { text: 'Rename {section}', kind: { section: 'text' } },
  /** `OnboardingPreview.tsx:189`. */
  'format.moveUp': { text: 'Move {section} up', kind: { section: 'text' } },
  /** `OnboardingPreview.tsx:197`. */
  'format.moveDown': { text: 'Move {section} down', kind: { section: 'text' } },
  /** `OnboardingPreview.tsx:212`. */
  'format.removeSection': { text: 'Remove {section}', kind: { section: 'text' } },
  /** `OnboardingPreview.tsx:229-230`, placeholder and spoken name. */
  'format.sectionNamePlaceholder': { text: 'Section name' },
  /** `OnboardingPreview.tsx:255`. */
  'format.addSection': { text: '+ Add section' },
  /** `OnboardingPreview.tsx:261-262`. */
  'format.existingNotesNote': {
    text: 'Notes you have already written keep the sections they were written with. Changes here apply to future drafts only.',
  },
  /** `OnboardingPreview.tsx:282`. */
  'format.startOver': { text: 'Start over' },
  /** `OnboardingPreview.tsx:294`. */
  'format.saveChanges': { text: 'Save changes' },
  /** `OnboardingPreview.tsx:294`. */
  'format.looksRight': { text: 'Looks right, save' },

  /*
   * `web/src/routes/Settings.tsx`, in its two hosts: the standalone screen and
   * the modal over the workspace.
   *
   * The five section names were a module-level `SECTIONS` array whose `label`
   * property the checker does not read (`VISIBLE_PROPERTIES` at `:77` is the
   * four visible attributes and `label` is not one of them), so they are keys
   * now like any other. `FONT_SIZE_LABELS` and `THEME_LABELS` were two more
   * module records of English in the same file.
   */

  /** `Settings.tsx:68` and `:439`. */
  'settings.appearance': { text: 'Appearance' },
  /** `Settings.tsx:69`. */
  'settings.format': { text: 'Format' },
  /** `Settings.tsx:70`, and the card's own heading in `BackupCard.tsx`. */
  'settings.backup': { text: 'Backup' },
  /** `Settings.tsx:71`. */
  'settings.import': { text: 'Import' },
  /** `Settings.tsx:72` and `:275`. */
  'settings.advanced': { text: 'Advanced' },
  /** `Settings.tsx:147`, the modal nav's spoken name. */
  'settings.sectionsLabel': { text: 'Settings sections' },
  /** `Settings.tsx:167`. */
  'settings.closeLabel': { text: 'Close settings' },
  /** `Settings.tsx:197`. */
  'settings.formats': { text: 'Note formats' },
  /** `Settings.tsx:241`. */
  'settings.addFormat': { text: 'Add another format' },
  /** `Settings.tsx:257`. */
  'settings.importClaude': { text: 'Import from Claude' },
  /** `Settings.tsx:261`. */
  'settings.importHalaxy': { text: 'Import from Halaxy' },
  /** `Settings.tsx:280`. */
  'settings.app': { text: 'App' },
  /** `Settings.tsx:283`. */
  'settings.about': { text: 'About' },
  /** `Settings.tsx:297`. */
  'settings.loadingAi': { text: 'Loading AI settings…' },
  /** `Settings.tsx:344` and `:345`. */
  'settings.draftingModel': { text: 'Drafting model' },
  /** `Settings.tsx:374`. */
  'settings.quick': { text: 'Quick' },
  /** `Settings.tsx:374`. */
  'settings.thorough': { text: 'Thorough' },
  /** `Settings.tsx:376`. */
  'settings.quickHelp': { text: 'Faster drafts.' },
  /** `Settings.tsx:376`. */
  'settings.thoroughHelp': { text: 'Slower, more careful drafts.' },
  /** `Settings.tsx:381`. */
  'settings.savedDot': { text: 'Saved.' },
  /** `Settings.tsx:406`. */
  'settings.loading': { text: 'Loading settings…' },
  /** `Settings.tsx:449`. */
  'settings.colour': { text: 'Colour' },
  /** `Settings.tsx:472`. */
  'settings.reset': { text: 'Reset' },
  /** `Settings.tsx:479`. */
  'settings.theme': { text: 'Theme' },
  /** `Settings.tsx:492`. */
  'settings.fontSize': { text: 'Font size' },
  /** `Settings.tsx:533`. */
  'settings.animations': { text: 'Animations' },
  /** `Settings.tsx:560-563`, the four text sizes. */
  'settings.sizeSmall': { text: 'Small' },
  'settings.sizeDefault': { text: 'Default' },
  'settings.sizeLarge': { text: 'Large' },
  'settings.sizeExtraLarge': { text: 'Extra large' },
  /** `Settings.tsx:567-570`, the three themes; also each segment's name. */
  'settings.themeSystem': { text: 'System' },
  'settings.themeLight': { text: 'Light' },
  'settings.themeDark': { text: 'Dark' },

  /*
   * `web/src/routes/About.tsx` — the local-only guarantee in plain language.
   *
   * This file is where the split-sentence shape is most visible, and every
   * seam is deliberate: the sentence is broken by a `<strong>`, a `<Link>` or a
   * `<code>`, and each of those is something the screen needs, so the halves
   * are keys and the element stays. English is unchanged, which is what
   * `setup.spec.ts`'s two About assertions and `check-ui-strings.mjs`'s
   * `TOTAL 0` both rest on.
   */

  /** `About.tsx:22`. */
  'about.title': { text: 'About Apunta' },
  /** `About.tsx:25`. */
  'about.localOnlyHeading': { text: 'Nothing you write here goes onto the internet' },
  /** `About.tsx:27-28`. */
  'about.localOnlyBody': {
    text: 'Apunta runs on this computer. It is a web page served by a program on the same computer, and the app makes no outbound network connections. There is no account and no remote copy.',
  },
  /** `About.tsx:31-33`. */
  'about.modelsLocalBody': {
    text: "The writing model and transcription model run locally too. Your recording is read by a program on this computer and is never uploaded. Apunta does not use the browser's built-in speech recognition, because that can send audio to a third party.",
  },
  /** `About.tsx:36`. */
  'about.noTelemetryBody': {
    text: 'There is no analytics, crash reporting, update check, or anonymous usage data.',
  },

  /** `About.tsx:41`. */
  'about.whereHeading': { text: 'Where your notes actually are' },
  /** `About.tsx:43`, before the path is known. */
  'about.dbPath': { text: 'One folder on this computer, holding one file:' },
  /** `About.tsx:43-44`, the same line while the path is still loading. */
  'about.dbPathLoading': { text: 'One folder on this computer, holding one file: loading…' },
  /** `About.tsx:52-54`. */
  'about.recordsBody': {
    text: 'That file is your drafting history. It is not your clinical record — the record lives in whatever system you paste the finished note into. It is still worth backing up, because the rough notes, the transcripts and the refine and brainstorm conversations exist nowhere else.',
  },
  /** `About.tsx:55`, after the `Settings` link. */
  'about.recordsBackupTail': { text: 'has “Backup”.' },

  /** `About.tsx:60`. */
  'about.threatsHeading': { text: 'The two things this does not protect you from' },
  /** `About.tsx:62`, inside the `<strong>`. */
  'about.threatPerson': { text: 'Someone at your unlocked computer.' },
  /** `About.tsx:62-64`, after it. */
  'about.threatPersonBody': {
    text: 'Apunta has no password of its own. Anyone sitting at this computer while you are logged in can open it and read everything. Locking the screen when you walk away is the real answer.',
  },
  /** `About.tsx:67`, inside the `<strong>`. */
  'about.threatStolen': { text: 'A stolen computer with an unencrypted disk.' },
  /** `About.tsx:67-68`, after it. */
  'about.threatStolenBody': {
    text: 'Disk encryption protects a lost computer from disclosure. Its status is shown below only when the operating system can report it.',
  },

  /**
   * `About.tsx:110-132`, the four states the operating system can report. The
   * prefix and the bold verdict are one key each, and each state has its own
   * tail; `{detail}` is the server's own explanation, passed as data.
   */
  'about.diskEncryption': { text: 'Disk encryption:' },
  'about.diskNotChecked': { text: 'not checked' },
  'about.diskReady': { text: 'ready' },
  'about.diskNotReady': { text: 'not ready' },
  'about.diskTailOs': { text: 'on this operating system. {detail}', kind: { detail: 'text' } },
  'about.diskTailDetail': { text: '. {detail}', kind: { detail: 'text' } },
  'about.diskTailOff': {
    text: '. Turn it on in System Settings → Privacy & Security → FileVault before real notes go in, and keep the recovery key somewhere other than this computer.',
  },
  'about.diskTailUnknown': {
    text: ". Apunta could not read its status; check it yourself in the operating system's security settings. {detail}",
    kind: { detail: 'text' },
  },

  /** `About.tsx:74`. */
  'about.aiHeading': { text: 'What it does with the AI' },
  /** `About.tsx:76-79`. */
  'about.aiBody': {
    text: 'When you create a draft, the model receives what you dictated or typed and the shape of your note format. Refine and brainstorm can also include relevant prior notes when they are used as background. It is asked to write only what is in front of it. It still makes mistakes, so every draft is yours to read before you publish it.',
  },
  /** `About.tsx:82`. */
  'about.aiUnclearBody': {
    text: 'Where the recording was unclear, the draft says so in the text rather than guessing.',
  },

  /** `About.tsx:87` and `Licenses.tsx:80`. */
  'about.builtFromHeading': { text: 'What Apunta is built from' },
  /** `About.tsx:89-91`, before the licences link. */
  'about.builtFromBody': {
    text: 'The AI that writes and the program that reads your recordings were written by other people and are included inside Apunta. Their licences ask that the notice travels with the app:',
  },
  /** `About.tsx:91`, the link's own text. */
  'about.licensesLink': { text: 'the licences are here' },
  /** `About.tsx:94-95`. */
  'about.modelsSeparateBody': {
    text: 'The AI models themselves are not part of Apunta. They are installed on this computer under their own terms, and Apunta does not pass them on.',
  },
  /** `About.tsx:100`, before the `Setup` link. */
  'about.missingPieces': { text: 'Missing pieces and what to run:' },

  /*
   * `web/src/routes/Setup.tsx`. The rows' own `label`, `detail`, `note` and
   * `fix` come from `web/src/lib/setup.ts`, which is read-only for this card,
   * so the four `STATE_LABEL` values are this screen's own and the rest is
   * reported rather than moved.
   */

  /** `Setup.tsx:51`. */
  'setup.title': { text: 'Setup' },
  /** `Setup.tsx:53-54`. */
  'setup.lede': {
    text: 'Apunta runs on this computer. These are the pieces it needs, and what to do about any that are missing.',
  },
  /** `Setup.tsx:57`. */
  'setup.checking': { text: 'Checking…' },
  /** `Setup.tsx:113`. */
  'setup.allAtOnce': { text: 'Or do all of it at once' },
  /** `Setup.tsx:115-116`. */
  'setup.terminalHelp': {
    text: 'From a Terminal window in the Apunta folder. It installs what is missing, downloads the models, and is safe to run again as many times as you like.',
  },
  /** `Setup.tsx:123`, before the `Settings` link. */
  'setup.backingUpLead': {
    text: 'Backing up is a separate question, and the one most worth getting right —',
  },
  /** `STATE_LABEL` of `Setup.tsx:161-167`, the four states. */
  'setup.stateOk': { text: 'Ready' },
  'setup.stateMissing': { text: 'Missing' },
  'setup.stateUnknown': { text: 'Not checked' },

  /*
   * `web/src/routes/Licenses.tsx`. The legal text stays verbatim; only the
   * index, the filter and the empty state are keys. `Overview` is the heading
   * this screen gives the file's preamble, and it is a `title` property, which
   * is one of the four attributes the checker reads.
   */

  /** `Licenses.tsx:32`. */
  'licenses.overview': { text: 'Overview' },
  /** `Licenses.tsx:80`. */
  'licenses.builtFrom': { text: 'What Apunta is built from' },
  /** `Licenses.tsx:84-85`. */
  'licenses.lede': {
    text: 'Apunta includes programs written by other people, and their licences ask that this notice travels with the app. Nothing here needs anything from you — it is here because it should be.',
  },
  /** `Licenses.tsx:98`. */
  'licenses.panelLabel': { text: 'Third-party licences' },
  /** `Licenses.tsx:101`. */
  'licenses.filterLabel': { text: 'Filter licences' },
  /** `Licenses.tsx:111`. */
  'licenses.filterPlaceholder': { text: 'Filter by component or text' },
  /** `Licenses.tsx:114`. */
  'licenses.copyPlain': { text: 'Copy plain text' },
  /** `Licenses.tsx:117`. */
  'licenses.componentsLabel': { text: 'Licence components' },
  /** `Licenses.tsx:126`. */
  'licenses.noMatch': { text: 'No licence text matches “{filter}”.', kind: { filter: 'text' } },

  /*
   * `web/src/routes/Capture.tsx`.
   *
   * Two of these are named in Fixed decision 2 and 3. `capture.recorded`
   * carries `Mac` — a keep-as-is token *inside* a sentence — so it is written
   * out verbatim in both catalogues, never allowlisted and never split off
   * into a key of its own: the allowlist matches whole strings only.
   * `capture.missingPatient` is the sentence JSX left in two pieces around the
   * `patient.state.message` and the `Back to patients` link.
   */

  /** `Capture.tsx:283`, and the heading while the patient is unknown. */
  'capture.newNote': { text: 'New note' },
  /** `Capture.tsx:271`, the heading once the patient is known. */
  'capture.newNoteFor': { text: 'New note for {name}', kind: { name: 'text' } },
  /** `Capture.tsx:286`, after the server's own message. */
  'capture.missingPatient': {
    text: 'This patient may have been deleted, so nothing recorded here could be saved.',
  },
  /** `Capture.tsx:287`, the link out of that error. */
  'capture.backToPatients': { text: 'Back to patients' },
  /** `Capture.tsx:300`. */
  'capture.formatLabel': { text: 'Note format' },
  /** `Capture.tsx:330`, before the `Add one first` link. */
  'capture.noFormats': { text: 'No note formats yet.' },
  /** `Capture.tsx:330`, the link itself. */
  'capture.addOneFirst': { text: 'Add one first' },
  /** `Capture.tsx:330-331`, after it. */
  'capture.noFormatsTail': { text: '— a note needs a structure to follow.' },
  /** `Capture.tsx:336`, inside the `<strong>`. */
  'capture.sourceRecording': { text: 'Start with a recording' },
  /** `Capture.tsx:336-337`, after it. */
  'capture.sourceTail': {
    text: '— or type notes instead. You can use either, or combine both before you create the draft.',
  },
  /** `Capture.tsx:357`. */
  'capture.stopAndDraft': { text: 'Stop and create draft' },
  /** `Capture.tsx:363`. */
  'capture.openingMicrophone': { text: 'Opening microphone…' },
  /** `Capture.tsx:365`. */
  'capture.allowMicrophone': {
    text: 'Allow microphone access to begin your private recording.',
  },
  /** `Capture.tsx:370`. */
  'capture.preparingDraft': { text: 'Preparing your draft…' },
  /** `Capture.tsx:371`, the dots' spoken name while nothing else is said. */
  'capture.preparingDraftShort': { text: 'Preparing your draft' },
  /** `Capture.tsx:230`. */
  'dictation.transcribingBusy': { text: 'Transcribing…' },
  /** `Capture.tsx:386`. */
  'capture.recordingReady': { text: 'Recording ready' },
  /**
   * `Capture.tsx:389`, with `formatTimer`'s own `0:42` as data and `Mac` kept
   * verbatim (Fixed decision 2).
   */
  'capture.recorded': { text: '{timer} recorded. Nothing has left this Mac.', kind: { timer: 'text' } },
  /** `Capture.tsx:400`. */
  'capture.draftFromRecording': { text: 'Create draft from recording' },
  /** `Capture.tsx:408`. */
  'capture.discardRecording': { text: 'Discard recording' },
  /** `Capture.tsx:423`. */
  'capture.recordAudio': { text: 'Record audio' },
  /** `Capture.tsx:425`. */
  'capture.recordAudioHelp': {
    text: 'Start here — narrate your notes; add typed notes before or while recording',
  },
  /** `Capture.tsx:435`. */
  'capture.typeNotes': { text: 'Type notes' },
  /** `Capture.tsx:436`. */
  'capture.typeNotesHelp': { text: 'Type notes before or while recording, or use typing alone' },
  /** `Capture.tsx:442`. */
  'capture.summaryPlaceholder': { text: 'Type your session summary...' },
  /** `Capture.tsx:443`. */
  'capture.summaryLabel': { text: 'Session summary' },
  /**
   * `Capture.tsx:347` — the capture screen's own variant of
   * `dictation.previewNote`, handed to `LiveRecording` as a prop.
   */
  'dictation.previewNoteCapture': {
    text: 'Everything so far, roughly. The note is written from the finished recording.',
  },
  /** `Capture.tsx:476`. */
  'capture.createDraft': { text: 'Create draft' },
  /** `Capture.tsx:483`, the leave dialog's title. */
  'capture.leaveTitle': { text: 'Leave this unfinished note?' },
  /** `Capture.tsx:484`, that dialog's other button. */
  'capture.stay': { text: 'Stay' },
  /** `Capture.tsx:485`, that dialog's confirm button. */
  'capture.discardAndLeave': { text: 'Discard and leave' },
  /** `Capture.tsx:490`. */
  'capture.leaveBodyFirst': {
    text: 'Your typed notes, recording, or draft in progress will be discarded if you leave.',
  },
  /** `Capture.tsx:491`. */
  'capture.leaveBodySecond': {
    text: 'Stay to keep working, or discard this unfinished capture and continue.',
  },

  /*
   * A countable noun on its own, `count.`.
   *
   * The oracle `web/src/lib/plural.ts` was `${count} ${word}${count === 1 ? '' : 's'}`,
   * and it is what these six keys replace: each count is a `number` parameter
   * so `Intl.PluralRules` picks the form, and each sentence that needs one
   * passes the rendered phrase as a `text` parameter. A sentence with two counts
   * of different nouns therefore composes two of these, which is the only shape
   * `Message` can express — its plural map is selected by one name.
   */
  'count.note': {
    text: '{count} note',
    plural: { one: '{count} note', other: '{count} notes' },
    kind: { count: 'number' },
  },
  'count.patient': {
    text: '{count} patient',
    plural: { one: '{count} patient', other: '{count} patients' },
    kind: { count: 'number' },
  },
  'count.conversation': {
    text: '{count} conversation',
    plural: { one: '{count} conversation', other: '{count} conversations' },
    kind: { count: 'number' },
  },
  'count.session': {
    text: '{count} session',
    plural: { one: '{count} session', other: '{count} sessions' },
    kind: { count: 'number' },
  },
  'count.newPatient': {
    text: '{count} new patient',
    plural: { one: '{count} new patient', other: '{count} new patients' },
    kind: { count: 'number' },
  },
  'count.attachedFile': {
    text: '{count} attached file',
    plural: { one: '{count} attached file', other: '{count} attached files' },
    kind: { count: 'number' },
  },

  /*
   * The two imports and the history they share.
   *
   * `REASONS` and `NAME_SOURCES` were two module-level `Record`s of English
   * keyed by a stored enum. They are keys now, chosen by the stored value and
   * never a translation of it (Fixed decision 4): the enum is what the server
   * stored, and the sentence around it is what a language has to translate.
   */

  /** `Import.tsx:34`. */
  'import.skip.beforeCutoff': { text: 'no activity since the cutoff' },
  /** `Import.tsx:35`. */
  'import.skip.singleSession': { text: 'a single sitting, not a patient history' },
  /** `Import.tsx:36`. */
  'import.skip.notClinical': { text: "Claude's replies never looked like a note" },
  /** `Import.tsx:37`. */
  'import.skip.noName': { text: 'no patient name could be told with confidence' },
  /** `Import.tsx:38`. */
  'import.skip.ambiguous': { text: 'more than one name from your list' },
  /** `Import.tsx:39`. */
  'import.skip.excluded': { text: 'you unticked the patient' },
  /** `Import.tsx:43`. */
  'import.nameSource.previous': { text: 'imported before' },
  /** `Import.tsx:44`. */
  'import.nameSource.list': { text: 'from your list' },
  /** `Import.tsx:45`. */
  'import.nameSource.existing': { text: 'already in Apunta' },
  /** `Import.tsx:46`. */
  'import.nameSource.title': { text: 'name guessed from the chat title — check' },

  /** `Import.tsx:131` and `HalaxyImport.tsx:109`. */
  'import.doneTitle': { text: 'Imported' },
  /** `Import.tsx:131` and `HalaxyImport.tsx:109`. */
  'import.undoneTitle': { text: 'Import undone' },
  /** `ImportBatchList.tsx:31`. */
  'import.undoneLine': {
    text: 'Undone: {notes} and {patients} removed.',
    kind: { notes: 'text', patients: 'text' },
  },
  /** `Import.tsx:136`, where the two English verb forms differ. */
  'import.undoneNotesKept': {
    text: '{count} note you had finalized was kept.',
    plural: {
      one: '{count} note you had finalized was kept.',
      other: '{count} notes you had finalized were kept.',
    },
    kind: { count: 'number' },
  },
  /** `Import.tsx:139`. */
  'import.undonePatientsKept': {
    text: '{count} patient with other work attached was kept.',
    plural: {
      one: '{count} patient with other work attached was kept.',
      other: '{count} patients with other work attached were kept.',
    },
    kind: { count: 'number' },
  },
  /** `HalaxyImport.tsx:114`, which reads `were` at one as well. */
  'halaxy.undoneNotesKept': {
    text: '{count} note you had finalized were kept.',
    plural: {
      one: '{count} note you had finalized were kept.',
      other: '{count} notes you had finalized were kept.',
    },
    kind: { count: 'number' },
  },
  /** `Import.tsx:146` and `HalaxyImport.tsx:121`. */
  'import.nothingNew': { text: 'Nothing new to import.' },
  /** `Import.tsx:147-149`. */
  'import.doneLine': {
    text: '{notes} for {patients}{new}. Each is a draft, dated when you talked to Claude, marked as imported.',
    kind: { notes: 'text', patients: 'text', new: 'text' },
  },
  /** `Import.tsx:148`, or empty. */
  'import.doneNewCount': { text: ' ({count} new)', kind: { count: 'number' } },
  /** `HalaxyImport.tsx:122`. */
  'halaxy.doneLine': {
    text: '{notes} for {patients} imported as published history.',
    kind: { notes: 'text', patients: 'text' },
  },
  /** `Import.tsx:162` and `HalaxyImport.tsx:141`. */
  'import.undo': { text: 'Undo this import' },
  /** `Import.tsx:170` and `HalaxyImport.tsx:151`. */
  'import.goToPatients': { text: 'Go to patients' },

  /** `Import.tsx:185` and `HalaxyImport.tsx:165`. */
  'import.readyTitle': { text: 'Ready to import' },
  /** `Import.tsx:186-189`. */
  'import.summaryLine': {
    text: '{toCreate} to create, {notes} across {patients}. {skipped} skipped{ambiguous}.',
    kind: { toCreate: 'text', notes: 'text', patients: 'text', skipped: 'text', ambiguous: 'text' },
  },
  /** `Import.tsx:189`, or empty. */
  'import.summaryAmbiguous': { text: ', {count} of them as ambiguous', kind: { count: 'number' } },
  /** `Import.tsx:191`, joined to the line above with one space. */
  'import.summaryAgain': {
    text: '{count} session already imported earlier will not be imported again.',
    plural: {
      one: '{count} session already imported earlier will not be imported again.',
      other: '{count} sessions already imported earlier will not be imported again.',
    },
    kind: { count: 'number' },
  },
  /** `Import.tsx:194-196`. */
  'import.untickHelp': {
    text: 'Untick anyone who is not a patient. Every note arrives as a draft marked as imported, and this import can be undone in one click afterwards.',
  },
  /** `Import.tsx:198`, where the two English verb forms differ. */
  'import.attachmentsNote': {
    text: '{count} attached file in these sessions is not imported — they stay in Claude.',
    plural: {
      one: '{count} attached file in these sessions is not imported — they stay in Claude.',
      other: '{count} attached files in these sessions are not imported — they stay in Claude.',
    },
    kind: { count: 'number' },
  },
  /** `Import.tsx:203`. `{cutoff}` is the stored `YYYY-MM-DD`, shown as it is. */
  'import.noConversations': {
    text: 'No patient conversations were found since {cutoff}.',
    kind: { cutoff: 'text' },
  },
  /** `Import.tsx:209`, a preview row's spoken name. */
  'import.patientLabel': { text: 'Import {name}', kind: { name: 'text' } },
  /** `Import.tsx:211`, the count and where the name came from. */
  'import.patientExcerpt': {
    text: '{notes} · {source}',
    kind: { notes: 'text', source: 'text' },
  },
  /** `Import.tsx:221` and `HalaxyImport.tsx:300`. */
  'import.whereTo': { text: 'Where should these notes go?' },
  /** `Import.tsx:232` and `HalaxyImport.tsx:310`. */
  'import.addTo': { text: 'Add to {name}', kind: { name: 'text' } },
  /** `Import.tsx:243` and `HalaxyImport.tsx:320`. */
  'import.createNew': { text: 'Create new' },
  /**
   * `Import.tsx:283`, the muted fallback when a match cannot be chosen. Not
   * `patients.new` ("New patient") and not `import.createNew` ("Create new"):
   * the screen read "Create new patient" and stays that way in English.
   */
  'import.createNewPatient': { text: 'Create new patient' },
  /** `Import.tsx:254`. */
  'import.notFound': { text: 'Not found since {cutoff}: {names}.', kind: { cutoff: 'text', names: 'text' } },
  /** `Import.tsx:269` and `HalaxyImport.tsx:210`, with the count already rendered. */
  'import.runLabel': { text: 'Import {notes}', kind: { notes: 'text' } },
  /** `Import.tsx:278`. */
  'import.changeSettings': { text: 'Change the settings' },
  /** `Import.tsx:289-291`. */
  'import.claudeLede': {
    text: 'Bring the notes you drafted with Claude into Apunta: every patient you have seen since the cutoff, with their whole history, one draft per session.',
  },
  /**
   * `Import.tsx:294-296`. `Claude`, `conversations.json` and `Mac` are
   * keep-as-is tokens inside a translatable sentence: verbatim in both
   * catalogues, never allowlisted, never split off (Fixed decision 2).
   */
  'import.exportHelp': {
    text: 'In Claude, open Settings → Privacy → Export data. The export arrives by email as a zip. Choose that file here, or the conversations.json inside it. It is read on this Mac and kept nowhere.',
  },
  /** `Import.tsx:308`. */
  'import.patientsSince': { text: 'Patients seen since' },
  /** `Import.tsx:320-321`. */
  'import.namesHelp': {
    text: 'Your patients’ names, one per line (optional — they help spell and match names; anyone not listed is still found from the chat title)',
  },
  /** `Import.tsx:333`. */
  'import.eachNoteIs': { text: 'Each note is' },
  /** `Import.tsx:343`. */
  'import.sourceAssistant': { text: 'Claude’s last reply in each session (the note you ended up with)' },
  /** `Import.tsx:354`. */
  'import.sourceHuman': { text: 'Your own messages in each session' },
  /** `Import.tsx:367`. */
  'import.readingExport': { text: 'Reading the export…' },
  /** `Import.tsx:367` and `HalaxyImport.tsx:254`. */
  'import.check': { text: 'Check what will be imported' },
  /** `Import.tsx:369` and `HalaxyImport.tsx:256`. */
  'import.nothingWritten': { text: 'Nothing is written until you press Import on the next screen.' },
  /** `Import.tsx:393`, after a guessed name in the report. */
  'import.nameGuessedSuffix': { text: ' · name guessed — check' },
  /** `Import.tsx:410`, with the reasons already rendered. */
  'import.skippedSummary': {
    text: '{conversations} skipped: {reasons}',
    kind: { conversations: 'text', reasons: 'text' },
  },
  /** `Import.tsx:416`. */
  'import.why': { text: 'Why' },
  /** `Import.tsx:417`. */
  'import.started': { text: 'Started' },
  /** `Import.tsx:418`. */
  'import.lastMessage': { text: 'Last message' },
  /** `Import.tsx:419`. */
  'import.messages': { text: 'Messages' },
  /** `Import.tsx:441`, for a skipped conversation with no date at all. */
  'import.undated': { text: 'undated' },

  /** `HalaxyImport.tsx:167`. */
  'halaxy.summaryLine': {
    text: '{notes} across {patients}.',
    kind: { notes: 'text', patients: 'text' },
  },
  /** `HalaxyImport.tsx:170-171`. */
  'halaxy.untickHelp': {
    text: 'Check the names, untick anything you do not want, then import. Notes are saved as published history.',
  },
  /** `HalaxyImport.tsx:219`. */
  'import.chooseDifferent': { text: 'Choose different files' },
  /** `HalaxyImport.tsx:229`. */
  'halaxy.lede': { text: 'Bring your Halaxy notes into Apunta. Choose one PDF per patient.' },
  /** `HalaxyImport.tsx:231`. */
  'halaxy.localOnly': { text: 'Text PDFs are read on this computer and kept nowhere.' },
  /** `HalaxyImport.tsx:254`. */
  'halaxy.readingPdfs': { text: 'Reading the PDFs…' },
  /** `HalaxyImport.tsx:290`. */
  'import.patientName': { text: 'Patient name' },
  /** `HalaxyImport.tsx:331`, for a session with no title. */
  'import.halaxyNoteLabel': { text: 'Import {date} for {name}', kind: { date: 'text', name: 'text' } },
  /** `HalaxyImport.tsx:331`, for one with a title. */
  'import.halaxyNoteLabelTitled': {
    text: 'Import {date} {title} for {name}',
    kind: { date: 'text', title: 'text', name: 'text' },
  },
  /** `HalaxyImport.tsx:333`, a session with no title of its own. */
  'import.sessionTitle': { text: 'Session' },
  /** `HalaxyImport.tsx:348`. */
  'import.filesNotImported': { text: 'Files not imported' },

  /*
   * The history both imports share, `ImportBatchList.tsx`. The `·` and the `—`
   * are punctuation and separators, so they render as they are (Fixed
   * decision 2); `{date}` is the batch's own instant through `note.updatedAt`.
   */
  /** `ImportBatchList.tsx:28`. */
  'import.earlier': { text: 'Earlier imports' },
  /** `ImportBatchList.tsx:38`. */
  'import.batchLine': { text: '{date} — {notes}', kind: { date: 'text', notes: 'text' } },
  /** `ImportBatchList.tsx:39`, or empty. */
  'import.batchPatients': {
    text: ', {count} new patient',
    plural: { one: ', {count} new patient', other: ', {count} new patients' },
    kind: { count: 'number' },
  },
} as const satisfies Record<string, Message>;
