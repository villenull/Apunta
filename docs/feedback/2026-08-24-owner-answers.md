# Practice owner — jurisdiction and records system, 2026-08-24

Three answers given late at night by the owner's partner (who is leading her
first install), plus one decision he deferred and one he left open. These
answer questions that had been carried as "ask her" since M9.

They arrived because of a single offhand fact: **her system of record is
Halaxy.** Halaxy is used mostly outside the United States, which contradicted
an assumption nobody had ever written down — and M9 had already been built on
it.

## Answers

| # | Question | Answer |
| --- | --- | --- |
| 1 | What is her official system of record? | **Halaxy** |
| 2 | How often does she review cases? | ~2 weeks — *kind of review left unspecified* |
| 3 | Where does she practise? | **Mexico** |
| 4 | What language does she write notes in? | **English** |
| 5 | Does she need the diagnosis/plan compliance scaffolding at all? | **Keep it, simplify later** |
| 6 | Apple Developer membership for code signing? | **Deferred** — he will lead her first install personally |

## What each answer changes

### 1 — Halaxy is the system of record (M7, M9)

Confirms the design that was already built: notes leave Apunta as **plain text
on the clipboard**, pasted into a separate system. Nothing here changes.

It leaves one question still open, and it is the one that would simplify M9's
hardest area: **does Halaxy already hold the signed treatment plan?** If it
does, Apunta's dated attestation stops needing to stand on its own — see
`docs/agents/M9-treatment-plan.md`, *Signatures, given an app with no
accounts*, which flags exactly this.

### 3 — Mexico, not the United States (M9)

**M9's entire compliance layer was built to a US payer standard**, and nobody
ever asked. Concretely wrong for her:

- `NPI` — the US National Provider Identifier. Does not exist in Mexico. The
  analogue is the **cédula profesional** issued by the Dirección General de
  Profesiones, and it is the number that actually identifies her.
- `ICD-10-CM` — the US Clinical Modification. Mexico uses **CIE-10**.
- The framing itself. Mexican private psychology practice is largely
  **self-pay**, so "payer-facing document" — the premise of the measurable
  objectives, target dates and attestation — may simply not apply.

The governing standard is almost certainly **NOM-004-SSA3-2012**, the official
Mexican standard for the *expediente clínico*, and the applicable privacy law
is **LFPDPPP**, under which health data is `datos personales sensibles`.

**None of that is verified yet.** It is written here as the shape of the
problem, not as fact, and it must not reach her screen or any user-facing
document until confirmed against primary sources — the same rule M7 carries
for the nine unverified claims in `data-at-rest-2026-08.md` §7. Research
queued: `docs/research/mexico-clinical-records-2026-08.md`.

One thing gets *better* rather than worse: under LFPDPPP's higher consent bar
for sensitive health data, an app that never sends a byte off the machine is
considerably easier to defend than a cloud EHR. The privacy-first architecture
is not merely a preference in this jurisdiction — it is the compliant shape.

### 4 — Her notes are in English (M3, M6, M7)

The most consequential answer in the set, and the one that changes nothing.

Mexico raised a real possibility that her caseload works in Spanish. That
would have invalidated a great deal: the 20 English eval fixtures, the section
names, the drafting instructions, the deferred style profile, and the app
copy. **It is English**, so all of it stands exactly as built.

Worth recording precisely because it was nearly expensive.

### 5 — Keep the compliance scaffolding, correct it later

Offered a choice between keeping M9 as built and stripping it to a plain
working document, he chose to keep it. The reasoning holds: keeping it is
reversible and costs only some blank fields, while rebuilding it later if an
insurer ever asks is real work. Correct the identifiers once the Mexican
requirements are actually verified — do not guess twice.

### 2 — Review cadence, unresolved

"Reviews cases every ~2 weeks" is ambiguous between two very different things:
her own habit of looking over her caseload, and the formal plan review
interval that drives `review_due`. Asked to choose, he expressed no
preference.

**So `DEFAULT_REVIEW_INTERVAL_DAYS` stays at 90 and is marked unconfirmed.**
Setting it to 14 on this reading would mark every plan overdue almost
immediately and turn the lapsed-plan reminder — the highest-consequence guard
in M9 — into noise. Still to ask her directly.

### 6 — Signing deferred (M8)

No Apple Developer Program membership for now; he will walk her through the
first install himself, so the unsigned path is acceptable for initial testing.

This does **not** remove two things, both now in `docs/agents/M8-installer.md`:
ad-hoc signing every bundled Mach-O at build time (an unsigned arm64 helper
may refuse to spawn at all on Apple Silicon, which looks like an app that
opens and does nothing), and the fact that the right-click → Open workaround
was removed in macOS Sequoia and must not be documented.

## Still open for her

- Does Halaxy already hold the signed treatment plan?
- Is the fortnightly review her own habit, or the formal plan review?
- Does comparing across sessions belong in Objective or Assessment?
- The new `statedAbsence` eval case, and fixture 01's now-blank Assessment —
  a rubric rule that had been ranking fabrication above restraint was
  inverted, and she is the one who can say whether the blank reads right.
