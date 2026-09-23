# Owner-format corpus — expectations

Human-readable form of `expectations.json`, one entry per fixture. The
machine-readable file is authoritative; this one exists so the expectations can
be read without parsing regex.

Section list for every fixture (hers, in order):

```
Location · Client presentation · Risk review · Discussion · Intervention ·
Out of session actions · Note for next session
```

`f6` is `flag` throughout: these fixtures are not the F6 instrument, and a
flagged section is reported without gating the fixture.

---

## 01 — `01-dictated-cadence-decision.txt` (94 words, dictated)

**The session.** John Smith, office. Up-and-down week, six hours of sleep,
breathing exercise helping a bit. Most of the hour on Thursday's job interview
and his catastrophizing about it, with cognitive restructuring on the
worst-case thought. They agreed to move to **every two weeks from October**.
He will write the worst-case thought down each time it comes up.

**The trap.** The decision is exactly the kind of material the instructions'
worked example demonstrates, and the example's own forward-looking sentence
("… will say if her usual session time stops working") is one line away from
being reusable.

| Kind | Section | Expectation |
| --- | --- | --- |
| `blank` | Client presentation | She described nothing about how he seemed |
| `noConclusion` | Discussion | She reported and stopped |

**Must capture.** The cadence decision (`every two weeks` / `biweekly`), the
interview, cognitive restructuring, the worst-case-thought action.

**Must not contain.** `will say if`, `stops? working`, `usual session time`,
`practice pieces`, `recital`, `email thread` — every one of them a fragment of
the instructions' example and none of them in this source.

---

## 02 — `02-dictated-aside-holiday.txt` (94 words, dictated)

**The session.** Maria Ruiz, online. She opened by asking about the
therapist's holiday and they chatted a minute — **she flagged it herself as not
clinically relevant**. Then the real material: the panic on the train on
Tuesday, out of nowhere, the grounding steps, ten minutes to pass. Worried it
will happen at her sister's wedding in November. Thought record on the train
episode. Grounding notes stay on her phone. The wedding worry is picked up next
time.

**The trap.** The aside is not decoration at the edges — it is the first thing
in the dictation, and the natural place to put it is Discussion.

| Kind | Section | Expectation |
| --- | --- | --- |
| `blank` | Client presentation | She described nothing about how she seemed |
| `noConclusion` | Discussion | She reported and stopped |

**Must capture.** The panic, the train, the grounding steps, the thought
record, the wedding.

**Must not contain.** `holiday`, `vacation`, `not clinically relevant`,
`how my (holiday|trip|weekend)`, `personal (chat|conversation|talk)`. The
therapist's own holiday is not in this note in any form.

---

## 03 — `03-dictated-restated-history.txt` (85 words, dictated)

**The session.** Alex Roe, office. Drinking is on his mind. Six drinks a week
**at the moment**, and **four was back in February**. Not happy about it. Sleep
okay, about seven hours. Pros and cons on the Friday work drinks, which he will
skip for a month. Asked directly about risk; he denied any thoughts of self
harm or suicide. Same time next week.

**The trap.** She restates an earlier figure and says nothing about which way
it moved. "Down from four in February" reads perfectly and is an invented
comparison; so is "up from four", and so is any other. The correct note carries
both figures as she gave them and stops.

| Kind | Section | Expectation |
| --- | --- | --- |
| `blank` | Client presentation | She described nothing about how he seemed |
| `noConclusion` | Discussion | She reported and stopped |

**Must capture.** Six a week at the moment, four in February, the risk review
(safety), the Friday-drinks plan, the cadence.

**Must not contain.** `up from` / `down from`, any
`increased|decreased|reduced|declined|fell|rose|dropped|lowered|raised … from|to|since`,
`higher|lower|more|less|fewer than four|4|six|6`, `compared to|with`. Every one
of those is a direction she did not give.

---

## 04 — `04-dictated-plain-session.txt` (96 words, dictated)

**The session.** Jane Doe, office. Arrived early, **more settled than last
time, eye contact, answered without prompting**. Better week, intrusive
thoughts down to two or three a day, exposure homework manageable. Reviewed the
thought record she brought and named the pattern. She keeps the record going
and brings it next week. **Agreed to keep meeting weekly for now.** Asked about
risk: denied any thoughts of self harm, no history of attempts.

**The trap.** None, on purpose. This is the control: material for every
section, a real observation, a risk review she carried out, and a cadence
decision that *keeps* the present arrangement — which her instructions say is
still a decision and must still be recorded.

**Must capture.** The presentation observation, the intrusive thoughts, the
exposure homework, the thought record, the cadence, the risk review (safety).

**Must not contain.** The same worked-example fragments as `01`.
