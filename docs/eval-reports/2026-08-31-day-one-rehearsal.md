# The day-one rehearsal

Her first hour, walked on the partner's Linux machine as she would walk it:
an empty data directory, the config pack in hand, the real 4B behind it.
Nothing here needed a Mac. Everything here was found by doing it in order
rather than by reading the code.

## What worked

The whole loop, once the door below was open: patient added, note drafted in
20.4 s, refined through the chat, published, copied to the clipboard, backed
up — no console errors at any step, and the archive verified itself on write
("checked and intact").

## Three dead ends before a single note existed

Her actual day one is *restore the config pack*, and it was impossible.

1. **The first-run screen had no links at all.** It is the whole app until a
   format exists, so a practice restoring onto a new Mac — every note sitting
   in a backup file — was asked to invent a note format instead. This is the
   disaster-recovery path, not just the setup path.
2. **Settings then listed no archives**, because listing was keyed to
   Apunta's own filenames. The pack was named something else; so is any
   download a browser renamed to `… (1).zip`.
3. **Restoring refused by name anyway**, for a real reason — the rule stops
   the endpoint reading arbitrary files — applied to the wrong case.

Fixed in `bc59cbe`: a restore door on the first screen, separate listings for
restoring and pruning (pruning still only deletes what it wrote), and the
strict-name rule kept for absolute paths while a bare name is confined to the
backup folder. `docs/INSTALL.md` now documents the path in the words she will
read, including how to reach a folder macOS hides.

## The larger finding: her format had never been measured

The eval corpus is SOAP. It is the only thing that has ever measured
`docs/note-instructions/owner-progress-instructions.md`. **Her seven-section
format was measured by nothing**, and the first ordinary note drafted through
it came back mis-routed: what the client reported went into Client
presentation, Discussion came back empty.

Six fabricated fixtures in her format (`e2e/fixtures/her-format/`, run by
`npm run check:format`) turned one anecdote into a measurement — 5 flags
across 6 fixtures, including two that matter clinically:

- **A risk review she carried out, flattened to "None."** The source said "he
  denied any thoughts of self harm, said the passive stuff from July has not
  come back"; the note said `Risk review: None.` A review that happened,
  recorded as the word for one that did not, is a note asserting the opposite
  of the session.
- **A phone check-in returned entirely blank** — every section empty, from a
  source with content in it.

The cause was structural, and the M10 report had already named it in another
context: the distillation dropped the counterweights the built-in defaults
carry. Revision 3 restored the worked example. **Per-section relevance was
never restored at all** — and her own style document has it, section by
section, unused since 2026-08-25.

Adding it, in her words: **5 flags → 1**. The risk review is recorded, the
phone check-in has a Discussion, reported speech leaves the observation
section. The survivor is the cadence miss below.

It also moved the SOAP corpus, which is the part worth arguing with: a change
made to fix her format had no obligation to help there, and did — fabrication
**40.0% → 35.0%**, gated runs 27 → 21, including the two fixtures the M10
report had written off as beyond instructions (the all-blank jotting and the
declined-option retraction). Safety facts slipped 75.0% → 70.0%, recorded in
that report rather than smoothed over.

## Still open

- **Cadence on a continuation.** "We agreed to move to every two weeks" is
  carried; "staying weekly" is dropped. A decision *not* to change reads to
  the model as no decision. Third sighting; not yet fixed, because the same
  instruction file is measured against a corpus that bans unstated cadence,
  and pushing harder here risks inventing it there.
- **Retraction.** "actually no, scratch that" still leaves a trace in the
  note. Same class as eval fixture 04, which four instruction revisions have
  not reached.
- **A refine that adds without removing.** Asked to *move* the walking to
  another section, the chat copied it and left the original, then explained
  that Discussion was empty "because no clinical content was provided" —
  which was false. **Fixed and verified** (2026-08-31); the refine path now
  has coverage, below.

## The refine harness, and what it caught immediately

`npm run check:refine` — seven adversarial scenarios through the real
endpoint, one per fault found by hand this week. Its first run failed two,
and both were the anti-fabrication rules eating what they exist to protect:

- **She could not add her own observation.** Asked to record that he was
  alert and oriented — her words, her session — the model refused, citing a
  dictation it was never shown. The user-turn guard written on 2026-08-28
  said a revision may not add anything "beyond what the note above already
  contains", which is that refusal in writing.
- **A question rewrote the note.** Answered well, and changed the note
  anyway.

Both fixed, and the harness reports the lock firing **zero** times, so this
is the model behaving rather than the server catching it. A third attempt
broke two passing scenarios and was reverted: on this model each added rule
perturbs another, and the honest stopping point is the measured best rather
than the longest prompt.

One scenario still fails and is documented rather than smoothed over
(`e2e/fixtures/refine/README.md`): asked to shorten a section, the model
deletes a clinical fact and explains the deletion with a false claim about
the source. That one wants the transcript in the call or a server-side diff,
not another sentence.

## Volume, briefly

A practice of 300 notes across 12 patients, to see whether anything degrades
before her Mac ever does: patient list 4.9 ms, one patient's notes 0.7 ms,
a full backup 33 ms at 185 KB, database 396 KB. Nothing here is a risk at
ten times the size — the only slow part of this app is the model, and that
was already measured. SQLite is doing exactly what it was chosen for.

## The encrypted backup, and the last-resort path

Both exercised for the first time. An encrypted archive was made, the
`decrypt.mjs` in its RESTORE.txt copied out by hand exactly as that file
instructs, and the decrypted database matched its manifest fingerprint with
every readable `notes/<patient>/<date>.txt` present. What was wrong was the
failure: a mistyped passphrase answered with a Node crypto stack trace, at
the one moment this script is ever used. It now says so in English.
