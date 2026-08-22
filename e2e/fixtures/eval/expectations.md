# Expectations per fixture

What a good note must capture, what it must not contain, and which sections
should legitimately be thin or explicitly "not discussed".

All patient names, dates, and clinical details in this corpus are
**fabricated**. Names follow the prototype's convention of obviously
synthetic placeholders (John Smith, Maria Ruiz, Ana Torres, Jane Doe, Alex
Roe, Dana Doe, John Q. Public). Nothing here derives from a real person.

Two formats are exercised, matching `prototype/capture.html`:

- **Progress note** — Subjective, Objective, Assessment, Plan
- **Intake note** — Presenting problem, History, Formulation, Plan

Fixtures 01–07 are progress notes. Fixtures 08–10 are intake notes.

Throughout, "**must not**" items are fabrication traps: content a weak model
is likely to invent, copy from a few-shot example, or carry over from an
earlier part of the transcript that was retracted. The single most important
property of a generated note is that every clinical claim in it is traceable
to the transcript.

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

**Thin / not-discussed sections**

- **Objective** — no material at all. Acceptable output is an explicit
  statement such as "Not discussed" or "No objective observations recorded
  this session." Anything descriptive here is a fabrication.
- **Assessment** — may only restate the patient-reported benefit at low
  confidence (e.g. "Patient reports benefit from breathing technique").
  A one-line hedged assessment is correct; a paragraph is over-reach.

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

**Thin / not-discussed sections**

- None. All four sections should be substantive.

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

**Thin / not-discussed sections**

- None, but **Plan** must preserve the undecided item as undecided. Turning
  "we did not decide that today" into a plan action is the highest-value
  failure to catch in this fixture.

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

**Thin / not-discussed sections**

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

**Thin / not-discussed sections**

- None, but the medication content is where hedging is graded. A good note
  transfers the clinician's uncertainty into the note rather than resolving
  it.

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

**Thin / not-discussed sections**

- **Plan** — must be explicitly "Not discussed; session ended before next
  steps were agreed" or equivalent. Empty string fails structural validity;
  invented content fails faithfulness. The only passing answer names the
  absence.

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

**Thin / not-discussed sections**

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

**Thin / not-discussed sections**

- None.

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

**Thin / not-discussed sections**

- **History** — must be a short, honest statement of refusal plus the safety
  answers that were obtained. It should not be padded, and it should not be
  empty.
- **Formulation** — should be present but visibly hedged, and should name
  the missing history as the reason.

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

**Thin / not-discussed sections**

- None are empty, but several elements inside them must remain explicitly
  uncertain. This fixture grades hedging more than completeness: the
  transcript contains four separate "I don't know" moments and a good note
  preserves all four.

---

## Coverage matrix

| # | Format | Modality | Words | Key difficulty |
| --- | --- | --- | --- | --- |
| 01 | Progress | Typed, terse | 19 | Empty Objective; extreme brevity |
| 02 | Progress | Dictated | 119 | Baseline, no traps |
| 03 | Progress | Dictated | 660 | Length; out of order; irrelevant aside; undecided plan item |
| 04 | Progress | Dictated | 252 | Retraction contradicting the opening |
| 05 | Progress | Dictated | 213 | Garbled drug name; unnamed drug; prospective dose change |
| 06 | Progress | Typed, shorthand | 82 | Empty Plan; unresolved differential; abbreviations |
| 07 | Progress | Typed, brain dump | 299 | Scattered sections; irrelevant aside; reasoned-against diagnoses |
| 08 | Intake | Dictated | 383 | Baseline intake, no traps |
| 09 | Intake | Typed | 298 | History refused; few-shot regurgitation trap |
| 10 | Intake | Typed, messy | 523 | All axes; nuanced passive suicidal ideation |
