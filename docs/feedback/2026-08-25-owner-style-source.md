<!-- Produced by the owner's own Claude account from her existing skill plus
     months of correction history, at our request (2026-08-25). Her name is
     stripped; "Dana" is fictional throughout; the [skill]/[learned]/[guess]
     tags are the provenance convention we asked for. This is the SOURCE.
     What the model actually receives is the distilled block in
     docs/note-instructions/owner-progress-instructions.md - kept separate
     because this file describes a style, and that file instructs a 4B model,
     and those are different documents with different readers. Questions in
     section 6 are still unanswered. -->

# Practice owner — therapy note writing style (source document)

Config for a small offline model drafting session notes. No real patient content anywhere below — "Dana" is a fictional example client used only to illustrate sentence shape.

Tags: [skill] = from the existing therapy-notes skill file. [learned] = observed across many past sessions/edits. [guess — confirm] = inferred, unverified.

---

## 1. Voice — five bullets

- [skill] Precise but readable; warm but professional. Never clinically cold, never casual.
- [skill] Clinically grounded — describe what happened and what was said, not what it means.
- [learned] Attribution-careful. Every claim about the client's internal state is sourced to the client ("reports," "described," "expressed") or marked as observation ("appears," "presented as").
- [learned] Economical. Notes cover what occurred without padding, repeating, or restating the same theme twice.
- [skill] Structured but not templated — flowing prose organized under sparse subheadings, not a form with blanks.

## 2. Hard rules

- [skill] Always use the client's first name. Never "the client" or "the patient."
- [skill] Therapist actions are always first person ("I inquired," "I reflected," "I introduced"). Never name the therapist, never third person ("the therapist…").
- [skill] Use the pronouns given for the client; never assume.
- [skill] Client content is third person ("Dana described…"); therapist content is first person.
- [skill] American English spelling throughout (behavior, judgment, normalizing).
- [skill] Never use ALL-CAPS section headers or heavy AI-style bullet blocks (CLINICAL IMPRESSIONS, RECOMMENDATIONS, etc.).
- [skill] Default to flowing prose. Use bullets only when the source input is itself list-like.
- [skill] Use sparse, lowercase bold subheadings only when a session has genuinely distinct themes.
- [skill] Preserve any clinically meaningful client quote in quotation marks, exactly as given.
- [skill] Never invent an observation, symptom, or detail not present in the input. If session content doesn't support a field, leave it minimal or say so — don't fill the gap.
- [learned] Never soften an existing hedge or denial. If the input has "denied," "reports," or "appears," the note keeps or strengthens that qualifier — it never turns into a flatter, more certain statement.
- [learned] Do not draw a clinical conclusion, interpretation, or diagnosis beyond what the client or clinician actually said.
- [learned] When session content touches sensitive disclosures, default to the less specific accurate phrasing — document that a topic was addressed without over-detailing it.
- [skill] Let detail scale with what actually happened in the session — don't pad a short session, don't compress a dense one.
- [guess — confirm] Never use an em dash; use a comma, colon, semicolon, or a restructured sentence instead.

## 3. Words and phrases

| Write | Never write |
|---|---|
| Dana reports… / Dana described… | Dana states… (unless directly quoting) |
| appears [affect] | seems [affect] |
| denied [SI/symptom] | does not have [SI/symptom] |
| I inquired / I reflected / I introduced | The therapist inquired / her name + "reflected" |
| Dana (first name) | the client / the patient |
| expressed ambivalence about X | seemed unsure about X |
| engaged, [1–3 concrete descriptors] | "patient was cooperative and pleasant" (generic filler) |
| cognitive restructuring, psychoeducation, grounding | "worked on cognitive stuff" (vague paraphrase of technique) |
| None (for risk review / out-of-session actions when empty) | leaving a field blank |
| [guess — confirm] "continues to," "remains," "an ongoing focus" for recurring threads | [guess — confirm] "still hasn't," "again" (implies judgment) |

## 4. Sentence patterns by section

- **Location:** one or two words. *"Online."*
- **Client presentation:** engagement + affect + one notable observation, one line. *"Engaged, tearful at times, responded well to grounding introduced in session."*
- **Risk review:** "None" by default; when relevant, state history then today's status. *"History of passive suicidal ideation; denied any current active or passive ideation today."*
- **Discussion / Themes:** opens with client name + reporting verb, states the throughline first. *"Dana came to session reporting increased anxiety about an upcoming move, describing a persistent worry that she would not adjust well to a new city."* Subheadings (lowercase bold) only if themes are genuinely separate.
- **Intervention:** short comma-separated phrase, technique names not descriptions. *"Cognitive restructuring, psychoeducation on the anxiety cycle."*
- **Out of session actions:** "None," or a short instruction; split by person if both have a task. *"Dana — practice diaphragmatic breathing daily; Me — follow up on sleep at next check-in."*
- **Note for next session:** brief, forward-looking, therapist-facing, no new clinical claims. *"Follow up on Dana's response to the breathing exercise; revisit family-of-origin material introduced today."*

## 5. What changed since the old skill file

- [learned] Earlier notes sometimes used markdown H2 headers (## Assessment, ## Plan) and a closing signature block — current notes use bold inline field labels only, no headers, no signature line.
- [learned] Earlier notes used more hedging throat-clearing ("It should be noted that…," "Importantly,…") before a fact — current notes state the fact directly and let the attribution word ("denied," "reports") do that work instead.
- [skill] American spelling and strict first-person-for-therapist rules are recent additions — earlier notes mixed British spelling and occasional third-person therapist references.
- [learned] General trend toward more concision and less granular detail on sensitive disclosures, especially in longer-running or higher-sensitivity cases.

## 6. Questions for me (yes/no)

1. Should the "never soften a hedge" rule also apply inside Intervention and Out-of-session-actions, or only Discussion/Risk review?
2. Is "Discussion" your default section label now for new clients, with "Themes and issues raised" reserved for older files only?
3. Should bullets ever appear inside Discussion for a session that wasn't dictated as bullets, or is prose absolute there?
4. Should Note for next session ever include a tentative clinical hypothesis, or strictly logistics/topics only?
