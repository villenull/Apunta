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
} as const satisfies Record<string, Message>;
