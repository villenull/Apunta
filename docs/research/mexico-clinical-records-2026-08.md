# Mexican clinical-records requirements for a solo psychology practice — the research M9 was built without

**Status:** domain research correcting `docs/agents/M9-treatment-plan.md`, which
was built to a **United States** payer standard before anyone asked where she
practises. Nothing here is implemented. No file outside this one was touched.
**Replaces, for this jurisdiction:** `docs/research/m9-plan-requirements-2026-08.md`.
That document is still correct about the United States and still correct about
*shape* — versioning, immutability, measurability, the signature problem. It is
its **premise** that does not transfer.
**Answers:** `docs/feedback/2026-08-24-owner-answers.md` §3, which states the
Mexican picture as "the shape of the problem, not as fact" and queues this file.
**Date:** 2026-08-24. All sources accessed that day.

**This is engineering research, not legal advice.** It exists so the data model
and the packet stop asserting things that are untrue in her jurisdiction. §8
lists what only she, her accountant, or a Mexican health-law lawyer can settle,
with the exact question to ask in each case. Nothing here is a substitute for
that, and nothing here should reach her screen as guidance.

**No patient material appears here.** Per `CLAUDE.md` hard rule 2, the only
clinical fragments referenced are the project's existing synthetic ones.

---

## Method, and everything I could not reach

**Every outbound fetch failed.** `WebFetch` is egress-blocked in this container
for every domain attempted — `dof.gob.mx`, `www.diputados.gob.mx`,
`www.conamed.gob.mx`, `www.cndh.org.mx`, `www.imss.gob.mx`,
`www.farmacopea.org.mx`, `es.wikipedia.org`, and several commentary sites.
`curl` fails the same way (`CONNECT tunnel failed, response 403`; the proxy's
own status endpoint records the denial for `dof.gob.mx:443`). This is the same
limitation the M9 research and `data-at-rest-2026-08.md` ran into.

**So I did not read a single primary instrument end to end.** Everything below
comes from search-result extracts of the named instruments plus Mexican legal,
medical-software and professional commentary. That is a materially weaker
evidence base than reading the *Diario Oficial* text, and it matters most in
exactly the place it hurts: **numeral numbers**. Where I cite "NOM-004 §5.10" I
am reporting where commentary says a quoted sentence sits, not where I saw it.

Tags, following `m9-plan-requirements-2026-08.md`:

- **[verified]** — the provision came back as verbatim or near-verbatim text of
  the named instrument from two or more independent results, at least one of
  them official or reproducing the DOF text. It still means *I read an extract
  of the text*, never *I read the instrument*.
- **[single]** — one source, or commentary only, however confident that
  commentary sounds. Mexican health-software vendors write a great deal of
  compliance marketing and it reads exactly like law.
- **[inferred]** — my reasoning from the above. Not something a source says.

**Specific gaps, stated up front so they are not mistaken for findings:**

1. **The full numbered text of NOM-004-SSA3-2012.** I have §2 (campo de
   aplicación), §5.4, §5.10 and §5.11 as quoted sentences, and §6.2's
   enumeration. I do **not** have §§4, 5.1–5.3, 5.5–5.9, 5.12+, or §6.1's
   historia clínica enumeration as text.
2. **Whether NOM-004 names the *cédula profesional* at all.** Multiple vendor
   sources say every note must carry it. I could not find it inside a quoted
   numeral, and the one sentence I *do* have verbatim (§5.10) names only date,
   time, full name and signature. See §3.2 — this is the single most-repeated
   claim I could least confirm.
3. **Whether NOM-024-SSA3-2012 reaches an app like Apunta.** Its scope language
   ("establecimientos … que adopten un sistema de registro electrónico para la
   salud") is broad enough to be worrying and vague enough that I will not
   guess. See §2.5; it is a project-level risk, not an M9 one.
4. **The article numbers of the *new* 2025 LFPDPPP.** The law was completely
   replaced in March 2025 (§6.1). Commentary cites arts. 18 and 19 for security
   measures and breach notification; I could not confirm the numbering against
   the text, and its Reglamento had still not been published as of mid-2026.
5. **Anything about Halaxy's own behaviour.** Out of scope here and unresearched.
6. **Whether an English-language expediente is a problem.** §8.6. I found no
   rule requiring Spanish and one procedural rule that bites if a record is ever
   produced in court. That is not the same as an answer.

If you take one methodological point from this file: **the US research could
lean on payer audit tools that state their requirements as checklists. Mexican
law states almost nothing at this level of detail, and the vendor commentary
that fills the silence is not law.** Several confident-sounding assertions
below are tagged `[single]` precisely because they are the sort of thing that
gets repeated between blog posts without anyone re-reading the norm.

---

## 0. The five-line answer

1. **NOM-004-SSA3-2012 very probably binds her** — it is obligatory for "el
   personal del área de la salud" and for medical-care establishments "incluidos
   los consultorios", psychology is a named health profession in LGS art. 79,
   and a psychology consultorio files a COFEPRIS *aviso de funcionamiento*. But
   the strict application to an independent *licenciada en psicología* is
   genuinely debated in Mexican commentary (§1).
2. **It requires far less than M9 built.** A record per patient; every note
   carrying date, time, full name and signature; diagnosis, prognosis and
   treatment in each progress note; five years' retention; no erasures. **No
   treatment-plan document, no measurable objectives, no target dates, no review
   dates, no attestation block** (§2).
3. **`clinician_npi` becomes `clinician_cedula`** — the cédula profesional from
   SEP's Dirección General de Profesiones, 7–8 digits, numeric. There is no
   Mexican licensing board for psychologists; the cédula is the whole statutory
   credential and the colegios are voluntary (§3).
4. **Diagnosis coding is optional for her.** CIE-10 is compulsory for *health
   statistics*, not for a self-pay consultorio's record; NOM-004 wants a
   diagnosis, not a code. DSM-5-TR is what Mexican psychologists actually use —
   and its printed codes *are* ICD-10-CM codes, so `icd-10-cm` is not simply
   wrong, it is under-labelled (§4).
5. **Nobody demands the plan document.** Mexican major-medical policies exclude
   routine outpatient psychotherapy; where they cover it at all, they want an
   *informe médico* form, a referral and an invoice, not a versioned plan. The
   only Mexican party asking for anything plan-shaped is the profession's own
   ethics code, and what it asks for is that the **client** consent to the plan
   of work and to changes in it (§5). That reframes M9 from a payer artefact
   into a client-facing one, which is a better fit for what it already is.

And one thing that is **not** in the owner's memo and should be: **the LFPDPPP
he named no longer exists.** It was abrogated and replaced on 20 March 2025
(§6.1). The substance carried over, but the memo's citation is to a repealed
law and INAI is not the authority any more.

---

## 1. Does NOM-004-SSA3-2012 bind a psychologist in solo private practice?

This is the load-bearing question. If it does not reach her, most of M9's
scaffolding has no Mexican justification at all and the honest answer is "keep
whatever you find useful, discard the rest."

### 1.1 What the standard says about its own scope

NOM-004-SSA3-2012, *Del expediente clínico*, published in the DOF on
**15 October 2012** and in force since 2013 **[verified]**. Its stated scope:

> Esta norma … es de observancia obligatoria para el personal del área de la
> salud y los establecimientos prestadores de servicios de atención médica de
> los sectores público, social y privado, incluidos los consultorios.

**[verified]** — returned verbatim from independent results. Two clauses matter:
**"personal del área de la salud"** (a person, not only an institution) and
**"incluidos los consultorios"** (no size floor; a one-room practice is in).

Its object is "establecer los criterios científicos, éticos, tecnológicos y
administrativos obligatorios en la elaboración, integración, uso, manejo,
archivo, conservación, propiedad, titularidad y confidencialidad del expediente
clínico" **[verified]**.

### 1.2 The argument that it reaches her

Three independent legs, none of which is commentary:

1. **LGS art. 79** names **psicología** in the list of professions for whose
   exercise "los títulos profesionales o certificados de especialización hayan
   sido legalmente expedidos y registrados por las autoridades educativas
   competentes" **[verified]**. Psychology is a health profession in Mexican
   federal law, not an adjacent one.
2. **LGS art. 32** defines *atención médica* as "el conjunto de servicios que se
   proporcionan al individuo, con el fin de proteger, promover y restaurar su
   salud", and the activities of atención médica expressly include rehabilitation
   "para corregir las invalideces físicas o mentales" **[verified]**. Mental
   health is *salubridad general* and sits in the LGS's own Chapter VII
   (arts. 72–77) **[verified]**.
3. **A psychology consultorio files a COFEPRIS *aviso de funcionamiento y de
   responsable sanitario***, i.e. it is treated administratively as a health
   establishment **[single]**. If she has filed one — a question for her (§8.1) —
   the "establecimientos prestadores de servicios de atención médica" clause
   answers itself.

Mexican psychology-facing commentary states the conclusion directly: NOM-004 is
"una obligación legal para cualquier profesional de la salud que ejerza en
México, y los psicólogos no son la excepción", and describes the psychologist's
expediente as comprising the historia clínica psicológica, notas de evolución,
psychometric results and informed consent **[single, several sources agreeing
with each other, which is weaker than it looks — they are the same claim
recirculated]**.

### 1.3 The argument that it does not, and why I still say assume it does

One source addressing precisely this puts it honestly: "para consultas
independientes, aunque el debate sobre la obligatoriedad estricta para cada
Licenciado en Psicología existe, adoptar la estructura de la NOM-004 es la mejor
forma de proteger la práctica" **[single]**. Another distinguishes the case
where the psychologist works inside a clinic or hospital — where the norm
applies directly because her file forms part of the establishment's expediente —
from the independent consultorio, where it is less clear-cut **[single]**.

The debate is real and I am not going to pretend it away. The reason it does not
change the recommendation:

**[inferred]** The error is asymmetric. Complying with NOM-004 when it does not
strictly bind her costs a few fields and a retention habit. Not complying when
it does bind her is a COFEPRIS matter, and — far more likely in practice — it
is the difference between a defensible and an indefensible file if a patient
ever complains to CONAMED or a court asks what happened in a session. Every
Mexican source that discusses the ambiguity resolves it the same way: comply.

**So: assume NOM-004 applies.** But note what that assumption actually buys, in
§2, because it is much less than M9 assumes.

### 1.4 Its content overrides everything M9 inherited

The critical consequence for this project: NOM-004 is a **records** standard,
not a **medical-necessity** standard. It says what a record must contain and how
long it must be kept. It does not say why treatment is justified, does not
contemplate a reviewer, and has no concept of a plan that lapses. The entire
apparatus of "produce this on demand for the version in force on a given service
date" (`m9-plan-requirements-2026-08.md` §1.1) has **no Mexican counterpart that
I could find** **[inferred]**.

---

## 2. What the expediente must contain, and for how long

### 2.1 Every note: date, time, full name, signature

> Todas las notas en el expediente clínico deberán contener fecha, hora y nombre
> completo de quien la elabora, así como la firma autógrafa, electrónica o
> digital, según sea el caso; estas dos últimas se sujetarán a las disposiciones
> jurídicas aplicables.

Reported as **§5.10** **[verified]** (the sentence; the numeral is `[single]`).

Three things follow, and the third is the one nobody has noticed:

- **Time, not just date.** M9 stores `created_at` timestamps, so this is free.
- **The signature clause is permissive and self-limiting** — it allows
  electronic and digital signatures but subordinates them to "las disposiciones
  jurídicas aplicables", which is what §7 is about.
- **This binds the note, not the plan.** The artefact NOM-004 actually regulates
  is the progress note — which in Apunta's architecture *leaves the app as plain
  text on the clipboard* and lands in Halaxy. Whether the pasted text carries
  her full name and the time of entry is a live question for the note-copy
  format, not for M9. See §9.4.

### 2.2 Every progress note: diagnosis, prognosis, treatment

The *nota de evolución* (reported as **§6.2**), which is what a therapy session
note is, must state **[verified as an enumeration, `[single]` on numbering]**:

| | Element |
| --- | --- |
| 6.2.1 | Evolución y actualización del cuadro clínico |
| 6.2.2 | Signos vitales, en su caso |
| 6.2.3 | Resultados relevantes de estudios auxiliares previamente solicitados |
| 6.2.4 | **Diagnósticos o problemas clínicos** |
| 6.2.5 | **Pronóstico** |
| 6.2.6 | **Tratamiento e indicaciones médicas** |

The *historia clínica* likewise closes with diagnóstico and treatment plan
**[single]**.

**This is the real Mexican home for "diagnosis".** Not a plan-level anchor of
medical necessity — a required element of the record of each encounter. M9 put
`diagnoses` on the plan version for a reason that was correct in the US (a
superseded plan must not silently acquire a later diagnosis) and remains
sensible here, but the *justification* changes completely: it is not what an
auditor traces goals to, it is what the record of the day has to say.

**[inferred]** Note the tension with Apunta's own design: the note goes to
Halaxy, and Apunta's diagnosis lives on the plan. If NOM-004's per-note
diagnosis requirement matters to her, it is satisfied in Halaxy or not at all.
Apunta's copy is a working document either way. That is not a defect — it is the
same architectural fact M9 already reasoned about for the golden thread — but it
means the plan-level diagnosis field is a **convenience**, not compliance.

### 2.3 Retention: five years from the last acto médico

Reported as **§5.4**: expedientes must be kept "por un periodo mínimo de 5 años,
contados a partir de la fecha del último acto médico" **[verified]** (numeral
`[single]`).

Two riders:

- **Minors.** Commentary says the clock extends until majority plus five years
  **[single]** — but the sources I reached describe this as *recommended* for
  "casos específicos (menores, eventos adversos, litigios)", which reads like
  professional guidance rather than norm text. **Do not encode it.**
- **Five years is a floor, not a ceiling** ("mínimo"). Civil liability
  prescription periods and any future professional-negligence claim run on their
  own clocks.

**Consequence for the app [inferred]: unchanged from the US research.** Never
auto-delete, never compact superseded versions, never put a retention period in
Settings. The reasoning is now *stronger*, because five years is a shorter and
more tempting number to encode than seven and encoding it would be worse.

There is one **new** obligation the US research did not have to consider, and it
cuts the other way. See §6.6 — LFPDPPP's *bloqueo* and *supresión* duties mean
retention rules in Mexico also *end*, and the responsable is expected to have
documented conservation periods. That is a genuine (small) conflict between the
two instruments and it is a lawyer question, not a code question (§8.4).

### 2.4 Corrections and immutability

> Las notas en el expediente deberán expresarse en lenguaje técnico-médico, sin
> abreviaturas, con letra legible, sin enmendaduras ni tachaduras y conservarse
> en buen estado.

Reported as **§5.11** **[verified]**.

That is the whole of what I can confirm. Specifically:

- **I found no amendment procedure in the norm text.** Commentary translates
  "sin enmendaduras ni tachaduras" into the paper practice (strike through with
  one line, write the correction, date it) and into the electronic practice
  ("registros que no pueden modificarse una vez firmados") **[single]** — but
  that second translation is the vendor's inference, not a quoted rule.
- **What NOM-004 forbids is a record that has been altered so the original
  cannot be read.** **[inferred]** An append-only version history where the
  superseded version stays byte-identical is *more* than compliant with that. M9
  already does this and it is the part of M9 that survives this document
  completely intact.
- The patient's **ARCO right of rectification** under LFPDPPP cuts across this:
  she can be *obliged* to correct data about the patient. **[inferred]** The
  reconciliation — corrections are additive, the original stays — is exactly what
  M9's versioning does. Worth stating in the packet as a positive.

### 2.5 The standard nobody has looked at: NOM-024-SSA3-2012

Flagging this because it is a **project-level risk that M9 did not raise and
this document should not bury**.

NOM-024-SSA3-2012, *Sistemas de información de registro electrónico para la
salud*, DOF 30 November 2012 **[verified]**. Scope, as reported: obligatory
nationally for all Electronic Clinical Record products used in the public
sector, **and for establishments providing medical care services, natural and
legal persons of the social and private sectors, that adopt an electronic health
records system** **[single, and the phrasing varied between sources, which is
itself a signal]**. It requires interoperability, security, standard catalogues,
and DGIS runs a conformity-evaluation/certification process for SIRES
**[single]**.

Vendor commentary goes further and says each clinical note must be signed with
an *advanced* electronic signature and that an electronic expediente only has
the same evidentiary weight as paper if the system is DGIS-certified and
COFEPRIS-endorsed **[single]**. **I do not believe that as stated** — it is
sold by companies whose product is DGIS certification — but I cannot refute it
either.

**[inferred]** The plausible reading is that NOM-024 governs systems that
*exchange* health information within the Sistema Nacional de Salud, and that
certification is a market requirement for selling into public institutions
rather than a condition of a private practitioner keeping notes on her own
laptop. The plausible reading is not a finding. **This is question §8.2 and it
is the highest-consequence unknown in this document**, because if NOM-024 does
bind a local single-user app, it reaches Apunta's whole architecture and not
just M9's schema.

### 2.6 What the record must say about *her*, and about the establishment

- The expediente must identify where it was generated: type of establishment,
  name, address, the institution it belongs to, and the razón social of the
  owner **[single]**.
- Patient identification: name, sex, age, domicile **[single]**.
- **Resumen clínico** is a defined artefact the patient (or tutor or legal
  representative) can request **in writing**, containing padecimiento actual,
  diagnósticos, tratamientos, evolución, pronóstico, and study results
  **[single]**. Unjustified refusal is a CONAMED/COFEPRIS complaint **[single]**.

That last one is worth noticing: **Mexico has an actual, named, patient-facing
export obligation with a defined shape** — and it is not the treatment plan.
M9's export renders something close to it but not it. See §9.3.

---

## 3. The practitioner identifier that replaces `NPI`

### 3.1 The cédula profesional

The **cédula profesional** is issued by the **Dirección General de Profesiones**
of the SEP and is the number identifying a professional in the **Registro
Nacional de Profesionistas** **[single]**. Format: **7 or 8 digits, numeric
only, no letters or special characters**; the digit count tracks the era of
issue **[single]**. Since 2018 the SEP issues a **cédula profesional
electrónica** with official validity, replacing the printed format **[single]**.

The statutory hook is **LGS art. 79**, which requires the título or certificado
to be legally issued and registered, and — second paragraph — requires those
exercising professional health activities to **display a public notice stating
the institution that issued their título or diploma and, where applicable, the
number of their cédula profesional and current specialty certificate**
**[verified]**. The reform carrying this is DOF 17 March 2015 **[verified]**.

So: her cédula number is a thing Mexican law already requires her to *publish on
her wall*. Putting it on a clinical document is not a stretch; it is the obvious
identifier.

### 3.2 Does NOM-004 require the cédula on each note?

**Unresolved, and I want to be blunt about it.** Several Mexican health-software
sources state flatly that every note must carry "firma autógrafa o firma
electrónica, número de cédula profesional, fecha y hora" **[single]**. But the
one sentence of NOM-004 I have verbatim (§5.10, §2.1 above) names **only** date,
time, full name and signature — no cédula. I could not locate a numeral of the
norm that adds it.

**[inferred]** Two possibilities: the cédula requirement lives in a numeral I
could not read (the nota de egreso and consentimiento numerals are candidates),
or the commentary has back-filled it from LGS art. 79 and from prescription
rules, which do require it. Either way the practical answer is the same —
**print the cédula** — but the packet must not claim NOM-004 requires it. §8.3.

### 3.3 Is there a specialty cédula, and is there a board?

- **A cédula de especialidad exists as an educational instrument**: a registered
  postgraduate título yields its own cédula, and LGS art. 79 ¶2 contemplates a
  "Certificado de Especialidad vigente" where applicable **[verified]**.
- **But the statutory specialty-certification regime — LGS art. 81 and the
  Comité Normativo Nacional de Consejos de Especialidades Médicas — is for
  *medical* specialties** **[single]**. There is no equivalent statutory board
  for psychologists.
- **There is no licensing board analogous to a US state board at all.**
  Professions in Mexico are regulated federally through SEP's DGP under
  art. 5 constitucional and its Ley Reglamentaria; **colegios** (CoNaPsi,
  CoMePsi/CoMePPsi and others) are voluntary associations that offer
  certification — the *Examen Único para Certificación Profesional en
  Psicología* (EUC-PSI), recertified every five years on continuing-education
  evidence **[single]**. Voluntary certification, not a licence.

**[inferred]** For M9's purposes: **the cédula profesional is the whole
credential.** There is no second number to store, no board number, no
registration to renew, and nothing that expires and would need a date field.

### 3.4 What `clinician_npi` should become

**`clinician_cedula`** — "Cédula profesional", 7–8 digits, free text (do not
validate the length; historical and foreign-recognition cases exist and a
validator that rejects her real number is worse than no validator)
**[inferred]**.

And a second, smaller correction that follows from it: **`clinician_licence` is
now redundant.** In the US schema, `licence` was the state licence and `npi` was
the federal identifier — two genuinely different numbers. In Mexico there is one
number. Keeping two fields invites her to type the cédula into both or leave one
blank forever. **Collapse to one.** See §9.1 for the exact shape.

---

## 4. Diagnosis coding — what is actually right

### 4.1 CIE-10 is compulsory, but not for the reason M9 assumes

**NOM-035-SSA3-2012**, *En materia de información en salud*, DOF 30 November
2012, is "de observancia obligatoria en todo el territorio nacional para los
establecimientos, personas físicas y morales del Sistema Nacional de Salud de
los sectores público, social y privado, que proporcionen servicios de atención a
la salud" **[verified]**. Under it, the CIE is "un estándar internacional de uso
obligatorio en todo el país para la codificación y generación de estadísticas de
morbilidad y mortalidad uniformes" **[single]**.

Read that scope carefully. It is a **statistics** standard. It obliges coding of
information that flows into the national health-information system — not the
content of a consultorio's own file. **[inferred]** Whether a solo private
psychology consultorio has any actual reporting obligation into SINBA/DGIS is
question §8.5; in practice private ambulatory consultorios report very little.

**NOM-004, which is the standard that governs her file, requires a *diagnosis*.
It does not, in anything I could read, require a *code*.** **[inferred]**

### 4.2 CIE-11 is coming but is not here

Mexico is transitioning to CIE-11 under CEMECE/DGIS; PAHO and the Secretaría de
Salud ran a regional CIE-11 coder-training course April–July 2026, mortality
component first **[verified — official PAHO/UN announcements]**. Nothing
suggests a practice-level CIE-11 requirement in 2026 **[inferred]**.

**Design consequence:** the `system` enum will need `cie-11` eventually. Adding
it now costs one enum member; adding it after her data exists costs a migration
over immutable rows.

### 4.3 DSM-5-TR, and the fact that changes the whole framing

DSM-5-TR is the instrument Mexican psychologists actually use **[single]**. And
the detail that matters:

> El DSM-5-TR incluye los códigos CIE-9-MC y CIE-10-MC para cada trastorno.

**[single]** — CIE-10-MC *is* ICD-10-CM. **The codes printed in DSM-5-TR are US
Clinical Modification codes.** So the owner's memo, which says flatly that
"`ICD-10-CM` — the US Clinical Modification" is wrong for Mexico, is **half
wrong**: it is the wrong *statistical* standard for Mexico, and simultaneously
the exact code set she will read off the page if she opens a DSM-5-TR.

**[inferred]** The two systems agree for many common codes (F41.1, F32.x) and
diverge where ICD-10-CM is more granular than WHO ICD-10 (post-traumatic stress
being the standard example). A field that only offers `icd-10-cm` mislabels a
CIE-10 code; a field that only offers `cie-10` mislabels a DSM-5-TR code. **The
fix is to widen the enum, not to swap one wrong value for another.**

### 4.4 The answer to the question as asked

**Is diagnosis coding required at all for a self-pay private psychology
practice? No.** **[inferred, from §4.1 + §2.2 + §5]** A diagnosis in words is a
required element of each progress note if NOM-004 binds her. A *code* is
required by a statistics standard whose reporting obligations almost certainly
do not reach her, and by insurers who mostly do not cover her work.

**So the framing in M9 — diagnosis as "the anchor of medical necessity" that
goals "trace to" — does not transfer.** Medical necessity is a US payer concept.
Keep the field (it is genuinely useful, it is a NOM-004 element of the record,
and she may need it for the rare reimbursement case), stop calling it the
anchor, and let a plan exist without one.

---

## 5. Is a formal treatment plan required by anyone in Mexico?

Short answer: **no**, and this is the finding that decides whether M9 gets
simplified.

### 5.1 Private insurers

Mexican *seguros de gastos médicos mayores* **generally exclude routine mental
health treatment**. The coverage that exists is narrow: therapy where the mental
disorder was directly caused by a covered serious illness (cancer, infarct) or a
violent event (kidnapping, rape, assault); psychiatric fees and medication;
sometimes a cap of 5–20 sessions a year **[single, two consumer-facing insurance
sources agreeing]**.

Where reimbursement does apply, what the insurer asks for is **[single]**:

- an **informe médico** form completed by the specialist,
- an original referral / prescription, commonly from a **psychiatrist or
  physician** rather than the psychologist,
- diagnosis and procedure codes,
- a **CFDI** (fiscal invoice) with the professional's tax details,
- prior authorisation in some policies.

**None of that is a treatment plan.** It is a form, a referral and an invoice.
**[inferred]** The one artefact in M9 that would actually help with a Mexican
reimbursement claim is a diagnosis she can quote and a record she can summarise
— which is §2.6's *resumen clínico*, not the plan.

### 5.2 Public schemes

Not applicable to a private self-pay practice **[inferred]**. IMSS/ISSSTE/IMSS-
Bienestar rules govern their own establishments' records; a private consultorio
does not bill them.

### 5.3 Professional standards — the one Mexican party that asks for something

The **Código Ético del Psicólogo** (Sociedad Mexicana de Psicología) requires
**[single]**:

- informed consent for all intervention, from the user or their legal
  representative;
- the psychologist to inform the user of the place, schedule, duration, cost and
  methods of care;
- and — the sentence that matters here — that **if it becomes necessary to
  extend an agreement or to modify the *plan de trabajo inicial*, this must be
  discussed in advance and with the user's consent.**

Plus the record-keeping duties: proper creation, updating and conservation of
the clinical file, custody, protection against unauthorised access, and no
withholding of records needed for a patient's treatment over non-payment
**[single]**.

The **LGS mental-health reform** (DOF 16 May 2022, arts. 72–75 and additions)
establishes users' rights including **informed consent regarding the treatment
to be received** and support mechanisms in decision-making **[verified]**.

### 5.4 What this does to M9

**[inferred, but directly from the above]** M9's plan does not stop being
worth building. Its *audience* changes, and that changes which parts earn their
keep:

| M9 element | US justification | Mexican justification |
| --- | --- | --- |
| Versioned plan, dated history | Payer asks what the plan was in March | Her own record; the ethics code's "modify the plan of work with the user's consent" leaves a trail |
| Measurable objectives, baselines | Payer audit tools grade measurability | Nothing requires it. Good practice; her choice |
| Target dates | Services after a target date get questioned | Nothing requires it |
| Review date, `review_due` | Contractual review intervals | Nothing requires it. Purely her cadence |
| Diagnosis on the version | Anchor of medical necessity | A NOM-004 element of the record; useful, not anchoring |
| Modality / frequency | Payer expects them at plan level | Maps to "tratamiento e indicaciones" |
| Clinician identity snapshot | Authentication of the author | **NOM-004 §5.10 — the one genuinely required item** |
| Attestation | Payer expects a signed plan | Nothing requires it on a *plan*; §7 |
| **Client participation** | Commonly expected | **Strengthens** — ethics code + LGS art. 74-series consent rights |

The single row that goes **up** in importance is client participation. The rows
that go down are the measurable-objective apparatus and the review date — which
is precisely the scaffolding the owner said to keep and correct later. Keeping
it is now clearly *optional but harmless*, which is a better answer than either
"required" or "wrong".

---

## 6. LFPDPPP and sensitive personal data

### 6.1 First correction: the law in the memo has been repealed

`docs/feedback/2026-08-24-owner-answers.md` cites "LFPDPPP". That law — the one
published in 2010 — **was abrogated**. A **new** *Ley Federal de Protección de
Datos Personales en Posesión de los Particulares* was **published in the DOF on
20 March 2025 and entered into force on 21 March 2025** **[verified — reported
consistently by EY México, Basham, Greenberg Traurig, Littler and others]**.

Two consequences:

- **INAI is gone.** Its data-protection functions and resources passed to the
  **Secretaría Anticorrupción y Buen Gobierno** **[verified]**. Any user-facing
  text or research citing INAI as the authority is out of date.
- **The new Reglamento has not been published.** The transitorios set 90 days
  for harmonisation; as of mid-2026 it had lapsed with nothing published
  **[single]**. So the 2011 Reglamento's operational detail — including the
  breach articles in §6.5 — is of **uncertain current force**. I am reporting it
  because it is the only detail that exists, not because I can confirm it binds.

The substance carried over: commentators describe the new law as "substantially
similar to its predecessor" **[verified]**. So the shape below is reliable even
where the numbering is not.

### 6.2 Health data is sensitive, and the consent standard is high

- *Datos personales sensibles* are those touching the most intimate sphere or
  whose misuse could produce discrimination or serious risk — expressly
  including **estado de salud** **[verified]**.
- **"Tratándose de datos personales sensibles, el responsable deberá obtener el
  consentimiento expreso y por escrito de la persona titular para su
  tratamiento"**, through signature, electronic signature, or another
  authentication mechanism **[verified]**. Tacit consent is the general rule for
  ordinary data; sensitive data is the carve-out that requires express written
  consent **[verified]**.
- **The healthcare exception is narrow and does not exempt her.** The provision
  people reach for (old art. 10 fr. VI/VII) removes the consent requirement
  where treatment is indispensable for medical attention, prevention, diagnosis,
  the provision of health assistance or the management of health services
  **"mientras el titular no esté en condiciones de otorgar el consentimiento"**,
  by a person bound by professional secrecy **[single]**. That is an
  **incapacity** exception. A patient sitting in her consulting room is in a
  perfectly good condition to consent. **[inferred]** She needs written consent.

### 6.3 What a solo practitioner must actually produce

She is a **responsable** — a *persona física* processing personal data in a
professional (not "exclusivamente personal") capacity **[inferred]**. The
concrete deliverables:

1. **An *aviso de privacidad***, made available at the moment data is collected,
   stating at minimum **[verified as a list, `[single]` on individual items]**:
   - her identity and address as responsable;
   - the data to be processed, **identifying which are sensitive**;
   - the purposes, distinguishing those that require consent from those that do
     not;
   - the means to limit use or disclosure;
   - how to exercise **ARCO** rights (acceso, rectificación, cancelación,
     oposición) and where;
   - how changes to the notice will be communicated;
   - under the 2025 law, **mechanisms for the titular to refuse** processing
     **[single]**;
   - **and any transfers to third parties** — see §6.4, which is the part that
     concerns her most and has nothing to do with Apunta.
2. **Express written consent for the sensitive data**, which in practice means a
   signed consent form. This dovetails with the informed consent the ethics code
   and the LGS mental-health reform already require (§5.3) — **one document can
   do both jobs** **[inferred]**.
3. **Security measures** — administrative, technical and physical, proportionate
   to risk, likely consequences for the titular, the sensitivity of the data,
   and the state of technology (commentary cites new-law **art. 18**)
   **[single]**.
4. **Documented conservation, bloqueo and supresión procedures**, including
   retention periods (§6.6) **[single]**.

**None of this is app work.** It is three documents she needs to have. The most
useful thing this project can do is *not* generate them (a generated aviso de
privacidad would be exactly the confident-wrong-answer this document exists to
avoid) but to make sure nothing in the app contradicts them.

### 6.4 Does local-only storage change her obligations?

This is the question the owner's memo answers optimistically, and the honest
answer is **"yes, but much less than the memo implies, and the memo is looking
at the wrong machine."**

**What local-only genuinely removes [inferred]:**

- **No *encargado*.** A cloud EHR is a data processor; the responsable must have
  a contract with it, must supervise it, and remains liable for it. Apunta
  introduces no processor at all, so that entire chapter is empty for Apunta's
  copy. Note the 2025 law **widens** the definition of who is a regulated actor
  to include processors as such **[single]** — which makes *not having one*
  worth more than it used to be.
- **No transfer and no remisión** for Apunta's copy — so no transfer clauses, no
  transfer consent, no international-transfer analysis.
- **A much smaller breach surface.** One device, one file, no account
  compromise, no vendor incident, no misconfigured bucket.
- **ARCO is trivially satisfiable.** Access, rectification and cancellation are
  operations on a local SQLite file she controls, with no vendor ticket.

**What local-only does not touch, at all [inferred]:** the aviso de privacidad,
the written consent, the ARCO *duty*, the security-measures duty, breach
notification, the confidentiality duty, and retention. Those attach to her as
responsable regardless of where the bytes live. **Architecture is not a defence
to any of them.**

**And the caveat the memo misses, which is the important one:** **her system of
record is Halaxy** — a foreign cloud service. Apunta being local does not make
her practice local. The transfer analysis, the processor relationship and the
disclosure in her aviso de privacidad all have to cover Halaxy whatever Apunta
does. **[inferred]** Apunta's privacy architecture is a real advantage for
Apunta's copy and **not** a compliance posture for her practice. Anyone writing
user-facing copy about this needs to say the first thing and not imply the
second.

**Where it is a genuine advantage rather than neutral [inferred]:** the
security-measures duty is explicitly proportionate to *risk and the state of
technology*. An architecture whose entire sensitive-data exposure is one
encrypted laptop is straightforwardly easier to justify under that standard than
one that is also a network service, an account system and a backup provider.
That is a real argument, and it is the argument M7's FileVault check makes
concrete.

### 6.5 Breach notification, and the lost laptop

The duty **[verified in substance, `[single]` on numbering]**: security breaches
occurring at any phase of processing that **significantly affect the patrimonial
or moral rights** of titulares must be reported to them **immediately**, so they
can take steps to defend their rights. Commentary places this at **art. 19** of
the 2025 law; it was art. 20 of the 2010 law.

The 2011 Reglamento's detail (**force now uncertain**, §6.1) **[single]**:

- **Art. 63** enumerates the breach types: unauthorised loss or destruction;
  theft, mislaying or unauthorised copying; unauthorised use, access or
  processing; unauthorised damage, alteration or modification.
- **Art. 64**: inform the titular once the breach is confirmed and steps have
  been taken to begin a thorough review of the extent of the harm, **"sin
  dilación alguna"**.
- **Art. 65**: a minimum content list for the notification.
- **No obligation to notify the authority** that I could find — the regulator's
  role appears as a mitigating-factor consideration at sanction time, not a
  reporting duty **[single, and I would not rely on this without a lawyer]**.

**A lost or stolen laptop [inferred]:** an unencrypted machine holding an
expediente is squarely "robo, extravío o copia no autorizada" of sensitive
health data. If that significantly affects the patients' moral rights — and for
therapy notes it is hard to argue it does not — she owes each affected patient
an immediate notification. Concretely: telling a caseload of patients that their
therapy notes are on a laptop somebody stole.

**With full-disk encryption on, the argument changes.** **I found no encryption
safe harbour in Mexican law and I am not going to invent one** — unlike some
US state statutes, nothing I read exempts encrypted data from the notification
duty. What FileVault buys is the ability to argue that rights were not
significantly affected because the data was not accessible. That is an argument,
not an exemption.

**For M7 [inferred]:** this is the right justification for the FileVault check,
and it is stronger than "good hygiene". It is also the right shape — a *check
and a warning*, not a claim. The app must not tell her encryption makes her
compliant. It can tell her the data at rest is unprotected, which is a fact.
Anything stronger belongs in §8's lawyer questions. `data-at-rest-2026-08.md` §7
already carries this rule for its own unverified claims; the same discipline
applies here.

### 6.6 Retention has two masters, and they disagree

- **NOM-004** sets a **floor**: five years from the last acto médico (§2.3).
- **LFPDPPP** points the other way: **bloqueo** (identify and conserve, once the
  purpose is fulfilled, solely to determine possible liabilities, until the
  legal or contractual prescription period) and then **supresión** (elimination
  under established security measures); and the responsable must **document
  conservation periods and be able to demonstrate compliance with them**
  **[single]**.

**[inferred]** These reconcile in practice — five years is a legal obligation
that keeps the purpose alive, so the LFPDPPP clock effectively starts after it
— but "reconcile in practice" is a lawyer's job, not a schema's. **The app's
correct behaviour is unchanged and now doubly justified: never delete anything
on its own, and make a deliberate, per-patient deletion possible eventually.**
What the app must *not* do is encode a period, because it would now be encoding
the wrong one against one of two instruments.

---

## 7. Signatures under Mexican law

M9's reasoning: with no accounts, no login and no audit trail, Apunta cannot
make a typed name *attributable to the signer*, which is the ESIGN/UETA
condition that makes an electronic signature mean anything — so Apunta captures
a dated **attestation**, and the signature belongs to the records system.

**That reasoning survives the change of jurisdiction intact, and gets slightly
stronger.**

### 7.1 The chain of authority

1. **NOM-004 §5.10** allows "firma autógrafa, electrónica o digital, según sea
   el caso" and subordinates the latter two to "las disposiciones jurídicas
   aplicables" **[verified]**. The standard does not itself define what makes an
   electronic signature good; it points elsewhere.
2. **Código de Comercio art. 89** sets out the requirements of a simple
   *firma electrónica*; **art. 97** those of a *firma electrónica avanzada o
   fiable* **[verified]**. A signature is avanzada/fiable if, at minimum
   **[verified]**:
   - the signature-creation data correspond **exclusively** to the signatory;
   - they were, at the moment of signing, under the signatory's **exclusive
     control**;
   - **any alteration of the signature made after signing is detectable**;
   - (and, for the integrity of the message, alteration of the message is
     detectable).
3. **Código Civil Federal art. 1834 Bis**: contracts requiring written form and
   signature satisfy those requirements through electronic means **provided the
   information generated is, in its integrity, *atribuible a las personas
   obligadas* and accessible for later consultation** **[single, but the wording
   was returned consistently]**. **Art. 1803** recognises consent expressed by
   electronic means as express consent **[single]**.
4. **NOM-151-SCFI-2016** governs conservation of data messages and document
   digitisation, resting on Código de Comercio arts. 89–114 **[single]**.

### 7.2 What that does to M9's argument

**Attribution is the Mexican test too — and it is stated more concretely than in
ESIGN.** Where ESIGN/UETA gives four conditions of which attribution is one,
Código de Comercio art. 97 spells out *exclusive correspondence*, *exclusive
control at the moment of signing*, and *detectability of subsequent alteration*.
Apunta fails all three by design **[inferred]**:

- no accounts, so nothing corresponds exclusively to her;
- no login, so nothing is under her exclusive control at the moment of signing —
  anyone with the laptop open can type any name on any date;
- an unencrypted local SQLite file with no audit trail and no integrity
  mechanism, so alteration is not detectable. SQLCipher is deferred
  (`docs/PLAN.md` §8), which is a product decision, not an oversight.

**A drawn signature remains the worst option** for exactly the reason the US
research gave, and slightly more so here: it would store a reusable image of a
real person's *firma autógrafa* — the thing Mexican practice still treats as the
signature — in an unprotected file, buying no attribution at all.

### 7.3 One Mexican-specific fact worth knowing

**She very likely already has a *firma electrónica avanzada*.** The SAT's
**e.firma** is the everyday advanced electronic signature in Mexico, and she
needs one to issue CFDI invoices for a private practice **[inferred]**. That is
the credential that could genuinely sign a clinical document — and it lives
outside Apunta, in tooling Apunta must not touch and cannot safely hold.

**[inferred]** This does not change the recommendation; it explains it. The
correct place for a real signature is a system that can hold a credential.
Apunta is not that system and should not pretend to be.

### 7.4 Recommendation

**Unchanged in substance; change the rationale and one label.**

- Keep the **dated attestation**, keep the stored `attestation_text`, keep the
  identity snapshot at activation — that snapshot is the one thing NOM-004 §5.10
  genuinely wants (name; §3.2 for the cédula caveat).
- Keep the honest UI line. The current wording — *"Attested in Apunta — sign the
  copy in your records system"* — is already right and needs no change.
- **Rewrite M9's *Signatures* section to cite Código de Comercio art. 97 and
  CCF art. 1834 Bis instead of ESIGN/UETA.** Same conclusion, correct authority.
- Keep the printed signature block in the export, and rename its `NPI` line
  (§9.1).
- The open question the packet already flags — **does Halaxy already hold the
  signed plan?** — is unchanged and still the cheapest question in the file.

---

## 8. What only she, her accountant, or a Mexican health-law lawyer can settle

Precise questions, in the order I would ask them.

1. **"Did you file an *aviso de funcionamiento y de responsable sanitario* with
   COFEPRIS for the consultorio?"** — for her, one sentence. A yes settles §1
   almost entirely: she is operating a health establishment and NOM-004 applies
   without argument. A no does not settle the opposite, but it tells you which
   conversation to have.

2. **"Does NOM-024-SSA3-2012 apply to a single-user, local, non-networked
   clinical-notes application used by one private practitioner — and is DGIS
   certification a legal requirement or a procurement one?"** — for a Mexican
   health-law lawyer. **The highest-consequence unknown here** (§2.5). If the
   answer is "yes, it applies", it reaches Apunta's architecture, not just M9's
   schema, and this project needs a different conversation.

3. **"Does NOM-004 require the *cédula profesional* on each note, or only the
   full name and signature — and which numeral says so?"** — for the same
   lawyer, or settleable in ten seconds by anyone who can open the DOF text
   (§3.2). Cheap, and it decides whether the packet may state the requirement or
   only offer the field.

4. **"How do NOM-004's five-year minimum and LFPDPPP's *bloqueo* and *supresión*
   duties fit together for a psychology file, and what conservation period
   should I document?"** — lawyer (§6.6). The app should not encode either
   answer; she should know hers.

5. **"Do I have any reporting obligation into SINBA / DGIS as a private
   consultorio?"** — lawyer or her state health authority (§4.1). Decides
   whether CIE-10 coding is ever anything more than optional for her.

6. **"Is there any problem with my clinical record being written in English?"** —
   lawyer. I found **no rule requiring Spanish** in NOM-004 or the LGS
   **[inferred, from absence — weak evidence]**. But **Código Federal de
   Procedimientos Civiles art. 271** provides that judicial proceedings and
   filings must be written in Spanish and that anything submitted in a foreign
   language must be accompanied by a translation **[verified]**. So an
   English-language expediente is not unlawful as far as I can tell, but it
   would need translating if it is ever produced in a proceeding — and a
   CONAMED/COFEPRIS process or a records request is the moment that bites. This
   is worth raising with her precisely because owner answer 4 concluded the
   English decision "changes nothing"; it changes nothing about the *app*, and
   it may not be nothing here.

7. **"Which do you want to record — CIE-10 or DSM-5-TR?"** — for her. It sets
   the default in the diagnosis-system selector (§9.1). My guess is DSM-5-TR
   because that is what Mexican psychologists read from, but it is a guess and
   it costs nothing to ask.

8. **"Does Halaxy hold the signed treatment plan, and does it hold a plan
   document at all?"** — still open from M9 and `2026-08-24-owner-answers.md`.
   Still the highest-value single sentence in the whole area.

9. **"Is the fortnightly cadence your own habit or a formal plan review?"** —
   still open. Unchanged: `DEFAULT_REVIEW_INTERVAL_DAYS` stays 90 and stays
   marked unconfirmed. **Note that this question is now purely hers** — the US
   answer was "90 days is a payer convention"; in Mexico there is no payer and no
   convention, so whatever she says is simply correct (§5.4).

10. **"Do you have an *aviso de privacidad* and a written informed-consent form,
    and does the consent form mention Halaxy?"** — for her, and for her lawyer
    if the answer to either half is no (§6.3, §6.4). This is the largest real
    compliance gap this research surfaced, and **it is not an app feature**.

---

## 9. What M9 changes to — field by field

Everything below is a **recommendation to whoever picks up the M9 correction.**
No file was touched by this research. The touchpoints are listed so the change
can be scoped; the schema and packet remain exactly as the other agent left them.

### 9.1 Required — do these

| # | Change | Why | Touchpoints |
| --- | --- | --- | --- |
| 1 | **`clinician_npi` → `clinician_cedula`**, labelled "Cédula profesional" | The NPI does not exist in Mexico; the cédula is the identifier (§3) | `shared/src/plan.ts` (`TreatmentPlanSchema`, `CLINICIAN_NPI_SETTING`), `shared/src/plan-document.ts` (the `NPI:` line), `server/migrations/002_treatment_plans.sql` column, `server/src/db/plans.ts`, `server/src/plan/settings.ts`, `web/src/routes/Settings.tsx` (the `NPI` label), `web/src/components/PlanView.tsx`, `web/src/test/fakeApi.ts`, the plan/document/route tests, `e2e/tests/plan.spec.ts` |
| 2 | **Collapse `clinician_licence` into it** — one number, not two | Mexico has one credential; two fields guarantee one is wrong or blank (§3.4) | same |
| 3 | **Widen `DiagnosisSchema.system`** to `cie-10 \| cie-11 \| dsm-5-tr \| icd-10-cm` | CIE-10 is the Mexican standard; DSM-5-TR is what she reads; DSM-5-TR's codes *are* ICD-10-CM (§4.3); CIE-11 is coming and enum members are cheap now, expensive over immutable rows later (§4.2) | `shared/src/plan.ts`, `shared/src/plan-document.ts` (`diagnosisLine` label map), `server/src/routes/plans.ts` (the same map, duplicated at ~L461 — worth de-duplicating while you are there), `web/src/components/PlanDetails.tsx` (the `<option>` list, and the default used when adding a row) |
| 4 | **Stop calling diagnosis the anchor** | "Medical necessity" is a US payer concept with no Mexican counterpart (§4.4) | `shared/src/plan.ts` doc comment, `docs/agents/M9-treatment-plan.md` §*What the payer standard actually requires* |
| 5 | **Keep "the model never proposes a diagnosis or a code"** — unchanged and still right | The reason was never the payer; it was that a code from a model is billing-consequential inference. `decisions.md` row 114 stands | none |
| 6 | **Re-anchor M9's *Signatures* section to Código de Comercio art. 97 and CCF art. 1834 Bis** | Same conclusion, correct law (§7.4) | `docs/agents/M9-treatment-plan.md` |
| 7 | **Retitle M9 §*What the payer standard actually requires*** to name NOM-004, and replace its framing | The section is the packet's stated authority and it currently cites the wrong country (§1, §2) | `docs/agents/M9-treatment-plan.md` |
| 8 | **Correct the LFPDPPP citation everywhere it appears** | The 2010 law was abrogated on 20 March 2025; INAI is no longer the authority (§6.1) | `docs/feedback/2026-08-24-owner-answers.md` is a historical record and should **not** be rewritten; any *new* text must cite the 2025 law |

**On the migration:** add a **new numbered migration** that renames the column.
Do not edit `002_treatment_plans.sql`. She has not installed yet (M8 signing is
deferred and her partner is leading the first install), so no production data is
at risk — but rewriting a landed migration breaks any developer database and is
the kind of shortcut that is invisible until it is not.

### 9.2 Optional but useful — keep, with the justification rewritten

None of these are required by anything Mexican. All were built, all are
harmless, and owner answer 5 says keep the scaffolding. The change is to the
**stated reason**, so nobody later reads the packet and believes a Mexican
regulator is waiting for these.

- **Measurable objectives** (`statement`/`measure`/`baseline`/`target_value`/
  `target_date`). Justification changes from *payer audit tools grade
  measurability* to *good clinical practice, and it makes the plan of work
  concrete enough for the client to consent to it* (§5.3).
- **`target_date`, `review_due`, `review_interval_days`.** No Mexican rule sets
  an interval. `DEFAULT_REVIEW_INTERVAL_DAYS = 90` is now purely a convention
  with **no external source at all** — that comment should say so, and §8.9 is
  how it gets settled.
- **The lapsed-review reminder.** Keep. Its US justification (services rendered
  against a lapsed plan) evaporates; its real justification — she asked for a
  review cadence and a date that has passed is worth surfacing — is enough, and
  the "date arithmetic is not goal tracking" carve-out is unaffected.
- **`modality` / `frequency`.** Map cleanly onto NOM-004 §6.2.6's "tratamiento e
  indicaciones" (§2.2). Cheapest fields in the schema to justify.
- **`presenting_problem`, `strengths`, `discharge_criteria`.** Keep;
  `presenting_problem` maps to "padecimiento actual" in the *resumen clínico*
  definition (§2.6).
- **`client_participation`.** **Goes up in importance**, the only field that
  does. The ethics code requires the client's consent to the plan of work and to
  modifications of it, and the LGS mental-health reform gives a right to
  informed consent about treatment (§5.3). Consider whether the enum wants a
  value meaning *consented to the plan of work*, distinct from
  `reviewed_with_client` — that is a question for her, not a decision to take
  here.
- **Attestation and the identity snapshot.** Keep. The snapshot is the one item
  NOM-004 genuinely wants on a record (§2.1); the attestation on a *plan* is a
  nicety, and the honest label already says so.
- **Versioning and immutable superseded versions.** Keep, unreservedly. This is
  the part of M9 that this document strengthens rather than weakens: it is how
  the app satisfies "sin enmendaduras ni tachaduras" and LFPDPPP's rectification
  right at the same time (§2.4).

### 9.3 Candidates the research surfaced — **not** M9, do not widen scope

Recording these so they are not lost. Each needs its own decision and probably
its own packet; `CLAUDE.md` hard rule 5 applies.

- **A *resumen clínico* export.** Mexico has a real, named, patient-facing
  export obligation with a defined content list — padecimiento actual,
  diagnósticos, tratamientos, evolución, pronóstico, estudios — that the patient
  can request in writing and whose unjustified refusal is a complaint (§2.6).
  Apunta has most of the material. This is a better-justified export than the
  treatment plan is, and it does not exist.
- **The note copy and NOM-004 §5.10.** Whatever lands in the expediente must
  carry date, **time**, full name and signature. Apunta's note leaves as plain
  text; whether it carries her name and the time is a question for the copy
  format, and the answer may well be "Halaxy adds them" (§2.1).
- **Patient identification fields.** NOM-004 wants name, sex, age, domicile
  **[single]**; `patients` has a name and an identifier. Only matters if Apunta
  is ever the record, which it is not.
- **Consent-on-file.** The largest real gap is an *aviso de privacidad* and a
  written consent that she must have and the app knows nothing about (§6.3,
  §8.10). The smallest useful app shape would be a per-patient date and a note
  of where the signed copy lives. **Do not generate the documents themselves.**

### 9.4 Remove as inapplicable

- **`clinician_npi`** — the column, the setting key, the Settings input, the
  `NPI:` line in the rendered document, the `NPI ${…}` line in `PlanView`, and
  the `'0000000000'` fixtures. Nothing in Mexico has an NPI (§3).
- **The "payer-facing" framing**, wherever it is asserted as fact: M9 §*Owner
  decisions* item 2, §*Deliverables* 6, and the doc comment in
  `shared/src/plan-document.ts` that says the document "renders every field a
  payer audit tool asks for". Mexican major-medical policies exclude routine
  psychotherapy and ask for an *informe médico*, a referral and an invoice
  (§5.1). Replace with: **a clinical document she owns, which can be printed,
  shown to the client, or pasted into the record system.**
- **"Medical necessity"** as a concept, wherever it appears (§4.4).
- **ESIGN/UETA** as the cited authority for the attestation decision (§7.4).

### 9.5 What explicitly does not change

Worth stating, because a jurisdiction correction invites over-correction:

- **Proposed-is-not-accepted**, the evidence requirement on every suggestion,
  and the prohibition on the model silently revising an accepted goal. Nothing
  jurisdictional about any of it.
- **No goal tracking**, and the `review_due` carve-out.
- **The two-stage prep design** and the context-limit reasoning.
- **Versioning, immutability, byte-stable superseded documents** (§2.4).
- **English.** Owner answer 4 stands for the app (§8.6 is a question about her
  *record*, not about Apunta's fixtures, section names or copy).
- **The privacy architecture.** It is genuinely easier to defend under a
  proportionate security-measures standard (§6.4) — as long as nobody claims it
  discharges obligations that attach to her rather than to the software.

---

## Sources

**Nothing below could be fetched.** Every item was reached through search-result
extracts; URLs are given so the next person with egress can read what I could
not. Primary instruments first.

Mexican federal instruments (named, read only through extracts):

- NOM-004-SSA3-2012, *Del expediente clínico*, DOF 15-10-2012 —
  [dof.gob.mx][nom004-dof]; mirrors at [CNDH][nom004-cndh],
  [CONAMED][nom004-conamed], [Farmacopea][nom004-farmacopea]
- NOM-024-SSA3-2012, *Sistemas de información de registro electrónico para la
  salud*, DOF 30-11-2012 — [dof.gob.mx][nom024-dof], [IMSS mirror][nom024-imss],
  [Secretaría de Salud / calidad][nom024-calidad]
- NOM-035-SSA3-2012, *En materia de información en salud*, DOF 30-11-2012 —
  [dof.gob.mx][nom035-dof], [DGIS mirror][nom035-dgis]
- NOM-005-SSA3-2018, *Requisitos mínimos de infraestructura y equipamiento de
  establecimientos para la atención médica de pacientes ambulatorios* —
  [dof.gob.mx][nom005-dof]
- Ley General de Salud — [diputados.gob.mx][lgs]; art. 32 [leyes-mx][lgs32];
  art. 79 [mLey][lgs79]; art. 79 reform DOF 17-03-2015 [dof.gob.mx][lgs79-dof];
  mental-health reform DOF 16-05-2022 [dof.gob.mx][lgs-sm-dof],
  [Cámara de Diputados][lgs-sm-dip]; arts. 72–77 [Justia][lgs-sm-justia]
- Reglamento de la LGS en materia de Prestación de Servicios de Atención Médica —
  [diputados.gob.mx][rlgs-psam]
- Ley Federal de Protección de Datos Personales en Posesión de los Particulares
  (2025) — [diputados.gob.mx][lfpdppp]
- Reglamento de la LFPDPPP (2011; force uncertain under the 2025 law) —
  [diputados.gob.mx][rlfpdppp]; art. 64 [juristas.mx][rlfpdppp64]
- Código de Comercio, arts. 89–114 (firma electrónica; art. 97 avanzada/fiable) —
  [SeguriData summary][cco-seguridata], [Verificamex][cco-verificamex]
- Código Civil Federal, arts. 1803 and 1834 Bis — [Justia][ccf], [SeguriData][ccf-seguridata]
- Código Federal de Procedimientos Civiles, art. 271 —
  [leyes-mx][cfpc271], [diputados.gob.mx][cfpc]
- NOM-151-SCFI-2016 (conservación de mensajes de datos) — [Mifiel][nom151],
  [AllSign][nom151-allsign]

Official and quasi-official secondary:

- PAHO/OPS and Secretaría de Salud, CIE-11 coder-training course for the
  Americas, April–July 2026 — [paho.org][paho-cie11],
  [ONU México][un-cie11]; CEMECE/DGIS coding page — [dgis.salud.gob.mx][cemece]
- SEP, *Sistema de Cédulas Profesionales* — [siurp.sep.gob.mx][sep-cedula];
  campaign page [gob.mx/cedulaprofesional][gob-cedula]; DGP trámites
  [tramites.sep.gob.mx/dgp][dgp]
- Sociedad Mexicana de Psicología, *Código Ético del Psicólogo* —
  [UNAM Facultad de Psicología PDF][smp-codigo], [CoNaPsi copy][conapsi-codigo],
  [SMP][smp]
- CoMePsi certification / *Examen Único* — [comepsi.org][comepsi];
  CoNaPsi — [conapsi.mx][conapsi]; CoMePPsi — [comeppsi.com][comeppsi]
- COFEPRIS *aviso de funcionamiento* for health-service establishments —
  [RETYS Baja California][retys]

Legal commentary on the 2025 LFPDPPP (independent of one another, consistent):

- EY México — [ey.com][ey]; Basham — [basham.com.mx][basham]; Greenberg Traurig —
  [gtlaw.com][gt]; Littler — [littler.com][littler]; Holland & Knight —
  [hlc.com][hk]; Compliance Latam — [compliancelatam.legal][clatam];
  IAPP — [iapp.org][iapp-lfpdppp]; AE Abogados — [aeabogados.com][ae];
  IDC — [idconline.mx][idc]; Sharkit, on the unpublished Reglamento —
  [sharkit.mx][sharkit]; TodoPDP, on breach obligations — [todopdp.com][todopdp]
- IAPP, *La protección de datos personales en los expedientes clínicos* —
  [iapp.org][iapp-expedientes]

NOM-004 / NOM-024 commentary (vendor and professional — useful, **not**
authoritative, and the source of most `[single]` tags):

- SaludTotal, several: [guía completa][st-guia], [checklist][st-check],
  [contenido][st-contenido], [archivo clínico][st-archivo],
  [expediente clínico para psicólogos][st-psic], [NOM-024][st-nom024]
- Wellbloom, *NOM-004 y NOM-024: qué aplican a tu consultorio psicológico* —
  [wellbloom.org][wellbloom]
- Kalyo, *NOM-004: historia clínica psicológica en México* — [kalyo.io][kalyo]
- Asociación Mexicana de Psicoterapia y Educación, *Expediente clínico en
  psicología* — [psicoedu.org][psicoedu]
- Mindly — [mindly.la][mindly]; Luna Salud — [lunasalud.mx][luna];
  Medynota — [medynota.com][medynota]; Medilink —
  [softwaremedilink.com][medilink]; Huli — [hulipractice.com][huli];
  Medesk — [medesk.net][medesk]; Nubix — [nubix.cloud][nubix];
  Vittae360 — [vittae360.com][vittae]; Capacitación de Personal —
  [capacitaciondepersonal.com.mx][capacitacion]
- Saludiario, on minimum expediente contents — [saludiario.com][saludiario]

Insurance and reimbursement (consumer-facing; the basis of §5.1):

- AhorraSeguros, *¿Mi seguro de gastos médicos cubre enfermedades mentales?* —
  [ahorraseguros.mx][ahorra]; Seguro Inteligente —
  [segurointeligente.mx][segurointeligente]; GastosMedicos.mx —
  [gastosmedicos.mx][gastosmedicos]; MetLife México —
  [metlife.com.mx][metlife]; AXA México — [axa.mx][axa]
- Psicología Tres Medios, *Reembolso sesiones de psicoterapia* —
  [psicologiatresmedios.com][tresmedios]; Encuentro Terapéutico —
  [encuentroterapeutico.com][encuentro]

Firma electrónica commentary:

- DocuSign México, *Ley de Firma Electrónica Avanzada vs. Código de Comercio* —
  [docusign.com][docusign]; Mifiel — [blog.mifiel.com][mifiel];
  Validated ID — [validatedid.com][validatedid];
  Lex Informática, on digitised autograph signatures — [wordpress][lexinformatica]

Cédula profesional:

- InfoCédula, *¿Cuántos números tiene una cédula profesional?* —
  [infocedula.com][infocedula]; Rubro, verification guide — [rubro.mx][rubro]

[nom004-dof]: https://dof.gob.mx/nota_detalle.php?codigo=5272787&fecha=15/10/2012
[nom004-cndh]: https://www.cndh.org.mx/sites/default/files/doc/Programas/VIH/Leyes%20y%20normas%20y%20reglamentos/Norma%20Oficial%20Mexicana/NOM-004-SSA3-2012.pdf
[nom004-conamed]: http://www.conamed.gob.mx/gobmx/capacitacion/pdf/p2norte.pdf
[nom004-farmacopea]: https://www.farmacopea.org.mx/Repositorio/LegislacionFiles/NOM-004-SSA3-2012_15oct12.pdf
[nom024-dof]: https://dof.gob.mx/nota_detalle.php?codigo=5280847&fecha=30/11/2012
[nom024-imss]: https://www.imss.gob.mx/sites/all/statics/pdf/marconormativo/NormasOficiales/4379.pdf
[nom024-calidad]: https://calidad.salud.gob.mx/site/regsa/docs/NOM-024-SSA3-2012.pdf
[nom035-dof]: https://dof.gob.mx/nota_detalle.php?codigo=5280848&fecha=30/11/2012
[nom035-dgis]: http://www.dgis.salud.gob.mx/descargas/normatividad/normas/DOF-30NOV12-NOM-035-SSA3-2012.pdf
[nom005-dof]: https://www.dof.gob.mx/normasOficiales/8305/salud11_C/salud11_C.html
[lgs]: https://www.diputados.gob.mx/LeyesBiblio/pdf/LGS.pdf
[lgs32]: https://leyes-mx.com/ley_general_de_salud/32.htm
[lgs79]: https://mley.mx/LGS/articulo/79/
[lgs79-dof]: https://www.dof.gob.mx/nota_detalle.php?codigo=5385543&fecha=17/03/2015
[lgs-sm-dof]: https://www.dof.gob.mx/nota_detalle.php?codigo=5652074&fecha=16/05/2022
[lgs-sm-dip]: https://www.diputados.gob.mx/LeyesBiblio/ref/lgs/LGS_ref131_16may22.pdf
[lgs-sm-justia]: https://mexico.justia.com/federales/leyes/ley-general-de-salud/titulo-tercero/capitulo-vii/
[rlgs-psam]: https://www.diputados.gob.mx/LeyesBiblio/regley/Reg_LGS_MPSAM_170718.pdf
[lfpdppp]: https://www.diputados.gob.mx/LeyesBiblio/pdf/LFPDPPP.pdf
[rlfpdppp]: https://www.diputados.gob.mx/LeyesBiblio/regley/Reg_LFPDPPP.pdf
[rlfpdppp64]: https://juristas.mx/en/laws/reglamento-de-la-ley-federal-de-proteccion-de-datos-personales-en-posesion-de-los-particulares/articulo-64
[cco-seguridata]: https://seguridata.com/CodigoDeComercio.html
[cco-verificamex]: https://ayuda.verificamex.com/article/73-codigo-de-comercio
[ccf]: https://mexico.justia.com/federales/codigos/codigo-civil-federal/libro-cuarto/primera-parte/titulo-primero/capitulo-i/
[ccf-seguridata]: https://seguridata.com/CodigoCivil.html
[cfpc271]: https://leyes-mx.com/codigo_federal_de_procedimientos_civiles/271.htm
[cfpc]: https://www.diputados.gob.mx/LeyesBiblio/pdf/CFPC.pdf
[nom151]: https://blog.mifiel.com/nom-151/
[nom151-allsign]: https://allsign.io/learn/nom-151
[paho-cie11]: https://www.paho.org/es/noticias/21-4-2026-secretaria-salud-ops-inauguran-curso-regional-sobre-cie-11-para-fortalecer
[un-cie11]: https://mexico.un.org/es/321429-la-ops-fortalece-las-capacidades-regionales-para-avanzar-en-la-implementaci%C3%B3n-de-la-cie-11
[cemece]: http://www.dgis.salud.gob.mx/contenidos/cemece/codificacion_gobmx.html
[sep-cedula]: https://siurp.sep.gob.mx/mvc/cedulaElectronica
[gob-cedula]: https://www.gob.mx/cedulaprofesional
[dgp]: https://tramites.sep.gob.mx/dgp
[smp-codigo]: https://www.psicologia.unam.mx/documentos/pdf/comite_etica/CODIGO_ETICO_SMP.pdf
[conapsi-codigo]: https://www.conapsi.mx/documentos/codigo-de-etica_SoMePsic.pdf
[smp]: https://sociedadmexicanadepsicologia.org/index.php/publicaciones/codigo-etico
[comepsi]: https://comepsi.org/certificacion
[conapsi]: https://conapsi.mx/
[comeppsi]: https://comeppsi.com/
[retys]: https://retys.bajacalifornia.gob.mx/Portal/TyS/686?enLinea=True
[ey]: https://www.ey.com/es_mx/technical/tax/boletines-fiscales/nueva-ley-federal-proteccion-datos-personal-posesion-particulares
[basham]: https://basham.com.mx/en/nueva-ley-de-proteccion-de-datos-personales-en-posesion-de-los-particulares-publicada-en-el-diario-oficial-de-la-federacion/
[gt]: https://www.gtlaw.com/en/insights/2025/3/nueva-ley-general-proteccion-de-datos
[littler]: https://www.littler.com/es/news-analysis/asap/mexico-tiene-nueva-ley-en-materia-de-proteccion-de-datos-personales
[hk]: https://www.hlc.com/es/publications/mexicos-new-federal-data-protection-law-what-it-means-for-companies
[clatam]: https://compliancelatam.legal/nueva-ley-federal-de-proteccion-de-datos-personales-en-posesion-de-los-particulares-publicada-en-el-diario-oficial-de-la-federacion/
[iapp-lfpdppp]: https://iapp.org/news/a/entendiendo-la-ley-federal-de-protecci-n-de-datos-personales-en-posesi-n-de-los-particulares
[ae]: https://aeabogados.com/proteccion-datos-personales-mexico-lfpdppp/
[idc]: https://idconline.mx/corporativo/2025/03/28/lfpdppp-5-cambios-clave-en-el-manejo-de-datos-personales
[sharkit]: https://sharkit.mx/nueva-lfpdppp-reglamento-pendiente/
[todopdp]: https://todopdp.com/vulneracion-datos-personales-actuar/
[iapp-expedientes]: https://iapp.org/news/a/la-proteccion-de-datos-personales-en-los-expedientes-clinicos
[st-guia]: https://saludtotal.mx/es/blog/nom-004-ssa3-2012-guia-completa/
[st-check]: https://saludtotal.mx/es/blog/nom-004-cumplimiento-expediente-clinico/
[st-contenido]: https://saludtotal.mx/es/blog/expediente-clinico-contenido-nom-004-ejemplos/
[st-archivo]: https://saludtotal.mx/es/blog/archivo-clinico-organizacion-conservacion-expedientes-nom-004/
[st-psic]: https://saludtotal.mx/es/blog/expediente-clinico-psicologos-nom-004-salud-mental/
[st-nom024]: https://saludtotal.mx/es/blog/norma-oficial-mexicana-expediente-clinico-electronico/
[wellbloom]: https://wellbloom.org/mx/nom-004-nom-024-consultorio-psicologico
[kalyo]: https://kalyo.io/articulos/nom-004-historia-clinica-mexico.html
[psicoedu]: https://psicoedu.org/expediente-clinico-en-psicologia/
[mindly]: https://www.mindly.la/blog/normativa-nom-004
[luna]: https://www.lunasalud.mx/ayuda/nom004-cumplimiento-expediente-clinico
[medynota]: https://medynota.com/blog/nom-004-requisitos-nota-medica
[medilink]: https://www.softwaremedilink.com/blog/nom-expediente-clinico
[huli]: https://blog.hulipractice.com/resumen-de-la-norma-oficial-mexicana-nom-024/
[medesk]: https://www.medesk.net/es/blog/norma-oficial-mexicana-para-el-expediente-clinico/
[nubix]: https://nubix.cloud/general/especificaciones-de-la-nom-004-ssa3-2012
[vittae]: https://www.vittae360.com/articulo/nom-024-guia-completa
[capacitacion]: https://capacitaciondepersonal.com.mx/expediente-clinico-nom-004-ssa3-2012/
[saludiario]: https://www.saludiario.com/10-datos-minimos-que-debe-contener-un-expediente-clinico/
[ahorra]: https://ahorraseguros.mx/seguros-de-gastos-medicos/guias/enfermedades-mentales/
[segurointeligente]: https://segurointeligente.mx/blog/seguro-de-gastos-medicos-mayores-cubre-psicologia/
[gastosmedicos]: https://gastosmedicos.mx/guias/salud-mental/
[metlife]: https://www.metlife.com.mx/seguros-de-gastos-medicos/
[axa]: https://axa.mx/en/seguro-gastos-medicos
[tresmedios]: https://www.psicologiatresmedios.com/reembolso-sesiones-de-psicoterapia/
[encuentro]: https://www.encuentroterapeutico.com/aseguradoras/psicoterapeuta-con-seguros-monterrey-new-york-life-seguro-de-gastos-medicos-mayores/
[docusign]: https://www.docusign.com/es-mx/blog/Firma-Electronica-Avanzada
[mifiel]: https://blog.mifiel.com/docusign-legal-mexico/
[validatedid]: https://www.validatedid.com/es/firma-electronica-en-mexico
[lexinformatica]: https://lexinformaticablog.wordpress.com/2016/02/17/lex-informatica-validez-juridica-de-la-firma-autografa-digitalizada-en-dispositivos-electronicos/
[infocedula]: https://infocedula.com/cedula-profesional/numeros-cedula-profesional/
[rubro]: https://rubro.mx/consulta/cedula-profesional
