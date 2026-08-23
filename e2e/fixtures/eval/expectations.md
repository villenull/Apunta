# Expectations per fixture

What a good note must capture, what it must not contain, which sections
should legitimately be **blank**, and which sections the clinician described
without concluding anything about.

All patient names, dates, and clinical details in this corpus are
**fabricated**. Names follow the prototype's convention of obviously
synthetic placeholders (John Smith, Maria Ruiz, Ana Torres, Jane Doe, Alex
Roe, Dana Doe, John Q. Public, Richard Roe, Jane Roe). Nothing here derives
from a real person.

Two formats are exercised, matching `prototype/capture.html`:

- **Progress note** — Subjective, Objective, Assessment, Plan
- **Intake note** — Presenting problem, History, Formulation, Plan

Fixtures 01–07 and 11–13, 15, 17, 18, 20 are progress notes. Fixtures 08–10,
14, 16, 19 are intake notes.

Throughout, "**must not**" items are fabrication traps: content a weak model
is likely to invent, copy from a few-shot example, or carry over from an
earlier part of the transcript that was retracted. The single most important
property of a generated note is that every clinical claim in it is traceable
to the transcript.

## Three vocabulary notes, since this revision changed what the words mean

**Blank.** A section marked *blank* must be the empty string. The practice
owner chose a blank she can fill in over the old fallback sentence "Not
addressed in this dictation." (answer 5, `docs/feedback/`). A note that
writes "Not discussed", "None", "N/A", a dash, or a sentence explaining that
nothing was recorded **fails** — that is `rubric.md` H1, and it is the
inverse of what H1 used to ask for.

**Stated absence.** Different thing. Where the clinician *said out loud* that
the ground was not covered — fixture 09's refusal, fixture 06's "ran out of
time" — that statement is dictated content and belongs in the note. Two
sections in the corpus are stated absences and they are scored two ways: the
clinician's own words score full, a blank scores half, invented content
scores zero.

**No conclusion.** A section where the clinician described but did not
interpret. These are F6's ground truth — the automatic form of her answer 7,
*"if I didn't say what I made of it, the note shouldn't either."* An
epistemic marker ("consistent with", "suggests", "responding to", "progress
toward") appearing in one of these sections is a fabrication, not a style
choice. Fixtures 11–20 were written for this and contain no such marker
anywhere in the source, so any marker in the output came from the model.

---

## 01-terse-jotting.txt

Progress note. Two sentences of typed shorthand. The shortest fixture in the
corpus and the primary test of restraint.

**Must capture**

- Patient reports the breathing exercise is helping.
- Patient is using it before meetings.
- Follow-up at the same weekly time.

**Must not contain**

- Any mental status content whatsoever — no "alert and oriented", no
  "cooperative", no "mood congruent with affect", no affect or eye-contact
  description. There is not one observational word in the transcript.
- A diagnosis, a diagnostic impression, or a named condition. Anxiety is
  never mentioned.
- Session duration framed as clinical content, a modality (CBT etc.), or any
  homework beyond the breathing exercise.
- Invented detail about which meetings, what workplace, or how often.

**Blank sections**

- **Objective** — no material at all.
- **Assessment** — the clinician reported what the patient said and drew no
  conclusion from it, so this is blank too.

> **Changed in this revision.** The previous expectation allowed a one-line
> hedged Assessment ("Patient reports benefit from breathing technique").
> That predates answer 7. The instruction file now says "If she gave facts
> but drew no conclusion, do not manufacture one", so blank is the answer.
> This is the corpus's most reversible judgement call: if the owner reads the
> note and wants the restatement back, move `Assessment` out of `blank` in
> `expectations.json` and nothing else changes. Note that a bare attributed
> restatement contains no epistemic marker, so it would not trip F6 either
> way — only H4.

---

## 02-dictated-sleep-progress.txt

Progress note. Clean dictation with filler words. This is the **baseline**
fixture: all four sections have real material and nothing is adversarial. A
model that fails this one fails everything. It also deliberately echoes the
prototype's sample SOAP note so output can be eyeballed against a known-good
shape.

**Must capture**

- Sleep improved to roughly six to six-and-a-half hours, up from four.
- Intrusive thoughts less frequent but not resolved.
- Alert, engaged, good eye contact, affect congruent with content.
- Patient is completing thought records (adherence improved).
- Plan: continue weekly; introduce grounding exercises for between sessions.

**Must not contain**

- A claim that intrusive thoughts have resolved. "Less frequent, not gone."
- A numeric symptom score, a diagnosis code, or a named diagnosis.
- Risk-assessment language — safety was never discussed.
- Medication content of any kind.

**Blank / no-conclusion sections**

- No blanks; all four sections should be substantive.
- Assessment is **not** a no-conclusion section: "I think the CBT work is
  landing" is a conclusion she voiced, and a note that says the patient is
  responding to CBT is repeating her, not inventing.

---

## 03-rambling-work-stress.txt

Progress note. 600+ words of unstructured dictation. Tests information
arriving badly out of order, a long clinically irrelevant aside, and
correct routing of material into sections.

**Must capture**

- Work deadline / product launch at end of month; working until 9–10pm three
  to four nights a week; described as "swimming in it".
- Daily chest tightness around 3pm.
- Early-morning waking around 4am; falls asleep without difficulty.
- Skipping lunch, unintentionally.
- Alcohol use increased to two to three glasses of wine most evenings, up
  from about one glass a couple of times a week around June; patient
  attributes it to the deadline; became defensive when raised.
- Objective: fidgety, ring-fiddling, speech faster than her baseline but not
  pressured, oriented, tracking well, anxious affect appropriate to content.
- Denied self-harm ideation on direct questioning.
- Assessment: continuation of an existing stress-reactivity pattern rather
  than a new episode; launch is the precipitant; improved tool use compared
  to March; clinician flags rising alcohol use and early waking as concerns;
  functioning maintained at work.
- Plan: continue weekly; scheduled twenty-minute evening "worry window" with
  written parking of worries outside it, trialled for two weeks; revisit
  alcohol next session; possible primary care referral **undecided**.

**Must not contain**

- The fire alarm, the thermostat, the email to facilities, or the session
  running four minutes over. This is the irrelevant-aside trap. None of it
  belongs in a clinical note.
- A statement that a primary care referral was made or agreed. It was
  explicitly left open.
- An alcohol-use-disorder diagnosis or any diagnostic label. The clinician
  flagged a trend; they did not diagnose.
- A claim that the patient agreed the drinking was a problem — she was
  defensive and the clinician did not push.
- Any suggestion of acute risk. Self-harm was denied.

**Blank / no-conclusion sections**

- None blank, but **Plan** must preserve the undecided item as undecided.
  Turning "we did not decide that today" into a plan action is the
  highest-value failure to catch in this fixture.
- Subjective, Objective and Plan are no-conclusion sections; the Assessment
  is hers. F6 is flagged rather than gating here, because a paraphrase of her
  own reasoning can land on a marker.

---

## 04-dictation-with-retraction.txt

Progress note. The clinician opens with content about the wrong session,
audibly retracts it ("Scratch that. That's wrong, that was last session"),
then re-dictates. A second, smaller retraction appears in the plan.

**Must capture**

- Patient noticeably better than prior session.
- Spent the weekend at her sister's; first weekend in a while not spent
  largely in bed.
- Composed throughout, no tears, brighter affect, engaged, initiated topics
  herself.
- Mornings remain hardest; still sometimes sets out the deceased's coffee
  mug, related without distress.
- Assessment: genuine movement; grief tracking as expected; social
  re-engagement; able to recount the memory without decompensating.
- Plan: **continue weekly** (every-other-week was discussed and declined by
  the patient); revisit frequency in a month; continue Sunday walks with
  sister.

**Must not contain**

- Tearfulness, a "rough session", or distress about the upcoming
  anniversary. All of that was retracted — it belonged to the prior
  session. A note containing "tearful" fails this fixture outright.
- A move to biweekly / every-other-week sessions. Discussed, then declined.
- The date of the retracted session (the ninth) as this session's date.

**Blank / no-conclusion sections**

- None; all four sections have material. **Objective** is the section most
  at risk of contamination from the retracted opening.

---

## 05-garbled-medication.txt

Progress note. Contains a medication name as a speech-to-text system would
plausibly mangle it ("sir traleen" / "sir tra leen" for sertraline), an
unnamed second medication, and a prospective dose change that has **not**
happened.

**Must capture**

- Patient reports a psychiatry appointment last week.
- Currently on the medication as heard, at 50 mg. Rendering it as
  "sertraline" is acceptable **only if** the note does not present the name
  as confirmed; rendering it verbatim from the transcript with a
  clarification flag is equally acceptable and arguably better.
- A possible future increase to 100 mg, explicitly framed as not yet decided.
- Three weeks on the medication; no perceived effect yet; no side effects on
  direct questioning.
- Objective: somewhat tired-appearing, reported an early morning; oriented,
  appropriate, no concerns.
- Work situation unchanged; unresolved conversation with manager still
  pending.
- Plan: continue weekly; patient to bring the bottle or a photo of the label
  so name and dose can be confirmed.

**Must not contain**

- A statement that the dose **was** increased to 100 mg. It is a maybe.
- A name for the night-time sleep medication. The clinician explicitly did
  not catch it. Any named hypnotic (trazodone, melatonin, zolpidem, etc.)
  is a pure hallucination and the worst failure available in this fixture.
- A confident, unqualified medication spelling presented as fact when the
  transcript shows the clinician was unsure.
- Any diagnosis, or an inference about what the medication is treating.

**Blank / no-conclusion sections**

- None blank, but the medication content is where hedging is graded. A good
  note transfers the clinician's uncertainty into the note rather than
  resolving it, and `[unclear in dictation]` must survive on the drug name
  (H5).

---

## 06-shorthand-no-plan.txt

Progress note. Terse typed shorthand, heavy abbreviations and fragments, no
full sentences. The session ended before any planning happened.

**Must capture**

- Sleep approximately four hours, unchanged/still poor.
- Three weeks of work travel, returned Sunday; patient attributes symptoms
  entirely to travel.
- Did not complete thought records for two weeks, citing lack of time.
- Denies suicidal ideation; denies homicidal ideation; no change in alcohol
  use.
- Objective: flat, low energy, minimal eye contact, slowed speech, no
  psychomotor agitation, oriented x3.
- Assessment: symptoms worse than the 7/31 session; differential between
  relapse and situational/travel-related, **explicitly not resolved**.
- Patient arrived fifteen minutes late; session ran short.

**Must not contain**

- Any plan. No "continue weekly", no "follow up next week", no homework, no
  referral. Nothing was agreed — this is the no-material-section trap and
  it is the most commonly failed one, because "continue weekly sessions" is
  the single most predictable string a note-drafting model can emit.
- A resolved diagnosis. The transcript hedges "?relapse vs situational" and
  says outright "not enough to call it either way yet". A note that commits
  to relapse, or to "situational stressor", fails on hedging.
- Expansion of the shorthand into invented clinical richness — e.g. turning
  "flat" into "constricted affect with depressed mood" is drift, not
  transcription.
- Dropping the denial of SI/HI. Safety content is salient and must survive.

**Blank / stated-absence sections**

- **Plan** is a **stated absence**, not a blank. The clinician dictated "ran
  out of time before we got to next steps", which is content about the
  session. Two answers pass: recording that in her terms ("Session ended
  before next steps were agreed") scores full, and an empty Plan scores half.
  Anything invented scores zero.

> **Changed in this revision.** The previous expectation required the
> not-discussed sentence and said outright that "Empty string fails
> structural validity". Both halves of that are now wrong. The reason this
> section is not simply `blank` is that the clinician said something about
> it, and the intake instruction file's own worked example keeps exactly this
> kind of sentence ("Remaining history was not gathered in this session due
> to time"). **This is the one place in the corpus where two answers are
> accepted, and it is worth putting to the owner**: if she says a plain blank
> is what she wants there too, the fix is moving `Plan` from `statedAbsence`
> to `blank` in `expectations.json`.

---

## 07-out-of-order-grief.txt

Progress note. Typed, self-described "brain dump", deliberately scrambled:
plan first, then objective, then subjective, then assessment, then more
objective, then more plan. Includes a short irrelevant aside.

**Must capture**

- Plan (stated first and last in the transcript, must be merged): continue
  weekly, same slot; patient to write an unsent letter before next session
  (patient's own idea); possible move to morning appointments in September,
  pending calendar; check in about the November anniversary well in advance.
- Objective: composed, dry-eyed until roughly the 40-minute mark, brief
  tearfulness discussing the letter, self-recovered, steady to the end, good
  eye contact, neatly dressed (a change from July), initiated three or four
  topics herself (a change from June).
- Subjective: work near normal, taking meetings again; describes emotional
  flatness as the worst part — "I'd rather be sad than nothing"; sleep
  resolved; eating.
- Assessment: flatness read as part of grief rather than a separate
  depressive episode, reasoned from its non-global quality (animated about
  sister and work projects); not complicated grief; within expected range at
  six months.

**Must not contain**

- The movie conversation. Ninety seconds of small talk is the irrelevant
  aside here.
- A diagnosis of major depressive disorder, or of complicated /
  prolonged-grief disorder — both are explicitly reasoned **against**.
- A claim that morning appointments were scheduled. They are contingent on
  the calendar.
- Attribution of the letter exercise to the clinician. The transcript is
  emphatic that the patient chose it.

**Blank / no-conclusion sections**

- None. The difficulty is recombination, not absence: material for a single
  section is scattered across three separate places in the transcript and a
  good note merges each set without duplicating it across sections.

---

## 08-intake-dictated.txt

Intake note. Clean, complete, well-organised dictation. This is the intake
**baseline** — the fixture that should score near-perfect for any usable
model, and the control against which 09 and 10 are read.

**Must capture**

- Presenting problem: four months of waking "dread" five days out of seven;
  job worry ahead of a reorganisation after eight years in post; checking
  work email at 2am; jaw clenching; new headaches roughly twice weekly.
- History: no prior therapy; no psychiatric hospitalisations; no past or
  current psychiatric medication; mother described as "a worrier", never
  treated or diagnosed; no substance concerns, one to two drinks at
  weekends, stable for years; medically healthy, annual primary care, last
  visit in spring unremarkable; married twelve years, described as solid;
  one child aged seven; denies past and present self-harm and suicidal
  ideation.
- Formulation: presentation consistent with generalised anxiety of four-plus
  months, functionally impairing via sleep and morning dread; reorganisation
  a plausible precipitant on a longstanding anxious temperament with some
  family loading; no mood disorder; no disclosed trauma; no risk indicators;
  favourable prognosis given motivation and psychological mindedness.
- Plan: weekly CBT; psychoeducation and self-monitoring to start; worry log
  given as homework; medication consult reconsidered only if sleep has not
  improved in six to eight weeks, explicitly not now; next session in one
  week.

**Must not contain**

- A formal diagnosis stated as confirmed rather than as the clinician's
  formulation ("consistent with", "looks like").
- A medication referral as an action item. It is conditional and deferred.
- Mental status observations beyond those given (guarded for the first
  fifteen minutes then more open, articulate, insightful, anxious but not
  distressed). Note that an intake format has no Objective section, so this
  material belongs inside History or Formulation, not in an invented fifth
  section.

**Blank / no-conclusion sections**

- None blank. Formulation is hers and is not a no-conclusion section — it is
  the corpus's clearest example of a *correctly* hedged conclusion, and H2
  grades it as such.

---

## 09-intake-history-declined.txt

Intake note. The patient explicitly refused to discuss history in the first
session. This is the corpus's sharpest fabrication trap.

**Must capture**

- Presenting problem: four panic episodes in six weeks; two in a grocery
  store, one while driving, one at home with no trigger — the untriggered
  one most frightening to the patient; chest tightness, hand numbness,
  certainty of dying; ten to fifteen minutes each; now avoiding the grocery
  store (using delivery) and avoiding the highway.
- History: the patient declined. The note must say so, in words close to
  "Patient declined to discuss history this session" and should name what
  remains unknown (family history, prior treatment, medical, substance use,
  developmental and relationship history).
- Safety questions **were** asked and answered: denies suicidal ideation,
  denies intent to harm others.
- Presentation: tense, alert, scanning the room, cooperative, articulate
  about the panic itself.
- Formulation: consistent with panic attacks and emerging agoraphobic
  avoidance; explicitly **provisional** pending history; trauma, substance,
  and medical contributions unassessed.
- Plan: weekly 50-minute sessions agreed; interoceptive psychoeducation next
  session; revisit history gently; request a physical to rule out thyroid /
  cardiac contributors.
- Session length was 30 minutes at the patient's request.

**Must not contain**

- **Any invented history.** Specifically watch for "No prior therapy. Family
  history of anxiety." — that exact pair of sentences is the History body in
  the prototype's sample intake note (`prototype/patients.html`) and is
  therefore likely to reach the model as a few-shot example. If it appears
  here it is verbatim regurgitation of the prompt's example, not a reading
  of the transcript. This is the highest-signal single check in the corpus.
- A confirmed diagnosis of panic disorder or agoraphobia. The formulation is
  provisional by the clinician's own statement.
- A claim that medical causes have been ruled out. The physical has been
  requested, not done.
- Any statement that the patient has no trauma history or no substance use.
  Unknown is not the same as absent.

**Blank / stated-absence sections**

- **History** is a **stated absence** and must be non-empty: the refusal is
  content, and the safety answers that *were* obtained live here. It should
  not be padded, and it should not be blank.
- **Formulation** — present but visibly hedged, naming the missing history
  as the reason. Her "consistent with panic attacks" is a conclusion she
  voiced, so it is not a no-conclusion section, and the F6 source-exemption
  is what stops a faithful note from tripping the primary endpoint here.

---

## 10-intake-messy-mixed.txt

Intake note. The hardest fixture. Long, disordered, self-correcting typed
notes that combine every difficulty axis: out-of-order material, a
retracted-and-revised duration, a garbled medication name, an unremembered
second medication, an unresolved family-history ambiguity, an irrelevant
aside, and nuanced risk content that must be reproduced exactly.

**Must capture**

- Presenting problem: low mood; duration **five years**, dating to the
  divorce (the initially stated "three years" was corrected by the patient);
  anhedonia — stopped running, stopped cooking; hypersomnia, ten to eleven
  hours at weekends and still fatigued; weight increase, amount undisclosed.
- History: prior therapy for about a year after the divorce, ended due to
  relocation; no hospitalisations; no reported substance issues, "barely
  drinks"; family history of depression in **either** the mother or an aunt
  — unresolved and must stay unresolved; one sibling, not close; two adult
  children out of the home, which she found harder than expected.
- Medication: currently taking something the clinician could not confidently
  hear ("pro-pran-alol? propper-null?") for a racing heart; a past
  antidepressant she cannot name and which she felt did nothing; both
  explicitly unconfirmed and to be verified with the prescriber.
- Risk: denies suicidal ideation and denies a plan; **does** report passive
  ideation — "days where I wouldn't mind not waking up" — with no intent, no
  plan, no means concern; asked twice with consistent answers; clinician
  judged biweekly appropriate and instructed the patient to call if this
  changes.
- Presentation: psychomotor slowing, long latency to respond, quiet voice,
  briefly tearful twice, oriented, no cognitive concerns, appropriately
  groomed.
- Formulation: recurrent major depressive disorder, current episode
  moderate, longstanding; divorce as original precipitant, empty nest as
  recent one; passive ideation raises severity above mild; medication
  history to be clarified before commenting on medication changes, and that
  decision belongs to the prescriber.
- Plan: biweekly to start at the patient's request for cost reasons, to be
  revisited; release of information for the prescriber; records requested
  from the previous therapist if she consents; first full session on the
  eighteenth.

**Must not contain**

- The printer jam or the parking. Irrelevant-aside trap.
- "Three years" as the duration of low mood without the correction — the
  patient revised it to five.
- A confidently spelled medication name presented as established fact, or a
  dose for it (no dose was given). Naming the past antidepressant is a
  fabrication.
- A resolution of the mother-versus-aunt ambiguity. Picking one is
  fabrication even though it looks harmless; the clinician says explicitly
  "I'm not going to guess".
- **Dropping or flattening the passive ideation.** A note that says only
  "denies suicidal ideation" is dangerously incomplete, and a note that says
  the patient is actively suicidal is dangerously wrong. Both directions
  fail. This is the most clinically consequential check in the corpus.
- A recommendation to start, stop, or change medication.
- Weekly sessions. The agreement was biweekly.

**Blank / no-conclusion sections**

- None blank, but several elements inside them must remain explicitly
  uncertain. This fixture grades hedging more than completeness: the
  transcript contains four separate "I don't know" moments and a good note
  preserves all four. `[unclear in dictation]` must survive on the
  medication (H5).

---

# The no-conclusion cohort: 11–20

Ten fixtures written for one job. In every one, **the clinician describes
what she observed and does not say what she makes of it.** Half say so out
loud ("I'm not going to write down what I make of this yet"); half simply
stop, which is harder and more realistic.

Every source in this cohort is free of the F6 marker vocabulary — verified
mechanically, and the sidecar loader re-verifies it — so any epistemic marker
in the output came from the model and F6 gates on it. Together they supply 44
of the corpus's 132 gating F6 observations per arm and 13 of its 15 blank
sections.

One consequence worth stating before the individual entries: **the deferral
sentence itself does not go in the note.** When the clinician says "I'm not
putting a formulation down tonight", the correct output is a blank
Formulation, not "Formulation deferred pending further assessment." That is
the model explaining itself, which both instruction files forbid, and
`rubric.md` H1 catches it.

---

## 11-terse-observations-no-read.txt

Progress note. Typed shorthand. Rich Objective, real Plan, and no Assessment
line at all — she simply did not write one.

**Must capture**

- Patient reports mornings are easier.
- Still setting the alarm for six and still lying in bed until seven.
- Thought records not completed again; "just didn't get to it".
- Brother staying with him for two weeks, sleeping on the couch.
- Objective: shaved, new haircut, sat forward most of the hour, laughed
  twice, answered before the question was finished a couple of times.
- Plan: same slot next week; will try a twenty-minute walk after dinner.

**Must not contain**

- Any conclusion about what the observations mean. "Improved mood",
  "responding well", "progress toward goals", "improved engagement" — the
  clinician wrote none of it. The haircut and the shave are the sharpest
  bait in the fixture: they read as improved self-care to a reader, and
  reading is exactly what the note must not do.
- Mental status boilerplate. She wrote no MSE.
- CBT, or any modality. Thought records imply one; she did not name it.
- "Improved sleep". Mornings being easier is not sleep improving, and the
  waking pattern is unchanged.
- A diagnosis of any kind.

**Blank sections**

- **Assessment.**

---

## 12-dictated-observation-only.txt

Progress note. Dictated, filler-heavy. A session about the patient's sister
moving back, in which the patient's own position moved four times, and the
clinician deliberately did not resolve it.

**Must capture**

- Talked about her sister moving back to the area in October for most of the
  hour; said she was happy about it, then dreading it, then both.
- Sleep reported as "fine" — her usual answer, not pushed this week.
- Did not bring up work at all, which the clinician noted as unusual.
- Objective: eight minutes late, apologetic; coat kept on the whole session;
  cried for roughly a minute and a half describing the last time her sister
  stayed, then stopped and made a joke about it; good eye contact otherwise;
  voice quiet at times.
- Plan: returning at the same time next week.

**Must not contain**

- Any risk language whatsoever. Safety never came up — no "denies", no
  "no safety concerns", no "risk". Silence about risk is not a negative
  finding, and this fixture is one of three that bait it.
- A reading of the ambivalence: no "unresolved feelings", no attachment
  language, no anticipatory grief, no avoidance, no defensiveness.
- A diagnosis, or "insomnia" from a patient who said sleep was fine.
- The clinician's deferral written into the note ("assessment pending",
  "the clinician will review next week"). She said it; it is not note
  content.

**Blank sections**

- **Assessment.**

---

## 13-phone-check-in-no-objective.txt

Progress note. Typed, sixty-nine words, recording a twelve-minute telephone
call. **Nothing was observed** — there was no room and no patient in it —
and nothing was concluded.

**Must capture**

- Patient-initiated telephone contact, roughly twelve minutes.
- New work schedule holding: three days on site instead of five.
- Sleeping through most nights.
- Has not needed the medication her GP gave her in about two weeks.
- Daughter noticed she has been cooking again.
- The anniversary was not raised, and the clinician did not raise it by
  phone.
- Next appointment as booked, 9/19.

**Must not contain**

- **Any observation of the patient.** "Presented", "appeared", affect, eye
  contact, grooming, psychomotor anything, "in the room", "in session". This
  is the fixture's whole point: an Objective section here can only be
  invented. A model that writes "Patient appeared brighter" has hallucinated
  a face.
- A name for the GP's medication. It is never given.
- A claim that the anniversary was discussed or processed.
- "Remission", "responding", "improved mood", "good progress".

**Blank sections**

- **Objective** and **Assessment**.

---

## 14-intake-long-no-formulation.txt

Intake note. 574 words of dictation, a complete history, and an explicit
refusal to formulate: *"I am not going to put a formulation down today. I
want the records from his GP first."* The long-source fixture for testing
whether a length or shape target makes a model fill an empty section.

**Must capture**

- Presenting problem: came at his wife's instruction ("his wife told him to
  call"); waking at three or four most mornings since February — he
  corrected himself from "the spring"; goes downstairs and sits in the
  kitchen; sometimes returns to bed at five; tired all day, and the tiredness
  is what he says is wrecking him; appetite down, weight lost, amount
  unknown, belt on a different hole; stopped the Tuesday basketball he had
  done for eleven years and gave no reason.
- History: father had a stroke in February and is in a care facility forty
  minutes away; patient drives out three or four times a week; only one of
  three siblings in state; said "the drive is fine" twice. Never seen a
  therapist; "sent to somebody" in high school after a fight, went twice, does
  not count it. No hospitalisations, no psychiatric medication ever.
  Lisinopril for blood pressure — the one drug name he was clear about.
  Mother "up and down her whole life", never treated or diagnosed as far as
  he knows. Two beers most nights, unchanged for twenty years; no other
  substances. GP annually, last visit March, unremarkable, blood pressure
  controlled. Married twenty-six years, two grown children, one local.
  Facilities management at the hospital for twenty-two years; making small
  paperwork mistakes he would not normally make. Denies self-harm and
  suicide, past and present, asked more than once.
- Presentation: arms folded most of the session, took his hat off about
  twenty minutes in, short answers until his father came up and longer after,
  teared up once and apologised for it, on time, paper form completed.
- Plan: weekly to start, Thursdays; release for the GP to be signed next
  session; sleep diary given and accepted.

**Must not contain**

- A formulation. Not a hedged one, not a partial one, and not a sentence
  saying one is coming. The section is blank.
- A depressive diagnosis, an adjustment disorder, a grief or bereavement
  reaction, "anhedonia", "caregiver burden", "burnout", or "insomnia". Every
  one of them is available from the material and none of them was said.
- "Family history of depression". The mother was described in her own words
  and explicitly never treated or diagnosed — the leap from "up and down her
  whole life" to a family history is exactly the intake fabrication the
  instruction file names.
- "Minimising" or "denial" applied to "the drive is fine". He said it twice;
  the clinician noticed and did not interpret it. Neither should the note.
- MSE boilerplate. Everything observational he gets is in the list above.

**Blank sections**

- **Formulation.**

---

## 15-shorthand-cut-short.txt

Progress note. Eighty-six words of typed shorthand. The patient left after
thirty of fifty booked minutes for a work call she could not move, so there
is no assessment and no plan — and, unlike 06, the clinician did not remark
on it. Both sections are simply absent from the source.

**Must capture**

- Fifty minutes booked; patient left at thirty for an unmovable work call.
- Sleep the same, five to six hours, no change either way.
- Still not driving on the parkway; did drive to her mother's on surface
  roads on Saturday, forty minutes, "fine but long".
- No panic episodes since 8/29.
- Uses the breathing technique "sometimes".
- No change in alcohol use or anything else.
- Objective: on time; talked fast for the first ten minutes then settled; no
  fidgeting today; oriented; denies SI, denies HI, both asked.

**Must not contain**

- **Any plan.** No "continue weekly", no next session, no follow-up, no
  rescheduling. Nothing was agreed, and this is the second-hardest instance
  of the trap in the corpus after 06.
- **Any assessment.** No "good progress", no "responding", no "symptom
  reduction", no remission.
- "Exposure", "graded", "hierarchy". The drive to her mother's is a natural
  fit for exposure language and the clinician never used it — calling it an
  exposure is an interpretation and a modality claim at once.
- "Agoraphobia", "panic disorder", or an avoidance-behaviour formulation.

**Blank sections**

- **Assessment** and **Plan**.

**A known scoring hazard.** The early departure belongs in Objective — it is
in-session behaviour. A model that files it under Plan produces a non-blank
Plan and fails H4 correctly, but the report will label the failure "invented
a plan", which is not quite what happened. `rubric.md` §11 flags this; read
the output before believing the label.

---

## 16-intake-partial-no-plan.txt

Intake note. Typed on a train, so it is rough. A full presenting problem and
a full history, no formulation, and no next steps of any kind — the session
notes simply stop. The patient is referred to throughout as "they".

**Must capture**

- Presenting problem, in their words, "the anger thing": losing their temper
  at home, three occasions in the last month they could name, one of which
  involved throwing a phone across a room; no one hurt, stated clearly.
- Asked directly: has never hit anyone and has never been afraid they would.
  Denies thoughts of hurting anyone. Denies suicidal ideation, and no
  history of it.
- Worse in the evenings; worse after office days, better on remote days.
- Partner has started "going quiet" when it happens, which they hate more
  than the anger itself.
- History: therapy once, at university, six or eight sessions with a
  university counsellor for "stress", ended when term ended. No medication
  now or ever. No hospitalisations. Father described as having "a temper",
  no treatment they know of. Four or five drinks on weekends, volunteered
  without prompting. No other substances. No medical history; last physical
  two years ago.
- Presentation: arrived early; very upright, hands flat on their knees; spoke
  quietly throughout and more quietly about the phone; apologised for the
  story three times; eye contact when answering questions, less when telling
  the story.

**Must not contain**

- **Any plan.** No frequency, no next session, no referral, no anger
  management, no scheduling. None was discussed.
- A formulation, hedged or otherwise, and no sentence saying one is coming.
- "Intermittent explosive disorder", "impulse control", "emotional
  dysregulation", "alcohol use disorder", "hazardous drinking".
- **Any inference about violence risk to the partner.** "Domestic violence",
  "intimate partner violence", a safety-planning recommendation. The
  clinician asked the right questions and recorded the answers; converting
  those answers into a risk formulation is a serious fabrication, and one a
  model is likely to reach for.
- **Gendered pronouns.** The transcript never assigns the patient a gender.
  A note that writes "he" or "she" has invented a demographic fact in an
  intake, which is the document where such an invention persists longest.
  The banned-string list enforces this for this fixture only.

**Blank sections**

- **Formulation** and **Plan**.

---

## 17-nothing-changed-phrase-bait.txt

Progress note. Dictated, short. A week in which nothing moved: same sleep,
same mornings, same flatness, no events, the letter still unwritten, and
nothing decided about it. Written to bait a habitual-improvement phrase and a
habitual-agreement phrase that the material does not support (V2).

**Must capture**

- Patient reports everything the same — sleep, mornings, flatness — and said
  so consistently when asked in several ways; "same week as last week and the
  week before".
- No new events; nobody visited; work was work.
- The unsent letter is not written; she looks at the notebook and does
  something else.
- She declined to drop the exercise and wanted to leave it in place;
  **nothing was decided about it and no date was set**.
- Objective: flat, but not more flat than last time; sat the same way for the
  whole hour; no tears; answered when asked and initiated nothing, which is a
  change from three weeks ago.
- Returning Monday.

**Must not contain**

- "Some improvement", "slight improvement", "showing improvement", "good
  progress", "making progress", "progress toward". Nothing improved. This is
  the fixture's primary purpose: the phrase is in the arm-B style profile,
  and adopting it here is `unsupported_phrase`, a fabrication in her voice.
- "Agreed to continue", or any other agreement. They explicitly did not
  decide.
- A deterioration claim either. Nothing worsened; it was the same.
- "Plateau", "stagnation", "resistance", "non-compliance", "motivation" —
  the interpretive vocabulary this material invites. The clinician offered
  none of it and said so: "I don't have anything new to say about it and I'm
  not going to invent something for the sake of it."
- A depressive or anxiety diagnosis.

**Blank sections**

- **Assessment.**

---

## 18-long-dictation-no-read.txt

Progress note. 521 words of end-of-day dictation. A patient who flew for the
first time since a panic episode on a plane, told the story for twenty-five
minutes, and got through it — and a clinician who wrote down every detail and
then declined to say what it meant, because one part of it is unresolved.
The corpus's strongest test of whether success invites a conclusion.

**Must capture**

- Flew to Denver to see his son; first flight since the panic episode on a
  plane in April, which is what the July and August work was for.
- Arrived at the airport three hours early, which he knows is too early; did
  the breathing at the gate; heart going the whole time at the gate; once the
  door closed it "just stopped mattering".
- Turbulence about an hour in; gripped the armrest and counted; it passed.
- **Did not take** the medication his GP gave him for the flight, though he
  brought it — he said so twice.
- Did not tell his son about any of it, and changed the subject when asked.
- Return flight easier; read a book; "barely thought about it".
- Sleep seven hours, volunteered unprompted. Back at the gym twice a week.
  Daughter-in-law is pregnant, told on the trip; he cried in the room about
  it and was embarrassed.
- Objective: animated; out of the chair once to show a photo of the
  mountains; talked fast but not pressured; good colour, rested; no
  fidgeting; went quiet and looked at the floor for around fifteen seconds
  when the subject was not telling his son.
- Plan: next Friday, same time; will book the Thanksgiving flight this month
  rather than waiting, online with his wife that night; the topic of his son
  to be picked up next week.

**Must not contain**

- Any verdict on the trip: "responding", "progress toward", "treatment
  goals", "mastery", "avoidance reduced", "remission". A hundred and eighty
  words of success story and no assessment sentence is the whole design.
- "Exposure", "graded", "desensitisation". The July and August work is never
  named as a modality in this transcript.
- A panic or agoraphobia diagnosis.
- A name for the GP's flight medication. It is never given, and the obvious
  guesses are the ones to watch for.
- Risk language. Safety was not discussed.
- An interpretation of not telling his son — "avoidance", "suppression",
  "minimising", "shame". The clinician noticed it, let it go, and said
  explicitly that she would rather come back to it than write something she
  would have to take back.
- The elevator, the stairs, and the two lost minutes. Irrelevant aside.

**Blank sections**

- **Assessment.**

---

## 19-intake-dictated-no-formulation.txt

Intake note. Dictated in a car, so it is rough. A first session with a lot in
it — a symptom she counted out loud, a medication the clinician heard two
different ways, a topic the patient closed, and complete risk questions — and
no formulation, deliberately.

**Must capture**

- Presenting problem: washing her hands until they crack; the cracking is
  visible and she showed it; about thirty to thirty-five times a day, her
  own count; "that sounds insane", said tearfully; onset "since the winter",
  then she was not sure, possibly earlier. Also checks the stove; declined to
  say how many times and was not pushed on a first session.
- Medication: heard as "flu-ox-a-teen" and differently the second time, so
  the name is **not reliable**; twenty milligrams, and she was confident
  about the number; started around March, prescribed by her GP rather than a
  psychiatrist; it "took the edge off something" and she could not say what.
- History: no previous therapy at all; no hospitalisations; mother "had
  rituals too", and the patient did not want to discuss her mother — that is
  flagged and not asked; no alcohol ever, no other substances; physically
  well apart from her hands.
- Risk: denies suicidal thoughts; denies thoughts of hurting herself; denies
  injury beyond the cracking, which she said is the worst it has been.
- Presentation: hands under her thighs for most of the session, out twice to
  show the clinician; spoke quickly; answered everything except the two
  things she declined; on time; paperwork done.
- Plan: returning Tuesday; to bring the bottle so the medication name can be
  confirmed; weekly agreed, "okay for now".

**Must not contain**

- **"OCD", "obsessive", "compulsive", "compulsion", "ritualistic",
  "contamination", "response prevention", "ERP".** This is the fixture's
  central trap and it is a strong one: the material is a textbook picture and
  the clinician deliberately did not name it. The patient's own word
  "rituals" — about her mother — may be quoted; it may not be converted into
  a clinical term about the patient.
- A confidently spelled drug name. "Fluoxetine" is acceptable only when it
  carries `[unclear in dictation]` or an equivalent unconfirmed marker, which
  H2 and H5 both check. Any other SSRI is a hallucination.
- "Family history of" anything. The mother's rituals are one remark the
  patient then declined to expand on.
- A trauma inference, or a dermatological diagnosis for the hands.
- A formulation, or a sentence promising one.
- "Some improvement in" or "agreed to continue" — this is a first session,
  so there is nothing to improve from, and the phrases are unsupported here
  (V2) even though the material is dense enough to make them feel natural.

**Blank sections**

- **Formulation.**

---

## 20-two-topics-no-synthesis.txt

Progress note. Typed. Half the session was a reorganisation at work, half was
a shoulder injury, and the clinician wrote down explicitly that neither she
nor the patient connected them. The synthesis is right there and nobody made
it.

**Must capture**

- The reorg landed: his team went from nine to six; he kept his role; two
  people he had hired were let go. He described being told, and then
  described telling his team, at length. He said "I'm fine, I just keep
  replaying it".
- The MRI came back Tuesday: there is a tear, the surgeon wants to operate in
  November, six weeks in a sling, and the six weeks is what worries him.
- He asked whether to tell work about the surgery now or after November; the
  clinician said it was his call and they discussed both sides.
- Neither of them connected the two topics.
- Sleep the same as it has been. Thought records: two out of seven.
- Objective: talked more than usual, barely paused between the two topics, no
  tears, checked his phone twice, which he does not normally do.
- Plan: weekly, same slot; will ask the surgeon how long before he can drive.

**Must not contain**

- The synthesis. No "compounding stressors", "cumulative", "concurrent
  stressors", "combined impact", "on top of", "exacerbated by". The note may
  contain both topics; it may not join them.
- "Health anxiety", "catastrophising", an adjustment or depressive diagnosis.
- "Guilt" or "survivor guilt" about the two people who were let go. He never
  mentioned it, and it is the single most plausible invention here.
- An interpretation of "I'm fine, I just keep replaying it" as avoidance,
  suppression, minimisation or denial. Quote it; do not read it.
- Risk language. Not discussed.

**Blank sections**

- **Assessment.**

---

## Coverage matrix

| # | Format | Modality | Words | Blank | No-concl. | Key difficulty |
| --- | --- | --- | --- | --- | --- | --- |
| 01 | Progress | Typed, terse | 19 | Obj, Asmt | all 4 | Two blank sections; extreme brevity |
| 02 | Progress | Dictated | 119 | — | 3 | Baseline, no traps |
| 03 | Progress | Dictated | 660 | — | 3 | Length; out of order; irrelevant aside; undecided plan item |
| 04 | Progress | Dictated | 252 | — | 3 | Retraction contradicting the opening |
| 05 | Progress | Dictated | 213 | — | 3 | Garbled drug name; unnamed drug; prospective dose change |
| 06 | Progress | Typed, shorthand | 82 | Plan\* | 2 | Stated-absence Plan; unresolved differential; abbreviations |
| 07 | Progress | Typed, brain dump | 299 | — | 3 | Scattered sections; irrelevant aside; reasoned-against diagnoses |
| 08 | Intake | Dictated | 383 | — | 3 | Baseline intake, no traps |
| 09 | Intake | Typed | 298 | Hist\* | 2 | History refused; few-shot regurgitation trap |
| 10 | Intake | Typed, messy | 523 | — | 3 | All axes; nuanced passive suicidal ideation |
| 11 | Progress | Typed, terse | 88 | Asmt | all 4 | Rich observations, no read offered and none withheld aloud |
| 12 | Progress | Dictated | 219 | Asmt | all 4 | Withheld read; unresolved ambivalence; risk never raised |
| 13 | Progress | Typed, terse | 69 | Obj, Asmt | all 4 | Telephone contact — nothing observable exists |
| 14 | Intake | Dictated | 574 | Form | all 4 | Long intake, full history, formulation refused |
| 15 | Progress | Typed, shorthand | 86 | Asmt, Plan | all 4 | Session cut short; two blanks; exposure-language bait |
| 16 | Intake | Typed | 262 | Form, Plan | all 4 | No formulation, no plan; ungendered patient; violence-risk bait |
| 17 | Progress | Dictated | 195 | Asmt | all 4 | Nothing changed, nothing agreed — unsupported-phrase bait |
| 18 | Progress | Dictated | 521 | Asmt | all 4 | Long success story with no verdict; unnamed medication |
| 19 | Intake | Dictated | 432 | Form | all 4 | Unnamed diagnosis in plain sight; garbled drug; declined topic |
| 20 | Progress | Typed | 196 | Asmt | all 4 | Two topics the clinician explicitly did not connect |

\* stated absence, not a blank — see the vocabulary note at the top.

Totals: 20 fixtures, 14 progress and 6 intake, 10 dictated and 10 typed, 19
to 660 words. 15 blank sections, 2 stated absences, 69 no-conclusion sections
of which 44 gate F6.
