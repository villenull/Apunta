# Practice owner — design questionnaire, 2026-08-22

Six multiple-choice questions put to the practice owner (the therapist this is
being built for) before the UI is finalised. Her answers verbatim, then what
each one changes.

Two questions still need an answer — see **Still open** at the bottom. Nothing
below is blocked on them except where noted.

## Answers

| # | Question | Answer |
| --- | --- | --- |
| 1 | How would you rather get a session out of your head and into the app? | Speak it aloud after the session and let the app transcribe — *note: "rough notes written out"* |
| 2 | When do your notes actually get written? | All at once at the end of the day |
| 3 | Once a note is finished, where does it need to go? | **(no answer)** |
| 4 | The draft comes back and a paragraph isn't right. What do you reach for? | Describe the problem in a chat and let it revise |
| 5 | A session where risk never came up. What should that part of the note say? | Leave the section blank for me to fill in |
| 6 | How much should the app write beyond what you actually said? | Write in my established voice, learned from my past notes |

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

### 3 — No answer (blocking for M7 export)

Not answered. This decides what Publish does — whether the critical path is
clipboard fidelity into another system, or filing inside Apunta as the record
of truth. **M7's export work should not be designed until this is answered.**
Everything before M7 is unaffected.

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

### 6 — "My established voice, learned from my past notes" (M3, M6) — needs disambiguation

This is the answer with the most leverage and the most risk, and it bundles two
separable things:

- **Voice** — sentence rhythm, register, how she opens an Assessment, whether
  she writes "client" or "patient". Learnable from her past notes as few-shot
  examples. Low risk, high payoff, and it is what the M6 skill-import path
  already exists to do.
- **Inference** — drawing clinical conclusions she did not voice. High risk:
  this is the setting that produces a confident fabricated formulation.

She picked the voice option and did **not** pick "draw the clinical conclusions
my observations point to", which sat directly above it. The most likely reading
is that she wants it to *sound* like her while still only saying what she said.
That reading is safe to build. The other reading is not, so it should be
confirmed rather than assumed — see **Still open**.

Two constraints that follow either way:

- Her past notes become prompt content at runtime. They are real patient
  material, so they may live only in her local database and the local model's
  context — never in fixtures, tests, logs, error reports, or the repo
  (CLAUDE.md hard rule 2). Any code path that logs a prompt must redact them.
- Style exemplars and faithfulness rules compete. If the examples show her
  drawing conclusions from observations, they teach the model to do the same,
  regardless of what the rules say — `rationale.md` already establishes that
  examples move a small model more than rules do. Style exemplars should
  therefore be presented as *style* references with the faithfulness rule
  restated after them, and the M7 eval must be re-run against her real formats
  once this lands.

## Still open

1. **Question 3 — where does a finished note go?** Blocks M7 export design.
2. **Question 6 — voice or inference?** Specifically: *"When you describe what
   you observed but don't say what you make of it, should the Assessment stay
   quiet, or should it draw the conclusion for you to check?"* Blocks the M3
   prompt-builder's Assessment handling. Building the safe reading (voice only)
   in the meantime costs nothing if the answer turns out to be the other one.

Carried over unanswered from `docs/note-instructions/rationale.md`: whether a
bracketed `[unclear in dictation]` marker is acceptable in her records at all,
and whether cross-session comparison belongs in Objective or Assessment.
