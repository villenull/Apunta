# Practice owner — design questionnaire, 2026-08-22

Six multiple-choice questions put to the practice owner (the therapist this is
being built for) before the UI is finalised. Her answers verbatim, then what
each one changes.

All seven are now answered. Question 7 was a follow-up added after the first
six came back, to resolve an ambiguity in her answer to question 6.

## Answers

| # | Question | Answer |
| --- | --- | --- |
| 1 | How would you rather get a session out of your head and into the app? | Speak it aloud after the session and let the app transcribe — *note: "rough notes written out"* |
| 2 | When do your notes actually get written? | All at once at the end of the day |
| 3 | Once a note is finished, where does it need to go? | Pasted into another records system |
| 4 | The draft comes back and a paragraph isn't right. What do you reach for? | Describe the problem in a chat and let it revise |
| 5 | A session where risk never came up. What should that part of the note say? | Leave the section blank for me to fill in |
| 6 | How much should the app write beyond what you actually said? | Write in my established voice, learned from my past notes |
| 7 | When you describe what you observed but don't say what you make of it, what should the Assessment do? | Stay quiet — if I didn't say what I made of it, the note shouldn't either |

## What each answer changes

### 1 — Dictation *and* rough written notes (M5, M2 capture)

Her note matters more than the choice. She does not pick one input; she speaks
after the session **and** has rough notes written out. The prototype's capture
screen is either/or — record **or** type. That is now wrong.

Capture should take both in one pass: an audio recording *and* a text field for
the rough notes, both fed to the drafting call as separate labelled inputs
(transcript + the therapist's own written notes). The written notes are the
higher-confidence source — they are her words, already deliberate — and the
prompt should say so.

M5 owns the real change; M2 should not build an either/or toggle that M5 has
to tear out.

### 2 — Notes are written in an end-of-day batch (M2, M4)

Six to eight notes in one sitting, hours after the sessions. Consequences:

- **Drafts must be findable across patients**, not only inside one patient's
  note list. The prototype has a per-note draft dot and no global view. A
  cross-patient "unfinished" list is needed.
- **The three-column click path is too slow for a batch.** Doing eight notes
  means eight round trips through patient → new note → capture → back. Capture
  should offer "save and start the next one" so a batch is one continuous flow.
- Memory has decayed by evening, which raises the value of the transcript being
  verbatim and lowers the acceptable rate of invented detail. It also means her
  rough notes (see 1) are load-bearing, not a convenience.

### 3 — The note is pasted into another records system (M2, M4, M7)

**Apunta is a drafting tool, not the record.** The record lives in another
system, and the note gets there by clipboard. That reframes several things:

- **Copy fidelity is the critical path**, not the zip export. The prototype
  already copies to the clipboard on publish, which turns out to be exactly
  right — keep it.
- **Copy plain text, not markdown.** The destination is almost certainly a
  plain textarea; markdown would paste literal asterisks and hashes. Section
  name, newline, body, blank line between sections. No syntax characters.
- **An empty section still needs its header in the copied text**, so she can
  fill it in on the far side. This is where answers 3 and 5 meet: blanks
  travel. Which means the empty-section checklist has to fire **before copy**,
  not only before publish — once it is pasted, she is unlikely to come back
  here to fix it.
- `GET /api/export` (M7 deliverable 4) is demoted from primary path to backup.
  Still worth building; no longer the thing export design revolves around.
- The Settings line calling the database file "your backup" is now misleading.
  The other system holds the record; this database holds drafts.

**Worth asking her, low stakes:** which system. Some strip newlines, some
accept rich text. Plain text with blank lines pastes correctly nearly
everywhere, so this is a refinement rather than a blocker.

**Worth raising, not yet decided:** patient material now lives in two places.
Deleting a note here does not delete it there, and vice versa. An affordance
along the lines of "copied into records — remove the draft from Apunta?" may
belong in M4, but it is speculative until she says whether she wants drafts
kept as a working history or cleared once filed.

### 4 — Revision by chat (M4)

Confirms M4's refine chat as the primary repair path, and demotes
highlight-to-reference to a secondary affordance rather than the headline
interaction. It does **not** remove highlight-refs: the note editor stays a
`<textarea>` so `selectionStart/End` remain available, and highlighting is
still the cheapest way to disambiguate "this paragraph".

Build order inside M4: chat-drives-whole-note first, highlight-scoped
refinement second.

### 5 — Empty section, not a fallback sentence (M3, M4, note-instructions)

Supersedes the drafted behaviour. `docs/note-instructions/` currently emits the
fixed sentence "Not addressed in this dictation." into any section with no
material, and `rationale.md` §3 lists that wording as the third most impactful
element precisely *because* it keeps every schema field non-empty.

Her answer replaces it with a blank. That is a real cascade:

- **Schema:** section bodies must permit the empty string. The "every section
  non-empty" property is gone, so nothing downstream may assume it.
- **Instructions:** the fallback sentence is removed from both format files
  (four places each) and replaced with an instruction to emit an empty string.
  The forbidden-boilerplate list stays exactly as it is — a blank section must
  never become an invented negative finding.
- **UI:** an empty section has to look deliberate rather than broken. It needs
  a visible placeholder in the editor ("Nothing recorded — add or leave blank")
  that is not part of the note text.
- **Publish:** an empty section reaching a published note should be a
  deliberate act. A publish-time prompt listing empty sections — not a block —
  fits her answer, since she chose blank specifically so she could fill it in.
- **Eval (M7):** the rubric's detection of refusal-to-fill keys off the fixed
  sentence. It must key off an empty string instead.

Note she did **not** choose "stop and ask me before publishing", so the
publish-time prompt should be a light checklist, not a gate.

### 6 + 7 — Her voice, never her conclusions (M3, M6)

This is the answer with the most leverage and the most risk, and it bundles two
separable things:

- **Voice** — sentence rhythm, register, how she opens an Assessment, whether
  she writes "client" or "patient". Learnable from her past notes as few-shot
  examples. Low risk, high payoff, and it is what the M6 skill-import path
  already exists to do.
- **Inference** — drawing clinical conclusions she did not voice. High risk:
  this is the setting that produces a confident fabricated formulation.

Question 7 settled it: **"Stay quiet — if I didn't say what I made of it, the
note shouldn't either."** She wants it to *sound* like her while saying only
what she said. Voice yes, inference no.

That also answers `docs/note-instructions/rationale.md` §3, which flagged
"whether the Assessment/Formulation may reason at all" as the clinical judgment
call it was least sure about. It may not. The drafted conservative behaviour
stands unchanged, and the banned-boilerplate list stays exactly as written.

Two constraints that follow either way:

- Her past notes become prompt content at runtime. They are real patient
  material, so they may live only in her local database and the local model's
  context — never in fixtures, tests, logs, error reports, or the repo
  (CLAUDE.md hard rule 2). Any code path that logs a prompt must redact them.
- **Her own notes will teach the model to infer, which answer 7 forbids.**
  This is the sharpest technical problem her answers create, and it is ours to
  solve rather than hers. She is a clinician; her past notes contain her
  conclusions. Feed them in as few-shot examples and the model learns to
  produce conclusions — `rationale.md` already establishes that examples move a
  small model more than rules do. So the naive implementation of answer 6
  directly defeats answer 7.

  A raw past note is unusable as a few-shot example because the dictation it
  came from no longer exists, so the model sees a finished conclusion with no
  visible evidence of where it came from — exactly the pattern "invent a
  plausible conclusion" looks like from the inside.

  Recommended shape, for M3/M6 to decide properly:

  1. **Derive a style profile, don't paste examples.** A one-time pass over her
     notes producing a description — register, sentence length, "client" vs
     "patient", how she opens an Assessment, whether she uses first person.
     The prompt then carries a style *description*, which cannot demonstrate
     inference the way an example does.
  2. **Build real paired examples from her actual use.** Once she is drafting
     from dictations, each accepted note is a genuine (dictation → note) pair
     where the mapping is visible. Those are safe few-shot material and they
     accumulate for free.
  3. If raw excerpts are used at all before (2) has a corpus, restrict them to
     sections where inference is structurally impossible — Subjective and
     Objective — and never Assessment.

  Whatever lands, the M7 eval must re-run against her real formats, with
  fabrication rate compared before and after the style profile is switched
  on. A style change that quietly raises fabrication is the failure mode.

## Still open

Nothing blocking. Three small things worth asking when convenient:

1. **Which records system** the note is pasted into (see answer 3). Refines
   the clipboard format; plain text works regardless.
2. **Whether drafts should be cleared once filed** in the other system, or
   kept here as a working history (see answer 3).
3. Carried over from `docs/note-instructions/rationale.md`: whether a bracketed
   `[unclear in dictation]` marker is acceptable in her records at all, and
   whether cross-session comparison belongs in Objective or Assessment.

`rationale.md` §1 (silence about risk) and §3 (may the Assessment reason) are
both now answered — by questions 5 and 7 respectively.
